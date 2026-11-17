// @ts-nocheck
// The app's API on Netlify: same routes as the local Python server, behind a sign-in.
import type { Config, Context } from "@netlify/functions";
import { createHash } from "node:crypto";
import { AI_MODEL, ApiError, CHUNK, DEFAULT_BRAND, DEFAULT_ID, DEFAULT_SETTINGS, brandList, chan, checkPassword, configured, deleteBrand, deleteMedia, getChunk,
  getJSON, getPost, http, loadAll, loadSecrets, newId, nowIso, prefix, putChunk, remove, resolveBrand, savePost, saveSecrets, sessionCookie, setJSON, signedIn, startWork,
  validMediaSig } from "../lib/store.mts";
import { aiKey, checkBrandKitRequest, checkKeyDateRequest, checkSourceRequest, generateTemplate, readLinkedDoc, scanSite } from "../lib/content.mts";
import { CHANNEL_FIELDS, PUBLISHERS, SECRET_FIELDS, oauthCallback, oauthStart, publicChannels, selectPage, testChannel } from "../lib/channels.mts";

const EXT = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/svg+xml": ".svg", "image/gif": ".gif", "video/mp4": ".mp4", "video/webm": ".webm",
  "video/quicktime": ".mov", "application/pdf": ".pdf", "text/plain": ".txt", "text/markdown": ".md", "text/csv": ".csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx" };
const MIME = Object.fromEntries(Object.entries(EXT).map(([m, e]) => [e, m]));
const MAX_UPLOAD = 600 * 1024 * 1024;

const json = (obj, status = 200, headers = {}) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
const redirect = (to) => new Response(null, { status: 302, headers: { location: to } });
const body = async (req) => { try { return (await req.json()) || {}; } catch { throw new ApiError("Invalid request."); } };

async function state(db, origin, extra = {}) {
  return { brand: db.brand, posts: db.posts, assets: db.assets, settings: db.settings, channels: publicChannels(db.secrets), brandId: db.bid, brands: await brandList(),
    ai: { enabled: !!aiKey(db), model: AI_MODEL }, baseUrl: origin, serverTime: nowIso(), hosted: true, ...extra };
}

function cleanPost(data, existing) {
  const out = {};
  for (const k of ["caption", "captions", "channels", "mediaIds", "scheduledAt", "title", "privacy", "topic", "holiday", "suggested", "keyDate", "kdCat", "design", "variant"]) if (k in data) out[k] = data[k];
  const status = data.status;
  if (["draft", "scheduled"].includes(status)) {
    if (status === "scheduled" && !(out.scheduledAt || existing.scheduledAt)) throw new ApiError("Pick a date and time to schedule this post.");
    out.status = status;
    if (["failed", "missed", "partial"].includes(existing.status) && status === "scheduled") out.results = {};
  } else if (!existing.id) out.status = "draft";
  out.channels = (out.channels || existing.channels || []).filter((c) => PUBLISHERS[c]);
  out.updatedAt = nowIso();
  return out;
}

// A brand's media is addressed with its brand, so the file can be found without a sign-in header.
const mediaUrl = (bid, file) => "/uploads/" + file + (bid === DEFAULT_ID ? "" : "?b=" + bid);

async function addAsset(bid, bytes, mime, kind, name, source = "") {
  mime = String(mime || "").split(";")[0].trim().toLowerCase();
  if (!EXT[mime]) throw new ApiError(`This file type is not supported (${mime || "unknown"}).`);
  const id = newId(), file = id + EXT[mime], chunks = Math.max(1, Math.ceil(bytes.length / CHUNK));
  for (let i = 0; i < chunks; i++) await putChunk(file, i, bytes.subarray(i * CHUNK, (i + 1) * CHUNK));
  const asset = { id, kind, name: name || file, file, mime, size: bytes.length, chunks, url: mediaUrl(bid, file), createdAt: nowIso(), source };
  await setJSON(prefix(bid) + "asset/" + id, asset);
  return asset;
}

