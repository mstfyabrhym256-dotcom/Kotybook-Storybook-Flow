const SHEET_ID = '1UQeK0BeCJOyFCigaXXJqFuRnMvcfW4HqPLiVYl_2laY';
const SHEET_NAME = 'الورقة1';

const REPO = 'mstfyabrhym256-dotcom/Kotybook-Storybook-Flow';
const WORKFLOW = 'main.yml';
const BRANCH = 'main';

// ترتيب الأعمدة المعتمد:
// A الكود | B حالة الكود | C الاسم | D النوع | E العمر
// F رقم الموبايل | G التخصص | H الحالة | I رابط القصة
// J Photo File ID | K Job ID | L Created At
// M Telegram Chat ID | N Telegram Bot ID | O Telegram Status

function output(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const p = (e && e.parameter) || {};

  if (p.action === 'status') {
    try {
      const sheet = getSheet();
      return output(getStatus(sheet, p));
    } catch (err) {
      return output({ ok: false, error: err.message });
    }
  }

  return output({ ok: true, service: 'Kotybook Backend' });
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents
      ? e.postData.contents
      : '{}';
    const data = JSON.parse(raw);

    // Telegram updates لا تحتوي على action مثل طلبات الموقع والبوت.
    if (data && data.update_id !== undefined) {
      return output(handleTelegramUpdate(e, data));
    }

    const action = String(data.action || '');

    if (action === 'submitOrder') {
      return output(submitOrder(data));
    }

    if (action === 'status') {
      return output(getStatus(getSheet(), data));
    }

    verifySecret(data.secret);

    const sheet = getSheet();

    switch (action) {
      case 'getJob':
        return output(getJob(sheet, data));
      case 'startUpload':
        return output(startUpload(sheet, data));
      case 'completeStory':
        return output(completeStory(sheet, data));
      case 'failStory':
        return output(failStory(sheet, data));
      default:
        return output({ ok: false, error: 'Unknown action' });
    }
  } catch (err) {
    return output({ ok: false, error: err.message });
  }
}

function getSheet() {
  const sheet = SpreadsheetApp
    .openById(SHEET_ID)
    .getSheetByName(SHEET_NAME);

  if (!sheet) throw new Error('Sheet not found');
  return sheet;
}

function verifySecret(secret) {
  const saved = PropertiesService
    .getScriptProperties()
    .getProperty('API_SECRET');

  if (!saved || String(secret) !== saved) {
    throw new Error('Unauthorized');
  }
}

function findRow(sheet, code) {
  const last = sheet.getLastRow();
  if (last < 2) return -1;

  const codes = sheet.getRange(2, 1, last - 1, 1).getDisplayValues();
  const index = codes.findIndex(
    row => String(row[0]).trim() === String(code).trim()
  );

  return index === -1 ? -1 : index + 2;
}

// توحيد أرقام مصر: 010... و2010... يصبحان نفس الرقم.
function normalizePhone(phone) {
  let digits = String(phone || '').replace(/\D/g, '');

  if (digits.indexOf('0020') === 0) {
    digits = digits.substring(2);
  }
  if (digits.indexOf('20') === 0 && digits.length === 12) {
    digits = digits.substring(2);
  }

  return digits.replace(/^0+/, '');
}

