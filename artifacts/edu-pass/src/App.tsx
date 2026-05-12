import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { DeviceUserProvider } from "@/lib/device-user-context";
import { MobileLayout } from "@/components/layout";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import DashboardPage from "@/pages/dashboard";
import PlannerPage from "@/pages/planner";
import ChildrenPage from "@/pages/children";
import ChildSchedulesPage from "@/pages/child-schedules";
import SosPage from "@/pages/sos";
import SettingsPage from "@/pages/settings";
import MapPage from "@/pages/map";
import TermsPage from "@/pages/terms";
import JoinPage from "@/pages/join";
import OnboardingPage from "@/pages/onboarding";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

const isDevMode = import.meta.env.DEV;

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center animate-pulse">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
          <p className="text-sm text-muted-foreground">{isDevMode ? "Setting up dev session..." : "Loading..."}</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated && !isDevMode) {
    return <Redirect to="/login" />;
  }

  if (user && !user.onboardingCompleted) {
    return <Redirect to="/onboarding" />;
  }

  return <MobileLayout>{children}</MobileLayout>;
}

function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated && !isDevMode) {
    return <Redirect to="/login" />;
  }

  if (user?.onboardingCompleted) {
    return <Redirect to="/" />;
  }

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/join" component={JoinPage} />
      <Route path="/onboarding">
        <OnboardingGuard><OnboardingPage /></OnboardingGuard>
      </Route>
      <Route path="/">
        <AuthGuard><DashboardPage /></AuthGuard>
      </Route>
      <Route path="/planner">
        <AuthGuard><PlannerPage /></AuthGuard>
      </Route>
      <Route path="/children">
        <AuthGuard><ChildrenPage /></AuthGuard>
      </Route>
      <Route path="/children/:childId/schedules">
        <AuthGuard><ChildSchedulesPage /></AuthGuard>
      </Route>
      <Route path="/family">
        <Redirect to="/settings" />
      </Route>
      <Route path="/sos">
        <AuthGuard><SosPage /></AuthGuard>
      </Route>
      <Route path="/settings">
        <AuthGuard><SettingsPage /></AuthGuard>
      </Route>
      <Route path="/map">
        <AuthGuard><MapPage /></AuthGuard>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <DeviceUserProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
            <PwaInstallPrompt />
          </TooltipProvider>
        </DeviceUserProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
