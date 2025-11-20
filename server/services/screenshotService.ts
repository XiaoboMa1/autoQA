import { PrismaClient } from '../../src/generated/prisma';
import { ScreenshotRecord, StorageStats, ScreenshotStatus, ScreenshotQueryOptions } from '../types/screenshot';
import * as fs from 'fs';
import * as path from 'path';
import { screenshotConfig } from '../../src/utils/screenshotConfig.js';

export interface ScreenshotCleanupConfig {
  defaultRetentionDays: number;
  batchSize: number;
  enableSafetyChecks: boolean;
  screenshotsDirectory: string;
}

export interface CleanupStats {
  totalFound: number;
  filesDeleted: number;
  filesNotFound: number;
  fileDeleteErrors: number;
  recordsDeleted: number;
  recordDeleteErrors: number;
}

export class ScreenshotService {
  private prisma: PrismaClient;
  private cleanupConfig: ScreenshotCleanupConfig;

  constructor(prisma?: PrismaClient, cleanupConfig?: Partial<ScreenshotCleanupConfig>) {
    this.prisma = prisma || new PrismaClient();
    
    // 🔥 使用统一的截图配置
    this.cleanupConfig = {
      defaultRetentionDays: screenshotConfig.getRetentionDays(),
      batchSize: 50,
      enableSafetyChecks: true,
      screenshotsDirectory: screenshotConfig.getScreenshotsDirectory(),
      ...cleanupConfig,
    };
    
    // 确保截图目录存在
    screenshotConfig.ensureScreenshotsDirectory();
  }

  /**
   * 保存截图记录到数据库
   * @param record 截图记录信息
   * @returns 保存后的截图记录
   */
  async saveScreenshot(record: ScreenshotRecord): Promise<ScreenshotRecord> {
    try {
      // 验证必需字段
      if (!record.runId) {
        throw new Error('runId is required');
      }
      if (!record.filePath) {
        throw new Error('filePath is required');
      }
      if (!record.fileName) {
        throw new Error('fileName is required');
      }
      if (!record.status) {
        throw new Error('status is required');
      }

      // 获取文件大小（如果未提供）
      let fileSize = record.fileSize;
      if (!fileSize && record.filePath) {
        try {
          const fullPath = path.resolve(record.filePath);
          const stats = await fs.promises.stat(fullPath);
          fileSize = stats.size;
        } catch (error) {
          console.warn(`无法获取截图文件大小: ${record.filePath}`, error);
          fileSize = 0;
        }
      }

      // 保存到数据库
      const savedRecord = await this.prisma.step_screenshots.create({
        data: {
          run_id: record.runId,
          test_case_id: record.testCaseId || null,
          step_index: record.stepIndex.toString(),
          step_description: record.stepDescription || null,
          status: record.status as any, // Prisma enum type
          file_path: record.filePath,
          file_name: record.fileName,
          file_size: fileSize ? BigInt(fileSize) : null,
          mime_type: record.mimeType || 'image/png',
          file_exists: record.fileExists !== undefined ? record.fileExists : true,
        },
      });

      console.log(`✅ 截图记录已保存到数据库: ${record.fileName} (ID: ${savedRecord.id})`);

      // 转换返回结果
      return {
        id: savedRecord.id,
        runId: savedRecord.run_id,
        testCaseId: savedRecord.test_case_id || undefined,
        stepIndex: savedRecord.step_index,
        stepDescription: savedRecord.step_description || undefined,
        status: savedRecord.status as ScreenshotStatus,
        filePath: savedRecord.file_path,
        fileName: savedRecord.file_name,
        fileSize: savedRecord.file_size !== null ? Number(savedRecord.file_size) : undefined,
        mimeType: savedRecord.mime_type || undefined,
        createdAt: savedRecord.created_at || undefined,
        fileExists: savedRecord.file_exists,
      };
    } catch (error: any) {
      console.error(`❌ 保存截图记录失败: ${error.message}`, {
        runId: record.runId,
        fileName: record.fileName,
        error: error.message,
      });
      throw new Error(`保存截图记录失败: ${error.message}`);
    }
  }

