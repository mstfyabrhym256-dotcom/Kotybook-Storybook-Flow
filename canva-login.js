const { chromium } = require('playwright');

(async () => {
  const context = await chromium.launchPersistentContext(
    'C:\\Kotybook-Canva-Session',
    {
      headless: false,
      channel: 'chrome',
      viewport: null
    }
  );

  const page = context.pages()[0] || await context.newPage();

  await page.goto('https://www.canva.com/login', {
    waitUntil: 'domcontentloaded'
  });

  console.log('سجّل دخولك إلى Canva، وبعدها اقفل المتصفح بشكل طبيعي لحفظ الجلسة.');

})();