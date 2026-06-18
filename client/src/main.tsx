import { StrictMode, Suspense, lazy, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import "./index.css";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { OrgProvider, useOrg } from "./contexts/OrgContext";
import { ToastProvider } from "./contexts/ToastContext";
import { LoginPage } from "./pages/LoginPage";
import OrgAdminRoute from './components/OrgAdminRoute';
import ErrorBoundary from "./components/ErrorBoundary";
import LoggingProvider from "./components/LoggingProvider";
import LeadAlertOverlay from "./components/LeadAlertOverlay";
import { installAuthenticatedFetch } from "./lib/installAuthenticatedFetch";
import { installConsoleRedaction } from "./lib/redactConsole";
import { warmCoreRoutes } from "./lib/routePreloader";

const AdminUsersPage = lazy(() => import("./pages/admin/AdminUsersPage").then((m) => ({ default: m.AdminUsersPage })));
const DashboardNewV3 = lazy(() => import("./pages/DashboardNewV3"));
const AdminOrgsPage = lazy(() => import("./pages/admin/AdminOrgsPage"));
const AdminOrgOverviewPage = lazy(() => import("./pages/admin/AdminOrgOverviewPage").then((m) => ({ default: m.AdminOrgOverviewPage })));
const AdminApiKeysPage = lazy(() => import("./pages/admin/AdminApiKeysPage"));
const AdminMightyCallPage = lazy(() => import("./pages/admin/AdminMightyCallPage"));
const OrgDashboardPage = lazy(() => import("./pages/admin/OrgDashboardPage").then((m) => ({ default: m.OrgDashboardPage })));
const AdminOperationsPage = lazy(() => import("./pages/admin/AdminOperationsPage").then((m) => ({ default: m.AdminOperationsPage })));
const AdminSupportPage = lazy(() => import("./pages/admin/AdminSupportPage"));
const AdminNumberChangeRequestsPage = lazy(() => import("./pages/admin/AdminNumberChangeRequestsPage"));
const AdminRecordingsPage = lazy(() => import("./pages/admin/AdminRecordingsPage"));
const AdminAgentsManagementPage = lazy(() => import("./pages/admin/AdminAgentsManagementPage"));
const AdminInviteCodesPage = lazy(() => import("./pages/admin/AdminInviteCodesPage"));
const AdminBillingPageV2 = lazy(() => import("./pages/admin/AdminBillingPageV2").then((m) => ({ default: m.AdminBillingPageV2 })));
const AdminDiagnosticsPage = lazy(() => import("./pages/admin/AdminDiagnosticsPage"));
const AdminLogsPage = lazy(() => import("./pages/admin/AdminLogsPage"));
const OrgManagePage = lazy(() => import("./pages/OrgManagePage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const NumbersPage = lazy(() => import("./pages/NumbersPage").then((m) => ({ default: m.NumbersPage })));
const ReportPage = lazy(() => import("./pages/ReportPage"));
const RecordingsPage = lazy(() => import("./pages/RecordingsPage").then((m) => ({ default: m.RecordingsPage })));
const UserSettingsPage = lazy(() => import("./pages/UserSettingsPage"));
const SMSPage = lazy(() => import("./pages/SMSPage").then((m) => ({ default: m.SMSPage })));
const SupportPage = lazy(() => import("./pages/SupportPage").then((m) => ({ default: m.SupportPage })));
const TeamPage = lazy(() => import("./pages/TeamPage").then((m) => ({ default: m.TeamPage })));
const DebugAuthPage = lazy(() => import("./pages/DebugAuthPage").then((m) => ({ default: m.DebugAuthPage })));
const APIKeysPage = lazy(() => import("./pages/APIKeysPage").then((m) => ({ default: m.APIKeysPage })));
const BillingPage = lazy(() => import("./pages/BillingPage"));
const LiveStatusPage = lazy(() => import("./pages/LiveStatusPage"));
const LeadsPage = lazy(() => import("./pages/LeadsPage"));
const CallsPage = lazy(() => import("./pages/CallsPage"));
const EmailPreferencesPage = lazy(() => import("./pages/EmailPreferencesPage"));

declare global {
  interface Window {
    __lastResourceError?: any;
    __lastPromiseRejection?: any;
  }
}

// Global error handlers (dev/testing only behind a flag)
if ((import.meta as any).env && (import.meta as any).env.VITE_DEBUG_API === 'true') {
  window.addEventListener('error', (ev: ErrorEvent) => {
    console.error('[GlobalError] error', ev.filename, ev.message, ev.error);
    // If resource load (script/link) failed
    const target: any = ev.target as any || undefined;
    try { window.__lastResourceError = { filename: ev.filename, message: ev.message, stack: ev.error?.stack } } catch(e) {}
  }, true);

  window.addEventListener('unhandledrejection', (ev) => {
    console.error('[GlobalError] unhandledrejection', ev.reason);
    try { window.__lastPromiseRejection = { reason: ev.reason } } catch(e) {}
  });
}

installConsoleRedaction();
installAuthenticatedFetch();

function AppLoadingFallback({ label = 'Loading workspace...' }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-slate-900">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.10)]">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-2xl bg-violet-100 ring-1 ring-violet-200" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-950">{label}</div>
            <div className="mt-1 text-xs text-slate-500">Preparing the next view</div>
          </div>
        </div>
        <div className="mt-5 space-y-3">
          <div className="h-3 w-3/4 animate-pulse rounded-full bg-slate-100" />
          <div className="h-3 w-full animate-pulse rounded-full bg-slate-100" />
          <div className="h-3 w-2/3 animate-pulse rounded-full bg-slate-100" />
        </div>
      </div>
    </div>
  );
}

function NavigationProgress() {
  const location = useLocation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 420);
    return () => window.clearTimeout(timer);
  }, [location.key, location.pathname, location.search]);

  return <div className={`vs-route-progress ${visible ? 'is-visible' : ''}`} aria-hidden="true" />;
}

function PageTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  return (
    <div key={location.key} className="vs-route-transition">
      {children}
    </div>
  );
}

function InteractionFeedback() {
  useEffect(() => {
    const press = (event: PointerEvent) => {
      const target = event.target instanceof Element
        ? event.target.closest('button, a, [role="button"]')
        : null;
      if (!target || target.hasAttribute('disabled') || target.getAttribute('aria-disabled') === 'true') return;
      target.classList.add('vs-pressed');
      window.setTimeout(() => target.classList.remove('vs-pressed'), 220);
    };
    const warm = () => window.setTimeout(warmCoreRoutes, 700);
    document.addEventListener('pointerdown', press, { passive: true });
    warm();
    return () => document.removeEventListener('pointerdown', press);
  }, []);
  return null;
}

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { user, loading: authLoading, authError } = useAuth();
  const { loading: orgLoading } = useOrg();
  const location = useLocation();

  if (authLoading || orgLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-900">
        <div className="rounded-lg border border-slate-200 bg-white px-5 py-4 text-sm font-medium shadow-sm">
          Loading workspace...
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location, authError }} />;
  }

  return children;
}

function AdminRoute({ children }: { children: JSX.Element }) {
  const { user, loading, globalRole } = useAuth();
  const location = useLocation();
  const role = globalRole;

  // Developer preview: allow admin access when running locally with ?asAdmin=true
  const isDevPreviewAdmin = (import.meta as any)?.env?.DEV && new URLSearchParams(window.location.search).get('asAdmin') === 'true';
  const previewRole = isDevPreviewAdmin ? 'platform_admin' : role;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-900">
        <div className="rounded-lg border border-slate-200 bg-white px-5 py-4 text-sm font-medium shadow-sm">
          Loading admin access...
        </div>
      </div>
    );
  }
  // In dev preview mode, allow access regardless of the authenticated user's role
  if (!user || !["platform_admin", "admin", "super_admin"].includes(String(previewRole || ""))) {
    const adminToClient: Record<string, string> = {
      '/admin/reports': '/reports',
      '/admin/recordings': '/recordings',
      '/admin/sms': '/sms',
      '/admin/support': '/support',
      '/admin/billing': '/dashboard',
      '/admin/operations': '/dashboard',
      '/admin/orgs': '/dashboard',
      '/admin/users': '/dashboard',
      '/admin/invites': '/dashboard',
      '/admin/logs': '/dashboard',
      '/admin': '/dashboard',
    };
    const fallback = adminToClient[location.pathname] || '/dashboard';
    return <Navigate to={fallback} replace />;
  }

  return children;
}

function FeatureRoute({ featureKey, children }: { featureKey: string; children: JSX.Element }) {
  const { globalRole, featureAccess, featureAccessLoaded } = useAuth();
  const isAdmin = ["platform_admin", "admin", "super_admin"].includes(String(globalRole || ""));
  if (!isAdmin && !featureAccessLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-900">
        <div className="rounded-lg border border-slate-200 bg-white px-5 py-4 text-sm font-medium shadow-sm">
          Loading permissions...
        </div>
      </div>
    );
  }
  if (!isAdmin && featureAccess[featureKey] === false) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

