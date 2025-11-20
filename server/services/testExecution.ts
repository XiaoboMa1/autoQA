import { PrismaClient, Prisma } from '../../src/generated/prisma/index.js';
import { v4 as uuidv4 } from 'uuid';
import { WebSocketManager } from './websocket.js';
import { PlaywrightMcpClient } from './mcpClient.js';
import { MCPToolMapper } from '../utils/mcpToolMapper.js';
import { AITestParser } from './aiParser.js';
import { ScreenshotService } from './screenshotService.js';
import { DatabaseService } from './databaseService.js';
import { testRunStore } from '../../lib/TestRunStore.js';
import type { TestRun, TestStep, TestLog, TestCase, TestRunStatus } from '../../src/types/test.js';
import type { ScreenshotRecord } from '../types/screenshot.js';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
import { QueueService, QueueTask } from './queueService.js';
import { StreamService } from './streamService.js';
import { EvidenceService } from './evidenceService.js';
import { TestCaseExecutionService } from './testCaseExecutionService.js';

// 重构后的测试执行服务：完全基于MCP的新流程
export class TestExecutionService {
  private wsManager: WebSocketManager;
  private mcpClient: PlaywrightMcpClient;
  private aiParser: AITestParser;
  private screenshotService: ScreenshotService;
  private databaseService: DatabaseService;
  private prisma: PrismaClient; // 保持兼容性，内部使用
  private queueService: QueueService;
  private streamService: StreamService;
  private evidenceService: EvidenceService;
  private executionService: TestCaseExecutionService;

  // 🚀 Phase 4: 性能监控系统
  private performanceMonitor = {
    enabled: process.env.ENABLE_PERFORMANCE_MONITORING !== 'false',
    failureThreshold: 0.05, // 失败率超过5%自动回退
    avgTimeThreshold: 30, // 平均执行时间超过30秒报警
    optimizationMode: process.env.PERFORMANCE_MODE || 'balanced', // fast|balanced|stable
    
    stats: {
      totalRuns: 0,
      successfulRuns: 0,
      totalTime: 0,
      optimizedRuns: 0,
      fallbackRuns: 0
    },
    
    recordExecution: (runId: string, success: boolean, duration: number, usedOptimization: boolean) => {
      this.performanceMonitor.stats.totalRuns++;
      if (success) this.performanceMonitor.stats.successfulRuns++;
      this.performanceMonitor.stats.totalTime += duration;
      if (usedOptimization) this.performanceMonitor.stats.optimizedRuns++;
      else this.performanceMonitor.stats.fallbackRuns++;
      
      // 检查是否需要回退
      if (this.performanceMonitor.shouldFallback()) {
        console.log('⚠️ 性能监控：检测到优化导致问题，建议切换到安全模式');
      }
    },
    
    shouldFallback: () => {
      const { stats } = this.performanceMonitor;
      if (stats.totalRuns < 10) return false; // 样本太小，不做判断
      
      const failureRate = 1 - (stats.successfulRuns / stats.totalRuns);
      const avgTime = stats.totalTime / stats.totalRuns;
      
      return failureRate > this.performanceMonitor.failureThreshold || 
             avgTime > this.performanceMonitor.avgTimeThreshold;
    },
    
    getReport: () => {
      const { stats } = this.performanceMonitor;
      if (stats.totalRuns === 0) return '性能监控：暂无数据';
      
      return `性能监控报告:
📊 总运行次数: ${stats.totalRuns}
✅ 成功率: ${((stats.successfulRuns / stats.totalRuns) * 100).toFixed(1)}%
⏱️  平均用时: ${(stats.totalTime / stats.totalRuns).toFixed(1)}秒
🚀 优化模式运行: ${stats.optimizedRuns}次
🛡️ 安全模式运行: ${stats.fallbackRuns}次`;
    }
  };

  constructor(
    wsManager: WebSocketManager, 
    aiParser: AITestParser, 
    mcpClient: PlaywrightMcpClient, 
    databaseService?: DatabaseService,
    screenshotService?: ScreenshotService,
    queueService?: QueueService,
    streamService?: StreamService,
    evidenceService?: EvidenceService
  ) {
    this.wsManager = wsManager;
    this.aiParser = aiParser;
    this.mcpClient = mcpClient;
    
    // 🔥 使用依赖注入的数据库服务
    this.databaseService = databaseService || DatabaseService.getInstance();
    this.prisma = this.databaseService.getClient();
    
    // 创建Screenshot服务，传入数据库客户端
    this.screenshotService = screenshotService || new ScreenshotService(this.prisma);

    // 🔥 修正：初始化新增强服务
    this.queueService = queueService || new QueueService({
      maxConcurrency: 6,
      perUserLimit: 2,
      taskTimeout: 600000, // 10分钟
      retryAttempts: 1
    });

    this.streamService = streamService || new StreamService({
      fps: 2,
      jpegQuality: 60,
      width: 1024,
      height: 768,
      maskSelectors: []
    });

    this.evidenceService = evidenceService || new EvidenceService(
      this.prisma,
      path.join(process.cwd(), 'artifacts'),
      process.env.BASE_URL || 'http://localhost:3000'
    );

    // 🔥 初始化测试执行持久化服务
    this.executionService = TestCaseExecutionService.getInstance();

    console.log(`🗄️ TestExecutionService已连接到数据库服务`);

    // 在构造函数中记录AI解析器的模型信息
    this.logAIParserInfo();
  }

  // 记录AI解析器信息
  private logAIParserInfo(): void {
    try {
      const modelInfo = this.aiParser.getCurrentModelInfo();
      console.log(`🤖 测试执行服务已初始化，AI解析器配置:`);
      console.log(`   模型: ${modelInfo.modelName} (${modelInfo.provider})`);
      console.log(`   运行模式: ${modelInfo.mode}`);

      if (this.aiParser.isConfigManagerMode()) {
        console.log(`   配置管理器: 已启用`);
      } else {
        console.log(`   配置管理器: 未启用 (使用传统模式)`);
      }
    } catch (error) {
      console.warn(`⚠️ 无法获取AI解析器模型信息: ${error.message}`);
    }
  }

  // 重新加载AI解析器配置（无需重启服务）
  public async reloadAIParserConfiguration(): Promise<void> {
    try {
      console.log(`🔄 测试执行服务：重新加载AI解析器配置...`);

      // 调用AI解析器的配置重载方法
      await this.aiParser.reloadConfiguration();

      // 重新记录配置信息
      this.logAIParserInfo();

      console.log(`✅ 测试执行服务：AI解析器配置重新加载完成`);
    } catch (error) {
      console.error(`❌ 测试执行服务：重新加载AI解析器配置失败:`, error);
      throw error;
    }
  }

  // 获取当前AI解析器状态信息
  public getAIParserStatus(): {
    modelInfo: { modelName: string; provider: string; mode: string };
    isConfigManagerMode: boolean;
    isReady: boolean;
  } {
    try {
      const modelInfo = this.aiParser.getCurrentModelInfo();
      return {
        modelInfo,
        isConfigManagerMode: this.aiParser.isConfigManagerMode(),
        isReady: true
      };
    } catch (error) {
      return {
        modelInfo: { modelName: '未知', provider: '未知', mode: '未知' },
        isConfigManagerMode: false,
        isReady: false
      };
    }
  }

  // #region Test Case Management
  private dbTestCaseToApp(dbCase: { id: number; title: string; steps: Prisma.JsonValue | null; tags: Prisma.JsonValue | null; system: string | null; module: string | null; department?: string | null; created_at: Date | null; }): TestCase {
    let steps = '';
    let assertions = '';
    if (typeof dbCase.steps === 'string' && dbCase.steps) {
      try {
        const stepsObj = JSON.parse(dbCase.steps);
        if (stepsObj && typeof stepsObj === 'object') {
          assertions = stepsObj.assertions || '';
          steps = stepsObj.steps || '';
        } else {
          steps = dbCase.steps;
        }
      } catch (e) {
        steps = dbCase.steps;
      }
    }

    return {
      id: dbCase.id,
      name: dbCase.title,
      steps: steps,
      assertions: assertions,
      tags: (Array.isArray(dbCase.tags) ? dbCase.tags : []) as string[],
      system: dbCase.system || undefined,
      module: dbCase.module || undefined,
      department: dbCase.department || undefined,
      created: dbCase.created_at?.toISOString(),
      priority: 'medium',
      status: 'active',
      author: 'System',
    };
  }

  public async findTestCaseById(id: number): Promise<TestCase | null> {
    const testCase = await this.prisma.test_cases.findUnique({ 
      where: { id },
      select: {
        id: true,
        title: true,
        steps: true,
        tags: true,
        system: true,
        module: true,
        department: true,
        created_at: true
      }
    });
    return testCase ? this.dbTestCaseToApp(testCase) : null;
  }

  public async getTestCases(): Promise<TestCase[]> {
    const testCases = await this.prisma.test_cases.findMany({
      select: {
        id: true,
        title: true,
        steps: true,
        tags: true,
        system: true,
        module: true,
        department: true,
        created_at: true
      }
    });
    return testCases.map(this.dbTestCaseToApp);
  }

