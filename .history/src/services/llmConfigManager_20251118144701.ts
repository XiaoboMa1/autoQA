import { modelRegistry, ModelDefinition } from './modelRegistry';
import { settingsService, LLMSettings } from './settingsService';
import { LLMConfig } from '../../server/services/aiParser';

// 配置变更事件类型
export type ConfigChangeEvent = {
  type: 'model_changed' | 'config_updated' | 'connection_tested';
  oldConfig?: LLMConfig;
  newConfig: LLMConfig;
  modelInfo: ModelDefinition;
  timestamp: Date;
};

// 配置变更监听器类型
export type ConfigChangeListener = (event: ConfigChangeEvent) => void;

// 连接测试结果
export interface ConnectionTestResult {
  success: boolean;
  responseTime?: number;
  error?: string;
  modelInfo: ModelDefinition;
  timestamp: Date;
}

// LLM配置管理器
export class LLMConfigManager {
  private static instance: LLMConfigManager;
  private currentConfig: LLMConfig | null = null;
  private currentModelInfo: ModelDefinition | null = null;
  private listeners: ConfigChangeListener[] = [];
  private isInitialized = false;

  private constructor() {}

  // 单例模式
  public static getInstance(): LLMConfigManager {
    if (!LLMConfigManager.instance) {
      LLMConfigManager.instance = new LLMConfigManager();
    }
    return LLMConfigManager.instance;
  }

  // 初始化配置管理器
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('🔧 初始化LLM配置管理器...');
      
      // 🔥 修复：根据环境选择不同的设置服务
      let settings;
      if (typeof window !== 'undefined') {
        // 前端环境：使用前端设置服务
        settings = await settingsService.getLLMSettings();
      } else {
        // 后端环境：使用后端设置服务
        const { backendSettingsService } = await import('../../server/services/settingsService.ts');
        settings = await backendSettingsService.getLLMSettings();
      }
      
      await this.updateConfig(settings);
      
