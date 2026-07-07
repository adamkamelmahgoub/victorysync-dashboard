import React, { useEffect } from 'react';
import { PageLayout } from '../components/PageLayout';
import { LEAD_GEN_HUB_URL } from '../config';

export const LeadGenRedirectPage: React.FC = () => {
  useEffect(() => {
    window.location.assign(LEAD_GEN_HUB_URL);
  }, []);

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
