import { createContext, useCallback, useContext, useState, FC, ReactNode } from 'react';

type Toast = { id: string; message: string; type?: 'info' | 'success' | 'error' };

const ToastContext = createContext<{
  push: (msg: string, type?: Toast['type']) => void;
} | null>(null);

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};

export const ToastProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = Math.random().toString(36).slice(2, 9);
    const t: Toast = { id, message, type };
    setToasts((s) => [...s, t]);
    setTimeout(() => {
      setToasts((s) => s.filter((x) => x.id !== id));
    }, 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div style={{ position: 'fixed', right: 16, top: 16, zIndex: 9999 }}>
        {toasts.map((t) => (
          <div key={t.id} style={{ marginBottom: 8, minWidth: 220 }}>
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                color: '#0f172a',
                background: t.type === 'success' ? '#bbf7d0' : t.type === 'error' ? '#fecaca' : '#e2e8f0',
                boxShadow: '0 6px 18px rgba(2,6,23,0.6)'
              }}
            >
              <div style={{ fontSize: 13 }}>{t.message}</div>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export default ToastProvider;
