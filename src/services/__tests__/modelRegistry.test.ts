import { ModelRegistry, modelRegistry } from '../modelRegistry';

describe('ModelRegistry', () => {
  let registry: ModelRegistry;

  beforeEach(() => {
    registry = ModelRegistry.getInstance();
  });

  describe('getInstance', () => {
    it('should return the same instance (singleton)', () => {
      const instance1 = ModelRegistry.getInstance();
      const instance2 = ModelRegistry.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should be the same as exported instance', () => {
      expect(registry).toBe(modelRegistry);
    });
  });

  describe('getAvailableModels', () => {
    it('should return exactly 2 models', () => {
      const models = registry.getAvailableModels();
      expect(models).toHaveLength(2);
    });

    it('should include GPT-4o and DeepSeek models', () => {
      const models = registry.getAvailableModels();
      const modelIds = models.map(m => m.id);
      expect(modelIds).toContain('gpt-4o');
      expect(modelIds).toContain('deepseek-chat-v3');
    });

    it('should return a copy of models array', () => {
      const models1 = registry.getAvailableModels();
      const models2 = registry.getAvailableModels();
      expect(models1).not.toBe(models2);
      expect(models1).toEqual(models2);
    });
  });

  describe('getModelById', () => {
    it('should return GPT-4o model by id', () => {
      const model = registry.getModelById('gpt-4o');
      expect(model).not.toBeNull();
      expect(model?.name).toBe('GPT-4o');
      expect(model?.provider).toBe('OpenAI');
      expect(model?.openRouterModel).toBe('openai/gpt-4o');
    });

    it('should return DeepSeek model by id', () => {
      const model = registry.getModelById('deepseek-chat-v3');
      expect(model).not.toBeNull();
      expect(model?.name).toBe('DeepSeek Chat V3');
      expect(model?.provider).toBe('DeepSeek');
      expect(model?.openRouterModel).toBe('deepseek/deepseek-chat-v3-0324');
    });

    it('should return null for invalid id', () => {
      const model = registry.getModelById('invalid-model');
      expect(model).toBeNull();
    });
  });

  describe('getDefaultModel', () => {
    it('should return GPT-4o as default model', () => {
      const defaultModel = registry.getDefaultModel();
      expect(defaultModel.id).toBe('gpt-4o');
      expect(defaultModel.name).toBe('GPT-4o');
    });
  });

  describe('isValidModelId', () => {
    it('should return true for valid model ids', () => {
      expect(registry.isValidModelId('gpt-4o')).toBe(true);
      expect(registry.isValidModelId('deepseek-chat-v3')).toBe(true);
    });

    it('should return false for invalid model ids', () => {
      expect(registry.isValidModelId('invalid-model')).toBe(false);
      expect(registry.isValidModelId('')).toBe(false);
    });
  });

  describe('getOpenRouterModel', () => {
    it('should return correct OpenRouter model identifiers', () => {
      expect(registry.getOpenRouterModel('gpt-4o')).toBe('openai/gpt-4o');
      expect(registry.getOpenRouterModel('deepseek-chat-v3')).toBe('deepseek/deepseek-chat-v3-0324');
    });

    it('should return null for invalid model id', () => {
      expect(registry.getOpenRouterModel('invalid-model')).toBeNull();
    });
  });

  describe('getDefaultConfig', () => {
    it('should return default config for GPT-4o', () => {
      const config = registry.getDefaultConfig('gpt-4o');
      expect(config).toEqual({
        temperature: 0.3,
        maxTokens: 1500
      });
    });

    it('should return default config for DeepSeek', () => {
      const config = registry.getDefaultConfig('deepseek-chat-v3');
      expect(config).toEqual({
        temperature: 0.2,
        maxTokens: 2000
      });
    });

    it('should return a copy of config object', () => {
      const config1 = registry.getDefaultConfig('gpt-4o');
      const config2 = registry.getDefaultConfig('gpt-4o');
      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });

    it('should return null for invalid model id', () => {
      const config = registry.getDefaultConfig('invalid-model');
      expect(config).toBeNull();
    });
  });

  describe('model definitions', () => {
    it('should have correct GPT-4o model definition', () => {
      const model = registry.getModelById('gpt-4o');
      expect(model).toMatchObject({
        id: 'gpt-4o',
        name: 'GPT-4o',
        provider: 'OpenAI',
        openRouterModel: 'openai/gpt-4o',
        capabilities: expect.arrayContaining(['text-generation', 'multimodal', 'reasoning', 'code-analysis']),
        costLevel: 'high'
      });
    });

    it('should have correct DeepSeek model definition', () => {
      const model = registry.getModelById('deepseek-chat-v3');
      expect(model).toMatchObject({
        id: 'deepseek-chat-v3',
        name: 'DeepSeek Chat V3',
        provider: 'DeepSeek',
        openRouterModel: 'deepseek/deepseek-chat-v3-0324',
        capabilities: expect.arrayContaining(['text-generation', 'reasoning', 'code-analysis', 'chinese-friendly']),
        costLevel: 'low'
      });
    });
  });
});