// @ts-nocheck
// The scheduler: runs every minute, hands each due post to the background worker.
import type { Config, Context } from "@netlify/functions";
import { LATE_LIMIT_HOURS, configured, env, getJSON, loadAll, nowIso, remove, savePost, startWork } from "../lib/store.mts";

export default async (_req: Request, context: Context) => {
  if (!configured()) return;
  const origin = (env("URL") || context.site?.url || "").replace(/\/+$/, "");
  const { posts } = await loadAll(), now = Date.now();
  for (const p of posts) {
    try {
      if (p.status === "publishing" && now - (p.publishingSince || 0) > 20 * 60000) {
        // The worker stopped before finishing. Never retry by itself: some channels may already have the post.
        const oks = (p.channels || []).map((c) => !!(p.results || {})[c]?.ok);
        p.results = p.results || {};
        for (const c of p.channels || []) if (!p.results[c]) p.results[c] = { ok: false, error: "Publishing was interrupted. Check the channel before retrying.", at: nowIso() };
        p.status = oks.some(Boolean) ? "partial" : "failed";
        delete p.publishingSince;
        await savePost(p);
        continue;
      }
      if (p.status !== "scheduled" || !p.scheduledAt) continue;
      const when = Date.parse(p.scheduledAt.slice(0, 19) + "Z");
      if (!Number.isFinite(when) || when > now) continue;
      // Read the post again right before acting, in case it was just edited.
      const cur = await getJSON("post/" + p.id);
      if (!cur || cur.status !== "scheduled" || cur.scheduledAt !== p.scheduledAt) continue;
      if (now - when > LATE_LIMIT_HOURS * 3600000) { cur.status = "missed"; await savePost(cur); continue; }
      Object.assign(cur, { status: "publishing", publishingSince: now, results: cur.results || {} });
      await savePost(cur);
      await startWork(origin, { publish: cur.id, onlyFailed: false });
    } catch (e) { console.error("post", p.id, e); }
  }
  // Clear out abandoned AI jobs and sign-in attempts.
  try {
    const { getStore } = await import("@netlify/blobs");
    const store = getStore({ name: "studio", consistency: "strong" });
    for (const prefix of ["job/", "oauth/"]) {
      const { blobs } = await store.list({ prefix });
      for (const b of blobs.slice(0, 20)) { const j = await store.get(b.key, { type: "json" }); if (!j || now - (j.createdAt || j.at || 0) > 3600000) await remove(b.key); }
    }
  } catch (e) { console.error(e); }
};

export const config: Config = { schedule: "* * * * *" };
