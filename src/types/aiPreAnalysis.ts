/**
 * AI预分析相关类型定义（前端）
 * 与后端类型保持一致
 */

export enum UncertainInfoType {
  PAGE_TYPE = 'pageType',
  ENUM_VALUES = 'enumValues',
  BUSINESS_RULE = 'businessRule',
  FIELD_MEANING = 'fieldMeaning',
  VALIDATION_RULE = 'validationRule',
  FIELD_REQUIRED = 'fieldRequired',
  FIELD_LENGTH = 'fieldLength',
  WORKFLOW = 'workflow'
}

export enum ImportanceLevel {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low'
}

export interface UncertainInfo {
  id: string;
  type: UncertainInfoType;
  field?: string;
  trigger?: string;
  question: string;
  aiGuess: string[];
  importance: ImportanceLevel;
  context: {
    pageName: string;
    elementType?: string;
  };
}

export interface UserConfirmation {
  id: string;
  confirmed: boolean;
  userValue?: string[];
  skipped: boolean;
}

export interface PreAnalysisResult {
  sessionId: string;
  confidence: number;
  clearInfo: string[];
  uncertainInfo: UncertainInfo[];
  missingCritical: string[];
  statistics: {
    totalFields: number;
    certainFields: number;
    uncertainFields: number;
  };
}

export interface EnhancedAxureData {
  originalData: any;
  preAnalysis: PreAnalysisResult;
  userConfirmations: UserConfirmation[];
  enrichedInfo: {
    pageType?: string;
    confirmedEnums: Record<string, string[]>;
    confirmedRules: Array<{ field: string; rule: string }>;
    confirmedMeanings: Record<string, string>;
    confirmedValidations: Array<{ field: string; validation: string }>;
  };
}
