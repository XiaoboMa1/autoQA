import { showToast } from '../utils/toast';

// 接口定义
export interface AIBulkUpdateParams {
  system: string;
  module: string;
  tagFilter?: string[];
  priorityFilter?: string;
  changeBrief: string;
  userId?: number;
}

export interface CasePatchProposal {
  id?: number;
  session_id?: number;
  case_id: number;
  case_title?: string;
  diff_json: JsonPatch[];
  ai_rationale: string;
  side_effects?: SideEffect[];
  risk_level: 'low' | 'medium' | 'high';
  recall_reason: string;
  old_hash: string;
  new_hash?: string;
  apply_status: 'pending' | 'applied' | 'skipped' | 'conflicted';
  created_at?: Date;
  applied_at?: Date;
}

export interface JsonPatch {
  op: 'replace' | 'add' | 'remove';
  path: string;
  value?: any;
}

export interface SideEffect {
  description: string;
  severity: 'low' | 'medium' | 'high';
}

// 🔥 新增：简化的提案数据结构，只包含用户需要的核心信息
export interface SimplifiedProposal {
  id: number;
  case_id: number;
  case_title: string;
  original_content: string;  // 修改前的用例内容
  modified_content: string;  // 修改后的用例内容
  apply_status: 'pending' | 'applied' | 'skipped' | 'conflicted';
}

export interface SessionResult {
  sessionId: number;
  status: string;
  proposals: CasePatchProposal[];  // 保留原有接口兼容性
  simplifiedProposals?: SimplifiedProposal[];  // 🔥 新增简化提案
  totalCases: number;
  relevantCases: number;
}

export interface ApplyResult {
  success: boolean;
  appliedCount: number;
  failedCount: number;
  results: Array<{
    proposalId: number;
    caseId: number;
    success: boolean;
    error?: string;
    newVersion?: number;
  }>;
  error?: string;
}

export interface SessionDetails {
  session: {
    id: number;
    system: string;
    module: string;
    change_brief: string;
    status: string;
    created_at: Date;
    applied_at?: Date;
    created_by_email?: string;
  };
  proposals: CasePatchProposal[];
  stats: {
    totalProposals: number;
    pendingCount: number;
    appliedCount: number;
    skippedCount: number;
    conflictedCount: number;
  };
}

/**
 * AI批量更新服务
 * 集成前端与后端AI批量更新功能
 */
export class AIBulkUpdateService {
  private baseUrl: string;
  private wsManager: WebSocket | null = null;
  private messageListeners: Map<string, (message: any) => void> = new Map();

  constructor(baseUrl: string = '/api/v1') {
    this.baseUrl = baseUrl;
  }

  /**
   * 获取用户ID (模拟)
   * 实际项目中从认证状态获取
   */
  private getCurrentUserId(): string {
    // 模拟用户ID，实际项目中从认证状态获取
    return '1';
  }

  /**
   * 🔥 新增：生成简化的提案内容
   * @private
   */
  private generateSimplifiedContent(proposal: CasePatchProposal): { original: string; modified: string } {
    try {
      // 获取原始内容 - 这里需要从测试用例数据重构
      let originalContent = `测试用例：${proposal.case_title || '未知标题'}`;
      
      // 如果有 diff_json，尝试重构原始内容
      if (proposal.diff_json && proposal.diff_json.length > 0) {
        const firstPatch = proposal.diff_json[0];
        
        // 根据 path 判断修改的是什么内容
        if (firstPatch.path.includes('steps')) {
          // 这是步骤修改
          originalContent += `\n\n原始步骤：\n`;
          // 这里应该从原始测试用例获取，暂时用占位符
          originalContent += `步骤内容...`;
        }
      }
      
      // 生成修改后的内容
      let modifiedContent = originalContent;
      
      // 应用所有的 patch 操作
      if (proposal.diff_json && proposal.diff_json.length > 0) {
        modifiedContent += `\n\n修改后：\n`;
        proposal.diff_json.forEach((patch, index) => {
          if (patch.op === 'replace' && patch.value) {
            modifiedContent += `${index + 1}. ${patch.path}: ${JSON.stringify(patch.value)}\n`;
          }
        });
      }
      
      return {
        original: originalContent,
        modified: modifiedContent
      };
      
    } catch (error) {
      console.error('生成简化内容失败:', error);
      return {
        original: `测试用例：${proposal.case_title || '未知标题'}`,
        modified: `测试用例：${proposal.case_title || '未知标题'} (修改失败)`
      };
    }
  }

