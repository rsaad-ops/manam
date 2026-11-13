// Studio: on-brand image designer and reel maker, rendered in the browser.
import { S, $, $$, api, esc, toast, guard, asset, photos, pickAsset, loadImage, uploadFile, thumb } from './core.js';
import { openComposer } from './composer.js';

export const FORMATS = {
  square: { w: 1080, h: 1080, label: 'Square 1:1 · Instagram, Facebook' },
  portrait: { w: 1080, h: 1350, label: 'Portrait 4:5 · Instagram feed' },
  story: { w: 1080, h: 1920, label: 'Vertical 9:16 · Stories, Reels, Shorts' },
  landscape: { w: 1200, h: 628, label: 'Landscape · LinkedIn, Facebook' },
  youtube: { w: 1280, h: 720, label: '16:9 · YouTube thumbnail' },
};
export const TEMPLATES = { bold: 'Bold', photo: 'Photo', split: 'Split', quote: 'Quote', festive: 'Festive' };

const FONTS = ['Avenir Next', 'Helvetica Neue', 'Futura', 'Gill Sans', 'Georgia', 'Didot', 'Optima', 'Arial', 'Verdana', 'Trebuchet MS'];
export const fontList = () => FONTS;
const fontStack = () => `"${S.data.brand.font || 'Avenir Next'}", "Helvetica Neue", Arial, sans-serif`;

function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}
const onColor = (hex) => (luminance(hex) > 0.6 ? '#1A1B4E' : '#FFFFFF');

export async function prepare(spec) {
  const b = S.data.brand;
  const custom = asset(b.logoId);
  const [photo, logo, logoLight] = await Promise.all([
    loadImage(spec.photoId && asset(spec.photoId) ? asset(spec.photoId).url : ''),
    loadImage(custom ? custom.url : '/img/logo.svg'),
    loadImage(custom ? '' : '/img/logo-light.svg'),
  ]);
  return { photo, logo, logoLight };
}

function wrap(ctx, text, maxW) {
  const lines = [];
  String(text || '').split('\n').forEach((para) => {
    let line = '';
    para.split(/\s+/).forEach((word) => {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; }
      else line = test;
    });
    if (line) lines.push(line);
  });
  return lines;
}

function fit(ctx, text, maxW, maxH, maxSize, weight, lh = 1.12) {
  let size = maxSize, lines = [];
  for (; size >= 18; size -= 3) {
    ctx.font = `${weight} ${size}px ${fontStack()}`;
    lines = wrap(ctx, text, maxW);
    const widest = Math.max(0, ...lines.map((l) => ctx.measureText(l).width));
    if (lines.length * size * lh <= maxH && widest <= maxW) break;
  }
  return { size, lines, lh, weight, height: lines.length * size * lh };
}

