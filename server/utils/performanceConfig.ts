/**
 * 性能配置中心 - 统一管理所有超时和等待时间
 * 可根据环境变量动态调整性能参数
 */

export interface PerformanceConfig {
  mode: 'fast' | 'balanced' | 'stable';

  // Playwright等待时间
  timeouts: {
    global: number;              // 全局超时
    navigation: number;          // 页面导航超时
    elementVisible: number;      // 元素可见性等待
    defaultWait: number;         // 默认等待时间
    newTabDetect: number;        // 新页签检测超时
  };

  // 并发控制
  concurrency: {
    maxTests: number;            // 最大并发测试数
    taskTimeout: number;         // 任务总超时
  };

  // 资源优化
  resources: {
    disableImages: boolean;      // 禁用图片
    disableCSS: boolean;         // 禁用CSS
    enableScreenshots: boolean;  // 启用截图
    enableVideo: boolean;        // 启用视频
  };

  // AI模型配置
  ai: {
    provider: string;
    model: string;
    maxTokens: number;
  };
}

/**
 * 性能配置预设
 */
const PERFORMANCE_PRESETS: Record<string, PerformanceConfig> = {
  // 快速模式 - 最快速度，可能牺牲稳定性
  fast: {
    mode: 'fast',
    timeouts: {
      global: 8000,
      navigation: 12000,
      elementVisible: 2000,
      defaultWait: 1000,
      newTabDetect: 600,
    },
    concurrency: {
      maxTests: 5,
      taskTimeout: 120000, // 2分钟
    },
    resources: {
      disableImages: true,
      disableCSS: false,
      enableScreenshots: false, // 仅失败时截图
      enableVideo: false,
    },
    ai: {
      provider: 'anthropic',
      model: 'claude-3-5-haiku-20241022', // 更快的模型
      maxTokens: 1500,
    },
  },

  // 平衡模式 - 默认配置，速度与稳定性兼顾
  balanced: {
    mode: 'balanced',
    timeouts: {
      global: 10000,
      navigation: 15000,
      elementVisible: 3000,
      defaultWait: 2000,
      newTabDetect: 800,
    },
    concurrency: {
      maxTests: 3,
      taskTimeout: 180000, // 3分钟
    },
    resources: {
      disableImages: false,
      disableCSS: false,
      enableScreenshots: true, // 每步截图
      enableVideo: false,
    },
    ai: {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      maxTokens: 2000,
    },
  },

  // 稳定模式 - 最稳定，速度较慢
  stable: {
    mode: 'stable',
    timeouts: {
      global: 15000,
      navigation: 20000,
      elementVisible: 5000,
      defaultWait: 3000,
      newTabDetect: 1500,
    },
    concurrency: {
      maxTests: 1,
      taskTimeout: 300000, // 5分钟
    },
    resources: {
      disableImages: false,
      disableCSS: false,
      enableScreenshots: true,
      enableVideo: true,
    },
    ai: {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      maxTokens: 4000,
    },
  },
};

/**
 * 性能配置管理器
 */
export class PerformanceConfigManager {
  private static instance: PerformanceConfigManager;
  private config: PerformanceConfig;

  private constructor() {
    // 从环境变量读取性能模式
    const mode = (process.env.PERFORMANCE_MODE || 'balanced') as 'fast' | 'balanced' | 'stable';
    this.config = this.loadConfig(mode);
  }

  static getInstance(): PerformanceConfigManager {
    if (!PerformanceConfigManager.instance) {
      PerformanceConfigManager.instance = new PerformanceConfigManager();
    }
    return PerformanceConfigManager.instance;
  }

  /**
   * 加载配置（支持环境变量覆盖）
   */
  private loadConfig(mode: 'fast' | 'balanced' | 'stable'): PerformanceConfig {
    const preset = PERFORMANCE_PRESETS[mode];

    // 允许环境变量覆盖
    return {
      ...preset,
      timeouts: {
        global: parseInt(process.env.PLAYWRIGHT_TIMEOUT || String(preset.timeouts.global)),
        navigation: parseInt(process.env.PLAYWRIGHT_NAV_TIMEOUT || String(preset.timeouts.navigation)),
        elementVisible: parseInt(process.env.ELEMENT_VISIBLE_TIMEOUT || String(preset.timeouts.elementVisible)),
        defaultWait: parseInt(process.env.DEFAULT_WAIT_TIMEOUT || String(preset.timeouts.defaultWait)),
        newTabDetect: parseInt(process.env.NEW_TAB_DETECT_TIMEOUT || String(preset.timeouts.newTabDetect)),
      },
      concurrency: {
        maxTests: parseInt(process.env.MAX_CONCURRENCY || String(preset.concurrency.maxTests)),
        taskTimeout: parseInt(process.env.TASK_TIMEOUT || String(preset.concurrency.taskTimeout)),
      },
      resources: {
        disableImages: process.env.PLAYWRIGHT_DISABLE_IMAGES === 'true' || preset.resources.disableImages,
        disableCSS: process.env.PLAYWRIGHT_DISABLE_CSS === 'true' || preset.resources.disableCSS,
        enableScreenshots: process.env.ENABLE_STEP_SCREENSHOTS !== 'false' && preset.resources.enableScreenshots,
        enableVideo: process.env.ENABLE_VIDEO_RECORDING === 'true' || preset.resources.enableVideo,
      },
      ai: {
        provider: process.env.AI_MODEL_PROVIDER || preset.ai.provider,
        model: process.env.AI_MODEL_NAME || preset.ai.model,
        maxTokens: parseInt(process.env.AI_MAX_TOKENS || String(preset.ai.maxTokens)),
      },
    };
  }

  /**
   * 获取当前配置
   */
  getConfig(): PerformanceConfig {
    return this.config;
  }

  /**
   * 获取特定超时值
   */
  getTimeout(type: keyof PerformanceConfig['timeouts']): number {
    return this.config.timeouts[type];
  }

  /**
   * 切换性能模式（运行时）
   */
  switchMode(mode: 'fast' | 'balanced' | 'stable'): void {
    console.log(`⚙️ 切换性能模式: ${this.config.mode} -> ${mode}`);
    this.config = this.loadConfig(mode);
  }

  /**
   * 打印当前配置
   */
  printConfig(): void {
    console.log('📊 当前性能配置:');
    console.log(`   模式: ${this.config.mode}`);
    console.log(`   超时设置:`);
    console.log(`     - 全局: ${this.config.timeouts.global}ms`);
    console.log(`     - 导航: ${this.config.timeouts.navigation}ms`);
    console.log(`     - 元素可见: ${this.config.timeouts.elementVisible}ms`);
    console.log(`     - 默认等待: ${this.config.timeouts.defaultWait}ms`);
    console.log(`   并发: ${this.config.concurrency.maxTests}个`);
    console.log(`   资源优化:`);
    console.log(`     - 禁用图片: ${this.config.resources.disableImages}`);
    console.log(`     - 截图: ${this.config.resources.enableScreenshots}`);
    console.log(`   AI模型: ${this.config.ai.model}`);
  }

  /**
   * 获取推荐配置（基于历史性能数据）
   */
  getRecommendedMode(avgExecutionTime: number, failureRate: number): 'fast' | 'balanced' | 'stable' {
    // 如果执行很快且成功率高，可以用快速模式
    if (avgExecutionTime < 30 && failureRate < 0.05) {
      return 'fast';
    }

    // 如果失败率高，建议稳定模式
    if (failureRate > 0.15) {
      return 'stable';
    }

    // 默认平衡模式
    return 'balanced';
  }
}

// 导出单例
export const performanceConfig = PerformanceConfigManager.getInstance();
