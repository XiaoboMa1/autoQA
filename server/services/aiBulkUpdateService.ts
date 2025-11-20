import { PrismaClient } from '../../src/generated/prisma/index.js';
import { AITestParser } from './aiParser.js';
import { EmbeddingService, TestCaseFilters } from './embeddingService.js';
import { VersionService } from './versionService.js';
import { WebSocketManager } from './websocket.js';
import crypto from 'crypto';

// 接口定义
export interface BulkEditParams {
  system: string;
  module: string;
  tagFilter?: string[];
  priorityFilter?: string;
  changeBrief: string;
  userId: number;
}

export interface SessionResult {
  sessionId: number;
  status: string;
  proposals: CasePatchProposal[];
  totalCases: number;
  relevantCases: number;
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

export interface RelevanceResult {
  is_relevant: boolean;
  relevance_score: number;
  recall_reason: string;
}

export interface UpdateResult {
  reasoning: string;
  patch: JsonPatch[];
  side_effects: SideEffect[];
  risk_level: 'low' | 'medium' | 'high';
}

/**
 * AI批量更新服务
 * 负责协调整个批量更新流程
 */
export class AIBulkUpdateService {
  private prisma: PrismaClient;
  private aiParser: AITestParser;
  private embeddingService: EmbeddingService;
  private versionService: VersionService;
  private wsManager: WebSocketManager;

  constructor(
    prisma: PrismaClient,
    aiParser: AITestParser,
    embeddingService: EmbeddingService,
    versionService: VersionService,
    wsManager: WebSocketManager
  ) {
    this.prisma = prisma;
    this.aiParser = aiParser;
    this.embeddingService = embeddingService;
    this.versionService = versionService;
    this.wsManager = wsManager;
  }

  /**
   * 创建批量编辑会话（干跑模式）
   * 生成修改提案但不直接应用
   */
  async createBulkEditSession(params: BulkEditParams): Promise<SessionResult> {
    console.log(`🚀 [AIBulkUpdateService] 开始创建批量编辑会话...`);
    console.log(`   系统: ${params.system}`);
    console.log(`   模块: ${params.module}`);
    console.log(`   变更描述: ${params.changeBrief}`);

    try {
      // 1. 创建批量编辑会话记录
      const session = await this.prisma.bulk_edit_sessions.create({
        data: {
          system: params.system,
          module: params.module,
          tag_filter: params.tagFilter ? JSON.stringify(params.tagFilter) : null,
          priority_filter: params.priorityFilter || null,
          change_brief: params.changeBrief,
          status: 'dry_run',
          created_by: params.userId,
          created_at: new Date()
        }
      });

      console.log(`✅ [AIBulkUpdateService] 会话创建成功 (ID: ${session.id})`);

      // 2. 通过WebSocket通知开始处理
      this.wsManager.broadcast({
        type: 'bulk_update_started',
        payload: {
          sessionId: session.id,
          status: 'finding_cases'
        }
      });

      // 3. 搜索相关测试用例
      const filters: TestCaseFilters = {
        system: params.system,
        module: params.module,
        tags: params.tagFilter,
        priorityFilter: params.priorityFilter,
        changeBrief: params.changeBrief
      };

      const relevantCases = await this.embeddingService.findRelevantTestCases(filters);
      console.log(`🔍 [AIBulkUpdateService] 找到 ${relevantCases.length} 个相关用例`);

      if (relevantCases.length === 0) {
        await this.prisma.bulk_edit_sessions.update({
          where: { id: session.id },
          data: { status: 'failed' }
        });

        return {
          sessionId: session.id,
          status: 'no_cases_found',
          proposals: [],
          totalCases: 0,
          relevantCases: 0
        };
      }

      // 4. 通知开始生成AI提案
      this.wsManager.broadcast({
        type: 'bulk_update_progress',
        payload: {
          sessionId: session.id,
          status: 'generating_proposals',
          progress: 0,
          total: relevantCases.length
        }
      });

      // 5. 生成AI修改提案
      const proposals = await this.generateBulkUpdateProposals(
        session.id,
        params.changeBrief,
        relevantCases
      );

      console.log(`🤖 [AIBulkUpdateService] 生成了 ${proposals.length} 个修改提案`);

      // 6. 保存提案到数据库并获取带ID的完整数据
      const savedProposalsWithIds = await this.savePatchProposals(session.id, proposals);

      // 7. 通知完成
      this.wsManager.broadcast({
        type: 'bulk_update_completed',
        payload: {
          sessionId: session.id,
          status: 'proposals_ready',
          proposalCount: savedProposalsWithIds.length
        }
      });

      console.log(`✅ [AIBulkUpdateService] 批量编辑会话创建完成`);

      return {
        sessionId: session.id,
        status: 'proposals_ready',
        proposals: savedProposalsWithIds, // 🔥 关键修复：使用带ID的提案数据
        totalCases: relevantCases.length,
        relevantCases: savedProposalsWithIds.length
      };

    } catch (error: any) {
      console.error(`❌ [AIBulkUpdateService] 创建批量编辑会话失败: ${error.message}`);
      
      this.wsManager.broadcast({
        type: 'bulk_update_error',
        payload: {
          sessionId: 0,
          error: error.message
        }
      });

      throw new Error(`创建批量编辑会话失败: ${error.message}`);
    }
  }

