import { Request } from 'express';

export interface PaginationParams {
    page: number;
    limit: number;
    offset: number;
}

export interface PaginatedResponse<T> {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        totalCount: number;
        totalPages: number;
    };
}

/**
 * Extract and validate pagination parameters from request query
 * Defaults: page=1, limit=50
 */
export function getPaginationParams(req: Request): PaginationParams {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(10000, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;

    return { page, limit, offset };
}

/**
 * Build paginated response with data and metadata
 */
export function buildPaginatedResponse<T>(
    data: T[],
    totalCount: number,
    params: PaginationParams
): PaginatedResponse<T> {
    return {
        data,
        pagination: {
            page: params.page,
            limit: params.limit,
            totalCount,
            totalPages: Math.ceil(totalCount / params.limit)
        }
    };
}

/**
 * Add pagination to SQL query
 * Returns the LIMIT and OFFSET values for the query
 */
export function getSqlPagination(params: PaginationParams): { limit: number; offset: number } {
    return { limit: params.limit, offset: params.offset };
}
