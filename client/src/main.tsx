import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import "./index.css";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { OrgProvider, useOrg } from "./contexts/OrgContext";
import { ToastProvider } from "./contexts/ToastContext";
import DashboardNewV3 from "./pages/DashboardNewV3";
import { LoginPage } from "./pages/LoginPage";
import { AdminUsersPage } from "./pages/admin/AdminUsersPage";
import AdminOrgsPage from "./pages/admin/AdminOrgsPage";
import { AdminOrgOverviewPage } from "./pages/admin/AdminOrgOverviewPage";
import AdminApiKeysPage from "./pages/admin/AdminApiKeysPage";
import AdminMightyCallPage from "./pages/admin/AdminMightyCallPage";
import { OrgDashboardPage } from "./pages/admin/OrgDashboardPage";
import { AdminOperationsPage } from "./pages/admin/AdminOperationsPage";
import AdminSupportPage from "./pages/admin/AdminSupportPage";
import AdminNumberChangeRequestsPage from "./pages/admin/AdminNumberChangeRequestsPage";
import AdminReportsPage from "./pages/admin/AdminReportsPage";
import AdminRecordingsPage from "./pages/admin/AdminRecordingsPage";
import AdminSMSPage from "./pages/admin/AdminSMSPage";
import { AdminBillingPage } from "./pages/admin/AdminBillingPage";
import { AdminBillingPageV2 } from "./pages/admin/AdminBillingPageV2";
import AdminDashboardPage from "./pages/admin/AdminDashboardPage";
import OrgManagePage from './pages/OrgManagePage';
import OrgAdminRoute from './components/OrgAdminRoute';
import ErrorBoundary from "./components/ErrorBoundary";
import { SettingsPage } from "./pages/SettingsPage";
import { NumbersPage } from "./pages/NumbersPage";
import { ReportsPage } from "./pages/ReportsPage";
import ReportsPageEnhanced from "./pages/ReportsPageEnhanced";
import { RecordingsPage } from "./pages/RecordingsPage";
import UserSettingsPage from "./pages/UserSettingsPage";
import { SMSPage } from "./pages/SMSPage";
import { SupportPage } from "./pages/SupportPage";
import { TeamPage } from "./pages/TeamPage";
import { DebugAuthPage } from "./pages/DebugAuthPage";
import { APIKeysPage } from "./pages/APIKeysPage";

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

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { user, loading: authLoading } = useAuth();
  const { loading: orgLoading } = useOrg();

  if (authLoading || orgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-50">
        Loading...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function AdminRoute({ children }: { children: JSX.Element }) {
  const { user, loading, globalRole } = useAuth();
  const role = (user?.user_metadata as any)?.role || globalRole;

  // Developer preview: allow admin access when running locally with ?asAdmin=true
  const isDevPreviewAdmin = (import.meta as any)?.env?.DEV && new URLSearchParams(window.location.search).get('asAdmin') === 'true';
  const previewRole = isDevPreviewAdmin ? 'platform_admin' : role;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-50">
        Loading...
      </div>
    );
  }
  // In dev preview mode, allow access regardless of the authenticated user's role
  if (!user || (previewRole !== "admin" && previewRole !== "platform_admin")) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function AppRouter() {
  return (
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
            <NumbersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute>
            <ReportsPageEnhanced />
          </ProtectedRoute>
        }
      />
      <Route
        path="/api-keys"
        element={
          <ProtectedRoute>
            <APIKeysPage />
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
        path="/recordings"
        element={
          <ProtectedRoute>
            <RecordingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/sms"
        element={
          <ProtectedRoute>
            <SMSPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/support"
        element={
          <ProtectedRoute>
            <SupportPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/billing"
        element={<Navigate to="/dashboard" replace />}
      />
      <Route
        path="/team"
        element={
          <ProtectedRoute>
            <TeamPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/debug-auth"
        element={
          <ProtectedRoute>
            <DebugAuthPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminDashboardPage />
          </AdminRoute>
        }
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
        path="/admin/reports"
        element={
          <AdminRoute>
            <ReportsPageEnhanced />
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
        element={
          <AdminRoute>
            <AdminSMSPage />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/billing"
        element={
          <AdminRoute>
            <AdminBillingPageV2 />
          </AdminRoute>
        }
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <AuthProvider>
      <OrgProvider>
        <BrowserRouter>
          <ErrorBoundary>
            {/* ToastProvider provides a simple global toast UI */}
            <ToastProvider>
              <AppRouter />
            </ToastProvider>
          </ErrorBoundary>
        </BrowserRouter>
      </OrgProvider>
    </AuthProvider>
  </StrictMode>
);
