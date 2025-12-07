import fetch from 'node-fetch';

const MC_BASE = process.env.MIGHTYCALL_BASE_URL || '';
const MC_TOKEN = process.env.MIGHTYCALL_API_TOKEN || process.env.MIGHTYCALL_API_KEY || '';

type McPhone = { id: string; number: string; label?: string; is_active?: boolean };
type McExtension = { id: string; extension: string; display_name?: string };

async function fetchMightyCallPhoneNumbers(): Promise<McPhone[]> {
  if (!MC_BASE || !MC_TOKEN) return [];
  try {
    const res = await fetch(`${MC_BASE.replace(/\/$/, '')}/numbers`, {
      headers: { Authorization: `Bearer ${MC_TOKEN}` },
    });
    if (!res.ok) return [];
    const json = await res.json();
    // Normalize expected shapes from MightyCall API
    return (json?.data || json || []).map((r: any) => ({
      id: r.id || r.number || String(Math.random()),
      number: r.number || r.phone || r.msisdn,
      label: r.label || r.name || null,
      is_active: r.active ?? true,
    }));
  } catch (err) {
    console.warn('mightycall fetch numbers failed', err);
    return [];
  }
}

async function fetchMightyCallExtensions(): Promise<McExtension[]> {
  if (!MC_BASE || !MC_TOKEN) return [];
  try {
    const res = await fetch(`${MC_BASE.replace(/\/$/, '')}/extensions`, {
      headers: { Authorization: `Bearer ${MC_TOKEN}` },
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json?.data || json || []).map((r: any) => ({
      id: r.id || r.extension || String(Math.random()),
      extension: String(r.extension || r.number || r.id),
      display_name: r.name || r.display_name || r.user || null,
    }));
  } catch (err) {
    console.warn('mightycall fetch extensions failed', err);
    return [];
  }
}

export { fetchMightyCallPhoneNumbers, fetchMightyCallExtensions };
