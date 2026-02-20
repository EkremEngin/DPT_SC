/**
 * P5.4 Observability Maturity - Metrics Middleware
 *
 * Express middleware that automatically records metrics for all HTTP requests.
 * Captures latency, status codes, routes, and calculates metrics buckets.
 *
 * Design:
 * - Minimal overhead (~0.1ms per request)
 * - Non-blocking metrics recording
 * - Route pattern extraction (not raw URL)
 * - Status code categorization
 *
 * @phase Phase 5.4 Observability Maturity
 */

import { Request, Response, NextFunction } from 'express';
import { metrics } from '../utils/metrics';
import { logger } from '../utils/logger';

/**
 * Metrics middleware - records timing and status for all requests
 *
 * Usage:
 * ```typescript
 * import { metricsMiddleware } from './middleware/metricsMiddleware';
 * app.use(metricsMiddleware);
 * ```
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Record start time
  const startTime = Date.now();

  // Extract route pattern (not raw URL)
  // This normalizes /api/companies/123 -> /api/companies/:id
  const route = extractRoutePattern(req);
  const method = req.method;

  // Listen for response finish event
  res.on('finish', () => {
    try {
      const latency = Date.now() - startTime;
      const statusCode = res.statusCode;

      // Record metrics
      metrics.recordRequest(route, latency, statusCode, method);

      // Log slow requests (>1000ms)
      if (latency > 1000) {
        logger.warn({
          route,
          method,
          statusCode,
          latency,
          userId: (req as any).user?.id,
        }, 'Slow request detected');
      }
    } catch (err) {
      // Non-blocking - don't fail request if metrics fail
      logger.error({ err }, 'Metrics recording failed');
    }
  });

  next();
}

/**
 * Extract route pattern from request
 *
 * Examples:
 * - /api/companies -> /api/companies
 * - /api/companies/123 -> /api/companies/:id
 * - /api/campuses/abc-def-123/blocks -> /api/campuses/:id/blocks
 *
 * @param req - Express request object
 * @returns Route pattern string
 */
function extractRoutePattern(req: Request): string {
  // If route is defined (matched by router), use it
  if (req.route && req.route.path) {
    // Reconstruct full path with base path
    const basePath = req.baseUrl || '';
    return `${basePath}${req.route.path}`;
  }

  // Fallback: parse URL and replace UUIDs/numbers with :id
  const path = req.path || req.url;

  // Replace UUIDs (8-4-4-4-12 format)
  const withoutUUIDs = path.replace(
    /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    '/:id'
  );

  // Replace numeric IDs
  const withoutNumbers = withoutUUIDs.replace(/\/\d+/g, '/:id');

  // Replace alphanumeric IDs (e.g., company names, usernames)
  // Only replace if segment looks like an ID (not a static path)
  const normalized = withoutNumbers.replace(
    /\/([a-z0-9_-]{20,})/gi,
    '/:id'
  );

  return normalized;
}

/**
 * Metrics endpoint handler
 *
 * Returns JSON snapshot of current metrics.
 * Should be protected with authentication in production.
 *
 * Usage:
 * ```typescript
 * import { metricsEndpoint } from './middleware/metricsMiddleware';
 * app.get('/metrics', authenticateToken, metricsEndpoint);
 * ```
 *
 * @param req - Express request object
 * @param res - Express response object
 */
export function metricsEndpoint(req: Request, res: Response): void {
  try {
    // Get query parameters
    const format = req.query.format as string || 'json';
    const minRequests = parseInt(req.query.minRequests as string) || 1;

    if (format === 'prometheus') {
      // Prometheus text format
      const promMetrics = metrics.getPrometheusMetrics();
      res.setHeader('Content-Type', 'text/plain; version=0.0.4');
      res.send(promMetrics);
    } else if (format === 'summary') {
      // Summary format (per-route breakdown)
      const summary = metrics.getRouteSummary(minRequests);
      res.json({
        timestamp: new Date().toISOString(),
        routes: summary,
      });
    } else {
      // Default: full JSON snapshot
      const snapshot = metrics.getSnapshot();
      res.json(snapshot);
    }
  } catch (err) {
    logger.error({ err }, 'Failed to generate metrics');
    res.status(500).json({
      error: 'Failed to generate metrics',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

/**
 * Health check endpoint with metrics summary
 *
 * Returns service health status including alert thresholds.
 * Useful for load balancers and monitoring systems.
 *
 * Usage:
 * ```typescript
 * import { healthEndpoint } from './middleware/metricsMiddleware';
 * app.get('/health', healthEndpoint);
 * ```
 *
 * @param req - Express request object
 * @param res - Express response object
 */
export function healthEndpoint(req: Request, res: Response): void {
  try {
    const snapshot = metrics.getSnapshot();
    const alerts = metrics.getAlertStatus();

    // Determine overall health
    const isHealthy = !alerts.highErrorRate && 
                      !alerts.highLatency && 
                      !alerts.highMemory;

    const statusCode = isHealthy ? 200 : 503;

    res.status(statusCode).json({
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: snapshot.system.uptime,
      alerts: {
        highErrorRate: alerts.highErrorRate ? 'CRITICAL: Error rate > 5%' : 'OK',
        highLatency: alerts.highLatency ? 'WARNING: p95 latency > 500ms' : 'OK',
        highMemory: alerts.highMemory ? 'WARNING: Memory > 500MB' : 'OK',
        slowQueries: alerts.slowQueries ? 'WARNING: Slow queries detected' : 'OK',
      },
      metrics: {
        totalRequests: snapshot.system.totalRequests,
        errorRate: `${snapshot.system.errorRate}%`,
        memoryMB: snapshot.system.memoryUsageMB,
        dbQueries: snapshot.database.queryCount,
      },
    });
  } catch (err) {
    logger.error({ err }, 'Health check failed');
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
    });
  }
}

/**
 * Reset metrics endpoint
 *
 * Clears all in-memory metrics. Should be protected with ADMIN role.
 *
 * Usage:
 * ```typescript
 * import { resetMetricsEndpoint } from './middleware/metricsMiddleware';
 * app.post('/metrics/reset', authenticateToken, requireRole(['ADMIN']), resetMetricsEndpoint);
 * ```
 *
 * @param req - Express request object
 * @param res - Express response object
 */
export function resetMetricsEndpoint(req: Request, res: Response): void {
  try {
    metrics.reset();
    logger.info({ user: (req as any).user?.username }, 'Metrics reset by admin');
    res.json({
      message: 'Metrics reset successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err }, 'Failed to reset metrics');
    res.status(500).json({
      error: 'Failed to reset metrics',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

export default metricsMiddleware;
