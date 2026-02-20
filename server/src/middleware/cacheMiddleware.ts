import { Request, Response, NextFunction } from 'express';

/**
 * Cache middleware for HTTP caching headers
 * Helps reduce server load by allowing clients to cache responses
 */

export interface CacheOptions {
    maxAge?: number; // Maximum time in seconds the resource is considered fresh
    staleWhileRevalidate?: number; // Time in seconds client can use stale data while revalidating
    mustRevalidate?: boolean; // Client must revalidate with server before using cached data
    private?: boolean; // Don't allow shared caches (like CDNs) to cache
    public?: boolean; // Allow shared caches (like CDNs) to cache
    noCache?: boolean; // Client must revalidate on every request
}

/**
 * Creates a middleware that sets Cache-Control header
 * @param options Cache configuration options
 */
export const cacheMiddleware = (options: CacheOptions = {}) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const directives: string[] = [];

        if (options.noCache) {
            directives.push('no-cache', 'no-store', 'must-revalidate');
        } else {
            if (options.private) {
                directives.push('private');
            } else {
                directives.push('public');
            }

            if (options.maxAge !== undefined) {
                directives.push(`max-age=${options.maxAge}`);
            }

            if (options.staleWhileRevalidate !== undefined) {
                directives.push(`stale-while-revalidate=${options.staleWhileRevalidate}`);
            }

            if (options.mustRevalidate) {
                directives.push('must-revalidate');
            }
        }

        res.setHeader('Cache-Control', directives.join(', '));

        // Add ETag for cache validation (optional enhancement)
        // This could be expanded to generate actual ETags based on content
        res.setHeader('ETag', `"${Date.now()}"`);

        next();
    };
};

/**
 * Predefined cache configurations for common use cases
 */
export const cacheConfig = {
    // Static data that rarely changes (5 minutes)
    static: cacheMiddleware({ maxAge: 300, public: true }),

    // Semi-static data (1 minute)
    semiStatic: cacheMiddleware({ maxAge: 60, public: true }),

    // Real-time data that changes frequently (5 seconds)
    dynamic: cacheMiddleware({ maxAge: 5, public: true }),

    // Data that should not be cached
    noCache: cacheMiddleware({ noCache: true }),

    // User-specific data (private cache only)
    private: cacheMiddleware({ maxAge: 60, private: true }),
};
