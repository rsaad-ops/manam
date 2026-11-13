// @ts-nocheck
// Website scanner, AI writing (Claude) and the template fallback.
import { AI_MODEL, ApiError, apiErrorText, env, http, nowIso, readAsset } from "./store.mts";

// ------------------------------------------------------------- website scan
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…",
  eacute: "é", egrave: "è", ecirc: "ê", agrave: "à", acirc: "â", ccedil: "ç", ocirc: "ô", ucirc: "û", ugrave: "ù", icirc: "î", iuml: "ï", euml: "ë",
  Eacute: "É", Egrave: "È", Agrave: "À", Ccedil: "Ç", copy: "©", reg: "®", trade: "™", laquo: "«", raquo: "»" };
const decode = (s) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
  if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n < 0x10ffff ? String.fromCodePoint(n) : " "; }
  return ENT[e] ?? m;
});
const text = (html) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const attrs = (tag) => { const a = {}; tag.replace(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g, (_m, k, _v, d, s, u) => { a[k.toLowerCase()] = decode(d ?? s ?? u ?? ""); return ""; }); return a; };
const join = (base, href) => { try { return new URL(href, base).href; } catch { return ""; } };

function parsePage(html, base) {
  const p = { title: "", description: "", ogImage: "", theme: "", headings: [], paragraphs: [], images: [], links: [], styles: [] };
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (t) p.title = text(t[1]);
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]), key = (a.name || a.property || "").toLowerCase();
    if (["description", "og:description"].includes(key) && !p.description) p.description = (a.content || "").trim();
    else if (key === "og:image" && a.content) p.ogImage = join(base, a.content);
    else if (key === "theme-color") p.theme = a.content || "";
  }
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) { const a = attrs(m[0]); if ((a.rel || "").includes("stylesheet") && a.href) p.styles.push(join(base, a.href)); }
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    let src = a.src || a["data-src"] || "";
    if (!src && a.srcset) src = a.srcset.split(",")[0].trim().split(" ")[0];
    if (src && !src.startsWith("data:")) { const url = join(base, src); if (url) p.images.push({ url, alt: a.alt || "" }); }
  }
  for (const m of html.matchAll(/<a\b[^>]*>/gi)) { const a = attrs(m[0]); if (a.href) { const url = join(base, a.href).split("#")[0]; if (url) p.links.push(url); } }
  const body = html.replace(/<(script|style|noscript|svg|nav|footer|form)\b[\s\S]*?<\/\1>/gi, " ");
  for (const m of body.matchAll(/<(h[1-3])\b[^>]*>([\s\S]*?)<\/\1>/gi)) { const s = text(m[2]); if (s && s.length < 160) p.headings.push(s); }
  for (const m of body.matchAll(/<(p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi)) { const s = text(m[2]); if (s.length >= 60 && s.length < 900) p.paragraphs.push(s); }
  return p;
}

async function fetchPage(url) {
  const r = await http("GET", url, { headers: { Accept: "text/html,*/*" }, timeout: 12000 });
  if (r.status >= 400) throw new ApiError(`${url} answered with HTTP ${r.status}`, 502);
  const ctype = r.headers.get("content-type") || "";
  if (ctype && !ctype.includes("html")) throw new ApiError(`${url} is not a web page (${ctype})`, 400);
  const cs = (ctype.match(/charset=([\w-]+)/) || [])[1] || "utf-8";
  let html;
  try { html = new TextDecoder(cs).decode(r.raw.subarray(0, 2500000)); } catch { html = r.raw.subarray(0, 2500000).toString("utf8"); }
  return parsePage(html, url);
}

function dedupe(items, limit) {
  const seen = new Set(), out = [];
  for (const it of items) {
    const key = typeof it === "string" ? it.toLowerCase() : it.url;
    if (seen.has(key)) continue;
    seen.add(key); out.push(it);
    if (out.length >= limit) break;
  }
  return out;
}

