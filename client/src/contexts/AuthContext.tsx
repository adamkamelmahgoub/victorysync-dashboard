import type { FC, ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";

type AuthContextValue = {
  user: User | null;
  orgId: string | null;
  loading: boolean;
  globalRole: string | null;
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [globalRole, setGlobalRole] = useState<string | null>(null);

  useEffect(() => {
    // Check current session on mount
    const initializeAuth = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user) {
          setUser(data.session.user);
          setOrgId(data.session.user.user_metadata?.org_id ?? null);
          // fetch profile global_role for this user
          try {
            const { data: pData, error: pErr } = await supabase
              .from('profiles')
              .select('global_role')
              .eq('id', data.session.user.id)
              .maybeSingle();
            if (!pErr && pData) {
              setGlobalRole(pData.global_role ?? null);
            }
          } catch (e) {
            // ignore
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
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUser(session.user);
        setOrgId(session.user.user_metadata?.org_id ?? null);
        // refresh profile global_role on auth change
        try {
          const { data: pData, error: pErr } = await supabase
            .from('profiles')
            .select('global_role')
            .eq('id', session.user.id)
            .maybeSingle();
          if (!pErr && pData) setGlobalRole(pData.global_role ?? null);
        } catch (e) {
          // ignore
        }
      } else {
        setUser(null);
        setOrgId(null);
        setGlobalRole(null);
      }
      setLoading(false);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const signIn = async (
    email: string,
    password: string
  ): Promise<{ error?: string }> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error: error.message };
      }

      if (data.user) {
        setUser(data.user);
        setOrgId(data.user.user_metadata?.org_id ?? null);
      }

      return {};
    } catch (err: any) {
      return { error: err?.message ?? "Sign in failed" };
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setOrgId(null);
      setGlobalRole(null);
    } catch (err) {
      console.error("Sign out error:", err);
    }
  };

  const refreshProfile = async () => {
    try {
      if (!user) return;
      const { data: pData, error: pErr } = await supabase
        .from('profiles')
        .select('global_role')
        .eq('id', user.id)
        .maybeSingle();
      if (!pErr && pData) setGlobalRole(pData.global_role ?? null);
    } catch (e) {
      // ignore
    }
  };

  return (
    <AuthContext.Provider value={{ user, orgId, loading, globalRole, refreshProfile, signIn, signOut }}>
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
