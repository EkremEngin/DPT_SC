import React, { useRef, useState, useEffect, useCallback, ReactNode, UIEvent, memo } from 'react';
import { motion, useInView } from 'motion/react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import './AnimatedList.css';
import { useTheme } from '../contexts/ThemeContext';

interface AnimatedItemProps {
  children: ReactNode;
  delay?: number;
  index: number;
  onMouseEnter?: () => void;
  onClick?: () => void;
}

const AnimatedItem: React.FC<AnimatedItemProps> = memo(({ children, delay = 0, index, onMouseEnter, onClick }) => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.1, once: false });

  return (
    <motion.div
      ref={ref}
      data-index={index}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      initial={{ scale: 0.9, opacity: 0, y: 20 }}
      animate={inView ? { scale: 1, opacity: 1, y: 0 } : { scale: 0.9, opacity: 0.5, y: 20 }}
      transition={{ duration: 0.3, delay: delay }}
      style={{ marginBottom: '0.75rem', cursor: 'pointer' }}
    >
      {children}
    </motion.div>
  );
});

AnimatedItem.displayName = 'AnimatedItem';

interface AnimatedListProps<T> {
  items: T[];
  onItemSelect: (item: T, index: number) => void;
  renderItem: (item: T, index: number, isSelected: boolean) => React.ReactNode;
  showGradients?: boolean;
  enableArrowNavigation?: boolean;
  className?: string;
  displayScrollbar?: boolean;
  initialSelectedIndex?: number;
}

const AnimatedList = <T,>({
  items,
  onItemSelect,
  renderItem,
  showGradients = true,
  enableArrowNavigation = true,
  className = '',
  displayScrollbar = true,
  initialSelectedIndex = -1
}: AnimatedListProps<T>) => {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(initialSelectedIndex);
  const [topGradientOpacity, setTopGradientOpacity] = useState<number>(0);
  const [bottomGradientOpacity, setBottomGradientOpacity] = useState<number>(1);

  // Theme context to adjust gradient colors dynamically
  const { backgroundMode } = useTheme();
  const isDark = backgroundMode === 'DARK';

  // CSS Variable injection for gradients
  const gradientColor = isDark ? 'rgba(15, 23, 42, 1)' : 'rgba(255, 255, 255, 1)';
  const style = { '--gradient-bg': gradientColor } as React.CSSProperties;

  const handleItemMouseEnter = useCallback((index: number) => {
    // Optional
  }, []);

  const handleItemClick = useCallback(
    (item: T, index: number) => {
      setSelectedIndex(index);
      if (onItemSelect) {
        onItemSelect(item, index);
      }
    },
    [onItemSelect]
  );

  const handleScroll = useCallback((e: UIEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    const { scrollTop, scrollHeight, clientHeight } = target;
    setTopGradientOpacity(Math.min(scrollTop / 50, 1));
    const bottomDistance = scrollHeight - (scrollTop + clientHeight);
    setBottomGradientOpacity(scrollHeight <= clientHeight ? 0 : Math.min(bottomDistance / 50, 1));
  }, []);

  useEffect(() => {
    if (!enableArrowNavigation) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault();
        setSelectedIndex(prev => {
          const next = Math.min(prev + 1, items.length - 1);
          virtuosoRef.current?.scrollToIndex({ index: next, align: 'center', behavior: 'smooth' });
          return next;
        });
      } else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
        e.preventDefault();
        setSelectedIndex(prev => {
          const next = Math.max(prev - 1, 0);
          virtuosoRef.current?.scrollToIndex({ index: next, align: 'center', behavior: 'smooth' });
          return next;
        });
      } else if (e.key === 'Enter') {
        if (selectedIndex >= 0 && selectedIndex < items.length) {
          e.preventDefault();
          if (onItemSelect) {
            onItemSelect(items[selectedIndex], selectedIndex);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items, selectedIndex, onItemSelect, enableArrowNavigation]);

  return (
    <div className={`scroll-list-container ${className}`} style={{ ...style, height: '100%', position: 'relative' }}>
      <Virtuoso
        ref={virtuosoRef}
        className={`scroll-list ${!displayScrollbar ? 'no-scrollbar' : ''}`}
        style={{ height: '100%', width: '100%' }}
        data={items}
        onScroll={handleScroll}
        itemContent={(index, item) => (
          <AnimatedItem
            key={index}
            delay={0}
            index={index}
            onMouseEnter={() => handleItemMouseEnter(index)}
            onClick={() => handleItemClick(item, index)}
          >
            <div className={`animated-item-wrapper ${selectedIndex === index ? 'selected' : ''}`}>
              {renderItem(item, index, selectedIndex === index)}
            </div>
          </AnimatedItem>
        )}
      />
      {showGradients && (
        <>
          <div className="top-gradient" style={{ opacity: topGradientOpacity }}></div>
          <div className="bottom-gradient" style={{ opacity: bottomGradientOpacity }}></div>
        </>
      )}
    </div>
  );
};

export default memo(AnimatedList);