function AppRouter() {
  return (
    <>
      <NavigationProgress />
      <Suspense fallback={<AppLoadingFallback />}>
        <PageTransition>
          <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardNewV3 />
            </ProtectedRoute>
          }
        />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardNewV3 />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/leads"
        element={
          <ProtectedRoute>
            <FeatureRoute featureKey="leads"><LeadsPage /></FeatureRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/leads"
        element={
          <ProtectedRoute>
            <FeatureRoute featureKey="leads"><LeadsPage /></FeatureRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/calls"
        element={
          <ProtectedRoute>
            <FeatureRoute featureKey="reports"><CallsPage /></FeatureRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/live-status"
        element={
          <ProtectedRoute>
            <FeatureRoute featureKey="live_status"><LiveStatusPage /></FeatureRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/numbers"
        element={
          <ProtectedRoute>
            <FeatureRoute featureKey="numbers"><NumbersPage /></FeatureRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute>
            <FeatureRoute featureKey="reports"><ReportPage /></FeatureRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/api-keys"
        element={
          <ProtectedRoute>
            <FeatureRoute featureKey="api_keys"><APIKeysPage /></FeatureRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/account-settings"
        element={
          <ProtectedRoute>
            <UserSettingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/email-preferences"
        element={
          <ProtectedRoute>
            <EmailPreferencesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/recordings"
        element={
          <ProtectedRoute>
            <FeatureRoute featureKey="recordings"><RecordingsPage /></FeatureRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/sms"
        element={
          <ProtectedRoute>
            <FeatureRoute featureKey="sms"><SMSPage /></FeatureRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/support"
        element={
          <ProtectedRoute>
            <FeatureRoute featureKey="support"><SupportPage /></FeatureRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/billing"
        element={
          <ProtectedRoute>
            <FeatureRoute featureKey="billing"><BillingPage /></FeatureRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/team"
        element={
          <ProtectedRoute>
            <FeatureRoute featureKey="team"><TeamPage /></FeatureRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/debug-auth"
        element={
          <AdminRoute>
            <DebugAuthPage />
          </AdminRoute>
        }
      />
      <Route
        path="/admin"
        element={<Navigate to="/dashboard" replace />}
      />
      <Route
        path="/admin/users"
        element={
          <AdminRoute>
            <AdminUsersPage />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/agents-management"
        element={
          <AdminRoute>
            <AdminAgentsManagementPage />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/orgs"
        element={
          <AdminRoute>
            <AdminOrgsPage />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/orgs/:orgId/dashboard"
        element={
          <AdminRoute>
            <OrgDashboardPage />
          </AdminRoute>
        }
      />
      <Route
        path="/orgs/:orgId/manage"
        element={
          <OrgAdminRoute>
            <OrgManagePage />
          </OrgAdminRoute>
        }
      />
      <Route
        path="/admin/operations"
        element={
          <AdminRoute>
            <AdminOperationsPage />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/org-overview"
        element={
          <AdminRoute>
            <AdminOrgOverviewPage />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/diagnostics"
        element={
          <AdminRoute>
            <AdminDiagnosticsPage />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/logs"
        element={
          <AdminRoute>
            <AdminLogsPage />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/api-keys"
        element={
          <AdminRoute>
            <AdminApiKeysPage />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/mightycall"
        element={
          <AdminRoute>
            <AdminMightyCallPage />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/support"
        element={
          <AdminRoute>
            <AdminSupportPage />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/number-change-requests"
        element={
          <AdminRoute>
            <AdminNumberChangeRequestsPage />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/invites"
        element={
          <AdminRoute>
            <AdminInviteCodesPage />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/reports"
        element={
          <AdminRoute>
            <ReportPage />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/recordings"
        element={
          <AdminRoute>
            <AdminRecordingsPage />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/sms"
        element={<Navigate to="/sms" replace />}
      />
      <Route
        path="/admin/billing"
        element={
          <AdminRoute>
            <AdminBillingPageV2 />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/email-preferences"
        element={
          <AdminRoute>
            <EmailPreferencesPage />
          </AdminRoute>
        }
      />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </PageTransition>
      </Suspense>
    </>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <AuthProvider>
      <ThemeProvider>
        <OrgProvider>
          <BrowserRouter>
            <ErrorBoundary>
              <LoggingProvider />
              <ToastProvider>
                <InteractionFeedback />
                <LeadAlertOverlay />
                <AppRouter />
              </ToastProvider>
            </ErrorBoundary>
          </BrowserRouter>
        </OrgProvider>
      </ThemeProvider>
    </AuthProvider>
  </StrictMode>
);
