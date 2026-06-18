import { createContext, useContext, useEffect, useMemo, useState, type FC, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { buildApiUrl } from '../config';

type ThemeMode = 'dark' | 'light';

type ThemeContextValue = {
  theme: ThemeMode;
  setTheme: (next: ThemeMode) => Promise<void>;
  toggleTheme: () => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function applyTheme(_theme: ThemeMode) {
  document.documentElement.dataset.theme = 'light';
  document.body.dataset.theme = 'light';
  localStorage.setItem('vs-theme', 'light');
}

export const ThemeProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    return 'light';
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    const loadProfileTheme = async () => {
      if (!user?.id) return;
      try {
        const response = await fetch(buildApiUrl('/api/user/profile'), {
          headers: { 'x-user-id': user.id }
        });
        if (!response.ok) return;
        const next = 'light';
        if (!cancelled) setThemeState(next);
      } catch {
        // keep local theme
      }
    };
    void loadProfileTheme();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const setTheme = async (_next: ThemeMode) => {
    setThemeState('light');
    if (!user?.id) return;
    try {
      await fetch(buildApiUrl('/api/user/profile'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id,
        },
        body: JSON.stringify({ theme: 'light' })
      });
    } catch {
      // local preference is still applied
    }
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
