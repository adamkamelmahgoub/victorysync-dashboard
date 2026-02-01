import React from 'react';
import PlatformApiKeysTab from '../../components/PlatformApiKeysTab';
import AdminTopNav from '../../components/AdminTopNav';
import { PageLayout } from '../../components/PageLayout';

export function AdminApiKeysPage() {
  return (
    <PageLayout title="API Keys" description="Manage platform API keys.">
      <div className="space-y-6">

        <AdminTopNav />

        <section>
          <PlatformApiKeysTab />
        </section>
      </div>
    </PageLayout>
  );
}

export default AdminApiKeysPage;
