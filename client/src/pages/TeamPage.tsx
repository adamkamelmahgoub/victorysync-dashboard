import React from 'react';
import { PageLayout } from '../components/PageLayout';
import { useOrg } from '../contexts/OrgContext';
import OrgMembersTab from '../components/OrgMembersTab';

export const TeamPage: React.FC = () => {
  const { org, isAdmin, loading } = useOrg();

  if (loading) {
    return (
      <PageLayout title="Team" description="Manage organization access">
        <div className="vs-surface p-6 text-slate-300">Loading team settings...</div>
      </PageLayout>
    );
  }

  if (!org) {
    return (
      <PageLayout title="Team" description="Manage organization access">
        <div className="vs-surface p-6 text-slate-300">No organization selected.</div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Team" description="Invite members, update roles, and manage access permissions">
      <div className="vs-surface">
        <OrgMembersTab orgId={org.id} isOrgAdmin={isAdmin} adminCheckDone={true} />
      </div>
    </PageLayout>
  );
};

export default TeamPage;
