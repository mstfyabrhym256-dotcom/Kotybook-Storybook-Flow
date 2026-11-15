// Run once to sign in to Google Flow and save the browser session.
'use strict';

const { chromium } = require('playwright');
const path = require('path');
const readline = require('readline');

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled']
  });
  const context = await browser.newContext({
    viewport: { width: 1365, height: 900 },
    locale: 'en-GB'
  });
  const page = await context.newPage();

  try {
    await page.goto('https://flow.google.com/', { waitUntil: 'domcontentloaded' });
    console.log('\nافتح حساب Google وسجّل الدخول إلى Flow في نافذة المتصفح.');
    console.log('بعد ما تتأكد إن صفحة Flow فتحت بشكل طبيعي، ارجع للترمينال واضغط Enter.\n');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await new Promise(resolve => rl.question('اضغط Enter لحفظ جلسة الدخول... ', resolve));
    rl.close();

    const destination = path.join(__dirname, 'auth.json');
    await context.storageState({ path: destination });
    console.log(`\nتم حفظ جلسة Google Flow في: ${destination}`);
    console.log('احتفظ بالملف على جهازك ولا ترفعه إلى GitHub أو تشاركه مع أي شخص.');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error('تعذر تسجيل الدخول إلى Flow:', error);
  process.exit(1);
});
