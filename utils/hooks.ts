import { useState, useEffect } from 'react';

/**
 * Custom hook for debouncing a value
 * Useful for search inputs to prevent excessive API calls
 * @param value The value to debounce
 * @param delay The delay in milliseconds (default: 300ms)
 * @returns The debounced value
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        // Set up timer to update debounced value after delay
        const timer = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        // Clean up timer if value changes before delay expires
        return () => {
            clearTimeout(timer);
        };
    }, [value, delay]);

    return debouncedValue;
}

/**
 * Custom hook for retry logic with exponential backoff
 * Useful for API calls that may fail temporarily
 * @param fn The async function to retry
 * @param maxRetries Maximum number of retries (default: 3)
 * @param delay Initial delay in milliseconds (default: 1000ms)
 * @returns Object with retry function and loading state
 */
export function useRetry<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    maxRetries: number = 3,
    delay: number = 1000
) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const retry = async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>> | null> => {
        setIsLoading(true);
        setError(null);

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const result = await fn(...args);
                setIsLoading(false);
                return result;
            } catch (err) {
                const error = err as Error;
                
                if (attempt === maxRetries) {
                    setError(error);
                    setIsLoading(false);
                    return null;
                }

                // Exponential backoff: wait longer with each retry
                const backoffDelay = delay * Math.pow(2, attempt);
                await new Promise(resolve => setTimeout(resolve, backoffDelay));
            }
        }

        setIsLoading(false);
        return null;
    };

    return { retry, isLoading, error };
}
