# Kotybook Storybook — Canva MCP Worker

المسار: الموقع وApps Script وSheets ← GitHub Actions ← Canva MCP ← 10 صور ← PDF ← Google Drive.

## GitHub Secrets المطلوبة
- APPS_SCRIPT_URL: رابط Web App المنشور.
- API_SECRET: نفس Script Property باسم API_SECRET.
- CANVA_CLIENT_INFO_JSON: بيانات Credentials من Canva Developer Portal بصيغة JSON وتحتوي client_id وclient_secret.
- CANVA_MCP_AUTH_ARCHIVE_B64: أرشيف tar.gz بصيغة Base64 لمجلد OAuth الخاص بـ mcp-remote بعد تسجيل الدخول بحساب Canva.
- GROQ_API_KEY أو GEMINI_API_KEY: مفتاح لتأليف القصة.

## تنبيه OAuth
Canva MCP يتطلب مصادقة مستخدم OAuth. يجب حفظ جلسة mcp-remote في سر GitHub المذكور أعلاه. لا ترفع ملفات الجلسة أو مفاتيحها إلى المستودع.

العامل يرفع صورة الطفل إلى Canva، يولد 10 صور متتابعة مع مرجع الهوية، يتحقق من كل صورة، يجمعها PDF ويرفعه إلى Drive. إذا لم يُرجع Canva بيانات الصورة الفعلية بعد MEDIA ID فسيتوقف العامل برسالة خطأ بدل إنشاء PDF ناقص.

يجب تحديث Apps Script المنشور ليشير إلى المستودع الحالي والفرع الذي يحتوي workflow؛ بعد دمج هذا الفرع إلى main استخدم REPO=mstfyabrhym256-dotcom/Kotybook-Storybook-Flow وWORKFLOW=main.yml وBRANCH=main. احتفظ بكل دوال Telegram وSheets وDrive الحالية.
