
'use strict';

// Kotybook Local Canva AI Worker
// Uses the user's signed-in Chrome through CDP.
// Does not modify Google Flow or use Canva APIs.

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { PDFDocument } = require('pdf-lib');

const ROOT = path.resolve(__dirname, '..');

const DIR = {
  inbox: path.join(__dirname, 'inbox'),
  output: path.join(__dirname, 'output'),
  done: path.join(__dirname, 'done'),
  failed: path.join(__dirname, 'failed'),
  diagnostics: path.join(__dirname, 'diagnostics')
};

const CDP_URL =
  process.env.CANVA_CDP_URL || 'http://127.0.0.1:9222';

const CANVA_URL = 'https://www.canva.com/ai/';

const GENERATION_TIMEOUT_MS = Number(
  process.env.CANVA_GENERATION_TIMEOUT_MS || 15 * 60 * 1000
);

const POLL_MS = 2500;

for (const dir of Object.values(DIR)) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeName(value) {
  return String(value || 'Kotybook-Story')
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90) || 'Kotybook-Story';
}

function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');

  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function isCanvaAiUrl(url) {
  return /^https:\/\/www\.canva\.com\/ai(?:\/|[?#]|$)/i.test(
    String(url || '')
  );
}

async function saveDiagnostics(page, label, jobId) {
  if (!page || page.isClosed()) return;

  const base = `${stamp()}-${safeName(jobId)}-${label}`;

  await page.screenshot({
    path: path.join(DIR.diagnostics, `${base}.png`),
    fullPage: true
  }).catch(() => {});

  const body = await page.locator('body')
    .innerText()
    .catch(() => '');

  fs.writeFileSync(
    path.join(DIR.diagnostics, `${base}.txt`),
    `URL: ${page.url()}\nTITLE: ${await page.title().catch(() => '')}\n\n${body.slice(-18000)}`,
    'utf8'
  );
}

async function connectCanva() {
  let browser;

  try {
    browser = await chromium.connectOverCDP(CDP_URL, {
      timeout: 10000
    });
  } catch (e) {
    throw new Error(
      `لم أستطع الاتصال بمتصفح Chrome. شغّل start-canva-chrome.bat أولاً. التفاصيل: ${e.message}`
    );
  }

  const context = browser.contexts()[0];

  if (!context) {
    throw new Error('Chrome اتصل لكن لم أجد نافذة متصفح صالحة.');
  }

  return { browser, context };
}

// Close old Canva AI tabs and create a fresh Canva AI workspace.
async function startFreshChat(context, jobId) {
  const page = await context.newPage();

  page.setDefaultTimeout(20000);

  try {
    const oldAiTabs = context.pages().filter(p =>
      p !== page && isCanvaAiUrl(p.url())
    );

    console.log(
      `[${jobId}] عدد تبويبات Canva AI القديمة: ${oldAiTabs.length}`
    );

    for (const oldTab of oldAiTabs) {
      await oldTab.close({ runBeforeUnload: false }).catch(() => {});
    }

    console.log(
      `[${jobId}] تم إغلاق محادثات Canva AI القديمة.`
    );

    console.log(
      `[${jobId}] فتح مساحة Canva AI جديدة...`
    );

    await page.goto(CANVA_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 90000
    });

    const exactEditor = page.locator(
      'textarea[aria-label="راسل الذكاء الاصطناعي من Canva"]'
    ).first();

    let editor = exactEditor;

    try {
      await exactEditor.waitFor({
        state: 'visible',
        timeout: 45000
      });
    } catch {
      editor = page.locator('textarea').first();

      await editor.waitFor({
        state: 'visible',
        timeout: 30000
      });
    }

    await page.waitForTimeout(2500);

    await editor.waitFor({
      state: 'visible',
      timeout: 30000
    });

    const currentUrl = page.url();

    if (!isCanvaAiUrl(currentUrl)) {
      throw new Error(
        `الصفحة الحالية ليست Canva AI: ${currentUrl}`
      );
    }

    if (/\/ai\/thread\//i.test(currentUrl)) {
      throw new Error(
        `Canva فتح محادثة قديمة بدل مساحة جديدة: ${currentUrl}`
      );
    }

    const editorValue = await editor.inputValue().catch(() => null);

    if (editorValue === null) {
      throw new Error(
        'تعذر قراءة مربع الكتابة في Canva AI.'
      );
    }

    if (editorValue.trim() !== '') {
      throw new Error(
        'مربع الكتابة ليس فارغًا. تم إيقاف الإرسال لحماية القصة.'
      );
    }

    console.log(
      `[${jobId}] مساحة Canva AI جاهزة ومربع الكتابة فارغ: ${currentUrl}`
    );

    return { page, editor };

  } catch (error) {
    await saveDiagnostics(page, 'fresh-chat-error', jobId);
    throw error;
  }
}

