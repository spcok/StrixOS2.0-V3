import type { Session, User } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { del, get, set } from 'idb-keyval';
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { toast } from 'sonner';
import { supabase } from './supabase';

// --- Configuration & Constants ---
const SECURITY_HEARTBEAT_TTL_MS = 72 * 60 * 60 * 1000; // 72 Hours Offline Expiration
const HEARTBEAT_STORAGE_KEY = 'strixos_last_auth_heartbeat';
const HEARTBEAT_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 Minutes Loop

export interface UserProfile {
  id: string;
  name: string | null;
  initials: string | null;
  pin?: string | null;
  role: string | null;
  avatar_url?: string | null;
  phone?: string | null;
  is_active?: boolean;
  email?: string | null;
}

export interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isLocked: boolean;
  hasPermission: (permission: string, showToastOnDenied?: boolean) => boolean;
  checkAccess: (allowedRoles: string[]) => boolean;
  lockSession: () => void;
  unlockSession: (pinCode: string) => boolean;
  logout: (isExpired?: boolean) => Promise<void>;
  signOut: (isExpired?: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const getPermissionsQueryOptions = (role?: string | null) => {
  const normalizedRole = role ? role.toUpperCase().trim() : 'ANONYMOUS';
  return {
    queryKey: ['rbac_permissions', normalizedRole],
    queryFn: async () => {
      if (!role) return [];
      const { data, error } = await supabase
        .from('rbac_matrix')
        .select('permissions, capabilities')
        .ilike('role', normalizedRole)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('[RBAC Engine] Matrix fetch error:', error.message);
      }

      const permissionsArray = (data?.permissions || data?.capabilities || []) as string[];
      return permissionsArray;
    },
    networkMode: 'offlineFirst' as const,
    staleTime: 1000 * 60 * 60 * 24, // 24 Hours Cache
    gcTime: 1000 * 60 * 60 * 24 * 14, // 14 Days Disk Persistence
    meta: { persist: true },
  };
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(false);

  // Restore soft-lock state from storage
  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('strix-is-locked') === 'true') {
      setIsLocked(true);
    }
  }, []);

  const lockSession = useCallback(() => {
    setIsLocked(true);
    if (typeof window !== 'undefined') {
      localStorage.setItem('strix-is-locked', 'true');
    }
  }, []);

  const logout = useCallback(
    async (isExpired = false) => {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn('[Auth Engine] Supabase signout error:', err);
      }

      await del('strix-auth-session');
      if (typeof window !== 'undefined') {
        localStorage.removeItem(HEARTBEAT_STORAGE_KEY);
        localStorage.removeItem('strix-is-locked');
      }

      queryClient.clear();
      setSession(null);
      setUser(null);
      setIsLocked(false);

      if (isExpired) {
        toast.error(
          'Security session expired (72h offline limit reached). Logged out for data protection.'
        );
      }
    },
    [queryClient]
  );

  const evaluateSecurityHeartbeat = useCallback(() => {
    if (!user) return;
    if (typeof window === 'undefined') return;

    if (navigator.onLine) {
      localStorage.setItem(HEARTBEAT_STORAGE_KEY, Date.now().toString());
    } else {
      const lastHeartbeatStr = localStorage.getItem(HEARTBEAT_STORAGE_KEY);
      const lastHeartbeat = lastHeartbeatStr ? Number.parseInt(lastHeartbeatStr, 10) : 0;
      if (lastHeartbeat > 0 && Date.now() - lastHeartbeat > SECURITY_HEARTBEAT_TTL_MS) {
        logout(true);
      }
    }
  }, [user, logout]);

  // 1. Auth Initialization & Indestructible IndexedDB Fallback
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const {
          data: { session: nativeSession },
        } = await supabase.auth.getSession();
        let activeSession = nativeSession;

        if (!activeSession) {
          const cachedSession = await get<Session>('strix-auth-session');
          if (cachedSession) {
            await supabase.auth.setSession(cachedSession);
            activeSession = cachedSession;
          }
        } else {
          await set('strix-auth-session', activeSession);
        }

        setSession(activeSession);
        setUser(activeSession?.user ?? null);
      } catch (error) {
        console.error('[Auth Engine] Initialization failed:', error);
      } finally {
        setIsSessionLoading(false);
      }
    };

    initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (newSession) {
        await set('strix-auth-session', newSession);
        if (typeof window !== 'undefined') {
          localStorage.setItem(HEARTBEAT_STORAGE_KEY, Date.now().toString());
        }
      } else if (event === 'SIGNED_OUT') {
        await del('strix-auth-session');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 2. Security Heartbeat Timer Loop
  useEffect(() => {
    if (!user) return;

    const heartbeatInterval = setInterval(() => {
      evaluateSecurityHeartbeat();
    }, HEARTBEAT_CHECK_INTERVAL_MS);

    evaluateSecurityHeartbeat();

    return () => clearInterval(heartbeatInterval);
  }, [evaluateSecurityHeartbeat, user]);

  // 3. User Profile Query
  const { data: profile, status: profileStatus } = useQuery<UserProfile | null>({
    queryKey: ['userProfile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('users')
        .select('id, name, initials, pin, role, email, avatar_url, phone, is_active')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        console.warn('[Auth Engine] Profile fetch failed:', error.message);
        return null;
      }
      return data as UserProfile | null;
    },
    enabled: Boolean(user?.id),
    networkMode: 'offlineFirst',
    staleTime: 1000 * 60 * 15,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    meta: { persist: true },
  });

  // 4. In-Memory RBAC Capability Lookups
  const { data: rawPermissions = [] } = useQuery(getPermissionsQueryOptions(profile?.role));
  const activePermissionsSet = useMemo(() => new Set<string>(rawPermissions), [rawPermissions]);

  const hasPermission = useCallback(
    (permission: string, showToastOnDenied = false): boolean => {
      if (profileStatus === 'pending') return false;
      if (!profile) return false;
      if (isLocked) return false;

      const normalizedRole = profile.role?.toUpperCase().trim() || '';
      const isRootRole = normalizedRole === 'ADMIN' || normalizedRole === 'DIRECTOR';

      const allowed =
        isRootRole ||
        activePermissionsSet.has(permission) ||
        activePermissionsSet.has('*');

      if (!allowed && showToastOnDenied) {
        toast.error('Unauthorized Access: Permission denied.');
      }

      return allowed;
    },
    [profile, profileStatus, isLocked, activePermissionsSet]
  );

  const checkAccess = useCallback(
    (allowedRoles: string[]): boolean => {
      if (!profile || isLocked) return false;
      const normalizedRole = profile.role?.toUpperCase().trim() || '';
      if (normalizedRole === 'ADMIN' || normalizedRole === 'DIRECTOR') return true;
      return allowedRoles.map((r) => r.toUpperCase().trim()).includes(normalizedRole);
    },
    [profile, isLocked]
  );

  const unlockSession = useCallback(
    (pinCode: string): boolean => {
      if (!profile?.pin || profile.pin === pinCode) {
        setIsLocked(false);
        if (typeof window !== 'undefined') {
          localStorage.removeItem('strix-is-locked');
        }
        return true;
      }
      return false;
    },
    [profile]
  );

  const isFullyLoading = isSessionLoading || (Boolean(user) && profileStatus === 'pending');

  const contextValue = useMemo<AuthContextType>(
    () => ({
      session,
      user,
      profile: profile || null,
      isLoading: isFullyLoading,
      isLocked,
      hasPermission,
      checkAccess,
      lockSession,
      unlockSession,
      logout: () => logout(false),
      signOut: () => logout(false),
    }),
    [
      session,
      user,
      profile,
      isFullyLoading,
      isLocked,
      hasPermission,
      checkAccess,
      lockSession,
      unlockSession,
      logout,
    ]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthProvider;