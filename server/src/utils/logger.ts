/**
 * Structured Logging Utility using Pino
 *
 * Provides a singleton logger instance with environment-aware configuration.
 * In development: uses pretty-printed colored output
 * In production: uses JSON format for log aggregation
 *
 * Phase 4 Enhanced:
 * - Service name and environment metadata
 * - Sensitive data redaction (passwords, tokens, auth headers)
 * - Request correlation support via requestId
 *
 * Phase 5.4 Enhanced - Log Retention Strategy:
 * - Log levels: fatal, error, warn, info, debug, trace
 * - Retention policy (recommended for production log aggregation):
 *   - ERROR/FATAL logs: 90 days (incident investigation, compliance)
 *   - WARN logs: 30 days (degradation analysis, capacity planning)
 *   - INFO logs: 14 days (operational visibility, request tracing)
 *   - DEBUG logs: 3 days (development/staging only, never in production)
 * - Structured JSON format enables indexing by: requestId, userId, route, statusCode
 * - Log volume estimates: ~500 lines/min at INFO level under normal load
 *
 * Environment Variables:
 * - LOG_LEVEL: Set minimum log level (default: 'debug' dev, 'info' prod)
 * - LOG_RETENTION_DAYS: Advisory retention period for log management (default: 14)
 * - NODE_ENV: Controls output format (pretty vs JSON)
 */

import pino from 'pino';

const isDevelopment = process.env.NODE_ENV !== 'production';
const isTest = process.env.NODE_ENV === 'test';
const logLevel = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');

// Base logger configuration
const baseConfig: pino.LoggerOptions = {
    level: logLevel,
    // Formatters for consistent output
    formatters: {
        level: (label) => {
            return { level: label };
        },
    },
    // Error serializer - ensures errors are properly logged with stack traces
    serializers: {
        err: pino.stdSerializers.err,
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res,
    },
    // Timestamp format
    timestamp: pino.stdTimeFunctions.isoTime,
    // Redact sensitive fields - removes them from logs
    redact: {
        paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body.password',
            'req.body.newPassword',
            'req.body.confirmPassword',
            'req.body.token',
            'req.body.jwt',
            'res.headers.authorization',
        ],
        remove: true,
        censor: '***REDACTED***'
    },
    // Add service metadata to all logs
    mixin: () => ({
        service: 'dpt-local-api',
        environment: process.env.NODE_ENV || 'unknown',
        version: process.env.npm_package_version || '1.0.0'
    }),
};

// Development configuration with pretty printing
const developmentConfig: pino.LoggerOptions = {
    ...baseConfig,
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
            singleLine: false,
            messageFormat: '{msg}',
        },
    },
};

// Production configuration with JSON output
const productionConfig: pino.LoggerOptions = {
    ...baseConfig,
    // In production, raw JSON is output (no transport)
};

// Create the singleton logger instance
export const logger = pino(
    isDevelopment ? developmentConfig : productionConfig,
);

/**
 * Create a child logger with request context
 * Use this in route handlers to include request-specific information
 * 
 * @param context - Object containing request context (reqId, userId, etc.)
 * @returns Child logger instance with bound context
 */
export function createLogger(context: Record<string, any> = {}) {
    return logger.child(context);
}

/**
 * Create a child logger from an Express request object
 * Automatically extracts request ID and user info
 * 
 * @param req - Express request object
 * @returns Child logger instance with request context
 */
export function createLoggerWithReq(req: any) {
    const context: Record<string, any> = {};

    // Add request ID if available (set by requestId middleware)
    if (req.id) {
        context.reqId = req.id;
    }

    // Add user info if authenticated
    if (req.user?.id) {
        context.userId = req.user.id;
    }
    if (req.user?.username) {
        context.username = req.user.username;
    }
    if (req.user?.role) {
        context.userRole = req.user.role;
    }

    // Add request metadata
    if (req.method) {
        context.method = req.method;
    }
    if (req.originalUrl || req.url) {
        context.url = req.originalUrl || req.url;
    }
    if (req.ip) {
        context.ip = req.ip;
    }

    return logger.child(context);
}

/**
 * Helper function to log errors with proper context
 * 
 * @param err - Error object
 * @param context - Additional context
 * @param message - Log message
 */
export function logError(err: any, context: Record<string, any> = {}, message?: string) {
    logger.error({ err, ...context }, message || err?.message || 'An error occurred');
}

/**
 * Helper function to log HTTP request errors
 * 
 * @param err - Error object
 * @param req - Express request object
 * @param message - Log message
 */
export function logRequestError(err: any, req: any, message?: string) {
    const log = createLoggerWithReq(req);
    log.error({ err }, message || err?.message || 'Request failed');
}

export default logger;
