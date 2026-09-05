import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import {
  EmptyStatePanel, ErrorStatePanel, FilterBar, LoadingSkeleton, MetricStatCard,
  SearchInput, SectionCard, SegmentedControl, StatusBadge,
} from '../components/DashboardPrimitives';
import { useToast } from '../contexts/ToastContext';
import {
  createCrmActivity, createCrmCompany, createCrmContact, createCrmDeal, createCrmTask,
  CrmActivity, CrmCompany, CrmContact, CrmDeal, CrmTask, getCrmBootstrap,
  getCrmCompany, PipelineStage, updateCrmDeal, updateCrmTask,
  getCrmSavedViews, saveCrmView,
} from '../lib/apiClient';

type View = 'pipeline' | 'companies' | 'contacts';
type Modal = 'company' | 'contact' | 'deal' | 'call' | 'note' | 'task' | null;

function ModalShell({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <section role="dialog" aria-modal="true" aria-label={title} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_28px_80px_rgba(15,23,42,0.28)]" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="text-lg font-black text-slate-950">{title}</h2><p className="mt-1 text-sm text-slate-500">{description}</p></div>
          <button type="button" onClick={onClose} className="vs-button-ghost h-9 w-9" aria-label="Close">×</button>
        </div>
        <div className="mt-5">{children}</div>
      </section>
    </div>
  );
}

const inputClass = 'vs-input h-10 w-full';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase text-slate-600">{label}</span>{children}</label>;
}

function contactName(contact?: CrmContact | null) {
  return contact ? `${contact.first_name} ${contact.last_name || ''}`.trim() : 'No primary contact';
}

