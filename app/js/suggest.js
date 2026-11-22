// Automatic post suggestions: for every key date that is switched on, a suggested draft is added to
// the calendar, written and laid out according to the type of date. Nothing is scheduled or published
// until it is approved. Dismissed suggestions do not come back.
import { S, $, $$, api, esc, toast, guard, modal, confirmBox, refresh, ymd, toUtc, fromUtc, niceDate, postDay, CH } from './core.js';
import { kdSettings, saveKd, keyDates, specFor, compose, cat, paintThumb } from './keydates.js';
import { renderDesignToAsset } from './studio.js';
import { openComposer } from './composer.js';

const HORIZON = 60;   // days ahead that suggestions are prepared for
const MAX_NEW = 60;   // suggestions added in one pass
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00'); d.setDate(d.getDate() + n); return ymd(d); };
const PHASE = { before: 'One week before', day: '', after: 'After the show' };

// What to post about a date, by its type. A trade show gets three posts: before, opening day and after.
// Holidays get a greeting; publication, association and other dates get one post on the day.
function phases(it, v = 0) {
  const year = it.date.slice(0, 4), B = S.data.brand.name || 'our team';
  if (it.cat !== 'tradeshow') {
    const t = it.own ? { msg: it.msg, head: it.head, sub: it.sub } : compose(it.cat, it.name, year, it.opts || {}, v);
    return [{ phase: 'day', date: it.date, ...t }];
  }
  const short = (it.opts && it.opts.short) || it.name, at = it.where ? ` in ${it.where}` : '', going = !!kdSettings().attending[it.key];
  return [
    { phase: 'before', date: addDays(it.date, -7), ...(going
      ? { msg: `Meet ${B} at ${it.name} ${year}${at}. We will be there. Going too? Tell us: we would like to see you.`, head: `Meet us at ${short}`, sub: it.where || `${short} ${year}` }
      : { msg: `${it.name} ${year} opens in a week${at}. Going? Tell us what is on your list: ${B} will share the ideas worth bringing back.`, head: `${short} ${year}`, sub: 'One week to go' }) },
    { phase: 'day', date: it.date, ...(going
      ? { msg: `${it.name} opens today${at}. Come and say hello to the ${B} team: we will share what we see from the floor.`, head: `Live from ${short}`, sub: 'Come and say hello' }
      : { msg: `${it.name} opens today${at}. ${B} is following the announcements and will share the ideas worth knowing about.`, head: `${short} opens today`, sub: 'What we are watching' }) },
    { phase: 'after', date: addDays(it.end || it.date, it.end ? 1 : 3), ...(going
      ? { msg: `${it.name} ${year} has wrapped up. Thank you to everyone who came to see the ${B} team. What was your biggest takeaway?`, head: `${short}: that's a wrap`, sub: 'Thank you for coming by' }
      : { msg: `${it.name} ${year} has wrapped up. Which idea are you bringing back? ${B} would like to hear it.`, head: `${short}: that's a wrap`, sub: 'Which idea are you bringing back?' }) },
  ];
}

// Every suggestion that should exist for the coming weeks. Internal dates (such as deadlines) never become posts.
function wanted() {
  const today = ymd(new Date()), limit = addDays(today, HORIZON), out = [];
  keyDates(addDays(today, -12), addDays(limit, 10)).forEach((it, i) => {
    if (it.internal) return;
    phases(it).forEach((ph) => { if (ph.date > today && ph.date <= limit) out.push({ skey: `${it.key}:${ph.phase}`, it, i, ...ph }); });
  });
  return out;
}
const lookup = (p) => wanted().find((w) => w.skey === p.keyDate);

function draft(w, v = 0) {
  const tags = (S.data.brand.hashtags || '').trim();
  const connected = Object.keys(S.data.channels).filter((c) => S.data.channels[c].connected && c !== 'youtube');
  const channels = connected.length ? connected : ['facebook', 'instagram', 'linkedin'], captions = {};
  if (tags) channels.forEach((c) => { if (c !== 'facebook') captions[c] = `${w.msg}\n\n${tags}`; });
  return { caption: w.msg, captions, channels, mediaIds: [], topic: w.it.name, holiday: w.it.name, title: '', scheduledAt: toUtc(w.date, S.data.settings.defaultTime), status: 'draft',
    suggested: true, keyDate: w.skey, kdCat: w.it.cat, variant: v, design: { ...specFor(w.it, w.i, v), headline: w.head, subline: w.sub } };
}

