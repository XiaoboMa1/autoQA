// @ts-check
const { chromium } = require('@playwright/test');

/**
 * 全局设置：配置浏览器以全屏模式启动
 * @type {import('@playwright/test').PlaywrightTestConfig['globalSetup']}
 */
module.exports = async () => {
  // 启动浏览器，使用多种全屏参数
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--start-maximized',
      '--kiosk',
      '--no-sandbox',
      '--disable-infobars',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--disable-notifications'
    ]
  });

  // 创建上下文，设置 viewport 为 null
  const context = await browser.newContext({
    viewport: null
  });
  
  // 创建页面并尝试全屏
  const page = await context.newPage();
  await page.evaluate(() => {
    // 尝试使用 JavaScript 设置全屏
    window.moveTo(0, 0);
    window.resizeTo(screen.width, screen.height);
    
    // 尝试使用全屏 API
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen();
    }
  });
  
  // 关闭浏览器
  await browser.close();
};