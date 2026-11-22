// Key dates. The only dates built into the app are Canadian and US holidays. Every other date
// (trade shows, publications, associations, industry events) comes from the brand's
// own data sources, uploaded or linked on the Data sources page, or is typed in by hand.
// Every type has its own colour and label, and can be switched on and off.
import { S, $, $$, api, esc, toast, guard, modal, confirmBox, pad, ymd, toUtc, postDay, photos, go } from './core.js';
import { holidays } from './holidays.js';
import { draw, prepare, renderDesignToAsset } from './studio.js';
import { openComposer } from './composer.js';

const BASE_CATS = {
  canada: { label: 'Canadian holidays', color: '#EEB21E' },
  us: { label: 'US holidays', color: '#C93838' },
  awareness: { label: 'Awareness & business days', color: '#1E8E5A' },
  industry: { label: 'Industry events', color: '#3B5BDB' },
  tradeshow: { label: 'Trade shows', color: '#7A3FC4' },
  publication: { label: 'Publications & reports', color: '#0E8FA3' },
  association: { label: 'Industry associations', color: '#B4531A' },
  custom: { label: 'Your own dates', color: '#D6336C' },
};
const CAT_DEFAULT = { canada: true, us: true, awareness: true, industry: true, tradeshow: true, publication: true, association: true, custom: true };
export const PALETTE = ['#0B7285', '#9C36B5', '#E8590C', '#2B8A3E', '#C2255C', '#364FC7', '#866118', '#087F5B'];

// Built-in categories plus the ones added by hand for this brand.
export function catMap() {
  const out = { ...BASE_CATS };
  ((S.data.settings.keyDates || {}).userCats || []).forEach((u) => { out[u.id] = { label: u.label, color: u.color, user: true }; });
  return out;
}
export const cat = (id) => catMap()[id] || BASE_CATS.custom;
export const catKeys = () => Object.keys(catMap());

// ------------------------------------------------------------- date rules
const D = (y, m, day) => `${y}-${pad(m)}-${pad(day)}`;
const fixed = (m, day) => (y) => D(y, m, day);
const nth = (m, wd, n) => (y) => { const f = new Date(y, m - 1, 1); return D(y, m, 1 + ((wd - f.getDay() + 7) % 7) + (n - 1) * 7); };
const last = (m, wd) => (y) => { const l = new Date(y, m, 0); return D(y, m, l.getDate() - ((l.getDay() - wd + 7) % 7)); };
const thanksUS = nth(11, 4, 4);

// [id, name, rule, options]
const US = [
  ['us-ny', "New Year's Day", fixed(1, 1), { shared: true }],
  ['us-mlk', 'Martin Luther King Jr. Day', nth(1, 1, 3), { solemn: true, msg: 'Today we honour the legacy of Dr. Martin Luther King Jr. alongside our American clients, partners and friends.' }],
  ['us-pres', "Presidents' Day", nth(2, 1, 3), { msg: "It is Presidents' Day in the United States. To our American clients and partners: enjoy the long weekend. {B} is open as usual in Canada." }],
  ['us-mem', 'Memorial Day', last(5, 1), { solemn: true, msg: 'On Memorial Day, we join our American clients and partners in remembering those who gave their lives in service.' }],
  ['us-june', 'Juneteenth', fixed(6, 19), { solemn: true, msg: 'Today we mark Juneteenth alongside our American clients and partners: a day to reflect on freedom and the work still ahead.' }],
  ['us-july4', 'Independence Day', fixed(7, 4), { msg: 'Happy Fourth of July to our American clients, partners and friends, from all of us at {B}.', head: 'Happy Fourth of July', sub: 'To our American clients and friends' }],
  ['us-labor', 'Labor Day', nth(9, 1, 1), { shared: true }],
  ['us-columbus', "Indigenous Peoples' Day / Columbus Day", nth(10, 1, 2), { solemn: true, msg: "Today is Indigenous Peoples' Day in the United States. Our American clients and partners may be out of office; {B} is here when you are back." }],
  ['us-vets', 'Veterans Day', fixed(11, 11), { solemn: true, msg: 'On Veterans Day, we join our American clients and partners in honouring all who have served.' }],
  ['us-thanks', 'US Thanksgiving', thanksUS, { msg: 'Happy Thanksgiving to our American clients, partners and friends. We are grateful to work with you, from all of us at {B}.', head: 'Happy Thanksgiving', sub: 'To our American clients and friends' }],
  ['us-xmas', 'Christmas Day', fixed(12, 25), { shared: true }],
];

