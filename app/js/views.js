// Dashboard, Calendar, Posts, Library, Brand kit, Channels, Settings.
import { S, $, $$, api, esc, toast, guard, modal, confirmBox, asset, isVideo, isImage, uploadFile, thumb, photos,
  CH, CH_KEYS, chBadge, STATUS, ymd, pad, toUtc, fromUtc, niceDate, postDay, go, isDefaultBrand, isDark } from './core.js';
import { holidays, holidayMap, upcomingHolidays } from './holidays.js';
import { openComposer } from './composer.js';
import { cat, catMap, kdSettings, saveKd, keyDateMap, openKeyDates, postFromKeyDate, openInternal } from './keydates.js';
import { renderDesignToAsset, fontList, studioPreset, MOTIFS } from './studio.js';
import { suggestions, suggestionRow, bindSuggestions, openSuggestion, approveMany } from './suggest.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const regions = () => S.data.settings.holidayRegions;
const firstLine = (p) => (p.caption || Object.values(p.captions || {})[0] || p.topic || 'Untitled post').split('\n')[0];

function postRow(p) {
  const a = asset((p.mediaIds || [])[0]);
  return `<button class="post-row" ${p.suggested ? 'data-sg' : 'data-post'}="${p.id}"><span class="pr-thumb">${a ? thumb(a) : ''}</span>
    <span class="pr-main"><b>${esc(firstLine(p).slice(0, 90))}</b><small>${p.scheduledAt ? esc(niceDate(fromUtc(p.scheduledAt), true)) : 'No date'}</small></span>
    <span class="pr-ch">${p.channels.map((k) => chBadge(k, true)).join('')}</span><span class="status ${p.suggested ? 'suggested' : p.status}">${p.suggested ? 'Suggested' : STATUS[p.status] || p.status}</span></button>`;
}
function bindPosts(root) {
  $$('[data-post]', root).forEach((b) => (b.onclick = () => openComposer({ post: S.data.posts.find((p) => p.id === b.dataset.post) })));
  $$('[data-sg]', root).forEach((b) => (b.onclick = () => openSuggestion(S.data.posts.find((p) => p.id === b.dataset.sg))));
}

// ---------------------------------------------------------------- Dashboard
export function renderDashboard(root) {
  const d = S.data, now = new Date(), posts = d.posts;
  const upcoming = posts.filter((p) => p.status === 'scheduled').sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const drafts = posts.filter((p) => p.status === 'draft' && !p.suggested), sugg = suggestions();
  const month = ymd(now).slice(0, 7);
  const published = posts.filter((p) => ['published', 'partial'].includes(p.status) && (p.publishedAt || '').startsWith(month));
  const trouble = posts.filter((p) => ['failed', 'missed', 'partial'].includes(p.status));
  const connected = CH_KEYS.filter((k) => d.channels[k].connected);
  const steps = [
    { done: !!(d.brand.site), label: 'Add your website as the content source', to: 'brand' },
    { done: !!(d.brand.voice || d.brand.guidelinesText || d.assets.some((a) => a.kind === 'guideline')), label: 'Add brand guidelines and voice', to: 'brand' },
    { done: photos().length > 0, label: 'Upload brand photos', to: 'library' },
    { done: connected.length > 0, label: 'Connect your social channels', to: 'channels' },
    { done: (d.settings.sources || []).length > 0, label: 'Add your industry lists: trade shows, publications, associations (optional)', to: 'sources' },
    { done: d.ai.enabled, label: 'Add an AI key for original copy (optional)', to: 'settings' },
  ];
  const todo = steps.filter((s) => !s.done);
  root.innerHTML = `<header class="page-head"><div><h1>Good ${now.getHours() < 12 ? 'morning' : now.getHours() < 18 ? 'afternoon' : 'evening'}</h1>
      <p>${esc(d.brand.name || 'Your brand')} · ${esc(niceDate(now))} · ${connected.length} of 4 channels connected</p></div>
      <button class="btn primary" id="new">+ New post</button></header>
    ${todo.length ? `<section class="panel setup"><h3>Finish setting up <span class="muted">${steps.length - todo.length} of ${steps.length} done</span></h3>
      <div class="steps">${steps.map((s) => `<button class="step ${s.done ? 'done' : ''}" data-go="${s.to}"><i>${s.done ? '✓' : ''}</i>${s.label}</button>`).join('')}</div></section>` : ''}
    ${sugg.length ? `<section class="panel sg-banner"><div class="grow"><b>✦ ${sugg.length} suggested post${sugg.length > 1 ? 's' : ''} for your coming key dates</b>
      <small class="muted">Written and laid out for each date. Nothing is scheduled until you approve it.</small></div><button class="btn accent" data-go="posts?f=suggested">Review suggestions</button></section>` : ''}
    <section class="stats"><div class="stat"><b>${upcoming.length}</b><span>Scheduled</span></div><div class="stat"><b>${drafts.length}</b><span>Drafts to review</span></div>
      <div class="stat"><b>${published.length}</b><span>Published this month</span></div><div class="stat ${trouble.length ? 'warn' : ''}"><b>${trouble.length}</b><span>Need attention</span></div></section>
    <div class="cols"><section class="panel"><h3>Up next</h3>${upcoming.length ? upcoming.slice(0, 6).map(postRow).join('')
      : '<p class="muted">Nothing scheduled. Plan the month from the Calendar, or write a post.</p>'}
      ${trouble.length ? `<h3 class="mt">Need attention</h3>${trouble.slice(0, 4).map(postRow).join('')}` : ''}</section>
    <section class="panel"><h3>Upcoming Canadian holidays</h3>${upcomingHolidays(regions(), 6).map((h) => {
      const has = posts.some((p) => postDay(p) === h.date);
      const dt = new Date(h.date + 'T12:00');
      return `<div class="hol-row"><div class="hol-date"><b>${dt.getDate()}</b><span>${MONTHS[dt.getMonth()].slice(0, 3)}</span></div>
        <div class="grow"><b>${esc(h.name)}</b><small>${esc(h.fr)}${h.note ? ' · ' + esc(h.note) : ''}</small></div>
        ${has ? '<span class="status scheduled">Planned</span>' : `<button class="btn sm" data-hol="${h.date}">Create post</button>`}</div>`;
    }).join('')}</section></div>`;
  $('#new', root).onclick = () => openComposer();
  $$('[data-go]', root).forEach((b) => (b.onclick = () => go(b.dataset.go)));
  $$('[data-hol]', root).forEach((b) => (b.onclick = () => {
    const h = upcomingHolidays(regions(), 12).find((x) => x.date === b.dataset.hol);
    openComposer({ date: h.date, holiday: h });
  }));
  bindPosts(root);
}

