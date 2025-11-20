import type { AxureParseResult, PageMode, PlatformType } from '../types/axure.js';
import type { EnhancedAxureData } from '../types/aiPreAnalysis.js';
import { llmConfigManager } from '../../src/services/llmConfigManager.js';
import type { LLMConfig } from './aiParser.js';
import { ProxyAgent } from 'undici';
import { TestCaseKnowledgeBase } from './testCaseKnowledgeBase.js';
import { getWebRequirementPrompt } from '../prompts/web-requirement.prompt.js';
import { getMobileRequirementPrompt } from '../prompts/mobile-requirement.prompt.js';
import { getUserPrompt, getBusinessRulesSystemPrompt, getCommonSystemInstructions } from '../prompts/common-instructions.js';

/**
 * 项目信息
 */
export interface ProjectInfo {
  systemName?: string;      // 系统名称
  moduleName?: string;       // 模块名称
  platformType?: PlatformType; // 平台类型(web/mobile)
  businessRules?: string[];  // 补充业务规则
}

/**
 * 批次信息
 */
export interface Batch {
  id: string;
  name: string;
  priority: string;
  scenarios: string[];
  estimatedCount: number;
}

/**
 * 🆕 测试模块（阶段1输出）
 */
export interface TestModule {
  id: string;
  name: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  relatedSections: string[]; // 关联的章节ID，如 ["1.1", "1.2"]
  testPurposes?: TestPurpose[]; // 可选，阶段2生成后才有
}

/**
 * 🆕 测试目的（阶段2输出）
 */
export interface TestPurpose {
  id: string;
  name: string;
  description: string;
  coverageAreas: string; // 逗号分隔的覆盖范围
  estimatedTestPoints: number;
  priority: 'high' | 'medium' | 'low';
  testCase?: TestCase; // 可选，阶段3生成后才有
}

/**
 * 测试点
 */
export interface TestPoint {
  testPurpose?: string; // 🆕 测试目的（每个测试点都应该有）
  testPoint: string;
  steps: string;
  expectedResult: string;
  riskLevel?: string;
}

/**
 * 测试用例
 */
export interface TestCase {
  name: string;
  description: string;
  steps: string;
  assertions: string;
  priority: string;
  tags: string[];
  system: string;
  module: string;
  testType?: string;
  preconditions?: string;
  testData?: string;
  // 新增字段
  testPurpose?: string; // 测试目的
  testPoints?: TestPoint[]; // 测试点数组
  sectionId?: string; // 章节ID (1.1, 1.2)
  sectionName?: string; // 章节名称
  coverageAreas?: string; // 覆盖范围
}

/**
 * 功能测试用例AI生成服务
 */
export class FunctionalTestCaseAIService {
  private useConfigManager: boolean = true;
  private knowledgeBase: TestCaseKnowledgeBase | null = null; // 🔥 改为可选
  private knowledgeBaseAvailable: boolean = false;

  constructor() {
    console.log('🤖 功能测试用例AI服务已初始化');

    // 🔥 不再在构造函数中初始化知识库，改为在使用时动态初始化
    console.log('💡 知识库服务将按需动态初始化（支持多系统）');
  }

  /**
   * 🔥 新增：获取或创建指定系统的知识库实例
   */
  private getKnowledgeBase(systemName?: string): TestCaseKnowledgeBase {
    // 每次都创建新实例,确保使用正确的系统集合
    return new TestCaseKnowledgeBase(systemName);
  }