// Media files, with Range support so videos can be played and scrubbed.
async function serveMedia(req, file, bid) {
  const m = file.match(/^([0-9a-f]{12})(\.\w+)$/);
  const a = m ? await getJSON(prefix(bid) + "asset/" + m[1]) : null;
  if (!a || a.file !== file) return new Response("Not found", { status: 404 });
  const size = a.size, range = (req.headers.get("range") || "").match(/bytes=(\d*)-(\d*)/);
  const headers = { "content-type": MIME[m[2]] || "application/octet-stream", "accept-ranges": "bytes", "cache-control": "private, max-age=86400" };
  let start = 0, end = size - 1, status = 200;
  if (range && (range[1] || range[2])) {
    if (range[1]) { start = +range[1]; end = range[2] ? Math.min(+range[2], size - 1) : size - 1; } else start = Math.max(0, size - +range[2]);
    if (start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    end = Math.min(end, start + CHUNK - 1);
    status = 206;
    headers["content-range"] = `bytes ${start}-${end}/${size}`;
  }
  const first = Math.floor(start / CHUNK), last = Math.floor(end / CHUNK);
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for (let i = first; i <= last; i++) {
          const buf = Buffer.from((await getChunk(file, i)) || []);
          controller.enqueue(new Uint8Array(buf.subarray(i === first ? start - first * CHUNK : 0, i === last ? end - last * CHUNK + 1 : CHUNK)));
        }
        controller.close();
      } catch (e) { controller.error(e); }
    },
  });
  headers["content-length"] = String(end - start + 1);
  return new Response(stream, { status, headers });
}

// Slow down password guessing: after 8 wrong attempts from one address, wait 15 minutes.
async function login(req, context) {
  if (!configured()) throw new ApiError("Set the APP_PASSWORD environment variable in Netlify (at least 8 characters), then redeploy.", 503);
  const who = "login/" + createHash("sha256").update(String(context.ip || "unknown")).digest("hex").slice(0, 24);
  const rec = (await getJSON(who)) || { n: 0, at: 0 };
  if (rec.n >= 8 && Date.now() - rec.at < 15 * 60000) throw new ApiError("Too many attempts. Try again in 15 minutes.", 429);
  const { password } = await body(req);
  if (!checkPassword(password)) {
    await setJSON(who, { n: (Date.now() - rec.at < 15 * 60000 ? rec.n : 0) + 1, at: Date.now() });
    await new Promise((r) => setTimeout(r, 700));
    throw new ApiError("Wrong password.", 401);
  }
  if (rec.n) await remove(who);
  return json({ ok: true }, 200, { "set-cookie": sessionCookie(req) });
}