  /**
   * 应用选中的修改提案
   */
  async applyProposals(sessionId: number, proposalIds: number[]): Promise<ApplyResult> {
    console.log(`🔄 [AIBulkUpdateService] 开始应用提案，会话ID: ${sessionId}`);
    console.log(`   选中提案数: ${proposalIds.length}`);

    try {
      // 1. 获取选中的提案
      const proposals = await this.prisma.case_patch_proposals.findMany({
        where: {
          id: { in: proposalIds },
          session_id: sessionId,
          apply_status: 'pending'
        },
        include: {
          test_cases: {
            select: { id: true, title: true, steps: true, tags: true, system: true, module: true }
          }
        }
      });

      if (proposals.length === 0) {
        throw new Error('没有找到可应用的提案');
      }

      console.log(`📋 [AIBulkUpdateService] 找到 ${proposals.length} 个有效提案`);

      // 2. 通知开始应用
      this.wsManager.broadcast({
        type: 'bulk_apply_started',
        payload: {
          sessionId,
          totalProposals: proposals.length
        }
      });

      const results: ApplyResult['results'] = [];
      let appliedCount = 0;
      let failedCount = 0;

      // 3. 逐个应用提案
      for (let i = 0; i < proposals.length; i++) {
        const proposal = proposals[i];
        
        try {
          // 通知进度
          this.wsManager.broadcast({
            type: 'bulk_apply_progress',
            payload: {
              sessionId,
              progress: i + 1,
              total: proposals.length,
              currentCase: proposal.test_cases.title
            }
          });

          // 应用单个提案
          const result = await this.applySingleProposal(proposal);
          results.push(result);

          if (result.success) {
            appliedCount++;
          } else {
            failedCount++;
          }

        } catch (error: any) {
          console.error(`❌ [AIBulkUpdateService] 应用提案 ${proposal.id} 失败: ${error.message}`);
          
          results.push({
            proposalId: proposal.id,
            caseId: proposal.case_id,
            success: false,
            error: error.message
          });
          
          failedCount++;
        }
      }

      // 4. 更新会话状态
      await this.prisma.bulk_edit_sessions.update({
        where: { id: sessionId },
        data: {
          status: 'applied',
          applied_at: new Date()
        }
      });

      // 5. 通知完成
      this.wsManager.broadcast({
        type: 'bulk_apply_completed',
        payload: {
          sessionId,
          appliedCount,
          failedCount
        }
      });

      console.log(`✅ [AIBulkUpdateService] 批量应用完成: ${appliedCount} 成功, ${failedCount} 失败`);

      return {
        success: failedCount === 0,
        appliedCount,
        failedCount,
        results
      };

    } catch (error: any) {
      console.error(`❌ [AIBulkUpdateService] 批量应用失败: ${error.message}`);

      this.wsManager.broadcast({
        type: 'bulk_apply_error',
        payload: {
          sessionId,
          error: error.message
        }
      });

      return {
        success: false,
        appliedCount: 0,
        failedCount: proposalIds.length,
        results: [],
        error: error.message
      };
    }
  }

  /**
   * 获取会话详情
   */
  async getSessionDetails(sessionId: number): Promise<SessionDetails> {
    console.log(`📋 [AIBulkUpdateService] 获取会话详情: ${sessionId}`);

    try {
      // 获取会话信息
      const session = await this.prisma.bulk_edit_sessions.findUnique({
        where: { id: sessionId },
        include: {
          users: {
            select: { email: true }
          }
        }
      });

      if (!session) {
        throw new Error(`会话 ${sessionId} 不存在`);
      }

      // 获取提案信息
      const proposals = await this.prisma.case_patch_proposals.findMany({
        where: { session_id: sessionId },
        include: {
          test_cases: {
            select: { title: true }
          }
        },
        orderBy: { created_at: 'desc' }
      });

      // 统计信息
      const stats = {
        totalProposals: proposals.length,
        pendingCount: proposals.filter(p => p.apply_status === 'pending').length,
        appliedCount: proposals.filter(p => p.apply_status === 'applied').length,
        skippedCount: proposals.filter(p => p.apply_status === 'skipped').length,
        conflictedCount: proposals.filter(p => p.apply_status === 'conflicted').length
      };

      // 转换提案数据
      const proposalData: CasePatchProposal[] = proposals.map(p => ({
        id: p.id,
        session_id: p.session_id,
        case_id: p.case_id,
        case_title: p.test_cases.title,
        diff_json: Array.isArray(p.diff_json) ? p.diff_json : [],
        ai_rationale: p.ai_rationale || '',
        side_effects: Array.isArray(p.side_effects) ? p.side_effects : [],
        risk_level: p.risk_level as 'low' | 'medium' | 'high',
        recall_reason: p.recall_reason || '',
        old_hash: p.old_hash,
        new_hash: p.new_hash,
        apply_status: p.apply_status as 'pending' | 'applied' | 'skipped' | 'conflicted',
        created_at: p.created_at,
        applied_at: p.applied_at
      }));

      return {
        session: {
          id: session.id,
          system: session.system,
          module: session.module,
          change_brief: session.change_brief,
          status: session.status,
          created_at: session.created_at!,
          applied_at: session.applied_at,
          created_by_email: session.users.email
        },
        proposals: proposalData,
        stats
      };

    } catch (error: any) {
      console.error(`❌ [AIBulkUpdateService] 获取会话详情失败: ${error.message}`);
      throw new Error(`获取会话详情失败: ${error.message}`);
    }
  }

  /**
   * 取消会话
   */
  async cancelSession(sessionId: number): Promise<void> {
    console.log(`🚫 [AIBulkUpdateService] 取消会话: ${sessionId}`);

    try {
      await this.prisma.bulk_edit_sessions.update({
        where: { id: sessionId },
        data: { status: 'cancelled' }
      });

      this.wsManager.broadcast({
        type: 'bulk_update_cancelled',
        payload: { sessionId }
      });

      console.log(`✅ [AIBulkUpdateService] 会话已取消: ${sessionId}`);

    } catch (error: any) {
      console.error(`❌ [AIBulkUpdateService] 取消会话失败: ${error.message}`);
      throw new Error(`取消会话失败: ${error.message}`);
    }
  }