// استقبال الطلب وحفظ صورة العميل
function submitOrder(data) {
  const name = String(data.name || '').trim();
  const gender = String(data.gender || '').trim();
  const ageText = String(data.age === undefined || data.age === null ? '' : data.age).trim();
  const age = Number(ageText);
  const phone = String(data.phone || '').trim();
  const dream = String(data.dream || '').trim();
  const code = String(data.code || '').trim();
  const mime = String(data.photoMime || 'image/jpeg').toLowerCase();

  let base64 = String(data.photoBase64 || '');
  base64 = base64.replace(/^data:image\/[^;]+;base64,/, '');

  if (!name || !phone || !dream || !code || !base64 || !gender || !ageText) {
    throw new Error('بيانات الطلب أو الصورة ناقصة');
  }

  if (!['ولد', 'بنت'].includes(gender)) {
    throw new Error('نوع الطفل غير صحيح');
  }

  // العمر المسموح من 3 إلى 40 سنة شاملًا.
  if (!Number.isInteger(age) || age < 3 || age > 40) {
    throw new Error('العمر لازم يكون من 3 إلى 40 سنة');
  }

  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
    throw new Error('صيغة الصورة غير مدعومة');
  }

  if (base64.length > 7 * 1024 * 1024) {
    throw new Error('حجم الصورة أكبر من المسموح');
  }

  const sheet = getSheet();
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  let row;
  try {
    row = findRow(sheet, code);
    if (row === -1) throw new Error('الكود غير صحيح');

    const current = String(sheet.getRange(row, 2).getValue()).trim();
    if (current === 'مستخدم') throw new Error('الكود مستخدم بالفعل');

    // نحدّث بيانات الطلب من B إلى L ونترك أعمدة Telegram كما هي.
    sheet.getRange(row, 2, 1, 11).setValues([[
      'مستخدم',       // B حالة الكود
      name,           // C الاسم
      gender,         // D النوع
      age,            // E العمر
      phone,          // F رقم الموبايل
      dream,          // G التخصص
      'تم استلام الطلب', // H الحالة
      '',             // I رابط القصة
      '',             // J Photo File ID
      '',             // K Job ID
      new Date()      // L Created At
    ]]);
  } finally {
    lock.releaseLock();
  }

  try {
    const bytes = Utilities.base64Decode(base64);
    const extension = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp'
    }[mime];

    const blob = Utilities.newBlob(
      bytes, mime, 'Kotybook-' + code + '.' + extension
    );

    const folderId = PropertiesService
      .getScriptProperties()
      .getProperty('DRIVE_FOLDER_ID');

    const photoFile = folderId
      ? DriveApp.getFolderById(folderId).createFile(blob)
      : DriveApp.createFile(blob);

    sheet.getRange(row, 10).setValue(photoFile.getId()); // J Photo File ID
    triggerGitHub(code);
    sheet.getRange(row, 8).setValue('قيد التحضير'); // H الحالة

    return {
      ok: true,
      message: 'تم استلام طلبك بنجاح',
      telegramUrl: 'https://t.me/KotyStory_bot?start=' + encodeURIComponent(code)
    };
  } catch (err) {
    sheet.getRange(row, 8).setValue('تعذر بدء المعالجة'); // H الحالة
    Logger.log('submitOrder error for ' + code + ': ' + err.message);
    throw err;
  }
}

// إرسال أمر تشغيل إلى GitHub
function triggerGitHub(code) {
  const token = PropertiesService
    .getScriptProperties()
    .getProperty('GITHUB_TOKEN');

  if (!token) throw new Error('GITHUB_TOKEN غير موجود');

  const url = 'https://api.github.com/repos/' + REPO +
    '/actions/workflows/' + WORKFLOW + '/dispatches';

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    payload: JSON.stringify({
      ref: BRANCH,
      inputs: { code: code }
    }),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  if (status !== 204) {
    throw new Error(
      'فشل تشغيل GitHub Actions: HTTP ' +
      status + ' - ' + response.getContentText()
    );
  }
  return true;
}

// GitHub يستدعي هذه العملية للحصول على بيانات الطلب والصورة
function getJob(sheet, data) {
  const row = findRow(sheet, data.code);
  if (row === -1) throw new Error('Invalid code');

  // B:L حسب ترتيب الشيت الحالي.
  const values = sheet.getRange(row, 2, 1, 11).getValues()[0];
  if (String(values[0]).trim() !== 'مستخدم') {
    throw new Error('Order is not claimed');
  }

  const photoId = String(values[8] || ''); // J Photo File ID
  if (!photoId) throw new Error('Photo file not found');

  const photo = DriveApp.getFileById(photoId);
  const bytes = photo.getBlob().getBytes();

  return {
    ok: true,
    meta: {
      code: String(data.code),
      name: String(values[1]),       // C
      gender: String(values[2]),     // D
      age: Number(values[3]),        // E
      phone: String(values[4]),      // F
      dream: String(values[5])       // G
    },
    photoMime: String(photo.getMimeType()),
    photoBase64: Utilities.base64Encode(bytes)
  };
}