// ----------------------------------------------------------------- Calendar
const cal = { y: new Date().getFullYear(), m: new Date().getMonth() };

export function renderCalendar(root) {
  const { y, m } = cal, today = ymd(new Date());
  const start = new Date(y, m, 1);
  start.setDate(1 - start.getDay());
  const end = new Date(start); end.setDate(start.getDate() + 41);
  const kmap = keyDateMap(ymd(start), ymd(end)), kcats = kdSettings().cats, kd = {}, cmap = catMap(), nsg = suggestions().length;
  const byDay = {};
  S.data.posts.forEach((p) => { const k = postDay(p); if (k) (byDay[k] = byDay[k] || []).push(p); });
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const dt = new Date(start); dt.setDate(start.getDate() + i);
    const k = ymd(dt), out = dt.getMonth() !== m;
    if (i === 35 && out) break;
    const hs = kmap[k] || [], ps = (byDay[k] || []).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    cells += `<div class="day ${out ? 'out' : ''} ${k === today ? 'today' : ''} ${k < today ? 'past' : ''}" data-day="${k}">
      <div class="day-num"><span>${dt.getDate()}</span><button class="add" data-add="${k}" title="New post">+</button></div>
      ${hs.map((h) => { kd[h.key] = h; return h.cat === 'canada'
        ? `<button class="hol ${h.solemn ? 'solemn' : ''}" data-kd="${esc(h.key)}" title="${esc(h.where || h.name)}">🍁 ${esc(h.name)}</button>`
        : `<button class="hol kd ${h.approx ? 'approx' : ''} ${h.internal ? 'int' : ''}" style="--c:${cat(h.cat).color}" data-kd="${esc(h.key)}" title="${esc(cat(h.cat).label + (h.internal ? ' — internal, not a post' : '') + (h.approx ? ' — estimated date, confirm before posting' : '') + ': ' + h.msg)}">${h.internal ? '🔒 ' : ''}${h.approx ? '≈ ' : ''}${esc(h.name)}</button>`; }).join('')}
      ${ps.map((p) => p.suggested ? `<button class="pill suggested" data-sg="${p.id}" style="--c:${cat(p.kdCat).color}" title="Suggested post — click to review, approve or dismiss">
        <span class="t">✦</span><span class="cap">${esc(firstLine(p).slice(0, 40))}</span></button>` : `<button class="pill ${p.status}" draggable="${['draft', 'scheduled', 'missed', 'failed'].includes(p.status)}" data-post="${p.id}">
        <span class="t">${fromUtc(p.scheduledAt).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' }).replace(/\.| /g, '').toLowerCase()}</span>
        <span class="cap">${esc(firstLine(p).slice(0, 40))}</span><span class="dots">${p.channels.map((c) => `<i style="background:${CH[c].color}"></i>`).join('')}</span></button>`).join('')}</div>`;
  }
  root.innerHTML = `<header class="page-head"><div class="cal-nav"><h1>${MONTHS[m]} ${y}</h1>
      <button class="btn sm" id="prev" aria-label="Previous month">‹</button><button class="btn sm" id="today">Today</button><button class="btn sm" id="next" aria-label="Next month">›</button></div>
      <div class="row wrap">${nsg ? `<button class="btn" id="sgopen">✦ ${nsg} suggestion${nsg > 1 ? 's' : ''}</button>` : ''}<button class="btn" id="kdates">★ Key dates</button><button class="btn accent" id="plan">✦ Plan this month</button><button class="btn primary" id="new">+ New post</button></div></header>
    <div class="legend kd-legend">${Object.keys(cmap).map((c) => `<button class="lg-chip ${kcats[c] ? 'on' : ''}" data-lcat="${esc(c)}" aria-pressed="${!!kcats[c]}" style="--c:${cmap[c].color}" title="${kcats[c] ? 'Hide' : 'Show'} ${esc(cmap[c].label)}"><i></i>${esc(cmap[c].label)}</button>`).join('')}</div>
    <div class="legend"><span><i class="lg sugg"></i>Suggested</span><span><i class="lg draft"></i>Draft</span><span><i class="lg scheduled"></i>Scheduled</span>
      <span><i class="lg published"></i>Published</span><span><i class="lg failed"></i>Needs attention</span><span class="muted">Drag a post to another day to reschedule.</span></div>
    <div class="cal"><div class="dow">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => `<span>${d}</span>`).join('')}</div><div class="grid">${cells}</div></div>`;
  const move = (n) => { const d = new Date(cal.y, cal.m + n, 1); cal.y = d.getFullYear(); cal.m = d.getMonth(); renderCalendar(root); };
  $('#prev', root).onclick = () => move(-1);
  $('#next', root).onclick = () => move(1);
  $('#today', root).onclick = () => { const d = new Date(); cal.y = d.getFullYear(); cal.m = d.getMonth(); renderCalendar(root); };
  $('#new', root).onclick = () => openComposer();
  $('#plan', root).onclick = () => planMonth();
  $$('[data-add]', root).forEach((b) => (b.onclick = () => openComposer({ date: b.dataset.add })));
  $('#kdates', root).onclick = () => openKeyDates(new Date(y, m, 1));
  if (nsg) $('#sgopen', root).onclick = () => go('posts?f=suggested');
  // Each type of date can be shown or hidden straight from the legend.
  $$('[data-lcat]', root).forEach((b) => (b.onclick = () => guard(() => { const k = kdSettings(); return saveKd({ cats: { ...k.cats, [b.dataset.lcat]: !k.cats[b.dataset.lcat] } }); })));
  $$('[data-kd]', root).forEach((b) => (b.onclick = () => {
    const it = kd[b.dataset.kd];
    if (it.internal) return openInternal(it);
    const made = S.data.posts.find((p) => p.suggested && postDay(p) === it.date && String(p.keyDate || '').startsWith(it.key + ':'));
    if (made) return openSuggestion(made);
    if (it.cat === 'canada') return openComposer({ date: it.date, holiday: it });
    guard(() => postFromKeyDate(it), b);
  }));
  bindPosts(root);
  $$('.pill[draggable=true]', root).forEach((p) => (p.ondragstart = (e) => e.dataTransfer.setData('text/plain', p.dataset.post)));
  $$('.day', root).forEach((day) => {
    day.ondragover = (e) => { e.preventDefault(); day.classList.add('drop'); };
    day.ondragleave = () => day.classList.remove('drop');
    day.ondrop = (e) => {
      e.preventDefault(); day.classList.remove('drop');
      const p = S.data.posts.find((x) => x.id === e.dataTransfer.getData('text/plain'));
      if (!p || postDay(p) === day.dataset.day) return;
      const t = fromUtc(p.scheduledAt), time = `${pad(t.getHours())}:${pad(t.getMinutes())}`;
      if (p.status === 'scheduled' && new Date(`${day.dataset.day}T${time}`) < new Date()) return toast('A scheduled post cannot be moved into the past.', 'err');
      guard(() => api('PUT', 'posts/' + p.id, { scheduledAt: toUtc(day.dataset.day, time) }));
    };
  });
}