  /**
   * 生成批量更新提案
   * @private
   */
  private async generateBulkUpdateProposals(
    sessionId: number,
    changeBrief: string,
    targetCases: any[]
  ): Promise<CasePatchProposal[]> {
    console.log(`🤖 [AIBulkUpdateService] 开始生成AI修改提案...`);

    const proposals: CasePatchProposal[] = [];
    let processedCount = 0;

    for (const testCase of targetCases) {
      try {
        processedCount++;
        
        // 通知进度
        this.wsManager.broadcast({
          type: 'bulk_update_progress',
          payload: {
            sessionId,
            status: 'generating_proposals',
            progress: processedCount,
            total: targetCases.length,
            currentCase: testCase.title
          }
        });

        // 1. 检查相关性
        const relevanceResult = await this.checkRelevance(changeBrief, testCase);
        if (!relevanceResult.is_relevant) {
          console.log(`⏭️ [AIBulkUpdateService] 跳过不相关用例: ${testCase.title}`);
          continue;
        }

        // 2. 生成修改提案
        const updateResult = await this.generateCaseUpdate(changeBrief, testCase);
        if (!updateResult.patch || updateResult.patch.length === 0) {
          console.log(`⏭️ [AIBulkUpdateService] 跳过无修改用例: ${testCase.title}`);
          continue;
        }

        // 3. 计算内容哈希
        const oldHash = this.versionService.calculateHash(testCase.steps);
        const newSteps = this.applyJsonPatch(testCase.steps, updateResult.patch);
        const newHash = this.versionService.calculateHash(newSteps);

        proposals.push({
          case_id: testCase.id,
          case_title: testCase.title,
          diff_json: updateResult.patch,
          ai_rationale: updateResult.reasoning,
          side_effects: updateResult.side_effects,
          risk_level: updateResult.risk_level,
          recall_reason: relevanceResult.recall_reason,
          old_hash: oldHash,
          new_hash: newHash,
          apply_status: 'pending'
        });

        console.log(`✅ [AIBulkUpdateService] 生成提案: ${testCase.title}`);

      } catch (error: any) {
        console.error(`❌ [AIBulkUpdateService] 为用例 ${testCase.id} 生成提案失败: ${error.message}`);
        continue;
      }
    }

    console.log(`🎯 [AIBulkUpdateService] 提案生成完成: ${proposals.length}/${targetCases.length}`);
    return proposals;
  }