export const suggestions = () => S.data.posts.filter((p) => p.suggested && p.status === 'draft').sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
export const dismissKey = (skey) => saveKd({ dismissed: [...new Set([...kdSettings().dismissed, skey])].slice(-800) }, true);

// Keep the suggested drafts in step with the key dates: add the missing ones, drop the ones whose
// date was switched off, moved or has passed. Runs after every change, and does nothing when all is in order.
let timer, busy = false, stopped = false;
export function scheduleSync() { clearTimeout(timer); timer = setTimeout(syncSuggestions, 1200); }
export async function syncSuggestions() {
  if (busy || stopped || !S.data || document.querySelector('.login')) return;
  const k = kdSettings(), today = ymd(new Date()), posts = S.data.posts, want = wanted(), byKey = new Map(want.map((w) => [w.skey, w]));
  const stale = (p) => postDay(p) <= today || (k.auto && (!byKey.has(p.keyDate) || byKey.get(p.keyDate).date !== postDay(p)));
  const remove = posts.filter((p) => p.suggested && p.status === 'draft' && stale(p)).map((p) => p.id);
  const gone = new Set(remove), have = new Set(posts.filter((p) => p.keyDate && !gone.has(p.id)).map((p) => p.keyDate)), dismissed = new Set(k.dismissed);
  const taken = (w) => posts.some((p) => !p.suggested && postDay(p) === w.date && (p.holiday === w.it.name || p.topic === w.it.name));
  const todo = !k.auto ? [] : want.filter((w) => !have.has(w.skey) && !dismissed.has(w.skey) && !taken(w)).slice(0, MAX_NEW);
  if (!remove.length && !todo.length) return;
  busy = true;
  try {
    await api('POST', 'posts/bulk', { create: todo.map((w) => draft(w)), remove }, { quiet: true });
    // Safety stop: if the suggestions did not arrive as sent, do not try again in a loop.
    if (todo.length && !todo.every((w) => S.data.posts.some((p) => p.keyDate === w.skey))) stopped = true;
    const a = document.activeElement, typing = a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && !a.closest('.overlay');
    if (!typing) refresh();
    if (todo.length) toast(`${todo.length} post suggestion${todo.length > 1 ? 's' : ''} added for your coming key dates. Review them under Posts → Suggested.`, 'ok', 7000);
  } catch (e) { stopped = true; } finally { busy = false; }
}

// ------------------------------------------------------------------ actions
const brief = (w, ph) => `${w.it.name} (${cat(w.it.cat).label}${w.it.where ? ', ' + w.it.where : ''}), on ${w.it.date}. `
  + { before: 'This post goes out a week before it starts. ', day: 'This post goes out on the day. ', after: 'This post goes out just after it ends: look back on it. ' }[ph.phase]
  + (w.it.cat === 'tradeshow' ? (kdSettings().attending[w.it.key] ? 'The brand is attending: invite people to meet the team there. ' : 'Do not say or imply that the brand attends or exhibits. ') : '')
  + 'Do not invent facts about the event.';

export async function approve(p, quiet) {
  if (fromUtc(p.scheduledAt) < new Date()) throw new Error('This date has passed. Dismiss the suggestion, or edit it and pick a new date.');
  const a = (p.mediaIds || []).length || !p.design ? null : await renderDesignToAsset(p.design, p.design.headline);
  await api('PUT', 'posts/' + p.id, { ...(a ? { mediaIds: [a.id] } : {}), status: 'scheduled', suggested: false }, { quiet: !!quiet });
}

// Approve a list in one go. Dates that are still estimates are left for the user to confirm first.
export async function approveMany(list) {
  let done = 0, held = 0;
  const now = new Date(), known = wanted();
  for (const p of list) {
    const w = known.find((x) => x.skey === p.keyDate);
    if ((w && w.it.approx) || fromUtc(p.scheduledAt) < now) { held++; continue; }
    await approve(p, true); done++;
  }
  await api('GET', 'state');
  toast(`${done} post${done === 1 ? '' : 's'} scheduled.${held ? ` ${held} left for you to review: the date is not confirmed, or has passed.` : ''}`, 'ok', 8000);
}

async function edit(p) {
  let post = p;
  if (!(p.mediaIds || []).length && p.design) {
    const a = await renderDesignToAsset(p.design, p.design.headline);
    post = (await api('PUT', 'posts/' + p.id, { mediaIds: [a.id] }, { quiet: true })).post;
  }
  openComposer({ post });
}

