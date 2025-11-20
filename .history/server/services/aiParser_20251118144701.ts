import { PlaywrightMcpClient } from './mcpClient.js';
import { llmConfigManager, LLMConfigManager } from '../../src/services/llmConfigManager.js';
import { ProxyAgent } from 'undici';

// AI配置接口
export interface LLMConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface AIParseResult {
  success: boolean;
  steps: TestStep[];
  error?: string;
}

export interface AINextStepParseResult {
  success: boolean;
  step?: TestStep;
  remaining?: string;
  error?: string;
}

export interface TestStep {
  id: string;
  action: string;
  description: string;
  selector?: string;
  value?: string;
  url?: string;
  condition?: string;
  text?: string;
  timeout?: number;
  element?: string;  // 🔥 新增：元素的人类可读描述
  ref?: string;      // 🔥 新增：元素的精确引用
  stepType?: 'operation' | 'assertion';  // 🔥 新增：步骤类型标记
  // 🔥 新增：滚动操作参数
  pixels?: number;   // 滚动像素数
  direction?: 'up' | 'down' | 'left' | 'right';  // 滚动方向
  x?: number;        // 水平滚动距离
  y?: number;        // 垂直滚动距离
  // 🔥 新增：页签切换参数
  tabTarget?: string;    // 页签目标（标题、URL片段或索引）
  tabMatchType?: 'title' | 'url' | 'index' | 'last' | 'first';  // 匹配方式
}

export interface MCPCommand {
  name: string;
  arguments: Record<string, any>;
}

export class AITestParser {
  private mcpClient: PlaywrightMcpClient;
  private configManager: LLMConfigManager;
  private useConfigManager: boolean;

  constructor(mcpClient: PlaywrightMcpClient, llmConfig?: LLMConfig) {
    this.mcpClient = mcpClient;
    this.configManager = llmConfigManager;

    // 如果提供了llmConfig，使用传统模式；否则使用配置管理器
    this.useConfigManager = !llmConfig;

    if (llmConfig) {
      // 传统模式：使用传入的配置
      console.log('🤖 AI解析器启用 (传统模式)，模型:', llmConfig.model);
    } else {
      // 配置管理器模式：使用动态配置
      console.log('🤖 AI解析器启用 (配置管理器模式) - 延迟初始化');
      // 🔥 修复：不在构造函数中进行异步初始化，避免阻塞服务启动
      // 配置管理器将在首次使用时进行初始化
    }
  }

  /**
   * 初始化配置管理器
   */
  private async initializeConfigManager(): Promise<void> {
    try {
      if (!this.configManager.isReady()) {
        await this.configManager.initialize();
      }

      const summary = this.configManager.getConfigSummary();
      console.log(`🔧 AI解析器配置已加载: ${summary.modelName} (${summary.provider})`);
      console.log(`   温度: ${summary.temperature}, 最大令牌: ${summary.maxTokens}`);

      // 监听配置变更
      this.configManager.addConfigChangeListener((event) => {
        console.log(`🔄 AI解析器配置已更新: ${event.type} - ${event.modelInfo.name}`);
        if (event.type === 'model_changed') {
          console.log(`   模型切换: ${event.oldConfig?.model || '未知'} → ${event.newConfig.model}`);
        }
      });

    } catch (error) {
      console.error('❌ AI解析器配置管理器初始化失败:', error);
      // 回退到默认配置
      this.useConfigManager = false;
    }
  }

