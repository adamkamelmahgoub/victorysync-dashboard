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

type MfaFactor = {
  id: string;
  type: "totp" | "email";
  label?: string;
  email?: string;
  verified?: boolean;
  enabled_at?: string | null;
};

type PendingMfaChallenge = {
  userId: string;
  email?: string | null;
  factors: MfaFactor[];
};

type AuthContextValue = {
  user: AppUser | null;
  orgs: Array<{ id: string; name: string; logo_url?: string | null }>;
  selectedOrgId: string | null;
  loading: boolean;
  authError: string | null;
  pendingMfa: PendingMfaChallenge | null;
  globalRole: string | null;
  featureAccess: Record<string, boolean>;
  featureAccessLoaded: boolean;
  profile: { full_name?: string; phone_number?: string; profile_pic_url?: string; theme?: string } | null;
  refreshProfile: () => Promise<void>;
  refreshFeatures: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error?: string; mfaRequired?: boolean; factors?: MfaFactor[]; email?: string | null }>;
  sendMfaEmailCode: () => Promise<{ error?: string }>;
  verifyMfa: (code: string, method: "totp" | "email") => Promise<{ error?: string }>;
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

function mfaSessionKey(userId: string) {
  return `victorysync:mfa-verified:${userId}`;
}

function hasMfaVerifiedSession(userId: string) {
  try {
    return window.sessionStorage.getItem(mfaSessionKey(userId)) === "true";
  } catch {
    return false;
  }
}

function setMfaVerifiedSession(userId: string) {
  try {
    window.sessionStorage.setItem(mfaSessionKey(userId), "true");
  } catch {}
}

function clearMfaVerifiedSession(userId?: string | null) {
  if (!userId) return;
  try {
    window.sessionStorage.removeItem(mfaSessionKey(userId));
  } catch {}
}

