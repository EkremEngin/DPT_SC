import React, { useRef, useEffect, useState, useMemo, ReactNode } from 'react';

interface VirtualListProps<T> {
    items: T[];
    itemHeight: number;
    containerHeight: number;
    renderItem: (item: T, index: number) => ReactNode;
    overscan?: number;
    className?: string;
}

/**
 * Virtual List Component
 * Renders only visible items for better performance with large lists
 * 
 * @param items - Array of items to render
 * @param itemHeight - Height of each item in pixels
 * @param containerHeight - Height of the visible container in pixels
 * @param renderItem - Function to render each item
 * @param overscan - Number of extra items to render above/below viewport (default: 3)
 */
export function VirtualList<T>({
    items,
    itemHeight,
    containerHeight,
    renderItem,
    overscan = 3,
    className = ''
}: VirtualListProps<T>) {
    const [scrollTop, setScrollTop] = useState(0);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    
    // Calculate visible range
    const { visibleItems, totalHeight, offsetY } = useMemo(() => {
        const totalHeight = items.length * itemHeight;
        
        const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
        const endIndex = Math.min(
            items.length,
            Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
        );
        
        const visibleItems = items.slice(startIndex, endIndex).map((item, index) => ({
            item,
            index: startIndex + index
        }));
        
        return {
            visibleItems,
            totalHeight,
            offsetY: startIndex * itemHeight
        };
    }, [items, itemHeight, scrollTop, containerHeight, overscan]);
    
    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        setScrollTop(e.currentTarget.scrollTop);
    };
    
    return (
        <div
            ref={scrollContainerRef}
            className={`overflow-auto ${className}`}
            style={{ height: containerHeight }}
            onScroll={handleScroll}
        >
            <div style={{ height: totalHeight, position: 'relative' }}>
                <div
                    style={{
                        transform: `translateY(${offsetY}px)`,
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0
                    }}
                >
                    {visibleItems.map(({ item, index }) => (
                        <div key={index} style={{ height: itemHeight }}>
                            {renderItem(item, index)}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

/**
 * Hook for virtualized list with dynamic item heights
 * Useful when items have varying heights
 */
export function useVirtualList<T>(
    items: T[],
    containerHeight: number,
    estimateHeight: (item: T, index: number) => number = () => 50
) {
    const [scrollTop, setScrollTop] = useState(0);
    const [measuredHeights, setMeasuredHeights] = useState<Map<number, number>>(new Map());
    
    const measureItem = (index: number, height: number) => {
        setMeasuredHeights(prev => {
            const newMap = new Map(prev);
            if (newMap.get(index) !== height) {
                newMap.set(index, height);
            }
            return newMap;
        });
    };
    
    const { visibleItems, totalHeight, offsetY } = useMemo(() => {
        let totalHeight = 0;
        const offsets: number[] = [0];
        
        for (let i = 0; i < items.length; i++) {
            const height = measuredHeights.get(i) ?? estimateHeight(items[i], i);
            totalHeight += height;
            offsets.push(totalHeight);
        }
        
        // Find visible range
        let startIndex = 0;
        let endIndex = items.length;
        let currentOffset = 0;
        
        for (let i = 0; i < items.length; i++) {
            const height = measuredHeights.get(i) ?? estimateHeight(items[i], i);
            if (currentOffset + height < scrollTop) {
                startIndex = i + 1;
            } else if (currentOffset > scrollTop + containerHeight) {
                endIndex = i;
                break;
            }
            currentOffset += height;
        }
        
        const visibleItems = items.slice(startIndex, endIndex).map((item, index) => ({
            item,
            index: startIndex + index
        }));
        
        return {
            visibleItems,
            totalHeight,
            offsetY: offsets[startIndex] || 0
        };
    }, [items, measuredHeights, scrollTop, containerHeight, estimateHeight]);
    
    return {
        visibleItems,
        totalHeight,
        offsetY,
        scrollTop,
        setScrollTop,
        measureItem
    };
}
