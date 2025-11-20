import { LLMConfigManager, llmConfigManager, ConfigChangeEvent } from '../llmConfigManager';
import { settingsService, LLMSettings } from '../settingsService';
import { modelRegistry } from '../modelRegistry';

// Mock fetch
global.fetch = jest.fn();

// Mock settingsService
jest.mock('../settingsService', () => ({
  settingsService: {
    getLLMSettings: jest.fn(),
    validateLLMSettings: jest.fn(),
    saveLLMSettings: jest.fn()
  }
}));

describe('LLMConfigManager', () => {
  let configManager: LLMConfigManager;
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
  const mockSettingsService = settingsService as jest.Mocked<typeof settingsService>;

  beforeEach(() => {
    configManager = LLMConfigManager.getInstance();
    configManager.reset(); // Reset for each test
    
    mockFetch.mockClear();
    mockSettingsService.getLLMSettings.mockClear();
    mockSettingsService.validateLLMSettings.mockClear();
    mockSettingsService.saveLLMSettings.mockClear();
  });

  describe('getInstance', () => {
    it('should return the same instance (singleton)', () => {
      const instance1 = LLMConfigManager.getInstance();
      const instance2 = LLMConfigManager.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should be the same as exported instance', () => {
      expect(configManager).toBe(llmConfigManager);
    });
  });

  describe('initialize', () => {
    it('should initialize with default settings', async () => {
      const mockSettings: LLMSettings = {
        selectedModelId: 'gpt-4o',
        apiKey: 'sk-test-key',
        customConfig: {
          temperature: 0.3,
          maxTokens: 1500
        }
      };

      mockSettingsService.getLLMSettings.mockResolvedValue(mockSettings);
      mockSettingsService.validateLLMSettings.mockResolvedValue({
        isValid: true,
        errors: []
      });

      await configManager.initialize();

      expect(configManager.isReady()).toBe(true);
      expect(mockSettingsService.getLLMSettings).toHaveBeenCalledTimes(1);
    });

    it('should not initialize twice', async () => {
      const mockSettings: LLMSettings = {
        selectedModelId: 'gpt-4o',
        apiKey: 'sk-test-key'
      };

      mockSettingsService.getLLMSettings.mockResolvedValue(mockSettings);
      mockSettingsService.validateLLMSettings.mockResolvedValue({
        isValid: true,
        errors: []
      });

      await configManager.initialize();
      await configManager.initialize(); // Second call

      expect(mockSettingsService.getLLMSettings).toHaveBeenCalledTimes(1);
    });

    it('should throw error if initialization fails', async () => {
      mockSettingsService.getLLMSettings.mockRejectedValue(new Error('Settings load failed'));

      await expect(configManager.initialize()).rejects.toThrow('Settings load failed');
    });
  });

  describe('getCurrentConfig', () => {
    it('should return current config after initialization', async () => {
      const mockSettings: LLMSettings = {
        selectedModelId: 'gpt-4o',
        apiKey: 'sk-test-key',
        customConfig: {
          temperature: 0.5,
          maxTokens: 2000
        }
      };

      mockSettingsService.getLLMSettings.mockResolvedValue(mockSettings);
      mockSettingsService.validateLLMSettings.mockResolvedValue({
        isValid: true,
        errors: []
      });

      await configManager.initialize();
      const config = configManager.getCurrentConfig();

      expect(config).toMatchObject({
        apiKey: 'sk-test-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'openai/gpt-4o',
        temperature: 0.5,
        maxTokens: 2000
      });
    });

    it('should throw error if not initialized', () => {
      expect(() => configManager.getCurrentConfig()).toThrow('配置管理器未初始化');
    });
  });

  describe('getModelInfo', () => {
    it('should return current model info after initialization', async () => {
      const mockSettings: LLMSettings = {
        selectedModelId: 'deepseek-chat-v3',
        apiKey: 'sk-test-key'
      };

      mockSettingsService.getLLMSettings.mockResolvedValue(mockSettings);
      mockSettingsService.validateLLMSettings.mockResolvedValue({
        isValid: true,
        errors: []
      });

      await configManager.initialize();
      const modelInfo = configManager.getModelInfo();

      expect(modelInfo.id).toBe('deepseek-chat-v3');
      expect(modelInfo.name).toBe('DeepSeek Chat V3');
      expect(modelInfo.provider).toBe('DeepSeek');
    });

    it('should throw error if not initialized', () => {
      expect(() => configManager.getModelInfo()).toThrow('配置管理器未初始化');
    });
  });

  describe('updateConfig', () => {
    it('should update config with valid settings', async () => {
      const newSettings: LLMSettings = {
        selectedModelId: 'deepseek-chat-v3',
        apiKey: 'sk-new-key',
        customConfig: {
          temperature: 0.1,
          maxTokens: 1000
        }
      };

      mockSettingsService.validateLLMSettings.mockResolvedValue({
        isValid: true,
        errors: []
      });

      await configManager.updateConfig(newSettings);

      const config = configManager.getCurrentConfig();
      expect(config.model).toBe('deepseek/deepseek-chat-v3-0324');
      expect(config.temperature).toBe(0.1);
      expect(config.maxTokens).toBe(1000);
    });

    it('should use default config when custom config is not provided', async () => {
      const newSettings: LLMSettings = {
        selectedModelId: 'gpt-4o',
        apiKey: 'sk-test-key'
      };

      mockSettingsService.validateLLMSettings.mockResolvedValue({
        isValid: true,
        errors: []
      });

      await configManager.updateConfig(newSettings);

      const config = configManager.getCurrentConfig();
      expect(config.temperature).toBe(0.3); // GPT-4o default
      expect(config.maxTokens).toBe(1500);  // GPT-4o default
    });

    it('should throw error for invalid settings', async () => {
      const invalidSettings: LLMSettings = {
        selectedModelId: 'invalid-model',
        apiKey: 'invalid-key'
      };

      mockSettingsService.validateLLMSettings.mockResolvedValue({
        isValid: false,
        errors: [{ field: 'selectedModelId', message: '无效模型', code: 'INVALID' }]
      });

      await expect(configManager.updateConfig(invalidSettings)).rejects.toThrow('配置验证失败');
    });

    it('should throw error for unknown model', async () => {
      const unknownModelSettings: LLMSettings = {
        selectedModelId: 'unknown-model',
        apiKey: 'sk-test-key'
      };

      mockSettingsService.validateLLMSettings.mockResolvedValue({
        isValid: true,
        errors: []
      });

      await expect(configManager.updateConfig(unknownModelSettings)).rejects.toThrow('未找到模型');
    });
  });

  describe('testConnection', () => {
    beforeEach(async () => {
      const mockSettings: LLMSettings = {
        selectedModelId: 'gpt-4o',
        apiKey: 'sk-test-key'
      };

      mockSettingsService.getLLMSettings.mockResolvedValue(mockSettings);
      mockSettingsService.validateLLMSettings.mockResolvedValue({
        isValid: true,
        errors: []
      });

      await configManager.initialize();
    });

    it('should return success result for successful connection', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: 'OK'
              }
            }
          ]
        })
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await configManager.testConnection();

      expect(result.success).toBe(true);
      expect(result.responseTime).toBeGreaterThan(0);
      expect(result.modelInfo.id).toBe('gpt-4o');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer sk-test-key'
          })
        })
      );
    });

    it('should return failure result for API error', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        text: jest.fn().mockResolvedValue('Unauthorized')
      };

      mockFetch.mockResolvedValue(mockResponse as any);

      const result = await configManager.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toContain('API调用失败 (401)');
      expect(result.modelInfo.id).toBe('gpt-4o');
    });

    it('should return failure result for network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await configManager.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should throw error if not initialized', async () => {
      configManager.reset();
      await expect(configManager.testConnection()).rejects.toThrow('配置管理器未初始化');
    });
  });

  describe('config change listeners', () => {
    it('should notify listeners on config update', async () => {
      const listener = jest.fn();
      configManager.addConfigChangeListener(listener);

      const mockSettings: LLMSettings = {
        selectedModelId: 'gpt-4o',
        apiKey: 'sk-test-key'
      };

      mockSettingsService.validateLLMSettings.mockResolvedValue({
        isValid: true,
        errors: []
      });

      await configManager.updateConfig(mockSettings);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'model_changed',
          newConfig: expect.any(Object),
          modelInfo: expect.objectContaining({ id: 'gpt-4o' })
        })
      );
    });

    it('should remove listeners correctly', async () => {
      const listener = jest.fn();
      configManager.addConfigChangeListener(listener);
      configManager.removeConfigChangeListener(listener);

      const mockSettings: LLMSettings = {
        selectedModelId: 'gpt-4o',
        apiKey: 'sk-test-key'
      };

      mockSettingsService.validateLLMSettings.mockResolvedValue({
        isValid: true,
        errors: []
      });

      await configManager.updateConfig(mockSettings);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('getConfigSummary', () => {
    it('should return summary after initialization', async () => {
      const mockSettings: LLMSettings = {
        selectedModelId: 'deepseek-chat-v3',
        apiKey: 'sk-test-key',
        customConfig: {
          temperature: 0.2,
          maxTokens: 2000
        }
      };

      mockSettingsService.getLLMSettings.mockResolvedValue(mockSettings);
      mockSettingsService.validateLLMSettings.mockResolvedValue({
        isValid: true,
        errors: []
      });

      await configManager.initialize();
      const summary = configManager.getConfigSummary();

      expect(summary).toMatchObject({
        modelName: 'DeepSeek Chat V3',
        modelId: 'deepseek-chat-v3',
        provider: 'DeepSeek',
        temperature: 0.2,
        maxTokens: 2000,
        costLevel: 'low',
        isInitialized: true
      });
    });

    it('should return default summary when not initialized', () => {
      const summary = configManager.getConfigSummary();

      expect(summary).toMatchObject({
        modelName: '未初始化',
        modelId: '',
        provider: '',
        temperature: 0,
        maxTokens: 0,
        costLevel: '',
        capabilities: [],
        isInitialized: false
      });
    });
  });

  describe('reloadConfig', () => {
    it('should reload config from settings service', async () => {
      // First initialize
      const initialSettings: LLMSettings = {
        selectedModelId: 'gpt-4o',
        apiKey: 'sk-initial-key'
      };

      mockSettingsService.getLLMSettings.mockResolvedValueOnce(initialSettings);
      mockSettingsService.validateLLMSettings.mockResolvedValue({
        isValid: true,
        errors: []
      });

      await configManager.initialize();

      // Then reload with new settings
      const newSettings: LLMSettings = {
        selectedModelId: 'deepseek-chat-v3',
        apiKey: 'sk-new-key'
      };

      mockSettingsService.getLLMSettings.mockResolvedValueOnce(newSettings);

      await configManager.reloadConfig();

      const config = configManager.getCurrentConfig();
      expect(config.model).toBe('deepseek/deepseek-chat-v3-0324');
      expect(config.apiKey).toBe('sk-new-key');
    });
  });

  describe('saveCurrentConfig', () => {
    it('should save current config to settings service', async () => {
      const mockSettings: LLMSettings = {
        selectedModelId: 'gpt-4o',
        apiKey: 'sk-test-key',
        customConfig: {
          temperature: 0.5,
          maxTokens: 2000
        }
      };

      mockSettingsService.getLLMSettings.mockResolvedValue(mockSettings);
      mockSettingsService.validateLLMSettings.mockResolvedValue({
        isValid: true,
        errors: []
      });

      await configManager.initialize();
      await configManager.saveCurrentConfig();

      expect(mockSettingsService.saveLLMSettings).toHaveBeenCalledWith({
        selectedModelId: 'gpt-4o',
        apiKey: 'sk-test-key',
        customConfig: {
          temperature: 0.5,
          maxTokens: 2000
        }
      });
    });

    it('should throw error if not initialized', async () => {
      await expect(configManager.saveCurrentConfig()).rejects.toThrow('没有可保存的配置');
    });
  });
});