// Attach the child's reference image through Canva's visible UI.
async function attachReferenceImage(page, imagePath, jobId) {
  if (!imagePath) {
    console.log(`[${jobId}] لا توجد صورة مرجعية في ملف الطلب.`);
    return null;
  }

  const resolvedPath = path.isAbsolute(imagePath)
    ? imagePath
    : path.resolve(ROOT, imagePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `صورة الطفل غير موجودة: ${resolvedPath}`
    );
  }

  const fileName = path.basename(resolvedPath);

  console.log(`[${jobId}] تجهيز الصورة المرجعية: ${fileName}`);

  const addButton = page.locator(
    'button[aria-label="أضِف شيئًا إلى طلبك"]'
  );

  await addButton.waitFor({
    state: 'visible',
    timeout: 20000
  });

  await addButton.click();

  await page.waitForTimeout(1000);

  // This opens Canva's upload menu.
  await page.getByText('تحميل', {
    exact: true
  }).last().click();

  const uploadInput = page.locator('input[type="file"]').last();

  await uploadInput.waitFor({
    state: 'attached',
    timeout: 15000
  });

  console.log(`[${jobId}] إرسال الصورة إلى Canva...`);

  await uploadInput.setInputFiles(resolvedPath);

  // Do not continue until Canva displays the uploaded image.
  try {
    await page.waitForFunction(
      (name) => {
        return [...document.querySelectorAll('img')].some(img => {
          const rect = img.getBoundingClientRect();

          return (
            img.alt === name &&
            img.complete &&
            img.naturalWidth > 0 &&
            rect.width > 0 &&
            rect.height > 0
          );
        });
      },
      fileName,
      { timeout: 45000 }
    );
  } catch {
    await saveDiagnostics(page, 'image-upload-not-confirmed', jobId);

    throw new Error(
      `أرسلنا الصورة إلى Canva لكن لم نتأكد من ظهورها كمرفق: ${fileName}`
    );
  }

  console.log(
    `[${jobId}] تم التأكد من ظهور الصورة المرجعية كمرفق: ${fileName}`
  );

  await page.waitForTimeout(1500);

  const editor = page.locator(
    'textarea[aria-label="راسل الذكاء الاصطناعي من Canva"], textarea'
  ).first();

  await editor.waitFor({
    state: 'visible',
    timeout: 20000
  });

  return {
    path: resolvedPath,
    fileName
  };
}

async function waitForGeneratedDesign(page, jobId) {
  const start = Date.now();

  let lastBody = '';
  let stable = 0;

  while (Date.now() - start < GENERATION_TIMEOUT_MS) {
    const body = await page.locator('body')
      .innerText()
      .catch(() => '');

    const hasCreated =
      /تم إنشاء التصميم/.test(body) ||
      /design created/i.test(body);

    const hasAdded =
      /تمت إضافة تصميمك/.test(body) ||
      /design added/i.test(body);

    const hasDownload = await page
      .getByRole('button', { name: 'تنزيل', exact: true })
      .isVisible()
      .catch(() => false);

    if (hasCreated && hasAdded && hasDownload) {
      return;
    }

    if (body === lastBody) {
      stable++;
    } else {
      stable = 0;
    }

    lastBody = body;

    if (
      stable > 18 &&
      /حدث خطأ|something went wrong|تعذر إنشاء|couldn't create/i.test(body)
    ) {
      await saveDiagnostics(page, 'generation-error', jobId);

      throw new Error(
        'Canva عرض رسالة خطأ أثناء إنشاء التصميم. تم حفظ صورة تشخيصية.'
      );
    }

    await page.waitForTimeout(POLL_MS);
  }

  await saveDiagnostics(page, 'generation-timeout', jobId);

  throw new Error(
    'انتهت مهلة انتظار Canva ولم يظهر تأكيد إنشاء التصميم وزر التنزيل.'
  );
}

async function validatePdf(filePath, minPages = 1, maxPages = 30) {
  const bytes = fs.readFileSync(filePath);

  if (
    bytes.length < 1000 ||
    bytes.subarray(0, 5).toString('ascii') !== '%PDF-'
  ) {
    throw new Error(
      'الملف الذي نزل ليس PDF سليمًا أو حجمه صغير بشكل غير متوقع.'
    );
  }

  let doc;

  try {
    doc = await PDFDocument.load(bytes);
  } catch (e) {
    throw new Error(
      `تعذر فتح PDF بعد التنزيل: ${e.message}`
    );
  }

  const pages = doc.getPageCount();

  if (pages < minPages || pages > maxPages) {
    throw new Error(
      `تم تنزيل PDF لكن عدد صفحاته ${pages} خارج النطاق المتوقع (${minPages}-${maxPages}).`
    );
  }

  return {
    bytes: bytes.length,
    pages
  };
}

