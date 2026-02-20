
import React, { createContext, useContext, useState, useEffect } from 'react';

type BackgroundMode = 'AURORA' | 'DARK' | 'LIGHT';

interface ThemeContextType {
  backgroundMode: BackgroundMode;
  setBackgroundMode: (mode: BackgroundMode) => void;
  isPresentationMode: boolean;
  setPresentationMode: (enabled: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initialize from localStorage or default to AURORA
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>(() => {
    const saved = localStorage.getItem('leaseguard_bg_mode');
    if (saved === 'DARK') return 'DARK';
    if (saved === 'LIGHT') return 'LIGHT';
    return 'AURORA';
  });

  const [isPresentationMode, setPresentationMode] = useState<boolean>(() => {
    return localStorage.getItem('leaseguard_presentation_mode') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('leaseguard_bg_mode', backgroundMode);
  }, [backgroundMode]);

  useEffect(() => {
    localStorage.setItem('leaseguard_presentation_mode', String(isPresentationMode));
  }, [isPresentationMode]);

  return (
    <ThemeContext.Provider value={{ backgroundMode, setBackgroundMode, isPresentationMode, setPresentationMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