  /**
   * 获取测试运行的所有截图记录，按步骤顺序排列
   * @param runId 测试运行ID
   * @param options 查询选项，包含排序和分页参数
   * @returns 截图记录数组
   */
  async getScreenshotsByRunId(
    runId: string, 
    options?: ScreenshotQueryOptions
  ): Promise<ScreenshotRecord[]> {
    try {
      if (!runId) {
        throw new Error('runId is required');
      }

      const {
        orderBy = 'step_index',
        orderDirection = 'asc',
        limit,
        offset
      } = options || {};

      console.log(`🔍 查询测试运行截图: ${runId}`, { orderBy, orderDirection, limit, offset });

      // 构建查询条件
      const queryOptions: any = {
        where: {
          run_id: runId,
        },
        orderBy: {},
      };

      // 设置排序
      if (orderBy === 'step_index') {
        // 对于step_index，我们需要自定义排序逻辑来处理数字和字符串混合
        queryOptions.orderBy = [
          { step_index: orderDirection },
          { created_at: 'asc' } // 二级排序
        ];
      } else {
        queryOptions.orderBy = { [orderBy]: orderDirection };
      }

      // 设置分页
      if (limit !== undefined) {
        queryOptions.take = limit;
      }
      if (offset !== undefined) {
        queryOptions.skip = offset;
      }

      const screenshots = await this.prisma.step_screenshots.findMany(queryOptions);

      console.log(`✅ 找到 ${screenshots.length} 个截图记录`);

      // 转换结果格式
      const result = screenshots.map(this.convertPrismaToScreenshotRecord);

      // 如果按step_index排序，进行自定义排序以正确处理数字顺序
      if (orderBy === 'step_index') {
        result.sort((a, b) => {
          const aIndex = this.parseStepIndex(a.stepIndex);
          const bIndex = this.parseStepIndex(b.stepIndex);
          
          const comparison = aIndex - bIndex;
          return orderDirection === 'asc' ? comparison : -comparison;
        });
      }

      return result;
    } catch (error: any) {
      console.error(`❌ 查询测试运行截图失败: ${error.message}`, {
        runId,
        error: error.message,
      });
      throw new Error(`查询测试运行截图失败: ${error.message}`);
    }
  }

  /**
   * 获取特定步骤的截图记录
   * @param runId 测试运行ID
   * @param stepIndex 步骤索引
   * @returns 截图记录或null
   */
  async getStepScreenshot(runId: string, stepIndex: string | number): Promise<ScreenshotRecord | null> {
    try {
      if (!runId) {
        throw new Error('runId is required');
      }
      if (stepIndex === undefined || stepIndex === null) {
        throw new Error('stepIndex is required');
      }

      console.log(`🔍 查询特定步骤截图: ${runId}, step: ${stepIndex}`);

      const screenshot = await this.prisma.step_screenshots.findFirst({
        where: {
          run_id: runId,
          step_index: stepIndex.toString(),
        },
        orderBy: {
          created_at: 'desc', // 如果有多个相同步骤的截图，返回最新的
        },
      });

      if (!screenshot) {
        console.log(`📷 未找到步骤截图: ${runId}, step: ${stepIndex}`);
        return null;
      }

      console.log(`✅ 找到步骤截图: ${screenshot.file_name}`);

      return this.convertPrismaToScreenshotRecord(screenshot);
    } catch (error: any) {
      console.error(`❌ 查询特定步骤截图失败: ${error.message}`, {
        runId,
        stepIndex,
        error: error.message,
      });
      throw new Error(`查询特定步骤截图失败: ${error.message}`);
    }
  }

  /**
   * 检查截图文件是否存在并更新数据库状态
   * @param screenshotId 截图记录ID
   * @returns 文件是否存在
   */
  async verifyScreenshotFile(screenshotId: number): Promise<boolean> {
    // 🔥 如果禁用文件验证，直接返回true
    if (!screenshotConfig.isFileVerificationEnabled()) {
      console.log(`🔍 文件验证已禁用，跳过验证: ID ${screenshotId}`);
      return true;
    }

    try {
      if (!screenshotId) {
        throw new Error('screenshotId is required');
      }

      console.log(`🔍 验证截图文件存在性: ID ${screenshotId}`);

      // 获取截图记录
      const screenshot = await this.prisma.step_screenshots.findUnique({
        where: { id: screenshotId },
      });

      if (!screenshot) {
        console.warn(`⚠️ 截图记录不存在: ID ${screenshotId}`);
        return false;
      }

      // 检查文件是否存在
      const fullPath = path.resolve(screenshot.file_path);
      let fileExists = false;

      try {
        await fs.promises.access(fullPath, fs.constants.F_OK);
        fileExists = true;
        console.log(`✅ 截图文件存在: ${screenshot.file_name}`);
      } catch (error) {
        console.warn(`❌ 截图文件不存在: ${screenshot.file_name} (${fullPath})`);
        fileExists = false;
      }

      // 更新数据库中的file_exists字段
      if (screenshot.file_exists !== fileExists) {
        await this.prisma.step_screenshots.update({
          where: { id: screenshotId },
          data: { file_exists: fileExists },
        });
        console.log(`📝 已更新截图文件存在状态: ${screenshot.file_name} -> ${fileExists}`);
      }

      return fileExists;
    } catch (error: any) {
      console.error(`❌ 验证截图文件失败: ${error.message}`, {
        screenshotId,
        error: error.message,
      });
      throw new Error(`验证截图文件失败: ${error.message}`);
    }
  }

