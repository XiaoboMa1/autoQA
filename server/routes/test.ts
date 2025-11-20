import { Router, Request, Response } from 'express';
import { TestExecutionService } from '../services/testExecution.js';

export function testRoutes(testExecutionService: TestExecutionService): Router {
  const router = Router();

  // 获取所有测试用例（支持分页和过滤）
  router.get('/cases', async (req: Request, res: Response) => {
    try {
      const {
        page = '1',
        pageSize = '10',
        search = '',
        tag = '',
        priority = '',
        status = '',
        system = ''
      } = req.query;

      const pageNum = parseInt(page as string);
      const sizePer = parseInt(pageSize as string);

      // 🔥 获取当前用户信息（从认证中间件）
      const userDepartment = req.user?.department || undefined;
      const isSuperAdmin = req.user?.isSuperAdmin || false;

      console.log('🔍 获取测试用例 - 用户部门:', userDepartment, '超级管理员:', isSuperAdmin);

      // 获取过滤后的测试用例
      const result = await testExecutionService.getTestCasesPaginated({
        page: pageNum,
        pageSize: sizePer,
        search: search as string,
        tag: tag as string,
        priority: priority as string,
        status: status as string,
        system: system as string,
        userDepartment,
        isSuperAdmin
      });

      res.json({
        success: true,
        data: result.data,
        pagination: {
          page: pageNum,
          pageSize: sizePer,
          total: result.total,
          totalPages: Math.ceil(result.total / sizePer)
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // 执行测试用例
  router.post('/execute', async (req: Request, res: Response) => {
    try {
      const { testCaseId, environment = 'staging' } = req.body;

      if (!testCaseId) {
        return res.status(400).json({
          success: false,
          error: '缺少 testCaseId 参数'
        });
      }

      const runId = await testExecutionService.runTest(testCaseId, environment);

      res.json({
        success: true,
        runId,
        message: '测试已开始执行'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // AI解析器配置管理
  router.post('/ai-parser/reload-config', async (req: Request, res: Response) => {
    try {
      await testExecutionService.reloadAIParserConfiguration();
      
      const status = testExecutionService.getAIParserStatus();
      
      res.json({
        success: true,
        message: 'AI解析器配置已重新加载',
        data: {
          modelInfo: status.modelInfo,
          isConfigManagerMode: status.isConfigManagerMode,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: `重新加载AI解析器配置失败: ${error.message}`
      });
    }
  });

  // 获取AI解析器状态
  router.get('/ai-parser/status', async (req: Request, res: Response) => {
    try {
      const status = testExecutionService.getAIParserStatus();
      
      res.json({
        success: true,
        data: {
          ...status,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: `获取AI解析器状态失败: ${error.message}`
      });
    }
  });

  // 🔥 添加：测试用例执行 - 兼容前端路径
  router.post('/cases/execute', async (req: Request, res: Response) => {
    try {
      const { caseId, testCaseId, environment = 'staging' } = req.body;
      const actualCaseId = caseId || testCaseId;

      if (!actualCaseId) {
        return res.status(400).json({
          success: false,
          error: '缺少 caseId 或 testCaseId 参数'
        });
      }

      const runId = await testExecutionService.runTest(actualCaseId, environment);

      res.json({
        success: true,
        runId,
        message: '测试已开始执行'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // 🔥 批量删除测试运行记录 - 必须在 /runs/:runId 之前
  router.post('/runs/batch-delete', async (req: Request, res: Response) => {
    try {
      const { runIds } = req.body;

      if (!runIds || !Array.isArray(runIds) || runIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: '缺少 runIds 参数或参数格式不正确'
        });
      }

      console.log(`🗑️ 批量删除测试运行，数量: ${runIds.length}`);

      const result = await testExecutionService.batchDeleteTestRuns(runIds);

      res.json({
        success: true,
        data: result,
        message: `成功删除 ${result.deletedCount} 条测试运行记录`
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // 获取测试运行状态
  router.get('/runs/:runId', async (req: Request, res: Response) => {
    try {
      const { runId } = req.params;
      const testRun = testExecutionService.getTestRun(runId);

      if (!testRun) {
        return res.status(404).json({
          success: false,
          error: '测试运行不存在'
        });
      }

      res.json({
        success: true,
        data: testRun
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // 获取所有测试运行（支持数据隔离）
  router.get('/runs', async (req: Request, res: Response) => {
    try {
      // 🔥 获取当前用户信息（从认证中间件）
      const userDepartment = req.user?.department || undefined;
      const userId = req.user?.id;
      const isSuperAdmin = req.user?.isSuperAdmin || false;

      // 从内存中获取正在运行或最近的测试
      const memoryRuns = testExecutionService.getAllTestRuns();

      // 🔥 从数据库获取历史测试记录（支持数据隔离）
      const executionService = (testExecutionService as any).executionService;
      const dbRuns = await executionService.getExecutions({
        executorUserId: !isSuperAdmin && userId ? parseInt(userId) : undefined,
        executorDepartment: !isSuperAdmin ? userDepartment : undefined,
        limit: 100
      });

      // 合并内存和数据库记录（去重，优先使用内存中的数据）
      const memoryRunIds = new Set(memoryRuns.map(r => r.id));
      const dbRunsFiltered = dbRuns.filter(r => !memoryRunIds.has(r.id));

      // 转换数据库记录到前端格式
      const dbRunsFormatted = dbRunsFiltered.map(dbRun => ({
        id: dbRun.id,
        testCaseId: dbRun.testCaseId,
        name: dbRun.testCaseTitle,
        status: dbRun.status,
        startTime: dbRun.startedAt || dbRun.queuedAt,
        endTime: dbRun.finishedAt,
        duration: dbRun.durationMs ? `${(dbRun.durationMs / 1000).toFixed(1)}s` : '0s',
        progress: dbRun.progress,
        totalSteps: dbRun.totalSteps,
        completedSteps: dbRun.completedSteps,
        passedSteps: dbRun.passedSteps,
        failedSteps: dbRun.failedSteps,
        executor: dbRun.executorUserId?.toString() || 'System',
        environment: dbRun.environment,
        logs: dbRun.executionLogs || [],
        screenshots: dbRun.screenshots || [],
        error: dbRun.errorMessage
      }));

      // 🚀 为内存中的测试运行补充测试用例名称和完整时间信息
      const enrichedMemoryRuns = await Promise.all(
        memoryRuns.map(async (run) => {
          try {
            // 获取测试用例详情
            const testCase = await testExecutionService.getTestCaseById(run.testCaseId);

            return {
              ...run,
              name: testCase?.name || `测试 #${run.testCaseId}`,
              // 确保时间字段存在
              startTime: run.startTime || run.queuedAt || new Date(),
              endTime: run.endTime || run.finishedAt,
              // 补充其他可能缺失的字段
              duration: run.duration || '0s',
              progress: run.progress || 0,
              totalSteps: run.totalSteps || 0,
              completedSteps: run.completedSteps || 0,
              passedSteps: run.passedSteps || 0,
              failedSteps: run.failedSteps || 0,
              executor: run.executor || 'System',
              screenshots: run.screenshots || []
            };
          } catch (error) {
            console.error(`获取测试用例 #${run.testCaseId} 详情失败:`, error);
            // 即使获取失败，也返回基本信息
            return {
              ...run,
              name: `测试 #${run.testCaseId}`,
              startTime: run.startTime || run.queuedAt || new Date(),
              endTime: run.endTime || run.finishedAt,
              duration: run.duration || '0s',
              progress: run.progress || 0,
              totalSteps: run.totalSteps || 0,
              completedSteps: run.completedSteps || 0,
              passedSteps: run.passedSteps || 0,
              failedSteps: run.failedSteps || 0,
              executor: run.executor || 'System',
              screenshots: run.screenshots || []
            };
          }
        })
      );

      // 合并并按时间倒序排序
      const allRuns = [...enrichedMemoryRuns, ...dbRunsFormatted].sort((a, b) => {
        const timeA = (a.startTime || a.queuedAt || new Date()).getTime();
        const timeB = (b.startTime || b.queuedAt || new Date()).getTime();
        return timeB - timeA;
      });

      res.json({
        success: true,
        data: allRuns,
        meta: {
          memoryCount: enrichedMemoryRuns.length,
          dbCount: dbRunsFormatted.length,
          total: allRuns.length
        }
      });
    } catch (error) {
      console.error('获取测试运行列表失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // 取消测试执行
  router.post('/runs/:runId/cancel', async (req: Request, res: Response) => {
    try {
      const { runId } = req.params;
      const success = await testExecutionService.cancelTest(runId);

      if (!success) {
        return res.status(400).json({
          success: false,
          error: '无法取消测试，测试可能已完成或不存在'
        });
      }

      res.json({
        success: true,
        message: '测试已取消'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // 🔥 更新：创建测试用例API
  router.post('/cases', async (req: Request, res: Response) => {
    try {
      // The body now aligns with the conceptual TestCase interface
      const testCaseData = req.body;

      if (!testCaseData.name || !testCaseData.steps) {
        return res.status(400).json({
          success: false,
          error: '缺少必要参数：name 和 steps'
        });
      }

      const newTestCase = await testExecutionService.addTestCase(testCaseData);

      console.log('✅ 测试用例创建成功:', newTestCase);

      res.json({
        success: true,
        data: newTestCase,
        message: '测试用例创建成功'
      });
    } catch (error: any) {
      console.error('❌ 创建测试用例失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // 🔥 新增：根据ID获取单个测试用例
  router.get('/cases/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // 使用 testExecutionService 获取测试用例
      const testCase = await testExecutionService.getTestCaseById(parseInt(id));

      if (!testCase) {
        return res.status(404).json({
          success: false,
          error: '测试用例不存在',
        });
      }

      res.json(testCase);
    } catch (error: any) {
      console.error('获取测试用例失败:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // 🔥 更新：更新测试用例API
  router.put('/cases/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const testCaseData = req.body;

      const updatedTestCase = await testExecutionService.updateTestCase(parseInt(id), testCaseData);

      if (!updatedTestCase) {
        return res.status(404).json({
          success: false,
          error: '测试用例不存在或更新失败'
        });
      }

      res.json({
        success: true,
        data: updatedTestCase,
        message: '测试用例更新成功'
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // 🔥 更新：删除测试用例API
  router.delete('/cases/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const success = await testExecutionService.deleteTestCase(parseInt(id));

      if (!success) {
        return res.status(404).json({
          success: false,
          error: '测试用例不存在'
        });
      }

      res.json({
        success: true,
        message: '测试用例删除成功'
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
} 