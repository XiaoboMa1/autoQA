import { Router, Request, Response } from 'express';
import { PrismaClient } from '../../src/generated/prisma/index.js';

export function createDashboardRoutes(prisma: PrismaClient): Router {
  const router = Router();

  /**
   * GET /api/dashboard/stats
   * 获取Dashboard统计数据
   */
  router.get('/stats', async (req: Request, res: Response) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);

      // 获取今日执行次数
      const todayExecutions = await prisma.test_runs.count({
        where: {
          started_at: {
            gte: today
          }
        }
      });

      // 获取本周失败数
      const weeklyFailures = await prisma.test_run_results.count({
        where: {
          status: 'FAILED',  // 🔥 修复：使用枚举值（大写）
          executed_at: {
            gte: weekAgo
          }
        }
      });

      // 获取总测试结果用于计算成功率
      const totalResults = await prisma.test_run_results.count();
      const passedResults = await prisma.test_run_results.count({
        where: {
          status: 'PASSED'  // 🔥 修复：使用枚举值（大写）
        }
      });
      const successRate = totalResults > 0 ? (passedResults / totalResults) * 100 : 0;

      // 获取平均执行时长（分钟）
      const avgDuration = await prisma.test_run_results.aggregate({
        _avg: {
          duration_ms: true
        }
      });
      const averageDuration = avgDuration._avg.duration_ms
        ? avgDuration._avg.duration_ms / 1000 / 60  // 转换为分钟
        : 0;

      res.json({
        success: true,
        data: {
          successRate: parseFloat(successRate.toFixed(1)),
          todayExecutions,
          averageDuration: parseFloat(averageDuration.toFixed(1)),
          weeklyFailures
        }
      });
    } catch (error: any) {
      console.error('❌ 获取Dashboard统计数据失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/dashboard/trend
   * 获取成功率趋势数据
   */
  router.get('/trend', async (req: Request, res: Response) => {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const trendData: Array<{ x: string; y: number }> = [];

      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);

        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);

        const dayResults = await prisma.test_run_results.findMany({
          where: {
            executed_at: {
              gte: date,
              lt: nextDate
            }
          }
        });

        const total = dayResults.length;
        const passed = dayResults.filter(r => r.status === 'PASSED').length;  // 🔥 修复：使用枚举值（大写）
        const successRate = total > 0 ? (passed / total) * 100 : 0;

        trendData.push({
          x: date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }),
          y: parseFloat(successRate.toFixed(1))
        });
      }

      res.json({
        success: true,
        data: trendData
      });
    } catch (error: any) {
      console.error('❌ 获取趋势数据失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/dashboard/activities
   * 获取最近活动
   */
  router.get('/activities', async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;

      const recentRuns = await prisma.test_runs.findMany({
        take: limit,
        orderBy: {
          started_at: 'desc'
        },
        include: {
          test_suites: true,
          users: true
        }
      });

      const activities = recentRuns.map(run => ({
        id: run.id,
        description: `执行测试套件: ${run.test_suites.name}`,
        timestamp: run.started_at?.toISOString() || new Date().toISOString(),
        status: run.status === 'PASSED' ? 'success' : run.status === 'FAILED' ? 'error' : 'info',  // 🔥 修复：使用枚举值（大写）
        user: run.users.email || '系统'
      }));

      res.json({
        success: true,
        data: activities
      });
    } catch (error: any) {
      console.error('❌ 获取最近活动失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/dashboard/failure-heatmap
   * 获取失败热力图数据
   */
  router.get('/failure-heatmap', async (req: Request, res: Response) => {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const heatmapData: Array<{ x: string; y: string; value: number }> = [];

      // 获取失败次数最多的测试用例
      const topFailedCases = await prisma.test_run_results.groupBy({
        by: ['case_id'],
        where: {
          status: 'FAILED'  // 🔥 修复：使用枚举值（大写）
        },
        _count: {
          case_id: true
        },
        orderBy: {
          _count: {
            case_id: 'desc'
          }
        },
        take: 5
      });

      // 获取这些用例的详细信息
      const caseIds = topFailedCases.map(c => c.case_id);
      const cases = await prisma.test_cases.findMany({
        where: {
          id: {
            in: caseIds
          }
        }
      });

      const caseMap = new Map(cases.map(c => [c.id, c.title]));

      // 为每个用例和每一天生成数据
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);

        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);

        const dateStr = date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });

        for (const caseId of caseIds) {
          const failureCount = await prisma.test_run_results.count({
            where: {
              case_id: caseId,
              status: 'FAILED',  // 🔥 修复：使用枚举值（大写）
              executed_at: {
                gte: date,
                lt: nextDate
              }
            }
          });

          heatmapData.push({
            x: dateStr,
            y: caseMap.get(caseId) || `用例${caseId}`,
            value: failureCount
          });
        }
      }

      res.json({
        success: true,
        data: heatmapData
      });
    } catch (error: any) {
      console.error('❌ 获取失败热力图数据失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/dashboard/duration-distribution
   * 获取执行时长分布
   */
  router.get('/duration-distribution', async (req: Request, res: Response) => {
    try {
      const results = await prisma.test_run_results.findMany({
        select: {
          duration_ms: true
        }
      });

      const distribution = {
        '0-1分钟': 0,
        '1-2分钟': 0,
        '2-3分钟': 0,
        '3-5分钟': 0,
        '5-10分钟': 0,
        '>10分钟': 0
      };

      results.forEach(result => {
        if (!result.duration_ms) return;

        const minutes = result.duration_ms / 1000 / 60;

        if (minutes < 1) distribution['0-1分钟']++;
        else if (minutes < 2) distribution['1-2分钟']++;
        else if (minutes < 3) distribution['2-3分钟']++;
        else if (minutes < 5) distribution['3-5分钟']++;
        else if (minutes < 10) distribution['5-10分钟']++;
        else distribution['>10分钟']++;
      });

      const distributionData = Object.entries(distribution).map(([range, count]) => ({
        range,
        count
      }));

      res.json({
        success: true,
        data: distributionData
      });
    } catch (error: any) {
      console.error('❌ 获取时长分布数据失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/dashboard/flaky-tests
   * 获取不稳定用例排名
   */
  router.get('/flaky-tests', async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 5;

      // 获取所有有足够运行次数的测试用例
      const caseStats = await prisma.test_run_results.groupBy({
        by: ['case_id'],
        _count: {
          case_id: true
        },
        having: {
          case_id: {
            _count: {
              gte: 5  // 至少运行5次
            }
          }
        }
      });

      const flakyTests: Array<{
        id: number;
        name: string;
        failureRate: number;
        totalRuns: number;
        lastFailure: string;
        severity: 'high' | 'medium' | 'low';
      }> = [];

      for (const stat of caseStats) {
        const totalRuns = stat._count.case_id;

        const failures = await prisma.test_run_results.count({
          where: {
            case_id: stat.case_id,
            status: 'FAILED'  // 🔥 修复：使用枚举值（大写）
          }
        });

        const failureRate = (failures / totalRuns) * 100;

        // 只返回失败率大于15%的用例
        if (failureRate > 15) {
          const testCase = await prisma.test_cases.findUnique({
            where: { id: stat.case_id }
          });

          const lastFailure = await prisma.test_run_results.findFirst({
            where: {
              case_id: stat.case_id,
              status: 'FAILED'  // 🔥 修复：使用枚举值（大写）
            },
            orderBy: {
              executed_at: 'desc'
            }
          });

          if (testCase) {
            const severity = failureRate > 30 ? 'high' : failureRate > 20 ? 'medium' : 'low';

            const timeAgo = lastFailure?.executed_at
              ? getTimeAgo(lastFailure.executed_at)
              : '未知';

            flakyTests.push({
              id: testCase.id,
              name: testCase.title,
              failureRate: parseFloat(failureRate.toFixed(1)),
              totalRuns,
              lastFailure: timeAgo,
              severity
            });
          }
        }
      }

      // 按失败率排序并限制返回数量
      flakyTests.sort((a, b) => b.failureRate - a.failureRate);
      const topFlakyTests = flakyTests.slice(0, limit);

      res.json({
        success: true,
        data: topFlakyTests
      });
    } catch (error: any) {
      console.error('❌ 获取不稳定用例失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}

/**
 * 计算时间差的友好显示
 */
function getTimeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  return `${days}天前`;
}
