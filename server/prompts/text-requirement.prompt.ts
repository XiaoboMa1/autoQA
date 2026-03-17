export type ContentSourceType = 'pdf' | 'docx' | 'markdown' | 'text';

interface TextPromptOptions {
  systemName?: string;
  moduleName?: string;
  sourceType: ContentSourceType;
}

/**
 * 用于非HTML来源（PDF/DOCX/Markdown/TXT）的需求提取提示词
 * 强调从自然语言段落抽取需求，而非依赖DOM元素
 */
export function getTextRequirementPrompt(options: TextPromptOptions): string {
  const { systemName, moduleName, sourceType } = options;
  const sourceLabel = {
    pdf: 'PDF',
    docx: 'DOCX',
    markdown: 'Markdown',
    text: '文本'
  }[sourceType];

  return `# 📋 ${systemName || '系统'} - ${moduleName || '模块'} 需求提取策略（${sourceLabel} 文档）

## 1️⃣ 文本解析原则
- 输入是自然语言文档，而非HTML/DOM；不要依赖标签、class、按钮或表格结构。
- 逐段落阅读，提取清晰的业务事实、流程、规则、字段、异常和权限要求。
- 只输出文档中出现的真实信息，禁止自造字段或示例。
- 如果文档未描述界面结构，跳过“查询条件/列表展示字段/按钮”类章节。

## 2️⃣ 必须提取的要点
- 功能/场景：核心目标、前置条件、后置结果。
- 数据/字段：实体、字段含义、类型/格式/长度/必填、枚举值。
- 业务规则：计算规则、校验规则、审批/流转规则、拦截条件、时效要求。
- 流程与状态：步骤顺序、状态迁移、角色/权限要求。
- 异常与边界：失败/异常提示、重试/补偿、超时/并发/幂等。
- 依赖：外部系统/接口、数据来源/落地。

## 3️⃣ 章节模板（可根据文档实际裁剪）
### 1. 功能概述
### 2. 业务流程
### 3. 数据与字段
| 字段名 | 数据类型/格式 | 必填 | 枚举/取值范围 | 说明 |
|--------|--------------|------|---------------|------|
### 4. 业务规则
### 5. 校验与异常
### 6. 角色与权限
### 7. 接口/外部依赖
### 8. 其他要求

## 4️⃣ 输出要求
- 全中文术语；保持章节编号连续。
- 表格仅在有结构化字段信息时填写，否则跳过。
- 未提及的信息不输出占位，不编造。`;
}

