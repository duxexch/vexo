const { chromium } = require('playwright');

(async () => {
  const url = 'http://localhost:3001/challenge/d0869e79-e6bc-4b78-9184-bad795a65f90/play';
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const quickRegister = page.locator('button:has-text("Register in One Click")').first();
  if (await quickRegister.count()) {
    await quickRegister.click();
    await page.waitForTimeout(2500);
  }

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'screenshot-game-auth-desktop.png', fullPage: true });

  const state = await context.storageState();
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    storageState: state,
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(url, { waitUntil: 'domcontentloaded' });
  await mobilePage.waitForTimeout(2500);
  await mobilePage.screenshot({ path: 'screenshot-game-auth-mobile.png', fullPage: true });

  await mobileContext.close();
  await context.close();
  await browser.close();
  console.log('ok');
})();
