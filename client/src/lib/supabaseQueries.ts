/**
 * Safe Supabase query helpers
 * Prevents malformed queries and handles RLS properly
 */

import { supabase } from './supabaseClient';

/**
 * Get organization membership for a user
 * Returns the first membership row if multiple exist
 */
export async function getOrgMembership(userId: string) {
  try {
    const { data, error } = await supabase
      .from('org_users')
      .select('org_id, user_id, role')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found
        return null;
      }
      throw error;
    }

    return data;
  } catch (err) {
    console.error('[supabaseQueries] Error fetching org membership:', err);
    return null;
  }
}

/**
 * Get organization by ID
 */
export async function getOrganization(orgId: string) {
  try {
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found
        return null;
      }
      throw error;
    }

    return data;
  } catch (err) {
    console.error('[supabaseQueries] Error fetching organization:', err);
    return null;
  }
}

/**
 * Get user profile (if it exists)
 * Safe query that handles missing profile gracefully
 */
export async function getUserProfile(userId: string) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, global_role')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.warn('[supabaseQueries] Error fetching profile (may not exist):', error.message);
      return null;
    }

    return data;
  } catch (err) {
    console.error('[supabaseQueries] Error in getUserProfile:', err);
    return null;
  }
}

/**
 * Get all organizations a user is a member of
 */
export async function getUserOrganizations(userId: string) {
  try {
    const { data, error } = await supabase
      .from('org_users')
      .select('org_id, role')
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    return data || [];
  } catch (err) {
    console.error('[supabaseQueries] Error fetching user organizations:', err);
    return [];
  }
}
