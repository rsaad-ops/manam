// @ts-nocheck
// Storage, sign-in and small helpers shared by the Netlify functions.
// Data lives in Netlify Blobs: one entry per post and per asset, so that the
// scheduler and the person using the app never overwrite each other's posts.
import { getStore } from "@netlify/blobs";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const AI_MODEL = "claude-opus-5-5";
export const LATE_LIMIT_HOURS = 6;
export const CHUNK = 3 * 1024 * 1024;

export const DEFAULT_BRAND = {
  name: "UPSMRT", tagline: "consultancy redefined", website: "", language: "en", voice: "", audience: "", hashtags: "",
  guidelinesText: "", colors: { primary: "#1A1B4E", accent: "#EEB21E", light: "#FFFFFF", text: "#1A1B4E" },
  font: "Avenir Next", logoId: "", motif: "bubble", site: null,
};
// The first brand keeps its data under the plain keys; every other client brand has its own
// separate set under "b/<id>/" (own kit, posts, library, settings and channel connections).
export const DEFAULT_ID = "upsmrt";
export const NEW_BRAND = { name: "", tagline: "", motif: "circle", colors: { primary: "#1F2A37", accent: "#2F80ED", light: "#FFFFFF", text: "#1F2A37" } };
export const prefix = (bid) => (!bid || bid === DEFAULT_ID ? "" : `b/${bid}/`);
export const DEFAULT_SETTINGS = {
  holidayRegions: { federal: true, quebec: false, provincial: false }, defaultTime: "09:00", publicMediaUrl: "",
  keyDates: { cats: { canada: true, us: false, awareness: true, industry: true, tradeshow: true, publication: true }, custom: [], overrides: {} },
  sources: [],
};

export class ApiError extends Error {
  status: number;
  constructor(message, status = 400) { super(message); this.status = status; }
}

export const nowIso = () => new Date().toISOString().slice(0, 19) + "Z";
export const newId = () => randomBytes(6).toString("hex");
export const env = (k) => (globalThis.Netlify ? Netlify.env.get(k) : process.env[k]) || "";

const data = () => getStore({ name: "studio", consistency: "strong" });
const media = () => getStore({ name: "studio-media", consistency: "strong" });

export const getJSON = async (key, fallback = null) => (await data().get(key, { type: "json" })) ?? fallback;
export const setJSON = (key, value) => data().setJSON(key, value);
export const remove = (key) => data().delete(key);

async function listAll(prefix) {
  const { blobs } = await data().list({ prefix });
  const items = await Promise.all(blobs.map((b) => data().get(b.key, { type: "json" })));
  return items.filter(Boolean);
}

