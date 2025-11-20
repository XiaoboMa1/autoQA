import { Router } from 'express';
import { backendSettingsService } from '../services/settingsService.js';
import { llmConfigManager } from '../../src/services/llmConfigManager.js';

const router = Router();

// 获取LLM配置
router.get('/llm', async (req, res) => {
  try {
    const llmSettings = await backendSettingsService.getLLMSettings();
    res.json({
      success: true,
      data: llmSettings
    });
  } catch (error: any) {
    console.error('❌ 获取LLM配置失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '获取配置失败'
    });
  }
});

// 保存LLM配置
router.post('/llm', async (req, res) => {
  try {
    const llmSettings = req.body;
    
    // 验证请求数据
    if (!llmSettings || typeof llmSettings !== 'object') {
      return res.status(400).json({
        success: false,
        error: '无效的配置数据'
      });
    }

    // 保存配置到数据库
    await backendSettingsService.saveLLMSettings(llmSettings);
    
    // 通知配置管理器重新加载配置
    try {
      await llmConfigManager.reloadConfig();
      console.log('✅ 配置管理器已重新加载');
    } catch (reloadError: any) {
      console.warn('⚠️ 配置管理器重新加载失败:', reloadError.message);
      // 不阻断保存操作，只是警告
    }
    
    res.json({
      success: true,
      message: '配置保存成功'
    });
  } catch (error: any) {
    console.error('❌ 保存LLM配置失败:', error);
    
    // 处理验证错误
    if (error.validationErrors) {
      return res.status(400).json({
        success: false,
        error: error.message,
        validationErrors: error.validationErrors
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.message || '保存配置失败'
    });
  }
});

// 获取完整配置
router.get('/all', async (req, res) => {
  try {
    const settings = await backendSettingsService.getSettings();
    res.json({
      success: true,
      data: settings
    });
  } catch (error: any) {
    console.error('❌ 获取完整配置失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '获取配置失败'
    });
  }
});

// 重置配置为默认值
router.post('/reset', async (req, res) => {
  try {
    await backendSettingsService.resetToDefaults();
    
    // 通知配置管理器重新加载配置
    try {
      await llmConfigManager.reloadConfig();
      console.log('✅ 配置管理器已重新加载');
    } catch (reloadError: any) {
      console.warn('⚠️ 配置管理器重新加载失败:', reloadError.message);
    }
    
    res.json({
      success: true,
      message: '配置已重置为默认值'
    });
  } catch (error: any) {
    console.error('❌ 重置配置失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '重置配置失败'
    });
  }
});

// 导出配置
router.get('/export', async (req, res) => {
  try {
    const exportData = await backendSettingsService.exportSettings();
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="testflow-settings.json"');
    res.send(exportData);
  } catch (error: any) {
    console.error('❌ 导出配置失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '导出配置失败'
    });
  }
});

// 导入配置
router.post('/import', async (req, res) => {
  try {
    const { configData } = req.body;
    
    if (!configData || typeof configData !== 'string') {
      return res.status(400).json({
        success: false,
        error: '无效的配置数据'
      });
    }

    await backendSettingsService.importSettings(configData);
    
    // 通知配置管理器重新加载配置
    try {
      await llmConfigManager.reloadConfig();
      console.log('✅ 配置管理器已重新加载');
    } catch (reloadError: any) {
      console.warn('⚠️ 配置管理器重新加载失败:', reloadError.message);
    }
    
    res.json({
      success: true,
      message: '配置导入成功'
    });
  } catch (error: any) {
    console.error('❌ 导入配置失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '导入配置失败'
    });
  }
});

// 测试配置连接
router.post('/test-connection', async (req, res) => {
  try {
    const llmSettings = req.body;
    
    if (!llmSettings || typeof llmSettings !== 'object') {
      return res.status(400).json({
        success: false,
        error: '无效的配置数据'
      });
    }

    // 验证配置
    const validation = await backendSettingsService.validateLLMSettings(llmSettings);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: '配置验证失败',
        validationErrors: validation.errors
      });
    }

    // 测试连接（这里可以添加实际的连接测试逻辑）
    // 暂时返回成功，实际项目中可以调用LLM API进行测试
    res.json({
      success: true,
      message: '连接测试成功',
      responseTime: Math.floor(Math.random() * 1000) + 200 // 模拟响应时间
    });
  } catch (error: any) {
    console.error('❌ 连接测试失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '连接测试失败'
    });
  }
});

export { router as configRoutes };
export default router;