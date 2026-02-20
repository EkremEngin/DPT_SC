/**
 * P5.4 Observability Maturity - Metrics Collection Utility
 *
 * Lightweight in-memory metrics collection for monitoring API performance.
 * Provides latency buckets, error rates, request counts, and database query timing.
 *
 * Design Principles:
 * - Zero external dependencies (no Prometheus client, no Redis)
 * - Thread-safe operations using Map primitives
 * - Minimal memory footprint (<1MB for typical workloads)
 * - JSON-serializable for /metrics endpoint
 *
 * @phase Phase 5.4 Observability Maturity
 */

import { logger } from './logger';

/**
 * Latency bucket definitions for histogram-style metrics
 * Buckets: <50ms, <100ms, <200ms, <500ms, >=500ms
 */
export const LATENCY_BUCKETS = [50, 100, 200, 500] as const;
export type LatencyBucket = typeof LATENCY_BUCKETS[number] | 'overflow';

/**
 * Route-level metrics tracked per endpoint
 */
export interface RouteMetrics {
  /** Total requests for this route */
  requestCount: number;
  /** Total errors (4xx + 5xx) */
  errorCount: number;
  /** Latency histogram - counts in each bucket */
  latencyBuckets: Record<LatencyBucket, number>;
  /** Accumulated latency for p95/p99 calculation */
  totalLatency: number;
  /** Last request timestamp (ISO string) */
  lastRequest: string | null;
  /** Slowest request in window */
  maxLatency: number;
}

/**
 * Database query metrics
 */
export interface DbMetrics {
  /** Total queries executed */
  queryCount: number;
  /** Accumulated query time (ms) */
  totalQueryTime: number;
  /** Slowest query (ms) */
  maxQueryTime: number;
  /** Queries exceeding threshold (100ms) */
  slowQueries: number;
}

/**
 * Backup metrics for DR monitoring
 */
export interface BackupMetrics {
  /** Last successful backup timestamp (ISO string) */
  lastBackupTimestamp: string | null;
  /** Last backup file size in MB */
  lastBackupSizeMB: number;
  /** Last backup duration in seconds */
  lastBackupDurationSec: number;
  /** Total successful backup count */
  backupSuccessCount: number;
  /** Total failed backup count */
  backupFailureCount: number;
  /** Last off-site sync timestamp (ISO string) */
  offsiteLastSync: string | null;
  /** Off-site sync failure count */
  offsiteFailureCount: number;
  /** Last backup validation status */
  lastValidationStatus: 'PASS' | 'FAIL' | 'PENDING' | null;
  /** Last validation timestamp */
  lastValidationTimestamp: string | null;
  /** Local backup storage used in MB */
  localStorageUsedMB: number;
  /** Local backup storage cap in MB */
  localStorageCapMB: number;
  /** Number of backup files in local storage */
  backupFileCount: number;
  /** Age of oldest backup in hours */
  oldestBackupAgeHours: number;
}

/**
 * System-wide health metrics
 */
export interface SystemMetrics {
  /** Server start time */
  startTime: string;
  /** Current uptime in seconds */
  uptime: number;
  /** Total requests across all routes */
  totalRequests: number;
  /** Total errors across all routes */
  totalErrors: number;
  /** Overall error rate percentage */
  errorRate: number;
  /** Process memory usage (MB) */
  memoryUsageMB: number;
  /** Node.js event loop lag (ms) - sampled */
  eventLoopLag: number;
}

/**
 * Complete metrics snapshot for /metrics endpoint
 */
export interface MetricsSnapshot {
  /** Timestamp of snapshot */
  timestamp: string;
  /** System-level metrics */
  system: SystemMetrics;
  /** Per-route metrics */
  routes: Record<string, RouteMetrics>;
  /** Database metrics */
  database: DbMetrics;
  /** Backup metrics */
  backup: BackupMetrics;
}

/**
 * Metrics Collector Class
 *
 * Singleton instance that collects and aggregates metrics in-memory.
 * Safe for concurrent use - all operations are atomic.
 */
