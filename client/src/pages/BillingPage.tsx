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

type BillingPlan = {
  id: string;
  name: string;
  description?: string | null;
  base_monthly_cost?: number | null;
  currency?: string | null;
  billing_interval?: string | null;
  included_minutes?: number | null;
  included_sms?: number | null;
  stripe_price_id?: string | null;
  features?: unknown;
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
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [stripeConfigured, setStripeConfigured] = useState(false);
  const [billingAction, setBillingAction] = useState<string | null>(null);
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
      const [ovRes, invRes, recRes, plansRes] = await Promise.all([
        fetch(buildApiUrl('/api/client/billing/overview'), { headers }),
        fetch(buildApiUrl('/api/client/billing/invoices?limit=5000'), { headers }),
        fetch(buildApiUrl('/api/client/billing/records?limit=5000'), { headers }),
        fetch(buildApiUrl('/api/billing/stripe/plans'), { headers }),
      ]);

      if (!ovRes.ok) throw new Error('Failed to load billing overview');
      if (!invRes.ok) throw new Error('Failed to load invoices');
      if (!recRes.ok) throw new Error('Failed to load billing records');
      if (!plansRes.ok) throw new Error('Failed to load billing plans');

      const ov = await ovRes.json();
      const inv = await invRes.json();
      const rec = await recRes.json();
      const planJson = await plansRes.json();
      setOverview(ov);
      setInvoices(inv.invoices || []);
      setRecords(rec.records || []);
      setPlans(planJson.plans || []);
      setStripeConfigured(Boolean(planJson.stripe_configured));
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

  const startCheckout = async (planId: string) => {
    if (!user?.id) return;
    setBillingAction(planId);
    setError(null);
    try {
      const resp = await fetch(buildApiUrl('/api/billing/stripe/checkout-session'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user.id },
        body: JSON.stringify({ org_id: overview?.org_id || undefined, plan_id: planId, quantity: 1 }),
      });
      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok || !payload.url) {
        throw new Error(payload.message || payload.error || 'Unable to start Stripe Checkout');
      }
      window.location.href = payload.url;
    } catch (e: any) {
      setError(e?.message || 'Unable to start Stripe Checkout');
    } finally {
      setBillingAction(null);
    }
  };

  const openBillingPortal = async () => {
    if (!user?.id) return;
    setBillingAction('portal');
    setError(null);
    try {
      const resp = await fetch(buildApiUrl('/api/billing/stripe/portal-session'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user.id },
        body: JSON.stringify({ org_id: overview?.org_id || undefined }),
      });
      const payload = await resp.json().catch(() => ({}));
      if (!resp.ok || !payload.url) {
        throw new Error(payload.error || 'Unable to open Stripe billing portal');
      }
      window.location.href = payload.url;
    } catch (e: any) {
      setError(e?.message || 'Unable to open Stripe billing portal');
    } finally {
      setBillingAction(null);
    }
  };

  const planFeatures = (plan: BillingPlan) => {
    if (Array.isArray(plan.features)) return plan.features.map((feature) => String(feature)).filter(Boolean);
    if (plan.features && typeof plan.features === 'object') return Object.keys(plan.features as Record<string, unknown>);
    return [];
  };

  return (
    <PageLayout
      title="Billing"
      description="Manage your VictorySync plan, Stripe subscription, payment details, invoices, and usage records."
      actions={
        <div className="flex flex-wrap gap-2">
          <button onClick={openBillingPortal} disabled={loading || billingAction === 'portal'} className="vs-button-secondary">
            {billingAction === 'portal' ? 'Opening...' : 'Manage payment'}
          </button>
          <button onClick={loadData} disabled={loading} className="vs-button-secondary">{loading ? 'Refreshing...' : 'Refresh'}</button>
        </div>
      }
    >
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

        <SectionCard
          title="Stripe subscription"
          description="Hosted Stripe Checkout and Billing Portal keep card data out of VictorySync while syncing billing status back to the dashboard."
          actions={
            <StatusBadge tone={stripeConfigured ? 'success' : 'warning'}>
              {stripeConfigured ? 'Stripe configured' : 'Stripe env missing'}
            </StatusBadge>
          }
        >
          {loading ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => <LoadingSkeleton key={index} className="h-44" />)}
            </div>
          ) : plans.length === 0 ? (
            <EmptyStatePanel
              title="No Stripe-enabled plans"
              description="Create billing packages and add Stripe price IDs so clients can subscribe through Checkout."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              {plans.map((plan) => {
                const current = overview?.package?.id === plan.id;
                const hasStripePrice = Boolean(plan.stripe_price_id);
                return (
                  <div key={plan.id} className={`rounded-2xl border bg-white p-5 shadow-sm ${current ? 'border-violet-300 ring-2 ring-violet-100' : 'border-slate-200'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-base font-semibold text-slate-950">{plan.name}</div>
                        <p className="mt-1 min-h-[40px] text-sm leading-5 text-slate-600">{plan.description || 'Plan details are managed by VictorySync billing.'}</p>
                      </div>
                      {current && <StatusBadge tone="success">Current</StatusBadge>}
                    </div>
                    <div className="mt-5 flex items-end gap-1">
                      <div className="text-3xl font-semibold text-slate-950">{formatMoney(plan.base_monthly_cost, plan.currency || 'USD')}</div>
                      <div className="pb-1 text-sm text-slate-500">/{plan.billing_interval || 'month'}</div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-sm text-slate-700">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Minutes</div>
                        <div className="mt-1 font-semibold text-slate-950">{plan.included_minutes ?? 0}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">SMS</div>
                        <div className="mt-1 font-semibold text-slate-950">{plan.included_sms ?? 0}</div>
                      </div>
                    </div>
                    {planFeatures(plan).length > 0 && (
                      <div className="mt-4 space-y-1 text-sm text-slate-600">
                        {planFeatures(plan).slice(0, 4).map((feature) => <div key={feature}>• {feature}</div>)}
                      </div>
                    )}
                    <button
                      onClick={() => startCheckout(plan.id)}
                      disabled={!stripeConfigured || !hasStripePrice || billingAction === plan.id}
                      className="vs-button-primary mt-5 w-full"
                    >
                      {billingAction === plan.id ? 'Opening Checkout...' : current ? 'Update in Stripe' : 'Start Stripe Checkout'}
                    </button>
                    {!hasStripePrice && (
                      <p className="mt-3 text-xs leading-5 text-amber-700">This plan needs a Stripe price ID before Checkout can be used.</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

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