  /**
   * 批量验证截图文件存在性
   * @param screenshotIds 截图记录ID数组，如果为空则验证所有记录
   * @param batchSize 批处理大小，默认100
   * @returns 验证结果统计
   */
  async verifyScreenshotFiles(
    screenshotIds?: number[], 
    batchSize: number = 100
  ): Promise<{ total: number; existing: number; missing: number; errors: number }> {
    // 🔥 如果禁用文件验证，直接返回模拟的统计结果
    if (!screenshotConfig.isFileVerificationEnabled()) {
      console.log(`🔍 文件验证已禁用，跳过批量验证`);
      return {
        total: 0,
        existing: 0,
        missing: 0,
        errors: 0
      };
    }

    try {
      console.log(`🔍 开始批量验证截图文件存在性`, { 
        screenshotIds: screenshotIds?.length || 'all', 
        batchSize 
      });

      let screenshots;
      if (screenshotIds && screenshotIds.length > 0) {
        // 验证指定的截图记录
        screenshots = await this.prisma.step_screenshots.findMany({
          where: { id: { in: screenshotIds } },
          select: { id: true, file_path: true, file_name: true, file_exists: true },
        });
      } else {
        // 验证所有截图记录
        screenshots = await this.prisma.step_screenshots.findMany({
          select: { id: true, file_path: true, file_name: true, file_exists: true },
        });
      }

      const stats = {
        total: screenshots.length,
        existing: 0,
        missing: 0,
        errors: 0,
      };

      console.log(`📊 找到 ${stats.total} 个截图记录需要验证`);

      // 分批处理
      for (let i = 0; i < screenshots.length; i += batchSize) {
        const batch = screenshots.slice(i, i + batchSize);
        console.log(`🔄 处理批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(screenshots.length / batchSize)} (${batch.length} 个记录)`);

        const batchPromises = batch.map(async (screenshot) => {
          try {
            const fullPath = path.resolve(screenshot.file_path);
            let fileExists = false;

            try {
              await fs.promises.access(fullPath, fs.constants.F_OK);
              fileExists = true;
              stats.existing++;
            } catch (error) {
              fileExists = false;
              stats.missing++;
            }

            // 更新数据库状态（仅当状态发生变化时）
            if (screenshot.file_exists !== fileExists) {
              await this.prisma.step_screenshots.update({
                where: { id: screenshot.id },
                data: { file_exists: fileExists },
              });
            }

            return { id: screenshot.id, exists: fileExists };
          } catch (error: any) {
            console.error(`❌ 验证截图文件失败: ${screenshot.file_name}`, error);
            stats.errors++;
            return { id: screenshot.id, exists: false, error: error.message };
          }
        });

        await Promise.all(batchPromises);
      }

      console.log(`✅ 批量验证完成`, stats);
      return stats;
    } catch (error: any) {
      console.error(`❌ 批量验证截图文件失败: ${error.message}`, error);
      throw new Error(`批量验证截图文件失败: ${error.message}`);
    }
  }

