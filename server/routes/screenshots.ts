import { Router, Request, Response, NextFunction } from 'express';
import { ScreenshotService } from '../services/screenshotService.js';
import { ScreenshotMonitoringService } from '../services/screenshotMonitoring.js';
import { ScreenshotQueryOptions } from '../types/screenshot.js';
import * as path from 'path';
import * as fs from 'fs';

/**
 * 简单的管理员权限验证中间件
 * 在实际生产环境中，应该实现更完善的JWT或session验证
 */
function requireAdminPermission(req: Request, res: Response, next: NextFunction) {
  // 检查Authorization头
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      error: '需要管理员权限：缺少Authorization头'
    });
  }

  // 简单的token验证 - 在实际环境中应该使用JWT或其他安全方式
  // 这里使用简单的Bearer token格式: "Bearer admin-token-123"
  const token = authHeader.replace('Bearer ', '');
  
  // 简单的管理员token验证（实际环境应该从数据库或配置中获取）
  const validAdminTokens = [
    'admin-token-123',
    'system-admin-key',
    process.env.ADMIN_TOKEN || 'default-admin-token'
  ];

  if (!validAdminTokens.includes(token)) {
    return res.status(403).json({
      success: false,
      error: '需要管理员权限：无效的访问令牌'
    });
  }

  // 验证通过，继续处理请求
  next();
}