async function route(req, context) {
  const url = new URL(req.url), method = req.method, origin = url.origin;
  const parts = decodeURIComponent(url.pathname).split("/").filter(Boolean), q = Object.fromEntries(url.searchParams);
  const [top, res = "", rid = "", act = ""] = parts;

  if (top === "uploads") {
    if (method !== "GET" || !res) return new Response("Not found", { status: 404 });
    if (!signedIn(req) && !validMediaSig(res, q.sig)) return new Response("Sign in first", { status: 401 });
    return serveMedia(req, res, /^[a-z0-9-]{3,40}$/.test(q.b || "") ? q.b : DEFAULT_ID);
  }
  if (method !== "GET") {
    const o = req.headers.get("origin");
    if (o && new URL(o).host !== url.host) throw new ApiError("Request blocked.", 403);
  }
  if (top === "api" && res === "session" && method === "GET") return json({ configured: configured(), authed: signedIn(req), hosted: true });
  if (top === "api" && res === "login" && method === "POST") return login(req, context);
  if (top === "api" && res === "logout" && method === "POST") return json({ ok: true }, 200, { "set-cookie": sessionCookie(req, true) });
  if (!signedIn(req)) {
    if (top === "oauth") return redirect("/");
    throw new ApiError(configured() ? "Sign in first." : "The app password is not set yet.", 401);
  }

  // Which client brand this request works on. Each brand's data is kept apart.
  let bid = await resolveBrand(req.headers.get("x-brand") || q.brand || "");
  let px = prefix(bid);
  const fresh = async (extra) => json(await state(await loadAll(bid), origin, extra));

  if (top === "oauth") {
    if (!rid) throw new ApiError("Not found.", 404);
    if (res === "start") return redirect(await oauthStart(await loadSecrets(px), rid, origin, bid));
    try { await oauthCallback(rid, q, origin); return redirect("/#/channels?connected=" + rid); }
    catch (e) { if (!(e instanceof ApiError)) throw e; return redirect("/#/channels?error=" + encodeURIComponent(e.message)); }
  }

  if (res === "state" && method === "GET") return fresh();

  if (res === "brands") {
    if (method === "DELETE" && rid) { await deleteBrand(rid); bid = DEFAULT_ID; return fresh(); }
  }

  if (res === "brand" && method === "PUT") {
    const data = await body(req), brand = { ...DEFAULT_BRAND, ...(await getJSON(px + "brand", {})) };
    for (const k of Object.keys(DEFAULT_BRAND)) if (k in data && k !== "site") brand[k] = data[k];
    await setJSON(px + "brand", brand);
    return fresh();
  }

  if (res === "settings" && method === "PUT") {
    const data = await body(req), settings = { ...DEFAULT_SETTINGS, ...(await getJSON(px + "settings", {})) };
    for (const k of Object.keys(DEFAULT_SETTINGS)) if (k in data) settings[k] = data[k];
    await setJSON(px + "settings", settings);
    if ("aiKey" in data) { const s = await getJSON("secrets", {}); s.ai_key = String(data.aiKey || "").trim(); await setJSON("secrets", s); }
    return fresh();
  }

  if (res === "scan" && method === "POST") {
    const data = await body(req), brand = { ...DEFAULT_BRAND, ...(await getJSON(px + "brand", {})) };
    const site = await scanSite(data.url || brand.website || "");
    await setJSON(px + "brand", { ...brand, site, website: site.url });
    return fresh();
  }

  if (res === "import-doc" && method === "POST") {
    // Brand guidelines by link: a PDF is kept as a document, anything else is copied into the key rules.
    const { url: link = "" } = await body(req), got = await readLinkedDoc(link);
    if (got.pdf) await addAsset(bid, got.raw, "application/pdf", "guideline", "Brand guidelines (linked).pdf", link);
    else {
      const brand = { ...DEFAULT_BRAND, ...(await getJSON(px + "brand", {})) };
      await setJSON(px + "brand", { ...brand, guidelinesText: `${brand.guidelinesText || ""}\n\n${got.text.trim()}`.trim().slice(0, 6000) });
    }
    return fresh();
  }

  if (res === "import-image" && method === "POST") {
    const { url: src = "", kind = "" } = await body(req), brand = { ...DEFAULT_BRAND, ...(await getJSON(px + "brand", {})) }, asLogo = kind === "logo";
    if (!((brand.site || {})[asLogo ? "logos" : "images"] || []).some((i) => i.url === src)) throw new ApiError("Only images found on the scanned website can be imported.");
    const r = await http("GET", src, { timeout: 30000 });
    if (r.status >= 400) throw new ApiError(`Could not download the image (HTTP ${r.status}).`);
    const mime = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!mime.startsWith("image/")) throw new ApiError("That link is not an image.");
    const a = await addAsset(bid, r.raw, mime, asLogo ? "logo" : "photo", decodeURIComponent(new URL(src).pathname.split("/").pop() || "") || "website image", src);
    if (asLogo) await setJSON(px + "brand", { ...brand, logoId: a.id });
    return fresh();
  }

  // AI work can take longer than a web request may last, so it runs as a background job the browser waits on.
  if (["generate", "keydates", "sources", "brandkit"].includes(res) && method === "POST") {
    const data = await body(req), db = await loadAll(bid);
    if (res === "keydates") checkKeyDateRequest(data);
    if (res === "sources") checkSourceRequest(db, data);
    if (res === "brandkit") checkBrandKitRequest(db);
    if (!aiKey(db)) {
      if (res !== "generate") throw new ApiError("No AI key configured.", 409);
      return json(generateTemplate(db, data));
    }
    const id = newId();
    await setJSON("job/" + id, { id, type: res, brand: bid, req: data, status: "pending", createdAt: Date.now() });
    await startWork(origin, { job: id });
    return json({ job: id });
  }
  if (res === "jobs" && method === "GET" && /^[0-9a-f]{12}$/.test(rid)) {
    const job = await getJSON("job/" + rid);
    if (!job) throw new ApiError("That request is no longer available. Try again.", 404);
    if (job.status === "pending") return json({ status: "pending" });
    await remove("job/" + rid);
    if (job.status === "error") throw new ApiError(job.error || "The request failed.", job.code || 502);
    return json({ status: "done", result: job.result });
  }

  if (res === "assets") {
    if (method === "POST") {
      const bytes = Buffer.from(await req.arrayBuffer());
      if (!bytes.length) throw new ApiError("Empty file.");
      const mime = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase(), kind = q.kind || "photo";
      const parts = parseInt(q.parts || "1", 10);
      if (parts <= 1) return fresh({ asset: await addAsset(bid, bytes, mime, kind, q.name || "") });
      // Large file sent in pieces by the browser.
      const part = parseInt(q.part || "0", 10), size = parseInt(q.size || "0", 10);
      if (!/^[0-9a-f]{12}$/.test(q.upload || "") || !EXT[mime] || !(part >= 0 && part < parts) || parts > 400 || size > MAX_UPLOAD || bytes.length > CHUNK) throw new ApiError("Upload could not be read.");
      const file = q.upload + EXT[mime];
      await putChunk(file, part, bytes);
      if (part < parts - 1) return json({ ok: true, part });
      const asset = { id: q.upload, kind, name: q.name || file, file, mime, size, chunks: parts, url: mediaUrl(bid, file), createdAt: nowIso(), source: "" };
      await setJSON(px + "asset/" + asset.id, asset);
      return fresh({ asset });
    }
    if (method === "DELETE" && rid) {
      const db = await loadAll(bid), asset = db.assets.find((a) => a.id === rid);
      if (asset) {
        await remove(px + "asset/" + rid);
        await deleteMedia(asset.file, asset.chunks);
        for (const p of db.posts) if ((p.mediaIds || []).includes(rid) && ["draft", "scheduled"].includes(p.status)) { p.mediaIds = p.mediaIds.filter((x) => x !== rid); await savePost(px, p); }
        if (db.brand.logoId === rid) await setJSON(px + "brand", { ...db.brand, logoId: "" });
      }
      return fresh();
    }
  }

  if (res === "posts") {
    if (method === "POST" && !rid) {
      const post = { ...cleanPost(await body(req), {}), id: newId(), createdAt: nowIso(), results: {} };
      await savePost(px, post);
      return fresh({ post });
    }
    if (method === "POST" && rid === "bulk") {
      // Several changes in one request: used for the automatic post suggestions.
      const data = await body(req), gone = (data.remove || []).filter((x) => /^[0-9a-f]{12}$/.test(String(x))).slice(0, 400);
      await Promise.all(gone.map(async (x) => { const p = await getPost(px, x); if (p && p.status !== "publishing") await remove(px + "post/" + x); }));
      const at = Date.now();
      await Promise.all((data.create || []).slice(0, 200).map((item, i) => savePost(px, { ...cleanPost(item, {}), id: newId(), createdAt: new Date(at + i * 1000).toISOString().slice(0, 19) + "Z", results: {} })));
      return fresh();
    }
    const post = /^[0-9a-f]{12}$/.test(rid) ? await getPost(px, rid) : null;
    if (!post) throw new ApiError("Post not found.", 404);
    if (method === "PUT") {
      if (post.status === "publishing") throw new ApiError("This post is being published. Try again in a moment.", 409);
      Object.assign(post, cleanPost(await body(req), post));
      await savePost(px, post);
      return fresh({ post });
    }
    if (method === "DELETE") { await remove(px + "post/" + rid); return fresh(); }
    if (method === "POST" && act === "publish") {
      if (post.status !== "publishing") {
        Object.assign(post, { status: "publishing", publishingSince: Date.now(), results: post.results || {} });
        await savePost(px, post);
        await startWork(origin, { publish: rid, brand: bid, onlyFailed: true });
      }
      return fresh();
    }
  }

  if (res === "channels" && CHANNEL_FIELDS[rid]) {
    const secrets = await loadSecrets(px);
    if (method === "PUT") {
      const data = await body(req), c = chan(secrets, rid);
      for (const f of CHANNEL_FIELDS[rid]) if (f in data && (data[f] || !SECRET_FIELDS.has(f))) c[f] = String(data[f]).trim();
      if (rid === "linkedin" && c.org_id && !data.author_urn) c.author_urn = `urn:li:organization:${c.org_id}`;
      if (data.selectPage) selectPage(secrets, data.selectPage);
      await saveSecrets(px, secrets);
      return fresh();
    }
    if (method === "POST" && act === "test") { await testChannel(px, secrets, rid); return fresh(); }
    if (method === "DELETE") { secrets.channels[rid] = {}; await saveSecrets(px, secrets); return fresh(); }
  }

  throw new ApiError("Not found.", 404);
}

export default async (req: Request, context: Context) => {
  try { return await route(req, context); }
  catch (e) {
    if (e instanceof ApiError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "Server error: " + e.message }, 500);
  }
};

export const config: Config = { path: ["/api/*", "/oauth/*", "/uploads/*"] };
