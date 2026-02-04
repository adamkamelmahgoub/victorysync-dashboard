import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import AdminLayout from '../../components/AdminLayout';
import { buildApiUrl } from '../../config';
import { useRealtimeSubscription } from '../../lib/realtimeSubscriptions';

interface BillingRecord {
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
}

interface Invoice {
  id: string;
  org_id: string;
  invoice_number: string;
  subtotal: number;
  tax: number;
  total: number;
  status: string;
  created_at: string;
  invoice_items?: any[];
}

// KPI Card Component
const KPICard: React.FC<{ label: string; value: string | number; color?: string }> = ({ label, value, color = 'cyan' }) => {
  const colorStyles: Record<string, { border: string; text: string }> = {
    cyan: { border: 'hover:border-cyan-500', text: 'text-cyan-400' },
    yellow: { border: 'hover:border-yellow-500', text: 'text-yellow-400' },
    blue: { border: 'hover:border-blue-500', text: 'text-blue-400' },
    green: { border: 'hover:border-green-500', text: 'text-green-400' },
  };
  const style = colorStyles[color] || colorStyles.cyan;
  return (
    <div className={`bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700 ${style.border} transition-all`}>
      <p className="text-slate-400 text-sm font-medium">{label}</p>
      <p className={`text-3xl font-bold mt-2 ${style.text}`}>{value}</p>
    </div>
  );
};

// Record Item Component
const RecordItem: React.FC<{ record: BillingRecord; onDelete?: (id: string) => void }> = ({ record, onDelete }) => (
  <div className="bg-slate-800 rounded-lg p-4 border border-slate-700 hover:border-slate-600 transition-all">
    <div className="flex justify-between items-start">
      <div className="flex-1">
        <p className="font-semibold text-white">{record.description}</p>
        <p className="text-sm text-slate-400 mt-1">
          Type: <span className="text-slate-300">{record.type}</span>
        </p>
        <p className="text-sm text-slate-400">
          Status: <span className={`font-medium ${record.status === 'paid' ? 'text-green-400' : 'text-yellow-400'}`}>{record.status}</span>
        </p>
      </div>
      <div className="text-right">
        <p className="text-2xl font-bold text-cyan-400">{record.currency} {record.amount.toFixed(2)}</p>
        <p className="text-xs text-slate-500 mt-2">{new Date(record.created_at).toLocaleDateString()}</p>
      </div>
    </div>
  </div>
);

// Invoice Item Component
const InvoiceItem: React.FC<{ invoice: Invoice }> = ({ invoice }) => (
  <div className="bg-slate-800 rounded-lg p-4 border border-slate-700 hover:border-slate-600 transition-all">
    <div className="flex justify-between items-start">
      <div className="flex-1">
        <p className="font-semibold text-white">{invoice.invoice_number}</p>
        <p className="text-sm text-slate-400 mt-1">
          Items: <span className="text-slate-300">{invoice.invoice_items?.length || 0}</span>
        </p>
        <p className="text-sm text-slate-400">
          Status: <span className={`font-medium ${invoice.status === 'paid' ? 'text-green-400' : invoice.status === 'draft' ? 'text-blue-400' : 'text-yellow-400'}`}>{invoice.status}</span>
        </p>
      </div>
      <div className="text-right">
        <p className="text-2xl font-bold text-cyan-400">${invoice.total.toFixed(2)}</p>
        <p className="text-xs text-slate-500 mt-2">{new Date(invoice.created_at).toLocaleDateString()}</p>
      </div>
    </div>
  </div>
);

