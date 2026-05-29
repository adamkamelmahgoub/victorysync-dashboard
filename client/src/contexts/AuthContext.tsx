import type { FC, ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";
import {
  useAuth as useClerkAuth,
  useClerk,
  useUser as useClerkUser,
} from "@clerk/react";
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

declare global {
  interface Window {
    __victorysyncGetClerkToken?: () => Promise<string | null>;
    __victorysyncClerkUserId?: string | null;
  }
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchJsonWithTimeout(url: string, init?: RequestInit, timeoutMs = 8000) {
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
  const { isLoaded, isSignedIn, getToken, userId: clerkUserId } = useClerkAuth();
  const { user: clerkUser } = useClerkUser();
  const clerk = useClerk();
  const [user, setUser] = useState<AppUser | null>(null);
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string; logo_url?: string | null }>>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [globalRole, setGlobalRole] = useState<string | null>(null);
  const [featureAccess, setFeatureAccess] = useState<Record<string, boolean>>({});
  const [featureAccessLoaded, setFeatureAccessLoaded] = useState(false);
  const [profile, setProfile] = useState<{ full_name?: string; phone_number?: string; profile_pic_url?: string; theme?: string } | null>(null);

  useEffect(() => {
    window.__victorysyncGetClerkToken = async () => getToken();
    window.__victorysyncClerkUserId = clerkUserId || null;
    return () => {
      window.__victorysyncGetClerkToken = undefined;
      window.__victorysyncClerkUserId = null;
    };
  }, [getToken, clerkUserId]);

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
          email: profileData.user.email || clerkUser?.primaryEmailAddress?.emailAddress || null,
          user_metadata: {
            global_role: profileData?.profile?.global_role ?? null,
            org_id: null,
          },
        }
      : null;

    if (!internalUser) {
      setUser(null);
      setOrgs([]);
      setSelectedOrgId(null);
      setGlobalRole(null);
      setFeatureAccess({});
      setFeatureAccessLoaded(true);
      setProfile(null);
      return;
    }

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
    if (!isLoaded) return;

    if (!isSignedIn) {
      setUser(null);
      setOrgs([]);
      setSelectedOrgId(null);
      setGlobalRole(null);
      setFeatureAccess({});
      setFeatureAccessLoaded(true);
      setProfile(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    hydrateUserContext()
      .catch((error) => {
        console.error("Error initializing Clerk auth:", error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, clerkUserId]);

  useEffect(() => {
    if (!user) return;
    void loadFeatures(user, selectedOrgId);
  }, [user?.id, selectedOrgId]);

  const signIn = async (): Promise<{ error?: string }> => {
    clerk.openSignIn({ redirectUrl: "/dashboard" });
    return {};
  };

  const signOut = async () => {
    try {
      postLog("/api/logs/auth", { event_type: "logout", email: user?.email || null });
      await clerk.signOut({ redirectUrl: "/login" });
      setUser(null);
      setOrgs([]);
      setSelectedOrgId(null);
      setGlobalRole(null);
      setFeatureAccess({});
      setFeatureAccessLoaded(true);
      setProfile(null);
    } catch (err) {
      console.error("Sign out error:", err);
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
    <AuthContext.Provider value={{ user, orgs, selectedOrgId, loading, globalRole, featureAccess, featureAccessLoaded, profile, refreshProfile, refreshFeatures, signIn, signOut, setSelectedOrgId }}>
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