  /**
   * 应用单个提案
   * @private
   */
  private async applySingleProposal(proposal: any): Promise<ApplyResult['results'][0]> {
    console.log(`🔧 [AIBulkUpdateService] ===== 开始应用提案 =====`);
    console.log(`🔧 [AIBulkUpdateService] 提案ID: ${proposal.id}`);
    console.log(`🔧 [AIBulkUpdateService] 用例ID: ${proposal.case_id}`);
    console.log(`🔧 [AIBulkUpdateService] 用例标题: ${proposal.test_cases.title}`);
    console.log(`🔧 [AIBulkUpdateService] Patch操作数量: ${proposal.diff_json.length}`);

    let version: any = null;
    let originalSteps: any = null;
    let newSteps: any = null;
    let dbUpdateSuccess = false;
    let proposalUpdateSuccess = false;

    try {
      // 1. 记录原始数据详情
      originalSteps = proposal.test_cases.steps;
      console.log(`📋 [AIBulkUpdateService] 原始步骤数据类型: ${typeof originalSteps}`);
      console.log(`📋 [AIBulkUpdateService] 原始步骤数据长度: ${typeof originalSteps === 'string' ? originalSteps.length : JSON.stringify(originalSteps).length} 字符`);
      if (typeof originalSteps === 'string') {
        console.log(`📋 [AIBulkUpdateService] 原始步骤内容预览: ${originalSteps.substring(0, 200)}${originalSteps.length > 200 ? '...' : ''}`);
      } else {
        console.log(`📋 [AIBulkUpdateService] 原始步骤内容预览: ${JSON.stringify(originalSteps).substring(0, 200)}...`);
      }

      // 2. 处理并记录JSON Patch详情
      console.log(`🔧 [AIBulkUpdateService] JSON Patch详情:`);
      console.log(`🔧 [AIBulkUpdateService] diff_json类型: ${typeof proposal.diff_json}`);
      console.log(`🔧 [AIBulkUpdateService] diff_json原始值: ${JSON.stringify(proposal.diff_json).substring(0, 300)}...`);
      
      // 🔥 确保diff_json是数组格式
      let patches: any[];
      if (typeof proposal.diff_json === 'string') {
        try {
          patches = JSON.parse(proposal.diff_json);
          console.log(`🔧 [AIBulkUpdateService] diff_json从字符串解析为数组: ${patches.length} 个patch操作`);
        } catch (parseError: any) {
          console.error(`❌ [AIBulkUpdateService] diff_json解析失败: ${parseError.message}`);
          throw new Error(`diff_json格式错误: ${parseError.message}`);
        }
      } else if (Array.isArray(proposal.diff_json)) {
        patches = proposal.diff_json;
        console.log(`✅ [AIBulkUpdateService] diff_json已是数组格式: ${patches.length} 个patch操作`);
      } else {
        console.error(`❌ [AIBulkUpdateService] diff_json格式不支持: ${typeof proposal.diff_json}`);
        throw new Error(`diff_json必须是数组或JSON字符串格式`);
      }
      
      // 验证patches格式
      if (!Array.isArray(patches)) {
        console.error(`❌ [AIBulkUpdateService] 解析后的patches不是数组: ${typeof patches}`);
        throw new Error(`解析后的patches必须是数组格式`);
      }
      
      patches.forEach((patch: any, index: number) => {
        console.log(`   Patch[${index}]: op=${patch.op}, path=${patch.path}, value=${JSON.stringify(patch.value).substring(0, 100)}${JSON.stringify(patch.value).length > 100 ? '...' : ''}`);
      });
      
      // 🔥 更新proposal.diff_json为正确格式供后续使用
      proposal.diff_json = patches;

      // 3. 创建版本备份
      console.log(`💾 [AIBulkUpdateService] 创建版本备份...`);
      version = await this.versionService.createVersion(proposal.case_id);
      console.log(`✅ [AIBulkUpdateService] 版本备份创建成功: v${version.version} (ID: ${version.id})`);
      
      // 4. 应用JSON Patch
      console.log(`🔄 [AIBulkUpdateService] 开始应用JSON Patch...`);
      try {
        newSteps = this.applyJsonPatch(originalSteps, proposal.diff_json);
        console.log(`✅ [AIBulkUpdateService] JSON Patch应用成功`);
        console.log(`📋 [AIBulkUpdateService] 修改后步骤数据类型: ${typeof newSteps}`);
        console.log(`📋 [AIBulkUpdateService] 修改后步骤数据长度: ${typeof newSteps === 'string' ? newSteps.length : JSON.stringify(newSteps).length} 字符`);
        if (typeof newSteps === 'string') {
          console.log(`📋 [AIBulkUpdateService] 修改后步骤内容预览: ${newSteps.substring(0, 200)}${newSteps.length > 200 ? '...' : ''}`);
        } else {
          console.log(`📋 [AIBulkUpdateService] 修改后步骤内容预览: ${JSON.stringify(newSteps).substring(0, 200)}...`);
        }
      } catch (patchError: any) {
        console.error(`❌ [AIBulkUpdateService] JSON Patch应用失败: ${patchError.message}`);
        console.error(`❌ [AIBulkUpdateService] Patch错误堆栈: ${patchError.stack}`);
        throw new Error(`JSON Patch应用失败: ${patchError.message}`);
      }

      // 5. 数据验证检查
      console.log(`🔍 [AIBulkUpdateService] 进行数据验证检查...`);
      try {
        // 检查数据长度限制 (假设数据库字段有长度限制)
        const newStepsStr = typeof newSteps === 'string' ? newSteps : JSON.stringify(newSteps);
        if (newStepsStr.length > 65535) { // TEXT字段限制
          throw new Error(`修改后的数据过长: ${newStepsStr.length} 字符，超过65535字符限制`);
        }
        
        // 检查JSON格式有效性
        if (typeof newSteps === 'string') {
          try {
            JSON.parse(newSteps);
          } catch (jsonError: any) {
            throw new Error(`修改后的数据不是有效的JSON格式: ${jsonError.message}`);
          }
        }
        
        console.log(`✅ [AIBulkUpdateService] 数据验证通过`);
      } catch (validationError: any) {
        console.error(`❌ [AIBulkUpdateService] 数据验证失败: ${validationError.message}`);
        throw new Error(`数据验证失败: ${validationError.message}`);
      }

      // 6. 更新测试用例到数据库
      console.log(`💾 [AIBulkUpdateService] 开始更新测试用例到数据库...`);
      console.log(`💾 [AIBulkUpdateService] 更新目标: test_cases表, ID=${proposal.case_id}`);
      try {
        const updateResult = await this.prisma.test_cases.update({
          where: { id: proposal.case_id },
          data: { steps: newSteps }
        });
        dbUpdateSuccess = true;
        console.log(`✅ [AIBulkUpdateService] 数据库更新成功: 用例 ${proposal.case_id}`);
        console.log(`✅ [AIBulkUpdateService] 更新后记录ID: ${updateResult.id}, 标题: ${updateResult.title}`);
      } catch (dbError: any) {
        console.error(`❌ [AIBulkUpdateService] 数据库更新失败: ${dbError.message}`);
        console.error(`❌ [AIBulkUpdateService] 数据库错误代码: ${dbError.code}`);
        console.error(`❌ [AIBulkUpdateService] 数据库错误详情: ${JSON.stringify(dbError, null, 2)}`);
        console.error(`❌ [AIBulkUpdateService] 数据库错误堆栈: ${dbError.stack}`);
        
        // 具体分析常见数据库错误
        if (dbError.code === 'P2002') {
          throw new Error(`数据库唯一性约束冲突: ${dbError.message}`);
        } else if (dbError.code === 'P2025') {
          throw new Error(`要更新的记录不存在: 用例ID ${proposal.case_id}`);
        } else if (dbError.message.includes('Data too long')) {
          throw new Error(`数据过长，超出数据库字段限制: ${dbError.message}`);
        } else if (dbError.message.includes('Invalid JSON')) {
          throw new Error(`JSON格式错误，数据库无法存储: ${dbError.message}`);
        } else {
          throw new Error(`数据库更新失败: ${dbError.message} (代码: ${dbError.code || 'UNKNOWN'})`);
        }
      }

      // 7. 更新提案状态
      console.log(`📝 [AIBulkUpdateService] 开始更新提案状态...`);
      try {
        const proposalUpdateResult = await this.prisma.case_patch_proposals.update({
          where: { id: proposal.id },
          data: {
            apply_status: 'applied',
            applied_at: new Date()
          }
        });
        proposalUpdateSuccess = true;
        console.log(`✅ [AIBulkUpdateService] 提案状态更新成功: ${proposal.id} -> applied`);
      } catch (proposalError: any) {
        console.error(`❌ [AIBulkUpdateService] 提案状态更新失败: ${proposalError.message}`);
        console.error(`❌ [AIBulkUpdateService] 提案错误堆栈: ${proposalError.stack}`);
        // 提案状态更新失败不影响主要结果，但记录警告
        console.warn(`⚠️ [AIBulkUpdateService] 测试用例更新成功但提案状态更新失败，请手动检查提案 ${proposal.id}`);
      }

      console.log(`🎉 [AIBulkUpdateService] ===== 提案应用完成 =====`);
      console.log(`🎉 [AIBulkUpdateService] 用例 ${proposal.case_id} -> v${version.version} 更新成功`);

      return {
        proposalId: proposal.id,
        caseId: proposal.case_id,
        success: true,
        newVersion: version.version
      };

    } catch (error: any) {
      console.error(`❌ [AIBulkUpdateService] ===== 提案应用失败 =====`);
      console.error(`❌ [AIBulkUpdateService] 提案ID: ${proposal.id}`);
      console.error(`❌ [AIBulkUpdateService] 用例ID: ${proposal.case_id}`);
      console.error(`❌ [AIBulkUpdateService] 错误信息: ${error.message}`);
      console.error(`❌ [AIBulkUpdateService] 错误堆栈: ${error.stack}`);
      console.error(`❌ [AIBulkUpdateService] 执行状态: 版本备份=${version ? '成功' : '失败'}, JSON Patch=${newSteps ? '成功' : '失败'}, 数据库更新=${dbUpdateSuccess ? '成功' : '失败'}, 提案更新=${proposalUpdateSuccess ? '成功' : '失败'}`);
      
      // 记录上下文信息
      if (originalSteps) {
        console.error(`❌ [AIBulkUpdateService] 原始数据长度: ${typeof originalSteps === 'string' ? originalSteps.length : JSON.stringify(originalSteps).length} 字符`);
      }
      if (newSteps) {
        console.error(`❌ [AIBulkUpdateService] 修改后数据长度: ${typeof newSteps === 'string' ? newSteps.length : JSON.stringify(newSteps).length} 字符`);
      }
      
      // 尝试更新提案状态为冲突
      try {
        await this.prisma.case_patch_proposals.update({
          where: { id: proposal.id },
          data: { apply_status: 'conflicted' }
        });
        console.log(`📝 [AIBulkUpdateService] 提案状态已标记为冲突: ${proposal.id}`);
      } catch (statusError: any) {
        console.error(`❌ [AIBulkUpdateService] 标记提案为冲突状态失败: ${statusError.message}`);
      }

      return {
        proposalId: proposal.id,
        caseId: proposal.case_id,
        success: false,
        error: `${error.message} [执行阶段: ${version ? 'JSON应用' : '版本备份'}${newSteps ? '/数据库更新' : ''}]`
      };
    }
  }

