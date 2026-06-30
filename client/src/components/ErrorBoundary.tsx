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
        <main className="flex min-h-screen items-center justify-center bg-[var(--bg-app)] p-6 text-[var(--text-primary)]">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-[0_18px_48px_rgba(15,23,42,0.12)]">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-sm font-black text-rose-700">
              !
            </div>
            <div className="mx-auto mt-4 inline-flex rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-black uppercase text-rose-700">
              UI_RENDER_ERROR
            </div>
            <h2 className="mt-5 text-2xl font-bold text-slate-950">This page could not load</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              VictorySync hit an unexpected page error. The event was logged, and you can safely return to the dashboard or retry the page.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <button
                className="vs-button-primary"
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.assign('/dashboard');
                }}
              >
                Go to dashboard
              </button>
              <button
                className="vs-button-secondary"
                onClick={() => window.location.reload()}
              >
                Reload page
              </button>
            </div>
            {this.state.error?.message && (
              <p className="mt-5 max-h-32 overflow-auto break-words rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs leading-5 text-slate-600">
                {this.state.error.message}
              </p>
            )}
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