// إنشاء جلسة رفع PDF إلى Google Drive
function startUpload(sheet, data) {
  const row = findRow(sheet, data.code);
  if (row === -1) throw new Error('Invalid code');

  const fileSize = Number(data.fileSize || 0);
  if (!Number.isFinite(fileSize) || fileSize < 1) {
    throw new Error('Invalid file size');
  }

  const folderId = PropertiesService
    .getScriptProperties()
    .getProperty('DRIVE_FOLDER_ID');

  const metadata = {
    name: String(data.fileName || 'Kotybook-Story.pdf'),
    mimeType: 'application/pdf'
  };
  if (folderId) metadata.parents = [folderId];

  const response = UrlFetchApp.fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink',
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(metadata),
      headers: {
        Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
        'X-Upload-Content-Type': 'application/pdf',
        'X-Upload-Content-Length': String(fileSize)
      },
      muteHttpExceptions: true
    }
  );

  const status = response.getResponseCode();
  const headers = response.getAllHeaders();
  const sessionUrl = headers.Location || headers.location;

  if (status < 200 || status >= 300 || !sessionUrl) {
    throw new Error('تعذر إنشاء جلسة رفع PDF: HTTP ' + status);
  }

  return { ok: true, sessionUrl: String(sessionUrl) };
}

// اعتماد القصة بعد رفع PDF
function completeStory(sheet, data) {
  const row = findRow(sheet, data.code);
  if (row === -1) throw new Error('Invalid code');
  if (!data.fileId) throw new Error('Missing Drive file ID');

  const file = DriveApp.getFileById(String(data.fileId));
  if (file.getMimeType() !== MimeType.PDF) {
    throw new Error('Uploaded file is not a PDF');
  }

  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const url = file.getUrl();
  sheet.getRange(row, 8, 1, 2).setValues([['جاهزة', url]]); // H:I

  // حذف صورة العميل بعد اكتمال القصة.
  const photoId = String(sheet.getRange(row, 10).getValue() || ''); // J
  if (photoId) {
    try {
      DriveApp.getFileById(photoId).setTrashed(true);
    } catch (_) {}
  }

  // K مخصص لـ Job ID، لذلك نسجل الأخطاء في سجل التنفيذ بدلًا منه.
  try {
    sendStoryReadyNotification(sheet, row, url);
  } catch (telegramError) {
    sheet.getRange(row, 15).setValue(
      'تعذر الإرسال: ' + String(telegramError.message).slice(0, 300)
    ); // O Telegram Status
  }

  return { ok: true, url: url };
}

// تسجيل فشل الطلب
function failStory(sheet, data) {
  const row = findRow(sheet, data.code);
  if (row === -1) throw new Error('Invalid code');

  sheet.getRange(row, 8).setValue('تعذر إنشاء القصة'); // H الحالة
  Logger.log('Story failed for ' + data.code + ': ' +
    String(data.error || 'Unknown error').slice(0, 500));
  return { ok: true };
}

// حالة الطلب للموقع
function getStatus(sheet, data) {
  const row = findRow(sheet, data.code);
  if (row === -1) {
    return { ok: false, message: 'الكود غير صحيح' };
  }

  const savedPhone = normalizePhone(
    sheet.getRange(row, 6).getDisplayValue() // F رقم الموبايل
  );
  const enteredPhone = normalizePhone(data.phone);

  if (!savedPhone || savedPhone !== enteredPhone) {
    return { ok: false, message: 'رقم الهاتف غير صحيح' };
  }

  const status = String(sheet.getRange(row, 8).getValue()).trim(); // H
  const url = String(sheet.getRange(row, 9).getValue()).trim(); // I

  if (status === 'جاهزة' && url) {
    return { ok: true, message: 'جاهزة', url: url };
  }

  return { ok: true, message: status || 'قيد التحضير' };
}

/* =========================
   Telegram integration
   ========================= */