  /**
   * 检查用例相关性 (真正的AI调用)
   * @private
   */
  private async checkRelevance(changeBrief: string, testCase: any): Promise<RelevanceResult> {
    console.log(`🔍 [AIBulkUpdateService] 使用AI检查用例相关性: ${testCase.title}`);
    
    try {
      // 使用AITestParser的真正AI相关性检查
      const aiResult = await this.aiParser.checkTestCaseRelevance(changeBrief, testCase);
      
      console.log(`✅ [AIBulkUpdateService] AI相关性检查完成: ${aiResult.is_relevant ? '相关' : '不相关'} (${Math.round(aiResult.relevance_score * 100)}%)`);
      
      return aiResult;
      
    } catch (error: any) {
      console.error(`❌ [AIBulkUpdateService] AI相关性检查失败: ${error.message}, 回退到简化模式`);
      
      // 回退到简化的关键词匹配
      const caseText = `${testCase.title} ${JSON.stringify(testCase.steps)}`.toLowerCase();
      const changeText = changeBrief.toLowerCase();
      
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
          `无关键词匹配 (回退模式)`
      };
    }
  }

  /**
   * 生成用例更新方案 (真正的AI调用)
   * @private
   */
  private async generateCaseUpdate(changeBrief: string, testCase: any): Promise<UpdateResult> {
    console.log(`🤖 [AIBulkUpdateService] 使用AI生成用例更新方案: ${testCase.title}`);
    
    try {
      // 使用AITestParser的真正AI更新生成
      const aiResult = await this.aiParser.generateTestCaseUpdate(changeBrief, testCase);
      
      console.log(`✅ [AIBulkUpdateService] AI更新方案生成完成: ${aiResult.patch.length} 个修改操作`);
      
      return aiResult;
      
    } catch (error: any) {
      console.error(`❌ [AIBulkUpdateService] AI更新方案生成失败: ${error.message}, 回退到简化模式`);
      
      // 回退到简化的模式匹配更新
      if (!testCase.steps || !Array.isArray(testCase.steps)) {
        throw new Error('测试用例步骤格式无效');
      }

      const patches: JsonPatch[] = [];
      
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

  /**
   * 应用JSON Patch
   * @private
   */
  private applyJsonPatch(original: any, patches: JsonPatch[]): any {
    console.log(`🔧 [AIBulkUpdateService] ===== 开始应用JSON Patch =====`);
    console.log(`🔧 [AIBulkUpdateService] 原始数据类型: ${typeof original}`);
    console.log(`🔧 [AIBulkUpdateService] Patch数量: ${patches.length}`);

    // 🔥 处理JSON字符串格式的原始数据
    let result: any;
    if (typeof original === 'string') {
      try {
        console.log(`📥 [AIBulkUpdateService] 开始解析JSON字符串...`);
        console.log(`📥 [AIBulkUpdateService] 原始字符串长度: ${original.length} 字符`);
        result = JSON.parse(original);
        console.log(`✅ [AIBulkUpdateService] JSON字符串解析成功`);
        console.log(`📋 [AIBulkUpdateService] 解析后对象键: ${Object.keys(result).join(', ')}`);
        
        // 🔥 转换数据格式：将steps字符串转换成AI期望的数组格式
        if (result.steps && typeof result.steps === 'string') {
          console.log(`🔄 [AIBulkUpdateService] 开始转换steps格式...`);
          console.log(`🔄 [AIBulkUpdateService] 原始steps类型: ${typeof result.steps}, 长度: ${result.steps.length}`);
          
          const stepsText = result.steps.replace(/\\n/g, '\n');
          const stepLines = stepsText.split('\n').filter(line => line.trim());
          console.log(`🔄 [AIBulkUpdateService] 分割后步骤行数: ${stepLines.length}`);
          
          result.steps = stepLines.map((line, index) => {
            // 清理步骤编号，统一格式
            const cleanLine = line.replace(/^\d+[、。.]?\s*/, '').trim();
            console.log(`   步骤[${index}]: "${line}" -> "${cleanLine}"`);
            return {
              description: cleanLine,
              expectedResult: '', // 默认为空
              action: '' // 默认为空
            };
          });
          
          console.log(`✅ [AIBulkUpdateService] 步骤格式转换完成: ${stepLines.length} 个步骤转换为数组格式`);
        }
        
      } catch (error: any) {
        console.error(`❌ [AIBulkUpdateService] 解析JSON字符串失败: ${error.message}`);
        console.error(`❌ [AIBulkUpdateService] 原始字符串预览: ${original.substring(0, 500)}${original.length > 500 ? '...' : ''}`);
        throw new Error(`原始数据格式无效: ${error.message}`);
      }
    } else {
      console.log(`📋 [AIBulkUpdateService] 原始数据已是对象格式，进行深拷贝`);
      result = JSON.parse(JSON.stringify(original));
    }
    
    console.log(`🔧 [AIBulkUpdateService] 开始逐个应用 ${patches.length} 个patch操作...`);
    
    for (let i = 0; i < patches.length; i++) {
      const patch = patches[i];
      console.log(`🎯 [AIBulkUpdateService] 应用Patch[${i}]: ${patch.op} "${patch.path}"`);
      
      const pathParts = patch.path.split('/').filter(p => p);
      console.log(`🎯 [AIBulkUpdateService] 路径解析: [${pathParts.join(' -> ')}]`);
      
      try {
        switch (patch.op) {
          case 'replace':
            console.log(`🔧 [AIBulkUpdateService] 执行替换操作...`);
            console.log(`🔧 [AIBulkUpdateService] 新值: ${JSON.stringify(patch.value).substring(0, 200)}${JSON.stringify(patch.value).length > 200 ? '...' : ''}`);
            this.setValueByPath(result, pathParts, patch.value);
            console.log(`✅ [AIBulkUpdateService] 替换操作完成`);
            break;
          case 'add':
            console.log(`🔧 [AIBulkUpdateService] 执行添加操作...`);
            console.log(`🔧 [AIBulkUpdateService] 添加值: ${JSON.stringify(patch.value).substring(0, 200)}${JSON.stringify(patch.value).length > 200 ? '...' : ''}`);
            // 简化处理：暂时等同于replace
            this.setValueByPath(result, pathParts, patch.value);
            console.log(`✅ [AIBulkUpdateService] 添加操作完成`);
            break;
          case 'remove':
            console.log(`🔧 [AIBulkUpdateService] 执行删除操作...`);
            this.removeValueByPath(result, pathParts);
            console.log(`✅ [AIBulkUpdateService] 删除操作完成`);
            break;
          default:
            console.error(`❌ [AIBulkUpdateService] 不支持的patch操作: ${patch.op}`);
            throw new Error(`不支持的patch操作: ${patch.op}`);
        }
      } catch (patchError: any) {
        console.error(`❌ [AIBulkUpdateService] Patch[${i}]操作失败: ${patchError.message}`);
        console.error(`❌ [AIBulkUpdateService] 失败的patch: ${JSON.stringify(patch, null, 2)}`);
        throw new Error(`Patch操作失败 (索引${i}): ${patchError.message}`);
      }
    }
    
    console.log(`✅ [AIBulkUpdateService] 所有Patch操作完成`);
    
    // 🔥 如果原始数据是字符串格式，返回字符串格式（保持数据库存储格式一致）
    if (typeof original === 'string') {
      console.log(`🔄 [AIBulkUpdateService] 开始转换回字符串格式...`);
      
      // 🔥 将数组格式的steps转换回字符串格式
      if (result.steps && Array.isArray(result.steps)) {
        console.log(`🔄 [AIBulkUpdateService] 转换steps数组回字符串格式: ${result.steps.length} 个步骤`);
        
        const stepsText = result.steps.map((step, index) => {
          const stepNum = index + 1;
          const stepText = `${stepNum}、${step.description || ''}`;
          console.log(`   步骤[${index}]: "${step.description}" -> "${stepText}"`);
          return stepText;
        }).join('\n');
        
        result.steps = stepsText;
        console.log(`✅ [AIBulkUpdateService] 步骤数组转换回字符串格式: ${result.steps.length} 个字符`);
      }
      
      console.log(`🔄 [AIBulkUpdateService] 将修改结果转换回JSON字符串格式...`);
      const jsonResult = JSON.stringify(result);
      console.log(`✅ [AIBulkUpdateService] 转换完成，结果长度: ${jsonResult.length} 字符`);
      console.log(`🔧 [AIBulkUpdateService] ===== JSON Patch应用完成 =====`);
      return jsonResult;
    }
    
    console.log(`🔧 [AIBulkUpdateService] ===== JSON Patch应用完成 =====`);
    return result;
  }

  /**
   * 根据路径设置值
   * @private
   */
  private setValueByPath(obj: any, path: string[], value: any): void {
    console.log(`🎯 [AIBulkUpdateService] ===== setValueByPath开始 =====`);
    console.log(`🎯 [AIBulkUpdateService] 目标路径: /${path.join('/')}`);
    console.log(`🎯 [AIBulkUpdateService] 根对象类型: ${typeof obj}`);
    console.log(`🎯 [AIBulkUpdateService] 设置值类型: ${typeof value}, 值: ${JSON.stringify(value).substring(0, 100)}${JSON.stringify(value).length > 100 ? '...' : ''}`);
    
    let current = obj;
    let currentPath = '';
    
    // 遍历路径直到倒数第二个元素
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      currentPath += (currentPath ? '/' : '') + key;
      
      console.log(`🎯 [AIBulkUpdateService] 路径遍历[${i}/${path.length-1}]: key="${key}", 当前路径="${currentPath}"`);
      console.log(`🎯 [AIBulkUpdateService] 当前对象类型: ${typeof current}, 键存在: ${key in current}`);
      
      // 🔥 增强类型检查，处理字符串类型的current
      if (typeof current === 'string') {
        const errorMsg = `路径 "${currentPath}" 指向字符串类型，无法继续访问属性 "${key}"`;
        console.error(`❌ [AIBulkUpdateService] ${errorMsg}`);
        throw new Error(errorMsg);
      }
      
      // 如果当前对象不是null且不是object，也无法继续
      if (current !== null && typeof current !== 'object') {
        const errorMsg = `路径 "${currentPath}" 指向 ${typeof current} 类型，无法继续访问属性 "${key}"`;
        console.error(`❌ [AIBulkUpdateService] ${errorMsg}`);
        throw new Error(errorMsg);
      }
      
      // 如果键不存在，创建空对象
      if (!(key in current)) {
        console.log(`🔧 [AIBulkUpdateService] 键 "${key}" 不存在，创建空对象`);
        current[key] = {};
      } else {
        console.log(`✓ [AIBulkUpdateService] 键 "${key}" 已存在，类型: ${typeof current[key]}`);
      }
      
      current = current[key];
      console.log(`🎯 [AIBulkUpdateService] 移动到下一级: ${typeof current}`);
    }
    
    // 设置最终值
    const finalKey = path[path.length - 1];
    const finalPath = currentPath + (currentPath ? '/' : '') + finalKey;
    
    console.log(`🎯 [AIBulkUpdateService] 准备设置最终值:`);
    console.log(`🎯 [AIBulkUpdateService] 最终路径: "${finalPath}"`);
    console.log(`🎯 [AIBulkUpdateService] 最终键: "${finalKey}"`);
    console.log(`🎯 [AIBulkUpdateService] 目标对象类型: ${typeof current}`);
    
    // 🔥 最终赋值前也检查类型
    if (typeof current === 'string') {
      const errorMsg = `路径 "${finalPath}" 的目标是字符串类型，无法设置属性 "${finalKey}"`;
      console.error(`❌ [AIBulkUpdateService] ${errorMsg}`);
      throw new Error(errorMsg);
    }
    
    if (current !== null && typeof current !== 'object') {
      const errorMsg = `路径 "${finalPath}" 的目标是 ${typeof current} 类型，无法设置属性 "${finalKey}"`;
      console.error(`❌ [AIBulkUpdateService] ${errorMsg}`);
      throw new Error(errorMsg);
    }
    
    // 记录旧值（如果存在）
    const hasOldValue = finalKey in current;
    const oldValue = hasOldValue ? current[finalKey] : undefined;
    if (hasOldValue) {
      console.log(`🔄 [AIBulkUpdateService] 替换现有值: ${typeof oldValue}, ${JSON.stringify(oldValue).substring(0, 100)}${JSON.stringify(oldValue).length > 100 ? '...' : ''}`);
    } else {
      console.log(`➕ [AIBulkUpdateService] 添加新属性`);
    }
    
    // 执行赋值
    current[finalKey] = value;
    
    console.log(`✅ [AIBulkUpdateService] 值设置成功`);
    console.log(`🎯 [AIBulkUpdateService] ===== setValueByPath完成 =====`);
  }

  /**
   * 根据路径移除值
   * @private
   */
  private removeValueByPath(obj: any, path: string[]): void {
    console.log(`🗑️ [AIBulkUpdateService] ===== removeValueByPath开始 =====`);
    console.log(`🗑️ [AIBulkUpdateService] 目标路径: /${path.join('/')}`);
    console.log(`🗑️ [AIBulkUpdateService] 根对象类型: ${typeof obj}`);
    
    let current = obj;
    let currentPath = '';
    
    // 遍历路径直到倒数第二个元素
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      currentPath += (currentPath ? '/' : '') + key;
      
      console.log(`🗑️ [AIBulkUpdateService] 路径遍历[${i}/${path.length-1}]: key="${key}", 当前路径="${currentPath}"`);
      console.log(`🗑️ [AIBulkUpdateService] 当前对象类型: ${typeof current}, 键存在: ${key in current}`);
      
      // 如果路径中任何一个键不存在，直接返回
      if (!(key in current)) {
        console.log(`ℹ️ [AIBulkUpdateService] 路径 "${currentPath}" 不存在，跳过删除操作`);
        console.log(`🗑️ [AIBulkUpdateService] ===== removeValueByPath结束 (路径不存在) =====`);
        return;
      }
      
      // 检查类型安全
      if (typeof current === 'string') {
        console.error(`❌ [AIBulkUpdateService] 路径 "${currentPath}" 指向字符串类型，无法继续访问属性 "${key}"`);
        return;
      }
      
      if (current !== null && typeof current !== 'object') {
        console.error(`❌ [AIBulkUpdateService] 路径 "${currentPath}" 指向 ${typeof current} 类型，无法继续访问属性 "${key}"`);
        return;
      }
      
      current = current[key];
      console.log(`🗑️ [AIBulkUpdateService] 移动到下一级: ${typeof current}`);
    }
    
    // 删除最终键
    const finalKey = path[path.length - 1];
    const finalPath = currentPath + (currentPath ? '/' : '') + finalKey;
    
    console.log(`🗑️ [AIBulkUpdateService] 准备删除最终值:`);
    console.log(`🗑️ [AIBulkUpdateService] 最终路径: "${finalPath}"`);
    console.log(`🗑️ [AIBulkUpdateService] 最终键: "${finalKey}"`);
    console.log(`🗑️ [AIBulkUpdateService] 目标对象类型: ${typeof current}`);
    
    // 检查最终键是否存在
    if (!(finalKey in current)) {
      console.log(`ℹ️ [AIBulkUpdateService] 最终键 "${finalKey}" 不存在，跳过删除操作`);
      console.log(`🗑️ [AIBulkUpdateService] ===== removeValueByPath结束 (键不存在) =====`);
      return;
    }
    
    // 记录要删除的值
    const valueToDelete = current[finalKey];
    console.log(`🗑️ [AIBulkUpdateService] 即将删除的值类型: ${typeof valueToDelete}`);
    console.log(`🗑️ [AIBulkUpdateService] 即将删除的值: ${JSON.stringify(valueToDelete).substring(0, 100)}${JSON.stringify(valueToDelete).length > 100 ? '...' : ''}`);
    
    // 执行删除
    delete current[finalKey];
    
    console.log(`✅ [AIBulkUpdateService] 值删除成功`);
    console.log(`🗑️ [AIBulkUpdateService] ===== removeValueByPath完成 =====`);
  }