const THEMES = ['Service or expertise highlight', 'Practical tip or insight', 'Behind the scenes / team', 'Proof of value for clients', 'Question to start a conversation'];

function planMonth() {
  const { y, m } = cal, connected = CH_KEYS.filter((k) => S.data.channels[k].connected && k !== 'youtube');
  const chans = connected.length ? connected : ['facebook', 'instagram', 'linkedin'];
  const md = modal(`<div class="mhead"><h2>Plan ${MONTHS[m]} ${y}</h2><button class="x" data-close>×</button></div>
    <div class="mbody"><p class="muted">Creates draft posts with captions and visuals from your brand kit and website. Nothing is published until you review and schedule each draft.</p>
      <label>Posts per week</label><div class="seg" id="freq"><button data-n="2">2</button><button data-n="3" class="on">3</button><button data-n="5">5</button></div>
      <label>Channels</label><div class="ch-row">${CH_KEYS.filter((k) => k !== 'youtube').map((k) => `<label class="check"><input type="checkbox" value="${k}" ${chans.includes(k) ? 'checked' : ''}> ${CH[k].name}</label>`).join('')}</div>
      <label class="check"><input type="checkbox" id="phol" checked> Include a post for each Canadian holiday</label>
      <label class="check"><input type="checkbox" id="pvis" checked> Create a visual for each post</label>
      <div class="progress hidden" id="pprog"><i></i></div></div>
    <div class="mfoot"><span class="grow"></span><button class="btn" data-close>Cancel</button><button class="btn primary" id="go">Create drafts</button></div>`, 'small');
  let freq = 3;
  $$('#freq button', md.el).forEach((b) => (b.onclick = () => { freq = +b.dataset.n; $$('#freq button', md.el).forEach((x) => x.classList.toggle('on', x === b)); }));
  $('#go', md.el).onclick = (e) => guard(async () => {
    const channels = $$('.ch-row input:checked', md.el).map((i) => i.value);
    if (!channels.length) throw new Error('Select at least one channel.');
    const today = ymd(new Date()), taken = new Set(S.data.posts.map(postDay));
    const days = { 2: [2, 4], 3: [1, 3, 5], 5: [1, 2, 3, 4, 5] }[freq];
    const hols = $('#phol', md.el).checked ? holidays(y, regions()).filter((h) => h.date.slice(5, 7) === pad(m + 1)) : [];
    const slots = [];
    hols.forEach((h) => { if (h.date > today && !taken.has(h.date)) { slots.push({ date: h.date, holiday: h.name, solemn: !!h.solemn }); taken.add(h.date); } });
    let t = 0;
    for (let day = 1; day <= new Date(y, m + 1, 0).getDate(); day++) {
      const dt = new Date(y, m, day), k = ymd(dt);
      if (k <= today || taken.has(k) || !days.includes(dt.getDay())) continue;
      slots.push({ date: k, theme: THEMES[t++ % THEMES.length] });
    }
    if (!slots.length) throw new Error('No free days left this month. Move to next month and plan from there.');
    slots.sort((a, b) => a.date.localeCompare(b.date));
    const bar = $('#pprog', md.el); bar.classList.remove('hidden'); bar.firstElementChild.style.width = '8%';
    const plan = await api('POST', 'generate', { type: 'plan', month: `${MONTHS[m]} ${y}`, slots, channels }, { quiet: true });
    const items = (plan.posts || []).filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date || ''));
    if (!items.length) throw new Error('The plan came back empty. Scan your website in Brand kit, then try again.');
    const pool = photos(), layouts = ['photo', 'bold', 'split', 'quote'];
    for (let i = 0; i < items.length; i++) {
      const p = items[i], slot = slots.find((s) => s.date === p.date) || {};
      const caps = p.captions || {}, first = caps[channels[0]] || Object.values(caps)[0] || '';
      let mediaIds = [];
      if ($('#pvis', md.el).checked && p.headline) {
        const photoId = pool.length && !slot.holiday ? pool[i % pool.length].id : '';
        const tpl = slot.holiday ? (slot.solemn ? 'bold' : 'festive') : layouts[i % layouts.length];
        const a = await renderDesignToAsset({ format: 'square', template: tpl, headline: p.headline, subline: p.subline || '', photoId, logo: true });
        mediaIds = [a.id];
      }
      const custom = {};
      channels.forEach((c) => { if (caps[c] && caps[c] !== first) custom[c] = caps[c]; });
      await api('POST', 'posts', { caption: first, captions: custom, channels, mediaIds, topic: p.topic || slot.holiday || '', holiday: slot.holiday || '',
        title: p.youtubeTitle || '', scheduledAt: toUtc(p.date, S.data.settings.defaultTime), status: 'draft' }, { quiet: true });
      bar.firstElementChild.style.width = 8 + Math.round(((i + 1) / items.length) * 92) + '%';
    }
    md.close();
    await api('GET', 'state');
    toast(`${items.length} drafts created${plan.source === 'ai' ? '' : ' from your website text'}. Review each one, then schedule.`, 'ok', 7000);
  }, e.currentTarget);
}

