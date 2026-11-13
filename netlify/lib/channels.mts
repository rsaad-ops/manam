// @ts-nocheck
// Publishing to Facebook, Instagram, LinkedIn and YouTube, plus their sign-in flows.
import { ApiError, apiErrorText, chan, getJSON, getPost, http, mediaSig, nowIso, readAsset, remove, savePost, saveSecrets, setJSON, newId } from "./store.mts";

const need = (cfg, ...keys) => { for (const k of keys) if (!cfg[k]) throw new ApiError("Channel is not connected."); };
const needApp = (cfg, ...keys) => { for (const k of keys) if (!cfg[k]) throw new ApiError("Save the app credentials for this channel first."); };
const isVideo = (m) => m && m.mime.startsWith("video");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function publishFacebook(ctx, post, caption, media) {
  const c = chan(ctx.secrets, "facebook");
  need(c, "page_id", "page_token");
  let r;
  if (media) {
    const form = new FormData();
    form.set("access_token", c.page_token);
    if (isVideo(media)) { form.set("description", caption); form.set("title", post.title || ""); } else form.set("caption", caption);
    form.set("source", new Blob([await readAsset(media)], { type: media.mime }), media.file);
    r = await http("POST", isVideo(media) ? `https://graph-video.facebook.com/${c.page_id}/videos` : `https://graph.facebook.com/${c.page_id}/photos`, { body: form, timeout: 800000 });
  } else {
    r = await http("POST", `https://graph.facebook.com/${c.page_id}/feed`, { form: { access_token: c.page_token, message: caption } });
  }
  if (r.status >= 400) throw new ApiError(apiErrorText(r.parsed));
  const pid = r.parsed.post_id || r.parsed.id || "";
  return { id: pid, url: `https://www.facebook.com/${pid}` };
}

async function publishInstagram(ctx, post, caption, media) {
  const c = chan(ctx.secrets, "instagram");
  need(c, "ig_user_id", "token");
  if (!media) throw new ApiError("Instagram needs an image or a video.");
  const g = "https://graph.facebook.com/", ig = c.ig_user_id, token = c.token;
  let container;
  if (isVideo(media)) {
    const r = await http("POST", `${g}${ig}/media`, { form: { media_type: "REELS", upload_type: "resumable", caption, access_token: token } });
    if (r.status >= 400) throw new ApiError(apiErrorText(r.parsed));
    container = r.parsed.id;
    const blob = await readAsset(media);
    const up = await http("POST", r.parsed.uri || `https://rupload.facebook.com/ig-api-upload/${container}`, {
      headers: { Authorization: "OAuth " + token, offset: "0", file_size: String(blob.length), "Content-Type": "application/octet-stream" }, body: blob, timeout: 800000 });
    if (up.status >= 400) throw new ApiError("Upload failed: " + up.raw.toString("utf8").slice(0, 300));
  } else {
    // Instagram downloads the image itself, through a signed link that only works for this file.
    const base = (ctx.settings.publicMediaUrl || "").replace(/\/+$/, "");
    const imageUrl = base ? `${base}/${media.file}` : `${ctx.origin}/uploads/${media.file}?sig=${mediaSig(media.file)}`;
    const r = await http("POST", `${g}${ig}/media`, { form: { image_url: imageUrl, caption, access_token: token } });
    if (r.status >= 400) throw new ApiError(apiErrorText(r.parsed));
    container = r.parsed.id;
  }
  for (let i = 0; i < 60; i++) {
    const r = await http("GET", `${g}${container}?fields=status_code&access_token=${encodeURIComponent(token)}`);
    const code = r.parsed.status_code;
    if (code === "FINISHED") break;
    if (["ERROR", "EXPIRED"].includes(code)) throw new ApiError(`Instagram could not process the media (${code}).`);
    await sleep(5000);
  }
  const r = await http("POST", `${g}${ig}/media_publish`, { form: { creation_id: container, access_token: token } });
  if (r.status >= 400) throw new ApiError(apiErrorText(r.parsed));
  return { id: r.parsed.id || "", url: `https://www.instagram.com/${c.username || ""}/` };
}

function liHeaders(token) {
  const d = new Date(); d.setUTCDate(1); d.setUTCDate(d.getUTCDate() - 40);
  return { Authorization: "Bearer " + token, "LinkedIn-Version": `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`, "X-Restli-Protocol-Version": "2.0.0" };
}