  /**
   * 创建定期验证任务
   * @param intervalHours 验证间隔（小时），默认24小时
   * @returns 定时器ID，可用于取消任务
   */
  createPeriodicVerificationTask(intervalHours: number = 24): NodeJS.Timeout {
    console.log(`⏰ 创建定期验证任务，间隔: ${intervalHours} 小时`);

    const intervalMs = intervalHours * 60 * 60 * 1000;
    
    const timer = setInterval(async () => {
      try {
        console.log(`🔄 开始定期截图文件验证任务`);
        const stats = await this.verifyScreenshotFiles();
        console.log(`✅ 定期验证任务完成`, stats);

        // 如果发现大量缺失文件，记录警告
        if (stats.missing > 0) {
          const missingPercentage = (stats.missing / stats.total) * 100;
          if (missingPercentage > 10) {
            console.warn(`⚠️ 发现大量截图文件缺失: ${stats.missing}/${stats.total} (${missingPercentage.toFixed(1)}%)`);
          }
        }
      } catch (error: any) {
        console.error(`❌ 定期验证任务执行失败: ${error.message}`, error);
      }
    }, intervalMs);

    // 立即执行一次验证
    setTimeout(async () => {
      try {
        console.log(`🚀 执行初始截图文件验证`);
        await this.verifyScreenshotFiles();
      } catch (error: any) {
        console.error(`❌ 初始验证任务执行失败: ${error.message}`, error);
      }
    }, 1000);

    return timer;
  }

  /**
   * 清理过期截图文件和数据库记录
   * @param daysToKeep 保留天数，如果未提供则使用配置中的默认值
   * @returns 删除的记录数量
   */
  async cleanupExpiredScreenshots(daysToKeep?: number): Promise<number> {
    const retentionDays = daysToKeep ?? this.cleanupConfig.defaultRetentionDays;
    const stats = await this.cleanupExpiredScreenshotsWithStats(retentionDays);
    return stats.recordsDeleted;
  }

  /**
   * 清理过期截图文件和数据库记录（返回详细统计）
   * @param daysToKeep 保留天数
   * @returns 详细的清理统计信息
   */
  async cleanupExpiredScreenshotsWithStats(daysToKeep: number): Promise<CleanupStats> {
    try {
      if (!daysToKeep || daysToKeep < 0) {
        throw new Error('daysToKeep must be a positive number');
      }

      console.log(`🧹 开始清理过期截图，保留天数: ${daysToKeep}`);

      // 计算截止日期
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      console.log(`📅 清理截止日期: ${cutoffDate.toISOString()}`);

      // 查找过期的截图记录
      const expiredScreenshots = await this.prisma.step_screenshots.findMany({
        where: {
          created_at: {
            lt: cutoffDate,
          },
        },
        select: {
          id: true,
          file_path: true,
          file_name: true,
          created_at: true,
        },
      });

      console.log(`📊 找到 ${expiredScreenshots.length} 个过期截图记录`);

      if (expiredScreenshots.length === 0) {
        console.log(`✅ 没有需要清理的过期截图`);
        return {
          totalFound: 0,
          filesDeleted: 0,
          filesNotFound: 0,
          fileDeleteErrors: 0,
          recordsDeleted: 0,
          recordDeleteErrors: 0,
        };
      }

      const cleanupStats: CleanupStats = {
        totalFound: expiredScreenshots.length,
        filesDeleted: 0,
        filesNotFound: 0,
        fileDeleteErrors: 0,
        recordsDeleted: 0,
        recordDeleteErrors: 0,
      };

      // 分批处理文件删除和数据库记录删除
      const batchSize = this.cleanupConfig.batchSize;
      for (let i = 0; i < expiredScreenshots.length; i += batchSize) {
        const batch = expiredScreenshots.slice(i, i + batchSize);
        console.log(`🔄 处理清理批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(expiredScreenshots.length / batchSize)} (${batch.length} 个记录)`);

        // 删除文件
        const fileDeletePromises = batch.map(async (screenshot) => {
          try {
            const fullPath = path.resolve(screenshot.file_path);
            
            // 检查文件是否存在
            try {
              await fs.promises.access(fullPath, fs.constants.F_OK);
              
              // 安全检查：确保文件在配置的screenshots目录中
              if (this.cleanupConfig.enableSafetyChecks) {
                const screenshotsDir = path.resolve(this.cleanupConfig.screenshotsDirectory);
                const normalizedPath = path.normalize(fullPath);
                if (!normalizedPath.startsWith(screenshotsDir)) {
                  console.warn(`⚠️ 跳过删除文件（不在screenshots目录中）: ${fullPath}`);
                  return { id: screenshot.id, fileDeleted: false, reason: 'path_outside_screenshots_dir' };
                }
              }

              // 删除文件
              await fs.promises.unlink(fullPath);
              cleanupStats.filesDeleted++;
              console.log(`🗑️ 已删除截图文件: ${screenshot.file_name}`);
              return { id: screenshot.id, fileDeleted: true };
            } catch (accessError) {
              // 文件不存在
              cleanupStats.filesNotFound++;
              console.log(`📄 截图文件不存在（跳过删除）: ${screenshot.file_name}`);
              return { id: screenshot.id, fileDeleted: false, reason: 'file_not_found' };
            }
          } catch (error: any) {
            cleanupStats.fileDeleteErrors++;
            console.error(`❌ 删除截图文件失败: ${screenshot.file_name}`, error);
            return { id: screenshot.id, fileDeleted: false, error: error.message };
          }
        });

        await Promise.all(fileDeletePromises);

        // 删除数据库记录
        try {
          const batchIds = batch.map(s => s.id);
          const deleteResult = await this.prisma.step_screenshots.deleteMany({
            where: {
              id: { in: batchIds },
            },
          });

          cleanupStats.recordsDeleted += deleteResult.count;
          console.log(`📝 已删除 ${deleteResult.count} 个数据库记录`);
        } catch (error: any) {
          cleanupStats.recordDeleteErrors += batch.length;
          console.error(`❌ 删除数据库记录失败`, error);
        }
      }

      // 记录清理统计
      console.log(`✅ 截图清理完成`, cleanupStats);

      // 记录清理日志
      const logMessage = `截图清理完成: 找到${cleanupStats.totalFound}个过期记录, ` +
        `删除${cleanupStats.filesDeleted}个文件, ${cleanupStats.filesNotFound}个文件不存在, ` +
        `${cleanupStats.fileDeleteErrors}个文件删除失败, 删除${cleanupStats.recordsDeleted}个数据库记录, ` +
        `${cleanupStats.recordDeleteErrors}个记录删除失败`;
      
      console.log(`📊 ${logMessage}`);

      return cleanupStats;
    } catch (error: any) {
      console.error(`❌ 清理过期截图失败: ${error.message}`, error);
      throw new Error(`清理过期截图失败: ${error.message}`);
    }
  }

