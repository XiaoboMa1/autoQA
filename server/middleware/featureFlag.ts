import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '../../src/generated/prisma/index.js';
import { getNow } from '../utils/timezone.js';

const prisma = new PrismaClient();

/**
 * 功能开关服务
 */
export class FeatureFlagService {
  private static flagCache: Map<string, any> = new Map();
  private static cacheExpiry: Map<string, number> = new Map();
  private static readonly CACHE_TTL = 60 * 1000; // 1分钟缓存

  /**
   * 初始化AI批量更新功能开关
   */
  static async initializeBulkUpdateFlag(): Promise<void> {
    try {
      await prisma.feature_flags.upsert({
        where: { flag_name: 'FEATURE_AIBULK_UPDATE' },
        update: { updated_at: getNow() },
        create: {
          flag_name: 'FEATURE_AIBULK_UPDATE',
          is_enabled: false, // 默认关闭
          rollout_percentage: 0,
          updated_at: getNow()
        }
      });

      console.log('✅ AI批量更新功能开关初始化完成');
    } catch (error) {
      console.error('❌ 初始化功能开关失败:', error);
    }
  }

  /**
   * 启用批量更新功能
   */
  static async enableBulkUpdate(rolloutPercentage: number = 100): Promise<void> {
    try {
      await prisma.feature_flags.update({
        where: { flag_name: 'FEATURE_AIBULK_UPDATE' },
        data: {
          is_enabled: true,
          rollout_percentage: Math.max(0, Math.min(100, rolloutPercentage)),
          updated_at: getNow()
        }
      });

      // 清除缓存
      this.flagCache.delete('FEATURE_AIBULK_UPDATE');
      this.cacheExpiry.delete('FEATURE_AIBULK_UPDATE');

      console.log(`✅ AI批量更新功能已启用，灰度比例: ${rolloutPercentage}%`);
    } catch (error) {
      console.error('❌ 启用批量更新功能失败:', error);
      throw error;
    }
  }

  /**
   * 禁用批量更新功能
   */
  static async disableBulkUpdate(): Promise<void> {
    try {
      await prisma.feature_flags.update({
        where: { flag_name: 'FEATURE_AIBULK_UPDATE' },
        data: {
          is_enabled: false,
          rollout_percentage: 0,
          updated_at: getNow()
        }
      });

      // 清除缓存
      this.flagCache.delete('FEATURE_AIBULK_UPDATE');
      this.cacheExpiry.delete('FEATURE_AIBULK_UPDATE');

      console.log('✅ AI批量更新功能已禁用');
    } catch (error) {
      console.error('❌ 禁用批量更新功能失败:', error);
      throw error;
    }
  }

  /**
   * 检查功能是否启用（支持灰度发布）
   */
  static async isFeatureEnabled(flagName: string, userId?: number): Promise<boolean> {
    try {
      // 检查缓存
      const cacheKey = `${flagName}_${userId || 'anonymous'}`;
      const cachedResult = this.flagCache.get(cacheKey);
      const cacheTime = this.cacheExpiry.get(cacheKey);
      
      if (cachedResult !== undefined && cacheTime && Date.now() < cacheTime) {
        return cachedResult;
      }

      // 从数据库获取
      const flag = await prisma.feature_flags.findUnique({
        where: { flag_name: flagName }
      });

      if (!flag || !flag.is_enabled) {
        this.setCacheValue(cacheKey, false);
        return false;
      }

      // 检查灰度发布
      if (flag.rollout_percentage && flag.rollout_percentage < 100 && userId) {
        const isInRollout = this.isUserInRollout(flagName, userId, flag.rollout_percentage);
        this.setCacheValue(cacheKey, isInRollout);
        return isInRollout;
      }

      this.setCacheValue(cacheKey, true);
      return true;

    } catch (error) {
      console.error(`❌ 检查功能开关失败: ${flagName}`, error);
      return false;
    }
  }

  /**
   * 判断用户是否在灰度发布范围内
   * @private
   */
  private static isUserInRollout(flagName: string, userId: number, rolloutPercentage: number): boolean {
    const crypto = require('crypto');
    const hash = crypto
      .createHash('md5')
      .update(`${flagName}_${userId}`)
      .digest('hex');
    
    const hashNum = parseInt(hash.substring(0, 8), 16);
    const userPercentage = (hashNum % 100) + 1;
    
    return userPercentage <= rolloutPercentage;
  }

  /**
   * 设置缓存值
   * @private
   */
  private static setCacheValue(key: string, value: boolean): void {
    this.flagCache.set(key, value);
    this.cacheExpiry.set(key, Date.now() + this.CACHE_TTL);
  }

  /**
   * 获取所有功能开关状态
   */
  static async getAllFlags(): Promise<Array<{
    flag_name: string;
    is_enabled: boolean;
    rollout_percentage: number;
    updated_at: Date;
  }>> {
    try {
      const flags = await prisma.feature_flags.findMany({
        orderBy: { flag_name: 'asc' }
      });

      return flags.map(flag => ({
        flag_name: flag.flag_name,
        is_enabled: flag.is_enabled || false,
        rollout_percentage: flag.rollout_percentage || 0,
        updated_at: flag.updated_at || getNow()
      }));
    } catch (error) {
      console.error('❌ 获取功能开关列表失败:', error);
      return [];
    }
  }

