import crypto from 'crypto';
import { PrismaClient } from '../../src/generated/prisma/index.js';

/**
 * [GEAR] Intelligent Element Cache System
 * Dual-layer caching strategy: Memory cache (L1) + Database persistence (L2)
 * Used to cache AI element recognition results, avoid redundant AI API calls, and ensure cache is not lost after service restart
 */

const prisma = new PrismaClient();

export interface CachedElement {
  ref: string;           // Element reference
  text: string;          // Element text
  confidence: number;    // Confidence score
  timestamp: number;     // Cache timestamp
  hitCount: number;      // Hit count
}

export interface CacheStats {
  totalRequests: number;    // Total requests
  cacheHits: number;        // Cache hits
  cacheMisses: number;      // Cache misses
  hitRate: number;          // Hit rate
  totalElements: number;    // Total cached elements
  memoryUsage: number;      // Memory usage (KB)
  trendData?: Array<{       // Trend data
    time: string;
    hitRate: number;
    requests: number;
  }>;
}

export class ElementCache {
  private cache: Map<string, CachedElement> = new Map();
  private stats = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0
  };

  // Trend data recording (Keeps up to 24 hours of data)
  private trendData: Array<{
    timestamp: number;
    requests: number;
    hits: number;
  }> = [];

  // Configuration parameters
  private readonly maxCacheSize: number;
  private readonly cacheTTL: number; // Cache time-to-live (milliseconds)
  private readonly enableCache: boolean;
  private readonly enablePersistence: boolean; // Whether persistence is enabled
  private syncInterval: NodeJS.Timeout | null = null; // Sync timer

  constructor(options?: {
    maxSize?: number;
    ttl?: number;
    enabled?: boolean;
    persistence?: boolean;
  }) {
    this.maxCacheSize = options?.maxSize || 1000;
    this.cacheTTL = options?.ttl || 24 * 60 * 60 * 1000; // Default 24 hours
    this.enableCache = options?.enabled !== false; // Enabled by default
    this.enablePersistence = options?.persistence !== false; // Persistence enabled by default

    if (this.enableCache) {
      console.log('[FIRE] Element cache system enabled');
      console.log(`   Max cache size: ${this.maxCacheSize}`);
      console.log(`   Expiration time: ${this.cacheTTL / 1000 / 60} minutes`);
      console.log(`   Persistence: ${this.enablePersistence ? '[OK] Enabled' : '[FAIL] Disabled'}`);

      if (this.enablePersistence) {
        // Load cache from database
        this.loadFromDatabase().catch(err => {
          console.error('[ERROR] Failed to load cache from database:', err);
        });

        // Periodic sync to database (every 5 minutes)
        this.startPeriodicSync();
      }
    } else {
      console.log('[WARNING] Element cache system disabled');
    }
  }

  /**
   * Generate cache key
   * Based on: URL + Element description + Page structure fingerprint
   */
  generateCacheKey(
    url: string,
    selector: string,
    snapshotFingerprint: string
  ): string {
    const rawKey = `${url}::${selector}::${snapshotFingerprint}`;
    return crypto.createHash('md5').update(rawKey).digest('hex');
  }

  /**
   * Generate page snapshot fingerprint
   * Extracts core element features of the page, ignoring dynamic content
   */
  generateSnapshotFingerprint(snapshot: string): string {
    if (!snapshot) return '';

    // Extract all element refs and roles, ignore dynamic text
    const lines = snapshot.split('\n');
    const elements: string[] = [];

    for (const line of lines) {
      const trimmedLine = line.trim();
      const refMatch = trimmedLine.match(/\[ref=([a-zA-Z0-9_-]+)\]/);

      if (refMatch) {
        const ref = refMatch[1];
        let role = '';

        // Extract role information
        if (trimmedLine.includes('textbox')) role = 'textbox';
        else if (trimmedLine.includes('button')) role = 'button';
        else if (trimmedLine.includes('link')) role = 'link';
        else if (trimmedLine.includes('checkbox')) role = 'checkbox';
        else if (trimmedLine.includes('combobox')) role = 'combobox';

        if (role) {
          elements.push(`${ref}:${role}`);
        }
      }
    }

    // Sort element list and generate hash
    elements.sort();
    const fingerprint = elements.join('|');
    return crypto.createHash('md5').update(fingerprint).digest('hex').substring(0, 16);
  }

  /**
   * Get cached element
   */
  async get(cacheKey: string): Promise<CachedElement | null> {
    if (!this.enableCache) {
      return null;
    }

    this.stats.totalRequests++;
    this.recordTrendData(false);

    // L1: Try to get from memory cache
    let cached: CachedElement | null = this.cache.get(cacheKey) || null;

    if (!cached && this.enablePersistence) {
      // L2: Get from database
      cached = await this.getFromDatabase(cacheKey);
      if (cached) {
        // Load into memory cache
        this.cache.set(cacheKey, cached);
        console.log(`[SAVE] Loaded cache from database: ${cached.text}`);
      }
    }

    if (!cached) {
      this.stats.cacheMisses++;
      return null;
    }

    // Check if expired
    const age = Date.now() - cached.timestamp;
    if (age > this.cacheTTL) {
      this.cache.delete(cacheKey);
      if (this.enablePersistence) {
        await this.deleteFromDatabase(cacheKey);
      }
      this.stats.cacheMisses++;
      console.log(`[TRASH] Cache expired: ${cacheKey.substring(0, 8)}... (${Math.round(age / 1000 / 60)} minutes ago)`);
      return null;
    }

    // Cache hit
    this.stats.cacheHits++;
    cached.hitCount++;
    this.recordTrendData(true);

    // Asynchronously update hit count in database
    if (this.enablePersistence) {
      this.updateHitCount(cacheKey, cached.hitCount).catch(err => {
        console.error('Failed to update hit count:', err);
      });
    }

    console.log(`[OK] Cache hit: ${cached.text} (Hit ${cached.hitCount} times)`);
    return cached;
  }

  /**
   * Set cache
   */
  async set(
    cacheKey: string,
    element: {
      ref: string;
      text: string;
      confidence?: number;
    },
    metadata?: {
      url?: string;
      selector?: string;
      snapshotFingerprint?: string;
    }
  ): Promise<void> {
    if (!this.enableCache) {
      return;
    }

    // If cache is full, evict the oldest entry
    if (this.cache.size >= this.maxCacheSize) {
      await this.evictOldest();
    }

    const cachedElement: CachedElement = {
      ref: element.ref,
      text: element.text,
      confidence: element.confidence || 100,
      timestamp: Date.now(),
      hitCount: 0
    };

    // L1: Store in memory cache
    this.cache.set(cacheKey, cachedElement);
    console.log(`[SAVE] Element cached: ${element.text} (${cacheKey.substring(0, 8)}...)`);

    // L2: Persist to database
    if (this.enablePersistence) {
      await this.saveToDatabase(cacheKey, cachedElement, metadata);
    }
  }

  /**
   * Evict the oldest cache entry
   */
  private async evictOldest(): Promise<void> {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    // Find the oldest entry
    for (const [key, value] of this.cache.entries()) {
      if (value.timestamp < oldestTime) {
        oldestTime = value.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const evicted = this.cache.get(oldestKey);
      this.cache.delete(oldestKey);

      // Delete from database
      if (this.enablePersistence) {
        await this.deleteFromDatabase(oldestKey);
      }

      console.log(`[TRASH] Cache full, removed oldest entry: ${evicted?.text} (${Math.round((Date.now() - oldestTime) / 1000 / 60)} minutes ago)`);
    }
  }

  /**
   * Clear cache for a specific URL
   */
  clearByUrl(url: string): number {
    let count = 0;
    const urlHash = crypto.createHash('md5').update(url).digest('hex').substring(0, 16);

    for (const [key] of this.cache.entries()) {
      if (key.includes(urlHash)) {
        this.cache.delete(key);
        count++;
      }
    }

    if (count > 0) {
      console.log(`[TRASH] Cleared URL-related cache: ${url} (${count} entries)`);
    }

    return count;
  }

  /**
   * Clear all memory cache
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`[TRASH] Cleared all memory cache (${size} entries)`);
  }

  /**
   * [FIRE] Clear all cache (including database)
   */
  async clearAll(): Promise<number> {
    // Clear memory cache
    const memorySize = this.cache.size;
    this.cache.clear();
    console.log(`[TRASH] Cleared memory cache (${memorySize} entries)`);

    // Clear database cache
    if (this.enablePersistence) {
      try {
        const result = await prisma.ai_element_cache.deleteMany({});
        console.log(`[TRASH] Cleared database cache (${result.count} entries)`);
        return result.count;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[ERROR] Failed to clear database cache:', errorMessage);
        return 0;
      }
    }

    return 0;
  }

  /**
   * Record trend data
   */
  private recordTrendData(isHit: boolean): void {
    const now = Date.now();
    const currentMinute = Math.floor(now / 60000) * 60000; // Round to minute

    // Find record for current minute
    let record = this.trendData.find(r => r.timestamp === currentMinute);

    if (!record) {
      record = { timestamp: currentMinute, requests: 0, hits: 0 };
      this.trendData.push(record);

      // Keep recent 24 hours of data
      const cutoff = now - 24 * 60 * 60 * 1000;
      this.trendData = this.trendData.filter(r => r.timestamp > cutoff);
    }

    record.requests++;
    if (isHit) {
      record.hits++;
    }
  }

  /**
   * Get cache statistics (Synchronous version, gets from memory only)
   */
  getStats(): CacheStats {
    const hitRate = this.stats.totalRequests > 0
      ? (this.stats.cacheHits / this.stats.totalRequests) * 100
      : 0;

    // Estimate memory usage
    let memoryUsage = 0;
    for (const [key, value] of this.cache.entries()) {
      memoryUsage += key.length * 2; // key is string
      memoryUsage += value.ref.length * 2;
      memoryUsage += value.text.length * 2;
      memoryUsage += 32; // Estimated size of other fields
    }

    // Generate trend data (recent 6 hours, one point per hour)
    const trendData = this.generateTrendData();

    return {
      totalRequests: this.stats.totalRequests,
      cacheHits: this.stats.cacheHits,
      cacheMisses: this.stats.cacheMisses,
      hitRate: Math.round(hitRate * 100) / 100,
      totalElements: this.cache.size,
      memoryUsage: Math.round(memoryUsage / 1024),
      trendData
    };
  }

  /**
   * [FIRE] Get cache statistics (Asynchronous version, aggregates data from database)
   * Merges memory statistics and database statistics, ensuring historical data is retrievable after service restart
   */
  async getStatsFromDatabase(): Promise<CacheStats> {
    try {
      console.log('[CHART] [Cache Stats] Starting to fetch statistics data from database...');
      console.log('[CHART] [Cache Stats] Memory statistics:', {
        totalRequests: this.stats.totalRequests,
        cacheHits: this.stats.cacheHits,
        cacheMisses: this.stats.cacheMisses,
        memorySize: this.cache.size
      });

      // Aggregate statistics data from database
      const [dbStats, dbCount] = await Promise.all([
        // Aggregate hit counts in database
        prisma.ai_element_cache.aggregate({
          _sum: {
            hit_count: true
          },
          where: {
            expires_at: {
              gt: new Date()
            }
          }
        }),
        // Count total number of cache items in database
        prisma.ai_element_cache.count({
          where: {
            expires_at: {
              gt: new Date()
            }
          }
        })
      ]);

      console.log('[CHART] [Cache Stats] Database query results:', {
        dbHitCount: dbStats._sum.hit_count,
        dbCacheCount: dbCount
      });

      // Total hit count in database (This is persistent historical cumulative data)
      // Note: This is the sum of hit_count for all cache items, representing historical cumulative hit count
      const dbHits = dbStats._sum.hit_count || 0;

      // Merge memory statistics and database statistics
      // Database statistics are historical cumulative data, memory statistics are increments of the current session
      // Total hits = Database historical hits + Current session new hits
      const totalHits = dbHits + this.stats.cacheHits;

      // Calculation of total requests:
      // - Total requests of current session = this.stats.totalRequests (includes hits and misses)
      // - Historical total requests cannot be accurately obtained (because missed requests are not recorded)
      // - We use: Historical hits (as a lower bound for historical requests) + Current session requests
      //   This at least reflects the complete statistics of the current session and the accumulation of historical hits
      const totalRequests = this.stats.totalRequests > 0
        ? dbHits + this.stats.totalRequests  // Historical hits (as lower bound) + Current session requests
        : (dbHits > 0 ? dbHits : 0);  // If no requests in current session, and history has hits, use historical hits as estimate

      // Calculate hit rate
      const hitRate = totalRequests > 0
        ? (totalHits / totalRequests) * 100
        : 0;

      // Estimate memory usage
      let memoryUsage = 0;
      for (const [key, value] of this.cache.entries()) {
        memoryUsage += key.length * 2;
        memoryUsage += value.ref.length * 2;
        memoryUsage += value.text.length * 2;
        memoryUsage += 32;
      }

      // Generate trend data
      const trendData = this.generateTrendData();

      // Total elements: Memory cache count + Database cache count (deduplicated by taking max)
      const totalElements = Math.max(this.cache.size, dbCount);

      const result = {
        totalRequests: totalRequests,
        cacheHits: totalHits,
        cacheMisses: totalRequests - totalHits,
        hitRate: Math.round(hitRate * 100) / 100,
        totalElements: totalElements,
        memoryUsage: Math.round(memoryUsage / 1024),
        trendData
      };

      console.log('[CHART] [Cache Stats] Final statistical results:', result);

      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ERROR] [Cache Stats] Failed to fetch statistics from database:', errorMessage);
      console.error('[ERROR] [Cache Stats] Error details:', error);

      // If database query fails, fallback to memory statistics
      console.log('[WARNING] [Cache Stats] Falling back to memory statistics');
      return this.getStats();
    }
  }

  /**
   * Generate trend chart data
   */
  private generateTrendData(): Array<{ time: string; hitRate: number; requests: number }> {
    if (this.trendData.length === 0) {
      // If no trend data, return empty array
      return [];
    }

    const now = Date.now();
    const result: Array<{ time: string; hitRate: number; requests: number }> = [];

    // Generate data points for the last 6 hours (one per hour)
    for (let i = 5; i >= 0; i--) {
      const hourStart = now - i * 60 * 60 * 1000;
      const hourEnd = hourStart + 60 * 60 * 1000;

      // Collect all data within this hour
      const hourData = this.trendData.filter(
        r => r.timestamp >= hourStart && r.timestamp < hourEnd
      );

      if (hourData.length > 0) {
        const totalRequests = hourData.reduce((sum, r) => sum + r.requests, 0);
        const totalHits = hourData.reduce((sum, r) => sum + r.hits, 0);
        const hitRate = totalRequests > 0 ? (totalHits / totalRequests) * 100 : 0;

        const date = new Date(hourStart);
        const timeLabel = `${date.getHours().toString().padStart(2, '0')}:00`;

        result.push({
          time: timeLabel,
          hitRate: Math.round(hitRate * 10) / 10,
          requests: totalRequests
        });
      } else {
        // If no data this hour, use 0
        const date = new Date(hourStart);
        const timeLabel = `${date.getHours().toString().padStart(2, '0')}:00`;
        result.push({
          time: timeLabel,
          hitRate: 0,
          requests: 0
        });
      }
    }

    return result;
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
    console.log('[CHART] Cache statistics reset');
  }

  /**
   * Print cache statistics report
   */
  printStatsReport(): void {
    const stats = this.getStats();

    console.log('\n[CHART] ========== Element Cache Statistics Report ==========');
    console.log(`   Total requests: ${stats.totalRequests}`);
    console.log(`   Cache hits: ${stats.cacheHits} [OK]`);
    console.log(`   Cache misses: ${stats.cacheMisses} [FAIL]`);
    console.log(`   Hit rate: ${stats.hitRate}%`);
    console.log(`   Cached elements: ${stats.totalElements}/${this.maxCacheSize}`);
    console.log(`   Memory usage: ${stats.memoryUsage}KB`);

    if (stats.totalRequests > 0) {
      const savedCalls = stats.cacheHits;
      console.log(`   [MONEY] AI calls saved: ${savedCalls} times`);
      console.log(`   [ZAP] Performance improvement: ${stats.hitRate}%`);
    }

    console.log('==========================================\n');
  }

  /**
   * Export cache data (for persistence)
   */
  exportCache(): string {
    const cacheData = Array.from(this.cache.entries()).map(([key, value]) => ({
      key,
      value
    }));

    return JSON.stringify({
      version: '1.0',
      timestamp: Date.now(),
      data: cacheData
    });
  }

  /**
   * Import cache data (for recovery)
   */
  importCache(jsonData: string): number {
    try {
      const parsed = JSON.parse(jsonData);

      if (!parsed.data || !Array.isArray(parsed.data)) {
        throw new Error('Invalid cache data format');
      }

      let imported = 0;
      for (const item of parsed.data) {
        if (item.key && item.value && this.cache.size < this.maxCacheSize) {
          this.cache.set(item.key, item.value);
          imported++;
        }
      }

      console.log(`[INBOX] Cache imported: ${imported} entries`);
      return imported;

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ERROR] Failed to import cache:', errorMessage);
      return 0;
    }
  }

  /**
   * [FIRE] Load cache from database into memory
   */
  private async loadFromDatabase(): Promise<void> {
    try {
      const now = new Date();

      // Load unexpired cache from database
      const cachedItems = await prisma.ai_element_cache.findMany({
        where: {
          expires_at: {
            gt: now
          }
        },
        orderBy: {
          created_at: 'desc'
        },
        take: this.maxCacheSize
      });

      let loaded = 0;
      for (const item of cachedItems) {
        if (this.cache.size >= this.maxCacheSize) break;

        const cachedElement: CachedElement = {
          ref: item.element_ref,
          text: item.element_text,
          confidence: item.confidence,
          timestamp: item.created_at.getTime(),
          hitCount: item.hit_count
        };

        this.cache.set(item.cache_key, cachedElement);
        loaded++;
      }

      console.log(`[INBOX] Loaded cache from database: ${loaded} entries`);

      // Clean up expired database records
      const deleted = await prisma.ai_element_cache.deleteMany({
        where: {
          expires_at: {
            lte: now
          }
        }
      });

      if (deleted.count > 0) {
        console.log(`[TRASH] Cleared expired cache: ${deleted.count} entries`);
      }

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ERROR] Failed to load cache from database:', errorMessage);
    }
  }

  /**
   * [FIRE] Get single cache from database
   */
  private async getFromDatabase(cacheKey: string): Promise<CachedElement | null> {
    try {
      const item = await prisma.ai_element_cache.findUnique({
        where: { cache_key: cacheKey }
      });

      if (!item) {
        return null;
      }

      // Check if expired
      if (item.expires_at <= new Date()) {
        await this.deleteFromDatabase(cacheKey);
        return null;
      }

      return {
        ref: item.element_ref,
        text: item.element_text,
        confidence: item.confidence,
        timestamp: item.created_at.getTime(),
        hitCount: item.hit_count
      };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ERROR] Failed to get cache from database:', errorMessage);
      return null;
    }
  }

  /**
   * [FIRE] Save cache to database
   */
  private async saveToDatabase(
    cacheKey: string,
    element: CachedElement,
    metadata?: {
      url?: string;
      selector?: string;
      snapshotFingerprint?: string;
    }
  ): Promise<void> {
    try {
      const expiresAt = new Date(element.timestamp + this.cacheTTL);

      await prisma.ai_element_cache.upsert({
        where: { cache_key: cacheKey },
        update: {
          element_ref: element.ref,
          element_text: element.text,
          confidence: element.confidence,
          hit_count: element.hitCount,
          expires_at: expiresAt
        },
        create: {
          cache_key: cacheKey,
          url: metadata?.url || '',
          selector: metadata?.selector || '',
          snapshot_fp: metadata?.snapshotFingerprint || '',
          element_ref: element.ref,
          element_text: element.text,
          confidence: element.confidence,
          hit_count: 0,
          expires_at: expiresAt
        }
      });

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ERROR] Failed to save cache to database:', errorMessage);
    }
  }

  /**
   * [FIRE] Delete cache from database
   */
  private async deleteFromDatabase(cacheKey: string): Promise<void> {
    try {
      await prisma.ai_element_cache.delete({
        where: { cache_key: cacheKey }
      }).catch(() => {
        // Ignore errors for deleting non-existent records
      });
    } catch {
      // Ignore deletion errors
    }
  }

  /**
   * [FIRE] Update cache hit count
   */
  private async updateHitCount(cacheKey: string, hitCount: number): Promise<void> {
    try {
      await prisma.ai_element_cache.update({
        where: { cache_key: cacheKey },
        data: {
          hit_count: hitCount,
          last_hit_at: new Date()
        }
      }).catch(() => {
        // Ignore errors for updating non-existent records
      });
    } catch {
      // Ignore update errors
    }
  }

  /**
   * [FIRE] Start periodic sync task
   */
  private startPeriodicSync(): void {
    // Sync memory cache to database every 5 minutes
    this.syncInterval = setInterval(() => {
      this.syncToDatabase().catch(err => {
        console.error('Failed to periodically sync cache:', err);
      });
    }, 5 * 60 * 1000);

    console.log('[CLOCK] Started periodic cache sync task (every 5 minutes)');
  }

  /**
   * [FIRE] Sync memory cache to database
   */
  private async syncToDatabase(): Promise<void> {
    try {
      let synced = 0;
      for (const [key, value] of this.cache.entries()) {
        await this.saveToDatabase(key, value);
        synced++;
      }

      if (synced > 0) {
        console.log(`[SYNC] Synced cache to database: ${synced} entries`);
      }
    } catch {
      console.error('[ERROR] Failed to sync cache');
    }
  }

  /**
   * [FIRE] Stop periodic sync task
   */
  stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('[STOP] Stopped periodic cache sync task');
    }
  }

  /**
   * [FIRE] Graceful shutdown (ensure all caches are synced)
   */
  async shutdown(): Promise<void> {
    console.log('[SYNC] Syncing cache to database...');
    this.stopPeriodicSync();
    await this.syncToDatabase();
    console.log('[OK] Cache system shut down');
  }
}

// Export singleton instance
export const elementCache = new ElementCache({
  maxSize: parseInt(process.env.ELEMENT_CACHE_SIZE || '1000'),
  ttl: parseInt(process.env.ELEMENT_CACHE_TTL || String(24 * 60 * 60 * 1000)),
  enabled: process.env.ELEMENT_CACHE_ENABLED !== 'false',
  persistence: process.env.ELEMENT_CACHE_PERSISTENCE !== 'false' // Persistence enabled by default
});

// [FIRE] Ensure cache sync on process exit
process.on('SIGTERM', async () => {
  await elementCache.shutdown();
});

process.on('SIGINT', async () => {
  await elementCache.shutdown();
});