import { Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./layouts/AppLayout";
import { IntegrationsProvider } from "./context/IntegrationsContext";
import { useSessionGuard, SESSION_EXPIRES_KEY } from "./hooks/useSessionGuard";

// Admin panel
import AdminLoginPage      from "./pages/admin/AdminLoginPage";
import AdminLayout         from "./pages/admin/AdminLayout";
import AdminDashboardPage  from "./pages/admin/AdminDashboardPage";
import AdminUsersPage      from "./pages/admin/AdminUsersPage";
import AdminWorkspacesPage from "./pages/admin/AdminWorkspacesPage";
import AdminBillingPage    from "./pages/admin/AdminBillingPage";
import AdminActivityPage   from "./pages/admin/AdminActivityPage";
import AdminMailingPage    from "./pages/admin/AdminMailingPage";
import AdminNotifyPage    from "./pages/admin/AdminNotifyPage";

function AdminGuard({ children }: { children: React.ReactNode }) {
  const token = sessionStorage.getItem("iqpipe_admin_token");
  return token ? <>{children}</> : <Navigate to="/admin36486/login" replace />;
}

// App pages
import LiveFeedPage         from "./pages/LiveFeedPage";
import ContactInspectorPage from "./pages/ContactInspectorPage";
import WorkflowHealthPage     from "./pages/WorkflowHealthPage";
import MyWorkflowPage             from "./pages/MyWorkflowPage";
import WorkflowMirrorDetailPage   from "./pages/WorkflowMirrorDetailPage";
import AutomationHealthPage  from "./pages/AutomationHealthPage";
import AutomationsPage        from "./pages/AutomationsPage";
import IntegrationsPage     from "./pages/IntegrationsPage";
import SettingsPage         from "./pages/SettingsPage";
import WorkflowComparePage  from "./pages/WorkflowComparePage";
import KnowledgeBasePage    from "./pages/KnowledgeBasePage";

// Public pages
import LandingPage   from "./pages/LandingPage";
import LoginPage     from "./pages/LoginPage";
import SignupPage    from "./pages/SignupPage";
import PricingPage   from "./pages/PricingPage";
import AboutPage     from "./pages/AboutPage";
import ContactPage   from "./pages/ContactPage";
import BlogPage      from "./pages/BlogPage";
import PrivacyPage   from "./pages/PrivacyPage";
import TermsPage     from "./pages/TermsPage";
import DemoPage                from "./pages/DemoPage";
import GTMStackPage            from "./pages/GTMStackPage";
import CareersPage             from "./pages/CareersPage";
import PublicIntegrationsPage  from "./pages/PublicIntegrationsPage";
import CheckoutSuccessPage     from "./pages/CheckoutSuccessPage";
import CheckoutCancelPage      from "./pages/CheckoutCancelPage";
import MCPProtocolPage         from "./pages/MCPProtocolPage";

function AuthenticatedApp() {
  useSessionGuard();
  return (
    <IntegrationsProvider>
      <AppLayout>
        <Routes>
          <Route path="/"              element={<Navigate to="/feed" replace />} />
          <Route path="/feed"          element={<LiveFeedPage />} />
          <Route path="/inspect"       element={<ContactInspectorPage />} />
          <Route path="/workflow-health"  element={<WorkflowHealthPage />} />
          <Route path="/my-workflow"        element={<MyWorkflowPage />} />
          <Route path="/my-workflow/:id"  element={<WorkflowMirrorDetailPage />} />
          <Route path="/automations"       element={<AutomationsPage />} />
          <Route path="/automation-health" element={<AutomationHealthPage />} />
          <Route path="/compare"       element={<WorkflowComparePage />} />
          <Route path="/integrations"     element={<IntegrationsPage />} />
          <Route path="/settings"         element={<SettingsPage />} />
          <Route path="/knowledge-base"   element={<KnowledgeBasePage />} />
          <Route path="/checkout/success" element={<CheckoutSuccessPage />} />
          <Route path="/checkout/cancel"  element={<CheckoutCancelPage />} />
          <Route path="/login"         element={<Navigate to="/feed" replace />} />
          <Route path="/signup"        element={<Navigate to="/feed" replace />} />
          <Route path="/admin36486/login"   element={<AdminLoginPage />} />
          <Route path="/admin36486/*"       element={
            <AdminGuard>
              <Routes>
                <Route element={<AdminLayout />}>
                  <Route index               element={<AdminDashboardPage />} />
                  <Route path="users"        element={<AdminUsersPage />} />
                  <Route path="workspaces"   element={<AdminWorkspacesPage />} />
                  <Route path="billing"      element={<AdminBillingPage />} />
                  <Route path="activity"     element={<AdminActivityPage />} />
                  <Route path="mailing"      element={<AdminMailingPage />} />
                  <Route path="notify"       element={<AdminNotifyPage />} />
                </Route>
              </Routes>
            </AdminGuard>
          } />
          <Route path="*"              element={<Navigate to="/feed" replace />} />
        </Routes>
      </AppLayout>
    </IntegrationsProvider>
  );
}

function App() {
  // Boot-time check: clear a token that expired while the app was closed.
  // Covers crashes, force-quit, and mobile kills where beforeunload never fires.
  let token = localStorage.getItem("iqpipe_token");
  if (token) {
    const expires = Number(localStorage.getItem(SESSION_EXPIRES_KEY) ?? 0);
    if (expires && expires < Date.now()) {
      localStorage.removeItem("iqpipe_token");
      localStorage.removeItem(SESSION_EXPIRES_KEY);
      token = null;
    }
  }

  if (!token) {
    return (
      <Routes>
        <Route path="/"            element={<LandingPage />} />
        <Route path="/login"       element={<LoginPage />} />
        <Route path="/signup"      element={<SignupPage />} />
        <Route path="/pricing"     element={<PricingPage />} />
        <Route path="/about"       element={<AboutPage />} />
        <Route path="/contact"     element={<ContactPage />} />
        <Route path="/blog"        element={<BlogPage />} />
        <Route path="/privacy"     element={<PrivacyPage />} />
        <Route path="/terms"       element={<TermsPage />} />
        <Route path="/demo"         element={<DemoPage />} />
        <Route path="/how-it-works" element={<Navigate to="/demo" replace />} />
        <Route path="/gtm-stack"      element={<GTMStackPage />} />
        <Route path="/careers"        element={<CareersPage />} />
        <Route path="/integrations"     element={<PublicIntegrationsPage />} />
        <Route path="/mcp-protocol"     element={<MCPProtocolPage />} />
        <Route path="/checkout/success" element={<CheckoutSuccessPage />} />
        <Route path="/checkout/cancel"  element={<CheckoutCancelPage />} />
        {/* Admin — always accessible regardless of user auth */}
        <Route path="/admin36486/login" element={<AdminLoginPage />} />
        <Route path="/admin36486" element={<AdminGuard><AdminLayout /></AdminGuard>}>
          <Route index                  element={<AdminDashboardPage />} />
          <Route path="users"           element={<AdminUsersPage />} />
          <Route path="workspaces"      element={<AdminWorkspacesPage />} />
          <Route path="billing"         element={<AdminBillingPage />} />
          <Route path="activity"        element={<AdminActivityPage />} />
          <Route path="mailing"         element={<AdminMailingPage />} />
          <Route path="notify"          element={<AdminNotifyPage />} />
        </Route>

        <Route path="*"                 element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return <AuthenticatedApp />;
}

export default App;