// يتأكد أن الطلب القادم من Telegram يحمل سر رابط الـ webhook.
function handleTelegramUpdate(e, update) {
  const props = PropertiesService.getScriptProperties();
  const expected = props.getProperty('TELEGRAM_WEBHOOK_SECRET');
  const received = e && e.parameter ? String(e.parameter.tg_secret || '') : '';

  if (!expected || received !== expected) {
    return { ok: false, error: 'Telegram webhook unauthorized' };
  }

  const message = update.message;
  if (!message || !message.chat || !message.from) {
    return { ok: true, ignored: true };
  }

  const chatId = String(message.chat.id);
  const textMessage = String(message.text || '').trim();

  if (textMessage.indexOf('/start') === 0) {
    const parts = textMessage.split(/\s+/);
    const code = parts.length > 1 ? parts[1].trim() : '';

    if (!code) {
      telegramSendMessage(
        chatId,
        'أهلًا بيك في كوتي بوك! افتح رابط تيليجرام من صفحة طلب القصة على الموقع علشان نربط قصتك بحسابك.'
      );
      return { ok: true };
    }

    const sheet = getSheet();
    const row = findRow(sheet, code);
    if (row === -1) {
      telegramSendMessage(chatId, 'الكود ده مش موجود. راجع الكود أو افتح رابط البوت من صفحة طلبك.');
      return { ok: true };
    }

    const statusCode = String(sheet.getRange(row, 2).getValue()).trim();
    if (statusCode !== 'مستخدم') {
      telegramSendMessage(chatId, 'لازم تسجل طلب القصة على الموقع الأول، وبعدها افتح رابط تيليجرام الموجود في صفحة تأكيد الطلب.');
      return { ok: true };
    }

    props.setProperty('TG_PENDING_' + chatId, code);

    telegramSendContactRequest(chatId);
    return { ok: true };
  }

  if (message.contact) {
    return handleTelegramContact(message, chatId);
  }

  telegramSendMessage(
    chatId,
    'علشان نربط حسابك بطلب القصة، اضغط Start من رابط كوتي بوك وشارك رقم هاتفك من زرار مشاركة الرقم.'
  );
  return { ok: true };
}

// لا نقبل رقمًا مُرسلًا يدويًا؛ يجب أن يكون Contact من زر المشاركة ومن نفس المستخدم.
function handleTelegramContact(message, chatId) {
  const contact = message.contact;
  const senderId = String(message.from.id);
  const contactUserId = contact.user_id === undefined
    ? ''
    : String(contact.user_id);

  if (!contactUserId || contactUserId !== senderId) {
    telegramSendMessage(chatId, 'من فضلك شارك رقمك أنت من زر «مشاركة رقم الهاتف»، مش رقم شخص تاني.');
    return { ok: true };
  }

  const props = PropertiesService.getScriptProperties();
  const pendingKey = 'TG_PENDING_' + chatId;
  const code = props.getProperty(pendingKey);

  if (!code) {
    telegramSendMessage(chatId, 'افتح رابط البوت من صفحة طلبك على الموقع الأول، وبعدها شارك رقمك.');
    return { ok: true };
  }

  const sheet = getSheet();
  const row = findRow(sheet, code);
  if (row === -1) {
    props.deleteProperty(pendingKey);
    telegramSendMessage(chatId, 'مش قادر أوصل للطلب المرتبط بالكود. ارجع للموقع وابدأ الربط من جديد.');
    return { ok: true };
  }

  const orderStatus = String(sheet.getRange(row, 2).getValue()).trim();
  const savedPhone = normalizePhone(sheet.getRange(row, 6).getDisplayValue());
  const telegramPhone = normalizePhone(contact.phone_number);

  if (orderStatus !== 'مستخدم' || !savedPhone || savedPhone !== telegramPhone) {
    telegramSendMessage(chatId, 'رقم الهاتف مش مطابق للرقم المسجل في الطلب. استخدم نفس الرقم اللي سجلت بيه على الموقع.');
    return { ok: true };
  }

  const existingChatId = String(sheet.getRange(row, 13).getValue() || '').trim();
  if (existingChatId && existingChatId !== chatId) {
    telegramSendMessage(chatId, 'الطلب ده مربوط بالفعل بحساب تيليجرام آخر. لو محتاج مساعدة كلم دعم كوتي بوك.');
    props.deleteProperty(pendingKey);
    return { ok: true };
  }

  sheet.getRange(row, 13).setValue(chatId); // M Telegram Chat ID

  // حفظ رقم البوت في N عند الربط، مع الحفاظ على القيمة إن كانت موجودة.
  const botIdCell = sheet.getRange(row, 14); // N Telegram Bot ID
  if (!String(botIdCell.getValue() || '').trim()) {
    const botToken = PropertiesService.getScriptProperties()
      .getProperty('TELEGRAM_BOT_TOKEN') || '';
    botIdCell.setValue(botToken.split(':')[0] || '');
  }
  sheet.getRange(row, 15).setValue('مرتبط بتيليجرام'); // O Telegram Status
  props.deleteProperty(pendingKey);

  telegramSendMessage(
    chatId,
    'تم ربط طلبك بنجاح بكوتي بوك! هنبعتلك رسالة هنا أول ما قصتك تجهز. وتقدر تتابعها أو تنزلها في أي وقت من تبويب «قصتي» على الموقع.'
  );

  // لو القصة خلصت قبل ما العميل يربط تيليجرام، ابعت الرابط فورًا.
  const storyStatus = String(sheet.getRange(row, 8).getValue()).trim();
  const storyUrl = String(sheet.getRange(row, 9).getValue()).trim();
  if (storyStatus === 'جاهزة' && storyUrl) {
    sendStoryReadyNotification(sheet, row, storyUrl);
  }

  return { ok: true };
}

