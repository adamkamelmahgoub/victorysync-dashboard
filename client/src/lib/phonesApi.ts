// client/src/lib/phonesApi.ts
import { fetchJson } from './apiClient';

export interface PhoneNumber {
  id: string;
  org_id?: string;
  external_id?: string;
  number: string;
  number_digits?: string;
  label?: string;
  e164?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export async function getOrgPhoneNumbers(orgId: string, userId?: string): Promise<PhoneNumber[]> {
  const data = await fetchJson(`/api/orgs/${encodeURIComponent(orgId)}/phone-numbers`, { 
    headers: { 'x-user-id': userId || '' } 
  });
  return (data.phone_numbers || data.numbers || []) as PhoneNumber[];
}

export async function syncPhoneNumbers(orgId: string, userId?: string) {
  return await fetchJson(`/api/orgs/${encodeURIComponent(orgId)}/phone-numbers/sync`, { 
    method: 'POST',
    headers: { 'x-user-id': userId || '' } 
  });
}

export async function assignPhoneNumber(orgId: string, phoneNumber: string, label?: string, userId?: string) {
  return await fetchJson(`/api/orgs/${encodeURIComponent(orgId)}/phone-numbers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': userId || '' },
    body: JSON.stringify({ number: phoneNumber, label })
  });
}

export async function unassignPhoneNumber(orgId: string, phoneId: string, userId?: string) {
  return await fetchJson(`/api/orgs/${encodeURIComponent(orgId)}/phone-numbers/${encodeURIComponent(phoneId)}`, {
    method: 'DELETE',
    headers: { 'x-user-id': userId || '' }
  });
}
