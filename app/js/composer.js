// Post composer: channels, caption (shared or per channel), media, schedule, preview.
import { S, $, $$, api, esc, toast, guard, modal, confirmBox, pickAsset, asset, isVideo, isImage, uploadFile, thumb,
  CH, CH_KEYS, chBadge, ymd, hm, toUtc, fromUtc, niceDate, photos, STATUS } from './core.js';
import { renderDesignToAsset } from './studio.js';
import { dismissKey } from './suggest.js';

export function openComposer(init = {}) {
  const existing = init.post;
  const when = existing && existing.scheduledAt ? fromUtc(existing.scheduledAt) : null;
  const connected = CH_KEYS.filter((k) => S.data.channels[k].connected);
  const d = {
    id: existing ? existing.id : null,
    status: existing ? existing.status : 'draft',
    channels: existing ? [...existing.channels] : (init.channels || (connected.length ? connected.filter((k) => k !== 'youtube') : ['facebook', 'instagram', 'linkedin'])),
    caption: existing ? existing.caption || '' : init.caption || '',
    captions: existing ? { ...(existing.captions || {}) } : { ...(init.captions || {}) },
    title: existing ? existing.title || '' : init.title || '',
    mediaId: existing ? (existing.mediaIds || [])[0] || '' : init.mediaId || '',
    date: when ? ymd(when) : init.date || ymd(new Date(Date.now() + 86400000)),
    time: when ? hm(when) : S.data.settings.defaultTime || '09:00',
    topic: existing ? existing.topic || '' : init.topic || (init.holiday ? init.holiday.name : ''),
    holiday: existing ? existing.holiday || '' : (init.holiday ? init.holiday.name : ''),
    headline: '', subline: '',
    results: existing ? existing.results || {} : {},
  };
  let tab = 'all', pv = d.channels[0] || 'facebook';
  const locked = ['published', 'publishing'].includes(d.status);
  const ai = S.data.ai.enabled;

  const m = modal(`<div class="mhead"><h2>${existing ? 'Edit post' : 'New post'}</h2>
      ${existing ? `<span class="status ${d.status}">${STATUS[d.status]}</span>` : ''}<button class="x" data-close>×</button></div>
    <div class="mbody composer"><div class="c-form">
      <label>Publish to</label><div class="ch-row" id="chs"></div>
      <div class="ai-box"><label>${d.holiday ? 'Holiday post' : 'Let the assistant draft it'}</label>
        <div class="row"><input id="topic" placeholder="Topic — e.g. our process, a client tip, an announcement" value="${esc(d.topic)}">
        <select id="tone"><option value="">Brand voice</option><option>Friendly</option><option>Expert</option><option>Bold</option><option>Warm</option></select>
        <button class="btn accent" id="gen">✦ Draft</button></div>
        <small class="muted">${ai ? 'Written by Claude from your brand kit and website.' : 'Drafted from your website text. Add an AI key in Settings for original copy.'}</small></div>
      <div class="cap-tabs" id="captabs"></div>
      <textarea id="caption" rows="8" placeholder="Write your caption…"></textarea>
      <div class="counter" id="counter"></div>
      <div id="ytrow"></div>
      <label>Media</label><div id="media"></div>
      <label>When</label><div class="row"><input type="date" id="date" value="${d.date}"><input type="time" id="time" value="${d.time}">
        <span class="muted tz">${Intl.DateTimeFormat().resolvedOptions().timeZone.replace('_', ' ')}</span></div>
      <div id="hints"></div>
    </div><div class="c-preview"><div class="pv-tabs" id="pvtabs"></div><div id="pv"></div><div id="results"></div></div></div>
    <div class="mfoot">${existing ? '<button class="btn ghost danger-text" id="del">Delete</button>' : ''}<span class="grow"></span>
      <button class="btn" id="draft">Save draft</button><button class="btn" id="now">Publish now</button>
      <button class="btn primary" id="sched">Schedule</button></div>`, 'wide');
  const el = m.el, cap = $('#caption', el);

  const capFor = (k) => d.captions[k] || d.caption;
  const media = () => asset(d.mediaId);

  function drawChannels() {
    $('#chs', el).innerHTML = CH_KEYS.map((k) => {
      const on = d.channels.includes(k), ok = S.data.channels[k].connected;
      return `<button class="ch-toggle ${on ? 'on' : ''}" data-k="${k}">${chBadge(k)}<span>${CH[k].name}</span>${ok ? '' : '<em>not connected</em>'}</button>`;
    }).join('');
    $$('#chs button', el).forEach((b) => (b.onclick = () => {
      const k = b.dataset.k;
      d.channels = d.channels.includes(k) ? d.channels.filter((x) => x !== k) : CH_KEYS.filter((x) => d.channels.includes(x) || x === k);
      if (!d.channels.includes(tab)) tab = 'all';
      if (!d.channels.includes(pv)) pv = d.channels[0] || 'facebook';
      refresh();
    }));
  }

  function drawTabs() {
    $('#captabs', el).innerHTML = `<button class="${tab === 'all' ? 'on' : ''}" data-t="all">All channels</button>` +
      d.channels.map((k) => `<button class="${tab === k ? 'on' : ''}" data-t="${k}">${CH[k].name}${d.captions[k] ? ' •' : ''}</button>`).join('');
    $$('#captabs button', el).forEach((b) => (b.onclick = () => { tab = b.dataset.t; if (tab !== 'all') pv = tab; refresh(); }));
    cap.value = tab === 'all' ? d.caption : d.captions[tab] || '';
    cap.placeholder = tab === 'all' ? 'Write your caption…' : `Custom caption for ${CH[tab].name} (leave empty to use the shared caption)`;
    $('#ytrow', el).innerHTML = d.channels.includes('youtube')
      ? `<label>YouTube title</label><input id="yt" maxlength="100" value="${esc(d.title)}" placeholder="Video title (max 100 characters)">` : '';
    const yt = $('#yt', el);
    if (yt) yt.oninput = () => { d.title = yt.value; drawPreview(); };
  }

  function drawCounter() {
    const keys = tab === 'all' ? d.channels : [tab];
    $('#counter', el).innerHTML = keys.map((k) => {
      const n = capFor(k).length, over = n > CH[k].limit;
      return `<span class="${over ? 'over' : ''}">${chBadge(k, true)} ${n.toLocaleString()} / ${CH[k].limit.toLocaleString()}</span>`;
    }).join('');
  }

  function drawMedia() {
    const a = media();
    $('#media', el).innerHTML = a
      ? `<div class="media-chip">${thumb(a)}<div><b>${esc(a.name)}</b><small class="muted">${isVideo(a) ? 'Video' : 'Image'} · ${(a.size / 1048576).toFixed(1)} MB</small></div>
         <button class="btn sm ghost" id="mrm">Remove</button></div>`
      : `<div class="row wrap"><button class="btn sm" id="mlib">Choose from library</button><button class="btn sm" id="mgen">✦ Create visual</button>
         <label class="btn sm">Upload<input type="file" id="mup" accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm" hidden></label></div>`;
    const on = (id, fn) => { const b = $('#' + id, el); if (b) b[b.tagName === 'INPUT' ? 'onchange' : 'onclick'] = fn; };
    on('mrm', () => { d.mediaId = ''; refresh(); });
    on('mlib', async () => { const p = await pickAsset((x) => (isImage(x) && x.kind !== 'logo') || isVideo(x)); if (p) { d.mediaId = p.id; refresh(); } });
    on('mup', (e) => guard(async () => { const f = e.target.files[0]; if (!f) return; const up = await uploadFile(f, f.type.startsWith('video') ? 'reel' : 'photo'); d.mediaId = up.id; refresh(); }));
    on('mgen', (e) => guard(async () => {
      const text = d.headline || (d.caption || d.topic || S.data.brand.tagline || S.data.brand.name).split(/[\n.!?]/)[0].slice(0, 70);
      const pool = photos(), pick = pool.length ? pool[Math.floor(Math.random() * pool.length)].id : '';
      const up = await renderDesignToAsset({ format: 'square', template: d.holiday ? 'festive' : pick ? 'photo' : 'bold', headline: text, subline: d.subline || '', photoId: d.holiday ? '' : pick, logo: true });
      d.mediaId = up.id; refresh();
    }, e.currentTarget));
  }

  function drawHints() {
    const a = media(), hints = [];
    if (d.channels.includes('instagram') && !a) hints.push('Instagram needs an image or a video.');
    if (d.channels.includes('youtube') && !isVideo(a)) hints.push('YouTube needs a video — create a reel in Studio.');
    if (a && a.mime === 'video/webm' && d.channels.some((k) => k === 'instagram' || k === 'facebook')) hints.push('Facebook and Instagram expect MP4 video; this WebM file may be rejected.');
    const off = d.channels.filter((k) => !S.data.channels[k].connected);
    if (off.length) hints.push(`${off.map((k) => CH[k].name).join(', ')} ${off.length > 1 ? 'are' : 'is'} not connected yet — connect in Channels before the publish time.`);
    $('#hints', el).innerHTML = hints.map((h) => `<div class="hint">${esc(h)}</div>`).join('');
  }

  function drawPreview() {
    $('#pvtabs', el).innerHTML = d.channels.map((k) => `<button class="${pv === k ? 'on' : ''}" data-k="${k}">${chBadge(k, true)} ${CH[k].name}</button>`).join('');
    $$('#pvtabs button', el).forEach((b) => (b.onclick = () => { pv = b.dataset.k; drawPreview(); }));
    const a = media(), b = S.data.brand, text = capFor(pv);
    const who = S.data.channels[pv] && S.data.channels[pv].name || b.name || 'Your brand';
    const mediaHtml = a ? (isVideo(a) ? `<video src="${a.url}" controls muted playsinline></video>` : `<img src="${a.url}" alt="">`) : '';
    $('#pv', el).innerHTML = !d.channels.length ? '<p class="muted pad">Select at least one channel.</p>' : `<div class="pv-card ${pv}">
      <div class="pv-head"><span class="avatar">${esc((who.replace('@', '')[0] || 'U').toUpperCase())}</span><div><b>${esc(who)}</b>
      <small>${esc(niceDate(new Date(`${d.date}T${d.time}`), true))}</small></div></div>
      ${pv === 'youtube' ? `${mediaHtml}<div class="pv-text"><b>${esc(d.title || 'Video title')}</b><br>${esc(text)}</div>`
        : pv === 'instagram' ? `${mediaHtml || '<div class="pv-empty">Image or video required</div>'}<div class="pv-text"><b>${esc(who.replace('@', ''))}</b> ${esc(text)}</div>`
        : `<div class="pv-text">${esc(text) || '<span class="muted">Your caption will appear here.</span>'}</div>${mediaHtml}`}</div>`;
    const res = Object.entries(d.results);
    $('#results', el).innerHTML = res.length ? `<div class="results">${res.map(([k, r]) => `<div class="${r.ok ? 'ok' : 'bad'}">${chBadge(k, true)}
      ${r.ok ? `Published${r.url ? ` · <a href="${esc(r.url)}" target="_blank" rel="noopener">view</a>` : ''}` : esc(r.error || 'Failed')}</div>`).join('')}</div>` : '';
  }

  function refresh() { drawChannels(); drawTabs(); drawCounter(); drawMedia(); drawHints(); drawPreview(); }

  cap.oninput = () => {
    if (tab === 'all') d.caption = cap.value;
    else if (cap.value) d.captions[tab] = cap.value; else delete d.captions[tab];
    drawCounter(); drawPreview();
  };
  $('#date', el).onchange = (e) => { d.date = e.target.value; drawPreview(); };
  $('#time', el).onchange = (e) => { d.time = e.target.value; drawPreview(); };

  $('#gen', el).onclick = (e) => guard(async () => {
    d.topic = $('#topic', el).value;
    if (!d.channels.length) throw new Error('Select at least one channel first.');
    const r = await api('POST', 'generate', { type: 'post', topic: d.topic, tone: $('#tone', el).value, channels: d.channels }, { quiet: true });
    const caps = r.captions || {};
    d.captions = {};
    d.channels.forEach((k) => { if (caps[k]) d.captions[k] = caps[k]; });
    d.caption = caps[d.channels[0]] || Object.values(caps)[0] || d.caption;
    if (d.captions[d.channels[0]] === d.caption) delete d.captions[d.channels[0]];
    d.title = r.youtubeTitle || d.title; d.headline = r.headline || ''; d.subline = r.subline || '';
    tab = 'all'; refresh();
    toast(r.source === 'ai' ? 'Draft written. Review before scheduling.' : 'Draft assembled from your website text. Review and edit.');
  }, e.currentTarget);

  function payload(status) {
    return { caption: d.caption, captions: d.captions, channels: d.channels, title: d.title, topic: d.topic, holiday: d.holiday,
      mediaIds: d.mediaId ? [d.mediaId] : [], scheduledAt: toUtc(d.date, d.time), status, ...(existing && existing.suggested ? { suggested: false } : {}) };
  }
  async function save(status) {
    if (!d.channels.length) throw new Error('Select at least one channel.');
    if (status !== 'draft' && !d.caption.trim() && !d.mediaId) throw new Error('Add a caption or media first.');
    const over = d.channels.find((k) => capFor(k).length > CH[k].limit);
    if (status !== 'draft' && over) throw new Error(`The caption is too long for ${CH[over].name}.`);
    const j = d.id ? await api('PUT', 'posts/' + d.id, payload(status)) : await api('POST', 'posts', payload(status));
    d.id = j.post.id;
    return j.post;
  }

  $('#draft', el).onclick = (e) => guard(async () => { await save('draft'); m.close(); toast('Draft saved.'); }, e.currentTarget);
  $('#sched', el).onclick = (e) => guard(async () => {
    if (new Date(`${d.date}T${d.time}`) < new Date()) throw new Error('That time is in the past. Pick a later time, or use Publish now.');
    await save('scheduled'); m.close();
    toast(`Scheduled for ${niceDate(new Date(`${d.date}T${d.time}`), true)}.`);
  }, e.currentTarget);
  $('#now', el).onclick = async (e) => {
    const btn = e.currentTarget;
    const off = d.channels.filter((k) => !S.data.channels[k].connected);
    if (off.length === d.channels.length) return toast('None of the selected channels is connected. Connect them in Channels first.', 'err');
    if (!(await confirmBox('Publish now?', `This goes live immediately on ${d.channels.map((k) => CH[k].name).join(', ')}.`, 'Publish'))) return;
    guard(async () => {
      await save(undefined);
      const j = await api('POST', `posts/${d.id}/publish`);
      let p = j.posts.find((x) => x.id === d.id);
      // Hosted version publishes in the background: wait here until it is done.
      for (let i = 0; p && p.status === 'publishing' && i < 300; i++) {
        await new Promise((res) => setTimeout(res, 3000));
        p = (await api('GET', 'state', undefined, { quiet: true })).posts.find((x) => x.id === d.id);
      }
      if (S.data.hosted) await api('GET', 'state');
      if (!p) throw new Error('This post no longer exists.');
      d.results = p.results || {}; d.status = p.status;
      drawPreview();
      if (p.status === 'published') { m.close(); toast('Published.'); }
      else toast(p.status === 'partial' ? 'Published on some channels — see details in the preview.' : 'Publishing failed — see details in the preview.', 'err');
    }, btn);
  };
  const del = $('#del', el);
  if (del) del.onclick = async () => {
    if (!(await confirmBox('Delete this post?', 'This removes it from the calendar. Anything already published stays on the social networks.', 'Delete', true))) return;
    // A post made for a key date is not suggested again once it has been deleted.
    guard(async () => { await api('DELETE', 'posts/' + d.id); if (existing.keyDate) await dismissKey(existing.keyDate); m.close(); });
  };
  if (locked) $$('#sched,#now,#draft', el).forEach((b) => (b.disabled = true));
  refresh();
}
