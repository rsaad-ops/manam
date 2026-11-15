// Shared state, API client and small UI helpers.
export const S = { data: null };
const listeners = [];
export function onState(fn) { listeners.push(fn); }

// Which client brand this browser is working on. The server keeps each brand's data apart.
const BRAND_KEY = 'studio.brand';
export const brandId = () => { try { return localStorage.getItem(BRAND_KEY) || ''; } catch (e) { return ''; } };
export function setBrand(id) { try { localStorage.setItem(BRAND_KEY, id || ''); } catch (e) { /* private window */ } }
export const brandHeaders = () => (brandId() ? { 'X-Brand': brandId() } : {});
export const isDefaultBrand = () => (S.data.brandId || 'upsmrt') === 'upsmrt';
// Dark enough to be used for text on a light background.
export function isDark(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''), n = m ? parseInt(m[1], 16) : 0xffffff;
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 < 0.5;
}
export function refresh() { listeners.forEach((f) => f()); }

export function setState(d, quiet) {
  if (d && d.brand) {
    S.data = d;
    if (d.brandId && d.brandId !== brandId()) setBrand(d.brandId);
    if (!quiet) listeners.forEach((f) => f());
  }
  return d;
}

export async function api(method, path, body, opts = {}) {
  const opt = { method, headers: brandHeaders() };
  if (opts.raw) { opt.body = body; opt.headers['Content-Type'] = opts.raw; }
  else if (body !== undefined) { opt.body = JSON.stringify(body); opt.headers['Content-Type'] = 'application/json'; }
  let r;
  try { r = await fetch('/api/' + path, opt); }
  catch (e) { throw new Error('The app server is not responding. Is it still running?'); }
  const j = await r.json().catch(() => ({ error: 'Unexpected server answer' }));
  if (r.status === 401 && path !== 'login') { showLogin(); const e = new Error('Sign in to continue.'); e.login = true; throw e; }
  if (!r.ok) throw new Error(j.error || 'Request failed');
  if (j.job) return waitJob(j.job);
  setState(j, opts.quiet);
  return j;
}

// Hosted version: long requests (AI writing) run in the background; wait for the result.
async function waitJob(id) {
  for (let i = 0; i < 200; i++) {
    await new Promise((res) => setTimeout(res, 2000));
    const r = await fetch('/api/jobs/' + id, { headers: brandHeaders() });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Request failed');
    if (j.status === 'done') return j.result;
  }
  throw new Error('This is taking too long. Try again.');
}

// Hosted version: sign-in screen. The password is set by the owner in Netlify, never stored in the app.
export async function showLogin() {
  if (document.querySelector('.login')) return;
  const wrap = document.createElement('div');
  wrap.className = 'login';
  wrap.innerHTML = `<form class="login-card"><img src="/img/logo.svg" alt="UPSMRT"><span>Social Studio</span><div id="lbody"></div></form>`;
  document.body.appendChild(wrap);
  const box = wrap.querySelector('#lbody');
  const s = await fetch('/api/session').then((r) => r.json()).catch(() => ({}));
  if (!s.configured) {
    box.innerHTML = `<h2>One step left</h2><p>This app needs a password before it can be used.</p>
      <ol><li>In Netlify, open this project, then <b>Project configuration → Environment variables</b>.</li>
      <li>Add a variable named <code>APP_PASSWORD</code> with a password of at least 8 characters.</li>
      <li>Redeploy the project (<b>Deploys → Trigger deploy</b>), then reload this page.</li></ol>`;
    return;
  }
  box.innerHTML = `<label for="lpw">Password</label><input type="password" id="lpw" autocomplete="current-password" required>
    <button class="btn primary" type="submit">Sign in</button><p class="lerr" role="alert"></p>`;
  const pw = box.querySelector('#lpw'), err = box.querySelector('.lerr'), btn = box.querySelector('button');
  pw.focus();
  wrap.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    btn.disabled = true; err.textContent = '';
    try {
      const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw.value }) });
      if (r.ok) return location.reload();
      err.textContent = (await r.json().catch(() => ({}))).error || 'Sign-in failed.';
    } catch (x) { err.textContent = 'The server is not responding.'; }
    btn.disabled = false; pw.select();
  };
}

export const CH = {
  facebook: { name: 'Facebook', glyph: 'f', color: '#1877F2', limit: 63206 },
  instagram: { name: 'Instagram', glyph: 'ig', color: '#D62976', limit: 2200 },
  linkedin: { name: 'LinkedIn', glyph: 'in', color: '#0A66C2', limit: 3000 },
  youtube: { name: 'YouTube', glyph: '▶', color: '#E62117', limit: 5000 },
};
export const CH_KEYS = Object.keys(CH);

export const STATUS = {
  draft: 'Draft', scheduled: 'Scheduled', publishing: 'Publishing…', published: 'Published',
  partial: 'Partly published', failed: 'Failed', missed: 'Missed',
};

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function chBadge(k, small) {
  const c = CH[k];
  return `<span class="chb${small ? ' sm' : ''}" style="background:${c.color}" title="${c.name}">${c.glyph}</span>`;
}

export function toast(msg, type = 'ok', ms = 4200) {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), type === 'err' ? 8000 : ms);
  return el;
}

