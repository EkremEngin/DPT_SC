/**
 * Request ID Middleware
 * 
 * Generates a unique ID for each incoming request to enable request tracing
 * through the system. This is essential for debugging and monitoring.
 * 
 * Features:
 * - Generates a UUID for each request
 * - Checks for existing request ID from headers (for distributed tracing)
 * - Adds request ID to response headers
 * - Creates a child logger with request context
 */

import { v4 as uuidv4 } from 'uuid';
import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger';

// Extend Express Request type to include id property
declare global {
    namespace Express {
        interface Request {
            id: string;
        }
    }
}

const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Middleware to add a unique request ID to each incoming request
 * 
 * Usage:
 * 1. Client can send x-request-id header for distributed tracing
 * 2. If not provided, a new UUID is generated
 * 3. Request ID is added to req.id for use in route handlers
 * 4. Request ID is returned in response headers
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
    // Check if request ID is already provided (distributed tracing)
    const requestId = (req.headers[REQUEST_ID_HEADER] as string) || uuidv4();
    
    // Add request ID to the request object
    req.id = requestId;
    
    // Add request ID to response headers
    res.setHeader(REQUEST_ID_HEADER, requestId);
    
    // Create a child logger with request ID and attach to request
    (req as any).log = createLogger({ reqId: requestId });
    
    next();
}

/**
 * Helper to create a child logger from a request
 * Use this in route handlers to get a logger with request context
 * 
 * @param req - Express request object
 * @returns Child logger instance with request context
 */
export function getRequestLogger(req: Request) {
    return (req as any).log || createLogger({ reqId: req.id || 'unknown' });
}

export default requestIdMiddleware;
