import fetch from 'node-fetch';

export async function syncLeadToHubSpot(contactId: string | null, properties: Record<string, string>) {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) return { synced: false, skipped: true, error: 'hubspot_not_configured' };
  if (!contactId) return { synced: false, skipped: true, error: 'hubspot_contact_id_missing' };
  const response = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(contactId)}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ properties }),
  });
  if (!response.ok) return { synced: false, skipped: false, error: `hubspot_http_${response.status}` };
  return { synced: true, skipped: false, error: null };
}