export function screenshotRoutes(screenshotService: ScreenshotService, monitoringService?: ScreenshotMonitoringService): Router {
  const router = Router();

  // 获取测试运行的所有截图
  router.get('/test-runs/:runId/screenshots', async (req: Request, res: Response) => {
    try {
      const { runId } = req.params;
      const { 
        orderBy = 'step_index', 
        orderDirection = 'asc', 
        limit, 
        offset 
      } = req.query;

      // 验证参数
      if (!runId) {
        return res.status(400).json({
          success: false,
          error: 'runId is required'
        });
      }

      // 构建查询选项
      const options: ScreenshotQueryOptions = {
        orderBy: orderBy as 'step_index' | 'created_at',
        orderDirection: orderDirection as 'asc' | 'desc',
      };

      if (limit) {
        const limitNum = parseInt(limit as string, 10);
        if (!isNaN(limitNum) && limitNum > 0) {
          options.limit = limitNum;
        }
      }

      if (offset) {
        const offsetNum = parseInt(offset as string, 10);
        if (!isNaN(offsetNum) && offsetNum >= 0) {
          options.offset = offsetNum;
        }
      }

      console.log(`🔍 API: 查询测试运行截图 - runId: ${runId}`, options);

      const screenshots = await screenshotService.getScreenshotsByRunId(runId, options);

      res.json({
        success: true,
        data: screenshots,
        meta: {
          total: screenshots.length,
          runId,
          options
        }
      });
    } catch (error: any) {
      console.error(`❌ API: 查询测试运行截图失败:`, error);
      res.status(500).json({
        success: false,
        error: error.message || '查询截图失败'
      });
    }
  });

  // 获取特定步骤的截图
  router.get('/test-runs/:runId/screenshots/:stepIndex', async (req: Request, res: Response) => {
    try {
      const { runId, stepIndex } = req.params;

      // 验证参数
      if (!runId) {
        return res.status(400).json({
          success: false,
          error: 'runId is required'
        });
      }

      if (!stepIndex) {
        return res.status(400).json({
          success: false,
          error: 'stepIndex is required'
        });
      }

      console.log(`🔍 API: 查询特定步骤截图 - runId: ${runId}, stepIndex: ${stepIndex}`);

      const screenshot = await screenshotService.getStepScreenshot(runId, stepIndex);

      if (!screenshot) {
        return res.status(404).json({
          success: false,
          error: `未找到步骤 ${stepIndex} 的截图`
        });
      }

      res.json({
        success: true,
        data: screenshot
      });
    } catch (error: any) {
      console.error(`❌ API: 查询特定步骤截图失败:`, error);
      res.status(500).json({
        success: false,
        error: error.message || '查询截图失败'
      });
    }
  });

  // 获取存储统计信息 - 必须在 /screenshots/:filename 之前定义
  router.get('/screenshots/stats', requireAdminPermission, async (req: Request, res: Response) => {
    try {
      console.log(`📊 API: 获取截图存储统计信息`);

      const stats = await screenshotService.getStorageStats();

      res.json({
        success: true,
        data: {
          totalScreenshots: stats.totalScreenshots,
          totalSize: stats.totalSize,
          avgFileSize: stats.avgFileSize,
          oldestScreenshot: stats.oldestScreenshot.toISOString(),
          newestScreenshot: stats.newestScreenshot.toISOString(),
          missingFiles: stats.missingFiles,
          // 添加一些有用的计算字段
          totalSizeMB: Math.round(stats.totalSize / (1024 * 1024) * 100) / 100,
          avgFileSizeKB: Math.round(stats.avgFileSize / 1024 * 100) / 100,
          missingFilesPercentage: stats.totalScreenshots > 0 
            ? Math.round((stats.missingFiles / stats.totalScreenshots) * 100 * 100) / 100 
            : 0,
        },
        meta: {
          timestamp: new Date().toISOString(),
          version: '1.0.0'
        }
      });

    } catch (error: any) {
      console.error(`❌ API: 获取存储统计失败:`, error);
      res.status(500).json({
        success: false,
        error: error.message || '获取存储统计失败'
      });
    }
  });

  // 下载截图文件
  router.get('/screenshots/:filename', async (req: Request, res: Response) => {
    try {
      const { filename } = req.params;

      // 验证参数
      if (!filename) {
        return res.status(400).json({
          success: false,
          error: 'filename is required'
        });
      }

      // 安全检查 - 防止路径遍历攻击
      const sanitizedFilename = path.basename(filename);
      if (sanitizedFilename !== filename || filename.includes('..')) {
        return res.status(400).json({
          success: false,
          error: '无效的文件名'
        });
      }

      // 文件类型验证 - 只允许图片文件
      const allowedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
      const fileExtension = path.extname(sanitizedFilename).toLowerCase();
      
      if (!allowedExtensions.includes(fileExtension)) {
        return res.status(400).json({
          success: false,
          error: '不支持的文件类型'
        });
      }

      // 构建文件路径
      const screenshotsDir = path.resolve('screenshots');
      const filePath = path.join(screenshotsDir, sanitizedFilename);

      // 确保文件在screenshots目录中（防止路径遍历）
      const normalizedPath = path.normalize(filePath);
      if (!normalizedPath.startsWith(screenshotsDir)) {
        return res.status(400).json({
          success: false,
          error: '无效的文件路径'
        });
      }

      console.log(`📁 API: 请求下载截图文件 - ${sanitizedFilename}`);

      // 检查文件是否存在
      try {
        await fs.promises.access(filePath, fs.constants.F_OK);
      } catch (error) {
        console.warn(`❌ 截图文件不存在: ${filePath}`);
        return res.status(404).json({
          success: false,
          error: '截图文件不存在'
        });
      }

      // 获取文件信息
      const stats = await fs.promises.stat(filePath);
      
      // 设置响应头
      const mimeType = getMimeType(fileExtension);
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', stats.size);
      res.setHeader('Cache-Control', 'public, max-age=86400'); // 缓存1天
      res.setHeader('Last-Modified', stats.mtime.toUTCString());

      // 支持条件请求 (If-Modified-Since)
      const ifModifiedSince = req.headers['if-modified-since'];
      if (ifModifiedSince) {
        const ifModifiedSinceDate = new Date(ifModifiedSince);
        if (stats.mtime <= ifModifiedSinceDate) {
          return res.status(304).end(); // Not Modified
        }
      }

      // 支持范围请求 (用于大文件)
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
        const chunksize = (end - start) + 1;

        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${stats.size}`);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Length', chunksize);

        const stream = fs.createReadStream(filePath, { start, end });
        stream.pipe(res);
      } else {
        // 发送完整文件
        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
      }

      console.log(`✅ API: 截图文件下载成功 - ${sanitizedFilename} (${stats.size} bytes)`);

    } catch (error: any) {
      console.error(`❌ API: 下载截图文件失败:`, error);
      res.status(500).json({
        success: false,
        error: error.message || '下载截图文件失败'
      });
    }
  });

  // 清理过期截图
  router.delete('/screenshots/cleanup', requireAdminPermission, async (req: Request, res: Response) => {
    try {
      const { days } = req.query;

      // 验证参数
      let daysToKeep = 30; // 默认保留30天
      if (days) {
        const daysNum = parseInt(days as string, 10);
        if (isNaN(daysNum) || daysNum < 1) {
          return res.status(400).json({
            success: false,
            error: 'days参数必须是大于0的数字'
          });
        }
        daysToKeep = daysNum;
      }

      console.log(`🧹 API: 开始清理过期截图 - 保留天数: ${daysToKeep}`);

      const stats = await screenshotService.cleanupExpiredScreenshotsWithStats(daysToKeep);

      res.json({
        success: true,
        data: stats,
        message: `清理完成，删除了 ${stats.recordsDeleted} 个过期截图记录`
      });

      console.log(`✅ API: 截图清理完成`, stats);

    } catch (error: any) {
      console.error(`❌ API: 清理过期截图失败:`, error);
      res.status(500).json({
        success: false,
        error: error.message || '清理过期截图失败'
      });
    }
  });

  // 监控相关接口 - 需要监控服务实例
  if (monitoringService) {
    // 获取监控统计信息
    router.get('/monitoring/stats', requireAdminPermission, async (req: Request, res: Response) => {
      try {
        console.log(`📊 API: 获取监控统计信息`);

        const stats = await monitoringService.getMonitoringStats();

        res.json({
          success: true,
          data: {
            lastCheck: stats.lastCheck.toISOString(),
            storageStats: {
              ...stats.storageStats,
              totalSizeMB: Math.round(stats.storageStats.totalSize / (1024 * 1024) * 100) / 100,
              avgFileSizeKB: Math.round(stats.storageStats.avgFileSize / 1024 * 100) / 100,
              missingFilesPercentage: stats.storageStats.totalScreenshots > 0 
                ? Math.round((stats.storageStats.missingFiles / stats.storageStats.totalScreenshots) * 100 * 100) / 100 
                : 0,
            },
            alerts: stats.alerts,
            performanceMetrics: stats.performanceMetrics,
            systemHealth: stats.systemHealth,
          },
          meta: {
            timestamp: new Date().toISOString(),
            version: '1.0.0'
          }
        });

      } catch (error: any) {
        console.error(`❌ API: 获取监控统计失败:`, error);
        res.status(500).json({
          success: false,
          error: error.message || '获取监控统计失败'
        });
      }
    });

    // 获取活跃告警
    router.get('/monitoring/alerts', requireAdminPermission, async (req: Request, res: Response) => {
      try {
        console.log(`🚨 API: 获取活跃告警`);

        const alerts = monitoringService.getActiveAlerts();

        res.json({
          success: true,
          data: alerts,
          meta: {
            total: alerts.length,
            timestamp: new Date().toISOString(),
          }
        });

      } catch (error: any) {
        console.error(`❌ API: 获取活跃告警失败:`, error);
        res.status(500).json({
          success: false,
          error: error.message || '获取活跃告警失败'
        });
      }
    });

    // 解决告警
    router.post('/monitoring/alerts/:alertId/resolve', requireAdminPermission, async (req: Request, res: Response) => {
      try {
        const { alertId } = req.params;

        if (!alertId) {
          return res.status(400).json({
            success: false,
            error: 'alertId is required'
          });
        }

        console.log(`✅ API: 解决告警 - alertId: ${alertId}`);

        const resolved = monitoringService.resolveAlert(alertId);

        if (!resolved) {
          return res.status(404).json({
            success: false,
            error: '告警不存在或已解决'
          });
        }

        res.json({
          success: true,
          message: '告警已解决',
          data: { alertId, resolvedAt: new Date().toISOString() }
        });

      } catch (error: any) {
        console.error(`❌ API: 解决告警失败:`, error);
        res.status(500).json({
          success: false,
          error: error.message || '解决告警失败'
        });
      }
    });

    // 获取性能指标
    router.get('/monitoring/performance', requireAdminPermission, async (req: Request, res: Response) => {
      try {
        const { limit = '100' } = req.query;

        const limitNum = parseInt(limit as string, 10);
        if (isNaN(limitNum) || limitNum < 1 || limitNum > 1000) {
          return res.status(400).json({
            success: false,
            error: 'limit参数必须是1-1000之间的数字'
          });
        }

        console.log(`⚡ API: 获取性能指标 - limit: ${limitNum}`);

        const metrics = monitoringService.getPerformanceMetrics(limitNum);

        // 计算一些统计信息
        const totalMetrics = metrics.length;
        const successCount = metrics.filter(m => m.success).length;
        const failureCount = totalMetrics - successCount;
        const avgDuration = totalMetrics > 0 
          ? metrics.reduce((sum, m) => sum + m.duration, 0) / totalMetrics 
          : 0;

        res.json({
          success: true,
          data: metrics,
          meta: {
            total: totalMetrics,
            successCount,
            failureCount,
            successRate: totalMetrics > 0 ? Math.round((successCount / totalMetrics) * 100 * 100) / 100 : 0,
            avgDuration: Math.round(avgDuration * 100) / 100,
            timestamp: new Date().toISOString(),
          }
        });

      } catch (error: any) {
        console.error(`❌ API: 获取性能指标失败:`, error);
        res.status(500).json({
          success: false,
          error: error.message || '获取性能指标失败'
        });
      }
    });

    // 更新监控配置
    router.put('/monitoring/config', requireAdminPermission, async (req: Request, res: Response) => {
      try {
        const config = req.body;

        if (!config || typeof config !== 'object') {
          return res.status(400).json({
            success: false,
            error: '配置数据无效'
          });
        }

        console.log(`⚙️ API: 更新监控配置`, config);

        monitoringService.updateConfig(config);
        const updatedConfig = monitoringService.getConfig();

        res.json({
          success: true,
          message: '监控配置已更新',
          data: updatedConfig
        });

      } catch (error: any) {
        console.error(`❌ API: 更新监控配置失败:`, error);
        res.status(500).json({
          success: false,
          error: error.message || '更新监控配置失败'
        });
      }
    });

    // 获取监控配置
    router.get('/monitoring/config', requireAdminPermission, async (req: Request, res: Response) => {
      try {
        console.log(`⚙️ API: 获取监控配置`);

        const config = monitoringService.getConfig();

        res.json({
          success: true,
          data: config
        });

      } catch (error: any) {
        console.error(`❌ API: 获取监控配置失败:`, error);
        res.status(500).json({
          success: false,
          error: error.message || '获取监控配置失败'
        });
      }
    });
  }

  return router;
}

/**
 * 根据文件扩展名获取MIME类型
 * @param extension 文件扩展名
 * @returns MIME类型
 */
function getMimeType(extension: string): string {
  const mimeTypes: { [key: string]: string } = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
  };

  return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
}