// ------------------------------------------------------------------ brands
export const brandIds = async () => [DEFAULT_ID, ...(await getJSON("brands", [])).map((b) => b.id)];
export async function resolveBrand(asked) {
  if (!asked || asked === DEFAULT_ID || !/^[a-z0-9-]{3,40}$/.test(asked)) return DEFAULT_ID;
  return (await getJSON("brands", [])).some((b) => b.id === asked) ? asked : DEFAULT_ID;
}
export async function brandList() {
  const ids = await brandIds();
  const kits = await Promise.all(ids.map((id) => getJSON(prefix(id) + "brand", {})));
  return ids.map((id, i) => { const b = { ...DEFAULT_BRAND, ...kits[i] }; return { id, name: b.name || "Untitled brand", color: b.colors?.primary || "#1F2A37", accent: b.colors?.accent || "#2F80ED" }; });
}
export async function createBrand(input) {
  const name = String(input || "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!name) throw new ApiError("Give the brand a name.");
  const id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "brand"}-${randomBytes(2).toString("hex")}`;
  await setJSON(prefix(id) + "brand", { ...DEFAULT_BRAND, ...NEW_BRAND, name });
  await setJSON("brands", [...(await getJSON("brands", [])), { id, createdAt: nowIso() }]);
  return id;
}
export async function deleteBrand(id) {
  const list = await getJSON("brands", []);
  if (id === DEFAULT_ID || !list.some((b) => b.id === id)) throw new ApiError("This brand cannot be deleted.");
  const assets = await listAll(prefix(id) + "asset/");
  await Promise.all(assets.map((a) => deleteMedia(a.file, a.chunks)));
  const { blobs } = await data().list({ prefix: prefix(id) });
  await Promise.all(blobs.map((b) => data().delete(b.key)));
  await setJSON("brands", list.filter((b) => b.id !== id));
}

// The AI key is shared by all brands; channel connections belong to one brand.
export async function loadSecrets(px) {
  const shared = await getJSON("secrets", {});
  if (!px) { shared.channels = shared.channels || {}; return shared; }
  return { ai_key: shared.ai_key || "", channels: (await getJSON(px + "secrets", {})).channels || {} };
}
export const saveSecrets = (px, s) => (px ? setJSON(px + "secrets", { channels: s.channels || {} }) : setJSON("secrets", s));

export async function loadAll(bid = DEFAULT_ID) {
  const px = prefix(bid);
  const [brand, settings, secrets, posts, assets] = await Promise.all([
    getJSON(px + "brand", {}), getJSON(px + "settings", {}), loadSecrets(px), listAll(px + "post/"), listAll(px + "asset/"),
  ]);
  posts.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  assets.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return { bid, px, brand: { ...DEFAULT_BRAND, ...brand }, settings: { ...DEFAULT_SETTINGS, ...settings }, secrets, posts, assets };
}
export const getPost = (px, id) => getJSON(px + "post/" + id);
export const savePost = (px, p) => setJSON(px + "post/" + p.id, p);
export const chan = (secrets, name) => (secrets.channels[name] = secrets.channels[name] || {});

// ------------------------------------------------------------------- media
export const putChunk = (file, index, bytes) => media().set(`${file}/${String(index).padStart(5, "0")}`, bytes);
export const getChunk = (file, index) => media().get(`${file}/${String(index).padStart(5, "0")}`, { type: "arrayBuffer" });
export async function deleteMedia(file, chunks) {
  await Promise.all(Array.from({ length: chunks || 1 }, (_, i) => media().delete(`${file}/${String(i).padStart(5, "0")}`)));
}
export async function readAsset(a) {
  const parts = [];
  for (let i = 0; i < (a.chunks || 1); i++) {
    const buf = await getChunk(a.file, i);
    if (!buf) throw new ApiError("The media file is missing from storage. Upload it again.");
    parts.push(Buffer.from(buf));
  }
  return Buffer.concat(parts);
}

// ----------------------------------------------------------------- sign-in
const COOKIE = "studio_session";
const SESSION_DAYS = 30;
const secretKey = () => createHash("sha256").update("upsmrt-studio:" + env("APP_PASSWORD")).digest();
export const sign = (text) => createHmac("sha256", secretKey()).update(text).digest("hex");
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

export const configured = () => env("APP_PASSWORD").length >= 8;
export const checkPassword = (given) => configured() && same(createHash("sha256").update(String(given || "")).digest("hex"), createHash("sha256").update(env("APP_PASSWORD")).digest("hex"));

export function sessionCookie(req, clear = false) {
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  if (clear) return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
  const exp = String(Date.now() + SESSION_DAYS * 86400000);
  return `${COOKIE}=${exp}.${sign("session:" + exp)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`;
}
export function signedIn(req) {
  if (!configured()) return false;
  const m = (req.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=(\\d+)\\.([0-9a-f]+)`));
  return !!m && +m[1] > Date.now() && same(m[2], sign("session:" + m[1]));
}
export const mediaSig = (file) => sign("media:" + file).slice(0, 40);
export const validMediaSig = (file, sig) => configured() && !!sig && same(sig, mediaSig(file));
export const workerKey = () => sign("worker");
export const validWorkerKey = (key) => configured() && !!key && same(key, workerKey());

// Start the background worker for a long job (publishing, AI writing).
export async function startWork(origin, job) {
  const r = await fetch(origin + "/bg/work", { method: "POST", headers: { "content-type": "application/json", "x-studio-key": workerKey() }, body: JSON.stringify(job) });
  if (r.status >= 400) throw new ApiError("The background worker could not be started (HTTP " + r.status + ").", 502);
}

// -------------------------------------------------------------------- http
export async function http(method, url, { headers = {}, body, form, json, timeout = 90000 } = {}) {
  const h = { "User-Agent": "Mozilla/5.0 (compatible; SocialStudio/1.0)", ...headers };
  if (form) { body = new URLSearchParams(form).toString(); h["Content-Type"] = "application/x-www-form-urlencoded"; }
  if (json !== undefined) { body = JSON.stringify(json); h["Content-Type"] = "application/json"; }
  let r;
  try { r = await fetch(url, { method, headers: h, body, signal: AbortSignal.timeout(timeout), redirect: "follow" }); }
  catch (e) { throw new ApiError(`Could not reach ${new URL(url).host}: ${e.name === "TimeoutError" ? "timed out" : e.message}`, 502); }
  const raw = Buffer.from(await r.arrayBuffer());
  let parsed = {};
  try { parsed = raw.length ? JSON.parse(raw.toString("utf8")) : {}; } catch { parsed = { raw: raw.toString("utf8").slice(0, 500) }; }
  return { status: r.status, headers: r.headers, raw, parsed };
}

export function apiErrorText(p) {
  if (p && typeof p === "object") {
    const err = p.error;
    if (err && typeof err === "object") return err.message || err.status || JSON.stringify(err).slice(0, 300);
    if (err) return `${err} ${p.error_description || ""}`.trim();
    return p.message || p.raw || JSON.stringify(p).slice(0, 300);
  }
  return String(p).slice(0, 300);
}
