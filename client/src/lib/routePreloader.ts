type Loader = () => Promise<unknown>;

const routeLoaders: Array<{ match: (path: string) => boolean; load: Loader }> = [
  { match: (path) => path === '/' || path.startsWith('/dashboard'), load: () => import('../pages/DashboardNewV3') },
  { match: (path) => path.startsWith('/live-status'), load: () => import('../pages/LiveStatusPage') },
  { match: (path) => path.startsWith('/calls'), load: () => import('../pages/CallsPage') },
  { match: (path) => path.startsWith('/reports') || path.startsWith('/admin/reports'), load: () => import('../pages/ReportPage') },
  { match: (path) => path.startsWith('/sms') || path.startsWith('/admin/sms'), load: () => import('../pages/SMSPage') },
  { match: (path) => path.startsWith('/recordings'), load: () => import('../pages/RecordingsPage') },
  { match: (path) => path.startsWith('/leads'), load: () => import('../pages/LeadsPage') },
  { match: (path) => path.startsWith('/lead-gen'), load: () => import('../pages/LeadGenRedirectPage') },
  { match: (path) => path.startsWith('/numbers'), load: () => import('../pages/NumbersPage') },
  { match: (path) => path.startsWith('/billing'), load: () => import('../pages/BillingPage') },
  { match: (path) => path.startsWith('/api-keys'), load: () => import('../pages/APIKeysPage') },
  { match: (path) => path.startsWith('/support'), load: () => import('../pages/SupportPage') },
  { match: (path) => path.startsWith('/team'), load: () => import('../pages/TeamPage') },
  { match: (path) => path.startsWith('/settings'), load: () => import('../pages/SettingsPage') },
  { match: (path) => path.startsWith('/account-settings'), load: () => import('../pages/UserSettingsPage') },
  { match: (path) => path.startsWith('/admin/users'), load: () => import('../pages/admin/AdminUsersPage') },
  { match: (path) => path.startsWith('/admin/agents-management'), load: () => import('../pages/admin/AdminAgentsManagementPage') },
  { match: (path) => path.startsWith('/admin/orgs/') && path.endsWith('/dashboard'), load: () => import('../pages/admin/OrgDashboardPage') },
  { match: (path) => path.startsWith('/admin/orgs'), load: () => import('../pages/admin/AdminOrgsPage') },
  { match: (path) => path.startsWith('/admin/operations'), load: () => import('../pages/admin/AdminOperationsPage') },
  { match: (path) => path.startsWith('/admin/org-overview'), load: () => import('../pages/admin/AdminOrgOverviewPage') },
  { match: (path) => path.startsWith('/admin/diagnostics'), load: () => import('../pages/admin/AdminDiagnosticsPage') },
  { match: (path) => path.startsWith('/admin/logs'), load: () => import('../pages/admin/AdminLogsPage') },
  { match: (path) => path.startsWith('/admin/api-keys'), load: () => import('../pages/admin/AdminApiKeysPage') },
  { match: (path) => path.startsWith('/admin/mightycall'), load: () => import('../pages/admin/AdminMightyCallPage') },
  { match: (path) => path.startsWith('/admin/support'), load: () => import('../pages/admin/AdminSupportPage') },
  { match: (path) => path.startsWith('/admin/number-change-requests'), load: () => import('../pages/admin/AdminNumberChangeRequestsPage') },
  { match: (path) => path.startsWith('/admin/invites'), load: () => import('../pages/admin/AdminInviteCodesPage') },
  { match: (path) => path.startsWith('/admin/recordings'), load: () => import('../pages/admin/AdminRecordingsPage') },
  { match: (path) => path.startsWith('/admin/billing'), load: () => import('../pages/admin/AdminBillingPageV2') },
  { match: (path) => path.startsWith('/orgs/'), load: () => import('../pages/OrgManagePage') },
];

const warmed = new Set<string>();

export function preloadRoute(path: string) {
  const cleanPath = path.split('?')[0] || '/';
  const entry = routeLoaders.find((loader) => loader.match(cleanPath));
  if (!entry || warmed.has(cleanPath)) return;
  warmed.add(cleanPath);
  void entry.load().catch(() => warmed.delete(cleanPath));
}

export function warmCoreRoutes() {
  ['/', '/calls', '/reports', '/live-status', '/sms', '/recordings'].forEach(preloadRoute);
}