  /**
   * 通用请求方法
   */
  private async makeRequest(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const defaultHeaders = {
      'Content-Type': 'application/json; charset=utf-8',
      'Accept': 'application/json; charset=utf-8',
      'x-user-id': this.getCurrentUserId()
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...defaultHeaders,
          ...options.headers
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage;
        
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorJson.message || `HTTP ${response.status}`;
        } catch {
          errorMessage = `请求失败: HTTP ${response.status}`;
        }
        
        throw new Error(errorMessage);
      }

      const data = await response.json();
      
      if (!data.ok) {
        throw new Error(data.error || '请求处理失败');
      }

      return data.data;

    } catch (error: any) {
      console.error(`❌ API请求失败 [${endpoint}]:`, error);
      throw error;
    }
  }

  /**
   * 检查AI批量更新功能可用性
   */
  async checkFeatureAvailability(): Promise<boolean> {
    try {
      console.log('🔍 [AIBulkUpdateService] 检查功能可用性...');
      
      const result = await this.makeRequest('/features/ai-bulk-update/available');
      const available = result?.available || false;
      
      console.log('✅ [AIBulkUpdateService] 功能检查完成:', available);
      return available;
      
    } catch (error: any) {
      console.error('❌ [AIBulkUpdateService] 检查功能可用性失败:', error);
      return false;
    }
  }

  /**
   * 执行干跑，生成AI提案
   */
  async createDryRun(params: AIBulkUpdateParams): Promise<SessionResult> {
    console.log('🚀 [AIBulkUpdateService] 开始干跑，参数:', params);

    try {
      const result = await this.makeRequest('/ai-bulk/dry-run', {
        method: 'POST',
        body: JSON.stringify(params)
      });

      console.log('✅ [AIBulkUpdateService] 干跑完成:', result);

      // 转换后端数据格式到前端格式
      const sessionResult: SessionResult = {
        sessionId: result.sessionId,
        status: result.status,
        proposals: result.proposals?.map((p: any) => {
          // 确保ID为有效的正整数
          let proposalId: number;
          if (typeof p.id === 'string') {
            proposalId = parseInt(p.id);
            if (isNaN(proposalId) || proposalId <= 0) {
              console.warn('无效的提案ID:', p.id);
              return null; // 标记为无效，稍后过滤
            }
          } else if (typeof p.id === 'number') {
            proposalId = p.id;
            // 🔥 修复：移除严格的正数验证，与组件层保持一致
            if (isNaN(proposalId)) {
              console.warn('无效的提案ID:', p.id);
              return null; // 标记为无效，稍后过滤
            }
          } else {
            console.warn('提案ID类型无效:', p.id);
            return null; // 标记为无效，稍后过滤
          }
          
          return {
          id: proposalId,
          session_id: p.session_id,
          case_id: p.case_id,
          case_title: p.case_title,
          diff_json: Array.isArray(p.diff_json) ? p.diff_json : JSON.parse(p.diff_json || '[]'),
          ai_rationale: p.ai_rationale || '',
          side_effects: Array.isArray(p.side_effects) ? p.side_effects : JSON.parse(p.side_effects || '[]'),
          risk_level: p.risk_level as 'low' | 'medium' | 'high',
          recall_reason: p.recall_reason || '',
          old_hash: p.old_hash,
          new_hash: p.new_hash,
          apply_status: p.apply_status as 'pending' | 'applied' | 'skipped' | 'conflicted',
          created_at: p.created_at ? new Date(p.created_at) : undefined,
          applied_at: p.applied_at ? new Date(p.applied_at) : undefined
        };
        }).filter(p => p !== null) || [], // 过滤掉无效的提案
        totalCases: result.totalCases || 0,
        relevantCases: result.relevantCases || 0
      };

      // 🔥 新增：生成简化的提案数据
      const simplifiedProposals: SimplifiedProposal[] = sessionResult.proposals.map(proposal => {
        const content = this.generateSimplifiedContent(proposal);
        
        return {
          id: proposal.id!,
          case_id: proposal.case_id,
          case_title: proposal.case_title || '未知测试用例',
          original_content: content.original,
          modified_content: content.modified,
          apply_status: proposal.apply_status
        };
      });

      // 🔥 添加简化提案到结果中
      sessionResult.simplifiedProposals = simplifiedProposals;
      
      console.log(`🎯 [AIBulkUpdateService] 生成了 ${simplifiedProposals.length} 个简化提案`);

      return sessionResult;

    } catch (error: any) {
      console.error('❌ [AIBulkUpdateService] 干跑失败:', error);
      throw new Error(`AI分析失败: ${error.message}`);
    }
  }

  /**
   * 应用选中的提案
   * @param sessionId - 会话ID
   * @param proposalIds - 要应用的提案ID列表
   * @param editedContents - 用户编辑的内容 (可选, key为提案ID, value为编辑后的内容)
   */
  async applyProposals(
    sessionId: number,
    proposalIds: number[],
    editedContents?: {[key: number]: string}
  ): Promise<ApplyResult> {
    console.log('🔄 [AIBulkUpdateService] 开始应用提案:', { sessionId, proposalIds, editedContents });

    try {
      const result = await this.makeRequest('/ai-bulk/apply', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: sessionId,
          selectedProposals: proposalIds,
          editedContents: editedContents  // 🔥 传递用户编辑的内容到后端
        })
      });

      console.log('✅ [AIBulkUpdateService] 应用完成:', result);

      return {
        success: result.success || false,
        appliedCount: result.appliedCount || 0,
        failedCount: result.failedCount || 0,
        results: result.results || [],
        error: result.error
      };

    } catch (error: any) {
      console.error('❌ [AIBulkUpdateService] 应用失败:', error);
      throw new Error(`应用提案失败: ${error.message}`);
    }
  }

  /**
   * 获取会话详情
   */
  async getSessionDetails(sessionId: number): Promise<SessionDetails> {
    console.log('📋 [AIBulkUpdateService] 获取会话详情:', sessionId);

    try {
      const result = await this.makeRequest(`/ai-bulk/session/${sessionId}`);

      console.log('✅ [AIBulkUpdateService] 获取会话详情完成:', result);

      return {
        session: {
          id: result.session.id,
          system: result.session.system,
          module: result.session.module,
          change_brief: result.session.change_brief,
          status: result.session.status,
          created_at: new Date(result.session.created_at),
          applied_at: result.session.applied_at ? new Date(result.session.applied_at) : undefined,
          created_by_email: result.session.created_by_email
        },
        proposals: result.proposals?.map((p: any) => ({
          id: typeof p.id === 'string' ? parseInt(p.id) : p.id,
          session_id: p.session_id,
          case_id: p.case_id,
          case_title: p.case_title,
          diff_json: Array.isArray(p.diff_json) ? p.diff_json : JSON.parse(p.diff_json || '[]'),
          ai_rationale: p.ai_rationale || '',
          side_effects: Array.isArray(p.side_effects) ? p.side_effects : JSON.parse(p.side_effects || '[]'),
          risk_level: p.risk_level as 'low' | 'medium' | 'high',
          recall_reason: p.recall_reason || '',
          old_hash: p.old_hash,
          new_hash: p.new_hash,
          apply_status: p.apply_status as 'pending' | 'applied' | 'skipped' | 'conflicted',
          created_at: p.created_at ? new Date(p.created_at) : undefined,
          applied_at: p.applied_at ? new Date(p.applied_at) : undefined
        })) || [],
        stats: result.stats || {
          totalProposals: 0,
          pendingCount: 0,
          appliedCount: 0,
          skippedCount: 0,
          conflictedCount: 0
        }
      };

    } catch (error: any) {
      console.error('❌ [AIBulkUpdateService] 获取会话详情失败:', error);
      throw new Error(`获取会话详情失败: ${error.message}`);
    }
  }

  /**
   * 取消会话
   */
  async cancelSession(sessionId: number): Promise<void> {
    console.log('🚫 [AIBulkUpdateService] 取消会话:', sessionId);

    try {
      await this.makeRequest('/ai-bulk/cancel', {
        method: 'POST',
        body: JSON.stringify({ sessionId: sessionId })
      });

      console.log('✅ [AIBulkUpdateService] 会话已取消:', sessionId);

    } catch (error: any) {
      console.error('❌ [AIBulkUpdateService] 取消会话失败:', error);
      throw new Error(`取消会话失败: ${error.message}`);
    }
  }

  /**
   * 初始化WebSocket连接以监听实时更新
   */
  initializeWebSocket(): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        // 🔥 使用统一的 WebSocket 配置
        const { getWebSocketUrl } = await import('../config/api');
        const wsUrl = `${getWebSocketUrl('/ws')}?userId=${this.getCurrentUserId()}`;
        this.wsManager = new WebSocket(wsUrl);

        this.wsManager.onopen = () => {
          console.log('✅ [AIBulkUpdateService] WebSocket连接已建立');
          resolve();
        };

        this.wsManager.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            console.log('📣 [AIBulkUpdateService] 收到WebSocket消息:', message);

            // 分发消息给所有监听器
            this.messageListeners.forEach((listener, id) => {
              try {
                listener(message);
              } catch (error) {
                console.error(`❌ [AIBulkUpdateService] 消息监听器 ${id} 处理失败:`, error);
              }
            });
          } catch (error) {
            console.error('❌ [AIBulkUpdateService] 解析WebSocket消息失败:', error);
          }
        };

        this.wsManager.onerror = (error) => {
          console.error('❌ [AIBulkUpdateService] WebSocket错误:', error);
          reject(error);
        };

        this.wsManager.onclose = (event) => {
          console.log('🔌 [AIBulkUpdateService] WebSocket连接已关闭:', event.code, event.reason);
          this.wsManager = null;
          
          // 自动重连（生产环境可以添加退避策略）
          if (event.code !== 1000) { // 非正常关闭
            setTimeout(() => {
              console.log('🔄 [AIBulkUpdateService] 尝试重新连接WebSocket...');
              this.initializeWebSocket().catch(console.error);
            }, 5000);
          }
        };

      } catch (error) {
        console.error('❌ [AIBulkUpdateService] 初始化WebSocket失败:', error);
        reject(error);
      }
    });
  }

  /**
   * 添加WebSocket消息监听器
   */
  addMessageListener(id: string, listener: (message: any) => void): void {
    this.messageListeners.set(id, listener);
    console.log(`📡 [AIBulkUpdateService] 添加消息监听器: ${id}`);
  }

  /**
   * 移除WebSocket消息监听器
   */
  removeMessageListener(id: string): void {
    this.messageListeners.delete(id);
    console.log(`📡 [AIBulkUpdateService] 移除消息监听器: ${id}`);
  }

  /**
   * 检查WebSocket连接状态
   */
  isWebSocketConnected(): boolean {
    return this.wsManager?.readyState === WebSocket.OPEN;
  }

  /**
   * 关闭WebSocket连接
   */
  closeWebSocket(): void {
    if (this.wsManager) {
      this.wsManager.close(1000, '主动关闭');
      this.wsManager = null;
    }
    this.messageListeners.clear();
    console.log('🔌 [AIBulkUpdateService] WebSocket连接已关闭');
  }
}

// 创建全局实例
export const aiBulkUpdateService = new AIBulkUpdateService();