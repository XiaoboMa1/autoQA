import { ScreenshotService } from './screenshotService';
import { StorageStats } from '../types/screenshot';

export interface MonitoringConfig {
  // Storage thresholds
  maxStorageSizeGB: number;
  maxScreenshotCount: number;
  maxMissingFileRatio: number; // 0-1 (e.g., 0.1 = 10%)
  
  // Performance thresholds
  maxQueryTimeMs: number;
  maxCleanupTimeMs: number;
  
  // Monitoring intervals
  statsCheckIntervalMinutes: number;
  healthCheckIntervalMinutes: number;
  performanceCheckIntervalMinutes: number;
  
  // Alert settings
  enableAlerts: boolean;
  alertCooldownMinutes: number;
}

export interface Alert {
  id: string;
  type: 'storage' | 'performance' | 'health' | 'file_loss';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  timestamp: Date;
  resolved: boolean;
  metadata?: Record<string, any>;
}

export interface PerformanceMetrics {
  timestamp: Date;
  operation: string;
  duration: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

export interface MonitoringStats {
  lastCheck: Date;
  storageStats: StorageStats;
  alerts: Alert[];
  performanceMetrics: PerformanceMetrics[];
  systemHealth: {
    overall: 'healthy' | 'warning' | 'critical';
    components: {
      storage: 'healthy' | 'warning' | 'critical';
      performance: 'healthy' | 'warning' | 'critical';
      fileIntegrity: 'healthy' | 'warning' | 'critical';
    };
  };
}

export class ScreenshotMonitoringService {
  private screenshotService: ScreenshotService;
  private config: MonitoringConfig;
  private alerts: Map<string, Alert> = new Map();
  private performanceMetrics: PerformanceMetrics[] = [];
  private timers: NodeJS.Timeout[] = [];
  private lastAlertTimes: Map<string, Date> = new Map();

  constructor(screenshotService: ScreenshotService, config?: Partial<MonitoringConfig>) {
    this.screenshotService = screenshotService;
    this.config = {
      maxStorageSizeGB: 50,
      maxScreenshotCount: 50000,
      maxMissingFileRatio: 0.05, // 5%
      maxQueryTimeMs: 5000,
      maxCleanupTimeMs: 30000,
      statsCheckIntervalMinutes: 30,
      healthCheckIntervalMinutes: 15,
      performanceCheckIntervalMinutes: 5,
      enableAlerts: true,
      alertCooldownMinutes: 60,
      ...config,
    };
  }

  /**
   * 启动监控服务
   */
  start(): void {
    console.log('🚀 启动截图存储监控服务');
    
    // 立即执行一次检查
    this.performHealthCheck();
    this.performStorageCheck();
    
    // 设置定期检查
    this.timers.push(
      setInterval(() => this.performStorageCheck(), this.config.statsCheckIntervalMinutes * 60 * 1000),
      setInterval(() => this.performHealthCheck(), this.config.healthCheckIntervalMinutes * 60 * 1000),
      setInterval(() => this.performPerformanceCheck(), this.config.performanceCheckIntervalMinutes * 60 * 1000),
      setInterval(() => this.cleanupOldMetrics(), 60 * 60 * 1000) // 每小时清理一次旧指标
    );

    console.log('✅ 监控服务已启动');
  }

  /**
   * 停止监控服务
   */
  stop(): void {
    console.log('🛑 停止截图存储监控服务');
    
    this.timers.forEach(timer => clearInterval(timer));
    this.timers = [];
    
    console.log('✅ 监控服务已停止');
  }