      this.isInitialized = true;
      console.log('✅ LLM配置管理器初始化完成');
    } catch (error) {
      console.error('❌ LLM配置管理器初始化失败:', error);
      throw error;
    }
  }

  // 获取当前配置
  public getCurrentConfig(): LLMConfig {
    if (!this.currentConfig) {
      throw new Error('配置管理器未初始化，请先调用 initialize()');
    }
    return { ...this.currentConfig };
  }

  // 获取当前模型信息
  public getModelInfo(): ModelDefinition {
    if (!this.currentModelInfo) {
      throw new Error('配置管理器未初始化，请先调用 initialize()');
    }
    return { ...this.currentModelInfo };
  }

  // 更新配置
  public async updateConfig(settings: LLMSettings): Promise<void> {
    try {
      console.log(`🔄 更新LLM配置: ${settings.selectedModelId}`);
      
      // 验证设置
      const validation = await settingsService.validateLLMSettings(settings);
      if (!validation.isValid) {
        throw new Error(`配置验证失败: ${validation.errors.map(e => e.message).join(', ')}`);
      }

      // 获取模型信息
      const modelInfo = modelRegistry.getModelById(settings.selectedModelId);
      if (!modelInfo) {
        throw new Error(`未找到模型: ${settings.selectedModelId}`);
      }

      // 构建新配置
      const oldConfig = this.currentConfig;
      const newConfig: LLMConfig = {
        apiKey: settings.apiKey,
        baseUrl: modelInfo.customBaseUrl || 'https://openrouter.ai/api/v1',
        model: modelInfo.openRouterModel,
        temperature: settings.customConfig?.temperature ?? modelInfo.defaultConfig.temperature,
        maxTokens: settings.customConfig?.maxTokens ?? modelInfo.defaultConfig.maxTokens
      };

      // 更新当前配置
      this.currentConfig = newConfig;
      this.currentModelInfo = modelInfo;

      // 触发配置变更事件
      const eventType = oldConfig?.model !== newConfig.model ? 'model_changed' : 'config_updated';
      this.notifyListeners({
        type: eventType,
        oldConfig: oldConfig || undefined,
        newConfig,
        modelInfo,
        timestamp: new Date()
      });

      console.log(`✅ LLM配置更新成功: ${modelInfo.name}`);
      console.log(`   API端点: ${newConfig.baseUrl}`);
      console.log(`   模型: ${newConfig.model}`);
      console.log(`   温度: ${newConfig.temperature}`);
      console.log(`   最大令牌: ${newConfig.maxTokens}`);
      
    } catch (error) {
      console.error('❌ 更新LLM配置失败:', error);
      throw error;
    }
  }

  // 测试OpenRouter API连接
  public async testConnection(): Promise<ConnectionTestResult> {
    if (!this.currentConfig || !this.currentModelInfo) {
      throw new Error('配置管理器未初始化');
    }

    const startTime = Date.now();
    const timestamp = new Date();

    try {
      console.log(`🧪 测试连接: ${this.currentModelInfo.name}`);

      // 构建测试请求
      const testPrompt = "Hello, this is a connection test. Please respond with 'OK'.";
      const requestBody = {
        model: this.currentConfig.model,
        messages: [
          {
            role: 'user',
            content: testPrompt
          }
        ],
        temperature: 0.1,
        max_tokens: 10
      };

      // 构建请求头，本地/自定义 API 使用简化头
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${this.currentConfig.apiKey}`,
        'Content-Type': 'application/json'
      };

      // 只对 OpenRouter API 添加额外的识别头
      if (!this.currentModelInfo.customBaseUrl) {
        headers['HTTP-Referer'] = 'https://testflow-ai.com';
        headers['X-Title'] = 'TestFlow AI Testing Platform';
      }

      // 发送测试请求
      const response = await fetch(this.currentConfig.baseUrl + '/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `API调用失败 (${response.status})`;
        
        // 增强错误信息
        if (response.status === 401) {
          errorMessage = 'API密钥无效或已过期';
        } else if (response.status === 429) {
          errorMessage = 'API调用频率超限，请稍后重试';
        } else if (response.status === 500) {
          errorMessage = '服务器内部错误，请稍后重试';
        } else if (response.status === 403) {
          errorMessage = '访问被拒绝，请检查API密钥权限';
        } else {
          errorMessage += `: ${errorText}`;
        }
        
        const error = new Error(errorMessage);
        (error as any).status = response.status;
        (error as any).type = 'API_ERROR';
        throw error;
      }

      const data = await response.json();
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        const error = new Error('API返回格式异常，请检查模型配置');
        (error as any).type = 'API_ERROR';
        (error as any).details = data;
        throw error;
      }

      // 触发连接测试事件
      this.notifyListeners({
        type: 'connection_tested',
        newConfig: this.currentConfig,
        modelInfo: this.currentModelInfo,
        timestamp
      });

      const result: ConnectionTestResult = {
        success: true,
        responseTime,
        modelInfo: this.currentModelInfo,
        timestamp
      };

      console.log(`✅ 连接测试成功: ${this.currentModelInfo.name} (${responseTime}ms)`);
      return result;

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      // 增强错误处理
      let enhancedError = error.message;
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        enhancedError = '网络连接失败，请检查网络设置';
        (error as any).type = 'NETWORK_ERROR';
      }
      
      const result: ConnectionTestResult = {
        success: false,
        responseTime,
        error: enhancedError,
        modelInfo: this.currentModelInfo,
        timestamp
      };

      console.error(`❌ 连接测试失败: ${this.currentModelInfo.name} - ${enhancedError}`);
      return result;
    }
  }

  // 重新加载配置（从存储中）
  public async reloadConfig(): Promise<void> {
    try {
      console.log('🔄 重新加载LLM配置...');
      
      // 🔥 修复：根据环境选择不同的设置服务
      let settings;
      if (typeof window !== 'undefined') {
        // 前端环境：使用前端设置服务
        settings = await settingsService.getLLMSettings();
      } else {
        // 后端环境：使用后端设置服务
        const { backendSettingsService } = await import('../../server/services/settingsService.ts');
        settings = await backendSettingsService.getLLMSettings();
      }
      
      await this.updateConfig(settings);
      console.log('✅ LLM配置重新加载完成');
    } catch (error) {
      console.error('❌ 重新加载LLM配置失败:', error);
      throw error;
    }
  }

  // 保存当前配置到存储
  public async saveCurrentConfig(): Promise<void> {
    if (!this.currentConfig || !this.currentModelInfo) {
      throw new Error('没有可保存的配置');
    }

    try {
      const settings: LLMSettings = {
        selectedModelId: this.currentModelInfo.id,
        apiKey: this.currentConfig.apiKey,
        customConfig: {
          temperature: this.currentConfig.temperature,
          maxTokens: this.currentConfig.maxTokens
        }
      };

      await settingsService.saveLLMSettings(settings);
      console.log('✅ 当前配置已保存到存储');
    } catch (error) {
      console.error('❌ 保存配置失败:', error);
      throw error;
    }
  }

  // 添加配置变更监听器
  public addConfigChangeListener(listener: ConfigChangeListener): void {
    this.listeners.push(listener);
  }

  // 移除配置变更监听器
  public removeConfigChangeListener(listener: ConfigChangeListener): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  // 获取配置摘要信息
  public getConfigSummary(): {
    modelName: string;
    modelId: string;
    provider: string;
    temperature: number;
    maxTokens: number;
    costLevel: string;
    capabilities: string[];
    isInitialized: boolean;
  } {
    if (!this.currentConfig || !this.currentModelInfo) {
      return {
        modelName: '未初始化',
        modelId: '',
        provider: '',
        temperature: 0,
        maxTokens: 0,
        costLevel: '',
        capabilities: [],
        isInitialized: false
      };
    }

    return {
      modelName: this.currentModelInfo.name,
      modelId: this.currentModelInfo.id,
      provider: this.currentModelInfo.provider,
      temperature: this.currentConfig.temperature,
      maxTokens: this.currentConfig.maxTokens,
      costLevel: this.currentModelInfo.costLevel,
      capabilities: [...this.currentModelInfo.capabilities],
      isInitialized: this.isInitialized
    };
  }

  // 检查是否已初始化
  public isReady(): boolean {
    return this.isInitialized && this.currentConfig !== null && this.currentModelInfo !== null;
  }

  // 私有方法：通知监听器
  private notifyListeners(event: ConfigChangeEvent): void {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('配置变更监听器执行失败:', error);
      }
    });
  }

  // 重置配置管理器（主要用于测试）
  public reset(): void {
    this.currentConfig = null;
    this.currentModelInfo = null;
    this.listeners = [];
    this.isInitialized = false;
  }
}

// 导出单例实例
export const llmConfigManager = LLMConfigManager.getInstance();