  /**
   * 创建定期清理任务
   * @param intervalHours 清理间隔（小时），默认24小时
   * @param daysToKeep 保留天数，如果未提供则使用配置中的默认值
   * @returns 定时器ID，可用于取消任务
   */
  createPeriodicCleanupTask(intervalHours: number = 24, daysToKeep?: number): NodeJS.Timeout {
    const retentionDays = daysToKeep ?? this.cleanupConfig.defaultRetentionDays;
    console.log(`⏰ 创建定期清理任务，间隔: ${intervalHours} 小时，保留天数: ${retentionDays}`);

    const intervalMs = intervalHours * 60 * 60 * 1000;
    
    const timer = setInterval(async () => {
      try {
        console.log(`🔄 开始定期截图清理任务`);
        const stats = await this.cleanupExpiredScreenshotsWithStats(retentionDays);
        console.log(`✅ 定期清理任务完成`, stats);

        // 如果清理过程中出现大量错误，记录警告
        if (stats.fileDeleteErrors > 0 || stats.recordDeleteErrors > 0) {
          console.warn(`⚠️ 清理过程中出现错误: 文件删除错误${stats.fileDeleteErrors}个, 记录删除错误${stats.recordDeleteErrors}个`);
        }
      } catch (error: any) {
        console.error(`❌ 定期清理任务执行失败: ${error.message}`, error);
      }
    }, intervalMs);

    return timer;
  }

  /**
   * 更新清理配置
   * @param config 新的配置选项
   */
  updateCleanupConfig(config: Partial<ScreenshotCleanupConfig>): void {
    this.cleanupConfig = {
      ...this.cleanupConfig,
      ...config,
    };
    console.log(`📝 已更新清理配置`, this.cleanupConfig);
  }

  /**
   * 获取当前清理配置
   * @returns 当前的清理配置
   */
  getCleanupConfig(): ScreenshotCleanupConfig {
    return { ...this.cleanupConfig };
  }

