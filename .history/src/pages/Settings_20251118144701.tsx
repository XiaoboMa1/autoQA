import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Save,
  RotateCcw,
  TestTube,
  CheckCircle,
  XCircle,
  Loader,
  AlertCircle,
  Cpu,
  Zap,
  Download,
  Upload,
  RefreshCw,
  Info,
  HelpCircle,
  Settings as SettingsIcon,
  Trash2,
  Copy,
  Eye,
  EyeOff
} from 'lucide-react';
import { 
  modelRegistry, 
  settingsService, 
  llmConfigManager,
  type ModelDefinition,
  type LLMSettings,
  type ValidationError,
  type ConnectionTestResult
} from '../services';
import { 
  ErrorHandler, 
  type EnhancedError,
  handleApiError,
  handleStorageError,
  handleConfigError,
  handleValidationErrors
} from '../utils/errorHandling';
import {
  ConfigChangeDetector,
  StateManager,
  ImportExportManager,
  type ConfigChange,
  type ConfirmationDialogConfig
} from '../utils/stateManagement';

export function Settings() {
  // 状态管理
  const [availableModels, setAvailableModels] = useState<ModelDefinition[]>([]);
  const [currentSettings, setCurrentSettings] = useState<LLMSettings | null>(null);
  const [formData, setFormData] = useState<LLMSettings>({
    selectedModelId: '',
    apiKey: '',
    customConfig: {
      temperature: 0.3,
      maxTokens: 1500
    }
  });
  
  // UI状态
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [connectionResult, setConnectionResult] = useState<ConnectionTestResult | null>(null);
  const [pendingChanges, setPendingChanges] = useState<ConfigChange[]>([]);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // 初始化
  useEffect(() => {
    initializeSettings();
  }, []);

  const initializeSettings = async () => {
    try {
      setIsLoading(true);
      
      // 获取可用模型
      const models = modelRegistry.getAvailableModels();
      setAvailableModels(models);
      
      // 获取当前设置
      const settings = await settingsService.getLLMSettings();
      setCurrentSettings(settings);
      setFormData(settings);
      
      console.log('✅ 设置页面初始化完成');
    } catch (error) {
      console.error('❌ 设置页面初始化失败:', error);
      setSaveMessage({ type: 'error', text: '加载设置失败' });
    } finally {
      setIsLoading(false);
    }
  };

  // 获取选中模型的信息
  const getSelectedModel = (): ModelDefinition | null => {
    return availableModels.find(model => model.id === formData.selectedModelId) || null;
  };

  // 处理模型选择变更
  const handleModelChange = (modelId: string) => {
    const model = modelRegistry.getModelById(modelId);
    if (model) {
      setFormData(prev => ({
        ...prev,
        selectedModelId: modelId,
        customConfig: {
          ...prev.customConfig,
          temperature: model.defaultConfig.temperature,
          maxTokens: model.defaultConfig.maxTokens
        }
      }));
      setValidationErrors([]);
      setConnectionResult(null);
    }
  };

  // 处理表单字段变更
  const handleFieldChange = (field: string, value: any) => {
    if (field.startsWith('customConfig.')) {
      const configField = field.replace('customConfig.', '');
      setFormData(prev => ({
        ...prev,
        customConfig: {
          ...prev.customConfig,
          [configField]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }));
    }
    
    // 清除相关的验证错误
    setValidationErrors(prev => prev.filter(error => error.field !== field));
    setSaveMessage(null);
  };

  // 验证表单
  const validateForm = async (): Promise<boolean> => {
    try {
      const validation = await settingsService.validateLLMSettings(formData);
      setValidationErrors(validation.errors);
      return validation.isValid;
    } catch (error) {
      console.error('表单验证失败:', error);
      return false;
    }
  };

  // 保存设置
  const handleSave = async () => {
    try {
      setIsSaving(true);
      setSaveMessage(null);
      
      // 验证表单
      const isValid = await validateForm();
      if (!isValid) {
        const enhancedErrors = handleValidationErrors(validationErrors);
        const errorMessages = enhancedErrors.map(e => e.userMessage).join(', ');
        setSaveMessage({ type: 'error', text: `配置验证失败: ${errorMessages}` });
        return;
      }
      
      // 保存设置到localStorage
      await settingsService.saveLLMSettings(formData);
      
      // 更新前端配置管理器
      await llmConfigManager.updateConfig(formData);
      
      // 🔥 新增：同步配置到服务器端
      try {
        console.log('🔄 同步配置到服务器端...');
        console.log('📋 发送的配置数据:', formData);
        const response = await fetch('/api/config/llm', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(formData)
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || '服务器端配置更新失败');
        }
        
        const result = await response.json();
        console.log('✅ 服务器端配置已更新:', result.data?.summary?.modelName);
        
        setCurrentSettings(formData);
        setSaveMessage({ 
          type: 'success', 
          text: `设置保存成功，已切换到 ${result.data?.summary?.modelName || '新模型'}` 
        });
        
      } catch (serverError: any) {
        console.warn('⚠️ 服务器端配置更新失败，但前端配置已保存:', serverError.message);
        setCurrentSettings(formData);
        setSaveMessage({ 
          type: 'success', 
          text: '前端设置保存成功，但服务器端同步失败。请重启服务器以应用新配置。' 
        });
      }
      
      console.log('✅ 设置保存成功');
    } catch (error: any) {
      console.error('❌ 保存设置失败:', error);
      
      // 使用增强的错误处理
      let enhancedError: EnhancedError;
      
      if (error.validationErrors) {
        enhancedError = handleValidationErrors(error.validationErrors)[0];
      } else if (error.type === 'STORAGE_ERROR') {
        enhancedError = handleStorageError(error);
      } else if (error.type === 'CONFIG_ERROR') {
        enhancedError = handleConfigError(error);
      } else {
        enhancedError = ErrorHandler.fromUnknownError(error);
      }
      
      setSaveMessage({ type: 'error', text: enhancedError.userMessage });
    } finally {
      setIsSaving(false);
    }
  };

  // 重置设置
  const handleReset = async () => {
    try {
      if (currentSettings) {
        setFormData(currentSettings);
        setValidationErrors([]);
        setSaveMessage(null);
        setConnectionResult(null);
      }
    } catch (error) {
      console.error('重置设置失败:', error);
    }
  };

  // 重置到默认配置
  const handleResetToDefaults = async () => {
    try {
      setIsSaving(true);
      setSaveMessage(null);
      
      // 重置LLM设置到默认值
      const defaultSettings = await settingsService.resetLLMToDefaults();
      
      // 更新配置管理器
      await llmConfigManager.updateConfig(defaultSettings);
      
      // 更新UI状态
      setCurrentSettings(defaultSettings);
      setFormData(defaultSettings);
      setValidationErrors([]);
      setConnectionResult(null);
      
      setSaveMessage({ type: 'success', text: '配置已重置为默认值' });
      console.log('✅ 配置重置为默认值成功');
      
    } catch (error: any) {
      console.error('❌ 重置配置失败:', error);
      
      // 使用增强的错误处理
      let enhancedError: EnhancedError;
      
      if (error.type === 'STORAGE_ERROR') {
        enhancedError = handleStorageError(error);
      } else if (error.type === 'CONFIG_ERROR') {
        enhancedError = handleConfigError(error);
      } else {
        enhancedError = ErrorHandler.fromUnknownError(error);
      }
      
      setSaveMessage({ type: 'error', text: enhancedError.userMessage });
    } finally {
      setIsSaving(false);
    }
  };

  // 测试连接
  const handleTestConnection = async () => {
    try {
      setIsTesting(true);
      setConnectionResult(null);
      
      // 先验证表单
      const isValid = await validateForm();
      if (!isValid) {
        setSaveMessage({ type: 'error', text: '请先修正配置错误' });
        return;
      }
      
      // 临时更新配置管理器进行测试
      await llmConfigManager.updateConfig(formData);
      
      // 测试连接
      const result = await llmConfigManager.testConnection();
      setConnectionResult(result);
      
      if (result.success) {
        setSaveMessage({ type: 'success', text: `连接测试成功 (${result.responseTime}ms)` });
      } else {
        // 使用增强的错误处理
        const mockError = { message: result.error, type: 'API_ERROR' };
        const enhancedError = handleApiError(mockError);
        setSaveMessage({ type: 'error', text: enhancedError.userMessage });
      }
      
    } catch (error: any) {
      console.error('❌ 连接测试失败:', error);
      
      // 使用增强的错误处理
      const enhancedError = handleApiError(error);
      setSaveMessage({ type: 'error', text: enhancedError.userMessage });
    } finally {
      setIsTesting(false);
    }
  };

  // 获取字段错误信息
  const getFieldError = (fieldName: string): string | null => {
    const error = validationErrors.find(err => err.field === fieldName);
    return error ? error.message : null;
  };

  // 检查表单是否有变更
  const hasChanges = (): boolean => {
    if (!currentSettings) return false;
    return JSON.stringify(formData) !== JSON.stringify(currentSettings);
  };

  // 导出配置
  const handleExportConfig = async () => {
    try {
      setIsExporting(true);
      
      const configData = settingsService.exportSettings();
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const filename = `testflow-config-${timestamp}.json`;
      
      ImportExportManager.downloadConfig(configData, filename);
      setSaveMessage({ type: 'success', text: '配置导出成功' });
      
    } catch (error: any) {
      console.error('❌ 导出配置失败:', error);
      setSaveMessage({ type: 'error', text: error.message || '导出配置失败' });
    } finally {
      setIsExporting(false);
    }
  };

  // 导入配置
  const handleImportConfig = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsImporting(true);
      setSaveMessage(null);
      
      // 读取文件内容
      const configData = await ImportExportManager.readConfigFile(file);
      
      // 验证文件格式
      const validation = ImportExportManager.validateConfigFile(configData);
      if (!validation.isValid) {
        setSaveMessage({ type: 'error', text: validation.error || '配置文件格式无效' });
        return;
      }
      
      // 导入设置
      await settingsService.importSettings(configData);
      
      // 重新加载设置
      await initializeSettings();
      
      // 更新配置管理器
      const newSettings = await settingsService.getLLMSettings();
      await llmConfigManager.updateConfig(newSettings);
      
      setSaveMessage({ type: 'success', text: '配置导入成功' });
      
    } catch (error: any) {
      console.error('❌ 导入配置失败:', error);
      
      // 使用增强的错误处理
      let enhancedError: EnhancedError;
      
      if (error.type === 'STORAGE_ERROR') {
        enhancedError = handleStorageError(error);
      } else if (error.type === 'CONFIG_ERROR') {
        enhancedError = handleConfigError(error);
      } else {
        enhancedError = ErrorHandler.fromUnknownError(error);
      }
      
      setSaveMessage({ type: 'error', text: enhancedError.userMessage });
    } finally {
      setIsImporting(false);
      // 清除文件输入
      event.target.value = '';
    }
  };

  // 检测配置变更
  const detectConfigChanges = (): ConfigChange[] => {
    if (!currentSettings) return [];
    return ConfigChangeDetector.detectChanges(currentSettings, formData);
  };

  // 处理保存前的变更确认
  const handleSaveWithConfirmation = async () => {
    const changes = detectConfigChanges();
    
    if (changes.length === 0) {
      await handleSave();
      return;
    }

    // 检查是否有重要变更
    const hasSignificantChanges = ConfigChangeDetector.hasSignificantChanges(changes);
    
    if (hasSignificantChanges) {
      // 显示确认对话框
      setPendingChanges(changes);
      setShowConfirmDialog(true);
    } else {
      // 直接保存
      await handleSave();
    }
  };

  // 处理确认对话框结果
  const handleConfirmationResult = async (confirmed: boolean) => {
    setShowConfirmDialog(false);
    setPendingChanges([]);
    
    if (confirmed) {
      await handleSave();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">加载设置中...</span>
      </div>
    );
  }

  const selectedModel = getSelectedModel();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">LLM 模型配置</h2>
        <p className="text-gray-600">配置AI模型和参数设置</p>
      </div>

      {/* Main Content */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="space-y-6">
          
          {/* 模型选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              选择AI模型
            </label>
            <select
              value={formData.selectedModelId}
              onChange={(e) => handleModelChange(e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                getFieldError('selectedModelId') ? 'border-red-300' : 'border-gray-300'
              }`}
            >
              <option value="">请选择模型</option>
              {availableModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} ({model.provider}) - {model.costLevel === 'high' ? '高性能' : '高性价比'}
                </option>
              ))}
            </select>
            {getFieldError('selectedModelId') && (
              <p className="mt-1 text-sm text-red-600">{getFieldError('selectedModelId')}</p>
            )}
          </div>

          {/* 模型信息卡片 */}
          {selectedModel && (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                  {selectedModel.costLevel === 'high' ? (
                    <Zap className="h-6 w-6 text-yellow-600" />
                  ) : (
                    <Cpu className="h-6 w-6 text-green-600" />
                  )}
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">{selectedModel.name}</h4>
                  <p className="text-sm text-gray-600 mt-1">{selectedModel.description}</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {selectedModel.capabilities.map((capability) => (
                      <span
                        key={capability}
                        className="inline-flex px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full"
                      >
                        {capability}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* API密钥 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              OpenRouter API 密钥
            </label>
            <input
              type="password"
              value={formData.apiKey}
              onChange={(e) => handleFieldChange('apiKey', e.target.value)}
              placeholder="sk-or-v1-..."
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                getFieldError('apiKey') ? 'border-red-300' : 'border-gray-300'
              }`}
            />
            {getFieldError('apiKey') && (
              <p className="mt-1 text-sm text-red-600">{getFieldError('apiKey')}</p>
            )}
            <p className="mt-1 text-sm text-gray-500">
              {selectedModel?.requiresCustomAuth
                ? `从 ${selectedModel.provider} 获取认证密钥（参考项目文档配置）`
                : (
                  <>
                    从 <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">OpenRouter</a> 获取API密钥
                  </>
                )
              }
            </p>
          </div>

          {/* 模型参数 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Temperature (创造性)
              </label>
              <div className="space-y-2">
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={formData.customConfig?.temperature || 0.3}
                  onChange={(e) => handleFieldChange('customConfig.temperature', parseFloat(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-sm text-gray-500">
                  <span>保守 (0)</span>
                  <span className="font-medium">{formData.customConfig?.temperature || 0.3}</span>
                  <span>创新 (2)</span>
                </div>
              </div>
              {getFieldError('temperature') && (
                <p className="mt-1 text-sm text-red-600">{getFieldError('temperature')}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Max Tokens (最大令牌数)
              </label>
              <input
                type="number"
                min="1"
                max="8000"
                value={formData.customConfig?.maxTokens || 1500}
                onChange={(e) => handleFieldChange('customConfig.maxTokens', parseInt(e.target.value))}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  getFieldError('maxTokens') ? 'border-red-300' : 'border-gray-300'
                }`}
              />
              {getFieldError('maxTokens') && (
                <p className="mt-1 text-sm text-red-600">{getFieldError('maxTokens')}</p>
              )}
              <p className="mt-1 text-sm text-gray-500">控制AI响应的最大长度</p>
            </div>
          </div>

          {/* 连接测试结果 */}
          {connectionResult && (
            <div className={`rounded-lg p-4 ${
              connectionResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
            }`}>
              <div className="flex items-center space-x-2">
                {connectionResult.success ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600" />
                )}
                <span className={`font-medium ${
                  connectionResult.success ? 'text-green-800' : 'text-red-800'
                }`}>
                  {connectionResult.success ? '连接测试成功' : '连接测试失败'}
                </span>
                {connectionResult.success && connectionResult.responseTime && (
                  <span className="text-green-600">({connectionResult.responseTime}ms)</span>
                )}
              </div>
              {!connectionResult.success && connectionResult.error && (
                <p className="mt-2 text-sm text-red-700">{connectionResult.error}</p>
              )}
            </div>
          )}

          {/* 保存消息 */}
          {saveMessage && (
            <div className={`rounded-lg p-4 ${
              saveMessage.type === 'success' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
            }`}>
              <div className="flex items-center space-x-2">
                {saveMessage.type === 'success' ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-600" />
                )}
                <span className={`font-medium ${
                  saveMessage.type === 'success' ? 'text-green-800' : 'text-red-800'
                }`}>
                  {saveMessage.text}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="flex justify-between">
            <button
              onClick={handleTestConnection}
              disabled={isTesting || !formData.selectedModelId || !formData.apiKey}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isTesting ? (
                <Loader className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <TestTube className="h-4 w-4 mr-2" />
              )}
              {isTesting ? '测试中...' : '测试连接'}
            </button>

            <div className="flex space-x-3">
              <button
                onClick={handleReset}
                disabled={!hasChanges() || isSaving}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <RotateCcw className="h-4 w-4 mr-2 inline" />
                重置
              </button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSave}
                disabled={!hasChanges() || isSaving}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving ? (
                  <Loader className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {isSaving ? '保存中...' : '保存设置'}
              </motion.button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}