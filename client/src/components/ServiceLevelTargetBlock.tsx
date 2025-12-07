import * as React from 'react';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

interface OrgSettings {
  service_level_target_pct: number;
  service_level_target_seconds: number;
}

export default function ServiceLevelTargetBlock({ orgId, canEdit }: { orgId: string | null, canEdit: boolean }) {
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [pct, setPct] = useState(90);
  const [seconds, setSeconds] = useState(30);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
    // eslint-disable-next-line
  }, [orgId]);

  async function fetchSettings() {
    setLoading(true);
    setError(null);
    if (!orgId) {
      setSettings({ service_level_target_pct: 90, service_level_target_seconds: 30 });
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('org_settings')
      .select('service_level_target_pct, service_level_target_seconds')
      .eq('org_id', orgId)
      .single();
    if (error) setError(error.message);
    else setSettings(data);
    setLoading(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!orgId) return;
    const { error } = await supabase.from('org_settings').upsert({
      org_id: orgId,
      service_level_target_pct: pct,
      service_level_target_seconds: seconds,
    });
    if (error) setError(error.message);
    setEditing(false);
    fetchSettings();
  }

  if (loading) return <div className="rounded-2xl bg-slate-900/80 p-4 ring-1 ring-slate-800 text-xs text-slate-400">Loading service target…</div>;
  if (!settings) return <div className="rounded-2xl bg-slate-900/80 p-4 ring-1 ring-slate-800 text-xs text-slate-400">No service target set.</div>;

  return (
    <div className="rounded-2xl bg-slate-900/80 p-4 ring-1 ring-slate-800">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-slate-400 mb-2">Service level target</div>
          <div className="text-emerald-400 font-semibold text-lg">
            {settings.service_level_target_pct}% / {settings.service_level_target_seconds}s
          </div>
        </div>
        {canEdit && !editing && (
          <button className="text-xs text-blue-400 hover:underline" onClick={() => { setEditing(true); setPct(settings.service_level_target_pct); setSeconds(settings.service_level_target_seconds); }}>
            Edit
          </button>
        )}
      </div>
      {editing && (
        <form onSubmit={handleSave} className="mt-3 flex items-center gap-2">
          <input type="number" min={0} max={100} value={pct} onChange={e => setPct(Number(e.target.value))} className="w-16 p-1 rounded bg-gray-900 border border-gray-700 text-xs" />
          <span className="text-xs text-slate-400">%</span>
          <input type="number" min={0} value={seconds} onChange={e => setSeconds(Number(e.target.value))} className="w-16 p-1 rounded bg-gray-900 border border-gray-700 text-xs" />
          <span className="text-xs text-slate-400">seconds</span>
          <button type="submit" className="text-xs text-emerald-400 hover:underline">Save</button>
          <button type="button" className="text-xs text-gray-400 hover:underline" onClick={() => setEditing(false)}>Cancel</button>
        </form>
      )}
      {error && <span className="text-xs text-red-400 mt-2 block">{error}</span>}
    </div>
  );
}