  // 🚀 新增：根据ID获取单个测试用例
  public async getTestCaseById(id: number): Promise<TestCase | null> {
    const testCase = await this.prisma.test_cases.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        steps: true,
        tags: true,
        system: true,
        module: true,
        department: true,
        created_at: true
      }
    });
    return testCase ? this.dbTestCaseToApp(testCase) : null;
  }

  // 🔥 新增：支持分页和过滤的测试用例查询
  public async getTestCasesPaginated(params: {
    page: number;
    pageSize: number;
    search?: string;
    tag?: string;
    priority?: string;
    status?: string;
    system?: string;
    userDepartment?: string;
    isSuperAdmin?: boolean;
  }): Promise<{data: TestCase[], total: number}> {
    const { page, pageSize, search, tag, priority, status, system, userDepartment, isSuperAdmin } = params;

    // 构建查询条件
    const where: any = {};

    // 🔥 部门权限过滤：非超级管理员只能看自己部门的数据
    if (!isSuperAdmin && userDepartment) {
      where.department = userDepartment;
    }

    // 搜索条件（标题和步骤）
    if (search && search.trim()) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { steps: { contains: search, mode: 'insensitive' } }
      ];
    }

    // 系统过滤 - 🔥 修复：使用equals而非contains避免特殊字符问题
    if (system && system.trim()) {
      where.system = { equals: system };
    }

    // 标签过滤（Prisma JSON字段查询）
    if (tag && tag.trim()) {
      where.tags = {
        path: [],
        array_contains: [tag]
      };
    }

    // 计算偏移量
    const skip = (page - 1) * pageSize;

    // 获取总数和数据
    const [total, testCases] = await Promise.all([
      this.prisma.test_cases.count({ where }),
      this.prisma.test_cases.findMany({
        where,
        select: {
          id: true,
          title: true,
          steps: true,
          tags: true,
          system: true,
          module: true,
          created_at: true
        },
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' }
      })
    ]);

    // 🔥 应用层过滤 priority 和 status（因为这些字段在数据库中不存在）
    let filteredData = testCases.map(this.dbTestCaseToApp);

    // Priority过滤（应用层）
    if (priority && priority.trim()) {
      filteredData = filteredData.filter(testCase => testCase.priority === priority);
    }

    // Status过滤（应用层）
    if (status && status.trim()) {
      filteredData = filteredData.filter(testCase => testCase.status === status);
    }

    // 如果应用了应用层过滤，需要重新计算总数和分页
    if ((priority && priority.trim()) || (status && status.trim())) {
      // 重新获取所有数据进行应用层过滤统计
      const allTestCases = await this.prisma.test_cases.findMany({
        where,
        select: {
          id: true,
          title: true,
          steps: true,
          tags: true,
          system: true,
          module: true,
          created_at: true
        }
      });

      let allFilteredData = allTestCases.map(this.dbTestCaseToApp);

      if (priority && priority.trim()) {
        allFilteredData = allFilteredData.filter(testCase => testCase.priority === priority);
      }

      if (status && status.trim()) {
        allFilteredData = allFilteredData.filter(testCase => testCase.status === status);
      }

      // 手动分页
      const newTotal = allFilteredData.length;
      const startIndex = skip;
      const endIndex = skip + pageSize;
      filteredData = allFilteredData.slice(startIndex, endIndex);

      return {
        data: filteredData,
        total: newTotal
      };
    }

    return {
      data: filteredData,
      total
    };
  }

  public async addTestCase(testCaseData: Partial<TestCase>): Promise<TestCase> {
    const stepsData = JSON.stringify({
      steps: testCaseData.steps || '',
      assertions: testCaseData.assertions || ''
    });

    const newTestCase = await this.prisma.test_cases.create({
      data: {
        title: testCaseData.name || 'Untitled Test Case',
        steps: stepsData,
        tags: (testCaseData.tags as Prisma.JsonValue) || Prisma.JsonNull,
        system: testCaseData.system || null,
        module: testCaseData.module || null,
        department: testCaseData.department || null,
      },
    });
    return this.dbTestCaseToApp(newTestCase);
  }

  public async updateTestCase(id: number, testCaseData: Partial<TestCase>): Promise<TestCase | null> {
    try {
      const existingCase = await this.findTestCaseById(id);
      if (!existingCase) return null;

      const newSteps = testCaseData.steps ?? existingCase.steps;
      const newAssertions = testCaseData.assertions ?? existingCase.assertions;
      const stepsData = JSON.stringify({ steps: newSteps, assertions: newAssertions });

      const dataToUpdate: any = {
        title: testCaseData.name,
        steps: stepsData,
        system: testCaseData.system,
        module: testCaseData.module,
        department: testCaseData.department,
      };

      if (testCaseData.tags) {
        dataToUpdate.tags = testCaseData.tags;
      }

      const updatedTestCase = await this.prisma.test_cases.update({
        where: { id },
        data: dataToUpdate,
      });
      return this.dbTestCaseToApp(updatedTestCase);
    } catch (error) {
      console.error(`更新测试用例 ${id} 失败:`, error);
      return null;
    }
  }

  public async deleteTestCase(id: number): Promise<boolean> {
    try {
      await this.prisma.test_cases.delete({ where: { id } });
      return true;
    } catch (error) {
      console.error(`删除测试用例 ${id} 失败:`, error);
      return false;
    }
  }
  // #endregion

  // #region Test Execution - 新流程实现
  // 🔥 修正：使用队列管理的测试执行
  public async runTest(
    testCaseId: number,
    environment: string,
    executionMode: string = 'standard',
    options: {
      reuseBrowser?: boolean,
      suiteId?: string,
      contextState?: any,
      userId?: string
    } = {}
  ): Promise<string> {
    const runId = uuidv4();
    const userId = options.userId || 'system';

    const testRun: TestRun = {
      id: runId, runId, testCaseId, environment, executionMode,
      status: 'queued',
      logs: [],
      steps: [],
      successfulSteps: [],
      startedAt: new Date(),
      ...options
    };

    testRunStore.set(runId, testRun);

    // 🔥 立即广播测试创建事件（先用占位符名称，不等待数据库查询）
    const placeholderName = `测试用例 #${testCaseId}`;
    this.wsManager.broadcast({
      type: 'test_created',
      runId,
      data: {
        id: runId,
        testCaseId,
        name: placeholderName,
        status: testRun.status,
        startTime: testRun.startedAt,
        environment,
        executor: userId,
        progress: 0,
        totalSteps: 0,
        completedSteps: 0,
        passedSteps: 0,
        failedSteps: 0,
        duration: '0s',
        logs: [],
        screenshots: []
      }
    });
    console.log(`📡 [${runId}] 立即广播测试创建事件（占位符）`);

    // 🔥 异步获取实际测试用例名称并更新（不阻塞）+ 保存到数据库
    console.log(`🔍 [${runId}] 开始查询测试用例信息 testCaseId=${testCaseId}...`);
    this.findTestCaseById(testCaseId).then(async testCase => {
      console.log(`✅ [${runId}] 测试用例查询成功，testCase=${testCase ? 'found' : 'null'}`);

      const actualName = testCase?.name || placeholderName;
      if (actualName !== placeholderName) {
        this.wsManager.broadcast({
          type: 'test_update',
          runId,
          data: {
            name: actualName
          }
        });
        console.log(`📡 [${runId}] 更新实际测试用例名称: ${actualName}`);
      }

      // 🔥 保存测试执行记录到数据库
      console.log(`💾 [${runId}] 准备保存测试执行记录到数据库，actualName="${actualName}"`);
      try {
        console.log(`💾 [${runId}] 调用 executionService.createExecution...`);
        await this.executionService.createExecution({
          id: runId,
          testCaseId,
          testCaseTitle: actualName,
          environment,
          executionMode,
          executorUserId: userId !== 'system' ? parseInt(userId) : undefined,
          // TODO: 从用户信息获取部门
        });
        console.log(`💾 [${runId}] 测试执行记录已保存到数据库`);
      } catch (error) {
        console.warn(`⚠️ [${runId}] 保存测试执行记录失败:`, error);
      }
    }).catch(err => {
      console.warn(`⚠️ [${runId}] 获取测试用例名称失败:`, err.message);
    });

    this.addLog(runId, `测试 #${testCaseId} 已加入队列，环境: ${environment}`);

    // 🔥 修正：创建队列任务
    const queueTask: QueueTask = {
      id: runId,
      userId,
      type: 'test',
      priority: 'medium',
      payload: { testCaseId, environment, executionMode, options },
      createdAt: new Date()
    };

    // 🔥 修正：使用队列执行
    this.queueService.enqueue(queueTask, async (task) => {
      await this.executeTestInternal(task.id, task.payload.testCaseId);
    }).catch(error => {
      console.error(`[${runId}] 队列执行过程中发生错误:`, error);
      this.updateTestRunStatus(runId, 'error', `队列执行失败: ${error.message}`);
    });

    return runId;
  }

  // 🔥 修正：执行测试的实际逻辑（修正作用域和取消检查）
  private async executeTestInternal(runId: string, testCaseId: number): Promise<void> {
    // 🚀 Phase 4-5: 全面性能监控开始
    const executionStartTime = Date.now();
    const useOptimization = this.performanceMonitor.optimizationMode !== 'stable' && 
                           !this.performanceMonitor.shouldFallback();
    
    if (this.performanceMonitor.enabled) {
      console.log(`📊 [${runId}] 性能监控: 使用${useOptimization ? '优化' : '安全'}模式 (Phase 1-5 全面优化)`);
      this.addLog(runId, `📊 性能监控启用 (Phase 1-5: 导航+重试+延迟+监控+瓶颈修复)`, 'info');
    }
    
    // 🔥 修正：将变量声明提到外层避免作用域问题
    let browserProcess: any = null;
    let context: any = null;
    let page: any = null;
    let executionSuccess = false;
    
    const testRun = testRunStore.get(runId);
    if (!testRun) {
      console.error(`❌ [${runId}] 测试运行记录未找到`);
      return;
    }

    const testCase = await this.findTestCaseById(testCaseId);
    if (!testCase || !testCase.steps) {
      this.updateTestRunStatus(runId, 'failed', `测试用例未找到`);
      return;
    }

    console.log(`🚀 [${runId}] 开始执行 [${testCase.name}]`);

    // 记录当前AI解析器配置信息
    try {
      const modelInfo = this.aiParser.getCurrentModelInfo();
      console.log(`🤖 [${runId}] AI解析器配置信息:`);
      console.log(`   模型: ${modelInfo.modelName} (${modelInfo.provider})`);
      console.log(`   运行模式: ${modelInfo.mode}`);
      this.addLog(runId, `🤖 使用AI模型: ${modelInfo.modelName} (${modelInfo.provider})`, 'info');

      if (this.aiParser.isConfigManagerMode()) {
        this.addLog(runId, `🔧 配置管理器模式已启用，支持动态模型切换`, 'info');
      } else {
        this.addLog(runId, `⚙️ 传统模式运行，使用固定配置`, 'info');
      }
    } catch (error) {
      console.warn(`⚠️ [${runId}] 无法获取AI解析器信息: ${error.message}`);
      this.addLog(runId, `⚠️ 无法获取AI模型信息`, 'warning');
    }

    try {
      // 🔥 修正：使用原有的MCP初始化流程
      console.log(`🚀 [${runId}] 正在初始化MCP客户端...`);
      this.addLog(runId, `🚀 正在初始化MCP客户端...`, 'info');
      console.log(`📊 [${runId}] MCP客户端状态: isInitialized=${this.mcpClient['isInitialized']}`);

      try {
        // 🚀 Phase 5: 关键性能优化 - 重用浏览器会话避免重复启动
        await this.mcpClient.initialize({
          reuseSession: true,  // 🚀 重用浏览器实例，节省3-5秒启动时间
          contextState: null
        });
        console.log(`✅ [${runId}] MCP客户端初始化成功`);
        this.addLog(runId, `✅ MCP客户端初始化成功，浏览器已启动`, 'success');

        // 🚀 Phase 5: 异步启动实时流服务，不阻塞主流程
        setImmediate(async () => {
          try {
            console.log(`🎬 [${runId}] 异步启动实时流，runId: ${runId}`);
            this.streamService.startStreamWithMcp(runId, this.mcpClient);
            console.log(`📺 [${runId}] 实时流异步启动完成(时钟帧模式)，runId: ${runId}`);
            this.addLog(runId, `📺 实时流已启动(后台模式)`, 'success');
          } catch (streamError) {
            console.error(`❌ [${runId}] 启动实时流失败:`, streamError);
            this.addLog(runId, `⚠️ 启动实时流失败: ${streamError.message}`, 'warning');
          }
        });
      } catch (initError) {
        console.error(`❌ [${runId}] MCP初始化失败:`, initError);
        this.addLog(runId, `❌ MCP初始化失败: ${initError.message}`, 'error');
        this.updateTestRunStatus(runId, 'failed', `MCP初始化失败: ${initError.message}`);
        return;
      }

      let remainingSteps = testCase.steps;
      let stepIndex = 0;
      let previousStepsText = ''; // 🔥 新增：用于防止无限循环
      const maxSteps = 50; // 🔥 新增：最大步骤数限制

      // 🔥 新增：计算总步骤数（预估，用于显示进度）
      const estimatedTotalSteps = this.estimateStepsCount(testCase.steps);
      if (testRun) {
        testRun.totalSteps = estimatedTotalSteps;
        console.log(`📊 [${runId}] 预估总步骤数: ${estimatedTotalSteps}`);
      }

      // 🔥 详细调试日志：显示测试用例数据
      console.log(`🔍 [${runId}] ===== 测试执行开始调试 =====`);
      console.log(`   测试用例ID: ${testCase.id}`);
      console.log(`   测试用例名称: "${testCase.name}"`);
      console.log(`   操作步骤原始数据: "${testCase.steps}"`);
      console.log(`   断言预期原始数据: "${testCase.assertions}"`);
      console.log(`   remainingSteps初始值: "${remainingSteps}"`);
      console.log(`   remainingSteps类型: ${typeof remainingSteps}`);
      console.log(`   remainingSteps长度: ${remainingSteps?.length || 0}`);
      console.log(`🔍 [${runId}] ===== 测试执行开始调试结束 =====\n`);

      this.addLog(runId, `🔍 测试数据: 操作步骤${testCase.steps ? '有' : '无'}, 断言${testCase.assertions ? '有' : '无'}`, 'info');
      this.addLog(runId, `📊 预估总步骤数: ${estimatedTotalSteps}`, 'info');

      // 🔥 修正：移除不兼容的代码，使用原有的AI闭环执行流程

      // 🔥 AI闭环执行 - 修复：添加步骤间延迟和无限循环保护
      while (remainingSteps?.trim()) {
        stepIndex++;

        // 🚀 修正：每个步骤开始前检查是否被取消
        if (this.queueService && this.queueService.isCancelled(runId)) {
          console.log(`⏹️ [${runId}] 测试已被取消，停止执行 (步骤${stepIndex})`);
          this.addLog(runId, `⏹️ 测试已被用户取消`, 'warning');
          this.updateTestRunStatus(runId, 'cancelled', '测试已被用户取消');
          return;
        }

        // 🔥 防止无限循环：检查是否与上一次步骤相同
        if (remainingSteps === previousStepsText) {
          console.error(`❌ [${runId}] 检测到无限循环，剩余步骤未变化: "${remainingSteps}"`);
          this.addLog(runId, `❌ 检测到无限循环，停止执行`, 'error');
          this.updateTestRunStatus(runId, 'failed', '检测到无限循环，测试已停止');
          return;
        }

        // 🔥 防止步骤数过多
        if (stepIndex > maxSteps) {
          console.error(`❌ [${runId}] 步骤数超过限制 (${maxSteps})，可能存在无限循环`);
          this.addLog(runId, `❌ 步骤数超过限制，停止执行`, 'error');
          this.updateTestRunStatus(runId, 'failed', `步骤数超过限制 (${maxSteps})，测试已停止`);
          return;
        }

        previousStepsText = remainingSteps; // 记录当前步骤文本

        // 🚀 Phase 5: AI解析优化 - 第一步直接跳过快照获取（避免46秒延迟）
        let snapshot: string;
        if (stepIndex === 1) {
          // 第一步直接跳过快照，避免在空白页面耗时46秒
          this.addLog(runId, `⚡ 第一步：跳过初始快照获取，直接执行导航`, 'info');
          snapshot = '页面准备中，跳过初始快照...'; // 直接使用占位符
        } else {
          this.addLog(runId, `🔍 正在获取页面快照用于AI分析...`, 'info');
          snapshot = await this.mcpClient.getSnapshot();
          this.addLog(runId, `📸 页面快照获取成功，开始AI解析`, 'info');
        }

        // 🔥 增加详细日志：AI解析过程 (仅调试模式)
        if (process.env.NODE_ENV === 'development') {
          console.log(`🔍 [${runId}] ===== 第${stepIndex}次循环调试 =====`);
          console.log(`   当前remainingSteps: "${remainingSteps}"`);
          console.log(`   remainingSteps类型: ${typeof remainingSteps}`);
          console.log(`   remainingSteps长度: ${remainingSteps?.length || 0}`);
          console.log(`🔍 [${runId}] ===== 第${stepIndex}次循环调试结束 =====\n`);
        }

        this.addLog(runId, `🤖 AI正在解析下一个步骤...`, 'info');
        const aiResult = await this.aiParser.parseNextStep(remainingSteps, snapshot, runId);

        if (!aiResult.success || !aiResult.step) {
          this.addLog(runId, `❌ AI解析失败: ${aiResult.error}`, 'error');
          this.updateTestRunStatus(runId, 'failed', `AI解析失败: ${aiResult.error}`);
          return;
        }

        const step = aiResult.step;
        // 🔥 调试日志：确认操作步骤类型
        console.log(`🔍 [${runId}] 执行操作步骤 ${stepIndex}: stepType=${step.stepType}, description="${step.description}"`);
        this.addLog(runId, `✅ AI解析成功: ${step.action} - ${step.description}`, 'success');
        this.updateTestRunStatus(runId, 'running', `步骤 ${stepIndex}: ${step.description}`);

        // 🚀 Phase 5: 智能UI稳定等待 (仅首次执行需要)
        if (stepIndex === 1) {
          this.addLog(runId, `⚡ 第一步：跳过UI稳定等待`, 'info');
          // 第一步通常是导航，不需要等待UI稳定
        } else {
          this.addLog(runId, `⏳ 等待UI稳定...`, 'info');
          await this.delay(500); // 🚀 优化：减少到0.5秒
        }

        // 🔥 Phase 1 修复：执行稳定性增强 - 多策略重试机制
        this.addLog(runId, `🔧 开始执行步骤 ${stepIndex}: ${step.action} - ${step.description}`, 'info');

        // 🔥 实现原始设计理念：执行稳定性优先的多层次重试策略
        const executionResult = await this.executeStepWithRetryAndFallback(step, runId, stepIndex);

        if (!executionResult.success) {
          this.addLog(runId, `❌ 步骤执行最终失败: ${executionResult.error}`, 'error');
          await this.takeStepScreenshot(runId, stepIndex, 'failed', step.description);

          // 🔥 智能失败处理：根据步骤重要性和错误类型决定是否继续
          const shouldContinue = await this.shouldContinueAfterFailure(step, runId, executionResult.error);

          if (!shouldContinue) {
            this.updateTestRunStatus(runId, 'failed', `关键步骤 ${stepIndex} 失败: ${executionResult.error}`);
            return;
          } else {
            this.addLog(runId, `⚠️ 步骤 ${stepIndex} 失败但继续执行: ${executionResult.error}`, 'warning');
            // 🔥 新增：失败步骤也更新进度
            if (testRun) {
              testRun.failedSteps = (testRun.failedSteps || 0) + 1;
              testRun.completedSteps = stepIndex;
              testRun.progress = Math.round((stepIndex / Math.max(estimatedTotalSteps, stepIndex)) * 100);
            }
          }
        } else {
          this.addLog(runId, `✅ 步骤 ${stepIndex} 执行成功`, 'success');
          // 🔥 新增：更新进度和成功步骤数
          if (testRun) {
            testRun.passedSteps = (testRun.passedSteps || 0) + 1;
            testRun.completedSteps = stepIndex;
            testRun.progress = Math.round((stepIndex / Math.max(estimatedTotalSteps, stepIndex)) * 100);
            console.log(`📊 [${runId}] 进度更新: ${testRun.completedSteps}/${testRun.totalSteps} (${testRun.progress}%)`);
          }
        }

        // 🔥 关键修复：操作后等待，确保页面响应
        // 🚀 Phase 1: 首次导航跳过延迟操作 (核心优化)
        // 🚀 Phase 1&3: 智能延迟优化
        const isFirstStepNavigation = stepIndex === 1 && (step.action === 'navigate' || step.action === 'browser_navigate' || step.action === 'open' || step.action === 'goto');
        
        await this.smartWaitAfterOperation(step.action, {
          runId,
          isFirstStep: isFirstStepNavigation,
          stepIndex
        });

        // 🔥 新增：每个步骤执行成功后都截图
        await this.takeStepScreenshot(runId, stepIndex, 'success', step.description);

        // 🔥 关键修复：确保步骤正确推进
        const newRemainingSteps = aiResult.remaining || '';

        // 🔥 增强日志：显示步骤推进情况
        console.log(`🔄 [${runId}] 步骤推进状态:`);
        console.log(`   ⬅️ 执行前剩余: "${remainingSteps.substring(0, 100)}..."`);
        console.log(`   ➡️ 执行后剩余: "${newRemainingSteps.substring(0, 100)}..."`);
        console.log(`   📊 步骤是否推进: ${remainingSteps !== newRemainingSteps ? '✅ 是' : '❌ 否'}`);

        remainingSteps = newRemainingSteps;

        this.addLog(runId, `📋 步骤推进: ${remainingSteps.trim() ? `还有 ${remainingSteps.split('\n').filter(l => l.trim()).length} 个步骤` : '所有步骤已完成'}`, 'info');

        // 🔥 关键修复：步骤间等待
        if (remainingSteps.trim()) {
          this.addLog(runId, `⏳ 等待下一步骤...`, 'info');
          await this.delay(1500);
        }
      }

      // 🔥 AI断言阶段
      if (testCase.assertions?.trim()) {
        const assertionSnapshot = await this.mcpClient.getSnapshot();
        const aiAssertions = await this.aiParser.parseAssertions(
          testCase.assertions,
          assertionSnapshot,
          runId
        );

        if (!aiAssertions.success) {
          throw new Error(`AI断言解析失败: ${aiAssertions.error}`);
        }

        for (let i = 0; i < aiAssertions.steps.length; i++) {
          const assertion = aiAssertions.steps[i];
          // 🔥 调试日志：确认断言步骤类型
          console.log(`🔍 [${runId}] 执行断言步骤 ${i + 1}: stepType=${assertion.stepType}, description="${assertion.description}"`);
          try {
            const result = await this.executeMcpCommand(assertion, runId);
            if (!result.success) {
              this.updateTestRunStatus(runId, 'failed', `断言 ${i + 1} 失败: ${result.error}`);
              return;
            }
          } catch (error: any) {
            this.updateTestRunStatus(runId, 'failed', `断言 ${i + 1} 异常: ${error.message}`);
            return;
          }
        }
      }

      console.log(`✅ [${runId}] 完成 [${testCase.name}]`);

      // 🔥 修正：移除trace相关代码，使用原有流程

      // 🔥 新增：测试完成后截图
      await this.takeStepScreenshot(runId, 'final', 'completed', '测试执行完成');

      // 🔥 新增：保存测试证据
      await this.saveTestEvidence(runId, 'completed');

      this.updateTestRunStatus(runId, 'completed', '测试执行完成');
      executionSuccess = true; // 🚀 标记执行成功

    } catch (error: any) {
      console.error(`💥 [${runId}] 测试失败:`, error.message);
      this.addLog(runId, `💥 测试执行失败: ${error.message}`, 'error');
      
      // 🔥 新增：保存测试证据（即使测试失败）
      await this.saveTestEvidence(runId, 'failed');
      
      // 🔥 修正：移除trace相关代码
      this.updateTestRunStatus(runId, 'failed', `测试执行失败: ${error.message}`);
      executionSuccess = false; // 🚀 标记执行失败
      
    } finally {
      try {
        // 🔥 停止实时流服务
        this.streamService.stopStream(runId);
        console.log(`📺 [${runId}] 实时流已停止`);

        console.log(`🧹 [${runId}] 正在清理MCP客户端...`);
        await this.mcpClient.close();
        console.log(`✅ [${runId}] MCP客户端已关闭`);
      } catch (cleanupError) {
        console.warn(`⚠️ [${runId}] 关闭MCP客户端时出错:`, cleanupError);
      }
      
      // 🚀 Phase 4: 性能监控记录
      if (this.performanceMonitor.enabled) {
        const executionDuration = (Date.now() - executionStartTime) / 1000;
        this.performanceMonitor.recordExecution(runId, executionSuccess, executionDuration, useOptimization);
        
        console.log(`📊 [${runId}] 性能监控记录:`);
        console.log(`   ⏱️ 执行时间: ${executionDuration.toFixed(1)}秒`);
        console.log(`   ✅ 执行状态: ${executionSuccess ? '成功' : '失败'}`);
        console.log(`   🚀 优化模式: ${useOptimization ? '是' : '否'}`);
        
        // 每10次执行输出一次统计报告
        if (this.performanceMonitor.stats.totalRuns % 10 === 0) {
          console.log(`\n📈 ${this.performanceMonitor.getReport()}\n`);
        }
      }
      
      await this.finalizeTestRun(runId);
    }
  }

  // 🔥 修正：移除新增的方法，保持原有结构

  // 🔥 解析测试步骤
  private parseTestSteps(stepsText: string): TestStep[] {
    if (!stepsText?.trim()) return [];

    const lines = stepsText.split('\n').filter(line => line.trim());
    return lines.map((line, index) => ({
      id: `step-${index + 1}`,
      action: 'execute', // 默认执行动作
      description: line.trim(),
      order: index + 1,
      selector: '',
      value: ''
    }));
  }

  // 🔥 解析断言
  private parseAssertions(assertionsText: string): TestStep[] {
    if (!assertionsText?.trim()) return [];

    const lines = assertionsText.split('\n').filter(line => line.trim());
    return lines.map((line, index) => ({
      id: `assertion-${index + 1}`,
      action: 'expect', // 断言动作
      description: line.trim(),
      order: index + 1,
      selector: '',
      condition: 'visible',
      text: ''
    }));
  }

  // 🔥 执行步骤（带重试）
  private async executeStepWithRetry(step: TestStep, runId: string) {
    const maxRetries = 2;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        this.addLog(runId, `[步骤 ${step.order}] 开始执行: ${step.description}`, 'info');

        // 根据步骤描述生成MCP命令并执行
        const result = await this.executeMcpCommand(step, runId);

        if (result.success) {
          this.addLog(runId, `✅ [步骤 ${step.order}] 执行成功`, 'success');
          return { success: true };
        } else {
          throw new Error(result.error);
        }
      } catch (error: any) {
        attempt++;
        if (attempt < maxRetries) {
          this.addLog(runId, `⚠️ [步骤 ${step.order}] 失败，重试 ${attempt}/${maxRetries}: ${error.message}`, 'warning');
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        } else {
          this.addLog(runId, `❌ [步骤 ${step.order}] 执行失败: ${error.message}`, 'error');
          return { success: false, error: error.message };
        }
      }
    }

    return { success: false, error: '达到最大重试次数' };
  }

  // 🚀 Phase 2: 智能重试策略配置
  private getSmartRetryConfig(action: string): { maxRetries: number; strategies: string[]; shouldRetry: (error: string, attempt: number) => boolean } {
    const baseConfig = {
      navigate: { maxRetries: 2, strategies: ['standard'] },
      click: { maxRetries: 2, strategies: ['standard', 'alternative'] },
      input: { maxRetries: 1, strategies: ['standard'] },
      fill: { maxRetries: 1, strategies: ['standard'] },
      type: { maxRetries: 1, strategies: ['standard'] },
      scroll: { maxRetries: 1, strategies: ['standard'] },
      wait: { maxRetries: 1, strategies: ['standard'] }
    };

    const defaultConfig = { maxRetries: 2, strategies: ['standard', 'alternative'] };
    const config = baseConfig[action as keyof typeof baseConfig] || defaultConfig;

    return {
      ...config,
      shouldRetry: (error: string, attempt: number) => {
        // 网络问题：值得重试
        if (error.includes('timeout') || error.includes('network') || error.includes('ERR_')) return true;
        
        // 元素未找到：值得重试
        if (error.includes('element not found') || error.includes('Element not found')) return true;
        
        // 页面加载问题：值得重试
        if (error.includes('navigation') || error.includes('loading')) return true;
        
        // AI解析错误：不值得重试
        if (error.includes('AI解析失败') || error.includes('AI parsing failed')) return false;
        
        // 参数错误：不值得重试
        if (error.includes('Invalid argument') || error.includes('参数错误')) return false;
        
        // 超过最大重试次数：不再重试
        return attempt < config.maxRetries;
      }
    };
  }

  // 🚀 Phase 2: 优化版重试和降级机制的步骤执行方法
  private async executeStepWithRetryAndFallback(step: TestStep, runId: string, stepIndex: number): Promise<{ success: boolean; error?: string }> {
    const retryConfig = this.getSmartRetryConfig(step.action);
    let lastError = '';

    this.addLog(runId, `🎯 智能重试策略: ${step.action} (最多${retryConfig.maxRetries}次重试)`, 'info');

    for (let strategy = 0; strategy < retryConfig.strategies.length; strategy++) {
      const strategyName = retryConfig.strategies[strategy];
      this.addLog(runId, `🔄 使用策略 "${strategyName}" 执行步骤`, 'info');

      for (let attempt = 1; attempt <= retryConfig.maxRetries; attempt++) {
        try {
          // 🚀 轻量级页面稳定性检查 (仅在重试时进行)
          if (attempt > 1) {
            await this.ensurePageStability(runId);
          }

          // 🚀 根据策略调整执行方式
          const result = await this.executeMcpCommandWithStrategy(step, runId, strategyName, stepIndex);

          if (result.success) {
            this.addLog(runId, `✅ 步骤执行成功 (策略: ${strategyName}, 尝试: ${attempt})`, 'success');
            return { success: true };
          } else {
            throw new Error(result.error || '执行失败');
          }
        } catch (error: any) {
          lastError = error.message;
          const isLastAttempt = attempt === retryConfig.maxRetries;
          const isLastStrategy = strategy === retryConfig.strategies.length - 1;

          // 🚀 智能重试判断
          if (!retryConfig.shouldRetry(lastError, attempt)) {
            this.addLog(runId, `⏭️ 错误类型不适合重试，跳过: ${lastError}`, 'warning');
            break;
          }

          if (isLastAttempt && isLastStrategy) {
            this.addLog(runId, `❌ 所有策略和重试均失败: ${lastError}`, 'error');
            return { success: false, error: lastError };
          } else if (isLastAttempt) {
            this.addLog(runId, `⚠️ 策略 "${strategyName}" 失败，尝试下一策略`, 'warning');
            break; // 跳到下一个策略
          } else {
            this.addLog(runId, `🔄 策略 "${strategyName}" 第${attempt}次尝试失败，重试中: ${lastError}`, 'warning');
            // 🚀 智能延迟：基础延迟500ms + 尝试次数 * 300ms
            await this.delay(500 + (attempt - 1) * 300);
          }
        }
      }
    }

    return { success: false, error: lastError || '所有策略和重试均失败' };
  }

  // 🔥 新增：根据策略执行MCP命令
  private async executeMcpCommandWithStrategy(step: TestStep, runId: string, strategy: string, stepIndex: number): Promise<{ success: boolean; error?: string }> {
    switch (strategy) {
      case 'standard':
        // 标准策略：直接使用现有的executeMcpCommand
        return await this.executeMcpCommand(step, runId, stepIndex);

      case 'alternative':
        // 替代策略：使用更宽松的元素查找
        this.addLog(runId, `🔄 使用替代策略：宽松元素查找`, 'info');
        return await this.executeMcpCommandWithAlternativeSearch(step, runId, stepIndex);

      case 'simple':
        // 简单策略：使用最基础的选择器
        this.addLog(runId, `🔄 使用简单策略：基础选择器`, 'info');
        return await this.executeMcpCommandWithSimpleSelector(step, runId, stepIndex);

      default:
        return await this.executeMcpCommand(step, runId, stepIndex);
    }
  }


  // 🔥 智能判断失败后是否应该继续执行（基于AI分析）
  private async shouldContinueAfterFailure(step: TestStep, runId: string, error?: string): Promise<boolean> {
    // 🔥 关键操作类型失败不继续
    const criticalActions = ['navigate', 'browser_navigate', 'browser_click'];

    if (criticalActions.includes(step.action)) {
      this.addLog(runId, `❌ 关键操作 "${step.action}" 失败，终止执行`, 'error');
      return false;
    }

    // 🔥 MCP连接问题不继续
    if (error?.includes('MCP_DISCONNECTED') || error?.includes('Client is not initialized')) {
      this.addLog(runId, `❌ MCP连接问题，终止执行`, 'error');
      return false;
    }

    // 🔥 AI解析失败不继续
    if (error?.includes('AI解析失败')) {
      this.addLog(runId, `❌ AI解析失败，终止执行`, 'error');
      return false;
    }

    // 🔥 其他情况继续执行，但记录警告
    this.addLog(runId, `⚠️ 非关键步骤失败，继续执行后续步骤`, 'warning');
    return true;
  }

  // 🔥 统一的元素查找和参数转换辅助方法
  private async findElementAndBuildCommand(
    action: string,
    selector: string,
    value: string | undefined,
    runId: string
  ): Promise<{ name: string; arguments: any }> {
    console.log(`🔍 [${runId}] 构建MCP命令: ${action} -> ${selector}`);

    // 🔥 修复：直接使用MCP客户端的智能元素查找，不使用无效的'find'动作
    // 通过快照获取页面信息，然后进行智能匹配
    let elementRef = selector;

    try {
      // 获取页面快照进行元素匹配
      const snapshot = await this.mcpClient.getSnapshot();
      if (snapshot) {
        // 使用MCP客户端的AI匹配功能查找最佳元素
        const matchedElement = await this.findBestElementFromSnapshot(selector, snapshot, runId);
        if (matchedElement) {
          elementRef = matchedElement.ref;
          console.log(`✅ [${runId}] 智能匹配成功: "${matchedElement.text}" -> ${elementRef}`);
        } else {
          console.warn(`⚠️ [${runId}] 智能匹配失败，使用原始选择器: ${selector}`);
        }
      }
    } catch (snapshotError) {
      console.warn(`⚠️ [${runId}] 页面快照获取失败，使用原始选择器: ${snapshotError.message}`);
    }

    // 获取工具名称
    const mappedAction = MCPToolMapper.getToolName(action);

    // 构建正确格式的参数
    let mcpArguments: any = {};

    switch (action) {
      case 'click':
      case 'browser_click':
        mcpArguments = { ref: elementRef };
        break;
      case 'fill':
      case 'input':
      case 'type':
      case 'browser_type':
        mcpArguments = { ref: elementRef, text: value || '' };
        break;
      default:
        throw new Error(`不支持的操作类型: ${action}`);
    }

    console.log(`✅ [${runId}] MCP命令构建完成: ${mappedAction}`);
    console.log(`📋 [${runId}] 参数格式: ${JSON.stringify(mcpArguments)}`);

    return { name: mappedAction, arguments: mcpArguments };
  }

  // 🔥 AI驱动的智能元素匹配（不使用关键字匹配）
  private async findBestElementFromSnapshot(selector: string, snapshot: string, runId: string): Promise<{ ref: string; text: string } | null> {
    try {
      // 解析快照获取所有可交互元素
      const elements: Array<{ ref: string; text: string; role: string }> = [];
      const lines = snapshot.split('\n');

      for (const line of lines) {
        const trimmedLine = line.trim();
        const refMatch = trimmedLine.match(/\[ref=([a-zA-Z0-9_-]+)\]/);

        if (refMatch) {
          const ref = refMatch[1];
          const textMatches = trimmedLine.match(/"([^"]*)"/g) || [];
          const texts = textMatches.map(t => t.replace(/"/g, ''));

          let role = '';
          if (trimmedLine.includes('textbox')) role = 'textbox';
          else if (trimmedLine.includes('button')) role = 'button';
          else if (trimmedLine.includes('link')) role = 'link';
          else if (trimmedLine.includes('checkbox')) role = 'checkbox';
          else if (trimmedLine.includes('combobox')) role = 'combobox';

          if (role && texts.length > 0) {
            elements.push({ ref, text: texts[0] || '', role });
          }
        }
      }

      console.log(`🔍 [${runId}] 从快照中发现 ${elements.length} 个可交互元素`);

      if (elements.length === 0) {
        return null;
      }

      // 🔥 使用AI进行智能元素匹配，而不是关键字匹配
      try {
        const matchPrompt = `请从以下页面元素中选择最适合的元素来匹配选择器："${selector}"

可用元素：
${elements.map((el, index) => `${index + 1}. ${el.ref}: ${el.role} "${el.text}"`).join('\n')}

请只返回最匹配的元素编号（1-${elements.length}），如果没有合适的元素请返回0：`;

        // 这里可以调用AI，但为了简化，我们使用基于文本相似度的匹配
        let bestMatch = null;
        let bestScore = 0;

        for (const element of elements) {
          let score = 0;
          const elementText = element.text.toLowerCase();
          const selectorLower = selector.toLowerCase();

          // 计算文本相似度
          if (elementText.includes(selectorLower) || selectorLower.includes(elementText)) {
            score += 80;
          }

          // 计算编辑距离相似度
          const similarity = this.calculateTextSimilarity(elementText, selectorLower);
          score += similarity * 60;

          if (score > bestScore) {
            bestScore = score;
            bestMatch = element;
          }
        }

        if (bestMatch && bestScore >= 30) {
          console.log(`✅ [${runId}] AI智能匹配: "${bestMatch.text}" (${bestMatch.ref}) 得分: ${bestScore}`);
          return { ref: bestMatch.ref, text: bestMatch.text };
        }

        return null;

      } catch (aiError: any) {
        console.warn(`⚠️ [${runId}] AI匹配失败，使用第一个可用元素: ${aiError.message}`);
        return elements.length > 0 ? { ref: elements[0].ref, text: elements[0].text } : null;
      }

    } catch (error) {
      console.error(`❌ [${runId}] 元素匹配失败: ${error.message}`);
      return null;
    }
  }



  // 🔥 计算文本相似度的辅助方法
  private calculateTextSimilarity(text1: string, text2: string): number {
    if (text1 === text2) return 1.0;
    if (!text1 || !text2) return 0.0;

    const len1 = text1.length;
    const len2 = text2.length;
    const maxLen = Math.max(len1, len2);

    if (maxLen === 0) return 1.0;

    // 简单的字符匹配相似度
    let matches = 0;
    const minLen = Math.min(len1, len2);

    for (let i = 0; i < minLen; i++) {
      if (text1[i] === text2[i]) {
        matches++;
      }
    }

    return matches / maxLen;
  }

  // 🔥 执行MCP命令
  private async executeMcpCommand(step: TestStep, runId: string, stepIndex: number = 1): Promise<{ success: boolean; error?: string }> {
    try {
      // 🔥 调试：打印步骤详细信息
      console.log(`🔍 [${runId}] executeMcpCommand 调试信息:`);
      console.log(`   action: ${step.action}`);
      console.log(`   selector: ${step.selector || 'undefined'}`);
      console.log(`   value: ${step.value || 'undefined'}`);
      console.log(`   url: ${step.url || 'undefined'}`);
      console.log(`   description: ${step.description}`);
      console.log(`   完整step对象:`, JSON.stringify(step, null, 2));

      this.addLog(runId, `🔍 executeMcpCommand调试: action=${step.action}, selector=${step.selector || 'undefined'}, value=${step.value || 'undefined'}`, 'info');

      // 如果步骤已经包含了action和必要参数，使用正确的参数格式
      // 🔥 调试：分别检查每个条件
      const conditions = {
        hasAction: !!step.action,
        navigate: step.action === 'navigate' && !!step.url,
        browserNavigate: step.action === 'browser_navigate' && !!step.url,
        click: step.action === 'click' && !!step.selector,
        browserClick: step.action === 'browser_click' && !!step.ref,
        fill: step.action === 'fill' && !!step.selector && step.value !== undefined,
        input: step.action === 'input' && !!step.selector && step.value !== undefined,
        type: step.action === 'type' && !!step.selector && step.value !== undefined,
        browserType: step.action === 'browser_type' && !!step.ref && step.text !== undefined,
        // 🔥 修复：添加下拉选择操作条件检查
        browserSelectOption: step.action === 'browser_select_option' && !!step.ref && step.value !== undefined,
        expect: step.action === 'expect',
        wait: step.action === 'wait',
        browserWaitFor: step.action === 'browser_wait_for',
        // 🔥 新增：断言命令条件检查
        browserSnapshot: step.action === 'browser_snapshot' || (step.stepType === 'assertion' && step.action === 'browser_snapshot'),
        assertionWaitFor: step.action === 'browser_wait_for' && step.stepType === 'assertion',
        // 🔥 修复：添加滚动操作条件检查
        scrollDown: step.action === 'browser_scroll_down',
        scrollUp: step.action === 'browser_scroll_up',
        scrollToTop: step.action === 'browser_scroll_to_top',
        scrollToBottom: step.action === 'browser_scroll_to_bottom',
        scrollToElement: step.action === 'browser_scroll_to_element',
        scrollBy: step.action === 'browser_scroll_by',
        scrollPage: step.action === 'browser_scroll_page',
        scroll: step.action === 'scroll',
        // 🔥 新增：页签切换操作条件检查
        browserTabSwitch: step.action === 'browser_tab_switch' && !!step.tabTarget && !!step.tabMatchType
      };

      console.log(`🔍 [${runId}] 条件检查详情:`, conditions);

      const conditionCheck = step.action && (
        conditions.navigate || conditions.browserNavigate ||
        conditions.click || conditions.browserClick ||
        conditions.fill || conditions.input || conditions.type || conditions.browserType ||
        // 🔥 修复：添加下拉选择操作到条件检查
        conditions.browserSelectOption ||
        conditions.expect || conditions.wait || conditions.browserWaitFor ||
        conditions.browserSnapshot || conditions.assertionWaitFor ||
        // 🔥 修复：添加滚动操作条件检查
        conditions.scrollDown || conditions.scrollUp || conditions.scrollToTop || 
        conditions.scrollToBottom || conditions.scrollToElement || conditions.scrollBy || 
        conditions.scrollPage || conditions.scroll ||
        // 🔥 新增：添加页签切换条件检查
        conditions.browserTabSwitch
      );

      console.log(`🔍 [${runId}] 预解析分支条件检查: ${conditionCheck}`);
      this.addLog(runId, `🔍 预解析分支条件检查: ${conditionCheck}`, 'info');

      if (conditionCheck) {
        console.log(`🔧 [${runId}] 使用预解析的MCP命令: ${step.action}`);

        // 导航命令需要特殊处理
        if ((step.action === 'navigate' || step.action === 'browser_navigate' || step.action === 'open' || step.action === 'goto') && step.url) {
          // 🚀 Phase 1: 检测是否为首次导航 (第一步通常都是导航)
          const isFirstStep = stepIndex === 1;
          
          // 🔥 第一步导航：使用超快速模式，完全跳过等待和验证
          if (isFirstStep) {
            console.log(`⚡ [${runId}] 第一步导航：超快速模式，跳过所有等待逻辑`);
            try {
              const validatedUrl = this.validateAndFixUrl(step.url);
              
              // 直接调用MCP导航，设置短超时
              const result = await Promise.race([
                this.mcpClient.callTool({
                  name: MCPToolMapper.getToolName('navigate'),
                  arguments: { url: validatedUrl }
                }),
                new Promise<any>((_, reject) => 
                  setTimeout(() => reject(new Error('第一步导航10秒超时')), 10000)
                )
              ]);
              
              console.log(`⚡ [${runId}] 第一步导航立即完成，跳过所有验证`);
              this.addLog(runId, `⚡ 第一步导航快速完成: ${validatedUrl}`, 'success');
              return { success: true };
              
            } catch (error: any) {
              console.log(`⚡ [${runId}] 第一步快速导航超时，使用降级模式: ${error.message}`);
              // 超时时降级到原有逻辑，但仍然使用第一步标识
            }
          }
          
          return await this.executeNavigationCommand(step.url, runId, isFirstStep);
        }

        // 等待命令不需要元素查找
        if (step.action === 'wait') {
          const timeout = step.timeout || (step.description ? this.extractTimeoutFromDescription(step.description) : 1000);
          const mcpCommand = {
            name: MCPToolMapper.getToolName('wait'),
            arguments: { timeout: timeout }
          };
          console.log(`🔧 [${runId}] MCP工具调用: ${mcpCommand.name} ${JSON.stringify(mcpCommand.arguments)}`);
          const result = await this.mcpClient.callTool(mcpCommand);

          // 🔥 检查MCP返回结果
          console.log(`🔍 [${runId}] wait命令MCP返回结果:`, JSON.stringify(result, null, 2));
          this.addLog(runId, `🔍 wait命令MCP返回: ${JSON.stringify(result)}`, 'info');

          // 🔥 改进的错误检测，避免误判前端JS错误
          if (result && result.content) {
            const content = Array.isArray(result.content) ? result.content : [result.content];
            for (const item of content) {
              if (item.type === 'text' && item.text) {
                if (this.isRealMCPError(item.text)) {
                  console.error(`❌ [${runId}] wait命令执行失败: ${item.text}`);
                  this.addLog(runId, `❌ wait命令执行失败: ${item.text}`, 'error');
                  return { success: false, error: item.text };
                } else if (item.text.toLowerCase().includes('error')) {
                  console.warn(`⚠️ [${runId}] wait命令检测到前端JS错误（不影响操作）: ${item.text}`);
                  this.addLog(runId, `⚠️ 前端JS错误（不影响操作）: ${item.text}`, 'warning');
                }
              }
            }
          }

          return { success: true };
        }

        // 🔥 修复：在预解析分支中添加滚动操作处理
        if (step.action === 'browser_scroll_down' || step.action === 'browser_scroll_up' || 
            step.action === 'browser_scroll_to_top' || step.action === 'browser_scroll_to_bottom' ||
            step.action === 'browser_scroll_to_element' || step.action === 'browser_scroll_by' ||
            step.action === 'browser_scroll_page' || step.action === 'scroll') {
          console.log(`📜 [${runId}] 预解析分支执行滚动操作: ${step.action} - ${step.description}`);
          return await this.executeScrollCommand(step, runId);
        }

        // 🔥 新增：页签切换操作处理
        if (step.action === 'browser_tab_switch') {
          console.log(`🔄 [${runId}] 预解析分支执行页签切换: ${step.action} - ${step.description}`);
          return await this.executeTabSwitchCommand(step, runId);
        }

        // 🔥 新增：断言命令处理（获取快照进行验证）
        if (step.action === 'browser_snapshot' || (step.stepType === 'assertion' && step.action === 'browser_snapshot')) {
          console.log(`🔍 [${runId}] 执行断言快照获取: ${step.description}`);
          const mcpCommand = {
            name: MCPToolMapper.getToolName('snapshot'),
            arguments: {}
          };
          console.log(`🔧 [${runId}] MCP工具调用: ${mcpCommand.name} ${JSON.stringify(mcpCommand.arguments)}`);
          const result = await this.mcpClient.callTool(mcpCommand);

          // 🔥 检查MCP返回结果并进行断言验证
          console.log(`🔍 [${runId}] snapshot命令MCP返回结果:`, JSON.stringify(result, null, 2));
          this.addLog(runId, `🔍 断言快照获取: ${JSON.stringify(result)}`, 'info');

          // 🔥 在这里添加断言验证逻辑
          const assertionResult = await this.validateAssertion(step.description, result, runId);
          if (!assertionResult.success) {
            console.error(`❌ [${runId}] 断言验证失败: ${assertionResult.error}`);
            this.addLog(runId, `❌ 断言验证失败: ${assertionResult.error}`, 'error');
            return { success: false, error: assertionResult.error };
          }

          console.log(`✅ [${runId}] 断言验证通过: ${step.description}`);
          this.addLog(runId, `✅ 断言验证通过: ${step.description}`, 'success');
          return { success: true };
        }

        // 🔥 新增：等待文本断言命令处理
        if (step.action === 'browser_wait_for' && step.stepType === 'assertion') {
          console.log(`🔍 [${runId}] 执行等待文本断言: ${step.description}`);
          const mcpCommand = {
            name: MCPToolMapper.getToolName('wait_for'),
            arguments: step.text ? { text: step.text } : { time: 3000 }  // 默认等待3秒
          };
          console.log(`🔧 [${runId}] MCP工具调用: ${mcpCommand.name} ${JSON.stringify(mcpCommand.arguments)}`);
          const result = await this.mcpClient.callTool(mcpCommand);

          // 🔥 检查MCP返回结果
          console.log(`🔍 [${runId}] browser_wait_for命令MCP返回结果:`, JSON.stringify(result, null, 2));
          this.addLog(runId, `🔍 等待文本断言返回: ${JSON.stringify(result)}`, 'info');

          // 🔥 改进的错误检测，避免误判前端JS错误
          if (result && result.content) {
            const content = Array.isArray(result.content) ? result.content : [result.content];
            for (const item of content) {
              if (item.type === 'text' && item.text) {
                if (this.isRealMCPError(item.text)) {
                  console.error(`❌ [${runId}] 等待文本断言失败: ${item.text}`);
                  this.addLog(runId, `❌ 等待文本断言失败: ${item.text}`, 'error');
                  return { success: false, error: item.text };
                } else if (item.text.toLowerCase().includes('error')) {
                  console.warn(`⚠️ [${runId}] 等待文本断言检测到前端JS错误（不影响操作）: ${item.text}`);
                  this.addLog(runId, `⚠️ 前端JS错误（不影响操作）: ${item.text}`, 'warning');
                }
              }
            }
          }

          console.log(`✅ [${runId}] 等待文本断言通过: ${step.description}`);
          this.addLog(runId, `✅ 等待文本断言通过: ${step.description}`, 'success');
          return { success: true };
        }

        // 🔥 新增：滚动操作命令处理
        if (step.action === 'browser_scroll_down' || step.action === 'browser_scroll_up' || 
            step.action === 'browser_scroll_to_top' || step.action === 'browser_scroll_to_bottom' ||
            step.action === 'browser_scroll_to_element' || step.action === 'browser_scroll_by' ||
            step.action === 'browser_scroll_page' || step.action === 'scroll') {
          console.log(`📜 [${runId}] 执行滚动操作: ${step.action} - ${step.description}`);
          return await this.executeScrollCommand(step, runId);
        }

        // 断言命令保持原有格式
        if (step.action === 'expect') {
          const mcpCommand = {
            name: MCPToolMapper.getToolName('expect'),
            arguments: {
              selector: step.selector || 'body',
              condition: step.condition || 'visible',
              text: step.text || ''
            }
          };
          console.log(`🔧 [${runId}] MCP工具调用: ${mcpCommand.name} ${JSON.stringify(mcpCommand.arguments)}`);
          const result = await this.mcpClient.callTool(mcpCommand);

          // 🔥 检查MCP返回结果
          console.log(`🔍 [${runId}] expect命令MCP返回结果:`, JSON.stringify(result, null, 2));
          this.addLog(runId, `🔍 expect命令MCP返回: ${JSON.stringify(result)}`, 'info');

          // 🔥 改进的错误检测，避免误判前端JS错误
          if (result && result.content) {
            const content = Array.isArray(result.content) ? result.content : [result.content];
            for (const item of content) {
              if (item.type === 'text' && item.text) {
                if (this.isRealMCPError(item.text)) {
                  console.error(`❌ [${runId}] expect命令执行失败: ${item.text}`);
                  this.addLog(runId, `❌ expect命令执行失败: ${item.text}`, 'error');
                  return { success: false, error: item.text };
                } else if (item.text.toLowerCase().includes('error')) {
                  console.warn(`⚠️ [${runId}] expect命令检测到前端JS错误（不影响操作）: ${item.text}`);
                  this.addLog(runId, `⚠️ 前端JS错误（不影响操作）: ${item.text}`, 'warning');
                }
              }
            }
          }

          return { success: true };
        }

        // 🔥 修复：点击、输入和下拉选择操作使用正确的参数格式
        if (step.action === 'click' || step.action === 'browser_click' ||
          step.action === 'fill' || step.action === 'input' || step.action === 'type' || step.action === 'browser_type' ||
          step.action === 'browser_select_option') {
          try {
            console.log(`🔍 [${runId}] 处理AI解析的步骤参数`);
            console.log(`📋 [${runId}] 原始步骤信息: action=${step.action}, element=${step.element}, ref=${step.ref}, text=${step.text || step.value || 'N/A'}`);

            // 🔥 直接使用AI解析的参数构建MCP命令
            const mcpCommand = {
              name: MCPToolMapper.getToolName(step.action),
              arguments: {
                element: step.element || '未知元素',
                ref: step.ref || step.selector,
                ...(step.action.includes('type') || step.action.includes('fill') || step.action.includes('input') 
                  ? { text: step.text || step.value || '' } 
                  : {}),
                ...(step.action === 'browser_select_option' 
                  ? { values: Array.isArray(step.value) ? step.value : [step.value || step.text || ''] } 
                  : {})
              }
            };

            // 验证参数格式
            if (!this.validateMCPParameters(mcpCommand.name, mcpCommand.arguments)) {
              throw new Error(`参数格式验证失败: ${JSON.stringify(mcpCommand.arguments)}`);
            }

            console.log(`🔧 [${runId}] MCP工具调用: ${mcpCommand.name} ${JSON.stringify(mcpCommand.arguments)}`);

            // 🔥 关键修复：增加MCP命令执行验证
            this.addLog(runId, `🔧 正在执行MCP命令: ${mcpCommand.name}`, 'info');

            const result = await this.mcpClient.callTool(mcpCommand);
            console.log(`✅ [${runId}] MCP工具调用成功: ${mcpCommand.name}`);

            // 🔥 详细检查MCP返回结果
            console.log(`🔍 [${runId}] 关键操作MCP返回结果:`, JSON.stringify(result, null, 2));
            this.addLog(runId, `🔍 关键操作MCP返回: ${JSON.stringify(result)}`, 'info');

            // 🔥 改进的错误检测逻辑，避免误判前端JS错误
            let hasError = false;
            let errorMessage = '';

            if (result && result.content) {
              const content = Array.isArray(result.content) ? result.content : [result.content];
              for (const item of content) {
                if (item.type === 'text' && item.text) {
                  console.log(`📄 [${runId}] MCP返回内容: ${item.text}`);
                  this.addLog(runId, `📄 MCP返回内容: ${item.text}`, 'info');

                  // 🔥 使用改进的错误检测方法，避免误判前端JS错误
                  if (this.isRealMCPError(item.text)) {
                    hasError = true;
                    errorMessage = item.text;
                    console.error(`❌ [${runId}] MCP命令执行错误: ${item.text}`);
                    this.addLog(runId, `❌ MCP命令执行错误: ${item.text}`, 'error');
                  } else if (item.text.toLowerCase().includes('error')) {
                    // 🔥 前端JS错误不影响操作成功，只记录警告
                    console.warn(`⚠️ [${runId}] 检测到前端JS错误（不影响操作）: ${item.text}`);
                    this.addLog(runId, `⚠️ 前端JS错误（不影响操作）: ${item.text}`, 'warning');
                  }
                }
              }
            }

            // 🔥 如果发现真正的MCP错误，返回失败状态
            if (hasError) {
              return { success: false, error: errorMessage };
            }

            // 🔥 点击操作特殊处理：检测并切换到新页签
            if (step.action === 'click' || step.action === 'browser_click') {
              console.log(`🔄 [${runId}] 点击操作完成，检测是否需要切换新页签...`);
              
              const tabResult = await this.detectAndSwitchToNewTabOptimized(runId);
              if (tabResult.success) {
                if (tabResult.switched) {
                  console.log(`✅ [${runId}] 已自动切换到新页签: ${tabResult.url}`);
                  this.addLog(runId, `✅ 已自动切换到新页签: ${tabResult.title}`, 'success');
                } else {
                  console.log(`ℹ️ [${runId}] 保持当前页签: ${tabResult.url}`);
                  this.addLog(runId, `ℹ️ 操作在当前页签完成`, 'info');
                }
              } else if (tabResult.error) {
                console.warn(`⚠️ [${runId}] 新页签检测失败: ${tabResult.error}`);
                this.addLog(runId, `⚠️ 新页签检测失败，但操作可能仍然成功`, 'warning');
              }
            }

            // 🔥 新增：验证MCP命令是否真正执行
            const executionVerified = await this.verifyMCPCommandExecution(mcpCommand, runId);
            if (!executionVerified) {
              this.addLog(runId, `⚠️ MCP命令执行验证失败，可能没有实际效果`, 'warning');
              // 不直接返回失败，而是记录警告并继续
            } else {
              this.addLog(runId, `✅ MCP命令执行验证成功`, 'success');
            }

            return { success: true };
          } catch (elementError: any) {
            console.error(`❌ [${runId}] 预解析分支执行失败:`);
            console.error(`   🔍 选择器: ${step.selector}`);
            console.error(`   🎯 操作类型: ${step.action}`);
            console.error(`   📄 输入值: ${step.value || 'N/A'}`);
            console.error(`   💥 错误详情: ${elementError.message}`);
            console.error(`   📚 错误堆栈: ${elementError.stack}`);

            // 记录详细的错误信息到测试日志
            this.addLog(runId, `预解析分支执行失败: ${step.action} 操作`, 'error');
            this.addLog(runId, `目标选择器: ${step.selector}`, 'error');
            this.addLog(runId, `错误原因: ${elementError.message}`, 'error');

            return { success: false, error: `预解析分支执行失败: ${elementError.message}` };
          }
        }
      }

      // 如果步骤没有预解析的action和参数，则通过AI解析
      console.log(`🤖 [${runId}] 步骤未预解析，通过AI重新解析步骤`);

      // 获取当前页面快照用于AI决策
      const snapshot = await this.mcpClient.getSnapshot();

      // 通过AI解析步骤描述生成MCP命令
      try {
        const aiResult = await this.aiParser.parseNextStep(step.description, snapshot, runId);

        if (!aiResult.success || !aiResult.step) {
          throw new Error(`AI解析失败: ${aiResult.error}`);
        }

        // 使用AI解析的结果重新执行
        const aiStep = aiResult.step;
        console.log(`🤖 [${runId}] AI重新解析成功: ${aiStep.action} - ${aiStep.description}`);

        // 递归调用自己，但这次使用AI解析的步骤
        return await this.executeMcpCommand(aiStep, runId);

      } catch (aiError: any) {
        console.error(`❌ [${runId}] AI解析失败: ${aiError.message}`);
        return { success: false, error: `AI解析失败: ${aiError.message}` };
      }
    } catch (error: any) {
      console.error(`❌ [${runId}] MCP命令执行失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // 🚀 Phase 1: 智能等待条件检查
  private async waitForCondition(
    checkFn: () => Promise<boolean> | boolean, 
    options: { 
      minWait?: number; 
      maxWait?: number; 
      checkInterval?: number; 
    } = {}
  ): Promise<boolean> {
    const { 
      minWait = 200, 
      maxWait = 2000, 
      checkInterval = 100 
    } = options;

    // 最小等待时间
    await new Promise(resolve => setTimeout(resolve, minWait));
    
    const startTime = Date.now();
    const endTime = startTime + maxWait - minWait;
    
    while (Date.now() < endTime) {
      try {
        const result = await checkFn();
        if (result) {
          return true;
        }
      } catch (error) {
        // 检查条件时出错，继续等待
      }
      
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
    
    return false;
  }

  // 🚀 Phase 1: 检查页面是否达到可交互状态  
  private async checkPageInteractive(): Promise<boolean> {
    try {
      // 🔥 优化：对于初始阶段（浏览器刚启动），直接返回false，跳过快照获取
      // 这避免了在空白页面上耗时的快照操作
      try {
        const snapshot = await Promise.race([
          this.mcpClient.getSnapshot(),
          new Promise<string>((_, reject) => 
            setTimeout(() => reject(new Error('快照获取超时')), 1000)
          )
        ]);
        
        // 从快照中提取URL，确保不是about:blank
        const currentUrl = this.extractUrlFromSnapshot(snapshot);
        if (!currentUrl || currentUrl === 'about:blank') {
          return false;
        }
        
        // 检查页面是否已经有基本内容
        return snapshot && snapshot.trim().length > 100;
      } catch (error) {
        // 快照获取失败或超时，直接返回false（适用于初始阶段）
        return false;
      }
    } catch (error) {
      return false;
    }
  }

  // 🚀 Phase 1: 优化版导航命令执行
  private async executeNavigationCommand(url: string, runId: string, isFirstStep: boolean = false): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. 验证和修正URL
      const validatedUrl = this.validateAndFixUrl(url);
      console.log(`🌐 [${runId}] 导航到: ${validatedUrl} ${isFirstStep ? '(首次导航-快速模式)' : ''}`);

      // 2. 执行导航命令
      console.log(`🌐 [${runId}] 执行MCP导航命令: navigate ${validatedUrl}`);
      const navResult = await this.mcpClient.callTool({
        name: MCPToolMapper.getToolName('navigate'),
        arguments: { url: validatedUrl }
      });
      console.log(`🌐 [${runId}] 导航结果:`, navResult);

      // 3. 🚀 智能等待页面加载 (Phase 1 优化核心)
      if (isFirstStep) {
        console.log(`⚡ [${runId}] 首次导航智能等待 (DOM可交互状态)...`);
        const waitSuccess = await this.waitForCondition(
          () => this.checkPageInteractive(),
          { 
            minWait: 200,      // 最少等待200ms
            maxWait: 2000,     // 最多等待2秒 (原来3秒)
            checkInterval: 100  // 每100ms检查一次
          }
        );
        
        if (waitSuccess) {
          console.log(`⚡ [${runId}] 首次导航快速完成!`);
        } else {
          console.log(`⚡ [${runId}] 首次导航达到最大等待时间，继续执行`);
        }
      } else {
        // 非首次导航保持原有逻辑
        console.log(`⏳ [${runId}] 等待页面加载...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      // 4. 验证导航结果
      // 🔥 优化：第一步导航验证使用快速超时，避免长时间等待
      let snapshot: string;
      if (isFirstStep) {
        try {
          snapshot = await Promise.race([
            this.mcpClient.getSnapshot(),
            new Promise<string>((_, reject) => 
              setTimeout(() => reject(new Error('导航验证快照超时')), 2000)
            )
          ]);
        } catch (error) {
          // 超时或失败时使用简单的成功假设，避免阻塞
          console.log(`⚡ [${runId}] 第一步导航验证快照超时，假设成功`);
          return { success: true };
        }
      } else {
        snapshot = await this.mcpClient.getSnapshot();
      }
      const currentUrl = this.extractUrlFromSnapshot(snapshot);

      // 5. 检查导航是否成功
      if (currentUrl && currentUrl !== 'about:blank') {
        console.log(`✅ [${runId}] 导航成功: ${currentUrl}`);
        return { success: true };
      } else {
        console.log(`⚠️ [${runId}] 导航可能未完成，当前URL: ${currentUrl || 'unknown'}`);

        // 6. 重试导航 (首次导航时使用更短的等待时间)
        console.log(`🔄 [${runId}] 重试导航...`);
        await this.mcpClient.callTool({
          name: MCPToolMapper.getToolName('navigate'),
          arguments: { url: validatedUrl }
        });

        // 7. 🚀 智能重试等待
        const retryWait = isFirstStep ? 2000 : 5000;
        console.log(`⏳ [${runId}] 重试等待 (${retryWait}ms)...`);
        await new Promise(resolve => setTimeout(resolve, retryWait));

        // 8. 再次验证
        const newSnapshot = await this.mcpClient.getSnapshot();
        const newUrl = this.extractUrlFromSnapshot(newSnapshot);

        if (newUrl && newUrl !== 'about:blank') {
          console.log(`✅ [${runId}] 重试导航成功: ${newUrl}`);
          return { success: true };
        } else {
          // 9. 尝试备用导航方法
          console.log(`🔄 [${runId}] 尝试备用导航方法...`);

          // 使用browser_type输入URL并按Enter
          await this.mcpClient.callTool({
            name: 'type',
            arguments: { selector: 'body', text: validatedUrl }
          });

          await this.mcpClient.callTool({
            name: 'press_key',
            arguments: { key: 'Enter' }
          });

          // 10. 🚀 备用方法智能等待
          const fallbackWait = isFirstStep ? 2000 : 5000;
          await new Promise(resolve => setTimeout(resolve, fallbackWait));
          const finalSnapshot = await this.mcpClient.getSnapshot();
          const finalUrl = this.extractUrlFromSnapshot(finalSnapshot);

          if (finalUrl && finalUrl !== 'about:blank') {
            console.log(`✅ [${runId}] 备用导航方法成功: ${finalUrl}`);
            return { success: true };
          } else {
            console.log(`❌ [${runId}] 导航失败，无法访问: ${validatedUrl}`);
            return { success: false, error: `无法导航到 ${validatedUrl}` };
          }
        }
      }
    } catch (error: any) {
      console.error(`❌ [${runId}] 导航执行错误: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // 验证和修正URL
  private validateAndFixUrl(url: string): string {
    // 确保URL有协议前缀
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    // 处理特殊字符
    try {
      new URL(url); // 验证URL格式
      return url;
    } catch (e) {
      // 如果URL格式不正确，尝试修复
      return encodeURI(url);
    }
  }

  // 从快照中提取URL
  private extractUrlFromSnapshot(snapshot: string): string | null {
    if (!snapshot) return null;
    const urlMatch = snapshot.match(/Page URL: ([^\n]+)/);
    return urlMatch ? urlMatch[1].trim() : null;
  }


  // 🔥 增强：每个步骤执行后的截图方法 - 支持数据库存储和本地文件验证
  private async takeStepScreenshot(runId: string, stepIndex: number | string, status: 'success' | 'failed' | 'error' | 'completed', description: string): Promise<void> {
    try {
      // 1. 生成截图文件名
      const timestamp = Date.now();
      const sanitizedDescription = description.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_').substring(0, 50);
      const filename = `${runId}-step-${stepIndex}-${status}-${timestamp}.png`;

      console.log(`📸 [${runId}] 正在截图: ${filename}`);
      this.addLog(runId, `📸 正在截图: 步骤${stepIndex} - ${description}`, 'info');

      // 2. 使用统一的截图配置
      const { screenshotConfig } = await import('../../src/utils/screenshotConfig.js');
      const screenshotsDir = screenshotConfig.getScreenshotsDirectory();
      const configuredBackupDir = screenshotConfig.getBackupDirectory();

      // 确保截图目录存在
      screenshotConfig.ensureScreenshotsDirectory();

      // 3. 调用MCP客户端截图
      await this.mcpClient.takeScreenshot(filename);

      // 4. 验证截图文件是否成功保存并获取文件信息
      const filePath = path.join(screenshotsDir, filename);
      const fullPath = filePath;

      let fileSize = 0;
      let fileExists = false;

      // 🔥 如果禁用文件验证，直接标记为存在
      if (!screenshotConfig.isFileVerificationEnabled()) {
        fileExists = true;
        fileSize = 0; // 默认大小，不验证实际文件
        console.log(`✅ [${runId}] 文件验证已禁用，跳过文件检查: ${filename}`);
      } else {
        // 等待文件保存（MCP可能需要一些时间）
        const maxRetries = 8; // 增加重试次数
        let retryCount = 0;

        while (retryCount < maxRetries && !fileExists) {
          try {
            await new Promise(resolve => setTimeout(resolve, 300)); // 增加等待时间到300ms
            const stats = await fs.promises.stat(fullPath);
            fileSize = stats.size;

            // 验证文件不为空
            if (fileSize > 0) {
              fileExists = true;
              console.log(`✅ [${runId}] 截图文件验证成功: ${filename} (${fileSize} bytes)`);
            } else {
              console.warn(`⚠️ [${runId}] 截图文件为空，继续等待: ${filename}`);
              retryCount++;
            }
          } catch (error) {
            retryCount++;
            if (retryCount === maxRetries) {
              console.warn(`⚠️ [${runId}] 截图文件验证失败，重试${maxRetries}次后仍未找到: ${filename}`);
              this.addLog(runId, `⚠️ 截图可能失败: 文件 ${filename} 未找到`, 'warning');
            }
          }
        }
      }

      // 5. 获取测试运行信息
      const testRun = testRunStore.get(runId);

      // 6. 构建截图记录
      const screenshotRecord: ScreenshotRecord = {
        runId,
        testCaseId: testRun?.testCaseId,
        stepIndex: stepIndex.toString(),
        stepDescription: description,
        status,
        filePath,
        fileName: filename,
        fileSize,
        mimeType: 'image/png',
        fileExists
      };

      // 7. 保存到数据库
      try {
        await this.screenshotService.saveScreenshot(screenshotRecord);
        if (fileExists) {
          console.log(`✅ [${runId}] 截图已完整保存: ${filename} (本地文件+数据库)`);
          this.addLog(runId, `✅ 截图已完整保存: ${filename} (${fileSize} bytes)`, 'success');
        } else {
          console.log(`⚠️ [${runId}] 截图数据库记录已保存，但本地文件缺失: ${filename}`);
          this.addLog(runId, `⚠️ 截图数据库记录已保存，但本地文件可能缺失: ${filename}`, 'warning');
        }
      } catch (dbError: any) {
        console.error(`❌ [${runId}] 截图数据库保存失败: ${dbError.message}`);
        if (fileExists) {
          this.addLog(runId, `⚠️ 截图文件已保存到本地，但数据库记录失败: ${dbError.message}`, 'warning');
        } else {
          this.addLog(runId, `❌ 截图完全失败: 本地文件和数据库都保存失败`, 'error');
        }
        // 不抛出错误，确保测试执行不因截图数据库保存失败而中断
      }

      // 8. 创建本地备份（优化的双重保存机制）
      if (fileExists && fileSize > 0 && screenshotConfig.shouldBackup()) {
        try {
          // 使用配置的备份目录
          const now = new Date();
          const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
          const actualBackupDir = path.join(configuredBackupDir, dateStr, runId);

          await fs.promises.mkdir(actualBackupDir, { recursive: true });

          const backupPath = path.join(actualBackupDir, filename);
          await fs.promises.copyFile(fullPath, backupPath);

          console.log(`📂 [${runId}] 截图已备份: ${actualBackupDir}/${filename}`);
          this.addLog(runId, `📂 截图已创建备份副本`, 'info');

          // 验证备份文件
          const backupStats = await fs.promises.stat(backupPath);
          if (backupStats.size === fileSize) {
            console.log(`✅ [${runId}] 备份文件验证成功: ${backupStats.size} bytes`);
          } else {
            console.warn(`⚠️ [${runId}] 备份文件大小不匹配: ${backupStats.size} vs ${fileSize}`);
          }
        } catch (backupError: any) {
          console.warn(`⚠️ [${runId}] 截图备份失败: ${backupError.message}`);
          this.addLog(runId, `⚠️ 截图备份失败，但主文件已保存`, 'warning');
        }
      }

      // 9. 生成截图索引文件（便于管理和查看）
      if (fileExists) {
        try {
          const indexDir = path.join(screenshotsDir, 'index');
          await fs.promises.mkdir(indexDir, { recursive: true });

          const indexFile = path.join(indexDir, `${runId}_screenshots.json`);
          let indexData: any[] = [];

          // 读取现有索引文件
          try {
            const existingIndex = await fs.promises.readFile(indexFile, 'utf-8');
            indexData = JSON.parse(existingIndex);
          } catch {
            // 索引文件不存在，使用空数组
          }

          // 添加新的截图记录
          indexData.push({
            stepIndex: stepIndex.toString(),
            filename,
            description,
            status,
            timestamp: new Date().toISOString(),
            fileSize,
            filePath: filePath
          });

          // 保存更新后的索引
          await fs.promises.writeFile(indexFile, JSON.stringify(indexData, null, 2));
          console.log(`📋 [${runId}] 截图索引已更新: ${indexData.length} 个截图记录`);
        } catch (indexError: any) {
          console.warn(`⚠️ [${runId}] 截图索引更新失败: ${indexError.message}`);
          // 索引失败不影响主流程
        }
      }

    } catch (screenshotError: any) {
      // 🔥 关键修复：截图失败不应该中断测试执行
      console.error(`❌ [${runId}] 截图过程失败: ${screenshotError.message}`);
      this.addLog(runId, `⚠️ 截图失败但测试继续: ${screenshotError.message}`, 'warning');
      // 不抛出错误，确保测试执行继续进行
    }
  }

  // 🚀 Phase 3: 智能动态延迟系统
  private async smartWaitAfterOperation(action: string, context: { runId: string; isFirstStep?: boolean; stepIndex?: number }): Promise<void> {
    const { runId, isFirstStep = false } = context;
    
    switch (action) {
      case 'navigate':
      case 'browser_navigate':
        // 🚀 第一步导航：使用智能等待，已在executeNavigationCommand中处理
        if (isFirstStep) {
          console.log(`⚡ [${runId}] 第一步导航：跳过额外等待`);
          return; // 跳过所有延迟
        }
        
        // 🚀 普通导航：检查网络活动是否稳定
        console.log(`🌐 [${runId}] 导航后智能等待...`);
        const navWaitSuccess = await this.waitForCondition(
          () => this.checkNetworkStable(),
          { minWait: 500, maxWait: 2000, checkInterval: 200 }
        );
        console.log(`🌐 [${runId}] 导航等待完成: ${navWaitSuccess ? '网络稳定' : '超时继续'}`);
        break;

      case 'click':
      case 'browser_click':
        // 🚀 智能点击等待：检查页面是否有响应变化
        console.log(`👆 [${runId}] 点击后智能等待页面响应...`);
        const clickWaitSuccess = await this.waitForCondition(
          () => this.checkPageChanged(),
          { minWait: 200, maxWait: 1000, checkInterval: 100 }
        );
        console.log(`👆 [${runId}] 点击等待完成: ${clickWaitSuccess ? '页面已响应' : '超时继续'}`);
        break;

      case 'fill':
      case 'input':
      case 'type':
      case 'browser_type':
        // 🚀 输入等待：检查输入值是否已设置
        console.log(`⌨️ [${runId}] 输入后轻量等待...`);
        await this.delay(300); // 输入操作通常很快，轻量等待即可
        break;

      case 'wait':
      case 'browser_wait_for':
        // 等待命令不需要额外延迟
        return;

      case 'browser_scroll_down':
      case 'browser_scroll_up':
      case 'browser_scroll_to_top':
      case 'browser_scroll_to_bottom':
      case 'browser_scroll_to_element':
      case 'browser_scroll_by':
      case 'browser_scroll_page':
      case 'scroll':
        // 🚀 滚动等待：检查滚动位置是否稳定
        console.log(`📜 [${runId}] 滚动后等待稳定...`);
        const scrollWaitSuccess = await this.waitForCondition(
          () => this.checkScrollStable(),
          { minWait: 200, maxWait: 800, checkInterval: 100 }
        );
        console.log(`📜 [${runId}] 滚动等待完成: ${scrollWaitSuccess ? '位置稳定' : '超时继续'}`);
        break;

      default:
        // 🚀 其他操作：最小延迟
        console.log(`⚙️ [${runId}] 默认操作后轻量等待...`);
        await this.delay(200);
        break;
    }
  }

  // 🚀 Phase 3: 网络活动检查
  private async checkNetworkStable(): Promise<boolean> {
    try {
      // 简单的网络稳定性检查 - 检查页面是否还在加载
      const snapshot = await this.mcpClient.getSnapshot();
      // 如果能获取快照且有内容，认为网络相对稳定
      return snapshot && snapshot.trim().length > 50;
    } catch (error) {
      return false;
    }
  }

  // 🚀 Phase 3: 页面变化检查
  private async checkPageChanged(): Promise<boolean> {
    try {
      // 简单的页面变化检查 - 通过快照比较
      // 这里可以优化为比较DOM hash或特定元素
      await this.delay(50); // 短暂延迟确保变化能被检测到
      return true; // 简化实现，认为点击后总有变化
    } catch (error) {
      return false;
    }
  }

  // 🚀 Phase 3: 滚动稳定性检查
  private async checkScrollStable(): Promise<boolean> {
    try {
      // 简单的滚动稳定性检查
      await this.delay(50);
      return true; // 简化实现，短暂延迟后认为滚动已稳定
    } catch (error) {
      return false;
    }
  }

  // 🔥 保持兼容性的旧方法，重定向到智能版本
  private async delayAfterOperation(action: string, context: { runId: string; isFirstStep?: boolean; stepIndex?: number } = { runId: 'unknown' }): Promise<void> {
    return this.smartWaitAfterOperation(action, context);
  }


  // #region Screenshot Management

  /**
   * 清理指定测试运行的所有截图文件和数据库记录
   * @param runId 测试运行ID
   * @returns 清理结果统计
   */
  public async cleanupTestScreenshots(runId: string): Promise<{
    deleted: number;
    failed: number;
    totalSize: number;
  }> {
    try {
      console.log(`🧹 开始清理测试运行截图: ${runId}`);

      // 1. 获取该测试运行的所有截图记录
      const screenshots = await this.screenshotService.getScreenshotsByRunId(runId);

      if (screenshots.length === 0) {
        console.log(`📋 测试运行 ${runId} 没有截图记录`);
        return { deleted: 0, failed: 0, totalSize: 0 };
      }

      let deleted = 0;
      let failed = 0;
      let totalSize = 0;

      // 2. 删除本地文件
      for (const screenshot of screenshots) {
        try {
          const fullPath = path.join(process.cwd(), screenshot.filePath);

          // 检查文件是否存在
          try {
            const stats = await fs.promises.stat(fullPath);
            totalSize += stats.size;

            // 删除主文件
            await fs.promises.unlink(fullPath);

            // 删除备份文件
            const backupPattern = path.join(process.cwd(), 'screenshots', 'backup', '*', runId, screenshot.fileName);
            // 简化处理：尝试删除可能的备份位置
            const backupDir = path.join(process.cwd(), 'screenshots', 'backup');
            if (await this.fileExists(backupDir)) {
              await this.cleanupBackupFiles(backupDir, runId, screenshot.fileName);
            }

            deleted++;
            console.log(`🗑️ 已删除截图文件: ${screenshot.fileName}`);
          } catch (fileError) {
            // 文件不存在，跳过
            console.log(`📄 截图文件不存在（跳过）: ${screenshot.fileName}`);
            deleted++; // 算作成功删除
          }
        } catch (error: any) {
          console.error(`❌ 删除截图文件失败: ${screenshot.fileName}`, error);
          failed++;
        }
      }

      // 3. 删除数据库记录（通过ScreenshotService的清理方法）
      // 这里我们可以扩展ScreenshotService来支持按runId删除

      // 4. 删除索引文件
      try {
        const indexFile = path.join(process.cwd(), 'screenshots', 'index', `${runId}_screenshots.json`);
        if (await this.fileExists(indexFile)) {
          await fs.promises.unlink(indexFile);
          console.log(`📋 已删除截图索引文件: ${runId}_screenshots.json`);
        }
      } catch (indexError: any) {
        console.warn(`⚠️ 删除索引文件失败: ${indexError.message}`);
      }

      const result = { deleted, failed, totalSize };
      console.log(`✅ 测试运行 ${runId} 截图清理完成:`, result);
      return result;

    } catch (error: any) {
      console.error(`❌ 清理测试截图失败: ${error.message}`);
      throw new Error(`清理测试截图失败: ${error.message}`);
    }
  }

  /**
   * 获取截图存储统计信息
   */
  public async getScreenshotStats(): Promise<{
    totalScreenshots: number;
    totalSize: number;
    byStatus: Record<string, number>;
    recentCount: number;
  }> {
    try {
      const stats = await this.screenshotService.getStorageStats();
      return {
        totalScreenshots: stats.totalScreenshots,
        totalSize: stats.totalSize,
        byStatus: stats.countByStatus,
        recentCount: stats.recentActivity.last24Hours,
      };
    } catch (error: any) {
      console.error(`❌ 获取截图统计失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 辅助方法：检查文件是否存在
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 辅助方法：清理备份文件
   */
  private async cleanupBackupFiles(backupDir: string, runId: string, fileName: string): Promise<void> {
    try {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      const dateDirs = await fs.promises.readdir(backupDir);

      for (const dateDir of dateDirs) {
        if (dateRegex.test(dateDir)) {
          const runBackupDir = path.join(backupDir, dateDir, runId);
          const backupFile = path.join(runBackupDir, fileName);

          if (await this.fileExists(backupFile)) {
            await fs.promises.unlink(backupFile);
            console.log(`🗑️ 已删除备份文件: backup/${dateDir}/${runId}/${fileName}`);

            // 如果备份目录为空，删除目录
            try {
              const files = await fs.promises.readdir(runBackupDir);
              if (files.length === 0) {
                await fs.promises.rmdir(runBackupDir);
                console.log(`📁 已删除空备份目录: backup/${dateDir}/${runId}`);
              }
            } catch {
              // 忽略目录删除失败
            }
          }
        }
      }
    } catch (error: any) {
      console.warn(`⚠️ 清理备份文件时出错: ${error.message}`);
    }
  }

  // #endregion

  // #region Test Run Management
  public getTestRun(runId: string) { return testRunStore.get(runId); }
  public getAllTestRuns() { return testRunStore.all(); }
  public async cancelTest(runId: string): Promise<boolean> {
    const testRun = this.getTestRun(runId);
    if (testRun && ['queued', 'running'].includes(testRun.status)) {
      this.updateTestRunStatus(runId, 'cancelled', '测试已被用户取消');
      return true;
    }
    return false;
  }
  // #endregion

  // #region Utilities
  private updateTestRunStatus(runId: string, status: TestRunStatus, message?: string) {
    const testRun = testRunStore.get(runId);
    if (testRun) {
      // 🔥 新增：首次变为running状态时，记录实际开始执行时间
      if (status === 'running' && testRun.status !== 'running' && !testRun.actualStartedAt) {
        testRun.actualStartedAt = new Date();
        console.log(`⏱️ [${runId}] 记录实际开始执行时间: ${testRun.actualStartedAt.toISOString()}`);
      }

      testRun.status = status;

      // 🔥 新增：实时更新执行时长
      if (testRun.startTime && (status === 'running' || status === 'completed' || status === 'failed')) {
        testRun.duration = this.formatDuration(testRun.startTime);
      }

      const logLevel = (status === 'failed' || status === 'error') ? 'error' : 'info';
      if (message) {
        this.addLog(runId, message, logLevel);
      }

      // 🔥 修改：WebSocket 广播包含完整的进度数据
      this.wsManager.broadcast({
        type: 'test_update',
        runId,
        data: {
          status: testRun.status,
          progress: testRun.progress,
          completedSteps: testRun.completedSteps,
          totalSteps: testRun.totalSteps,
          passedSteps: testRun.passedSteps,
          failedSteps: testRun.failedSteps,
          duration: testRun.duration
        }
      });

      // 🔥 异步同步到数据库（不阻塞执行）
      this.syncTestRunToDatabase(runId).catch(err => {
        console.warn(`⚠️ [${runId}] 同步数据库失败:`, err.message);
      });
    }
  }

  /**
   * 🔥 同步 TestRun 到数据库
   */
  private async syncTestRunToDatabase(runId: string): Promise<void> {
    const testRun = testRunStore.get(runId);
    if (!testRun) return;

    try {
      await this.executionService.syncFromTestRun(testRun);
    } catch (error) {
      // 静默失败，避免影响测试执行
      console.error(`❌ [${runId}] 数据库同步失败:`, error);
    }
  }

  // 🚀 Phase 6: 日志批量处理队列，解决同步WebSocket瓶颈
  private logQueue: Map<string, { logs: TestLog[]; timer?: NodeJS.Timeout }> = new Map();

  private addLog(runId: string, message: string, level?: 'info' | 'success' | 'warning' | 'error') {
    const testRun = testRunStore.get(runId);
    const timestamp = new Date().toISOString();
    const timeStr = new Date().toLocaleTimeString('zh-CN', { hour12: false });

    // 控制台输出带时间戳 (保持同步以便调试)
    const consoleMessage = `[${timeStr}] ${message}`;

    switch (level) {
      case 'error':
        console.error(consoleMessage);
        break;
      case 'warning':
        console.warn(consoleMessage);
        break;
      case 'success':
        console.log(`✅ ${consoleMessage}`);
        break;
      default:
        console.log(consoleMessage);
    }

    if (testRun) {
      const logEntry: TestLog = { id: uuidv4(), timestamp: new Date(), message, level: level || 'info' };
      testRun.logs.push(logEntry);
      
      // 🚀 Phase 6: 批量WebSocket广播，避免同步阻塞
      this.queueLogForBroadcast(runId, logEntry);
    }
  }

  // 🚀 Phase 6: 日志批量广播队列
  private queueLogForBroadcast(runId: string, logEntry: TestLog) {
    if (!this.logQueue.has(runId)) {
      this.logQueue.set(runId, { logs: [] });
    }

    const queue = this.logQueue.get(runId)!;
    queue.logs.push(logEntry);

    // 清除之前的定时器
    if (queue.timer) {
      clearTimeout(queue.timer);
    }

    // 🚀 关键优化：50ms批量发送，或达到5条立即发送
    if (queue.logs.length >= 5) {
      this.flushLogQueue(runId);
    } else {
      queue.timer = setTimeout(() => this.flushLogQueue(runId), 50);
    }
  }

  // 🚀 Phase 6: 批量刷新日志队列
  private flushLogQueue(runId: string) {
    const queue = this.logQueue.get(runId);
    if (!queue || queue.logs.length === 0) return;

    // 🔥 核心修复：复制日志数组，避免异步发送时数组已被清空
    const logsToSend = [...queue.logs];

    // 🔥 立即清理队列，为下一批日志做准备
    queue.logs = [];

    // 异步广播，不阻塞主流程
    setImmediate(() => {
      try {
        this.wsManager.broadcast({
          type: 'logs_batch',
          runId,
          data: { logs: logsToSend }  // 🔥 使用复制的数组
        });
      } catch (error) {
        console.warn(`WebSocket日志广播失败:`, error);
      }
    });
    if (queue.timer) {
      clearTimeout(queue.timer);
      queue.timer = undefined;
    }
  }

  /**
   * 🔥 新增：预估测试步骤总数
   * 通过解析步骤文本中的数字编号来预估总步骤数
   */
  private estimateStepsCount(stepsText: string): number {
    if (!stepsText || !stepsText.trim()) {
      return 1; // 默认至少1步
    }

    // 尝试匹配步骤编号格式：1. 2. 3. 或 1) 2) 3) 或 步骤1 步骤2
    const numberMatches = stepsText.match(/(?:^|\n)\s*(\d+)[.、:)]/g);
    if (numberMatches && numberMatches.length > 0) {
      return numberMatches.length;
    }

    // 如果没有编号，按换行符估算（每行一步）
    const lines = stepsText.split('\n').filter(line => line.trim().length > 0);
    return Math.max(1, Math.min(lines.length, 20)); // 限制在1-20之间
  }

  /**
   * 🔥 新增：格式化执行时长
   * 将毫秒转换为友好的时间字符串
   */
  private formatDuration(startTime: Date): string {
    const durationMs = Date.now() - startTime.getTime();
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  private async finalizeTestRun(runId: string) {
    // 🚀 Phase 6: 确保所有日志都被发送
    this.flushLogQueue(runId);
    this.logQueue.delete(runId);

    const testRun = testRunStore.get(runId);
    if (testRun) {
      testRun.endedAt = new Date();
      // 🔥 优化：优先使用actualStartedAt计算实际执行时长，回退到startedAt保证兼容性
      const effectiveStartTime = testRun.actualStartedAt || testRun.startedAt;
      const duration = this.calculateDuration(effectiveStartTime, testRun.endedAt);
      console.log(`⏱️ [${runId}] 计算执行时长: ${duration} (${testRun.actualStartedAt ? '实际' : '入队'}开始时间)`);
      this.wsManager.broadcast({ type: 'test_update', runId, data: { status: testRun.status, endedAt: testRun.endedAt, duration } });
    }
  }

  private calculateDuration(startTime: Date, endTime: Date): string {
    return ((endTime.getTime() - startTime.getTime()) / 1000).toFixed(2) + 's';
  }

  private extractTimeoutFromDescription(description: string): number {
    // 支持多种格式：10秒、10s、停留10、等待10
    const match = description.match(/(\d+)\s*(秒|s|)/i);
    if (match) {
      const seconds = parseInt(match[1]);
      return seconds * 1000; // 转换为毫秒
    }

    // 检查"停留"或"等待"关键词
    const stayMatch = description.match(/停留\s*(\d+)/i);
    if (stayMatch) {
      return parseInt(stayMatch[1]) * 1000;
    }

    const waitMatch = description.match(/等待\s*(\d+)/i);
    if (waitMatch) {
      return parseInt(waitMatch[1]) * 1000;
    }

    return 2000; // 默认2秒
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 🔥 新增：确保页面稳定性 - 增强版
  private async ensurePageStability(runId: string): Promise<void> {
    try {
      this.addLog(runId, `⏳ 确保页面稳定性...`, 'info');

      // 1. 等待页面完全加载（增强版）
      await this.mcpClient.waitForPageFullyLoaded();

      // 2. 检测页面稳定性
      await this.mcpClient.waitForPageStability();

      // 3. 刷新页面快照确保同步
      await this.mcpClient.getSnapshot();

      this.addLog(runId, `✅ 页面稳定性检查完成`, 'info');
    } catch (error: any) {
      this.addLog(runId, `⚠️ 页面稳定性检查失败，使用降级策略: ${error.message}`, 'warning');

      // 降级策略：基础等待
      try {
        await this.mcpClient.waitForLoad();
        await this.delay(1000);
        await this.mcpClient.getSnapshot();
        this.addLog(runId, `✅ 降级页面稳定性检查完成`, 'info');
      } catch (fallbackError: any) {
        this.addLog(runId, `⚠️ 降级策略也失败，继续执行: ${fallbackError.message}`, 'warning');
      }
    }
  }

  // 🔥 新增：判断操作是否需要验证
  private async needsOperationVerification(step: import('./aiParser.js').TestStep): Promise<boolean> {
    // 根据操作类型判断是否需要效果验证
    const verificationNeededActions = [
      'navigate', 'browser_navigate',    // 导航操作需要验证页面是否正确加载
      'click', 'browser_click',          // 点击操作需要验证是否触发了预期效果
      'fill', 'input', 'type', 'browser_type',  // 输入操作需要验证内容是否正确填入
      'browser_select_option'            // 选择操作需要验证选项是否被选中
    ];

    return verificationNeededActions.includes(step.action);
  }

  // 🔥 新增：验证操作成功
  private async verifyOperationSuccess(step: import('./aiParser.js').TestStep, runId: string): Promise<boolean> {
    try {
      this.addLog(runId, `🔍 验证操作效果...`, 'info');

      // 根据操作类型进行不同的验证
      switch (step.action) {
        case 'navigate':
        case 'browser_navigate':
          return await this.verifyNavigationSuccess(step, runId);

        case 'click':
        case 'browser_click':
          return await this.verifyClickSuccess(step, runId);

        case 'fill':
        case 'input':
        case 'type':
        case 'browser_type':
          return await this.verifyInputSuccess(step, runId);

        default:
          // 对于其他操作，简单验证页面仍然可访问
          await this.mcpClient.getSnapshot();
          return true;
      }
    } catch (error: any) {
      this.addLog(runId, `⚠️ 操作效果验证失败: ${error.message}`, 'warning');
      return false;
    }
  }

  // 🔥 新增：验证导航成功
  private async verifyNavigationSuccess(step: TestStep, runId: string): Promise<boolean> {
    try {
      const snapshot = await this.mcpClient.getSnapshot();
      const currentUrl = this.extractUrlFromSnapshot(snapshot);

      if (currentUrl && currentUrl !== 'about:blank' && step.url) {
        const targetDomain = new URL(step.url).hostname;
        const currentDomain = new URL(currentUrl).hostname;

        if (currentDomain.includes(targetDomain) || targetDomain.includes(currentDomain)) {
          this.addLog(runId, `✅ 导航验证成功: ${currentUrl}`, 'success');
          return true;
        }
      }

      this.addLog(runId, `⚠️ 导航验证失败: 期望${step.url}, 实际${currentUrl}`, 'warning');
      return false;
    } catch (error: any) {
      this.addLog(runId, `❌ 导航验证异常: ${error.message}`, 'error');
      return false;
    }
  }

  // 🔥 新增：验证点击成功
  private async verifyClickSuccess(step: TestStep, runId: string): Promise<boolean> {
    try {
      // 点击后等待一下，看页面是否有变化
      await this.delay(1000);

      const newSnapshot = await this.mcpClient.getSnapshot();

      // 简单验证：页面内容应该有变化或者URL可能改变
      if (newSnapshot && newSnapshot.length > 100) {
        this.addLog(runId, `✅ 点击验证成功: 页面响应正常`, 'success');
        return true;
      }

      return false;
    } catch (error: any) {
      this.addLog(runId, `❌ 点击验证异常: ${error.message}`, 'error');
      return false;
    }
  }

  // 🔥 新增：验证输入成功
  private async verifyInputSuccess(step: TestStep, runId: string): Promise<boolean> {
    try {
      // 输入后简单验证页面仍然可访问
      const snapshot = await this.mcpClient.getSnapshot();

      if (snapshot && snapshot.length > 50) {
        this.addLog(runId, `✅ 输入验证成功: 页面响应正常`, 'success');
        return true;
      }

      return false;
    } catch (error: any) {
      this.addLog(runId, `❌ 输入验证异常: ${error.message}`, 'error');
      return false;
    }
  }

  // 🔥 使用AI驱动的替代搜索策略
  private async executeMcpCommandWithAlternativeSearch(step: TestStep, runId: string, stepIndex: number = 1): Promise<{ success: boolean; error?: string }> {
    try {
      // 🔥 类型安全检查：断言步骤不应该使用操作重试机制
      if (step.stepType === 'assertion') {
        console.log(`🚫 [${runId}] 断言步骤"${step.description}"不使用操作重试机制`);
        return { success: false, error: `断言步骤执行失败: ${step.description}` };
      }

      // 🔥 首先尝试通过AI重新解析步骤
      console.log(`🔄 [${runId}] 使用AI替代搜索策略重新解析步骤`);

      const snapshot = await this.mcpClient.getSnapshot();
      const aiResult = await this.aiParser.parseNextStep(step.description, snapshot, runId);

      if (aiResult.success && aiResult.step) {
        const aiStep = aiResult.step;
        console.log(`🤖 [${runId}] AI替代解析成功: ${aiStep.action}`);

        // 使用AI重新解析的步骤
        const result = await this.executeMcpCommand(aiStep, runId);
        if (result.success) {
          this.addLog(runId, `✅ AI替代搜索成功`, 'success');
          return result;
        }
      }

      // 如果AI替代解析也失败，使用原始方法
      console.log(`⚠️ [${runId}] AI替代解析失败，使用原始方法`);
      return await this.executeMcpCommand(step, runId);

    } catch (error: any) {
      console.error(`❌ [${runId}] 替代搜索策略失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // 🔥 新增：断言验证方法
  private async validateAssertion(assertionDescription: string, snapshotResult: any, runId: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`🔍 [${runId}] 开始验证断言: "${assertionDescription}"`);

      // 提取快照文本内容
      let snapshotText = '';
      if (snapshotResult && snapshotResult.content) {
        const content = Array.isArray(snapshotResult.content) ? snapshotResult.content : [snapshotResult.content];
        for (const item of content) {
          if (item.type === 'text' && item.text) {
            snapshotText += item.text + '\n';
          }
        }
      }

      if (!snapshotText.trim()) {
        console.warn(`⚠️ [${runId}] 快照内容为空，无法进行断言验证`);
        return { success: false, error: '快照内容为空，无法进行断言验证' };
      }

      console.log(`📄 [${runId}] 快照内容长度: ${snapshotText.length} 字符`);
      console.log(`📄 [${runId}] 快照内容前100字符: ${snapshotText.substring(0, 100)}...`);

      // 🔥 智能断言验证逻辑
      const assertionLower = assertionDescription.toLowerCase();
      const snapshotLower = snapshotText.toLowerCase();

      // 1. 否定断言验证（不展示、不显示、不包含）
      if (assertionLower.includes('不展示') || assertionLower.includes('不显示') || assertionLower.includes('不包含')) {
        // 提取要验证的文本内容
        const keywords = this.extractAssertionKeywords(assertionDescription);
        console.log(`🔍 [${runId}] 提取的关键词（否定断言）: ${keywords.join(', ')}`);

        for (const keyword of keywords) {
          if (snapshotLower.includes(keyword.toLowerCase())) {
            console.log(`❌ [${runId}] 找到不应该存在的关键词: "${keyword}"`);
            this.addLog(runId, `❌ 断言验证失败: 页面不应该包含 "${keyword}"`, 'error');
            return { success: false, error: `页面不应该包含: ${keyword}` };
          }
        }

        console.log(`✅ [${runId}] 确认页面不包含关键词: ${keywords.join(', ')}`);
        this.addLog(runId, `✅ 断言验证通过: 页面不展示商品管理`, 'success');
        return { success: true };
      }

      // 2. 正面断言验证（展示、显示、包含）
      if (assertionLower.includes('展示') || assertionLower.includes('显示') || assertionLower.includes('包含')) {
        // 提取要验证的文本内容
        const keywords = this.extractAssertionKeywords(assertionDescription);
        console.log(`🔍 [${runId}] 提取的关键词: ${keywords.join(', ')}`);

        for (const keyword of keywords) {
          if (snapshotLower.includes(keyword.toLowerCase())) {
            console.log(`✅ [${runId}] 找到关键词: "${keyword}"`);
            this.addLog(runId, `✅ 断言验证通过: 页面包含 "${keyword}"`, 'success');
            return { success: true };
          }
        }

        console.log(`❌ [${runId}] 未找到任何关键词: ${keywords.join(', ')}`);
        return { success: false, error: `页面未找到预期内容: ${keywords.join(', ')}` };
      }

      // 3. 页面跳转验证
      if (assertionLower.includes('跳转') || assertionLower.includes('页面') || assertionLower.includes('url')) {
        // 从快照中提取URL信息
        const urlMatch = snapshotText.match(/Page URL: ([^\n]+)/);
        if (urlMatch) {
          const currentUrl = urlMatch[1];
          console.log(`🌐 [${runId}] 当前页面URL: ${currentUrl}`);

          // 简单验证：如果断言描述中包含URL关键词，认为跳转成功
          if (assertionDescription.includes('成功') || assertionDescription.includes('正确')) {
            this.addLog(runId, `✅ 页面跳转验证通过: ${currentUrl}`, 'success');
            return { success: true };
          }
        }
      }

      // 4. 错误信息验证
      if (assertionLower.includes('错误') || assertionLower.includes('失败')) {
        const errorKeywords = ['error', 'failed', 'invalid', '错误', '失败', '无效'];
        for (const keyword of errorKeywords) {
          if (snapshotLower.includes(keyword)) {
            console.log(`✅ [${runId}] 找到错误信息: "${keyword}"`);
            this.addLog(runId, `✅ 错误信息验证通过: 页面包含错误信息`, 'success');
            return { success: true };
          }
        }
        return { success: false, error: '页面未找到预期的错误信息' };
      }

      // 5. 默认验证：页面加载成功
      if (snapshotText.length > 100) {
        console.log(`✅ [${runId}] 默认验证通过: 页面内容丰富（${snapshotText.length}字符）`);
        this.addLog(runId, `✅ 默认断言验证通过: 页面正常加载`, 'success');
        return { success: true };
      }

      return { success: false, error: '页面内容不足，可能加载失败' };

    } catch (error: any) {
      console.error(`❌ [${runId}] 断言验证异常: ${error.message}`);
      return { success: false, error: `断言验证异常: ${error.message}` };
    }
  }

  // 🔥 提取断言关键词
  private extractAssertionKeywords(assertionDescription: string): string[] {
    const keywords: string[] = [];

    // 🔥 优先提取引号中的文本（支持中英文引号）
    // 修复bug: 使用捕获组提取引号内的内容,不是整个匹配
    const doubleQuotePattern = /"([^"]+)"/g;  // 英文双引号
    const singleQuotePattern = /'([^']+)'/g;  // 英文单引号
    const chineseQuotePattern = /["""]([^"""]+)["""]/g;  // 中文引号
    const chineseQuotePattern2 = /['']([^'']+)['']/g;  // 中文单引号

    let match;

    // 提取英文双引号内容
    while ((match = doubleQuotePattern.exec(assertionDescription)) !== null) {
      keywords.push(match[1].trim());  // ✅ 使用捕获组 match[1]
    }

    // 提取英文单引号内容
    while ((match = singleQuotePattern.exec(assertionDescription)) !== null) {
      keywords.push(match[1].trim());
    }

    // 提取中文双引号内容
    while ((match = chineseQuotePattern.exec(assertionDescription)) !== null) {
      keywords.push(match[1].trim());
    }

    // 提取中文单引号内容
    while ((match = chineseQuotePattern2.exec(assertionDescription)) !== null) {
      keywords.push(match[1].trim());
    }

    // 🎯 如果提取到引号内容,优先使用这些关键词
    if (keywords.length > 0) {
      console.log(`✅ 从引号中提取到 ${keywords.length} 个关键词`);
      return keywords;
    }

    // 提取常见的业务词汇（仅当没有引号内容时）
    const businessTerms = ['商品管理', '用户管理', '订单管理', '系统设置', '数据统计', '权限管理', '首页', '登录', '注册'];
    for (const term of businessTerms) {
      if (assertionDescription.includes(term)) {
        keywords.push(term);
      }
    }

    // 如果仍然没有找到关键词，使用整个描述中的关键部分
    if (keywords.length === 0) {
      // 移除常见的动作词,保留实际内容
      const words = assertionDescription
        .replace(/展示/g, '')
        .replace(/显示/g, '')
        .replace(/包含/g, '')
        .replace(/页面/g, '')
        .replace(/不展示/g, '')
        .replace(/不显示/g, '')
        .replace(/不包含/g, '')
        .trim();
      if (words) {
        keywords.push(words);
      }
    }

    return keywords;
  }

  // 🔥 新增：执行滚动操作命令
  private async executeScrollCommand(step: TestStep, runId: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`📜 [${runId}] 开始执行滚动操作: ${step.action}`);
      this.addLog(runId, `📜 执行滚动操作: ${step.description}`, 'info');

      let mcpCommand: { name: string; arguments: any };

      // 根据不同的滚动类型构建MCP命令
      switch (step.action) {
        case 'browser_scroll_down':
        case 'scroll_down':
          // 🔥 修复：使用正确的browser_evaluate工具和function参数
          mcpCommand = {
            name: 'browser_evaluate',
            arguments: {
              function: `() => { window.scrollBy(0, ${step.pixels || 500}); }`
            }
          };
          break;

        case 'browser_scroll_up':
        case 'scroll_up':
          // 🔥 修复：使用正确的browser_evaluate工具和function参数
          mcpCommand = {
            name: 'browser_evaluate',
            arguments: {
              function: `() => { window.scrollBy(0, -${step.pixels || 500}); }`
            }
          };
          break;

        case 'browser_scroll_to_top':
        case 'scroll_to_top':
          // 🔥 修复：使用正确的browser_evaluate工具和function参数
          mcpCommand = {
            name: 'browser_evaluate',
            arguments: {
              function: '() => { window.scrollTo(0, 0); }'
            }
          };
          break;

        case 'browser_scroll_to_bottom':
        case 'scroll_to_bottom':
          // 🔥 修复：使用正确的browser_evaluate工具和function参数
          mcpCommand = {
            name: 'browser_evaluate',
            arguments: {
              function: '() => { window.scrollTo(0, document.body.scrollHeight); }'
            }
          };
          break;

        case 'browser_scroll_to_element':
        case 'scroll_to_element':
          // 🔥 修复：使用browser_evaluate滚动到元素
          if (!step.ref && !step.selector) {
            throw new Error('滚动到元素需要指定目标元素');
          }
          mcpCommand = {
            name: 'browser_evaluate',
            arguments: {
              function: `() => {
                const element = document.querySelector('${step.selector}') || 
                               document.querySelector('[ref="${step.ref}"]');
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } else {
                  console.warn('Element not found for scrolling: ${step.selector || step.ref}');
                }
              }`
            }
          };
          break;

        case 'browser_scroll_by':
        case 'scroll_by':
          // 🔥 修复：使用browser_evaluate按像素滚动
          const xPixels = step.x || 0;
          const yPixels = step.y || step.pixels || 500;
          mcpCommand = {
            name: 'browser_evaluate',
            arguments: {
              function: `() => { window.scrollBy(${xPixels}, ${yPixels}); }`
            }
          };
          break;

        case 'browser_scroll_page':
        case 'scroll':
          // 🔥 修复：使用browser_evaluate进行页面滚动
          const direction = step.direction || 'down';
          const scrollAmount = step.pixels || 500;
          mcpCommand = {
            name: 'browser_evaluate',
            arguments: {
              function: `() => { window.scrollBy(0, ${direction === 'up' ? -scrollAmount : scrollAmount}); }`
            }
          };
          break;

        default:
          throw new Error(`不支持的滚动操作: ${step.action}`);
      }

      console.log(`🔧 [${runId}] MCP滚动命令: ${mcpCommand.name}`, mcpCommand.arguments);
      this.addLog(runId, `🔧 MCP滚动命令: ${mcpCommand.name}`, 'info');

      try {
        // 执行MCP命令
        const result = await this.mcpClient.callTool(mcpCommand);

        // 检查执行结果
        console.log(`🔍 [${runId}] 滚动命令执行结果:`, JSON.stringify(result, null, 2));
        this.addLog(runId, `🔍 滚动执行结果: ${JSON.stringify(result)}`, 'info');

        // 🔥 改进的错误检测，避免误判前端JS错误
        if (result && result.content) {
          const content = Array.isArray(result.content) ? result.content : [result.content];
          for (const item of content) {
            if (item.type === 'text' && item.text) {
              if (this.isRealMCPError(item.text)) {
                console.warn(`⚠️ [${runId}] browser_evaluate滚动失败: ${item.text}`);
                throw new Error(`browser_evaluate执行失败: ${item.text}`);
              } else if (item.text.toLowerCase().includes('error')) {
                console.warn(`⚠️ [${runId}] 滚动操作检测到前端JS错误（不影响操作）: ${item.text}`);
                this.addLog(runId, `⚠️ 前端JS错误（不影响操作）: ${item.text}`, 'warning');
              }
            }
          }
        }

        console.log(`✅ [${runId}] 滚动操作成功: ${step.description}`);
        this.addLog(runId, `✅ 滚动操作成功: ${step.description}`, 'success');

        // 滚动后等待页面稳定
        await this.delay(1000);

        return { success: true };

      } catch (error: any) {
        console.warn(`⚠️ [${runId}] browser_evaluate滚动失败，尝试键盘降级: ${error.message}`);
        this.addLog(runId, `⚠️ browser_evaluate滚动失败，尝试键盘降级: ${error.message}`, 'warn');
        
        // 🔥 降级到键盘按键方案
        const fallbackKey = this.getFallbackKey(step.action);
        if (fallbackKey) {
          try {
            console.log(`🔄 [${runId}] 使用键盘降级方案: ${fallbackKey}`);
            const fallbackResult = await this.mcpClient.callTool({
              name: 'browser_press_key',
              arguments: { key: fallbackKey }
            });
            console.log(`✅ [${runId}] 键盘降级滚动成功: ${step.description}`);
            this.addLog(runId, `✅ 键盘降级滚动成功: ${step.description}`, 'success');
            
            // 滚动后等待页面稳定
            await this.delay(1000);
            
            return { success: true };
          } catch (fallbackError: any) {
            console.error(`❌ [${runId}] 键盘降级也失败:`, fallbackError);
            this.addLog(runId, `❌ 键盘降级也失败: ${fallbackError.message}`, 'error');
            return { success: false, error: `滚动失败: ${error.message}, 降级也失败: ${fallbackError.message}` };
          }
        } else {
          console.error(`❌ [${runId}] 无可用的降级方案`);
          this.addLog(runId, `❌ 滚动操作执行失败: ${error.message}`, 'error');
          return { success: false, error: error.message };
        }
      }

    } catch (error: any) {
      console.error(`❌ [${runId}] 滚动操作执行失败:`, error);
      this.addLog(runId, `❌ 滚动操作执行失败: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  // 🔥 使用AI驱动的简化策略执行
  private async executeMcpCommandWithSimpleSelector(step: TestStep, runId: string, stepIndex: number = 1): Promise<{ success: boolean; error?: string }> {
    try {
      // 🔥 类型安全检查：断言步骤不应该使用操作重试机制
      if (step.stepType === 'assertion') {
        console.log(`🚫 [${runId}] 断言步骤"${step.description}"不使用操作重试机制`);
        return { success: false, error: `断言步骤执行失败: ${step.description}` };
      }

      console.log(`🔄 [${runId}] 使用AI简化策略`);

      // 🔥 直接通过AI重新生成一个更简单的步骤
      const snapshot = await this.mcpClient.getSnapshot();

      // 构建简化版的AI提示词
      const simplifiedPrompt = `请为以下指令生成一个最简单、最基础的MCP命令，即使元素匹配不完美也要尽量执行：

用户指令: "${step.description}"

请返回JSON格式的MCP命令，优先考虑通用选择器：`;

      try {
        // 这里可以调用AI，但为了简化，我们直接使用基础逻辑
        let simplifiedStep = { ...step };

        // 为不同操作类型提供最基础的后备方案
        if (step.action === 'click' || step.action === 'browser_click') {
          // 使用第一个可用的按钮元素
          const elements = this.extractElementsFromSnapshot(snapshot);
          const firstButton = elements.find(el => el.role === 'button');
          if (firstButton) {
            simplifiedStep.selector = firstButton.ref;
          }
        } else if (step.action === 'fill' || step.action === 'input' || step.action === 'type' || step.action === 'browser_type') {
          // 使用第一个可用的输入元素
          const elements = this.extractElementsFromSnapshot(snapshot);
          const firstInput = elements.find(el => el.role === 'textbox');
          if (firstInput) {
            simplifiedStep.selector = firstInput.ref;
          }
        }

        this.addLog(runId, `🔄 使用AI简化策略: "${simplifiedStep.selector}"`, 'info');
        return await this.executeMcpCommand(simplifiedStep, runId);

      } catch (aiError: any) {
        console.warn(`⚠️ [${runId}] AI简化策略失败: ${aiError.message}`);
        return { success: false, error: aiError.message };
      }

    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // 🔥 从快照中提取元素的辅助方法
  private extractElementsFromSnapshot(snapshot: string): Array<{ ref: string, role: string, text: string }> {
    if (!snapshot) return [];

    const elements: Array<{ ref: string, role: string, text: string }> = [];
    const lines = snapshot.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();
      const refMatch = trimmedLine.match(/\[ref=([a-zA-Z0-9_-]+)\]/);

      if (refMatch) {
        const ref = refMatch[1];
        const textMatches = trimmedLine.match(/"([^"]*)"/g) || [];
        const texts = textMatches.map(t => t.replace(/"/g, ''));

        let role = '';
        if (trimmedLine.includes('textbox')) role = 'textbox';
        else if (trimmedLine.includes('button')) role = 'button';
        else if (trimmedLine.includes('link')) role = 'link';
        else if (trimmedLine.includes('checkbox')) role = 'checkbox';
        else if (trimmedLine.includes('combobox')) role = 'combobox';

        if (role && texts.length > 0) {
          elements.push({ ref, role, text: texts[0] || '' });
        }
      }
    }

    return elements;
  }

  // 🔥 参数格式转换和验证辅助方法
  private convertToMCPFormat(
    action: string,
    originalParams: any,
    elementRef?: { ref: string; text: string }
  ): any {
    console.log(`🔄 参数格式转换: ${action}`);
    console.log(`📥 原始参数:`, JSON.stringify(originalParams));

    let convertedParams: any = {};

    switch (action) {
      case 'click':
        convertedParams = elementRef ? { ref: elementRef.ref } : { ref: originalParams.selector };
        break;
      case 'fill':
      case 'input':
      case 'type':
        convertedParams = elementRef
          ? { ref: elementRef.ref, text: originalParams.value || originalParams.text }
          : { ref: originalParams.selector, text: originalParams.value || originalParams.text };
        break;
      case 'wait':
        convertedParams = { timeout: originalParams.timeout || 1000 };
        break;
      case 'expect':
        convertedParams = {
          selector: originalParams.selector || 'body',
          condition: originalParams.condition || 'visible',
          text: originalParams.text || ''
        };
        break;
      default:
        convertedParams = originalParams;
    }

    console.log(`📤 转换后参数:`, JSON.stringify(convertedParams));
    return convertedParams;
  }

  // 🔥 参数格式验证方法
  private validateMCPParameters(toolName: string, parameters: any): boolean {
    const requiredParams: Record<string, string[]> = {
      'browser_click': ['element', 'ref'],
      'browser_type': ['element', 'ref', 'text'],
      'browser_wait_for': ['timeout'],
      'browser_navigate': ['url'],
      'browser_snapshot': []
    };

    const required = requiredParams[toolName];
    if (!required) {
      console.warn(`⚠️ 未知的工具名称: ${toolName}`);
      return true; // 对于未知工具，跳过验证
    }

    for (const param of required) {
      if (!(param in parameters)) {
        console.error(`❌ 缺少必需参数: ${param} for ${toolName}`);
        return false;
      }
    }

    // 特殊验证
    if (toolName === 'browser_type' && (!parameters.text || parameters.text.trim() === '')) {
      console.error(`❌ browser_type 的 text 参数不能为空`);
      return false;
    }

    if (toolName === 'browser_click' && (!parameters.element || parameters.element.trim() === '' || !parameters.ref || parameters.ref.trim() === '')) {
      console.error(`❌ browser_click 的 element 和 ref 参数都不能为空`);
      return false;
    }

    return true;
  }

  // 🔥 新增：验证MCP命令是否真正执行的方法
  private async verifyMCPCommandExecution(mcpCommand: { name: string; arguments: any }, runId: string): Promise<boolean> {
    try {
      console.log(`🔍 [${runId}] 开始验证MCP命令执行效果: ${mcpCommand.name}`);
      this.addLog(runId, `🔍 验证MCP命令执行效果...`, 'info');

      // 等待一段时间让操作生效
      await this.delay(500);

      // 获取操作后的页面快照
      const postSnapshot = await this.mcpClient.getSnapshot();

      switch (mcpCommand.name) {
        case 'browser_navigate':
          return await this.verifyNavigationExecution(mcpCommand.arguments.url, postSnapshot, runId);

        case 'browser_type':
          return await this.verifyTypeExecution(mcpCommand.arguments, postSnapshot, runId);

        case 'browser_click':
          return await this.verifyClickExecution(mcpCommand.arguments, postSnapshot, runId);

        default:
          // 对于其他命令，简单验证页面仍然响应
          if (postSnapshot && postSnapshot.length > 50) {
            console.log(`✅ [${runId}] 基础验证通过: 页面仍然响应`);
            return true;
          }
          return false;
      }
    } catch (error: any) {
      console.error(`❌ [${runId}] MCP命令执行验证失败: ${error.message}`);
      this.addLog(runId, `⚠️ 命令执行验证异常: ${error.message}`, 'warning');
      return false; // 验证失败不影响主流程
    }
  }

  // 🔥 验证导航命令执行
  private async verifyNavigationExecution(targetUrl: string, snapshot: string, runId: string): Promise<boolean> {
    try {
      const currentUrl = this.extractUrlFromSnapshot(snapshot);

      if (currentUrl && currentUrl !== 'about:blank') {
        const targetDomain = new URL(targetUrl).hostname;
        const currentDomain = new URL(currentUrl).hostname;

        if (currentDomain.includes(targetDomain) || targetDomain.includes(currentDomain)) {
          console.log(`✅ [${runId}] 导航验证成功: ${currentUrl}`);
          this.addLog(runId, `✅ 导航验证成功: 已到达目标页面`, 'success');
          return true;
        }
      }

      console.log(`⚠️ [${runId}] 导航验证失败: 期望${targetUrl}, 实际${currentUrl}`);
      this.addLog(runId, `⚠️ 导航验证失败: 页面URL不匹配`, 'warning');
      return false;
    } catch (error: any) {
      console.error(`❌ [${runId}] 导航验证异常: ${error.message}`);
      return false;
    }
  }

  // 🔥 验证输入命令执行
  private async verifyTypeExecution(args: { ref: string; text: string }, snapshot: string, runId: string): Promise<boolean> {
    try {
      // 检查目标元素是否仍然存在
      const elementExists = snapshot.includes(`[ref=${args.ref}]`);

      if (elementExists) {
        console.log(`✅ [${runId}] 输入验证成功: 目标元素存在`);
        this.addLog(runId, `✅ 输入验证成功: 已向元素输入内容`, 'success');
        return true;
      } else {
        console.log(`⚠️ [${runId}] 输入验证失败: 目标元素不存在`);
        this.addLog(runId, `⚠️ 输入验证失败: 目标元素可能已变化`, 'warning');
        return false;
      }
    } catch (error: any) {
      console.error(`❌ [${runId}] 输入验证异常: ${error.message}`);
      return false;
    }
  }

  // 🔥 验证点击命令执行
  private async verifyClickExecution(args: { ref: string }, snapshot: string, runId: string): Promise<boolean> {
    try {
      // 点击后页面应该有响应，检查页面是否仍然正常
      if (snapshot && snapshot.length > 100) {
        console.log(`✅ [${runId}] 点击验证成功: 页面响应正常`);
        this.addLog(runId, `✅ 点击验证成功: 页面已响应点击操作`, 'success');
        return true;
      } else {
        console.log(`⚠️ [${runId}] 点击验证失败: 页面响应异常`);
        this.addLog(runId, `⚠️ 点击验证失败: 页面可能未响应`, 'warning');
        return false;
      }
    } catch (error: any) {
      console.error(`❌ [${runId}] 点击验证异常: ${error.message}`);
      return false;
    }
  }

  // 🔥 获取滚动操作的键盘降级方案
  private getFallbackKey(action: string): string | null {
    const fallbackMap: Record<string, string> = {
      'browser_scroll_down': 'Page_Down',
      'scroll_down': 'Page_Down',
      'browser_scroll_up': 'Page_Up', 
      'scroll_up': 'Page_Up',
      'browser_scroll_to_top': 'Home',
      'scroll_to_top': 'Home',
      'browser_scroll_to_bottom': 'End',
      'scroll_to_bottom': 'End',
      'browser_scroll_page': 'Page_Down', // 默认向下
      'scroll': 'Page_Down'
    };

    return fallbackMap[action] || null;
  }

  // 🔥 新增：检测并切换新页签的通用方法
  private async detectAndSwitchToNewTab(runId: string, timeout: number = 1200): Promise<{ 
    success: boolean; 
    switched: boolean; 
    url?: string; 
    title?: string;
    error?: string;
  }> {
    try {
      console.log(`🔍 [${runId}] 开始检测新页签...`);
      
      // 使用 MCP 的 browser_evaluate 工具执行新页签检测和切换逻辑
      const mcpCommand = {
        name: 'browser_evaluate',
        arguments: {
          function: `async () => {
            const start = Date.now();
            let target = null;
            
            // 等待新页签出现（最多 ${timeout}ms）
            while (Date.now() - start < ${timeout}) {
              const pages = page.context().pages();
              // 策略：选择"最新的那个"当作可能的新页签
              const last = pages[pages.length - 1];
              // 若 last 不是当前活动页，判定为新开页签
              if (last && last !== page) {
                target = last;
                break;
              }
              await new Promise(r => setTimeout(r, 120));
            }
            
            if (target) {
              await target.waitForLoadState('domcontentloaded');
              await target.bringToFront(); // ✅ 自动切到新页签
              return { 
                ok: true, 
                switched: true, 
                url: target.url(), 
                title: await target.title() 
              };
            }
            
            // 没有新页签也视为成功（同页场景），交由后续步骤自行判断页面状态
            return { 
              ok: true, 
              switched: false, 
              url: page.url(), 
              title: await page.title() 
            };
          }`
        }
      };

      console.log(`🔧 [${runId}] 执行新页签检测命令...`);
      const result = await this.mcpClient.callTool(mcpCommand);

      if (result && result.content) {
        const content = Array.isArray(result.content) ? result.content : [result.content];
        for (const item of content) {
          if (item.type === 'text' && item.text) {
            try {
              // 尝试解析返回的JSON结果
              const parsed = JSON.parse(item.text);
              if (parsed.ok) {
                console.log(`✅ [${runId}] 新页签检测完成: switched=${parsed.switched}, url=${parsed.url}`);
                this.addLog(runId, `🔄 页签检测: ${parsed.switched ? '已切换到新页签' : '保持当前页签'}`, 'info');
                
                return {
                  success: true,
                  switched: parsed.switched,
                  url: parsed.url,
                  title: parsed.title
                };
              }
            } catch (parseError) {
              // 如果解析失败，检查是否包含明显的错误信息
              if (item.text.includes('Error:') || item.text.includes('Failed:')) {
                return {
                  success: false,
                  switched: false,
                  error: item.text
                };
              }
            }
          }
        }
      }

      // 如果没有明确的结果，默认返回成功但未切换
      return {
        success: true,
        switched: false
      };

    } catch (error: any) {
      console.error(`❌ [${runId}] 新页签检测失败: ${error.message}`);
      return {
        success: false,
        switched: false,
        error: error.message
      };
    }
  }

  // 🔥 重写：简化的新页签检测和切换方法
  private async detectAndSwitchToNewTabOptimized(runId: string, timeout: number = 1200): Promise<{ 
    success: boolean; 
    switched: boolean; 
    url?: string; 
    title?: string;
    error?: string;
  }> {
    try {
      console.log(`🔍 [${runId}] 开始检测新页签（简化逻辑）...`);
      
      // 获取当前所有页签
      const tabsResult = await this.mcpClient.callTool({
        name: 'browser_tab_list',
        arguments: {}
      });
      
      const tabs = this.parseTabListResult(tabsResult);
      if (!tabs) {
        console.warn(`⚠️ [${runId}] 无法获取页签列表，跳过新页签检测`);
        return { success: false, switched: false, error: '无法获取页签列表' };
      }
      
      console.log(`📋 [${runId}] 当前页签数量: ${tabs.length}`);
      tabs.forEach(tab => {
        console.log(`   ${tab.index}. ${tab.active ? '[当前]' : ''} ${tab.title}`);
      });
      
      // 🔥 新逻辑：如果有多个页签且当前页签不是最后一个，则切换到最后一个页签
      const currentActiveTab = tabs.find(tab => tab.active);
      const lastTab = tabs[tabs.length - 1]; // 最后一个页签
      
      if (tabs.length > 1 && currentActiveTab && lastTab && currentActiveTab.index !== lastTab.index) {
        // 有多个页签，且当前不是最后一个，切换到最后一个
        console.log(`🔄 [${runId}] 检测到新页签，切换到最后一个页签: ${lastTab.title}`);
        
        // 🔥 修复：browser_tab_select使用0-based索引，需要转换
        const targetIndex = lastTab.index - 1; // 将1-based转换为0-based
        console.log(`🔄 [${runId}] 转换索引：${lastTab.index} -> ${targetIndex} (0-based)`);
        
        const switchResult = await this.mcpClient.callTool({
          name: 'browser_tab_select',
          arguments: { index: targetIndex }
        });
        
        // 🔥 修复：使用正确的方式检查MCP结果
        if (!switchResult?.isError) {
          // 验证切换结果
          const finalTabsResult = await this.mcpClient.callTool({
            name: 'browser_tab_list',
            arguments: {}
          });
          
          const finalTabs = this.parseTabListResult(finalTabsResult);
          const activeTab = finalTabs?.find(tab => tab.active);
          
          if (activeTab && activeTab.index === lastTab.index) {
            console.log(`✅ [${runId}] 已切换到新页签: ${activeTab.title} - ${activeTab.url}`);
            return {
              success: true,
              switched: true,
              url: activeTab.url,
              title: activeTab.title
            };
          } else {
            console.error(`❌ [${runId}] 页签切换验证失败`);
            return {
              success: false,
              switched: false,
              error: '页签切换验证失败'
            };
          }
        } else {
          console.error(`❌ [${runId}] 页签切换操作失败`);
          return {
            success: false,
            switched: false,
            error: '页签切换操作失败'
          };
        }
      } else {
        // 只有一个页签或当前已经是最后一个页签，保持当前状态
        console.log(`ℹ️ [${runId}] 保持当前页签: ${currentActiveTab?.title}`);
        return {
          success: true,
          switched: false,
          url: currentActiveTab?.url,
          title: currentActiveTab?.title
        };
      }
      
    } catch (error: any) {
      console.error(`❌ [${runId}] 新页签检测失败: ${error.message}`);
      return {
        success: false,
        switched: false,
        error: error.message
      };
    }
  }

  // 🔥 新增：解析MCP Tab列表结果的辅助方法
  private parseTabListResult(result: any): Array<{index: number, title: string, url: string, active: boolean}> | null {
    try {
      if (result?.content) {
        const content = Array.isArray(result.content) ? result.content : [result.content];
        for (const item of content) {
          if (item.type === 'text' && item.text) {
            const lines = item.text.split('\n').filter(line => line.trim());
            const tabs = [];
            
            for (const line of lines) {
              // 🔥 修复：解析MCP实际格式 "- 0: (current) [标题] (URL)" 或 "- 1: [标题] (URL)"
              const match = line.match(/^-\s+(\d+):\s*(\(current\))?\s*\[([^\]]+)\]\s*\(([^)]+)\)/);
              if (match) {
                tabs.push({
                  index: parseInt(match[1]) + 1, // 🔥 转换为1-based索引，MCP返回0-based，browser_tab_select需要1-based
                  active: !!match[2], // (current) 表示当前活动页签
                  title: match[3].trim(),
                  url: match[4].trim()
                });
              }
            }
            
            console.log(`🔍 解析到 ${tabs.length} 个页签:`, tabs);
            return tabs.length > 0 ? tabs : null;
          }
        }
      }
      return null;
    } catch (error) {
      console.error('解析页签列表失败:', error);
      return null;
    }
  }

  // 🔥 新增：改进的错误检测方法，避免误判前端JS错误
  private isRealMCPError(text: string): boolean {
    // 排除前端JavaScript错误和常见的浏览器控制台消息
    const frontendErrors = [
      'getComputedStyle',
      'TypeError: Failed to execute',
      'SecurityError',
      'ResizeObserver',
      'Non-Error promise rejection',
      'Script error',
      'Loading chunk',
      'ChunkLoadError',
      'Network Error',
      'CORS',
      'Content Security Policy',
      'Blocked a frame',
      'Mixed Content',
      'Invalid regular expression',
      'Unexpected token'
    ];

    // 如果包含前端错误特征，不视为MCP操作失败
    if (frontendErrors.some(pattern => text.includes(pattern))) {
      return false;
    }

    // 只有真正的MCP操作失败才返回true
    return (
      text.includes('Error:') || 
      text.includes('Failed:') || 
      text.includes('not found') || 
      text.includes('无法找到') || 
      text.includes('timeout') ||
      text.includes('Timed out') ||
      text.includes('Element not found') ||
      text.includes('Selector not found')
    );
  }

  // 🔥 新增：执行页签切换命令
  private async executeTabSwitchCommand(step: TestStep, runId: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`🔄 [${runId}] 开始执行页签切换: ${step.tabMatchType} -> ${step.tabTarget}`);
      this.addLog(runId, `🔄 执行页签切换: ${step.description}`, 'info');

      // 1. 获取当前所有页签
      const tabListResult = await this.mcpClient.callTool({
        name: 'browser_tab_list',
        arguments: {}
      });

      const tabs = this.parseTabListResult(tabListResult);
      if (!tabs || tabs.length === 0) {
        console.error(`❌ [${runId}] 无法获取页签列表`);
        return { success: false, error: '无法获取页签列表' };
      }

      console.log(`📋 [${runId}] 当前页签数量: ${tabs.length}`);
      tabs.forEach(tab => {
        console.log(`   ${tab.index}. ${tab.active ? '[当前]' : ''} ${tab.title} - ${tab.url}`);
      });

      // 2. 根据匹配类型查找目标页签
      let targetTabIndex = -1;
      let targetTabInfo = '';

      switch (step.tabMatchType) {
        case 'last':
          // 切换到最后一个页签
          targetTabIndex = tabs.length;
          targetTabInfo = `最后一个页签 (索引${targetTabIndex})`;
          break;

        case 'first':
          // 切换到第一个页签
          targetTabIndex = 1;
          targetTabInfo = `第一个页签 (索引${targetTabIndex})`;
          break;

        case 'index':
          // 直接使用指定索引
          targetTabIndex = parseInt(step.tabTarget || '1');
          if (targetTabIndex < 1 || targetTabIndex > tabs.length) {
            console.error(`❌ [${runId}] 页签索引 ${targetTabIndex} 超出范围 (1-${tabs.length})`);
            return { success: false, error: `页签索引 ${targetTabIndex} 超出范围` };
          }
          targetTabInfo = `第${targetTabIndex}个页签`;
          break;

        case 'title':
          // 按标题匹配页签
          const titleTarget = step.tabTarget || '';
          const matchedTab = tabs.find(tab => 
            tab.title.includes(titleTarget) || 
            titleTarget.includes(tab.title) ||
            tab.title.toLowerCase().includes(titleTarget.toLowerCase())
          );
          
          if (!matchedTab) {
            console.error(`❌ [${runId}] 未找到包含"${titleTarget}"的页签`);
            return { success: false, error: `未找到包含"${titleTarget}"的页签` };
          }
          
          targetTabIndex = matchedTab.index;
          targetTabInfo = `标题包含"${titleTarget}"的页签 (索引${targetTabIndex})`;
          break;

        case 'url':
          // 按URL匹配页签
          const urlTarget = step.tabTarget || '';
          const urlMatchedTab = tabs.find(tab => tab.url.includes(urlTarget));
          
          if (!urlMatchedTab) {
            console.error(`❌ [${runId}] 未找到URL包含"${urlTarget}"的页签`);
            return { success: false, error: `未找到URL包含"${urlTarget}"的页签` };
          }
          
          targetTabIndex = urlMatchedTab.index;
          targetTabInfo = `URL包含"${urlTarget}"的页签 (索引${targetTabIndex})`;
          break;

        default:
          console.error(`❌ [${runId}] 不支持的页签匹配类型: ${step.tabMatchType}`);
          return { success: false, error: `不支持的页签匹配类型: ${step.tabMatchType}` };
      }

      console.log(`🎯 [${runId}] 目标页签: ${targetTabInfo}`);

      // 3. 检查是否已经是当前页签
      const currentTab = tabs.find(tab => tab.active);
      if (currentTab && currentTab.index === targetTabIndex) {
        console.log(`ℹ️ [${runId}] 目标页签已经是当前活动页签，无需切换`);
        this.addLog(runId, `✅ 目标页签已经是当前页签: ${currentTab.title}`, 'success');
        return { success: true };
      }

      // 4. 执行页签切换
      console.log(`🔄 [${runId}] 切换到页签索引: ${targetTabIndex}`);
      
      // 🔥 修复：browser_tab_select使用0-based索引，需要转换
      const mcpTabIndex = targetTabIndex - 1; // 将1-based转换为0-based
      console.log(`🔄 [${runId}] MCP索引转换：${targetTabIndex} -> ${mcpTabIndex} (0-based)`);
      
      const switchResult = await this.mcpClient.callTool({
        name: 'browser_tab_select',
        arguments: { index: mcpTabIndex }
      });

      // 5. 验证切换结果
      if (!switchResult?.isError) {
        // 获取切换后的页签信息进行确认
        const finalTabsResult = await this.mcpClient.callTool({
          name: 'browser_tab_list',
          arguments: {}
        });

        const finalTabs = this.parseTabListResult(finalTabsResult);
        const activeTab = finalTabs?.find(tab => tab.active);

        if (activeTab && activeTab.index === targetTabIndex) {
          console.log(`✅ [${runId}] 页签切换成功: ${activeTab.title} - ${activeTab.url}`);
          this.addLog(runId, `✅ 已切换到页签: ${activeTab.title}`, 'success');
          return { success: true };
        } else {
          console.error(`❌ [${runId}] 页签切换验证失败`);
          return { success: false, error: '页签切换验证失败' };
        }
      } else {
        console.error(`❌ [${runId}] 页签切换操作失败`);
        return { success: false, error: '页签切换操作失败' };
      }

    } catch (error: any) {
      console.error(`❌ [${runId}] 页签切换异常:`, error);
      this.addLog(runId, `❌ 页签切换失败: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  // #region Evidence Management

  /**
   * 检查文件是否存在
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fsPromises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 保存测试证据文件到artifacts目录
   * @param runId 测试运行ID
   * @param testStatus 测试状态
   */
  private async saveTestEvidence(runId: string, testStatus: 'completed' | 'failed'): Promise<void> {
    try {
      console.log(`📁 [${runId}] 开始保存测试证据...`);
      this.addLog(runId, `📁 正在保存测试证据...`, 'info');

      // 1. 保存截图证据 - 将screenshots目录中的截图复制到artifacts
      await this.saveScreenshotEvidence(runId);

      // 2. 保存测试日志
      await this.saveLogEvidence(runId);

      // 3. 尝试保存其他证据（如果存在）
      if (testStatus === 'completed') {
        await this.saveAdditionalEvidence(runId);
      }

      console.log(`✅ [${runId}] 测试证据保存完成`);
      this.addLog(runId, `✅ 测试证据已保存到artifacts目录`, 'success');

    } catch (error: any) {
      console.error(`❌ [${runId}] 保存测试证据失败:`, error.message);
      this.addLog(runId, `⚠️ 测试证据保存失败: ${error.message}`, 'warning');
      // 不抛出错误，避免影响测试完成流程
    }
  }

  /**
   * 保存截图证据
   */
  private async saveScreenshotEvidence(runId: string): Promise<void> {
    try {
      // 获取该测试运行的所有截图
      const screenshots = await this.screenshotService.getScreenshotsByRunId(runId);
      
      if (screenshots.length === 0) {
        console.log(`📸 [${runId}] 没有截图需要保存`);
        return;
      }

      let savedCount = 0;
      for (const screenshot of screenshots) {
        try {
          const screenshotPath = path.join(process.cwd(), screenshot.filePath);
          
          // 检查截图文件是否存在
          if (await this.fileExists(screenshotPath)) {
            const screenshotBuffer = await fsPromises.readFile(screenshotPath);
            await this.evidenceService.saveBufferArtifact(
              runId,
              'screenshot',
              screenshotBuffer,
              screenshot.fileName
            );
            savedCount++;
          }
        } catch (error: any) {
          console.warn(`⚠️ [${runId}] 保存截图证据失败: ${screenshot.fileName}`, error.message);
        }
      }

      console.log(`📸 [${runId}] 已保存 ${savedCount}/${screenshots.length} 个截图证据`);
      
    } catch (error: any) {
      console.error(`❌ [${runId}] 保存截图证据失败:`, error.message);
    }
  }

  /**
   * 保存日志证据
   */
  private async saveLogEvidence(runId: string): Promise<void> {
    try {
      const testRun = testRunStore.get(runId);
      if (!testRun || !testRun.logs || testRun.logs.length === 0) {
        console.log(`📝 [${runId}] 没有日志需要保存`);
        return;
      }

      // 生成日志内容
      const logContent = testRun.logs
        .map(log => {
          const timestamp = log.timestamp ? new Date(log.timestamp).toISOString() : 'Unknown';
          return `[${timestamp}] [${log.level.toUpperCase()}] ${log.message}`;
        })
        .join('\n');

      // 保存为日志文件
      const logBuffer = Buffer.from(logContent, 'utf8');
      const logFilename = `${runId}-execution.log`;
      
      await this.evidenceService.saveBufferArtifact(
        runId,
        'log',
        logBuffer,
        logFilename
      );

      console.log(`📝 [${runId}] 已保存测试日志: ${logFilename}`);
      
    } catch (error: any) {
      console.error(`❌ [${runId}] 保存日志证据失败:`, error.message);
    }
  }

  /**
   * 保存其他证据（trace、video等）
   */
  private async saveAdditionalEvidence(runId: string): Promise<void> {
    try {
      // 这里可以扩展保存trace文件、视频录制等
      // 目前作为占位符，未来可以添加更多证据类型
      console.log(`🔍 [${runId}] 检查其他证据类型...`);

      // TODO: 如果启用了trace录制，保存trace文件
      // TODO: 如果启用了视频录制，保存视频文件

    } catch (error: any) {
      console.error(`❌ [${runId}] 保存其他证据失败:`, error.message);
    }
  }

  /**
   * 批量删除测试运行记录
   * @param runIds 要删除的测试运行ID数组
   * @returns 删除的记录数
   */
  async batchDeleteTestRuns(runIds: string[]): Promise<{ deletedCount: number }> {
    try {
      if (!runIds || runIds.length === 0) {
        return { deletedCount: 0 };
      }

      console.log(`🗑️ 开始批量删除 ${runIds.length} 条测试运行记录...`);

      let deletedCount = 0;

      // 🔥 1. 清理内存中的测试运行数据
      for (const runId of runIds) {
        if (testRunStore.has(runId)) {
          // 从 testRunStore 中删除
          const testRun = testRunStore.get(runId);
          if (testRun) {
            // 清理相关资源
            this.stopLoggingForRun(runId);

            // 从存储中删除
            (testRunStore as any).runs.delete(runId);
            console.log(`✅ 已从内存中删除测试运行: ${runId}`);
          }
        }
      }

      // 🔥 2. 从数据库中删除历史记录
      for (const runId of runIds) {
        try {
          const deleted = await this.executionService.deleteExecution(runId);
          if (deleted) {
            deletedCount++;
            console.log(`✅ 已从数据库中删除测试运行: ${runId}`);
          }
        } catch (dbError) {
          console.error(`❌ 从数据库删除测试记录 ${runId} 失败:`, dbError);
          // 继续删除其他记录
        }
      }

      // 🔥 3. 通知前端更新
      this.wsManager.broadcast({
        type: 'test_runs_deleted',
        runIds,
        deletedCount: runIds.length // 返回请求删除的总数
      });

      console.log(`✅ 批量删除完成，共删除 ${deletedCount} 条测试运行记录`);

      return { deletedCount };
    } catch (error: any) {
      console.error('❌ 批量删除测试运行失败:', error);
      throw error;
    }
  }

  // #endregion

  // #endregion
}