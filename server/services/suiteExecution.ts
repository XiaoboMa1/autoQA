import pLimit from 'p-limit';
import { v4 as uuidv4 } from 'uuid';
import { TestSuite, TestSuiteRun, SuiteExecutionOptions, TestSuiteRunStatus } from '../types/tests.js';
import { TestExecutionService } from './testExecution.js';
import { WebSocketManager } from './websocket.js';
import { PrismaClient } from '../../src/generated/prisma/index.js';
import { DatabaseService } from './databaseService.js';
import { PlaywrightMcpClient } from './mcpClient.js';
import { getNow } from '../utils/timezone.js';

// 重构后的测试套件服务：完全基于MCP的新流程
export class SuiteExecutionService {
  private wsManager: WebSocketManager;
  private testExecutionService: TestExecutionService;
  private runningSuites: Map<string, TestSuiteRun> = new Map();
  // 🔥 新增：保存 suiteRunId 和 test_runs.id 的映射关系
  private suiteRunIdToTestRunId: Map<string, number> = new Map();
  private databaseService: DatabaseService;
  private prisma: PrismaClient; // 保持兼容性，内部使用
  private mcpClient: PlaywrightMcpClient;
  
  constructor(
    wsManager: WebSocketManager, 
    testExecutionService: TestExecutionService,
    databaseService?: DatabaseService
  ) {
    this.wsManager = wsManager;
    this.testExecutionService = testExecutionService;
    this.mcpClient = testExecutionService['mcpClient']; // 从testExecutionService获取mcpClient
    
    // 🔥 使用依赖注入的数据库服务
    this.databaseService = databaseService || DatabaseService.getInstance();
    this.prisma = this.databaseService.getClient();

    console.log(`🗄️ SuiteExecutionService已连接到数据库服务`);
  }

  // 🔥 执行整个测试套件 - 新流程实现
  public async runSuite(
    suiteId: number, 
    options: SuiteExecutionOptions | string = {}
  ): Promise<string> {
    const suiteRunId = uuidv4();
    const opts: SuiteExecutionOptions = typeof options === 'string' ? { environment: options } : options;
    const environment = opts.environment || 'production';
    const executionMode = opts.executionMode || 'standard';
    const continueOnFailure = opts.continueOnFailure !== false;
    const concurrency = opts.concurrency || 1; // 改为1，确保按顺序执行

    try {
      const suite = await this.findSuiteById(suiteId);
      if (!suite) {
        throw new Error(`套件ID ${suiteId} 未找到`);
      }
      
      await this.createTestRunRecord(suiteId, suiteRunId);
      this.createSuiteRun(suiteRunId, suite, environment);
      
      // 启动异步执行
      this.executeSuiteAsync(
        suiteRunId, 
        suite, 
        environment, 
        executionMode, 
        continueOnFailure,
        concurrency
      ).catch(error => {
        console.error(`[${suiteRunId}] 套件执行失败:`, error);
        this.updateSuiteStatus(suiteRunId, 'failed', error.message);
      });

      return suiteRunId;
    } catch (error: any) {
      console.error('❌ 启动套件执行失败:', error);
      throw error;
    }
  }

