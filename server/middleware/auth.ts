import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '../../src/generated/prisma/index.js';
import { getNow } from '../utils/timezone.js';

// 扩展Request接口，添加user属性
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        email: string;
        roles: string[];
      };
    }
  }
}

const prisma = new PrismaClient();

/**
 * 获取用户角色
 */
async function getUserRoles(userId: number): Promise<string[]> {
  try {
    const userRoles = await prisma.user_roles.findMany({
      where: { user_id: userId },
      include: {
        roles: {
          select: { name: true }
        }
      }
    });

    return userRoles.map(ur => ur.roles.name);
  } catch (error) {
    console.error('获取用户角色失败:', error);
    return [];
  }
}

/**
 * 基础身份验证中间件（简化版）
 * 实际项目中应该使用JWT或其他认证机制
 */
export const authenticateUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 简化的认证逻辑：从header或query中获取用户ID
    const userId = req.headers['x-user-id'] || req.query.userId;

    if (!userId) {
      return res.status(401).json({
        ok: false,
        error: '未提供用户身份信息'
      });
    }

    // 获取用户信息
    const user = await prisma.users.findUnique({
      where: { id: parseInt(userId as string) },
      select: { id: true, email: true }
    });

    if (!user) {
      return res.status(401).json({
        ok: false,
        error: '用户不存在'
      });
    }

    // 获取用户角色
    const roles = await getUserRoles(user.id);

    // 设置用户信息到request对象
    req.user = {
      id: user.id,
      email: user.email,
      roles
    };

    next();
  } catch (error: any) {
    console.error('身份验证失败:', error);
    res.status(500).json({
      ok: false,
      error: '身份验证失败'
    });
  }
};

/**
 * 角色权限验证中间件
 */
export const requireRoles = (allowedRoles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          ok: false,
          error: '用户未认证'
        });
      }

      // 检查用户是否具有所需角色
      const hasPermission = allowedRoles.some(role => 
        req.user!.roles.includes(role)
      );

      if (!hasPermission) {
        return res.status(403).json({
          ok: false,
          error: '权限不足，需要以下角色之一: ' + allowedRoles.join(', ')
        });
      }

      next();
    } catch (error: any) {
      console.error('权限检查失败:', error);
      res.status(500).json({
        ok: false,
        error: '权限检查失败'
      });
    }
  };
};

/**
 * 权限服务类
 */
export class PermissionService {
  /**
   * 检查批量更新权限 (已修改为所有认证用户都有权限)
   */
  static async checkBulkUpdatePermission(userId: number): Promise<boolean> {
    try {
      // 所有认证用户都有批量更新权限
      return true;
    } catch (error) {
      console.error('检查批量更新权限失败:', error);
      return false;
    }
  }

  /**
   * 记录批量更新操作日志
   */
  static async logBulkUpdateAction(
    userId: number,
    action: string,
    targetType: string,
    targetId: number,
    meta: any = {}
  ): Promise<void> {
    try {
      await prisma.audit_logs.create({
        data: {
          user_id: userId,
          action,
          target_type: targetType,
          target_id: BigInt(targetId),
          meta: JSON.stringify({
            ...meta,
            timestamp: getNow().toISOString(),
            feature: 'ai_bulk_update'
          }),
          created_at: getNow()
        }
      });

      console.log(`📋 [AuditLog] 用户 ${userId} 执行操作: ${action} on ${targetType}:${targetId}`);
    } catch (error: any) {
      console.error('记录审计日志失败:', error);
      // 审计日志失败不应该阻断业务流程，只记录错误
    }
  }

  /**
   * 创建默认角色（如果不存在）
   */
  static async ensureDefaultRoles(): Promise<void> {
    try {
      const defaultRoles = [
        { name: 'admin', description: '系统管理员' },
        { name: 'qa_lead', description: 'QA主管' },
        { name: 'qa_user', description: 'QA用户' },
        { name: 'developer', description: '开发者' },
        { name: 'viewer', description: '只读用户' }
      ];

      for (const role of defaultRoles) {
        await prisma.roles.upsert({
          where: { name: role.name },
          update: {},
          create: { name: role.name }
        });
      }

      console.log('✅ 默认角色初始化完成');
    } catch (error) {
      console.error('❌ 初始化默认角色失败:', error);
    }
  }

  /**
   * 为用户分配默认角色
   */
  static async assignDefaultRole(userId: number, roleName: string = 'qa_user'): Promise<void> {
    try {
      const role = await prisma.roles.findUnique({
        where: { name: roleName }
      });

      if (!role) {
        console.warn(`角色 ${roleName} 不存在`);
        return;
      }

      // 检查是否已有角色分配
      const existingAssignment = await prisma.user_roles.findFirst({
        where: { 
          user_id: userId,
          role_id: role.id 
        }
      });

      if (!existingAssignment) {
        await prisma.user_roles.create({
          data: {
            user_id: userId,
            role_id: role.id
          }
        });

        console.log(`✅ 为用户 ${userId} 分配角色: ${roleName}`);
      }
    } catch (error) {
      console.error(`❌ 分配用户角色失败:`, error);
    }
  }
}

// 审计日志操作类型定义
export const AuditActions = {
  // 批量更新相关
  BULK_SESSION_CREATED: 'bulk_session_created',
  BULK_PROPOSALS_APPLIED: 'bulk_proposals_applied',
  BULK_SESSION_CANCELLED: 'bulk_session_cancelled',
  BULK_PROPOSAL_SKIPPED: 'bulk_proposal_skipped',
  
  // 版本控制相关
  TEST_CASE_ROLLBACK: 'test_case_rollback',
  VERSION_CREATED: 'version_created',
  
  // 权限相关
  PERMISSION_DENIED: 'permission_denied',
  FEATURE_FLAG_ACCESSED: 'feature_flag_accessed'
} as const;

/**
 * 审计日志装饰器（用于自动记录操作）
 */
export function auditLog(action: string, targetType: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const req = args.find(arg => arg?.user); // 找到包含用户信息的request对象
      
      try {
        const result = await method.apply(this, args);
        
        // 记录成功操作
        if (req?.user) {
          await PermissionService.logBulkUpdateAction(
            req.user.id,
            action,
            targetType,
            result?.id || 0,
            { success: true, method: propertyName }
          );
        }
        
        return result;
      } catch (error) {
        // 记录失败操作
        if (req?.user) {
          await PermissionService.logBulkUpdateAction(
            req.user.id,
            `${action}_failed`,
            targetType,
            0,
            { success: false, error: error.message, method: propertyName }
          );
        }
        
        throw error;
      }
    };
  };
}