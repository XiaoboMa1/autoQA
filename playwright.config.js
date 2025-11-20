import { defineConfig, devices } from '@playwright/test';
import path from 'path';

export default defineConfig({
  // 添加全局设置文件
  globalSetup: './global-setup.js',
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
    headless: false,
    // viewport 设置已删除，浏览器将使用默认全屏大小
    launchOptions: {
      args: ['--start-maximized'] // 添加启动参数，让浏览器窗口最大化
    },
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        viewport: null, // 覆盖预设的 viewport，使用全屏模式
        launchOptions: {
          args: ['--start-maximized'] // Chromium 浏览器最大化参数
        }
      },
    },
    {
      name: 'firefox',
      use: { 
        ...devices['Desktop Firefox'],
        viewport: null, // 覆盖预设的 viewport，使用全屏模式
        launchOptions: {
          args: ['-kiosk'] // Firefox 浏览器全屏参数
        }
      },
    },
    {
      name: 'webkit',
      use: { 
        ...devices['Desktop Safari'],
        viewport: null, // 覆盖预设的 viewport，使用全屏模式
        launchOptions: {
          args: ['--kiosk'] // WebKit 浏览器全屏参数
        }
      },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});