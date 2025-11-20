import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/authService.js';
import { PrismaClient } from '../../src/generated/prisma/index.js';

// 扩展Express Request类型以包含用户信息
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        email: string;
        username: string;
        accountName: string | null;
        department: string | null;
        isSuperAdmin: boolean;
      };
    }
  }
}

/**
 * 创建认证中间件
 */
export function createAuthMiddleware(prisma: PrismaClient) {
  const authService = new AuthService(prisma);

  /**
   * 验证JWT token的中间件
   */
  const authenticate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 从Authorization header获取token
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: '未提供认证token'
        });
      }

      const token = authHeader.substring(7); // 移除 "Bearer " 前缀

      // 验证token并获取用户信息
      const user = await authService.getUserFromToken(token);

      // 将用户信息附加到请求对象
      req.user = user;

      next();
    } catch (error: any) {
      console.error('认证失败:', error.message);
      return res.status(401).json({
        success: false,
        error: error.message || '认证失败'
      });
    }
  };

  /**
   * 检查是否为超级管理员的中间件
   */
  const requireSuperAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: '未认证'
      });
    }

    if (!req.user.isSuperAdmin) {
      return res.status(403).json({
        success: false,
        error: '需要超级管理员权限'
      });
    }

    next();
  };

  /**
   * 检查是否为管理员的中间件（包括超级管理员）
   */
  const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: '未认证'
      });
    }

    if (!req.user.isSuperAdmin) {
      return res.status(403).json({
        success: false,
        error: '需要管理员权限'
      });
    }

    next();
  };

  /**
   * 可选认证中间件 - 如果有token则验证，没有token也允许继续
   */
  const optionalAuth = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const user = await authService.getUserFromToken(token);
        req.user = user;
      }

      next();
    } catch (error) {
      // 如果token无效，不阻止请求，继续处理
      next();
    }
  };

  return {
    authenticate,
    requireSuperAdmin,
    requireAdmin,
    optionalAuth
  };
}