class MetricsCollector {
  // Route metrics storage
  private routes: Map<string, RouteMetrics> = new Map();
  
  // Database metrics
  private dbMetrics: DbMetrics = {
    queryCount: 0,
    totalQueryTime: 0,
    maxQueryTime: 0,
    slowQueries: 0,
  };
  
  // Backup metrics
  private backupMetrics: BackupMetrics = {
    lastBackupTimestamp: null,
    lastBackupSizeMB: 0,
    lastBackupDurationSec: 0,
    backupSuccessCount: 0,
    backupFailureCount: 0,
    offsiteLastSync: null,
    offsiteFailureCount: 0,
    lastValidationStatus: null,
    lastValidationTimestamp: null,
    localStorageUsedMB: 0,
    localStorageCapMB: 8 * 1024, // 8GB cap
    backupFileCount: 0,
    oldestBackupAgeHours: 0,
  };
  
  // System start time
  private readonly startTime: string = new Date().toISOString();
  
  // Rolling window for recent errors (last 100)
  private recentErrors: Array<{
    timestamp: string;
    route: string;
    statusCode: number;
    message: string;
  }> = [];
  
  // Maximum recent errors to keep
  private readonly MAX_RECENT_ERRORS = 100;

  constructor() {
    // Initialize event loop lag sampling every 30 seconds
    this.startEventLoopSampling();
  }

  /**
   * Record an HTTP request
   * 
   * @param route - Route path (e.g., '/api/companies')
   * @param latencyMs - Request latency in milliseconds
   * @param statusCode - HTTP status code
   * @param method - HTTP method
   */
  recordRequest(
    route: string,
    latencyMs: number,
    statusCode: number,
    method: string = 'GET'
  ): void {
    const isError = statusCode >= 400;
    const key = `${method}:${route}`;
    
    // Get or initialize route metrics
    let metrics = this.routes.get(key);
    if (!metrics) {
      metrics = this.createEmptyRouteMetrics();
      this.routes.set(key, metrics);
    }
    
    // Update counters
    metrics.requestCount++;
    metrics.totalLatency += latencyMs;
    metrics.lastRequest = new Date().toISOString();
    if (latencyMs > metrics.maxLatency) {
      metrics.maxLatency = latencyMs;
    }
    
    // Update latency bucket
    const bucket = this.getLatencyBucket(latencyMs);
    metrics.latencyBuckets[bucket]++;
    
    // Track errors
    if (isError) {
      metrics.errorCount++;
      
      // Add to recent errors
      this.recentErrors.push({
        timestamp: new Date().toISOString(),
        route: key,
        statusCode,
        message: `HTTP ${statusCode}`,
      });
      
      // Trim recent errors if needed
      if (this.recentErrors.length > this.MAX_RECENT_ERRORS) {
        this.recentErrors.shift();
      }
      
      // Log errors for visibility
      logger.warn({
        route: key,
        statusCode,
        latencyMs,
      }, 'Request error recorded');
    }
  }

  /**
   * Record a database query
   * 
   * @param queryTimeMs - Query execution time in milliseconds
   * @param queryType - Optional query type (SELECT, INSERT, etc.)
   */
  recordDbQuery(queryTimeMs: number, queryType?: string): void {
    this.dbMetrics.queryCount++;
    this.dbMetrics.totalQueryTime += queryTimeMs;
    
    if (queryTimeMs > this.dbMetrics.maxQueryTime) {
      this.dbMetrics.maxQueryTime = queryTimeMs;
    }
    
    // Track slow queries (>100ms)
    if (queryTimeMs > 100) {
      this.dbMetrics.slowQueries++;
      
      logger.warn({
        queryTimeMs,
        queryType,
      }, 'Slow database query detected');
    }
  }