export const AuthProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string; logo_url?: string | null }>>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [pendingMfa, setPendingMfa] = useState<PendingMfaChallenge | null>(null);
  const [globalRole, setGlobalRole] = useState<string | null>(null);
  const [featureAccess, setFeatureAccess] = useState<Record<string, boolean>>({});
  const [featureAccessLoaded, setFeatureAccessLoaded] = useState(false);
  const [profile, setProfile] = useState<{ full_name?: string; phone_number?: string; profile_pic_url?: string; theme?: string } | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const passwordSignInInProgressRef = useRef(false);
  const mfaGateUserIdRef = useRef<string | null>(null);

  const resetAuthState = (clearMfa = true) => {
    setUser(null);
    setOrgs([]);
    setSelectedOrgId(null);
    setGlobalRole(null);
    setFeatureAccess({});
    setFeatureAccessLoaded(true);
    setProfile(null);
    setAuthError(null);
    if (clearMfa) {
      setPendingMfa(null);
      mfaGateUserIdRef.current = null;
    }
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
        theme: profileData.user.theme || "light",
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

  const loadVerifiedMfaFactors = async (userId: string): Promise<MfaFactor[]> => {
    const data = await fetchJsonWithTimeout(
      buildApiUrl("/api/user/mfa/factors"),
      { headers: { "x-user-id": userId } },
      5000
    );
    return (data?.factors || []).filter((factor: MfaFactor) => factor?.verified);
  };

  const notifyLoginCompleted = async (method: string) => {
    try {
      await fetch(buildApiUrl("/api/user/security/login-notification"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method }),
      });
    } catch {
      // Login notifications are best-effort; never block the user from the dashboard.
    }
  };

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setLoading(true);
        loadVerifiedMfaFactors(session.user.id)
          .then((factors) => {
            if (factors.length > 0 && !hasMfaVerifiedSession(session.user.id)) {
              mfaGateUserIdRef.current = session.user.id;
              resetAuthState(false);
              setPendingMfa({ userId: session.user.id, email: session.user.email || null, factors });
              return null;
            }
            return hydrateUserContext();
          })
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
      if (event === 'SIGNED_IN' && passwordSignInInProgressRef.current) return;
      if (session?.user?.id && mfaGateUserIdRef.current === session.user.id) return;
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

  const signIn = async (email: string, password: string): Promise<{ error?: string; mfaRequired?: boolean; factors?: MfaFactor[]; email?: string | null }> => {
    setLoading(true);
    setAuthError(null);
    setPendingMfa(null);
    passwordSignInInProgressRef.current = true;
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) {
      passwordSignInInProgressRef.current = false;
      const message = /invalid login credentials/i.test(error.message)
        ? "The email or password is incorrect."
        : error.message || "Unable to sign in. Please try again.";
      setAuthError(message);
      setLoading(false);
      return { error: message };
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const sessionUser = session?.user;
      if (!sessionUser?.id) {
        throw new Error("We could not start your authenticated session. Please try again.");
      }

      const factors = await loadVerifiedMfaFactors(sessionUser.id);
      if (factors.length > 0) {
        clearMfaVerifiedSession(sessionUser.id);
        mfaGateUserIdRef.current = sessionUser.id;
        resetAuthState(false);
        setPendingMfa({ userId: sessionUser.id, email: sessionUser.email || email.trim().toLowerCase(), factors });
        setLoading(false);
        return { mfaRequired: true, factors, email: sessionUser.email || email.trim().toLowerCase() };
      }

      await hydrateUserContext();
      void notifyLoginCompleted("Password sign-in");
      return {};
    } catch (err: any) {
      console.error("Error hydrating auth after sign-in:", err);
      const message = err?.message || "Signed in, but failed to load your dashboard access.";
      setAuthError(message);
      return { error: message };
    } finally {
      passwordSignInInProgressRef.current = false;
      setLoading(false);
    }
  };

  const sendMfaEmailCode = async (): Promise<{ error?: string }> => {
    if (!pendingMfa) return { error: "Sign in again before requesting a two-factor email code." };
    const hasEmailFactor = pendingMfa.factors.some((factor) => factor.type === "email");
    if (!hasEmailFactor) return { error: "Email two-factor authentication is not enabled for this account." };

    const response = await fetch(buildApiUrl("/api/user/mfa-login/email/send"), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-id": pendingMfa.userId },
      body: JSON.stringify({}),
    }).catch(() => null);
    const data = await response?.json().catch(() => ({}));
    if (!response?.ok) {
      return { error: data?.detail || data?.error || "Unable to send the email code. Please try again." };
    }
    return {};
  };

  const verifyMfa = async (code: string, method: "totp" | "email"): Promise<{ error?: string }> => {
    if (!pendingMfa) return { error: "Sign in again before verifying your two-factor code." };
    const response = await fetch(buildApiUrl("/api/user/mfa-login/verify"), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-id": pendingMfa.userId },
      body: JSON.stringify({ code, method }),
    }).catch(() => null);
    const data = await response?.json().catch(() => ({}));
    if (!response?.ok) {
      return { error: data?.detail || data?.error || "The two-factor code could not be verified." };
    }

    try {
      mfaGateUserIdRef.current = null;
      setPendingMfa(null);
      setMfaVerifiedSession(pendingMfa.userId);
      setLoading(true);
      await hydrateUserContext();
      void notifyLoginCompleted(method === "email" ? "Password + email 2FA" : "Password + authenticator 2FA");
      return {};
    } catch (err: any) {
      const message = err?.message || "Two-factor verification succeeded, but dashboard access could not be loaded.";
      setAuthError(message);
      return { error: message };
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      postLog("/api/logs/auth", { event_type: "logout", email: user?.email || null });
      clearMfaVerifiedSession(user?.id || pendingMfa?.userId || currentUserIdRef.current);
      await supabase.auth.signOut();
      resetAuthState();
      currentUserIdRef.current = null;
    } catch (err) {
      console.error("Sign out error:", err);
      clearMfaVerifiedSession(user?.id || pendingMfa?.userId || currentUserIdRef.current);
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
    <AuthContext.Provider value={{ user, orgs, selectedOrgId, loading, authError, pendingMfa, globalRole, featureAccess, featureAccessLoaded, profile, refreshProfile, refreshFeatures, signIn, sendMfaEmailCode, verifyMfa, signOut, setSelectedOrgId }}>
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
