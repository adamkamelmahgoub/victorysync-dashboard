import type { FC, ReactNode } from "react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { buildApiUrl } from "../config";
import { postLog } from "../lib/logging";

type AppUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, any>;
};

type AuthContextValue = {
  user: AppUser | null;
  orgs: Array<{ id: string; name: string; logo_url?: string | null }>;
  selectedOrgId: string | null;
  loading: boolean;
  authError: string | null;
  globalRole: string | null;
  featureAccess: Record<string, boolean>;
  featureAccessLoaded: boolean;
  profile: { full_name?: string; phone_number?: string; profile_pic_url?: string; theme?: string } | null;
  refreshProfile: () => Promise<void>;
  refreshFeatures: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  setSelectedOrgId: (id: string | null) => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchJsonWithTimeout(url: string, init?: RequestInit, timeoutMs = 5000) {
  const timeoutPromise = new Promise<null>((resolve) => {
    window.setTimeout(() => resolve(null), timeoutMs);
  });

  const response = await Promise.race([
    fetch(url, init).catch(() => null),
    timeoutPromise,
  ]);

  if (!response || !(response instanceof Response) || !response.ok) {
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

export const AuthProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string; logo_url?: string | null }>>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [globalRole, setGlobalRole] = useState<string | null>(null);
  const [featureAccess, setFeatureAccess] = useState<Record<string, boolean>>({});
  const [featureAccessLoaded, setFeatureAccessLoaded] = useState(false);
  const [profile, setProfile] = useState<{ full_name?: string; phone_number?: string; profile_pic_url?: string; theme?: string } | null>(null);
  const currentUserIdRef = useRef<string | null>(null);

  const resetAuthState = () => {
    setUser(null);
    setOrgs([]);
    setSelectedOrgId(null);
    setGlobalRole(null);
    setFeatureAccess({});
    setFeatureAccessLoaded(true);
    setProfile(null);
    setAuthError(null);
  };

  const loadFeatures = async (nextUser: AppUser | null = user, orgId: string | null = selectedOrgId) => {
    if (!nextUser) {
      setFeatureAccess({});
      setFeatureAccessLoaded(true);
      return;
    }
    setFeatureAccessLoaded(false);
    const suffix = orgId ? `?org_id=${encodeURIComponent(orgId)}` : "";
    const data = await fetchJsonWithTimeout(buildApiUrl(`/api/me/features${suffix}`), undefined, 5000);
    setFeatureAccess(data?.features || {});
    setFeatureAccessLoaded(true);
  };

  const hydrateUserContext = async () => {
    const [profileData, orgsData] = await Promise.all([
      fetchJsonWithTimeout(buildApiUrl("/api/user/profile")),
      fetchJsonWithTimeout(buildApiUrl("/api/user/orgs")),
    ]);

    const internalUser: AppUser | null = profileData?.user?.id
      ? {
          id: profileData.user.id,
          email: profileData.user.email || null,
          user_metadata: {
            global_role: profileData?.profile?.global_role ?? null,
            org_id: null,
          },
        }
      : null;

    if (!internalUser) {
      throw new Error("We signed you in, but could not load your VictorySync profile. Please contact an admin if this continues.");
    }

    setAuthError(null);
    currentUserIdRef.current = internalUser.id;
    setUser(internalUser);
    setGlobalRole(profileData?.profile?.global_role ?? null);

    if (profileData?.user) {
      setProfile({
        full_name: profileData.user.full_name || "",
        phone_number: profileData.user.phone_number || "",
        profile_pic_url: profileData.user.profile_pic_url || "",
        theme: profileData.user.theme || "dark",
      });
    }

    const list = (orgsData?.orgs || []).map((o: any) => ({ id: o.id, name: o.name, logo_url: o.logo_url || "" }));
    setOrgs(list);

    const resolvedRole = profileData?.profile?.global_role ?? null;
    if (resolvedRole === "platform_admin") {
      setSelectedOrgId(null);
      void loadFeatures(internalUser, null);
    } else {
      const assignedOrgId = list[0]?.id || null;
      setSelectedOrgId(assignedOrgId);
      void loadFeatures(internalUser, assignedOrgId);
    }
  };

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setLoading(true);
        hydrateUserContext()
          .catch((err) => {
            console.error("Error initializing auth:", err);
            setAuthError(err?.message || "Unable to restore your session.");
            resetAuthState();
          })
          .finally(() => setLoading(false));
      } else {
        resetAuthState();
        setLoading(false);
      }
    });

    // Listen for sign-in / sign-out.
    // Skip TOKEN_REFRESHED and INITIAL_SESSION — those fire on every tab-focus/token
    // renewal and must NOT trigger a setLoading(true) or re-hydration (that's what
    // caused the "Loading…" flash every time the user switched apps).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') return;
      if (session?.user) {
        const sameUser = currentUserIdRef.current === session.user.id;
        if (sameUser) {
          void hydrateUserContext().catch((err) => console.error("Error refreshing auth context:", err));
          return;
        }
        setLoading(true);
        hydrateUserContext()
          .catch((err) => {
            console.error("Error on auth state change:", err);
            setAuthError(err?.message || "Unable to load your account access.");
            resetAuthState();
          })
          .finally(() => setLoading(false));
      } else {
        resetAuthState();
        currentUserIdRef.current = null;
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadFeatures(user, selectedOrgId);
  }, [user?.id, selectedOrgId]);

  const signIn = async (email: string, password: string): Promise<{ error?: string }> => {
    setLoading(true);
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) {
      const message = /invalid login credentials/i.test(error.message)
        ? "The email or password is incorrect."
        : error.message || "Unable to sign in. Please try again.";
      setAuthError(message);
      setLoading(false);
      return { error: message };
    }

    try {
      await hydrateUserContext();
      return {};
    } catch (err: any) {
      console.error("Error hydrating auth after sign-in:", err);
      const message = err?.message || "Signed in, but failed to load your dashboard access.";
      setAuthError(message);
      return { error: message };
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      postLog("/api/logs/auth", { event_type: "logout", email: user?.email || null });
      await supabase.auth.signOut();
      resetAuthState();
      currentUserIdRef.current = null;
    } catch (err) {
      console.error("Sign out error:", err);
      resetAuthState();
      currentUserIdRef.current = null;
    }
  };

  const refreshProfile = async () => {
    try {
      if (!user) return;
      await hydrateUserContext();
      await loadFeatures(user, selectedOrgId);
    } catch (e) {
      console.warn("[AuthContext] Failed to refresh profile:", e);
    }
  };

  const refreshFeatures = async () => {
    await loadFeatures(user, selectedOrgId);
  };

  return (
    <AuthContext.Provider value={{ user, orgs, selectedOrgId, loading, authError, globalRole, featureAccess, featureAccessLoaded, profile, refreshProfile, refreshFeatures, signIn, signOut, setSelectedOrgId }}>
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
