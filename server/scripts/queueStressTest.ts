/**
 * Queue Stress Test — validates adaptive concurrency controller
 *
 * Purpose:
 *   Simulate multiple heavy browser-like tasks to prove that the adaptive
 *   concurrency controller scales down under memory pressure and recovers
 *   when resources are freed.
 *
 * What it does:
 *   - Allocates 200MB Buffer per task (simulates Chromium tab memory)
 *   - Injects tasks at a rate faster than processing capacity
 *   - Samples OS metrics and queue state every 200ms → writes to CSV
 *   - Runs for 30 seconds, then reports summary
 *
 * Expected output (three phases):
 *   Phase 1 (0-5s):  Ramp-up — concurrency climbs from 1 to max as memory is plentiful
 *   Phase 2 (5-15s): Pressure — concurrency drops as memory fills, emergency brake fires
 *   Phase 3 (15-30s): Recovery — old tasks finish, memory frees, concurrency climbs again
 *
 * Usage:
 *   npx tsx server/scripts/queueStressTest.ts
 *
 * Output:
 *   queue_stress_report.csv — for Excel/Sheets charting
 *   Console summary with peak/min concurrency and memory readings
 *
 * Environment:
 *   Tested on: Ubuntu 22.04 LTS, Intel i7-14650HX, 16GB RAM
 *   Also verified on: Windows 11, same hardware (os.loadavg() returns [0,0,0],
 *   so adaptive controller relies on eventLoopLag as CPU-pressure proxy)
 */

import * as fs from 'fs';
import * as os from 'os';
import PQueue from 'p-queue';
import { ConcurrencyController } from '../services/concurrencyController.js';

// ─── Configuration ───────────────────────────────────────────────────────────

const TASK_MEMORY_MB = 200;        // Memory per simulated browser tab
const TASK_DURATION_MS = 3000;     // How long each task holds memory
const TASK_CPU_BLOCK_MS = 100;     // Synchronous CPU spin per task
const TASK_INJECT_INTERVAL_MS = 100; // New task every 100ms (10 tasks/sec)
const TEST_DURATION_MS = 30_000;    // Total test duration
const SAMPLE_INTERVAL_MS = 200;     // Metric sampling interval
const CSV_PATH = 'queue_stress_report.csv';

// ─── Simulated browser task ─────────────────────────────────────────────────

const simulateBrowserTask = async (taskId: number): Promise<void> => {
  // Allocate off-heap memory (visible to os.freemem(), not just V8 heap)
  const memoryHog = Buffer.alloc(1024 * 1024 * TASK_MEMORY_MB);
  memoryHog.fill(1); // Force OS to commit pages (prevent lazy allocation)

  // Simulate CPU work (rendering, JS execution in browser)
  const cpuStart = Date.now();
  while (Date.now() - cpuStart < TASK_CPU_BLOCK_MS) {
    Math.random();
  }

  // Hold memory for task duration (simulates open browser tab)
  await new Promise(resolve => setTimeout(resolve, TASK_DURATION_MS));

  // memoryHog goes out of scope → GC eligible
  void memoryHog;
};

// ─── Main test runner ────────────────────────────────────────────────────────