  /**
   * 获取存储统计信息
   * @returns 存储统计数据
   */
  async getStorageStats(): Promise<StorageStats> {
    try {
      console.log(`📊 开始获取截图存储统计信息`);

      // 获取基本统计信息
      const totalScreenshots = await this.prisma.step_screenshots.count();
      
      if (totalScreenshots === 0) {
        console.log(`📊 没有找到截图记录`);
        return {
          totalScreenshots: 0,
          totalSize: 0,
          avgFileSize: 0,
          oldestScreenshot: new Date(),
          newestScreenshot: new Date(),
          missingFiles: 0,
          sizeByStatus: {
            success: 0,
            failed: 0,
            error: 0,
            completed: 0,
          },
          countByStatus: {
            success: 0,
            failed: 0,
            error: 0,
            completed: 0,
          },
          largestFile: null,
          smallestFile: null,
          recentActivity: {
            last24Hours: 0,
            last7Days: 0,
            last30Days: 0,
          },
          storageHealth: {
            healthScore: 100,
            issues: [],
            recommendations: [],
          },
        };
      }

      // 并行执行多个查询以提高性能
      const [
        sizeStats,
        timeStats,
        missingFiles,
        statusStats,
        extremeFiles,
        recentActivity
      ] = await Promise.all([
        // 获取文件大小统计
        this.prisma.step_screenshots.aggregate({
          _sum: { file_size: true },
          _avg: { file_size: true },
        }),
        
        // 获取时间范围统计
        this.prisma.step_screenshots.aggregate({
          _min: { created_at: true },
          _max: { created_at: true },
        }),
        
        // 获取缺失文件数量
        this.prisma.step_screenshots.count({
          where: { file_exists: false },
        }),
        
        // 按状态分组统计
        this.prisma.step_screenshots.groupBy({
          by: ['status'],
          _count: { _all: true },
          _sum: { file_size: true },
        }),
        
        // 获取最大和最小文件
        this.prisma.step_screenshots.findMany({
          where: {
            file_size: { not: null },
            file_exists: true,
          },
          select: {
            file_name: true,
            file_size: true,
            run_id: true,
          },
          orderBy: { file_size: 'desc' },
          take: 1,
        }).then(async (largest) => {
          const smallest = await this.prisma.step_screenshots.findMany({
            where: {
              file_size: { not: null, gt: 0 },
              file_exists: true,
            },
            select: {
              file_name: true,
              file_size: true,
              run_id: true,
            },
            orderBy: { file_size: 'asc' },
            take: 1,
          });
          return { largest, smallest };
        }),
        
        // 获取最近活动统计
        this.getRecentActivityStats(),
      ]);

      const totalSize = sizeStats._sum.file_size ? Number(sizeStats._sum.file_size) : 0;
      const avgFileSize = sizeStats._avg.file_size ? Number(sizeStats._avg.file_size) : 0;

      // 处理按状态分组的统计
      const sizeByStatus = { success: 0, failed: 0, error: 0, completed: 0 };
      const countByStatus = { success: 0, failed: 0, error: 0, completed: 0 };
      
      statusStats.forEach(stat => {
        const status = stat.status as keyof typeof sizeByStatus;
        countByStatus[status] = stat._count._all;
        sizeByStatus[status] = stat._sum.file_size ? Number(stat._sum.file_size) : 0;
      });

      // 处理极值文件
      const largestFile = extremeFiles.largest.length > 0 ? {
        fileName: extremeFiles.largest[0].file_name,
        size: Number(extremeFiles.largest[0].file_size),
        runId: extremeFiles.largest[0].run_id,
      } : null;

      const smallestFile = extremeFiles.smallest.length > 0 ? {
        fileName: extremeFiles.smallest[0].file_name,
        size: Number(extremeFiles.smallest[0].file_size),
        runId: extremeFiles.smallest[0].run_id,
      } : null;

      // 计算存储健康度
      const storageHealth = this.calculateStorageHealth(totalScreenshots, missingFiles, totalSize);

      const stats: StorageStats = {
        totalScreenshots,
        totalSize,
        avgFileSize: Math.round(avgFileSize),
        oldestScreenshot: timeStats._min.created_at || new Date(),
        newestScreenshot: timeStats._max.created_at || new Date(),
        missingFiles,
        sizeByStatus,
        countByStatus,
        largestFile,
        smallestFile,
        recentActivity,
        storageHealth,
      };

      console.log(`✅ 获取存储统计完成`, {
        totalScreenshots: stats.totalScreenshots,
        totalSize: stats.totalSize,
        missingFiles: stats.missingFiles,
        healthScore: stats.storageHealth.healthScore,
      });
      
      return stats;
    } catch (error: any) {
      console.error(`❌ 获取存储统计失败: ${error.message}`, error);
      throw new Error(`获取存储统计失败: ${error.message}`);
    }
  }

