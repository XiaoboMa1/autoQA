import { Router, Request, Response } from 'express';
import { SuiteExecutionService } from '../services/suiteExecution.js';

export function suiteRoutes(suiteExecutionService: SuiteExecutionService): Router {
  const router = Router();

  // 获取所有测试套件
  router.get('/', async (req: Request, res: Response) => {
    try {
      // 🔥 获取当前用户信息（从认证中间件）
      const userProject = req.user?.project || undefined;
      const isSuperAdmin = req.user?.isSuperAdmin || false;

      console.log('🔍 获取测试套件 - 用户项目:', userProject, '超级管理员:', isSuperAdmin);

      const suites = await suiteExecutionService.getAllTestSuites(userProject, isSuperAdmin);
      res.json({ success: true, data: suites });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 创建测试套件
  router.post('/', async (req: Request, res: Response) => {
    try {
      const newSuite = await suiteExecutionService.createTestSuite(req.body);
      res.json({ success: true, data: newSuite });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 更新测试套件
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const updatedSuite = await suiteExecutionService.updateTestSuite(parseInt(req.params.id), req.body);
      if (updatedSuite) {
        res.json({ success: true, data: updatedSuite });
      } else {
        res.status(404).json({ success: false, error: 'Suite not found' });
      }
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 删除测试套件
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const success = await suiteExecutionService.deleteTestSuite(parseInt(req.params.id));
      if (success) {
        res.json({ success: true });
      } else {
        res.status(404).json({ success: false, error: 'Suite not found' });
      }
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 执行测试套件
  router.post('/execute', async (req: Request, res: Response) => {
    try {
      const { suiteId, environment, executionMode, concurrency, continueOnFailure } = req.body;
      
      // 构造执行选项对象
      const options = {
        environment,
        executionMode,
        concurrency,
        continueOnFailure
      };
      
      const runId = await suiteExecutionService.runSuite(suiteId, options);
      res.json({ success: true, runId });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 🔥 新增: 获取所有测试套件运行
  router.get('/runs', async (req: Request, res: Response) => {
    try {
      // 从数据库获取测试运行记录
      const runningSuites = suiteExecutionService.getAllRunningSuites();
      res.json({ success: true, data: runningSuites });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 🔥 新增: 获取特定测试运行的详情
  router.get('/runs/:runId', async (req: Request, res: Response) => {
    try {
      const runId = req.params.runId;
      const suiteRun = suiteExecutionService.getSuiteRun(runId);
      
      if (suiteRun) {
        res.json({ success: true, data: suiteRun });
      } else {
        res.status(404).json({ success: false, error: '找不到指定的测试运行记录' });
      }
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  // 🔥 新增: 取消测试套件运行
  router.post('/runs/:runId/cancel', async (req: Request, res: Response) => {
    try {
      const success = await suiteExecutionService.cancelSuite(req.params.runId);
      if (success) {
        res.json({ success: true });
      } else {
        res.status(404).json({ success: false, error: '找不到指定的测试运行或者该测试已完成' });
      }
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
} 