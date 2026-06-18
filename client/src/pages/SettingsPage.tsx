import React, { FC, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useOrg } from "../contexts/OrgContext";
import { supabase } from "../lib/supabaseClient";
import { PageLayout } from "../components/PageLayout";
import StripePortalButton from "../components/StripePortalButton";

export const SettingsPage: FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { org, isAdmin, refresh } = useOrg();
  const [loading, setLoading] = useState(false);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);
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
        user_id: user?.id || null,
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
    return (
      <PageLayout title="Organization Settings" description="Manage your organization settings, SLA targets, and business hours">
        <div className="vs-surface p-6 text-sm text-slate-600">Loading organization settings...</div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Organization Settings" description="Manage your organization settings, SLA targets, and business hours">
      <div className="space-y-6">
        <div className="vs-surface p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Stripe Billing Portal</h2>
              <p className="mt-1 text-sm text-slate-600">
                Manage this organization&apos;s payment methods, subscriptions, and Stripe invoices in Stripe&apos;s hosted portal.
              </p>
            </div>
            <StripePortalButton
              orgId={org.id}
              label="Open Stripe billing"
              className="vs-button-primary whitespace-nowrap"
              onError={(message) => setBillingMessage(message || null)}
            />
          </div>
          {billingMessage && (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {billingMessage}
            </div>
          )}
          <p className="mt-4 text-xs text-slate-500">
            Card entry, payment method updates, and subscription management happen on Stripe-hosted pages.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="vs-surface space-y-6 p-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Organization Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="vs-input w-full"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Timezone</label>
              <select
                value={formData.timezone}
                onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                className="vs-input w-full"
              >
                <option value="America/New_York">Eastern Time</option>
                <option value="America/Chicago">Central Time</option>
                <option value="America/Denver">Mountain Time</option>
                <option value="America/Los_Angeles">Pacific Time</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">SLA Target (%)</label>
              <input
                type="number"
                value={formData.sla_target_percent}
                onChange={(e) => setFormData({ ...formData, sla_target_percent: parseInt(e.target.value) })}
                className="vs-input w-full"
                min="0"
                max="100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">SLA Target (seconds)</label>
              <input
                type="number"
                value={formData.sla_target_seconds}
                onChange={(e) => setFormData({ ...formData, sla_target_seconds: parseInt(e.target.value) })}
                className="vs-input w-full"
                min="0"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-slate-700">Escalation Email</label>
              <input
                type="email"
                value={formData.escalation_email}
                onChange={(e) => setFormData({ ...formData, escalation_email: e.target.value })}
                className="vs-input w-full"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="mb-2 text-lg font-semibold text-slate-950">Business Hours</h3>
            {/* Business hours form - simplified for now */}
            <p className="text-sm text-slate-600">Business hours are not configured in this workspace yet. No hidden or fake schedule is shown.</p>
          </div>

          {isAdmin && (
            <button
              type="submit"
              disabled={loading}
              className="vs-button-primary"
            >
              {loading ? 'Saving...' : 'Save Settings'}
            </button>
          )}
        </form>
      </div>
    </PageLayout>
  );
};
