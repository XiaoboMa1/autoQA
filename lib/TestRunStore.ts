import type { TestRun } from '../src/types/test';

export interface TestRunStoreConfig {
  maxRetainedRuns: number;
  enableAutoCleanup: boolean;
  cleanupIntervalMs: number;
  retentionTimeMs: number; // 完成测试保留时间
}

export class TestRunStore {
  private runs = new Map<string, TestRun>();
  private config: TestRunStoreConfig;
  private cleanupTimer?: NodeJS.Timer;

  constructor(config: Partial<TestRunStoreConfig> = {}) {
    this.config = {
      maxRetainedRuns: 100,
      enableAutoCleanup: true,
      cleanupIntervalMs: 5 * 60 * 1000, // 5分钟清理一次
      retentionTimeMs: 30 * 60 * 1000,  // 完成测试保留30分钟
      ...config
    };

    // 启动自动清理定时器
    if (this.config.enableAutoCleanup) {
      this.startAutoCleanup();
    }
  }

  get(id: string) { 
    return this.runs.get(id); 
  }

  set(id: string, data: TestRun) { 
    this.runs.set(id, data); 
    this.emit(id, data);
    
    // 触发清理检查（如果超过最大数量）
    if (this.config.enableAutoCleanup && this.runs.size > this.config.maxRetainedRuns) {
      this.performCleanup();
    }
  }

  has(id: string) { 
    return this.runs.has(id); 
  }

  all() { 
    return Array.from(this.runs.values()); 
  }

  // 🔥 新增：手动清理方法
  public cleanup(): number {
    return this.performCleanup();
  }

  // 🔥 新增：获取存储统计
  public getStats(): { total: number; completed: number; running: number; failed: number } {
    const runs = Array.from(this.runs.values());
    return {
      total: runs.length,
      completed: runs.filter(r => r.status === 'completed').length,
      running: runs.filter(r => r.status === 'running' || r.status === 'queued').length,
      failed: runs.filter(r => r.status === 'failed' || r.status === 'error').length
    };
  }

  // 🔥 新增：更新配置
  public updateConfig(newConfig: Partial<TestRunStoreConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };

    // 重启自动清理定时器
    if (oldConfig.enableAutoCleanup !== this.config.enableAutoCleanup || 
        oldConfig.cleanupIntervalMs !== this.config.cleanupIntervalMs) {
      this.stopAutoCleanup();
      if (this.config.enableAutoCleanup) {
        this.startAutoCleanup();
      }
    }

    console.log(`📋 TestRunStore配置已更新:`, {
      maxRetainedRuns: this.config.maxRetainedRuns,
      enableAutoCleanup: this.config.enableAutoCleanup,
      cleanupIntervalMs: this.config.cleanupIntervalMs,
      retentionTimeMs: this.config.retentionTimeMs
    });
  }

  // 启动自动清理
  private startAutoCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const cleanedCount = this.performCleanup();
      if (cleanedCount > 0) {
        console.log(`🧹 TestRunStore自动清理完成，清理了 ${cleanedCount} 个旧测试记录`);
      }
    }, this.config.cleanupIntervalMs);

    console.log(`🔄 TestRunStore自动清理已启动，间隔: ${this.config.cleanupIntervalMs}ms`);
  }

  // 停止自动清理
  private stopAutoCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
      console.log(`⏹️ TestRunStore自动清理已停止`);
    }
  }

  // 执行清理
  private performCleanup(): number {
    const beforeSize = this.runs.size;
    const now = Date.now();
    const toDelete: string[] = [];

    // 策略1: 清理超过保留时间的已完成测试
    for (const [id, run] of this.runs) {
      const isCompleted = ['completed', 'failed', 'error', 'cancelled'].includes(run.status);
      if (isCompleted && run.finishedAt) {
        const completedTime = new Date(run.finishedAt).getTime();
        if (now - completedTime > this.config.retentionTimeMs) {
          toDelete.push(id);
        }
      }
    }

    // 策略2: 如果仍然超过最大数量，删除最老的已完成测试
    if (this.runs.size - toDelete.length > this.config.maxRetainedRuns) {
      const completedRuns = Array.from(this.runs.entries())
        .filter(([id, run]) => 
          !toDelete.includes(id) && 
          ['completed', 'failed', 'error', 'cancelled'].includes(run.status) &&
          run.finishedAt
        )
        .sort(([, a], [, b]) => 
          new Date(a.finishedAt!).getTime() - new Date(b.finishedAt!).getTime()
        );

      const needToDelete = this.runs.size - toDelete.length - this.config.maxRetainedRuns;
      for (let i = 0; i < Math.min(needToDelete, completedRuns.length); i++) {
        toDelete.push(completedRuns[i][0]);
      }
    }

    // 执行删除
    for (const id of toDelete) {
      this.runs.delete(id);
    }

    const cleanedCount = beforeSize - this.runs.size;
    return cleanedCount;
  }

  // 销毁实例（用于测试或服务关闭）
  public destroy(): void {
    this.stopAutoCleanup();
    this.runs.clear();
    this.listeners = [];
    console.log(`💥 TestRunStore实例已销毁`);
  }

  // 监听器——以后统一推 WebSocket/日志/DB
  private listeners: ((id:string, r:TestRun) => void)[] = [];
  onChange(fn:(id:string, r:TestRun) => void){ this.listeners.push(fn); }
  private emit(id: string, r: TestRun){ for (const fn of this.listeners) fn(id,r); }
}

export const testRunStore = new TestRunStore(); 