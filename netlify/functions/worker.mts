// @ts-nocheck
// Background worker (up to 15 minutes): publishes a post, or runs an AI job.
// Only the app itself can start it: requests must carry the app's own signed key.
import type { Config } from "@netlify/functions";
import { ApiError, getJSON, loadAll, resolveBrand, setJSON, validWorkerKey } from "../lib/store.mts";
import { generateAI, scanSource, suggestBrandKit, suggestCategories, suggestKeyDates } from "../lib/content.mts";
import { publishPost } from "../lib/channels.mts";

const JOBS = {
  generate: generateAI,
  keydates: (db, req) => (req.mode === "categories" ? suggestCategories(db, req) : suggestKeyDates(db, req)),
  sources: scanSource,
  brandkit: suggestBrandKit,
};

export default async (req: Request) => {
  if (!validWorkerKey(req.headers.get("x-studio-key"))) return new Response("Forbidden", { status: 403 });
  let work;
  try { work = await req.json(); } catch { return new Response("Bad request", { status: 400 }); }
  const origin = new URL(req.url).origin;
  // Errors are recorded on the post or job and never thrown, so Netlify does not retry and publish twice.
  try {
    if (work.publish) {
      const db = await loadAll(await resolveBrand(work.brand));
      await publishPost({ ...db, origin }, String(work.publish), !!work.onlyFailed);
    } else if (work.job) {
      const job = await getJSON("job/" + work.job);
      if (!job || job.status !== "pending") return new Response("ok");
      try {
        const db = await loadAll(await resolveBrand(job.brand));
        const result = await JOBS[job.type](db, job.req);
        await setJSON("job/" + job.id, { ...job, req: undefined, status: "done", result });
      } catch (e) {
        if (!(e instanceof ApiError)) console.error(e);
        await setJSON("job/" + job.id, { ...job, req: undefined, status: "error", error: e.message, code: e instanceof ApiError ? e.status : 502 });
      }
    }
  } catch (e) { console.error(e); }
  return new Response("ok");
};

export const config: Config = { background: true, path: "/bg/work" };
