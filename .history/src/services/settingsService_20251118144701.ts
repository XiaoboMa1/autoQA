import { modelRegistry, ModelDefinition } from './modelRegistry';

// LLM设置接口
export interface LLMSettings {
  selectedModelId: string;
  apiKey: string;
  customConfig?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
  };
}

// 验证结果接口
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

// 完整的设置结构
export interface AppSettings {
  llm: LLMSettings;
  system: {
    timeout: number;
    maxConcurrency: number;
    logRetentionDays: number;
  };
}

// 设置服务类
export class SettingsService {
  private static instance: SettingsService;
  private readonly STORAGE_KEY = 'testflow_settings';

  private constructor() {}

  // 单例模式
  public static getInstance(): SettingsService {
    if (!SettingsService.instance) {
      SettingsService.instance = new SettingsService();
    }
    return SettingsService.instance;
  }

  // 获取LLM设置
  public async getLLMSettings(): Promise<LLMSettings> {
    try {
      // 🔥 前端版本：通过API获取配置
      if (typeof window !== 'undefined') {
        const response = await fetch('/api/config/llm');
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data) {
            return result.data;
          }
        }
        // API失败时回退到localStorage
        console.warn('API获取配置失败，使用localStorage');
        const settings = this.loadSettings();
        return settings.llm;
      } else {
        // 🔥 后端版本：从数据库加载
        const settings = await this.loadSettingsFromDB();
        return settings.llm;
      }
    } catch (error) {
      console.warn('Failed to load LLM settings, using defaults:', error);
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

      // 🔥 前端版本：保存到localStorage + API同步
      if (typeof window !== 'undefined') {
        // 保存到localStorage
        const currentSettings = this.loadSettings();
        currentSettings.llm = llmSettings;
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(currentSettings));
        
        // 同步到后端API
        try {
          const response = await fetch('/api/config/llm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(llmSettings)
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            console.warn('API同步失败:', errorData.error);
          }
        } catch (apiError) {
          console.warn('API同步失败:', apiError);
        }
      } else {
        // 🔥 后端版本：直接保存到数据库
        const currentSettings = await this.loadSettingsFromDB();
        currentSettings.llm = llmSettings;
        await this.saveSettingsToDB(currentSettings);
      }
      
      console.log('✅ LLM settings saved successfully:', llmSettings.selectedModelId);
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

  // 重置为默认设置
  public async resetToDefaults(): Promise<void> {
    try {
      const defaultSettings = this.getDefaultSettings();
      
      // 保存到数据库
      await this.saveSettingsToDB(defaultSettings);
      
      console.log('✅ Settings reset to defaults');
    } catch (error: any) {
      console.error('❌ Failed to reset settings:', error);
      
      // 增强错误信息
      if (!error.type) {
        error.type = 'CONFIG_ERROR';
      }
      
      throw error;
    }
  }

  // 重置LLM设置为默认值
  public async resetLLMToDefaults(): Promise<LLMSettings> {
    try {
      const defaultLLMSettings = this.getDefaultLLMSettings();
      
      // 保存默认设置
      await this.saveLLMSettings(defaultLLMSettings);
      
      console.log('✅ LLM settings reset to defaults');
      return defaultLLMSettings;
    } catch (error: any) {
      console.error('❌ Failed to reset LLM settings:', error);
      throw error;
    }
  }

  // 获取完整设置
  public async getSettings(): Promise<AppSettings> {
    return await this.loadSettingsFromDB();
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

  // 备份当前设置
  public async backupSettings(): Promise<string> {
    try {
      const settings = await this.loadSettingsFromDB();
      const backupData = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        type: 'backup',
        settings: settings
      };
      return JSON.stringify(backupData, null, 2);
    } catch (error) {
      console.error('❌ Failed to backup settings:', error);
      throw new Error('备份设置失败');
    }
  }

  // 从备份恢复设置
  public async restoreFromBackup(backupData: string): Promise<void> {
    try {
      await this.importSettings(backupData);
      console.log('✅ Settings restored from backup');
    } catch (error) {
      console.error('❌ Failed to restore from backup:', error);
      throw error;
    }
  }

  // 私有方法：加载设置
  private loadSettings(): AppSettings {
    try {
      // 检查是否在浏览器环境
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem(this.STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          // 合并默认设置以确保完整性
          return this.mergeWithDefaults(parsed);
        }
      }
    } catch (error) {
      console.warn('Failed to parse stored settings:', error);
    }
    
    return this.getDefaultSettings();
  }

  // 私有方法：获取默认LLM设置
  private getDefaultLLMSettings(): LLMSettings {
    const defaultModel = modelRegistry.getDefaultModel();
    return {
      selectedModelId: defaultModel.id,
      apiKey: '', // API密钥应从环境变量或数据库获取
      customConfig: {
        ...defaultModel.defaultConfig
      }
    };
  }

  // 私有方法：获取默认设置
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

  // 私有方法：合并默认设置
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

  // 🔥 新增：从数据库加载设置
  private async loadSettingsFromDB(): Promise<AppSettings> {
    // 🔥 前端版本：通过API获取
    if (typeof window !== 'undefined') {
      try {
        const response = await fetch('/api/config/all');
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data) {
            return this.mergeWithDefaults(result.data);
          }
        }
      } catch (error) {
        console.warn('Failed to load settings from API:', error);
      }
      // API失败时回退到localStorage
      return this.loadSettings();
    }

    // 🔥 后端版本：需要在后端服务中实现
    throw new Error('loadSettingsFromDB should only be called from backend');
  }

  // 🔥 新增：保存设置到数据库
  private async saveSettingsToDB(settings: AppSettings): Promise<void> {
    // 🔥 前端版本：通过API保存
    if (typeof window !== 'undefined') {
      try {
        const response = await fetch('/api/config/all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings)
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'API保存失败');
        }
        
        console.log('✅ Settings saved via API successfully');
      } catch (error) {
        console.error('❌ Failed to save settings via API:', error);
        throw new Error(`API保存失败: ${error}`);
      }
    } else {
      // 🔥 后端版本：需要在后端服务中实现
      throw new Error('saveSettingsToDB should only be called from backend');
    }
  }
}

// 导出单例实例
export const settingsService = SettingsService.getInstance();