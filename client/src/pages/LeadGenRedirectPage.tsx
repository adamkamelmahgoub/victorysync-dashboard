import React, { useEffect } from 'react';
import { PageLayout } from '../components/PageLayout';
import { LEAD_GEN_HUB_URL } from '../config';
import { supabase } from '../lib/supabaseClient';
import { useOrg } from '../contexts/OrgContext';

export const LeadGenRedirectPage: React.FC = () => {
  const { member, loading } = useOrg();

  useEffect(() => {
    if (loading) return;
    const openLeadGenHub = async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) {
        window.location.assign(LEAD_GEN_HUB_URL);
        return;
      }
      const target = new URL(LEAD_GEN_HUB_URL);
      const handoff = new URLSearchParams({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        token_type: 'bearer',
      });
      if (member?.org_id) handoff.set('org_id', member.org_id);
      target.hash = handoff.toString();
      window.location.assign(target.toString());
    };
    void openLeadGenHub();
  }, [loading, member?.org_id]);

  return (
    <PageLayout title="Lead Gen Hub" description="Opening the standalone Lead Gen Hub.">
      <div className="vs-surface p-6">
        <div className="text-sm font-semibold text-slate-700">Redirecting to Lead Gen Hub...</div>
        <a className="mt-3 inline-block text-sm font-bold text-violet-700 hover:text-violet-900" href={LEAD_GEN_HUB_URL}>
          Open Lead Gen Hub
        </a>
      </div>
    </PageLayout>
  );
};

export default LeadGenRedirectPage;