  /**
   * 获取当前LLM配置
   */
  private async getCurrentConfig(): Promise<LLMConfig> {
    if (this.useConfigManager) {
      // 🔥 修复：添加超时和错误处理，避免配置管理器卡住整个服务
      try {
        // 如果配置管理器还没准备好，等待初始化完成（带超时）
        if (!this.configManager.isReady()) {
          console.log('⏳ 配置管理器未就绪，开始初始化...');

          // 使用Promise.race添加超时机制
          await Promise.race([
            this.initializeConfigManager(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('配置管理器初始化超时')), 5000)
            )
          ]);
        }

        if (this.configManager.isReady()) {
          const config = this.configManager.getCurrentConfig();
          console.log(`🔧 使用配置管理器配置: ${config.model}`);
          return config;
        }
      } catch (error) {
        console.error('❌ 配置管理器初始化失败，回退到默认配置:', error.message);
        this.useConfigManager = false;
      }
    }

    // 回退到默认配置(从环境变量读取)
    const defaultConfig = {
      apiKey: process.env.OPENROUTER_API_KEY || '',
      baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
      model: process.env.DEFAULT_MODEL || 'openai/gpt-4o',
      temperature: parseFloat(process.env.DEFAULT_TEMPERATURE || '0.3'),
      maxTokens: parseInt(process.env.DEFAULT_MAX_TOKENS || '1500')
    };
    console.log(`⚠️ 使用默认配置: ${defaultConfig.model}`);
    return defaultConfig;
  }

  /**
   * 重新加载配置（无需重启服务）
   */
  public async reloadConfiguration(): Promise<void> {
    if (this.useConfigManager) {
      try {
        await this.configManager.reloadConfig();
        const summary = this.configManager.getConfigSummary();
        console.log(`🔄 AI解析器配置已重新加载: ${summary.modelName}`);
      } catch (error) {
        console.error('❌ 重新加载AI解析器配置失败:', error);
      }
    } else {
      console.log('⚠️ AI解析器使用传统模式，无法重新加载配置');
    }
  }

  /**
   * 获取当前模型信息（用于日志和调试）
   */
  public getCurrentModelInfo(): { modelName: string; provider: string; mode: string } {
    if (this.useConfigManager && this.configManager.isReady()) {
      const summary = this.configManager.getConfigSummary();
      return {
        modelName: summary.modelName,
        provider: summary.provider,
        mode: '配置管理器模式'
      };
    } else {
      // 回退到默认配置信息
      return {
        modelName: 'openai/gpt-4o',
        provider: '未知',
        mode: '传统模式'
      };
    }
  }

  /**
   * 检查配置管理器是否可用
   */
  public isConfigManagerMode(): boolean {
    return this.useConfigManager && this.configManager.isReady();
  }

  /**
   * 基于MCP快照和用例描述，AI解析为可执行的步骤
   */
  async parseTestDescription(description: string, testName: string, runId: string, snapshot: any | null): Promise<AIParseResult> {
    try {
      // 将用例描述分割为步骤
      const steps = this.splitDescriptionToSteps(description);
      return { success: true, steps };
    } catch (error) {
      return { success: false, steps: [], error: `解析测试描述失败: ${error}` };
    }
  }

  /**
   * AI根据当前快照和下一条指令生成MCP命令
   */
  async parseNextStep(remainingStepsText: string, snapshot: any | null, runId: string): Promise<AINextStepParseResult> {
    try {
      // 🔥 增强日志：打印完整的剩余步骤
      console.log(`\n🔍 [${runId}] ===== AI解析步骤开始 =====`);
      console.log(`📋 [${runId}] 剩余步骤文本:\n${remainingStepsText}`);

      if (!remainingStepsText?.trim()) {
        console.log(`❌ [${runId}] 没有剩余步骤，解析结束`);
        return { success: false, error: "没有剩余步骤" };
      }

      // 🔥 修复：更智能的步骤分割，处理数字编号的步骤
      const lines = remainingStepsText.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      if (lines.length === 0) {
        console.log(`❌ [${runId}] 没有有效步骤，解析结束`);
        return { success: false, error: "没有有效步骤" };
      }

      // 🔥 增强日志：打印所有拆分的步骤
      console.log(`📊 [${runId}] 拆分后的步骤数量: ${lines.length}`);
      lines.forEach((line, index) => {
        console.log(`   ${index + 1}. "${line}"`);
      });

      // 🔥 修复：确保正确提取当前步骤并计算剩余步骤
      let nextStepText = lines[0].trim();

      // 🔥 增强：移除各种步骤编号格式（中文标点、英文标点、无标点等）
      // 匹配模式：数字 + 可选的标点符号(、。.：:) + 可选空格
      nextStepText = nextStepText.replace(/^(?:\d+\s*[、。\.\)\:]?\s*|步骤\s*\d+\s*[、。\.\)\:]?\s*)/i, '').trim();

      console.log(`🔄 [${runId}] 原始步骤: "${lines[0]}"`);
      console.log(`🔄 [${runId}] 清理后步骤: "${nextStepText}"`);

      // 🔥 关键修复：确保剩余步骤正确计算
      const remaining = lines.slice(1).join('\n').trim();

      console.log(`🎯 [${runId}] 当前解析步骤: "${nextStepText}"`);
      console.log(`📊 [${runId}] 剩余步骤数: ${lines.length - 1}`);
      console.log(`📋 [${runId}] 剩余步骤内容: "${remaining}"`)

      // 🔥 增强日志：打印页面快照状态
      if (snapshot) {
        const snapshotLines = snapshot.split('\n');
        console.log(`📸 [${runId}] 页面快照状态: ${snapshotLines.length}行`);

        // 提取页面URL和标题
        const urlMatch = snapshot.match(/Page URL: ([^\n]+)/);
        const titleMatch = snapshot.match(/Page Title: ([^\n]+)/);

        if (urlMatch) console.log(`   🌐 URL: ${urlMatch[1]}`);
        if (titleMatch) console.log(`   📄 标题: ${titleMatch[1]}`);

        // 统计元素
        const elementTypes = ['textbox', 'button', 'link', 'input', 'checkbox', 'radio', 'combobox'];
        const foundTypes = elementTypes
          .map(type => {
            const count = (snapshot.match(new RegExp(type, 'g')) || []).length;
            return count > 0 ? `${type}(${count})` : null;
          })
          .filter(Boolean);

        if (foundTypes.length > 0) {
          console.log(`   🔍 页面元素: ${foundTypes.join(', ')}`);
        } else {
          console.log(`   ⚠️ 未在快照中发现常见交互元素`);
        }
      } else {
        console.log(`⚠️ [${runId}] 无页面快照可用，将使用默认解析策略`);
      }

      // AI模拟：基于当前步骤文本和快照生成MCP命令
      const mcpCommand = await this.generateMCPCommand(nextStepText, snapshot);

      // 🔥 增强日志：打印解析结果
      console.log(`🤖 [${runId}] AI解析结果:`);
      console.log(`   🎯 操作类型: ${mcpCommand.name}`);
      console.log(`   📋 参数: ${JSON.stringify(mcpCommand.arguments, null, 2)}`);

      const step: TestStep = {
        id: `step-${Date.now()}`,
        action: mcpCommand.name,
        description: nextStepText,
        stepType: 'operation',  // 🔥 标记为操作步骤
        ...mcpCommand.arguments
      };

      console.log(`✅ [${runId}] AI解析步骤完成: ${step.action} - ${step.description}`);
      console.log(`📋 [${runId}] 返回剩余步骤: "${remaining}"`);
      console.log(`🔍 [${runId}] ===== AI解析步骤结束 =====\n`);

      // 🔥 关键修复：确保返回正确的剩余步骤
      return { success: true, step, remaining: remaining || '' };
    } catch (error) {
      console.error(`❌ [${runId}] AI解析步骤失败: ${error}`);
      return { success: false, error: `解析下一步骤失败: ${error}` };
    }
  }

  /**
   * AI根据快照和断言描述生成断言命令
   */
  async parseAssertions(assertionsText: string, snapshot: any, runId: string): Promise<AIParseResult> {
    try {
      if (!assertionsText?.trim()) {
        return { success: true, steps: [] };
      }

      const assertionLines = assertionsText.split('\n').filter(line => line.trim());
      const steps: TestStep[] = [];

      for (let i = 0; i < assertionLines.length; i++) {
        const assertionText = assertionLines[i].trim();
        const mcpCommand = await this.generateAssertionCommand(assertionText, snapshot);

        steps.push({
          id: `assertion-${i + 1}`,
          action: mcpCommand.name,
          description: assertionText,
          stepType: 'assertion',  // 🔥 标记为断言步骤
          ...mcpCommand.arguments
        });
      }

      return { success: true, steps };
    } catch (error) {
      return { success: false, steps: [], error: `解析断言失败: ${error}` };
    }
  }

  /**
   * 将用例描述分割为步骤
   */
  private splitDescriptionToSteps(description: string): TestStep[] {
    if (!description?.trim()) return [];

    const lines = description.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    return lines.map((line, index) => ({
      id: `step-${index + 1}`,
      action: 'pending', // 待AI解析
      description: line,
      order: index + 1
    }));
  }

  /**
   * 🔥 新增：检测页签切换指令
   */
  private detectTabSwitchCommand(stepDescription: string): MCPCommand | null {
    const text = stepDescription.toLowerCase().trim();
    
    // 页签切换模式匹配
    const patterns = [
      // 切换到最后一个页签
      { 
        regex: /切换到最后一?个?页签|切换页签到最后|打开最后一?个?页签|最后一?个?页签/, 
        type: 'last' 
      },
      // 切换到第一个页签
      { 
        regex: /切换到第一个页签|切换页签到第一|打开第一个页签|第一个页签/, 
        type: 'first' 
      },
      // 切换到新页签/新开的页签
      { 
        regex: /切换到新页签|切换到新开的?页签|打开新页签|新页签/, 
        type: 'last'  // 通常新页签是最后一个
      },
      // 切换到指定索引的页签（如：切换到第2个页签）
      { 
        regex: /切换到第(\d+)个页签|切换页签到第(\d+)|打开第(\d+)个页签/, 
        type: 'index' 
      },
      // 切换到包含特定标题的页签
      { 
        regex: /切换到(.+?)页签|切换页签到(.+)|打开(.+?)页签/, 
        type: 'title' 
      }
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern.regex);
      if (match) {
        console.log(`🎯 匹配页签切换模式: ${pattern.type}, 原文: "${stepDescription}"`);
        
        switch (pattern.type) {
          case 'last':
            return {
              name: 'browser_tab_switch',
              arguments: {
                tabTarget: 'last',
                tabMatchType: 'last',
                description: stepDescription
              }
            };
            
          case 'first':
            return {
              name: 'browser_tab_switch',
              arguments: {
                tabTarget: 'first',
                tabMatchType: 'first',
                description: stepDescription
              }
            };
            
          case 'index':
            const indexMatch = match[1] || match[2] || match[3];
            return {
              name: 'browser_tab_switch',
              arguments: {
                tabTarget: indexMatch,
                tabMatchType: 'index',
                description: stepDescription
              }
            };
            
          case 'title':
            // 提取页签标题
            let titleTarget = match[1] || match[2] || match[3];
            if (titleTarget) {
              // 清理可能的干扰词
              titleTarget = titleTarget.replace(/(的|到|个|页签)$/, '').trim();
              return {
                name: 'browser_tab_switch',
                arguments: {
                  tabTarget: titleTarget,
                  tabMatchType: 'title',
                  description: stepDescription
                }
              };
            }
            break;
        }
      }
    }

    return null;  // 不是页签切换指令
  }

  /**
   * 🔥 真正的AI解析：根据步骤描述和快照生成MCP命令
   */
  private async generateMCPCommand(stepDescription: string, snapshot: any): Promise<MCPCommand> {
    console.log(`🤖 使用AI解析操作: "${stepDescription}"`);

    try {
      // 🔥 新增：预处理页签切换指令
      const tabSwitchCommand = this.detectTabSwitchCommand(stepDescription);
      if (tabSwitchCommand) {
        console.log(`✅ 识别为页签切换指令: ${tabSwitchCommand.name}`);
        return tabSwitchCommand;
      }

      // 1. 提取页面元素
      const pageElements = this.extractPageElements(snapshot);

      // 2. 构建操作专用的用户提示词
      const userPrompt = this.buildOperationUserPrompt(stepDescription, pageElements);

      // 3. 调用AI模型（操作模式）
      const aiResponse = await this.callLLM(userPrompt, 'operation');

      // 4. 解析AI响应
      const mcpCommand = this.parseAIResponse(aiResponse);

      console.log(`✅ AI操作解析成功: ${mcpCommand.name}`);
      return mcpCommand;

    } catch (error: any) {
      console.error(`❌ AI操作解析失败: ${error.message}`);
      throw new Error(`AI操作解析失败: ${error.message}`);
    }
  }

  /**
   * 🔥 过滤快照中的非功能性错误
   */
  private filterSnapshotErrors(snapshot: any): any {
    if (typeof snapshot === 'string') {
      console.log(`🧹 开始过滤快照中的Console错误...`);

      // 统计过滤前的错误数量
      const errorCountBefore = (snapshot.match(/TypeError:|ReferenceError:|SyntaxError:/g) || []).length;

      // 过滤常见的JavaScript错误
      let filteredSnapshot = snapshot
        // 过滤 getComputedStyle 错误
        .replace(/- TypeError: Failed to execute 'getComputedStyle'[^\n]*/g, '')
        // 过滤 Cannot read properties 错误
        .replace(/- TypeError: Cannot read properties of undefined[^\n]*/g, '')
        // 过滤其他常见TypeError
        .replace(/- TypeError:[^\n]*/g, '')
        // 过滤 ReferenceError
        .replace(/- ReferenceError:[^\n]*/g, '')
        // 过滤 SyntaxError
        .replace(/- SyntaxError:[^\n]*/g, '')
        // 过滤错误堆栈信息
        .replace(/at [a-zA-Z]+ \(https?:\/\/[^\)]+\)[^\n]*/g, '')
        // 过滤空的 "..." 占位符
        .replace(/\.\.\.[^\n]*\n/g, '')
        // 清理多余的空行
        .replace(/\n\n+/g, '\n\n');

      // 如果 "New console messages" 部分为空,则整个移除
      filteredSnapshot = filteredSnapshot.replace(/### New console messages\n+###/g, '');

      // 统计过滤后的错误数量
      const errorCountAfter = (filteredSnapshot.match(/TypeError:|ReferenceError:|SyntaxError:/g) || []).length;
      const filteredCount = errorCountBefore - errorCountAfter;

      if (filteredCount > 0) {
        console.log(`✅ 已过滤 ${filteredCount} 个Console错误，剩余 ${errorCountAfter} 个`);
      } else {
        console.log(`ℹ️ 快照中没有发现需要过滤的Console错误`);
      }

      return filteredSnapshot;
    }
    return snapshot;
  }

  /**
   * 🔥 真正的AI解析：根据断言描述和快照生成断言命令
   */
  private async generateAssertionCommand(assertionDescription: string, snapshot: any): Promise<MCPCommand> {
    console.log(`🤖 使用AI解析断言: "${assertionDescription}"`);

    try {
      // 1. 🔥 过滤快照中的非功能性错误
      const filteredSnapshot = this.filterSnapshotErrors(snapshot);

      // 2. 提取页面元素（使用过滤后的快照）
      const pageElements = this.extractPageElements(filteredSnapshot);

      // 3. 构建断言专用的用户提示词
      const userPrompt = this.buildAssertionUserPrompt(assertionDescription, pageElements);

      // 4. 调用AI模型（断言模式）
      const aiResponse = await this.callLLM(userPrompt, 'assertion');

      // 5. 解析AI响应
      const mcpCommand = this.parseAIResponse(aiResponse);

      console.log(`✅ AI断言解析成功: ${mcpCommand.name}`);
      return mcpCommand;

    } catch (error: any) {
      console.error(`❌ AI断言解析失败: ${error.message}`);
      throw new Error(`AI断言解析失败: ${error.message}`);
    }
  }

  /**
   * 🔥 提取页面元素用于AI分析
   */
  private extractPageElements(snapshot: string): Array<{ ref: string, role: string, text: string }> {
    if (!snapshot) return [];

    const elements: Array<{ ref: string, role: string, text: string }> = [];
    const lines = snapshot.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();
      const refMatch = trimmedLine.match(/\[ref=([a-zA-Z0-9_-]+)\]/);

      if (refMatch) {
        const ref = refMatch[1];
        const textMatches = trimmedLine.match(/"([^"]*)"/g) || [];
        const texts = textMatches.map(t => t.replace(/"/g, ''));

        let role = '';
        if (trimmedLine.includes('textbox')) role = 'textbox';
        else if (trimmedLine.includes('button')) role = 'button';
        else if (trimmedLine.includes('link')) role = 'link';
        else if (trimmedLine.includes('checkbox')) role = 'checkbox';
        else if (trimmedLine.includes('combobox')) role = 'combobox';
        else role = 'element';

        if (ref && texts.length > 0) {
          elements.push({ ref, role, text: texts[0] || '' });
        }
      }
    }

    return elements.slice(0, 100); // 🔥 放宽到前100个元素
  }

  /**
   * 🔥 获取操作模式的系统提示词
   */
  private getOperationSystemPrompt(): string {
    return `你是一个顶级的测试自动化AI专家。你的核心职责是：

# 身份与能力
- 将自然语言操作指令转换为精确的JSON格式MCP命令
- 基于页面元素快照进行智能元素定位和操作解析
- 专注于处理明确的用户操作指令（点击、输入、滚动等）

# 操作模式原则
- 你处于【操作模式】，只处理明确的操作指令
- 如果指令看起来像断言或验证，请返回错误信息
- 只有具体的操作指令才应该被转换为MCP命令

# 核心参数规则
- element参数：必须是简洁的中文描述（如"用户名输入框"、"提交按钮"）
- ref参数：必须使用页面元素列表中的确切ref值
- 两个参数都是必需的，缺一不可
- ElementUI下拉组件：包含"el-input__inner"的readonly输入框是下拉触发器

# 下拉操作策略
- 打开下拉（包含"点击"、"展开"关键词）：点击readonly输入框触发器
- 选择下拉选项（包含"选择"、"选中"关键词）：点击已展开的listitem选项
- 关键区别：操作意图词汇决定目标元素类型

# 输出格式要求
<THOUGHTS>
1. 分析操作意图：检查是否包含"选择"、"选中"等选择关键词，还是"点击"、"展开"等打开关键词
2. 定位匹配的页面元素：选择操作应找listitem元素，打开操作应找textbox元素
3. 判断操作类型：根据操作意图和元素类型选择对应命令
4. 生成element描述和ref参数
5. 处理变量（如果需要）
6. 构建对应的MCP命令
</THOUGHTS>
<COMMAND>
{
  "name": "命令名称",
  "args": {...}
}
</COMMAND>

# 支持的MCP操作命令
## 核心交互
- 点击: {"name": "browser_click", "args": {"element": "元素描述", "ref": "element_ref"}}
- 双击: {"name": "browser_double_click", "args": {"element": "元素描述", "ref": "element_ref"}}
- 悬停: {"name": "browser_hover", "args": {"element": "元素描述", "ref": "element_ref"}}
- 输入: {"name": "browser_type", "args": {"element": "输入框描述", "ref": "input_ref", "text": "content"}}
- 清空: {"name": "browser_clear_input", "args": {"element": "输入框描述", "ref": "input_ref"}}
- 选择: {"name": "browser_select_option", "args": {"element": "下拉框描述", "ref": "select_ref", "value": "option_value"}}
- ElementUI下拉操作：
  - 打开下拉（"点击下拉栏"）：点击readonly textbox触发器
  - 选择选项（"选择XXX"）：点击展开的listitem选项
  - 元素识别：textbox=触发器，listitem=选项
  - 不要对自定义下拉使用browser_select_option
- 按键: {"name": "browser_press_key", "args": {"key": "Enter"}}

## 页面控制
- 导航: {"name": "browser_navigate", "args": {"url": "URL"}}
- 刷新: {"name": "browser_refresh", "args": {}}
- 后退: {"name": "browser_go_back", "args": {}}
- 前进: {"name": "browser_go_forward", "args": {}}

## 滚动操作
- 向下滚动: {"name": "browser_scroll_down", "args": {"pixels": 500}}
- 向上滚动: {"name": "browser_scroll_up", "args": {"pixels": 500}}
- 滚动到顶部: {"name": "browser_scroll_to_top", "args": {}}
- 滚动到底部: {"name": "browser_scroll_to_bottom", "args": {}}
- 滚动到元素: {"name": "browser_scroll_to_element", "args": {"element": "元素描述", "ref": "element_ref"}}
- 按像素滚动: {"name": "browser_scroll_by", "args": {"x": 0, "y": 500}}
- 滚动页面: {"name": "browser_scroll_page", "args": {"direction": "down", "pixels": 500}}

## 数据提取
- 获取文本: {"name": "browser_get_text", "args": {"element": "元素描述", "ref": "element_ref", "variable_name": "变量名"}}
- 获取属性: {"name": "browser_get_attribute", "args": {"element": "元素描述", "ref": "element_ref", "attribute": "属性名", "variable_name": "变量名"}}
- 获取URL: {"name": "browser_get_url", "args": {"variable_name": "变量名"}}

## 高级控制
- 等待: {"name": "browser_wait_for", "args": {"timeout": milliseconds}}
- 截图: {"name": "browser_screenshot", "args": {}}
- 切换iframe: {"name": "browser_switch_to_frame", "args": {"element": "iframe描述", "ref": "iframe_ref"}}
- 切换回主页面: {"name": "browser_switch_to_default", "args": {}}
- 处理弹窗: {"name": "browser_handle_alert", "args": {"action": "accept"}}`;
  }

  /**
   * 🔥 构建操作模式的用户提示词
   */
  private buildOperationUserPrompt(stepDescription: string, pageElements: Array<{ ref: string, role: string, text: string }>): string {
    const elementsContext = pageElements.length > 0
      ? pageElements.map(el => `[ref=${el.ref}] ${el.role} "${el.text}"`).join('\n')
      : "当前页面没有可用的交互元素。";

    return `# 当前任务：操作模式

## 当前页面可用元素
${elementsContext}

## 用户操作指令
"${stepDescription}"

## 分析要求
请将上述操作指令转换为MCP命令：
1. 确认这是一个明确的操作指令（而非断言验证）
2. **必须严格执行的下拉选择判定**：
   - 如果指令包含"选择"、"选中"关键词 → **必须**点击listitem选项元素，**绝不**点击textbox
   - 如果指令包含"点击"、"展开"关键词且无"选择" → 点击textbox触发器元素
   - 示例：
     * "下拉栏选择生鲜" → 点击listitem[生鲜]，不是textbox
     * "点击下拉栏" → 点击textbox触发器
3. **强制元素类型匹配**：
   - 选择操作：必须使用listitem元素的ref
   - 打开操作：必须使用textbox元素的ref
4. 在页面元素中找到最匹配的目标元素（严格按元素类型）
5. 生成简洁的中文element描述和准确的ref参数

请开始分析：`;
  }

  /**
   * 🔥 根据模式获取系统提示词
   */
  private getSystemPromptByMode(mode: 'operation' | 'assertion' | 'relevance_check' | 'update_generation'): string {
    switch (mode) {
      case 'operation':
        return this.getOperationSystemPrompt();
      case 'assertion':
        return this.getAssertionSystemPrompt();
      case 'relevance_check':
        return this.getRelevanceCheckSystemPrompt();
      case 'update_generation':
        return this.getUpdateGenerationSystemPrompt();
      default:
        return this.getOperationSystemPrompt();
    }
  }

  /**
   * 🔥 获取相关性检查的系统提示词
   */
  private getRelevanceCheckSystemPrompt(): string {
    return `你是一个专业的测试用例相关性分析AI专家。你的核心职责是：

# 身份与能力
- 精确分析测试用例与变更描述之间的相关性
- 基于功能、操作、UI元素、业务流程等多维度进行关联性判断
- 提供可信的相关性评分和详细的分析理由

# 分析原则
- **语义理解优先**：理解变更的实际业务含义，而不仅仅是关键词匹配
- **多维度评估**：从功能、操作、UI元素、业务流程等角度综合分析
- **细粒度判断**：即使是间接相关的情况也要准确识别和评分
- **准确性优先**：宁可保守评估，确保相关性判断的准确性

# 评分标准
- **0.9-1.0**: 直接相关，测试用例明确覆盖变更内容
- **0.7-0.8**: 高度相关，测试用例涉及变更影响的主要功能  
- **0.5-0.6**: 中度相关，测试用例可能受变更间接影响
- **0.3-0.4**: 低度相关，测试用例与变更有轻微关联
- **0.0-0.2**: 不相关，测试用例与变更无明显关联

# 输出要求
- 必须输出标准的JSON格式
- is_relevant字段：当相关性评分≥0.3时为true，否则为false
- relevance_score字段：0.0到1.0之间的数值
- recall_reason字段：详细说明相关性分析的依据和理由

# 分析思路
1. 解析变更描述的核心要素（功能、操作、UI元素等）
2. 分析测试用例覆盖的功能和操作流程
3. 识别两者之间的直接和间接关联
4. 综合评估相关性程度并给出评分
5. 提供清晰的分析理由`;
  }

  /**
   * 🔥 获取更新生成的系统提示词
   */
  private getUpdateGenerationSystemPrompt(): string {
    return `你是一个专业的测试用例自动化更新AI专家。你的核心职责是：

# 身份与能力
- 基于变更描述精确生成测试用例的JSON Patch修改方案
- 深度理解测试步骤的语义和业务逻辑
- 评估修改带来的副作用和风险等级
- 生成符合JSON Patch RFC 6902标准的修改指令

# 更新原则
- **精确定位**：仅修改与变更描述直接相关的测试步骤，不相关的步骤必须保持原样
- **内容保护**：除了步骤编号调整外，未涉及修改的步骤内容必须完全保持不变
- **语义保持**：确保更新后的测试步骤语义合理，逻辑连贯
- **最小变更**：只修改必要的部分，严格避免过度修改或无关修改
- **风险评估**：准确评估每个修改的潜在影响和风险等级
- **可回滚性**：生成的patch操作应该是可逆的

# JSON Patch操作类型
- **replace**: 替换现有值，格式 {"op":"replace", "path":"/steps/0/description", "value":"新描述"}
- **add**: 添加新字段，格式 {"op":"add", "path":"/steps/0/newField", "value":"新值"}  
- **remove**: 删除字段，格式 {"op":"remove", "path":"/steps/0/oldField"}

# 路径格式规范
- 步骤描述：/steps/索引/description
- 预期结果：/steps/索引/expectedResult
- 操作类型：/steps/索引/action
- 元素定位：/steps/索引/selector
- 输入值：/steps/索引/value

# 风险等级标准
- **low**: 简单文本修改，不影响业务逻辑
- **medium**: 涉及步骤顺序调整或重要参数修改
- **high**: 大幅修改测试逻辑或可能影响其他用例

# 重要约束条件
- **严格限制修改范围**：只能修改与变更描述明确相关的步骤
- **步骤编号例外**：当插入或删除步骤时，允许调整后续步骤的编号以保持连续性
- **内容完整性**：不相关步骤的描述、预期结果、操作类型等所有字段都必须保持原样
- **禁止无关优化**：不得对无关步骤进行任何形式的优化或改进

# 副作用评估
- **数据依赖**: 修改是否影响后续步骤的数据流
- **UI状态**: 修改是否改变页面状态或导航流程
- **业务逻辑**: 修改是否影响测试覆盖的业务流程完整性
- **用例关联**: 修改是否可能影响其他相关测试用例

# 输出要求
- 必须输出标准的JSON格式
- reasoning字段：详细的修改理由和分析过程
- patch字段：符合JSON Patch标准的修改操作数组
- side_effects字段：可能的副作用描述数组
- risk_level字段：overall风险等级评估

请确保生成的修改方案准确、可执行且风险可控。`;
  }

  /**
   * 🔥 获取断言模式的系统提示词
   */
  private getAssertionSystemPrompt(): string {
    return `你是一个专业的测试断言验证AI专家。你的核心职责是：

# 身份与能力
- 将自然语言断言描述转换为精确的JSON格式MCP验证命令
- 基于页面快照分析当前状态，选择最佳验证策略
- 专注于验证页面状态、文本内容、元素可见性等断言需求
- **关键能力：区分功能性问题和非功能性错误**

# 断言验证原则
- 你处于【断言验证模式】，只验证功能性内容，不执行操作
- 断言目标：验证页面当前状态是否符合预期
- 优先使用快照分析，必要时结合等待和截图验证
- **核心原则：忽略非功能性错误，专注核心功能验证**

# ⭐ 错误处理策略（关键）
## 应该忽略的错误（不影响断言结果）：
1. **Console JavaScript错误**：
   - TypeError: Failed to execute 'getComputedStyle' on 'Window'
   - TypeError: Cannot read properties of undefined
   - ReferenceError、SyntaxError等前端代码错误
   - 任何不影响页面核心功能展示的JS错误
2. **样式和渲染错误**：
   - CSS加载失败
   - 图片加载失败（除非断言明确要求验证图片）
   - 字体加载问题
3. **第三方库错误**：
   - 统计脚本错误
   - 广告加载失败
   - 第三方组件报错

## 应该关注的错误（影响断言结果）：
1. **业务逻辑错误**：
   - 数据显示错误（金额、数量、状态等与预期不符）
   - 核心功能失效（搜索无结果、提交失败、数据未加载）
2. **断言明确要求验证的内容**：
   - 断言描述中明确指出要检查的文本、元素、状态

# 验证策略选择
1. **文本内容验证** → 使用 browser_snapshot 获取页面状态供应用层分析
2. **元素可见性验证** → 使用 browser_wait_for 等待元素状态
3. **页面状态验证** → 使用 browser_snapshot 进行全面检查
4. **视觉证据保存** → 使用 browser_take_screenshot 保存验证截图

# ⭐ 判断标准（重要）
- ✅ **通过**：断言要求的核心功能/内容正确显示，即使有Console错误
- ❌ **失败**：断言要求的核心功能/内容缺失或错误
- ⚠️ **警告**：有次要错误但核心功能正常（应判定为通过）

## 判断流程
1. 提取断言的核心验证目标（要验证什么？）
2. 分析页面快照中的核心内容（数据是否存在？）
3. 过滤Console错误和非功能性问题（标记为"可忽略"）
4. 判断核心功能是否满足断言要求
5. 给出明确结论：通过/失败

# 输出格式要求
<THOUGHTS>
1. 分析断言类型（文本存在、元素可见性、页面内容等）
2. 确定验证策略（快照分析、等待验证、截图验证）
3. 定位相关元素（如果需要）
4. 构建验证命令
</THOUGHTS>
<COMMAND>
{
  "name": "命令名称",
  "args": {...}
}
</COMMAND>

# 支持的MCP断言命令
## 快照验证（推荐）
- 获取页面快照: {"name": "browser_snapshot", "args": {}}
  用途：获取页面完整状态供应用层分析文本内容、元素状态

## 等待验证
- 等待文本出现: {"name": "browser_wait_for", "args": {"text": "期望的文本内容"}}
- 等待文本消失: {"name": "browser_wait_for", "args": {"textGone": "不应该存在的文本"}}
- 等待元素可见: {"name": "browser_wait_for", "args": {"ref": "element_ref", "state": "visible"}}
- 等待元素隐藏: {"name": "browser_wait_for", "args": {"ref": "element_ref", "state": "hidden"}}

## 截图验证
- 截取页面截图: {"name": "browser_take_screenshot", "args": {"filename": "assertion_proof.png"}}
  用途：保存视觉证据，用于复杂UI状态验证

## 执行流程建议
1. 首选 browser_snapshot 获取页面状态进行文本和内容分析
2. 对于动态内容使用 browser_wait_for 等待特定状态
3. 可选使用 browser_take_screenshot 保存验证截图作为证据

# 重要提醒
- 由于Playwright MCP不提供专门的断言工具，主要通过快照分析实现验证
- element和ref参数规则与操作模式相同：element为中文描述，ref为页面元素的确切引用
- 断言失败将在应用层处理，你只需提供合适的验证命令`;
  }

  /**
   * 🔥 构建断言模式的用户提示词
   */
  private buildAssertionUserPrompt(assertionDescription: string, pageElements: Array<{ ref: string, role: string, text: string }>): string {
    const elementsContext = pageElements.length > 0
      ? pageElements.map(el => `[ref=${el.ref}] ${el.role} "${el.text}"`).join('\n')
      : "当前页面没有可用的交互元素。";

    return `# 当前断言验证任务

## ⭐ 验证目标（核心）
用户断言: "${assertionDescription}"

**请明确断言的核心验证目标**:
- 📊 数据验证: 验证特定数据、数量、金额、状态是否正确
- 📝 文本验证: 验证特定文本内容是否存在/消失
- 🎯 元素验证: 验证特定元素是否可见/隐藏
- 🔄 状态验证: 验证页面功能状态是否符合预期

## 当前页面可用元素
${elementsContext}

## ⚠️ 错误过滤原则（关键）
**注意：快照已预过滤Console错误，请专注于核心功能验证**

✅ **应该验证的**（功能性问题）：
- 断言要求的数据是否正确显示
- 断言要求的文本是否存在/消失
- 断言要求的元素是否可见/隐藏
- 断言要求的功能是否正常执行

❌ **应该忽略的**（非功能性问题）：
- JavaScript Console错误（TypeError、ReferenceError等）
- CSS样式错误
- 图片加载失败（除非断言明确要求验证图片）
- 第三方库错误

## 验证策略选择（按优先级）

### 1️⃣ 快照验证（首选）
**场景**: 验证文本内容、数据显示、页面状态
\`\`\`json
{"name": "browser_snapshot", "args": {}}
\`\`\`
**适用于**: 90%的断言场景 - 搜索结果、列表显示、表单内容等

### 2️⃣ 等待验证（动态内容）
**场景**: 需要等待加载或状态变化
\`\`\`json
// 等待文本出现
{"name": "browser_wait_for", "args": {"text": "预期文本"}}

// 等待元素可见
{"name": "browser_wait_for", "args": {"ref": "element_ref", "state": "visible"}}
\`\`\`
**适用于**: 异步加载、状态切换、弹窗出现等

### 3️⃣ 截图验证（复杂UI）
**场景**: 需要保存视觉证据
\`\`\`json
{"name": "browser_take_screenshot", "args": {"filename": "assertion_proof.png"}}
\`\`\`
**适用于**: 复杂布局验证、UI状态记录

## 验证步骤（逐步分析）

### Step 1: 明确核心目标
- 断言的核心验证点是什么？
- 成功标准是什么？

### Step 2: 选择验证策略
- 根据上述策略选择最合适的命令
- 优先使用 browser_snapshot（简单高效）

### Step 3: 构建验证命令
- 确保命令参数准确
- 避免过度验证（只验证核心功能）

### Step 4: 预期结果判断
- 如果核心功能正确 → 判定为 PASS
- 如果核心功能错误/缺失 → 判定为 FAIL
- Console错误不影响判断 → 仍应判定为 PASS

## 示例对比

### ✅ 好的断言（专注核心）
**断言**: "验证搜索结果包含'测试用例001'"
**分析**: 核心目标是验证文本存在
**命令**: {"name": "browser_snapshot", "args": {}}
**判断**: 文本存在即PASS，忽略Console错误

### ❌ 差的断言（过度敏感）
**断言**: "验证搜索结果包含'测试用例001'"
**错误做法**: 因为看到Console有18个TypeError就判定为FAIL
**问题**: 混淆了功能性问题和非功能性错误

---

请开始分析并生成验证命令（使用 <THOUGHTS> 和 <COMMAND> 格式）：`;
  }

  /**
   * 🔥 调用AI模型（支持多种模式）
   */
  private async callLLM(userPrompt: string, mode: 'operation' | 'assertion' | 'relevance_check' | 'update_generation' = 'operation'): Promise<string> {
    // 获取当前配置
    const currentConfig = await this.getCurrentConfig();
    const modelInfo = this.getCurrentModelInfo();

    console.log(`🚀 调用AI模型: ${modelInfo.modelName} (${mode}模式)`);
    console.log(`   模型标识: ${currentConfig.model}`);
    console.log(`   温度: ${currentConfig.temperature}, 最大令牌: ${currentConfig.maxTokens}`);
    console.log(`   运行模式: ${modelInfo.mode}`);

    try {
      const requestBody = {
        model: currentConfig.model,
        messages: [
          {
            role: 'system',
            content: this.getSystemPromptByMode(mode)
          },
          {
            role: 'user',
            content: userPrompt  // 🔥 具体任务和上下文
          }
        ],
        temperature: currentConfig.temperature,
        max_tokens: currentConfig.maxTokens
      };

      // 配置代理（如果环境变量中有配置）
      const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;

      const fetchOptions: any = {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentConfig.apiKey}`,
          'HTTP-Referer': 'https://testflow-ai.com',
          'X-Title': 'TestFlow AI Testing Platform',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      };

      // 如果配置了代理，使用 undici 的 ProxyAgent
      if (proxyUrl) {
        fetchOptions.dispatcher = new ProxyAgent(proxyUrl);
      }

      const response = await fetch(currentConfig.baseUrl + '/chat/completions', fetchOptions);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI API调用失败 (${response.status}): ${errorText}`);
      }

      const data = await response.json();

      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error(`AI API返回格式异常: ${JSON.stringify(data)}`);
      }

      const content = data.choices[0].message.content;

      if (!content || content.trim() === '') {
        throw new Error('AI返回空响应');
      }

      console.log(`🤖 AI响应 (${mode}模式): ${content.substring(0, 200)}...`);
      return content;

    } catch (error: any) {
      const modelInfo = this.getCurrentModelInfo();
      console.error(`❌ AI调用失败: ${modelInfo.modelName} (${mode}模式)`);
      console.error(`   错误详情: ${error.message}`);
      console.error(`   模型标识: ${currentConfig.model}`);
      console.error(`   运行模式: ${modelInfo.mode}`);

      // 增强错误信息
      if (error.message.includes('401')) {
        console.error(`   💡 建议: 请检查API密钥是否有效`);
      } else if (error.message.includes('429')) {
        console.error(`   💡 建议: API调用频率超限，请稍后重试`);
      } else if (error.message.includes('fetch')) {
        console.error(`   💡 建议: 请检查网络连接`);
      }

      throw error;
    }
  }

  /**
   * 🔥 AI批量更新：检查测试用例相关性
   */
  async checkTestCaseRelevance(changeBrief: string, testCase: any): Promise<{
    is_relevant: boolean;
    relevance_score: number;
    recall_reason: string;
  }> {
    console.log(`🔍 [AITestParser] 检查用例相关性: ${testCase.title || testCase.id}`);

    try {
      // 构建相关性检查的用户提示词
      const userPrompt = this.buildRelevanceCheckPrompt(changeBrief, testCase);

      // 调用AI模型进行相关性分析
      const aiResponse = await this.callLLM(userPrompt, 'relevance_check');

      // 解析AI相关性分析结果
      const result = this.parseRelevanceResponse(aiResponse);

      console.log(`✅ [AITestParser] 相关性检查完成: ${result.is_relevant ? '相关' : '不相关'} (${Math.round(result.relevance_score * 100)}%)`);
      return result;

    } catch (error: any) {
      console.error(`❌ [AITestParser] 相关性检查失败: ${error.message}`);
      // 回退到基本的关键词匹配
      return this.fallbackRelevanceCheck(changeBrief, testCase);
    }
  }

  /**
   * 🔥 AI批量更新：生成测试用例更新方案
   */
  async generateTestCaseUpdate(changeBrief: string, testCase: any): Promise<{
    reasoning: string;
    patch: Array<{ op: 'replace' | 'add' | 'remove'; path: string; value?: any; }>;
    side_effects: Array<{ description: string; severity: 'low' | 'medium' | 'high'; }>;
    risk_level: 'low' | 'medium' | 'high';
  }> {
    console.log(`🤖 [AITestParser] 生成用例更新: ${testCase.title || testCase.id}`);

    try {
      // 构建用例更新的用户提示词
      const userPrompt = this.buildUpdateGenerationPrompt(changeBrief, testCase);

      // 调用AI模型生成更新方案
      const aiResponse = await this.callLLM(userPrompt, 'update_generation');

      // 解析AI更新方案
      const result = this.parseUpdateResponse(aiResponse);

      console.log(`✅ [AITestParser] 更新方案生成完成: ${result.patch.length} 个修改`);
      return result;

    } catch (error: any) {
      console.error(`❌ [AITestParser] 更新方案生成失败: ${error.message}`);
      // 回退到基本的模式匹配
      return this.fallbackUpdateGeneration(changeBrief, testCase);
    }
  }

  /**
   * 🔥 解析AI响应为MCP命令 (支持V3格式)
   */
  private parseAIResponse(aiResponse: string): MCPCommand {
    try {
      console.log(`🔍 开始解析AI响应: ${aiResponse.substring(0, 200)}...`);

      let jsonText = aiResponse.trim();

      // 🔥 检查是否包含错误信息（在<THOUGHTS>或其他地方）
      if (jsonText.includes('<ERROR>') || jsonText.includes('用户指令不是具体的操作指令')) {
        // 提取错误信息
        const errorMatch = jsonText.match(/<ERROR>(.*?)<\/ERROR>/s) ||
          jsonText.match(/用户指令不是具体的操作指令[，。]?(.*)$/s);
        const errorMsg = errorMatch ? errorMatch[1].trim() : '用户指令不是具体的操作指令';
        console.log(`⚠️ AI返回错误信息: ${errorMsg}`);
        throw new Error(`AI解析失败: ${errorMsg}`);
      }

      // 🔥 V3格式: 尝试提取<COMMAND>标签中的内容
      const commandMatch = jsonText.match(/<COMMAND>\s*([\s\S]*?)\s*<\/COMMAND>/i);
      if (commandMatch) {
        jsonText = commandMatch[1].trim();
        console.log(`✅ 从<COMMAND>标签中提取JSON: ${jsonText}`);
      } else {
        // 🔥 兼容旧格式: 如果响应包含代码块，提取其中的JSON
        const codeBlockMatch = jsonText.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
        if (codeBlockMatch) {
          jsonText = codeBlockMatch[1].trim();
          console.log(`✅ 从代码块中提取JSON: ${jsonText}`);
        } else {
          // 🔥 兼容旧格式: 尝试提取JSON对象
          const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            jsonText = jsonMatch[0];
            console.log(`✅ 直接提取JSON对象: ${jsonText}`);
          } else {
            // 🔥 如果没有找到JSON，但包含<THOUGHTS>，说明AI没有按格式返回
            if (jsonText.includes('<THOUGHTS>')) {
              console.error(`❌ AI返回包含<THOUGHTS>但缺少<COMMAND>标签`);
              throw new Error('AI响应格式错误：包含思考过程但缺少命令部分');
            }
          }
        }
      }

      if (!jsonText || jsonText.trim() === '') {
        throw new Error('无法从AI响应中提取有效的JSON内容');
      }

      console.log(`🔍 最终解析的JSON: ${jsonText}`);

      // 🔥 新增：检查是否是错误响应
      if (jsonText.includes('"error"') && !jsonText.includes('"name"')) {
        const errorObj = JSON.parse(jsonText);
        if (errorObj.error) {
          console.log(`⚠️ AI返回错误信息: ${errorObj.error}`);
          throw new Error(`AI解析失败: ${errorObj.error}`);
        }
      }

      const parsed = JSON.parse(jsonText);

      // 验证基本结构
      if (!parsed.name || !parsed.args) {
        throw new Error('AI响应缺少必需的name或args字段');
      }

      console.log(`✅ AI响应解析成功: ${parsed.name}`);
      return {
        name: parsed.name,
        arguments: parsed.args
      };

    } catch (error: any) {
      console.error(`❌ AI响应解析失败: ${error.message}`);
      console.error(`📄 原始响应: ${aiResponse}`);
      throw new Error(`AI响应解析失败: ${error.message}`);
    }
  }

  /**
   * 🔥 构建相关性检查的AI提示词
   */
  private buildRelevanceCheckPrompt(changeBrief: string, testCase: any): string {
    return `# 测试用例相关性分析任务

## 变更描述
"${changeBrief}"

## 待分析的测试用例
**标题**: ${testCase.title || '未知标题'}
**系统**: ${testCase.system || '未知系统'} 
**模块**: ${testCase.module || '未知模块'}
**标签**: ${testCase.tags ? JSON.stringify(testCase.tags) : '无标签'}
**步骤**: 
${this.formatTestStepsForAI(testCase.steps)}

## 分析要求
请分析这个测试用例是否与变更描述相关，需要根据以下维度评估：

1. **功能相关性**：测试用例覆盖的功能是否与变更相关
2. **操作相关性**：测试步骤中的操作是否与变更提及的操作相关  
3. **UI元素相关性**：测试涉及的界面元素是否与变更相关
4. **业务流程相关性**：测试的业务流程是否受变更影响

## 输出格式
请严格按照以下JSON格式输出：
\`\`\`json
{
  "is_relevant": true/false,
  "relevance_score": 0.0-1.0的数值,
  "recall_reason": "详细说明相关/不相关的原因，包括具体的匹配点或分析依据"
}
\`\`\`

请开始分析：`;
  }

  /**
   * 🔥 构建更新生成的AI提示词
   */
  private buildUpdateGenerationPrompt(changeBrief: string, testCase: any): string {
    return `# 测试用例更新生成任务

## 变更描述
"${changeBrief}"

## 目标测试用例
**标题**: ${testCase.title || '未知标题'}
**系统**: ${testCase.system || '未知系统'}
**模块**: ${testCase.module || '未知模块'} 
**当前步骤**:
${this.formatTestStepsForAI(testCase.steps)}

## 任务要求
基于变更描述，为这个测试用例生成精确的JSON Patch修改方案：

1. **识别需要修改的步骤**：分析哪些测试步骤需要根据变更进行调整
2. **生成JSON Patch操作**：为每个需要修改的地方生成对应的patch操作
3. **评估副作用和风险**：分析修改可能带来的影响
4. **提供修改理由**：说明为什么要进行这些修改

## JSON Patch格式说明
- 操作类型：replace(替换), add(添加), remove(删除)
- 路径格式：\`/steps/0/description\` (修改第1个步骤的描述)
- 路径格式：\`/steps/1/expectedResult\` (修改第2个步骤的预期结果)

## 输出格式
请严格按照以下JSON格式输出：
\`\`\`json
{
  "reasoning": "详细的修改理由和分析过程",
  "patch": [
    {
      "op": "replace",
      "path": "/steps/索引/字段名", 
      "value": "新的值"
    }
  ],
  "side_effects": [
    {
      "description": "可能的副作用描述",
      "severity": "low/medium/high"
    }
  ],
  "risk_level": "low/medium/high"
}
\`\`\`

请开始分析并生成更新方案：`;
  }

  /**
   * 🔥 格式化测试步骤供AI分析
   */
  private formatTestStepsForAI(steps: any): string {
    // 🔥 添加调试日志，查看步骤数据
    console.log(`🔍 [AIParser] 调试测试步骤数据:`, {
      steps: steps,
      type: typeof steps,
      isArray: Array.isArray(steps),
      length: steps?.length,
      stringified: JSON.stringify(steps)
    });
    
    if (!steps) {
      return "无有效步骤";
    }

    // 🔥 处理JSON字符串格式的steps数据
    if (typeof steps === 'string') {
      try {
        const parsedSteps = JSON.parse(steps);
        if (parsedSteps.steps) {
          // 提取steps字段中的文本，按换行符分割
          const stepsText = parsedSteps.steps.replace(/\\n/g, '\n');
          const stepLines = stepsText.split('\n').filter(line => line.trim());
          console.log(`🔧 [AIParser] 解析JSON字符串步骤: ${stepLines.length} 个步骤`);
          
          // 格式化步骤文本
          const formattedSteps = stepLines.map((line, index) => {
            // 清理步骤编号，统一格式
            const cleanLine = line.replace(/^\d+[、。.]?\s*/, '').trim();
            return `${index + 1}. ${cleanLine}`;
          }).join('\n');
          
          // 如果有assertions字段，也添加进去
          if (parsedSteps.assertions && parsedSteps.assertions.trim()) {
            return `${formattedSteps}\n\n预期结果: ${parsedSteps.assertions}`;
          }
          
          return formattedSteps;
        }
      } catch (error) {
        console.warn(`⚠️ [AIParser] 解析JSON字符串步骤失败: ${error.message}`);
        // 如果JSON解析失败，将字符串当作步骤文本处理
        return `步骤信息: ${steps.substring(0, 200)}...`;
      }
    }
    
    // 🔥 处理数组格式的steps数据（原有逻辑）
    if (!Array.isArray(steps)) {
      return "无有效步骤";
    }

    return steps.map((step, index) => {
      const stepNum = index + 1;
      let stepText = `${stepNum}. `;
      
      if (step.description) {
        stepText += step.description;
      }
      
      if (step.expectedResult) {
        stepText += ` [预期结果: ${step.expectedResult}]`;
      }
      
      if (step.action) {
        stepText += ` [操作: ${step.action}]`;
      }
      
      return stepText;
    }).join('\n');
  }

  /**
   * 🔥 解析AI相关性分析响应
   */
  private parseRelevanceResponse(aiResponse: string): {
    is_relevant: boolean;
    relevance_score: number;
    recall_reason: string;
  } {
    try {
      console.log(`🔍 解析相关性AI响应: ${aiResponse.substring(0, 200)}...`);

      let jsonText = aiResponse.trim();

      // 提取JSON内容
      const jsonMatch = jsonText.match(/```(?:json)?\n?([\s\S]*?)\n?```/) || 
                       jsonText.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        jsonText = jsonMatch[1] || jsonMatch[0];
      }

      const parsed = JSON.parse(jsonText);

      // 验证必需字段
      if (typeof parsed.is_relevant !== 'boolean') {
        throw new Error('缺少is_relevant字段或类型不正确');
      }

      const result = {
        is_relevant: parsed.is_relevant,
        relevance_score: typeof parsed.relevance_score === 'number' ? 
          Math.max(0, Math.min(1, parsed.relevance_score)) : 0.5,
        recall_reason: parsed.recall_reason || '未提供原因'
      };

      console.log(`✅ 相关性解析成功: ${result.is_relevant} (${Math.round(result.relevance_score * 100)}%)`);
      return result;

    } catch (error: any) {
      console.error(`❌ 相关性响应解析失败: ${error.message}`);
      throw new Error(`相关性响应解析失败: ${error.message}`);
    }
  }

  /**
   * 🔥 解析AI更新生成响应
   */
  private parseUpdateResponse(aiResponse: string): {
    reasoning: string;
    patch: Array<{ op: 'replace' | 'add' | 'remove'; path: string; value?: any; }>;
    side_effects: Array<{ description: string; severity: 'low' | 'medium' | 'high'; }>;
    risk_level: 'low' | 'medium' | 'high';
  } {
    try {
      console.log(`🔍 解析更新AI响应: ${aiResponse.substring(0, 200)}...`);

      let jsonText = aiResponse.trim();

      // 提取JSON内容
      const jsonMatch = jsonText.match(/```(?:json)?\n?([\s\S]*?)\n?```/) || 
                       jsonText.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        jsonText = jsonMatch[1] || jsonMatch[0];
      }

      const parsed = JSON.parse(jsonText);

      // 验证并规范化数据
      const result = {
        reasoning: parsed.reasoning || '未提供修改理由',
        patch: Array.isArray(parsed.patch) ? parsed.patch.filter(p => 
          p.op && p.path && ['replace', 'add', 'remove'].includes(p.op)
        ) : [],
        side_effects: Array.isArray(parsed.side_effects) ? parsed.side_effects.filter(se => 
          se.description && ['low', 'medium', 'high'].includes(se.severity)
        ) : [],
        risk_level: ['low', 'medium', 'high'].includes(parsed.risk_level) ? 
          parsed.risk_level : 'medium'
      };

      console.log(`✅ 更新方案解析成功: ${result.patch.length} 个patch操作`);
      return result;

    } catch (error: any) {
      console.error(`❌ 更新响应解析失败: ${error.message}`);
      throw new Error(`更新响应解析失败: ${error.message}`);
    }
  }

  /**
   * 🔥 回退相关性检查方法
   */
  private fallbackRelevanceCheck(changeBrief: string, testCase: any): {
    is_relevant: boolean;
    relevance_score: number;
    recall_reason: string;
  } {
    console.log(`⚠️ [AITestParser] 使用回退相关性检查`);

    const caseText = `${testCase.title || ''} ${JSON.stringify(testCase.steps || {})}`.toLowerCase();
    const changeText = changeBrief.toLowerCase();
    
    // 基于关键词匹配的简单相关性判断
    const keywords = changeText.split(/\s+/).filter(w => w.length > 2);
    let matchCount = 0;
    
    for (const keyword of keywords) {
      if (caseText.includes(keyword)) {
        matchCount++;
      }
    }
    
    const relevanceScore = matchCount / Math.max(keywords.length, 1);
    const isRelevant = relevanceScore > 0.1;
    
    return {
      is_relevant: isRelevant,
      relevance_score: relevanceScore,
      recall_reason: isRelevant ? 
        `关键词匹配 ${matchCount}/${keywords.length} (回退模式)` : 
        '无关键词匹配 (回退模式)'
    };
  }

  /**
   * 🔥 回退更新生成方法
   */
  private fallbackUpdateGeneration(changeBrief: string, testCase: any): {
    reasoning: string;
    patch: Array<{ op: 'replace' | 'add' | 'remove'; path: string; value?: any; }>;
    side_effects: Array<{ description: string; severity: 'low' | 'medium' | 'high'; }>;
    risk_level: 'low' | 'medium' | 'high';
  } {
    console.log(`⚠️ [AITestParser] 使用回退更新生成`);

    const patches: Array<{ op: 'replace' | 'add' | 'remove'; path: string; value?: any; }> = [];
    
    // 简单的模式匹配更新
    if (!testCase.steps || !Array.isArray(testCase.steps)) {
      return {
        reasoning: `测试用例步骤格式无效 (回退模式)`,
        patch: [],
        side_effects: [],
        risk_level: 'low'
      };
    }

    // 示例：如果变更涉及"弹窗"，则修改相关步骤
    if (changeBrief.includes('弹窗') || changeBrief.includes('模态')) {
      for (let i = 0; i < testCase.steps.length; i++) {
        const step = testCase.steps[i];
        if (step.description && step.description.includes('跳转')) {
          patches.push({
            op: 'replace',
            path: `/steps/${i}/description`,
            value: step.description.replace('跳转', '显示弹窗')
          });
        }
      }
    }

    return {
      reasoning: `基于变更描述"${changeBrief}"，使用模式匹配识别并修改了相关的测试步骤 (回退模式)`,
      patch: patches,
      side_effects: patches.length > 0 ? [{
        description: '可能影响页面流转逻辑 (回退模式分析)',
        severity: 'medium' as const
      }] : [],
      risk_level: patches.length > 2 ? 'high' : patches.length > 0 ? 'medium' : 'low'
    };
  }
}