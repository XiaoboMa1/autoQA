import { PrismaClient } from '../../src/generated/prisma/index.js';
import { DatabaseService } from './databaseService.js';
import { modelRegistry } from '../../src/services/modelRegistry.js';
import type { LLMSettings, AppSettings, ValidationResult, ValidationError } from '../../src/services/settingsService.js';

// 后端设置服务类
export class BackendSettingsService {
  private static instance: BackendSettingsService;
  private databaseService: DatabaseService;
  private prisma: PrismaClient; // 保持兼容性，内部使用

  private constructor(databaseService?: DatabaseService) {
    // 🔥 使用依赖注入的数据库服务
    this.databaseService = databaseService || DatabaseService.getInstance();
    this.prisma = this.databaseService.getClient();

    console.log(`🗄️ BackendSettingsService已连接到数据库服务`);
  }

  // 单例模式（支持依赖注入）
  public static getInstance(databaseService?: DatabaseService): BackendSettingsService {
    if (!BackendSettingsService.instance) {
      BackendSettingsService.instance = new BackendSettingsService(databaseService);
    }
    return BackendSettingsService.instance;
  }

  // 🔥 新增：重置单例实例（主要用于测试）
  public static resetInstance(): void {
    BackendSettingsService.instance = null;
  }

  // 获取LLM设置
  public async getLLMSettings(): Promise<LLMSettings> {
    try {
      const settings = await this.loadSettingsFromDB();
      return settings.llm;
    } catch (error) {
      console.warn('Failed to load LLM settings from database, using defaults:', error);
      return this.getDefaultLLMSettings();
    }
  }

  // 保存LLM设置
  public async saveLLMSettings(llmSettings: LLMSettings): Promise<void> {
    try {
      // 验证设置
      const validation = await this.validateLLMSettings(llmSettings);
      if (!validation.isValid) {
        const errorMessages = validation.errors.map(e => e.message).join(', ');
        const error = new Error(`配置验证失败: ${errorMessages}`);
        (error as any).validationErrors = validation.errors;
        throw error;
      }

      // 加载现有设置
      const currentSettings = await this.loadSettingsFromDB();
      
      // 更新LLM设置
      currentSettings.llm = llmSettings;
      
      // 保存到数据库
      await this.saveSettingsToDB(currentSettings);
      
      console.log('✅ LLM settings saved successfully to database:', llmSettings.selectedModelId);
    } catch (error: any) {
      console.error('❌ Failed to save LLM settings:', error);
      
      // 增强错误信息
      if (!error.type) {
        error.type = 'CONFIG_ERROR';
      }
      
      throw error;
    }
  }