async function publishLinkedin(ctx, post, caption, media) {
  const c = chan(ctx.secrets, "linkedin");
  need(c, "access_token", "author_urn");
  const h = liHeaders(c.access_token), owner = c.author_urn, api = "https://api.linkedin.com/rest/";
  const body = { author: owner, commentary: caption, visibility: "PUBLIC", lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false,
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] } };
  if (media && media.mime.startsWith("image")) {
    const init = await http("POST", api + "images?action=initializeUpload", { headers: h, json: { initializeUploadRequest: { owner } } });
    if (init.status >= 400) throw new ApiError(apiErrorText(init.parsed));
    const up = await http("PUT", init.parsed.value.uploadUrl, { headers: { Authorization: h.Authorization }, body: await readAsset(media), timeout: 300000 });
    if (up.status >= 400) throw new ApiError(`Image upload failed (${up.status}).`);
    body.content = { media: { id: init.parsed.value.image } };
  } else if (media) {
    const blob = await readAsset(media);
    const init = await http("POST", api + "videos?action=initializeUpload", { headers: h, json: { initializeUploadRequest: { owner, fileSizeBytes: blob.length, uploadCaptions: false, uploadThumbnail: false } } });
    if (init.status >= 400) throw new ApiError(apiErrorText(init.parsed));
    const v = init.parsed.value, etags = [];
    for (const part of v.uploadInstructions) {
      const up = await http("PUT", part.uploadUrl, { headers: { "Content-Type": "application/octet-stream" }, body: blob.subarray(part.firstByte, part.lastByte + 1), timeout: 800000 });
      if (up.status >= 400) throw new ApiError(`Video upload failed (${up.status}).`);
      etags.push((up.headers.get("etag") || "").replace(/"/g, ""));
    }
    const fin = await http("POST", api + "videos?action=finalizeUpload", { headers: h, json: { finalizeUploadRequest: { video: v.video, uploadToken: v.uploadToken || "", uploadedPartIds: etags } } });
    if (fin.status >= 400) throw new ApiError(apiErrorText(fin.parsed));
    body.content = { media: { id: v.video, title: post.title || "Video" } };
  }
  const r = await http("POST", api + "posts", { headers: h, json: body });
  if (r.status >= 400) throw new ApiError(apiErrorText(r.parsed));
  const urn = r.headers.get("x-restli-id") || "";
  return { id: urn, url: urn ? `https://www.linkedin.com/feed/update/${urn}/` : "" };
}

async function youtubeToken(secrets) {
  const c = chan(secrets, "youtube");
  need(c, "client_id", "client_secret", "refresh_token");
  const r = await http("POST", "https://oauth2.googleapis.com/token", { form: { client_id: c.client_id, client_secret: c.client_secret, refresh_token: c.refresh_token, grant_type: "refresh_token" } });
  if (r.status >= 400) throw new ApiError("Google sign-in expired: " + apiErrorText(r.parsed));
  return r.parsed.access_token;
}

async function publishYoutube(ctx, post, caption, media) {
  if (!isVideo(media)) throw new ApiError("YouTube needs a video.");
  const token = await youtubeToken(ctx.secrets), blob = await readAsset(media);
  const meta = { snippet: { title: (post.title || caption.split("\n")[0] || "Video").slice(0, 100), description: caption.slice(0, 4900), categoryId: "22" },
    status: { privacyStatus: post.privacy || "public", selfDeclaredMadeForKids: false } };
  const init = await http("POST", "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": media.mime, "X-Upload-Content-Length": String(blob.length) }, body: JSON.stringify(meta) });
  const loc = init.headers.get("location");
  if (init.status >= 400 || !loc) throw new ApiError("YouTube refused the upload: " + init.raw.toString("utf8").slice(0, 300));
  const up = await http("PUT", loc, { headers: { Authorization: "Bearer " + token, "Content-Type": media.mime }, body: blob, timeout: 800000 });
  if (up.status >= 400) throw new ApiError(apiErrorText(up.parsed));
  return { id: up.parsed.id || "", url: `https://youtu.be/${up.parsed.id || ""}` };
}

export const PUBLISHERS = { facebook: publishFacebook, instagram: publishInstagram, linkedin: publishLinkedin, youtube: publishYoutube };

// Publish a post that has already been marked "publishing". Channels that succeeded before are never posted twice.
export async function publishPost(ctx, postId, onlyFailed = false) {
  const post = await getPost(postId);
  if (!post || post.status !== "publishing") return post;
  post.results = post.results || {};
  const media = (post.mediaIds || []).length ? ctx.assets.find((a) => a.id === post.mediaIds[0]) : null;
  for (const ch of post.channels || []) {
    if (onlyFailed && post.results[ch]?.ok) continue;
    const caption = (post.captions || {})[ch] || post.caption || "";
    let res;
    try { res = { ...(await PUBLISHERS[ch](ctx, post, caption, media)), ok: true, at: nowIso() }; }
    catch (e) { if (!(e instanceof ApiError)) console.error(e); res = { ok: false, error: e instanceof ApiError ? e.message : `Unexpected error: ${e.message}`, at: nowIso() }; }
    post.results[ch] = res;
    await savePost(post);
  }
  const oks = (post.channels || []).map((ch) => !!post.results[ch]?.ok);
  post.status = oks.length && oks.every(Boolean) ? "published" : oks.some(Boolean) ? "partial" : "failed";
  if (oks.some(Boolean)) post.publishedAt = nowIso();
  delete post.publishingSince;
  await savePost(post);
  return post;
}

