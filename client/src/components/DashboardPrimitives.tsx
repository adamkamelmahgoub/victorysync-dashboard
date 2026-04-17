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
    <header className="sticky top-0 z-40 border-b border-white/8 bg-[rgba(2,6,23,0.88)] backdrop-blur-xl">
      <div className="px-6 py-5 sm:px-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            {eyebrow && (
              <div className="inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200/90">
                {eyebrow}
              </div>
            )}
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white sm:text-[2rem]">{title}</h1>
            {description && (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400 sm:text-[15px]">{description}</p>
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
        <div className="flex flex-col gap-3 border-b border-white/8 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
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
    neutral: 'border-white/8 bg-white/[0.025]',
    cyan: 'border-cyan-400/15 bg-cyan-400/[0.05]',
    emerald: 'border-emerald-400/15 bg-emerald-400/[0.05]',
    amber: 'border-amber-400/15 bg-amber-400/[0.05]',
  };

  return (
    <div className={cx('rounded-3xl border p-5 shadow-[0_18px_45px_rgba(2,6,23,0.24)]', tones[accent])}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-white">{value}</div>
      {hint && <div className="mt-3 text-sm text-slate-400">{hint}</div>}
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
    neutral: 'border-white/10 bg-white/[0.05] text-slate-300',
    success: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
    warning: 'border-amber-400/20 bg-amber-400/10 text-amber-200',
    info: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-200',
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
    <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-10 text-center">
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
  return <div className={cx('animate-pulse rounded-2xl bg-white/[0.06]', className)} />;
}