  /**
   * 获取最近活动统计
   * @private
   */
  private async getRecentActivityStats(): Promise<{
    last24Hours: number;
    last7Days: number;
    last30Days: number;
  }> {
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [count24h, count7d, count30d] = await Promise.all([
      this.prisma.step_screenshots.count({
        where: { created_at: { gte: last24Hours } },
      }),
      this.prisma.step_screenshots.count({
        where: { created_at: { gte: last7Days } },
      }),
      this.prisma.step_screenshots.count({
        where: { created_at: { gte: last30Days } },
      }),
    ]);

    return {
      last24Hours: count24h,
      last7Days: count7d,
      last30Days: count30d,
    };
  }

  /**
   * 计算存储健康度
   * @private
   */
  private calculateStorageHealth(
    totalScreenshots: number,
    missingFiles: number,
    totalSize: number
  ): {
    healthScore: number;
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let healthScore = 100;

    // 检查缺失文件比例
    const missingRatio = totalScreenshots > 0 ? (missingFiles / totalScreenshots) * 100 : 0;
    if (missingRatio > 0) {
      healthScore -= Math.min(missingRatio * 2, 50); // 最多扣50分
      issues.push(`${missingFiles} 个截图文件缺失 (${missingRatio.toFixed(1)}%)`);
      
      if (missingRatio > 10) {
        recommendations.push('建议运行文件验证任务检查文件完整性');
      }
      if (missingRatio > 25) {
        recommendations.push('考虑从备份恢复缺失的截图文件');
      }
    }

    // 检查存储空间使用
    const totalSizeGB = totalSize / (1024 * 1024 * 1024);
    if (totalSizeGB > 10) {
      issues.push(`存储空间使用较大: ${totalSizeGB.toFixed(2)} GB`);
      recommendations.push('考虑清理过期截图以释放存储空间');
    }

    // 检查截图数量
    if (totalScreenshots > 10000) {
      issues.push(`截图数量较多: ${totalScreenshots} 个`);
      recommendations.push('建议设置自动清理策略');
    }

    // 确保健康度不低于0
    healthScore = Math.max(0, Math.round(healthScore));

    // 添加积极的建议
    if (healthScore >= 90) {
      recommendations.push('存储状态良好，继续保持');
    } else if (healthScore >= 70) {
      recommendations.push('存储状态一般，建议定期维护');
    } else {
      recommendations.push('存储状态需要关注，建议立即处理相关问题');
    }

    return {
      healthScore,
      issues,
      recommendations,
    };
  }

  /**
   * 关闭Prisma客户端连接
   */
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }

  /**
   * 将Prisma查询结果转换为ScreenshotRecord格式
   * @param prismaRecord Prisma查询结果
   * @returns ScreenshotRecord对象
   */
  private convertPrismaToScreenshotRecord(prismaRecord: any): ScreenshotRecord {
    return {
      id: prismaRecord.id,
      runId: prismaRecord.run_id,
      testCaseId: prismaRecord.test_case_id || undefined,
      stepIndex: prismaRecord.step_index,
      stepDescription: prismaRecord.step_description || undefined,
      status: prismaRecord.status as ScreenshotStatus,
      filePath: prismaRecord.file_path,
      fileName: prismaRecord.file_name,
      fileSize: prismaRecord.file_size !== null ? Number(prismaRecord.file_size) : undefined,
      mimeType: prismaRecord.mime_type || undefined,
      createdAt: prismaRecord.created_at || undefined,
      fileExists: prismaRecord.file_exists,
    };
  }

  /**
   * 解析步骤索引为数字，用于排序
   * @param stepIndex 步骤索引（字符串或数字）
   * @returns 数字形式的步骤索引
   */
  private parseStepIndex(stepIndex: string | number): number {
    if (typeof stepIndex === 'number') {
      return stepIndex;
    }

    // 处理特殊字符串值
    const lowerIndex = stepIndex.toLowerCase();
    if (lowerIndex === 'final' || lowerIndex === 'end') {
      return 999999; // 给特殊步骤一个很大的数字，确保它们排在最后
    }
    if (lowerIndex === 'initial' || lowerIndex === 'start') {
      return -1; // 给初始步骤一个负数，确保它们排在最前
    }

    // 尝试解析为数字
    const parsed = parseInt(stepIndex, 10);
    return isNaN(parsed) ? 0 : parsed;
  }
}