// Kotybook Storybook - Groq primary, Gemini fallback + Google Flow
// Node.js 20.x

'use strict';

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { generateStoryFlow, storyTitle } = require('./flow-engine');
const { buildPdfFile, safeName } = require('./pdf-utils');

const ROOT = __dirname;
const readConfig = () => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
  } catch (_) {
    return {};
  }
};
const config = readConfig();
const setting = (envName, configName, fallback = '') =>
  process.env[envName] || config[configName] || fallback;

const PORT = Number(process.env.PORT || config.PORT || 3000);
const APPS_SCRIPT_URL = setting('APPS_SCRIPT_URL', 'APPS_SCRIPT_URL');
const API_SECRET = setting('API_SECRET', 'API_SECRET');
const PUBLIC_URL = setting('PUBLIC_URL', 'PUBLIC_URL', `http://localhost:${PORT}`).replace(/\/$/, '');
const PAGES_LIMIT = 10;
const GAP_MS = Number(process.env.GAP_MS || config.GAP_MS || 30000);
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || config.MAX_UPLOAD_MB || 15);

const TMP_DIR = path.join(ROOT, 'tmp');
const OUT_DIR = path.join(ROOT, 'out');
const FILES_DIR = path.join(OUT_DIR, 'files');
const QUEUE_FILE = path.join(ROOT, 'queue.json');

for (const dir of [TMP_DIR, OUT_DIR, FILES_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-secret');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

const upload = multer({
  dest: TMP_DIR,
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('صيغة الصورة غير مدعومة. استخدم JPG أو PNG أو WEBP.'));
    }
    cb(null, true);
  }
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function readQueue() {
  try {
    const parsed = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed.filter(job =>
      job && job.meta && (
        (job.photoPath && fs.existsSync(job.photoPath)) ||
        (job.result && job.result.pdfPath && fs.existsSync(job.result.pdfPath))
      )
    ) : [];
  } catch (_) {
    return [];
  }
}

let queue = readQueue();
let busy = false;

function saveQueue() {
  const temp = QUEUE_FILE + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(queue, null, 2), 'utf8');
  fs.renameSync(temp, QUEUE_FILE);
}

function cleanFile(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch (_) {}
  }
}

function normalizePhoto(file) {
  if (!file) return null;
  const extByMime = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp'
  };
  const ext = extByMime[file.mimetype];
  const finalPath = file.path + ext;
  fs.renameSync(file.path, finalPath);
  return finalPath;
}

async function callAppsScript(action, payload = {}) {
  if (!APPS_SCRIPT_URL || !API_SECRET) {
    throw new Error('إعدادات APPS_SCRIPT_URL أو API_SECRET ناقصة في config.json.');
  }

  let response;
  try {
    response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, secret: API_SECRET, ...payload }),
      signal: AbortSignal.timeout(120000),
      redirect: 'follow'
    });
  } catch (error) {
    throw new Error(`تعذر الاتصال بـ Google Apps Script: ${error.message}`);
  }

  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch (_) {
    throw new Error(
      'رد Google Apps Script ليس JSON. راجع رابط Web App وصلاحية النشر. الرد: ' +
      raw.replace(/\s+/g, ' ').slice(0, 220)
    );
  }

  if (!response.ok || data.ok !== true) {
    throw new Error(data.error || data.message || `Google Apps Script HTTP ${response.status}`);
  }
  return data;
}

