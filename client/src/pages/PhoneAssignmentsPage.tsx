import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { PageLayout } from '../components/PageLayout';
import { buildApiUrl } from '../config';

export function PhoneAssignmentsPage() {
  const { user, selectedOrgId } = useAuth();
  const [phones, setPhones] = useState<any[]>([]);
  const [assignedPhones, setAssignedPhones] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (selectedOrgId) {
      fetchPhones();
    }
  }, [selectedOrgId]);

  const fetchPhones = async () => {
    if (!selectedOrgId || !user) return;
    setLoading(true);
    setMessage(null);
    try {
      // Fetch all available phone numbers for this org
      const response = await fetch(buildApiUrl(`/api/orgs/${selectedOrgId}/phone-numbers`), {
        headers: { 'x-user-id': user.id }
      });
      if (response.ok) {
        const data = await response.json();
        setPhones(data.phone_numbers || data.numbers || []);
        setAssignedPhones(data.phone_numbers?.map((p: any) => p.id) || []);
      } else {
        setMessage('Failed to fetch phone numbers');
      }
    } catch (err: any) {
      setMessage(err?.message || 'Error fetching phones');
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneToggle = (phoneId: string) => {
    setAssignedPhones(prev => {
      if (prev.includes(phoneId)) {
        return prev.filter(id => id !== phoneId);
      } else {
        return [...prev, phoneId];
      }
    });
  };

  const handleSave = async () => {
    if (!selectedOrgId || !user) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(buildApiUrl(`/api/admin/orgs/${selectedOrgId}/phone-numbers`), {
        method: 'POST',
        headers: {
          'x-user-id': user.id,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ phoneNumberIds: assignedPhones })
      });
      
      if (response.ok) {
        const data = await response.json();
        setMessage(`✓ Successfully assigned ${data.assigned} phone number(s) to this organization`);
        setTimeout(() => setMessage(null), 3000);
      } else {
        const error = await response.json();
        setMessage(`Failed: ${error.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      setMessage(err?.message || 'Error saving assignments');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageLayout title="Phone Assignments" description="Assign phone numbers to organizations">
      <div className="space-y-6">
        {!selectedOrgId ? (
          <div className="bg-slate-900/80 rounded-xl p-8 ring-1 ring-slate-800 text-center">
            <p className="text-slate-300">No organization selected</p>
            <p className="text-sm text-slate-500 mt-2">Select an organization from the admin panel to manage phone assignments.</p>
          </div>
        ) : (
          <>
            <div className="bg-slate-900/80 rounded-xl p-6 ring-1 ring-slate-800">
              <h2 className="text-lg font-semibold text-white mb-4">Assign Phone Numbers to Organization</h2>
              
              {message && (
                <div className={`mb-4 p-4 rounded-lg border ${
                  message.startsWith('✓') 
                    ? 'bg-emerald-900/40 border-emerald-700 text-emerald-300'
                    : 'bg-red-900/40 border-red-700 text-red-300'
                }`}>
                  <p className="text-sm">{message}</p>
                </div>
              )}

              {loading ? (
                <div className="p-8 text-center">
                  <p className="text-slate-400">Loading phone numbers...</p>
                </div>
              ) : phones.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-slate-400">No phone numbers available.</p>
                  <p className="text-sm text-slate-500 mt-2">Sync phone numbers from MightyCall first using the admin panel.</p>
                </div>
              ) : (
                <>
                  <div className="space-y-3 mb-6">
                    {phones.map((phone: any) => (
                      <label key={phone.id} className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-slate-600 cursor-pointer transition">
                        <input 
                          type="checkbox" 
                          checked={assignedPhones.includes(phone.id)}
                          onChange={() => handlePhoneToggle(phone.id)}
                          className="w-4 h-4 rounded bg-slate-700 border-slate-600 cursor-pointer"
                        />
                        <div className="flex-1">
                          <p className="font-medium text-white text-sm">{phone.number}</p>
                          {phone.label && (
                            <p className="text-xs text-slate-400">{phone.label}</p>
                          )}
                        </div>
                        <span className="px-2 py-1 rounded text-xs font-medium bg-slate-700 text-slate-300">
                          {assignedPhones.includes(phone.id) ? 'Assigned' : 'Unassigned'}
                        </span>
                      </label>
                    ))}
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex-1 px-4 py-3 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-700 hover:to-cyan-700 disabled:from-slate-600 disabled:to-slate-700 text-white rounded-lg font-semibold transition duration-200"
                    >
                      {saving ? 'Saving...' : 'Save Assignments'}
                    </button>
                    <button
                      onClick={fetchPhones}
                      disabled={loading}
                      className="px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition duration-200"
                    >
                      Refresh
                    </button>
                  </div>

                  <div className="mt-4 p-4 bg-blue-900/20 border border-blue-800/50 rounded-lg">
                    <p className="text-sm text-blue-300">
                      <span className="font-semibold">Tip:</span> Selecting a phone number restricts recordings view to calls from/to that number. Assign multiple numbers to give org members access to those specific phone lines.
                    </p>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </PageLayout>
  );
}

export default PhoneAssignmentsPage;
