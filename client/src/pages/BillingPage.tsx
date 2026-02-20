import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { PageLayout } from '../components/PageLayout';
import { buildApiUrl } from '../config';

type BillingOverview = {
  org_id: string | null;
  next_due_date: string | null;
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

export default function BillingPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);

  const totalBilled = useMemo(() => invoices.reduce((acc, i) => acc + Number(i.total_amount ?? i.total ?? 0), 0), [invoices]);

  const loadData = async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const headers = { 'x-user-id': user.id };
      const [ovRes, invRes] = await Promise.all([
        fetch(buildApiUrl('/api/client/billing/overview'), { headers }),
        fetch(buildApiUrl('/api/client/billing/invoices?limit=5000'), { headers }),
      ]);

      if (!ovRes.ok) throw new Error('Failed to load billing overview');
      if (!invRes.ok) throw new Error('Failed to load invoices');

      const ov = await ovRes.json();
      const inv = await invRes.json();
      setOverview(ov);
      setInvoices(inv.invoices || []);
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
        {error && <div className="rounded border border-rose-600/40 bg-rose-900/20 p-3 text-sm text-rose-200">{error}</div>}

        <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="vs-surface p-4">
            <div className="text-xs text-slate-400">Current Package</div>
            <div className="text-xl text-white font-bold mt-1">{overview?.package?.name || 'No package assigned'}</div>
            <div className="text-xs text-slate-400 mt-1">{overview?.package?.description || '-'}</div>
          </div>
          <div className="vs-surface p-4">
            <div className="text-xs text-slate-400">Next Due Date</div>
            <div className="text-xl text-cyan-300 font-bold mt-1">{overview?.next_due_date ? new Date(overview.next_due_date).toLocaleDateString() : '-'}</div>
          </div>
          <div className="vs-surface p-4">
            <div className="text-xs text-slate-400">Invoice Total</div>
            <div className="text-xl text-white font-bold mt-1">${totalBilled.toFixed(2)}</div>
          </div>
        </section>

        <section className="vs-surface p-0 overflow-hidden">
          <div className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-200 flex items-center justify-between">
            <span>Invoices</span>
            <button onClick={loadData} disabled={loading} className="rounded bg-cyan-600 px-3 py-1 text-xs text-white disabled:opacity-60">{loading ? 'Refreshing...' : 'Refresh'}</button>
          </div>
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="text-left py-2 px-3">Invoice</th>
                  <th className="text-left py-2 px-3">Status</th>
                  <th className="text-left py-2 px-3">Created</th>
                  <th className="text-left py-2 px-3">Total</th>
                  <th className="text-left py-2 px-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-800/40">
                    <td className="px-3 py-2 text-slate-200">{inv.invoice_number || inv.id}</td>
                    <td className="px-3 py-2 text-slate-300">{inv.status || '-'}</td>
                    <td className="px-3 py-2 text-slate-400">{inv.created_at ? new Date(inv.created_at).toLocaleDateString() : '-'}</td>
                    <td className="px-3 py-2 text-cyan-300">${Number(inv.total_amount ?? inv.total ?? 0).toFixed(2)}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => exportInvoice(inv.id)} className="rounded border border-cyan-600/60 bg-cyan-900/20 px-2 py-1 text-xs text-cyan-200">Export CSV</button>
                    </td>
                  </tr>
                ))}
                {invoices.length === 0 && (
                  <tr>
                    <td className="px-3 py-6 text-slate-400" colSpan={5}>No invoices found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </PageLayout>
  );
}