async function createStory(job) {
  const flowMeta = { ...job.meta };
  const jobFolder = path.join(OUT_DIR, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`);
  fs.mkdirSync(jobFolder, { recursive: true });

  const images = await generateStoryFlow({
    meta: flowMeta,
    photoPath: job.photoPath,
    outDir: jobFolder,
    limit: PAGES_LIMIT
  });

  if (!Array.isArray(images) || images.length !== PAGES_LIMIT) {
    throw new Error(`Flow رجّع ${images?.length || 0} صور. المطلوب ${PAGES_LIMIT} صور بالضبط.`);
  }

  const title = flowMeta.title || job.meta.title || storyTitle(job.meta.name);
  const pdfPath = path.join(jobFolder, `${safeName(title)}.pdf`);
  await buildPdfFile(images, pdfPath, title, job.meta.name);

  if (!fs.existsSync(pdfPath) || fs.statSync(pdfPath).size < 1000) {
    throw new Error('لم يتم إنشاء ملف PDF صالح.');
  }

  const token = crypto.randomBytes(16).toString('hex');
  const publishedPath = path.join(FILES_DIR, `${token}.pdf`);
  fs.copyFileSync(pdfPath, publishedPath);

  return {
    title,
    pages: images.length,
    pdfPath: publishedPath,
    pdfUrl: `${PUBLIC_URL}/files/${token}.pdf`,
    sizeMB: Number((fs.statSync(publishedPath).size / 1048576).toFixed(2))
  };
}

// Upload large PDFs to Google Drive using resumable upload (5 MB chunks).
// The upload session URL and Drive file ID are persisted in queue.json.
const DRIVE_CHUNK_SIZE = 5 * 1024 * 1024; // multiple of Google's 256 KB requirement

function getUploadedOffset(response) {
  const range = response.headers.get('range') || response.headers.get('Range') || '';
  const match = range.match(/bytes=0-(\d+)/i);
  return match ? Number(match[1]) + 1 : 0;
}

async function startDriveUpload(job, fileSize) {
  const started = await callAppsScript('startUpload', {
    code: job.meta.code,
    fileName: `${safeName(job.result.title || `Kotybook-${job.meta.name}`)}.pdf`,
    fileSize
  });
  if (!started.sessionUrl) throw new Error('Google Apps Script لم يُرجع رابط جلسة رفع Google Drive.');
  job.uploadSessionUrl = started.sessionUrl;
  job.uploadOffset = 0;
  saveQueue();
}

async function uploadStoryToDrive(job) {
  const pdfPath = job.result?.pdfPath;
  if (!pdfPath || !fs.existsSync(pdfPath)) {
    throw new Error('ملف PDF غير موجود لإرساله إلى Google Drive.');
  }

  const fileSize = fs.statSync(pdfPath).size;
  if (!job.uploadSessionUrl) await startDriveUpload(job, fileSize);

  // Ask Google which bytes have already arrived; this makes retries resumable.
  let offset = 0;
  try {
    const probe = await fetch(job.uploadSessionUrl, {
      method: 'PUT',
      headers: { 'Content-Range': `bytes */${fileSize}`, 'Content-Length': '0' },
      body: Buffer.alloc(0),
      signal: AbortSignal.timeout(120000)
    });
    if (probe.status === 308) {
      offset = getUploadedOffset(probe);
    } else if (probe.ok) {
      const completed = await probe.json().catch(() => ({}));
      if (completed.id) job.driveFileId = completed.id;
    } else if (probe.status === 404 || probe.status === 410) {
      job.uploadSessionUrl = null;
      job.uploadOffset = 0;
      saveQueue();
      await startDriveUpload(job, fileSize);
      offset = 0;
    } else {
      const detail = await probe.text().catch(() => '');
      throw new Error(`تعذر فحص جلسة رفع Google Drive (${probe.status}): ${detail.slice(0, 300)}`);
    }
  } catch (error) {
    if (error.message && error.message.includes('تعذر فحص جلسة')) throw error;
    // A network timeout during the probe is not proof the session is invalid.
    if (!job.uploadSessionUrl) await startDriveUpload(job, fileSize);
    offset = Number(job.uploadOffset || 0);
  }

  if (!job.driveFileId) {
    const fd = fs.openSync(pdfPath, 'r');
    try {
      while (offset < fileSize) {
        const length = Math.min(DRIVE_CHUNK_SIZE, fileSize - offset);
        const chunk = Buffer.alloc(length);
        const bytesRead = fs.readSync(fd, chunk, 0, length, offset);
        if (!bytesRead) throw new Error('انتهت قراءة ملف PDF قبل اكتمال الرفع.');
        const end = offset + bytesRead - 1;
        const response = await fetch(job.uploadSessionUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Length': String(bytesRead),
            'Content-Range': `bytes ${offset}-${end}/${fileSize}`
          },
          body: chunk.subarray(0, bytesRead),
          signal: AbortSignal.timeout(180000)
        });

        if (response.status === 308) {
          offset = getUploadedOffset(response);
          job.uploadOffset = offset;
          saveQueue();
          console.log(`تم رفع ${(offset / 1048576).toFixed(2)} من ${(fileSize / 1048576).toFixed(2)} MB إلى Google Drive.`);
          continue;
        }
        if (response.ok) {
          const uploaded = await response.json();
          if (!uploaded.id) throw new Error('Google Drive لم يُرجع معرف الملف بعد الرفع.');
          job.driveFileId = uploaded.id;
          job.uploadOffset = fileSize;
          saveQueue();
          break;
        }
        const detail = await response.text().catch(() => '');
        throw new Error(`فشل رفع جزء PDF إلى Google Drive (${response.status}): ${detail.slice(0, 400)}`);
      }
    } finally {
      fs.closeSync(fd);
    }
  }

  const completed = await callAppsScript('completeStory', {
    code: job.meta.code,
    fileId: job.driveFileId,
    fileName: job.result.title || `Kotybook-${job.meta.name}`
  });
  return completed;
}

async function processQueue() {
  if (busy) return;
  busy = true;

  try {
    while (queue.length) {
      const job = queue[0];

      try {
        if (!job.result || !job.result.pdfPath || !fs.existsSync(job.result.pdfPath)) {
          console.log(`بدء إنشاء قصة: ${job.meta.name} | الكود: ${job.meta.code}`);
          job.result = await createStory(job);
          saveQueue();
          console.log(`تم إنشاء PDF (${job.result.pages} صفحات): ${job.result.pdfPath}`);
        }

        const uploaded = await uploadStoryToDrive(job);
        console.log('تم رفع القصة إلى Google Drive وتحديث الشيت.', uploaded.url || '');

        queue.shift();
        saveQueue();
        cleanFile(job.photoPath);
        await sleep(GAP_MS);
      } catch (error) {
        job.tries = Number(job.tries || 0) + 1;
        job.lastError = String(error.message || error).slice(0, 500);
        saveQueue();

        console.error(`تعذر إنهاء الطلب (محاولة ${job.tries}):`, job.lastError);
        console.error('الطلب محفوظ في queue.json وسيُعاد تلقائيًا بعد 60 ثانية.');
        await sleep(60000);
      }
    }
  } finally {
    busy = false;
  }
}

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'Kotybook Storybook',
    engine: 'Groq (primary) + Gemini (fallback) + Google Flow',
    queue: queue.length
  });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, engine: 'flow', queue: queue.length, busy });
});

app.get('/files/:name', (req, res) => {
  if (!/^[a-f0-9]{32}\.pdf$/.test(req.params.name)) {
    return res.status(404).send('Not found');
  }
  const filePath = path.join(FILES_DIR, req.params.name);
  if (!fs.existsSync(filePath)) return res.status(404).send('Expired or not found');
  return res.download(filePath, 'Kotybook-Story.pdf');
});

async function handleWebsiteRequest(req, res) {
  const body = req.body || {};
  const type = String(body.type || 'story').trim().toLowerCase();

  try {
    if (type === 'status') {
      if (!body.code || !body.phone) {
        return res.status(400).type('text/plain; charset=utf-8').send('مطلوب الكود ورقم الهاتف');
      }
      const result = await callAppsScript('status', {
        code: String(body.code).trim(),
        phone: String(body.phone).trim()
      });
      return res.status(200).type('text/plain; charset=utf-8').send(result.message || 'قيد التحضير');
    }

    if (!['story', 'create', 'generate'].includes(type)) {
      return res.status(400).send('نوع الطلب غير صحيح');
    }

    const name = String(body.name || '').trim();
    const phone = String(body.phone || '').trim();
    const dream = String(body.dream || '').trim();
    const code = String(body.code || '').trim();

    if (!name || !phone || !dream || !code || !req.file) {
      cleanFile(req.file?.path);
      return res.status(400).type('text/plain; charset=utf-8').send('بيانات الطلب أو صورة الشخص ناقصة.');
    }

    // حجز كود الطلب في Google Sheets قبل وضعه في الطابور.
    await callAppsScript('claimCode', { code, name, phone, dream });

    const photoPath = normalizePhoto(req.file);
    const meta = { name, phone, dream, code, title: body.title || undefined };

    queue.push({ meta, photoPath, tries: 0, result: null });
    saveQueue();
    processQueue();

    return res.status(200).type('text/plain; charset=utf-8').send('Success');
  } catch (error) {
    cleanFile(req.file?.path);
    console.error('Website request error:', error.message);
    return res.status(400).type('text/plain; charset=utf-8').send(error.message || 'حدث خطأ أثناء استقبال الطلب.');
  }
}

app.post('/', upload.single('photo'), handleWebsiteRequest);
app.post('/webhook', upload.single('photo'), handleWebsiteRequest);
app.post('/generate', upload.single('photo'), (req, res) => {
  const expected = process.env.BOT_SECRET || config.BOT_SECRET || '';
  if (!expected || req.headers['x-secret'] !== expected) {
    cleanFile(req.file?.path);
    return res.status(401).send('Unauthorized');
  }
  req.body.type = 'story';
  return handleWebsiteRequest(req, res);
});

app.use((error, _req, res, _next) => {
  console.error('Request error:', error.message);
  const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
  res.status(status).type('text/plain; charset=utf-8').send(error.message || 'تعذر استقبال الطلب.');
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log('==============================================');
    console.log('Kotybook Storybook is running');
    console.log(`Local URL: http://localhost:${PORT}`);
    console.log(`Webhook:   http://localhost:${PORT}/webhook`);
    console.log('Engine:    Groq PRIMARY + Gemini FALLBACK + Google Flow');
    console.log(`Pending jobs: ${queue.length}`);
    console.log('==============================================');
    if (queue.length) processQueue();
  });
}

module.exports = { app, processQueue, callAppsScript };
