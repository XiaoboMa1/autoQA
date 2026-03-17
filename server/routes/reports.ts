import { Router, Request, Response } from 'express';
import { PrismaClient } from '../../src/generated/prisma/index.js';

export function createReportsRoutes(prisma: PrismaClient): Router {
  const router = Router();

  /**
   * 失败原因分类函数
   */
  function categorizeFailureReason(error: string | null): string {
    if (!error) return 'other';

    const lowerError = error.toLowerCase();

    // 断言失败
    if (lowerError.includes('assertion') ||
        lowerError.includes('expect') ||
        lowerError.includes('should') ||
        lowerError.includes('assert')) {
      return 'assertion';
    }

    // 超时
    if (lowerError.includes('timeout') ||
        lowerError.includes('timed out') ||
        lowerError.includes('exceeded')) {
      return 'timeout';
    }

    // 元素未找到
    if (lowerError.includes('not found') ||
        lowerError.includes('element') ||
        lowerError.includes('selector') ||
        lowerError.includes('locator')) {
      return 'element_not_found';
    }

    return 'other';
  }

  /**
   * 获取失败原因的中文名称
   */
  function getFailureReasonName(category: string): string {
    const names: Record<string, string> = {
      'assertion': '断言失败',
      'timeout': '超时',
      'element_not_found': '元素未找到',
      'other': '其他'
    };
    return names[category] || '未知';
  }

  /**
   * 1. 获取BUG统计KPI
   * GET /api/reports/bug-stats
   */
  router.get('/bug-stats', async (req: Request, res: Response) => {
    try {
      const { startDate, endDate, project, suiteId } = req.query;

      // 参数验证
      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: '缺少必需参数: startDate, endDate'
        });
      }

      // 🔥 修复：确保日期范围包含整天
      // startDate 设置为当天的 00:00:00
      // endDate 设置为当天的 23:59:59.999
      const start = new Date(startDate as string);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);

      // 计算上一周期的时间范围
      const duration = end.getTime() - start.getTime();
      const prevStart = new Date(start.getTime() - duration);
      const prevEnd = start;

      // 构建筛选条件
      const whereCondition: any = {
        executed_at: {
          gte: start,
          lte: end
        }
      };

      if (project && project !== 'all') {
        whereCondition.test_runs = {
          test_suites: {
            project: project as string
          }
        };
      }

      if (suiteId && suiteId !== 'all') {
        whereCondition.run_id = {
          in: await prisma.test_runs.findMany({
            where: { suite_id: parseInt(suiteId as string) },
            select: { id: true }
          }).then(runs => runs.map(r => r.id))
        };
      }

      // 当前周期统计
      const [totalResults, failedResults, totalDuration] = await Promise.all([
        // 总执行次数
        prisma.test_run_results.count({ where: whereCondition }),
        // 失败用例数（BUG数）
        prisma.test_run_results.count({
          where: { ...whereCondition, status: 'FAILED' }
        }),
        // 平均执行时长
        prisma.test_run_results.aggregate({
          where: whereCondition,
          _avg: { duration_ms: true }
        })
      ]);

      const passedCases = totalResults - failedResults;
      const successRate = totalResults > 0 ? (passedCases / totalResults) * 100 : 0;
      const avgDuration = totalDuration._avg.duration_ms
        ? totalDuration._avg.duration_ms / 1000 / 60  // 转换为分钟
        : 0;

      // 上一周期统计（用于对比）
      const prevWhereCondition = {
        ...whereCondition,
        executed_at: {
          gte: prevStart,
          lte: prevEnd
        }
      };

      const [prevTotalResults, prevFailedResults, prevTotalDuration] = await Promise.all([
        prisma.test_run_results.count({ where: prevWhereCondition }),
        prisma.test_run_results.count({
          where: { ...prevWhereCondition, status: 'FAILED' }
        }),
        prisma.test_run_results.aggregate({
          where: prevWhereCondition,
          _avg: { duration_ms: true }
        })
      ]);

      const prevPassedCases = prevTotalResults - prevFailedResults;
      const prevSuccessRate = prevTotalResults > 0 ? (prevPassedCases / prevTotalResults) * 100 : 0;
      const prevAvgDuration = prevTotalDuration._avg.duration_ms
        ? prevTotalDuration._avg.duration_ms / 1000 / 60
        : 0;

      // 计算变化
      const bugsChange = failedResults - prevFailedResults;
      const passedChange = passedCases - prevPassedCases;
      const successRateChange = successRate - prevSuccessRate;
      const durationChange = avgDuration - prevAvgDuration;

      res.json({
        success: true,
        data: {
          totalBugs: failedResults,
          passedCases,
          successRate: parseFloat(successRate.toFixed(1)),
          avgDuration: parseFloat(avgDuration.toFixed(1)),
          trend: {
            bugsChange,
            passedChange,
            successRateChange: parseFloat(successRateChange.toFixed(1)),
            durationChange: parseFloat(durationChange.toFixed(1))
          }
        }
      });
    } catch (error: any) {
      console.error('❌ 获取BUG统计失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * 2. 获取BUG趋势数据
   * GET /api/reports/bug-trend
   */
  router.get('/bug-trend', async (req: Request, res: Response) => {
    try {
      const { startDate, endDate, project, suiteId, granularity = 'day' } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: '缺少必需参数: startDate, endDate'
        });
      }

      // 🔥 修复：确保日期范围包含整天
      // startDate 设置为当天的 00:00:00
      // endDate 设置为当天的 23:59:59.999
      const start = new Date(startDate as string);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);

      // 构建筛选条件
      const whereCondition: any = {
        executed_at: {
          gte: start,
          lte: end
        }
      };

      if (project && project !== 'all') {
        whereCondition.test_runs = {
          test_suites: {
            project: project as string
          }
        };
      }

      if (suiteId && suiteId !== 'all') {
        whereCondition.run_id = {
          in: await prisma.test_runs.findMany({
            where: { suite_id: parseInt(suiteId as string) },
            select: { id: true }
          }).then(runs => runs.map(r => r.id))
        };
      }

      // 获取所有结果
      const results = await prisma.test_run_results.findMany({
        where: whereCondition,
        select: {
          executed_at: true,
          status: true
        },
        orderBy: {
          executed_at: 'asc'
        }
      });

      // 按日期分组统计
      const trendMap = new Map<string, { bugCount: number; caseCount: number }>();

      results.forEach(result => {
        if (!result.executed_at) return;

        const dateKey = result.executed_at.toISOString().split('T')[0]; // YYYY-MM-DD

        if (!trendMap.has(dateKey)) {
          trendMap.set(dateKey, { bugCount: 0, caseCount: 0 });
        }

        const stats = trendMap.get(dateKey)!;
        stats.caseCount++;
        if (result.status === 'FAILED') {
          stats.bugCount++;
        }
      });

      // 转换为数组
      const trendData = Array.from(trendMap.entries()).map(([date, stats]) => ({
        date,
        bugCount: stats.bugCount,
        caseCount: stats.caseCount
      }));

      res.json({
        success: true,
        data: trendData
      });
    } catch (error: any) {
      console.error('❌ 获取BUG趋势失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * 3. 获取失败原因分布
   * GET /api/reports/failure-reasons
   */
  router.get('/failure-reasons', async (req: Request, res: Response) => {
    try {
      const { startDate, endDate, project, suiteId } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: '缺少必需参数: startDate, endDate'
        });
      }

      // 🔥 修复：确保日期范围包含整天
      // startDate 设置为当天的 00:00:00
      // endDate 设置为当天的 23:59:59.999
      const start = new Date(startDate as string);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);

      // 🔥 修复：通过 test_suites.project 过滤项目，保持与其他API一致
      // 由于 test_case_executions 没有直接关联到 test_suites，我们需要先找到符合条件的用例ID
      let caseIds: number[] | undefined = undefined;

      if ((project && project !== 'all') || (suiteId && suiteId !== 'all')) {
        // 构建套件筛选条件
        const suiteWhere: any = {};
        if (project && project !== 'all') {
          suiteWhere.project = project as string;
        }
        if (suiteId && suiteId !== 'all') {
          suiteWhere.id = parseInt(suiteId as string);
        }

        // 获取符合条件的套件
        const suites = await prisma.test_suites.findMany({
          where: suiteWhere,
          select: { id: true }
        });

        if (suites.length === 0) {
          // 如果没有符合条件的套件，返回空结果
          return res.json({
            success: true,
            data: []
          });
        }

        // 获取这些套件下的所有用例ID
        const suiteIds = suites.map(s => s.id);
        const suiteCases = await prisma.suite_case_map.findMany({
          where: { suite_id: { in: suiteIds } },
          select: { case_id: true }
        });
        caseIds = suiteCases.map(sc => sc.case_id);

        if (caseIds.length === 0) {
          // 如果套件下没有用例，返回空结果
          return res.json({
            success: true,
            data: []
          });
        }
      }

      // 构建筛选条件
      const whereCondition: any = {
        status: 'failed', // test_case_executions 使用小写
        finished_at: { // 使用 finished_at 而不是 queued_at，因为我们需要执行完成的时间
          gte: start,
          lte: end
          // finished_at 不为 null 的条件通过 status='failed' 已经隐含了（失败的用例应该有 finished_at）
        }
      };

      // 如果有用例ID限制，添加过滤条件
      if (caseIds && caseIds.length > 0) {
        whereCondition.test_case_id = {
          in: caseIds
        };
      }

      // 获取失败的测试用例执行记录
      // 由于test_run_results没有error字段，我们从test_case_executions获取错误信息
      const failedExecutions = await prisma.test_case_executions.findMany({
        where: whereCondition,
        select: {
          error_message: true
        }
      });

      // 分类统计
      const categoryCount: Record<string, number> = {
        assertion: 0,
        timeout: 0,
        element_not_found: 0,
        other: 0
      };

      failedExecutions.forEach(execution => {
        const category = categorizeFailureReason(execution.error_message);
        categoryCount[category]++;
      });

      // 计算总数和百分比
      const total = Object.values(categoryCount).reduce((sum, count) => sum + count, 0);

      const distribution = Object.entries(categoryCount).map(([category, count]) => ({
        category,
        categoryName: getFailureReasonName(category),
        count,
        percentage: total > 0 ? parseFloat(((count / total) * 100).toFixed(1)) : 0
      }));

      res.json({
        success: true,
        data: distribution
      });
    } catch (error: any) {
      console.error('❌ 获取失败原因分布失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * 4. 获取不稳定用例Top 10
   * GET /api/reports/flaky-tests
   */
  router.get('/flaky-tests', async (req: Request, res: Response) => {
    try {
      const { startDate, endDate, project, suiteId, limit = '10' } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: '缺少必需参数: startDate, endDate'
        });
      }

      // 🔥 修复：确保日期范围包含整天
      // startDate 设置为当天的 00:00:00
      // endDate 设置为当天的 23:59:59.999
      const start = new Date(startDate as string);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);
      const limitNum = parseInt(limit as string);

      // 构建筛选条件
      const whereCondition: any = {
        executed_at: {
          gte: start,
          lte: end
        }
      };

      if (project && project !== 'all') {
        whereCondition.test_runs = {
          test_suites: {
            project: project as string
          }
        };
      }

      if (suiteId && suiteId !== 'all') {
        whereCondition.run_id = {
          in: await prisma.test_runs.findMany({
            where: { suite_id: parseInt(suiteId as string) },
            select: { id: true }
          }).then(runs => runs.map(r => r.id))
        };
      }

      // 获取所有执行记录
      const results = await prisma.test_run_results.findMany({
        where: whereCondition,
        include: {
          test_cases: true,
          test_runs: {
            include: {
              test_suites: true
            }
          }
        }
      });

      // 按用例分组统计
      const caseStats = new Map<number, {
        caseId: number;
        caseName: string;
        suiteName: string;
        totalRuns: number;
        failures: number;
        lastFailure: Date | null;
      }>();

      results.forEach(result => {
        const caseId = result.case_id;

        if (!caseStats.has(caseId)) {
          caseStats.set(caseId, {
            caseId,
            caseName: result.test_cases.title,
            suiteName: result.test_runs.test_suites.name,
            totalRuns: 0,
            failures: 0,
            lastFailure: null
          });
        }

        const stats = caseStats.get(caseId)!;
        stats.totalRuns++;

        if (result.status === 'FAILED') {
          stats.failures++;
          if (!stats.lastFailure || (result.executed_at && result.executed_at > stats.lastFailure)) {
            stats.lastFailure = result.executed_at;
          }
        }
      });

      // 筛选至少运行5次的用例，计算失败率并排序
      const flakyTests = Array.from(caseStats.values())
        .filter(stats => stats.totalRuns >= 5)
        .map(stats => {
          const failureRate = (stats.failures / stats.totalRuns) * 100;
          const severity = failureRate > 30 ? 'high' : failureRate > 15 ? 'medium' : 'low';

          return {
            ...stats,
            failureRate: parseFloat(failureRate.toFixed(1)),
            severity,
            lastFailure: stats.lastFailure ? stats.lastFailure.toISOString() : null
          };
        })
        .sort((a, b) => b.failureRate - a.failureRate)
        .slice(0, limitNum);

      res.json({
        success: true,
        data: flakyTests
      });
    } catch (error: any) {
      console.error('❌ 获取不稳定用例失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * 5. 获取失败用例详细列表
   * GET /api/reports/failed-cases
   */
  router.get('/failed-cases', async (req: Request, res: Response) => {
    try {
      const {
        startDate,
        endDate,
        project,
        suiteId,
        page = '1',
        pageSize = '20'
      } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: '缺少必需参数: startDate, endDate'
        });
      }

      // 🔥 修复：确保日期范围包含整天
      // startDate 设置为当天的 00:00:00
      // endDate 设置为当天的 23:59:59.999
      const start = new Date(startDate as string);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);
      const pageNum = parseInt(page as string);
      const pageSizeNum = parseInt(pageSize as string);
      const skip = (pageNum - 1) * pageSizeNum;

      // 构建筛选条件
      const whereCondition: any = {
        status: 'FAILED',
        executed_at: {
          gte: start,
          lte: end
        }
      };

      if (project && project !== 'all') {
        whereCondition.test_runs = {
          test_suites: {
            project: project as string
          }
        };
      }

      if (suiteId && suiteId !== 'all') {
        whereCondition.run_id = {
          in: await prisma.test_runs.findMany({
            where: { suite_id: parseInt(suiteId as string) },
            select: { id: true }
          }).then(runs => runs.map(r => r.id))
        };
      }

      // 获取总数
      const total = await prisma.test_run_results.count({ where: whereCondition });

      // 获取分页数据
      const failedCases = await prisma.test_run_results.findMany({
        where: whereCondition,
        include: {
          test_cases: true,
          test_runs: {
            include: {
              test_suites: true,
              users: true
            }
          }
        },
        orderBy: {
          executed_at: 'desc'
        },
        skip,
        take: pageSizeNum
      });

      // 尝试获取对应的错误信息（从test_case_executions）
      const caseIds = failedCases.map(c => c.case_id);
      const errorRecords = await prisma.test_case_executions.findMany({
        where: {
          test_case_id: { // test_case_executions 使用 test_case_id 而不是 case_id
            in: caseIds
          },
          status: 'failed', // test_case_executions 使用小写
          finished_at: { // 使用 finished_at 而不是 queued_at，因为我们需要执行完成的时间
            gte: start,
            lte: end
            // finished_at 不为 null 的条件通过 status='failed' 已经隐含了（失败的用例应该有 finished_at）
          }
        },
        select: {
          test_case_id: true, // test_case_executions 使用 test_case_id
          error_message: true
        }
      });

      const errorMap = new Map<number, string>();
      errorRecords.forEach(record => {
        if (record.error_message && !errorMap.has(record.test_case_id)) {
          errorMap.set(record.test_case_id, record.error_message);
        }
      });

      // 格式化返回数据
      const data = failedCases.map(failedCase => {
        const errorMessage = errorMap.get(failedCase.case_id) || '';
        const errorCategory = categorizeFailureReason(errorMessage);

        return {
          id: failedCase.id,
          timestamp: failedCase.executed_at,
          caseName: failedCase.test_cases.title,
          suiteName: failedCase.test_runs.test_suites.name,
          executor: failedCase.test_runs.users.email || '未知',
          failureReason: errorMessage.substring(0, 100) || '无详细信息',
          errorCategory: getFailureReasonName(errorCategory),
          screenshotUrl: failedCase.screenshot_url,
          hasLogs: !!errorMessage
        };
      });

      res.json({
        success: true,
        data: {
          records: data,
          total,
          page: pageNum,
          pageSize: pageSizeNum,
          totalPages: Math.ceil(total / pageSizeNum)
        }
      });
    } catch (error: any) {
      console.error('❌ 获取失败用例列表失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * 6. 获取套件统计
   * GET /api/reports/suite-summary
   */
  router.get('/suite-summary', async (req: Request, res: Response) => {
    try {
      const { startDate, endDate, project } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: '缺少必需参数: startDate, endDate'
        });
      }

      // 🔥 修复：确保日期范围包含整天
      // startDate 设置为当天的 00:00:00
      // endDate 设置为当天的 23:59:59.999
      const start = new Date(startDate as string);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);

      // 获取所有测试套件
      const suites = await prisma.test_suites.findMany({
        where: project && project !== 'all'
          ? { project: project as string }
          : {},
        include: {
          test_runs: {
            where: {
              started_at: {
                gte: start,
                lte: end
              }
            },
            include: {
              test_run_results: true
            }
          }
        }
      });

      // 统计每个套件的数据
      const summaryData = suites.map(suite => {
        const runs = suite.test_runs;
        const executions = runs.length;

        let totalResults = 0;
        let passedResults = 0;
        let totalDuration = 0;
        let bugCount = 0;

        runs.forEach(run => {
          run.test_run_results.forEach(result => {
            totalResults++;
            if (result.status === 'PASSED') {
              passedResults++;
            } else if (result.status === 'FAILED') {
              bugCount++;
            }
            if (result.duration_ms) {
              totalDuration += result.duration_ms;
            }
          });
        });

        const successRate = totalResults > 0 ? (passedResults / totalResults) * 100 : 0;
        const avgDuration = totalResults > 0 ? totalDuration / totalResults / 1000 / 60 : 0;

        return {
          suiteId: suite.id,
          suiteName: suite.name,
          executions,
          successRate: parseFloat(successRate.toFixed(1)),
          bugCount,
          avgDuration: parseFloat(avgDuration.toFixed(1)),
          trend: 'stable' // 简化处理，后续可添加趋势计算逻辑
        };
      });

      // 按BUG数量排序
      summaryData.sort((a, b) => b.bugCount - a.bugCount);

      res.json({
        success: true,
        data: summaryData
      });
    } catch (error: any) {
      console.error('❌ 获取套件统计失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * 获取所有项目列表（从项目管理 systems 表获取）
   * GET /api/reports/projects
   */
  router.get('/projects', async (req: Request, res: Response) => {
    try {
      // 从 systems 表获取所有启用的项目（系统名称就是项目名称）
      const systems = await prisma.systems.findMany({
        where: {
          status: 'active'
        },
        select: {
          name: true
        },
        orderBy: [
          { sort_order: 'asc' },
          { name: 'asc' }
        ]
      });

      // 提取项目名称列表
      const projects = systems.map(system => system.name);

      res.json({
        success: true,
        data: projects
      });
    } catch (error: any) {
      console.error('❌ 获取项目列表失败:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}