// -------------------------------------------------------------------- Posts
let filter = 'all';
export function renderPosts(root, params = {}) {
  const groups = { all: () => true, suggested: (p) => !!p.suggested && p.status === 'draft', scheduled: (p) => p.status === 'scheduled', draft: (p) => p.status === 'draft' && !p.suggested,
    published: (p) => ['published', 'partial'].includes(p.status), attention: (p) => ['failed', 'missed', 'partial'].includes(p.status) };
  const labels = { all: 'All', suggested: '✦ Suggested', scheduled: 'Scheduled', draft: 'Drafts', published: 'Published', attention: 'Need attention' };
  if (groups[params.f]) { filter = params.f; history.replaceState(null, '', '#/posts'); }
  const list = S.data.posts.filter(groups[filter]).sort((a, b) => (b.scheduledAt || '').localeCompare(a.scheduledAt || ''));
  const ready = S.data.posts.filter((p) => p.status === 'draft' && !p.suggested && p.scheduledAt && fromUtc(p.scheduledAt) > new Date() && (p.caption || (p.mediaIds || []).length));
  root.innerHTML = `<header class="page-head"><div><h1>Posts</h1><p>Everything you have drafted, scheduled and published.</p></div>
      <div class="row">${ready.length ? `<button class="btn" id="bulk">Schedule ${ready.length} draft${ready.length > 1 ? 's' : ''}</button>` : ''}<button class="btn primary" id="new">+ New post</button></div></header>
    <div class="tabs left">${Object.keys(groups).map((k) => `<button class="${k === filter ? 'on' : ''}" data-f="${k}">${labels[k]} <span>${S.data.posts.filter(groups[k]).length}</span></button>`).join('')}</div>
    ${filter === 'suggested' ? suggestedPanel() : `<section class="panel">${list.length ? list.map(postRow).join('') : '<p class="muted">No posts here yet.</p>'}</section>`}`;
  $('#new', root).onclick = () => openComposer();
  bindSuggestions(root);
  $$('[data-okmonth]', root).forEach((b) => (b.onclick = async () => {
    const todo = suggestions().filter((p) => ymd(fromUtc(p.scheduledAt)).slice(0, 7) === b.dataset.okmonth);
    if (!(await confirmBox(`Approve ${todo.length} suggestion${todo.length > 1 ? 's' : ''}?`, 'Each one is scheduled to publish at its planned time. Suggestions whose date is not confirmed are left for you to check.', 'Approve and schedule'))) return;
    guard(() => approveMany(todo), b);
  }));
  const kdl = $('#sgkd', root);
  if (kdl) kdl.onclick = () => openKeyDates(new Date());
  $$('[data-f]', root).forEach((b) => (b.onclick = () => { filter = b.dataset.f; renderPosts(root); }));
  const bulk = $('#bulk', root);
  if (bulk) bulk.onclick = async () => {
    if (!(await confirmBox('Schedule all drafts?', `${ready.length} draft${ready.length > 1 ? 's' : ''} with a future date will be published automatically at their planned time.`, 'Schedule all'))) return;
    guard(async () => {
      for (const p of ready) await api('PUT', 'posts/' + p.id, { status: 'scheduled' }, { quiet: true });
      await api('GET', 'state'); toast('Drafts scheduled.');
    }, bulk);
  };
  bindPosts(root);
}

// Suggested posts, grouped by month, each with approve / edit / regenerate / dismiss.
function suggestedPanel() {
  const list = suggestions(), auto = kdSettings().auto;
  if (!list.length) return `<section class="panel"><p class="muted">${auto ? 'No suggestions waiting. New ones appear here when a key date comes within the next two months, or when you switch on a type of date.' : 'Automatic suggestions are switched off.'}</p>
    <button class="btn sm" id="sgkd">★ Open key dates</button></section>`;
  const months = {};
  list.forEach((p) => { const k = ymd(fromUtc(p.scheduledAt)).slice(0, 7); (months[k] = months[k] || []).push(p); });
  return `<p class="muted">One suggested post for each of your coming key dates, written for its type. Nothing here is scheduled until you approve it. Dismissed suggestions do not come back.</p>` + Object.entries(months).map(([k, ps]) =>
    `<section class="panel"><div class="sg-head"><h3>${MONTHS[+k.slice(5) - 1]} ${k.slice(0, 4)} <span class="muted">${ps.length}</span></h3><button class="btn sm" data-okmonth="${k}">Approve all for ${MONTHS[+k.slice(5) - 1]}</button></div>
      ${ps.map(suggestionRow).join('')}</section>`).join('');
}

