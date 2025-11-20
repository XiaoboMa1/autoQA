import { Router } from 'express';
import { authenticateUser } from '../middleware/auth.js';

/**
 * 创建安全事件路由
 */
export function createSecurityRoutes(): Router {
  const router = Router();

  // 应用身份验证中间件
  router.use(authenticateUser);

  /**
   * POST /api/v1/security/events
   * 接收前端安全监控事件
   */
  router.post('/events', async (req, res) => {
    try {
      // 简单记录安全事件，不存储到数据库
      console.log('🔒 [Security] 收到安全事件:', {
        user_id: req.user!.id,
        timestamp: new Date(),
        event: req.body
      });

      // 返回成功响应
      res.json({
        success: true,
        message: 'Security event logged'
      });

    } catch (error: any) {
      console.error('❌ [Security] 处理安全事件失败:', error);
      res.status(500).json({
        success: false,
        error: '处理安全事件失败'
      });
    }
  });

  /**
   * POST /api/v1/security/activity-summary
   * 接收前端安全监控活动摘要
   */
  router.post('/activity-summary', async (req, res) => {
    try {
      // 记录活动摘要
      console.log('📊 [Security] 收到活动摘要:', {
        user_id: req.user!.id,
        timestamp: new Date(),
        summary: req.body
      });

      // 返回成功响应
      res.json({
        success: true,
        message: 'Activity summary logged'
      });

    } catch (error: any) {
      console.error('❌ [Security] 处理活动摘要失败:', error);
      res.status(500).json({
        success: false,
        error: '处理活动摘要失败'
      });
    }
  });

  return router;
}