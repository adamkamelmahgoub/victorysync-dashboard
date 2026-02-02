import { useEffect, useState } from 'react';

interface RecordingData {
  id: string;
  phone_number: string;
  direction: 'inbound' | 'outbound';
  duration: number;
  status: string;
  started_at: string;
  call_type?: string;
  from_number?: string;
  to_number?: string;
}

interface PhoneNumber {
  id: string;
  phone_number: string;
}

export default function OrgReportsTab({ orgId }: { orgId: string }) {
  const [recordings, setRecordings] = useState<RecordingData[]>([]);
  const [orgPhones, setOrgPhones] = useState<PhoneNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState('all'); // 'today', 'week', 'month', 'all'
  const [phoneFilter, setPhoneFilter] = useState('all');

  useEffect(() => {
    loadData();
  }, [orgId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load org's phone numbers
      const phoneRes = await fetch(`/api/orgs/${orgId}/phone-numbers`);
      if (!phoneRes.ok) {
        setError('Failed to load organization phone numbers');
        setOrgPhones([]);
        setRecordings([]);
        setLoading(false);
        return;
      }

      const phoneData = await phoneRes.json();
      const phones: PhoneNumber[] = phoneData.phone_numbers || [];
      setOrgPhones(phones);

      // Load recordings - filter by org's phone numbers
      if (phones.length === 0) {
        setRecordings([]);
        setLoading(false);
        return;
      }

      // Try to get recordings from API
      const phoneNumbers = phones.map(p => p.phone_number).join(',');
      const recRes = await fetch(`/api/orgs/${orgId}/recordings?phones=${phoneNumbers}`);
      
      if (!recRes.ok) {
        // Fallback: try basic recordings endpoint
        const fallbackRes = await fetch(`/api/recordings?org_id=${orgId}`);
        if (!fallbackRes.ok) {
          setError('Failed to load recordings');
          setRecordings([]);
          setLoading(false);
          return;
        }
        const fallbackData = await fallbackRes.json();
        const recs = fallbackData.recordings || [];
        filterAndSetRecordings(recs, phones);
      } else {
        const recData = await recRes.json();
        const recs = recData.recordings || [];
        filterAndSetRecordings(recs, phones);
      }
    } catch (e) {
      setError('Failed to load reports');
      console.error(e);
      setRecordings([]);
    } finally {
      setLoading(false);
    }
  };

  const filterAndSetRecordings = (recs: any[], phones: PhoneNumber[]) => {
    // Filter recordings to only include those from org's phone numbers
    const phoneSet = new Set(phones.map(p => p.phone_number));
    const filtered = recs.filter(r => phoneSet.has(r.phone_number));
    setRecordings(filtered);
  };

  const getFilteredRecordings = () => {
    let filtered = recordings;

    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      let startDate = new Date();

      if (dateFilter === 'today') {
        startDate.setHours(0, 0, 0, 0);
      } else if (dateFilter === 'week') {
        startDate.setDate(now.getDate() - 7);
      } else if (dateFilter === 'month') {
        startDate.setDate(now.getDate() - 30);
      }

      filtered = filtered.filter(r => new Date(r.started_at) >= startDate);
    }

    // Phone filter
    if (phoneFilter !== 'all') {
      filtered = filtered.filter(r => r.phone_number === phoneFilter);
    }

    return filtered;
  };

  const stats = {
    total: recordings.length,
    inbound: recordings.filter(r => r.direction === 'inbound').length,
    outbound: recordings.filter(r => r.direction === 'outbound').length,
    totalDuration: recordings.reduce((sum, r) => sum + (r.duration || 0), 0),
  };

  const filteredRecordings = getFilteredRecordings();

  if (loading) return <div className="text-center text-slate-400">Loading reports...</div>;

  return (
    <div className="space-y-6">
      {/* Error Alert */}
      {error && (
        <div className="bg-rose-900/20 border border-rose-800 rounded-lg p-4">
          <p className="text-rose-400 text-sm">{error}</p>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
          <p className="text-slate-400 text-sm">Total Calls</p>
          <p className="text-2xl font-bold text-slate-100 mt-1">{stats.total}</p>
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
          <p className="text-slate-400 text-sm">Inbound</p>
          <p className="text-2xl font-bold text-slate-100 mt-1">{stats.inbound}</p>
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
          <p className="text-slate-400 text-sm">Outbound</p>
          <p className="text-2xl font-bold text-slate-100 mt-1">{stats.outbound}</p>
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
          <p className="text-slate-400 text-sm">Total Duration</p>
          <p className="text-2xl font-bold text-slate-100 mt-1">{Math.round(stats.totalDuration / 60)}m</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-slate-300 mb-2">Date Range</label>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-100 text-sm"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">Last 7 Days</option>
              <option value="month">Last 30 Days</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-2">Phone Number</label>
            <select
              value={phoneFilter}
              onChange={(e) => setPhoneFilter(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-100 text-sm"
            >
              <option value="all">All Numbers</option>
              {orgPhones.map(phone => (
                <option key={phone.id} value={phone.phone_number}>
                  {phone.phone_number}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Recordings Table */}
      <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
        {filteredRecordings.length === 0 ? (
          <div className="p-6 text-center text-slate-400">
            {recordings.length === 0 ? 'No call recordings available.' : 'No recordings match the selected filters.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-800/50">
                  <th className="px-4 py-3 text-left text-slate-300 font-semibold">Phone</th>
                  <th className="px-4 py-3 text-left text-slate-300 font-semibold">Direction</th>
                  <th className="px-4 py-3 text-left text-slate-300 font-semibold">Duration</th>
                  <th className="px-4 py-3 text-left text-slate-300 font-semibold">Status</th>
                  <th className="px-4 py-3 text-left text-slate-300 font-semibold">Date & Time</th>
                  <th className="px-4 py-3 text-left text-slate-300 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecordings.map((rec) => (
                  <tr key={rec.id} className="border-b border-slate-700 hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 text-slate-300 font-mono text-xs">{rec.phone_number}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        rec.direction === 'inbound'
                          ? 'bg-blue-900/30 text-blue-300'
                          : 'bg-emerald-900/30 text-emerald-300'
                      }`}>
                        {rec.direction === 'inbound' ? '↓ Inbound' : '↑ Outbound'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {rec.duration ? `${Math.round(rec.duration / 60)}m ${rec.duration % 60}s` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        rec.status === 'completed'
                          ? 'bg-emerald-900/30 text-emerald-300'
                          : rec.status === 'failed'
                          ? 'bg-rose-900/30 text-rose-300'
                          : 'bg-slate-700 text-slate-300'
                      }`}>
                        {rec.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                      {new Date(rec.started_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {rec.from_number && `${rec.from_number}`} → {rec.to_number && `${rec.to_number}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="text-center text-slate-400 text-sm">
        Showing {filteredRecordings.length} of {recordings.length} calls
      </div>
    </div>
  );
}