// ------------------------------------------------------------------ Library
let lib = 'all';
export function renderLibrary(root) {
  const kinds = { all: 'All', photo: 'Photos', design: 'Designs', reel: 'Reels', logo: 'Logos', guideline: 'Documents', source: 'Source files' };
  const list = S.data.assets.filter((a) => lib === 'all' || a.kind === lib);
  root.innerHTML = `<header class="page-head"><div><h1>Library</h1><p>Photos, logos, generated visuals and reels for ${esc(S.data.brand.name || 'this brand')}.</p></div>
      <label class="btn primary">Upload files<input type="file" id="up" multiple hidden accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm"></label></header>
    <div class="tabs left">${Object.entries(kinds).map(([k, n]) => `<button class="${k === lib ? 'on' : ''}" data-k="${k}">${n}</button>`).join('')}</div>
    <div class="drop-zone" id="dz">${list.length ? `<div class="grid-assets">${list.map((a) => `<div class="tile">${thumb(a)}<span>${esc(a.name)}</span>
      <div class="tile-actions">${isImage(a) || isVideo(a) ? `<button class="btn sm" data-use="${a.id}">Post</button>` : `<a class="btn sm" href="${a.url}" target="_blank">Open</a>`}
      <button class="btn sm ghost" data-del="${a.id}" title="Delete">Delete</button></div></div>`).join('')}</div>`
      : '<p class="muted pad">Drop photos or videos here, or use Upload. Visuals you create in Studio are saved here too.</p>'}</div>`;
  $$('[data-k]', root).forEach((b) => (b.onclick = () => { lib = b.dataset.k; renderLibrary(root); }));
  const send = (files) => guard(async () => {
    for (const f of files) await uploadFile(f, f.type.startsWith('video') ? 'reel' : 'photo');
    toast(`${files.length} file${files.length > 1 ? 's' : ''} added.`);
  });
  $('#up', root).onchange = (e) => send([...e.target.files]);
  const dz = $('#dz', root);
  dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); };
  dz.ondragleave = () => dz.classList.remove('over');
  dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('over'); if (e.dataTransfer.files.length) send([...e.dataTransfer.files]); };
  $$('[data-use]', root).forEach((b) => (b.onclick = () => openComposer({ mediaId: b.dataset.use })));
  $$('[data-del]', root).forEach((b) => (b.onclick = async () => {
    if (await confirmBox('Delete this file?', 'It will be removed from the library and from any draft that uses it.', 'Delete', true)) guard(() => api('DELETE', 'assets/' + b.dataset.del));
  }));
}

