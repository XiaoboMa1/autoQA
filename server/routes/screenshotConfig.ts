import express from 'express';
import { screenshotConfig } from '../../src/utils/screenshotConfig.js';

const router = express.Router();

// 获取当前截图配置
router.get('/api/screenshot-config', async (req, res) => {
  try {
    const config = screenshotConfig.getConfig();
    res.json({
      success: true,
      config
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 更新截图配置
router.post('/api/screenshot-config', async (req, res) => {
  try {
    const updates = req.body;
    screenshotConfig.updateConfig(updates);
    
    res.json({
      success: true,
      message: '截图配置已更新',
      config: screenshotConfig.getConfig()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 重置为默认配置
router.post('/api/screenshot-config/reset', async (req, res) => {
  try {
    const defaultConfig = {
      screenshotsDirectory: 'screenshots',
      enableFileVerification: true,
      enableAutoCleanup: true,
      retentionDays: 30,
      enableBackup: true,
      backupDirectory: 'screenshots/backup',
      logLevel: 'info'
    };
    
    screenshotConfig.updateConfig(defaultConfig);
    
    res.json({
      success: true,
      message: '截图配置已重置为默认值',
      config: screenshotConfig.getConfig()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 验证配置
router.get('/api/screenshot-config/validate', async (req, res) => {
  try {
    const config = screenshotConfig.getConfig();
    
    // 检查目录是否存在或可创建
    try {
      screenshotConfig.ensureScreenshotsDirectory();
    } catch (error) {
      return res.json({
        success: false,
        error: `截图目录创建失败: ${error.message}`,
        config
      });
    }
    
    res.json({
      success: true,
      message: '截图配置验证通过',
      config
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export { router as screenshotConfigRouter };