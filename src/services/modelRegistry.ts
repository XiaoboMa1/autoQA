// 模型定义接口
export interface ModelDefinition {
  id: string;
  name: string;
  provider: string;
  openRouterModel: string;
  customBaseUrl?: string;        // 自定义 API 端点（用于本地或自托管服务）
  requiresCustomAuth?: boolean;  // 是否需要自定义认证格式（非 OpenRouter 标准）
  defaultConfig: {
    temperature: number;
    maxTokens: number;
    topP?: number;
  };
  capabilities: string[];
  description: string;
  costLevel: 'low' | 'medium' | 'high';
}

// 模型注册表类
export class ModelRegistry {
  private static instance: ModelRegistry;
  private models: ModelDefinition[];

  private constructor() {
    this.models = [
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        provider: 'OpenAI',
        openRouterModel: 'openai/gpt-4o',
        defaultConfig: {
          temperature: 0.3,
          maxTokens: 1500
        },
        capabilities: ['text-generation', 'multimodal', 'reasoning', 'code-analysis'],
        description: 'OpenAI GPT-4o模型，支持文本和图像理解',
        costLevel: 'high'
      },
      {
        id: 'deepseek-chat-v3',
        name: 'DeepSeek Chat V3',
        provider: 'DeepSeek',
        openRouterModel: 'deepseek/deepseek-chat-v3-0324',
        defaultConfig: {
          temperature: 0.2,
          maxTokens: 2000
        },
        capabilities: ['text-generation', 'reasoning', 'code-analysis', 'chinese-friendly'],
        description: 'DeepSeek聊天模型，高性价比，中文友好',
        costLevel: 'low'
      },
      {
        id: 'claude-sonnet-4.5',
        name: 'Claude Sonnet 4.5',
        provider: 'Anthropic',
        openRouterModel: 'anthropic/claude-sonnet-4.5',
        defaultConfig: {
          temperature: 0.3,
          maxTokens: 2000
        },
        capabilities: ['text-generation', 'multimodal', 'reasoning', 'code-analysis', 'long-context'],
        description: 'Anthropic Claude Sonnet 4.5模型，平衡性能与成本，支持长上下文',
        costLevel: 'medium'
      },
      {
        id: 'gemini-2.5-flash-local',
        name: 'Gemini 2.5 Flash (Local)',
        provider: 'Google (Local)',
        openRouterModel: 'gemini-2.5-flash',
        customBaseUrl: 'http://localhost:3000/v1',
        requiresCustomAuth: true,
        defaultConfig: {
          temperature: 0.3,
          maxTokens: 2000
        },
        capabilities: ['text-generation', 'multimodal', 'reasoning', 'code-analysis', 'image-understanding', 'audio-understanding'],
        description: '本地部署的 Gemini 2.5 Flash 模型，支持文本、图片、音频多模态输入',
        costLevel: 'low'
      }
    ];
  }

  // 单例模式
  public static getInstance(): ModelRegistry {
    if (!ModelRegistry.instance) {
      ModelRegistry.instance = new ModelRegistry();
    }
    return ModelRegistry.instance;
  }

  // 获取所有可用模型
  public getAvailableModels(): ModelDefinition[] {
    return [...this.models];
  }

  // 根据ID获取模型
  public getModelById(id: string): ModelDefinition | null {
    return this.models.find(model => model.id === id) || null;
  }

  // 获取默认模型（GPT-4o）
  public getDefaultModel(): ModelDefinition {
    return this.models[0]; // GPT-4o作为默认模型
  }

  // 验证模型ID是否有效
  public isValidModelId(id: string): boolean {
    return this.models.some(model => model.id === id);
  }

  // 获取模型的OpenRouter标识符
  public getOpenRouterModel(id: string): string | null {
    const model = this.getModelById(id);
    return model ? model.openRouterModel : null;
  }

  // 获取模型的默认配置
  public getDefaultConfig(id: string): ModelDefinition['defaultConfig'] | null {
    const model = this.getModelById(id);
    return model ? { ...model.defaultConfig } : null;
  }
}

// 导出单例实例
export const modelRegistry = ModelRegistry.getInstance();