  /**
   * 执行存储检查
   */
  private async performStorageCheck(): Promise<void> {
    try {
      console.log('📊 执行存储空间检查');
      
      const startTime = Date.now();
      const stats = await this.screenshotService.getStorageStats();
      const duration = Date.now() - startTime;

      // 记录性能指标
      this.recordPerformanceMetric({
        timestamp: new Date(),
        operation: 'getStorageStats',
        duration,
        success: true,
        metadata: {
          totalScreenshots: stats.totalScreenshots,
          totalSize: stats.totalSize,
          missingFiles: stats.missingFiles,
        },
      });

      // 检查存储空间使用
      const storageSizeGB = stats.totalSize / (1024 * 1024 * 1024);
      if (storageSizeGB > this.config.maxStorageSizeGB) {
        this.createAlert({
          type: 'storage',
          severity: storageSizeGB > this.config.maxStorageSizeGB * 1.5 ? 'critical' : 'high',
          title: '存储空间使用过高',
          message: `截图存储空间已达到 ${storageSizeGB.toFixed(2)} GB，超过阈值 ${this.config.maxStorageSizeGB} GB`,
          metadata: {
            currentSize: storageSizeGB,
            threshold: this.config.maxStorageSizeGB,
            totalScreenshots: stats.totalScreenshots,
          },
        });
      }

      // 检查截图数量
      if (stats.totalScreenshots > this.config.maxScreenshotCount) {
        this.createAlert({
          type: 'storage',
          severity: stats.totalScreenshots > this.config.maxScreenshotCount * 1.5 ? 'high' : 'medium',
          title: '截图数量过多',
          message: `截图数量已达到 ${stats.totalScreenshots} 个，超过阈值 ${this.config.maxScreenshotCount} 个`,
          metadata: {
            currentCount: stats.totalScreenshots,
            threshold: this.config.maxScreenshotCount,
            totalSize: stats.totalSize,
          },
        });
      }

      // 检查缺失文件比例
      const missingRatio = stats.totalScreenshots > 0 ? stats.missingFiles / stats.totalScreenshots : 0;
      if (missingRatio > this.config.maxMissingFileRatio) {
        this.createAlert({
          type: 'file_loss',
          severity: missingRatio > this.config.maxMissingFileRatio * 2 ? 'critical' : 'high',
          title: '截图文件大量缺失',
          message: `${stats.missingFiles} 个截图文件缺失，占比 ${(missingRatio * 100).toFixed(1)}%，超过阈值 ${(this.config.maxMissingFileRatio * 100).toFixed(1)}%`,
          metadata: {
            missingFiles: stats.missingFiles,
            totalFiles: stats.totalScreenshots,
            missingRatio,
            threshold: this.config.maxMissingFileRatio,
          },
        });
      }

      console.log('✅ 存储检查完成', {
        storageSizeGB: storageSizeGB.toFixed(2),
        totalScreenshots: stats.totalScreenshots,
        missingFiles: stats.missingFiles,
        missingRatio: (missingRatio * 100).toFixed(1) + '%',
      });

    } catch (error: any) {
      console.error('❌ 存储检查失败:', error);
      
      this.recordPerformanceMetric({
        timestamp: new Date(),
        operation: 'getStorageStats',
        duration: Date.now() - Date.now(),
        success: false,
        error: error.message,
      });

      this.createAlert({
        type: 'health',
        severity: 'high',
        title: '存储检查失败',
        message: `无法获取存储统计信息: ${error.message}`,
        metadata: { error: error.message },
      });
    }
  }

  /**
   * 执行健康检查
   */
  private async performHealthCheck(): Promise<void> {
    try {
      console.log('🏥 执行系统健康检查');
      
      // 检查数据库连接
      const startTime = Date.now();
      const stats = await this.screenshotService.getStorageStats();
      const dbResponseTime = Date.now() - startTime;

      // 记录数据库响应时间
      this.recordPerformanceMetric({
        timestamp: new Date(),
        operation: 'healthCheck_database',
        duration: dbResponseTime,
        success: true,
        metadata: { responseTime: dbResponseTime },
      });

      // 检查数据库响应时间
      if (dbResponseTime > this.config.maxQueryTimeMs) {
        this.createAlert({
          type: 'performance',
          severity: dbResponseTime > this.config.maxQueryTimeMs * 2 ? 'high' : 'medium',
          title: '数据库响应缓慢',
          message: `数据库查询耗时 ${dbResponseTime} ms，超过阈值 ${this.config.maxQueryTimeMs} ms`,
          metadata: {
            responseTime: dbResponseTime,
            threshold: this.config.maxQueryTimeMs,
          },
        });
      }

      // 检查最近的性能指标
      const recentMetrics = this.performanceMetrics.filter(
        m => Date.now() - m.timestamp.getTime() < 30 * 60 * 1000 // 最近30分钟
      );

      const failureRate = recentMetrics.length > 0 
        ? recentMetrics.filter(m => !m.success).length / recentMetrics.length 
        : 0;

      if (failureRate > 0.1) { // 失败率超过10%
        this.createAlert({
          type: 'performance',
          severity: failureRate > 0.25 ? 'high' : 'medium',
          title: '操作失败率过高',
          message: `最近30分钟操作失败率为 ${(failureRate * 100).toFixed(1)}%`,
          metadata: {
            failureRate,
            totalOperations: recentMetrics.length,
            failedOperations: recentMetrics.filter(m => !m.success).length,
          },
        });
      }

      console.log('✅ 健康检查完成', {
        dbResponseTime: `${dbResponseTime}ms`,
        recentOperations: recentMetrics.length,
        failureRate: `${(failureRate * 100).toFixed(1)}%`,
      });

    } catch (error: any) {
      console.error('❌ 健康检查失败:', error);
      
      this.createAlert({
        type: 'health',
        severity: 'critical',
        title: '系统健康检查失败',
        message: `健康检查过程中发生错误: ${error.message}`,
        metadata: { error: error.message },
      });
    }
  }

