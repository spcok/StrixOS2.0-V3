import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { get, set, del } from 'idb-keyval';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';

import { initGlobalTelemetry } from './lib/telemetry';
import { routeTree } from './routeTree.gen';
import { supabase } from './lib/supabase';
import './index.css';

// Initialize global error interception
initGlobalTelemetry();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24 * 14,
      staleTime: 1000 * 60 * 5,
      retry: 3,
      refetchOnWindowFocus: true,
      networkMode: 'offlineFirst',
    },
    mutations: {
      networkMode: 'offlineFirst',
      retry: (failureCount, error: any) => {
        const isAuthError =
          error?.status === 401 ||
          error?.code === 'PGRST301' ||
          error?.message?.includes('JWT');

        if (isAuthError) {
          console.warn('[Sync Engine] Session token expired. Refreshing...');
          supabase.auth.refreshSession().catch(console.error);
          return true;
        }

        return failureCount < 3;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});

const idbStorage = {
  getItem: async (key: string) => {
    const val = await get(key);
    return val === undefined ? null : val;
  },
  setItem: async (key: string, value: any) => set(key, value),
  removeItem: async (key: string) => del(key),
};

const persister = createAsyncStoragePersister({
  storage: idbStorage as any,
});

const isIOS =
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

if (!isIOS) {
  persistQueryClient({
    queryClient,
    persister,
    maxAge: 1000 * 60 * 60 * 24 * 14,
    buster: 'v2.0.0',
    dehydrateOptions: {
      shouldDehydrateQuery: (query) => query.state.status === 'success',
      shouldDehydrateMutation: (mutation) => mutation.state.isPaused,
    },
  });
}

queryClient.resumePausedMutations();

onlineManager.subscribe((isOnline) => {
  if (isOnline) {
    queryClient.resumePausedMutations();
  }
});

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  defaultNotFoundComponent: () => (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 p-6 font-sans">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-slate-200 flex flex-col items-center text-center">
        <h1 className="text-5xl font-black text-slate-900 mb-2 tracking-tight">404</h1>
        <p className="font-bold uppercase tracking-widest text-xs mb-6 text-slate-500">
          Route Not Found
        </p>
        <a
          href="/"
          className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black uppercase text-xs tracking-widest transition-all shadow-md flex items-center justify-center gap-2 active:scale-95"
        >
          <Home size={14} className="text-emerald-400" />
          <span>Return to Dashboard</span>
        </a>
      </div>
    </div>
  ),
  defaultErrorComponent: ({ error, reset }) => (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 p-6 font-sans">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-lg w-full border border-rose-200 flex flex-col items-center text-center">
        <div className="w-14 h-14 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-center mb-4">
          <AlertTriangle className="text-rose-600" size={28} />
        </div>
        <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight mb-1">
          System Exception
        </h2>
        <div className="text-xs font-medium text-rose-800 mb-6 bg-rose-50/60 p-4 rounded-xl border border-rose-200 w-full overflow-x-auto text-left font-mono leading-relaxed">
          {error.message || 'An unexpected runtime error occurred.'}
        </div>
        <div className="grid grid-cols-2 gap-3 w-full">
          <button
            type="button"
            onClick={() => reset()}
            className="py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-black uppercase tracking-widest text-xs transition-all active:scale-95 cursor-pointer"
          >
            Retry Route
          </button>
          <button
            type="button"
            onClick={() => {
              queryClient.clear();
              reset();
            }}
            className="py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black uppercase tracking-widest text-xs transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <RotateCcw size={13} className="text-emerald-400" />
            <span>Flush Cache</span>
          </button>
        </div>
      </div>
    </div>
  ),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById('root');
if (rootElement && !rootElement.innerHTML) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </React.StrictMode>
  );
}