/**
 * AI预分析相关类型定义
 * 用于智能补全功能：AI识别不确定信息，用户快速确认
 */

/**
 * 不确定信息类型枚举
 */
export enum UncertainInfoType {
  /** 🔥 页面类型不确定（最重要！决定后续如何解析字段） */
  PAGE_TYPE = 'pageType',
  /** 枚举值不确定（如：下拉框的可选值） */
  ENUM_VALUES = 'enumValues',
  /** 业务规则不确定（如：删除订单的条件） */
  BUSINESS_RULE = 'businessRule',
  /** 字段含义不确定（如：sn、no等简写字段） */
  FIELD_MEANING = 'fieldMeaning',
  /** 校验规则不确定（如：手机号格式、金额范围） */
  VALIDATION_RULE = 'validationRule',
  /** 必填项不确定（如：新增订单时哪些字段必填） */
  FIELD_REQUIRED = 'fieldRequired',
  /** 字段长度限制不确定（如：订单备注最多多少字） */
  FIELD_LENGTH = 'fieldLength',
  /** 流程逻辑不确定（如：审核通过后的操作） */
  WORKFLOW = 'workflow'
}

/**
 * 重要性级别枚举
 */
export enum ImportanceLevel {
  /** 高优先级：必须确认 */
  HIGH = 'high',
  /** 中优先级：建议确认 */
  MEDIUM = 'medium',
  /** 低优先级：可选确认 */
  LOW = 'low'
}

/**
 * 单个不确定信息
 */
export interface UncertainInfo {
  /** 唯一标识 */
  id: string;
  /** 不确定信息类型 */
  type: UncertainInfoType;
  /** 相关字段名（可选） */
  field?: string;
  /** 触发条件（可选，如"点击删除按钮"） */
  trigger?: string;
  /** 向用户提出的问题 */
  question: string;
  /** AI的推测（数组形式，便于多选） */
  aiGuess: string[];
  /** 重要性级别 */
  importance: ImportanceLevel;
  /** 上下文信息 */
  context: {
    /** 所属页面名称 */
    pageName: string;
    /** 元素类型（可选） */
    elementType?: string;
  };
}

/**
 * 用户确认结果
 */
export interface UserConfirmation {
  /** 对应 UncertainInfo.id */
  id: string;
  /** 是否确认（true表示确认，false表示未处理） */
  confirmed: boolean;
  /** 用户提供的值（如果修改了AI推测） */
  userValue?: string[];
  /** 是否跳过（true表示用户选择跳过此问题） */
  skipped: boolean;
}

/**
 * AI预分析完整结果
 */
export interface PreAnalysisResult {
  /** 会话ID */
  sessionId: string;
  /** 整体置信度（0-1之间） */
  confidence: number;
  /** AI很确定的信息列表 */
  clearInfo: string[];
  /** AI不确定的信息列表 */
  uncertainInfo: UncertainInfo[];
  /** 完全缺失的关键信息 */
  missingCritical: string[];
  /** 统计信息 */
  statistics: {
    /** 总字段数 */
    totalFields: number;
    /** 确定的字段数 */
    certainFields: number;
    /** 不确定的字段数 */
    uncertainFields: number;
  };
}

/**
 * 增强的Axure数据（融合用户确认后）
 */
export interface EnhancedAxureData {
  /** 原始解析数据 */
  originalData: any;
  /** AI预分析结果 */
  preAnalysis: PreAnalysisResult;
  /** 用户确认列表 */
  userConfirmations: UserConfirmation[];
  /** 富化后的信息 */
  enrichedInfo: {
    /** 🔥 确认的页面类型（list/form/detail/mixed） */
    pageType?: string;
    /** 确认的枚举值：字段名 → 可选值列表 */
    confirmedEnums: Record<string, string[]>;
    /** 确认的业务规则：{字段/触发器, 规则描述} */
    confirmedRules: Array<{ field: string; rule: string }>;
    /** 确认的字段含义：字段名 → 含义 */
    confirmedMeanings: Record<string, string>;
    /** 确认的校验规则：{字段, 校验描述} */
    confirmedValidations: Array<{ field: string; validation: string }>;
  };
}
