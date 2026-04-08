/**
 * System Monitor - OS-level resource metrics collection
 * Collects memory, CPU load, and event loop lag for adaptive concurrency control.
 *
 * Uses os.freemem()/os.totalmem() instead of process.memoryUsage() because
 * Playwright/Chromium browsers run as child processes whose memory is NOT
 * reflected in Node.js heap stats. os.freemem() captures system-wide pressure
 * including all child processes (Chromium tabs, MCP subprocesses, etc.).
 *
 * On Windows, os.loadavg() always returns [0,0,0], so the controller falls back
 * to eventLoopLag as a CPU-pressure proxy. On Linux, both metrics are valid.
 */

import os from 'os';
import { monitorEventLoopDelay, IntervalHistogram } from 'perf_hooks';

export interface SystemMetrics {
  freeMemPercentage: number;   // 0-100: remaining physical memory %
  cpuLoadRatio: number;        // 0-1+: 1-min load average / CPU count (0 on Windows)
  eventLoopLag: number;        // ms: event loop p99 latency
}

export class SystemMonitor {
  private histogram: IntervalHistogram;

  constructor(resolution: number = 50) {
    // Enable event loop delay sampling; resolution in ms controls granularity.
    // 50ms is fine for a 2-5s check interval; lower values add noise on Windows
    // where the default timer tick is ~15.6ms.
    this.histogram = monitorEventLoopDelay({ resolution });
    this.histogram.enable();
  }

  public getMetrics(): SystemMetrics {
    // 1. Memory — physical, OS-wide (includes Chromium child processes)
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const freeMemPercentage = (freeMem / totalMem) * 100;

    // 2. CPU — 1-min load average normalised by core count.
    //    On Windows os.loadavg() returns [0,0,0]; the controller treats 0 as
    //    "metric unavailable" and relies on eventLoopLag instead.
    const cpus = os.cpus().length;
    const loadAvg = os.loadavg()[0];
    const cpuLoadRatio = cpus > 0 ? loadAvg / cpus : 0;

    // 3. Event loop lag — p99 in nanoseconds, converted to ms.
    //    This is a direct proxy for Node.js main-thread saturation: high lag
    //    means the scheduler can't process I/O callbacks on time, which blocks
    //    queue dispatching and WebSocket broadcasts.
    const eventLoopLag = this.histogram.percentile(99) / 1e6;

    return { freeMemPercentage, cpuLoadRatio, eventLoopLag };
  }

  /** Reset histogram so stale samples don't bias current readings. */
  public reset(): void {
    this.histogram.reset();
  }

  public destroy(): void {
    this.histogram.disable();
  }
}
