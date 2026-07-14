import { createContext, useContext, useEffect, useMemo, useState, type FC, type ReactNode } from 'react';

type ThemeMode = 'dark' | 'light';

type ThemeContextValue = {
  theme: ThemeMode;
  setTheme: (next: ThemeMode) => Promise<void>;
  toggleTheme: () => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function applyLightTheme() {
  document.documentElement.dataset.theme = 'light';
  document.body.dataset.theme = 'light';
  localStorage.removeItem('vs-theme');
}

export const ThemeProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>('light');

  useEffect(() => {
    applyLightTheme();
  }, []);

  const setTheme = async (_next: ThemeMode) => {
    setThemeState('light');
    applyLightTheme();
  };

  const toggleTheme = async () => {
    await setTheme('light');
  };

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
