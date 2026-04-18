import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { PageLayout } from '../../components/PageLayout';
import AdminTopNav from '../../components/AdminTopNav';
import { EmptyStatePanel, MetricStatCard, SectionCard, StatusBadge } from '../../components/DashboardPrimitives';
import { buildApiUrl } from '../../config';

type OrgOption = {
  id: string;
  name: string;
};

type UserOption = {
  id: string;
  email: string;
  org_id?: string | null;
  role?: string | null;
};

type BillingRecord = {
  id: string;
  org_id: string | null;
  user_id: string | null;
  type: string;
  description: string;
  amount: number;
  currency: string;
  status: string;
  billing_date: string;
  created_at: string;
};

type Invoice = {
  id: string;
  org_id: string;
  invoice_number: string;
  subtotal?: number;
  tax_amount?: number;
  total_amount?: number;
  total?: number;
  status: string;
  created_at: string;
  invoice_items?: Array<{ description?: string; quantity?: number; unit_price?: number; line_total?: number }>;
};

type BillingPackage = {
  id: string;
  name: string;
  description?: string | null;
  features?: any;
  base_monthly_cost?: number;
  included_minutes?: number;
  included_sms?: number;
  overage_minute_cost?: number;
  overage_sms_cost?: number;
  is_active?: boolean;
  created_at?: string;
};

