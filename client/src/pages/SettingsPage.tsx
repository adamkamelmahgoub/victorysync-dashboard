import React, { FC, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useOrg } from "../contexts/OrgContext";
import { supabase } from "../lib/supabaseClient";
import { PageLayout } from "../components/PageLayout";

export const SettingsPage: FC = () => {
  const navigate = useNavigate();
  const { org, isAdmin, refresh } = useOrg();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    timezone: '',
    sla_target_percent: 90,
    sla_target_seconds: 30,
    business_hours: {} as Record<string, { open: string; close: string } | null>,
    escalation_email: ''
  });

  useEffect(() => {
    if (org) {
      setFormData({
        name: org.name,
        timezone: org.timezone,
        sla_target_percent: org.sla_target_percent,
        sla_target_seconds: org.sla_target_seconds,
        business_hours: org.business_hours,
        escalation_email: org.escalation_email || ''
      });
    }
  }, [org]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org || !isAdmin) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update({
          name: formData.name,
          timezone: formData.timezone,
          sla_target_percent: formData.sla_target_percent,
          sla_target_seconds: formData.sla_target_seconds,
          business_hours: formData.business_hours,
          escalation_email: formData.escalation_email || null
        })
        .eq('id', org.id);

      if (error) throw error;

      // Log audit
      await supabase.from('audit_logs').insert({
        org_id: org.id,
        user_id: (await supabase.auth.getUser()).data.user?.id,
        action: 'update_org_settings',
        entity_type: 'organization',
        entity_id: org.id,
        metadata: { changes: formData }
      });

      await refresh();
    } catch (error) {
      console.error('Error updating settings:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!org) {
    return <div>Loading...</div>;
  }

  return (
    <PageLayout title="Organization Settings" description="Manage your organization settings, SLA targets, and business hours">
      <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium mb-2">Organization Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Timezone</label>
              <select
                value={formData.timezone}
                onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md"
              >
                <option value="America/New_York">Eastern Time</option>
                <option value="America/Chicago">Central Time</option>
                <option value="America/Denver">Mountain Time</option>
                <option value="America/Los_Angeles">Pacific Time</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">SLA Target (%)</label>
              <input
                type="number"
                value={formData.sla_target_percent}
                onChange={(e) => setFormData({ ...formData, sla_target_percent: parseInt(e.target.value) })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md"
                min="0"
                max="100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">SLA Target (seconds)</label>
              <input
                type="number"
                value={formData.sla_target_seconds}
                onChange={(e) => setFormData({ ...formData, sla_target_seconds: parseInt(e.target.value) })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md"
                min="0"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-2">Escalation Email</label>
              <input
                type="email"
                value={formData.escalation_email}
                onChange={(e) => setFormData({ ...formData, escalation_email: e.target.value })}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md"
              />
            </div>
          </div>

          <div>
            <h3 className="text-lg font-medium mb-4">Business Hours</h3>
            {/* Business hours form - simplified for now */}
            <p className="text-sm text-slate-400">Business hours configuration coming soon...</p>
          </div>

          {isAdmin && (
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Settings'}
            </button>
          )}
        </form>
    </PageLayout>
  );
};