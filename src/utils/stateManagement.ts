import { LLMSettings } from '../services/settingsService';

// 配置变更检测工具
export class ConfigChangeDetector {
  
  /**
   * 检测两个配置之间的差异
   */
  static detectChanges(oldConfig: LLMSettings, newConfig: LLMSettings): ConfigChange[] {
    const changes: ConfigChange[] = [];

    // 检测模型变更
    if (oldConfig.selectedModelId !== newConfig.selectedModelId) {
      changes.push({
        field: 'selectedModelId',
        oldValue: oldConfig.selectedModelId,
        newValue: newConfig.selectedModelId,
        type: 'model_change',
        description: `模型从 ${oldConfig.selectedModelId} 更改为 ${newConfig.selectedModelId}`
      });
    }

    // 检测API密钥变更
    if (oldConfig.apiKey !== newConfig.apiKey) {
      changes.push({
        field: 'apiKey',
        oldValue: '***',
        newValue: '***',
        type: 'security_change',
        description: 'API密钥已更改'
      });
    }

    // 检测温度变更
    const oldTemp = oldConfig.customConfig?.temperature;
    const newTemp = newConfig.customConfig?.temperature;
    if (oldTemp !== newTemp) {
      changes.push({
        field: 'temperature',
        oldValue: oldTemp,
        newValue: newTemp,
        type: 'parameter_change',
        description: `温度从 ${oldTemp} 更改为 ${newTemp}`
      });
    }

    // 检测最大令牌数变更
    const oldTokens = oldConfig.customConfig?.maxTokens;
    const newTokens = newConfig.customConfig?.maxTokens;
    if (oldTokens !== newTokens) {
      changes.push({
        field: 'maxTokens',
        oldValue: oldTokens,
        newValue: newTokens,
        type: 'parameter_change',
        description: `最大令牌数从 ${oldTokens} 更改为 ${newTokens}`
      });
    }

    return changes;
  }

  /**
   * 检查是否有重要变更
   */
  static hasSignificantChanges(changes: ConfigChange[]): boolean {
    return changes.some(change => 
      change.type === 'model_change' || 
      change.type === 'security_change'
    );
  }

  /**
   * 生成变更摘要
   */
  static generateChangeSummary(changes: ConfigChange[]): string {
    if (changes.length === 0) return '无变更';
    
    const summary = changes.map(change => change.description).join(', ');
    return `检测到 ${changes.length} 项变更: ${summary}`;
  }
}

// 配置变更接口
export interface ConfigChange {
  field: string;
  oldValue: any;
  newValue: any;
  type: 'model_change' | 'security_change' | 'parameter_change';
  description: string;
}

// 确认对话框配置
export interface ConfirmationDialogConfig {
  title: string;
  message: string;
  changes: ConfigChange[];
  confirmText: string;
  cancelText: string;
  type: 'info' | 'warning' | 'danger';
}

// 状态管理工具
export class StateManager {
  private static pendingChanges: ConfigChange[] = [];
  private static confirmationCallback: ((confirmed: boolean) => void) | null = null;

  /**
   * 设置待确认的变更
   */
  static setPendingChanges(changes: ConfigChange[]): void {
    this.pendingChanges = changes;
  }

  /**
   * 获取待确认的变更
   */
  static getPendingChanges(): ConfigChange[] {
    return [...this.pendingChanges];
  }

  /**
   * 清除待确认的变更
   */
  static clearPendingChanges(): void {
    this.pendingChanges = [];
    this.confirmationCallback = null;
  }

  /**
   * 请求用户确认变更
   */
  static requestConfirmation(
    changes: ConfigChange[],
    callback: (confirmed: boolean) => void
  ): ConfirmationDialogConfig {
    this.setPendingChanges(changes);
    this.confirmationCallback = callback;

    const hasSignificantChanges = ConfigChangeDetector.hasSignificantChanges(changes);
    
    return {
      title: hasSignificantChanges ? '重要配置变更' : '配置变更确认',
      message: ConfigChangeDetector.generateChangeSummary(changes),
      changes,
      confirmText: '保存变更',
      cancelText: '取消',
      type: hasSignificantChanges ? 'warning' : 'info'
    };
  }

  /**
   * 处理用户确认结果
   */
  static handleConfirmation(confirmed: boolean): void {
    if (this.confirmationCallback) {
      this.confirmationCallback(confirmed);
      this.clearPendingChanges();
    }
  }

  /**
   * 生成配置快照
   */
  static createSnapshot(config: LLMSettings): ConfigSnapshot {
    return {
      timestamp: new Date(),
      config: JSON.parse(JSON.stringify(config)),
      hash: this.generateConfigHash(config)
    };
  }

  /**
   * 比较配置快照
   */
  static compareSnapshots(snapshot1: ConfigSnapshot, snapshot2: ConfigSnapshot): boolean {
    return snapshot1.hash === snapshot2.hash;
  }

  /**
   * 生成配置哈希
   */
  private static generateConfigHash(config: LLMSettings): string {
    const configString = JSON.stringify(config, Object.keys(config).sort());
    return btoa(configString).slice(0, 16);
  }
}

// 配置快照接口
export interface ConfigSnapshot {
  timestamp: Date;
  config: LLMSettings;
  hash: string;
}

// 导入/导出工具
export class ImportExportManager {
  
  /**
   * 下载配置文件
   */
  static downloadConfig(configData: string, filename: string = 'Sakura AI-config.json'): void {
    try {
      const blob = new Blob([configData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
      console.log('✅ Configuration downloaded successfully');
    } catch (error) {
      console.error('❌ Failed to download configuration:', error);
      throw new Error('下载配置文件失败');
    }
  }

  /**
   * 读取上传的配置文件
   */
  static readConfigFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!file.type.includes('json') && !file.name.endsWith('.json')) {
        reject(new Error('请选择JSON格式的配置文件'));
        return;
      }

      const reader = new FileReader();
      
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          resolve(content);
        } catch (error) {
          reject(new Error('读取文件内容失败'));
        }
      };

      reader.onerror = () => {
        reject(new Error('文件读取失败'));
      };

      reader.readAsText(file);
    });
  }

  /**
   * 验证配置文件格式
   */
  static validateConfigFile(configData: string): { isValid: boolean; error?: string } {
    try {
      const data = JSON.parse(configData);
      
      if (!data.version) {
        return { isValid: false, error: '配置文件缺少版本信息' };
      }
      
      if (!data.settings) {
        return { isValid: false, error: '配置文件缺少设置数据' };
      }
      
      if (data.version !== '1.0') {
        return { isValid: false, error: `不支持的配置版本: ${data.version}` };
      }
      
      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: '配置文件格式无效' };
    }
  }
}