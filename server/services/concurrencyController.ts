/**
 * Adaptive Concurrency Controller
 *
 * Dynamically adjusts task concurrency based on real-time system metrics
 * (free memory, CPU load ratio, event loop lag). Designed for a single-machine
 * deployment where multiple Playwright browser instances compete for resources.
 *
 * Decision logic (evaluated every time getNextConcurrency() is called):
 *   1. Emergency brake: if free memory < memDangerThreshold → force to min immediately
 *   2. Cooldown check: skip adjustment if last change was < cooldownMs ago
 *   3. Scale-down: if CPU overloaded OR event loop lagging → decrement by 1
 *   4. Scale-up: if memory safe AND CPU safe AND lag low → increment by 1
 *
 * The asymmetric thresholds (danger vs safe) create a dead-zone that prevents
 * oscillation when metrics hover near a boundary.
 */

import { SystemMonitor, SystemMetrics } from './systemMonitor.js';

export interface ControllerConfig {
  minConcurrency: number;
  maxConcurrency: number;
  // Memory thresholds (% of total physical memory that is FREE)
  memDangerThreshold: number;  // e.g. 15 → below 15% free = emergency
  memSafeThreshold: number;    // e.g. 40 → above 40% free = safe to grow
  // CPU thresholds (loadavg / cpuCount; 0 on Windows ⇒ branch is no-op)
  cpuDangerRatio: number;      // e.g. 0.9
  cpuSafeRatio: number;        // e.g. 0.6
  // Event loop lag threshold (ms) — acts as CPU proxy on Windows
  lagThreshold: number;        // e.g. 100
  lagSafeThreshold: number;    // e.g. 50
  // Minimum interval between adjustments
  cooldownMs: number;          // e.g. 5000
  // Monitoring sample interval
  checkIntervalMs: number;     // e.g. 3000
}

const DEFAULT_CONFIG: ControllerConfig = {
  minConcurrency: 1,
  maxConcurrency: 6,
  memDangerThreshold: 15,
  memSafeThreshold: 40,
  cpuDangerRatio: 0.9,
  cpuSafeRatio: 0.6,
  lagThreshold: 100,
  lagSafeThreshold: 50,
  cooldownMs: 5000,
  checkIntervalMs: 3000,
};

export type ConcurrencyAdjustEvent = {
  previous: number;
  current: number;
  reason: string;
  metrics: SystemMetrics;
  timestamp: number;
};

export class ConcurrencyController {
  private monitor: SystemMonitor;
  private config: ControllerConfig;
  private currentConcurrency: number;
  private lastAdjustmentTime: number = 0;
  private adjustmentLog: ConcurrencyAdjustEvent[] = [];

  constructor(options: Partial<ControllerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.monitor = new SystemMonitor();
    this.currentConcurrency = this.config.minConcurrency;
  }

  /**
   * Evaluate system metrics and return the recommended concurrency level.
   * This is meant to be called periodically (e.g. on queue 'active'/'next'
   * events, or on a setInterval).
   */
  public getNextConcurrency(): number {
    const now = Date.now();
    const metrics = this.monitor.getMetrics();
    const prev = this.currentConcurrency;

    // 1. Emergency brake — unconditional, ignores cooldown
    if (metrics.freeMemPercentage < this.config.memDangerThreshold) {
      if (this.currentConcurrency !== this.config.minConcurrency) {
        this.currentConcurrency = this.config.minConcurrency;
        this.lastAdjustmentTime = now;
        this.logAdjustment(prev, this.currentConcurrency,
          `EMERGENCY: free memory ${metrics.freeMemPercentage.toFixed(1)}% < ${this.config.memDangerThreshold}%`, metrics);
        console.warn(`[ConcurrencyController] ⚠️ Memory critical (${metrics.freeMemPercentage.toFixed(1)}%). Emergency scale-down to ${this.currentConcurrency}`);
      }
      return this.currentConcurrency;
    }

    // 2. Cooldown — prevent oscillation
    if (now - this.lastAdjustmentTime < this.config.cooldownMs) {
      return this.currentConcurrency;
    }

    // 3. Scale-down — CPU or event loop pressure
    //    On Windows, cpuLoadRatio is always 0, so the CPU branch is a no-op;
    //    eventLoopLag serves as the CPU-pressure proxy.
    const cpuOverloaded = metrics.cpuLoadRatio > this.config.cpuDangerRatio;
    const lagOverloaded = metrics.eventLoopLag > this.config.lagThreshold;

    if (cpuOverloaded || lagOverloaded) {
      if (this.currentConcurrency > this.config.minConcurrency) {
        this.currentConcurrency--;
        this.lastAdjustmentTime = now;
        const reason = cpuOverloaded
          ? `CPU load ${metrics.cpuLoadRatio.toFixed(2)} > ${this.config.cpuDangerRatio}`
          : `Event loop lag ${metrics.eventLoopLag.toFixed(0)}ms > ${this.config.lagThreshold}ms`;
        this.logAdjustment(prev, this.currentConcurrency, `SCALE-DOWN: ${reason}`, metrics);
        console.log(`[ConcurrencyController] 📉 ${reason}. Concurrency: ${prev} → ${this.currentConcurrency}`);
      }
      return this.currentConcurrency;
    }

    // 4. Scale-up — all metrics within safe bounds
    const memorySafe = metrics.freeMemPercentage > this.config.memSafeThreshold;
    const cpuSafe = metrics.cpuLoadRatio < this.config.cpuSafeRatio;
    const lagSafe = metrics.eventLoopLag < this.config.lagSafeThreshold;

    if (memorySafe && cpuSafe && lagSafe) {
      if (this.currentConcurrency < this.config.maxConcurrency) {
        this.currentConcurrency++;
        this.lastAdjustmentTime = now;
        this.logAdjustment(prev, this.currentConcurrency,
          `SCALE-UP: mem=${metrics.freeMemPercentage.toFixed(1)}%, cpu=${metrics.cpuLoadRatio.toFixed(2)}, lag=${metrics.eventLoopLag.toFixed(0)}ms`, metrics);
        console.log(`[ConcurrencyController] 📈 Resources available. Concurrency: ${prev} → ${this.currentConcurrency}`);
      }
    }

    return this.currentConcurrency;
  }

  /** Current concurrency level (read-only). */
  public getCurrent(): number {
    return this.currentConcurrency;
  }

  /** Recent adjustment history for debugging / API exposure. */
  public getAdjustmentLog(): ConcurrencyAdjustEvent[] {
    return this.adjustmentLog.slice(-50);
  }

  /** Snapshot of current system metrics. */
  public getMetrics(): SystemMetrics {
    return this.monitor.getMetrics();
  }

  public destroy(): void {
    this.monitor.destroy();
  }

  private logAdjustment(previous: number, current: number, reason: string, metrics: SystemMetrics): void {
    this.adjustmentLog.push({ previous, current, reason, metrics, timestamp: Date.now() });
    // Keep only last 200 entries
    if (this.adjustmentLog.length > 200) {
      this.adjustmentLog = this.adjustmentLog.slice(-100);
    }
  }
}