  /**
   * Get a complete metrics snapshot
   * 
   * @returns MetricsSnapshot with all current metrics
   */
  getSnapshot(): MetricsSnapshot {
    const uptime = (Date.now() - new Date(this.startTime).getTime()) / 1000;
    
    // Calculate system-wide totals
    let totalRequests = 0;
    let totalErrors = 0;
    
    for (const metrics of this.routes.values()) {
      totalRequests += metrics.requestCount;
      totalErrors += metrics.errorCount;
    }
    
    // Calculate error rate (handle division by zero)
    const errorRate = totalRequests > 0 
      ? (totalErrors / totalRequests) * 100 
      : 0;
    
    // Get memory usage
    const memoryUsageMB = process.memoryUsage().heapUsed / 1024 / 1024;
    
    return {
      timestamp: new Date().toISOString(),
      system: {
        startTime: this.startTime,
        uptime: Math.floor(uptime),
        totalRequests,
        totalErrors,
        errorRate: Math.round(errorRate * 100) / 100,
        memoryUsageMB: Math.round(memoryUsageMB * 100) / 100,
        eventLoopLag: this.getEventLoopLag(),
      },
      routes: Object.fromEntries(this.routes.entries()),
      database: { ...this.dbMetrics },
      backup: { ...this.backupMetrics },
    };
  }

  /**
   * Get per-route metrics summary
   * 
   * @param minRequests - Minimum request count to include (default: 1)
   * @returns Array of routes with metrics
   */
  getRouteSummary(minRequests: number = 1): Array<{
    route: string;
    requests: number;
    errors: number;
    errorRate: number;
    avgLatency: number;
    p95Latency: number;
  }> {
    const summary: Array<{
      route: string;
      requests: number;
      errors: number;
      errorRate: number;
      avgLatency: number;
      p95Latency: number;
    }> = [];
    
    for (const [route, metrics] of this.routes.entries()) {
      if (metrics.requestCount < minRequests) continue;
      
      const avgLatency = metrics.requestCount > 0
        ? metrics.totalLatency / metrics.requestCount
        : 0;
      
      const errorRate = metrics.requestCount > 0
        ? (metrics.errorCount / metrics.requestCount) * 100
        : 0;
      
      // Calculate p95 latency from buckets
      const p95Latency = this.calculateP95(metrics);
      
      summary.push({
        route,
        requests: metrics.requestCount,
        errors: metrics.errorCount,
        errorRate: Math.round(errorRate * 100) / 100,
        avgLatency: Math.round(avgLatency),
        p95Latency,
      });
    }
    
    // Sort by request count descending
    return summary.sort((a, b) => b.requests - a.requests);
  }

  /**
   * Get recent errors
   * 
   * @param limit - Maximum number of errors to return (default: 10)
   * @returns Array of recent errors
   */
  getRecentErrors(limit: number = 10): typeof MetricsCollector.prototype.recentErrors {
    return this.recentErrors.slice(-limit);
  }

  /**
   * Get alert status based on thresholds
   * 
   * @returns Object with alert states
   */
  getAlertStatus(): {
    highErrorRate: boolean;
    highLatency: boolean;
    highMemory: boolean;
    slowQueries: boolean;
  } {
    const snapshot = this.getSnapshot();
    
    return {
      // Error rate > 5%
      highErrorRate: snapshot.system.errorRate > 5,
      
      // Calculate overall p95 latency
      highLatency: this.calculateOverallP95() > 500,
      
      // Memory > 500MB
      highMemory: snapshot.system.memoryUsageMB > 500,
      
      // More than 5 slow queries
      slowQueries: snapshot.database.slowQueries > 5,
    };
  }

  /**
   * Reset all metrics (useful for testing or periodic reset)
   */
  /**
   * Record a successful backup
   */
  recordBackupSuccess(sizeMB: number, durationSec: number): void {
    this.backupMetrics.lastBackupTimestamp = new Date().toISOString();
    this.backupMetrics.lastBackupSizeMB = sizeMB;
    this.backupMetrics.lastBackupDurationSec = durationSec;
    this.backupMetrics.backupSuccessCount++;
  }

  /**
   * Record a failed backup
   */
  recordBackupFailure(): void {
    this.backupMetrics.backupFailureCount++;
  }