  /**
   * 保存提案到数据库并返回带ID的完整提案数据
   * @private
   */
  private async savePatchProposals(sessionId: number, proposals: CasePatchProposal[]): Promise<CasePatchProposal[]> {
    console.log(`💾 [AIBulkUpdateService] 保存 ${proposals.length} 个提案到数据库...`);

    try {
      // 🔥 修复：截断过长的字段以符合数据库约束
      const truncateString = (str: string | null | undefined, maxLength: number): string | null => {
        if (!str) return null;
        return str.length > maxLength ? str.substring(0, maxLength - 3) + '...' : str;
      };

      const createData = proposals.map(p => ({
        session_id: sessionId,
        case_id: p.case_id,
        diff_json: JSON.stringify(p.diff_json),
        ai_rationale: p.ai_rationale,
        side_effects: p.side_effects ? JSON.stringify(p.side_effects) : null,
        risk_level: p.risk_level,
        recall_reason: truncateString(p.recall_reason, 255),
        old_hash: p.old_hash,
        new_hash: p.new_hash,
        apply_status: p.apply_status,
        created_at: new Date()
      }));

      // 🔥 修复：使用 createMany 保存后，立即查询带ID的完整数据
      await this.prisma.case_patch_proposals.createMany({
        data: createData
      });

      // 🔥 关键修复：查询刚保存的提案，获取数据库生成的ID
      const savedProposals = await this.prisma.case_patch_proposals.findMany({
        where: {
          session_id: sessionId
        },
        include: {
          test_cases: {
            select: {
              id: true,
              title: true
            }
          }
        },
        orderBy: {
          created_at: 'desc'
        },
        take: proposals.length // 只获取最新的提案数量
      });

      console.log(`✅ [AIBulkUpdateService] 提案保存完成，返回 ${savedProposals.length} 个带ID的提案`);

      // 🔥 转换为前端期望的格式
      const formattedProposals: CasePatchProposal[] = savedProposals.map(p => ({
        id: p.id,
        session_id: p.session_id,
        case_id: p.case_id,
        case_title: p.test_cases.title,
        diff_json: Array.isArray(p.diff_json) ? p.diff_json : JSON.parse(p.diff_json as string || '[]'),
        ai_rationale: p.ai_rationale,
        side_effects: Array.isArray(p.side_effects) ? p.side_effects : JSON.parse(p.side_effects as string || '[]'),
        risk_level: p.risk_level as 'low' | 'medium' | 'high',
        recall_reason: p.recall_reason,
        old_hash: p.old_hash,
        new_hash: p.new_hash,
        apply_status: p.apply_status as 'pending' | 'applied' | 'skipped' | 'conflicted',
        created_at: p.created_at,
        applied_at: p.applied_at
      }));

      return formattedProposals;

    } catch (error: any) {
      console.error(`❌ [AIBulkUpdateService] 保存提案失败: ${error.message}`);
      throw error;
    }
  }
}