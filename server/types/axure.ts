/**
 * Axure HTML解析相关类型定义
 */

/**
 * 页面类型枚举
 * - list: 列表页（带查询条件的数据列表）
 * - form: 表单页（新建/编辑页面）
 * - detail: 详情页（只读展示页面）
 * - dialog: 弹窗页（独立弹窗，可能是表单或详情）
 * - mixed: 混合页（包含多种元素，难以分类）
 * - unknown: 未知类型
 */
export type PageType = 'list' | 'form' | 'detail' | 'dialog' | 'mixed' | 'unknown';

export interface AxureParseResult {
  sessionId: string;
  pageCount: number;
  elementCount: number;
  interactionCount: number;
  pages: AxurePage[];
}

export interface AxurePage {
  name: string;
  url: string;
  elements: AxureElement[];
  interactions: AxureInteraction[];
  pageType?: PageType;  // 页面类型，由detectPageType()自动识别
}

export interface AxureElement {
  id: string;
  type: string;
  name?: string;
  placeholder?: string;
  text?: string;
  value?: string;
}

export interface AxureInteraction {
  type: string;
  trigger: string;
  target?: string;
  action?: string;
}

/**
 * 页面模式枚举（不存储到数据库，仅用于生成时区分）
 * - new: 新增页面（完整解析）
 * - modify: 修改页面（识别变更点）
 */
export type PageMode = 'new' | 'modify';

/**
 * 平台类型枚举
 * - web: Web端（PC端浏览器）
 * - mobile: 移动端（H5/iOS/Android App）
 */
export type PlatformType = 'web' | 'mobile';

/**
 * 项目信息接口（用于需求文档生成）
 */
export interface ProjectInfo {
  systemName?: string;
  moduleName?: string;
  pageMode?: PageMode;
  platformType?: PlatformType;
  businessRules?: string[];
}
