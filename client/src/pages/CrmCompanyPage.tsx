import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import { EmptyStatePanel, LoadingSkeleton, SectionCard, StatusBadge } from '../components/DashboardPrimitives';
import { useToast } from '../contexts/ToastContext';
import { createCrmActivity, createCrmTask, CrmActivity, CrmCompany, CrmContact, CrmDeal, CrmTask, getCrmCompany, updateCrmCompany, updateCrmTask } from '../lib/apiClient';

const field = 'vs-input h-10 w-full';

export default function CrmCompanyPage() {
  const { companyId = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [company, setCompany] = useState<CrmCompany | null>(null);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [deals, setDeals] = useState<CrmDeal[]>([]);
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [activityType, setActivityType] = useState<'note' | 'call' | 'email'>('note');

  const load = useCallback(async () => {
    setLoading(true);
    try { const data = await getCrmCompany(companyId); setCompany(data.item); setContacts(data.contacts); setDeals(data.deals); setActivities(data.activities); setTasks(data.tasks); }
    catch (error: any) { toast.push(error?.message || 'Unable to load company', 'error'); }
    finally { setLoading(false); }
  }, [companyId]);
  useEffect(() => { void load(); }, [load]);

  const saveCompany = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!company) return; const data = new FormData(event.currentTarget);
    const custom: Record<string, string> = {};
    String(data.get('custom_fields') || '').split('\n').forEach((line) => { const at = line.indexOf(':'); if (at > 0) custom[line.slice(0, at).trim()] = line.slice(at + 1).trim(); });
    try { await updateCrmCompany(company.id, { name: data.get('name'), phone: data.get('phone') || null, industry: data.get('industry') || null, city: data.get('city') || null, state: data.get('state') || null, source: data.get('source') || null, notes: data.get('notes') || null, tags: String(data.get('tags') || '').split(',').map(x => x.trim()).filter(Boolean), custom_fields: custom }); toast.push('Company properties saved', 'success'); setEditing(false); await load(); }
    catch (error: any) { toast.push(error?.message || 'Unable to save company', 'error'); }
  };

  const logActivity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!company) return; const data = new FormData(event.currentTarget);
    try { await createCrmActivity({ organization_id: company.organization_id, company_id: company.id, contact_id: data.get('contact_id') || null, deal_id: data.get('deal_id') || null, type: activityType, body: data.get('body'), metadata: activityType === 'call' ? { direction: data.get('direction'), outcome: data.get('outcome'), duration_minutes: Number(data.get('duration') || 0) } : {} }); toast.push('Activity added to timeline', 'success'); event.currentTarget.reset(); await load(); }
    catch (error: any) { toast.push(error?.message || 'Unable to log activity', 'error'); }
  };

  const addTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!company) return; const data = new FormData(event.currentTarget);
    try { await createCrmTask({ organization_id: company.organization_id, company_id: company.id, title: data.get('title'), due_date: new Date(String(data.get('due_date'))).toISOString(), description: data.get('description') || null }); toast.push('Task scheduled', 'success'); event.currentTarget.reset(); await load(); }
    catch (error: any) { toast.push(error?.message || 'Unable to create task', 'error'); }
  };

  if (loading) return <PageLayout title="Company record"><LoadingSkeleton className="h-[520px]" /></PageLayout>;
  if (!company) return <PageLayout title="Company record"><EmptyStatePanel title="Company not found" description="This CRM record is unavailable." /></PageLayout>;
  const customText = Object.entries(company.custom_fields || {}).map(([key, value]) => `${key}: ${String(value)}`).join('\n');

  return <PageLayout title={company.name} eyebrow="CRM company" description={[company.industry, company.city, company.state].filter(Boolean).join(' · ') || 'Company record'} actions={<><button className="vs-button-secondary" onClick={() => navigate('/crm')}>Back to pipeline</button><button className="vs-button-primary" onClick={() => setEditing(x => !x)}>{editing ? 'Cancel editing' : 'Edit properties'}</button></>}>
    <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)_340px]">
      <div className="space-y-5"><SectionCard title="Properties">{editing ? <form onSubmit={saveCompany} className="grid gap-3">{[['name','Name'],['phone','Phone'],['industry','Industry'],['city','City'],['state','State'],['source','Source']].map(([name,label]) => <label key={name} className="text-xs font-bold uppercase text-slate-500">{label}<input name={name} defaultValue={(company as any)[name] || ''} required={name === 'name'} className={`${field} mt-1`} /></label>)}<label className="text-xs font-bold uppercase text-slate-500">Tags<input name="tags" defaultValue={company.tags?.join(', ')} className={`${field} mt-1`} /></label><label className="text-xs font-bold uppercase text-slate-500">Custom properties<textarea name="custom_fields" defaultValue={customText} rows={5} className="vs-input mt-1 w-full" placeholder="Property: value" /></label><label className="text-xs font-bold uppercase text-slate-500">Notes<textarea name="notes" defaultValue={company.notes || ''} rows={4} className="vs-input mt-1 w-full" /></label><button className="vs-button-primary">Save properties</button></form> : <dl className="space-y-3 text-sm">{[['Phone',company.phone],['Industry',company.industry],['Location',[company.city,company.state].filter(Boolean).join(', ')],['Source',company.source]].map(([label,value]) => <div key={label as string}><dt className="text-xs font-bold uppercase text-slate-500">{label}</dt><dd className="mt-1 text-slate-900">{value || 'Not set'}</dd></div>)}{Object.entries(company.custom_fields || {}).map(([key,value]) => <div key={key}><dt className="text-xs font-bold uppercase text-violet-600">{key}</dt><dd>{String(value)}</dd></div>)}</dl>}</SectionCard><SectionCard title="Contacts">{contacts.length ? contacts.map(contact => <div key={contact.id} className="border-b border-slate-100 py-3 last:border-0"><div className="font-bold text-slate-900">{contact.first_name} {contact.last_name}</div><div className="text-xs text-slate-500">{contact.title || contact.email || contact.phone}</div></div>) : <p className="text-sm text-slate-500">No contacts linked.</p>}</SectionCard></div>
      <div className="space-y-5"><SectionCard title="Log activity" description="Calls, emails and notes appear together in chronological order"><form onSubmit={logActivity} className="grid gap-3"><div className="flex gap-2">{(['note','call','email'] as const).map(type => <button type="button" key={type} onClick={() => setActivityType(type)} className={activityType === type ? 'vs-button-primary' : 'vs-button-secondary'}>{type}</button>)}</div><div className="grid gap-3 sm:grid-cols-2"><select name="contact_id" className={field}><option value="">Company-level activity</option>{contacts.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}</select><select name="deal_id" className={field}><option value="">No opportunity</option>{deals.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}</select></div>{activityType === 'call' && <div className="grid gap-3 sm:grid-cols-3"><select name="direction" className={field}><option value="outbound">Outbound</option><option value="inbound">Inbound</option></select><select name="outcome" className={field}><option value="connected">Connected</option><option value="no_answer">No answer</option><option value="callback">Callback</option><option value="qualified">Qualified</option><option value="trial_booked">Trial booked</option></select><input name="duration" type="number" min="0" className={field} placeholder="Minutes" /></div>}<textarea name="body" required rows={4} className="vs-input w-full" placeholder={`Write ${activityType} details...`} /><button className="vs-button-primary">Log {activityType}</button></form></SectionCard><SectionCard title="Activity timeline">{activities.length ? <div className="space-y-3">{activities.map(a => <article key={a.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex justify-between"><StatusBadge tone={a.type === 'call' ? 'info' : a.type === 'stage_change' ? 'violet' : 'neutral'}>{a.type.replace('_',' ')}</StatusBadge><time className="text-xs text-slate-400">{new Date(a.occurred_at).toLocaleString()}</time></div><p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{a.body || 'Activity recorded'}</p></article>)}</div> : <EmptyStatePanel title="No activity yet" description="Log a call, email, or note above." />}</SectionCard></div>
      <div className="space-y-5"><SectionCard title="Open opportunities">{deals.length ? deals.map(d => <div key={d.id} className="border-b border-slate-100 py-3"><div className="font-bold">{d.title}</div><div className="text-xs text-slate-500">{d.next_action || 'No next action'}</div></div>) : <p className="text-sm text-slate-500">No opportunities.</p>}</SectionCard><SectionCard title="Tasks"><form onSubmit={addTask} className="grid gap-2"><input name="title" required className={field} placeholder="Task title" /><input name="due_date" required type="datetime-local" className={field} /><textarea name="description" rows={2} className="vs-input w-full" placeholder="Details" /><button className="vs-button-secondary">Add task</button></form><div className="mt-4 space-y-2">{tasks.map(task => <label key={task.id} className="flex gap-3 rounded-xl border border-slate-200 p-3 text-sm"><input type="checkbox" checked={task.completed} onChange={async e => { await updateCrmTask(task.id,e.target.checked); await load(); }} /><span className={task.completed ? 'line-through text-slate-400' : ''}>{task.title}<span className="block text-xs text-slate-500">{new Date(task.due_date).toLocaleString()}</span></span></label>)}</div></SectionCard></div>
    </div>
  </PageLayout>;
}
