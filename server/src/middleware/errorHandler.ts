import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export const errorHandler = (
    err: Error,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    // Extract request ID for correlation (set by requestId middleware)
    const requestId = (req as any).requestId || (req as any).id;
    
    // Log error with structured logging
    logger.error({
        err,
        requestId,  // For log correlation across services
        path: req.path,
        method: req.method,
        userId: (req as any).user?.id,
        userRole: (req as any).user?.role,
        ip: req.ip,
    }, err.message || 'Unhandled error');

    // SECURITY: Suppress stack traces in production responses
    const isDevelopment = process.env.NODE_ENV === 'development';
    const isTest = process.env.NODE_ENV === 'test';
    
    // Determine status code
    let statusCode = 500;
    if ('status' in err && typeof err.status === 'number') {
        statusCode = err.status;
    } else if ('statusCode' in err && typeof err.statusCode === 'number') {
        statusCode = err.statusCode;
    }

    // Prepare error response
    const errorResponse: {
        error: string;
        message?: string;
        requestId?: string;  // Include requestId for support correlation
        stack?: string;
    } = {
        error: err.name || 'Internal Server Error'
    };

    // Include requestId in all responses for troubleshooting
    if (requestId) {
        errorResponse.requestId = requestId;
    }

    // Include message in development, test, or for client errors (4xx)
    if (isDevelopment || isTest || (statusCode >= 400 && statusCode < 500)) {
        errorResponse.message = err.message;
    }

    // Include stack trace only in development and test
    if ((isDevelopment || isTest) && err.stack) {
        errorResponse.stack = err.stack;
    }

    // Production: Minimal error exposure, but include requestId
    if (process.env.NODE_ENV === 'production') {
        // For 5xx errors, generic message
        if (statusCode >= 500) {
            return res.status(statusCode).json({
                error: 'Internal server error',
                requestId  // Support can correlate with logs
            });
        }
        // For 4xx errors, include message (client error)
        return res.status(statusCode).json({
            error: err.name || 'Client error',
            message: err.message,
            requestId
        });
    }

    // Handle specific error types
    if (err.name === 'UnauthorizedError') {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid or expired token',
            requestId
        });
    }

    if (err.name === 'ValidationError') {
        return res.status(400).json({
            error: 'Validation Error',
            message: err.message,
            requestId
        });
    }

    if (err.message === 'Not allowed by CORS') {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Origin not allowed by CORS policy',
            requestId
        });
    }

    // Send error response
    res.status(statusCode).json(errorResponse);
};
