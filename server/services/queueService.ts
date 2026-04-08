import PQueue from 'p-queue';
import { EventEmitter } from 'events';
import { ConcurrencyController, ControllerConfig } from './concurrencyController.js';

interface QueueConfig {
  maxConcurrency: number;      // 全局最大并发上限：6
  perUserLimit: number;        // 每用户并发：2
  taskTimeout: number;         // 任务超时：10分钟
  retryAttempts: number;       // 重试次数：1
  // Adaptive concurrency (optional — if omitted, falls back to static maxConcurrency)
  adaptive?: Partial<ControllerConfig>;
}

interface QueueTask {
  id: string;
  userId: string;
  type: 'test' | 'suite';
  priority: 'high' | 'medium' | 'low';
  payload: any;
  createdAt: Date;
  estimatedDuration?: number;
}

export class QueueService extends EventEmitter {
  private globalQueue: PQueue;
  private userQueues: Map<string, PQueue>;
  private planQueues: Map<string, PQueue>;
  private activeTasks: Map<string, QueueTask>;
  private waitingTasks: Map<string, QueueTask>;
  private cancelSet: Set<string>;
  private config: QueueConfig;

  // Adaptive concurrency controller
  private concurrencyController: ConcurrencyController | null = null;
  private adaptiveTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: QueueConfig) {
    super();
    this.config = config;

    // Start with minConcurrency if adaptive mode is enabled, otherwise use static max
    const initialConcurrency = config.adaptive
      ? (config.adaptive.minConcurrency ?? 1)
      : config.maxConcurrency;

    this.globalQueue = new PQueue({
      concurrency: initialConcurrency,
      timeout: config.taskTimeout,
      throwOnTimeout: true
    });
    this.userQueues = new Map();
    this.planQueues = new Map();
    this.activeTasks = new Map();
    this.waitingTasks = new Map();
    this.cancelSet = new Set();

    // Initialize adaptive concurrency if configured
    if (config.adaptive) {
      this.initAdaptiveConcurrency(config.adaptive);
    }
  }

  /**
   * Initialise the adaptive concurrency controller.
   * The controller periodically reads OS-level metrics (free memory, CPU load,
   * event loop lag) and adjusts globalQueue.concurrency up or down.
   *
   * On Windows, os.loadavg() returns [0,0,0], so the CPU branch is a no-op;
   * event loop lag acts as the CPU-pressure proxy instead.
   */
  private initAdaptiveConcurrency(opts: Partial<ControllerConfig>): void {
    const controllerOpts: Partial<ControllerConfig> = {
      maxConcurrency: this.config.maxConcurrency,
      ...opts,
    };
    this.concurrencyController = new ConcurrencyController(controllerOpts);

    const checkInterval = controllerOpts.checkIntervalMs ?? 3000;

    this.adaptiveTimer = setInterval(() => {
      this.adjustConcurrency();
    }, checkInterval);

    // Also adjust on queue activity events for faster response
    this.globalQueue.on('active', () => this.adjustConcurrency());
    this.globalQueue.on('next', () => this.adjustConcurrency());

    console.log(`[QueueService] Adaptive concurrency enabled (check every ${checkInterval}ms, range ${controllerOpts.minConcurrency ?? 1}-${controllerOpts.maxConcurrency ?? this.config.maxConcurrency})`);
  }

  /** Read system metrics and update global queue concurrency if needed. */
  private adjustConcurrency(): void {
    if (!this.concurrencyController) return;

    const next = this.concurrencyController.getNextConcurrency();
    if (this.globalQueue.concurrency !== next) {
      const prev = this.globalQueue.concurrency;
      this.globalQueue.concurrency = next;
      this.emit('concurrency_adjusted', { previous: prev, current: next });
    }
  }

  async enqueue(task: QueueTask, executor: (task: QueueTask) => Promise<void>): Promise<void> {
    const userQueue = this.getUserQueue(task.userId);

    const planExecutionId = task.payload?.options?.planExecutionId;
    const planQueue = planExecutionId ? this.getPlanQueue(planExecutionId) : null;

    this.waitingTasks.set(task.id, task);
    this.emit('task_queued', task);

    return this.globalQueue.add(async () => {
      const targetQueue = planQueue || userQueue;

      return targetQueue.add(async () => {
        if (this.cancelSet.has(task.id)) {
          throw new Error('Task cancelled');
        }

        this.waitingTasks.delete(task.id);
        this.activeTasks.set(task.id, task);
        this.emit('task_started', task);

        let attempts = 0;
        while (attempts < this.config.retryAttempts + 1) {
          try {
            await executor(task);
            this.activeTasks.delete(task.id);
            this.cancelSet.delete(task.id);
            this.emit('task_completed', task);
            return;
          } catch (error: any) {
            attempts++;
            if (attempts > this.config.retryAttempts || error.message === 'Task cancelled') {
              this.activeTasks.delete(task.id);
              this.cancelSet.delete(task.id);
              this.emit('task_failed', task, error);
              throw error;
            }
            console.warn(`任务 ${task.id} 第 ${attempts} 次重试...`);
          }
        }
      });
    }, { priority: this.getPriority(task.priority) });
  }

  private getPriority(priority: 'high' | 'medium' | 'low'): number {
    switch (priority) {
      case 'high': return 1;
      case 'low': return 10;
      default: return 5;
    }
  }

  async cancelTask(taskId: string): Promise<boolean> {
    const task = this.waitingTasks.get(taskId) || this.activeTasks.get(taskId);
    if (!task) return false;

    this.cancelSet.add(taskId);
    this.waitingTasks.delete(taskId);

    this.emit('task_cancelled', task);
    return true;
  }

  isCancelled(taskId: string): boolean {
    return this.cancelSet.has(taskId);
  }

  getQueueStatus() {
    const metrics = this.concurrencyController?.getMetrics();
    return {
      global: {
        size: this.globalQueue.size,
        pending: this.globalQueue.pending,
        concurrency: this.globalQueue.concurrency
      },
      waiting: Array.from(this.waitingTasks.values()),
      active: Array.from(this.activeTasks.values()),
      estimatedWaitTime: this.calculateEstimatedWaitTime(),
      // Adaptive concurrency info
      adaptive: this.concurrencyController ? {
        enabled: true,
        currentConcurrency: this.concurrencyController.getCurrent(),
        systemMetrics: metrics,
        recentAdjustments: this.concurrencyController.getAdjustmentLog().slice(-5),
      } : { enabled: false },
    };
  }

  private getUserQueue(userId: string): PQueue {
    if (!this.userQueues.has(userId)) {
      this.userQueues.set(userId, new PQueue({ concurrency: this.config.perUserLimit }));
    }
    return this.userQueues.get(userId)!;
  }

  private getPlanQueue(planExecutionId: string): PQueue {
    if (!this.planQueues.has(planExecutionId)) {
      this.planQueues.set(planExecutionId, new PQueue({ concurrency: 1 }));
      console.log(`📋 [QueueService] 创建测试计划队列: ${planExecutionId.substring(0, 8)}... (串行执行)`);
    }
    return this.planQueues.get(planExecutionId)!;
  }

  private calculateEstimatedWaitTime(): number {
    const avgDuration = 120;
    const position = this.globalQueue.size;
    const concurrency = this.globalQueue.concurrency;
    return Math.ceil(position / concurrency) * avgDuration;
  }

  /** Graceful shutdown: stop adaptive timer and destroy monitor. */
  destroy(): void {
    if (this.adaptiveTimer) {
      clearInterval(this.adaptiveTimer);
      this.adaptiveTimer = null;
    }
    this.concurrencyController?.destroy();
  }
}

export { QueueTask, QueueConfig };