  /**
   * Record off-site sync completion
   */
  recordOffsiteSync(success: boolean): void {
    if (success) {
      this.backupMetrics.offsiteLastSync = new Date().toISOString();
    } else {
      this.backupMetrics.offsiteFailureCount++;
    }
  }

  /**
   * Record backup validation result
   */
  recordBackupValidation(status: 'PASS' | 'FAIL' | 'PENDING'): void {
    this.backupMetrics.lastValidationStatus = status;
    this.backupMetrics.lastValidationTimestamp = new Date().toISOString();
  }

  /**
   * Update backup storage metrics
   */
  updateBackupStorageMetrics(usedMB: number, fileCount: number, oldestBackupAgeHours: number): void {
    this.backupMetrics.localStorageUsedMB = usedMB;
    this.backupMetrics.backupFileCount = fileCount;
    this.backupMetrics.oldestBackupAgeHours = oldestBackupAgeHours;
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.routes.clear();
    this.dbMetrics = {
      queryCount: 0,
      totalQueryTime: 0,
      maxQueryTime: 0,
      slowQueries: 0,
    };
    this.backupMetrics = {
      lastBackupTimestamp: null,
      lastBackupSizeMB: 0,
      lastBackupDurationSec: 0,
      backupSuccessCount: 0,
      backupFailureCount: 0,
      offsiteLastSync: null,
      offsiteFailureCount: 0,
      lastValidationStatus: null,
      lastValidationTimestamp: null,
      localStorageUsedMB: 0,
      localStorageCapMB: 8 * 1024,
      backupFileCount: 0,
      oldestBackupAgeHours: 0,
    };
    this.recentErrors = [];
    
    logger.info('Metrics reset');
  }

  /**
   * Create empty route metrics
   */
  private createEmptyRouteMetrics(): RouteMetrics {
    return {
      requestCount: 0,
      errorCount: 0,
      latencyBuckets: {
        50: 0,
        100: 0,
        200: 0,
        500: 0,
        overflow: 0,
      },
      totalLatency: 0,
      lastRequest: null,
      maxLatency: 0,
    };
  }

  /**
   * Determine latency bucket for a given latency value
   */
  private getLatencyBucket(latencyMs: number): LatencyBucket {
    for (const bucket of LATENCY_BUCKETS) {
      if (latencyMs < bucket) return bucket;
    }
    return 'overflow';
  }

  /**
   * Calculate approximate p95 latency from buckets
   */
  private calculateP95(metrics: RouteMetrics): number {
    const total = metrics.requestCount;
    if (total === 0) return 0;
    
    const p95Index = Math.ceil(total * 0.95);
    let count = 0;
    
    // Count through buckets until we reach p95
    for (const [bucket, bucketCount] of Object.entries(metrics.latencyBuckets)) {
      count += bucketCount;
      if (count >= p95Index) {
        // Return the bucket threshold (or 500 for overflow)
        return bucket === 'overflow' ? 500 : parseInt(bucket);
      }
    }
    
    return 500; // Default if calculation fails
  }

  /**
   * Calculate overall p95 latency across all routes
   */
  private calculateOverallP95(): number {
    const summary = this.getRouteSummary(1);
    if (summary.length === 0) return 0;
    
    // Return average p95 of top 5 routes by request count
    const top5 = summary.slice(0, Math.min(5, summary.length));
    const avgP95 = top5.reduce((sum, r) => sum + r.p95Latency, 0) / top5.length;
    
    return Math.round(avgP95);
  }

  /**
   * Get current event loop lag
   * Measures how long the event loop is blocked
   */
  private getEventLoopLag(): number {
    let lag = 0;
    const start = process.hrtime.bigint();
    
    // Use setImmediate to measure when event loop is free
    setImmediate(() => {
      lag = Number(process.hrtime.bigint() - start) / 1e6; // Convert to ms
    });
    
    return Math.round(lag);
  }

  /**
   * Start periodic event loop lag sampling
   * Updates internal lag value every 30 seconds
   */
  private eventLoopLagValue: number = 0;
  
