import React from 'react';
import { logClientError } from '../lib/logging';

type Props = { children: React.ReactNode };

type State = { hasError: boolean; error?: Error | null };

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, info: any) {
    logClientError({
      error_type: 'react_error',
      error_message: error?.message || String(error || 'React render error'),
      error_stack: `${error?.stack || ''}\n${info?.componentStack || ''}`.trim(),
      endpoint: window.location.pathname,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-sm text-slate-400">An unexpected error occurred while loading the dashboard.</p>
            <div className="mt-4">
              <button
                className="text-xs text-emerald-400 underline"
                onClick={() => window.location.reload()}
              >
                Reload
              </button>
            </div>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
