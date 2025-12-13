#!/usr/bin/env node
// script to measure /api/admin/orgs/:orgId/phone-metrics timing

const fetch = global.fetch || require('node-fetch');
const API_BASE = process.env.API_BASE || 'http://localhost:4000';
const ORG_ID = process.argv[2] || process.env.ORG_ID || 'd6b7bbde-54bb-4782-989d-cf9093f8cadf';
const ITERATIONS = parseInt(process.argv[3] || '5', 10);

async function callMetrics() {
  const url = `${API_BASE}/api/admin/orgs/${ORG_ID}/phone-metrics?range=today`;
  const start = Date.now();
  try {
    const resp = await fetch(url, { headers: { 'x-user-id': 'test' }});
    const ms = Date.now()-start;
    const body = await resp.json().catch(() => null);
    return { ok: resp.ok, status: resp.status, ms, body };
  } catch (err) {
    return { ok: false, error: err.message, ms: Date.now()-start };
  }
}

async function callTotals() {
  const url = `${API_BASE}/api/admin/orgs/${ORG_ID}/metrics?range=today`;
  const start = Date.now();
  try {
    const resp = await fetch(url, { headers: { 'x-user-id': 'test' }});
    const ms = Date.now()-start;
    const body = await resp.json().catch(() => null);
    return { ok: resp.ok, status: resp.status, ms, body };
  } catch (err) {
    return { ok: false, error: err.message, ms: Date.now()-start };
  }
}

(async () => {
  console.log(`Testing ${API_BASE} for org ${ORG_ID} (${ITERATIONS} iterations)...`);
  for (let i=0;i<ITERATIONS;i++) {
    const result = await callMetrics();
    console.log(`[${i+1}] time=${result.ms}ms status=${result.status} ok=${result.ok} rows=${(result.body && result.body.metrics && result.body.metrics.length) || 0}`);
    if (!result.ok) console.error('  error:', result.error || JSON.stringify(result.body));
    await new Promise(r => setTimeout(r, 1000));
    const totals = await callTotals();
    console.log(`       totals time=${totals.ms}ms status=${totals.status} ok=${totals.ok} totals=${JSON.stringify(totals.body && totals.body.totals ? totals.body.totals : totals.body)}`);
    await new Promise(r => setTimeout(r, 1000));
  }
})();
