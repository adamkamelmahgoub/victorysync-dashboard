import { Router } from "express";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { refreshTransferImportConfig, runWorkforceTransferSync, transferWorkerStatus } from '../mightycall/workforceTransferSync';

const router = Router();
const tables = [
  "users",
  "clients",
  "client_members",
  "campaigns",
  "assignments",
  "settings",
  "limits",
  "overrides",
  "sessions",
  "segments",
  "transfers",
  "audit",
  "consents",
  "activity",
  "screenshots",
  "provider_routes",
  "transfer_inbox",
] as const;
const writable = new Set([
  "users",
  "clients",
  "client_members",
  "campaigns",
  "assignments",
  "settings",
  "limits",
  "provider_routes",
  "transfer_inbox",
  "transfers",
]);
const rpcNames: Record<string, string> = {
  timer: "wf_timer",
  transfer: "wf_add_transfer",
  review: "wf_review_time",
  override: "wf_grant_override",
  consent: "wf_accept_monitoring",
  activity: "wf_record_activity",
  screenshot: "wf_prepare_screenshot",
  admin_stop: "wf_admin_stop",
};

// Never use the service-role client here. Every query is governed by the caller's RLS.
router.use(async (req, res, next) => {
  try {
    const token = /^Bearer (.+)$/i.exec(req.headers.authorization || "")?.[1];
    if (!token)
      return res
        .status(401)
        .json({ message: "Sign in to access your workforce workspace." });
    const url = process.env.SUPABASE_URL;
    const key =
      process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key)
      return res
        .status(503)
        .json({
          message:
            "Workforce configuration is incomplete. Set SUPABASE_ANON_KEY on the API server.",
        });
    const db = createClient(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user)
      return res
        .status(401)
        .json({ message: "Your session has expired. Sign in again." });
    const role = await db.rpc("wf_role");
    if (role.error)
      return res
        .status(503)
        .json({
          message:
            "Workforce migrations are not available. Ask an administrator to complete the staging rollout.",
        });
    if (!["admin", "agent", "client"].includes(role.data))
      return res
        .status(403)
        .json({ message: "An administrator must assign your workforce role." });
    res.locals.db = db;
    res.locals.role = role.data;
    res.locals.userId = data.user.id;
    res.setHeader("Cache-Control", "private, no-store");
    next();
  } catch {
    res
      .status(503)
      .json({ message: "Unable to verify workforce access. Please retry." });
  }
});
router.get("/me", (_req, res) => {
  res.json({ role: res.locals.role, user_id: res.locals.userId });
});
router.get('/transfer-sync', async (_req,res) => {
  if(res.locals.role!=='admin')return res.sendStatus(403);
  try {
  const available=await refreshTransferImportConfig();
  const result=await (res.locals.db as SupabaseClient).from('wf_transfer_sync_state').select('*').order('client_id');
  res.json({...transferWorkerStatus(),available:available&&!result.error,server_enabled:process.env.WORKFORCE_MIGHTYCALL_SYNC==='true',rows:result.data||[]});
  } catch { res.status(503).json({message:'Unable to load transfer import status. Please retry.'}); }
});
router.post('/transfer-sync/enabled', async (req,res) => {
  if(res.locals.role!=='admin')return res.sendStatus(403);
  if(typeof req.body?.enabled!=='boolean')return res.sendStatus(400);
  if(process.env.WORKFORCE_MIGHTYCALL_SYNC==='true'&&!req.body.enabled)return res.status(409).json({message:'Automatic import is enabled by the server environment. Change WORKFORCE_MIGHTYCALL_SYNC there to pause it.'});
  try {
  const result=await (res.locals.db as SupabaseClient).from('wf_settings').update({mightycall_import_enabled:req.body.enabled}).eq('id',true);
  if(result.error)return res.status(400).json({message:'Apply migration 055 before changing automatic import.'});
  await refreshTransferImportConfig();
  res.json(transferWorkerStatus());
  } catch { res.status(503).json({message:'Unable to change transfer import. Please retry.'}); }
});
router.post('/transfer-sync/run', async (_req,res) => {
  if(res.locals.role!=='admin')return res.sendStatus(403);
  try {
  if(!await refreshTransferImportConfig())return res.status(503).json({message:'Apply migration 055 before importing transfers.'});
  void runWorkforceTransferSync(true).catch(()=>console.warn('[workforce transfers] Requested import failed. Check migration and provider configuration.'));
  res.status(202).json({message:'Transfer import queued. Progress will refresh automatically.'});
  } catch { res.status(503).json({message:'Unable to start transfer import. Please retry.'}); }
});
router.get("/data/:table", async (req, res) => {
  if (!(tables as readonly string[]).includes(req.params.table))
    return res.sendStatus(404);
  try {
    const db: SupabaseClient = res.locals.db;
    const offset = Number(req.query.offset || 0);
    if (!Number.isSafeInteger(offset) || offset < 0) return res.sendStatus(400);
    const order =
      req.params.table === "users"
        ? "user_id"
        : req.params.table === "consents"
          ? "user_id"
          : req.params.table === "client_members"
            ? "client_id"
            : "id";
    let query = db
      .from(`wf_${req.params.table}`)
      .select("*")
      .order(order)
      .range(offset, offset + 499);
    if (
      req.query.session_id &&
      ["segments", "activity", "screenshots"].includes(req.params.table)
    )
      query = query.eq("session_id", String(req.query.session_id));
    const { data, error } = await query;
    if (error) throw error;
    res.json({
      rows: data,
      next_offset: data.length === 500 ? offset + 500 : null,
    });
  } catch {
    res
      .status(400)
      .json({
        message:
          "Unable to load workforce records. Retry or contact an administrator.",
      });
  }
});
router.post("/data/:table", async (req, res) => {
  if (res.locals.role !== "admin") return res.sendStatus(403);
  if (!writable.has(req.params.table)) return res.sendStatus(404);
  try {
    const { data, error } = await (res.locals.db as SupabaseClient)
      .from(`wf_${req.params.table}`)
      .upsert(req.body)
      .select();
    if (error) return res.status(400).json({ message: error.message });
    res.json({ rows: data });
  } catch {
    res.status(400).json({ message: "Unable to save this record." });
  }
});
router.delete("/data/:table/:id", async (req, res) => {
  if (res.locals.role !== "admin") return res.sendStatus(403);
  if (
    ![
      "assignments",
      "campaigns",
      "limits",
      "provider_routes",
      "transfers",
    ].includes(req.params.table)
  )
    return res.sendStatus(404);
  const { data, error } = await (res.locals.db as SupabaseClient)
    .from(`wf_${req.params.table}`)
    .delete()
    .eq("id", req.params.id)
    .select("id");
  if (error)
    return res
      .status(400)
      .json({
        message:
          "This record is referenced by historical records. Deactivate it instead.",
      });
  res.json({ rows: data });
});
router.post("/actions/:action", async (req, res) => {
  const name = rpcNames[req.params.action];
  if (!name) return res.sendStatus(404);
  try {
    const { data, error } = await (res.locals.db as SupabaseClient).rpc(
      name,
      req.body,
    );
    if (error)
      return res
        .status(error.code === "42501" ? 403 : 400)
        .json({ message: error.message });
    res.json({ result: data });
  } catch {
    res
      .status(400)
      .json({ message: "The action could not be completed. Please retry." });
  }
});
router.delete('/screenshots/:id', async (req,res)=>{
  if(res.locals.role!=='admin')return res.sendStatus(403);
  const db:SupabaseClient=res.locals.db;
  const shot=await db.from('wf_screenshots').select('id,object_path').eq('id',req.params.id).single();
  if(shot.error||!shot.data)return res.sendStatus(404);
  const removed=await db.storage.from('workforce-screenshots').remove([shot.data.object_path]);
  if(removed.error)return res.status(503).json({message:'Unable to delete the stored image. Please retry.'});
  const metadata=await db.from('wf_screenshots').delete().eq('id',shot.data.id);
  if(metadata.error)return res.status(503).json({message:'Image deleted; retry to remove its metadata.'});
  res.json({deleted:true});
});
router.get("/screenshots/:id/url", async (req, res) => {
  const db: SupabaseClient = res.locals.db;
  const shot = await db
    .from("wf_screenshots")
    .select("object_path,expires_at")
    .eq("id", req.params.id)
    .single();
  if (
    shot.error ||
    !shot.data ||
    Date.parse(shot.data.expires_at) <= Date.now()
  )
    return res.sendStatus(404);
  const result = await db.storage
    .from("workforce-screenshots")
    .createSignedUrl(shot.data.object_path, 60);
  if (result.error)
    return res
      .status(404)
      .json({ message: "This screenshot is unavailable or has expired." });
  res.json({ url: result.data.signedUrl });
});
export default router;