export async function scanSite(input) {
  let url = String(input || "").trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  let host;
  try { host = new URL(url).host.toLowerCase(); } catch { host = ""; }
  if (!host || !host.includes(".")) throw new ApiError("That does not look like a website address.");
  const home = await fetchPage(url);
  const pages = [{ url, title: home.title, headings: dedupe(home.headings, 12), paragraphs: dedupe(home.paragraphs, 12) }];
  let images = [...home.images];
  if (home.ogImage) images.unshift({ url: home.ogImage, alt: home.title });

  const priority = /about|a-propos|apropos|service|solution|expertise|team|equipe|work|projet|project|case|blog|news|nouvelles|contact|approach|approche|offre/i;
  const internal = [];
  for (const link of home.links) {
    let pu;
    try { pu = new URL(link); } catch { continue; }
    if (!["http:", "https:"].includes(pu.protocol) || pu.host.toLowerCase() !== host) continue;
    if (/\.(pdf|jpg|jpeg|png|gif|zip|mp4|svg|webp)$/i.test(pu.pathname)) continue;
    const clean = link.replace(/\/+$/, "");
    if (clean === url.replace(/\/+$/, "") || internal.includes(clean)) continue;
    internal.push(clean);
  }
  internal.sort((a, b) => (priority.test(a) ? 0 : 1) - (priority.test(b) ? 0 : 1) || a.length - b.length);
  const subs = await Promise.allSettled(internal.slice(0, 7).map((l) => fetchPage(l).then((p) => ({ l, p }))));
  for (const s of subs) {
    if (s.status !== "fulfilled") continue;
    const { l, p } = s.value;
    pages.push({ url: l, title: p.title, headings: dedupe(p.headings, 10), paragraphs: dedupe(p.paragraphs, 10) });
    images.push(...p.images);
    if (p.ogImage) images.push({ url: p.ogImage, alt: p.title });
  }
  images = images.filter((i) => !/\.(svg|gif|ico)(\?|$)|sprite|pixel|icon|logo|avatar|gravatar/i.test(i.url));

  const colors = [];
  if (home.theme) colors.push(home.theme.toUpperCase());
  const sheets = await Promise.allSettled(home.styles.slice(0, 3).map((css) => http("GET", css, { timeout: 8000 })));
  for (const s of sheets) {
    if (s.status !== "fulfilled") continue;
    const counts = {};
    for (const m of s.value.raw.subarray(0, 800000).toString("utf8").matchAll(/#([0-9a-fA-F]{6})\b/g)) {
      const hx = m[1], r = parseInt(hx.slice(0, 2), 16), g = parseInt(hx.slice(2, 4), 16), b = parseInt(hx.slice(4, 6), 16);
      if (Math.max(r, g, b) - Math.min(r, g, b) < 28) continue;
      counts["#" + hx.toUpperCase()] = (counts["#" + hx.toUpperCase()] || 0) + 1;
    }
    colors.push(...Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => c));
  }
  return { url, scannedAt: nowIso(), title: home.title, description: home.description, pages, images: dedupe(images, 40), colors: dedupe(colors, 8) };
}

function siteDigest(db, limit = 9000) {
  const site = db.brand.site;
  if (!site) return "";
  const out = [`Website: ${site.url || ""}`, `Title: ${site.title || ""}`, `Description: ${site.description || ""}`];
  for (const page of site.pages || []) {
    out.push(`\n## ${page.title || "Page"} (${page.url})`);
    out.push(...(page.headings || []).map((h) => "- " + h), ...(page.paragraphs || []));
  }
  return out.join("\n").slice(0, limit);
}

// --------------------------------------------------------------- AI writing
const CHANNEL_RULES = {
  facebook: "Facebook: conversational, 1-3 short paragraphs, 1-3 hashtags at most.",
  instagram: "Instagram: strong first line, short paragraphs, 5-10 relevant hashtags at the end.",
  linkedin: "LinkedIn: professional and insightful, 3-6 short lines, a clear takeaway, 3 hashtags.",
  youtube: "YouTube: 'youtubeTitle' under 90 characters, description of 2-4 sentences with a call to action.",
};