function Modal({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="vs-surface max-h-[92vh] w-full max-w-5xl overflow-auto p-6">{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</label>
      {children}
    </div>
  );
}

function formatCurrency(currency: string | undefined, value: number | undefined | null) {
  return `${currency || 'USD'} ${Number(value || 0).toFixed(2)}`;
}

export const AdminBillingPageV2: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'records' | 'invoices' | 'packages'>('records');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [records, setRecords] = useState<BillingRecord[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [packages, setPackages] = useState<BillingPackage[]>([]);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [search, setSearch] = useState('');

  const [showCreateRecord, setShowCreateRecord] = useState(false);
  const [showCreateInvoice, setShowCreateInvoice] = useState(false);
  const [showCreatePackage, setShowCreatePackage] = useState(false);
  const [showAdvancedRecordFields, setShowAdvancedRecordFields] = useState(false);

  const [recordForm, setRecordForm] = useState({
    org_id: '',
    user_id: '',
    type: 'subscription',
    status: 'pending',
    description: '',
    amount: '',
    currency: 'USD',
    billing_date: '',
    metadata_json: '{}',
  });

  const [invoiceForm, setInvoiceForm] = useState({
    org_id: '',
    status: 'draft',
    currency: 'USD',
    due_date: '',
    billing_period_start: '',
    billing_period_end: '',
    tax_amount: '0',
    subtotal: '',
    total_amount: '',
    notes: '',
    metadata_json: '{}',
    items: [{ description: '', quantity: 1, unit_price: 0 }] as Array<{ description: string; quantity: number; unit_price: number }>,
  });

  const [packageForm, setPackageForm] = useState({
    name: '',
    description: '',
    base_monthly_cost: '0',
    included_minutes: '0',
    included_sms: '0',
    overage_minute_cost: '0.01',
    overage_sms_cost: '0.01',
    features_json: '[]',
    is_active: true,
    autoAssignOrgId: '',
  });

  const authHeaders = useMemo(
    () => ({ 'x-user-id': user?.id || '', 'Content-Type': 'application/json' }),
    [user?.id]
  );

  const orgNameById = useMemo(() => new Map(orgs.map((org) => [org.id, org.name])), [orgs]);
  const userEmailById = useMemo(() => new Map(users.map((entry) => [entry.id, entry.email])), [users]);

  const parseJsonInput = (raw: string, fallback: any) => {
    if (!raw || !raw.trim()) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error('Invalid JSON field');
    }
  };

  const userDisplay = (entry: UserOption) => `${entry.email}${entry.role ? ` (${entry.role})` : ''}`;

  const loadRecords = async () => {
    const response = await fetch(buildApiUrl('/api/admin/billing/records'), { headers: { 'x-user-id': user?.id || '' } });
    if (!response.ok) throw new Error('Failed to load billing records');
    const payload = await response.json();
    setRecords(payload.records || []);
  };

  const loadInvoices = async () => {
    const response = await fetch(buildApiUrl('/api/admin/billing/invoices'), { headers: { 'x-user-id': user?.id || '' } });
    if (!response.ok) throw new Error('Failed to load invoices');
    const payload = await response.json();
    setInvoices(payload.invoices || []);
  };

  const loadPackages = async () => {
    const response = await fetch(buildApiUrl('/api/admin/billing-packages'), { headers: { 'x-user-id': user?.id || '' } });
    if (!response.ok) throw new Error('Failed to load packages');
    const payload = await response.json();
    setPackages(payload.packages || []);
  };

  const loadOptions = async () => {
    const [orgResp, userResp] = await Promise.all([
      fetch(buildApiUrl('/api/admin/orgs'), { headers: { 'x-user-id': user?.id || '' } }),
      fetch(buildApiUrl('/api/admin/users'), { headers: { 'x-user-id': user?.id || '' } }),
    ]);
    if (!orgResp.ok) throw new Error('Failed to load organizations');
    if (!userResp.ok) throw new Error('Failed to load users');
    const orgJson = await orgResp.json();
    const userJson = await userResp.json();
    setOrgs((orgJson.orgs || []).map((org: any) => ({ id: String(org.id), name: String(org.name || org.id) })));
    setUsers((userJson.users || []).map((entry: any) => ({
      id: String(entry.id),
      email: String(entry.email || entry.id),
      org_id: entry.org_id || null,
      role: entry.role || null,
    })));
  };

  const loadActiveTab = async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'records') await loadRecords();
      if (activeTab === 'invoices') await loadInvoices();
      if (activeTab === 'packages') await loadPackages();
    } catch (err: any) {
      setError(err?.message || 'Failed to load billing data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    loadActiveTab();
  }, [activeTab, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    loadOptions().catch(() => {});
  }, [user?.id]);

  const createRecord = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const metadata = parseJsonInput(recordForm.metadata_json, {});
      const payload = {
        org_id: recordForm.org_id || null,
        user_id: recordForm.user_id || null,
        type: recordForm.type,
        status: recordForm.status,
        description: recordForm.description,
        amount: Number(recordForm.amount || 0),
        currency: recordForm.currency || 'USD',
        billing_date: recordForm.billing_date || undefined,
        metadata,
      };
      if (!payload.org_id && !payload.user_id) throw new Error('Select at least one target: organization or user');
      if (!payload.description.trim()) throw new Error('Description is required');
      if (!(payload.amount > 0)) throw new Error('Amount must be greater than 0');
      const response = await fetch(buildApiUrl('/api/admin/billing/records'), {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Failed to create record');
      setShowCreateRecord(false);
      await loadRecords();
    } finally {
      setSubmitting(false);
    }
  };

  const deleteRecord = async (id: string) => {
    if (!confirm('Delete this billing record?')) return;
    const response = await fetch(buildApiUrl(`/api/admin/billing/records/${encodeURIComponent(id)}`), {
      method: 'DELETE',
      headers: { 'x-user-id': user?.id || '' },
    });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Failed to delete billing record');
    await loadRecords();
  };

  const createInvoice = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const metadata = parseJsonInput(invoiceForm.metadata_json, {});
      const payload = {
        org_id: invoiceForm.org_id,
        status: invoiceForm.status,
        currency: invoiceForm.currency || 'USD',
        due_date: invoiceForm.due_date || undefined,
        billing_period_start: invoiceForm.billing_period_start || undefined,
        billing_period_end: invoiceForm.billing_period_end || undefined,
        tax_amount: Number(invoiceForm.tax_amount || 0),
        subtotal: invoiceForm.subtotal ? Number(invoiceForm.subtotal) : undefined,
        total_amount: invoiceForm.total_amount ? Number(invoiceForm.total_amount) : undefined,
        notes: invoiceForm.notes || undefined,
        metadata,
        items: invoiceForm.items.map((item) => ({
          description: item.description,
          quantity: Number(item.quantity || 0),
          unit_price: Number(item.unit_price || 0),
        })),
      };
      const response = await fetch(buildApiUrl('/api/admin/billing/invoices'), {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Failed to create invoice');
      setShowCreateInvoice(false);
      await loadInvoices();
    } finally {
      setSubmitting(false);
    }
  };

  const deleteInvoice = async (id: string) => {
    if (!confirm('Delete this invoice?')) return;
    const response = await fetch(buildApiUrl(`/api/admin/billing/invoices/${encodeURIComponent(id)}`), {
      method: 'DELETE',
      headers: { 'x-user-id': user?.id || '' },
    });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Failed to delete invoice');
    await loadInvoices();
  };

  const exportInvoice = async (id: string) => {
    const response = await fetch(buildApiUrl(`/api/admin/billing/invoices/${encodeURIComponent(id)}/export?format=csv`), {
      headers: { 'x-user-id': user?.id || '' },
    });
    if (!response.ok) throw new Error('Failed to export invoice');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `invoice-${id}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const createPackage = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const features = parseJsonInput(packageForm.features_json, []);
      const payload = {
        name: packageForm.name,
        description: packageForm.description,
        base_monthly_cost: Number(packageForm.base_monthly_cost || 0),
        included_minutes: Number(packageForm.included_minutes || 0),
        included_sms: Number(packageForm.included_sms || 0),
        overage_minute_cost: Number(packageForm.overage_minute_cost || 0),
        overage_sms_cost: Number(packageForm.overage_sms_cost || 0),
        features,
        is_active: packageForm.is_active,
      };
      const response = await fetch(buildApiUrl('/api/admin/billing-packages'), {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Failed to create package');

      const packageJson = await response.json().catch(() => ({}));
      const createdPackageId = packageJson?.package?.id;
      if (createdPackageId && packageForm.autoAssignOrgId) {
        const assignResponse = await fetch(buildApiUrl('/api/admin/org-subscriptions'), {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ orgId: packageForm.autoAssignOrgId, planId: createdPackageId }),
        });
        if (!assignResponse.ok) {
          const assignErr = await assignResponse.json().catch(() => ({}));
          throw new Error(assignErr?.error || 'Package created but failed to assign to organization');
        }
      }

      setShowCreatePackage(false);
      await loadPackages();
    } finally {
      setSubmitting(false);
    }
  };

  const deletePackage = async (id: string) => {
    if (!confirm('Delete this billing package?')) return;
    const response = await fetch(buildApiUrl(`/api/admin/billing-packages/${encodeURIComponent(id)}`), {
      method: 'DELETE',
      headers: { 'x-user-id': user?.id || '' },
    });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Failed to delete billing package');
    await loadPackages();
  };

  const filteredRecords = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return records;
    return records.filter((record) =>
      [record.description, record.type, record.status, orgNameById.get(record.org_id || ''), userEmailById.get(record.user_id || '')]
        .map((value) => String(value || '').toLowerCase())
        .join(' ')
        .includes(term)
    );
  }, [records, search, orgNameById, userEmailById]);

  const filteredInvoices = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return invoices;
    return invoices.filter((invoice) =>
      [invoice.invoice_number, invoice.status, orgNameById.get(invoice.org_id || '')]
        .map((value) => String(value || '').toLowerCase())
        .join(' ')
        .includes(term)
    );
  }, [invoices, search, orgNameById]);

  const filteredPackages = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return packages;
    return packages.filter((billingPackage) =>
      [billingPackage.name, billingPackage.description]
        .map((value) => String(value || '').toLowerCase())
        .join(' ')
        .includes(term)
    );
  }, [packages, search]);

  const summary = useMemo(() => {
    const totalRecordValue = records.reduce((sum, record) => sum + Number(record.amount || 0), 0);
    const outstandingInvoices = invoices.filter((invoice) => !['paid', 'cancelled'].includes(String(invoice.status || '').toLowerCase())).length;
    const activePackages = packages.filter((billingPackage) => billingPackage.is_active !== false).length;
    return { totalRecordValue, outstandingInvoices, activePackages };
  }, [records, invoices, packages]);

  const tabButtons = [
    { id: 'records' as const, label: 'Billing records', count: records.length },
    { id: 'invoices' as const, label: 'Invoices', count: invoices.length },
    { id: 'packages' as const, label: 'Packages', count: packages.length },
  ];

  return (
    <PageLayout
      eyebrow="Admin billing"
      title="Billing"
      description="A cleaner billing workspace for finance operations, invoices, and plan management."
      actions={
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowCreateRecord(true)} className="vs-button-secondary">New record</button>
          <button onClick={() => setShowCreateInvoice(true)} className="vs-button-secondary">New invoice</button>
          <button onClick={() => setShowCreatePackage(true)} className="vs-button-primary">New package</button>
        </div>
      }
    >
      <div className="space-y-6">
        <AdminTopNav />

        {error && <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <MetricStatCard label="Billing Records" value={records.length} hint="Line-item charges and adjustments" />
          <MetricStatCard label="Recorded Value" value={formatCurrency('USD', summary.totalRecordValue)} hint="Visible record amount total" accent="cyan" />
          <MetricStatCard label="Open Invoices" value={summary.outstandingInvoices} hint="Draft, sent, or overdue" accent="amber" />
          <MetricStatCard label="Active Packages" value={summary.activePackages} hint="Plans currently available" accent="emerald" />
        </div>

        <SectionCard title="Billing views" description="Move between financial records, invoice output, and package administration.">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {tabButtons.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={activeTab === tab.id ? 'vs-button-primary' : 'vs-button-secondary'}
                >
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search orgs, users, invoices, packages"
              className="vs-input w-full lg:max-w-sm"
            />
          </div>
        </SectionCard>

        {activeTab === 'records' && (
          <SectionCard title="Billing records" description="Charges, refunds, and subscription movements with human-readable org and user context.">
            {loading ? (
              <div className="text-sm text-slate-400">Loading billing records...</div>
            ) : filteredRecords.length === 0 ? (
              <EmptyStatePanel title="No billing records" description="Create the first billing record to start tracking charges, payments, or manual adjustments." />
            ) : (
              <div className="space-y-3">
                {filteredRecords.map((record) => (
                  <div key={record.id} className="vs-surface-muted p-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-base font-semibold text-white">{record.description}</div>
                          <StatusBadge tone={String(record.status || '').toLowerCase() === 'paid' ? 'success' : 'warning'}>
                            {record.status}
                          </StatusBadge>
                          <StatusBadge tone="neutral">{record.type}</StatusBadge>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-400">
                          <span>Organization: {orgNameById.get(record.org_id || '') || 'Unassigned'}</span>
                          <span>User: {userEmailById.get(record.user_id || '') || 'Not linked'}</span>
                          <span>Date: {new Date(record.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-sm font-semibold text-cyan-200">{formatCurrency(record.currency, record.amount)}</div>
                        <button onClick={() => deleteRecord(record.id)} className="vs-button-secondary">Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        )}

        {activeTab === 'invoices' && (
          <SectionCard title="Invoices" description="Draft, export, and manage invoicing output with a more usable summary view.">
            {loading ? (
              <div className="text-sm text-slate-400">Loading invoices...</div>
            ) : filteredInvoices.length === 0 ? (
              <EmptyStatePanel title="No invoices" description="Create an invoice to give clients a structured billing artifact with line items and totals." />
            ) : (
              <div className="space-y-3">
                {filteredInvoices.map((invoice) => (
                  <div key={invoice.id} className="vs-surface-muted p-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-base font-semibold text-white">{invoice.invoice_number || invoice.id}</div>
                          <StatusBadge tone={String(invoice.status || '').toLowerCase() === 'paid' ? 'success' : 'warning'}>
                            {invoice.status}
                          </StatusBadge>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-400">
                          <span>Organization: {orgNameById.get(invoice.org_id || '') || 'Unknown org'}</span>
                          <span>Created: {new Date(invoice.created_at).toLocaleDateString()}</span>
                          <span>{invoice.invoice_items?.length || 0} line items</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-sm font-semibold text-cyan-200">{formatCurrency('USD', invoice.total_amount ?? invoice.total ?? 0)}</div>
                        <button onClick={() => exportInvoice(invoice.id)} className="vs-button-secondary">Export CSV</button>
                        <button onClick={() => deleteInvoice(invoice.id)} className="vs-button-secondary">Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        )}

        {activeTab === 'packages' && (
          <SectionCard title="Packages" description="Manage the plan catalog clients actually experience on the billing side.">
            {loading ? (
              <div className="text-sm text-slate-400">Loading packages...</div>
            ) : filteredPackages.length === 0 ? (
              <EmptyStatePanel title="No packages" description="Create a billing package to establish clean plan pricing, allowances, and overage rules." />
            ) : (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {filteredPackages.map((billingPackage) => (
                  <div key={billingPackage.id} className="vs-surface-muted p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-lg font-semibold text-white">{billingPackage.name}</div>
                          <StatusBadge tone={billingPackage.is_active === false ? 'warning' : 'success'}>
                            {billingPackage.is_active === false ? 'Inactive' : 'Active'}
                          </StatusBadge>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-400">{billingPackage.description || 'No package description provided yet.'}</p>
                      </div>
                      <button onClick={() => deletePackage(billingPackage.id)} className="vs-button-secondary">Delete</button>
                    </div>
                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <div className="vs-surface p-4">
                        <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Monthly</div>
                        <div className="mt-2 text-2xl font-semibold text-white">{formatCurrency('USD', billingPackage.base_monthly_cost)}</div>
                      </div>
                      <div className="vs-surface p-4">
                        <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Included</div>
                        <div className="mt-2 text-sm text-slate-200">{billingPackage.included_minutes || 0} mins · {billingPackage.included_sms || 0} SMS</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        )}
      </div>

      {showCreateRecord && (
        <Modal>
          <div className="mb-5">
            <h3 className="text-xl font-semibold text-white">Create billing record</h3>
            <p className="mt-2 text-sm text-slate-400">Add a charge, payment, refund, or usage entry with better target context.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Organization">
              <select className="vs-input w-full" value={recordForm.org_id} onChange={(e) => setRecordForm({ ...recordForm, org_id: e.target.value })}>
                <option value="">Select organization (optional)</option>
                {orgs.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
              </select>
            </Field>
            <Field label="User">
              <select
                className="vs-input w-full"
                value={recordForm.user_id}
                onChange={(e) => {
                  const nextUserId = e.target.value;
                  const selectedUser = users.find((entry) => entry.id === nextUserId);
                  setRecordForm((previous) => ({
                    ...previous,
                    user_id: nextUserId,
                    org_id: previous.org_id || selectedUser?.org_id || '',
                  }));
                }}
              >
                <option value="">Select user (optional)</option>
                {users.map((entry) => <option key={entry.id} value={entry.id}>{userDisplay(entry)}</option>)}
              </select>
            </Field>
            <Field label="Description">
              <input className="vs-input w-full" placeholder="Description" value={recordForm.description} onChange={(e) => setRecordForm({ ...recordForm, description: e.target.value })} />
            </Field>
            <Field label="Amount">
              <input className="vs-input w-full" placeholder="Amount" type="number" step="0.01" value={recordForm.amount} onChange={(e) => setRecordForm({ ...recordForm, amount: e.target.value })} />
            </Field>
            <Field label="Type">
              <select className="vs-input w-full" value={recordForm.type} onChange={(e) => setRecordForm({ ...recordForm, type: e.target.value })}>
                <option value="subscription">subscription</option>
                <option value="one_time">one_time</option>
                <option value="usage">usage</option>
                <option value="refund">refund</option>
                <option value="payment">payment</option>
              </select>
            </Field>
            <Field label="Status">
              <select className="vs-input w-full" value={recordForm.status} onChange={(e) => setRecordForm({ ...recordForm, status: e.target.value })}>
                <option value="pending">pending</option>
                <option value="paid">paid</option>
                <option value="failed">failed</option>
                <option value="refunded">refunded</option>
              </select>
            </Field>
            <Field label="Currency">
              <select className="vs-input w-full" value={recordForm.currency} onChange={(e) => setRecordForm({ ...recordForm, currency: e.target.value })}>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="CAD">CAD</option>
              </select>
            </Field>
            <div className="md:col-span-2">
              <button type="button" className="text-sm text-cyan-200" onClick={() => setShowAdvancedRecordFields((value) => !value)}>
                {showAdvancedRecordFields ? 'Hide advanced fields' : 'Show advanced fields'}
              </button>
            </div>
            {showAdvancedRecordFields && (
              <>
                <Field label="Billing Date">
                  <input className="vs-input w-full" placeholder="YYYY-MM-DD" value={recordForm.billing_date} onChange={(e) => setRecordForm({ ...recordForm, billing_date: e.target.value })} />
                </Field>
                <Field label="Metadata JSON">
                  <textarea className="vs-input min-h-[100px] w-full resize-none" value={recordForm.metadata_json} onChange={(e) => setRecordForm({ ...recordForm, metadata_json: e.target.value })} />
                </Field>
              </>
            )}
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={() => setShowCreateRecord(false)} className="vs-button-secondary">Cancel</button>
            <button disabled={submitting} onClick={async () => { try { await createRecord(); } catch (e: any) { alert(e?.message || 'Failed'); } }} className="vs-button-primary">
              {submitting ? 'Creating...' : 'Create record'}
            </button>
          </div>
        </Modal>
      )}

      {showCreateInvoice && (
        <Modal>
          <div className="mb-5">
            <h3 className="text-xl font-semibold text-white">Create invoice</h3>
            <p className="mt-2 text-sm text-slate-400">Build a cleaner invoice with dates, status, and explicit line items.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Organization">
              <select className="vs-input w-full" value={invoiceForm.org_id} onChange={(e) => setInvoiceForm({ ...invoiceForm, org_id: e.target.value })}>
                <option value="">Select organization</option>
                {orgs.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select className="vs-input w-full" value={invoiceForm.status} onChange={(e) => setInvoiceForm({ ...invoiceForm, status: e.target.value })}>
                <option value="draft">draft</option>
                <option value="sent">sent</option>
                <option value="paid">paid</option>
                <option value="overdue">overdue</option>
                <option value="cancelled">cancelled</option>
              </select>
            </Field>
            <Field label="Currency">
              <select className="vs-input w-full" value={invoiceForm.currency} onChange={(e) => setInvoiceForm({ ...invoiceForm, currency: e.target.value })}>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="CAD">CAD</option>
              </select>
            </Field>
            <Field label="Due Date">
              <input className="vs-input w-full" placeholder="YYYY-MM-DD" value={invoiceForm.due_date} onChange={(e) => setInvoiceForm({ ...invoiceForm, due_date: e.target.value })} />
            </Field>
            <Field label="Period Start">
              <input className="vs-input w-full" placeholder="YYYY-MM-DD" value={invoiceForm.billing_period_start} onChange={(e) => setInvoiceForm({ ...invoiceForm, billing_period_start: e.target.value })} />
            </Field>
            <Field label="Period End">
              <input className="vs-input w-full" placeholder="YYYY-MM-DD" value={invoiceForm.billing_period_end} onChange={(e) => setInvoiceForm({ ...invoiceForm, billing_period_end: e.target.value })} />
            </Field>
            <Field label="Tax Amount">
              <input className="vs-input w-full" type="number" step="0.01" value={invoiceForm.tax_amount} onChange={(e) => setInvoiceForm({ ...invoiceForm, tax_amount: e.target.value })} />
            </Field>
            <Field label="Subtotal Override">
              <input className="vs-input w-full" type="number" step="0.01" value={invoiceForm.subtotal} onChange={(e) => setInvoiceForm({ ...invoiceForm, subtotal: e.target.value })} />
            </Field>
            <Field label="Total Override">
              <input className="vs-input w-full" type="number" step="0.01" value={invoiceForm.total_amount} onChange={(e) => setInvoiceForm({ ...invoiceForm, total_amount: e.target.value })} />
            </Field>
            <Field label="Notes">
              <input className="vs-input w-full" value={invoiceForm.notes} onChange={(e) => setInvoiceForm({ ...invoiceForm, notes: e.target.value })} />
            </Field>
            <div className="md:col-span-2">
              <Field label="Metadata JSON">
                <textarea className="vs-input min-h-[100px] w-full resize-none" value={invoiceForm.metadata_json} onChange={(e) => setInvoiceForm({ ...invoiceForm, metadata_json: e.target.value })} />
              </Field>
            </div>
          </div>
          <div className="mt-6 space-y-3">
            <div className="text-sm font-semibold text-white">Line items</div>
            {invoiceForm.items.map((item, index) => (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-12" key={index}>
                <input className="vs-input md:col-span-6" placeholder="Description" value={item.description} onChange={(e) => {
                  const items = [...invoiceForm.items];
                  items[index] = { ...items[index], description: e.target.value };
                  setInvoiceForm({ ...invoiceForm, items });
                }} />
                <input className="vs-input md:col-span-3" type="number" placeholder="Qty" value={item.quantity} onChange={(e) => {
                  const items = [...invoiceForm.items];
                  items[index] = { ...items[index], quantity: Number(e.target.value || 0) };
                  setInvoiceForm({ ...invoiceForm, items });
                }} />
                <input className="vs-input md:col-span-3" type="number" step="0.01" placeholder="Unit price" value={item.unit_price} onChange={(e) => {
                  const items = [...invoiceForm.items];
                  items[index] = { ...items[index], unit_price: Number(e.target.value || 0) };
                  setInvoiceForm({ ...invoiceForm, items });
                }} />
              </div>
            ))}
            <button onClick={() => setInvoiceForm({ ...invoiceForm, items: [...invoiceForm.items, { description: '', quantity: 1, unit_price: 0 }] })} className="vs-button-secondary">
              Add item
            </button>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={() => setShowCreateInvoice(false)} className="vs-button-secondary">Cancel</button>
            <button disabled={submitting} onClick={async () => { try { await createInvoice(); } catch (e: any) { alert(e?.message || 'Failed'); } }} className="vs-button-primary">
              {submitting ? 'Creating...' : 'Create invoice'}
            </button>
          </div>
        </Modal>
      )}

      {showCreatePackage && (
        <Modal>
          <div className="mb-5">
            <h3 className="text-xl font-semibold text-white">Create package</h3>
            <p className="mt-2 text-sm text-slate-400">Set plan pricing and optionally assign the package to an organization immediately.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Name">
              <input className="vs-input w-full" value={packageForm.name} onChange={(e) => setPackageForm({ ...packageForm, name: e.target.value })} />
            </Field>
            <Field label="Monthly Price">
              <input className="vs-input w-full" type="number" step="0.01" value={packageForm.base_monthly_cost} onChange={(e) => setPackageForm({ ...packageForm, base_monthly_cost: e.target.value })} />
            </Field>
            <div className="md:col-span-2">
              <Field label="Description">
                <input className="vs-input w-full" value={packageForm.description} onChange={(e) => setPackageForm({ ...packageForm, description: e.target.value })} />
              </Field>
            </div>
            <Field label="Included Minutes">
              <input className="vs-input w-full" type="number" value={packageForm.included_minutes} onChange={(e) => setPackageForm({ ...packageForm, included_minutes: e.target.value })} />
            </Field>
            <Field label="Included SMS">
              <input className="vs-input w-full" type="number" value={packageForm.included_sms} onChange={(e) => setPackageForm({ ...packageForm, included_sms: e.target.value })} />
            </Field>
            <Field label="Overage / Minute">
              <input className="vs-input w-full" type="number" step="0.01" value={packageForm.overage_minute_cost} onChange={(e) => setPackageForm({ ...packageForm, overage_minute_cost: e.target.value })} />
            </Field>
            <Field label="Overage / SMS">
              <input className="vs-input w-full" type="number" step="0.01" value={packageForm.overage_sms_cost} onChange={(e) => setPackageForm({ ...packageForm, overage_sms_cost: e.target.value })} />
            </Field>
            <Field label="Assign to Organization">
              <select className="vs-input w-full" value={packageForm.autoAssignOrgId} onChange={(e) => setPackageForm({ ...packageForm, autoAssignOrgId: e.target.value })}>
                <option value="">No assignment yet</option>
                {orgs.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
              </select>
            </Field>
            <Field label="Active">
              <label className="vs-surface-muted flex items-center gap-3 px-4 py-3 text-sm text-slate-300">
                <input type="checkbox" checked={packageForm.is_active} onChange={(e) => setPackageForm({ ...packageForm, is_active: e.target.checked })} />
                Package is active
              </label>
            </Field>
            <div className="md:col-span-2">
              <Field label="Features JSON">
                <textarea className="vs-input min-h-[120px] w-full resize-none" value={packageForm.features_json} onChange={(e) => setPackageForm({ ...packageForm, features_json: e.target.value })} />
              </Field>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={() => setShowCreatePackage(false)} className="vs-button-secondary">Cancel</button>
            <button disabled={submitting} onClick={async () => { try { await createPackage(); } catch (e: any) { alert(e?.message || 'Failed'); } }} className="vs-button-primary">
              {submitting ? 'Creating...' : 'Create package'}
            </button>
          </div>
        </Modal>
      )}
    </PageLayout>
  );
};

export default AdminBillingPageV2;