export default function CrmPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [internalOrgId, setInternalOrgId] = useState<string | null>(null);
  const [view, setView] = useState<View>('pipeline');
  const [modal, setModal] = useState<Modal>(null);
  const [companies, setCompanies] = useState<CrmCompany[]>([]);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [deals, setDeals] = useState<CrmDeal[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [industry, setIndustry] = useState('all');
  const [stageFilter, setStageFilter] = useState('all');
  const [selectedCompany, setSelectedCompany] = useState<CrmCompany | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<CrmDeal | null>(null);
  const [companyActivities, setCompanyActivities] = useState<CrmActivity[]>([]);
  const [companyTasks, setCompanyTasks] = useState<CrmTask[]>([]);
  const [draggingDeal, setDraggingDeal] = useState<string | null>(null);
  const [savedViews, setSavedViews] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await getCrmBootstrap();
      setInternalOrgId(data.organization_id);
      setCompanies(data.companies); setContacts(data.contacts); setDeals(data.deals); setStages(data.stages);
      void getCrmSavedViews().then(result => setSavedViews(result.items)).catch(() => setSavedViews([]));
    } catch (err: any) { setError(err?.message || 'Unable to load CRM data.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const industries = useMemo(() => Array.from(new Set(companies.map((company) => company.industry).filter(Boolean) as string[])).sort(), [companies]);
  const matches = useCallback((...values: Array<string | null | undefined>) => {
    const query = search.trim().toLowerCase();
    return !query || values.some((value) => String(value || '').toLowerCase().includes(query));
  }, [search]);
  const filteredCompanies = companies.filter((company) => (industry === 'all' || company.industry === industry) && matches(company.name, company.phone, company.industry, company.city, company.state));
  const filteredContacts = contacts.filter((contact) => matches(contact.first_name, contact.last_name, contact.email, contact.phone, contact.company?.name));
  const filteredDeals = deals.filter((deal) => (stageFilter === 'all' || deal.stage_id === stageFilter) && matches(deal.title, deal.company?.name, contactName(deal.primary_contact), deal.next_action));

  const submitCompany = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!internalOrgId) return;
    const form = new FormData(event.currentTarget); setSaving(true);
    try {
      await createCrmCompany({ organization_id: internalOrgId, name: form.get('name'), phone: form.get('phone') || null, city: form.get('city') || null, state: form.get('state') || null, industry: form.get('industry') || null, source: form.get('source') || null, notes: form.get('notes') || null, tags: String(form.get('tags') || '').split(',').map((tag) => tag.trim()).filter(Boolean) });
      toast.push('Company added to CRM', 'success'); setModal(null); await load();
    } catch (err: any) { toast.push(err?.message || 'Could not create company', 'error'); }
    finally { setSaving(false); }
  };

  const submitContact = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!internalOrgId) return;
    const form = new FormData(event.currentTarget); setSaving(true);
    try {
      await createCrmContact({ organization_id: internalOrgId, company_id: form.get('company_id') || null, first_name: form.get('first_name'), last_name: form.get('last_name') || null, title: form.get('title') || null, phone: form.get('phone') || null, email: form.get('email') || null, tags: String(form.get('tags') || '').split(',').map((tag) => tag.trim()).filter(Boolean) });
      toast.push('Contact added to CRM', 'success'); setModal(null); await load();
    } catch (err: any) { toast.push(err?.message || 'Could not create contact', 'error'); }
    finally { setSaving(false); }
  };

  const submitDeal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!internalOrgId) return;
    const form = new FormData(event.currentTarget); setSaving(true);
    try {
      await createCrmDeal({ organization_id: internalOrgId, company_id: form.get('company_id'), primary_contact_id: form.get('primary_contact_id') || null, stage_id: form.get('stage_id'), title: form.get('title'), next_action: form.get('next_action') || null });
      toast.push('Opportunity added to pipeline', 'success'); setModal(null); await load();
    } catch (err: any) { toast.push(err?.message || 'Could not create opportunity', 'error'); }
    finally { setSaving(false); }
  };

  const moveDeal = async (dealId: string, stageId: string) => {
    const deal = deals.find((item) => item.id === dealId);
    if (!deal || deal.stage_id === stageId) return;
    const previous = deals;
    setDeals((items) => items.map((item) => item.id === dealId ? { ...item, stage_id: stageId } : item));
    try { await updateCrmDeal(dealId, { stage_id: stageId }); toast.push('Pipeline stage updated', 'success'); }
    catch (err: any) { setDeals(previous); toast.push(err?.message || 'Could not move opportunity', 'error'); }
    finally { setDraggingDeal(null); }
  };

  const openCompany = async (company: CrmCompany) => {
    setSelectedCompany(company); setCompanyActivities([]); setCompanyTasks([]);
    try {
      const detail = await getCrmCompany(company.id);
      setSelectedCompany(detail.item); setCompanyActivities(detail.activities); setCompanyTasks(detail.tasks);
    } catch (err: any) { toast.push(err?.message || 'Could not load company history', 'error'); }
  };

  const openAction = (kind: 'call' | 'note' | 'task', deal?: CrmDeal) => {
    setSelectedDeal(deal || deals.find((item) => item.company_id === selectedCompany?.id) || null);
    setModal(kind);
  };

  const submitActivity = async (event: FormEvent<HTMLFormElement>, type: 'call' | 'note') => {
    event.preventDefault(); if (!internalOrgId) return;
    const form = new FormData(event.currentTarget);
    const companyId = selectedDeal?.company_id || selectedCompany?.id;
    if (!companyId) return;
    setSaving(true);
    try {
      const metadata = type === 'call' ? {
        direction: form.get('direction'), outcome: form.get('outcome'),
        duration_minutes: Number(form.get('duration_minutes') || 0),
        response_time_minutes: form.get('response_time_minutes') ? Number(form.get('response_time_minutes')) : null,
      } : {};
      const result = await createCrmActivity({ organization_id: internalOrgId, company_id: companyId, contact_id: selectedDeal?.primary_contact_id || null, deal_id: selectedDeal?.id || null, type, body: form.get('body') || null, metadata });
      toast.push(result.advanced_to_stage_id ? 'Activity logged and pipeline advanced' : `${type === 'call' ? 'Call' : 'Note'} logged`, 'success');
      setModal(null); await load(); if (selectedCompany) await openCompany(selectedCompany);
    } catch (err: any) { toast.push(err?.message || 'Could not log activity', 'error'); }
    finally { setSaving(false); }
  };

  const submitTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!internalOrgId) return;
    const form = new FormData(event.currentTarget);
    const companyId = selectedDeal?.company_id || selectedCompany?.id;
    if (!companyId) return;
    setSaving(true);
    try {
      await createCrmTask({ organization_id: internalOrgId, company_id: companyId, contact_id: selectedDeal?.primary_contact_id || null, deal_id: selectedDeal?.id || null, title: form.get('title'), description: form.get('description') || null, due_date: new Date(String(form.get('due_date'))).toISOString() });
      toast.push('Task scheduled', 'success'); setModal(null); if (selectedCompany) await openCompany(selectedCompany);
    } catch (err: any) { toast.push(err?.message || 'Could not schedule task', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <PageLayout title="CRM" description="Companies, contacts, and opportunities in the internal Victory Sync workspace." eyebrow="Revenue workspace" actions={<div className="flex flex-wrap gap-2"><button className="vs-button-secondary" onClick={() => navigate('/crm/data')}>Import & data</button><button className="vs-button-secondary" onClick={() => navigate('/crm/tasks')}>Tasks</button><button className="vs-button-secondary" onClick={() => navigate('/crm/settings')}>Pipeline settings</button><button className="vs-button-secondary" onClick={() => setModal('contact')}>Add contact</button><button className="vs-button-primary" onClick={() => setModal(view === 'pipeline' ? 'deal' : 'company')}>{view === 'pipeline' ? 'Add opportunity' : 'Add company'}</button></div>}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricStatCard label="Companies" value={companies.length} hint="Organizations in this workspace" accent="violet" />
        <MetricStatCard label="Contacts" value={contacts.length} hint="People linked to accounts" accent="cyan" />
        <MetricStatCard label="Open opportunities" value={deals.filter((deal) => !stages.find((stage) => stage.id === deal.stage_id)?.is_closed).length} hint="Active pipeline records" accent="amber" />
        <MetricStatCard label="Clients" value={deals.filter((deal) => stages.find((stage) => stage.id === deal.stage_id)?.is_won).length} hint="Opportunities in won stages" accent="emerald" />
      </div>

      <div className="mt-5 space-y-4">
        <FilterBar>
          <SegmentedControl value={view} onChange={setView} options={[{ value: 'pipeline', label: 'Pipeline', count: deals.length }, { value: 'companies', label: 'Companies', count: companies.length }, { value: 'contacts', label: 'Contacts', count: contacts.length }]} />
          <SearchInput value={search} onChange={setSearch} placeholder="Search CRM records..." />
          {view === 'pipeline' && <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)} className={inputClass + ' sm:w-48'}><option value="all">All stages</option>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select>}
          {view === 'companies' && <select value={industry} onChange={(event) => setIndustry(event.target.value)} className={inputClass + ' sm:w-48'}><option value="all">All industries</option>{industries.map((item) => <option key={item}>{item}</option>)}</select>}
          {savedViews.filter(item => item.object_type === (view === 'pipeline' ? 'deals' : view)).length > 0 && <select className={inputClass + ' sm:w-44'} defaultValue="" onChange={event => { const item=savedViews.find(saved => saved.id===event.target.value); if(!item)return; setSearch(item.filters?.search || ''); setIndustry(item.filters?.industry || 'all'); setStageFilter(item.filters?.stage_id || 'all'); }}><option value="">Saved views</option>{savedViews.filter(item => item.object_type === (view === 'pipeline' ? 'deals' : view)).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
          <button type="button" className="vs-button-ghost" onClick={async () => { const name=window.prompt('Name this view'); if(!name)return; await saveCrmView({object_type:view === 'pipeline' ? 'deals' : view,name,filters:{search,industry,stage_id:stageFilter}}); toast.push('View saved','success'); const result=await getCrmSavedViews(); setSavedViews(result.items); }}>Save view</button>
        </FilterBar>

        {error && <ErrorStatePanel error={error} onRetry={() => void load()} />}
        {loading ? <div className="grid gap-4 lg:grid-cols-3"><LoadingSkeleton className="h-80" /><LoadingSkeleton className="h-80" /><LoadingSkeleton className="h-80" /></div> : null}

        {!loading && !error && view === 'pipeline' && (
          stages.length ? <div className="flex gap-4 overflow-x-auto pb-4">
            {stages.map((stage) => {
              const stageDeals = filteredDeals.filter((deal) => deal.stage_id === stage.id);
              return <section key={stage.id} className={`w-[300px] shrink-0 rounded-2xl border bg-slate-100/80 p-3 transition ${draggingDeal ? 'border-violet-200' : 'border-slate-200'}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void moveDeal(event.dataTransfer.getData('text/crm-deal'), stage.id); }}>
                <header className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-black text-slate-900">{stage.name}</h2><p className="text-xs text-slate-500">Position {stage.position}</p></div><StatusBadge tone={stage.is_won ? 'success' : stage.is_closed ? 'danger' : 'violet'}>{stageDeals.length}</StatusBadge></header>
                <div className="space-y-3 min-h-[160px]">{stageDeals.map((deal) => <article key={deal.id} draggable onDragStart={(event) => { event.dataTransfer.setData('text/crm-deal', deal.id); event.dataTransfer.effectAllowed = 'move'; setDraggingDeal(deal.id); }} onDragEnd={() => setDraggingDeal(null)} className={`cursor-grab rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md active:cursor-grabbing ${draggingDeal === deal.id ? 'opacity-50' : ''}`}>
                  <div className="text-sm font-black text-slate-950">{deal.company?.name || deal.title}</div><div className="mt-1 text-xs font-semibold text-slate-600">{contactName(deal.primary_contact)}</div>{(deal.primary_contact?.phone || deal.company?.phone) && <div className="mt-2 text-xs text-slate-500">{deal.primary_contact?.phone || deal.company?.phone}</div>}<div className="mt-3 line-clamp-1 rounded-xl bg-violet-50 px-3 py-2 text-xs font-medium text-violet-800">{deal.next_action || 'No next action set'}</div>
                  <div className="mt-3 flex gap-2"><button type="button" draggable={false} onClick={() => openAction('call', deal)} className="vs-button-secondary flex-1 py-1.5 text-xs">Log call</button><button type="button" draggable={false} disabled={!deal.company} onClick={() => navigate(`/crm/companies/${deal.company_id}`)} className="vs-button-ghost px-2 py-1.5 text-xs">Open</button></div>
                </article>)}{!stageDeals.length && <div className="rounded-xl border border-dashed border-slate-300 px-3 py-8 text-center text-xs text-slate-500">Drop an opportunity here</div>}</div>
              </section>;
            })}
          </div> : <EmptyStatePanel title="Pipeline stages are not available" description="Apply the CRM migration to seed stages for this organization." />
        )}

        {!loading && !error && view === 'companies' && <SectionCard title="Companies" description="Account records in the selected organization" actions={<button className="vs-button-primary" onClick={() => setModal('company')}>Add company</button>}>
          {filteredCompanies.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{filteredCompanies.map((company) => <button key={company.id} onClick={() => navigate(`/crm/companies/${company.id}`)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md"><div className="flex items-start justify-between gap-3"><div><h3 className="font-black text-slate-950">{company.name}</h3><p className="mt-1 text-sm text-slate-500">{company.industry || 'Industry not set'}</p></div><StatusBadge tone="neutral">{contacts.filter((contact) => contact.company_id === company.id).length} contacts</StatusBadge></div><div className="mt-4 text-sm text-slate-600">{company.phone || 'No phone'}</div><div className="mt-1 text-xs text-slate-500">{[company.city, company.state].filter(Boolean).join(', ') || 'Location not set'}</div></button>)}</div> : <EmptyStatePanel title="No companies found" description="Add the first company or change the current filters." />}
        </SectionCard>}

        {!loading && !error && view === 'contacts' && <SectionCard title="Contacts" description="People and their linked companies" actions={<button className="vs-button-primary" onClick={() => setModal('contact')}>Add contact</button>}>
          {filteredContacts.length ? <div className="divide-y divide-slate-100">{filteredContacts.map((contact) => <div key={contact.id} className="grid gap-2 px-1 py-4 sm:grid-cols-[1.4fr_1fr_1fr] sm:items-center"><div><div className="font-bold text-slate-950">{contactName(contact)}</div><div className="text-xs text-slate-500">{contact.title || 'Role not set'}</div></div><div className="text-sm text-slate-600">{contact.company?.name || companies.find((company) => company.id === contact.company_id)?.name || 'No company'}</div><div className="text-sm text-slate-600 sm:text-right"><div>{contact.phone || 'No phone'}</div><div className="text-xs text-slate-500">{contact.email || 'No email'}</div></div></div>)}</div> : <EmptyStatePanel title="No contacts found" description="Add the first contact or change your search." />}
        </SectionCard>}
      </div>

      {selectedCompany && !modal && <ModalShell title={selectedCompany.name} description="Company record and activity timeline" onClose={() => setSelectedCompany(null)}><div className="flex flex-wrap gap-2"><button className="vs-button-primary" onClick={() => openAction('call')}>Log call</button><button className="vs-button-secondary" onClick={() => openAction('note')}>Add note</button><button className="vs-button-secondary" onClick={() => openAction('task')}>Add task</button></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-slate-50 p-3"><div className="text-xs font-bold uppercase text-slate-500">Phone</div><div className="mt-1 text-sm text-slate-900">{selectedCompany.phone || 'Not set'}</div></div><div className="rounded-xl bg-slate-50 p-3"><div className="text-xs font-bold uppercase text-slate-500">Industry</div><div className="mt-1 text-sm text-slate-900">{selectedCompany.industry || 'Not set'}</div></div></div><div className="mt-5"><h3 className="text-sm font-black text-slate-950">Activity timeline</h3><div className="mt-2 space-y-2">{companyActivities.map((activity) => <div key={activity.id} className="rounded-xl border border-slate-200 p-3"><div className="flex justify-between gap-3"><StatusBadge tone={activity.type === 'call' ? 'info' : activity.type === 'stage_change' ? 'violet' : 'neutral'}>{activity.type.replace('_', ' ')}</StatusBadge><span className="text-xs text-slate-400">{new Date(activity.occurred_at).toLocaleString()}</span></div><p className="mt-2 text-sm text-slate-700">{activity.body || (activity.type === 'call' ? `${activity.metadata.direction || ''} call · ${activity.metadata.outcome || 'No outcome'}` : 'Activity recorded')}</p></div>)}{!companyActivities.length && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No activity recorded yet.</p>}</div></div><div className="mt-5"><h3 className="text-sm font-black text-slate-950">Tasks</h3><div className="mt-2 space-y-2">{companyTasks.map((task) => <label key={task.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm"><input type="checkbox" checked={task.completed} onChange={async (event) => { await updateCrmTask(task.id, event.target.checked); await openCompany(selectedCompany); }} /><span className={task.completed ? 'text-slate-400 line-through' : 'text-slate-700'}>{task.title} · {new Date(task.due_date).toLocaleString()}</span></label>)}{!companyTasks.length && <p className="text-sm text-slate-500">No tasks scheduled.</p>}</div></div></ModalShell>}

      {modal === 'company' && <ModalShell title="Add company" description="Create an account record in this CRM workspace." onClose={() => setModal(null)}><form onSubmit={submitCompany} className="grid gap-4"><Field label="Company name"><input name="name" required maxLength={240} className={inputClass} autoFocus /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Phone"><input name="phone" className={inputClass} /></Field><Field label="Industry"><input name="industry" className={inputClass} /></Field><Field label="City"><input name="city" className={inputClass} /></Field><Field label="State"><input name="state" className={inputClass} /></Field></div><Field label="Source"><input name="source" className={inputClass} /></Field><Field label="Tags (comma separated)"><input name="tags" className={inputClass} /></Field><Field label="Notes"><textarea name="notes" rows={3} className="vs-input w-full" /></Field><button disabled={saving} className="vs-button-primary">{saving ? 'Saving...' : 'Create company'}</button></form></ModalShell>}
      {modal === 'contact' && <ModalShell title="Add contact" description="Create a person and optionally link them to a company." onClose={() => setModal(null)}><form onSubmit={submitContact} className="grid gap-4"><div className="grid gap-4 sm:grid-cols-2"><Field label="First name"><input name="first_name" required className={inputClass} autoFocus /></Field><Field label="Last name"><input name="last_name" className={inputClass} /></Field></div><Field label="Company"><select name="company_id" className={inputClass}><option value="">No company</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></Field><Field label="Role / title"><input name="title" className={inputClass} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Phone"><input name="phone" className={inputClass} /></Field><Field label="Email"><input name="email" type="email" className={inputClass} /></Field></div><Field label="Tags (comma separated)"><input name="tags" className={inputClass} /></Field><button disabled={saving} className="vs-button-primary">{saving ? 'Saving...' : 'Create contact'}</button></form></ModalShell>}
      {modal === 'deal' && <ModalShell title="Add opportunity" description="Place a company and contact into the configurable pipeline." onClose={() => setModal(null)}><form onSubmit={submitDeal} className="grid gap-4"><Field label="Opportunity title"><input name="title" required className={inputClass} autoFocus /></Field><Field label="Company"><select name="company_id" required className={inputClass}><option value="">Select company</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></Field><Field label="Primary contact"><select name="primary_contact_id" className={inputClass}><option value="">No primary contact</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contactName(contact)}</option>)}</select></Field><Field label="Stage"><select name="stage_id" required className={inputClass}>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></Field><Field label="Next action"><input name="next_action" className={inputClass} placeholder="e.g. Call Tuesday to confirm trial" /></Field>{!companies.length && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Create a company before adding an opportunity.</p>}<button disabled={saving || !companies.length || !stages.length} className="vs-button-primary">{saving ? 'Saving...' : 'Create opportunity'}</button></form></ModalShell>}
      {modal === 'call' && <ModalShell title="Log call" description={`Record a call for ${selectedDeal?.company?.name || selectedCompany?.name || 'this company'}.`} onClose={() => setModal(null)}><form onSubmit={(event) => void submitActivity(event, 'call')} className="grid gap-4"><div className="grid gap-4 sm:grid-cols-2"><Field label="Direction"><select name="direction" className={inputClass}><option value="outbound">Outbound</option><option value="inbound">Inbound</option></select></Field><Field label="Outcome"><select name="outcome" className={inputClass}><option value="connected">Connected</option><option value="no_answer">No answer</option><option value="voicemail">Voicemail</option><option value="callback">Callback requested</option><option value="qualified">Qualified</option><option value="trial_booked">Trial booked</option><option value="not_interested">Not interested</option></select></Field><Field label="Duration (minutes)"><input name="duration_minutes" type="number" min="0" className={inputClass} /></Field><Field label="Response time (inbound minutes)"><input name="response_time_minutes" type="number" min="0" className={inputClass} /></Field></div><Field label="Call notes"><textarea name="body" rows={4} className="vs-input w-full" autoFocus /></Field><button disabled={saving} className="vs-button-primary">{saving ? 'Saving...' : 'Log call'}</button></form></ModalShell>}
      {modal === 'note' && <ModalShell title="Add note" description="Add a note to the unified company timeline." onClose={() => setModal(null)}><form onSubmit={(event) => void submitActivity(event, 'note')} className="grid gap-4"><Field label="Note"><textarea name="body" required rows={6} className="vs-input w-full" autoFocus /></Field><button disabled={saving} className="vs-button-primary">{saving ? 'Saving...' : 'Add note'}</button></form></ModalShell>}
      {modal === 'task' && <ModalShell title="Add task" description="Schedule a reminder linked to this company." onClose={() => setModal(null)}><form onSubmit={submitTask} className="grid gap-4"><Field label="Task title"><input name="title" required className={inputClass} autoFocus /></Field><Field label="Due date"><input name="due_date" type="datetime-local" required className={inputClass} /></Field><Field label="Description"><textarea name="description" rows={4} className="vs-input w-full" /></Field><button disabled={saving} className="vs-button-primary">{saving ? 'Saving...' : 'Schedule task'}</button></form></ModalShell>}
    </PageLayout>
  );
}
