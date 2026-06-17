import React, { ReactNode } from 'react';

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function DashboardShellHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="border-b border-slate-200 bg-transparent">
      <div className="px-4 py-6 sm:px-5 lg:px-6 lg:py-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            {eyebrow && (
              <div className="inline-flex items-center rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-700">
                {eyebrow}
              </div>
            )}
            <h1 className="mt-3 text-3xl font-semibold text-slate-950 lg:text-4xl">{title}</h1>
            {description && (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
            )}
          </div>

          <div className="flex flex-col items-start gap-3 xl:items-end">
            {meta}
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
        </div>
      </div>
    </header>
  );
}

export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section className={cx('vs-surface overflow-hidden', className)}>
      {(title || actions) && (
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {title && <h2 className="text-base font-semibold text-slate-950">{title}</h2>}
            {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cx('p-5', contentClassName)}>{children}</div>
    </section>
  );
}

export function MetricStatCard({
  label,
  value,
  hint,
  accent = 'neutral',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: 'neutral' | 'cyan' | 'emerald' | 'amber';
}) {
  const tones = {
    neutral: 'border-slate-200 bg-white',
    cyan: 'border-sky-200 bg-sky-50',
    emerald: 'border-emerald-200 bg-emerald-50',
    amber: 'border-amber-200 bg-amber-50',
  };

  return (
    <div className={cx('rounded-lg border p-5 shadow-sm', tones[accent])}>
      <div className="flex items-start justify-between gap-3">
        <div className="text-[12px] font-medium text-slate-600">{label}</div>
        <div className={cx(
          'flex h-8 w-8 items-center justify-center rounded-md text-xs font-semibold',
          accent === 'cyan' && 'bg-sky-100 text-sky-700',
          accent === 'emerald' && 'bg-emerald-100 text-emerald-700',
          accent === 'amber' && 'bg-amber-100 text-amber-700',
          accent === 'neutral' && 'bg-violet-100 text-violet-700',
        )}>
          {accent === 'cyan' ? 'UP' : accent === 'emerald' ? 'OK' : accent === 'amber' ? '!' : 'VS'}
        </div>
      </div>
      <div className="mt-5 text-2xl font-semibold text-slate-950">{value}</div>
      {hint && <div className="mt-2 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function StatusBadge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'success' | 'warning' | 'info';
  children: ReactNode;
}) {
  const tones = {
    neutral: 'border-slate-200 bg-slate-100 text-slate-700',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-700',
    info: 'border-sky-200 bg-sky-50 text-sky-700',
  };

  return (
    <span className={cx('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]', tones[tone])}>
      {children}
    </span>
  );
}

export function EmptyStatePanel({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center shadow-sm">
      <div className="text-base font-semibold text-slate-950">{title}</div>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">{description}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function LoadingSkeleton({
  className,
}: {
  className?: string;
}) {
  return <div className={cx('animate-pulse rounded-lg bg-slate-200', className)} />;
}
