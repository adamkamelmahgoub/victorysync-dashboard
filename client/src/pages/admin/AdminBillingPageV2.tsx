import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import AdminLayout from '../../components/AdminLayout';
import { buildApiUrl } from '../../config';

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
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-xl p-6">{children}</div>
    </div>
  );
}

export const AdminBillingPageV2: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'records' | 'invoices' | 'packages'>('records');
  const [loading, setLoading] = useState(false);

  const [records, setRecords] = useState<BillingRecord[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [packages, setPackages] = useState<BillingPackage[]>([]);

  const [showCreateRecord, setShowCreateRecord] = useState(false);
  const [showCreateInvoice, setShowCreateInvoice] = useState(false);
  const [showCreatePackage, setShowCreatePackage] = useState(false);

  const [recordForm, setRecordForm] = useState({ org_id: '', user_id: '', type: 'subscription', description: '', amount: '', currency: 'USD' });
  const [invoiceForm, setInvoiceForm] = useState({ org_id: '', items: [{ description: '', quantity: 1, unit_price: 0 }] as Array<{ description: string; quantity: number; unit_price: number }> });
  const [packageForm, setPackageForm] = useState({ name: '', description: '', base_monthly_cost: '0', included_minutes: '0', included_sms: '0', overage_minute_cost: '0.01', overage_sms_cost: '0.01', is_active: true });

  const authHeaders = useMemo(() => ({ 'x-user-id': user?.id || '', 'Content-Type': 'application/json' }), [user?.id]);

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

  const loadActiveTab = async () => {
    setLoading(true);
    try {
      if (activeTab === 'records') await loadRecords();
      if (activeTab === 'invoices') await loadInvoices();
      if (activeTab === 'packages') await loadPackages();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) loadActiveTab();
  }, [activeTab, user?.id]);

  const createRecord = async () => {
    const payload = {
      ...recordForm,
      amount: Number(recordForm.amount || 0),
      org_id: recordForm.org_id || null,
      user_id: recordForm.user_id || null,
    };
    const resp = await fetch(buildApiUrl('/api/admin/billing/records'), { method: 'POST', headers: authHeaders, body: JSON.stringify(payload) });
    if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || 'Failed to create record');
    setShowCreateRecord(false);
    await loadRecords();
  };

  const createInvoice = async () => {
    const payload = {
      org_id: invoiceForm.org_id,
      items: invoiceForm.items.map((it) => ({ description: it.description, quantity: Number(it.quantity || 0), unit_price: Number(it.unit_price || 0) })),
    };
    const resp = await fetch(buildApiUrl('/api/admin/billing/invoices'), { method: 'POST', headers: authHeaders, body: JSON.stringify(payload) });
    if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || 'Failed to create invoice');
    setShowCreateInvoice(false);
    await loadInvoices();
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
    const payload = {
      ...packageForm,
      base_monthly_cost: Number(packageForm.base_monthly_cost || 0),
      included_minutes: Number(packageForm.included_minutes || 0),
      included_sms: Number(packageForm.included_sms || 0),
      overage_minute_cost: Number(packageForm.overage_minute_cost || 0),
      overage_sms_cost: Number(packageForm.overage_sms_cost || 0),
    };
    const resp = await fetch(buildApiUrl('/api/admin/billing-packages'), { method: 'POST', headers: authHeaders, body: JSON.stringify(payload) });
    if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || 'Failed to create package');
    setShowCreatePackage(false);
    await loadPackages();
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
      {activeTab === 'records' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowCreateRecord(true)} className="px-4 py-2 rounded bg-cyan-600 text-white text-sm">Create Record</button>
          </div>
          {loading ? <div className="text-slate-400 text-sm">Loading...</div> : (
            <div className="space-y-2">
              {records.map((r) => (
                <div key={r.id} className="bg-slate-800 border border-slate-700 rounded p-3 flex items-center justify-between">
                  <div>
                    <div className="text-white text-sm font-semibold">{r.description}</div>
                    <div className="text-slate-400 text-xs">{r.type} � {r.status} � {new Date(r.created_at).toLocaleDateString()}</div>
                  </div>
                  <div className="text-cyan-300 text-sm font-semibold">{r.currency} {Number(r.amount || 0).toFixed(2)}</div>
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
                    <div className="text-slate-400 text-xs">{inv.status} � {new Date(inv.created_at).toLocaleDateString()}</div>
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
                    <div className="text-slate-400 text-xs">{p.description || '-'} � {p.is_active === false ? 'inactive' : 'active'}</div>
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
            <input className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white text-sm" placeholder="Org ID (optional)" value={recordForm.org_id} onChange={(e) => setRecordForm({ ...recordForm, org_id: e.target.value })} />
            <input className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white text-sm" placeholder="User ID (optional)" value={recordForm.user_id} onChange={(e) => setRecordForm({ ...recordForm, user_id: e.target.value })} />
            <input className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white text-sm col-span-2" placeholder="Description" value={recordForm.description} onChange={(e) => setRecordForm({ ...recordForm, description: e.target.value })} />
            <select className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white text-sm" value={recordForm.type} onChange={(e) => setRecordForm({ ...recordForm, type: e.target.value })}><option value="subscription">subscription</option><option value="one_time">one_time</option><option value="usage">usage</option><option value="refund">refund</option></select>
            <input className="px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white text-sm" placeholder="Amount" type="number" step="0.01" value={recordForm.amount} onChange={(e) => setRecordForm({ ...recordForm, amount: e.target.value })} />
          </div>
          <div className="flex gap-2 mt-4 justify-end">
            <button onClick={() => setShowCreateRecord(false)} className="px-4 py-2 rounded bg-slate-700 text-slate-200 text-sm">Cancel</button>
            <button onClick={async () => { try { await createRecord(); } catch (e: any) { alert(e?.message || 'Failed'); } }} className="px-4 py-2 rounded bg-cyan-600 text-white text-sm">Create</button>
          </div>
        </Modal>
      )}

      {showCreateInvoice && (
        <Modal>
          <h3 className="text-white text-lg font-semibold mb-4">Create Invoice</h3>
          <div className="space-y-3">
            <input className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 text-white text-sm" placeholder="Org ID" value={invoiceForm.org_id} onChange={(e) => setInvoiceForm({ ...invoiceForm, org_id: e.target.value })} />
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
            <button onClick={async () => { try { await createInvoice(); } catch (e: any) { alert(e?.message || 'Failed'); } }} className="px-4 py-2 rounded bg-cyan-600 text-white text-sm">Create</button>
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
          </div>
          <div className="flex gap-2 mt-4 justify-end">
            <button onClick={() => setShowCreatePackage(false)} className="px-4 py-2 rounded bg-slate-700 text-slate-200 text-sm">Cancel</button>
            <button onClick={async () => { try { await createPackage(); } catch (e: any) { alert(e?.message || 'Failed'); } }} className="px-4 py-2 rounded bg-cyan-600 text-white text-sm">Create</button>
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
};

export default AdminBillingPageV2;
