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
    <header className="border-b border-slate-200/80 bg-transparent">
      <div className="px-4 py-6 sm:px-5 lg:px-6 lg:py-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            {eyebrow && (
              <div className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-bold uppercase text-violet-700 shadow-sm">
                {eyebrow}
              </div>
            )}
            <h1 className="mt-3 text-3xl font-bold text-slate-950 lg:text-4xl">{title}</h1>
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
        <div className="flex flex-col gap-3 border-b border-slate-200/80 bg-gradient-to-b from-white to-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
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
  trend,
  accent = 'neutral',
  icon,
  loading = false,
  unavailable = false,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  trend?: ReactNode;
  accent?: 'neutral' | 'violet' | 'cyan' | 'emerald' | 'amber' | 'rose';
  icon?: ReactNode;
  loading?: boolean;
  unavailable?: boolean;
}) {
  const tones = {
    neutral: 'border-slate-200 bg-white text-slate-700',
    violet: 'border-violet-200 bg-violet-50 text-violet-700',
    cyan: 'border-sky-200 bg-sky-50 text-sky-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    rose: 'border-rose-200 bg-rose-50 text-rose-700',
  };

  return (
    <div className="group relative min-h-[154px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_18px_44px_rgba(15,23,42,0.08)] ring-1 ring-white transition duration-200 hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-[0_4px_14px_rgba(15,23,42,0.08),0_24px_56px_rgba(15,23,42,0.11)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-300/80 to-transparent" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase text-slate-600">{label}</div>
          {hint && <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{hint}</div>}
        </div>
        <div className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-xs font-black shadow-sm', tones[accent])}>
          {icon || (accent === 'cyan' ? 'UP' : accent === 'emerald' ? 'OK' : accent === 'amber' ? '!' : accent === 'rose' ? '!' : 'VS')}
        </div>
      </div>
      <div className="mt-5 flex min-h-[42px] items-end justify-between gap-3">
        {loading ? (
          <LoadingSkeleton className="h-10 w-32 rounded-xl" />
        ) : unavailable ? (
          <div>
            <div className="text-2xl font-black leading-none text-slate-400">Unavailable</div>
            <div className="mt-1 text-xs font-medium text-slate-500">No source data returned</div>
          </div>
        ) : (
          <div className="break-words text-3xl font-black leading-none text-slate-950">{value}</div>
        )}
        {!loading && trend && <div className="pb-1 text-xs font-bold text-emerald-700">{trend}</div>}
      </div>
    </div>
  );
}

export function StatusBadge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'success' | 'warning' | 'info' | 'danger' | 'violet';
  children: ReactNode;
}) {
  const tones = {
    neutral: 'border-slate-200 bg-slate-100 text-slate-700',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-700',
    info: 'border-sky-200 bg-sky-50 text-sky-700',
    danger: 'border-rose-200 bg-rose-50 text-rose-700',
    violet: 'border-violet-200 bg-violet-50 text-violet-700',
  };

  return (
    <span className={cx('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase shadow-sm', tones[tone])}>
      {children}
    </span>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: Array<{ value: T; label: ReactNode; count?: ReactNode }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cx('inline-flex flex-wrap gap-1 rounded-2xl border border-slate-200 bg-slate-100/80 p-1 shadow-inner', className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cx(
              'rounded-xl px-3 py-2 text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-violet-100',
              active
                ? 'bg-white text-violet-800 shadow-sm ring-1 ring-violet-200'
                : 'text-slate-600 hover:bg-white/80 hover:text-slate-950 hover:shadow-sm active:scale-[0.99]'
            )}
          >
            <span>{option.label}</span>
            {option.count !== undefined && (
              <span className={cx('ml-2 rounded-full px-2 py-0.5 text-xs', active ? 'bg-violet-50 text-violet-700' : 'bg-white text-slate-500')}>
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function ChartCard({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <SectionCard title={title} description={description} actions={actions} className={className} contentClassName="p-4 sm:p-5">
      <div className="min-h-[260px]">{children}</div>
    </SectionCard>
  );
}

export function FilterBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_16px_36px_rgba(15,23,42,0.06)] ring-1 ring-white sm:flex-row sm:flex-wrap sm:items-center', className)}>
      {children}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search',
  label = 'Search',
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}) {
  return (
    <label className={cx('relative block min-w-[220px] flex-1', className)}>
      <span className="sr-only">{label}</span>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">/</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
      />
    </label>
  );
}

export function DateRangeSelector({
  start,
  end,
  onStartChange,
  onEndChange,
}: {
  start: string;
  end: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="block">
        <span className="sr-only">Start date</span>
        <input
          type="date"
          value={start}
          onChange={(event) => onStartChange(event.target.value)}
          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition hover:border-slate-300 focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
        />
      </label>
      <label className="block">
        <span className="sr-only">End date</span>
        <input
          type="date"
          value={end}
          onChange={(event) => onEndChange(event.target.value)}
          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition hover:border-slate-300 focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
        />
      </label>
    </div>
  );
}

export function DataTable({
  columns,
  rows,
  getRowKey,
  empty,
}: {
  columns: Array<{ key: string; header: ReactNode; render: (row: any) => ReactNode; className?: string }>;
  rows: any[];
  getRowKey: (row: any, index: number) => string;
  empty?: ReactNode;
}) {
  if (!rows.length) {
    return <>{empty || <EmptyStatePanel title="No records found" description="There is no data for the selected filters." />}</>;
  }

  return (
    <div className="vs-table-shell overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50/95">
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={cx('px-4 py-3 text-left text-xs font-bold uppercase text-slate-500', column.className)}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <tr key={getRowKey(row, index)} className="transition hover:bg-violet-50/50">
              {columns.map((column) => (
                <td key={column.key} className={cx('px-4 py-3 text-slate-700', column.className)}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
    <div className="rounded-2xl border border-dashed border-slate-300 bg-gradient-to-b from-white to-slate-50 px-6 py-10 text-center shadow-sm ring-1 ring-white">
      <div className="text-base font-semibold text-slate-950">{title}</div>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">{description}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorStatePanel({
  title = 'Something went wrong',
  description = 'The page could not load this data. Please try again.',
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-6 py-8 text-center shadow-sm ring-1 ring-white">
      <div className="text-base font-semibold text-rose-900">{title}</div>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-rose-700">{description}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function LoadingSkeleton({
  className,
}: {
  className?: string;
}) {
  return <div className={cx('animate-pulse rounded-2xl bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200', className)} />;
}