async function regenerate(p) {
  const w = lookup(p);
  if (!w) throw new Error('This date is no longer on your calendar. Dismiss the suggestion.');
  const v = (p.variant || 0) + 1, ph = phases(w.it, v).find((x) => x.phase === w.phase) || w, ai = S.data.ai.enabled;
  let { caption, captions } = draft({ ...w, ...ph }, v), head = ph.head, sub = ph.sub;
  if (ai) {
    const r = await api('POST', 'generate', { type: 'post', topic: brief(w, ph), channels: p.channels }, { quiet: true }), caps = r.captions || {};
    caption = caps[p.channels[0]] || Object.values(caps)[0] || caption;
    captions = {};
    p.channels.forEach((c) => { if (caps[c] && caps[c] !== caption) captions[c] = caps[c]; });
    head = r.headline || head; sub = r.subline || sub;
  }
  await api('PUT', 'posts/' + p.id, { caption, captions, variant: v, mediaIds: [], design: { ...specFor(w.it, w.i, v), headline: head, subline: sub } });
  toast(ai ? 'New version written. Review it before approving.' : 'New layout and wording. Add an AI key in Settings for original copy.');
}

async function dismiss(p) {
  await api('POST', 'posts/bulk', { remove: [p.id] }, { quiet: true });
  await dismissKey(p.keyDate);
  refresh();
}

// ----------------------------------------------------------------------- UI
export function suggestionRow(p) {
  const dt = fromUtc(p.scheduledAt), c = cat(p.kdCat), phase = String(p.keyDate || '').split(':').pop(), w = lookup(p);
  return `<div class="kd-row sg-row" data-sgrow="${p.id}">
    <canvas class="kd-thumb" width="216" height="216"></canvas>
    <div class="hol-date"><b>${dt.getDate()}</b><span>${dt.toLocaleString('en-CA', { month: 'short' }).replace('.', '')}</span></div>
    <div class="grow"><div class="kd-title"><b>${esc(p.topic)}</b><span class="kd-tag" style="--c:${c.color}">${esc(c.label)}</span>
        ${PHASE[phase] ? `<span class="kd-warn src">${PHASE[phase]}</span>` : ''}${w && w.it.approx ? '<span class="kd-warn">Confirm date</span>' : ''}</div>
      <small class="muted">${esc(niceDate(dt, true))} · ${p.channels.map((k) => CH[k].name).join(', ')}</small>
      <p class="kd-msg">${esc(p.caption)}</p></div>
    <div class="kd-act"><button class="btn sm primary" data-ok>Approve</button><button class="btn sm" data-edit>Edit</button>
      <button class="btn sm ghost" data-re>Regenerate</button><button class="btn sm ghost" data-no>Dismiss</button></div></div>`;
}

export function bindSuggestions(root, after = () => {}) {
  $$('[data-sgrow]', root).forEach((row) => {
    const get = () => S.data.posts.find((p) => p.id === row.dataset.sgrow), p = get();
    if (!p) return;
    if (p.design) paintThumb($('canvas', row), p.design);
    $('[data-ok]', row).onclick = async (e) => {
      const btn = e.currentTarget, w = lookup(get());
      if (w && w.it.approx && !(await confirmBox('The date is not confirmed', `The date of “${p.topic}” is an estimate. Check it before the post goes out, or schedule it anyway.`, 'Schedule anyway'))) return;
      guard(async () => { await approve(get()); toast('Scheduled. It will publish at its planned time.'); after('approve'); }, btn);
    };
    $('[data-edit]', row).onclick = (e) => guard(async () => { await edit(get()); after('edit'); }, e.currentTarget);
    $('[data-re]', row).onclick = (e) => guard(async () => { await regenerate(get()); after('regenerate'); }, e.currentTarget);
    $('[data-no]', row).onclick = (e) => guard(async () => { await dismiss(get()); after('dismiss'); }, e.currentTarget);
  });
}

// One suggestion, opened from the calendar.
export function openSuggestion(post) {
  const md = modal(`<div class="mhead"><h2>Suggested post</h2><span class="muted">Not scheduled until you approve it</span><button class="x" data-close>×</button></div>
    <div class="mbody" id="sgone"></div>`, 'medium');
  const show = () => {
    const p = S.data.posts.find((x) => x.id === post.id);
    if (!p || !p.suggested) return md.close();
    $('#sgone', md.el).innerHTML = suggestionRow(p);
    bindSuggestions(md.el, (what) => (what === 'regenerate' ? show() : md.close()));
  };
  show();
}
