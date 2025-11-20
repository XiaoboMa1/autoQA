import { ScreenshotMonitoringService, MonitoringConfig, Alert } from '../screenshotMonitoring';
import { ScreenshotService } from '../screenshotService';
import { StorageStats } from '../../types/screenshot';

// Mock ScreenshotService
jest.mock('../screenshotService');

describe('ScreenshotMonitoringService', () => {
  let monitoringService: ScreenshotMonitoringService;
  let mockScreenshotService: jest.Mocked<ScreenshotService>;
  let mockStorageStats: StorageStats;

  beforeEach(() => {
    mockScreenshotService = new ScreenshotService() as jest.Mocked<ScreenshotService>;
    
    mockStorageStats = {
      totalScreenshots: 1000,
      totalSize: 10485760, // 10MB
      avgFileSize: 10485,
      oldestScreenshot: new Date('2024-01-01'),
      newestScreenshot: new Date('2024-01-15'),
      missingFiles: 10,
      sizeByStatus: {
        success: 8388608,
        failed: 2097152,
        error: 0,
        completed: 0,
      },
      countByStatus: {
        success: 800,
        failed: 200,
        error: 0,
        completed: 0,
      },
      largestFile: {
        fileName: 'large.png',
        size: 1048576,
        runId: 'run-1',
      },
      smallestFile: {
        fileName: 'small.png',
        size: 1024,
        runId: 'run-2',
      },
      recentActivity: {
        last24Hours: 50,
        last7Days: 200,
        last30Days: 500,
      },
      storageHealth: {
        healthScore: 95,
        issues: [],
        recommendations: ['存储状态良好，继续保持'],
      },
    };

    mockScreenshotService.getStorageStats.mockResolvedValue(mockStorageStats);

    const config: Partial<MonitoringConfig> = {
      maxStorageSizeGB: 1, // 1GB threshold for testing
      maxScreenshotCount: 5000,
      maxMissingFileRatio: 0.02, // 2%
      maxQueryTimeMs: 1000,
      statsCheckIntervalMinutes: 1,
      healthCheckIntervalMinutes: 1,
      performanceCheckIntervalMinutes: 1,
      enableAlerts: true,
      alertCooldownMinutes: 1,
    };

    monitoringService = new ScreenshotMonitoringService(mockScreenshotService, config);
  });

  afterEach(() => {
    monitoringService.stop();
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  describe('Constructor', () => {
    it('should create instance with default config', () => {
      const service = new ScreenshotMonitoringService(mockScreenshotService);
      expect(service).toBeInstanceOf(ScreenshotMonitoringService);
      
      const config = service.getConfig();
      expect(config.maxStorageSizeGB).toBe(50);
      expect(config.enableAlerts).toBe(true);
    });

    it('should create instance with custom config', () => {
      const customConfig = {
        maxStorageSizeGB: 100,
        enableAlerts: false,
      };
      
      const service = new ScreenshotMonitoringService(mockScreenshotService, customConfig);
      const config = service.getConfig();
      
      expect(config.maxStorageSizeGB).toBe(100);
      expect(config.enableAlerts).toBe(false);
    });
  });

  describe('Storage Monitoring', () => {
    it('should create storage alert when size exceeds threshold', async () => {
      // Set storage size to exceed threshold (1GB)
      mockStorageStats.totalSize = 2 * 1024 * 1024 * 1024; // 2GB
      mockScreenshotService.getStorageStats.mockResolvedValue(mockStorageStats);

      // Manually trigger storage check
      await (monitoringService as any).performStorageCheck();

      const alerts = monitoringService.getActiveAlerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('storage');
      expect(alerts[0].title).toBe('存储空间使用过高');
      expect(alerts[0].severity).toBe('critical'); // 2GB is 2x the 1GB threshold, so it's critical
    });

    it('should create critical alert when size greatly exceeds threshold', async () => {
      // Set storage size to greatly exceed threshold
      mockStorageStats.totalSize = 2 * 1024 * 1024 * 1024; // 2GB (2x threshold)
      mockScreenshotService.getStorageStats.mockResolvedValue(mockStorageStats);

      // Update config to make this critical
      monitoringService.updateConfig({ maxStorageSizeGB: 1 });

      await (monitoringService as any).performStorageCheck();

      const alerts = monitoringService.getActiveAlerts();
      expect(alerts[0].severity).toBe('critical');
    });

    it('should create alert when screenshot count exceeds threshold', async () => {
      mockStorageStats.totalScreenshots = 6000; // Exceeds 5000 threshold
      mockScreenshotService.getStorageStats.mockResolvedValue(mockStorageStats);

      await (monitoringService as any).performStorageCheck();

      const alerts = monitoringService.getActiveAlerts();
      const countAlert = alerts.find(a => a.title === '截图数量过多');
      expect(countAlert).toBeDefined();
      expect(countAlert?.type).toBe('storage');
      expect(countAlert?.severity).toBe('medium');
    });

    it('should create file loss alert when missing file ratio exceeds threshold', async () => {
      mockStorageStats.missingFiles = 30; // 3% missing (exceeds 2% threshold)
      mockScreenshotService.getStorageStats.mockResolvedValue(mockStorageStats);

      await (monitoringService as any).performStorageCheck();

      const alerts = monitoringService.getActiveAlerts();
      const fileLossAlert = alerts.find(a => a.type === 'file_loss');
      expect(fileLossAlert).toBeDefined();
      expect(fileLossAlert?.title).toBe('截图文件大量缺失');
      expect(fileLossAlert?.severity).toBe('high');
    });

    it('should handle storage check errors gracefully', async () => {
      mockScreenshotService.getStorageStats.mockRejectedValue(new Error('Database connection failed'));

      await (monitoringService as any).performStorageCheck();

      const alerts = monitoringService.getActiveAlerts();
      const errorAlert = alerts.find(a => a.title === '存储检查失败');
      expect(errorAlert).toBeDefined();
      expect(errorAlert?.type).toBe('health');
      expect(errorAlert?.severity).toBe('high');
    });
  });

  describe('Health Monitoring', () => {
    it('should create performance alert when database response is slow', async () => {
      // Mock slow response
      mockScreenshotService.getStorageStats.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(mockStorageStats), 1500))
      );

      await (monitoringService as any).performHealthCheck();

      const alerts = monitoringService.getActiveAlerts();
      const perfAlert = alerts.find(a => a.title === '数据库响应缓慢');
      expect(perfAlert).toBeDefined();
      expect(perfAlert?.type).toBe('performance');
    });

    it('should create alert when operation failure rate is high', async () => {
      // Add some failed performance metrics
      const failedMetrics = Array.from({ length: 5 }, (_, i) => ({
        timestamp: new Date(Date.now() - i * 60000), // Last 5 minutes
        operation: 'test_operation',
        duration: 1000,
        success: false,
        error: 'Test error',
      }));

      const successMetrics = Array.from({ length: 5 }, (_, i) => ({
        timestamp: new Date(Date.now() - i * 60000),
        operation: 'test_operation',
        duration: 500,
        success: true,
      }));

      // Add metrics to service
      failedMetrics.forEach(metric => (monitoringService as any).recordPerformanceMetric(metric));
      successMetrics.forEach(metric => (monitoringService as any).recordPerformanceMetric(metric));

      await (monitoringService as any).performHealthCheck();

      const alerts = monitoringService.getActiveAlerts();
      const failureAlert = alerts.find(a => a.title === '操作失败率过高');
      expect(failureAlert).toBeDefined();
      expect(failureAlert?.type).toBe('performance');
    });

    it('should handle health check errors gracefully', async () => {
      mockScreenshotService.getStorageStats.mockRejectedValue(new Error('Health check failed'));

      await (monitoringService as any).performHealthCheck();

      const alerts = monitoringService.getActiveAlerts();
      const errorAlert = alerts.find(a => a.title === '系统健康检查失败');
      expect(errorAlert).toBeDefined();
      expect(errorAlert?.type).toBe('health');
      expect(errorAlert?.severity).toBe('critical');
    });
  });

  describe('Performance Monitoring', () => {
    it('should create alert for slow operations', async () => {
      // Add slow performance metrics
      const slowMetrics = Array.from({ length: 3 }, (_, i) => ({
        timestamp: new Date(Date.now() - i * 60000),
        operation: 'slow_operation',
        duration: 2000, // Exceeds 1000ms threshold
        success: true,
      }));

      slowMetrics.forEach(metric => (monitoringService as any).recordPerformanceMetric(metric));

      await (monitoringService as any).performPerformanceCheck();

      const alerts = monitoringService.getActiveAlerts();
      const perfAlert = alerts.find(a => a.title === '操作性能下降');
      expect(perfAlert).toBeDefined();
      expect(perfAlert?.type).toBe('performance');
    });

    it('should not create alerts when no recent metrics exist', async () => {
      await (monitoringService as any).performPerformanceCheck();

      const alerts = monitoringService.getActiveAlerts();
      expect(alerts).toHaveLength(0);
    });
  });

  describe('Alert Management', () => {
    it('should respect alert cooldown period', async () => {
      // Create first alert
      mockStorageStats.totalSize = 2 * 1024 * 1024 * 1024; // 2GB
      mockScreenshotService.getStorageStats.mockResolvedValue(mockStorageStats);

      await (monitoringService as any).performStorageCheck();
      expect(monitoringService.getActiveAlerts()).toHaveLength(1);

      // Try to create same alert immediately (should be blocked by cooldown)
      await (monitoringService as any).performStorageCheck();
      expect(monitoringService.getActiveAlerts()).toHaveLength(1); // Still only 1 alert
    });

    it('should resolve alerts correctly', () => {
      // Create an alert manually
      const alert: Alert = {
        id: 'test-alert-1',
        type: 'storage',
        severity: 'medium',
        title: 'Test Alert',
        message: 'This is a test alert',
        timestamp: new Date(),
        resolved: false,
      };

      (monitoringService as any).alerts.set(alert.id, alert);

      expect(monitoringService.getActiveAlerts()).toHaveLength(1);
      
      const resolved = monitoringService.resolveAlert(alert.id);
      expect(resolved).toBe(true);
      expect(monitoringService.getActiveAlerts()).toHaveLength(0);
    });

    it('should not resolve non-existent alerts', () => {
      const resolved = monitoringService.resolveAlert('non-existent-id');
      expect(resolved).toBe(false);
    });

    it('should not create alerts when disabled', async () => {
      monitoringService.updateConfig({ enableAlerts: false });

      mockStorageStats.totalSize = 2 * 1024 * 1024 * 1024; // 2GB
      mockScreenshotService.getStorageStats.mockResolvedValue(mockStorageStats);

      await (monitoringService as any).performStorageCheck();

      expect(monitoringService.getActiveAlerts()).toHaveLength(0);
    });
  });

  describe('Performance Metrics', () => {
    it('should record performance metrics correctly', () => {
      const metric = {
        timestamp: new Date(),
        operation: 'test_operation',
        duration: 1000,
        success: true,
        metadata: { test: 'data' },
      };

      (monitoringService as any).recordPerformanceMetric(metric);

      const metrics = monitoringService.getPerformanceMetrics(10);
      expect(metrics).toHaveLength(1);
      expect(metrics[0]).toEqual(metric);
    });

    it('should limit performance metrics in memory', () => {
      // Add more than 1000 metrics
      for (let i = 0; i < 1200; i++) {
        (monitoringService as any).recordPerformanceMetric({
          timestamp: new Date(),
          operation: `operation_${i}`,
          duration: 100,
          success: true,
        });
      }

      const metrics = monitoringService.getPerformanceMetrics(2000);
      expect(metrics.length).toBeLessThanOrEqual(1000); // Should be limited to 1000, then trimmed to 500
    });

    it('should cleanup old metrics', () => {
      // Add old metrics
      const oldMetric = {
        timestamp: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago
        operation: 'old_operation',
        duration: 100,
        success: true,
      };

      const recentMetric = {
        timestamp: new Date(),
        operation: 'recent_operation',
        duration: 100,
        success: true,
      };

      (monitoringService as any).recordPerformanceMetric(oldMetric);
      (monitoringService as any).recordPerformanceMetric(recentMetric);

      expect(monitoringService.getPerformanceMetrics(10)).toHaveLength(2);

      // Trigger cleanup
      (monitoringService as any).cleanupOldMetrics();

      const remainingMetrics = monitoringService.getPerformanceMetrics(10);
      expect(remainingMetrics).toHaveLength(1);
      expect(remainingMetrics[0].operation).toBe('recent_operation');
    });
  });

  describe('Monitoring Stats', () => {
    it('should return comprehensive monitoring stats', async () => {
      // Add some test data
      const testAlert: Alert = {
        id: 'test-alert',
        type: 'storage',
        severity: 'medium',
        title: 'Test Alert',
        message: 'Test message',
        timestamp: new Date(),
        resolved: false,
      };

      (monitoringService as any).alerts.set(testAlert.id, testAlert);

      const testMetric = {
        timestamp: new Date(),
        operation: 'test_operation',
        duration: 500,
        success: true,
      };

      (monitoringService as any).recordPerformanceMetric(testMetric);

      const stats = await monitoringService.getMonitoringStats();

      expect(stats.storageStats).toEqual(mockStorageStats);
      expect(stats.alerts).toHaveLength(1);
      expect(stats.alerts[0]).toEqual(testAlert);
      expect(stats.performanceMetrics).toHaveLength(1);
      expect(stats.systemHealth.overall).toBe('healthy');
      expect(stats.systemHealth.components.storage).toBe('healthy');
    });

    it('should calculate system health correctly with critical alerts', async () => {
      const criticalAlert: Alert = {
        id: 'critical-alert',
        type: 'health',
        severity: 'critical',
        title: 'Critical Issue',
        message: 'Critical message',
        timestamp: new Date(),
        resolved: false,
      };

      (monitoringService as any).alerts.set(criticalAlert.id, criticalAlert);

      const stats = await monitoringService.getMonitoringStats();
      expect(stats.systemHealth.overall).toBe('critical');
    });

    it('should handle errors when getting monitoring stats', async () => {
      mockScreenshotService.getStorageStats.mockRejectedValue(new Error('Stats error'));

      await expect(monitoringService.getMonitoringStats())
        .rejects.toThrow('获取监控统计失败: Stats error');
    });
  });

  describe('Service Lifecycle', () => {
    it('should start and stop monitoring service', () => {
      jest.useFakeTimers();

      monitoringService.start();
      
      // Verify timers are set
      expect(jest.getTimerCount()).toBeGreaterThan(0);

      monitoringService.stop();
      
      // Verify timers are cleared
      expect(jest.getTimerCount()).toBe(0);

      jest.useRealTimers();
    });
  });

  describe('Configuration Management', () => {
    it('should update configuration correctly', () => {
      const newConfig = {
        maxStorageSizeGB: 200,
        enableAlerts: false,
      };

      monitoringService.updateConfig(newConfig);

      const config = monitoringService.getConfig();
      expect(config.maxStorageSizeGB).toBe(200);
      expect(config.enableAlerts).toBe(false);
      expect(config.maxScreenshotCount).toBe(5000); // Should keep existing values
    });

    it('should return current configuration', () => {
      const config = monitoringService.getConfig();
      
      expect(config).toHaveProperty('maxStorageSizeGB');
      expect(config).toHaveProperty('enableAlerts');
      expect(config).toHaveProperty('alertCooldownMinutes');
    });
  });
});