// --------------------------------------------------------------- settings
export function kdSettings() {
  const k = S.data.settings.keyDates || {}, userCats = k.userCats || [];
  return { cats: { ...CAT_DEFAULT, ...Object.fromEntries(userCats.map((u) => [u.id, true])), ...(k.cats || {}) }, industry: k.industry || '',
    custom: k.custom || [], overrides: k.overrides || {}, userCats, pending: k.pending || [], rejected: k.rejected || [], dismissed: k.dismissed || [],
    attending: k.attending || {}, auto: k.auto !== false };
}
export const saveKd = (patch, quiet = false) => api('PUT', 'settings', { keyDates: { ...kdSettings(), ...patch } }, { quiet });
// One signature per date, so the same event is not listed, reviewed or rejected twice.
export const dateSig = (d) => `${String(d.name).toLowerCase().trim()}|${d.date}`;

// ---------------------------------------------------------- suggestion engine
const fill = (s) => String(s || '').replace(/\{B\}/g, S.data.brand.name || 'our team');

// `v` picks an alternative wording, used when a suggestion is regenerated without AI.
export function compose(cat, name, year, o, v = 0) {
  const short = o.short || name, at = o.where ? ` in ${o.where}` : '', alt = v % 2 === 1;
  if (o.msg) return { msg: fill(o.msg), head: fill(o.head || name), sub: fill(o.sub || 'From all of us at {B}') };
  if (cat === 'canada' || cat === 'us') {
    if (o.solemn) return { msg: fill(alt ? `${name}. Today the {B} team takes a moment to remember and reflect.` : `Today, on ${name}, the {B} team pauses to reflect and remember.`), head: name, sub: 'We pause to reflect' };
    return { msg: fill(alt ? `Wishing you a happy ${name} from the whole {B} team. Enjoy the day.` : `Happy ${name} from all of us at {B}. Wishing you a restful day with the people who matter most.`), head: `Happy ${name}`, sub: fill('From all of us at {B}') };
  }
  if (cat === 'industry') return { msg: fill(alt ? `${name} ${year} starts soon${at}. Which announcement are you watching for? {B} will share its notes.` : `${name} ${year} is coming up${at}. {B} will be following the conversation and sharing what it means for your business. What are you hoping to hear about?`), head: `${short} ${year}`, sub: "What we're watching" };
  if (cat === 'tradeshow') return { msg: fill(`${name} ${year} is coming up${at}. Going? Tell us what is on your list: {B} will share the ideas worth bringing back.`), head: `${short} ${year}`, sub: o.where || 'The ideas worth bringing back' };
  if (cat === 'publication') return { msg: fill(alt ? `${name} ${year} is expected around now. What do you hope it covers? {B} will share the points that matter.` : `${name} ${year} is due out around now. {B} will be reading it closely and sharing the takeaways that matter for leaders.`), head: short, sub: 'Our key takeaways' };
  if (cat === 'association') return { msg: fill(alt ? `${name} is almost here${at}. What are you hoping to take away from it? {B} would like to hear.` : `${name} is coming up${at}. {B} will be following along. Who else is taking part?`), head: short, sub: 'Who else is taking part?' };
  return { msg: fill(alt ? `${name}${at}: mark the date. More from {B} soon.` : `${name} is coming up${at}. What does it mean for you? Tell us: the {B} team would like to hear.`), head: short, sub: fill('From {B}') };
}

