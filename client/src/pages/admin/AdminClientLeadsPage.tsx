import React, { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageLayout } from '../../components/PageLayout';
import { SectionCard, EmptyStatePanel, StatusBadge } from '../../components/DashboardPrimitives';
import { useAuth } from '../../contexts/AuthContext';
import { buildApiUrl } from '../../config';

type Lead = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  source: string | null;
  status: string;
  disposition: string;
  priority: string;
  assigned_to: string | null;
  attempts: number;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  do_not_contact: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type Activity = { id: string; activity_type: string; summary: string; actor_name: string | null; created_at: string; changes?: Record<string, any> };

const statuses = ['new', 'working', 'contacted', 'qualified', 'follow_up', 'closed'];
const dispositions = ['unworked', 'no_answer', 'voicemail', 'callback', 'interested', 'not_interested', 'wrong_number', 'do_not_contact', 'converted'];
const priorities = ['low', 'normal', 'high', 'urgent'];
const label = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const localDateTime = (value: string | null) => value ? new Date(value).toISOString().slice(0, 16) : '';

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; cell = '';
    } else cell += char;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
}

export default function AdminClientLeadsPage() {
  const { orgId = '' } = useParams();
  const navigate = useNavigate();
  const { user, orgs } = useAuth();
  const clientName = orgs.find((org) => org.id === orgId)?.name || 'Client';
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Lead>>({});
  const [activities, setActivities] = useState<Activity[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dispositionFilter, setDispositionFilter] = useState('');
  const [note, setNote] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [newLead, setNewLead] = useState({ first_name: '', last_name: '', phone: '', email: '', company: '', source: '', assigned_to: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const headers = useMemo(() => ({ 'Content-Type': 'application/json', 'x-user-id': user?.id || '' }), [user?.id]);
  const selected = leads.find((lead) => lead.id === selectedId) || null;

  const request = useCallback(async (path: string, init?: RequestInit) => {
    const response = await fetch(buildApiUrl(path), { cache: 'no-store', ...init, headers: { ...headers, ...(init?.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || payload.error || 'Request failed');
    return payload;
  }, [headers]);

  const loadLeads = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const query = new URLSearchParams();
      if (search) query.set('search', search);
      if (statusFilter) query.set('status', statusFilter);
      if (dispositionFilter) query.set('disposition', dispositionFilter);
      const payload = await request(`/api/admin/clients/${encodeURIComponent(orgId)}/leads?${query}`);
      setLeads(payload.items || []);
      if (selectedId && !(payload.items || []).some((lead: Lead) => lead.id === selectedId)) setSelectedId(null);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }, [dispositionFilter, orgId, request, search, selectedId, statusFilter]);

  const loadActivity = useCallback(async (leadId: string) => {
    try {
      const payload = await request(`/api/admin/clients/${encodeURIComponent(orgId)}/leads/${encodeURIComponent(leadId)}/activity`);
      setActivities(payload.items || []);
    } catch (err: any) { setError(err.message); }
  }, [orgId, request]);

  useEffect(() => { const timer = window.setTimeout(() => void loadLeads(), 250); return () => window.clearTimeout(timer); }, [loadLeads]);
  useEffect(() => {
    if (!selected) { setDraft({}); setActivities([]); return; }
    setDraft(selected);
    void loadActivity(selected.id);
  }, [selectedId]);

  const save = async () => {
    if (!selected) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const payload = {
        first_name: draft.first_name || null, last_name: draft.last_name || null,
        phone: draft.phone || null, email: draft.email || null, company: draft.company || null,
        source: draft.source || null, status: draft.status, disposition: draft.disposition,
        priority: draft.priority, assigned_to: draft.assigned_to || null,
        attempts: Number(draft.attempts || 0), do_not_contact: Boolean(draft.do_not_contact),
        last_contacted_at: draft.last_contacted_at ? new Date(draft.last_contacted_at).toISOString() : null,
        next_follow_up_at: draft.next_follow_up_at ? new Date(draft.next_follow_up_at).toISOString() : null,
        notes: draft.notes || null,
      };
      const result = await request(`/api/admin/clients/${orgId}/leads/${selected.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      setLeads((current) => current.map((lead) => lead.id === selected.id ? result.item : lead));
      setMessage('Lead saved and added to the audit history.');
      await loadActivity(selected.id);
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  const addLead = async () => {
    setError('');
    if (!newLead.phone.trim() && !newLead.email.trim()) { setError('Enter a phone number or email for the new lead.'); return; }
    try {
      const result = await request(`/api/admin/clients/${orgId}/leads`, { method: 'POST', body: JSON.stringify({ ...newLead, status: 'new', disposition: 'unworked' }) });
      setLeads((current) => [result.item, ...current]); setSelectedId(result.item.id); setMessage('New lead created.');
      setCreateOpen(false); setNewLead({ first_name: '', last_name: '', phone: '', email: '', company: '', source: '', assigned_to: '' });
    } catch (err: any) { setError(err.message); }
  };

  const importCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(''); setMessage('');
    try {
      const rows = parseCsv(await file.text());
      const result = await request(`/api/admin/clients/${orgId}/leads/import`, { method: 'POST', body: JSON.stringify({ rows }) });
      setMessage(`Imported ${result.inserted} leads${result.rejected?.length ? `; ${result.rejected.length} rows were rejected` : ''}.`);
      await loadLeads();
    } catch (err: any) { setError(err.message); }
  };

  const addNote = async () => {
    if (!selected || !note.trim()) return;
    setSaving(true);
    try {
      await request(`/api/admin/clients/${orgId}/leads/${selected.id}/notes`, { method: 'POST', body: JSON.stringify({ note }) });
      setNote(''); await loadActivity(selected.id); setMessage('Note added to the permanent timeline.');
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  const summary = useMemo(() => ({
    total: leads.length,
    urgent: leads.filter((lead) => lead.priority === 'urgent' || lead.priority === 'high').length,
    followUps: leads.filter((lead) => lead.status === 'follow_up').length,
    converted: leads.filter((lead) => lead.disposition === 'converted').length,
  }), [leads]);

  return (
    <PageLayout title={`${clientName} lead workspace`} eyebrow="Internal client operations" description="Private lead operations visible only to platform administrators."
      actions={<button className="vs-button-secondary" onClick={() => navigate('/admin/orgs')}>Back to clients</button>}>
      <div className="space-y-6">
        <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
          <strong>Internal only.</strong> Client users cannot access these leads or their activity history.
        </div>
        {(error || message) && <div className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{error || message}</div>}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Object.entries(summary).map(([key, value]) => <div key={key} className="vs-surface p-4"><div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label(key)}</div><div className="mt-2 text-2xl font-bold text-slate-950">{value}</div></div>)}
        </div>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(390px,0.8fr)]">
          <SectionCard title="Client leads" description="Upload, search, and select a lead to manage its complete workflow."
            actions={<div className="flex gap-2"><label className="vs-button-secondary cursor-pointer">Import CSV<input type="file" accept=".csv,text/csv" className="hidden" onChange={importCsv} /></label><button className="vs-button-primary" onClick={() => setCreateOpen(true)}>Add lead</button></div>}>
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <input className="vs-input" placeholder="Search name, phone, email..." value={search} onChange={(event) => setSearch(event.target.value)} />
              <select className="vs-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select>
              <select className="vs-input" value={dispositionFilter} onChange={(event) => setDispositionFilter(event.target.value)}><option value="">All dispositions</option>{dispositions.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select>
            </div>
            {loading ? <div className="py-16 text-center text-sm text-slate-500">Loading client leads...</div> : leads.length === 0 ? <EmptyStatePanel title="No leads yet" description="Import a CSV or add the first lead for this client." /> : (
              <div className="max-h-[680px] overflow-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[760px] text-sm"><thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500"><tr>{['Lead', 'Status', 'Disposition', 'Priority', 'Owner', 'Follow-up'].map((item) => <th key={item} className="px-3 py-3">{item}</th>)}</tr></thead>
                  <tbody className="divide-y divide-slate-100">{leads.map((lead) => <tr key={lead.id} onClick={() => setSelectedId(lead.id)} className={`cursor-pointer transition hover:bg-violet-50 ${selectedId === lead.id ? 'bg-violet-50 ring-1 ring-inset ring-violet-200' : ''}`}>
                    <td className="px-3 py-3"><div className="font-semibold text-slate-900">{[lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.company || 'Unnamed lead'}</div><div className="text-xs text-slate-500">{lead.phone || lead.email}</div></td>
                    <td className="px-3 py-3"><StatusBadge tone={lead.status === 'closed' ? 'neutral' : lead.status === 'qualified' ? 'success' : 'info'}>{label(lead.status)}</StatusBadge></td>
                    <td className="px-3 py-3 text-slate-700">{label(lead.disposition)}</td><td className="px-3 py-3 text-slate-700">{label(lead.priority)}</td><td className="px-3 py-3 text-slate-700">{lead.assigned_to || 'Unassigned'}</td><td className="px-3 py-3 text-slate-600">{lead.next_follow_up_at ? new Date(lead.next_follow_up_at).toLocaleString() : '—'}</td>
                  </tr>)}</tbody></table>
              </div>
            )}
          </SectionCard>

          <SectionCard title={selected ? ([selected.first_name, selected.last_name].filter(Boolean).join(' ') || selected.company || 'Lead details') : 'Lead details'} description={selected ? 'Every change is attributed and timestamped.' : 'Select a lead from the table to begin.'}>
            {!selected ? <EmptyStatePanel title="Select a lead" description="Statuses, dispositions, notes, assignments, attempts, and follow-ups will appear here." /> : <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                {[['First name', 'first_name'], ['Last name', 'last_name'], ['Phone', 'phone'], ['Email', 'email'], ['Company', 'company'], ['Source', 'source'], ['Assigned to', 'assigned_to']].map(([title, key]) => <label key={key} className={key === 'assigned_to' ? 'col-span-2 text-xs font-semibold text-slate-600' : 'text-xs font-semibold text-slate-600'}>{title}<input className="vs-input mt-1 w-full font-normal" value={String((draft as any)[key] || '')} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} /></label>)}
                <label className="text-xs font-semibold text-slate-600">Status<select className="vs-input mt-1 w-full font-normal" value={draft.status || 'new'} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}>{statuses.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
                <label className="text-xs font-semibold text-slate-600">Disposition<select className="vs-input mt-1 w-full font-normal" value={draft.disposition || 'unworked'} onChange={(event) => setDraft((current) => ({ ...current, disposition: event.target.value }))}>{dispositions.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
                <label className="text-xs font-semibold text-slate-600">Priority<select className="vs-input mt-1 w-full font-normal" value={draft.priority || 'normal'} onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value }))}>{priorities.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
                <label className="text-xs font-semibold text-slate-600">Attempts<input type="number" min="0" className="vs-input mt-1 w-full font-normal" value={draft.attempts || 0} onChange={(event) => setDraft((current) => ({ ...current, attempts: Number(event.target.value) }))} /></label>
                <label className="text-xs font-semibold text-slate-600">Last contacted<input type="datetime-local" className="vs-input mt-1 w-full font-normal" value={localDateTime(draft.last_contacted_at || null)} onChange={(event) => setDraft((current) => ({ ...current, last_contacted_at: event.target.value }))} /></label>
                <label className="text-xs font-semibold text-slate-600">Next follow-up<input type="datetime-local" className="vs-input mt-1 w-full font-normal" value={localDateTime(draft.next_follow_up_at || null)} onChange={(event) => setDraft((current) => ({ ...current, next_follow_up_at: event.target.value }))} /></label>
              </div>
              <label className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800"><input type="checkbox" checked={Boolean(draft.do_not_contact)} onChange={(event) => setDraft((current) => ({ ...current, do_not_contact: event.target.checked }))} />Do not contact</label>
              <label className="block text-xs font-semibold text-slate-600">Working notes<textarea className="vs-input mt-1 min-h-24 w-full font-normal" value={draft.notes || ''} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} /></label>
              <button className="vs-button-primary w-full" disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save lead changes'}</button>
              <div className="border-t border-slate-200 pt-5"><div className="text-sm font-semibold text-slate-900">Add timeline note</div><textarea className="vs-input mt-2 min-h-20 w-full" placeholder="What happened, what was agreed, and the next step..." value={note} onChange={(event) => setNote(event.target.value)} /><button className="vs-button-secondary mt-2 w-full" disabled={saving || !note.trim()} onClick={addNote}>Add attributed note</button></div>
              <div className="border-t border-slate-200 pt-5"><div className="mb-3 text-sm font-semibold text-slate-900">Activity history</div><div className="max-h-72 space-y-3 overflow-auto">{activities.length === 0 ? <div className="text-sm text-slate-500">No activity yet.</div> : activities.map((activity) => <div key={activity.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-sm text-slate-800">{activity.summary}</div><div className="mt-1 text-xs text-slate-500">{activity.actor_name || 'Platform admin'} · {new Date(activity.created_at).toLocaleString()}</div></div>)}</div></div>
            </div>}
          </SectionCard>
        </div>
        {createOpen && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-label="Add client lead">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between"><div><h2 className="text-lg font-semibold text-slate-950">Add lead for {clientName}</h2><p className="mt-1 text-sm text-slate-600">This record remains private to the internal platform team.</p></div><button className="text-2xl text-slate-400 hover:text-slate-700" onClick={() => setCreateOpen(false)} aria-label="Close">×</button></div>
            <div className="mt-5 grid grid-cols-2 gap-3">{Object.entries(newLead).map(([key, value]) => <label key={key} className="text-xs font-semibold text-slate-600">{label(key)}{(key === 'phone' || key === 'email') && <span className="text-violet-600"> *</span>}<input className="vs-input mt-1 w-full font-normal" value={value} onChange={(event) => setNewLead((current) => ({ ...current, [key]: event.target.value }))} /></label>)}</div>
            <p className="mt-3 text-xs text-slate-500">At least one contact method—phone or email—is required.</p>
            <div className="mt-5 flex justify-end gap-2"><button className="vs-button-secondary" onClick={() => setCreateOpen(false)}>Cancel</button><button className="vs-button-primary" onClick={addLead}>Create lead</button></div>
          </div>
        </div>}
      </div>
    </PageLayout>
  );
}
