
"use client";

import { createContext, useContext, useEffect, useState } from 'react';

type Theme = "theme-pure-white" | "theme-vagawa" | "theme-soft-green" | "theme-dim-soft-green" | "theme-soft-blue" | "theme-sky-blue" | "theme-soft-yellow" | "theme-soft-pink";
type PrimaryColor = "primary-pure-white" | "primary-vagawa" | "primary-soft-green" | "primary-dim-soft-green" | "primary-soft-blue" | "primary-sky-blue" | "primary-soft-yellow" | "primary-soft-pink";


type ThemeContextType = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  primaryColor: PrimaryColor;
  setPrimaryColor: (primaryColor: PrimaryColor) => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setThemeState] = useState<Theme>('theme-pure-white');
  const [primaryColor, setPrimaryColorState] = useState<PrimaryColor>('primary-pure-white');
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    const storedTheme = localStorage.getItem('theme') as Theme;
    const storedPrimaryColor = localStorage.getItem('primaryColor') as PrimaryColor;
    if (storedTheme) {
      setThemeState(storedTheme);
    }
    if (storedPrimaryColor) {
      setPrimaryColorState(storedPrimaryColor);
    }
  }, []);

  useEffect(() => {
    if (isClient) {
      document.body.className = '';
      document.body.classList.add(theme, primaryColor);
      localStorage.setItem('theme', theme);
      localStorage.setItem('primaryColor', primaryColor);
    }
  }, [theme, primaryColor, isClient]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };
  
  const setPrimaryColor = (newPrimaryColor: PrimaryColor) => {
    setPrimaryColorState(newPrimaryColor);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, primaryColor, setPrimaryColor }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
