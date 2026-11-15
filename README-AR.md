# Kotybook Storybook — Flow Edition

نسخة المشروع المعتمدة على **Google Flow + Gemini فقط**. تم إزالة اختيار محرك Storybook القديم من مسار التشغيل؛ كل طلب قصة يمر عبر `flow-engine.js`.

## الملفات

- `server.js`: يستقبل طلبات الموقع، يحجز كود الطلب في Google Sheets، يدير الطابور، يشغّل Flow، ينشئ PDF ويرفعه إلى Google Drive.
- `flow-engine.js`: يكتب القصة باستخدام Gemini ثم ينشئ صور الصفحات داخل Google Flow.
- `pdf-utils.js`: يجمع صور الصفحات والنصوص في PDF.
- `login-flow.js`: تسجيل الدخول إلى Google Flow وحفظ جلسة المتصفح محليًا.
- `config.example.json`: نموذج الإعدادات.
- `start.bat`: تشغيل سهل على Windows.

## متطلبات التشغيل

1. Windows 10/11.
2. Node.js 20 LTS.
3. اتصال إنترنت.
4. حساب Google لديه إمكانية استخدام Google Flow.
5. Gemini API key.
6. رابط Google Apps Script Web App المنشور، مع `API_SECRET` المطابق للكود الموجود في Apps Script.

## أول تشغيل

1. فك ضغط المشروع في مجلد ثابت، مثل `Desktop\storybook-bot`.
2. شغّل `start.bat`.
3. أول مرة سيُنشأ `config.json` من النموذج. املأ القيم التالية:
   - `APPS_SCRIPT_URL`
   - `API_SECRET`
   - `GEMINI_API_KEY`
   - `PUBLIC_URL` بعد تشغيل Cloudflare Tunnel أو ngrok.
4. شغّل `start.bat` مرة ثانية.
5. إذا لم يوجد `auth.json`، ستفتح نافذة متصفح. سجّل الدخول إلى Google Flow، وانتظر ظهور الصفحة الرئيسية، ثم ارجع إلى نافذة الأوامر واضغط Enter.
6. سيبدأ السيرفر على `http://localhost:3000`.

## إعدادات config.json

- `APPS_SCRIPT_URL`: رابط Apps Script المنشور وينتهي غالبًا بـ `/exec`.
- `API_SECRET`: نفس السر الذي يتحقق منه Apps Script.
- `GEMINI_API_KEY`: مفتاح Gemini API. لا تشاركه ولا ترفعه إلى GitHub.
- `GEMINI_MODEL`: اسم موديل Gemini المستخدم لكتابة القصة. القيمة الافتراضية في المثال `gemini-3.6-flash`.
- `AUTH_STATE_PATH`: ملف جلسة Flow، افتراضيًا `auth.json`.
- `PUBLIC_URL`: رابط النفق العام الذي يصل إليه العميل عند الحاجة إلى رابط الملف المحلي.
- `PORT`: منفذ السيرفر، افتراضيًا 3000.

`flow-engine.js` يقرأ Gemini API key واسم الموديل من متغيرات البيئة أو `config.json`. والسيرفر يقرأ إعدادات Apps Script من متغيرات البيئة أو `config.json`.

## اختبار السيرفر

افتح:
- `http://localhost:3000/`
- `http://localhost:3000/health`

المفروض يظهر أن المحرك هو `Google Flow + Gemini` وأن `engine` يساوي `flow`.

## Webhook

المسارات المدعومة:
- `POST /webhook`
- `POST /`

طلب إنشاء قصة بصيغة `multipart/form-data` ويحتوي على:
- `name`
- `phone`
- `dream`
- `code`
- `photo` (JPG أو PNG أو WEBP)

طلب الاستعلام عن الحالة:
- `type=status`
- `code`
- `phone`

ويستمر السيرفر في استخدام إجراءات Apps Script الحالية:
- `claimCode`
- `completeStory`
- `status`

## ملاحظات مهمة

- هذا المشروع يحتاج جهازًا أو سيرفرًا يعمل باستمرار، لأن Playwright يفتح Chromium ويتفاعل مع Google Flow. لا يكفي رفع الملفات إلى GitHub وحده لتشغيل الخدمة.
- يجب أن يظل الكمبيوتر متصلًا بالإنترنت، وألا يدخل في وضع Sleep أثناء معالجة الطلبات.
- `auth.json` يحتوي على جلسة دخول Google حساسة. لا ترسله لأحد ولا ترفعه إلى GitHub.
- `config.json` يحتوي على مفاتيح سرية. لا ترسله لأحد ولا ترفعه إلى GitHub.
- الطلبات غير المكتملة تُحفظ في `queue.json` محليًا لاستكمالها بعد إعادة تشغيل السيرفر.
- إذا انتهت جلسة Google، احذف `auth.json` محليًا وشغّل `npm run login` لتسجيل الدخول من جديد.
- لا تضع مفاتيح API داخل `server.js` أو `flow-engine.js`.
