import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE_URL, buildApiUrl } from '../../config';

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
  tax_amount: number;
  total_amount: number;
  status: string;
  created_at: string;
  invoice_items?: any[];
}

export const AdminBillingPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'records' | 'invoices'>('records');
  const [billingRecords, setBillingRecords] = useState<BillingRecord[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateRecord, setShowCreateRecord] = useState(false);
  const [showCreateInvoice, setShowCreateInvoice] = useState(false);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'records') {
        await loadBillingRecords();
      } else {
        await loadInvoices();
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadBillingRecords = async () => {
    const response = await fetch(buildApiUrl('/api/admin/billing/records'), {
      headers: { 'x-user-id': user?.id || '' }
    });
    if (response.ok) {
      const data = await response.json();
      setBillingRecords(data.records || []);
    }
  };

  const loadInvoices = async () => {
    const response = await fetch(buildApiUrl('/api/admin/billing/invoices'), {
      headers: { 'x-user-id': user?.id || '' }
    });
    if (response.ok) {
      const data = await response.json();
      setInvoices(data.invoices || []);
    }
  };

  const handleCreateBillingRecord = async (recordData: any) => {
    try {
      const response = await fetch(buildApiUrl('/api/admin/billing/records'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user?.id || '' },
        body: JSON.stringify(recordData)
      });

      const data = await response.json();
      if (!response.ok) {
        alert(`Error: ${data.error || 'Failed to create billing record'}\n${data.detail || ''}`);
        console.error('Error creating billing record:', data);
        return;
      }

      setShowCreateRecord(false);
      await loadBillingRecords();
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : 'Failed to create billing record'}`);
      console.error('Error creating billing record:', error);
    }
  };

  const handleCreateInvoice = async (invoiceData: any) => {
    try {
      const response = await fetch(buildApiUrl('/api/admin/billing/invoices'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user?.id || '' },
        body: JSON.stringify(invoiceData)
      });

      const data = await response.json();
      if (!response.ok) {
        alert(`Error: ${data.error || 'Failed to create invoice'}\n${data.detail || ''}`);
        console.error('Error creating invoice:', data);
        return;
      }

      setShowCreateInvoice(false);
      await loadInvoices();
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : 'Failed to create invoice'}`);
      console.error('Error creating invoice:', error);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate('/admin/operations')}
            className="py-2 px-3 rounded text-sm text-slate-300 hover:text-emerald-400 transition"
          >
            ← Back to Admin
          </button>
          <h1 className="text-2xl font-semibold">Billing Management</h1>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 mb-6">
          <button
            onClick={() => setActiveTab('records')}
            className={`px-4 py-2 rounded-t-lg font-medium ${
              activeTab === 'records'
                ? 'bg-slate-800 text-emerald-400 border-b-2 border-emerald-400'
                : 'bg-slate-900 text-slate-400 hover:text-slate-300'
            }`}
          >
            Billing Records
          </button>
          <button
            onClick={() => setActiveTab('invoices')}
            className={`px-4 py-2 rounded-t-lg font-medium ${
              activeTab === 'invoices'
                ? 'bg-slate-800 text-emerald-400 border-b-2 border-emerald-400'
                : 'bg-slate-900 text-slate-400 hover:text-slate-300'
            }`}
          >
            Invoices
          </button>
        </div>

        {/* Content */}
        <div className="bg-slate-900 rounded-lg p-6">
          {activeTab === 'records' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium">Billing Records</h2>
                <button
                  onClick={() => setShowCreateRecord(true)}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
                >
                  Create Record
                </button>
              </div>

              {loading ? (
                <div>Loading...</div>
              ) : (
                <div className="space-y-2">
                  {billingRecords.map((record) => (
                    <div key={record.id} className="flex items-center justify-between p-4 bg-slate-800 rounded">
                      <div>
                        <p className="font-medium">{record.description}</p>
                        <p className="text-sm text-slate-400">
                          {record.type} • {record.currency} {record.amount} • {record.status}
                        </p>
                        <p className="text-xs text-slate-500">
                          {new Date(record.billing_date).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{record.currency} {record.amount}</p>
                        <p className="text-sm text-slate-400 capitalize">{record.status}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'invoices' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium">Invoices</h2>
                <button
                  onClick={() => setShowCreateInvoice(true)}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
                >
                  Create Invoice
                </button>
              </div>

              {loading ? (
                <div>Loading...</div>
              ) : (
                <div className="space-y-2">
                  {invoices.map((invoice) => (
                    <div key={invoice.id} className="flex items-center justify-between p-4 bg-slate-800 rounded">
                      <div>
                        <p className="font-medium">{invoice.invoice_number}</p>
                        <p className="text-sm text-slate-400">
                          {invoice.status} • Created {new Date(invoice.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{invoice.total_amount} USD</p>
                        <p className="text-sm text-slate-400">Subtotal: {invoice.subtotal} USD</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Create Billing Record Modal */}
        {showCreateRecord && (
          <CreateBillingRecordModal
            onClose={() => setShowCreateRecord(false)}
            onSubmit={handleCreateBillingRecord}
          />
        )}

        {/* Create Invoice Modal */}
        {showCreateInvoice && (
          <CreateInvoiceModal
            onClose={() => setShowCreateInvoice(false)}
            onSubmit={handleCreateInvoice}
          />
        )}
      </div>
    </main>
  );
};

// Create Billing Record Modal Component
function CreateBillingRecordModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (data: any) => void }) {
  const [formData, setFormData] = useState({
    org_id: '',
    user_id: '',
    type: 'subscription',
    description: '',
    amount: '',
    currency: 'USD'
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      amount: parseFloat(formData.amount)
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-slate-900 p-6 rounded-lg max-w-md w-full mx-4">
        <h3 className="text-lg font-medium mb-4">Create Billing Record</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Organization ID</label>
            <input
              type="text"
              value={formData.org_id}
              onChange={(e) => setFormData({ ...formData, org_id: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md"
              placeholder="Optional"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">User ID</label>
            <input
              type="text"
              value={formData.user_id}
              onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md"
              placeholder="Optional"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md"
            >
              <option value="subscription">Subscription</option>
              <option value="one_time">One-time</option>
              <option value="usage">Usage</option>
              <option value="refund">Refund</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Amount</label>
            <input
              type="number"
              step="0.01"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md"
              required
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
            >
              Create
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-600"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Create Invoice Modal Component
function CreateInvoiceModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (data: any) => void }) {
  const [formData, setFormData] = useState({
    org_id: '',
    billing_period_start: '',
    billing_period_end: '',
    items: [{ description: '', quantity: 1, unit_price: 0 }],
    notes: ''
  });

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { description: '', quantity: 1, unit_price: 0 }]
    });
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setFormData({ ...formData, items: newItems });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-slate-900 p-6 rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-medium mb-4">Create Invoice</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Organization ID</label>
            <input
              type="text"
              value={formData.org_id}
              onChange={(e) => setFormData({ ...formData, org_id: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Billing Period Start</label>
              <input
                type="date"
                value={formData.billing_period_start}
                onChange={(e) => setFormData({ ...formData, billing_period_start: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Billing Period End</label>
              <input
                type="date"
                value={formData.billing_period_end}
                onChange={(e) => setFormData({ ...formData, billing_period_end: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md"
                required
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium">Invoice Items</label>
              <button
                type="button"
                onClick={addItem}
                className="px-3 py-1 bg-slate-700 text-white rounded text-sm hover:bg-slate-600"
              >
                Add Item
              </button>
            </div>
            <div className="space-y-2">
              {formData.items.map((item, index) => (
                <div key={index} className="grid grid-cols-12 gap-2">
                  <div className="col-span-6">
                    <input
                      type="text"
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) => updateItem(index, 'description', e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md"
                      required
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md"
                      min="1"
                      required
                    />
                  </div>
                  <div className="col-span-3">
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Unit Price"
                      value={item.unit_price}
                      onChange={(e) => updateItem(index, 'unit_price', parseFloat(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md"
                      min="0"
                      required
                    />
                  </div>
                  <div className="col-span-1 flex items-center">
                    <span className="text-sm text-slate-400">
                      ${(item.quantity * item.unit_price).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md"
              rows={3}
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
            >
              Create Invoice
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-600"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}