  private startEventLoopSampling(): void {
    const sampleLag = () => {
      const start = process.hrtime.bigint();
      
      setImmediate(() => {
        const lagNs = process.hrtime.bigint() - start;
        this.eventLoopLagValue = Number(lagNs) / 1e6; // Convert to ms
        
        // Schedule next sample
        setTimeout(sampleLag, 30000); // 30 seconds
      });
    };
    
    // Start sampling after initial delay
    setTimeout(sampleLag, 1000);
  }

  /**
   * Get metrics in Prometheus text format for external scraping
   * 
   * @returns Prometheus-style metrics text
   */
  getPrometheusMetrics(): string {
    const snapshot = this.getSnapshot();
    const lines: string[] = [];
    
    // System metrics
    lines.push(`# HELP dpt_system_uptime_seconds Server uptime in seconds`);
    lines.push(`# TYPE dpt_system_uptime_seconds gauge`);
    lines.push(`dpt_system_uptime_seconds ${snapshot.system.uptime}`);
    
    lines.push(`# HELP dpt_system_memory_mb Heap memory usage in MB`);
    lines.push(`# TYPE dpt_system_memory_mb gauge`);
    lines.push(`dpt_system_memory_mb ${snapshot.system.memoryUsageMB}`);
    
    lines.push(`# HELP dpt_system_error_rate Percentage of requests returning errors`);
    lines.push(`# TYPE dpt_system_error_rate gauge`);
    lines.push(`dpt_system_error_rate ${snapshot.system.errorRate}`);
    
    // Route metrics
    for (const [route, metrics] of Object.entries(snapshot.routes)) {
      const safeRoute = route.replace(/[^a-zA-Z0-9_:/]/g, '_');
      
      lines.push(`# HELP dpt_route_requests_total Total requests per route`);
      lines.push(`# TYPE dpt_route_requests_total counter`);
      lines.push(`dpt_route_requests_total{route="${safeRoute}"} ${metrics.requestCount}`);
      
      lines.push(`# HELP dpt_route_errors_total Total errors per route`);
      lines.push(`# TYPE dpt_route_errors_total counter`);
      lines.push(`dpt_route_errors_total{route="${safeRoute}"} ${metrics.errorCount}`);
      
      const avgLatency = metrics.requestCount > 0 
        ? metrics.totalLatency / metrics.requestCount 
        : 0;
      lines.push(`# HELP dpt_route_latency_avg Average latency per route`);
      lines.push(`# TYPE dpt_route_latency_avg gauge`);
      lines.push(`dpt_route_latency_avg{route="${safeRoute}"} ${avgLatency.toFixed(2)}`);
    }
    
    // Database metrics
    lines.push(`# HELP dpt_db_queries_total Total database queries`);
    lines.push(`# TYPE dpt_db_queries_total counter`);
    lines.push(`dpt_db_queries_total ${snapshot.database.queryCount}`);
    
    lines.push(`# HELP dpt_db_query_time_avg Average query time in ms`);
    lines.push(`# TYPE dpt_db_query_time_avg gauge`);
    const avgDbTime = snapshot.database.queryCount > 0
      ? snapshot.database.totalQueryTime / snapshot.database.queryCount
      : 0;
    lines.push(`dpt_db_query_time_avg ${avgDbTime.toFixed(2)}`);
    
    lines.push(`# HELP dpt_db_slow_queries_total Queries exceeding 100ms`);
    lines.push(`# TYPE dpt_db_slow_queries_total counter`);
    lines.push(`dpt_db_slow_queries_total ${snapshot.database.slowQueries}`);
    
    return lines.join('\n');
  }
}

// Singleton instance
export const metrics = new MetricsCollector();

/**
 * Helper function to record request timing automatically
 * Used by metrics middleware
 */
export function createTimedRecorder(route: string, method: string) {
  const startTime = Date.now();
  
  return (statusCode: number) => {
    const latency = Date.now() - startTime;
    metrics.recordRequest(route, latency, statusCode, method);
  };
}