export const aiKey = (db) => db.secrets.ai_key || env("ANTHROPIC_API_KEY");

async function claude(db, prompt, withGuidelines = true) {
  const key = aiKey(db);
  if (!key) throw new ApiError("No AI key configured.", 409);
  const content = [];
  if (withGuidelines) {
    for (const a of db.assets) {
      if (a.kind !== "guideline" || a.mime !== "application/pdf" || (a.size || 0) >= 12 * 1024 * 1024) continue;
      try { content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: (await readAsset(a)).toString("base64") } }); } catch { /* skip unreadable file */ }
      if (content.length >= 2) break;
    }
  }
  content.push({ type: "text", text: prompt });
  const body = { model: AI_MODEL, max_tokens: 16000, fallbacks: "default", messages: [{ role: "user", content }] };
  const headers = { "x-api-key": key, "anthropic-version": "2026-10-21", "anthropic-beta": "server-side-fallback-2026-07-01" };
  let r = await http("POST", "https://api.anthropic.com/v1/messages", { headers, json: body, timeout: 240000 });
  if (r.status === 400 && apiErrorText(r.parsed).toLowerCase().includes("fallback")) {
    delete body.fallbacks; delete headers["anthropic-beta"];
    r = await http("POST", "https://api.anthropic.com/v1/messages", { headers, json: body, timeout: 240000 });
  }
  if (r.status === 401) throw new ApiError("The Anthropic API key was rejected. Check it in Settings.", 401);
  if (r.status === 429) throw new ApiError("The AI service is rate limiting requests. Try again in a minute.", 429);
  if (r.status >= 400) throw new ApiError(`AI request failed (${r.status}): ${apiErrorText(r.parsed)}`, 502);
  if (r.parsed.stop_reason === "refusal") throw new ApiError("The AI declined this request. Try rephrasing the topic.", 422);
  const out = (r.parsed.content || []).filter((b) => b.type === "text").map((b) => b.text || "").join("");
  const m = out.match(/\{[\s\S]*\}/);
  if (!m) throw new ApiError("The AI answer could not be read. Try again.", 502);
  try { return JSON.parse(m[0]); } catch { throw new ApiError("The AI answer could not be read. Try again.", 502); }
}

function brandBrief(db) {
  const b = db.brand;
  const lang = { en: "English", fr: "French (Canadian)", bilingual: "bilingual: French first, then English" }[b.language] || "English";
  const parts = [`Brand: ${b.name || ""}`, `Tagline: ${b.tagline || ""}`, `Write in: ${lang}. Audience is in Canada; use Canadian spelling.`,
    `Voice and tone: ${b.voice || "confident, clear, human, no hype"}`, `Audience: ${b.audience || "not specified"}`, `Preferred hashtags: ${b.hashtags || "none given"}`];
  if (b.guidelinesText) parts.push("Brand guidelines:\n" + b.guidelinesText.slice(0, 6000));
  const digest = siteDigest(db);
  parts.push(digest ? "Source material from the brand website (the only source of facts - do not invent services, numbers, clients or claims):\n" + digest
    : "No website content is available; keep claims generic and do not invent facts.");
  return parts.join("\n");
}

const capShape = (channels) => channels.map((c) => `"${c}":"..."`).join(",");