  /**
   * 更新功能开关
   */
  static async updateFlag(
    flagName: string, 
    isEnabled: boolean, 
    rolloutPercentage?: number
  ): Promise<void> {
    try {
      await prisma.feature_flags.upsert({
        where: { flag_name: flagName },
        update: {
          is_enabled: isEnabled,
          rollout_percentage: rolloutPercentage ?? undefined,
          updated_at: getNow()
        },
        create: {
          flag_name: flagName,
          is_enabled: isEnabled,
          rollout_percentage: rolloutPercentage || 0,
          updated_at: getNow()
        }
      });

      // 清除相关缓存
      const keysToDelete: string[] = [];
      for (const key of this.flagCache.keys()) {
        if (key.startsWith(flagName)) {
          keysToDelete.push(key);
        }
      }
      
      keysToDelete.forEach(key => {
        this.flagCache.delete(key);
        this.cacheExpiry.delete(key);
      });

      console.log(`✅ 功能开关已更新: ${flagName} = ${isEnabled}`);
    } catch (error) {
      console.error(`❌ 更新功能开关失败: ${flagName}`, error);
      throw error;
    }
  }

  /**
   * 清除缓存
   */
  static clearCache(): void {
    this.flagCache.clear();
    this.cacheExpiry.clear();
    console.log('✅ 功能开关缓存已清除');
  }
}

/**
 * 功能开关中间件
 */
export const requireFeatureFlag = (flagName: string, options: {
  redirectUrl?: string;
  errorMessage?: string;
} = {}) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      const isEnabled = await FeatureFlagService.isFeatureEnabled(flagName, userId);

      if (!isEnabled) {
        const errorMessage = options.errorMessage || `功能 ${flagName} 暂不可用`;
        
        // 记录访问尝试
        if (req.user) {
          const { PermissionService } = await import('./auth.js');
          await PermissionService.logBulkUpdateAction(
            req.user.id,
            'FEATURE_FLAG_ACCESSED',
            'feature_flag',
            0,
            { 
              flag_name: flagName,
              is_enabled: false,
              user_agent: req.get('User-Agent'),
              ip: req.ip,
              path: req.path
            }
          );
        }

        if (options.redirectUrl) {
          return res.redirect(options.redirectUrl);
        }

        return res.status(404).json({
          ok: false,
          error: errorMessage,
          code: 'FEATURE_NOT_AVAILABLE'
        });
      }

      // 记录成功访问
      if (req.user) {
        const { PermissionService } = await import('./auth.js');
        await PermissionService.logBulkUpdateAction(
          req.user.id,
          'FEATURE_FLAG_ACCESSED',
          'feature_flag',
          0,
          { 
            flag_name: flagName,
            is_enabled: true,
            path: req.path
          }
        );
      }

      next();
    } catch (error: any) {
      console.error(`❌ 功能开关检查失败: ${flagName}`, error);
      res.status(500).json({
        ok: false,
        error: '功能可用性检查失败',
        code: 'FEATURE_CHECK_ERROR'
      });
    }
  };
};

/**
 * 批量更新专用中间件
 */
export const requireBulkUpdateFeature = requireFeatureFlag('FEATURE_AIBULK_UPDATE', {
  errorMessage: 'AI批量更新功能暂不可用'
});

/**
 * 功能开关管理API中间件
 * 只有管理员可以管理功能开关
 */
export const requireFeatureFlagAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        error: '用户未认证'
      });
    }

    if (!req.user.roles.includes('admin')) {
      return res.status(403).json({
        ok: false,
        error: '只有管理员可以管理功能开关'
      });
    }

    next();
  } catch (error: any) {
    console.error('❌ 功能开关管理权限检查失败:', error);
    res.status(500).json({
      ok: false,
      error: '权限检查失败'
    });
  }
};

/**
 * 初始化所有功能开关
 */
export async function initializeAllFeatureFlags(): Promise<void> {
  console.log('🔧 开始初始化功能开关...');
  
  try {
    await FeatureFlagService.initializeBulkUpdateFlag();
    
    // 可以在这里添加其他功能开关的初始化
    const additionalFlags = [
      { name: 'FEATURE_ADVANCED_REPORTING', enabled: true, rollout: 100 },
      { name: 'FEATURE_REALTIME_COLLABORATION', enabled: false, rollout: 0 },
      { name: 'FEATURE_TEST_AUTOMATION_V2', enabled: false, rollout: 0 }
    ];

    for (const flag of additionalFlags) {
      await FeatureFlagService.updateFlag(flag.name, flag.enabled, flag.rollout);
    }

    console.log('✅ 功能开关初始化完成');
  } catch (error) {
    console.error('❌ 功能开关初始化失败:', error);
  }
}