function telegramSendContactRequest(chatId) {
  const textMessage =
    'علشان نتأكد إن ده نفس رقم الهاتف المسجل في طلبك، اضغط الزر اللي تحت وشارك رقمك. مش هنستخدمه غير لربط طلبك وإرسال إشعار جاهزية القصة.';

  telegramApiRequest('sendMessage', {
    chat_id: chatId,
    text: textMessage,
    reply_markup: {
      keyboard: [[{
        text: 'مشاركة رقم الهاتف',
        request_contact: true
      }]],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  });
}

function telegramSendMessage(chatId, textMessage) {
  return telegramApiRequest('sendMessage', {
    chat_id: chatId,
    text: textMessage,
    disable_web_page_preview: false
  });
}

function telegramApiRequest(method, payload) {
  const token = PropertiesService
    .getScriptProperties()
    .getProperty('TELEGRAM_BOT_TOKEN');

  if (!token) throw new Error('TELEGRAM_BOT_TOKEN غير موجود في Script Properties');

  const response = UrlFetchApp.fetch(
    'https://api.telegram.org/bot' + token + '/' + method,
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    }
  );

  const status = response.getResponseCode();
  const body = response.getContentText();
  let result = {};

  try {
    result = JSON.parse(body);
  } catch (_) {}

  if (status < 200 || status >= 300 || !result.ok) {
    throw new Error('Telegram API error: HTTP ' + status + ' - ' + body.slice(0, 300));
  }

  return result;
}

// إرسال إشعار جاهزية القصة مرة واحدة فقط.
function sendStoryReadyNotification(sheet, row, storyUrl) {
  const chatId = String(sheet.getRange(row, 13).getValue() || '').trim();
  if (!chatId) return false;

  const notificationStatus = String(sheet.getRange(row, 15).getValue() || '').trim();
  if (notificationStatus === 'تم إرسال إشعار الجاهزية') return true;

  telegramSendMessage(
    chatId,
    'خبر حلو! قصتك من كوتي بوك بقت جاهزة 🎉\n\nتقدر تفتحها وتنزلها من الرابط ده:\n' + storyUrl +
    '\n\nوتقدر كمان تتابع طلبك من تبويب «قصتي» على الموقع.'
  );

  sheet.getRange(row, 15).setValue('تم إرسال إشعار الجاهزية');
  return true;
}

// شغّل هذه الدالة يدويًا مرة واحدة لتسجيل Cloudflare Worker كـ Telegram webhook.
function setTelegramWebhook() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('TELEGRAM_BOT_TOKEN');
  const secret = props.getProperty('TELEGRAM_WEBHOOK_SECRET');

  if (!token || !secret) {
    throw new Error('تأكد من وجود TELEGRAM_BOT_TOKEN و TELEGRAM_WEBHOOK_SECRET في Script Properties');
  }

  // Telegram يرسل التحديثات إلى Cloudflare، والـ Worker يمررها إلى Apps Script.
  const workerUrl = 'https://kotybook-telegram.mostafa-tarek2704.workers.dev/';

  const response = UrlFetchApp.fetch(
    'https://api.telegram.org/bot' + token + '/setWebhook',
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        url: workerUrl,
        secret_token: secret,
        drop_pending_updates: true
      }),
      muteHttpExceptions: true
    }
  );

  const body = response.getContentText();
  let result = {};
  try {
    result = JSON.parse(body);
  } catch (_) {}

  if (response.getResponseCode() < 200 ||
      response.getResponseCode() >= 300 ||
      !result.ok) {
    throw new Error('فشل تسجيل Telegram webhook: ' + body);
  }

  Logger.log('Telegram webhook registered through Cloudflare Worker: ' + JSON.stringify(result));
  return result;
}