// Written by Claude. Runs in the background worker because it can take over a minute.
export async function generateAI(db, req) {
  const kind = req.type || "post", channels = req.channels?.length ? req.channels : ["facebook", "instagram", "linkedin"];
  const topic = String(req.topic || "").trim(), tone = req.tone || "";
  const rules = channels.filter((c) => CHANNEL_RULES[c]).map((c) => CHANNEL_RULES[c]).join("\n");
  let prompt;
  if (kind === "plan") {
    const slots = req.slots || [];
    prompt = `${brandBrief(db)}\n\nTask: plan ${slots.length} social media posts for ${req.month || "the month"}. Spread them across these dates/slots and themes:\n${JSON.stringify(slots)}\n\n`
      + `Channel rules:\n${rules}\n\nReturn ONLY JSON: {"posts":[{"date":"YYYY-MM-DD","topic":"...","captions":{${capShape(channels)}},"youtubeTitle":"...","headline":"max 8 words for the visual","subline":"max 14 words"}]}`;
  } else if (kind === "reel") {
    prompt = `${brandBrief(db)}\n\nTask: script a ${parseInt(req.scenes || 4, 10)}-scene vertical reel about: ${topic || "what the brand does and why it matters"}. ${tone}\nEach scene is on screen about 3 seconds, so text must be very short.\n`
      + `Return ONLY JSON: {"title":"...","scenes":[{"headline":"max 6 words","subline":"max 12 words"}],"cta":"max 5 words","caption":"caption for the reel with hashtags"}`;
  } else {
    prompt = `${brandBrief(db)}\n\nTask: write one social media post about: ${topic || "a key message from the website"}. ${tone ? "Tone: " + tone : ""}\nChannel rules:\n${rules}\n\n`
      + `Return ONLY JSON: {"captions":{${capShape(channels)}},"youtubeTitle":"...","headline":"max 8 words for the visual","subline":"max 14 words","cta":"max 4 words"}`;
  }
  const out = await claude(db, prompt);
  out.source = "ai";
  return out;
}

// ------------------------------------------------------- template fallback
function siteSnippets(db) {
  const site = db.brand.site || {}, heads = [], paras = [];
  for (const page of site.pages || []) { heads.push(...(page.headings || [])); paras.push(...(page.paragraphs || [])); }
  return { heads: dedupe(heads, 30), paras: dedupe(paras, 30), site };
}
function firstSentences(s, n = 2, limit = 260) {
  const out = String(s || "").split(/(?<=[.!?])\s+/).slice(0, n).join(" ");
  return out.length <= limit ? out : out.slice(0, limit).replace(/\s+\S*$/, "") + "…";
}
function templatePost(db, topic, channels, index = 0) {
  const b = db.brand, fr = b.language === "fr", { heads, paras, site } = siteSnippets(db);
  const name = b.name || "We", tags = b.hashtags || "", url = site.url || b.website || "";
  let headline, body;
  if (topic) {
    const words = topic.toLowerCase().match(/[\p{L}\p{N}_]{4,}/gu) || [];
    const match = paras.filter((p) => words.some((w) => p.toLowerCase().includes(w)));
    body = match.length ? firstSentences(match[0]) : paras.length ? firstSentences(paras[index % paras.length]) : "";
    headline = topic.slice(0, 70);
  } else {
    headline = heads.length ? heads[index % heads.length] : b.tagline || name;
    body = paras.length ? firstSentences(paras[index % paras.length]) : site.description || "";
  }
  const more = url ? (fr ? "En savoir plus : " : "Learn more: ") + url : "";
  const pack = (...x) => x.filter(Boolean).join("\n\n");
  const caps = {};
  for (const c of channels) caps[c] = c === "instagram" ? pack(headline, body, fr ? "Lien dans la bio." : "Link in bio.", tags) : c === "linkedin" ? pack(headline, body, more, tags) : pack(headline, body, more);
  return { topic: topic || headline, captions: caps, youtubeTitle: headline.slice(0, 90), headline: headline.slice(0, 60), subline: firstSentences(body, 1, 90), cta: fr ? "En savoir plus" : "Learn more" };
}
export function generateTemplate(db, req) {
  const kind = req.type || "post", channels = req.channels?.length ? req.channels : ["facebook", "instagram", "linkedin"];
  const topic = String(req.topic || "").trim(), b = db.brand, fr = b.language === "fr";
  if (kind === "plan") {
    const posts = (req.slots || []).map((slot, i) => {
      let p;
      if (slot.holiday) {
        const h = slot.holiday;
        const greet = slot.solemn ? (fr ? `${h} : aujourd'hui, nous prenons un moment pour nous souvenir et réfléchir.` : `${h}. Today we pause to remember and reflect.`)
          : (fr ? `Toute l'équipe de ${b.name || ""} vous souhaite une belle journée : ${h}.` : `From all of us at ${b.name || ""} - wishing you a wonderful ${h}.`);
        p = { topic: h, captions: Object.fromEntries(channels.map((c) => [c, greet + (b.hashtags && c !== "facebook" ? "\n\n" + b.hashtags : "")])), youtubeTitle: h, headline: h, subline: b.name || "" };
      } else p = templatePost(db, "", channels, i);
      p.date = slot.date;
      return p;
    });
    return { posts, source: "template" };
  }
  if (kind === "reel") {
    const { heads, paras } = siteSnippets(db), n = parseInt(req.scenes || 4, 10);
    const scenes = [{ headline: topic.slice(0, 40) || b.name || "", subline: b.tagline || "" }];
    for (let i = 0; i < Math.max(0, n - 1); i++) {
      const h = heads[i] || "", s = paras[i] ? firstSentences(paras[i], 1, 80) : "";
      if (h || s) scenes.push({ headline: h.slice(0, 40), subline: s });
    }
    return { title: topic || b.name || "", scenes, cta: fr ? "En savoir plus" : "Learn more", caption: templatePost(db, topic, ["instagram"]).captions.instagram, source: "template" };
  }
  return { ...templatePost(db, topic, channels), source: "template" };
}

