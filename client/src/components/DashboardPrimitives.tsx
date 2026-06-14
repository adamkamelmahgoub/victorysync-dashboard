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
    <header className="border-b border-[#2b2b2b] bg-[#111111]">
      <div className="px-4 py-5 sm:px-5 lg:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            {eyebrow && (
              <div className="inline-flex items-center rounded-md border border-[#2b2b2b] bg-[#181818] px-2.5 py-1 text-[11px] font-semibold text-slate-300">
                {eyebrow}
              </div>
            )}
            <h1 className="mt-2 text-2xl font-semibold text-white">{title}</h1>
            {description && (
              <p className="mt-1 max-w-3xl text-sm text-slate-400">{description}</p>
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
        <div className="flex flex-col gap-3 border-b border-[#2b2b2b] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {title && <h2 className="text-base font-semibold text-white">{title}</h2>}
            {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
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
    neutral: 'border-[#2b2b2b] bg-[#191919]',
    cyan: 'border-[#2b2b2b] bg-[#191919]',
    emerald: 'border-[#2b2b2b] bg-[#191919]',
    amber: 'border-[#2b2b2b] bg-[#191919]',
  };

  return (
    <div className={cx('rounded-lg border p-5', tones[accent])}>
      <div className="flex items-start justify-between gap-3">
        <div className="text-[12px] font-medium text-slate-400">{label}</div>
        <div className={cx(
          'flex h-8 w-8 items-center justify-center rounded-md text-xs font-semibold',
          accent === 'cyan' && 'bg-sky-500/15 text-sky-300',
          accent === 'emerald' && 'bg-teal-500/15 text-teal-300',
          accent === 'amber' && 'bg-orange-500/15 text-orange-300',
          accent === 'neutral' && 'bg-white/[0.05] text-slate-400',
        )}>
          {accent === 'cyan' ? 'UP' : accent === 'emerald' ? 'OK' : accent === 'amber' ? '!' : '$'}
        </div>
      </div>
      <div className="mt-5 text-2xl font-semibold text-white">{value}</div>
      {hint && <div className="mt-2 text-xs text-slate-400">{hint}</div>}
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
    neutral: 'border-transparent bg-white/[0.045] text-slate-300',
    success: 'border-transparent bg-emerald-400/[0.08] text-emerald-200',
    warning: 'border-transparent bg-amber-400/[0.08] text-amber-200',
    info: 'border-transparent bg-cyan-400/[0.08] text-cyan-200',
  };

  return (
    <span className={cx('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]', tones[tone])}>
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
    <div className="rounded-lg border border-dashed border-white/[0.075] bg-white/[0.025] px-6 py-10 text-center">
      <div className="text-base font-semibold text-white">{title}</div>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-400">{description}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function LoadingSkeleton({
  className,
}: {
  className?: string;
}) {
  return <div className={cx('animate-pulse rounded-lg bg-white/[0.06]', className)} />;
}
