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

function readStoredTheme(): ThemeMode {
  return localStorage.getItem('vs-theme') === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
  document.body.dataset.theme = theme;
  localStorage.setItem('vs-theme', theme);
}

export const ThemeProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    return readStoredTheme();
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
        const data = await response.json().catch(() => ({}));
        const next = data?.user?.theme === 'dark' ? 'dark' : readStoredTheme();
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

  const setTheme = async (next: ThemeMode) => {
    setThemeState(next);
    applyTheme(next);
    if (!user?.id) return;
    try {
      await fetch(buildApiUrl('/api/user/profile'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id,
        },
        body: JSON.stringify({ theme: next })
      });
    } catch {
      // local preference is still applied
    }
  };

  const toggleTheme = async () => {
    await setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