  /**
   * 初始化配置管理器
   */
  private async initializeConfigManager(): Promise<void> {
    try {
      if (!llmConfigManager.isReady()) {
        await llmConfigManager.initialize();
      }
      console.log('🔧 功能测试用例AI服务配置已加载');
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

    // 回退到默认配置（从环境变量读取）
    const defaultConfig = {
      apiKey: process.env.OPENROUTER_API_KEY || '',
      baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
      model: process.env.DEFAULT_MODEL || 'openai/gpt-4o',
      temperature: parseFloat(process.env.DEFAULT_TEMPERATURE || '0.3'),
      maxTokens: parseInt(process.env.DEFAULT_MAX_TOKENS || '4000')
    };

    // 验证配置有效性
    if (!defaultConfig.apiKey || defaultConfig.apiKey === '') {
      console.error('❌ API Key 未配置！请在 .env 文件中设置 OPENROUTER_API_KEY');
      throw new Error('API Key 未配置，无法调用 AI 服务');
    }

    console.log(`⚠️ 使用默认配置: ${defaultConfig.model}`);
    console.log(`🔑 API Key 来源: ${process.env.OPENROUTER_API_KEY ? '环境变量' : '硬编码回退值'}`);
    return defaultConfig;
  }

  /**
   * 调用AI模型
   */
  private async callAI(systemPrompt: string, userPrompt: string, maxTokens?: number): Promise<string> {
    const config = await this.getCurrentConfig();

    console.log(`🚀 调用AI模型: ${config.model}`);
    console.log(`📍 API端点: ${config.baseUrl}/chat/completions`);
    console.log(`🔑 API Key状态: ${config.apiKey ? '已设置 (长度: ' + config.apiKey.length + ')' : '❌ 未设置'}`);
    console.log(`🌡️ Temperature: ${config.temperature}, Max Tokens: ${maxTokens || config.maxTokens}`);

    try {
      const requestBody = {
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: config.temperature,
        max_tokens: maxTokens || config.maxTokens
      };

      console.log(`📤 发送请求到 OpenRouter...`);

      // 配置代理（如果环境变量中有配置）
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

      // 如果配置了代理，使用 undici 的 ProxyAgent
      if (proxyUrl) {
        console.log(`🌐 使用代理: ${proxyUrl}`);
        fetchOptions.dispatcher = new ProxyAgent(proxyUrl);
      } else {
        console.log(`📡 直连模式（未配置代理）`);
      }

      const response = await fetch(config.baseUrl + '/chat/completions', fetchOptions);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ AI API错误详情: ${errorText}`);
        console.error(`❌ 请求模型: ${config.model}`);
        console.error(`❌ 请求URL: ${config.baseUrl}/chat/completions`);

        // 区分不同的错误类型
        if (response.status === 401) {
          throw new Error(`❌ 认证失败 (401): API Key无效或已过期。请检查 .env 文件中的 OPENROUTER_API_KEY`);
        } else if (response.status === 429) {
          throw new Error(`❌ 请求限流 (429): API调用频率过高，请稍后重试`);
        } else if (response.status === 402) {
          throw new Error(`❌ 配额不足 (402): OpenRouter账户余额不足，请充值`);
        } else if (response.status === 404) {
          throw new Error(`❌ 模型不存在 (404): 模型 "${config.model}" 在OpenRouter上不可用`);
        } else if (response.status >= 500) {
          throw new Error(`❌ 服务器错误 (${response.status}): OpenRouter服务异常，请稍后重试`);
        } else {
          throw new Error(`AI API调用失败 (${response.status}): ${errorText}`);
        }
      }

      const data = await response.json();

      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        console.error(`❌ API返回数据格式异常:`, JSON.stringify(data, null, 2));
        throw new Error(`AI API返回格式异常: 缺少 choices 或 message 字段`);
      }

      const content = data.choices[0].message.content;
      console.log(`✅ AI响应成功 (${content.length}字符)`);

      return content;
    } catch (error: any) {
      // 增强错误日志
      if (error.name === 'TypeError' && error.message === 'fetch failed') {
        console.error(`❌ 网络请求失败: 无法连接到 ${config.baseUrl}`);
        console.error(`💡 可能原因:`);
        console.error(`   1. 网络连接问题（请检查网络设置）`);
        console.error(`   2. API端点不可达（请检查防火墙/代理设置）`);
        console.error(`   3. DNS解析失败（请检查DNS配置）`);
        throw new Error(`❌ 网络连接失败: 无法访问 OpenRouter API。请检查网络连接。`);
      }

      console.error(`❌ AI调用失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 生成需求文档（支持增强数据）
   * @param axureData Axure解析结果
   * @param projectInfo 项目信息
   * @param enhancedData 增强数据（可选，来自用户确认）
   */
  async generateRequirementDoc(
    axureData: AxureParseResult,
    projectInfo: ProjectInfo,
    enhancedData?: EnhancedAxureData
  ): Promise<{ requirementDoc: string; completeness: number; suggestions: string[] }> {
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║           🤖 开始生成需求文档 - 详细日志模式                ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    // 📊 输入数据日志
    console.log('📊 【步骤 1/5】输入数据统计:');
    console.log(`   - 系统名称: ${projectInfo.systemName || '未指定'}`);
    console.log(`   - 模块名称: ${projectInfo.moduleName || '未指定'}`);
    console.log(`   - 业务规则数量: ${projectInfo.businessRules?.length || 0}`);
    console.log(`   - Axure 页面数: ${axureData.pageCount}`);
    console.log(`   - Axure 元素数: ${axureData.elementCount}`);
    console.log(`   - Axure 交互数: ${axureData.interactionCount}\n`);

    // 📄 详细页面信息
    console.log('📄 【步骤 2/5】Axure 页面详情:');
    (axureData.pages || []).forEach((page, index) => {
      console.log(`\n   页面 ${index + 1}: "${page.name || '未命名'}"`);
      console.log(`      - 元素数量: ${(page.elements || []).length}`);
      console.log(`      - 交互数量: ${(page.interactions || []).length}`);

      // 显示前5个元素
      if ((page.elements || []).length > 0) {
        console.log(`      - 主要元素:`);
        (page.elements || []).slice(0, 5).forEach(elem => {
          const displayText = elem.text ? `"${elem.text}"` : (elem.placeholder ? `[${elem.placeholder}]` : (elem.name || '未命名'));
          console.log(`         • ${elem.type}: ${displayText}`);
        });
        if ((page.elements || []).length > 5) {
          console.log(`         ... 还有 ${(page.elements || []).length - 5} 个元素`);
        }
      }
    });
    console.log('');

    // 🆕 构建增强上下文（如果有用户确认数据）
    let enhancedContext = '';
    if (enhancedData) {
      console.log('✅ 检测到用户确认的增强数据，将注入到AI提示词中...');
      console.log('   🔥 页面类型:', enhancedData.enrichedInfo.pageType);
      console.log('   📊 确认的枚举数量:', Object.keys(enhancedData.enrichedInfo.confirmedEnums).length);
      console.log('   📊 确认的规则数量:', enhancedData.enrichedInfo.confirmedRules.length);
      enhancedContext = this.buildEnhancedContext(enhancedData);
      console.log('   📝 增强上下文长度:', enhancedContext.length, '字符');
      if (enhancedContext.length > 0) {
        console.log('   ✅ 增强上下文预览:\n', enhancedContext.substring(0, 500) + '...');
      }
    }

    const systemPrompt = `你是需求分析专家，基于Axure原型生成详细的功能需求文档。

${enhancedContext}

🚨 核心原则（必须严格遵守）:
1. 严格基于用户上传的实际原型内容，禁止编造任何字段或功能
2. 每个功能、字段都必须注明来源：(来源: 页面名-元素名)
3. 不确定的部分必须标注[待确认]或[推断]
4. 主业务页面为主，弹窗/导航归属到主页面
5. 🚫 绝对禁止输出任何示例占位符或自己编造的字段名

📋 必须包含的内容:

**一、页面结构（仅当原型中存在时才写）**

⚠️ **重要：首先识别页面类型，然后根据页面类型生成对应章节！**

🔍 **页面类型识别规则**：
- **列表页（list）**：包含"查询"/"搜索"按钮，主要展示数据列表
  → 需要生成：查询条件、列表展示字段、操作按钮
- **表单页（form）**：包含"保存"/"提交"按钮，主要用于新建/编辑数据
  → 需要生成：表单字段、操作按钮（不要生成查询条件）
- **详情页（detail）**：只读展示，无输入框，包含大量展示内容
  → 需要生成：详情展示字段、操作按钮（不要生成查询条件）
- **弹窗页（dialog）**：独立弹窗，根据内容判断是表单还是详情
- **混合页（mixed）**：包含多种功能，根据实际情况生成
- **未知页（unknown）**：无法判断，谨慎处理

📝 **input/select 元素的正确归类**：
- **列表页** → 查询条件（过滤数据用）
- **表单页** → 表单字段（创建/编辑数据用）
- **详情页** → 通常不应该有input/select（如果有，可能是混合页）

🎯 **章节生成规则**：

🔥🔥🔥 **最重要：所有页面类型都必须生成"操作按钮"章节！**
⚠️ 无论页面类型如何，必须从原型中提取所有 type="button" 的元素！

**对于列表页（list）**：
- 查询条件：
  * 从 **"查询条件字段 - 输入框/下拉框"** 部分的 type="input" 或 type="select" 元素中提取
  * 这些是用户用来过滤列表数据的条件
  * 如果元素有name属性，name就是查询条件字段名

- 列表展示字段（🔥 重要！）：
  * 从 **"列表字段 - div文本元素"** 部分的 type="div" 元素中提取
  * 🔥 这些 div 文本就是表格的列头名称！必须全部列出！
  * 例如看到 '- div: "客户名称"' 就生成一行：| 客户名称 | 文本 | - | 显示客户名称 | 集配管理-div |
  * 例如看到 '- div: "当前审批节点"' 就生成一行：| 当前审批节点 | 文本 | - | 显示当前审批节点 | 集配管理-div |
  * 例如看到 '- div: "结算总金额（集采含税采购成本）（元）"' 就生成一行：| 结算总金额（集采含税采购成本）（元）| 金额 | 元 | 显示结算总金额 | 集配管理-div |
  * ⚠️ 如果某个字段名已经在查询条件中出现，在列表中就不要重复

- 🔥 操作按钮（必须章节！）：
  * 从 **"操作按钮"** 部分的 type="button" 元素中提取 **所有按钮**
  * 包括：查询、重置、导出、新增、编辑、删除、审核等
  * 每个按钮都要列出，不要遗漏！

**对于表单页（form）**：
- 🚫 不要生成"查询条件"章节！
- 表单字段：
  * 从 type="input" 或 type="select" 的元素中提取
  * 这些是用户用来输入/编辑数据的字段
  * 记录字段名、控件类型、必填项、默认值、说明

- 🔥 操作按钮（必须章节！）：
  * 从 type="button" 的元素中提取 **所有按钮**
  * 通常包括："保存"/"提交"/"取消"/"返回"等
  * 每个按钮都要列出，不要遗漏！

**对于详情页（detail）**：
- 🚫 不要生成"查询条件"章节！
- 详情展示字段：
  * 从 type="div" 的元素中提取
  * 这些是只读展示的数据字段

- 🔥 操作按钮（必须章节！）：
  * 从 type="button" 的元素中提取 **所有按钮**
  * 通常包括："返回"/"编辑"/"删除"等
  * 每个按钮都要列出，不要遗漏！

**对于混合页（mixed）或未知页（unknown）**：
- 🔥 操作按钮（最重要！绝对不能遗漏！）：
  * 必须从原型中提取 **所有 type="button" 的元素**
  * 如果原型中有10个按钮，就必须在表格中列出10行
  * 如果原型中有20个按钮，就必须在表格中列出20行
  * 不要因为按钮太多就省略，每个按钮都很重要！

**二、表单详细定义（仅当原型中存在表单时才写）**
从原型中逐个提取每个字段的:
- 实际字段名称 (来源: 页面名-label文字)
- 控件类型 (输入框/下拉/单选/多选/日期选择器)
- 是否必填 (通过查找"*"标记确定)
- 数据类型和长度限制 (从"0/100"等字样提取)
- 默认值 (如原型中有)
- 选项内容 (单选/多选按钮的实际选项列表)
- 提示文字/占位符

**三、操作流程与交互**
从原型中提取:
- 按钮操作的实际行为
- 二次确认弹窗的实际提示文案
- 成功/失败反馈的实际消息

**四、校验规则**
基于原型内容推断:
- 必填校验：标有"*"的字段
- 格式校验：根据字段类型推断
- 长度限制：从原型中提取
- 数值范围：根据业务场景推断

**五、业务规则 (🚨 极其重要！！！)**
⚠️ **必须从原型中完整提取所有业务规则说明文字**,这些文字通常是长段落的文本,包含:
- 计算规则(如"结算总金额=商品价格之和+运费")
- 流程规则(如"审核通过时,需要...")
- 校验规则(如"需要校验库存是否能扣减成功")
- 拦截规则(如"当存在商品运费拉取失败时,需要拦截...")
- 状态变化规则(如"超时未上传则自动终止")
🎯 **提取要求**:
1. 逐字逐句完整提取,不要遗漏任何一条规则
2. 保持原文表述,不要改写或简化
3. 每条规则都必须注明来源
4. 特别关注包含"审核"、"校验"、"拦截"、"确认"、"运费"、"库存"、"结算总金额"等关键词的长文本段落

📤 输出格式（重要：必须带章节编号）:
---REQUIREMENT_DOC---
# [实际系统名称]需求文档

## 1. [实际模块名称]

### 1.1 [实际页面名称]

⚠️ **页面类型：[list/form/detail/dialog/mixed/unknown]** ← 必须先标注页面类型！

📋 **根据页面类型生成对应章节**：

**如果是列表页（list）**，生成以下章节：

#### 1.1.1 页面布局与文案校验
本章节用于验证页面的基本呈现是否符合设计要求。

**必须验证的内容：**
1. **页面标题与导航**: 页面标题文案正确，面包屑导航路径准确
2. **布局结构**: 查询区域、列表区域、按钮区域布局合理，无遮挡或错位
3. **表格列头**: 所有列头文案与原型一致，顺序正确
4. **按钮文案**: 所有操作按钮的文案、位置、样式与原型一致
5. **提示文案**: 空状态提示、加载提示、错误提示等文案友好且准确
6. **字段标签**: 查询条件的标签文案清晰准确，必填项有明显标识

#### 1.1.2 查询条件
| 字段名 | 控件类型 | 必填 | 默认值 | 说明 | 来源 |
|--------|---------|------|--------|------|------|
（此处填入从原型提取的实际字段，不要写任何占位符）

#### 1.1.3 列表展示字段
| 字段名 | 数据类型 | 格式 | 说明 | 来源 |
|--------|---------|------|------|------|
（此处填入从原型提取的实际字段，不要写任何占位符）

#### 1.1.4 操作按钮 ← 🔥 必须生成！
| 按钮名称 | 按钮类型 | 权限要求 | 触发条件 | 操作说明 | 来源 |
|---------|---------|---------|---------|---------|------|
（此处填入从原型提取的所有按钮，每个按钮一行，格式：按钮名称 | 主要/次要 | 需要XX权限 | 满足XX条件时可用 | 点击后执行XX操作 | 来源页面）

#### 1.1.5 业务规则
（提取原型中的实际业务规则文案）

**如果是表单页（form）**，生成以下章节：

#### 1.1.1 页面布局与文案校验
本章节用于验证页面的基本呈现是否符合设计要求。

**必须验证的内容：**
1. **页面标题与导航**: 页面标题文案正确（如"新增订单"、"编辑订单"），面包屑导航路径准确
2. **布局结构**: 表单区域布局合理，字段分组清晰，按钮位置符合交互规范
3. **字段标签**: 所有字段标签文案准确，必填项有红色星号标识
4. **按钮文案**: 提交/保存/取消等按钮文案与原型一致，主次关系明确
5. **提示文案**: 字段说明、校验提示、操作提示等文案友好且准确
6. **默认值显示**: 有默认值的字段正确显示初始值

#### 1.1.2 表单字段
| 字段名 | 控件类型 | 必填 | 默认值 | 说明 | 来源 |
|--------|---------|------|--------|------|------|
（此处填入从原型提取的实际字段，不要写任何占位符）

#### 1.1.3 操作按钮 ← 🔥 必须生成！
| 按钮名称 | 按钮类型 | 权限要求 | 触发条件 | 操作说明 | 来源 |
|---------|---------|---------|---------|---------|------|
（此处填入从原型提取的所有按钮，通常是"保存"/"提交"/"取消"等）

#### 1.1.4 业务规则
（提取原型中的实际业务规则文案）

**如果是详情页（detail）**，生成以下章节：

#### 1.1.1 页面布局与文案校验
本章节用于验证页面的基本呈现是否符合设计要求。

**必须验证的内容：**
1. **页面标题与导航**: 页面标题文案正确（如"订单详情"、"客户详情"），面包屑导航路径准确
2. **布局结构**: 详情区域布局合理，信息分组清晰（如基本信息、详细信息、操作记录等）
3. **字段标签**: 所有字段标签文案准确，与数据对应关系清晰
4. **按钮文案**: 返回/编辑/删除等按钮文案与原型一致
5. **提示文案**: 状态提示、操作提示等文案友好且准确
6. **数据展示格式**: 日期、金额、状态等字段按规定格式展示

#### 1.1.2 详情展示字段
| 字段名 | 数据类型 | 格式 | 说明 | 来源 |
|--------|---------|------|------|------|
（此处填入从原型提取的实际字段，不要写任何占位符）

#### 1.1.3 操作按钮 ← 🔥 必须生成！
| 按钮名称 | 按钮类型 | 权限要求 | 触发条件 | 操作说明 | 来源 |
|---------|---------|---------|---------|---------|------|
（此处填入从原型提取的所有按钮，通常是"返回"/"编辑"等）

#### 1.1.4 业务规则
（提取原型中的实际业务规则文案）

**如果是混合页（mixed）或未知页（unknown）**：

🔥 **重要：无论页面类型如何，必须按以下顺序生成章节！**

#### 1.1.1 页面布局与文案校验
本章节用于验证页面的基本呈现是否符合设计要求。

**必须验证的内容：**
1. **页面标题与导航**: 页面标题文案正确，面包屑导航路径准确
2. **布局结构**: 各功能区域布局合理，无遮挡或错位
3. **字段与列头**: 所有字段标签、列头文案与原型一致
4. **按钮文案**: 所有操作按钮的文案、位置、样式与原型一致
5. **提示文案**: 各类提示信息文案友好且准确
6. **数据展示格式**: 日期、金额、状态等字段按规定格式展示

#### 1.1.2 查询条件（如果有输入框用于查询）
| 字段名 | 控件类型 | 必填 | 默认值 | 说明 | 来源 |
|--------|---------|------|--------|------|------|
（此处填入从原型提取的实际字段）

#### 1.1.3 列表展示字段（如果有表格或列表）
| 字段名 | 数据类型 | 格式 | 说明 | 来源 |
|--------|---------|------|------|------|
（此处填入从原型提取的实际字段）

#### 1.1.4 操作按钮 ← 🔥🔥🔥 这是最重要的章节，绝对不能遗漏！
⚠️ **必须从原型中提取所有 type="button" 的元素！**

| 按钮名称 | 按钮类型 | 权限要求 | 触发条件 | 操作说明 | 来源 |
|---------|---------|---------|---------|---------|------|
（此处填入从原型提取的**所有按钮**，每个按钮占一行，格式示例：）
（查询 | 主要 | 无 | 无 | 根据查询条件筛选数据 | 集配管理-button）
（重置 | 次要 | 无 | 无 | 清空查询条件 | 集配管理-button）
（新增 | 主要 | 需要新增权限 | 无 | 打开新增弹窗 | 集配管理-button）
（删除 | 危险 | 需要删除权限 | 选中数据后可用 | 删除选中的数据 | 集配管理-button）
（如果原型中有10个按钮，就必须列出10行！不要遗漏任何一个按钮！）

#### 1.1.5 表单字段定义（仅当原型中存在表单输入时）
| 字段名 | 控件类型 | 必填 | 长度/范围 | 默认值 | 选项/说明 | 来源 |
|--------|---------|------|----------|--------|----------|------|
（此处填入从原型提取的实际字段，每一行都必须是真实字段）

#### 1.1.6 业务规则
（提取原型中的实际业务规则文案）

### 1.2 [下一个页面名称（如果有）]
（重复1.1的结构）

**重要说明**：
- 每个页面作为一个三级标题（1.1、1.2、1.3...）
- 每个页面下的子章节使用四级标题（1.1.1、1.1.2...）
- 章节编号必须连续且完整
- 每个章节编号将作为后续测试用例生成的批次标识

---COMPLETENESS---
（0-1评分，评估原型信息完整度）
---SUGGESTIONS---
（列出缺少的信息）

🚫 严格禁止:
1. 不要输出任何示例占位符(如带中括号的内容)
2. 不要编造任何原型中不存在的内容
3. 表格中的每一行都必须是从原型中实际提取的内容
4. 如果原型中没有某个章节的内容，就跳过该章节，不要生成示例
5. 所有字段名、按钮文本都必须从原型中提取，不要自己创造`;

    // 🎯 关键优化: 收集页面类型信息和元素统计,帮助AI识别页面类型
    const pageTypeAnalysis: Array<{
      name: string;
      pageType: string;
      inputCount: number;
      buttonCount: number;
      allButtons: string[];  // 🔥 新增：所有按钮列表
      queryButtons: string[];
      formButtons: string[];
      suggestion: string;
    }> = [];

    (axureData.pages || []).forEach(page => {
      const inputCount = (page.elements || []).filter(e => e.type === 'input' || e.type === 'select').length;
      const buttonCount = (page.elements || []).filter(e => e.type === 'button').length;

      // 🔥 提取所有按钮（这是最重要的！）
      const allButtons = (page.elements || [])
        .filter(e => e.type === 'button')
        .map(e => e.text || e.name || '未命名按钮');

      const queryButtons = (page.elements || [])
        .filter(e => e.type === 'button' && e.text && (
          e.text.includes('查询') || e.text.includes('搜索') || e.text.includes('重置')
        ))
        .map(e => e.text || '');

      const formButtons = (page.elements || [])
        .filter(e => e.type === 'button' && e.text && (
          e.text.includes('保存') || e.text.includes('提交') || e.text.includes('确定')
        ))
        .map(e => e.text || '');

      const pageType = page.pageType || 'unknown';

      let suggestion = '';
      if (pageType === 'list') {
        suggestion = '需要生成：查询条件、列表展示字段、操作按钮（必须列出所有按钮！）';
      } else if (pageType === 'form') {
        suggestion = '需要生成：表单字段、操作按钮（必须列出所有按钮！不要生成查询条件）';
      } else if (pageType === 'detail') {
        suggestion = '需要生成：详情展示字段、操作按钮（必须列出所有按钮！不要生成查询条件）';
      } else {
        suggestion = '根据实际情况灵活生成，但操作按钮章节是必须的！';
      }

      pageTypeAnalysis.push({
        name: page.name || '未命名',
        pageType,
        inputCount,
        buttonCount,
        allButtons,  // 🔥 新增
        queryButtons,
        formButtons,
        suggestion
      });
    });

    const pageTypeTable = pageTypeAnalysis.length > 0
      ? `\n🔍 【重要】页面类型分析表（请根据此表生成对应章节）:\n${pageTypeAnalysis.map((p, i) =>
          `${i + 1}. ${p.name}
   页面类型: ${p.pageType}
   输入框数量: ${p.inputCount}
   按钮数量: ${p.buttonCount}
   🔥 所有按钮列表: ${p.allButtons.length > 0 ? p.allButtons.join(', ') : '无'}
   查询按钮: ${p.queryButtons.length > 0 ? p.queryButtons.join(', ') : '无'}
   表单按钮: ${p.formButtons.length > 0 ? p.formButtons.join(', ') : '无'}
   📋 章节建议: ${p.suggestion}`
        ).join('\n\n')}\n`
      : '';

    // 🎯 关键优化2: 提取所有长文本段落(可能包含重要的业务规则说明)
    const longTexts: Array<{text: string; page: string}> = [];
    (axureData.pages || []).forEach(page => {
      (page.elements || [])
        .filter(e => e.type === 'div' && e.text && e.text.length > 50) // 提取超过50字的div元素
        .forEach(e => {
          // 过滤掉只包含重复数据的文本(如列表数据)
          const text = e.text!.trim();
          if (text.includes('审核') || text.includes('校验') || text.includes('拦截') ||
              text.includes('确认') || text.includes('运费') || text.includes('库存') ||
              text.includes('结算总金额') || text.includes('通过时') || text.includes('拉取')) {
            longTexts.push({
              text: text.substring(0, 500), // 最多取500字
              page: page.name || '未命名'
            });
          }
        });
    });

    const longTextSummary = longTexts.length > 0
      ? `\n📋 【极其重要！！！】原型中的业务规则说明文字 (${longTexts.length}条,必须完整提取到"业务规则"章节):\n${longTexts.map((lt, i) =>
          `${i + 1}. [来源: ${lt.page}] ${lt.text}`
        ).join('\n\n')}\n`
      : '';

    // 🔥 新增：专门提取所有按钮详细信息
    const buttonDetails: Array<{page: string; buttons: string[]}> = [];
    (axureData.pages || []).forEach(page => {
      const buttons = (page.elements || [])
        .filter(e => e.type === 'button')
        .map(e => e.text || e.name || '未命名按钮');

      if (buttons.length > 0) {
        buttonDetails.push({
          page: page.name || '未命名',
          buttons
        });
      }
    });

    const buttonDetailSummary = buttonDetails.length > 0
      ? `\n🔥🔥🔥 【最重要！！！】所有按钮详细列表（必须在"操作按钮"章节中全部列出，一个都不能遗漏！）:\n${buttonDetails.map((bd, i) =>
          `页面 ${i + 1}: ${bd.page}
   按钮数量: ${bd.buttons.length}个
   所有按钮: ${bd.buttons.join(', ')}`
        ).join('\n\n')}\n`
      : '';

    const userPrompt = `系统: ${projectInfo.systemName || '未指定'}
模块: ${projectInfo.moduleName || '未指定'}
${pageTypeTable}${buttonDetailSummary}${longTextSummary}
Axure原型解析结果 (${axureData.pageCount || 0}页, ${axureData.elementCount || 0}元素):

${(axureData.pages || []).slice(0, 10).map((page, i) => {
  // 🔍 关键优化: 优先显示所有input/select元素,确保查询条件不会被遗漏
  const inputElements = (page.elements || []).filter(e => e.type === 'input' || e.type === 'select');
  const buttonElements = (page.elements || []).filter(e => e.type === 'button');  // 🔥 专门提取按钮
  const divElements = (page.elements || []).filter(e => e.type === 'div' && e.text && e.text.length > 0 && e.text.length <= 50 && e.name !== '业务规则说明');  // 🔥 专门提取 div 文本（可能是列表字段）
  const otherElements = (page.elements || []).filter(e => e.type !== 'input' && e.type !== 'select' && e.type !== 'button' && e.type !== 'div');

  // 构建元素详情: 先显示所有输入框，再显示所有按钮，再显示 div 元素，最后显示其他元素
  const inputDetail = inputElements.map(e => {
    if (e.name) return `  - ${e.type}: name="${e.name}"${e.value ? `, value="${e.value}"` : ''}${e.placeholder ? `, placeholder="${e.placeholder}"` : ''}`;
    if (e.placeholder) return `  - ${e.type}: [${e.placeholder}]`;
    return `  - ${e.type}`;
  }).join('\n');

  // 🔥 按钮详情（显示所有按钮，不截断！）
  const buttonDetail = buttonElements.map(e => {
    return `  - button: "${e.text || e.name || '未命名'}"`;
  }).join('\n');

  // 🔥 div 文本详情（显示所有 div，不截断！这些可能是列表字段）
  const divDetail = divElements.map(e => {
    return `  - div: "${e.text}"`;
  }).join('\n');

  const otherDetail = otherElements.slice(0, 10).map(e => {
    if (e.text) return `  - ${e.type}: "${e.text}"`;
    if (e.placeholder) return `  - ${e.type}: [${e.placeholder}]`;
    if (e.name) return `  - ${e.type}: ${e.name}`;
    return `  - ${e.type}`;
  }).join('\n');

  const elementsDetail = [inputDetail, buttonDetail, divDetail, otherDetail].filter(d => d).join('\n');

  const interactionsDetail = (page.interactions || []).slice(0, 10).map(int =>
    `  - ${int.type}${int.trigger ? `: ${int.trigger}` : ''}`
  ).join('\n');

  return `页面${i + 1}: ${page.name || '未命名'}
⚠️ 页面类型: ${page.pageType || 'unknown'}

📝 查询条件字段 - 输入框/下拉框 (${inputElements.length}个):
${inputDetail || '  无'}

🔘 操作按钮 (${buttonElements.length}个):
${buttonDetail || '  无'}

📋 列表字段 - div文本元素 (${divElements.length}个):
${divDetail || '  无'}

🔍 其他元素(${otherElements.length}个):
${otherDetail || '  无'}

⚡ 交互(${(page.interactions || []).length}):
${interactionsDetail || '  无'}`;
}).join('\n\n')}

${axureData.pageCount > 10 ? `\n(还有${axureData.pageCount - 10}个页面未展示)` : ''}

🚨 重要提醒:
1. 上面显示的所有元素和文字都是真实的原型内容
2. 你必须使用这些实际内容（如上面显示的按钮文本、输入框标签等）
3. 🚫 绝对禁止使用示例占位符，如[字段1]、[字段2]、[商品名称]、[库存数量]等
4. 如果原型中没有某类内容，就跳过该章节，不要编造
5. 严格按照上面的实际原型内容生成，按业务模块划分
6. 弹窗归属主页面，导航不单独描述
7. 所有字段必须标注来源`;

    // 🚀 构建完整的 Prompt 日志
    console.log('🚀 【步骤 3/5】构建 AI Prompt:');
    console.log(`   - System Prompt 长度: ${systemPrompt.length} 字符`);
    console.log(`   - User Prompt 长度: ${userPrompt.length} 字符`);
    console.log(`   - 总 Token 估算: ~${Math.ceil((systemPrompt.length + userPrompt.length) / 4)} tokens\n`);

    // 保存完整的 prompt 到日志（可选，用于调试）
    if (process.env.LOG_FULL_PROMPT === 'true') {
      console.log('📝 完整 User Prompt:\n');
      console.log('---BEGIN USER PROMPT---');
      console.log(userPrompt);
      console.log('---END USER PROMPT---\n');
    }

    try {
      console.log('📡 【步骤 4/5】调用 AI 模型...');
      const startTime = Date.now();

      const aiResponse = await this.callAI(systemPrompt, userPrompt, 8000);

      const duration = Date.now() - startTime;
      console.log(`✅ AI 响应完成 (耗时: ${duration}ms, 响应长度: ${aiResponse.length} 字符)\n`);

      // 📋 解析 AI 响应
      console.log('📋 【步骤 5/5】解析 AI 响应:');

      const docMatch = aiResponse.match(/---REQUIREMENT_DOC---([\s\S]*?)---COMPLETENESS---/);
      const completenessMatch = aiResponse.match(/---COMPLETENESS---\s*([\d.]+)/);
      const suggestionsMatch = aiResponse.match(/---SUGGESTIONS---([\s\S]*?)$/);

      const requirementDoc = docMatch ? docMatch[1].trim() : aiResponse;
      const completeness = completenessMatch ? parseFloat(completenessMatch[1]) : 0.8;
      const suggestions = suggestionsMatch
        ? suggestionsMatch[1].trim().split('\n').filter(s => s.trim()).map(s => s.replace(/^[-*]\s*/, ''))
        : ['请人工审核需求文档', '补充异常流程说明', '补充非功能性需求'];

      console.log(`   ✓ 需求文档提取成功 (${requirementDoc.length} 字符)`);
      console.log(`   ✓ 完整度评分: ${(completeness * 100).toFixed(1)}%`);
      console.log(`   ✓ 建议数量: ${suggestions.length} 条\n`);

      // 检查是否包含示例占位符（质量检查）
      const hasPlaceholders = /\[字段\d+\]|\[商品名称\]|\[库存数量\]|\[审核意见\]/.test(requirementDoc);
      if (hasPlaceholders) {
        console.warn('⚠️  警告: 检测到示例占位符，需求文档质量可能不佳！');
      } else {
        console.log('✅ 质量检查通过: 未检测到示例占位符');
      }

      console.log('\n╔═══════════════════════════════════════════════════════════════╗');
      console.log('║              ✅ 需求文档生成成功                              ║');
      console.log('╚═══════════════════════════════════════════════════════════════╝\n');

      return { requirementDoc, completeness, suggestions };
    } catch (error: any) {
      console.error('\n❌ 【错误】需求文档生成失败:');
      console.error(`   错误类型: ${error.name}`);
      console.error(`   错误消息: ${error.message}`);
      if (error.stack) {
        console.error(`   错误堆栈:\n${error.stack}`);
      }
      console.error('\n🔄 使用回退方案生成模拟文档...\n');

      // 回退到模拟实现
      const requirementDoc = this.buildMockRequirementDoc(axureData, projectInfo);
      return {
        requirementDoc,
        completeness: 0.7,
        suggestions: ['AI服务暂时不可用，请人工审核此文档']
      };
    }
  }

  /**
   * 🆕 直接从HTML文件生成需求文档（不经过解析，直接传文本给AI）
   * @param htmlContent HTML文件的完整内容
   * @param projectInfo 项目信息（系统名称、模块名称）
   * @returns 生成的需求文档和章节列表
   */
  async generateRequirementFromHtmlDirect(
    htmlContent: string,
    projectInfo: { systemName?: string; moduleName?: string; pageMode?: PageMode; platformType?: PlatformType; businessRules?: string[] }
  ): Promise<{ requirementDoc: string; sections: string[] }> {
    const pageMode = projectInfo.pageMode || 'new';
    const platformType = projectInfo.platformType || 'web';

    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log(`║       🚀 直接从HTML生成需求文档 - ${pageMode === 'new' ? '新增页面' : '修改页面'}模式 - ${platformType === 'web' ? 'Web端' : '移动端'}          ║`);
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    console.log('📊 输入信息:');
    console.log(`   - 平台类型: ${platformType === 'web' ? 'Web端' : '移动端'}`);
    console.log(`   - 页面模式: ${pageMode === 'new' ? '新增页面' : '修改页面'}`);
    console.log(`   - 系统名称: ${projectInfo.systemName || '未指定'}`);
    console.log(`   - 模块名称: ${projectInfo.moduleName || '未指定'}`);
    console.log(`   - HTML内容长度: ${htmlContent.length} 字符`);

    // 🆕 如果是修改模式，提取红色字段和业务描述
    let redFields: string[] = [];
    let businessDescription = '';

    if (pageMode === 'modify') {
      redFields = this.extractRedFields(htmlContent);
      businessDescription = this.extractBusinessDescription(htmlContent);
    }

    // 📊 业务规则日志
    if (projectInfo.businessRules && projectInfo.businessRules.length > 0) {
      console.log(`\n🎯 【步骤 3/5】用户提供的补充业务规则:`);
      projectInfo.businessRules.forEach((rule, i) => {
        console.log(`   ${i + 1}. ${rule}`);
      });
      console.log(`   💡 这些规则将作为AI提示词的一部分，辅助AI理解需求\n`);
    }

    // 🆕 根据平台类型选择对应的提示词
    console.log(`\n🎯 【步骤 2/5】加载${platformType === 'web' ? 'Web端' : '移动端'}提示词策略...`);

    const platformPromptOptions = {
      systemName: projectInfo.systemName,
      moduleName: projectInfo.moduleName,
      pageMode,
      businessDescription,
      redFields
    };

    const platformPrompt = platformType === 'web'
      ? getWebRequirementPrompt(platformPromptOptions)
      : getMobileRequirementPrompt(platformPromptOptions);

    console.log(`   ✅ ${platformType === 'web' ? 'Web端' : '移动端'}提示词策略已加载`);

    // 构建系统提示词
    const systemPrompt = `你是一个专业的需求分析专家。你的任务是分析Axure原型导出的HTML文件,并生成结构化的需求文档。

${projectInfo.businessRules && projectInfo.businessRules.length > 0 ? getBusinessRulesSystemPrompt(projectInfo.businessRules) : ''}
${platformPrompt}
${getCommonSystemInstructions()}`;


    // 构建用户提示词
    const userPrompt = getUserPrompt(htmlContent);

    try {
      console.log('\n🤖 正在调用GPT-4o生成需求文档...');
      console.log(`   - 系统提示词长度: ${systemPrompt.length} 字符`);
      console.log(`   - 用户提示词长度: ${userPrompt.length} 字符`);

      const aiStartTime = Date.now();

      // 调用AI（使用更大的token限制,因为HTML可能很长）
      let requirementDoc = await this.callAI(systemPrompt, userPrompt, 16000);

      const aiDuration = Date.now() - aiStartTime;
      console.log(`✅ AI生成完成 (耗时: ${aiDuration}ms)`);
      console.log(`   - 原始文档长度: ${requirementDoc.length} 字符`);

      // 🔥 清理AI返回内容中的markdown代码块包裹符号
      console.log(`\n🧹 清理Markdown代码块包裹符号...`);

      // 移除开头的 ```markdown 或 ```
      requirementDoc = requirementDoc.replace(/^```markdown\s*/i, '').replace(/^```\s*/, '');

      // 移除结尾的 ```
      requirementDoc = requirementDoc.replace(/\s*```\s*$/, '');

      // 去除首尾空白
      requirementDoc = requirementDoc.trim();

      console.log(`   ✅ 清理完成,文档长度: ${requirementDoc.length} 字符`);

      // 提取章节列表
      const sectionRegex = /###\s+([\d.]+)\s+(.+)/g;
      const sections: string[] = [];
      let match;
      while ((match = sectionRegex.exec(requirementDoc)) !== null) {
        sections.push(`${match[1]} ${match[2]}`);
      }

      console.log(`\n📋 提取到 ${sections.length} 个章节:`);
      sections.forEach((section, index) => {
        console.log(`   ${index + 1}. ${section}`);
      });

      console.log('\n✅ 需求文档生成成功\n');

      return {
        requirementDoc,
        sections
      };
    } catch (error: any) {
      console.error('❌ 直接生成需求文档失败:', error);
      throw new Error(`需求文档生成失败: ${error.message}`);
    }
  }

  /**
   * 规划分批策略 - 基于需求文档章节
   * @param requirementDoc 需求文档
   */
  async planBatchStrategy(requirementDoc: string): Promise<Batch[]> {
    console.log('📋 开始规划分批策略（基于章节）...');

    // 提取文档中的三级标题（### 1.1、### 1.2 等）
    const chapterRegex = /###\s+([\d.]+)\s+(.+)/g;
    const chapters: Array<{ id: string; name: string }> = [];
    let match;

    while ((match = chapterRegex.exec(requirementDoc)) !== null) {
      chapters.push({
        id: match[1].trim(), // "1.1", "1.2", "1.3"...
        name: match[2].trim() // 页面名称
      });
    }

    if (chapters.length === 0) {
      console.warn('⚠️  未能从需求文档中提取到章节编号，使用回退方案');
      return [
        {
          id: 'section-1',
          name: '完整功能测试',
          priority: 'high',
          scenarios: ['主要功能测试'],
          estimatedCount: 10
        }
      ];
    }

    console.log(`✅ 提取到 ${chapters.length} 个章节:`, chapters.map(c => `${c.id} ${c.name}`).join(', '));

    // 将每个章节转换为一个批次
    const batches: Batch[] = chapters.map((chapter, index) => ({
      id: `section-${chapter.id}`,
      name: `${chapter.id} ${chapter.name}`,
      priority: index === 0 ? 'high' : 'medium', // 第一个章节优先级为high
      scenarios: [chapter.id], // 直接使用章节ID作为场景标识
      estimatedCount: 0 // 将在生成时由AI决定数量
    }));

    console.log(`✅ 规划完成，共 ${batches.length} 个批次（按章节划分）`);
    return batches;
  }

  /**
   * 生成单个批次的测试用例（基于章节）
   */
  async generateBatch(
    batchId: string,
    scenarios: string[], // scenarios[0] 是章节ID (如 "1.1")
    requirementDoc: string,
    existingCases: TestCase[],
    systemName?: string,  // 系统名称
    moduleName?: string   // 模块名称
  ): Promise<TestCase[]> {
    const sectionId = scenarios[0]; // "1.1", "1.2" 等
    console.log(`🤖 开始生成批次 ${batchId}（章节 ${sectionId}），系统: ${systemName || '未指定'}, 模块: ${moduleName || '未指定'}`);

    // 提取该章节的完整内容
    const sectionRegex = new RegExp(`###\\s+${sectionId.replace('.', '\\.')}\\s+(.+?)[\\s\\S]*?(?=###\\s+[\\d.]+\\s+|$)`);
    const sectionMatch = requirementDoc.match(sectionRegex);
    const sectionContent = sectionMatch ? sectionMatch[0] : requirementDoc.substring(0, 3000);
    const sectionName = sectionMatch ? sectionMatch[1].trim() : '功能模块';

    console.log(`📄 提取章节内容 - ${sectionId} ${sectionName} (${sectionContent.length}字符)`);

    // 🔍 查询知识库（RAG增强）- 🔥 使用系统特定的知识库
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📚 [知识库RAG] 开始检索相关知识...`);
    console.log(`   🎯 目标系统: ${systemName || '默认'}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    let knowledgeContext = '';
    try {
      // 🔥 获取系统特定的知识库实例
      const knowledgeBase = this.getKnowledgeBase(systemName);
      console.log(`✅ 知识库实例已创建（系统：${systemName || '默认'}），开始RAG检索...`);
      try {
        console.log(`🔍 [RAG-Step1] 准备查询参数:`);
        console.log(`   📌 章节名称: "${sectionName}"`);
        console.log(`   📌 内容长度: ${sectionContent.length}字符 (取前500字作为查询上下文)`);
        console.log(`   📌 检索参数: topK=3, scoreThreshold=0.5`);

        const queryText = `${sectionName}\n${sectionContent.substring(0, 500)}`;
        console.log(`   📌 实际查询文本预览: ${queryText.substring(0, 150)}...`);

        console.log(`\n🔍 [RAG-Step2] 调用Qdrant向量数据库进行语义检索...`);
        const queryStartTime = Date.now();

        const knowledgeResults = await knowledgeBase.searchByCategory({
          query: queryText,
          topK: 3,
          scoreThreshold: 0.5
        });

        const queryDuration = Date.now() - queryStartTime;
        console.log(`✅ [RAG-Step2] 向量检索完成 (耗时: ${queryDuration}ms)`);

        const totalKnowledge =
          knowledgeResults.businessRules.length +
          knowledgeResults.testPatterns.length +
          knowledgeResults.pitfalls.length +
          knowledgeResults.riskScenarios.length;

        if (totalKnowledge > 0) {
          console.log(`\n📊 [RAG-Step3] 知识检索结果汇总:`);
          console.log(`   ✅ 业务规则: ${knowledgeResults.businessRules.length}条`);
          if (knowledgeResults.businessRules.length > 0) {
            knowledgeResults.businessRules.forEach((r: any, i: number) => {
              console.log(`      ${i+1}. "${r.knowledge.title}" (相似度: ${(r.score * 100).toFixed(1)}%)`);
            });
          }

          console.log(`   ✅ 测试模式: ${knowledgeResults.testPatterns.length}条`);
          if (knowledgeResults.testPatterns.length > 0) {
            knowledgeResults.testPatterns.forEach((r: any, i: number) => {
              console.log(`      ${i+1}. "${r.knowledge.title}" (相似度: ${(r.score * 100).toFixed(1)}%)`);
            });
          }

          console.log(`   ✅ 历史踩坑点: ${knowledgeResults.pitfalls.length}条`);
          if (knowledgeResults.pitfalls.length > 0) {
            knowledgeResults.pitfalls.forEach((r: any, i: number) => {
              console.log(`      ${i+1}. "${r.knowledge.title}" (相似度: ${(r.score * 100).toFixed(1)}%)`);
            });
          }

          console.log(`   ✅ 资损风险场景: ${knowledgeResults.riskScenarios.length}条`);
          if (knowledgeResults.riskScenarios.length > 0) {
            knowledgeResults.riskScenarios.forEach((r: any, i: number) => {
              console.log(`      ${i+1}. "${r.knowledge.title}" (相似度: ${(r.score * 100).toFixed(1)}%)`);
            });
          }

          console.log(`   📈 总计检索到: ${totalKnowledge}条相关知识`);

          console.log(`\n🔧 [RAG-Step4] 格式化知识上下文，准备注入AI提示词...`);
          knowledgeContext = this.buildKnowledgeContext(knowledgeResults);
          console.log(`✅ [RAG-Step4] 知识上下文构建完成 (长度: ${knowledgeContext.length}字符)`);

          console.log(`\n🎯 [RAG模式] 将使用知识库增强模式生成测试用例`);
        } else {
          console.log(`\n⚠️  [RAG-Step3] 未检索到相关知识 (所有知识相似度 < 0.5)`);
          console.log(`   💡 这可能是因为:`);
          console.log(`      - 知识库中没有与"${sectionName}"相关的内容`);
          console.log(`      - 相似度阈值0.5设置过高`);
          console.log(`      - 需要添加更多业务知识到知识库`);
          console.log(`\n🔄 [降级处理] 切换到普通模式生成（不使用知识库增强）`);
        }
      } catch (error: any) {
        console.error(`\n❌ [RAG-Error] 知识库查询异常:`);
        console.error(`   错误类型: ${error.name}`);
        console.error(`   错误信息: ${error.message}`);
        console.error(`   错误堆栈: ${error.stack}`);
        console.warn(`\n🔄 [降级处理] 自动切换到普通模式生成`);
      }
    } catch (outerError: any) {
      console.error(`❌ [RAG-Error] 知识库初始化失败:`);
      console.error(`   错误信息: ${outerError.message}`);
      console.warn(`\n🔄 [降级处理] 自动切换到普通模式生成`);
    }

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    const systemPrompt = `你是一个测试用例设计专家。你的职责是：
1. 根据需求文档的指定章节生成详细的功能测试用例
2. 每个测试用例包含一个测试目的，以及若干个测试点
3. 每个测试点是一个独立的、可验证的测试项
4. 根据需求复杂度决定生成的测试点数量，不要人为限制数量
5. 避免与已存在的测试用例重复

🎯 核心数据结构：
- 一条测试用例 = 一个测试目的 + 多个测试点
- 测试目的：总体测试目标（如"验证订单创建流程"）
- 测试点：具体的测试项（如"正常提交订单"、"库存不足时提交订单"、"超时订单处理"）
- **重要**：每个测试点都必须包含 testPurpose 字段（同一个测试用例下的所有测试点共享相同的 testPurpose）

📊 测试用例生成规则：
1. 数量不限制：根据需求文档的复杂度自动判断需要多少个测试点
2. 每个测试点必须是原子性的、独立验证的
3. 测试点应覆盖正常流程、异常流程、边界条件
4. 测试点应标注风险等级（low/medium/high）
5. **每个测试点必须包含 testPurpose 字段**

🎨 **特殊章节：页面布局与文案校验**
如果章节名称包含"页面布局与文案校验"或"布局"/"文案"等关键词，需要生成以下类型的测试点：
1. **页面标题与导航验证**: 检查页面标题文案、面包屑路径是否正确
2. **布局结构验证**: 检查各功能区域位置、间距、对齐是否符合设计
3. **字段与列头验证**: 检查所有标签、列头文案是否与原型一致
4. **按钮文案验证**: 检查所有按钮的文案、样式、位置是否正确
5. **提示文案验证**: 检查空状态提示、错误提示、操作提示等文案
6. **数据格式验证**: 检查日期、金额、状态等字段的展示格式
这类测试点的优先级通常是 medium 或 high，风险等级是 low 或 medium

测试用例结构要求：
- name: 用例名称（格式：[章节ID]-[测试目的]，如"1.1-订单创建"）
- testPurpose: 测试目的（简短描述测试目标）
- system: 所属系统（从需求文档提取）
- module: 所属模块（从需求文档提取）
- sectionId: 章节ID（如"1.1"）
- sectionName: 章节名称（如"订单管理页面"）
- priority: high/medium/low
- tags: 相关标签数组
- coverageAreas: 覆盖范围（功能点列表，逗号分隔）
- testPoints: 测试点数组，每个测试点包含：
  * testPurpose: 测试目的（**必填**，与测试用例的 testPurpose 相同）
  * testPoint: 测试点名称
  * steps: 操作步骤（\\n分隔）
  * expectedResult: 预期结果
  * riskLevel: 风险等级（low/medium/high）
- steps: 汇总的操作步骤（兼容旧格式）
- assertions: 汇总的预期结果（兼容旧格式）
- preconditions: 前置条件（可选）
- testData: 测试数据（可选）
${knowledgeContext}`;

    const existingCaseNames = existingCases.map(tc => tc.name).join('\n- ');

    const userPrompt = `请为以下需求文档章节生成详细的功能测试用例：

## 目标章节
章节ID: ${sectionId}
章节名称: ${sectionName}

## 章节需求内容
${sectionContent}

## 已存在的测试用例（避免重复）
${existingCaseNames || '无'}

## 生成要求
1. 根据需求复杂度决定测试点数量，不要人为限制
2. 每个测试点必须独立且可验证
3. 覆盖正常流程、异常流程、边界条件
4. 标注每个测试点的风险等级
5. 测试用例名称格式：[章节ID]-[测试目的]
6. 🎨 **如果章节是"页面布局与文案校验"**，请生成验证页面标题、布局、文案、按钮、提示信息、数据格式等方面的测试点

请输出JSON格式：
\`\`\`json
{
  "testCases": [
    {
      "name": "${sectionId}-测试目的简述",
      "testPurpose": "测试目的详细描述",
      "system": "系统名",
      "module": "模块名",
      "sectionId": "${sectionId}",
      "sectionName": "${sectionName}",
      "priority": "high",
      "tags": ["标签1", "标签2"],
      "coverageAreas": "功能点1,功能点2,功能点3",
      "testPoints": [
        {
          "testPurpose": "测试目的详细描述",
          "testPoint": "测试点1：具体测试项",
          "steps": "1. 操作步骤1\\n2. 操作步骤2",
          "expectedResult": "预期结果描述",
          "riskLevel": "high"
        },
        {
          "testPurpose": "测试目的详细描述",
          "testPoint": "测试点2：具体测试项",
          "steps": "1. 操作步骤1\\n2. 操作步骤2",
          "expectedResult": "预期结果描述",
          "riskLevel": "medium"
        }
      ],
      "steps": "汇总的操作步骤（用于兼容旧格式）",
      "assertions": "汇总的预期结果（用于兼容旧格式）",
      "preconditions": "前置条件",
      "testData": "测试数据"
    }
  ]
}
\`\`\`

💡 提示：根据需求文档内容决定测试点数量，简单页面可能3-5个测试点，复杂流程可能需要10-20个测试点。`;

    try {
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`🤖 [AI生成] 准备调用大模型生成测试用例...`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`   📊 章节信息: ${sectionId} - ${sectionName}`);
      console.log(`   📝 系统提示词长度: ${systemPrompt.length} 字符`);
      console.log(`   📝 用户提示词长度: ${userPrompt.length} 字符`);

      if (knowledgeContext) {
        console.log(`   ✅ 已注入知识库上下文 (${knowledgeContext.length}字符)`);
        console.log(`   💡 AI将基于知识库内容生成更专业的测试用例`);
      } else {
        console.log(`   ⚠️  未注入知识库上下文，使用普通模式生成`);
      }

      // 🔥 详细打印系统提示词
      console.log(`\n┌─────────────────────────────────────────────────────────┐`);
      console.log(`│ 📋 [完整系统提示词] System Prompt                       │`);
      console.log(`└─────────────────────────────────────────────────────────┘`);
      console.log(systemPrompt);
      console.log(`┌─────────────────────────────────────────────────────────┐`);
      console.log(`│ 📋 [完整用户提示词] User Prompt                         │`);
      console.log(`└─────────────────────────────────────────────────────────┘`);
      console.log(userPrompt);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

      console.log(`🚀 [AI生成] 正在调用大模型API (GPT-4o via OpenRouter)...`);
      const aiStartTime = Date.now();

      const aiResponse = await this.callAI(systemPrompt, userPrompt, 8000);

      const aiDuration = Date.now() - aiStartTime;
      console.log(`✅ [AI生成] 大模型响应完成 (耗时: ${aiDuration}ms, 响应长度: ${aiResponse.length}字符)`);

      // 🔥 详细打印AI原始响应
      console.log(`\n┌─────────────────────────────────────────────────────────┐`);
      console.log(`│ 🤖 [AI原始响应] Raw Response                            │`);
      console.log(`└─────────────────────────────────────────────────────────┘`);
      console.log(aiResponse);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

      // 解析AI响应
      console.log(`🔍 [解析] 开始解析AI响应为JSON...`);
      let jsonText = aiResponse.trim();
      const jsonMatch = jsonText.match(/```(?:json)?\n?([\s\S]*?)\n?```/) || jsonText.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        jsonText = jsonMatch[1] || jsonMatch[0];
        console.log(`   ✅ 成功提取JSON代码块`);
      } else {
        console.log(`   ⚠️  未找到JSON代码块标记，尝试直接解析`);
      }

      console.log(`\n┌─────────────────────────────────────────────────────────┐`);
      console.log(`│ 📦 [提取的JSON] Extracted JSON                          │`);
      console.log(`└─────────────────────────────────────────────────────────┘`);
      console.log(jsonText);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

      const parsed = JSON.parse(jsonText);
      const testCases: TestCase[] = parsed.testCases || [];

      console.log(`✅ [解析成功] 解析出 ${testCases.length} 个测试用例`);

      // 补充章节信息和系统模块信息
      testCases.forEach((tc, index) => {
        tc.sectionId = sectionId;
        tc.sectionName = sectionName;

        // 自动填充系统名称和模块名称
        if (systemName) {
          tc.system = systemName;
        }
        if (moduleName) {
          tc.module = moduleName;
        }

        // 如果没有testPoints，从steps和assertions生成一个默认测试点
        if (!tc.testPoints || tc.testPoints.length === 0) {
          tc.testPoints = [{
            testPoint: tc.testPurpose || tc.name,
            steps: tc.steps,
            expectedResult: tc.assertions,
            riskLevel: 'medium'
          }];
        }

        console.log(`   ${index + 1}. ${tc.name} (${tc.testPoints?.length || 0}个测试点)`);
      });

      const totalTestPoints = testCases.reduce((sum, tc) => sum + (tc.testPoints?.length || 0), 0);

      console.log(`\n┌─────────────────────────────────────────────────────────┐`);
      console.log(`│ ✅ [生成完成] 批次 ${batchId} 生成结果汇总                │`);
      console.log(`└─────────────────────────────────────────────────────────┘`);
      console.log(`   📊 测试用例数: ${testCases.length}`);
      console.log(`   📊 测试点总数: ${totalTestPoints}`);
      console.log(`   📊 平均每个用例: ${(totalTestPoints / testCases.length).toFixed(1)} 个测试点`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

      return testCases;

    } catch (error: any) {
      console.error(`❌ 批次${batchId}生成失败，使用回退方案:`, error.message);
      // 回退到简单生成
      return [{
        name: `${sectionId}-${sectionName}`,
        testPurpose: `验证${sectionName}的基本功能`,
        description: `针对${sectionName}的功能测试(AI生成失败，回退到基础模板)`,
        steps: `1. 准备测试环境和数据\n2. 执行${sectionName}相关操作\n3. 观察系统响应\n4. 验证结果`,
        assertions: `1. ${sectionName}执行成功\n2. 系统响应正确\n3. 数据状态符合预期`,
        priority: 'medium',
        tags: [sectionName, '自动生成', 'AI回退'],
        system: '待补充',
        module: '待补充',
        sectionId,
        sectionName,
        testPoints: [{
          testPoint: '基本功能测试',
          steps: `1. 准备测试环境和数据\n2. 执行${sectionName}相关操作`,
          expectedResult: '功能正常运行',
          riskLevel: 'medium'
        }],
        testType: '功能测试'
      }];
    }
  }

  /**
   * 🆕 阶段1：智能测试模块拆分
   * 根据需求文档，识别不同的测试模块（查询条件、列表展示、操作按钮、页面布局等）
   */
  async analyzeTestModules(requirementDoc: string): Promise<TestModule[]> {
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║       🎯 阶段1：智能测试模块拆分                            ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    // 🆕 检测是否为修改页面模式（包含变更摘要）
    const hasChangeSummary = /##\s*变更摘要/.test(requirementDoc);
    const isModifyMode = hasChangeSummary;

    console.log(`   页面模式: ${isModifyMode ? '修改页面' : '新增页面'}`);

    const systemPrompt = `你是一个测试策略规划专家。你的任务是分析需求文档，将测试工作拆分为不同的测试模块。

## 测试模块拆分原则

**根据页面类型识别测试模块：**

### 列表页常见测试模块：
1. **查询条件测试** - 验证查询功能、边界值、组合查询
2. **列表展示与数据校验** - 验证列表字段、数据格式、排序分页
3. **操作按钮与权限** - 验证新增、编辑、删除等操作功能和权限
4. **页面布局与文案校验** - 验证页面标题、字段标签、按钮文案、提示信息

### 表单页常见测试模块：
1. **表单字段验证** - 验证必填项、数据类型、长度限制
2. **字段联动与依赖** - 验证字段之间的联动关系
3. **提交与保存** - 验证提交、保存、取消等操作
4. **数据回显与编辑** - 验证编辑时数据回显
5. **页面布局与文案校验** - 验证页面标题、字段标签、按钮文案

### 详情页常见测试模块：
1. **详情展示** - 验证所有字段正确显示
2. **操作按钮** - 验证编辑、返回等操作按钮
3. **页面布局与文案校验** - 验证页面标题、字段标签

### 弹窗常见测试模块：
1. **弹窗表单验证** - 验证表单字段和验证规则
2. **弹窗交互** - 验证打开、关闭、取消等操作
3. **页面布局与文案校验** - 验证标题、提示文案

## 输出格式

请输出JSON格式：
\`\`\`json
{
  "modules": [
    {
      "id": "module-1",
      "name": "测试模块名称",
      "description": "该模块的测试目标和范围",
      "priority": "high|medium|low",
      "relatedSections": ["1.1", "1.2"]
    }
  ]
}
\`\`\`

## 重要提示
- 模块数量控制在3-6个，太多会导致规划过于分散
- 优先级判断：功能性 > 权限 > 布局文案
- 每个模块要有清晰的测试边界，避免重叠

${isModifyMode ? `
## ⚠️ 修改页面模式特别说明

这是一个【修改页面】，需求文档中包含【变更摘要】章节，列出了本次迭代的变更内容。

**你的任务：**
1. **只针对变更的功能生成测试模块**
   - 查找"变更摘要"章节
   - 只针对标记为 🆕 新增功能 和 ✏️ 修改功能 的部分生成测试模块
   - **完全忽略** 标记为 ➖ 原有功能（未变更）的部分

2. **测试重点：**
   - 新增功能：完整测试新增的字段、按钮、逻辑
   - 修改功能：重点测试修改的逻辑、变更的计算方式、调整的规则
   - 回归测试：验证修改是否影响相关联的功能

3. **示例：**
   如果变更摘要显示：
   \`\`\`
   ### 🆕 新增功能
   - 列表新增【订单来源】字段
   - 筛选条件新增【订单来源】下拉框

   ### ✏️ 修改功能
   - 含税采购价计算逻辑调整

   ### ➖ 原有功能（未变更）
   - 订单列表基本展示
   - 供应商筛选
   \`\`\`

   那么你应该生成的测试模块是：
   - 订单来源字段测试（新增）
   - 订单来源筛选测试（新增）
   - 含税采购价计算逻辑测试（修改）

   **不要**生成：
   - ❌ 订单列表基本展示测试（未变更）
   - ❌ 供应商筛选测试（未变更）
` : ''}`;

    const userPrompt = `请分析以下需求文档，拆分出合适的测试模块：

## 需求文档
${requirementDoc}

${isModifyMode ? `
⚠️ **这是修改页面模式，请严格遵守以下规则：**
1. 从需求文档中找到【变更摘要】章节
2. 只针对 🆕 新增功能 和 ✏️ 修改功能 生成测试模块
3. 完全忽略 ➖ 原有功能（未变更）部分
4. 测试模块命名要明确标注是"新增"还是"修改"
` : ''}
请识别页面类型，并根据上述原则拆分测试模块。直接输出JSON格式，不要其他说明文字。`;

    try {
      console.log('🤖 正在调用AI进行测试模块拆分...');
      const aiResponse = await this.callAI(systemPrompt, userPrompt, 4000);

      // 解析JSON
      let jsonText = aiResponse.trim();
      const jsonMatch = jsonText.match(/```(?:json)?\n?([\s\S]*?)\n?```/) || jsonText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonText = jsonMatch[1] || jsonMatch[0];
      }

      const parsed = JSON.parse(jsonText);
      const modules: TestModule[] = parsed.modules || [];

      console.log(`✅ 成功拆分 ${modules.length} 个测试模块:`);
      modules.forEach((m, i) => {
        console.log(`   ${i + 1}. ${m.name} (${m.priority}) - 关联章节: ${m.relatedSections.join(', ')}`);
      });

      return modules;
    } catch (error: any) {
      console.error('❌ 测试模块拆分失败:', error.message);
      // 回退方案：返回基础模块
      return [
        {
          id: 'module-1',
          name: '完整功能测试',
          description: '验证所有功能点',
          priority: 'high',
          relatedSections: ['1.1']
        }
      ];
    }
  }

  /**
   * 🆕 阶段2：生成测试目的
   * 为指定测试模块生成多个测试目的
   */
  async generateTestPurposes(
    moduleId: string,
    moduleName: string,
    moduleDescription: string,
    requirementDoc: string,
    relatedSections: string[]
  ): Promise<TestPurpose[]> {
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log(`║       🎯 阶段2：生成测试目的 - ${moduleName}             ║`);
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    // 🆕 检测是否为修改页面模式
    const hasChangeSummary = /##\s*变更摘要/.test(requirementDoc);
    const isModifyMode = hasChangeSummary;

    console.log(`   页面模式: ${isModifyMode ? '修改页面' : '新增页面'}`);

    // 提取相关章节内容
    const sectionContents = relatedSections.map(sectionId => {
      const regex = new RegExp(`###\\s+${sectionId.replace('.', '\\.')}\\s+([\\s\\S]*?)(?=###\\s+[\\d.]+\\s+|$)`);
      const match = requirementDoc.match(regex);
      return match ? match[0] : '';
    }).join('\n\n');

    const systemPrompt = `你是一个测试策略规划专家。你的任务是为指定的测试模块生成多个测试目的（Test Purpose）。

## 测试目的生成原则

**测试目的是什么？**
- 测试目的是一组相关测试点的集合，代表一个具体的测试意图
- 例如："单条件查询验证"是一个测试目的，包含多个测试点（完整匹配、模糊查询、不存在的值等）

**如何拆分测试目的？**
1. 按功能点拆分（如：单条件查询、多条件组合查询）
2. 按场景拆分（如：正常流程、异常流程、边界条件）
3. 按优先级拆分（如：核心功能、辅助功能）
4. 确保每个测试目的职责单一、边界清晰

**数量建议：**
- 简单模块：2-4个测试目的
- 复杂模块：5-8个测试目的
- 避免过度拆分

## 输出格式

请输出JSON格式：
\`\`\`json
{
  "testPurposes": [
    {
      "id": "purpose-1-1",
      "name": "测试目的名称",
      "description": "测试目的详细描述，说明要验证什么",
      "coverageAreas": "功能点1,功能点2,功能点3",
      "estimatedTestPoints": 5,
      "priority": "high|medium|low"
    }
  ]
}
\`\`\`

${isModifyMode ? `
## ⚠️ 修改页面模式特别说明

当前需求文档包含【变更摘要】，说明这是一个修改页面。

**你的任务：**
1. **聚焦变更内容**
   - 当前测试模块应该是针对变更功能的（🆕 新增 或 ✏️ 修改）
   - 生成的测试目的应该聚焦于这些变更点
   - 如果是新增功能，要完整测试
   - 如果是修改功能，要重点测试变更的逻辑和影响

2. **不要测试未变更功能**
   - 不要为标记为 ➖ 原有功能（未变更）的部分生成测试目的
   - 除非是必要的回归测试（验证修改没有破坏原有功能）
` : ''}`;

    const userPrompt = `请为以下测试模块生成测试目的：

## 测试模块信息
- 模块ID: ${moduleId}
- 模块名称: ${moduleName}
- 模块描述: ${moduleDescription}
- 关联章节: ${relatedSections.join(', ')}

## 相关需求内容
${sectionContents}

${isModifyMode ? `
⚠️ **这是修改页面模式：**
- 当前模块应该是针对变更功能的
- 只为变更的功能点生成测试目的
- 避免为未变更的原有功能生成测试目的
` : ''}
请根据需求内容，为该模块生成合适的测试目的。直接输出JSON格式，不要其他说明文字。`;

    try {
      console.log(`🤖 正在为模块"${moduleName}"生成测试目的...`);
      const aiResponse = await this.callAI(systemPrompt, userPrompt, 4000);

      // 解析JSON
      let jsonText = aiResponse.trim();
      const jsonMatch = jsonText.match(/```(?:json)?\n?([\s\S]*?)\n?```/) || jsonText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonText = jsonMatch[1] || jsonMatch[0];
      }

      const parsed = JSON.parse(jsonText);
      const purposes: TestPurpose[] = parsed.testPurposes || [];

      console.log(`✅ 成功生成 ${purposes.length} 个测试目的:`);
      purposes.forEach((p, i) => {
        console.log(`   ${i + 1}. ${p.name} (${p.priority}) - 预估${p.estimatedTestPoints}个测试点`);
      });

      return purposes;
    } catch (error: any) {
      console.error('❌ 测试目的生成失败:', error.message);
      // 回退方案
      return [
        {
          id: `purpose-${moduleId}-1`,
          name: `${moduleName}基本功能验证`,
          description: `验证${moduleName}的基本功能`,
          coverageAreas: moduleName,
          estimatedTestPoints: 3,
          priority: 'high'
        }
      ];
    }
  }

