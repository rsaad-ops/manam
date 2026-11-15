import { S, $, $$, api, onState, toast, esc, guard, modal, setBrand, brandHeaders, isDark } from './core.js';
import { renderDashboard, renderCalendar, renderPosts, renderLibrary, renderBrand, renderChannels, renderSettings } from './views.js';
import { renderStudio } from './studio.js';
import { renderSources } from './sources.js';
import { scheduleSync } from './suggest.js';

const ROUTES = {
  dashboard: renderDashboard, calendar: renderCalendar, posts: renderPosts, studio: renderStudio,
  library: renderLibrary, brand: renderBrand, sources: renderSources, channels: renderChannels, settings: renderSettings,
};

// ---- client brands: everything shown belongs to the brand selected here
function openNewBrand() {
  const md = modal(`<div class="mhead"><h2>New client brand</h2><button class="x" data-close>×</button></div>
    <div class="mbody"><p class="muted">Each brand has its own brand kit, library, calendar, key dates, data sources and social channels. Nothing is shared between brands.</p>
      <label for="nbname">Brand name</label><input id="nbname" placeholder="e.g. Maple Leaf Dental" maxlength="60">
      <label for="nbsite">Website <span class="muted">(optional — read for colours, logo, photos and text)</span></label><input id="nbsite" placeholder="https://www.client.ca"></div>
    <div class="mfoot"><span class="grow"></span><button class="btn" data-close>Cancel</button><button class="btn primary" id="nbgo">Create brand</button></div>`, 'small');
  $('#nbname', md.el).focus();
  $('#nbgo', md.el).onclick = (e) => guard(async () => {
    const name = $('#nbname', md.el).value.trim(), site = $('#nbsite', md.el).value.trim();
    if (!name) throw new Error('Give the brand a name.');
    await api('POST', 'brands', { name }, { quiet: true });
    if (site) {
      try {
        const j = await api('POST', 'scan', { url: site }, { quiet: true }), found = (j.brand.site || {}).colors || [];
        if (found.length) await api('PUT', 'brand', { colors: { ...j.brand.colors, primary: found[0], accent: found[1] || j.brand.colors.accent, ...(isDark(found[0]) ? { text: found[0] } : {}) } }, { quiet: true });
      } catch (x) { if (x.login) throw x; toast('Brand created, but the website could not be read: ' + x.message, 'err'); await new Promise((r) => setTimeout(r, 2500)); }
    }
    location.hash = '#/brand'; location.reload();
  }, e.currentTarget);
}

function drawBrandSwitch() {
  const box = $('#brandsw'), list = S.data.brands || [];
  const sig = JSON.stringify([list, S.data.brandId]);
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  const cur = list.find((b) => b.id === S.data.brandId) || { color: '#EEB21E' };
  box.innerHTML = `<label for="brandsel">Client brand</label><div class="bs-row"><i style="background:${esc(cur.accent || cur.color)}"></i>
    <select id="brandsel">${list.map((b) => `<option value="${esc(b.id)}" ${b.id === S.data.brandId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}
    <option value="+">＋ New client brand…</option></select></div>`;
  $('#brandsel', box).onchange = (e) => {
    if (e.target.value === '+') { e.target.value = S.data.brandId; return openNewBrand(); }
    setBrand(e.target.value); location.reload();
  };
}

function current() {
  const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
  return { name: ROUTES[path] ? path : 'dashboard', params: Object.fromEntries(new URLSearchParams(query || '')) };
}

function render() {
  if (!S.data) return;
  const { name, params } = current();
  $$('nav a').forEach((a) => a.classList.toggle('on', a.dataset.route === name));
  const n = S.data.posts.filter((p) => ['failed', 'missed', 'partial'].includes(p.status)).length;
  $('#badge').textContent = n || '';
  drawBrandSwitch();
  const foot = $('#sidefoot');
  if (S.data.hosted && !foot.dataset.hosted) {
    foot.dataset.hosted = '1';
    foot.innerHTML = 'Hosted online.<br>Scheduled posts publish by themselves.<br><button id="signout">Sign out</button>';
    $('#signout').onclick = async () => { await fetch('/api/logout', { method: 'POST' }); location.reload(); };
  }
  const main = $('#view'), y = main.scrollTop;
  ROUTES[name](main, params);
  main.scrollTop = y;
}

let lastRoute = '';
window.addEventListener('hashchange', () => { render(); if (current().name !== lastRoute) $('#view').scrollTop = 0; lastRoute = current().name; });
onState(render);
onState(scheduleSync);

// pick up what the scheduler did in the background, without disturbing typing
setInterval(async () => {
  if (document.hidden || document.querySelector('.overlay')) return;
  try {
    const before = JSON.stringify(S.data.posts.map((p) => [p.id, p.status]));
    const j = await (await fetch('/api/state', { headers: brandHeaders() })).json();
    if (JSON.stringify(j.posts.map((p) => [p.id, p.status])) !== before) {
      const active = document.activeElement;
      if (active && /INPUT|TEXTAREA|SELECT/.test(active.tagName)) return;
      S.data = j; render();
    }
  } catch (e) { /* server stopped; the next action will report it */ }
}, 20000);

api('GET', 'state').catch((e) => { if (!e.login) toast(e.message, 'err'); });
