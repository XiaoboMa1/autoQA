import { Router } from 'express';
import { authenticateUser, requireRoles } from '../middleware/auth.js';
import { FeatureFlagService, requireFeatureFlagAdmin } from '../middleware/featureFlag.js';
import Joi from 'joi';
import { getNow } from '../utils/timezone.js';

// 请求验证模式
const updateFlagSchema = Joi.object({
  flagName: Joi.string().required().trim().min(1).max(100),
  isEnabled: Joi.boolean().required(),
  rolloutPercentage: Joi.number().integer().min(0).max(100).optional()
});

/**
 * 创建功能开关管理路由
 */
export function createFeatureFlagRoutes(): Router {
  const router = Router();

  // 应用身份验证和管理员权限中间件
  router.use(authenticateUser);
  router.use(requireFeatureFlagAdmin);

  /**
   * GET /api/v1/feature-flags
   * 获取所有功能开关状态
   */
  router.get('/', async (req, res) => {
    try {
      const flags = await FeatureFlagService.getAllFlags();

      res.json({
        ok: true,
        data: {
          flags,
          total: flags.length
        }
      });

    } catch (error: any) {
      console.error('获取功能开关列表失败:', error);
      res.status(500).json({
        ok: false,
        error: '获取功能开关列表失败'
      });
    }
  });

  /**
   * GET /api/v1/feature-flags/:flagName/status
   * 检查特定功能开关状态（支持用户ID查询灰度状态）
   */
  router.get('/:flagName/status', async (req, res) => {
    try {
      const { flagName } = req.params;
      const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;

      if (!flagName) {
        return res.status(400).json({
          ok: false,
          error: '功能开关名称不能为空'
        });
      }

      const isEnabled = await FeatureFlagService.isFeatureEnabled(flagName, userId);

      res.json({
        ok: true,
        data: {
          flag_name: flagName,
          is_enabled: isEnabled,
          user_id: userId,
          checked_at: new Date().toISOString()
        }
      });

    } catch (error: any) {
      console.error('检查功能开关状态失败:', error);
      res.status(500).json({
        ok: false,
        error: '检查功能开关状态失败'
      });
    }
  });

  /**
   * PUT /api/v1/feature-flags/:flagName
   * 更新特定功能开关
   */
  router.put('/:flagName', async (req, res) => {
    try {
      const { flagName } = req.params;
      
      // 请求参数验证
      const { error, value } = updateFlagSchema.validate({
        flagName,
        ...req.body
      });

      if (error) {
        return res.status(400).json({
          ok: false,
          error: '请求参数验证失败: ' + error.details.map(d => d.message).join(', ')
        });
      }

      const { isEnabled, rolloutPercentage } = value;

      await FeatureFlagService.updateFlag(flagName, isEnabled, rolloutPercentage);

      console.log(`✅ [Admin] 用户 ${req.user!.email} 更新功能开关: ${flagName} = ${isEnabled}`);

      res.json({
        ok: true,
        data: {
          flag_name: flagName,
          is_enabled: isEnabled,
          rollout_percentage: rolloutPercentage || 0,
          updated_by: req.user!.email,
          updated_at: getNow().toISOString()
        }
      });

    } catch (error: any) {
      console.error('更新功能开关失败:', error);
      res.status(500).json({
        ok: false,
        error: '更新功能开关失败'
      });
    }
  });

  /**
   * POST /api/v1/feature-flags/bulk-update
   * 批量更新功能开关
   */
  router.post('/bulk-update', async (req, res) => {
    try {
      const { flags } = req.body;

      if (!Array.isArray(flags) || flags.length === 0) {
        return res.status(400).json({
          ok: false,
          error: '必须提供功能开关列表'
        });
      }

      const results = [];
      const errors = [];

      for (const flag of flags) {
        try {
          const { error, value } = updateFlagSchema.validate(flag);
          if (error) {
            errors.push({
              flag_name: flag.flagName || 'unknown',
              error: error.details.map(d => d.message).join(', ')
            });
            continue;
          }

          await FeatureFlagService.updateFlag(
            value.flagName, 
            value.isEnabled, 
            value.rolloutPercentage
          );

          results.push({
            flag_name: value.flagName,
            is_enabled: value.isEnabled,
            rollout_percentage: value.rolloutPercentage || 0,
            success: true
          });

        } catch (error: any) {
          errors.push({
            flag_name: flag.flagName || 'unknown',
            error: error.message
          });
        }
      }

      console.log(`✅ [Admin] 用户 ${req.user!.email} 批量更新功能开关: ${results.length} 成功, ${errors.length} 失败`);

      res.json({
        ok: true,
        data: {
          successful_updates: results,
          failed_updates: errors,
          summary: {
            total: flags.length,
            successful: results.length,
            failed: errors.length
          },
          updated_by: req.user!.email,
          updated_at: getNow().toISOString()
        }
      });

    } catch (error: any) {
      console.error('批量更新功能开关失败:', error);
      res.status(500).json({
        ok: false,
        error: '批量更新功能开关失败'
      });
    }
  });

  /**
   * DELETE /api/v1/feature-flags/cache
   * 清除功能开关缓存
   */
  router.delete('/cache', async (req, res) => {
    try {
      FeatureFlagService.clearCache();

      console.log(`✅ [Admin] 用户 ${req.user!.email} 清除了功能开关缓存`);

      res.json({
        ok: true,
        message: '功能开关缓存已清除',
        cleared_by: req.user!.email,
        cleared_at: new Date().toISOString()
      });

    } catch (error: any) {
      console.error('清除功能开关缓存失败:', error);
      res.status(500).json({
        ok: false,
        error: '清除功能开关缓存失败'
      });
    }
  });

  /**
   * POST /api/v1/feature-flags/ai-bulk-update/enable
   * 快速启用AI批量更新功能
   */
  router.post('/ai-bulk-update/enable', async (req, res) => {
    try {
      const { rolloutPercentage = 100 } = req.body;

      if (typeof rolloutPercentage !== 'number' || rolloutPercentage < 0 || rolloutPercentage > 100) {
        return res.status(400).json({
          ok: false,
          error: '灰度比例必须是0-100之间的数字'
        });
      }

      await FeatureFlagService.enableBulkUpdate(rolloutPercentage);

      console.log(`✅ [Admin] 用户 ${req.user!.email} 启用了AI批量更新功能，灰度比例: ${rolloutPercentage}%`);

      res.json({
        ok: true,
        data: {
          feature: 'FEATURE_AIBULK_UPDATE',
          is_enabled: true,
          rollout_percentage: rolloutPercentage,
          enabled_by: req.user!.email,
          enabled_at: new Date().toISOString()
        }
      });

    } catch (error: any) {
      console.error('启用AI批量更新功能失败:', error);
      res.status(500).json({
        ok: false,
        error: '启用AI批量更新功能失败'
      });
    }
  });

  /**
   * POST /api/v1/feature-flags/ai-bulk-update/disable
   * 快速禁用AI批量更新功能
   */
  router.post('/ai-bulk-update/disable', async (req, res) => {
    try {
      await FeatureFlagService.disableBulkUpdate();

      console.log(`✅ [Admin] 用户 ${req.user!.email} 禁用了AI批量更新功能`);

      res.json({
        ok: true,
        data: {
          feature: 'FEATURE_AIBULK_UPDATE',
          is_enabled: false,
          rollout_percentage: 0,
          disabled_by: req.user!.email,
          disabled_at: new Date().toISOString()
        }
      });

    } catch (error: any) {
      console.error('禁用AI批量更新功能失败:', error);
      res.status(500).json({
        ok: false,
        error: '禁用AI批量更新功能失败'
      });
    }
  });

  return router;
}