  /**
   * 执行性能检查
   */
  private async performPerformanceCheck(): Promise<void> {
    try {
      console.log('⚡ 执行性能检查');
      
      // 获取最近的性能指标
      const now = Date.now();
      const recentMetrics = this.performanceMetrics.filter(
        m => now - m.timestamp.getTime() < 15 * 60 * 1000 // 最近15分钟
      );

      if (recentMetrics.length === 0) {
        console.log('📊 暂无最近的性能数据');
        return;
      }

      // 按操作类型分组统计
      const operationStats = new Map<string, {
        count: number;
        totalDuration: number;
        avgDuration: number;
        maxDuration: number;
        successCount: number;
        failureCount: number;
      }>();

      recentMetrics.forEach(metric => {
        const key = metric.operation;
        const existing = operationStats.get(key) || {
          count: 0,
          totalDuration: 0,
          avgDuration: 0,
          maxDuration: 0,
          successCount: 0,
          failureCount: 0,
        };

        existing.count++;
        existing.totalDuration += metric.duration;
        existing.maxDuration = Math.max(existing.maxDuration, metric.duration);
        
        if (metric.success) {
          existing.successCount++;
        } else {
          existing.failureCount++;
        }

        existing.avgDuration = existing.totalDuration / existing.count;
        operationStats.set(key, existing);
      });

      // 检查慢操作
      operationStats.forEach((stats, operation) => {
        if (stats.avgDuration > this.config.maxQueryTimeMs) {
          this.createAlert({
            type: 'performance',
            severity: stats.avgDuration > this.config.maxQueryTimeMs * 2 ? 'high' : 'medium',
            title: '操作性能下降',
            message: `${operation} 操作平均耗时 ${stats.avgDuration.toFixed(0)} ms，超过阈值 ${this.config.maxQueryTimeMs} ms`,
            metadata: {
              operation,
              avgDuration: stats.avgDuration,
              maxDuration: stats.maxDuration,
              threshold: this.config.maxQueryTimeMs,
              operationCount: stats.count,
            },
          });
        }
      });

      console.log('✅ 性能检查完成', {
        totalOperations: recentMetrics.length,
        operationTypes: operationStats.size,
        avgDuration: recentMetrics.reduce((sum, m) => sum + m.duration, 0) / recentMetrics.length,
      });

    } catch (error: any) {
      console.error('❌ 性能检查失败:', error);
    }
  }

