
"use client";

import { createContext, useContext, useEffect, useState } from 'react';
import { DEFAULT_PRIMARY_CLASS, DEFAULT_THEME_CLASS } from "@/lib/proTheme";

type Theme = "theme-pure-white" | "theme-vagawa" | "theme-soft-green" | "theme-dim-soft-green" | "theme-soft-blue" | "theme-sky-blue" | "theme-soft-yellow" | "theme-soft-pink" | "theme-colorfull" | "theme-pro";
type PrimaryColor = "primary-pure-white" | "primary-vagawa" | "primary-soft-green" | "primary-dim-soft-green" | "primary-soft-blue" | "primary-sky-blue" | "primary-soft-yellow" | "primary-soft-pink" | "primary-colorfull" | "primary-pro";


type ThemeContextType = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  primaryColor: PrimaryColor;
  setPrimaryColor: (primaryColor: PrimaryColor) => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  // Naya device / localStorage khali: Light theme default — Pro Settings se ON kar sakte hain
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME_CLASS);
  const [primaryColor, setPrimaryColorState] = useState<PrimaryColor>(DEFAULT_PRIMARY_CLASS);
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
      // Root layout jaisa typography + theme; sirf theme classes se base Tailwind classes wipe na hon
      document.body.classList.add("font-body", "antialiased", theme, primaryColor);
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
