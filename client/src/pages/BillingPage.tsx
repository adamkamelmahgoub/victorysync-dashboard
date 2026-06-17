import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { PageLayout } from '../components/PageLayout';
import { buildApiUrl } from '../config';
import { EmptyStatePanel, LoadingSkeleton, MetricStatCard, SectionCard, StatusBadge } from '../components/DashboardPrimitives';

type BillingOverview = {
  org_id: string | null;
  next_due_date: string | null;
  package_source?: 'org_subscription' | 'user_package' | null;
  package: {
    id: string;
    name: string;
    description?: string;
    base_monthly_cost?: number;
    included_minutes?: number;
    included_sms?: number;
  } | null;
};

type Invoice = {
  id: string;
  invoice_number?: string;
  status?: string;
  created_at?: string;
  total_amount?: number;
  total?: number;
};

type BillingRecord = {
  id: string;
  description?: string;
  type?: string;
  status?: string;
  currency?: string;
  amount?: number;
  billing_date?: string;
  created_at?: string;
};

function formatMoney(amount?: number | null, currency = 'USD') {
  return `${currency} ${Number(amount ?? 0).toFixed(2)}`;
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleDateString();
}

function statusTone(status?: string | null): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  const normalized = String(status || '').toLowerCase();
  if (['paid', 'active', 'succeeded', 'complete', 'completed'].includes(normalized)) return 'success';
  if (['overdue', 'failed', 'canceled', 'cancelled'].includes(normalized)) return 'danger';
  if (['pending', 'draft', 'open'].includes(normalized)) return 'warning';
  return status ? 'info' : 'neutral';
}

export default function BillingPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [records, setRecords] = useState<BillingRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  const totalBilled = useMemo(() => invoices.reduce((acc, i) => acc + Number(i.total_amount ?? i.total ?? 0), 0), [invoices]);
  const billingConfigured = Boolean(overview?.package || invoices.length || records.length);

  const loadData = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const headers = { 'x-user-id': user.id };
      const [ovRes, invRes, recRes] = await Promise.all([
        fetch(buildApiUrl('/api/client/billing/overview'), { headers }),
        fetch(buildApiUrl('/api/client/billing/invoices?limit=5000'), { headers }),
        fetch(buildApiUrl('/api/client/billing/records?limit=5000'), { headers }),
      ]);

      if (!ovRes.ok) throw new Error('Failed to load billing overview');
      if (!invRes.ok) throw new Error('Failed to load invoices');
      if (!recRes.ok) throw new Error('Failed to load billing records');

      const ov = await ovRes.json();
      const inv = await invRes.json();
      const rec = await recRes.json();
      setOverview(ov);
      setInvoices(inv.invoices || []);
      setRecords(rec.records || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load billing data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user?.id]);

  const exportInvoice = async (invoiceId: string) => {
    if (!user?.id) return;
    const resp = await fetch(buildApiUrl(`/api/client/billing/invoices/${encodeURIComponent(invoiceId)}/export?format=csv`), {
      headers: { 'x-user-id': user.id }
    });
    if (!resp.ok) {
      setError('Failed to export invoice');
      return;
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoice-${invoiceId}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  return (
    <PageLayout title="Billing" description="Your plan, next due date, and invoices">
      <div className="space-y-6">
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => <LoadingSkeleton key={index} className="h-32" />)}
          </div>
        ) : !billingConfigured ? (
          <EmptyStatePanel
            title="Billing is not configured yet"
            description="No package, invoice, or billing record is available for this account. Once billing is configured, real plan and invoice data will appear here."
            action={<button onClick={loadData} className="vs-button-secondary">Refresh billing</button>}
          />
        ) : (
          <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <MetricStatCard
              label="Current plan"
              value={overview?.package?.name || 'Not assigned'}
              hint={overview?.package?.description || 'No package description is available.'}
              accent="violet"
              trend={overview?.package_source ? (overview.package_source === 'org_subscription' ? 'Organization' : 'User') : undefined}
            />
            <MetricStatCard
              label="Next due date"
              value={formatDate(overview?.next_due_date)}
              hint="Pulled from the billing overview endpoint."
              accent="cyan"
            />
            <MetricStatCard
              label="Invoice total"
              value={formatMoney(totalBilled)}
              hint={`${invoices.length} invoice${invoices.length === 1 ? '' : 's'} returned by billing.`}
              accent="emerald"
            />
          </section>
        )}

        <SectionCard title="Billing records" description="Usage, charges, credits, and adjustments returned by the billing records API." contentClassName="p-0">
          {loading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 5 }).map((_, index) => <LoadingSkeleton key={index} className="h-12" />)}
            </div>
          ) : records.length === 0 ? (
            <div className="p-5">
              <EmptyStatePanel title="No billing records found" description="There are no real billing records for this account yet." />
            </div>
          ) : (
            <div className="max-h-[42vh] overflow-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-slate-500">
                  <tr>
                    {['Description', 'Type', 'Status', 'Date', 'Amount'].map((label) => (
                      <th key={label} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em]">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {records.map((record) => (
                    <tr key={record.id} className="hover:bg-violet-50/40">
                      <td className="px-4 py-3 text-slate-900">{record.description || '-'}</td>
                      <td className="px-4 py-3 text-slate-700">{record.type || '-'}</td>
                      <td className="px-4 py-3"><StatusBadge tone={statusTone(record.status)}>{record.status || 'Unknown'}</StatusBadge></td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(record.billing_date || record.created_at)}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{formatMoney(record.amount, record.currency || 'USD')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Invoices"
          description="Real invoices available to this account."
          actions={<button onClick={loadData} disabled={loading} className="vs-button-secondary">{loading ? 'Refreshing...' : 'Refresh'}</button>}
          contentClassName="p-0"
        >
          {loading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 5 }).map((_, index) => <LoadingSkeleton key={index} className="h-12" />)}
            </div>
          ) : invoices.length === 0 ? (
            <div className="p-5">
              <EmptyStatePanel title="No invoices found" description="No invoices have been generated for this account." />
            </div>
          ) : (
            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-slate-500">
                  <tr>
                    {['Invoice', 'Status', 'Created', 'Total', 'Action'].map((label) => (
                      <th key={label} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em]">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-violet-50/40">
                      <td className="px-4 py-3 font-medium text-slate-900">{invoice.invoice_number || invoice.id}</td>
                      <td className="px-4 py-3"><StatusBadge tone={statusTone(invoice.status)}>{invoice.status || 'Unknown'}</StatusBadge></td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(invoice.created_at)}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{formatMoney(invoice.total_amount ?? invoice.total)}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => exportInvoice(invoice.id)} className="vs-button-secondary !px-3 !py-1.5 !text-xs">Export CSV</button>
                      </td>
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
}
