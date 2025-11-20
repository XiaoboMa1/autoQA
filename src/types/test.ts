// 🔥 新增：结构化测试步骤接口
export interface TestStepRow {
  id: string;                    // 唯一标识
  order: number;                 // 排序号
  action: string;                // 操作步骤
  expected: string;              // 预期结果
  note?: string;                 // 备注（可选）
  selector?: string;             // 元素选择器（可选）
  screenshot?: string;           // 截图URL（可选）
  duration?: number;             // 预期耗时秒数（可选）
  type?: 'action' | 'verification' | 'setup' | 'cleanup';  // 步骤类型
}

// 测试用例基础接口
export interface TestCase {
  id: number;
  name: string;
  description?: string;
  steps: string;                 // 保留原文本格式（兼容性）
  stepsData?: TestStepRow[];     // 新增：结构化步骤数据
  assertions?: string;
  priority?: 'high' | 'medium' | 'low';
  status?: 'active' | 'draft' | 'disabled';
  tags?: string[];
  system?: string;    // 新增系统字段
  module?: string;    // 新增模块字段
  department?: string; // 🔥 新增：部门字段
  author?: string;
  created?: string;
  lastRun?: string;
  success_rate?: number;
  suiteId?: number; // 🔥 新增：关联的测试套件ID
}

// 用于显示的简化测试用例接口（兼容现有数据）
export interface TestCaseDisplay {
  id: number;
  name: string;
  description: string;
  tags: string[];
  priority: 'high' | 'medium' | 'low';
  status: 'active' | 'draft' | 'disabled';
  lastRun: string;
  success_rate: number;
  author: string;
  created: string;
}

// 测试步骤接口 - 支持多种操作类型
export interface TestStep {
  id: string;
  action: TestAction;
  selector?: string;
  url?: string;
  value?: string;
  text?: string;
  condition?: ExpectCondition;
  timeout?: number;
  description: string;
  order: number;
}

export type TestAction = 
  | 'navigate'
  | 'click' 
  | 'fill'
  | 'expect'
  | 'wait'
  | 'screenshot'
  | 'hover'
  | 'drag'
  | 'select'
  | 'upload'
  | 'press_key'
  | 'tab_new'
  | 'tab_close'
  | 'tab_select'
  | 'back'
  | 'forward'
  | 'pdf_save'
  | 'wait_for_text'
  | 'scroll';

export type ExpectCondition = 
  | 'visible'
  | 'hidden'
  | 'contains_text'
  | 'not_contains_text'
  | 'has_value'
  | 'has_attribute'
  | 'is_enabled'
  | 'is_disabled'
  | 'url_changed'
  | 'logged_in'
  | 'element_exists';

// 测试执行结果
export interface TestRun {
  id:string;
  runId: string;
  testCaseId: number;
  status: TestRunStatus;
  logs: TestLog[];
  startedAt: Date;
  actualStartedAt?: Date; // 🔥 新增：实际开始执行时间（首次变为running状态时）
  environment: string;
  suiteId?: string;
  reuseBrowser?: boolean;
  contextState?: any;
  executionMode?: string;
  steps: TestStep[];
  successfulSteps: string[];
  error?: string;
  endedAt?: Date;
}

export type TestRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'error' | 'cancelled';

export interface TestLog {
  id: string;
  timestamp: Date;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
  stepId?: string;
}

export interface Screenshot {
  id: string;
  stepId: string;
  filename: string;
  timestamp: Date;
  description?: string;
}

// API 请求/响应接口
export interface RunTestRequest {
  testCaseId: number;
  environment?: string;
}

export interface RunTestResponse {
  success: boolean;
  runId: string;
  message?: string;
  error?: string;
}

// MCP 执行结果
export interface McpExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  screenshot?: string;
}

// WebSocket 消息
export interface WebSocketMessage {
  type: 'test_update' | 'test_complete' | 'test_error' | 'log';
  runId: string;
  data: any;
} 

// 🔥 新增：测试套件接口
export interface TestSuite {
  id: number;
  name: string;
  description?: string;
  owner?: string;
  department?: string; // 🔥 新增：部门字段
  tags?: string[];
  testCaseIds: number[];
  createdAt: string;
  updatedAt: string;
  environment?: string;
  priority?: 'high' | 'medium' | 'low';
  status?: 'active' | 'draft' | 'disabled';
}

// 🔥 新增：测试套件运行记录
export interface TestSuiteRun {
  id: string;
  suiteId: number;
  suiteName: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  startTime: string;
  endTime?: string;
  duration: string;
  totalCases: number;
  completedCases: number;
  passedCases: number;
  failedCases: number;
  executor: string;
  environment: string;
  testRuns: string[]; // runIds of individual test cases
  error?: string;
}

// 🔥 新增：套件执行选项
export interface SuiteExecutionOptions {
  environment?: string;
  executionMode?: 'standard' | 'interactive';
  concurrency?: number;
  continueOnFailure?: boolean;
}

// 🆕 三阶段渐进式生成相关类型

/**
 * 测试模块（阶段1输出）
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
 * 测试目的（阶段2输出）
 */
export interface TestPurpose {
  id: string;
  name: string;
  description: string;
  coverageAreas: string; // 逗号分隔的覆盖范围
  estimatedTestPoints: number;
  priority: 'high' | 'medium' | 'low';
  testCase?: any; // 可选，阶段3生成后才有（使用any避免循环引用）
  generating?: boolean; // 是否正在生成测试点（前端状态）
}

// 🔥 新增：系统字典相关类型

/**
 * 系统状态枚举
 */
export type SystemStatus = 'active' | 'inactive';

/**
 * 系统接口
 */
export interface System {
  id: number;
  name: string;
  description?: string | null;
  status: SystemStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/**
 * 创建系统输入
 */
export interface CreateSystemInput {
  name: string;
  description?: string;
  status?: SystemStatus;
  sort_order?: number;
}

/**
 * 更新系统输入
 */
export interface UpdateSystemInput {
  name?: string;
  description?: string;
  status?: SystemStatus;
  sort_order?: number;
}

/**
 * 系统列表响应
 */
export interface SystemsResponse {
  data: System[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * 简化的系统选项（用于下拉选择）
 */
export interface SystemOption {
  id: number;
  name: string;
} 