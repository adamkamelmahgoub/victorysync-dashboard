import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import AdminLayout from '../../components/AdminLayout';
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
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-4xl max-h-[90vh] overflow-auto bg-slate-900 border border-slate-700 rounded-xl p-6">{children}</div>
    </div>
  );
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

  const authHeaders = useMemo(() => ({ 'x-user-id': user?.id || '', 'Content-Type': 'application/json' }), [user?.id]);

  const parseJsonInput = (raw: string, fallback: any) => {
    if (!raw || !raw.trim()) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error('Invalid JSON field');
    }
  };

  const userDisplay = (u: UserOption) => `${u.email}${u.role ? ` (${u.role})` : ''}`;

  const loadRecords = async () => {
    const resp = await fetch(buildApiUrl('/api/admin/billing/records'), { headers: { 'x-user-id': user?.id || '' } });
    if (!resp.ok) throw new Error('Failed to load billing records');
    const j = await resp.json();
    setRecords(j.records || []);
  };

  const loadInvoices = async () => {
    const resp = await fetch(buildApiUrl('/api/admin/billing/invoices'), { headers: { 'x-user-id': user?.id || '' } });
    if (!resp.ok) throw new Error('Failed to load invoices');
    const j = await resp.json();
    setInvoices(j.invoices || []);
  };

  const loadPackages = async () => {
    const resp = await fetch(buildApiUrl('/api/admin/billing-packages'), { headers: { 'x-user-id': user?.id || '' } });
    if (!resp.ok) throw new Error('Failed to load packages');
    const j = await resp.json();
    setPackages(j.packages || []);
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
    setOrgs((orgJson.orgs || []).map((o: any) => ({ id: String(o.id), name: String(o.name || o.id) })));
    setUsers((userJson.users || []).map((u: any) => ({
      id: String(u.id),
      email: String(u.email || u.id),
      org_id: u.org_id || null,
      role: u.role || null,
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
    loadOptions().catch(() => {
      // Non-blocking for billing actions.
    });
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
      if (!payload.org_id && !payload.user_id) {
        throw new Error('Select at least one target: organization or user');
      }
      if (!payload.description.trim()) {
        throw new Error('Description is required');
      }
      if (!(payload.amount > 0)) {
        throw new Error('Amount must be greater than 0');
      }
      const resp = await fetch(buildApiUrl('/api/admin/billing/records'), { method: 'POST', headers: authHeaders, body: JSON.stringify(payload) });
      if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || 'Failed to create record');
      setShowCreateRecord(false);
      await loadRecords();
    } finally {
      setSubmitting(false);
    }
  };

  const deleteRecord = async (id: string) => {
    if (!confirm('Delete this billing record?')) return;
    const resp = await fetch(buildApiUrl(`/api/admin/billing/records/${encodeURIComponent(id)}`), { method: 'DELETE', headers: { 'x-user-id': user?.id || '' } });
    if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || 'Failed to delete billing record');
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
        items: invoiceForm.items.map((it) => ({ description: it.description, quantity: Number(it.quantity || 0), unit_price: Number(it.unit_price || 0) })),
      };
      const resp = await fetch(buildApiUrl('/api/admin/billing/invoices'), { method: 'POST', headers: authHeaders, body: JSON.stringify(payload) });
      if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || 'Failed to create invoice');
      setShowCreateInvoice(false);
      await loadInvoices();
    } finally {
      setSubmitting(false);
    }
  };

  const deleteInvoice = async (id: string) => {
    if (!confirm('Delete this invoice?')) return;
    const resp = await fetch(buildApiUrl(`/api/admin/billing/invoices/${encodeURIComponent(id)}`), { method: 'DELETE', headers: { 'x-user-id': user?.id || '' } });
    if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || 'Failed to delete invoice');
    await loadInvoices();
  };

  const exportInvoice = async (id: string) => {
    const resp = await fetch(buildApiUrl(`/api/admin/billing/invoices/${encodeURIComponent(id)}/export?format=csv`), { headers: { 'x-user-id': user?.id || '' } });
    if (!resp.ok) throw new Error('Failed to export invoice');
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoice-${id}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
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
      const resp = await fetch(buildApiUrl('/api/admin/billing-packages'), { method: 'POST', headers: authHeaders, body: JSON.stringify(payload) });
      if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || 'Failed to create package');

      const pkgJson = await resp.json().catch(() => ({}));
      const createdPackageId = pkgJson?.package?.id;
      if (orgs.length > 0 && !packageForm.autoAssignOrgId) {
        setShowCreatePackage(false);
        await loadPackages();
        setError('Package created, but not assigned to an organization yet. Assign to an org so clients can see it.');
        return;
      }
      if (createdPackageId && packageForm.autoAssignOrgId) {
        const assignResp = await fetch(buildApiUrl('/api/admin/org-subscriptions'), {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ orgId: packageForm.autoAssignOrgId, planId: createdPackageId }),
        });
        if (!assignResp.ok) {
          const assignErr = await assignResp.json().catch(() => ({}));
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
    const resp = await fetch(buildApiUrl(`/api/admin/billing-packages/${encodeURIComponent(id)}`), { method: 'DELETE', headers: { 'x-user-id': user?.id || '' } });
    if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || 'Failed to delete package');
    await loadPackages();
  };

  return (
    <AdminLayout
      title="Billing Management"
      subtitle="Manage records, invoices, and billing packages"
      tabs={[
        { id: 'records', label: 'Billing Records' },
        { id: 'invoices', label: 'Invoices' },
        { id: 'packages', label: 'Packages' },
      ]}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as any)}
    >
      {error && <div className="mb-4 rounded border border-rose-500/40 bg-rose-900/20 px-3 py-2 text-sm text-rose-200">{error}</div>}

      {activeTab === 'records' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowCreateRecord(true)} className="px-4 py-2 rounded bg-cyan-600 text-white text-sm">Create Record</button>
          </div>
          {loading ? <div className="text-slate-400 text-sm">Loading...</div> : (
            <div className="space-y-2">
              {records.map((r) => (
                <div key={r.id} className="bg-slate-800 border border-slate-700 rounded p-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-white text-sm font-semibold">{r.description}</div>
                    <div className="text-slate-400 text-xs">{r.type} | {r.status} | {new Date(r.created_at).toLocaleDateString()} | org: {r.org_id || '-'} | user: {r.user_id || '-'}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-cyan-300 text-sm font-semibold">{r.currency} {Number(r.amount || 0).toFixed(2)}</div>
                    <button onClick={() => deleteRecord(r.id)} className="px-3 py-1 rounded border border-rose-600 text-rose-300 text-xs">Delete</button>
                  </div>
                </div>
              ))}
              {records.length === 0 && <div className="text-slate-400 text-sm">No records found.</div>}
            </div>
          )}
        </div>
      )}

      {activeTab === 'invoices' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowCreateInvoice(true)} className="px-4 py-2 rounded bg-cyan-600 text-white text-sm">Create Invoice</button>
          </div>
          {loading ? <div className="text-slate-400 text-sm">Loading...</div> : (
            <div className="space-y-2">
              {invoices.map((inv) => (
                <div key={inv.id} className="bg-slate-800 border border-slate-700 rounded p-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-white text-sm font-semibold">{inv.invoice_number || inv.id}</div>
                    <div className="text-slate-400 text-xs">{inv.status} | {new Date(inv.created_at).toLocaleDateString()} | org: {inv.org_id || '-'}</div>
                  </div>
                  <div className="text-cyan-300 text-sm font-semibold">${Number(inv.total_amount ?? inv.total ?? 0).toFixed(2)}</div>
                  <div className="flex gap-2">
                    <button onClick={() => exportInvoice(inv.id)} className="px-3 py-1 rounded border border-cyan-600 text-cyan-300 text-xs">Export</button>
                    <button onClick={() => deleteInvoice(inv.id)} className="px-3 py-1 rounded border border-rose-600 text-rose-300 text-xs">Delete</button>
                  </div>
                </div>
              ))}
              {invoices.length === 0 && <div className="text-slate-400 text-sm">No invoices found.</div>}
            </div>
          )}
        </div>
      )}

      {activeTab === 'packages' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowCreatePackage(true)} className="px-4 py-2 rounded bg-cyan-600 text-white text-sm">Create Package</button>
          </div>
          {loading ? <div className="text-slate-400 text-sm">Loading...</div> : (
            <div className="space-y-2">
              {packages.map((p) => (
                <div key={p.id} className="bg-slate-800 border border-slate-700 rounded p-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-white text-sm font-semibold">{p.name}</div>
                    <div className="text-slate-400 text-xs">{p.description || '-'} | {p.is_active === false ? 'inactive' : 'active'}</div>
                  </div>
                  <div className="text-cyan-300 text-sm font-semibold">${Number(p.base_monthly_cost || 0).toFixed(2)}/mo</div>
                  <button onClick={() => deletePackage(p.id)} className="px-3 py-1 rounded border border-rose-600 text-rose-300 text-xs">Delete</button>
                </div>
              ))}
              {packages.length === 0 && <div className="text-slate-400 text-sm">No packages found.</div>}
            </div>
          )}
        </div>
      )}

      {showCreateRecord && (
        <Modal>
          <h3 className="text-white text-lg font-semibold mb-4">Create Billing Record</h3>
          <div className="grid grid-cols-2 gap-3">
            <select className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white text-sm" value={recordForm.org_id} onChange={(e) => setRecordForm({ ...recordForm, org_id: e.target.value })}>
              <option value="">Select organization (optional)</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <select className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white text-sm" value={recordForm.user_id} onChange={(e) => {
              const nextUserId = e.target.value;
              const selectedUser = users.find((u) => u.id === nextUserId);
              setRecordForm((prev) => ({
                ...prev,
                user_id: nextUserId,
                org_id: prev.org_id || selectedUser?.org_id || '',
              }));
            }}>
              <option value="">Select user (optional)</option>
              {users.map((u) => <option key={u.id} value={u.id}>{userDisplay(u)}</option>)}
            </select>
            <input className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white text-sm col-span-2" placeholder="Description" value={recordForm.description} onChange={(e) => setRecordForm({ ...recordForm, description: e.target.value })} />
            <select className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white text-sm" value={recordForm.type} onChange={(e) => setRecordForm({ ...recordForm, type: e.target.value })}><option value="subscription">subscription</option><option value="one_time">one_time</option><option value="usage">usage</option><option value="refund">refund</option><option value="payment">payment</option></select>
            <select className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white text-sm" value={recordForm.status} onChange={(e) => setRecordForm({ ...recordForm, status: e.target.value })}><option value="pending">pending</option><option value="paid">paid</option><option value="failed">failed</option><option value="refunded">refunded</option></select>
            <input className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white text-sm" placeholder="Amount" type="number" step="0.01" value={recordForm.amount} onChange={(e) => setRecordForm({ ...recordForm, amount: e.target.value })} />
            <select className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white text-sm" value={recordForm.currency} onChange={(e) => setRecordForm({ ...recordForm, currency: e.target.value })}><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option><option value="CAD">CAD</option></select>
            <div className="col-span-2 rounded border border-cyan-700/40 bg-cyan-900/10 px-3 py-2 text-xs text-cyan-100">Tip: clients see records assigned to their organization and/or user account.</div>
            <div className="col-span-2">
              <button type="button" className="text-xs text-cyan-300 hover:text-cyan-200" onClick={() => setShowAdvancedRecordFields((v) => !v)}>
                {showAdvancedRecordFields ? 'Hide advanced fields' : 'Show advanced fields'}
              </button>
            </div>
            {showAdvancedRecordFields && (
              <>
                <input className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white text-sm" placeholder="Billing date (YYYY-MM-DD)" value={recordForm.billing_date} onChange={(e) => setRecordForm({ ...recordForm, billing_date: e.target.value })} />
                <div />
                <textarea className="col-span-2 px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white text-sm min-h-[80px]" placeholder="Metadata JSON (optional)" value={recordForm.metadata_json} onChange={(e) => setRecordForm({ ...recordForm, metadata_json: e.target.value })} />
              </>
            )}
          </div>
          <div className="flex gap-2 mt-4 justify-end">
            <button onClick={() => setShowCreateRecord(false)} className="px-4 py-2 rounded bg-slate-700 text-slate-200 text-sm">Cancel</button>
            <button disabled={submitting} onClick={async () => { try { await createRecord(); } catch (e: any) { alert(e?.message || 'Failed'); } }} className="px-4 py-2 rounded bg-cyan-600 text-white text-sm disabled:opacity-50">{submitting ? 'Creating...' : 'Create'}</button>
          </div>
        </Modal>
      )}

      {showCreateInvoice && (
        <Modal>
          <h3 className="text-white text-lg font-semibold mb-4">Create Invoice</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <select className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white text-sm" value={invoiceForm.org_id} onChange={(e) => setInvoiceForm({ ...invoiceForm, org_id: e.target.value })}>
                <option value="">Select organization</option>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <select className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white text-sm" value={invoiceForm.status} onChange={(e) => setInvoiceForm({ ...invoiceForm, status: e.target.value })}>
                <option value="draft">draft</option><option value="sent">sent</option><option value="paid">paid</option><option value="overdue">overdue</option><option value="cancelled">cancelled</option>
              </select>
              <select className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white text-sm" value={invoiceForm.currency} onChange={(e) => setInvoiceForm({ ...invoiceForm, currency: e.target.value })}>
                <option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option><option value="CAD">CAD</option>
              </select>
              <input className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white text-sm" placeholder="Due date (YYYY-MM-DD)" value={invoiceForm.due_date} onChange={(e) => setInvoiceForm({ ...invoiceForm, due_date: e.target.value })} />
              <input className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white text-sm" placeholder="Period start (YYYY-MM-DD)" value={invoiceForm.billing_period_start} onChange={(e) => setInvoiceForm({ ...invoiceForm, billing_period_start: e.target.value })} />
              <input className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white text-sm" placeholder="Period end (YYYY-MM-DD)" value={invoiceForm.billing_period_end} onChange={(e) => setInvoiceForm({ ...invoiceForm, billing_period_end: e.target.value })} />
              <input className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white text-sm" type="number" step="0.01" placeholder="Tax amount" value={invoiceForm.tax_amount} onChange={(e) => setInvoiceForm({ ...invoiceForm, tax_amount: e.target.value })} />
              <input className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white text-sm" type="number" step="0.01" placeholder="Subtotal (optional override)" value={invoiceForm.subtotal} onChange={(e) => setInvoiceForm({ ...invoiceForm, subtotal: e.target.value })} />
              <input className="col-span-2 px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white text-sm" type="number" step="0.01" placeholder="Total amount (optional override)" value={invoiceForm.total_amount} onChange={(e) => setInvoiceForm({ ...invoiceForm, total_amount: e.target.value })} />
              <input className="col-span-2 px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white text-sm" placeholder="Notes" value={invoiceForm.notes} onChange={(e) => setInvoiceForm({ ...invoiceForm, notes: e.target.value })} />
              <textarea className="col-span-2 px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white text-sm min-h-[80px]" placeholder="Metadata JSON" value={invoiceForm.metadata_json} onChange={(e) => setInvoiceForm({ ...invoiceForm, metadata_json: e.target.value })} />
            </div>
            {invoiceForm.items.map((it, idx) => (
              <div className="grid grid-cols-12 gap-2" key={idx}>
                <input className="col-span-6 px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white text-sm" placeholder="Description" value={it.description} onChange={(e) => { const items = [...invoiceForm.items]; items[idx] = { ...items[idx], description: e.target.value }; setInvoiceForm({ ...invoiceForm, items }); }} />
                <input className="col-span-3 px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white text-sm" type="number" placeholder="Qty" value={it.quantity} onChange={(e) => { const items = [...invoiceForm.items]; items[idx] = { ...items[idx], quantity: Number(e.target.value || 0) }; setInvoiceForm({ ...invoiceForm, items }); }} />
                <input className="col-span-3 px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white text-sm" type="number" step="0.01" placeholder="Unit price" value={it.unit_price} onChange={(e) => { const items = [...invoiceForm.items]; items[idx] = { ...items[idx], unit_price: Number(e.target.value || 0) }; setInvoiceForm({ ...invoiceForm, items }); }} />
              </div>
            ))}
            <button onClick={() => setInvoiceForm({ ...invoiceForm, items: [...invoiceForm.items, { description: '', quantity: 1, unit_price: 0 }] })} className="px-3 py-1 rounded border border-slate-600 text-slate-300 text-xs">Add Item</button>
          </div>
          <div className="flex gap-2 mt-4 justify-end">
            <button onClick={() => setShowCreateInvoice(false)} className="px-4 py-2 rounded bg-slate-700 text-slate-200 text-sm">Cancel</button>
            <button disabled={submitting} onClick={async () => { try { await createInvoice(); } catch (e: any) { alert(e?.message || 'Failed'); } }} className="px-4 py-2 rounded bg-cyan-600 text-white text-sm disabled:opacity-50">{submitting ? 'Creating...' : 'Create'}</button>
          </div>
        </Modal>
      )}

      {showCreatePackage && (
        <Modal>
          <h3 className="text-white text-lg font-semibold mb-4">Create Billing Package</h3>
          <div className="grid grid-cols-2 gap-3">
            <input className="col-span-2 px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white text-sm" placeholder="Name" value={packageForm.name} onChange={(e) => setPackageForm({ ...packageForm, name: e.target.value })} />
            <input className="col-span-2 px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white text-sm" placeholder="Description" value={packageForm.description} onChange={(e) => setPackageForm({ ...packageForm, description: e.target.value })} />
            <input className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white text-sm" placeholder="Monthly" type="number" step="0.01" value={packageForm.base_monthly_cost} onChange={(e) => setPackageForm({ ...packageForm, base_monthly_cost: e.target.value })} />
            <input className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white text-sm" placeholder="Included mins" type="number" value={packageForm.included_minutes} onChange={(e) => setPackageForm({ ...packageForm, included_minutes: e.target.value })} />
            <input className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white text-sm" placeholder="Included SMS" type="number" value={packageForm.included_sms} onChange={(e) => setPackageForm({ ...packageForm, included_sms: e.target.value })} />
            <input className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white text-sm" placeholder="Overage/min" type="number" step="0.01" value={packageForm.overage_minute_cost} onChange={(e) => setPackageForm({ ...packageForm, overage_minute_cost: e.target.value })} />
            <input className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white text-sm" placeholder="Overage/SMS" type="number" step="0.01" value={packageForm.overage_sms_cost} onChange={(e) => setPackageForm({ ...packageForm, overage_sms_cost: e.target.value })} />
            <select className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white text-sm" value={packageForm.autoAssignOrgId} onChange={(e) => setPackageForm({ ...packageForm, autoAssignOrgId: e.target.value })}>
              <option value="">Assign to org after create (recommended)</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <div className="px-3 py-2 rounded bg-slate-900/60 border border-slate-700 text-slate-400 text-xs">Client billing page reads organization subscriptions and billing records. Package assignment here is org-based.</div>
            <label className="col-span-2 inline-flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={packageForm.is_active} onChange={(e) => setPackageForm({ ...packageForm, is_active: e.target.checked })} />
              Active package
            </label>
            <textarea className="col-span-2 px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white text-sm min-h-[90px]" placeholder="Features JSON (array/object)" value={packageForm.features_json} onChange={(e) => setPackageForm({ ...packageForm, features_json: e.target.value })} />
          </div>
          <div className="flex gap-2 mt-4 justify-end">
            <button onClick={() => setShowCreatePackage(false)} className="px-4 py-2 rounded bg-slate-700 text-slate-200 text-sm">Cancel</button>
            <button disabled={submitting} onClick={async () => { try { await createPackage(); } catch (e: any) { alert(e?.message || 'Failed'); } }} className="px-4 py-2 rounded bg-cyan-600 text-white text-sm disabled:opacity-50">{submitting ? 'Creating...' : 'Create'}</button>
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
};

export default AdminBillingPageV2;

