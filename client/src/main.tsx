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
import { ToastProvider } from "./contexts/ToastContext";
import { Dashboard } from "./Dashboard";
import { LoginPage } from "./pages/LoginPage";
import { AdminUsersPage } from "./pages/admin/AdminUsersPage";
import AdminOrgsPage from "./pages/admin/AdminOrgsPage";
import { AdminOrgOverviewPage } from "./pages/admin/AdminOrgOverviewPage";
import AdminApiKeysPage from "./pages/admin/AdminApiKeysPage";
import { OrgDashboardPage } from "./pages/admin/OrgDashboardPage";
import { AdminOperationsPage } from "./pages/admin/AdminOperationsPage";

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();

  if (loading) {
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-50">
        Loading...
      </div>
    );
  }

  if (!user || (role !== "admin" && role !== "platform_admin")) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
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
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        {/* ToastProvider provides a simple global toast UI */}
        <ToastProvider>
          <AppRouter />
        </ToastProvider>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>
);
