# إعداد التشغيل الفعلي — كوتي بوك

## 1) دمج الفرع
الكود موجود في الفرع `canva-actions-integration`. بعد مراجعة التغييرات ودمجها إلى `main`، يصبح Workflow `main.yml` متاحًا لطلبات Apps Script.

## 2) إعداد GitHub Secrets
من المستودع: Settings → Secrets and variables → Actions → New repository secret. أضف:

| الاسم | القيمة |
|---|---|
| `APPS_SCRIPT_URL` | رابط Apps Script Web App المنشور وينتهي بـ `/exec` |
| `API_SECRET` | القيمة المطابقة لـ Script Property `API_SECRET` |
| `CANVA_CLIENT_INFO_JSON` | JSON يحتوي `client_id` و`client_secret` من Canva Developer Portal |
| `CANVA_MCP_AUTH_ARCHIVE_B64` | نسخة Base64 من أرشيف جلسة OAuth الموضح أدناه |
| `GROQ_API_KEY` | مفتاح Groq (اختياري إذا أضفت Gemini) |
| `GEMINI_API_KEY` | مفتاح Gemini (اختياري إذا أضفت Groq) |

يجب إضافة مفتاح واحد على الأقل من Groq أو Gemini. لا ترسل أيًا من هذه القيم في المحادثة أو تضعها داخل ملفات Git.

## 3) تجهيز جلسة Canva OAuth على Windows
يجب أن يكون تسجيل الدخول إلى Canva MCP قد اكتمل مسبقًا على نفس جهاز Windows وبنفس Canva app credentials.

نفّذ في PowerShell:

~~~powershell
$authDir = Join-Path $env:USERPROFILE ".mcp-auth"
if (!(Test-Path $authDir)) { throw "لم أجد مجلد OAuth: $authDir. تحقق من مكان حفظ mcp-remote auth cache." }
$archive = Join-Path $env:TEMP "canva-mcp-auth.tar.gz"
tar.exe -czf $archive -C $authDir .
if ($LASTEXITCODE -ne 0) { throw "فشل ضغط مجلد OAuth." }
$bytes = [System.IO.File]::ReadAllBytes($archive)
$b64 = [Convert]::ToBase64String($bytes)
Set-Clipboard $b64
Write-Host "تم نسخ قيمة CANVA_MCP_AUTH_ARCHIVE_B64 إلى Clipboard. ألصقها مباشرة في GitHub Secret ولا تلصقها هنا."
~~~

إذا لم يوجد المجلد، لا تنشئ مجلدًا فارغًا؛ تحقق من مكان حفظ جلسة mcp-remote أو أكمل تسجيل الدخول أولًا.

## 4) تحديث Apps Script المنشور
الملف الكامل المحدّث موجود في `apps-script/Kotybook-Code.gs`. افتح مشروع Apps Script المرتبط بالموقع، واستبدل محتوى الملف القديم بالمحتوى الكامل لهذا الملف مع الحفاظ على Script Properties الحالية، ثم احفظ وانشر New version من Manage deployments.

هذا الإصدار يحافظ على ترتيب أعمدة الشيت الحالي (A:O) وتكامل Telegram. ويستهدف `mstfyabrhym256-dotcom/Kotybook-Storybook-Flow` وWorkflow `main.yml` والفرع `main`.

## 5) اختبار قبل استقبال طلبات حقيقية
بعد الدمج وإعداد الأسرار ونشر Apps Script، شغّل Workflow يدويًا بكود اختبار صالح. راقب المراحل: getJob ثم تأليف القصة ثم رفع صورة المرجع ثم توليد 10 صور وتنزيلها ثم PDF ثم Drive ثم completeStory.

لا تعتبر التشغيل ناجحًا إلا إذا ظهرت حالة `جاهزة` ورابط PDF في Google Sheet وفتح الرابط فعليًا.

## ملاحظة تقنية
Canva MCP يتطلب OAuth لمستخدم Canva، وليس service account. العامل يتوقف عمدًا إذا أعاد Canva مرجع MEDIA دون محتوى صورة قابل للتنزيل؛ لن يرفع PDF ناقصًا أو صورًا وهمية.