  // 🔥 新流程：按顺序执行测试用例
  private async executeSuiteAsync(
    suiteRunId: string,
    suite: TestSuite,
    environment: string,
    executionMode: string,
    continueOnFailure: boolean,
    concurrency: number
  ) {
    const suiteRun = this.runningSuites.get(suiteRunId);
    if (!suiteRun) return;

    console.log(`🚀 [${suiteRunId}] 开始执行套件 [${suite.name}]`);

    try {
      suiteRun.status = 'starting';
      this.broadcastProgress(suiteRunId, suiteRun);
      
      await this.mcpClient.initialize({
        reuseSession: false,
        contextState: null
      });

      suiteRun.status = 'running';
      suiteRun.totalCases = suite.testCaseIds.length;
      this.broadcastProgress(suiteRunId, suiteRun);

      // 按顺序执行测试用例
      for (let i = 0; i < suite.testCaseIds.length; i++) {
        if ((suiteRun.status as TestSuiteRunStatus) === 'cancelled') {
          break;
        }
        if (!continueOnFailure && suiteRun.failedCases > 0) {
          console.log(`[${suiteRunId}] 因有测试失败且设置为不继续，中止套件执行`);
          break;
        }

        const testCaseId = suite.testCaseIds[i];
        const testCase = await this.testExecutionService.findTestCaseById(testCaseId);
        const testCaseName = testCase ? testCase.name : `ID ${testCaseId}`;

        try {
          // 🔥 修复：传递正确的套件ID（数字）和 test_runs.id
          const testRunRecordId = this.suiteRunIdToTestRunId.get(suiteRunId);
          const testRunId = await this.testExecutionService.runTest(
            testCaseId, 
            environment, 
            executionMode,
            {
              reuseBrowser: true,
              suiteId: suite.id, // 🔥 使用套件的数字ID
              suiteRunId: suiteRunId, // 🔥 保留 suiteRunId 用于日志
              testRunRecordId: testRunRecordId, // 🔥 传递 test_runs.id
              contextState: null
            }
          );

          suiteRun.testRuns.push(testRunId);
          const testResult = await this.waitForTestCompletion(testRunId);

          suiteRun.completedCases++;
          if (!testResult.success) {
            suiteRun.failedCases++;
          } else {
            suiteRun.passedCases++;
          }
          
          this.broadcastProgress(suiteRunId, suiteRun);

        } catch (error: any) {
          suiteRun.completedCases++;
          suiteRun.failedCases++;
          console.error(`[${suiteRunId}] 执行失败: ${error.message}`);
        }
      }

      await this.mcpClient.close();

      if ((suiteRun.status as TestSuiteRunStatus) !== 'cancelled') {
        suiteRun.status = suiteRun.failedCases === 0 ? 'completed' : 'failed';
      }
      
      // 🔥 新增：更新 test_runs 记录的最终状态
      const testRunRecordId = this.suiteRunIdToTestRunId.get(suiteRunId);
      if (testRunRecordId) {
        const finalStatus = suiteRun.status === 'completed' ? 'PASSED' : 
                           suiteRun.status === 'failed' ? 'FAILED' : 
                           'CANCELLED';
        await this.prisma.test_runs.update({
          where: { id: testRunRecordId },
          data: {
            status: finalStatus,
            finished_at: getNow()
          }
        });
        console.log(`✅ [${suiteRunId}] 更新 test_runs 记录状态 (id: ${testRunRecordId}, status: ${finalStatus})`);
      }
      
      this.updateSuiteStatus(suiteRunId, suiteRun.status);
      console.log(`✅ [${suiteRunId}] 套件完成 [${suite.name}]`);

    } catch (error: any) {
      await this.updateSuiteStatus(suiteRunId, 'failed', error.message);
      try {
        await this.mcpClient.close();
      } catch (closeError) {
        console.error('关闭浏览器失败:', closeError);
      }
    }
  }

  // 🔥 获取套件执行状态
  public getSuiteRun(suiteRunId: string): TestSuiteRun | null {
    return this.runningSuites.get(suiteRunId) || null;
  }

  // 🔥 新增：获取所有正在运行的套件
  public getAllRunningSuites(): TestSuiteRun[] {
    return Array.from(this.runningSuites.values());
  }