const runStressTest = async () => {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║        Queue Adaptive Concurrency Stress Test       ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`System: ${os.cpus().length} cores, ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(1)}GB RAM`);
  console.log(`Task profile: ${TASK_MEMORY_MB}MB × ${TASK_DURATION_MS}ms, inject every ${TASK_INJECT_INTERVAL_MS}ms`);
  console.log(`Duration: ${TEST_DURATION_MS / 1000}s, output: ${CSV_PATH}\n`);

  const controller = new ConcurrencyController({
    minConcurrency: 1,
    maxConcurrency: 6,
    memDangerThreshold: 15,
    memSafeThreshold: 40,
    cpuDangerRatio: 0.9,
    cpuSafeRatio: 0.6,
    lagThreshold: 100,
    lagSafeThreshold: 50,
    cooldownMs: 2000,
  });

  const queue = new PQueue({ concurrency: 1, autoStart: true });

  // CSV logger
  const logStream = fs.createWriteStream(CSV_PATH);
  logStream.write('TimeMs,FreeMemPercent,Concurrency,QueueSize,ActiveTasks,EventLoopLagMs,ProcessRSSMB\n');

  const startTime = Date.now();
  let taskId = 0;
  let peakConcurrency = 1;
  let minFreeMemPercent = 100;
  let emergencyBrakeCount = 0;
  let completedTasks = 0;
  let failedTasks = 0;

  // Track concurrency adjustments
  queue.on('completed', () => { completedTasks++; });
  queue.on('error', () => { failedTasks++; });

  // ─── Monitoring loop ─────────────────────────────────────────────────────
  const monitorInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const metrics = controller.getMetrics();
    const processRSS = process.memoryUsage().rss / 1024 / 1024;

    // Adapt queue concurrency
    const nextConcurrency = controller.getNextConcurrency();
    if (queue.concurrency !== nextConcurrency) {
      if (nextConcurrency < queue.concurrency) emergencyBrakeCount++;
      queue.concurrency = nextConcurrency;
    }

    // Track extremes
    if (nextConcurrency > peakConcurrency) peakConcurrency = nextConcurrency;
    if (metrics.freeMemPercentage < minFreeMemPercent) minFreeMemPercent = metrics.freeMemPercentage;

    // Write CSV row
    logStream.write(
      `${elapsed},${metrics.freeMemPercentage.toFixed(2)},${queue.concurrency},` +
      `${queue.size},${queue.pending},${metrics.eventLoopLag.toFixed(1)},${processRSS.toFixed(1)}\n`
    );

    // Console progress
    process.stdout.write(
      `\r[${(elapsed / 1000).toFixed(1)}s] FreeMem: ${metrics.freeMemPercentage.toFixed(1)}% | ` +
      `Concurrency: ${queue.concurrency} | Pending: ${queue.size} | ` +
      `Completed: ${completedTasks} | RSS: ${processRSS.toFixed(0)}MB   `
    );

    // Stop condition
    if (elapsed >= TEST_DURATION_MS) {
      clearInterval(monitorInterval);
      clearInterval(taskInjector);
      logStream.end();
      controller.destroy();

      console.log('\n\n═══════════════ RESULTS ═══════════════');
      console.log(`Duration:           ${(elapsed / 1000).toFixed(1)}s`);
      console.log(`Tasks completed:    ${completedTasks}`);
      console.log(`Tasks failed:       ${failedTasks}`);
      console.log(`Peak concurrency:   ${peakConcurrency}`);
      console.log(`Min free memory:    ${minFreeMemPercent.toFixed(1)}%`);
      console.log(`Scale-down events:  ${emergencyBrakeCount}`);
      console.log(`Process RSS (now):  ${processRSS.toFixed(1)}MB`);
      console.log(`Adjustment log:     ${controller.getAdjustmentLog().length} entries`);
      console.log(`CSV output:         ${CSV_PATH}`);
      console.log('═══════════════════════════════════════\n');

      // Print adjustment log
      const log = controller.getAdjustmentLog();
      if (log.length > 0) {
        console.log('Recent concurrency adjustments:');
        for (const entry of log.slice(-10)) {
          const t = ((entry.timestamp - startTime) / 1000).toFixed(1);
          console.log(`  [${t}s] ${entry.previous} → ${entry.current}: ${entry.reason}`);
        }
      }

      process.exit(0);
    }
  }, SAMPLE_INTERVAL_MS);

  // ─── Task injection loop ─────────────────────────────────────────────────
  const taskInjector = setInterval(() => {
    const id = taskId++;
    queue.add(() => simulateBrowserTask(id)).catch(() => {
      // Timeout or other errors are expected under heavy load
    });
  }, TASK_INJECT_INTERVAL_MS);

  console.log('Stress test running...\n');
};

runStressTest().catch(console.error);
