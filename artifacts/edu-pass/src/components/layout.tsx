import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useDeviceUser } from "@/lib/device-user-context";
import { Home, Calendar, CalendarDays, AlertTriangle, Settings, MapPin } from "lucide-react";

const allNavItems = [
  { path: "/", label: "대시보드", icon: Home },
  { path: "/planner", label: "플래너", icon: Calendar },
  { path: "/map", label: "지도", icon: MapPin },
  { path: "/children", label: "일정", icon: CalendarDays },
  { path: "/sos", label: "SOS", icon: AlertTriangle, hideInChildMode: true },
];

export function MobileLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useAuth();
  const { isChildMode } = useDeviceUser();

  const navItems = allNavItems.filter(item => !(isChildMode && item.hideInChildMode));

  return (
    <div className="min-h-screen bg-background flex flex-col" data-testid="app-layout">
      <header className="sticky top-0 z-50 bg-card border-b border-border px-4 py-3">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            <img src="/icons/logo.png" alt="PickMeUpDaddy" className="h-8 w-auto" />
          </div>
          {user && (
            <Link href="/settings" data-testid="link-settings" className="-m-2 p-2">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center cursor-pointer">
                <Settings className="w-4 h-4 text-muted-foreground" />
              </div>
            </Link>
          )}
        </div>
      </header>
      <main className="flex-1 px-4 py-4 max-w-lg mx-auto w-full pb-20">
        {children}
      </main>
      {user && (
        <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-40" data-testid="bottom-nav">
          <div className="flex justify-around max-w-lg mx-auto py-2">
            {navItems.map(item => {
              const isActive = location === item.path || (item.path !== "/" && location.startsWith(item.path));
              const Icon = item.icon;
              return (
                <Link key={item.path} href={item.path} data-testid={`nav-${item.label.toLowerCase()}`}>
                  <div className={`flex flex-col items-center gap-0.5 px-3 py-1 cursor-pointer transition-colors ${
                    isActive ? "text-primary" : "text-muted-foreground"
                  }`}>
                    <Icon className="w-5 h-5" />
                    <span className="text-[10px] font-medium">{item.label}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