  /**
   * 创建告警
   */
  private createAlert(alertData: Omit<Alert, 'id' | 'timestamp' | 'resolved'>): void {
    if (!this.config.enableAlerts) {
      return;
    }

    const alertKey = `${alertData.type}_${alertData.title}`;
    const lastAlertTime = this.lastAlertTimes.get(alertKey);
    const now = new Date();

    // 检查冷却时间
    if (lastAlertTime && (now.getTime() - lastAlertTime.getTime()) < this.config.alertCooldownMinutes * 60 * 1000) {
      console.log(`⏰ 告警在冷却期内，跳过: ${alertData.title}`);
      return;
    }

    const alert: Alert = {
      id: `${alertData.type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: now,
      resolved: false,
      ...alertData,
    };

    this.alerts.set(alert.id, alert);
    this.lastAlertTimes.set(alertKey, now);

    // 输出告警信息
    const severityEmoji = {
      low: '🟡',
      medium: '🟠',
      high: '🔴',
      critical: '🚨',
    };

    console.log(`${severityEmoji[alert.severity]} [${alert.severity.toUpperCase()}] ${alert.title}: ${alert.message}`);

    // 这里可以集成到外部告警系统
    this.sendToExternalMonitoring(alert);
  }

  /**
   * 记录性能指标
   */
  private recordPerformanceMetric(metric: PerformanceMetrics): void {
    this.performanceMetrics.push(metric);
    
    // 限制内存中保存的指标数量
    if (this.performanceMetrics.length > 1000) {
      this.performanceMetrics = this.performanceMetrics.slice(-500); // 保留最新的500个
    }
  }

  /**
   * 清理旧的性能指标
   */
  private cleanupOldMetrics(): void {
    const cutoffTime = Date.now() - 24 * 60 * 60 * 1000; // 24小时前
    
    const oldCount = this.performanceMetrics.length;
    this.performanceMetrics = this.performanceMetrics.filter(
      m => m.timestamp.getTime() > cutoffTime
    );
    
    const removedCount = oldCount - this.performanceMetrics.length;
    if (removedCount > 0) {
      console.log(`🧹 清理了 ${removedCount} 个过期的性能指标`);
    }
  }

  /**
   * 发送到外部监控系统
   */
  private sendToExternalMonitoring(alert: Alert): void {
    // 这里可以集成到现有的监控系统，如：
    // - Prometheus + Grafana
    // - ELK Stack
    // - 企业微信/钉钉机器人
    // - 邮件通知
    // - Slack/Teams 通知
    
    try {
      // 示例：发送到控制台（实际使用时替换为真实的监控系统）
      console.log('📤 发送告警到监控系统:', {
        alertId: alert.id,
        type: alert.type,
        severity: alert.severity,
        title: alert.title,
        timestamp: alert.timestamp.toISOString(),
      });

      // 示例：可以在这里添加 HTTP 请求发送到监控系统
      // await fetch('/api/monitoring/alerts', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(alert),
      // });

    } catch (error: any) {
      console.error('❌ 发送告警到监控系统失败:', error);
    }
  }

  /**
   * 获取监控统计信息
   */
  async getMonitoringStats(): Promise<MonitoringStats> {
    try {
      const storageStats = await this.screenshotService.getStorageStats();
      const activeAlerts = Array.from(this.alerts.values()).filter(a => !a.resolved);
      
      // 计算系统健康状态
      const systemHealth = this.calculateSystemHealth(storageStats, activeAlerts);

      return {
        lastCheck: new Date(),
        storageStats,
        alerts: activeAlerts,
        performanceMetrics: this.performanceMetrics.slice(-100), // 返回最近100个指标
        systemHealth,
      };
    } catch (error: any) {
      console.error('❌ 获取监控统计失败:', error);
      throw new Error(`获取监控统计失败: ${error.message}`);
    }
  }

  /**
   * 计算系统健康状态
   */
  private calculateSystemHealth(
    storageStats: StorageStats, 
    activeAlerts: Alert[]
  ): MonitoringStats['systemHealth'] {
    const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical');
    const highAlerts = activeAlerts.filter(a => a.severity === 'high');
    
    // 存储健康状态
    const storageHealth = storageStats.storageHealth.healthScore >= 80 ? 'healthy' :
                         storageStats.storageHealth.healthScore >= 60 ? 'warning' : 'critical';
    
    // 性能健康状态
    const recentMetrics = this.performanceMetrics.filter(
      m => Date.now() - m.timestamp.getTime() < 30 * 60 * 1000
    );
    const performanceFailureRate = recentMetrics.length > 0 
      ? recentMetrics.filter(m => !m.success).length / recentMetrics.length 
      : 0;
    
    const performanceHealth = performanceFailureRate < 0.05 ? 'healthy' :
                             performanceFailureRate < 0.15 ? 'warning' : 'critical';
    
    // 文件完整性健康状态
    const missingRatio = storageStats.totalScreenshots > 0 
      ? storageStats.missingFiles / storageStats.totalScreenshots 
      : 0;
    
    const fileIntegrityHealth = missingRatio < 0.02 ? 'healthy' :
                               missingRatio < 0.1 ? 'warning' : 'critical';
    
    // 整体健康状态
    const overall = criticalAlerts.length > 0 ? 'critical' :
                   highAlerts.length > 0 || [storageHealth, performanceHealth, fileIntegrityHealth].includes('critical') ? 'warning' :
                   'healthy';

    return {
      overall,
      components: {
        storage: storageHealth,
        performance: performanceHealth,
        fileIntegrity: fileIntegrityHealth,
      },
    };
  }

  /**
   * 解决告警
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.resolved = true;
      console.log(`✅ 告警已解决: ${alert.title}`);
      return true;
    }
    return false;
  }

  /**
   * 获取活跃告警
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.alerts.values()).filter(a => !a.resolved);
  }

  /**
   * 获取性能指标
   */
  getPerformanceMetrics(limit: number = 100): PerformanceMetrics[] {
    return this.performanceMetrics.slice(-limit);
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<MonitoringConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('📝 监控配置已更新', newConfig);
  }

  /**
   * 获取当前配置
   */
  getConfig(): MonitoringConfig {
    return { ...this.config };
  }
}