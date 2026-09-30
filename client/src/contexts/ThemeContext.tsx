import { createContext, useContext, useEffect, useMemo, useState, type FC, type ReactNode } from 'react';
type ThemeMode = 'dark' | 'light';
const ThemeContext = createContext<{ theme: ThemeMode; setTheme: (theme: ThemeMode) => Promise<void>; toggleTheme: () => Promise<void> } | undefined>(undefined);
export const ThemeProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, update] = useState<ThemeMode>(() => localStorage.getItem('vs-theme') === 'dark' ? 'dark' : 'light');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.body.dataset.theme = theme;
    localStorage.setItem('vs-theme', theme);
  }, [theme]);
  const value = useMemo(() => ({ theme, setTheme: async (next: ThemeMode) => update(next), toggleTheme: async () => update(theme === 'dark' ? 'light' : 'dark') }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
