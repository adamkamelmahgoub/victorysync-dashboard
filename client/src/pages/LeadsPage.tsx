import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PageLayout from '../components/PageLayout';
import { EmptyStatePanel, MetricStatCard, SectionCard, StatusBadge } from '../components/DashboardPrimitives';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  getLeads,
  getLeadActivity,
  getLeadsSummary,
  getLeadSources,
  getOrgMembers,
  createLeadSource,
  LeadItem,
  LeadActivityItem,
  LeadSourceItem,
  LeadsVisibility,
  updateLead,
  updateLeadSource,
  updateLeadsVisibility,
  uploadLeadList,
  getLeadUploads,
  getUploadPermissions,
  setUploadPermission,
} from '../lib/apiClient';
import { postLog } from '../lib/logging';
import { supabase } from '../lib/supabaseClient';
import { useLocation } from 'react-router-dom';

// ─── types ───────────────────────────────────────────────────────────────────

type DateRange = 'today' | 'yesterday' | '7d' | 'custom';

type OrgMember = {
  user_id: string;
  email?: string | null;
  full_name?: string | null;
  role?: string | null;
};

type SavedLeadView = {
  id: string;
  name: string;
  filters: {
    status: string;
    range: DateRange;
    customStart: string;
    customEnd: string;
    stateFilter: string;
    agentFilter: string;
    leadTypeFilter: string;
    campaignFilter: string;
    sourceFilter: string;
    search: string;
    orgFilter: string;
  };
};

// ─── constants ───────────────────────────────────────────────────────────────

const statusOptions = [
  'new',
  'accepted',
  'declined',
  'contacted',
  'qualified',
  'transferred',
  'not_interested',
  'no_answer',
  'callback',
];

// ─── audio ───────────────────────────────────────────────────────────────────

function playUploadSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    // Two-tone chime: G5 then C6
    const freqs = [784, 1047];
    let startTime = ctx.currentTime;
    freqs.forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.3, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);
      osc.start(startTime);
      osc.stop(startTime + 0.35);
      startTime += 0.22;
    });
  } catch { /* ignore — audio not available */ }
}

// ─── CSV parser (browser-side, no external deps) ─────────────────────────────

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length < 2) return [];
  function splitRow(line: string): string[] {
    const fields: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        fields.push(cur.trim()); cur = '';
      } else {
        cur += ch;
      }
    }
    fields.push(cur.trim());
    return fields;
  }
  const headers = splitRow(lines[0]).map((h) => h.replace(/^"|"$/g, '').trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = splitRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = (values[idx] || '').replace(/^"|"$/g, '').trim(); });
    rows.push(row);
  }
  return rows;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function startOfDay(date: Date) {
  const d = new Date(date); d.setHours(0, 0, 0, 0); return d;
}
function endOfDay(date: Date) {
  const d = new Date(date); d.setHours(23, 59, 59, 999); return d;
}

function dateParams(range: DateRange, customStart: string, customEnd: string) {
  const now = new Date();
  if (range === 'today')
    return { start_date: startOfDay(now).toISOString(), end_date: endOfDay(now).toISOString() };
  if (range === 'yesterday') {
    const y = new Date(now); y.setDate(y.getDate() - 1);
    return { start_date: startOfDay(y).toISOString(), end_date: endOfDay(y).toISOString() };
  }
  if (range === '7d') {
    const s = new Date(now); s.setDate(s.getDate() - 6);
    return { start_date: startOfDay(s).toISOString(), end_date: endOfDay(now).toISOString() };
  }
  return {
    start_date: customStart ? new Date(`${customStart}T00:00:00`).toISOString() : undefined,
    end_date: customEnd ? new Date(`${customEnd}T23:59:59`).toISOString() : undefined,
  };
}