  // 🔥 新增: 清理旧的已完成套件记录
  public cleanupCompletedSuites(hoursAgo: number) {
    const now = Date.now();
    const cutoff = now - hoursAgo * 60 * 60 * 1000;
    
    let cleanedCount = 0;
    for (const [runId, suiteRun] of this.runningSuites.entries()) {
      const endTime = suiteRun.endTime?.getTime() || 0;
      if ((suiteRun.status === 'completed' || suiteRun.status === 'failed') && endTime < cutoff) {
        this.runningSuites.delete(runId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`🧹 清理了 ${cleanedCount} 个 ${hoursAgo} 小时前的旧套件运行记录`);
    }
  }

  // 🔥 取消套件执行
  public async cancelSuite(suiteRunId: string): Promise<boolean> {
    const suiteRun = this.runningSuites.get(suiteRunId);
    if (!suiteRun || (suiteRun.status as TestSuiteRunStatus) !== 'running') {
      return false;
    }

    await this.updateSuiteStatus(suiteRunId, 'cancelled');
    try {
      await this.mcpClient.close(); // 关闭浏览器
    } catch (error) {
      console.error('关闭浏览器失败:', error);
    }
    return true;
  }

  // 🔥 工具方法保持不变
  private async findSuiteById(id: number): Promise<TestSuite | null> {
    try {
      const dbSuite = await this.prisma.test_suites.findUnique({
        where: { id },
        include: {
          suite_case_map: { select: { case_id: true } },
          users: { select: { email: true } }
        }
      });

      if (!dbSuite) return null;

      const metadata = dbSuite.metadata as Record<string, any> || {};
      return {
        id: dbSuite.id,
        name: dbSuite.name,
        description: metadata.description as string,
        owner: dbSuite.users.email,
        tags: metadata.tags as string[] || [],
        testCaseIds: dbSuite.suite_case_map.map(map => map.case_id),
        createdAt: dbSuite.created_at?.toISOString() || new Date().toISOString(),
        updatedAt: metadata.updated_at as string || new Date().toISOString(),
        environment: metadata.environment as string,
        priority: (metadata.priority as 'high' | 'medium' | 'low') || 'medium',
        status: (metadata.status as 'active' | 'draft' | 'disabled') || 'active'
      };
    } catch (error) {
      console.error('获取测试套件失败:', error);
      return null;
    }
  }

  private async createTestRunRecord(suiteId: number, runId: string): Promise<any> {
    try {
      const defaultUser = await this.prisma.users.findFirst({ select: { id: true } });
      if (!defaultUser) throw new Error('系统中没有可用的用户账号');

      const testRunRecord = await this.prisma.test_runs.create({
        data: {
          suite_id: suiteId,
          trigger_user_id: defaultUser.id,
          status: 'PENDING',
          started_at: getNow()
        }
      });

      // 🔥 新增：保存 suiteRunId 和 test_runs.id 的映射关系
      this.suiteRunIdToTestRunId.set(runId, testRunRecord.id);
      console.log(`✅ [${runId}] 创建 test_runs 记录成功 (id: ${testRunRecord.id}, suite_id: ${suiteId})`);

      return testRunRecord;
    } catch (error) {
      console.error('创建测试运行记录失败:', error);
      throw error;
    }
  }

  private createSuiteRun(suiteRunId: string, suite: TestSuite, environment: string) {
    const suiteRun: TestSuiteRun = {
      id: suiteRunId,
      suiteId: suite.id,
      suiteName: suite.name,
      status: 'queued',
      progress: 0,
      startTime: new Date(),
      duration: '0s',
      totalCases: suite.testCaseIds.length,
      completedCases: 0,
      passedCases: 0,
      failedCases: 0,
      executor: 'System',
      environment: environment || 'default',
      testRuns: []
    };

    this.runningSuites.set(suiteRunId, suiteRun);
    
    if (this.wsManager) {
      this.wsManager.broadcast({
        type: 'suiteUpdate', 
        runId: suiteRunId,
        data: { ...suiteRun, startTime: suiteRun.startTime.toISOString() }
      });
    }
  }

  private async waitForTestCompletion(testRunId: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const pollInterval = 1000;
      const maxWaitTime = 10 * 60 * 1000; // 10分钟超时
      const startTime = Date.now();
      
      const pollStatus = () => {
        if (Date.now() - startTime > maxWaitTime) {
          resolve({ success: false, error: '测试执行超时' });
          return;
        }
        
        const allTests = this.testExecutionService.getAllTestRuns();
        const testRun = allTests.find(test => test.runId === testRunId);
        
        if (!testRun) {
          resolve({ success: false, error: '测试运行未找到' });
          return;
        }
        
        if (testRun.status === 'completed') {
          resolve({ success: true });
        } else if (testRun.status === 'failed' || testRun.status === 'cancelled') {
          resolve({ success: false, error: testRun.error || `测试${testRun.status}` });
        } else {
          setTimeout(pollStatus, pollInterval);
        }
      };
      
      pollStatus();
    });
  }

  private async updateSuiteStatus(suiteRunId: string, status: TestSuiteRun['status'], error?: string) {
    const suiteRun = this.runningSuites.get(suiteRunId);
    if (!suiteRun) return;
    
    suiteRun.status = status;
    if (error) suiteRun.error = error;
    
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      suiteRun.endTime = new Date();
      const durationMs = suiteRun.endTime.getTime() - suiteRun.startTime.getTime();
      suiteRun.duration = this.formatDuration(durationMs);
      suiteRun.progress = 100;
    }
    
    if (this.wsManager) {
      this.wsManager.broadcast({
        type: 'suiteUpdate', 
        runId: suiteRunId,
        data: {
          ...suiteRun,
          startTime: suiteRun.startTime.toISOString(),
          endTime: suiteRun.endTime?.toISOString()
        }
      });
    }
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  private broadcastProgress(suiteRunId: string, suiteRun: TestSuiteRun): void {
    const progress = suiteRun.totalCases > 0 
      ? Math.round((suiteRun.completedCases / suiteRun.totalCases) * 100) 
      : 0;
    suiteRun.progress = progress;
    
    this.wsManager.sendToAll(JSON.stringify({
      type: 'suiteUpdate',
      payload: {
        id: suiteRunId,
        progress: progress,
        status: suiteRun.status,
        passed: suiteRun.passedCases,
        failed: suiteRun.failedCases,
        total: suiteRun.totalCases,
        completed: suiteRun.completedCases
      }
    }));
  }

  // 🔥 新增：测试套件CRUD方法
  
  // 获取所有测试套件
  public async getAllTestSuites(userProject?: string, isSuperAdmin?: boolean): Promise<TestSuite[]> {
    try {
      // 🔥 构建查询条件：非超级管理员只能看自己项目的数据
      const where: any = {};
      if (!isSuperAdmin && userProject) {
        where.project = userProject;
      }

      const dbSuites = await this.prisma.test_suites.findMany({
        where,
        include: {
          suite_case_map: { select: { case_id: true } },
          users: { select: { email: true } }
        },
        orderBy: { created_at: 'desc' }
      });

      return dbSuites.map(dbSuite => {
        const metadata = dbSuite.metadata as Record<string, any> || {};
        return {
          id: dbSuite.id,
          name: dbSuite.name,
          description: metadata.description as string || '',
          owner: dbSuite.users.email,
          project: dbSuite.project || undefined,
          tags: metadata.tags as string[] || [],
          testCaseIds: dbSuite.suite_case_map.map(map => map.case_id),
          createdAt: dbSuite.created_at?.toISOString() || new Date().toISOString(),
          updatedAt: metadata.updated_at as string || new Date().toISOString(),
          environment: metadata.environment as string || 'production',
          priority: (metadata.priority as 'high' | 'medium' | 'low') || 'medium',
          status: (metadata.status as 'active' | 'draft' | 'disabled') || 'active'
        };
      });
    } catch (error) {
      console.error('获取测试套件列表失败:', error);
      throw error;
    }
  }

  // 创建测试套件
  public async createTestSuite(suiteData: Partial<TestSuite>): Promise<TestSuite> {
    try {
      // 获取默认用户
      const defaultUser = await this.prisma.users.findFirst({ select: { id: true, email: true } });
      if (!defaultUser) {
        throw new Error('系统中没有可用的用户账号');
      }

      // 验证测试用例是否存在
      if (suiteData.testCaseIds && suiteData.testCaseIds.length > 0) {
        const existingCases = await this.prisma.test_cases.findMany({
          where: { id: { in: suiteData.testCaseIds } },
          select: { id: true }
        });
        
        if (existingCases.length !== suiteData.testCaseIds.length) {
          throw new Error('部分测试用例不存在');
        }
      }

      // 构建元数据
      const metadata = {
        description: suiteData.description || '',
        tags: suiteData.tags || [],
        environment: suiteData.environment || 'production',
        priority: suiteData.priority || 'medium',
        status: suiteData.status || 'active',
        updated_at: getNow().toISOString()
      };

      // 创建测试套件
      const newSuite = await this.prisma.test_suites.create({
        data: {
          name: suiteData.name || 'Untitled Suite',
          owner_id: defaultUser.id,
          project: suiteData.project || null,
          metadata: metadata
        },
        include: {
          users: { select: { email: true } }
        }
      });

      // 创建测试用例关联
      if (suiteData.testCaseIds && suiteData.testCaseIds.length > 0) {
        await this.prisma.suite_case_map.createMany({
          data: suiteData.testCaseIds.map(caseId => ({
            suite_id: newSuite.id,
            case_id: caseId
          }))
        });
      }

      return {
        id: newSuite.id,
        name: newSuite.name,
        description: metadata.description,
        owner: newSuite.users.email,
        project: newSuite.project || undefined,
        tags: metadata.tags,
        testCaseIds: suiteData.testCaseIds || [],
        createdAt: newSuite.created_at?.toISOString() || new Date().toISOString(),
        updatedAt: metadata.updated_at,
        environment: metadata.environment,
        priority: metadata.priority,
        status: metadata.status
      };
    } catch (error) {
      console.error('创建测试套件失败:', error);
      throw error;
    }
  }

  // 更新测试套件
  public async updateTestSuite(id: number, suiteData: Partial<TestSuite>): Promise<TestSuite | null> {
    try {
      // 检查套件是否存在
      const existingSuite = await this.prisma.test_suites.findUnique({
        where: { id },
        include: {
          suite_case_map: { select: { case_id: true } },
          users: { select: { email: true } }
        }
      });

      if (!existingSuite) {
        return null;
      }

      // 验证测试用例是否存在
      if (suiteData.testCaseIds && suiteData.testCaseIds.length > 0) {
        const existingCases = await this.prisma.test_cases.findMany({
          where: { id: { in: suiteData.testCaseIds } },
          select: { id: true }
        });
        
        if (existingCases.length !== suiteData.testCaseIds.length) {
          throw new Error('部分测试用例不存在');
        }
      }

      // 构建更新的元数据
      const existingMetadata = existingSuite.metadata as Record<string, any> || {};
      const updatedMetadata = {
        ...existingMetadata,
        description: suiteData.description !== undefined ? suiteData.description : existingMetadata.description,
        tags: suiteData.tags !== undefined ? suiteData.tags : existingMetadata.tags,
        environment: suiteData.environment !== undefined ? suiteData.environment : existingMetadata.environment,
        priority: suiteData.priority !== undefined ? suiteData.priority : existingMetadata.priority,
        status: suiteData.status !== undefined ? suiteData.status : existingMetadata.status,
        updated_at: getNow().toISOString()
      };

      // 更新测试套件
      const updatedSuite = await this.prisma.test_suites.update({
        where: { id },
        data: {
          name: suiteData.name !== undefined ? suiteData.name : existingSuite.name,
          project: suiteData.project !== undefined ? suiteData.project : existingSuite.project,
          metadata: updatedMetadata
        },
        include: {
          users: { select: { email: true } }
        }
      });

      // 更新测试用例关联
      if (suiteData.testCaseIds !== undefined) {
        // 删除现有关联
        await this.prisma.suite_case_map.deleteMany({
          where: { suite_id: id }
        });

        // 创建新关联
        if (suiteData.testCaseIds.length > 0) {
          await this.prisma.suite_case_map.createMany({
            data: suiteData.testCaseIds.map(caseId => ({
              suite_id: id,
              case_id: caseId
            }))
          });
        }
      }

      return {
        id: updatedSuite.id,
        name: updatedSuite.name,
        description: updatedMetadata.description,
        owner: updatedSuite.users.email,
        project: updatedSuite.project || undefined,
        tags: updatedMetadata.tags,
        testCaseIds: suiteData.testCaseIds !== undefined ? suiteData.testCaseIds : existingSuite.suite_case_map.map(map => map.case_id),
        createdAt: updatedSuite.created_at?.toISOString() || new Date().toISOString(),
        updatedAt: updatedMetadata.updated_at,
        environment: updatedMetadata.environment,
        priority: updatedMetadata.priority,
        status: updatedMetadata.status
      };
    } catch (error) {
      console.error('更新测试套件失败:', error);
      throw error;
    }
  }

  // 删除测试套件
  public async deleteTestSuite(id: number): Promise<boolean> {
    try {
      // 检查是否有正在运行的套件
      const runningSuite = Array.from(this.runningSuites.values()).find(
        suite => suite.suiteId === id && (suite.status === 'running' || suite.status === 'starting')
      );

      if (runningSuite) {
        throw new Error('无法删除正在运行的测试套件');
      }

      // 删除测试套件（级联删除会自动处理关联表）
      await this.prisma.test_suites.delete({
        where: { id }
      });

      return true;
    } catch (error) {
      console.error('删除测试套件失败:', error);
      throw error;
    }
  }
}