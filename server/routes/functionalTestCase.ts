import { Router, Request, Response } from 'express';
import { functionalTestCaseService } from '../services/functionalTestCaseService.js';

/**
 * 功能测试用例CRUD路由
 */
export function createFunctionalTestCaseRoutes(): Router {
  const router = Router();

  /**
   * GET /api/v1/functional-test-cases
   * 获取功能测试用例列表（分页）
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const {
        page = '1',
        pageSize = '10',
        search,
        tag,
        priority,
        status,
        system,
        module,
        source
      } = req.query;

      // 获取用户信息（用于数据隔离）
      const userDepartment = req.user?.department;
      const isSuperAdmin = req.user?.isSuperAdmin || false;

      console.log(`📋 查询功能测试用例列表 - 页码: ${page}, 用户部门: ${userDepartment}`);

      const result = await functionalTestCaseService.getList({
        page: parseInt(page as string),
        pageSize: parseInt(pageSize as string),
        search: search as string,
        tag: tag as string,
        priority: priority as string,
        status: status as string,
        system: system as string,
        module: module as string,
        source: source as string,
        userDepartment,
        isSuperAdmin
      });

      res.json({
        success: true,
        data: result.data,
        pagination: {
          page: parseInt(page as string),
          pageSize: parseInt(pageSize as string),
          total: result.total,
          totalPages: Math.ceil(result.total / parseInt(pageSize as string))
        }
      });
    } catch (error: any) {
      console.error('❌ 查询列表失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/v1/functional-test-cases/flat
   * 获取功能测试用例平铺列表（以测试点为维度展示）
   */
  router.get('/flat', async (req: Request, res: Response) => {
    try {
      const {
        page = '1',
        pageSize = '20',
        search,
        tag,
        priority,
        status,
        system,
        module,
        source,
        sectionName,
        createdBy,
        startDate,
        endDate,
        riskLevel
      } = req.query;

      // 获取用户信息（用于数据隔离）
      const userDepartment = req.user?.department;
      const isSuperAdmin = req.user?.isSuperAdmin || false;

      console.log(`📋 查询功能测试用例平铺列表 - 页码: ${page}, 用户部门: ${userDepartment}`);

      const result = await functionalTestCaseService.getFlatList({
        page: parseInt(page as string),
        pageSize: parseInt(pageSize as string),
        search: search as string,
        tag: tag as string,
        priority: priority as string,
        status: status as string,
        system: system as string,
        module: module as string,
        source: source as string,
        sectionName: sectionName as string,
        createdBy: createdBy as string,
        startDate: startDate as string,
        endDate: endDate as string,
        riskLevel: riskLevel as string,
        userDepartment,
        isSuperAdmin
      });

      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    } catch (error: any) {
      console.error('❌ 查询平铺列表失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/v1/functional-test-cases/batch-save
   * 批量保存测试用例
   */
  router.post('/batch-save', async (req: Request, res: Response) => {
    try {
      const { testCases, aiSessionId } = req.body;

      if (!testCases || !Array.isArray(testCases) || testCases.length === 0) {
        return res.status(400).json({
          success: false,
          error: '测试用例列表不能为空'
        });
      }

      if (!aiSessionId) {
        return res.status(400).json({
          success: false,
          error: '缺少会话ID'
        });
      }

      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: '未授权'
        });
      }

      console.log(`💾 批量保存 ${testCases.length} 个功能测试用例`);

      const result = await functionalTestCaseService.batchSave({
        testCases,
        aiSessionId,
        userId: req.user.id
      });

      res.json({
        success: true,
        data: result,
        message: `成功保存 ${result.count} 个测试用例`
      });
    } catch (error: any) {
      console.error('❌ 批量保存失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/v1/functional-test-cases/batch-delete
   * 批量删除测试点
   */
  router.post('/batch-delete', async (req: Request, res: Response) => {
    try {
      const { testPointIds } = req.body;

      if (!testPointIds || !Array.isArray(testPointIds) || testPointIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: '测试点ID列表不能为空'
        });
      }

      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: '未授权'
        });
      }

      console.log(`🗑️ 批量删除 ${testPointIds.length} 个测试点`);

      const result = await functionalTestCaseService.batchDeleteTestPoints(testPointIds);

      res.json({
        success: true,
        data: result,
        message: `成功删除 ${result.deletedCount} 个测试点`
      });
    } catch (error: any) {
      console.error('❌ 批量删除失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/v1/functional-test-cases
   * 手动创建测试用例（含测试点）
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const {
        name,
        description,
        system,
        module,
        priority,
        status,
        testType,
        tags,
        preconditions,
        testData,
        sectionName,
        coverageAreas,
        testPoints
      } = req.body;

      // 验证必填字段
      if (!name || !name.trim()) {
        return res.status(400).json({
          success: false,
          error: '测试用例名称不能为空'
        });
      }

      if (!testPoints || !Array.isArray(testPoints) || testPoints.length === 0) {
        return res.status(400).json({
          success: false,
          error: '至少需要一个测试点'
        });
      }

      // 验证每个测试点
      for (let i = 0; i < testPoints.length; i++) {
        const point = testPoints[i];
        if (!point.testPointName || !point.testPointName.trim()) {
          return res.status(400).json({
            success: false,
            error: `测试点 ${i + 1} 的名称不能为空`
          });
        }
        if (!point.steps || !point.steps.trim()) {
          return res.status(400).json({
            success: false,
            error: `测试点 ${i + 1} 的测试步骤不能为空`
          });
        }
        if (!point.expectedResult || !point.expectedResult.trim()) {
          return res.status(400).json({
            success: false,
            error: `测试点 ${i + 1} 的预期结果不能为空`
          });
        }
      }

      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: '未授权'
        });
      }

      console.log(`✨ 手动创建测试用例: ${name}, 包含 ${testPoints.length} 个测试点`);

      const result = await functionalTestCaseService.create({
        name,
        description,
        system,
        module,
        priority,
        status,
        testType,
        tags,
        preconditions,
        testData,
        sectionName,
        coverageAreas,
        testPoints
      }, req.user.id);

      res.json({
        success: true,
        data: result,
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

  /**
   * GET /api/v1/functional-test-cases/:id
   * 获取单个测试用例详情
   */
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return res.status(400).json({
          success: false,
          error: '无效的ID'
        });
      }

      const testCase = await functionalTestCaseService.getById(id);

      if (!testCase) {
        return res.status(404).json({
          success: false,
          error: '测试用例不存在'
        });
      }

      res.json({
        success: true,
        data: testCase
      });
    } catch (error: any) {
      console.error('❌ 查询详情失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * PUT /api/v1/functional-test-cases/:id
   * 更新测试用例
   */
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return res.status(400).json({
          success: false,
          error: '无效的ID'
        });
      }

      const testCase = await functionalTestCaseService.update(id, req.body);

      res.json({
        success: true,
        data: testCase,
        message: '更新成功'
      });
    } catch (error: any) {
      console.error('❌ 更新失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * DELETE /api/v1/functional-test-cases/:id
   * 删除测试用例
   */
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return res.status(400).json({
          success: false,
          error: '无效的ID'
        });
      }

      await functionalTestCaseService.delete(id);

      res.json({
        success: true,
        message: '删除成功'
      });
    } catch (error: any) {
      console.error('❌ 删除失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/v1/functional-test-cases/test-points/:id
   * 获取测试点详情（含关联用例信息）
   */
  router.get('/test-points/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return res.status(400).json({
          success: false,
          error: '无效的测试点ID'
        });
      }

      console.log(`📋 查询测试点详情，ID: ${id}`);

      const result = await functionalTestCaseService.getTestPointById(id);

      if (!result) {
        return res.status(404).json({
          success: false,
          error: '测试点不存在'
        });
      }

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      console.error('❌ 查询测试点详情失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * PUT /api/v1/functional-test-cases/test-points/:id
   * 更新测试点
   */
  router.put('/test-points/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return res.status(400).json({
          success: false,
          error: '无效的测试点ID'
        });
      }

      const {
        testPurpose,
        testPointName,
        steps,
        expectedResult,
        riskLevel
      } = req.body;

      // 验证必填字段
      if (!testPointName || !testPointName.trim()) {
        return res.status(400).json({
          success: false,
          error: '测试点名称不能为空'
        });
      }

      if (!steps || !steps.trim()) {
        return res.status(400).json({
          success: false,
          error: '测试步骤不能为空'
        });
      }

      if (!expectedResult || !expectedResult.trim()) {
        return res.status(400).json({
          success: false,
          error: '预期结果不能为空'
        });
      }

      console.log(`📝 更新测试点，ID: ${id}`);

      const result = await functionalTestCaseService.updateTestPoint(id, {
        testPurpose,
        testPointName,
        steps,
        expectedResult,
        riskLevel
      });

      res.json({
        success: true,
        data: result,
        message: '测试点更新成功'
      });
    } catch (error: any) {
      console.error('❌ 更新测试点失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * 🆕 POST /api/v1/functional-test-cases/analyze-modules
   * 阶段1：智能测试模块拆分
   */
  router.post('/analyze-modules', async (req: Request, res: Response) => {
    try {
      const { requirementDoc, sessionId } = req.body;

      if (!requirementDoc) {
        return res.status(400).json({
          success: false,
          error: '缺少必填参数: requirementDoc'
        });
      }

      console.log(`🎯 阶段1：开始测试模块拆分 - sessionId: ${sessionId}`);

      const modules = await functionalTestCaseService.analyzeTestModules(requirementDoc);

      res.json({
        success: true,
        data: {
          modules,
          sessionId
        }
      });
    } catch (error: any) {
      console.error('❌ 测试模块拆分失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * 🆕 POST /api/v1/functional-test-cases/generate-purposes
   * 阶段2：生成测试目的
   */
  router.post('/generate-purposes', async (req: Request, res: Response) => {
    try {
      const { moduleId, moduleName, moduleDescription, requirementDoc, relatedSections, sessionId } = req.body;

      if (!moduleId || !moduleName || !requirementDoc || !relatedSections) {
        return res.status(400).json({
          success: false,
          error: '缺少必填参数'
        });
      }

      console.log(`🎯 阶段2：为模块 "${moduleName}" 生成测试目的 - sessionId: ${sessionId}`);

      const purposes = await functionalTestCaseService.generateTestPurposes(
        moduleId,
        moduleName,
        moduleDescription,
        requirementDoc,
        relatedSections
      );

      res.json({
        success: true,
        data: {
          purposes,
          moduleId,
          sessionId
        }
      });
    } catch (error: any) {
      console.error('❌ 生成测试目的失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * 🆕 POST /api/v1/functional-test-cases/generate-points
   * 阶段3：生成测试点
   */
  router.post('/generate-points', async (req: Request, res: Response) => {
    try {
      const {
        purposeId,
        purposeName,
        purposeDescription,
        requirementDoc,
        systemName,
        moduleName,
        relatedSections,
        sessionId
      } = req.body;

      if (!purposeId || !purposeName || !requirementDoc || !systemName || !moduleName || !relatedSections) {
        return res.status(400).json({
          success: false,
          error: '缺少必填参数'
        });
      }

      console.log(`🎯 阶段3：为测试目的 "${purposeName}" 生成测试点 - sessionId: ${sessionId}`);

      const testCase = await functionalTestCaseService.generateTestPoints(
        purposeId,
        purposeName,
        purposeDescription,
        requirementDoc,
        systemName,
        moduleName,
        relatedSections
      );

      res.json({
        success: true,
        data: {
          testCase,
          purposeId,
          sessionId
        }
      });
    } catch (error: any) {
      console.error('❌ 生成测试点失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}
