import { buildApiUrl } from '../config';
import type { QueryResult, PhoneNumber, DatabaseError } from './types';

/**
 * Get all phone numbers for the current organization
 */
export async function getPhoneNumbers(orgId: string): Promise<QueryResult<PhoneNumber>> {
  try {
    const response = await fetch(buildApiUrl(`/api/admin/phone-numbers?org_id=${encodeURIComponent(orgId)}`));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return { data: json.phone_numbers || [], error: null, count: json.phone_numbers?.length };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' },
      count: undefined
    };
  }
}

/**
 * Get a specific phone number by ID
 */
export async function getPhoneNumber(id: string): Promise<QueryResult<PhoneNumber>> {
  try {
    const response = await fetch(buildApiUrl(`/api/admin/phone-numbers/${encodeURIComponent(id)}`));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return { data: [json.phone_number], error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' }
    };
  }
}

/**
 * Create a new phone number
 */
export async function createPhoneNumber(
  phoneNumber: Omit<PhoneNumber, 'id' | 'created_at' | 'updated_at'>
): Promise<QueryResult<PhoneNumber>> {
  try {
    const response = await fetch(buildApiUrl('/api/admin/phone-numbers'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(phoneNumber)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return { data: [json.phone_number], error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' }
    };
  }
}

/**
 * Update a phone number
 */
export async function updatePhoneNumber(
  id: string,
  updates: Partial<Pick<PhoneNumber, 'label'>>
): Promise<QueryResult<PhoneNumber>> {
  try {
    const response = await fetch(buildApiUrl(`/api/admin/phone-numbers/${encodeURIComponent(id)}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return { data: [json.phone_number], error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' }
    };
  }
}

/**
 * Delete a phone number
 */
export async function deletePhoneNumber(id: string): Promise<{ error: DatabaseError | null }> {
  try {
    const response = await fetch(buildApiUrl(`/api/admin/phone-numbers/${encodeURIComponent(id)}`), {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { error: null };
  } catch (err) {
    return { error: { message: err instanceof Error ? err.message : 'Unknown error' } };
  }
}

/**
 * Get phone numbers with call metrics for today
 */
export async function getPhoneNumbersWithMetrics(orgId: string): Promise<QueryResult<PhoneNumber & { today_calls?: number; today_avg_wait?: number }>> {
  try {
    const url = new URL(buildApiUrl(`/api/admin/phone-numbers`));
    url.searchParams.append('org_id', orgId);
    url.searchParams.append('with_metrics', 'true');
    
    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return { data: json.phone_numbers || [], error: null, count: json.phone_numbers?.length };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Unknown error' }
    };
  }
}