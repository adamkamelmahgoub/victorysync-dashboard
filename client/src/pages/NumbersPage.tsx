import React, { FC, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { triggerMightyCallPhoneNumberSync } from '../lib/apiClient';
import { getOrgPhoneNumbers, syncPhoneNumbers } from '../lib/phonesApi';
import { PageLayout } from '../components/PageLayout';
import { EmptyStatePanel, MetricStatCard, SectionCard, StatusBadge } from '../components/DashboardPrimitives';
import { buildApiUrl } from '../config';

interface Recording {
  id: string;
  phone_number_id?: string;
  phone_number?: string;
  direction: 'inbound' | 'outbound';
  duration: number;
  status: string;
  started_at: string;
  recording_date?: string;
  recording_url?: string;
  from_number?: string;
  to_number?: string;
}

type PhoneNumberItem = {
  id: string;
  number?: string;
  phone_number?: string;
  label?: string | null;
  provider?: string | null;
  created_at?: string | null;
  orgId?: string | null;
  org_id?: string | null;
  is_active?: boolean | null;
  isActive?: boolean | null;
};

function normalizePhone(input?: string | null) {
  return String(input || '').replace(/[^\d+]/g, '').trim();
}

function formatDuration(seconds?: number) {
  const total = Math.max(0, Number(seconds || 0));
  const minutes = Math.floor(total / 60);
  const remaining = total % 60;
  return `${minutes}m ${remaining}s`;
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function getPhoneValue(item?: PhoneNumberItem | null) {
  return item?.number || item?.phone_number || '';
}

function matchesRecordingToPhone(recording: Recording, phone: PhoneNumberItem) {
  const phoneId = String(phone.id || '');
  const phoneValue = normalizePhone(getPhoneValue(phone));
  const candidates = [
    recording.phone_number_id,
    recording.phone_number,
    recording.from_number,
    recording.to_number,
  ].map(normalizePhone);

  return String(recording.phone_number_id || '') === phoneId || candidates.includes(phoneValue);
}

const NumbersPage: FC = () => {
  const { user, selectedOrgId, globalRole, orgs } = useAuth();
  const userId = user?.id;
  const isAdmin = globalRole === 'platform_admin' || (user?.user_metadata as any)?.global_role === 'platform_admin';

  const [numbers, setNumbers] = useState<PhoneNumberItem[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordingsLoading, setRecordingsLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [requestType, setRequestType] = useState('add');
  const [requestDetails, setRequestDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedPhoneId, setSelectedPhoneId] = useState<string | null>(null);

  const selectedPhone = useMemo(
    () => numbers.find((item) => item.id === selectedPhoneId) || null,
    [numbers, selectedPhoneId]
  );

  const selectedOrgName = selectedOrgId
    ? orgs.find((org) => org.id === selectedOrgId)?.name || 'Selected organization'
    : 'All organizations';

  const filteredRecordings = useMemo(() => {
    if (!selectedPhone) return recordings;
    return recordings.filter((recording) => matchesRecordingToPhone(recording, selectedPhone));
  }, [recordings, selectedPhone]);

  const summary = useMemo(() => {
    const activeCount = numbers.filter((item) => item.is_active !== false && item.isActive !== false).length;
    const recordingCount = filteredRecordings.length;
    const inboundCount = filteredRecordings.filter((item) => item.direction === 'inbound').length;
    const outboundCount = Math.max(recordingCount - inboundCount, 0);
    return { activeCount, recordingCount, inboundCount, outboundCount };
  }, [filteredRecordings, numbers]);

  const fetchNumbers = async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setMessage(null);

      let rows: PhoneNumberItem[] = [];
      if (isAdmin && !selectedOrgId) {
        const response = await fetch(buildApiUrl('/api/admin/phone-numbers'), {
          cache: 'no-store',
          headers: { 'x-user-id': userId },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.detail || 'Failed to load all phone numbers');
        rows = payload.phone_numbers || [];
      } else if (selectedOrgId) {
        rows = await getOrgPhoneNumbers(selectedOrgId, userId);
      }

      const normalized = (rows || []).map((row) => ({
        ...row,
        is_active: row.is_active ?? row.isActive ?? true,
      }));

      setNumbers(normalized);
      setSelectedPhoneId((previous) => {
        if (previous && normalized.some((row) => row.id === previous)) return previous;
        return normalized[0]?.id || null;
      });
    } catch (error) {
      console.error('Error fetching phone numbers:', error);
      setMessage('Failed to load phone numbers');
      setNumbers([]);
      setSelectedPhoneId(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecordings = async () => {
    if (!userId) {
      setRecordings([]);
      return;
    }

    const activeOrgId = selectedOrgId || selectedPhone?.orgId || selectedPhone?.org_id || null;
    if (!activeOrgId) {
      setRecordings([]);
      return;
    }

    try {
      setRecordingsLoading(true);
      const response = await fetch(buildApiUrl(`/api/recordings?org_id=${encodeURIComponent(activeOrgId)}&limit=500`), {
        headers: { 'x-user-id': userId },
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || payload.error || 'Failed to load recordings');
      }

      const data = await response.json();
      const normalized = (data.recordings || []).map((item: any) => ({
        ...item,
        direction: item.direction || (item.inbound ? 'inbound' : 'outbound'),
        status: item.status || 'completed',
        started_at: item.call_started_at || item.recording_date || item.started_at || new Date().toISOString(),
        duration: Number(item.duration || item.duration_seconds || 0),
        phone_number: item.phone_number || item.to_number || item.from_number || '',
      }));
      setRecordings(normalized);
    } catch (error) {
      console.error('Error fetching recordings:', error);
      setRecordings([]);
    } finally {
      setRecordingsLoading(false);
    }
  };

  useEffect(() => {
    fetchNumbers();
  }, [selectedOrgId, userId, isAdmin]);

  useEffect(() => {
    fetchRecordings();
  }, [selectedOrgId, selectedPhoneId, userId, numbers.length]);

  const handleSync = async () => {
    if (!userId) return;
    setSyncing(true);
    setMessage('Syncing phone numbers from MightyCall...');
    try {
      let result: any;
      if (selectedOrgId) {
        result = await syncPhoneNumbers(selectedOrgId, userId);
      } else {
        result = await triggerMightyCallPhoneNumberSync(userId);
      }
      const count = result.records_processed ?? result.records_synced ?? result.synced ?? result.upserted ?? 0;
      setMessage(`Synced ${count} phone numbers from MightyCall`);
      await fetchNumbers();
    } catch (err: any) {
      setMessage(err?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleRequestPhoneNumber = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!requestDetails.trim()) {
      alert('Please enter request details');
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch(buildApiUrl('/api/support/tickets'), {
        method: 'POST',
        headers: {
          'x-user-id': userId || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subject: `Phone Number Request: ${requestType}`,
          message: `Request Type: ${requestType}\n\nDetails:\n${requestDetails}`,
          priority: 'normal',
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        alert(`Error: ${errData.error || 'Failed to submit request'}`);
        return;
      }

      alert('Phone number request submitted successfully');
      setRequestType('add');
      setRequestDetails('');
    } catch (error) {
      console.error('Error submitting request:', error);
      alert('Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedPhoneValue = getPhoneValue(selectedPhone);
  const selectedPhoneOrgName = selectedPhone
    ? orgs.find((org) => org.id === (selectedPhone.orgId || selectedPhone.org_id))?.name || selectedOrgName
    : selectedOrgName;

  return (
    <PageLayout
      eyebrow="Phone operations"
      title="Phone numbers"
      description="Sync every available MightyCall number, review recordings by number, and keep number change requests organized."
      actions={
        <button onClick={handleSync} disabled={syncing} className="vs-button-primary">
          {syncing ? 'Syncing numbers...' : 'Sync all available numbers'}
        </button>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricStatCard label="Numbers" value={loading ? '...' : numbers.length} hint={selectedOrgName} />
          <MetricStatCard label="Available" value={summary.activeCount} hint="Ready for routing and assignment" accent="emerald" />
          <MetricStatCard label="Recordings" value={recordingsLoading ? '...' : summary.recordingCount} hint={selectedPhoneValue || 'Select a number'} accent="cyan" />
          <MetricStatCard label="Traffic Mix" value={`${summary.inboundCount}/${summary.outboundCount}`} hint="Inbound vs outbound recordings" accent="amber" />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px,1fr]">
          <div className="space-y-6">
            <SectionCard title="Sync inventory" description="Pull the latest MightyCall numbers into the workspace inventory.">
              <div className="space-y-4">
                <button onClick={handleSync} disabled={syncing} className="vs-button-primary w-full">
                  {syncing ? 'Syncing...' : 'Refresh number inventory'}
                </button>
                <div className="vs-surface-muted p-4 text-sm text-slate-400">
                  {message || 'Phone sync will pull every available number into the dashboard inventory.'}
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Request change" description="Capture provisioning, routing, and replacement requests without leaving the page.">
              <form onSubmit={handleRequestPhoneNumber} className="space-y-4">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Request Type</label>
                  <select value={requestType} onChange={(e) => setRequestType(e.target.value)} className="vs-input w-full">
                    <option value="add">Add phone number</option>
                    <option value="remove">Remove phone number</option>
                    <option value="replace">Replace phone number</option>
                    <option value="routing">Routing change</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Details</label>
                  <textarea
                    value={requestDetails}
                    onChange={(e) => setRequestDetails(e.target.value)}
                    placeholder="Describe the requested number change, routing need, or provisioning issue."
                    className="vs-input min-h-[180px] w-full resize-none"
                  />
                </div>
                <button type="submit" disabled={submitting} className="vs-button-primary w-full">
                  {submitting ? 'Submitting...' : 'Submit request'}
                </button>
              </form>
            </SectionCard>
          </div>

          <div className="space-y-6">
            <SectionCard
              title="Number inventory"
              description="Select a number to review its recordings, status, and routing context."
              actions={
                <div className="flex items-center gap-2">
                  <StatusBadge tone="info">{loading ? 'Loading' : `${numbers.length} numbers`}</StatusBadge>
                  <StatusBadge tone="neutral">{selectedOrgName}</StatusBadge>
                </div>
              }
            >
              {loading ? (
                <div className="text-sm text-slate-400">Loading phone numbers...</div>
              ) : numbers.length === 0 ? (
                <EmptyStatePanel
                  title="No phone numbers yet"
                  description="Sync MightyCall numbers to populate the workspace inventory and unlock recordings by number."
                />
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {numbers.map((item) => {
                    const active = item.is_active !== false && item.isActive !== false;
                    const value = getPhoneValue(item);
                    const isSelected = selectedPhoneId === item.id;
                    const orgName = orgs.find((org) => org.id === (item.orgId || item.org_id))?.name;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedPhoneId(item.id)}
                        className={`rounded-3xl border p-5 text-left transition ${
                          isSelected
                            ? 'border-cyan-400/30 bg-cyan-400/[0.07]'
                            : 'border-white/8 bg-white/[0.03] hover:border-white/14 hover:bg-white/[0.045]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="truncate text-xl font-semibold text-white">{value}</div>
                            <div className="mt-2 text-sm text-slate-400">{item.label || item.provider || orgName || 'MightyCall inventory'}</div>
                            {orgName && <div className="mt-1 text-xs text-slate-500">{orgName}</div>}
                          </div>
                          <StatusBadge tone={active ? 'success' : 'warning'}>
                            {active ? 'Available' : 'Needs review'}
                          </StatusBadge>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title={selectedPhoneValue ? `Recordings for ${selectedPhoneValue}` : 'Recent recordings'}
              description={selectedPhoneValue ? `Review call recordings and metadata for ${selectedPhoneOrgName}.` : 'Choose a number to inspect its recording stream.'}
              actions={
                selectedPhoneValue ? (
                  <StatusBadge tone="info">{recordingsLoading ? 'Loading' : `${filteredRecordings.length} recordings`}</StatusBadge>
                ) : undefined
              }
            >
              {recordingsLoading ? (
                <div className="text-sm text-slate-400">Loading recordings...</div>
              ) : !selectedPhone ? (
                <EmptyStatePanel
                  title="Select a number"
                  description="Click a synced phone number to open its recording stream instead of browsing by raw database ids."
                />
              ) : filteredRecordings.length === 0 ? (
                <EmptyStatePanel
                  title="No recordings found"
                  description={`No recordings are currently linked to ${selectedPhoneValue}. Once calls are recorded, they will appear here with the phone number label instead of an internal UUID.`}
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-white/8 text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">Direction</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">Caller</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">Number</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">Duration</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em]">Started</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.18em]">Recording</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/6">
                      {filteredRecordings.slice(0, 100).map((recording) => (
                        <tr key={recording.id} className="hover:bg-white/[0.03]">
                          <td className="px-4 py-3">
                            <StatusBadge tone={recording.direction === 'inbound' ? 'info' : 'success'}>
                              {recording.direction === 'inbound' ? 'Inbound' : 'Outbound'}
                            </StatusBadge>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-200">{recording.from_number || '-'}</td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-200">{recording.to_number || selectedPhoneValue || '-'}</td>
                          <td className="px-4 py-3 text-slate-300">{formatDuration(recording.duration)}</td>
                          <td className="px-4 py-3">
                            <StatusBadge tone={String(recording.status || '').toLowerCase().includes('fail') ? 'warning' : 'neutral'}>
                              {recording.status || 'completed'}
                            </StatusBadge>
                          </td>
                          <td className="px-4 py-3 text-slate-400">{formatDateTime(recording.started_at || recording.recording_date)}</td>
                          <td className="px-4 py-3 text-right">
                            {recording.recording_url ? (
                              <a href={recording.recording_url} target="_blank" rel="noreferrer" className="vs-button-secondary inline-flex">
                                Open
                              </a>
                            ) : (
                              <span className="text-xs text-slate-500">No file</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </div>
        </div>
      </div>
    </PageLayout>
  );
};

export default NumbersPage;
export { NumbersPage };