// ---------------------------------------------------------- AI key dates
const KEYDATE_CATS = ["awareness", "industry", "tradeshow", "publication"];
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
export function checkKeyDateRequest(req) {
  if (!ISO_DAY.test(String(req.from || "")) || !ISO_DAY.test(String(req.to || ""))) throw new ApiError("Choose a period first.", 400);
}
export async function suggestKeyDates(db, req) {
  checkKeyDateRequest(req);
  const industry = String(req.industry || "").trim().slice(0, 120) || "general business", start = req.from, end = req.to;
  const known = (req.known || []).slice(0, 150).map((n) => String(n).slice(0, 80)), b = db.brand;
  const prompt = `Brand: ${b.name || ""} (${b.tagline || ""}). Audience is in Canada, with clients in the United States.\n`
    + `Task: list up to 15 real, well-known dates between ${start} and ${end} that a company in this field would post about on social media: ${industry}.\n`
    + "Categories: 'industry' (conferences, summits, sector deadlines), 'tradeshow' (trade shows and expos), 'publication' (major annual reports, rankings and publication releases), 'awareness' (awareness days and weeks).\n"
    + "Rules: only include events you are confident exist. Never invent an event. If you do not know the exact date for that year, give your best estimate from its usual timing and say so in 'when' (for example 'Usually mid-May'). "
    + `Skip these, already listed: ${JSON.stringify(known)}.\n`
    + "For each, write a short publishable key message in the brand's voice (no invented facts about the brand, Canadian spelling), a headline of at most 6 words and a subline of at most 9 words for the visual.\n"
    + 'Return ONLY JSON: {"dates":[{"date":"YYYY-MM-DD","name":"...","category":"industry|tradeshow|publication|awareness","where":"city or empty","when":"usual timing","message":"...","headline":"...","subline":"..."}]}';
  const out = await claude(db, prompt, false);
  const dates = [];
  (out.dates || []).forEach((d, i) => {
    if (!d || typeof d !== "object") return;
    const date = String(d.date || "").slice(0, 10), name = String(d.name || "").trim().slice(0, 120);
    if (!ISO_DAY.test(date) || !name || date < start || date > end) return;
    dates.push({ id: `ai${Date.now().toString(16)}${i}`, date, name, cat: KEYDATE_CATS.includes(d.category) ? d.category : "industry", source: "ai", approx: true,
      where: String(d.where || "").slice(0, 80), when: String(d.when || "").slice(0, 80) || "Suggested by AI",
      msg: String(d.message || "").slice(0, 600), head: String(d.headline || "").slice(0, 60), sub: String(d.subline || "").slice(0, 90) });
  });
  return { dates };
}
