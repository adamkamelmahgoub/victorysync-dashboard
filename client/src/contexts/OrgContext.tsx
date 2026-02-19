import type { FC, ReactNode } from "react";
import { createContext, useContext, useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "./AuthContext";

type Org = {
  id: string;
  name: string;
  timezone: string;
  sla_target_percent: number;
  sla_target_seconds: number;
  business_hours: Record<string, { open: string; close: string } | null>;
  escalation_email: string | null;
};

type OrgMember = {
  org_id: string;
  user_id: string;
  role: 'agent' | 'org_manager' | 'org_admin' | 'org_owner' | 'owner' | 'admin' | 'member';
};

/**
 * Normalize role from database to app-level role
 */
function normalizeRole(role: string | null | undefined): 'owner' | 'admin' | 'member' {
  if (!role) return 'member';
  
  const normalized = role.toLowerCase().trim();
  
  if (normalized === 'org_owner' || normalized === 'owner') return 'owner';
  if (normalized === 'org_admin' || normalized === 'admin') return 'admin';
  if (normalized === 'org_member' || normalized === 'member' || normalized === 'agent') return 'member';
  
  return 'member';
}

type OrgContextValue = {
  org: Org | null;
  member: OrgMember | null;
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
  isOwner: boolean;
  isPlatformAdmin: boolean;
  refresh: () => Promise<void>;
};

const OrgContext = createContext<OrgContextValue | undefined>(undefined);

export const OrgProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { user, globalRole } = useAuth();
  const [org, setOrg] = useState<Org | null>(null);
  const [member, setMember] = useState<OrgMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchInProgressRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);

  const fetchOrgData = async () => {
    // Prevent concurrent fetches
    if (fetchInProgressRef.current) {
      console.debug('[OrgContext] Fetch already in progress, skipping');
      return;
    }

    if (!user) {
      console.debug('[OrgContext] No user, clearing org data');
      setOrg(null);
      setMember(null);
      setError(null);
      setLoading(false);
      lastUserIdRef.current = null;
      return;
    }

    // Prevent re-fetching for same user unless forced
    if (lastUserIdRef.current === user.id && org !== null && !loading && !error) {
      console.debug('[OrgContext] Already fetched for this user, skipping');
      return;
    }

    try {
      fetchInProgressRef.current = true;
      setLoading(true);
      setError(null);

      // Check if user is platform admin
      const isPlatformAdmin = globalRole === 'platform_admin';

      // For platform admins, don't require org membership
      if (isPlatformAdmin) {
        console.debug('[OrgContext] User is platform admin, no org required');
        setOrg(null);
        setMember(null);
        setLoading(false);
        lastUserIdRef.current = user.id;
        return;
      }

      // Get org_id from user metadata first (faster, no RLS)
      const metadataOrgId = (user?.user_metadata as any)?.org_id;
      console.info('[ORG] user metadata org_id:', metadataOrgId);

      // Query both membership tables, then merge.
      const [{ data: orgMembers, error: orgMembersError }, { data: orgUsers, error: orgUsersError }] = await Promise.all([
        supabase.from('org_members').select('org_id, user_id, role').eq('user_id', user.id),
        supabase.from('org_users').select('org_id, user_id, role').eq('user_id', user.id),
      ]);

      if (orgMembersError && orgUsersError) {
        console.error('[OrgContext] Error fetching memberships:', { orgMembersError, orgUsersError });
        setError(`Failed to load organization: ${orgMembersError.message || orgUsersError.message}`);
        setOrg(null);
        setMember(null);
        setLoading(false);
        lastUserIdRef.current = user.id;
        return;
      }

      const mergedMemberships = [...(orgMembers || []), ...(orgUsers || [])] as Array<{ org_id: string; user_id: string; role: string }>;
      const memberships = Array.from(
        new Map(mergedMemberships.filter((m) => m?.org_id).map((m) => [m.org_id, m])).values()
      );

      console.info('[ORG] memberships query result:', { memberships, memberError: orgMembersError || orgUsersError });

      // Ensure memberships is an array
      if (!Array.isArray(memberships)) {
        console.error('[OrgContext] org_members query did not return an array:', memberships);
        setError('Invalid response from org_members query');
        setOrg(null);
        setMember(null);
        setLoading(false);
        lastUserIdRef.current = user.id;
        return;
      }

      console.info('[ORG] memberships count:', memberships.length);

      // No memberships found - check metadata as fallback
      if (memberships.length === 0) {
        console.warn('[OrgContext] No org_members memberships found');
        
        if (metadataOrgId) {
          console.info('[OrgContext] Attempting fallback to metadata org_id');
          
          // Try to fetch organization from metadata org_id using .select() for array
          const { data: metaOrgArray, error: metaOrgError } = await supabase
            .from('organizations')
            .select('*')
            .eq('id', metadataOrgId);

          console.info('[ORG] metadata fallback organizations query:', { metaOrgArray, metaOrgError });

          if (!metaOrgError && Array.isArray(metaOrgArray) && metaOrgArray.length > 0) {
            const orgData = metaOrgArray[0];
            console.info('[OrgContext] Loaded org from metadata fallback');
            setOrg(orgData);
            // Synthetic member record from metadata
            const metadataRole = (user?.user_metadata as any)?.role || 'agent';
            setMember({
              org_id: metadataOrgId,
              user_id: user.id,
              role: metadataRole as any
            });
            setLoading(false);
            lastUserIdRef.current = user.id;
            return;
          }
        }

        // No membership anywhere - this is expected for new users
        console.warn('[OrgContext] No organization membership found for user');
        setOrg(null);
        setMember(null);
        setError(null);  // Don't show error, just "no org linked"
        setLoading(false);
        lastUserIdRef.current = user.id;
        return;
      }

      // At least one membership found - pick the first one
      // (could enhance to use localStorage for multi-org support)
      const membership = memberships[0];
      console.info('[ORG] activeOrgId:', membership.org_id);
      console.info('[ORG] raw role:', membership.role);

      // Normalize the role
      const normalizedRole = normalizeRole(membership.role);
      console.info('[ORG] normalized role:', normalizedRole);

      // Fetch full organization details using .select() for array return, then take first result
      const { data: orgDataArray, error: orgError } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', membership.org_id);

      console.info('[ORG] organizations query result:', { orgDataArray, orgError });

      if (orgError) {
        console.error('[OrgContext] Error fetching organization:', orgError);
        
        // If org not found, try to recover by creating it
        if (orgError.code === 'PGRST116' || orgError.message?.includes('No rows found')) {
          console.warn('[OrgContext] Organization not found, attempting recovery');
          
          // Call server endpoint to recover/create missing org
          try {
            const response = await fetch('/api/org/recover', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
              },
              body: JSON.stringify({ orgId: membership.org_id })
            });
            
            if (response.ok) {
              const recoveredOrg = await response.json();
              console.info('[OrgContext] Recovered organization:', recoveredOrg);
              setOrg(recoveredOrg);
              setMember({
                org_id: membership.org_id,
                user_id: membership.user_id,
                role: normalizedRole as any
              });
              setLoading(false);
              lastUserIdRef.current = user.id;
              return;
            }
          } catch (recoveryError) {
            console.error('[OrgContext] Recovery failed:', recoveryError);
          }
        }
        
        setError(`Organization not found or access denied: ${orgError.message}`);
        setOrg(null);
        setMember(null);
        setLoading(false);
        lastUserIdRef.current = user.id;
        return;
      }

      // Ensure we got an array
      if (!Array.isArray(orgDataArray)) {
        console.error('[OrgContext] organizations query did not return an array:', orgDataArray);
        setError('Invalid response from organizations query');
        setOrg(null);
        setMember(null);
        setLoading(false);
        lastUserIdRef.current = user.id;
        return;
      }

      // Get first matching organization
      const orgData = orgDataArray[0];
      if (!orgData) {
        console.error('[OrgContext] No organization found for org_id:', membership.org_id);
        setError('Organization not found');
        setOrg(null);
        setMember(null);
        setLoading(false);
        lastUserIdRef.current = user.id;
        return;
      }

      // NOW set both org and member - only after org data is confirmed
      console.info('[ORG] org:', orgData);
      setOrg(orgData);
      setMember({
        org_id: membership.org_id,
        user_id: membership.user_id,
        role: normalizedRole as any
      });
      console.info('[ORG] State updated:', { org: orgData, member: { org_id: membership.org_id, role: normalizedRole } });
      setError(null);
      setLoading(false);
      lastUserIdRef.current = user.id;

    } catch (err: any) {
      console.error('[OrgContext] Unexpected error:', err);
      setError(err.message || 'Failed to load organization');
      setOrg(null);
      setMember(null);
      setLoading(false);
      lastUserIdRef.current = user.id;
    } finally {
      fetchInProgressRef.current = false;
    }
  };

  useEffect(() => {
    fetchOrgData();
  }, [user?.id, globalRole]); // Only depend on user ID and globalRole to prevent loops

  const refresh = async () => {
    lastUserIdRef.current = null; // Force refetch
    await fetchOrgData();
  };

  const isPlatformAdmin = globalRole === 'platform_admin';
  // Normalized roles: member?.role is now 'owner', 'admin', or 'member'
  const isAdmin = member?.role === 'admin' || member?.role === 'owner' || isPlatformAdmin;
  const isOwner = member?.role === 'owner' || (member?.role === 'admin' && !isPlatformAdmin);

  return (
    <OrgContext.Provider value={{
      org,
      member,
      loading,
      error,
      isAdmin,
      isOwner,
      isPlatformAdmin,
      refresh
    }}>
      {/* Debug rendering */}
      {typeof window !== 'undefined' && (window as any).__DEBUG_ORG && console.log('[OrgProvider] Rendering with state:', { org, member, loading, error, isAdmin })}
      {children}
    </OrgContext.Provider>
  );
};

export const useOrg = () => {
  const context = useContext(OrgContext);
  if (!context) {
    throw new Error("useOrg must be used within OrgProvider");
  }
  return context;
};

export type { Org, OrgMember, OrgContextValue };