/**
 * 创建公开的功能开关检查路由（不需要管理员权限）
 */
export function createPublicFeatureFlagRoutes(): Router {
  const router = Router();

  // 只需要基础身份验证
  router.use(authenticateUser);

  /**
   * GET /api/v1/features/check
   * 检查多个功能开关状态（用于前端权限控制）
   */
  router.get('/check', async (req, res) => {
    try {
      const flagNames = req.query.flags as string | string[];
      const userId = req.user!.id;

      if (!flagNames) {
        return res.status(400).json({
          ok: false,
          error: '必须指定要检查的功能开关名称'
        });
      }

      const flags = Array.isArray(flagNames) ? flagNames : [flagNames];
      const results: Record<string, boolean> = {};

      for (const flagName of flags) {
        try {
          results[flagName] = await FeatureFlagService.isFeatureEnabled(flagName, userId);
        } catch (error) {
          console.warn(`检查功能开关 ${flagName} 失败:`, error);
          results[flagName] = false; // 默认不可用
        }
      }

      res.json({
        ok: true,
        data: {
          user_id: userId,
          features: results,
          checked_at: new Date().toISOString()
        }
      });

    } catch (error: any) {
      console.error('批量检查功能开关失败:', error);
      res.status(500).json({
        ok: false,
        error: '批量检查功能开关失败'
      });
    }
  });

  /**
   * GET /api/v1/features/ai-bulk-update/available
   * 专门检查AI批量更新功能是否对当前用户可用
   */
  router.get('/ai-bulk-update/available', async (req, res) => {
    try {
      const userId = req.user!.id;
      const userRoles = req.user!.roles;

      // 检查功能开关
      const isFeatureEnabled = await FeatureFlagService.isFeatureEnabled('FEATURE_AIBULK_UPDATE', userId);
      
      // 所有认证用户都有权限使用AI批量更新功能
      const hasPermission = true;

      const available = isFeatureEnabled && hasPermission;

      res.json({
        ok: true,
        data: {
          available,
          feature_enabled: isFeatureEnabled,
          has_permission: hasPermission,
          user_roles: userRoles,
          user_id: userId,
          checked_at: new Date().toISOString()
        }
      });

    } catch (error: any) {
      console.error('检查AI批量更新可用性失败:', error);
      res.status(500).json({
        ok: false,
        error: '检查AI批量更新可用性失败'
      });
    }
  });

  return router;
}