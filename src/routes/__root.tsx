import type { QueryClient } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import {
  Link,
  Navigate,
  Outlet,
  createRootRouteWithContext,
  useLocation,
} from '@tanstack/react-router';
import { type ReactNode, useEffect, useState } from 'react';
import { AlertTriangle, Home, Loader2, RefreshCw } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { LoginScreen } from '../components/auth/LoginScreen';
import { Header } from '../components/layout/Header';
import { Sidebar } from '../components/layout/Sidebar';
import { AuthProvider, useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

export interface RootRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RootRouterContext>()({
  component: RootComponent,
  errorComponent: RootErrorBoundary,
  notFoundComponent: RootNotFoundComponent,
});

function RootErrorBoundary({ error, reset }: { error: unknown; reset: () => void }) {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans text-slate-100">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl text-center">
        <div className="w-14 h-14 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <AlertTriangle size={28} />
        </div>
        <h2 className="text-lg font-black uppercase tracking-tight text-white mb-2">Application Error</h2>
        <p className="text-xs text-slate-400 font-medium leading-relaxed mb-6">
          {error instanceof Error ? error.message : 'An unexpected routing exception occurred.'}
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-colors cursor-pointer"
          >
            <RefreshCw size={14} /> Retry
          </button>
          <Link
            to="/"
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-colors"
          >
            <Home size={14} /> Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

function RootNotFoundComponent() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans text-slate-100">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl text-center">
        <h1 className="text-4xl font-black text-emerald-500 mb-2">404</h1>
        <h2 className="text-base font-black uppercase tracking-widest text-white mb-2">Endpoint Not Found</h2>
        <p className="text-xs text-slate-400 mb-6">The requested module or record does not exist.</p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-colors"
        >
          <Home size={14} /> Return to Dashboard
        </Link>
      </div>
    </div>
  );
}

function RootComponent() {
  return (
    <AuthProvider>
      <AuthGuard />
      <Toaster position="top-center" richColors theme="light" />
    </AuthProvider>
  );
}

