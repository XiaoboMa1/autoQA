import type { AxureParseResult } from '../types/axure.js';
import type {
  PreAnalysisResult,
  UncertainInfo,
  UncertainInfoType,
  ImportanceLevel
} from '../types/aiPreAnalysis.js';
import { llmConfigManager } from '../../src/services/llmConfigManager.js';
import type { LLMConfig } from './aiParser.js';
import { v4 as uuidv4 } from 'uuid';
import { ProxyAgent } from 'undici';

/**
 * AI预分析服务
 * 目标：快速识别原型中的"不确定点"，生成精准的问题列表供用户确认
 * 性能要求：10秒内完成
 */
export class AIPreAnalysisService {
  private useConfigManager: boolean = true;

  constructor() {
    console.log('🔍 AI预分析服务已初始化');
  }

  /**
   * 初始化配置管理器
   */
  private async initializeConfigManager(): Promise<void> {
    try {
      if (!llmConfigManager.isReady()) {
        await llmConfigManager.initialize();
      }
      console.log('🔧 AI预分析服务配置已加载');
    } catch (error) {
      console.error('❌ 配置管理器初始化失败:', error);
      this.useConfigManager = false;
    }
  }

  /**
   * 获取当前LLM配置
   */
  private async getCurrentConfig(): Promise<LLMConfig> {
    if (this.useConfigManager) {
      try {
        if (!llmConfigManager.isReady()) {
          await Promise.race([
            this.initializeConfigManager(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('配置管理器初始化超时')), 5000)
            )
          ]);
        }

        if (llmConfigManager.isReady()) {
          const config = llmConfigManager.getCurrentConfig();
          console.log(`🔧 使用配置管理器配置: ${config.model}`);
          return config;
        }
      } catch (error: any) {
        console.error('❌ 配置管理器初始化失败，回退到默认配置:', error.message);
        this.useConfigManager = false;
      }
    }

    // 回退到默认配置(从环境变量读取)
    const defaultConfig = {
      apiKey: process.env.OPENROUTER_API_KEY || '',
      baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
      model: process.env.DEFAULT_MODEL || 'openai/gpt-4o',
      temperature: parseFloat(process.env.DEFAULT_TEMPERATURE || '0.2'),
      maxTokens: parseInt(process.env.DEFAULT_MAX_TOKENS || '3000')
    };

    if (!defaultConfig.apiKey || defaultConfig.apiKey === '') {
      console.error('❌ API Key 未配置！');
      throw new Error('API Key 未配置');
    }

    console.log(`⚠️ 使用默认配置: ${defaultConfig.model}`);
    return defaultConfig;
  }

  /**
   * 执行AI预分析
   * @param sessionId 会话ID
   * @param axureData Axure解析结果
   * @returns 预分析结果
   */
  async preAnalyze(
    sessionId: string,
    axureData: AxureParseResult
  ): Promise<PreAnalysisResult> {
    console.log(`\n🔍 [AI预分析] 开始分析会话 ${sessionId}...`);
    console.log(`   📊 输入数据: ${axureData.pageCount}页, ${axureData.elementCount}元素`);

    const systemPrompt = `你是需求分析专家。你的任务是**快速预分析**Axure原型，识别出：
1. 你很确定的信息（clearInfo）
2. 你不确定的关键信息（uncertainInfo）- 需要用户确认
3. 完全缺失的关键信息（missingCritical）

🎯 核心目标：
- 快速识别"不确定的关键点"，而不是生成完整需求文档
- 提出精准的问题，避免问用户已经明确的内容
- 优先级分级：high（必须确认）> medium（建议确认）> low（可选）

📊 不确定信息类型：
1. **pageType**: 🔥 页面类型不明确（这是最重要的问题！必须首先确认！）
   - 重要性：⭐⭐⭐⭐⭐ 必须确认！页面类型决定了后续如何解析所有字段！
   - 可选值：
     * list（列表页）：有查询条件区域 + 数据列表表格
     * form（表单页）：主要用于新建/编辑数据，有"保存"/"提交"按钮
     * detail（详情页）：只读展示，无输入框
     * mixed（混合页）：包含多种功能
   - 判断规则：
     * 如果页面顶部有输入框/下拉框 + 底部有表格 → **很可能是列表页**
     * 如果页面有很多输入框 + 底部有"保存"按钮 → 可能是表单页
     * 如果页面只有文本展示，无输入框 → 可能是详情页
   - 示例问题："这个页面是列表页（查询+展示）还是表单页（录入数据）？"
   - importance: **必须是 high**

2. **enumValues**: 下拉框/单选框的可选值不明确
   - 示例：订单状态有哪些可选值？

3. **businessRule**: 业务规则不明确（🔥 重点关注按钮操作的规则！）
   - 示例：删除订单的条件是什么？审核通过后执行什么操作？
   - ⚠️ **重要**: 对于每个关键按钮（如"删除"、"审核"、"提交"、"导出"等），必须询问其业务规则！
   - 提问模板：
     * "点击【按钮名称】按钮的条件/限制是什么？"
     * "【按钮名称】操作需要二次确认吗？"
     * "【按钮名称】操作成功后会有什么结果？"

4. **fieldMeaning**: 字段含义不明确（特别是简写字段）
   - 示例：sn、no、code 这些字段代表什么？

5. **validationRule**: 校验规则不明确
   - 示例：手机号格式？金额范围？

6. **fieldRequired**: 必填项不明确
   - 示例：新增订单时哪些字段必填？

7. **workflow**: 流程逻辑不明确
   - 示例：审核通过后的操作？超时处理？

🚫 不要问的问题：
- 原型中已经明确标注了"*"的必填项
- 已经有明确label的字段含义
- 已经在原型中写明的枚举值（如单选按钮的选项文字）

📤 输出格式（严格JSON）：
\`\`\`json
{
  "confidence": 0.75,
  "clearInfo": [
    "订单列表页包含5个查询条件：订单号、下单时间、订单状态、收货人、联系电话",
    "列表操作列包含：查看、编辑、删除按钮"
  ],
  "uncertainInfo": [
    {
      "id": "unc-1",
      "type": "enumValues",
      "field": "订单状态",
      "question": "订单状态的完整可选值有哪些？",
      "aiGuess": ["待支付", "已支付", "已发货", "已完成"],
      "importance": "high",
      "context": {
        "pageName": "订单列表页",
        "elementType": "select"
      }
    },
    {
      "id": "unc-2",
      "type": "businessRule",
      "trigger": "点击删除订单按钮",
      "question": "删除订单的业务规则是什么？（哪些状态可删除？需要二次确认吗？）",
      "aiGuess": ["只能删除待支付订单", "需要弹窗二次确认"],
      "importance": "high",
      "context": {
        "pageName": "订单列表页"
      }
    }
  ],
  "missingCritical": [
    "订单金额的计算规则（是否含运费？是否含税？）"
  ],
  "statistics": {
    "totalFields": 25,
    "certainFields": 18,
    "uncertainFields": 7
  }
}
\`\`\`

⚠️ 重要约束：
1. uncertainInfo 数组最多15个（只问最关键的）
2. 每个问题必须明确、可回答
3. aiGuess 必须是合理的推测，不要乱猜
4. importance 必须合理分级（避免所有都是high）
5. 必须返回有效的JSON，不要有注释`;

    const userPrompt = `请快速预分析以下Axure原型数据，识别不确定的关键信息：

## 原型数据概览
- 页面数量: ${axureData.pageCount}
- 元素数量: ${axureData.elementCount}
- 交互数量: ${axureData.interactionCount}

## 页面详情
${this.buildPageSummary(axureData)}

🎯 **分析重点**:
1. **首先确认页面类型**（list/form/detail/mixed）- 这是最重要的！
2. **重点关注所有按钮的业务规则** - 每个关键按钮（删除、审核、导出、提交等）都应该询问其操作条件和规则
3. 识别下拉框的可选值
4. 识别简写字段的含义
5. 识别必填项和校验规则

请输出JSON格式的预分析结果，专注于"不确定的关键点"。`;

    try {
      console.log(`   🚀 [AI预分析] 调用大模型API...`);
      const startTime = Date.now();

      const aiResponse = await this.callAI(systemPrompt, userPrompt, 3000);

      const duration = Date.now() - startTime;
      console.log(`   ✅ [AI预分析] 完成 (耗时: ${duration}ms)`);

      // 解析JSON
      const jsonMatch = aiResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || aiResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('AI响应格式错误，无法解析JSON');
      }

      const result: PreAnalysisResult = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      result.sessionId = sessionId;

      // 为每个不确定信息生成唯一ID（如果没有）并验证数据
      result.uncertainInfo.forEach((info, index) => {
        if (!info.id) {
          info.id = `unc-${uuidv4().substring(0, 8)}`;
        }
        // 🔧 确保aiGuess是数组（AI有时会返回字符串或忘记提供）
        if (!info.aiGuess) {
          info.aiGuess = [];
        } else if (!Array.isArray(info.aiGuess)) {
          // 如果是字符串，转换成数组
          if (typeof info.aiGuess === 'string') {
            info.aiGuess = [info.aiGuess];
          } else {
            info.aiGuess = [];
          }
        }
        // 确保context存在
        if (!info.context) {
          info.context = { pageName: '未知页面' };
        }
      });

      console.log(`   📊 [AI预分析] 结果统计:`);
      console.log(`      - 置信度: ${(result.confidence * 100).toFixed(1)}%`);
      console.log(`      - 确定信息: ${result.clearInfo.length}条`);
      console.log(`      - 不确定信息: ${result.uncertainInfo.length}条`);
      console.log(`         * 高优先级: ${result.uncertainInfo.filter(i => i.importance === 'high').length}条`);
      console.log(`         * 中优先级: ${result.uncertainInfo.filter(i => i.importance === 'medium').length}条`);
      console.log(`         * 低优先级: ${result.uncertainInfo.filter(i => i.importance === 'low').length}条`);
      console.log(`      - 缺失关键信息: ${result.missingCritical.length}条\n`);

      return result;

    } catch (error: any) {
      console.error(`   ❌ [AI预分析] 失败: ${error.message}`);

      // 回退方案：返回空的预分析结果
      return {
        sessionId,
        confidence: 0.5,
        clearInfo: ['原型解析成功，但AI预分析失败，将使用原始数据生成需求文档'],
        uncertainInfo: [],
        missingCritical: ['AI预分析失败，建议手动补充业务规则'],
        statistics: {
          totalFields: axureData.elementCount,
          certainFields: Math.floor(axureData.elementCount * 0.5),
          uncertainFields: Math.ceil(axureData.elementCount * 0.5)
        }
      };
    }
  }

  /**
   * 构建页面摘要（简化版，避免token过多）
   */
  private buildPageSummary(axureData: AxureParseResult): string {
    return axureData.pages.slice(0, 10).map((page, index) => {
      const inputElements = page.elements.filter(e => e.type === 'input' || e.type === 'select');
      const buttonElements = page.elements.filter(e => e.type === 'button');
      const tableElements = page.elements.filter(e => e.type === 'table' || e.name?.includes('表格') || e.name?.includes('列表'));

      // 构建输入元素摘要
      const inputSummary = inputElements.length > 0
        ? `\n  输入框/下拉框: ${inputElements.length}个\n    ${inputElements.slice(0, 5).map(e => `"${e.name || e.placeholder || '未命名'}" (${e.type})`).join(', ')}${inputElements.length > 5 ? '...' : ''}`
        : '';

      // 🔥 构建按钮摘要（显示所有按钮名称，这很重要！）
      const buttonSummary = buttonElements.length > 0
        ? `\n  按钮: ${buttonElements.length}个\n    ${buttonElements.map(e => `"${e.text || e.name || '未命名'}"`).join(', ')}`
        : '';

      // 构建表格/列表摘要
      const tableSummary = tableElements.length > 0
        ? `\n  表格/列表: ${tableElements.length}个`
        : '';

      return `### 页面${index + 1}: ${page.name || '未命名'}
- 元素总数: ${page.elements.length}${inputSummary}${buttonSummary}${tableSummary}`;
    }).join('\n\n');
  }

  /**
   * 调用AI模型
   */
  private async callAI(systemPrompt: string, userPrompt: string, maxTokens: number): Promise<string> {
    const config = await this.getCurrentConfig();

    console.log(`   🚀 调用AI模型: ${config.model}`);

    try {
      const requestBody = {
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.2, // 预分析需要更稳定的输出
        max_tokens: maxTokens
      };

      const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;

      const fetchOptions: any = {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'HTTP-Referer': 'https://testflow-ai.com',
          'X-Title': 'TestFlow AI Testing Platform',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      };

      if (proxyUrl) {
        console.log(`   🌐 使用代理: ${proxyUrl}`);
        fetchOptions.dispatcher = new ProxyAgent(proxyUrl);
      }

      const response = await fetch(config.baseUrl + '/chat/completions', fetchOptions);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`   ❌ AI API错误: ${errorText}`);
        throw new Error(`AI API调用失败 (${response.status}): ${errorText}`);
      }

      const data = await response.json();

      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('AI API返回格式异常');
      }

      const content = data.choices[0].message.content;
      console.log(`   ✅ AI响应成功 (${content.length}字符)`);

      return content;
    } catch (error: any) {
      console.error(`   ❌ AI调用失败: ${error.message}`);
      throw error;
    }
  }
}

export const aiPreAnalysisService = new AIPreAnalysisService();