  /**
   * 🆕 阶段3：生成测试点
   * 为指定测试目的生成详细的测试点
   */
  async generateTestPoints(
    purposeId: string,
    purposeName: string,
    purposeDescription: string,
    requirementDoc: string,
    systemName: string,
    moduleName: string,
    relatedSections: string[]
  ): Promise<TestCase> {
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log(`║       🎯 阶段3：生成测试点 - ${purposeName}             ║`);
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    // 🆕 检测是否为修改页面模式
    const hasChangeSummary = /##\s*变更摘要/.test(requirementDoc);
    const isModifyMode = hasChangeSummary;

    console.log(`   页面模式: ${isModifyMode ? '修改页面' : '新增页面'}`);

    // 提取相关章节内容
    const sectionContents = relatedSections.map(sectionId => {
      const regex = new RegExp(`###\\s+${sectionId.replace('.', '\\.')}\\s+([\\s\\S]*?)(?=###\\s+[\\d.]+\\s+|$)`);
      const match = requirementDoc.match(regex);
      return match ? match[0] : '';
    }).join('\n\n');

    // 🔍 查询知识库（RAG增强）- 🔥 使用系统特定的知识库
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📚 [知识库RAG] 开始检索相关知识...`);
    console.log(`   🎯 目标系统: ${systemName || '默认'}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    let knowledgeContext = '';
    try {
      // 🔥 获取系统特定的知识库实例
      const knowledgeBase = this.getKnowledgeBase(systemName);
      console.log(`✅ 知识库实例已创建（系统：${systemName || '默认'}），开始RAG检索...`);
      try {
        console.log(`🔍 [RAG-Step1] 准备查询参数:`);
        console.log(`   📌 测试目的: "${purposeName}"`);
        console.log(`   📌 描述: "${purposeDescription}"`);
        console.log(`   📌 内容长度: ${sectionContents.length}字符 (取前500字作为查询上下文)`);
        console.log(`   📌 检索参数: topK=3, scoreThreshold=0.5`);

        const queryText = `${purposeName}\n${purposeDescription}\n${sectionContents.substring(0, 500)}`;
        console.log(`   📌 实际查询文本预览: ${queryText.substring(0, 150)}...`);

        console.log(`\n🔍 [RAG-Step2] 调用Qdrant向量数据库进行语义检索...`);
        const queryStartTime = Date.now();

        const knowledgeResults = await knowledgeBase.searchByCategory({
          query: queryText,
          topK: 3,
          scoreThreshold: 0.5
        });

        const queryDuration = Date.now() - queryStartTime;
        console.log(`✅ [RAG-Step2] 向量检索完成 (耗时: ${queryDuration}ms)`);

        const totalKnowledge =
          knowledgeResults.businessRules.length +
          knowledgeResults.testPatterns.length +
          knowledgeResults.pitfalls.length +
          knowledgeResults.riskScenarios.length;

        if (totalKnowledge > 0) {
          console.log(`\n📊 [RAG-Step3] 知识检索结果汇总:`);
          console.log(`   ✅ 业务规则: ${knowledgeResults.businessRules.length}条`);
          if (knowledgeResults.businessRules.length > 0) {
            knowledgeResults.businessRules.forEach((r: any, i: number) => {
              console.log(`      ${i+1}. "${r.knowledge.title}" (相似度: ${(r.score * 100).toFixed(1)}%)`);
            });
          }

          console.log(`   ✅ 测试模式: ${knowledgeResults.testPatterns.length}条`);
          if (knowledgeResults.testPatterns.length > 0) {
            knowledgeResults.testPatterns.forEach((r: any, i: number) => {
              console.log(`      ${i+1}. "${r.knowledge.title}" (相似度: ${(r.score * 100).toFixed(1)}%)`);
            });
          }

          console.log(`   ✅ 历史踩坑点: ${knowledgeResults.pitfalls.length}条`);
          if (knowledgeResults.pitfalls.length > 0) {
            knowledgeResults.pitfalls.forEach((r: any, i: number) => {
              console.log(`      ${i+1}. "${r.knowledge.title}" (相似度: ${(r.score * 100).toFixed(1)}%)`);
            });
          }

          console.log(`   ✅ 资损风险场景: ${knowledgeResults.riskScenarios.length}条`);
          if (knowledgeResults.riskScenarios.length > 0) {
            knowledgeResults.riskScenarios.forEach((r: any, i: number) => {
              console.log(`      ${i+1}. "${r.knowledge.title}" (相似度: ${(r.score * 100).toFixed(1)}%)`);
            });
          }

          console.log(`   📈 总计检索到: ${totalKnowledge}条相关知识`);

          console.log(`\n🔧 [RAG-Step4] 格式化知识上下文，准备注入AI提示词...`);
          knowledgeContext = this.buildKnowledgeContext(knowledgeResults);
          console.log(`✅ [RAG-Step4] 知识上下文构建完成 (长度: ${knowledgeContext.length}字符)`);

          console.log(`\n🎯 [RAG模式] 将使用知识库增强模式生成测试用例`);
        } else {
          console.log(`\n⚠️  [RAG-Step3] 未检索到相关知识 (所有知识相似度 < 0.5)`);
          console.log(`   💡 这可能是因为:`);
          console.log(`      - 知识库中没有与"${purposeName}"相关的内容`);
          console.log(`      - 相似度阈值0.5设置过高`);
          console.log(`      - 需要添加更多业务知识到知识库`);
          console.log(`\n🔄 [降级处理] 切换到普通模式生成（不使用知识库增强）`);
        }
      } catch (error: any) {
        console.error(`\n❌ [RAG-Error] 知识库查询异常:`);
        console.error(`   错误类型: ${error.name}`);
        console.error(`   错误信息: ${error.message}`);
        console.error(`   错误堆栈: ${error.stack}`);
        console.warn(`\n🔄 [降级处理] 自动切换到普通模式生成`);
      }
    } catch (outerError: any) {
      console.error(`❌ [RAG-Error] 知识库初始化失败:`);
      console.error(`   错误信息: ${outerError.message}`);
      console.warn(`\n🔄 [降级处理] 自动切换到普通模式生成`);
    }

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    const systemPrompt = `你是一个测试用例设计专家。你的任务是为指定的测试目的生成详细的测试点。

## 测试点生成原则

**测试点是什么？**
- 测试点是一个独立的、可执行的测试项
- 每个测试点包含：测试点名称、操作步骤、预期结果、风险等级
- 测试点应该原子化，一个测试点验证一个具体场景

**如何设计测试点？**
1. **正常流程**：验证标准操作路径
2. **异常流程**：验证错误处理和提示
3. **边界条件**：验证特殊值、空值、超长输入等
4. **权限控制**：验证不同角色的权限限制

**风险等级判断：**
- high：核心功能、资金相关、权限控制
- medium：常用功能、数据校验
- low：UI展示、文案校验

## 测试点命名规范 ⚠️ 重要！

**测试点名称必须与测试目的保持一致，不要偏离主题！**

### 命名示例对比

**1. 如果测试目的是"多条件组合查询验证"**
- ✅ 正确示例：
  - "客户名称+订单编号组合查询"
  - "时间范围+渠道类型组合查询"
  - "三个及以上条件组合查询"
- ❌ 错误示例：
  - "客户名称模糊匹配查询" （这是单条件，不是组合）
  - "订单编号精确查询" （这是单条件，不是组合）

**2. 如果测试目的是"边界值和异常输入处理"**
- ✅ 正确示例：
  - "客户名称长度边界值测试（0字符、1字符、最大长度）"
  - "订单编号特殊字符输入测试"
  - "时间范围空值输入测试"
- ❌ 错误示例：
  - "客户名称输入测试" （没有体现边界值）
  - "订单编号查询" （没有体现异常输入）

**3. 如果测试目的是"单条件查询验证"**
- ✅ 正确示例：
  - "客户名称模糊匹配查询"
  - "订单编号精确匹配查询"
  - "时间范围筛选查询"
- ❌ 错误示例：
  - "客户名称+订单编号查询" （这是组合查询，不是单条件）

### 核心原则
- 测试点名称要具体、明确，直接反映测试目的的核心关注点
- 如果测试目的强调"组合"，测试点必须测试多个条件的组合
- 如果测试目的强调"边界值"，测试点必须测试最小值、最大值、临界值
- 如果测试目的强调"异常"，测试点必须测试空值、特殊字符、超长输入

## 输出格式

请输出JSON格式：
\`\`\`json
{
  "testCase": {
    "name": "测试用例名称",
    "testPurpose": "测试目的",
    "system": "系统名",
    "module": "模块名",
    "sectionId": "1.1",
    "sectionName": "章节名称",
    "priority": "high|medium|low",
    "tags": ["标签1", "标签2"],
    "coverageAreas": "功能点1,功能点2",
    "testPoints": [
      {
        "testPurpose": "测试目的",
        "testPoint": "测试点名称",
        "steps": "1. 步骤1\\n2. 步骤2\\n3. 步骤3",
        "expectedResult": "预期结果描述",
        "riskLevel": "high|medium|low"
      }
    ],
    "steps": "汇总步骤",
    "assertions": "汇总预期结果",
    "preconditions": "前置条件",
    "testData": "测试数据"
  }
}
\`\`\`

## 重要提示
- 测试点数量根据测试目的的复杂度决定，通常3-10个
- 每个测试点必须包含 testPurpose 字段
- 步骤要清晰具体，避免模糊描述

${isModifyMode ? `
## ⚠️ 修改页面模式特别说明

当前需求文档包含【变更摘要】，这是一个修改页面。

**你的任务：**
1. **聚焦变更功能**
   - 当前测试目的应该是针对变更功能的（🆕 新增 或 ✏️ 修改）
   - 生成的测试点应该重点测试这些变更
   - 如果是新增字段/按钮：测试其显示、交互、验证规则
   - 如果是修改逻辑：测试新逻辑的正确性、边界条件、与原有功能的兼容性

2. **回归测试**
   - 如果变更可能影响相关功能，需要设计回归测试点
   - 验证修改没有破坏原有功能

3. **不要为未变更功能生成测试点**
   - 不要为标记为 ➖ 原有功能（未变更）的部分生成测试点
` : ''}`;

    const userPrompt = `请为以下测试目的生成详细的测试点：

## 测试目的信息
- 目的ID: ${purposeId}
- 目的名称: ${purposeName}
- 目的描述: ${purposeDescription}
- 系统名称: ${systemName}
- 模块名称: ${moduleName}
- 关联章节: ${relatedSections.join(', ')}

## ⚠️ 特别提醒

当前测试目的是："${purposeName}"

**请确保每个测试点的名称都紧密围绕"${purposeName}"设计，不要偏离主题！**

例如：
- 如果测试目的强调"组合查询"，测试点必须测试多个条件的组合（如"客户名称+订单编号组合查询"）
- 如果测试目的强调"边界值"，测试点必须测试最小值、最大值、临界值（如"客户名称长度边界值测试"）
- 如果测试目的强调"异常输入"，测试点必须测试空值、特殊字符、超长输入（如"订单编号特殊字符输入测试"）
- 如果测试目的强调"单条件查询"，测试点只能测试单个条件（如"客户名称模糊匹配查询"）

## 相关需求内容
${sectionContents}

${knowledgeContext ? `\n## 🔍 参考知识库（测试经验）\n${knowledgeContext}\n` : ''}

${isModifyMode ? `
⚠️ **这是修改页面模式：**
- 当前测试目的应该是针对变更功能的
- 重点测试 🆕 新增 和 ✏️ 修改 的功能点
- 避免为 ➖ 原有功能（未变更）生成测试点
- 如需回归测试，明确标注是验证变更的影响
` : ''}
请生成详细的测试点。直接输出JSON格式，不要其他说明文字。`;

    try {
      console.log(`🤖 正在为测试目的"${purposeName}"生成测试点...`);
      const aiResponse = await this.callAI(systemPrompt, userPrompt, 6000);

      // 解析JSON
      let jsonText = aiResponse.trim();
      const jsonMatch = jsonText.match(/```(?:json)?\n?([\s\S]*?)\n?```/) || jsonText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonText = jsonMatch[1] || jsonMatch[0];
      }

      const parsed = JSON.parse(jsonText);
      const testCase: TestCase = parsed.testCase;

      // 补充信息
      testCase.system = systemName;
      testCase.module = moduleName;

      console.log(`✅ 成功生成测试用例: ${testCase.name}`);
      console.log(`   测试点数量: ${testCase.testPoints?.length || 0}`);

      return testCase;
    } catch (error: any) {
      console.error('❌ 测试点生成失败:', error.message);
      throw error;
    }
  }

  /**
   * 重新生成指定用例
   */
  async regenerateCases(
    originalCases: TestCase[],
    instruction: string,
    requirementDoc: string
  ): Promise<TestCase[]> {
    console.log(`🔄 重新生成${originalCases.length}个用例，指令: ${instruction}`);

    const systemPrompt = `你是一个测试用例优化专家。你的职责是：
1. 根据用户的优化指令改进现有测试用例
2. 保持用例的核心测试目标不变
3. 根据指令优化步骤、验证点、优先级等
4. 确保优化后的用例更完善、更易执行

常见优化指令类型：
- "补充边界条件" - 添加更多边界值测试
- "增强步骤描述" - 让步骤更详细清晰
- "增加异常场景" - 补充异常流程验证
- "调整优先级" - 重新评估优先级
- "细化验证点" - 增加更具体的验证项`;

    const originalCasesList = originalCases.map((tc, i) => `
### 用例 ${i + 1}: ${tc.name}
**描述**: ${tc.description}
**步骤**:
${tc.steps}
**验证点**:
${tc.assertions}
**优先级**: ${tc.priority}
**标签**: ${tc.tags.join(', ')}
`).join('\n');

    const userPrompt = `请根据以下优化指令改进测试用例：

## 优化指令
"${instruction}"

## 原始测试用例
${originalCasesList}

## 需求文档(参考)
${requirementDoc.substring(0, 1500)}...

请输出优化后的测试用例，保持JSON格式：
\`\`\`json
{
  "testCases": [
    {
      "name": "用例名称",
      "description": "用例描述",
      "steps": "1. 步骤1\\n2. 步骤2",
      "assertions": "1. 验证点1\\n2. 验证点2",
      "priority": "high/medium/low",
      "tags": ["标签"],
      "system": "系统名",
      "module": "模块名"
    }
  ]
}
\`\`\``;

    try {
      const aiResponse = await this.callAI(systemPrompt, userPrompt, 3000);

      // 解析AI响应
      let jsonText = aiResponse.trim();
      const jsonMatch = jsonText.match(/```(?:json)?\n?([\s\S]*?)\n?```/) || jsonText.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        jsonText = jsonMatch[1] || jsonMatch[0];
      }

      const parsed = JSON.parse(jsonText);
      const newCases: TestCase[] = parsed.testCases || [];

      console.log(`✅ AI重新生成完成，共${newCases.length}个用例`);
      return newCases;

    } catch (error: any) {
      console.error(`❌ 重新生成失败，使用回退方案:`, error.message);
      // 回退到简单优化
      const newCases = originalCases.map(tc => ({
        ...tc,
        steps: tc.steps + '\n' + this.getOptimizationStep(instruction),
        assertions: tc.assertions + '\n' + this.getOptimizationAssertion(instruction),
        tags: [...tc.tags, instruction.substring(0, 10)]
      }));

      console.log(`✅ 回退方案重新生成完成`);
      return newCases;
    }
  }

  /**
   * 构建知识库上下文（RAG增强）
   */
  private buildKnowledgeContext(knowledgeResults: {
    businessRules: any[];
    testPatterns: any[];
    pitfalls: any[];
    riskScenarios: any[];
  }): string {
    console.log(`\n🔧 [RAG-格式化] 开始构建知识上下文，准备注入AI提示词...`);

    let context = '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    context += '📚 【知识库增强】以下是从企业知识库检索到的相关测试知识：\n';
    context += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';

    let totalKnowledgeAdded = 0;

    // 业务规则
    if (knowledgeResults.businessRules.length > 0) {
      console.log(`   📋 [类别1/4] 添加业务规则 ${knowledgeResults.businessRules.length} 条:`);
      context += '\n## 📋 业务规则参考\n';
      context += '（生成测试用例时必须符合这些业务规则）\n\n';
      knowledgeResults.businessRules.forEach((result, i) => {
        const knowledge = result.knowledge;
        const similarity = (result.score * 100).toFixed(1);
        console.log(`      - "${knowledge.title}" (${similarity}%, ${knowledge.content.length}字符)`);
        context += `**${i + 1}. ${knowledge.title}** (相似度: ${similarity}%)\n`;
        context += `${knowledge.content}\n\n`;
        totalKnowledgeAdded++;
      });
    } else {
      console.log(`   📋 [类别1/4] 业务规则: 无匹配`);
    }

    // 测试模式
    if (knowledgeResults.testPatterns.length > 0) {
      console.log(`   🎯 [类别2/4] 添加测试模式 ${knowledgeResults.testPatterns.length} 条:`);
      context += '\n## 🎯 测试模式参考\n';
      context += '（参考这些测试模式设计测试点，确保覆盖全面）\n\n';
      knowledgeResults.testPatterns.forEach((result, i) => {
        const knowledge = result.knowledge;
        const similarity = (result.score * 100).toFixed(1);
        console.log(`      - "${knowledge.title}" (${similarity}%, ${knowledge.content.length}字符)`);
        context += `**${i + 1}. ${knowledge.title}** (相似度: ${similarity}%)\n`;
        context += `${knowledge.content}\n\n`;
        totalKnowledgeAdded++;
      });
    } else {
      console.log(`   🎯 [类别2/4] 测试模式: 无匹配`);
    }

    // 历史踩坑点
    if (knowledgeResults.pitfalls.length > 0) {
      console.log(`   ⚠️  [类别3/4] 添加历史踩坑点 ${knowledgeResults.pitfalls.length} 条 (高优先级):`);
      context += '\n## ⚠️  历史踩坑点（必须覆盖）\n';
      context += '（这些是历史上发生过的bug，测试用例中必须包含这些场景以避免重复犯错）\n\n';
      knowledgeResults.pitfalls.forEach((result, i) => {
        const knowledge = result.knowledge;
        const similarity = (result.score * 100).toFixed(1);
        console.log(`      - "${knowledge.title}" (${similarity}%, ${knowledge.content.length}字符)`);
        context += `**${i + 1}. ${knowledge.title}** (相似度: ${similarity}%)\n`;
        context += `${knowledge.content}\n\n`;
        totalKnowledgeAdded++;
      });
    } else {
      console.log(`   ⚠️  [类别3/4] 历史踩坑点: 无匹配`);
    }

    // 资损风险场景
    if (knowledgeResults.riskScenarios.length > 0) {
      console.log(`   🔥 [类别4/4] 添加资损风险场景 ${knowledgeResults.riskScenarios.length} 条 (最高优先级):`);
      context += '\n## 🔥 资损风险场景（优先级最高）\n';
      context += '（这些场景可能导致资金损失或安全问题，必须优先测试并标记为high风险等级）\n\n';
      knowledgeResults.riskScenarios.forEach((result, i) => {
        const knowledge = result.knowledge;
        const similarity = (result.score * 100).toFixed(1);
        console.log(`      - "${knowledge.title}" (${similarity}%, ${knowledge.content.length}字符)`);
        context += `**${i + 1}. ${knowledge.title}** (相似度: ${similarity}%)\n`;
        context += `${knowledge.content}\n\n`;
        totalKnowledgeAdded++;
      });
    } else {
      console.log(`   🔥 [类别4/4] 资损风险场景: 无匹配`);
    }

    context += '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    context += '💡 请基于以上知识库内容生成更专业、更全面的测试用例\n';
    context += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';

    console.log(`✅ [RAG-格式化] 知识上下文构建完成:`);
    console.log(`   📊 总计添加 ${totalKnowledgeAdded} 条知识`);
    console.log(`   📏 上下文总长度: ${context.length} 字符`);
    console.log(`   💡 这些知识将被注入到AI系统提示词中，引导生成更专业的测试用例\n`);

    return context;
  }

  /**
   * 根据指令生成优化步骤(回退方案)
   */
  private getOptimizationStep(instruction: string): string {
    if (instruction.includes('边界')) {
      return '5. 验证边界值输入情况';
    } else if (instruction.includes('异常')) {
      return '5. 执行异常场景测试';
    } else if (instruction.includes('详细') || instruction.includes('细化')) {
      return '5. 补充详细操作说明';
    }
    return '5. 根据指令补充测试步骤';
  }

  /**
   * 根据指令生成优化验证点(回退方案)
   */
  private getOptimizationAssertion(instruction: string): string {
    if (instruction.includes('边界')) {
      return '5. 边界值处理符合预期';
    } else if (instruction.includes('异常')) {
      return '5. 异常情况得到正确处理';
    } else if (instruction.includes('详细') || instruction.includes('细化')) {
      return '5. 所有验证点均通过';
    }
    return '5. 补充验证项符合要求';
  }

  /**
   * 🆕 构建增强上下文（将用户确认信息注入到AI提示词）
   */
  private buildEnhancedContext(enhancedData: EnhancedAxureData): string {
    let context = '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    context += '📋 【用户确认信息】以下是用户明确确认的关键信息（优先级最高）：\n';
    context += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

    const { enrichedInfo } = enhancedData;
    let hasAnyInfo = false;

    // 🔥 0. 确认的页面类型（最重要！）
    if (enrichedInfo.pageType) {
      hasAnyInfo = true;
      context += '## 🔥 确认的页面类型（最高优先级！）\n';
      context += '⚠️ 这是用户明确确认的页面类型，决定了后续如何解析所有字段！\n\n';
      context += `**页面类型**: ${enrichedInfo.pageType}\n\n`;

      // 根据页面类型给出明确指导
      if (enrichedInfo.pageType === 'list') {
        context += '📝 **解析指导**:\n';
        context += '- 页面顶部的 input/select 元素应归类为：**查询条件**\n';
        context += '- 页面的 table/div 元素应归类为：**列表展示字段**\n';
        context += '- 🚫 不要生成"表单字段"章节！\n';
        context += '- ✅ 应该生成：查询条件、列表展示字段、操作按钮\n';
      } else if (enrichedInfo.pageType === 'form') {
        context += '📝 **解析指导**:\n';
        context += '- 页面的 input/select 元素应归类为：**表单字段**\n';
        context += '- 🚫 不要生成"查询条件"章节！\n';
        context += '- ✅ 应该生成：表单字段、操作按钮\n';
      } else if (enrichedInfo.pageType === 'detail') {
        context += '📝 **解析指导**:\n';
        context += '- 页面的元素应归类为：**详情展示字段**\n';
        context += '- 🚫 不要生成"查询条件"或"表单字段"章节！\n';
        context += '- ✅ 应该生成：详情展示字段、操作按钮\n';
      }
      context += '\n';
    }

    // 1. 确认的枚举值
    if (Object.keys(enrichedInfo.confirmedEnums).length > 0) {
      hasAnyInfo = true;
      context += '## 📌 确认的枚举值\n';
      context += '（生成需求文档时必须使用这些值，不要修改或添加）\n\n';
      for (const [field, values] of Object.entries(enrichedInfo.confirmedEnums)) {
        context += `- **${field}**: ${values.join('、')}\n`;
      }
      context += '\n';
    }

    // 2. 确认的业务规则
    if (enrichedInfo.confirmedRules.length > 0) {
      hasAnyInfo = true;
      context += '## 📌 确认的业务规则\n';
      context += '（这些是用户明确的业务规则，必须体现在需求文档中）\n\n';
      enrichedInfo.confirmedRules.forEach((rule, index) => {
        context += `${index + 1}. **${rule.field}**: ${rule.rule}\n`;
      });
      context += '\n';
    }

    // 3. 确认的字段含义
    if (Object.keys(enrichedInfo.confirmedMeanings).length > 0) {
      hasAnyInfo = true;
      context += '## 📌 确认的字段含义\n';
      context += '（使用这些明确的字段含义，不要猜测）\n\n';
      for (const [field, meaning] of Object.entries(enrichedInfo.confirmedMeanings)) {
        context += `- **${field}**: ${meaning}\n`;
      }
      context += '\n';
    }

    // 4. 确认的校验规则
    if (enrichedInfo.confirmedValidations.length > 0) {
      hasAnyInfo = true;
      context += '## 📌 确认的校验规则\n\n';
      enrichedInfo.confirmedValidations.forEach((val, index) => {
        context += `${index + 1}. **${val.field}**: ${val.validation}\n`;
      });
      context += '\n';
    }

    if (hasAnyInfo) {
      context += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
      context += '💡 请在生成需求文档时，优先使用以上用户确认的信息\n';
      context += '   标注来源时使用"(来源: 用户确认)"\n';
      context += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
      return context;
    }

    return '';
  }

  /**
   * 构建模拟需求文档（临时实现）
   * 注意：补充业务规则不应出现在需求文档中，它只是辅助AI理解需求的提示
   */
  private buildMockRequirementDoc(axureData: AxureParseResult, projectInfo: ProjectInfo): string {
    return `# ${projectInfo.projectName} 需求文档

## 一、项目概述

- **项目名称**: ${projectInfo.projectName}
- **系统类型**: ${projectInfo.systemType}
- **业务领域**: ${projectInfo.businessDomain}

## 二、原型分析

通过分析Axure原型文件，识别出以下关键信息：

- **页面数量**: ${axureData.pageCount}个
- **交互元素**: ${axureData.elementCount}个
- **交互行为**: ${axureData.interactionCount}个

## 三、功能模块划分

${axureData.pages.map((page, i) => `
### ${i + 1}. ${page.name}

**主要元素**:
${page.elements.slice(0, 5).map(e => `- ${e.type}: ${e.name || e.text || e.placeholder || '未命名'}`).join('\n')}

**交互行为**:
${page.interactions.slice(0, 3).map(int => `- ${int.type}: ${int.trigger}`).join('\n')}
`).join('\n')}

## 四、约束条件

${projectInfo.constraints.map((constraint, i) => `${i + 1}. ${constraint}`).join('\n')}

---
*本文档由AI自动生成，请人工审核确认*
`;
  }

  /**
   * 🆕 提取页面内容区域的红色字段（用于修改页面模式）
   * 排除表格区域，只提取页面主体内容中的红色标记
   */
  private extractRedFields(htmlContent: string): string[] {
    console.log('\n🔍 开始提取页面红色字段...');

    try {
      // 1. 排除表格区域（表格可能包含业务描述）
      let nonTableContent = htmlContent;
      const tableMatch = htmlContent.match(/<div[^>]*class=["'][^"']*table[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi);
      if (tableMatch) {
        tableMatch.forEach(table => {
          nonTableContent = nonTableContent.replace(table, '');
        });
        console.log('   ✓ 已排除表格区域');
      }

      // 2. 提取红色文字（支持多种红色表示法）
      const redPatterns = [
        /<span[^>]*style=["'][^"']*color:\s*#D9001B[^"']*["'][^>]*>([^<]+)<\/span>/gi,
        /<span[^>]*style=["'][^"']*color:\s*red[^"']*["'][^>]*>([^<]+)<\/span>/gi,
        /<span[^>]*style=["'][^"']*color:\s*rgb\(255,\s*0,\s*0\)[^"']*["'][^>]*>([^<]+)<\/span>/gi,
      ];

      const redFields: string[] = [];

      for (const pattern of redPatterns) {
        let match;
        while ((match = pattern.exec(nonTableContent)) !== null) {
          const text = match[1].trim();

          // 过滤条件：
          // 1. 长度 > 1
          // 2. 不是纯符号
          // 3. 不是纯数字（排除数据值）
          // 4. 包含中文或英文字母
          if (
            text.length > 1 &&
            !/^[:\s、，。]+$/.test(text) &&
            !/^\d+$/.test(text) &&
            /[\u4e00-\u9fa5a-zA-Z]/.test(text) &&
            !redFields.includes(text)
          ) {
            redFields.push(text);
          }
        }
      }

      console.log(`   ✓ 提取到 ${redFields.length} 个红色字段:`);
      redFields.forEach((field, i) => {
        console.log(`     ${i + 1}. ${field}`);
      });

      return redFields;
    } catch (error) {
      console.error('   ❌ 提取红色字段失败:', error);
      return [];
    }
  }

  /**
   * 🆕 提取业务描述区域（用于修改页面模式）
   * 使用多策略尝试识别业务描述的位置
   */
  private extractBusinessDescription(htmlContent: string): string {
    console.log('\n📋 开始提取业务描述区域...');

    try {
      // 策略1：查找表格中包含编号列表的单元格（1、2、3...）
      const tableMatch = htmlContent.match(/<div[^>]*class=["'][^"']*table[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);

      if (tableMatch) {
        const tableContent = tableMatch[1];

        // 查找包含"1、"、"2、"等编号的文本块
        const cellMatches = tableContent.match(/<div[^>]*_text[^>]*>([\s\S]*?)<\/div>/gi);

        if (cellMatches) {
          for (const cell of cellMatches) {
            // 提取纯文本
            const text = cell
              .replace(/<[^>]+>/g, '')
              .replace(/&nbsp;/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();

            // 判断是否包含编号列表（1、或①）
            if (/[1-9]、|①|②|③/.test(text) && text.length > 50) {
              console.log(`   ✓ 策略1成功：找到表格中的业务描述（${text.length}字符）`);
              return text;
            }
          }
        }
      }

      // 策略2：查找特定 ID 的元素（基于样本规律）
      const idPatterns = ['u6402', 'u6404', 'u6146', 'u6147'];
      for (const id of idPatterns) {
        const match = htmlContent.match(new RegExp(`<div[^>]*id=["']${id}_text["'][^>]*>([\\s\\S]*?)<\\/div>`, 'i'));
        if (match) {
          const text = match[1]
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          if (text.length > 50) {
            console.log(`   ✓ 策略2成功：找到ID为${id}的业务描述（${text.length}字符）`);
            return text;
          }
        }
      }

      // 策略3：查找包含关键词的区域
      const keywords = ['备注', '说明', '业务描述', '需求', '功能说明'];
      for (const keyword of keywords) {
        const regex = new RegExp(`<div[^>]*>([\\s\\S]*?${keyword}[\\s\\S]*?)<\\/div>`, 'gi');
        const matches = htmlContent.match(regex);

        if (matches && matches.length > 0) {
          const text = matches[0]
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          if (text.length > 50) {
            console.log(`   ✓ 策略3成功：找到包含"${keyword}"的业务描述（${text.length}字符）`);
            return text;
          }
        }
      }

      // 策略4：降级到全文（让 AI 自行识别）
      console.log('   ⚠️ 无法定位业务描述区域，返回空字符串');
      return '';

    } catch (error) {
      console.error('   ❌ 提取业务描述失败:', error);
      return '';
    }
  }
}

export const functionalTestCaseAIService = new FunctionalTestCaseAIService();