async function processJob(jobFile) {
  const raw = fs.readFileSync(jobFile, 'utf8');
  const job = JSON.parse(raw);

  const prompt = String(job.prompt || '').trim();

  if (!prompt) {
    throw new Error('ملف الطلب لا يحتوي على prompt.');
  }

  const jobId = safeName(
    job.id || path.basename(jobFile, '.json')
  );

  const title = safeName(
    job.title || job.name || jobId
  );

  const minPages = Number(job.minPages ?? 1);
  const maxPages = Number(job.maxPages ?? 30);

  if (
    !Number.isInteger(minPages) ||
    !Number.isInteger(maxPages) ||
    minPages < 1 ||
    maxPages < minPages
  ) {
    throw new Error('إعدادات عدد الصفحات غير صحيحة.');
  }

  console.log(`\n[${jobId}] الاتصال بمتصفح Chrome...`);

  const { browser, context } = await connectCanva();

  let page = null;
  let outputPath;
  let attachedImage = null;

  try {
    const fresh = await startFreshChat(context, jobId);

    page = fresh.page;

    let editor = fresh.editor;

    // Upload image before sending the story prompt.
    if (job.imagePath) {
      attachedImage = await attachReferenceImage(
        page,
        job.imagePath,
        jobId
      );

      editor = page.locator(
        'textarea[aria-label="راسل الذكاء الاصطناعي من Canva"], textarea'
      ).first();
    }

    console.log(`[${jobId}] تجهيز نص القصة...`);

    await editor.fill(prompt);

    const send = page.getByRole(
      'button',
      { name: 'إرسال', exact: true }
    );

    await send.waitFor({
      state: 'visible',
      timeout: 20000
    });

    console.log(`[${jobId}] إرسال الطلب إلى Canva AI...`);

    await send.click();

    console.log(`[${jobId}] انتظار إنشاء التصميم...`);

    await waitForGeneratedDesign(page, jobId);

    const downloadButton = page.getByRole(
      'button',
      { name: 'تنزيل', exact: true }
    );

    console.log(`[${jobId}] تنزيل PDF...`);

    const [download] = await Promise.all([
      page.waitForEvent('download', {
        timeout: 120000
      }),
      downloadButton.click()
    ]);

    const extension = '.pdf';
    const base = `${stamp()}-${title}`;

    outputPath = path.join(
      DIR.output,
      `${base}${extension}`
    );

    await download.saveAs(outputPath);

    const failure = await download.failure();

    if (failure) {
      throw new Error(`فشل تنزيل الملف: ${failure}`);
    }

    const report = await validatePdf(
      outputPath,
      minPages,
      maxPages
    );

    fs.writeFileSync(
      outputPath.replace(/\.pdf$/i, '.json'),
      JSON.stringify({
        id: jobId,
        title,
        file: path.basename(outputPath),
        pages: report.pages,
        bytes: report.bytes,
        image: attachedImage ? attachedImage.fileName : null,
        createdAt: new Date().toISOString(),
        source: 'Canva AI via local Chrome'
      }, null, 2),
      'utf8'
    );

    console.log(`[${jobId}] تم بنجاح: ${outputPath}`);

    console.log(
      `[${jobId}] عدد الصفحات: ${report.pages} | الحجم: ${report.bytes} bytes`
    );

    await saveDiagnostics(page, 'completed', jobId);

    return {
      outputPath,
      ...report
    };

  } catch (error) {
    if (outputPath && fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    if (page) {
      await saveDiagnostics(page, 'failed', jobId);
    }

    throw error;

  } finally {
    await browser.close().catch(() => {});
  }
}

async function main() {
  const requested = process.argv[2]
    ? path.resolve(process.argv[2])
    : null;

  let jobs;

  if (requested) {
    if (!fs.existsSync(requested)) {
      throw new Error(`ملف الطلب غير موجود: ${requested}`);
    }

    jobs = [requested];

  } else {
    jobs = fs.readdirSync(DIR.inbox)
      .filter(n => n.toLowerCase().endsWith('.json'))
      .sort()
      .map(n => path.join(DIR.inbox, n));
  }

  if (!jobs.length) {
    console.log(
      'لا توجد طلبات JSON داخل canva-worker/inbox.'
    );

    return;
  }

  let failures = 0;

  for (const jobFile of jobs) {
    const base = path.basename(jobFile);

    try {
      await processJob(jobFile);

      if (!requested) {
        fs.renameSync(
          jobFile,
          path.join(
            DIR.done,
            `${path.parse(base).name}-${stamp()}.json`
          )
        );
      }

    } catch (error) {
      failures++;

      console.error(
        `\nفشل الطلب ${base}: ${error.message}`
      );

      if (!requested && fs.existsSync(jobFile)) {
        fs.renameSync(
          jobFile,
          path.join(
            DIR.failed,
            `${path.parse(base).name}-${stamp()}.json`
          )
        );
      }
    }
  }

  if (failures) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(
    '\nCANVA LOCAL WORKER ERROR:',
    error.message
  );

  process.exitCode = 1;
});
