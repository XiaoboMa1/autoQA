import { Router, Request, Response } from 'express';
import { RequirementDocService } from '../services/requirementDocService.js';

/**
 * 需求文档路由
 */
export function createRequirementDocRoutes(): Router {
  const router = Router();
  const getService = () => new RequirementDocService();

  /**
   * GET /api/v1/requirement-docs
   * 获取需求文档列表
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const {
        page = '1',
        pageSize = '10',
        search,
        projectId,
        projectVersionId,
        module,
        status,
        creatorId,
        startDate,
        endDate
      } = req.query;

      const service = getService();
      const result = await service.getList({
        page: parseInt(page as string, 10),
        pageSize: parseInt(pageSize as string, 10),
        search: search as string,
        projectId: projectId ? parseInt(projectId as string, 10) : undefined,
        projectVersionId: projectVersionId ? parseInt(projectVersionId as string, 10) : undefined,
        module: module as string,
        status: status as string,
        creatorId: creatorId ? parseInt(creatorId as string, 10) : undefined,
        startDate: startDate as string,
        endDate: endDate as string
      });

      res.json({
        success: true,
        ...result
      });
    } catch (error: any) {
      console.error('获取需求文档列表失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/v1/requirement-docs/:id
   * 获取需求文档详情
   */
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const service = getService();
      const document = await service.getById(id);

      if (!document) {
        return res.status(404).json({
          success: false,
          error: '需求文档不存在'
        });
      }

      res.json({
        success: true,
        data: document
      });
    } catch (error: any) {
      console.error('获取需求文档详情失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/v1/requirement-docs
   * 创建需求文档
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const {
        title,
        content,
        summary,
        sourceFilename,
        aiSessionId,
        projectId,
        projectVersionId,
        scenarioCount,
        system,
        module
      } = req.body;

      // 从请求中获取用户ID（通过认证中间件设置）
      const creatorId = (req as any).user?.id || 1;

      // 🔍 调试：打印接收到的参数
      console.log('📄 创建需求文档，接收到的参数:', {
        system,
        module,
        projectId,
        projectVersionId,
        scenarioCount
      });

      if (!title || !content) {
        return res.status(400).json({
          success: false,
          error: '标题和内容不能为空'
        });
      }

      const service = getService();
      const document = await service.create({
        title,
        content,
        summary,
        sourceFilename,
        aiSessionId,
        projectId,
        projectVersionId,
        creatorId,
        scenarioCount,
        system,  // 🆕 保存系统名称
        module   // 🆕 保存模块名称
      });

      res.json({
        success: true,
        data: document
      });
    } catch (error: any) {
      console.error('创建需求文档失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * PUT /api/v1/requirement-docs/:id
   * 更新需求文档
   */
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { title, content, summary, projectId, projectVersionId, status, system, module } = req.body;

      // 🔍 调试：打印接收到的参数
      console.log('📝 更新需求文档，接收到的参数:', {
        id,
        system,
        module,
        projectId,
        projectVersionId
      });

      const service = getService();
      const document = await service.update(id, {
        title,
        content,
        summary,
        projectId,
        projectVersionId,
        status,
        system,  // 🆕 更新系统名称
        module   // 🆕 更新模块名称
      });

      res.json({
        success: true,
        data: document
      });
    } catch (error: any) {
      console.error('更新需求文档失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * DELETE /api/v1/requirement-docs/:id
   * 删除需求文档（软删除）
   */
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const service = getService();
      await service.delete(id);

      res.json({
        success: true,
        message: '需求文档已删除'
      });
    } catch (error: any) {
      console.error('删除需求文档失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/v1/requirement-docs/:id/archive
   * 归档需求文档
   */
  router.post('/:id/archive', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const service = getService();
      const document = await service.archive(id);

      res.json({
        success: true,
        data: document
      });
    } catch (error: any) {
      console.error('归档需求文档失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/v1/requirement-docs/:id/restore
   * 恢复需求文档
   */
  router.post('/:id/restore', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const service = getService();
      const document = await service.restore(id);

      res.json({
        success: true,
        data: document
      });
    } catch (error: any) {
      console.error('恢复需求文档失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/v1/requirement-docs/batch-delete
   * 批量删除需求文档
   */
  router.post('/batch-delete', async (req: Request, res: Response) => {
    try {
      const { ids } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          success: false,
          error: '请选择要删除的文档'
        });
      }

      const service = getService();
      const results = await Promise.allSettled(
        ids.map((id: number) => service.delete(id))
      );

      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failCount = results.filter(r => r.status === 'rejected').length;

      res.json({
        success: true,
        message: `成功删除 ${successCount} 个文档${failCount > 0 ? `，${failCount} 个删除失败` : ''}`,
        successCount,
        failCount
      });
    } catch (error: any) {
      console.error('批量删除需求文档失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/v1/requirement-docs/:id/test-cases
   * 获取需求文档关联的测试用例
   */
  router.get('/:id/test-cases', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { page = '1', pageSize = '20' } = req.query;

      const service = getService();
      const result = await service.getTestCases(
        id,
        parseInt(page as string, 10),
        parseInt(pageSize as string, 10)
      );

      res.json({
        success: true,
        ...result
      });
    } catch (error: any) {
      console.error('获取关联用例失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}

