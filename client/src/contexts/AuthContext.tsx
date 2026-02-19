import type { FC, ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import { buildApiUrl } from "../config";

type AuthContextValue = {
  user: User | null;
  orgs: Array<{ id: string; name: string }>;
  selectedOrgId: string | null;
  loading: boolean;
  globalRole: string | null;
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  setSelectedOrgId: (id: string | null) => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [globalRole, setGlobalRole] = useState<string | null>(null);

  useEffect(() => {
    // Check current session on mount, but timeout to avoid infinite loading
    const initializeAuth = async () => {
      try {
        const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 5000));
        const getSessionPromise = supabase.auth.getSession();

        const r: any = await Promise.race([getSessionPromise, timeoutPromise]);
        if (r && r.timeout) {
          console.warn('[AuthContext] getSession timed out after 5000ms');
        } else if (r && r.data && r.data.session?.user) {
          const user = r.data.session.user;
          setUser(user);
          // Try to read canonical profile from backend and orgs list
          try {
            const profileRes = await fetch(buildApiUrl('/api/user/profile'), { headers: { 'x-user-id': user.id } });
            if (profileRes.ok) {
              const profileData = await profileRes.json();
              if (profileData.profile) setGlobalRole(profileData.profile.global_role ?? null);
            }
          } catch (e) {
            console.warn('[AuthContext] init fetch profile failed', e);
          }
          try {
            const orgsRes = await fetch(buildApiUrl('/api/user/orgs'), { headers: { 'x-user-id': user.id } });
            if (orgsRes.ok) {
              const j = await orgsRes.json();
              const list = (j.orgs || []).map((o: any) => ({ id: o.id, name: o.name }));
              setOrgs(list);
              const isAdmin = (user.user_metadata?.global_role === 'platform_admin');
              if (isAdmin) {
                setSelectedOrgId(null);
              } else {
                const metadataOrgId = (user.user_metadata as any)?.org_id || null;
                const assignedOrgId = metadataOrgId && list.some((o: any) => o.id === metadataOrgId) ? metadataOrgId : null;
                setSelectedOrgId(assignedOrgId);
              }
            }
          } catch (e) {
            console.warn('[AuthContext] init fetch orgs failed', e);
          }
        }
      } catch (error) {
        console.error("Error initializing auth:", error);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    // Subscribe to auth changes
    let subscription: any = null;
    try {
      const sub = supabase.auth.onAuthStateChange(async (event, session) => {
        if (session?.user) {
          setUser(session.user);
          try {
            const profileRes = await fetch(buildApiUrl('/api/user/profile'), { headers: { 'x-user-id': session.user.id } });
            if (profileRes.ok) {
              const profileData = await profileRes.json();
              if (profileData.profile) setGlobalRole(profileData.profile.global_role ?? null);
            }
          } catch (e) { /* ignore */ }
          try {
            const orgsRes = await fetch(buildApiUrl('/api/user/orgs'), { headers: { 'x-user-id': session.user.id } });
            if (orgsRes.ok) {
              const j = await orgsRes.json();
              const list = (j.orgs || []).map((o: any) => ({ id: o.id, name: o.name }));
              setOrgs(list);
              const isAdmin = (session.user.user_metadata?.global_role === 'platform_admin');
              if (isAdmin) {
                setSelectedOrgId(null);
              } else {
                const metadataOrgId = (session.user.user_metadata as any)?.org_id || null;
                const assignedOrgId = metadataOrgId && list.some((o: any) => o.id === metadataOrgId) ? metadataOrgId : null;
                setSelectedOrgId(assignedOrgId);
              }
            }
          } catch (e) { /* ignore */ }
        } else {
          setUser(null);
          setOrgs([]);
          setSelectedOrgId(null);
          setGlobalRole(null);
        }
        setLoading(false);
      });
      subscription = sub.data?.subscription || sub;
    } catch (e) {
      console.warn('Auth subscription failed to initialize:', e);
      subscription = null;
    }

    return () => {
      try {
        subscription?.unsubscribe?.();
      } catch (e) {
        // ignore
      }
      // nothing to clear
    };
  }, []);

  const signIn = async (
    email: string,
    password: string
  ): Promise<{ error?: string }> => {
    try {
      console.log('[AuthContext] Attempting sign in for:', email);
      // guard against the Supabase client hanging by adding an explicit timeout
      const timeoutMs = 10000; // 10s
      const signInPromise = supabase.auth.signInWithPassword({ email, password });
      const res: any = await Promise.race([
        signInPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('sign-in timeout')), timeoutMs)),
      ]);
      console.log('[AuthContext] Sign in response:', res);

      if (res?.error) {
        console.error('[AuthContext] Auth error:', res.error);
        return { error: res.error?.message ?? String(res.error) };
      }

      const data = res?.data;
      if (data && data.user) {
        console.log('[AuthContext] Sign in successful, setting user:', data.user.email);
        setUser(data.user);
        const role = data.user.user_metadata?.global_role ?? null;
        setGlobalRole(role);

        // Fetch profile from backend to get canonical global_role
        try {
          const profileRes = await fetch(buildApiUrl('/api/user/profile'), {
            headers: { 'x-user-id': data.user.id }
          });
          if (profileRes.ok) {
            const profileData = await profileRes.json();
            if (profileData.profile) setGlobalRole(profileData.profile.global_role ?? null);
          }
        } catch (profileErr) {
          console.warn('[AuthContext] Failed to fetch profile:', profileErr);
        }

        // Fetch orgs for user
        try {
          const orgsRes = await fetch(buildApiUrl('/api/user/orgs'), { headers: { 'x-user-id': data.user.id } });
          if (orgsRes.ok) {
            const j = await orgsRes.json();
            const list = (j.orgs || []).map((o: any) => ({ id: o.id, name: o.name }));
            setOrgs(list);
            if (data.user.user_metadata?.global_role === 'platform_admin') {
              setSelectedOrgId(null);
            } else {
              const metadataOrgId = (data.user.user_metadata as any)?.org_id || null;
              const assignedOrgId = metadataOrgId && list.some((o: any) => o.id === metadataOrgId) ? metadataOrgId : null;
              setSelectedOrgId(assignedOrgId);
            }
          }
        } catch (e) {
          console.warn('[AuthContext] Failed to fetch orgs:', e);
        }
      }

      if (!data || !data.user) {
        console.warn('[AuthContext] Sign in returned no user object');
        return { error: 'Sign in did not return a user' };
      }

      return {};
    } catch (err: any) {
      console.error('[AuthContext] Sign in exception:', err);
      return { error: err?.message ?? 'Sign in failed' };
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setOrgs([]);
      setSelectedOrgId(null);
      setGlobalRole(null);
    } catch (err) {
      console.error("Sign out error:", err);
    }
  };

  const refreshProfile = async () => {
    try {
      if (!user) return;
      // Fetch latest user profile from backend which has global_role from database
      const response = await fetch(buildApiUrl('/api/user/profile'), {
        headers: { 'x-user-id': user.id }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.profile) {
          setGlobalRole(data.profile.global_role ?? null);
        }
      }
    } catch (e) {
      console.warn('[AuthContext] Failed to refresh profile:', e);
    }
  };

  return (
    <AuthContext.Provider value={{ user, orgs, selectedOrgId, loading, globalRole, refreshProfile, signIn, signOut, setSelectedOrgId }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};

export type { AuthContextValue };