// ---------------------------------------------------------------- Brand kit
export function renderBrand(root) {
  const b = S.data.brand, site = b.site;
  const logos = S.data.assets.filter((a) => a.kind === 'logo'), docs = S.data.assets.filter((a) => a.kind === 'guideline');
  const colorKeys = { primary: 'Primary', accent: 'Accent', light: 'Background', text: 'Text' };
  const own = !isDefaultBrand(), nsrc = (S.data.settings.sources || []).length, siteLogos = (site && site.logos) || [];
  root.innerHTML = `<header class="page-head"><div><h1>Brand kit: ${esc(b.name || 'Untitled brand')}</h1><p>Everything the studio and the assistant use for this brand: logo, colours, photos, voice and sources. Changes save automatically.</p></div>
      ${own ? '<button class="btn ghost danger-text" id="delbrand">Delete this brand</button>' : ''}</header>
    <div class="cols"><div>
    <section class="panel"><h3>Website — content source</h3>
      <p class="muted">The assistant writes from what is on your site: pages, headings and text. Images found can be added to your library.</p>
      <div class="row"><input id="site" placeholder="https://www.yourcompany.ca" value="${esc(b.website)}"><button class="btn primary" id="scan">${site ? 'Rescan' : 'Scan website'}</button></div>
      ${site ? `<div class="site-card"><b>${esc(site.title || site.url)}</b><small>${esc(site.description || '')}</small>
        <small class="muted">${site.pages.length} page${site.pages.length > 1 ? 's' : ''} read · ${site.images.length} images found · scanned ${esc(niceDate(fromUtc(site.scannedAt), true))}</small>
        <details><summary>Pages read</summary><ul>${site.pages.map((p) => `<li>${esc(p.title || p.url)} <span class="muted">${p.headings.length} headings, ${p.paragraphs.length} paragraphs</span></li>`).join('')}</ul></details>
        ${site.colors.length ? `<div class="row wrap"><small class="muted">Use as primary colour:</small>${site.colors.map((c) => `<button class="sw" style="background:${esc(c)}" data-sitecolor="${esc(c)}" data-as="primary" title="${esc(c)} — use as primary"></button>`).join('')}</div>
          <div class="row wrap"><small class="muted">Use as accent colour:</small>${site.colors.map((c) => `<button class="sw" style="background:${esc(c)}" data-sitecolor="${esc(c)}" data-as="accent" title="${esc(c)} — use as accent"></button>`).join('')}</div>` : ''}
        ${siteLogos.length ? `<details open><summary>Logos found (${siteLogos.length}) — click one to use it as the brand logo</summary><div class="site-imgs logos">${siteLogos.map((im) =>
          `<button data-importlogo="${esc(im.url)}" title="Use as logo"><img src="${esc(im.url)}" alt="${esc(im.alt)}" loading="lazy" referrerpolicy="no-referrer"></button>`).join('')}</div></details>` : ''}
        ${site.images.length ? `<details><summary>Images found (${site.images.length}) — click to add to your library</summary><div class="site-imgs">${site.images.map((im) =>
          `<button data-import="${esc(im.url)}" title="Add to library"><img src="${esc(im.url)}" alt="${esc(im.alt)}" loading="lazy" referrerpolicy="no-referrer"></button>`).join('')}</div></details>` : ''}</div>` : ''}
    </section>
    <section class="panel"><h3>Identity</h3>
      <div class="row"><div class="grow"><label>Brand name</label><input data-f="name" value="${esc(b.name)}"></div>
      <div class="grow"><label>Tagline</label><input data-f="tagline" value="${esc(b.tagline)}"></div></div>
      <label>Logo</label><div class="logo-row"><button class="logo-opt ${!b.logoId ? 'on' : ''}" data-logo="">${own ? `<b class="wordmark">${esc(b.name || 'Brand name')}</b>` : '<img src="/img/logo.svg" alt="UPSMRT">'}</button>
        ${logos.map((a) => `<button class="logo-opt ${b.logoId === a.id ? 'on' : ''}" data-logo="${a.id}"><img src="${a.url}" alt="${esc(a.name)}"></button>`).join('')}
        <label class="logo-opt add">+ Upload<input type="file" id="uplogo" hidden accept="image/png,image/svg+xml,image/jpeg,image/webp"></label></div>
      <label>Colours</label><div class="colors">${Object.entries(colorKeys).map(([k, n]) => `<label class="color"><input type="color" data-c="${k}" value="${esc(b.colors[k])}"><span>${n}<small>${esc(b.colors[k])}</small></span></label>`).join('')}</div>
      <label>Typeface for visuals</label><select data-f="font">${fontList().map((f) => `<option ${f === b.font ? 'selected' : ''}>${f}</option>`).join('')}</select>
      <label>Graphic shape in the visual templates</label><div class="seg" id="motif">${Object.entries(MOTIFS).map(([k, n]) => `<button class="${(b.motif || 'bubble') === k ? 'on' : ''}" data-motif="${k}">${n}</button>`).join('')}</div>
    </section>
    <section class="panel"><h3>Industry data sources <span class="muted">${nsrc}</span></h3>
      <p class="muted">Upload or link this brand's lists of industry publications, trade shows and associations. The assistant reads them and proposes key dates for the calendar.</p>
      <button class="btn" data-gosrc>${nsrc ? 'Manage data sources' : 'Add data sources'}</button>
    </section></div><div>
    <section class="panel"><h3>Voice</h3>
      <label>Language</label><select data-f="language"><option value="en" ${b.language === 'en' ? 'selected' : ''}>English</option><option value="fr" ${b.language === 'fr' ? 'selected' : ''}>Français</option><option value="bilingual" ${b.language === 'bilingual' ? 'selected' : ''}>Bilingual (FR + EN)</option></select>
      <label>Tone of voice</label><textarea data-f="voice" rows="3" placeholder="e.g. Confident and plain-spoken. Short sentences. No jargon, no exclamation marks.">${esc(b.voice)}</textarea>
      <label>Audience</label><textarea data-f="audience" rows="2" placeholder="e.g. Owners and executives of mid-sized Canadian companies">${esc(b.audience)}</textarea>
      <label>Hashtags to use</label><input data-f="hashtags" placeholder="#consulting #strategy" value="${esc(b.hashtags)}">
      <button class="btn sm accent mt-s" id="kitai">✦ Suggest voice and audience from the website</button>
      <small class="muted">Fills in only the fields that are empty. ${S.data.ai.enabled ? '' : 'Needs an AI key (Settings).'}</small>
    </section>
    <section class="panel"><h3>Brand guidelines</h3>
      <p class="muted">Upload your guidelines (PDF is read by the assistant when an AI key is set) and paste the key rules below.</p>
      ${docs.map((a) => `<div class="doc-row"><span class="doc-ic">${esc(a.file.split('.').pop().toUpperCase())}</span><a href="${a.url}" target="_blank">${esc(a.name)}</a><button class="x" data-deldoc="${a.id}" title="Remove">×</button></div>`).join('')}
      <label class="btn sm">Upload guidelines<input type="file" id="updoc" hidden accept="application/pdf,text/plain,text/markdown,.md,.docx"></label>
      <label>Or link to the guidelines <span class="muted">(Google Drive, Dropbox, OneDrive or a web page, shared with anyone who has the link)</span></label>
      <div class="row"><input id="doclink" placeholder="https://drive.google.com/…" autocomplete="off"><button class="btn" id="docadd">Add</button></div>
      <label>Key rules</label><textarea data-f="guidelinesText" rows="6" placeholder="Do: … Don't: … Always mention … Never say …">${esc(b.guidelinesText)}</textarea>
    </section>
    <section class="panel"><h3>Photos <span class="muted">${photos().length}</span></h3>
      <div class="mini-grid">${photos().slice(0, 11).map((a) => thumb(a)).join('')}<label class="mini-add">+<input type="file" id="upphoto" multiple hidden accept="image/png,image/jpeg,image/webp"></label></div>
      <button class="btn sm ghost" data-golib>Open library</button>
    </section></div></div>`;
  const save = (patch) => api('PUT', 'brand', patch, { quiet: true }).catch((e) => toast(e.message, 'err'));
  $$('[data-f]', root).forEach((i) => (i.onchange = () => save({ [i.dataset.f]: i.value })));
  $$('[data-c]', root).forEach((i) => (i.onchange = () => { const colors = { ...S.data.brand.colors, [i.dataset.c]: i.value.toUpperCase() }; save({ colors }).then(() => renderBrand(root)); }));
  $$('[data-sitecolor]', root).forEach((s) => (s.onclick = () => guard(() => api('PUT', 'brand', { colors: { ...S.data.brand.colors, [s.dataset.as]: s.dataset.sitecolor, ...(s.dataset.as === 'primary' && isDark(s.dataset.sitecolor) ? { text: s.dataset.sitecolor } : {}) } }))));
  $$('[data-importlogo]', root).forEach((bt) => (bt.onclick = () => guard(async () => { await api('POST', 'import-image', { url: bt.dataset.importlogo, kind: 'logo' }); toast('Logo set for this brand.'); }, bt)));
  $$('[data-motif]', root).forEach((bt) => (bt.onclick = () => guard(() => api('PUT', 'brand', { motif: bt.dataset.motif }))));
  $('[data-gosrc]', root).onclick = () => go('sources');
  $('#docadd', root).onclick = (e) => guard(async () => {
    const url = $('#doclink', root).value.trim();
    if (!url) throw new Error('Paste the link to the guidelines first.');
    const before = S.data.assets.length;
    await api('POST', 'import-doc', { url });
    toast(S.data.assets.length > before ? 'Guidelines PDF added.' : 'The text of that document was added to the key rules.');
  }, e.currentTarget);
  $('#kitai', root).onclick = (e) => guard(async () => {
    if (!S.data.ai.enabled) throw new Error('This needs an Anthropic API key. Add one in Settings.');
    const g = (await api('POST', 'brandkit', {}, { quiet: true })).suggestion || {}, cur = S.data.brand, patch = {};
    ['tagline', 'voice', 'audience', 'hashtags'].forEach((f) => { if (!String(cur[f] || '').trim() && g[f]) patch[f] = g[f]; });
    if (g.industry && !(S.data.settings.keyDates || {}).industry) await saveKd({ industry: g.industry }, true);
    if (!Object.keys(patch).length) return toast('Nothing to fill in: these fields already have text. Clear one to have it suggested.');
    await api('PUT', 'brand', patch);
    toast(`Filled in: ${Object.keys(patch).join(', ')}. Read them over and adjust.`, 'ok', 7000);
  }, e.currentTarget);
  const del = $('#delbrand', root);
  if (del) del.onclick = async () => {
    const n = S.data.posts.length, name = S.data.brand.name || 'this brand';
    if (!(await confirmBox(`Delete ${name}?`, `This permanently deletes the brand kit, library, ${n} post${n === 1 ? '' : 's'}, key dates, data sources and channel connections of ${name}. It cannot be undone. Posts already published stay on the social networks.`, 'Delete brand', true))) return;
    guard(async () => { await api('DELETE', 'brands/' + S.data.brandId, undefined, { quiet: true }); location.hash = '#/dashboard'; location.reload(); }, del);
  };
  $$('[data-logo]', root).forEach((l) => (l.onclick = () => guard(() => api('PUT', 'brand', { logoId: l.dataset.logo }))));
  $('#scan', root).onclick = (e) => guard(async () => {
    const url = $('#site', root).value.trim();
    if (!url) throw new Error('Enter your website address first.');
    e.currentTarget.textContent = 'Reading your site…';
    await api('POST', 'scan', { url });
    toast('Website scanned. The assistant will now write from your content.');
  }, e.currentTarget);
  $$('[data-import]', root).forEach((bt) => (bt.onclick = () => guard(async () => { await api('POST', 'import-image', { url: bt.dataset.import }, { quiet: true }); bt.classList.add('added'); bt.disabled = true; toast('Added to your library.'); }, bt)));
  const up = (id, kind, after) => { const inp = $('#' + id, root); if (inp) inp.onchange = () => guard(async () => { for (const f of inp.files) { const a = await uploadFile(f, kind); if (after) await after(a); } }); };
  up('uplogo', 'logo', (a) => api('PUT', 'brand', { logoId: a.id }));
  up('updoc', 'guideline');
  up('upphoto', 'photo');
  $$('[data-deldoc]', root).forEach((x) => (x.onclick = () => guard(() => api('DELETE', 'assets/' + x.dataset.deldoc))));
  $('[data-golib]', root).onclick = () => go('library');
}

// ----------------------------------------------------------------- Channels
const GUIDE = {
  facebook: { app: 'a Meta app (developers.facebook.com → Create app → Business)', id: 'App ID', secret: 'App secret', idKey: 'app_id', secretKey: 'app_secret',
    note: 'Add the “Facebook Login for Business” product and this redirect URI. Signing in also connects the Instagram professional account linked to your Page.' },
  linkedin: { app: 'a LinkedIn app (linkedin.com/developers) with “Share on LinkedIn” and “Sign In with LinkedIn using OpenID Connect”', id: 'Client ID', secret: 'Client secret', idKey: 'client_id', secretKey: 'client_secret',
    note: 'Posts go to your personal profile. To post as a company Page, add its Organization ID (requires LinkedIn’s Community Management API access).' },
  youtube: { app: 'a Google Cloud OAuth client (type: Web application) with the YouTube Data API v3 enabled', id: 'Client ID', secret: 'Client secret', idKey: 'client_id', secretKey: 'client_secret',
    note: 'Add this redirect URI to the OAuth client. Vertical videos under 3 minutes are published as Shorts.' },
};

export function renderChannels(root, params = {}) {
  const ch = S.data.channels, base = S.data.baseUrl;
  const card = (k, body) => `<section class="panel channel"><div class="ch-head">${chBadge(k)}<div class="grow"><h3>${CH[k].name}</h3>
      <small class="${ch[k].connected ? 'good' : 'muted'}">${ch[k].connected ? `Connected${ch[k].name ? ' · ' + esc(ch[k].name) : ''}` : 'Not connected'}</small></div>
      ${ch[k].connected ? `<button class="btn sm" data-test="${k}">Test</button><button class="btn sm ghost" data-off="${k}">Disconnect</button>` : ''}</div>${body}</section>`;
  const oauth = (k) => { const g = GUIDE[k], f = ch[k].fields; return `<p class="muted">Sign in once with ${g.app}. ${g.note}</p>
      <div class="redirect"><small>Redirect URI</small><code>${base}/oauth/callback/${k}</code></div>
      <div class="row"><div class="grow"><label>${g.id}</label><input data-cf="${k}.${g.idKey}" value="${esc(f[g.idKey] || '')}" autocomplete="off"></div>
      <div class="grow"><label>${g.secret}</label><input type="password" data-cf="${k}.${g.secretKey}" placeholder="${f[g.secretKey] ? '•••••••• saved' : ''}" autocomplete="off"></div></div>
      ${k === 'linkedin' ? `<label>Organization ID <span class="muted">(optional, to post as a company Page)</span></label><input data-cf="linkedin.org_id" value="${esc(f.org_id || '')}">` : ''}
      <button class="btn primary" data-connect="${k}">${ch[k].connected ? 'Reconnect' : 'Connect'} ${CH[k].name}</button>`; };
  const adv = (k, fields) => `<details><summary>Advanced: paste tokens manually</summary>${fields.map(([key, label, secret]) =>
      `<label>${label}</label><input ${secret ? 'type="password"' : ''} data-cf="${k}.${key}" ${secret ? `placeholder="${ch[k].fields[key] ? '•••••••• saved' : ''}"` : `value="${esc(ch[k].fields[key] || '')}"`} autocomplete="off">`).join('')}
      <button class="btn sm" data-save="${k}">Save</button></details>`;
  const pages = ch.facebook.pages || [];
  root.innerHTML = `<header class="page-head"><div><h1>Channels: ${esc(S.data.brand.name || 'this brand')}</h1><p>Connect the accounts this brand publishes to. Each brand has its own connections. ${S.data.hosted ? 'Keys and tokens are kept in this app\'s private storage.' : 'Keys and tokens stay on this computer.'}</p></div></header>
    ${params.error ? `<div class="banner bad">${esc(params.error)}</div>` : ''}${params.connected ? `<div class="banner good">${esc(CH[params.connected] ? CH[params.connected].name : '')} connected.</div>` : ''}
    <div class="cols">
    ${card('facebook', `${oauth('facebook')}${pages.length > 1 ? `<label>Page to publish to</label><select id="page">${pages.map((p) => `<option value="${p.id}" ${p.id === ch.facebook.fields.page_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>` : ''}
      ${adv('facebook', [['page_id', 'Page ID'], ['page_token', 'Page access token', true]])}`)}
    ${card('instagram', `<p class="muted">Connects automatically when you sign in with Facebook, if your Instagram professional account is linked to the Page. ${S.data.hosted ? 'Reels and images both publish from here.' : 'Reels upload directly; images need a Public media URL (Settings) because Instagram only fetches images from the web.'}</p>
      ${adv('instagram', [['ig_user_id', 'Instagram user ID'], ['token', 'Access token', true]])}`)}
    ${card('linkedin', `${oauth('linkedin')}${adv('linkedin', [['access_token', 'Access token', true], ['author_urn', 'Author URN (urn:li:person:… or urn:li:organization:…)']])}`)}
    ${card('youtube', `${oauth('youtube')}${adv('youtube', [['refresh_token', 'Refresh token', true]])}`)}
    </div>`;
  const collect = (k) => { const out = {}; $$(`[data-cf^="${k}."]`, root).forEach((i) => { out[i.dataset.cf.split('.')[1]] = i.value.trim(); }); return out; };
  $$('[data-connect]', root).forEach((b) => (b.onclick = () => guard(async () => {
    const k = b.dataset.connect, g = GUIDE[k], vals = collect(k);
    if (!vals[g.idKey] || !(vals[g.secretKey] || ch[k].fields[g.secretKey])) throw new Error(`Enter the ${g.id} and ${g.secret} first.`);
    await api('PUT', 'channels/' + k, vals, { quiet: true });
    location.href = '/oauth/start/' + k + '?brand=' + encodeURIComponent(S.data.brandId || '');
  }, b)));
  $$('[data-save]', root).forEach((b) => (b.onclick = () => guard(async () => { await api('PUT', 'channels/' + b.dataset.save, collect(b.dataset.save)); toast('Saved.'); }, b)));
  $$('[data-test]', root).forEach((b) => (b.onclick = () => guard(async () => { await api('POST', `channels/${b.dataset.test}/test`); toast(CH[b.dataset.test].name + ' connection works.'); }, b)));
  $$('[data-off]', root).forEach((b) => (b.onclick = async () => {
    if (await confirmBox(`Disconnect ${CH[b.dataset.off].name}?`, 'Saved keys and tokens for this channel are removed from this computer. Scheduled posts for it will fail until you reconnect.', 'Disconnect', true)) guard(() => api('DELETE', 'channels/' + b.dataset.off));
  }));
  const page = $('#page', root);
  if (page) page.onchange = () => guard(() => api('PUT', 'channels/facebook', { selectPage: page.value }));
}

// ----------------------------------------------------------------- Settings
export function renderSettings(root) {
  const s = S.data.settings, r = s.holidayRegions;
  root.innerHTML = `<header class="page-head"><div><h1>Settings</h1></div></header><div class="cols">
    <section class="panel"><h3>Assistant</h3>
      <p class="muted">With an Anthropic API key, captions, monthly plans and reel scripts are written by Claude (${esc(S.data.ai.model)}) from your brand kit and website. Without one, drafts are assembled from your website text.</p>
      <div class="status-line ${S.data.ai.enabled ? 'good' : ''}">${S.data.ai.enabled ? '● AI writing is on' : '○ AI writing is off'}</div>
      <label>Anthropic API key</label><div class="row"><input type="password" id="key" placeholder="${S.data.ai.enabled ? '•••••••• saved' : 'sk-ant-…'}" autocomplete="off">
      <button class="btn primary" id="savekey">Save</button>${S.data.ai.enabled ? '<button class="btn ghost" id="rmkey">Remove</button>' : ''}</div>
      <small class="muted">${S.data.hosted ? 'Stored in this app\'s private storage on Netlify; it is never sent to the browser.' : 'Stored only in the data folder on this computer.'} One key is used for all your brands. Usage is billed to your Anthropic account.</small></section>
    <section class="panel"><h3>Calendar: ${esc(S.data.brand.name || 'this brand')}</h3>
      <label>Canadian holidays shown</label>
      <label class="check"><input type="checkbox" data-r="federal" ${r.federal ? 'checked' : ''}> Federal statutory holidays</label>
      <label class="check"><input type="checkbox" data-r="quebec" ${r.quebec ? 'checked' : ''}> Quebec (Fête nationale, Easter Monday)</label>
      <label class="check"><input type="checkbox" data-r="provincial" ${r.provincial ? 'checked' : ''}> Other provincial (Family Day, Civic Holiday)</label>
      <label>Default posting time</label><input type="time" id="deft" value="${esc(s.defaultTime)}">
      <div class="${S.data.hosted ? 'hidden' : ''}"><h3 class="mt">Instagram images</h3>
      <label>Public media URL <span class="muted">(optional)</span></label><input id="pub" placeholder="https://media.yourcompany.ca/uploads" value="${esc(s.publicMediaUrl)}">
      <small class="muted">Instagram downloads images from a public address. If you mirror this app's <code>data/uploads</code> folder online, enter that address here.</small></div></section></div>`;
  $('#savekey', root).onclick = (e) => guard(async () => { const v = $('#key', root).value.trim(); if (!v) throw new Error('Paste your API key first.'); await api('PUT', 'settings', { aiKey: v }); toast('AI key saved.'); }, e.currentTarget);
  const rm = $('#rmkey', root);
  if (rm) rm.onclick = () => guard(() => api('PUT', 'settings', { aiKey: '' }));
  $$('[data-r]', root).forEach((c) => (c.onchange = () => guard(() => api('PUT', 'settings', { holidayRegions: { ...S.data.settings.holidayRegions, [c.dataset.r]: c.checked } }, { quiet: true }))));
  $('#deft', root).onchange = (e) => guard(() => api('PUT', 'settings', { defaultTime: e.target.value }, { quiet: true }));
  $('#pub', root).onchange = (e) => guard(() => api('PUT', 'settings', { publicMediaUrl: e.target.value.trim() }, { quiet: true }));
}