export async function guard(fn, btn) {
  const label = btn && btn.innerHTML;
  if (btn) { btn.disabled = true; btn.classList.add('busy'); }
  try { return await fn(); }
  catch (e) { toast(e.message || String(e), 'err'); return null; }
  finally { if (btn) { btn.disabled = false; btn.classList.remove('busy'); btn.innerHTML = label; } }
}

// ---- dates (all scheduling shown in this computer's time zone, stored as UTC)
export const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const toUtc = (date, time) => new Date(`${date}T${time || '09:00'}:00`).toISOString().slice(0, 19) + 'Z';
export const fromUtc = (iso) => (iso ? new Date(iso) : null);
export function niceDate(d, withTime) {
  if (!d) return '';
  const o = { weekday: 'short', month: 'short', day: 'numeric' };
  if (withTime) Object.assign(o, { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleString('en-CA', o);
}
export const postDay = (p) => (p.scheduledAt ? ymd(fromUtc(p.scheduledAt)) : '');

// ---- assets
export const asset = (id) => (S.data.assets || []).find((a) => a.id === id);
export const isVideo = (a) => a && a.mime.startsWith('video');
export const isImage = (a) => a && a.mime.startsWith('image');
export const mediaAssets = () => S.data.assets.filter((a) => isImage(a) && a.kind !== 'logo' || isVideo(a));
export const photos = () => S.data.assets.filter((a) => a.kind === 'photo' && isImage(a));

const DOC_TYPES = { csv: 'text/csv', txt: 'text/plain', md: 'text/markdown', pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

export async function uploadFile(input, kind, name) {
  // Some systems report no type, or a spreadsheet type, for .csv and .md files: go by the file extension for documents.
  const type = DOC_TYPES[(input.name || '').split('.').pop().toLowerCase()] || input.type;
  if (!type) throw new Error('Unknown file type: ' + input.name);
  const file = type === input.type ? input : new File([input], input.name, { type });
  const label = encodeURIComponent(name || file.name || kind), PIECE = 3 * 1024 * 1024;
  if (S.data.hosted && file.size > PIECE) {
    // The hosted version accepts only small requests, so large files go up in pieces.
    const id = [...crypto.getRandomValues(new Uint8Array(6))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const parts = Math.ceil(file.size / PIECE);
    let last;
    for (let i = 0; i < parts; i++) {
      last = await api('POST', `assets?kind=${kind}&name=${label}&upload=${id}&part=${i}&parts=${parts}&size=${file.size}`,
        file.slice(i * PIECE, (i + 1) * PIECE), { raw: file.type, quiet: i < parts - 1 });
    }
    return last.asset;
  }
  const j = await api('POST', `assets?kind=${kind}&name=${encodeURIComponent(name || file.name || kind)}`, file, { raw: file.type });
  return j.asset;
}

export function thumb(a, cls = '') {
  if (!a) return '';
  if (isVideo(a)) return `<video class="${cls}" src="${a.url}#t=0.5" muted preload="metadata"></video>`;
  if (isImage(a)) return `<img class="${cls}" src="${a.url}" alt="${esc(a.name)}" loading="lazy">`;
  return `<div class="doc ${cls}">${esc(a.file.split('.').pop().toUpperCase())}</div>`;
}

const imgCache = new Map();
export function loadImage(url) {
  if (!url) return Promise.resolve(null);
  if (!imgCache.has(url)) {
    imgCache.set(url, new Promise((res) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => res(null);
      im.src = url;
    }));
  }
  return imgCache.get(url);
}

// ---- modal
export function modal(html, cls = '') {
  const wrap = document.createElement('div');
  wrap.className = 'overlay';
  wrap.innerHTML = `<div class="modal ${cls}" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  $$('[data-close]', wrap).forEach((b) => b.addEventListener('click', close));
  return { el: wrap.firstElementChild, close };
}

export function confirmBox(title, text, okLabel = 'Confirm', danger) {
  return new Promise((resolve) => {
    const m = modal(`<div class="mhead"><h2>${esc(title)}</h2></div>
      <div class="mbody"><p>${esc(text)}</p></div>
      <div class="mfoot"><span class="grow"></span><button class="btn" data-no>Cancel</button>
      <button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${esc(okLabel)}</button></div>`, 'small');
    $('[data-no]', m.el).onclick = () => { m.close(); resolve(false); };
    $('[data-yes]', m.el).onclick = () => { m.close(); resolve(true); };
  });
}

export function pickAsset(filter, title = 'Choose from library') {
  return new Promise((resolve) => {
    const list = S.data.assets.filter(filter);
    const m = modal(`<div class="mhead"><h2>${esc(title)}</h2><button class="x" data-x>×</button></div>
      <div class="mbody">${list.length ? `<div class="grid-assets pick">${list.map((a) =>
        `<button class="tile" data-id="${a.id}">${thumb(a)}<span>${esc(a.name)}</span></button>`).join('')}</div>`
        : '<p class="muted">Nothing here yet. Upload photos in Library, or create a visual in Studio.</p>'}</div>`, 'medium');
    $('[data-x]', m.el).onclick = () => { m.close(); resolve(null); };
    $$('.tile', m.el).forEach((t) => (t.onclick = () => { m.close(); resolve(asset(t.dataset.id)); }));
  });
}

export function go(route) { location.hash = '#/' + route; }