// Create Record Modal
const CreateRecordModal: React.FC<{ onClose: () => void; onSubmit: (data: any) => Promise<void>; orgOptions?: Array<{id:string;name:string}>; userOptions?: Array<{id:string;email?:string;display_name?:string}> }> = ({ onClose, onSubmit, orgOptions = [], userOptions = [] }) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    org_id: '',
    user_id: '',
    type: 'subscription',
    description: '',
    amount: '',
    currency: 'USD'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Validate optional UUID fields
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (formData.org_id && !uuidRe.test(formData.org_id)) {
        alert('Organization ID must be a valid UUID or left blank');
        setLoading(false);
        return;
      }
      if (formData.user_id && !uuidRe.test(formData.user_id)) {
        alert('User ID must be a valid UUID or left blank');
        setLoading(false);
        return;
      }
      const amountNum = parseFloat(formData.amount);
      if (!isFinite(amountNum) || amountNum < 0) {
        alert('Amount must be a valid non-negative number');
        setLoading(false);
        return;
      }

      await onSubmit({
        ...formData,
        amount: amountNum
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-900 rounded-xl border border-slate-700 p-8 max-w-md w-full mx-4">
        <h3 className="text-xl font-bold text-white mb-6">Create Billing Record</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Description *</label>
            <input
              type="text"
              required
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
              placeholder="e.g., Monthly subscription"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Type *</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
            >
              <option value="subscription">Subscription</option>
              <option value="one_time">One-time</option>
              <option value="usage">Usage</option>
              <option value="refund">Refund</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Amount *</label>
            <input
              type="number"
              step="0.01"
              required
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
              placeholder="0.00"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Organization</label>
              <select
                value={formData.org_id}
                onChange={(e) => setFormData({ ...formData, org_id: e.target.value })}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
              >
                <option value="">(None)</option>
                {orgOptions.map(o => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">User</label>
              <select
                value={formData.user_id}
                onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
              >
                <option value="">(None)</option>
                {userOptions.map(u => (
                  <option key={u.id} value={u.id}>{u.display_name || u.email || u.id}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-lg font-medium hover:from-cyan-700 hover:to-blue-700 disabled:opacity-50 transition-all"
            >
              {loading ? 'Creating...' : 'Create Record'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-slate-800 text-slate-300 rounded-lg font-medium hover:bg-slate-700 transition-all"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const AdminBillingPageV2: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'records' | 'invoices'>('records');
  const [billingRecords, setBillingRecords] = useState<BillingRecord[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateRecord, setShowCreateRecord] = useState(false);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [pendingAmount, setPendingAmount] = useState(0);
  const [orgOptions, setOrgOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [userOptions, setUserOptions] = useState<Array<{ id: string; email?: string; display_name?: string }>>([]);

  const loadData = async () => {
    if (activeTab === 'records') {
      await loadBillingRecords();
    } else {
      await loadInvoices();
    }
  };

  useEffect(() => {
    loadData();
    // load orgs and users for pickers
    (async () => {
      try {
        const resp = await fetch(buildApiUrl('/api/admin/orgs'), { headers: { 'x-user-id': user?.id || '', 'x-dev-bypass': 'true' } });
        if (resp.ok) {
          const j = await resp.json();
          setOrgOptions((j.orgs || []).map((o: any) => ({ id: o.id, name: o.name })));
        }
      } catch (e) {}
      try {
        const resp2 = await fetch(buildApiUrl('/api/admin/users'), { headers: { 'x-user-id': user?.id || '' } });
        if (resp2.ok) {
          const j2 = await resp2.json();
          setUserOptions((j2.users || []).map((u: any) => ({ id: u.id, email: u.email, display_name: u.display_name })));
        }
      } catch (e) {}
    })();
  }, [activeTab]);

  // Subscribe to realtime billing record updates
  useRealtimeSubscription(
    'billing_records',
    null,
    () => {
      console.log('[Realtime] Billing record created - refreshing...');
      if (activeTab === 'records') {
        setTimeout(() => loadBillingRecords(), 500);
      }
    },
    () => {
      console.log('[Realtime] Billing record updated - refreshing...');
      if (activeTab === 'records') {
        setTimeout(() => loadBillingRecords(), 500);
      }
    },
    () => {
      console.log('[Realtime] Billing record deleted - refreshing...');
      if (activeTab === 'records') {
        setTimeout(() => loadBillingRecords(), 500);
      }
    }
  );
  // Subscribe to realtime invoice updates
  useRealtimeSubscription(
    'invoices',
    null,
    () => {
      console.log('[Realtime] Invoice created - refreshing...');
      if (activeTab === 'invoices') {
        setTimeout(() => loadInvoices(), 500);
      }
    },
    () => {
      console.log('[Realtime] Invoice updated - refreshing...');
      if (activeTab === 'invoices') {
        setTimeout(() => loadInvoices(), 500);
      }
    },
    () => {
      console.log('[Realtime] Invoice deleted - refreshing...');
      if (activeTab === 'invoices') {
        setTimeout(() => loadInvoices(), 500);
      }
    }
  );

  const loadBillingRecords = async () => {
    const devAsAdmin = (import.meta as any)?.env?.DEV && new URLSearchParams(window.location.search).get('asAdmin') === 'true';
    const effectiveUserId = devAsAdmin ? ((import.meta as any).env.VITE_DEV_ADMIN_ID || user?.id || '') : (user?.id || '');

    const response = await fetch(buildApiUrl('/api/admin/billing/records'), {
      headers: { 'x-user-id': effectiveUserId }
    });
    if (response.ok) {
      const data = await response.json();
      setBillingRecords(data.records || []);
      
      // Calculate totals
      const revenue = (data.records || []).reduce((sum: number, r: BillingRecord) => sum + r.amount, 0);
      const pending = (data.records || []).reduce((sum: number, r: BillingRecord) => r.status !== 'paid' ? sum + r.amount : sum, 0);
      setTotalRevenue(revenue);
      setPendingAmount(pending);
    }
  };

  const loadInvoices = async () => {
    const devAsAdmin = (import.meta as any)?.env?.DEV && new URLSearchParams(window.location.search).get('asAdmin') === 'true';
    const effectiveUserId = devAsAdmin ? ((import.meta as any).env.VITE_DEV_ADMIN_ID || user?.id || '') : (user?.id || '');

    const response = await fetch(buildApiUrl('/api/admin/billing/invoices'), {
      headers: { 'x-user-id': effectiveUserId }
    });
    if (response.ok) {
      const data = await response.json();
      setInvoices(data.invoices || []);
    }
  };

  const handleCreateRecord = async (recordData: any) => {
    try {
      const devAsAdmin = (import.meta as any)?.env?.DEV && new URLSearchParams(window.location.search).get('asAdmin') === 'true';
      const effectiveUserId = devAsAdmin ? ((import.meta as any).env.VITE_DEV_ADMIN_ID || user?.id || '') : (user?.id || '');

      const response = await fetch(buildApiUrl('/api/admin/billing/records'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': effectiveUserId },
        body: JSON.stringify(recordData)
      });

      const data = await response.json();
      if (!response.ok) {
        alert(`Error: ${data.error || 'Failed to create billing record'}`);
        return;
      }

      setShowCreateRecord(false);
      await loadBillingRecords();
      alert('Billing record created successfully!');
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : 'Failed to create billing record'}`);
    }
  };

  return (
    <AdminLayout
      title="Billing Management"
      subtitle="Manage billing records and invoices"
      tabs={[
        { id: 'records', label: 'Billing Records' },
        { id: 'invoices', label: 'Invoices' }
      ]}
      activeTab={activeTab}
      onTabChange={(tabId: string) => setActiveTab(tabId as 'records' | 'invoices')}
    >
      {activeTab === 'records' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <KPICard label="Total Revenue" value={`$${totalRevenue.toFixed(2)}`} color="cyan" />
            <KPICard label="Pending Amount" value={`$${pendingAmount.toFixed(2)}`} color="yellow" />
            <KPICard label="Total Records" value={billingRecords.length} color="blue" />
          </div>

          {/* Create Button */}
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-semibold text-white">All Billing Records</h2>
            <button
              onClick={() => setShowCreateRecord(true)}
              className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-cyan-600 text-white rounded-lg font-semibold text-xs hover:from-emerald-500 hover:to-cyan-500 transition"
            >
              Create Record
            </button>
          </div>

          {/* Records List */}
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-emerald-500 mx-auto mb-4"></div>
              <p className="text-slate-400 text-xs">Loading records...</p>
            </div>
          ) : billingRecords.length > 0 ? (
            <div className="space-y-3">
              {billingRecords.map((record) => (
                <RecordItem key={record.id} record={record} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-slate-800/30 rounded-lg border border-slate-700/50">
              <p className="text-slate-400 text-xs">No billing records yet</p>
            </div>
          )}

          {showCreateRecord && (
            <CreateRecordModal
              onClose={() => setShowCreateRecord(false)}
              onSubmit={handleCreateRecord}
              orgOptions={orgOptions}
              userOptions={userOptions}
            />
          )}
        </div>
      )}

      {activeTab === 'invoices' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <KPICard label="Total Invoices" value={invoices.length} color="cyan" />
            <KPICard label="Total Amount" value={`$${invoices.reduce((sum, inv) => sum + inv.total, 0).toFixed(2)}`} color="green" />
            <KPICard label="Draft Invoices" value={invoices.filter(i => i.status === 'draft').length} color="blue" />
          </div>

          {/* Invoices List */}
          <h2 className="text-sm font-semibold text-white">All Invoices</h2>
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-emerald-500 mx-auto mb-4"></div>
              <p className="text-slate-400 text-xs">Loading invoices...</p>
            </div>
          ) : invoices.length > 0 ? (
            <div className="space-y-3">
              {invoices.map((invoice) => (
                <InvoiceItem key={invoice.id} invoice={invoice} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-slate-800/30 rounded-lg border border-slate-700/50">
              <p className="text-slate-400 text-xs">No invoices yet</p>
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
};

export default AdminBillingPageV2;