function formatMoney(value: unknown) {
  const num = Number(value || 0);
  if (!Number.isFinite(num) || num <= 0) return '-';
  return new Intl.NumberFormat(undefined, {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(num);
}

function formatTimeAgo(value?: string | null) {
  if (!value) return '-';
  const diff = Date.now() - new Date(value).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hr ago`;
  return new Date(value).toLocaleString();
}

function leadName(lead: LeadItem) {
  return `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Unknown lead';
}

function maskPhone(phone: string, revealed: boolean) {
  if (revealed) return phone;
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length <= 4) return phone || '-';
  return `***-***-${digits.slice(-4)}`;
}

function statusTone(status?: string | null): 'neutral' | 'success' | 'warning' | 'info' {
  if (status === 'accepted' || status === 'transferred' || status === 'qualified') return 'success';
  if (status === 'contacted' || status === 'callback') return 'warning';
  if (status === 'new') return 'info';
  return 'neutral';
}

function csvEscape(value: unknown) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function activityLabel(activity: LeadActivityItem) {
  const action = String(activity.action || '').replace(/_/g, ' ');
  const status = activity.metadata?.patch?.status || activity.metadata?.status;
  if (status) return `${action} - ${String(status).replace(/_/g, ' ')}`;
  return action || 'Lead activity';
}

// ─── component ───────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const { user, selectedOrgId, orgs, globalRole } = useAuth();
  const toast = useToast();
  const location = useLocation();

  const isAdmin = ['platform_admin', 'admin', 'super_admin'].includes(String(globalRole || ''));

  // Detect current user's membership role in the selected org
  const currentOrgRole = useMemo(() => {
    if (!selectedOrgId || !orgs) return null;
    const org = orgs.find((o: any) => o.id === selectedOrgId);
    return (org as any)?.role || null;
  }, [selectedOrgId, orgs]);

  // ── lead upload state ─────────────────────────────────────────────────────
  const [uploadDragging, setUploadDragging] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<{ inserted: number; failed: number } | null>(null);
  const [uploadTarget, setUploadTarget] = useState<'all' | string>('all'); // agent user_id or 'all'
  const [uploadHistory, setUploadHistory] = useState<any[]>([]);
  const [uploadPermissions, setUploadPermissions] = useState<any[]>([]);
  const [loadingUploadPerms, setLoadingUploadPerms] = useState(false);

  const loadUploadHistory = useCallback(async () => {
    if (!user?.id) return;
    try {
      const result = await getLeadUploads(
        { organization_id: selectedOrgId || undefined },
        user.id,
      );
      setUploadHistory(result?.items || []);
    } catch { setUploadHistory([]); }
  }, [selectedOrgId, user?.id]);

  const loadUploadPermissions = useCallback(async () => {
    if (!user?.id || !isAdmin) return;
    setLoadingUploadPerms(true);
    try {
      const result = await getUploadPermissions(selectedOrgId || undefined, user.id);
      setUploadPermissions(result?.items || []);
    } catch { setUploadPermissions([]); }
    finally { setLoadingUploadPerms(false); }
  }, [isAdmin, selectedOrgId, user?.id]);

  useEffect(() => { void loadUploadHistory(); }, [loadUploadHistory]);
  useEffect(() => { void loadUploadPermissions(); }, [loadUploadPermissions]);

  const handleFileUpload = async (file: File) => {
    if (!user?.id) return;
    setUploadLoading(true);
    setUploadResult(null);
    setUploadFileName(file.name);
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length === 0) { toast.push('No rows found in file — check format.', 'error'); return; }
      const result = await uploadLeadList({
        rows,
        organization_id: selectedOrgId || null,
        assigned_agent_id: uploadTarget === 'all' ? null : uploadTarget,
        notify: true,
      }, user.id);
      setUploadResult({ inserted: result.inserted, failed: result.failed });
      playUploadSound();
      toast.push(`✓ Uploaded ${result.inserted} leads${result.failed ? ` (${result.failed} skipped)` : ''}`, 'success');
      void loadLeads();
      void loadUploadHistory();
    } catch (e: any) {
      toast.push(e?.message || 'Upload failed', 'error');
    } finally {
      setUploadLoading(false);
    }
  };

  const toggleUploadPermission = async (targetUser: any) => {
    if (!user?.id) return;
    try {
      await setUploadPermission(targetUser.id, !targetUser.can_upload_leads, user.id);
      toast.push(`Upload ${!targetUser.can_upload_leads ? 'enabled' : 'disabled'} for ${targetUser.full_name || targetUser.email}`, 'success');
      void loadUploadPermissions();
    } catch (e: any) {
      toast.push(e?.message || 'Failed to update permission', 'error');
    }
  };

  // ── leads visibility settings ─────────────────────────────────────────────
  const [visibility, setVisibility] = useState<LeadsVisibility>({ agents: true, clients: true });
  const [savingVisibility, setSavingVisibility] = useState(false);

  // Load visibility from the current org object (comes back on org fetch)
  useEffect(() => {
    const org = orgs?.find?.((o: any) => o.id === selectedOrgId) as any;
    if (org?.leads_visibility) {
      setVisibility({
        agents: org.leads_visibility.agents !== false,
        clients: org.leads_visibility.clients !== false,
      });
    }
  }, [orgs, selectedOrgId]);

  // ── access gate (non-admins) ───────────────────────────────────────────────
  const hasAccess = useMemo(() => {
    if (isAdmin) return true;
    if (currentOrgRole === 'agent' && !visibility.agents) return false;
    if (currentOrgRole === 'client' && !visibility.clients) return false;
    return true;
  }, [isAdmin, currentOrgRole, visibility]);

  // ── org members (for agent assignment) ────────────────────────────────────
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [leadSources, setLeadSources] = useState<LeadSourceItem[]>([]);
  const [savingLeadSource, setSavingLeadSource] = useState(false);
  const [leadSourceForm, setLeadSourceForm] = useState({
    source_name: 'mcgrawnow',
    source_label: '',
    campaign_id: '',
    campaign_name: '',
    organization_id: selectedOrgId || '',
    lead_type: 'debt_relief',
    description: '',
    routing_priority: 100,
    active: true,
  });
  useEffect(() => {
    if (!selectedOrgId || !user?.id) return;
    getOrgMembers(selectedOrgId, user.id)
      .then((result: any) => setMembers(result?.data || result?.members || result || []))
      .catch(() => {});
  }, [selectedOrgId, user?.id]);

  const loadLeadSources = useCallback(async () => {
    if (!user?.id) return;
    try {
      const result = await getLeadSources(isAdmin && !selectedOrgId ? {} : { organization_id: selectedOrgId || undefined }, user.id);
      setLeadSources(result.items || []);
    } catch {
      setLeadSources([]);
    }
  }, [isAdmin, selectedOrgId, user?.id]);

  useEffect(() => {
    if (selectedOrgId) {
      setLeadSourceForm((form) => ({ ...form, organization_id: form.organization_id || selectedOrgId }));
    }
  }, [selectedOrgId]);

  useEffect(() => {
    if (isAdmin) void loadLeadSources();
  }, [isAdmin, loadLeadSources]);

  const memberById = useMemo(() => {
    const map: Record<string, OrgMember> = {};
    for (const m of members) if (m.user_id) map[m.user_id] = m;
    return map;
  }, [members]);

  function memberLabel(m: OrgMember) {
    return m.full_name || m.email || m.user_id.slice(0, 8);
  }

  const leadTypeOptions = useMemo(() => {
    const values = new Set<string>();
    for (const source of leadSources) if (source.lead_type) values.add(source.lead_type);
    values.add('debt_relief');
    values.add('solar');
    values.add('insurance');
    values.add('home_services');
    return Array.from(values).sort();
  }, [leadSources]);

  const campaignOptions = useMemo(() => {
    const values = new Map<string, string>();
    for (const source of leadSources) {
      if (source.campaign_id) values.set(source.campaign_id, source.campaign_name || source.campaign_id);
    }
    return Array.from(values.entries()).map(([id, name]) => ({ id, name }));
  }, [leadSources]);

  const sourceOptions = useMemo(() => {
    const values = new Set<string>();
    for (const source of leadSources) if (source.source_name) values.add(source.source_name);
    for (const lead of leads) if (lead.source) values.add(lead.source);
    values.add('manual_upload');
    values.add('mcgrawnow');
    return Array.from(values).sort();
  }, [leadSources, leads]);

  const persistSavedViews = useCallback((views: SavedLeadView[]) => {
    setSavedViews(views);
    localStorage.setItem(savedViewsKey, JSON.stringify(views));
  }, [savedViewsKey]);

  const saveCurrentView = () => {
    const name = savedViewName.trim();
    if (!name) {
      toast.push('Name this view first', 'error');
      return;
    }
    const nextView: SavedLeadView = {
      id: `${Date.now()}`,
      name,
      filters: currentViewFilters,
    };
    persistSavedViews([nextView, ...savedViews.filter((view) => view.name.toLowerCase() !== name.toLowerCase())].slice(0, 12));
    setSavedViewName('');
    toast.push('Lead view saved', 'success');
  };

  const applySavedView = (view: SavedLeadView) => {
    setStatus(view.filters.status);
    setRange(view.filters.range);
    setCustomStart(view.filters.customStart);
    setCustomEnd(view.filters.customEnd);
    setStateFilter(view.filters.stateFilter);
    setAgentFilter(view.filters.agentFilter);
    setLeadTypeFilter(view.filters.leadTypeFilter);
    setCampaignFilter(view.filters.campaignFilter);
    setSourceFilter(view.filters.sourceFilter);
    setSearch(view.filters.search);
    setOrgFilter(view.filters.orgFilter);
    toast.push(`Applied ${view.name}`, 'success');
  };

  const deleteSavedView = (viewId: string) => {
    persistSavedViews(savedViews.filter((view) => view.id !== viewId));
  };

  const exportLeadsCsv = () => {
    const headers = ['received_at', 'source', 'campaign', 'lead_type', 'first_name', 'last_name', 'phone', 'email', 'state', 'debt_amount', 'status', 'assigned_agent', 'call_attempts'];
    const rows = leads.map((lead) => {
      const agent = lead.assigned_agent_id ? memberById[lead.assigned_agent_id] : null;
      return [
        lead.received_at || '',
        lead.source || '',
        lead.campaign_name || lead.campaign_id || '',
        lead.lead_type || '',
        lead.first_name || '',
        lead.last_name || '',
        isAdmin || revealedPhones.has(lead.id) ? lead.phone : maskPhone(lead.phone, false),
        lead.email || '',
        lead.state || '',
        lead.debt_amount || '',
        lead.status || 'new',
        agent ? memberLabel(agent) : lead.assigned_agent_id || '',
        lead.call_attempts || 0,
      ].map(csvEscape).join(',');
    });
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `victorysync-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const saveLeadSource = async () => {
    if (!user?.id) return;
    if (!leadSourceForm.organization_id) {
      toast.push('Choose a client organization for this campaign', 'error');
      return;
    }
    setSavingLeadSource(true);
    try {
      await createLeadSource({
        ...leadSourceForm,
        source_label: leadSourceForm.source_label || leadSourceForm.campaign_name || leadSourceForm.campaign_id || 'McGraw Now',
      }, user.id);
      toast.push('Lead campaign route saved', 'success');
      setLeadSourceForm((form) => ({
        ...form,
        source_label: '',
        campaign_id: '',
        campaign_name: '',
        description: '',
        routing_priority: 100,
        active: true,
      }));
      await loadLeadSources();
    } catch (e: any) {
      toast.push(e?.message || 'Failed to save lead campaign route', 'error');
    } finally {
      setSavingLeadSource(false);
    }
  };

  const toggleLeadSourceActive = async (source: LeadSourceItem) => {
    if (!user?.id) return;
    try {
      await updateLeadSource(source.id, { active: !source.active }, user.id);
      await loadLeadSources();
    } catch (e: any) {
      toast.push(e?.message || 'Failed to update lead campaign route', 'error');
    }
  };

  // ── leads state ────────────────────────────────────────────────────────────
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<LeadItem | null>(null);
  const [leadActivity, setLeadActivity] = useState<LeadActivityItem[]>([]);
  const [loadingLeadActivity, setLoadingLeadActivity] = useState(false);
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  const [revealedPhones, setRevealedPhones] = useState<Set<string>>(new Set());
  const focusedLeadId = useMemo(() => new URLSearchParams(location.search).get('lead_id'), [location.search]);
  const savedViewsKey = useMemo(() => `victorysync-lead-views:${user?.id || 'anonymous'}`, [user?.id]);
  const [savedViews, setSavedViews] = useState<SavedLeadView[]>([]);
  const [savedViewName, setSavedViewName] = useState('');

  // ── filters ────────────────────────────────────────────────────────────────
  const [status, setStatus] = useState('');
  const [range, setRange] = useState<DateRange>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [leadTypeFilter, setLeadTypeFilter] = useState('');
  const [campaignFilter, setCampaignFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [search, setSearch] = useState('');
  const [orgFilter, setOrgFilter] = useState(selectedOrgId || '');

  useEffect(() => { setOrgFilter(selectedOrgId || ''); }, [selectedOrgId]);

  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(savedViewsKey) || '[]');
      setSavedViews(Array.isArray(parsed) ? parsed : []);
    } catch {
      setSavedViews([]);
    }
  }, [savedViewsKey]);

  const currentViewFilters = useMemo<SavedLeadView['filters']>(() => ({
    status,
    range,
    customStart,
    customEnd,
    stateFilter,
    agentFilter,
    leadTypeFilter,
    campaignFilter,
    sourceFilter,
    search,
    orgFilter,
  }), [agentFilter, campaignFilter, customEnd, customStart, leadTypeFilter, orgFilter, range, search, sourceFilter, stateFilter, status]);

  const queryParams = useMemo(() => ({
    organization_id: orgFilter || undefined,
    status: status || undefined,
    state: stateFilter || undefined,
    agent_id: agentFilter || undefined,
    lead_type: leadTypeFilter || undefined,
    campaign_id: campaignFilter || undefined,
    source: sourceFilter || undefined,
    search: search || undefined,
    limit: '100',
    ...dateParams(range, customStart, customEnd),
  }), [agentFilter, campaignFilter, customEnd, customStart, leadTypeFilter, orgFilter, range, search, sourceFilter, stateFilter, status]);

  // ── data loading ───────────────────────────────────────────────────────────
  const loadLeads = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const [leadResult, summaryResult] = await Promise.all([
        getLeads(queryParams, user.id),
        getLeadsSummary({
          organization_id: orgFilter || undefined,
          lead_type: leadTypeFilter || undefined,
          campaign_id: campaignFilter || undefined,
          source: sourceFilter || undefined,
        }, user.id),
      ]);
      setLeads(leadResult.items || []);
      setSummary(summaryResult);
    } catch (e: any) {
      setError(e?.message || 'Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, [campaignFilter, leadTypeFilter, orgFilter, queryParams, sourceFilter, user?.id]);

  useEffect(() => {
    void loadLeads();
    const id = window.setInterval(() => void loadLeads(), 10_000);
    return () => window.clearInterval(id);
  }, [loadLeads]);

  useEffect(() => {
    if (!focusedLeadId) return;
    const lead = leads.find((item) => item.id === focusedLeadId);
    if (lead) setSelectedLead(lead);
  }, [focusedLeadId, leads]);

  useEffect(() => {
    if (!selectedLead?.id || !user?.id) {
      setLeadActivity([]);
      return;
    }
    let cancelled = false;
    setLoadingLeadActivity(true);
    getLeadActivity(selectedLead.id, user.id)
      .then((result) => {
        if (!cancelled) setLeadActivity(result.items || []);
      })
      .catch(() => {
        if (!cancelled) setLeadActivity([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingLeadActivity(false);
      });
    return () => { cancelled = true; };
  }, [selectedLead?.id, user?.id]);

  // ── realtime subscription ──────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel('victorysync-leads-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leads' }, (payload) => {
        const lead = payload.new as LeadItem;
        if (orgFilter && lead.organization_id !== orgFilter) return;
        setLeads((prev) => [lead, ...prev.filter((item) => item.id !== lead.id)].slice(0, 100));
        setHighlightedIds((prev) => new Set(prev).add(lead.id));
        window.setTimeout(() => setHighlightedIds((prev) => {
          const next = new Set(prev); next.delete(lead.id); return next;
        }), 5000);
        toast.push(`New lead received — ${leadName(lead)}${lead.state ? ` from ${lead.state}` : ''}`, 'success');
        postLog('/api/logs/activity', {
          event_type: 'notification',
          event_name: 'New lead notification delivered',
          page: '/leads',
          element: 'new-lead-banner',
          metadata: { lead_id: lead.id, source: lead.source },
        });
        void loadLeads();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leads' }, (payload) => {
        const lead = payload.new as LeadItem;
        setLeads((prev) => prev.map((item) => item.id === lead.id ? lead : item));
        setSelectedLead((current) => current?.id === lead.id ? lead : current);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadLeads, orgFilter, toast, user?.id]);

  // ── lead actions ───────────────────────────────────────────────────────────
  const updateSelected = async (lead: LeadItem, patch: Record<string, any>) => {
    if (!user?.id) return;
    const result = await updateLead(lead.id, patch, user.id);
    setLeads((prev) => prev.map((item) => item.id === lead.id ? result.item : item));
    setSelectedLead(result.item);
  };

  const onCallLead = async (lead: LeadItem) => {
    await updateSelected(lead, { status: 'accepted', assign_to_me: true, increment_attempts: true });
    window.location.href = `tel:${lead.phone}`;
  };

  // ── visibility settings save ───────────────────────────────────────────────
  const saveVisibility = async (next: LeadsVisibility) => {
    if (!user?.id || !selectedOrgId) return;
    setSavingVisibility(true);
    try {
      await updateLeadsVisibility(selectedOrgId, next, user.id);
      setVisibility(next);
      toast.push('Visibility settings saved', 'success');
    } catch (e: any) {
      toast.push('Failed to save visibility settings', 'error');
    } finally {
      setSavingVisibility(false);
    }
  };

  // ── stat cards ─────────────────────────────────────────────────────────────
  const statCards = [
    ['Total today', summary?.total_today ?? 0, 'All received leads'],
    ['New', summary?.new_leads ?? 0, 'Uncontacted'],
    ['Contacted', summary?.contacted_today ?? 0, 'Reached today'],
    ['Transferred', summary?.transferred_today ?? 0, 'Sent to client'],
    ['Contact rate', `${summary?.contact_rate_pct ?? 0}%`, 'Contacted / total'],
    ['Transfer rate', `${summary?.transfer_rate_pct ?? 0}%`, 'Transferred / contacted'],
  ];

  // ── access denied ──────────────────────────────────────────────────────────
  if (!hasAccess) {
    return (
      <PageLayout eyebrow="Lead Intake" title="Leads" description="">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 text-4xl">🔒</div>
          <h2 className="text-xl font-semibold text-white">Access Restricted</h2>
          <p className="mt-2 text-sm text-slate-400">
            Your role ({currentOrgRole || 'unknown'}) does not have access to the Leads page.<br />
            Contact your admin to request access.
          </p>
        </div>
      </PageLayout>
    );
  }

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <PageLayout
      eyebrow="Universal Lead Intake"
      title="Leads"
      description="Universal lead workspace for every source, campaign, organization, and assigned agent."
      actions={
        <button className="vs-button-secondary" onClick={() => void loadLeads()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      }
    >
      {/* ── KPI cards ── */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {statCards.map(([label, value, hint], index) => (
          <MetricStatCard
            key={String(label)}
            label={String(label)}
            value={value}
            hint={hint}
            accent={index === 0 ? 'cyan' : index === 3 ? 'emerald' : 'neutral'}
          />
        ))}
      </div>

      {/* ── filters ── */}
      <SectionCard title="Filters" className="mt-5" contentClassName="p-4">
        <div className="mb-4 grid gap-3 xl:grid-cols-[1fr,auto]">
          <div className="flex flex-wrap gap-2">
            {savedViews.length === 0 ? (
              <span className="text-sm text-slate-500">No saved views yet.</span>
            ) : savedViews.map((view) => (
              <span key={view.id} className="inline-flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-xs text-slate-200">
                <button onClick={() => applySavedView(view)} className="font-semibold text-cyan-200">{view.name}</button>
                <button onClick={() => deleteSavedView(view.id)} className="text-slate-500 hover:text-rose-200" aria-label={`Delete ${view.name}`}>x</button>
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className="vs-input min-w-[200px]"
              value={savedViewName}
              onChange={(e) => setSavedViewName(e.target.value)}
              placeholder="View name"
            />
            <button className="vs-button-secondary" onClick={saveCurrentView}>Save View</button>
            <button className="vs-button-secondary" onClick={exportLeadsCsv} disabled={leads.length === 0}>Export CSV</button>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-8">
          {isAdmin && (
            <select className="vs-input xl:col-span-2" value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)}>
              <option value="">All organizations</option>
              {orgs.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
            </select>
          )}
          <select className="vs-input" value={leadTypeFilter} onChange={(e) => setLeadTypeFilter(e.target.value)}>
            <option value="">All lead types</option>
            {leadTypeOptions.map((item) => <option key={item} value={item}>{item.replace(/_/g, ' ')}</option>)}
          </select>
          <select className="vs-input" value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)}>
            <option value="">All campaigns</option>
            {campaignOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select className="vs-input" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
            <option value="">All sources</option>
            {sourceOptions.map((item) => <option key={item} value={item}>{item.replace(/_/g, ' ')}</option>)}
          </select>
          <select className="vs-input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {statusOptions.map((item) => <option key={item} value={item}>{item.replace(/_/g, ' ')}</option>)}
          </select>
          <select className="vs-input" value={range} onChange={(e) => setRange(e.target.value as DateRange)}>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="7d">Last 7 days</option>
            <option value="custom">Custom</option>
          </select>
          {range === 'custom' && (
            <>
              <input className="vs-input" type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
              <input className="vs-input" type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
            </>
          )}
          <input className="vs-input" value={stateFilter} onChange={(e) => setStateFilter(e.target.value.toUpperCase())} placeholder="State" maxLength={20} />
          {isAdmin && (
            <select className="vs-input" value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}>
              <option value="">All agents</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>{memberLabel(m)}</option>
              ))}
            </select>
          )}
          <input className="vs-input xl:col-span-2" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or phone" />
          <button className="vs-button-primary" onClick={() => void loadLeads()}>Apply</button>
	          <button className="vs-button-secondary" onClick={() => {
	            setStatus(''); setRange('today'); setCustomStart(''); setCustomEnd('');
	            setStateFilter(''); setAgentFilter(''); setLeadTypeFilter(''); setCampaignFilter(''); setSourceFilter(''); setSearch('');
	          }}>Reset</button>
        </div>
      </SectionCard>

      {/* ── leads table ── */}
      <SectionCard title="Live Leads" description="New rows appear automatically as leads arrive." className="mt-5" contentClassName="p-0">
        {error && (
          <div className="m-5 rounded-2xl border border-rose-400/20 bg-rose-400/[0.08] px-4 py-3 text-sm text-rose-200">{error}</div>
        )}
        {!loading && leads.length === 0 ? (
          <div className="p-5">
            <EmptyStatePanel
              title="No leads found"
              description="When McGraw Now posts a lead to /api/leads/inbound it will appear here."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-white/[0.04] text-[11px] uppercase tracking-[0.18em] text-slate-500">
                <tr>
	                  <th className="px-5 py-3">Received</th>
	                  <th className="px-5 py-3">Source</th>
	                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Campaign</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Phone</th>
                  <th className="px-5 py-3">State</th>
                  <th className="px-5 py-3">Debt</th>
                  <th className="px-5 py-3">Trusted ID</th>
                  <th className="px-5 py-3">Form #</th>
                  <th className="px-5 py-3">IP</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Agent</th>
                  <th className="px-5 py-3">Attempts</th>
                  <th className="px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.035]">
                {leads.map((lead) => {
                  const revealed = revealedPhones.has(lead.id);
                  const agent = lead.assigned_agent_id ? memberById[lead.assigned_agent_id] : null;
                  return (
                    <tr
                      key={lead.id}
                      onClick={() => setSelectedLead(lead)}
                      className={`cursor-pointer transition ${
                        highlightedIds.has(lead.id)
                          ? 'bg-emerald-400/[0.08]'
                          : 'hover:bg-white/[0.025]'
                      }`}
                    >
	                      <td className="px-5 py-4 text-slate-300">{formatTimeAgo(lead.received_at)}</td>
	                      <td className="px-5 py-4 text-slate-300">{String(lead.source || 'manual_upload').replace(/_/g, ' ')}</td>
	                      <td className="px-5 py-4 font-medium text-white">{leadName(lead)}</td>
                      <td className="px-5 py-4 text-slate-300">
                        {lead.campaign_name || lead.campaign_id || lead.opt_in_source || '-'}
                      </td>
                      <td className="px-5 py-4 text-slate-300">{String(lead.lead_type || '-').replace(/_/g, ' ')}</td>
                      <td className="px-5 py-4 text-slate-300">
                        <span>{maskPhone(lead.phone, revealed || isAdmin)}</span>
                        {!isAdmin && !revealed && (
                          <button
                            className="ml-2 text-xs text-cyan-200"
                            onClick={(e) => { e.stopPropagation(); setRevealedPhones((p) => new Set(p).add(lead.id)); }}
                          >reveal</button>
                        )}
                      </td>
                      <td className="px-5 py-4 text-slate-300">{lead.state || '-'}</td>
                      <td className="px-5 py-4 text-slate-300">{formatMoney(lead.debt_amount)}</td>
                      <td className="px-5 py-4 font-mono text-xs text-slate-400">
                        {lead.trusted_id ? lead.trusted_id.slice(0, 14) + (lead.trusted_id.length > 14 ? '…' : '') : '-'}
                      </td>
                      <td className="px-5 py-4 text-slate-400">{lead.form_number || '-'}</td>
                      <td className="px-5 py-4 font-mono text-xs text-slate-500">{lead.ip_address || '-'}</td>
                      <td className="px-5 py-4">
                        <StatusBadge tone={statusTone(lead.status)}>
                          {String(lead.status || 'new').replace(/_/g, ' ')}
                        </StatusBadge>
                      </td>
                      <td className="px-5 py-4 text-slate-400 text-xs">
                        {agent ? memberLabel(agent) : lead.assigned_agent_id ? lead.assigned_agent_id.slice(0, 8) : '-'}
                      </td>
                      <td className="px-5 py-4 text-slate-300">{lead.call_attempts || 0}</td>
                      <td className="px-5 py-4">
                        <div className="flex gap-2">
                          <button
                            className="vs-button-primary"
                            onClick={(e) => { e.stopPropagation(); void onCallLead(lead); }}
                            data-log="Call lead"
                          >Call</button>
                          <button
                            className="vs-button-secondary"
                            onClick={(e) => { e.stopPropagation(); void updateSelected(lead, { assign_to_me: true }); }}
                            data-log="Assign lead to me"
                          >Assign Me</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {isAdmin && (
        <SectionCard
          title="Campaign & Lead Type Routing"
          description="Route McGraw Now campaigns and lead verticals to the correct client organization."
          className="mt-5"
          contentClassName="p-4"
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <input
              className="vs-input"
              value={leadSourceForm.source_name}
              onChange={(e) => setLeadSourceForm((form) => ({ ...form, source_name: e.target.value }))}
              placeholder="Source"
            />
            <input
              className="vs-input"
              value={leadSourceForm.campaign_id}
              onChange={(e) => setLeadSourceForm((form) => ({ ...form, campaign_id: e.target.value }))}
              placeholder="Campaign ID"
            />
            <input
              className="vs-input"
              value={leadSourceForm.campaign_name}
              onChange={(e) => setLeadSourceForm((form) => ({ ...form, campaign_name: e.target.value }))}
              placeholder="Campaign name"
            />
            <input
              className="vs-input"
              value={leadSourceForm.lead_type}
              onChange={(e) => setLeadSourceForm((form) => ({ ...form, lead_type: e.target.value }))}
              placeholder="Lead type"
            />
            <select
              className="vs-input"
              value={leadSourceForm.organization_id}
              onChange={(e) => setLeadSourceForm((form) => ({ ...form, organization_id: e.target.value }))}
            >
              <option value="">Choose client</option>
              {orgs.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
            </select>
            <input
              className="vs-input"
              type="number"
              min={1}
              value={leadSourceForm.routing_priority}
              onChange={(e) => setLeadSourceForm((form) => ({ ...form, routing_priority: Number(e.target.value || 100) }))}
              placeholder="Priority"
            />
            <input
              className="vs-input xl:col-span-4"
              value={leadSourceForm.description}
              onChange={(e) => setLeadSourceForm((form) => ({ ...form, description: e.target.value }))}
              placeholder="Internal notes"
            />
            <label className="flex items-center gap-3 rounded-xl border border-white/[0.04] bg-white/[0.025] px-4 py-2 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={leadSourceForm.active}
                onChange={(e) => setLeadSourceForm((form) => ({ ...form, active: e.target.checked }))}
              />
              Active
            </label>
            <button className="vs-button-primary" disabled={savingLeadSource} onClick={() => void saveLeadSource()}>
              {savingLeadSource ? 'Saving...' : 'Add Route'}
            </button>
          </div>

          <div className="mt-5 overflow-x-auto rounded-2xl border border-white/[0.04]">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-white/[0.04] text-[11px] uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Campaign</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.035]">
                {leadSources.length === 0 ? (
                  <tr><td className="px-4 py-5 text-slate-400" colSpan={7}>No campaign routes configured yet.</td></tr>
                ) : leadSources.map((source) => (
                  <tr key={source.id}>
                    <td className="px-4 py-3 text-slate-300">{source.source_label || source.source_name}</td>
                    <td className="px-4 py-3 text-slate-300">
                      <div className="font-medium text-slate-100">{source.campaign_name || source.campaign_id || 'Any campaign'}</div>
                      {source.campaign_id && <div className="text-xs text-slate-500">{source.campaign_id}</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{source.lead_type || 'Any type'}</td>
                    <td className="px-4 py-3 text-slate-300">{source.organizations?.name || source.organization_id}</td>
                    <td className="px-4 py-3 text-slate-300">{source.routing_priority ?? 100}</td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={source.active ? 'success' : 'neutral'}>
                        {source.active ? 'Active' : 'Inactive'}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3">
                      <button className="vs-button-secondary" onClick={() => void toggleLeadSourceActive(source)}>
                        {source.active ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* ── Lead List Upload (admin + users with can_upload_leads) ── */}
      {(isAdmin || currentOrgRole === 'client') && (
        <SectionCard
          title="Upload Lead List"
          description="Upload a CSV file to bulk-import leads. First row must be column headers."
          className="mt-5"
          contentClassName="p-4"
        >
          {/* Drag-and-drop zone */}
          <div
            className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
              uploadDragging ? 'border-cyan-400 bg-cyan-400/[0.06]' : 'border-white/[0.08] bg-white/[0.015]'
            }`}
            onDragOver={(e) => { e.preventDefault(); setUploadDragging(true); }}
            onDragLeave={() => setUploadDragging(false)}
            onDrop={(e) => {
              e.preventDefault(); setUploadDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void handleFileUpload(file);
            }}
          >
            <div className="mb-3 text-3xl">📋</div>
            <p className="text-sm font-medium text-slate-200">Drag &amp; drop a CSV file here</p>
            <p className="mt-1 text-xs text-slate-500">or click to browse — max 5,000 rows</p>
            <input
              type="file"
              accept=".csv,text/csv"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              disabled={uploadLoading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFileUpload(file);
                e.target.value = '';
              }}
            />
          </div>

          {/* Options row */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {isAdmin && (
              <select
                className="vs-input"
                value={uploadTarget}
                onChange={(e) => setUploadTarget(e.target.value)}
              >
                <option value="all">Assign to org (no specific agent)</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>{memberLabel(m)}</option>
                ))}
              </select>
            )}
            {uploadLoading && (
              <span className="animate-pulse text-sm text-cyan-400">Uploading…</span>
            )}
          </div>

          {/* Result */}
          {uploadResult && (
            <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-3 text-sm text-emerald-200">
              ✓ <strong>{uploadResult.inserted}</strong> leads imported from <em>{uploadFileName}</em>
              {uploadResult.failed > 0 && (
                <span className="ml-2 text-yellow-300">({uploadResult.failed} skipped — missing phone &amp; email)</span>
              )}
            </div>
          )}

          {/* CSV format hint */}
          <details className="mt-4">
            <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-200">Accepted column names</summary>
            <p className="mt-2 rounded-xl bg-black/20 p-3 font-mono text-xs text-slate-300">
              first_name, last_name, phone, email, state, city, zip_code, address, debt_amount, campaign_id, campaign_name, lead_type, notes
            </p>
          </details>
        </SectionCard>
      )}

      {/* ── Upload history ── */}
      {(isAdmin || currentOrgRole === 'client') && uploadHistory.length > 0 && (
        <SectionCard title="Recent Uploads" className="mt-5" contentClassName="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-white/[0.04] text-[11px] uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">File rows</th>
                  <th className="px-4 py-3">Imported</th>
                  <th className="px-4 py-3">Skipped</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {uploadHistory.map((u: any) => (
                  <tr key={u.id}>
                    <td className="px-4 py-3 text-slate-300">{u.created_at ? new Date(u.created_at).toLocaleString() : '-'}</td>
                    <td className="px-4 py-3 text-slate-300">{u.row_count ?? '-'}</td>
                    <td className="px-4 py-3 text-emerald-300">{u.inserted_count ?? 0}</td>
                    <td className="px-4 py-3 text-yellow-300">{u.failed_count ?? 0}</td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={u.status === 'complete' ? 'success' : u.status === 'partial' ? 'warning' : 'neutral'}>
                        {u.status || 'unknown'}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* ── Upload permissions (admin only) ── */}
      {isAdmin && (
        <SectionCard
          title="Upload Permissions"
          description="Control which non-admin users can upload lead lists."
          className="mt-5"
          contentClassName="p-4"
        >
          {loadingUploadPerms ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : uploadPermissions.length === 0 ? (
            <p className="text-sm text-slate-400">No members found for selected org. Select an org to filter.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {uploadPermissions.map((u: any) => (
                <label key={u.id} className="flex items-center justify-between rounded-xl border border-white/[0.04] bg-white/[0.025] px-4 py-3 cursor-pointer hover:bg-white/[0.04]">
                  <div>
                    <div className="text-sm font-medium text-slate-100">{u.full_name || u.email || u.id.slice(0, 8)}</div>
                    <div className="text-xs text-slate-500">{u.email}{u.global_role ? ` · ${u.global_role}` : ''}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{u.can_upload_leads ? 'Enabled' : 'Disabled'}</span>
                    <button
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${u.can_upload_leads ? 'bg-cyan-500' : 'bg-slate-700'}`}
                      onClick={() => void toggleUploadPermission(u)}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${u.can_upload_leads ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </label>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {/* ── visibility settings (admin only) ── */}
      {isAdmin && selectedOrgId && (
        <SectionCard
          title="Leads Page Visibility"
          description="Control which roles can access this page within the selected organization."
          className="mt-5"
          contentClassName="p-4"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-cyan-500"
                checked={visibility.agents}
                onChange={(e) => setVisibility((v) => ({ ...v, agents: e.target.checked }))}
              />
              <span className="text-sm text-slate-200">Agents can view leads</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-cyan-500"
                checked={visibility.clients}
                onChange={(e) => setVisibility((v) => ({ ...v, clients: e.target.checked }))}
              />
              <span className="text-sm text-slate-200">Clients can view leads</span>
            </label>
            <button
              className="vs-button-primary sm:ml-auto"
              disabled={savingVisibility}
              onClick={() => void saveVisibility(visibility)}
            >
              {savingVisibility ? 'Saving…' : 'Save Visibility'}
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            When a role is unchecked, members with that role see an "Access Restricted" screen instead of the leads table.
          </p>
        </SectionCard>
      )}

      {/* ── lead detail drawer ── */}
      {selectedLead && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-sm"
          onClick={() => setSelectedLead(null)}
        >
          <aside
            className="h-full w-full max-w-xl overflow-y-auto border-l border-white/[0.04] bg-slate-950 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Lead detail</div>
                <h2 className="mt-2 text-2xl font-semibold text-white">{leadName(selectedLead)}</h2>
                <p className="mt-1 text-sm text-slate-400">
                  {selectedLead.source || 'manual_upload'}
                  {selectedLead.source_lead_id ? ` · ${selectedLead.source_lead_id}` : ''}
                </p>
              </div>
              <button className="vs-button-secondary" onClick={() => setSelectedLead(null)}>Close</button>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Info label="Phone" value={selectedLead.phone} />
              <Info label="Email" value={selectedLead.email || '-'} />
              <Info label="State" value={selectedLead.state || '-'} />
              <Info label="Debt" value={formatMoney(selectedLead.debt_amount)} />
              <Info label="Campaign" value={selectedLead.campaign_name || selectedLead.campaign_id || '-'} />
              <Info label="Lead Type" value={String(selectedLead.lead_type || '-').replace(/_/g, ' ')} />
              <Info label="TCPA Consent" value={selectedLead.tcpa_consent ? 'Yes' : 'No'} />
              <Info label="TCPA Timestamp" value={selectedLead.tcpa_timestamp ? new Date(selectedLead.tcpa_timestamp).toLocaleString() : '-'} />
              <Info label="Received" value={selectedLead.received_at ? new Date(selectedLead.received_at).toLocaleString() : '-'} />
              <Info label="Call Attempts" value={String(selectedLead.call_attempts || 0)} />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Info label="Trusted ID" value={
                selectedLead.trusted_id
                  ? <span className="break-all font-mono text-xs">{selectedLead.trusted_id}</span>
                  : '-'
              } />
              <Info label="Form Number" value={selectedLead.form_number || '-'} />
              <Info label="IP Address" value={
                selectedLead.ip_address
                  ? <span className="font-mono text-xs">{selectedLead.ip_address}</span>
                  : '-'
              } />
              <Info label="Opt-in Source" value={selectedLead.opt_in_source || '-'} />
            </div>

            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-slate-500">Status</span>
                <select
                  className="vs-input w-full"
                  value={selectedLead.status || 'new'}
                  onChange={(e) => void updateSelected(selectedLead, { status: e.target.value })}
                >
                  {statusOptions.map((item) => (
                    <option key={item} value={item}>{item.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-slate-500">Assign to Agent</span>
                <select
                  className="vs-input w-full"
                  value={selectedLead.assigned_agent_id || ''}
                  onChange={(e) => {
                    const agentId = e.target.value;
                    if (agentId) void updateSelected(selectedLead, { assigned_agent_id: agentId });
                  }}
                >
                  <option value="">— Unassigned —</option>
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {memberLabel(m)}{m.role ? ` (${m.role})` : ''}
                    </option>
                  ))}
                </select>
                {selectedLead.assigned_at && (
                  <p className="mt-1 text-xs text-slate-500">
                    Assigned {formatTimeAgo(selectedLead.assigned_at)}
                  </p>
                )}
              </label>

              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-slate-500">Notes</span>
                <textarea
                  className="vs-input min-h-[120px] w-full"
                  value={selectedLead.notes || ''}
                  onChange={(e) => setSelectedLead({ ...selectedLead, notes: e.target.value })}
                  onBlur={() => void updateSelected(selectedLead, { notes: selectedLead.notes || '' })}
                />
              </label>

	              <div className="flex flex-wrap gap-2">
	                <button className="vs-button-primary" onClick={() => void onCallLead(selectedLead)}>
	                  Call Now
	                </button>
                <button className="vs-button-secondary" onClick={() => void updateSelected(selectedLead, { assign_to_me: true })}>
                  Assign to Me
                </button>
                <button className="vs-button-secondary" onClick={() => void updateSelected(selectedLead, { status: 'transferred' })}>
                  Mark Transferred
	                </button>
	              </div>
	            </div>

	            <div className="mt-6 rounded-3xl border border-white/[0.04] bg-white/[0.025] p-4">
	              <div className="flex items-center justify-between gap-3">
	                <div className="text-sm font-semibold text-slate-200">Activity Trail</div>
	                {loadingLeadActivity && <span className="text-xs text-slate-500">Loading...</span>}
	              </div>
	              <div className="mt-4 space-y-3">
	                {leadActivity.length === 0 && !loadingLeadActivity ? (
	                  <div className="text-sm text-slate-500">No tracked activity yet.</div>
	                ) : leadActivity.map((activity) => (
	                  <div key={activity.id} className="rounded-2xl border border-white/[0.035] bg-black/20 p-3">
	                    <div className="text-sm font-medium text-slate-100">{activityLabel(activity)}</div>
	                    <div className="mt-1 text-xs text-slate-500">
	                      {activity.created_at ? new Date(activity.created_at).toLocaleString() : '-'}
	                      {activity.actor_id ? ` - ${activity.actor_id.slice(0, 8)}` : ''}
	                    </div>
	                  </div>
	                ))}
	              </div>
	            </div>

	            {isAdmin && (
              <details className="mt-6 rounded-3xl border border-white/[0.04] bg-white/[0.025] p-4">
                <summary className="cursor-pointer text-sm font-semibold text-slate-200">Raw payload</summary>
                <pre className="mt-4 max-h-80 overflow-auto rounded-2xl bg-black/30 p-4 text-xs text-slate-300">
                  {JSON.stringify(selectedLead.raw_payload || {}, null, 2)}
                </pre>
              </details>
            )}
          </aside>
        </div>
      )}
    </PageLayout>
  );
}

// ─── Info tile ────────────────────────────────────────────────────────────────

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/[0.03] bg-white/[0.025] p-4">
      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-2 break-words text-sm font-medium text-slate-100">{value}</div>
    </div>
  );
}
