/**
 * 测试用例执行记录服务
 * 负责持久化测试执行数据到数据库
 * 支持数据隔离（按用户/部门）
 */

import { PrismaClient } from '../../src/generated/prisma/index.js';
import { DatabaseService } from './databaseService.js';
import type { TestRun, TestLog } from '../../src/types/test.js';

interface TestCaseExecutionData {
  id: string; // UUID
  testCaseId: number;
  testCaseTitle: string;
  environment: string;
  executionMode: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'error';

  // 执行者信息
  executorUserId?: number;
  executorDepartment?: string;

  // 时间信息
  queuedAt: Date;
  startedAt?: Date;
  finishedAt?: Date;
  durationMs?: number;

  // 执行统计
  totalSteps: number;
  completedSteps: number;
  passedSteps: number;
  failedSteps: number;
  progress: number; // 0-100

  // 错误信息
  errorMessage?: string;

  // 关联数据
  executionLogs?: any; // JSON
  screenshots?: any; // JSON
  artifacts?: any; // JSON
  metadata?: any; // JSON
}

export class TestCaseExecutionService {
  private static instance: TestCaseExecutionService;
  private prisma: PrismaClient;

  private constructor() {
    const databaseService = DatabaseService.getInstance();
    this.prisma = databaseService.getClient();
  }

  static getInstance(): TestCaseExecutionService {
    if (!TestCaseExecutionService.instance) {
      TestCaseExecutionService.instance = new TestCaseExecutionService();
    }
    return TestCaseExecutionService.instance;
  }

  /**
   * 创建新的测试执行记录
   */
  async createExecution(data: {
    id: string;
    testCaseId: number;
    testCaseTitle: string;
    environment: string;
    executionMode?: string;
    executorUserId?: number;
    executorDepartment?: string;
  }): Promise<TestCaseExecutionData> {
    try {
      const execution = await this.prisma.test_case_executions.create({
        data: {
          id: data.id,
          test_case_id: data.testCaseId,
          test_case_title: data.testCaseTitle,
          environment: data.environment,
          execution_mode: data.executionMode || 'standard',
          status: 'queued',
          executor_user_id: data.executorUserId,
          executor_department: data.executorDepartment,
          queued_at: new Date(),
          total_steps: 0,
          completed_steps: 0,
          passed_steps: 0,
          failed_steps: 0,
          progress: 0,
        },
      });

      console.log(`✅ [${data.id}] 创建测试执行记录成功`);
      return this.mapToExecutionData(execution);
    } catch (error) {
      console.error(`❌ [${data.id}] 创建测试执行记录失败:`, error);
      throw error;
    }
  }

  /**
   * 更新测试执行状态
   */
  async updateExecution(
    id: string,
    updates: Partial<{
      status: TestCaseExecutionData['status'];
      startedAt: Date;
      finishedAt: Date;
      durationMs: number;
      totalSteps: number;
      completedSteps: number;
      passedSteps: number;
      failedSteps: number;
      progress: number;
      errorMessage: string;
      executionLogs: any;
      screenshots: any;
      artifacts: any;
      metadata: any;
    }>
  ): Promise<TestCaseExecutionData> {
    try {
      const execution = await this.prisma.test_case_executions.update({
        where: { id },
        data: {
          ...(updates.status && { status: updates.status }),
          ...(updates.startedAt && { started_at: updates.startedAt }),
          ...(updates.finishedAt && { finished_at: updates.finishedAt }),
          ...(updates.durationMs !== undefined && { duration_ms: updates.durationMs }),
          ...(updates.totalSteps !== undefined && { total_steps: updates.totalSteps }),
          ...(updates.completedSteps !== undefined && { completed_steps: updates.completedSteps }),
          ...(updates.passedSteps !== undefined && { passed_steps: updates.passedSteps }),
          ...(updates.failedSteps !== undefined && { failed_steps: updates.failedSteps }),
          ...(updates.progress !== undefined && { progress: updates.progress }),
          ...(updates.errorMessage && { error_message: updates.errorMessage }),
          ...(updates.executionLogs && { execution_logs: updates.executionLogs }),
          ...(updates.screenshots && { screenshots: updates.screenshots }),
          ...(updates.artifacts && { artifacts: updates.artifacts }),
          ...(updates.metadata && { metadata: updates.metadata }),
        },
      });

      return this.mapToExecutionData(execution);
    } catch (error) {
      console.error(`❌ [${id}] 更新测试执行记录失败:`, error);
      throw error;
    }
  }

  /**
   * 获取单个测试执行记录
   */
  async getExecution(id: string): Promise<TestCaseExecutionData | null> {
    try {
      const execution = await this.prisma.test_case_executions.findUnique({
        where: { id },
      });

      if (!execution) {
        return null;
      }

      return this.mapToExecutionData(execution);
    } catch (error) {
      console.error(`❌ [${id}] 获取测试执行记录失败:`, error);
      return null;
    }
  }

  /**
   * 获取测试执行列表（支持数据隔离）
   */
  async getExecutions(filters?: {
    testCaseId?: number;
    executorUserId?: number;
    executorDepartment?: string;
    status?: TestCaseExecutionData['status'];
    limit?: number;
    offset?: number;
  }): Promise<TestCaseExecutionData[]> {
    try {
      const executions = await this.prisma.test_case_executions.findMany({
        where: {
          ...(filters?.testCaseId && { test_case_id: filters.testCaseId }),
          ...(filters?.executorUserId && { executor_user_id: filters.executorUserId }),
          ...(filters?.executorDepartment && { executor_department: filters.executorDepartment }),
          ...(filters?.status && { status: filters.status }),
        },
        orderBy: { queued_at: 'desc' },
        take: filters?.limit || 50,
        skip: filters?.offset || 0,
      });

      return executions.map(exec => this.mapToExecutionData(exec));
    } catch (error) {
      console.error('❌ 获取测试执行列表失败:', error);
      return [];
    }
  }

