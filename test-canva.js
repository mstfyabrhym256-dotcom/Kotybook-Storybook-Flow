
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const userDataDir = path.join(__dirname, 'canva-chrome-profile');

  console.log('Opening Google Chrome for Canva...');

  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: false,
    viewport: { width: 1440, height: 900 },
    args: ['--start-maximized'],
    timeout: 60000
  });

  const page = context.pages()[0] || await context.newPage();

  await page.goto('https://www.canva.com/ar_eg/', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });

  console.log('Canva is open.');
  console.log('Log in to your Canva account if asked.');
  console.log('Keep this browser window open.');

  await page.waitForTimeout(600000);

  await context.close();
})();
