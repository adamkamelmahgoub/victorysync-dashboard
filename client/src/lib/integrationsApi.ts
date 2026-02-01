import { fetchJson } from './apiClient';

export async function getOrgIntegration(orgId: string, userId?: string, provider: string = 'mightycall') {
  const q = new URLSearchParams();
  if (provider) q.set('provider', provider);
  return await fetchJson(`/api/admin/orgs/${encodeURIComponent(orgId)}/integrations?${q.toString()}`, { headers: { 'x-user-id': userId || '' } });
}

export async function saveOrgIntegration(orgId: string, provider: string, credentials: any, metadata: any = {}, userId?: string) {
  return await fetchJson(`/api/admin/orgs/${encodeURIComponent(orgId)}/integrations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': userId || '' },
    body: JSON.stringify({ provider, credentials, metadata })
  });
}

export async function deleteOrgIntegration(orgId: string, provider: string, userId?: string) {
  return await fetchJson(`/api/admin/orgs/${encodeURIComponent(orgId)}/integrations/${encodeURIComponent(provider)}`, {
    method: 'DELETE',
    headers: { 'x-user-id': userId || '' }
  });
}