function build(cat, row, year, overrides) {
  const [id, name, rule, o = {}] = row;
  const est = rule(year);
  if (!est) return null;
  const key = `${id}-${year}`, set = overrides[key];
  return { key, cat, name, date: set || est, approx: !!o.when && !set, when: o.when || '', where: o.where || '', solemn: !!o.solemn,
    tags: o.tags || ['all'], shared: !!o.shared, opts: o, ...compose(cat, name, year, o) };
}

// All key dates between two ISO days for the switched-on categories: Canadian and US holidays,
// plus the dates accepted from the brand's data sources and the ones typed in by hand.
export function keyDates(from, to, opts = {}) {
  const k = kdSettings(), cats = opts.cats || k.cats, known = catMap();
  const out = [], regions = S.data.settings.holidayRegions;
  for (let y = +from.slice(0, 4); y <= +to.slice(0, 4); y++) {
    const ca = cats.canada ? holidays(y, regions) : [];
    ca.forEach((h) => {
      const o = { solemn: h.solemn, ...(h.name.includes('Truth and Reconciliation') ? { msg: 'Today, on the National Day for Truth and Reconciliation, the {B} team pauses to listen, learn and reflect.', head: 'Truth and Reconciliation', sub: 'Listen. Learn. Reflect.' } : {}) };
      out.push({ key: `ca-${h.date}-${h.name}`, cat: 'canada', name: h.name, date: h.date, approx: false, when: '', where: h.note || '', solemn: !!h.solemn, tags: ['all'], opts: o, ...compose('canada', h.name, y, o) });
    });
    const caDates = new Set(ca.map((h) => h.date));
    if (cats.us) US.forEach((r) => { const it = build('us', r, y, k.overrides); if (it && !(it.shared && caDates.has(it.date))) out.push(it); });
  }
  k.custom.forEach((c) => {
    const cc = known[c.cat] ? c.cat : 'custom';
    if (!cats[cc]) return;
    const t = compose(cc, c.name, c.date.slice(0, 4), { where: c.where });
    out.push({ key: c.id, cat: cc, name: c.name, date: c.date, end: c.end || '', approx: !!c.approx, when: c.when || '', where: c.where || '', solemn: false, tags: ['all'], custom: true,
      source: c.source || 'user', internal: !!c.internal, entity: c.entity || '', url: c.url || '', opts: { where: c.where },
      msg: c.msg || t.msg, head: c.head || (c.msg ? c.name : t.head), sub: c.sub || (c.msg ? '' : t.sub), own: !!c.msg });
  });
  return out.filter((it) => it.date >= from && it.date <= to).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

export function keyDateMap(from, to) {
  const map = {};
  keyDates(from, to).forEach((it) => { (map[it.date] = map[it.date] || []).push(it); });
  return map;
}

// ------------------------------------------------------------------ visuals
const LAYOUTS = { awareness: ['bold', 'quote', 'split'], industry: ['split', 'bold', 'quote'], tradeshow: ['photo', 'split', 'bold'], publication: ['quote', 'bold', 'split'], association: ['split', 'quote', 'bold'] };
export function specFor(it, i = 0, v = 0) {
  const pool = photos(), festive = ['canada', 'us'].includes(it.cat);
  let template = festive ? (it.solemn || v % 2 ? 'bold' : 'festive') : it.solemn ? 'bold' : (LAYOUTS[it.cat] || ['bold', 'split', 'quote'])[v % 3];
  if (template === 'photo' && !pool.length) template = 'bold';
  const photoId = pool.length && ['split', 'photo'].includes(template) ? pool[(i + v) % pool.length].id : '';
  return { format: 'square', template, headline: it.head, subline: it.sub, photoId, logo: true };
}

export async function paintThumb(canvas, spec) {
  const big = document.createElement('canvas');
  big.width = big.height = 1080;
  draw(big.getContext('2d'), 1080, 1080, spec, await prepare(spec));
  if (canvas.isConnected) canvas.getContext('2d').drawImage(big, 0, 0, canvas.width, canvas.height);
}

const planned = (it) => S.data.posts.some((p) => !p.suggested && postDay(p) === it.date && (p.holiday === it.name || p.topic === it.name));

// Open the composer with the proposed message and a freshly rendered visual.
export async function postFromKeyDate(it, i = 0) {
  const a = await renderDesignToAsset(specFor(it, i), it.head);
  await api('GET', 'state', undefined, { quiet: true });
  openComposer({ date: it.date, caption: it.msg, topic: it.name, mediaId: a.id });
}

// A date kept for the team only, such as an editorial or advertising deadline.
export function openInternal(it) {
  const dt = new Date(it.date + 'T12:00');
  const md = modal(`<div class="mhead"><h2>${esc(it.name)}</h2><button class="x" data-close>×</button></div>
    <div class="mbody"><p><span class="kd-tag" style="--c:${cat(it.cat).color}">${esc(cat(it.cat).label)}</span> <span class="kd-warn int">Internal — not a post</span></p>
      <p><b>${esc(dt.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))}</b>${it.approx ? ' <span class="kd-warn">Confirm date</span>' : ''}</p>
      ${it.entity ? `<p class="muted">${esc(it.entity)}${it.where ? ' · ' + esc(it.where) : ''}</p>` : ''}
      ${it.url ? `<p><a href="${esc(it.url)}" target="_blank" rel="noopener">Open the source page</a></p>` : ''}
      <label>Reminder for the team</label><p class="kd-msg">${esc(it.msg)}</p></div>
    <div class="mfoot"><span class="grow"></span><button class="btn" data-close>Close</button></div>`, 'small');
}

// -------------------------------------------------------------------- panel
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ui = { span: 3 };

export function openKeyDates(start = new Date()) {
  const first = new Date(start.getFullYear(), start.getMonth(), 1);
  const md = modal(`<div class="mhead"><h2>Key dates</h2><span class="muted">Canadian and US holidays, plus the dates from your data sources</span><button class="x" data-close>×</button></div>
    <div class="mbody kd-body">
      <div id="kdpending"></div>
      <div class="kd-intro"><p class="muted">Only Canadian and US holidays are built in. Trade shows, publications, associations and other industry dates come from the lists you upload or link under <a href="#/sources" data-gosrc>Data sources</a>, or from dates you add below.</p>
        <div class="seg" id="kdspan">${[[1, MONTHS[first.getMonth()]], [3, '3 months'], [12, '12 months']].map(([n, l]) => `<button data-n="${n}">${l}</button>`).join('')}</div></div>
      <div class="kd-cathead"><label>Types of dates <span class="muted">— click to show or hide</span></label>
        <span><button class="btn sm ghost" data-all="1">Select all</button><button class="btn sm ghost" data-all="">Clear all</button></span></div>
      <div class="kd-cats" id="kdcats"></div>
      <details class="kd-add" id="kdmanage"><summary>Your own categories</summary>
        <p class="muted">Add your own types of dates, then add their dates below or choose them when you review dates from your sources.</p>
        <div id="kducats"></div>
        <div class="row wrap"><input id="kdcn" placeholder="New category — e.g. Regulatory deadlines" maxlength="40"><button class="btn" id="kdca">Add category</button></div></details>
      <div id="kdlistbox"></div>
      <details class="kd-add"><summary>Add your own date</summary><div class="row wrap">
        <input type="date" id="kdnd"><input id="kdnn" placeholder="Name — e.g. our annual client event">
        <select id="kdnc"></select>
        <button class="btn" id="kdna">Add</button></div></details>
    </div>
    <div class="mfoot"><button class="btn" data-gosrc>Data sources</button>
      <label class="check kd-auto"><input type="checkbox" id="kdauto"> Suggest a post for each date automatically</label><span class="grow"></span>
      <button class="btn" data-close>Close</button><button class="btn primary" id="kdgo" disabled>Create drafts</button></div>`, 'wide');
  const el = md.el, picked = new Set();
  let items = [];
  $('#kdauto', el).checked = kdSettings().auto;

  function range() {
    const end = new Date(first.getFullYear(), first.getMonth() + ui.span, 0);
    const today = ymd(new Date()), from = ymd(first);
    return [from < today && ui.span > 1 ? today : from, ymd(end)];
  }

  function drawCats(counts) {
    const k = kdSettings(), map = catMap(), pickedCat = $('#kdnc', el).value || 'custom';
    $('#kdcats', el).innerHTML = Object.keys(map).map((c) => `<button class="kd-chip ${k.cats[c] ? 'on' : ''}" data-cat="${c}" aria-pressed="${!!k.cats[c]}" style="--c:${map[c].color}">
      <i></i>${esc(map[c].label)}<b>${counts[c] || 0}</b></button>`).join('');
    $('#kdnc', el).innerHTML = Object.keys(map).filter((c) => !['canada', 'us'].includes(c)).map((c) => `<option value="${c}" ${c === pickedCat ? 'selected' : ''}>${esc(map[c].label)}</option>`).join('');
    $('#kducats', el).innerHTML = k.userCats.map((u) => `<div class="kd-ucat" data-u="${esc(u.id)}"><input type="color" value="${esc(u.color)}" aria-label="Colour"><input value="${esc(u.label)}" maxlength="40" aria-label="Category name">
      <button class="btn sm ghost" data-urm>Remove</button></div>`).join('');
    const n = k.pending.length;
    $('#kdpending', el).innerHTML = n ? `<div class="banner good kd-pend"><span class="grow">${n} date${n > 1 ? 's' : ''} found in your data sources ${n > 1 ? 'are' : 'is'} waiting for your review.</span><button class="btn sm" id="kdrev">Review</button></div>` : '';
  }

  function drawList() {
    const k = kdSettings(), [from, to] = range(), map = catMap();
    const all = keyDates(from, to, { cats: Object.fromEntries(Object.keys(map).map((c) => [c, true])) });
    const counts = {};
    all.forEach((it) => { counts[it.cat] = (counts[it.cat] || 0) + 1; });
    drawCats(counts);
    $$('#kdspan button', el).forEach((b) => b.classList.toggle('on', +b.dataset.n === ui.span));
    items = all.filter((it) => k.cats[it.cat]);
    [...picked].forEach((key) => { if (!items.some((it) => it.key === key)) picked.delete(key); });
    let html = '', month = '';
    items.forEach((it, i) => {
      const dt = new Date(it.date + 'T12:00'), mk = `${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
      if (mk !== month) { month = mk; html += `<h4 class="kd-month">${mk}</h4>`; }
      const done = planned(it), c = map[it.cat];
      html += `<div class="kd-row" data-key="${esc(it.key)}">
        <input type="checkbox" class="kd-pick" aria-label="Select ${esc(it.name)}" ${picked.has(it.key) ? 'checked' : ''} ${done || it.internal ? 'disabled' : ''}>
        <canvas class="kd-thumb" width="216" height="216" data-i="${i}"></canvas>
        <div class="hol-date"><b>${dt.getDate()}</b><span>${MONTHS[dt.getMonth()].slice(0, 3)}</span></div>
        <div class="grow"><div class="kd-title"><b>${esc(it.name)}</b><span class="kd-tag" style="--c:${c.color}">${esc(c.label)}</span>
            ${it.internal ? '<span class="kd-warn int">Internal — not a post</span>' : ''}${it.approx ? '<span class="kd-warn">Confirm date</span>' : ''}
            ${it.source === 'ai' ? '<span class="kd-warn">AI suggestion</span>' : it.source === 'source' ? '<span class="kd-warn src">From your sources</span>' : ''}</div>
          <small class="muted">${esc([it.entity, it.when, it.where].filter(Boolean).join(' · '))}${it.url ? ` <a href="${esc(it.url)}" target="_blank" rel="noopener">source page</a>` : ''}</small>
          <p class="kd-msg">${esc(it.msg)}</p>
          ${it.cat === 'tradeshow' ? `<label class="check kd-att"><input type="checkbox" data-att="${esc(it.key)}" ${k.attending[it.key] ? 'checked' : ''}> We are attending or exhibiting <span class="muted">— suggested posts will say “meet us there”</span></label>` : ''}
          ${it.approx && !it.custom ? `<label class="kd-fix">Exact date <input type="date" value="${it.date}" data-fix="${esc(it.key)}"></label>` : ''}</div>
        <div class="kd-act">${done ? '<span class="status scheduled">Planned</span>' : it.internal ? `<button class="btn sm" data-int="${i}">Details</button>` : `<button class="btn sm" data-make="${i}">Create post</button>`}
          ${it.custom ? `<button class="btn sm ghost" data-rm="${esc(it.key)}" title="Remove this date">Remove</button>` : ''}</div></div>`;
    });
    $('#kdlistbox', el).innerHTML = html || '<p class="muted pad">No dates in this period for the selected types. Switch a type on, or widen the period.</p>';
    wire();
    sync();
    (async () => { for (const c of $$('.kd-thumb', el)) { if (!c.isConnected) return; await paintThumb(c, specFor(items[+c.dataset.i], +c.dataset.i)); await new Promise((r) => setTimeout(r)); } })();
  }

  function sync() {
    const b = $('#kdgo', el);
    b.disabled = !picked.size;
    b.textContent = picked.size ? `Create ${picked.size} draft${picked.size > 1 ? 's' : ''}` : 'Create drafts';
  }

  function wire() {
    $$('.kd-chip', el).forEach((b) => (b.onclick = () => guard(async () => {
      const k = kdSettings();
      await saveKd({ cats: { ...k.cats, [b.dataset.cat]: !k.cats[b.dataset.cat] } });
      drawList();
    })));
    $$('.kd-pick', el).forEach((c) => (c.onchange = () => { const key = c.closest('.kd-row').dataset.key; c.checked ? picked.add(key) : picked.delete(key); sync(); }));
    $$('[data-make]', el).forEach((b) => (b.onclick = () => guard(async () => { const it = items[+b.dataset.make]; md.close(); await postFromKeyDate(it, +b.dataset.make); }, b)));
    $$('[data-int]', el).forEach((b) => (b.onclick = () => openInternal(items[+b.dataset.int])));
    $$('[data-att]', el).forEach((c) => (c.onchange = () => guard(async () => { const a = { ...kdSettings().attending }; if (c.checked) a[c.dataset.att] = true; else delete a[c.dataset.att];
      // Suggestions not yet approved for this show are written again with the new wording.
      const old = S.data.posts.filter((p) => p.suggested && String(p.keyDate || '').startsWith(c.dataset.att + ':')).map((p) => p.id);
      if (old.length) await api('POST', 'posts/bulk', { remove: old }, { quiet: true });
      await saveKd({ attending: a }); })));
    $$('[data-fix]', el).forEach((inp) => (inp.onchange = () => guard(async () => {
      if (!inp.value) return;
      await saveKd({ overrides: { ...kdSettings().overrides, [inp.dataset.fix]: inp.value } });
      toast('Date confirmed.'); drawList();
    })));
    $$('[data-rm]', el).forEach((b) => (b.onclick = () => guard(async () => { await saveKd({ custom: kdSettings().custom.filter((c) => c.id !== b.dataset.rm) }); drawList(); })));
    $$('.kd-ucat', el).forEach((row) => {
      const id = row.dataset.u, [colour, label] = $$('input', row);
      const save = () => guard(async () => { if (!label.value.trim()) return; await saveKd({ userCats: kdSettings().userCats.map((u) => (u.id === id ? { ...u, label: label.value.trim(), color: colour.value } : u)) }); drawList(); });
      colour.onchange = save; label.onchange = save;
      $('[data-urm]', row).onclick = async () => {
        if (!(await confirmBox('Remove this category?', 'Its dates are kept and move to “Your own dates”.', 'Remove', true))) return;
        guard(async () => { const k = kdSettings(), cats = { ...k.cats }; delete cats[id]; await saveKd({ userCats: k.userCats.filter((u) => u.id !== id), cats }); drawList(); });
      };
    });
    const rev = $('#kdrev', el);
    if (rev) rev.onclick = () => { md.close(); go('sources'); };
  }

  $$('[data-gosrc]', el).forEach((b) => (b.onclick = (e) => { e.preventDefault(); md.close(); go('sources'); }));
  $$('#kdspan button', el).forEach((b) => (b.onclick = () => { ui.span = +b.dataset.n; drawList(); }));
  $$('[data-all]', el).forEach((b) => (b.onclick = () => guard(async () => { await saveKd({ cats: Object.fromEntries(catKeys().map((c) => [c, !!b.dataset.all])) }); drawList(); })));
  $('#kdauto', el).onchange = (e) => guard(async () => { await saveKd({ auto: e.target.checked }); toast(e.target.checked ? 'Posts will be suggested for each date.' : 'Automatic suggestions are off. Suggestions already made are kept.'); });

  $('#kdca', el).onclick = (e) => guard(async () => {
    const label = $('#kdcn', el).value.trim(), k = kdSettings();
    if (!label) throw new Error('Name the category first.');
    const id = 'u' + Date.now().toString(36);
    await saveKd({ userCats: [...k.userCats, { id, label, color: PALETTE[k.userCats.length % PALETTE.length] }], cats: { ...k.cats, [id]: true } });
    $('#kdcn', el).value = ''; toast('Category added. Add its dates under “Add your own date”.'); drawList();
  }, e.currentTarget);

  $('#kdna', el).onclick = (e) => guard(async () => {
    const date = $('#kdnd', el).value, name = $('#kdnn', el).value.trim(), cat = $('#kdnc', el).value;
    if (!date || !name) throw new Error('Enter a date and a name.');
    const k = kdSettings();
    await saveKd({ custom: [...k.custom, { id: 'c' + Date.now().toString(36), date, name, cat, source: 'user' }], cats: { ...k.cats, [cat]: true } });
    $('#kdnn', el).value = '';
    toast('Date added.'); drawList();
  }, e.currentTarget);

  $('#kdgo', el).onclick = (e) => guard(async () => {
    const todo = items.map((it, i) => [it, i]).filter(([it]) => picked.has(it.key));
    const connected = Object.keys(S.data.channels).filter((c) => S.data.channels[c].connected && c !== 'youtube');
    const channels = connected.length ? connected : ['facebook', 'instagram', 'linkedin'];
    for (const [it, i] of todo) {
      const a = await renderDesignToAsset(specFor(it, i), it.head);
      await api('POST', 'posts', { caption: it.msg, captions: {}, channels, mediaIds: [a.id], topic: it.name, holiday: it.name, title: '',
        scheduledAt: toUtc(it.date, S.data.settings.defaultTime), status: 'draft' }, { quiet: true });
    }
    md.close();
    await api('GET', 'state');
    toast(`${todo.length} draft${todo.length > 1 ? 's' : ''} created. Review each one, then schedule.`, 'ok', 7000);
  }, e.currentTarget);

  drawList();
}
