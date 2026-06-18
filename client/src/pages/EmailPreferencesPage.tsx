import React, { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { PageLayout } from '../components/PageLayout';
import { EmptyStatePanel, FilterBar, LoadingSkeleton, SearchInput, SectionCard, StatusBadge } from '../components/DashboardPrimitives';
import { useAuth } from '../contexts/AuthContext';
import { fetchJson } from '../lib/apiClient';

type PreferenceKey =
  | 'billing_emails'
  | 'payment_emails'
  | 'account_emails'
  | 'organization_emails'
  | 'dashboard_update_emails'
  | 'lead_emails'
  | 'support_emails'
  | 'sync_emails';

type PreferenceRow = Record<PreferenceKey, boolean> & {
  user_id: string;
  email?: string | null;
  name?: string | null;
  role?: string | null;
  global_role?: string | null;
  org_id?: string | null;
};

const categories: Array<{ key: PreferenceKey; label: string; clientSafe: boolean; description: string }> = [
  { key: 'billing_emails', label: 'Billing', clientSafe: true, description: 'Invoices, package changes, and billing records.' },
  { key: 'payment_emails', label: 'Payments', clientSafe: true, description: 'Payment reminders, successful payments, and failed payments.' },
  { key: 'account_emails', label: 'Account', clientSafe: true, description: 'Security, login, and profile changes.' },
  { key: 'organization_emails', label: 'Organization', clientSafe: true, description: 'Org membership, assigned numbers, and workspace changes.' },
  { key: 'dashboard_update_emails', label: 'Dashboard updates', clientSafe: false, description: 'Admin-only operational updates from dashboard actions.' },
  { key: 'lead_emails', label: 'Leads', clientSafe: false, description: 'Lead alerts and lead workflow changes.' },
  { key: 'support_emails', label: 'Support', clientSafe: false, description: 'Support tickets and response updates.' },
  { key: 'sync_emails', label: 'Data sync', clientSafe: false, description: 'MightyCall sync warnings and system operations.' },
];

function isPlatformRole(row: PreferenceRow) {
  return ['platform_admin', 'super_admin'].includes(String(row.global_role || '').toLowerCase());
}

function displayName(row: PreferenceRow) {
  return row.name || row.email || row.user_id;
}

const Toggle: FC<{
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}> = ({ checked, disabled, label, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-7 w-12 items-center rounded-full border p-0.5 shadow-sm transition focus:outline-none focus:ring-4 focus:ring-violet-100 disabled:cursor-not-allowed disabled:opacity-50 ${
      checked
        ? 'border-violet-700 bg-violet-600'
        : 'border-slate-300 bg-slate-100 hover:bg-slate-200'
    }`}
  >
    <span
      className={`h-5 w-5 rounded-full bg-white shadow transition ${
        checked ? 'translate-x-5' : 'translate-x-0'
      }`}
    />
  </button>
);

const EmailPreferencesPage: FC = () => {
  const { user, globalRole } = useAuth();
  const isAdmin = globalRole === 'platform_admin';
  const [rows, setRows] = useState<PreferenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const json = await fetchJson(isAdmin ? '/api/admin/notification-preferences' : '/api/notification-preferences/me', {
        headers: { 'x-user-id': user.id },
        cache: 'no-store',
      });
      setRows(isAdmin ? (json.items || []) : [json.item].filter(Boolean));
    } catch (err: any) {
      setError(err?.message || 'Failed to load email preferences');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [row.email, row.name, row.role, row.global_role, row.org_id]
        .map((value) => String(value || '').toLowerCase())
        .some((value) => value.includes(needle)),
    );
  }, [query, rows]);

  const updatePreference = async (row: PreferenceRow, key: PreferenceKey, value: boolean) => {
    if (!user?.id) return;
    const saveId = `${row.user_id}:${key}`;
    setSavingKey(saveId);
    setError(null);
    const previous = rows;
    setRows((current) => current.map((item) => item.user_id === row.user_id ? { ...item, [key]: value } : item));
    try {
      const path = isAdmin
        ? `/api/admin/notification-preferences/${encodeURIComponent(row.user_id)}`
        : '/api/notification-preferences/me';
      await fetchJson(path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user.id },
        body: JSON.stringify({ [key]: value }),
      });
    } catch (err: any) {
      setRows(previous);
      setError(err?.message || 'Failed to save email preference');
    } finally {
      setSavingKey(null);
    }
  };

  const meta = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="text-xs font-bold uppercase text-slate-600">Users</div>
        <div className="mt-1 text-lg font-black text-slate-950">{rows.length}</div>
      </div>
      <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 shadow-sm">
        <div className="text-xs font-bold uppercase text-violet-700">Client-safe defaults</div>
        <div className="mt-1 text-sm font-semibold text-violet-950">Billing, payments, account, org</div>
      </div>
    </div>
  );

  return (
    <PageLayout
      eyebrow="Notifications"
      title={isAdmin ? 'Email preferences' : 'My email preferences'}
      description={isAdmin
        ? 'Manage exactly which dashboard emails every user receives. Client-facing defaults stay limited to payment, account, and organization updates.'
        : 'Choose which VictorySync account, payment, and workspace emails you receive.'}
      actions={<button type="button" onClick={() => void load()} className="vs-button-secondary">Refresh</button>}
      meta={meta}
    >
      <div className="space-y-5">
        <SectionCard
          title="Notification categories"
          description="Client users should normally receive only the safe account and billing categories unless you intentionally enable more."
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {categories.map((category) => (
              <div key={category.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold text-slate-950">{category.label}</div>
                  <StatusBadge tone={category.clientSafe ? 'success' : 'violet'}>
                    {category.clientSafe ? 'Client-safe' : 'Admin'}
                  </StatusBadge>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{category.description}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title={isAdmin ? 'User email controls' : 'Email controls'}
          description={isAdmin ? 'Toggle categories by user. Changes are saved immediately.' : 'Your notification settings are saved to your account.'}
          actions={<FilterBar className="border-0 bg-transparent p-0 shadow-none ring-0"><SearchInput value={query} onChange={setQuery} placeholder="Search users..." /></FilterBar>}
          contentClassName="p-0"
        >
          {error && (
            <div className="border-b border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700">
              {error}
            </div>
          )}
          {loading ? (
            <div className="space-y-3 p-5">
              <LoadingSkeleton className="h-12 rounded-xl" />
              <LoadingSkeleton className="h-12 rounded-xl" />
              <LoadingSkeleton className="h-12 rounded-xl" />
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="p-5">
              <EmptyStatePanel
                title="No users found"
                description="No email preference records match the current search."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="min-w-[260px] px-5 py-3 text-left text-xs font-bold uppercase text-slate-600">User</th>
                    {categories.map((category) => (
                      <th key={category.key} className="px-4 py-3 text-center text-xs font-bold uppercase text-slate-600">
                        {category.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {visibleRows.map((row) => (
                    <tr key={row.user_id} className="transition hover:bg-violet-50/40">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-950">{displayName(row)}</div>
                        <div className="mt-1 text-xs text-slate-500">{row.email || row.user_id}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <StatusBadge tone={isPlatformRole(row) ? 'violet' : 'neutral'}>{row.global_role || row.role || 'member'}</StatusBadge>
                          {row.org_id && <StatusBadge tone="info">Org scoped</StatusBadge>}
                        </div>
                      </td>
                      {categories.map((category) => {
                        const disabled = !isAdmin && !category.clientSafe;
                        const saveId = `${row.user_id}:${category.key}`;
                        return (
                          <td key={category.key} className="px-4 py-4 text-center">
                            <Toggle
                              checked={Boolean(row[category.key])}
                              disabled={savingKey === saveId || disabled}
                              label={`${category.label} emails for ${displayName(row)}`}
                              onChange={(checked) => void updatePreference(row, category.key, checked)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </PageLayout>
  );
};

export default EmailPreferencesPage;
