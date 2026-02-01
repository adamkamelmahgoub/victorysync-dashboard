import * as React from 'react';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

interface PhoneNumber {
  id: string;
  number: string;
  e164?: string | null;
  number_digits?: string | null;
  label: string | null;
  is_active: boolean;
  created_at: string;
}

interface PhoneNumberRequest {
  id: string;
  requested_number: string;
  requested_label?: string | null;
  reason?: string | null;
  status?: string | null;
  created_at?: string | null;
}

export default function PhoneNumbersTab({ orgId }: { orgId: string }) {
  const [numbers, setNumbers] = useState<PhoneNumber[]>([]);
  const [requests, setRequests] = useState<PhoneNumberRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newNumber, setNewNumber] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [adding, setAdding] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestForm, setRequestForm] = useState({
    requested_number: '',
    requested_label: '',
    reason: ''
  });
  const [submittingRequest, setSubmittingRequest] = useState(false);

  useEffect(() => {
    fetchNumbers();
    fetchRequests();
    // eslint-disable-next-line
  }, [orgId]);

  async function fetchRequests() {
    // Placeholder: many deployments don't have a requests table yet; return empty list
    setRequests([]);
  }

  async function fetchNumbers() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('phone_numbers')
      .select('id, number, label, created_at, status')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    if (error) setError(error.message);
    else setNumbers(data || []);
    setLoading(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    const { error: insertErr } = await supabase.from('phone_numbers').insert({
      org_id: orgId,
      number: newNumber,
      e164: newNumber,
      number_digits: newNumber.replace(/[^0-9]/g, ''),
      label: newLabel || null,
      is_active: true,
    });
    if (insertErr) setError(insertErr.message);
    setNewNumber('');
    setNewLabel('');
    setAdding(false);
    fetchNumbers();
  }

  async function handleToggleActive(id: string, isActive: boolean) {
    await supabase.from('phone_numbers').update({ is_active: !isActive }).eq('id', id);
    fetchNumbers();
  }

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold mb-4">Phone Numbers</h2>
      <form onSubmit={handleAdd} className="mb-6 flex gap-2 items-end">
        <div>
          <label className="block text-xs font-semibold mb-1">Phone Number</label>
          <input
            className="p-2 rounded bg-gray-900 border border-gray-700"
            value={newNumber}
            onChange={e => setNewNumber(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">Label</label>
          <input
            className="p-2 rounded bg-gray-900 border border-gray-700"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
          />
        </div>
        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          disabled={adding}
        >
          {adding ? 'Adding...' : 'Add'}
        </button>
      </form>
      {error && <div className="text-red-500 mb-2">{error}</div>}
      {loading ? (
        <div>Loading...</div>
      ) : (
        <table className="w-full text-left bg-gray-900 rounded">
          <thead>
            <tr>
              <th className="p-2">Phone Number</th>
              <th className="p-2">Label</th>
              <th className="p-2">Active</th>
              <th className="p-2">Created</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {numbers.map(num => (
              <tr key={num.id} className="border-t border-gray-800">
                <td className="p-2">{num.number}</td>
                <td className="p-2">{num.label || '-'}</td>
                <td className="p-2">
                  <button
                    className={`px-2 py-1 rounded ${num.is_active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-700 text-gray-400'}`}
                    onClick={() => handleToggleActive(num.id, num.is_active)}
                  >
                    {num.is_active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="p-2">{new Date(num.created_at).toLocaleDateString()}</td>
                <td className="p-2"></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