function paint(ctx, f, x, y, color, alpha = 1, align = 'left') {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = `${f.weight} ${f.size}px ${fontStack()}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  f.lines.forEach((l, i) => ctx.fillText(l, x, y + i * f.size * f.lh));
  ctx.restore();
}

function cover(ctx, img, x, y, w, h, zoom = 1) {
  const r = Math.max(w / img.width, h / img.height) * zoom;
  const dw = img.width * r, dh = img.height * r;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// the speech-bubble shape from the brand mark, used as a graphic device
function bubble(ctx, x, y, s, color, alpha) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = color;
  rrect(ctx, x, y, s, s * 0.74, s * 0.12); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + s * 0.15, y + s * 0.7); ctx.lineTo(x + s * 0.15, y + s * 1.08); ctx.lineTo(x + s * 0.42, y + s * 0.7);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawLogo(ctx, res, x, y, h, dark, align = 'left') {
  const img = dark && res.logoLight ? res.logoLight : res.logo;
  if (!img) return;
  const w = h * (img.width / img.height || 4);
  const lx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  if (dark && !res.logoLight) {
    ctx.fillStyle = '#FFFFFF';
    rrect(ctx, lx - h * 0.3, y - h * 0.3, w + h * 0.6, h * 1.6, h * 0.3); ctx.fill();
  }
  ctx.drawImage(img, lx, y, w, h);
}

function pill(ctx, text, x, y, size, bg, fg, alpha) {
  if (!text) return 0;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = `700 ${size}px ${fontStack()}`;
  const w = ctx.measureText(text).width + size * 1.8, h = size * 2.2;
  ctx.fillStyle = bg; rrect(ctx, x, y, w, h, h / 2); ctx.fill();
  ctx.fillStyle = fg; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillText(text, x + size * 0.9, y + h / 2 + size * 0.05);
  ctx.restore();
  return h;
}

const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

// anim: {a: headline 0..1, b: secondary 0..1, zoom}
export function draw(ctx, w, h, spec, res, anim = { a: 1, b: 1, zoom: 1 }) {
  const b = S.data.brand, c = b.colors;
  const u = Math.min(w, h), m = u * 0.075, wide = w / h > 1.3;
  const a = ease(anim.a), bb = ease(anim.b), rise = (p) => (1 - p) * u * 0.035;
  const logoH = u * (wide ? 0.07 : 0.055);
  const showLogo = spec.logo !== false;
  let tpl = spec.template || 'bold';
  if (tpl === 'photo' && !res.photo) tpl = 'bold';
  ctx.clearRect(0, 0, w, h);

  if (tpl === 'bold') {
    ctx.fillStyle = c.primary; ctx.fillRect(0, 0, w, h);
    const fg = onColor(c.primary);
    bubble(ctx, w - u * 0.5, -u * 0.1, u * 0.68, c.accent, 0.95);
    if (res.photo) {
      ctx.save(); rrect(ctx, w - u * 0.44, u * 0.02, u * 0.56, u * 0.36, u * 0.05); ctx.clip();
      cover(ctx, res.photo, w - u * 0.44, u * 0.02, u * 0.56, u * 0.36, anim.zoom); ctx.restore();
    }
    const top = wide ? h * 0.3 : h * 0.44, bottom = h - m - (showLogo ? logoH * 2.2 : 0);
    const maxW = w - m * 2 - (wide ? u * 0.5 : 0);
    const hf = fit(ctx, spec.headline, maxW, (bottom - top) * 0.6, u * 0.115, 800);
    const sf = fit(ctx, spec.subline, maxW, (bottom - top) * 0.25, u * 0.042, 400, 1.3);
    let y = wide ? Math.max(m, (h - hf.height - sf.height - m) / 2 - m * 0.5) : top;
    ctx.fillStyle = c.accent; ctx.globalAlpha = a; ctx.fillRect(m, y - u * 0.04, u * 0.11 * a, u * 0.012); ctx.globalAlpha = 1;
    paint(ctx, hf, m, y + rise(a), fg, a); y += hf.height + u * 0.025;
    paint(ctx, sf, m, y + rise(bb), fg, bb * 0.85); y += sf.height + u * 0.035;
    pill(ctx, spec.cta, m, y, u * 0.03, c.accent, onColor(c.accent), bb);
    if (showLogo) drawLogo(ctx, res, m, h - m - logoH, logoH, luminance(c.primary) < 0.6);
  } else if (tpl === 'photo') {
    cover(ctx, res.photo, 0, 0, w, h, anim.zoom);
    const g = ctx.createLinearGradient(0, h * 0.25, 0, h);
    g.addColorStop(0, c.primary + '00'); g.addColorStop(0.6, c.primary + 'CC'); g.addColorStop(1, c.primary + 'F2');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const fg = onColor(c.primary), maxW = w - m * 2;
    const hf = fit(ctx, spec.headline, maxW, h * 0.3, u * 0.105, 800);
    const sf = fit(ctx, spec.subline, maxW, h * 0.14, u * 0.04, 400, 1.3);
    const ctaH = spec.cta ? u * 0.066 + u * 0.03 : 0;
    let y = h - m - hf.height - sf.height - ctaH - u * 0.03 - (h / w > 1.6 ? h * 0.08 : 0);
    ctx.fillStyle = c.accent; ctx.globalAlpha = a; ctx.fillRect(m, y - u * 0.04, u * 0.11 * a, u * 0.012); ctx.globalAlpha = 1;
    paint(ctx, hf, m, y + rise(a), fg, a); y += hf.height + u * 0.02;
    paint(ctx, sf, m, y + rise(bb), fg, bb * 0.9); y += sf.height + u * 0.03;
    pill(ctx, spec.cta, m, y, u * 0.03, c.accent, onColor(c.accent), bb);
    if (showLogo) drawLogo(ctx, res, m, m, logoH, true);
  } else if (tpl === 'split') {
    ctx.fillStyle = c.light; ctx.fillRect(0, 0, w, h);
    const px = wide ? w * 0.48 : 0, pw = wide ? w * 0.52 : w, ph = wide ? h : h * 0.5;
    if (res.photo) cover(ctx, res.photo, px, 0, pw, ph, anim.zoom);
    else { ctx.fillStyle = c.primary; ctx.fillRect(px, 0, pw, ph); bubble(ctx, px + pw / 2 - u * 0.16, ph / 2 - u * 0.14, u * 0.32, c.accent, 1); }
    ctx.fillStyle = c.accent; ctx.fillRect(wide ? px - u * 0.012 : 0, wide ? 0 : ph, wide ? u * 0.012 : w, wide ? h : u * 0.012);
    const tx = m, ty = wide ? m * 1.2 : ph + m, tw = (wide ? px : w) - m * 2;
    const avail = h - ty - m - (showLogo ? logoH * 2 : 0);
    const hf = fit(ctx, spec.headline, tw, avail * 0.62, u * 0.095, 800);
    const sf = fit(ctx, spec.subline, tw, avail * 0.3, u * 0.038, 400, 1.3);
    paint(ctx, hf, tx, ty + rise(a), c.text, a);
    paint(ctx, sf, tx, ty + hf.height + u * 0.025 + rise(bb), c.text, bb * 0.8);
    if (showLogo) drawLogo(ctx, res, tx, h - m - logoH, logoH, luminance(c.light) < 0.4);
  } else if (tpl === 'quote') {
    ctx.fillStyle = c.light; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = c.primary; ctx.lineWidth = u * 0.012; ctx.strokeRect(m * 0.5, m * 0.5, w - m, h - m);
    bubble(ctx, m * 1.3, m * 1.3, u * 0.16, c.accent, a);
    const top = m * 1.3 + u * 0.24, avail = h - top - m * 1.5 - (showLogo ? logoH * 2 : 0);
    const hf = fit(ctx, spec.headline, w - m * 2.8, avail * 0.75, u * 0.085, 700, 1.2);
    const sf = fit(ctx, spec.subline, w - m * 2.8, avail * 0.2, u * 0.036, 500, 1.3);
    paint(ctx, hf, m * 1.4, top + rise(a), c.text, a);
    paint(ctx, sf, m * 1.4, top + hf.height + u * 0.03 + rise(bb), c.primary, bb * 0.75);
    if (showLogo) drawLogo(ctx, res, w - m * 1.4, h - m * 1.4 - logoH, logoH, luminance(c.light) < 0.4, 'right');
  } else {
    ctx.fillStyle = c.accent; ctx.fillRect(0, 0, w, h);
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 46; i++) {
      const x = rnd() * w, y = rnd() * h, r = u * (0.008 + rnd() * 0.022);
      ctx.globalAlpha = 0.35 + rnd() * 0.55;
      ctx.fillStyle = i % 3 ? '#FFFFFF' : c.primary;
      ctx.beginPath(); ctx.arc(x, y + Math.sin(anim.zoom * 40 + i) * u * 0.006, r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const cw = w - m * 2.4, chh = Math.min(h - m * 2.4, wide ? h * 0.8 : cw * 0.95), cx = (w - cw) / 2, cy = (h - chh) / 2;
    ctx.fillStyle = '#FFFFFF'; rrect(ctx, cx, cy, cw, chh, u * 0.04); ctx.fill();
    const inner = cw - m * 1.6, avail = chh - m * 1.6 - (showLogo ? logoH * 2.2 : 0);
    const hf = fit(ctx, spec.headline, inner, avail * 0.65, u * 0.1, 800);
    const sf = fit(ctx, spec.subline, inner, avail * 0.28, u * 0.04, 400, 1.3);
    const ty = cy + m * 0.8 + (avail - hf.height - sf.height - u * 0.03) / 2;
    paint(ctx, hf, w / 2, ty + rise(a), c.primary, a, 'center');
    paint(ctx, sf, w / 2, ty + hf.height + u * 0.03 + rise(bb), c.text, bb * 0.8, 'center');
    if (showLogo) drawLogo(ctx, res, w / 2, cy + chh - m * 0.8 - logoH, logoH, false, 'center');
  }
}

export async function renderToBlob(spec) {
  const f = FORMATS[spec.format || 'square'];
  const cv = document.createElement('canvas');
  cv.width = f.w; cv.height = f.h;
  draw(cv.getContext('2d'), f.w, f.h, spec, await prepare(spec));
  return new Promise((res) => cv.toBlob(res, 'image/png'));
}

export async function renderDesignToAsset(spec, name) {
  const blob = await renderToBlob(spec);
  const file = new File([blob], (name || spec.headline || 'design').slice(0, 50) + '.png', { type: 'image/png' });
  return uploadFile(file, 'design');
}

// ------------------------------------------------------------------- Reels
const REEL = { w: 1080, h: 1920, fps: 30, fade: 0.35 };

function endCard(ctx, reel, res, t) {
  const b = S.data.brand, c = b.colors, { w, h } = REEL, a = ease(t / 0.6), bb = ease((t - 0.3) / 0.6);
  ctx.fillStyle = c.light; ctx.fillRect(0, 0, w, h);
  bubble(ctx, w * 0.5 - 330 * a, h * 0.2, 660 * a, c.accent, 0.18);
  const logoH = 150;
  ctx.save(); ctx.globalAlpha = a; drawLogo(ctx, res, w / 2, h * 0.4 + (1 - a) * 40, logoH, luminance(c.light) < 0.4, 'center'); ctx.restore();
  const tf = fit(ctx, b.tagline || '', w * 0.75, 200, 54, 400, 1.25);
  paint(ctx, tf, w / 2, h * 0.4 + logoH + 50, c.text, bb * 0.8, 'center');
  if (reel.cta) {
    ctx.save(); ctx.font = `700 46px ${fontStack()}`;
    const pw = ctx.measureText(reel.cta).width + 46 * 1.8; ctx.restore();
    pill(ctx, reel.cta, (w - pw) / 2, h * 0.62, 46, c.primary, onColor(c.primary), bb);
  }
  const site = (b.website || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  paint(ctx, fit(ctx, site, w * 0.8, 80, 40, 600), w / 2, h * 0.62 + 150, c.primary, bb, 'center');
}

async function reelPlan(reel) {
  const scenes = [];
  for (const sc of reel.scenes) {
    const spec = { ...sc, format: 'story', template: sc.template || (sc.photoId ? 'photo' : 'bold') };
    scenes.push({ spec, res: await prepare(spec) });
  }
  const res = await prepare({});
  const per = Number(reel.seconds) || 3, end = 2.5;
  return { scenes, res, per, end, total: scenes.length * per + end };
}

function reelFrame(ctx, reel, plan, t) {
  t = Math.max(0, t);
  const { w, h } = REEL, i = Math.floor(t / plan.per);
  let local;
  if (i < plan.scenes.length) {
    local = t - i * plan.per;
    const s = plan.scenes[i];
    draw(ctx, w, h, s.spec, s.res, { a: local / 0.7, b: (local - 0.35) / 0.7, zoom: 1 + 0.08 * (local / plan.per) });
  } else {
    local = t - plan.scenes.length * plan.per;
    endCard(ctx, reel, plan.res, local);
  }
  if (local < REEL.fade && t > REEL.fade) {
    ctx.fillStyle = S.data.brand.colors.primary;
    ctx.globalAlpha = 1 - local / REEL.fade; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
  }
}

let playing = 0;
export async function playReel(canvas, reel, onDone) {
  const id = ++playing, plan = await reelPlan(reel), ctx = canvas.getContext('2d'), start = performance.now();
  // a timer, not requestAnimationFrame: embedded and background views throttle rAF to a few frames a second
  const iv = setInterval(() => {
    if (id !== playing || !canvas.isConnected) return clearInterval(iv);
    const t = (performance.now() - start) / 1000;
    if (t >= plan.total) { clearInterval(iv); reelFrame(ctx, reel, plan, plan.total - 0.01); if (onDone) onDone(); return; }
    reelFrame(ctx, reel, plan, t);
  }, 1000 / REEL.fps);
}

export async function recordReel(reel, onProgress) {
  if (!window.MediaRecorder) throw new Error('This browser cannot record video. Use a current version of Chrome, Edge or Safari.');
  const mime = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error('This browser cannot record video.');
  const plan = await reelPlan(reel);
  const cv = document.createElement('canvas');
  cv.width = REEL.w; cv.height = REEL.h;
  const ctx = cv.getContext('2d');
  reelFrame(ctx, reel, plan, 0);
  const rec = new MediaRecorder(cv.captureStream(REEL.fps), { mimeType: mime, videoBitsPerSecond: 8000000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((res) => (rec.onstop = res));
  rec.start(500);
  const id = ++playing, start = performance.now();
  await new Promise((res, rej) => {
    const iv = setInterval(() => {
      if (id !== playing) { clearInterval(iv); rec.stop(); return rej(new Error('Rendering was cancelled.')); }
      const t = (performance.now() - start) / 1000;
      if (t >= plan.total) { clearInterval(iv); return res(); }
      reelFrame(ctx, reel, plan, t);
      if (onProgress) onProgress(t / plan.total);
    }, 1000 / REEL.fps);
  });
  rec.stop();
  await done;
  const type = mime.split(';')[0];
  return new File([new Blob(chunks, { type })], (reel.title || 'reel').slice(0, 50) + (type === 'video/mp4' ? '.mp4' : '.webm'), { type });
}

// --------------------------------------------------------------- Studio view
const ui = {
  tab: 'image',
  spec: { format: 'square', template: 'bold', headline: 'Your headline goes here', subline: 'A supporting line that adds one clear idea.', cta: '', photoId: '', logo: true },
  reel: { title: 'New reel', seconds: 3, cta: 'Learn more', caption: '', scenes: [
    { headline: 'Open with a hook', subline: 'One short supporting line', photoId: '' },
    { headline: 'Make your point', subline: 'Keep each scene to one idea', photoId: '' },
    { headline: 'Close with the benefit', subline: '', photoId: '' }] },
  topic: '',
};
export function studioPreset(p) { if (p.spec) Object.assign(ui.spec, p.spec); if (p.tab) ui.tab = p.tab; if (p.topic) ui.topic = p.topic; }

function photoControl(id, key) {
  const a = asset(id);
  return `<div class="photo-pick">${a ? thumb(a) : '<div class="ph">No photo</div>'}
    <div><button class="btn sm" data-pick="${key}">${a ? 'Change' : 'Choose photo'}</button>
    ${a ? `<button class="btn sm ghost" data-clear="${key}">Remove</button>` : ''}</div></div>`;
}

export function renderStudio(root) {
  const ai = S.data.ai.enabled;
  root.innerHTML = `<header class="page-head"><div><h1>Studio</h1><p>Create on-brand visuals and reels from your brand kit.</p></div>
    <div class="tabs"><button class="${ui.tab === 'image' ? 'on' : ''}" data-tab="image">Image</button>
    <button class="${ui.tab === 'reel' ? 'on' : ''}" data-tab="reel">Reel</button></div></header>
    <div class="studio"><div class="panel controls" id="controls"></div>
    <div class="stage"><div class="canvas-wrap"><canvas id="cv"></canvas></div><div class="stage-actions" id="actions"></div></div></div>`;
  $$('[data-tab]', root).forEach((b) => (b.onclick = () => { ui.tab = b.dataset.tab; renderStudio(root); }));
  const cv = $('#cv', root), controls = $('#controls', root), actions = $('#actions', root);

  const aiBox = (label) => `<div class="ai-box"><label>${label}</label><div class="row">
      <input id="topic" placeholder="e.g. our new workshop, a client tip, hiring…" value="${esc(ui.topic)}">
      <button class="btn accent" id="gen">✦ Write it</button></div>
      <small class="muted">${ai ? 'Written by Claude from your brand kit and website.' : 'Drafted from your website text. Add an AI key in Settings for original copy.'}</small></div>`;

  if (ui.tab === 'image') {
    const s = ui.spec;
    const paintNow = async () => {
      const f = FORMATS[s.format];
      cv.width = f.w; cv.height = f.h;
      draw(cv.getContext('2d'), f.w, f.h, s, await prepare(s));
    };
    controls.innerHTML = `${aiBox('What is this visual about?')}
      <label>Format</label><select id="format">${Object.entries(FORMATS).map(([k, f]) => `<option value="${k}" ${k === s.format ? 'selected' : ''}>${f.label}</option>`).join('')}</select>
      <label>Layout</label><div class="seg" id="tpl">${Object.entries(TEMPLATES).map(([k, n]) => `<button class="${k === s.template ? 'on' : ''}" data-t="${k}">${n}</button>`).join('')}</div>
      <label>Headline</label><textarea id="headline" rows="2">${esc(s.headline)}</textarea>
      <label>Supporting line</label><textarea id="subline" rows="2">${esc(s.subline)}</textarea>
      <label>Button text <span class="muted">(optional)</span></label><input id="cta" value="${esc(s.cta)}">
      <label>Photo</label>${photoControl(s.photoId, 'photo')}
      <label class="check"><input type="checkbox" id="logo" ${s.logo !== false ? 'checked' : ''}> Show logo</label>`;
    actions.innerHTML = `<button class="btn primary" id="use">Use in a post</button><button class="btn" id="save">Save to library</button><button class="btn ghost" id="dl">Download PNG</button>`;
    ['headline', 'subline', 'cta'].forEach((k) => ($('#' + k, root).oninput = (e) => { s[k] = e.target.value; paintNow(); }));
    $('#format', root).onchange = (e) => { s.format = e.target.value; paintNow(); };
    $('#logo', root).onchange = (e) => { s.logo = e.target.checked; paintNow(); };
    $$('#tpl button', root).forEach((b) => (b.onclick = () => { s.template = b.dataset.t; renderStudio(root); }));
    const pk = $('[data-pick]', root), cl = $('[data-clear]', root);
    pk.onclick = async () => { const a = await pickAsset((x) => x.mime.startsWith('image') && x.kind === 'photo', 'Choose a photo'); if (a) { s.photoId = a.id; if (s.template === 'bold' || s.template === 'quote' || s.template === 'festive') s.template = 'photo'; renderStudio(root); } };
    if (cl) cl.onclick = () => { s.photoId = ''; renderStudio(root); };
    $('#gen', root).onclick = (e) => guard(async () => {
      ui.topic = $('#topic', root).value;
      const r = await api('POST', 'generate', { type: 'post', topic: ui.topic, channels: ['instagram'] });
      Object.assign(s, { headline: r.headline || s.headline, subline: r.subline || '', cta: r.cta || '' });
      ui.lastCaptions = r.captions;
      renderStudio(root);
    }, e.currentTarget);
    $('#save', root).onclick = (e) => guard(async () => { await renderDesignToAsset(s); toast('Saved to your library.'); }, e.currentTarget);
    $('#use', root).onclick = (e) => guard(async () => { const a = await renderDesignToAsset(s); openComposer({ mediaId: a.id, topic: ui.topic }); }, e.currentTarget);
    $('#dl', root).onclick = async () => {
      const url = URL.createObjectURL(await renderToBlob(s));
      const a = Object.assign(document.createElement('a'), { href: url, download: (s.headline || 'design').slice(0, 40) + '.png' });
      a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    };
    paintNow();
    return;
  }

  // reel tab
  const r = ui.reel;
  cv.width = REEL.w; cv.height = REEL.h;
  const preview = () => playReel(cv, r);
  controls.innerHTML = `${aiBox('What is this reel about?')}
    <label>Title</label><input id="rtitle" value="${esc(r.title)}">
    <div class="row"><div class="grow"><label>Seconds per scene</label><select id="rsec">${[2, 3, 4, 5].map((n) => `<option ${n === +r.seconds ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    <div class="grow"><label>End card button</label><input id="rcta" value="${esc(r.cta)}"></div></div>
    <label>Scenes</label><div id="scenes">${r.scenes.map((sc, i) => `<div class="scene" data-i="${i}">
      <div class="scene-head"><b>Scene ${i + 1}</b><button class="x" data-del="${i}" title="Remove scene">×</button></div>
      <input data-k="headline" placeholder="Headline" value="${esc(sc.headline)}">
      <input data-k="subline" placeholder="Supporting line" value="${esc(sc.subline)}">
      ${photoControl(sc.photoId, i)}</div>`).join('')}</div>
    <button class="btn sm" id="addscene">+ Add scene</button>`;
  actions.innerHTML = `<button class="btn" id="play">▶ Preview</button><button class="btn primary" id="render">Render video</button>
    <div class="progress hidden" id="prog"><i></i></div>`;
  $('#rtitle', root).oninput = (e) => (r.title = e.target.value);
  $('#rcta', root).oninput = (e) => (r.cta = e.target.value);
  $('#rsec', root).onchange = (e) => (r.seconds = +e.target.value);
  $$('.scene', root).forEach((el) => {
    const sc = r.scenes[+el.dataset.i];
    $$('input', el).forEach((inp) => (inp.oninput = () => (sc[inp.dataset.k] = inp.value)));
  });
  $$('[data-del]', root).forEach((b) => (b.onclick = () => { if (r.scenes.length > 1) { r.scenes.splice(+b.dataset.del, 1); renderStudio(root); } }));
  $$('[data-pick]', root).forEach((b) => (b.onclick = async () => { const a = await pickAsset((x) => x.mime.startsWith('image') && x.kind === 'photo', 'Choose a photo'); if (a) { r.scenes[+b.dataset.pick].photoId = a.id; renderStudio(root); } }));
  $$('[data-clear]', root).forEach((b) => (b.onclick = () => { r.scenes[+b.dataset.clear].photoId = ''; renderStudio(root); }));
  $('#addscene', root).onclick = () => { if (r.scenes.length < 10) { r.scenes.push({ headline: '', subline: '', photoId: '' }); renderStudio(root); } };
  $('#play', root).onclick = preview;
  $('#gen', root).onclick = (e) => guard(async () => {
    ui.topic = $('#topic', root).value;
    const g = await api('POST', 'generate', { type: 'reel', topic: ui.topic, scenes: Math.max(3, r.scenes.length) });
    const pool = photos();
    r.title = g.title || r.title; r.cta = g.cta || r.cta; r.caption = g.caption || '';
    r.scenes = (g.scenes || []).slice(0, 10).map((sc, i) => ({ headline: sc.headline || '', subline: sc.subline || '', photoId: pool.length ? pool[i % pool.length].id : '' }));
    if (!r.scenes.length) throw new Error('No scenes came back. Scan your website in Brand kit first, or type a topic.');
    renderStudio(root);
  }, e.currentTarget);
  $('#render', root).onclick = (e) => guard(async () => {
    const bar = $('#prog', root); bar.classList.remove('hidden');
    toast('Rendering in real time — keep this tab in front until it finishes.', 'ok', 6000);
    const file = await recordReel(r, (p) => (bar.firstElementChild.style.width = Math.round(p * 100) + '%'));
    const a = await uploadFile(file, 'reel');
    toast(file.type === 'video/mp4' ? 'Reel saved to your library.' : 'Reel saved as WebM (this browser cannot record MP4). YouTube accepts it; use Chrome or Safari for MP4.', 'ok', 7000);
    openComposer({ mediaId: a.id, caption: r.caption, title: r.title, channels: ['instagram', 'facebook', 'youtube'] });
  }, e.currentTarget);
  reelPlan(r).then((plan) => reelFrame(cv.getContext('2d'), r, plan, Math.min(1.5, plan.total - 0.1)));
}
