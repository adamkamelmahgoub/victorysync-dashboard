import React from 'react';

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
    // Log for dev so we can see stacktraces in console
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] Caught error', error, info);
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
            <div className="mt-3 text-xs text-slate-400">
              {/* show basic error message */}
              <pre className="text-left text-[10px] max-w-prose overflow-auto whitespace-pre-wrap">{String(this.state.error)}</pre>
            </div>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
