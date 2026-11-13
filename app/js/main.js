import { S, $, $$, api, onState, toast } from './core.js';
import { renderDashboard, renderCalendar, renderPosts, renderLibrary, renderBrand, renderChannels, renderSettings } from './views.js';
import { renderStudio } from './studio.js';

const ROUTES = {
  dashboard: renderDashboard, calendar: renderCalendar, posts: renderPosts, studio: renderStudio,
  library: renderLibrary, brand: renderBrand, channels: renderChannels, settings: renderSettings,
};

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

// pick up what the scheduler did in the background, without disturbing typing
setInterval(async () => {
  if (document.hidden || document.querySelector('.overlay')) return;
  try {
    const before = JSON.stringify(S.data.posts.map((p) => [p.id, p.status]));
    const j = await (await fetch('/api/state')).json();
    if (JSON.stringify(j.posts.map((p) => [p.id, p.status])) !== before) {
      const active = document.activeElement;
      if (active && /INPUT|TEXTAREA|SELECT/.test(active.tagName)) return;
      S.data = j; render();
    }
  } catch (e) { /* server stopped; the next action will report it */ }
}, 20000);

api('GET', 'state').catch((e) => { if (!e.login) toast(e.message, 'err'); });