  /**
   * 从 TestRun 对象同步到数据库
   */
  async syncFromTestRun(testRun: TestRun): Promise<void> {
    try {
      const existingExecution = await this.getExecution(testRun.id);

      // 计算持续时间
      let durationMs: number | undefined;
      if (testRun.startedAt && testRun.finishedAt) {
        durationMs = new Date(testRun.finishedAt).getTime() - new Date(testRun.startedAt).getTime();
      } else if (testRun.startedAt) {
        durationMs = Date.now() - new Date(testRun.startedAt).getTime();
      }

      // 映射状态
      const statusMap: Record<string, TestCaseExecutionData['status']> = {
        'queued': 'queued',
        'running': 'running',
        'completed': 'completed',
        'failed': 'failed',
        'cancelled': 'cancelled',
        'error': 'error',
      };

      const status = statusMap[testRun.status] || 'queued';

      const updateData = {
        status,
        startedAt: testRun.startedAt ? new Date(testRun.startedAt) : undefined,
        finishedAt: testRun.finishedAt ? new Date(testRun.finishedAt) : undefined,
        durationMs,
        totalSteps: testRun.steps?.length || 0,
        completedSteps: testRun.successfulSteps?.length || 0,
        passedSteps: testRun.successfulSteps?.length || 0,
        failedSteps: (testRun.steps?.length || 0) - (testRun.successfulSteps?.length || 0),
        progress: Math.min(100, Math.round((testRun.successfulSteps?.length || 0) / (testRun.steps?.length || 1) * 100)),
        errorMessage: testRun.error,
        executionLogs: testRun.logs || [],
        screenshots: testRun.screenshots || [],
        metadata: {
          suiteId: testRun.suiteId,
          reuseBrowser: testRun.reuseBrowser,
          contextState: testRun.contextState ? 'present' : 'none',
        },
      };

      if (existingExecution) {
        // 更新现有记录
        await this.updateExecution(testRun.id, updateData);
      } else {
        // 创建新记录（如果数据库中不存在）
        // 需要先获取测试用例标题
        const testCase = await this.prisma.test_cases.findUnique({
          where: { id: testRun.testCaseId },
          select: { title: true },
        });

        await this.createExecution({
          id: testRun.id,
          testCaseId: testRun.testCaseId,
          testCaseTitle: testCase?.title || `测试用例 #${testRun.testCaseId}`,
          environment: testRun.environment || 'default',
          executionMode: testRun.executionMode || 'standard',
          executorUserId: testRun.userId ? parseInt(testRun.userId) : undefined,
          executorDepartment: undefined, // TODO: 从用户信息获取
        });

        // 创建后再更新详细信息
        await this.updateExecution(testRun.id, updateData);
      }

      console.log(`✅ [${testRun.id}] 同步测试执行记录成功`);
    } catch (error) {
      console.error(`❌ [${testRun.id}] 同步测试执行记录失败:`, error);
      // 不抛出错误，避免影响测试执行
    }
  }

  /**
   * 批量同步多个 TestRun
   */
  async syncMultiple(testRuns: TestRun[]): Promise<void> {
    const promises = testRuns.map(testRun => this.syncFromTestRun(testRun));
    await Promise.allSettled(promises);
  }

  /**
   * 删除测试执行记录
   */
  async deleteExecution(id: string): Promise<boolean> {
    try {
      await this.prisma.test_case_executions.delete({
        where: { id },
      });

      console.log(`✅ [${id}] 删除测试执行记录成功`);
      return true;
    } catch (error) {
      console.error(`❌ [${id}] 删除测试执行记录失败:`, error);
      return false;
    }
  }

  /**
   * 清理旧的测试执行记录（可选）
   */
  async cleanupOldExecutions(daysToKeep: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const result = await this.prisma.test_case_executions.deleteMany({
        where: {
          queued_at: {
            lt: cutoffDate,
          },
        },
      });

      console.log(`✅ 清理了 ${result.count} 条旧的测试执行记录`);
      return result.count;
    } catch (error) {
      console.error('❌ 清理旧的测试执行记录失败:', error);
      return 0;
    }
  }

  /**
   * 映射数据库模型到服务层数据结构
   */
  private mapToExecutionData(execution: any): TestCaseExecutionData {
    return {
      id: execution.id,
      testCaseId: execution.test_case_id,
      testCaseTitle: execution.test_case_title,
      environment: execution.environment,
      executionMode: execution.execution_mode,
      status: execution.status as TestCaseExecutionData['status'],

      executorUserId: execution.executor_user_id || undefined,
      executorDepartment: execution.executor_department || undefined,

      queuedAt: execution.queued_at,
      startedAt: execution.started_at || undefined,
      finishedAt: execution.finished_at || undefined,
      durationMs: execution.duration_ms || undefined,

      totalSteps: execution.total_steps,
      completedSteps: execution.completed_steps,
      passedSteps: execution.passed_steps,
      failedSteps: execution.failed_steps,
      progress: execution.progress,

      errorMessage: execution.error_message || undefined,

      executionLogs: execution.execution_logs || undefined,
      screenshots: execution.screenshots || undefined,
      artifacts: execution.artifacts || undefined,
      metadata: execution.metadata || undefined,
    };
  }
}
