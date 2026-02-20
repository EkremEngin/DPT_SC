import { useState, useEffect, useCallback, useRef } from 'react';

interface UseFetchOptions {
    enabled?: boolean;
    refetchInterval?: number;
    onSuccess?: (data: any) => void;
    onError?: (error: Error) => void;
}

interface UseFetchResult<T> {
    data: T | null;
    isLoading: boolean;
    error: Error | null;
    refetch: () => void;
    isRefetching: boolean;
}

/**
 * Custom hook for data fetching with caching and refetch capabilities
 * Similar to React Query but lightweight
 * 
 * @param url - The API endpoint to fetch from
 * @param options - Configuration options
 * @returns Object with data, loading state, error, and refetch function
 */
export function useFetch<T = any>(
    url: string | null,
    options: UseFetchOptions = {}
): UseFetchResult<T> {
    const { enabled = true, refetchInterval, onSuccess, onError } = options;
    
    const [data, setData] = useState<T | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(enabled && !!url);
    const [error, setError] = useState<Error | null>(null);
    const [isRefetching, setIsRefetching] = useState<boolean>(false);
    
    // Use ref to track if component is mounted
    const isMountedRef = useRef<boolean>(true);
    const lastUrlRef = useRef<string | null>(url);
    
    const fetchData = useCallback(async (isRefetch = false) => {
        if (!url || !enabled) {
            return;
        }
        
        try {
            if (isRefetch) {
                setIsRefetching(true);
            } else {
                setIsLoading(true);
            }
            setError(null);
            
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (isMountedRef.current) {
                setData(result);
                if (onSuccess) {
                    onSuccess(result);
                }
            }
        } catch (err) {
            const error = err as Error;
            if (isMountedRef.current) {
                setError(error);
                if (onError) {
                    onError(error);
                }
            }
        } finally {
            if (isMountedRef.current) {
                setIsLoading(false);
                setIsRefetching(false);
            }
        }
    }, [url, enabled, onSuccess, onError]);
    
    const refetch = useCallback(() => {
        fetchData(true);
    }, [fetchData]);
    
    useEffect(() => {
        isMountedRef.current = true;
        
        // Only fetch if URL changed or first mount
        if (url && url !== lastUrlRef.current) {
            lastUrlRef.current = url;
            fetchData();
        }
        
        return () => {
            isMountedRef.current = false;
        };
    }, [url, fetchData]);
    
    // Set up refetch interval if specified
    useEffect(() => {
        if (!refetchInterval || !enabled || !url) return;
        
        const interval = setInterval(() => {
            fetchData(true);
        }, refetchInterval);
        
        return () => clearInterval(interval);
    }, [refetchInterval, enabled, url, fetchData]);
    
    return {
        data,
        isLoading,
        error,
        refetch,
        isRefetching
    };
}

/**
 * Simple in-memory cache for API responses
 */
class FetchCache {
    private cache: Map<string, { data: any; timestamp: number }>;
    private defaultTTL: number;
    
    constructor(defaultTTL: number = 60000) { // 1 minute default
        this.cache = new Map();
        this.defaultTTL = defaultTTL;
    }
    
    set(key: string, data: any, ttl: number = this.defaultTTL) {
        this.cache.set(key, {
            data,
            timestamp: Date.now() + ttl
        });
    }
    
    get(key: string): any | null {
        const entry = this.cache.get(key);
        if (!entry) return null;
        
        if (Date.now() > entry.timestamp) {
            this.cache.delete(key);
            return null;
        }
        
        return entry.data;
    }
    
    clear() {
        this.cache.clear();
    }
    
    delete(key: string) {
        this.cache.delete(key);
    }
}

// Global cache instance
export const fetchCache = new FetchCache();