// ------------------------------------------------------------------
// 1. GLOBAL REALTIME MULTIPLEXER (Active-Scoped Invalidation)
// ------------------------------------------------------------------
function GlobalSyncEngine() {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  useEffect(() => {
    if (!session) return;

    const channel = supabase
      .channel('strix-global-multiplexer')
      .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
        const table = payload.table;

        const tableToKeyMap: Record<string, string[][]> = {
          animals: [['animals'], ['animals', 'dashboard']],
          daily_logs: [['daily_logs']],
          feed_logs: [['feeds'], ['feed_logs'], ['animals', 'husbandry'], ['dashboard', 'next_feeds']],
          weight_logs: [['weights'], ['weight_logs'], ['animals', 'husbandry']],
          temperature_logs: [['temperatures'], ['temperature_logs'], ['animals', 'husbandry']],
          mist_logs: [['mist_logs'], ['animals', 'husbandry']],
          daily_rounds: [['rounds']],
          clinical_records: [['clinical_records']],
          clinical_schedules: [['prescriptions'], ['medication_administrations']],
          internal_movements: [['internal_movements']],
          external_transfers: [['external_transfers']],
          vouchers: [['vouchers']],
          incidents: [['incidents']],
          first_aid_logs: [['first_aid_logs']],
          safety_drills: [['safety_drills']],
          maintenance_tickets: [['maintenance_tickets']],
          shifts: [['shifts'], ['shifts_list'], ['rota_matrix']],
          timesheets: [['timesheets'], ['my_active_shift'], ['active_timesheets_rollcall']],
          leave_requests: [['leave_requests']],
          users: [['internal_users'], ['userProfile'], ['system_users'], ['active-staff']],
          rbac_matrix: [['rbac_matrix'], ['rbac_permissions']],
        };

        const targetKeys = tableToKeyMap[table];
        if (targetKeys) {
          for (const key of targetKeys) {
            queryClient.invalidateQueries({
              queryKey: key,
              refetchType: 'active',
            });
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, session]);

  return null;
}

// ------------------------------------------------------------------
// 2. ROUTE GATEKEEPER & ACCESS DEFLECTOR
// ------------------------------------------------------------------
function RouteGatekeeper({ children }: { children: ReactNode }) {
  const { hasPermission, profile, isLocked, isLoading } = useAuth();
  const location = useLocation();
  const path = location.pathname;

  const routePermissions: Record<string, string> = {
    '/clinical': 'clinical:read',
    '/logistics/vouchers': 'vouchers:scan',
    '/logistics/internal-movements': 'transfers:read',
    '/logistics/external-transfers': 'transfers:read',
    '/safety': 'safety:read',
    '/staff/rota': 'rota:view',
    '/staff/shifts': 'timesheet:self',
    '/staff/leave': 'hr:read',
    '/staff/timesheets': 'hr:read',
    '/reports': 'reports:view',
    '/settings/rbac': 'admin:system',
    '/settings/directory': 'admin:users',
    '/settings/access': 'admin:users',
  };

  const matchedEntry = Object.entries(routePermissions)
    .sort(([a], [b]) => b.length - a.length)
    .find(([routePrefix]) => path.startsWith(routePrefix));

  const requiredPerm = matchedEntry?.[1];
  const isDenied =
    !isLoading &&
    Boolean(profile) &&
    !isLocked &&
    Boolean(requiredPerm) &&
    !hasPermission(requiredPerm || '');

  useEffect(() => {
    if (isDenied) {
      console.warn(`[Route Gatekeeper] Deflected from: ${path}. Required capability: ${requiredPerm}`);
      toast.error('Unauthorized Access: Your role does not have permission to view this module.');
    }
  }, [isDenied, path, requiredPerm]);

  if (isDenied) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

// ------------------------------------------------------------------
// 3. LAYOUT GATEKEEPER & RIGID SHELL
// ------------------------------------------------------------------
function AuthGuard() {
  const { session, isLoading } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => {
    return typeof window !== 'undefined' ? window.innerWidth >= 1024 : true;
  });

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsSidebarOpen(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-3 text-slate-400 font-sans">
        <Loader2 className="animate-spin text-emerald-500" size={32} />
        <span className="text-xs font-black uppercase tracking-widest text-emerald-500">
          Initializing StrixOS Engine...
        </span>
      </div>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  return (
    <div className="flex h-screen w-screen bg-slate-900 text-slate-900 font-sans antialiased overflow-hidden">
      <GlobalSyncEngine />

      {/* Desktop Persistent Rail / Expanded Sidebar */}
      <div className="hidden lg:flex h-full z-20 shrink-0">
        <Sidebar isOpen={isSidebarOpen} />
      </div>

      {/* Mobile Drawer Overlay */}
      <div
        className={`lg:hidden fixed inset-0 z-50 transition-all duration-300 ${
          isSidebarOpen ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
      >
        <button
          type="button"
          aria-label="Close navigation overlay"
          className={`absolute inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity duration-300 w-full h-full border-none cursor-pointer ${
            isSidebarOpen ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={() => setIsSidebarOpen(false)}
        />
        <div
          className={`absolute top-0 left-0 h-full w-[280px] bg-slate-900 shadow-2xl transition-transform duration-300 ${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <Sidebar isOpen={true} onMobileClose={() => setIsSidebarOpen(false)} />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden bg-slate-100">
        <Header onMenuClick={() => setIsSidebarOpen((prev) => !prev)} />

        {/* Rigid containment container to guarantee table fits within remaining viewport */}
        <main className="flex-1 min-h-0 flex flex-col p-3 sm:p-4 lg:p-5 overflow-hidden">
          <RouteGatekeeper>
            <Outlet />
          </RouteGatekeeper>
        </main>
      </div>
    </div>
  );
}

export default Route;