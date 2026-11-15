// Data sources: the brand's own lists of industry publications, trade shows, competitors and
// associations, uploaded as files or linked from a shared drive. The assistant reads each source and
// the websites it lists, and proposes dated events. Nothing reaches the calendar before it is reviewed.
import { S, $, $$, api, esc, toast, guard, confirmBox, uploadFile, ymd, niceDate, go } from './core.js';
import { kdSettings, saveKd, keyDates, catMap, cat, catKeys, dateSig } from './keydates.js';

const TYPES = { tradeshows: 'Trade shows', publications: 'Industry publications', associations: 'Industry associations', competitors: 'Competitors', other: 'Other sources' };
const TYPE_CAT = { tradeshows: 'tradeshow', publications: 'publication', associations: 'association', competitors: 'competitor', other: 'industry' };
const CONF = { high: ['Date stated on the source', 'good'], medium: ['Confirm date', ''], low: ['Estimated date — confirm', ''] };
const ui = { type: 'tradeshows', status: '', busy: false };

const sources = () => S.data.settings.sources || [];
const saveSources = (list, quiet) => api('PUT', 'settings', { sources: list }, { quiet });

export function renderSources(root) {
  const list = sources(), k = kdSettings(), ai = S.data.ai.enabled, map = catMap(), pending = [...k.pending].sort((a, b) => a.date.localeCompare(b.date));
  const sure = pending.filter((d) => d.conf === 'high').length;
  root.innerHTML = `<header class="page-head"><div><h1>Data sources</h1><p>Lists of publications, trade shows, competitors and associations for ${esc(S.data.brand.name || 'this brand')}. The assistant reads them, visits the websites they list, and proposes dates for the calendar.</p></div>
      <button class="btn primary" id="sall" ${list.length && !ui.busy ? '' : 'disabled'}>Read all sources</button></header>
    ${ai ? '' : '<div class="banner bad">Reading sources needs an Anthropic API key. You can add and organise sources now; add the key in <a href="#/settings">Settings</a> to have them read.</div>'}
    <section class="panel"><h3>Add a source</h3>
      <div class="row wrap"><select id="stype" class="src-type" aria-label="What this source lists">${Object.entries(TYPES).map(([v, n]) => `<option value="${v}" ${v === ui.type ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <input id="surl" placeholder="Paste a link: web page, Google Drive, Docs, Sheets, Dropbox or OneDrive" autocomplete="off"><button class="btn" id="sadd">Add link</button>
        <label class="btn">Upload files<input type="file" id="sup" hidden multiple accept=".pdf,.docx,.xlsx,.csv,.txt,.md"></label></div>
      <small class="muted">Files: PDF, Word, Excel, CSV or text. A shared link must be viewable by anyone who has the link. A Google Drive folder link reads up to 8 files in that folder. Web addresses listed inside a source are visited to look for dates.</small>
    </section>
    <section class="panel"><h3>Sources <span class="muted">${list.length}</span></h3>
      ${list.length ? list.map((s) => `<div class="src-row" data-src="${esc(s.id)}"><span class="kd-tag" style="--c:${cat(TYPE_CAT[s.type]).color}">${esc(TYPES[s.type] || TYPES.other)}</span>
        <div class="grow"><b>${s.kind === 'link' ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>` : esc(s.name)}</b>
          <small class="muted">${s.scannedAt ? `Read ${esc(niceDate(new Date(s.scannedAt), true))} · ${s.found || 0} date${s.found === 1 ? '' : 's'} found${s.pages ? ` · ${s.pages} web page${s.pages > 1 ? 's' : ''} visited` : ''}` : 'Not read yet'}</small>
          ${s.error ? `<small class="src-err">${esc(s.error)}</small>` : ''}
          ${(s.unknown || []).length ? `<details><summary>No date found for ${s.unknown.length} name${s.unknown.length > 1 ? 's' : ''}</summary><small class="muted">${esc(s.unknown.join(', '))}. Add these dates yourself in Key dates, or link the page that shows them.</small></details>` : ''}</div>
        <button class="btn sm" data-scan ${ui.busy ? 'disabled' : ''}>${s.scannedAt ? 'Read again' : 'Read now'}</button><button class="btn sm ghost" data-del ${ui.busy ? 'disabled' : ''}>Remove</button></div>`).join('')
        : '<p class="muted">No sources yet. Add a link or upload a file above: for example, the list of trade shows you follow, or the media kit of an industry magazine.</p>'}
      <div class="src-status" id="sstat" role="status">${esc(ui.status)}</div>
    </section>
    <section class="panel"><h3>Dates to review <span class="muted">${pending.length}</span></h3>
      ${pending.length ? `<p class="muted">Check each date, change anything that is wrong, then accept it to put it on the calendar. Rejected dates are not proposed again.</p>
        <div class="row wrap rv-bulk">${sure ? `<button class="btn" id="rvsure">Accept the ${sure} with a stated date</button>` : ''}<button class="btn" id="rvall">Accept all ${pending.length}</button>
          <button class="btn ghost" id="rvnone">Reject all</button></div>
        ${pending.map((d) => `<div class="rv-row" data-rv="${esc(d.id)}">
          <div class="rv-main"><div class="row wrap"><input type="date" class="rv-date" value="${esc(d.date)}" aria-label="Date"><input class="rv-name" value="${esc(d.name)}" aria-label="Name">
              <select class="rv-cat" aria-label="Type of date">${Object.keys(map).filter((c) => !['canada', 'us'].includes(c)).map((c) => `<option value="${c}" ${c === d.cat ? 'selected' : ''}>${esc(map[c].label)}</option>`).join('')}</select></div>
            <div class="kd-title"><span class="kd-warn ${CONF[d.conf][1]}">${CONF[d.conf][0]}</span>${d.internal ? '<span class="kd-warn int">Internal — not a post</span>' : ''}
              <small class="muted">${esc([d.entity, d.when, d.where].filter(Boolean).join(' · '))}${d.url ? ` <a href="${esc(d.url)}" target="_blank" rel="noopener">source page</a>` : ''}</small></div>
            <p class="kd-msg">${esc(d.msg)}</p></div>
          <div class="kd-act"><button class="btn sm primary" data-yes>Accept</button><button class="btn sm ghost" data-no>Reject</button></div></div>`).join('')}`
        : `<p class="muted">Nothing waiting. ${list.length ? 'Read your sources to look for new dates.' : 'Dates found in your sources will appear here for you to check.'}</p>`}
      <button class="btn sm ghost" id="skd">Open the calendar</button>
    </section>`;

  $('#stype', root).onchange = (e) => { ui.type = e.target.value; };
  $('#skd', root).onclick = () => go('calendar');

  $('#sadd', root).onclick = (e) => guard(async () => {
    let url = $('#surl', root).value.trim();
    if (!url) throw new Error('Paste a link first.');
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    let u;
    try { u = new URL(url); } catch (x) { u = null; }
    if (!u || !u.hostname.includes('.')) throw new Error('That does not look like a web address.');
    if (sources().some((s) => s.url === url)) throw new Error('This link is already in your sources.');
    const name = (u.hostname.replace(/^www\./, '') + (u.pathname.length > 1 ? u.pathname : '')).slice(0, 70);
    await saveSources([...sources(), { id: 'src' + Date.now().toString(36), type: ui.type, kind: 'link', name, url, addedAt: new Date().toISOString() }]);
    toast('Link added. Choose “Read now” to look for dates.');
  }, e.currentTarget);

  $('#sup', root).onchange = (e) => guard(async () => {
    const files = [...e.target.files];
    for (const f of files) {
      const a = await uploadFile(f, 'source');
      await saveSources([...sources(), { id: 'src' + Date.now().toString(36), type: ui.type, kind: 'file', name: f.name.slice(0, 70), assetId: a.id, addedAt: new Date().toISOString() }]);
    }
    toast(`${files.length} file${files.length > 1 ? 's' : ''} added. Choose “Read now” to look for dates.`);
  });

  $$('[data-src]', root).forEach((row) => {
    const src = () => sources().find((s) => s.id === row.dataset.src);
    $('[data-scan]', row).onclick = () => scan([src()], root);
    $('[data-del]', row).onclick = async () => {
      const s = src();
      if (!(await confirmBox('Remove this source?', 'The source is removed. Dates you already accepted from it stay on the calendar.', 'Remove', true))) return;
      guard(async () => {
        if (s.kind === 'file' && s.assetId) await api('DELETE', 'assets/' + s.assetId, undefined, { quiet: true });
        await saveSources(sources().filter((x) => x.id !== s.id));
      });
    };
  });
  $('#sall', root).onclick = () => scan(sources(), root);

  // ---- review
  // A correction typed into a row is kept straight away, so it survives when other rows are accepted or rejected.
  const typed = (row) => ({ date: $('.rv-date', row).value, name: $('.rv-name', row).value.trim(), cat: $('.rv-cat', row).value });
  const current = (items) => { const ids = new Set(items.map((d) => d.id)); return kdSettings().pending.filter((d) => ids.has(d.id)); };
  const accept = (items) => guard(async () => {
    const k2 = kdSettings(), list = current(items), ids = new Set(list.map((d) => d.id));
    const add = list.map((d) => {
      if (!d.date || !d.name) throw new Error('Each date needs a day and a name.');
      // a date corrected by hand counts as confirmed
      return { id: d.id, date: d.date, name: d.name, cat: d.cat, source: 'source', approx: d.fixed ? false : d.conf !== 'high', when: d.when || '', where: d.where || '', msg: d.msg || '', head: d.head || '', sub: d.sub || '',
        internal: !!d.internal || d.cat === 'competitor', entity: d.entity || '', url: d.url || '', end: d.fixed ? '' : d.end || '' };
    });
    await saveKd({ custom: [...k2.custom, ...add], pending: k2.pending.filter((d) => !ids.has(d.id)), cats: { ...k2.cats, ...Object.fromEntries(add.map((d) => [d.cat, true])) } });
    toast(`${add.length} date${add.length > 1 ? 's' : ''} added to the calendar.`);
  });
  const reject = (items) => guard(async () => {
    const k2 = kdSettings(), list = current(items), ids = new Set(list.map((d) => d.id));
    await saveKd({ pending: k2.pending.filter((d) => !ids.has(d.id)), rejected: [...k2.rejected, ...list.map(dateSig)].slice(-600) });
  });
  $$('[data-rv]', root).forEach((row) => {
    const d = pending.find((x) => x.id === row.dataset.rv);
    $$('input, select', row).forEach((inp) => (inp.onchange = () => guard(() => {
      const v = typed(row);
      return saveKd({ pending: kdSettings().pending.map((x) => (x.id === d.id ? { ...x, ...v, fixed: x.fixed || v.date !== x.date } : x)) }, true);
    })));
    $('[data-yes]', row).onclick = () => accept([d]);
    $('[data-no]', row).onclick = () => reject([d]);
  });
  const on = (id, fn) => { const b = $('#' + id, root); if (b) b.onclick = fn; };
  on('rvsure', () => accept(pending.filter((d) => d.conf === 'high')));
  on('rvall', () => accept(pending));
  on('rvnone', async () => { if (await confirmBox('Reject all dates?', `${pending.length} proposed date${pending.length > 1 ? 's' : ''} will be discarded and not proposed again.`, 'Reject all', true)) reject(pending); });
}

// Read sources one at a time, so progress is visible and one unreadable source does not stop the rest.
async function scan(list, root) {
  if (ui.busy) return;
  if (!S.data.ai.enabled) return toast('Reading sources needs an Anthropic API key. Add one in Settings.', 'err');
  const today = new Date(), from = ymd(today), to = ymd(new Date(today.getFullYear(), today.getMonth() + 18, today.getDate()));
  const everything = Object.fromEntries(catKeys().map((c) => [c, true]));
  let added = 0, failed = 0;
  ui.busy = true;
  try {
    for (let i = 0; i < list.length; i++) {
      const src = list[i];
      ui.status = `Reading ${i + 1} of ${list.length}: ${src.name}. This can take a minute or two…`;
      if (location.hash.startsWith('#/sources')) renderSources(root);
      let res = null, error = '';
      try {
        res = await api('POST', 'sources', { id: src.id, from, to, industry: kdSettings().industry, known: keyDates(from, to, { cats: everything }).map((it) => it.name).slice(0, 200) }, { quiet: true });
      } catch (e) { if (e.login) throw e; error = e.message; failed++; }
      const k = kdSettings(), seen = new Set([...k.custom, ...k.pending].map(dateSig).concat(k.rejected));
      const fresh = res ? res.dates.filter((d) => !seen.has(dateSig(d))) : [];
      added += fresh.length;
      const next = sources().map((s) => (s.id === src.id ? { ...s, scannedAt: new Date().toISOString(), found: res ? res.dates.length : 0, pages: res ? res.pages : 0, unknown: res ? res.unknown : [], error } : s));
      await api('PUT', 'settings', { sources: next, keyDates: { ...k, pending: [...k.pending, ...fresh] } }, { quiet: true });
    }
    ui.status = `Done. ${added} new date${added === 1 ? '' : 's'} to review${failed ? `; ${failed} source${failed > 1 ? 's' : ''} could not be read (see the message beside it)` : ''}.`;
  } catch (e) { ui.status = ''; toast(e.message, 'err'); } finally { ui.busy = false; }
  if (root.isConnected && location.hash.startsWith('#/sources')) renderSources(root);
}