  // 验证LLM设置
  public async validateLLMSettings(settings: LLMSettings): Promise<ValidationResult> {
    const errors: ValidationError[] = [];

    // 验证模型ID
    if (!settings.selectedModelId) {
      errors.push({
        field: 'selectedModelId',
        message: '请选择一个模型',
        code: 'REQUIRED'
      });
    } else if (!modelRegistry.isValidModelId(settings.selectedModelId)) {
      errors.push({
        field: 'selectedModelId',
        message: '选择的模型无效',
        code: 'INVALID_MODEL'
      });
    }

    // 验证API密钥
    if (!settings.apiKey || settings.apiKey.trim() === '') {
      errors.push({
        field: 'apiKey',
        message: 'API密钥不能为空',
        code: 'REQUIRED'
      });
    } else {
      const model = modelRegistry.getModelById(settings.selectedModelId);
      // 只对标准 OpenRouter 模型进行 sk- 格式验证
      if (!model?.requiresCustomAuth && !settings.apiKey.startsWith('sk-')) {
        errors.push({
          field: 'apiKey',
          message: 'OpenRouter API密钥必须以 sk- 开头',
          code: 'INVALID_FORMAT'
        });
      }
    }

    // 验证自定义配置
    if (settings.customConfig) {
      const { temperature, maxTokens, topP } = settings.customConfig;

      if (temperature !== undefined) {
        if (temperature < 0 || temperature > 2) {
          errors.push({
            field: 'temperature',
            message: 'Temperature必须在0-2之间',
            code: 'OUT_OF_RANGE'
          });
        }
      }

      if (maxTokens !== undefined) {
        if (maxTokens < 1 || maxTokens > 8000) {
          errors.push({
            field: 'maxTokens',
            message: 'Max Tokens必须在1-8000之间',
            code: 'OUT_OF_RANGE'
          });
        }
      }

      if (topP !== undefined) {
        if (topP < 0 || topP > 1) {
          errors.push({
            field: 'topP',
            message: 'Top P必须在0-1之间',
            code: 'OUT_OF_RANGE'
          });
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // 获取完整设置
  public async getSettings(): Promise<AppSettings> {
    return await this.loadSettingsFromDB();
  }

  // 重置为默认设置
  public async resetToDefaults(): Promise<void> {
    try {
      const defaultSettings = this.getDefaultSettings();
      await this.saveSettingsToDB(defaultSettings);
      console.log('✅ Settings reset to defaults');
    } catch (error: any) {
      console.error('❌ Failed to reset settings:', error);
      throw error;
    }
  }

  // 导出设置为JSON
  public async exportSettings(): Promise<string> {
    try {
      const settings = await this.loadSettingsFromDB();
      const exportData = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        settings: settings
      };
      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('❌ Failed to export settings:', error);
      throw new Error('导出设置失败');
    }
  }

  // 从JSON导入设置
  public async importSettings(jsonData: string): Promise<void> {
    try {
      const importData = JSON.parse(jsonData);
      
      // 验证导入数据格式
      if (!importData.settings || !importData.version) {
        throw new Error('导入数据格式无效');
      }
      
      // 验证版本兼容性
      if (importData.version !== '1.0') {
        throw new Error(`不支持的配置版本: ${importData.version}`);
      }
      
      // 验证LLM设置
      if (importData.settings.llm) {
        const validation = await this.validateLLMSettings(importData.settings.llm);
        if (!validation.isValid) {
          const errorMessages = validation.errors.map(e => e.message).join(', ');
          throw new Error(`导入的LLM配置无效: ${errorMessages}`);
        }
      }
      
      // 合并设置
      const mergedSettings = this.mergeWithDefaults(importData.settings);
      
      // 保存到数据库
      await this.saveSettingsToDB(mergedSettings);
      
      console.log('✅ Settings imported successfully');
    } catch (error: any) {
      console.error('❌ Failed to import settings:', error);
      
      if (error.name === 'SyntaxError') {
        throw new Error('导入数据格式错误，请检查JSON格式');
      }
      
      throw error;
    }
  }

  // 从数据库加载设置
  private async loadSettingsFromDB(): Promise<AppSettings> {
    try {
      const settingsRecord = await this.prisma.settings.findUnique({
        where: { key: 'app_settings' }
      });

      if (settingsRecord && settingsRecord.value) {
        const parsed = JSON.parse(settingsRecord.value);
        return this.mergeWithDefaults(parsed);
      }
    } catch (error) {
      console.warn('Failed to load settings from database:', error);
    }

    return this.getDefaultSettings();
  }

  // 保存设置到数据库
  private async saveSettingsToDB(settings: AppSettings): Promise<void> {
    try {
      await this.prisma.settings.upsert({
        where: { key: 'app_settings' },
        update: {
          value: JSON.stringify(settings),
          updated_at: new Date()
        },
        create: {
          key: 'app_settings',
          value: JSON.stringify(settings),
          updated_at: new Date()
        }
      });

      console.log('✅ Settings saved to database successfully');
    } catch (error) {
      console.error('❌ Failed to save settings to database:', error);
      throw new Error(`数据库保存失败: ${error}`);
    }
  }

  // 获取默认LLM设置
  private getDefaultLLMSettings(): LLMSettings {
    const defaultModel = modelRegistry.getModelById('deepseek-chat-v3') || modelRegistry.getDefaultModel();
    return {
      selectedModelId: 'deepseek-chat-v3',
      apiKey: process.env.OPENROUTER_API_KEY || '',
      customConfig: {
        ...defaultModel.defaultConfig
      }
    };
  }

  // 获取默认设置
  private getDefaultSettings(): AppSettings {
    return {
      llm: this.getDefaultLLMSettings(),
      system: {
        timeout: 300,
        maxConcurrency: 10,
        logRetentionDays: 90
      }
    };
  }

  // 合并默认设置
  private mergeWithDefaults(stored: Partial<AppSettings>): AppSettings {
    const defaults = this.getDefaultSettings();
    
    return {
      llm: {
        ...defaults.llm,
        ...stored.llm
      },
      system: {
        ...defaults.system,
        ...stored.system
      }
    };
  }

  // 清理资源
  public async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

// 导出单例实例
export const backendSettingsService = BackendSettingsService.getInstance();