// ------------------------------------------------------------------- OAuth
export async function oauthStart(secrets, platform, origin) {
  const state = newId() + newId(), redirect = `${origin}/oauth/callback/${platform}`;
  const q = (o) => new URLSearchParams(o).toString();
  let url;
  if (platform === "facebook") {
    const c = chan(secrets, "facebook"); needApp(c, "app_id", "app_secret");
    url = "https://www.facebook.com/dialog/oauth?" + q({ client_id: c.app_id, redirect_uri: redirect, state,
      scope: "pages_show_list,pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish,business_management" });
  } else if (platform === "linkedin") {
    const c = chan(secrets, "linkedin"); needApp(c, "client_id", "client_secret");
    url = "https://www.linkedin.com/oauth/v2/authorization?" + q({ response_type: "code", client_id: c.client_id, redirect_uri: redirect, state,
      scope: "openid profile w_member_social" + (c.org_id ? " w_organization_social" : "") });
  } else if (platform === "youtube") {
    const c = chan(secrets, "youtube"); needApp(c, "client_id", "client_secret");
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + q({ client_id: c.client_id, redirect_uri: redirect, response_type: "code", state, access_type: "offline", prompt: "consent",
      scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly" });
  } else throw new ApiError("Unknown channel.", 404);
  await setJSON("oauth/" + state, { platform, at: Date.now() });
  return url;
}

export function selectPage(secrets, pageId) {
  const fb = chan(secrets, "facebook"), page = (fb.pages || []).find((p) => p.id === pageId);
  if (!page) throw new ApiError("Page not found.");
  Object.assign(fb, { page_id: page.id, page_name: page.name, page_token: page.access_token });
  const ig = page.instagram_business_account;
  if (ig) Object.assign(chan(secrets, "instagram"), { ig_user_id: ig.id, username: ig.username || "", token: page.access_token });
}

export async function oauthCallback(secrets, platform, q, origin) {
  if (q.error) throw new ApiError(q.error_description || q.error);
  const saved = q.state && /^[0-9a-f]+$/.test(q.state) ? await getJSON("oauth/" + q.state) : null;
  if (saved) await remove("oauth/" + q.state);
  if (!saved || saved.platform !== platform || Date.now() - saved.at > 15 * 60000 || !q.code) throw new ApiError("This sign-in link is no longer valid. Start again from the Channels page.");
  const redirect = `${origin}/oauth/callback/${platform}`, qs = (o) => new URLSearchParams(o).toString();
  if (platform === "facebook") {
    const c = chan(secrets, "facebook"), g = "https://graph.facebook.com/";
    const tok = await http("GET", g + "oauth/access_token?" + qs({ client_id: c.app_id, client_secret: c.app_secret, redirect_uri: redirect, code: q.code }));
    if (tok.status >= 400) throw new ApiError(apiErrorText(tok.parsed));
    const long = await http("GET", g + "oauth/access_token?" + qs({ grant_type: "fb_exchange_token", client_id: c.app_id, client_secret: c.app_secret, fb_exchange_token: tok.parsed.access_token }));
    const userToken = long.parsed.access_token || tok.parsed.access_token;
    const pages = await http("GET", g + "me/accounts?" + qs({ fields: "id,name,access_token,instagram_business_account{id,username}", limit: "100", access_token: userToken }));
    if (pages.status >= 400) throw new ApiError(apiErrorText(pages.parsed));
    c.pages = pages.parsed.data || [];
    if (!c.pages.length) throw new ApiError("No Facebook Pages were shared with the app. Run the sign-in again and select your Page.");
    selectPage(secrets, c.pages[0].id);
  } else if (platform === "linkedin") {
    const c = chan(secrets, "linkedin");
    const tok = await http("POST", "https://www.linkedin.com/oauth/v2/accessToken", { form: { grant_type: "authorization_code", code: q.code, redirect_uri: redirect, client_id: c.client_id, client_secret: c.client_secret } });
    if (tok.status >= 400) throw new ApiError(apiErrorText(tok.parsed));
    c.access_token = tok.parsed.access_token;
    c.expires_at = Math.floor(Date.now() / 1000) + parseInt(tok.parsed.expires_in || 0, 10);
    const me = await http("GET", "https://api.linkedin.com/v2/userinfo", { headers: { Authorization: "Bearer " + c.access_token } });
    if (me.status >= 400) throw new ApiError(apiErrorText(me.parsed));
    c.name = me.parsed.name || "";
    c.author_urn = c.org_id ? `urn:li:organization:${c.org_id}` : `urn:li:person:${me.parsed.sub || ""}`;
  } else if (platform === "youtube") {
    const c = chan(secrets, "youtube");
    const tok = await http("POST", "https://oauth2.googleapis.com/token", { form: { grant_type: "authorization_code", code: q.code, redirect_uri: redirect, client_id: c.client_id, client_secret: c.client_secret } });
    if (tok.status >= 400) throw new ApiError(apiErrorText(tok.parsed));
    if (!tok.parsed.refresh_token) throw new ApiError("Google did not return a refresh token. Remove the app's access in your Google account and connect again.");
    c.refresh_token = tok.parsed.refresh_token;
    const ch = await http("GET", "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { Authorization: "Bearer " + tok.parsed.access_token } });
    c.channel_name = ch.parsed.items?.[0]?.snippet?.title || "";
  } else throw new ApiError("Unknown channel.", 404);
  await saveSecrets(secrets);
}

export async function testChannel(secrets, platform) {
  if (platform === "facebook") {
    const c = chan(secrets, "facebook"); need(c, "page_id", "page_token");
    const r = await http("GET", `https://graph.facebook.com/${c.page_id}?fields=name&access_token=${encodeURIComponent(c.page_token)}`);
    if (r.status >= 400) throw new ApiError(apiErrorText(r.parsed));
    c.page_name = r.parsed.name || c.page_name || "";
  } else if (platform === "instagram") {
    const c = chan(secrets, "instagram"); need(c, "ig_user_id", "token");
    const r = await http("GET", `https://graph.facebook.com/${c.ig_user_id}?fields=username&access_token=${encodeURIComponent(c.token)}`);
    if (r.status >= 400) throw new ApiError(apiErrorText(r.parsed));
    c.username = r.parsed.username || "";
  } else if (platform === "linkedin") {
    const c = chan(secrets, "linkedin"); need(c, "access_token", "author_urn");
    const r = await http("GET", "https://api.linkedin.com/v2/userinfo", { headers: { Authorization: "Bearer " + c.access_token } });
    if (r.status >= 400) throw new ApiError(apiErrorText(r.parsed));
    c.name = r.parsed.name || c.name || "";
  } else if (platform === "youtube") {
    const token = await youtubeToken(secrets);
    const r = await http("GET", "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { Authorization: "Bearer " + token } });
    if (r.status >= 400) throw new ApiError(apiErrorText(r.parsed));
    chan(secrets, "youtube").channel_name = r.parsed.items?.[0]?.snippet?.title || "";
  } else throw new ApiError("Unknown channel.", 404);
  await saveSecrets(secrets);
}

export const CHANNEL_FIELDS = {
  facebook: ["app_id", "app_secret", "page_id", "page_token"], instagram: ["ig_user_id", "token"],
  linkedin: ["client_id", "client_secret", "org_id", "access_token", "author_urn"], youtube: ["client_id", "client_secret", "refresh_token"],
};
export const SECRET_FIELDS = new Set(["app_secret", "page_token", "token", "client_secret", "access_token", "refresh_token"]);

// What the browser is allowed to see: never the tokens themselves.
export function publicChannels(secrets) {
  const fb = chan(secrets, "facebook"), ig = chan(secrets, "instagram"), li = chan(secrets, "linkedin"), yt = chan(secrets, "youtube");
  const view = (name, cfg, connected, label, extra = {}) => ({ connected: !!connected, name: label || "",
    fields: Object.fromEntries(CHANNEL_FIELDS[name].map((f) => [f, SECRET_FIELDS.has(f) ? !!cfg[f] : cfg[f] || ""])), ...extra });
  return {
    facebook: view("facebook", fb, fb.page_id && fb.page_token, fb.page_name, { pages: (fb.pages || []).map((p) => ({ id: p.id, name: p.name })) }),
    instagram: view("instagram", ig, ig.ig_user_id && ig.token, ig.username && "@" + ig.username),
    linkedin: view("linkedin", li, li.access_token && li.author_urn, li.name, { expiresAt: li.expires_at || 0 }),
    youtube: view("youtube", yt, yt.refresh_token && yt.client_id && yt.client_secret, yt.channel_name),
  };
}
