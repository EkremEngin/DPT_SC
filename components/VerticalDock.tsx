'use client';

import {
    motion,
    MotionValue,
    useMotionValue,
    useSpring,
    useTransform,
    type SpringOptions,
    AnimatePresence
} from 'motion/react';
import React, { Children, cloneElement, useEffect, useRef, useState } from 'react';

import './Dock.css';

export type DockItemData = {
    icon: React.ReactNode;
    label: React.ReactNode;
    onClick: () => void;
    className?: string;
    isActive?: boolean;
};

export type DockProps = {
    items: DockItemData[];
    className?: string;
    distance?: number;
    panelHeight?: number; // In vertical mode, this is panelWidth
    baseItemSize?: number;
    magnification?: number;
    spring?: SpringOptions;
};

type DockItemProps = {
    className?: string;
    children?: React.ReactNode;
    onClick?: () => void;
    isActive?: boolean;
    mouseY: MotionValue<number>;
    spring: SpringOptions;
    distance: number;
    baseItemSize: number;
    magnification: number;
};

function DockItem({
    children,
    className = '',
    onClick,
    isActive,
    mouseY,
    spring,
    distance,
    magnification,
    baseItemSize
}: DockItemProps) {
    const ref = useRef<HTMLDivElement>(null);
    const isHovered = useMotionValue(0);

    const mouseDistance = useTransform(mouseY, val => {
        const rect = ref.current?.getBoundingClientRect() ?? {
            y: 0,
            height: baseItemSize
        };
        return val - (rect.y + rect.height / 2);
    });

    const targetSize = useTransform(
        mouseDistance,
        [-distance, 0, distance],
        [baseItemSize, magnification, baseItemSize]
    );

    const size = useSpring(targetSize, spring);

    return (
        <motion.div
            ref={ref}
            style={{
                width: size,
                height: size
            }}
            onHoverStart={() => isHovered.set(1)}
            onHoverEnd={() => isHovered.set(0)}
            onFocus={() => isHovered.set(1)}
            onBlur={() => isHovered.set(0)}
            onClick={onClick}
            className={`dock-item ${className} ${isActive ? 'active-item' : ''}`}
            tabIndex={0}
            role="button"
            aria-pressed={isActive}
        >
            {Children.map(children, child =>
                React.isValidElement(child)
                    ? cloneElement(child as React.ReactElement<{ isHovered?: MotionValue<number> }>, { isHovered })
                    : child
            )}
        </motion.div>
    );
}

type DockLabelProps = {
    className?: string;
    children?: React.ReactNode;
    isHovered?: MotionValue<number>;
};

function DockLabel({ children, className = '', isHovered }: DockLabelProps) {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (!isHovered) return;
        const unsubscribe = isHovered.on('change', latest => {
            setIsVisible(latest === 1);
        });
        return () => unsubscribe();
    }, [isHovered]);

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0, x: -10, y: '-50%' }}
                    animate={{ opacity: 1, x: 0, y: '-50%' }}
                    exit={{ opacity: 0, x: -10, y: '-50%' }}
                    transition={{ duration: 0.15 }}
                    className={`dock-label vertical ${className}`}
                    role="tooltip"
                >
                    {children}
                </motion.div>
            )}
        </AnimatePresence>
    );
}

type DockIconProps = {
    className?: string;
    children?: React.ReactNode;
    isHovered?: MotionValue<number>;
};

function DockIcon({ children, className = '' }: DockIconProps) {
    return <div className={`dock-icon ${className}`}>{children}</div>;
}

export default function VerticalDock({
    items,
    className = '',
    spring = { mass: 0.1, stiffness: 200, damping: 15 },
    magnification = 60,
    distance = 150,
    panelHeight = 54, // Acts as width in vertical
    baseItemSize = 38
}: DockProps) {
    const mouseY = useMotionValue(Infinity);
    const isHovered = useMotionValue(0);

    const width = useSpring(panelHeight, spring);

    return (
        <motion.div style={{ width }} className={`dock-outer vertical ${className}`}>
            <motion.div
                onMouseMove={({ pageY }) => {
                    isHovered.set(1);
                    mouseY.set(pageY);
                }}
                onMouseLeave={() => {
                    isHovered.set(0);
                    mouseY.set(Infinity);
                }}
                className="dock-panel vertical"
                style={{ width: panelHeight }}
                role="toolbar"
                aria-label="Application dock"
            >
                {items.map((item, index) => (
                    <div key={index} className="dock-item-wrapper">
                        <DockItem
                            onClick={item.onClick}
                            isActive={item.isActive}
                            className={item.className}
                            mouseY={mouseY}
                            spring={spring}
                            distance={distance}
                            magnification={magnification}
                            baseItemSize={baseItemSize}
                        >
                            <DockIcon>{item.icon}</DockIcon>
                            <DockLabel>{item.label}</DockLabel>
                        </DockItem>
                    </div>
                ))}
            </motion.div>
        </motion.div>
    );
}
