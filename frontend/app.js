/* Offline Shorts — dependency-free client. All network access is same-origin. */
'use strict';
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const native = window.AndroidBridge || null;
const ICONS = {
  feed: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="m10 8 5 4-5 4Z"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  settings: '<path d="m9 3-.6 2.3-2 .9-2.1-.6-1.5 2.6 1.6 1.7-.2 2.2-1.5 1.6 1.5 2.6 2.2-.5 1.9 1 .7 2.2h3l.7-2.2 1.9-1 2.2.5 1.5-2.6-1.5-1.6-.2-2.2 1.6-1.7-1.5-2.6-2.1.6-2-.9L12 3Z"/><circle cx="10.5" cy="11" r="3"/>',
  drive: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 14h18M7 17h.01M11 17h.01"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 18 17"/>',
  play: '<path d="m8 4 12 8-12 8Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4M18 4h4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  swipe: '<path d="M12 19V5m-5 5 5-5 5 5M5 21h14"/>',
  'chevron-up': '<path d="m6 15 6-6 6 6"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  link: '<path d="m10 13 4-4M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M13 8l2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0"/>',
  skip: '<path d="m5 5 10 7-10 7ZM19 5v14"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  volume: '<path d="M11 4 6 8H3v8h3l5 4ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>',
  mute: '<path d="M11 4 6 8H3v8h3l5 4ZM16 9l5 6M21 9l-5 6"/>',
  wifi: '<path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8 16a6 6 0 0 1 8 0M12 20h.01"/>',
  offline: '<path d="m3 3 18 18M2 8a16 16 0 0 1 5-3M10 4a16 16 0 0 1 12 4M5 12a11 11 0 0 1 5-2M16 11l3 1M8 16a6 6 0 0 1 8 0M12 20h.01"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
};
function icon(name) { return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.feed}</svg>`; }
function hydrate(root = document) { $$('[data-icon]', root).forEach(el => { el.innerHTML = icon(el.dataset.icon); }); }
function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function bytes(n) { if (!n) return '0 MB'; return n >= 1073741824 ? `${(n / 1073741824).toFixed(1)} GB` : `${(n / 1048576).toFixed(n < 10485760 ? 1 : 0)} MB`; }
function compact(n) { return n == null ? null : new Intl.NumberFormat('en', {notation:'compact', maximumFractionDigits:1}).format(n); }
function dateLabel(s) { if (!s || !/^\d{8}$/.test(s)) return 'Date unavailable'; const d = new Date(`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T00:00:00Z`); return Number.isNaN(+d) ? 'Date unavailable' : d.toLocaleDateString('en', {month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}); }
function ago(t) { const m = Math.max(0, Math.floor((Date.now() / 1000 - t) / 60)); return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`; }
const store = {
  get(k, fallback) { try { return JSON.parse(localStorage.getItem('shorts.' + k)) ?? fallback; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem('shorts.' + k, JSON.stringify(v)); } catch { /* Private browsing may disallow storage. */ } },
};
const state = {
  videos: store.get('feed', []), cached: new Set(), page: 'feed', online: false,
  pending: store.get('pending', []), activeId: null, muted: store.get('muted', true),
  settings: store.get('settings', {device_cache_mb:1024}), status: null, caching: false,
  cacheDone: 0, cacheTotal: 0, token: store.get('token', ''), sw: null, initialized: false,
};
let toastTimer, observer, confirmAction, polling, lastSync = 0;
function toast(message, error = false) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').className = `toast visible${error ? ' error' : ''}`; toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 4200); }
function savePending() { store.set('pending', state.pending); $('#pending-label').textContent = state.pending.length ? `${state.pending.length} offline action(s) waiting to sync.` : 'No offline actions waiting to sync.'; }
function enqueue(method, path, body) {
  // Coalesce progress and repeated terminal actions; tombstones make replay idempotent.
  const terminal = method === 'DELETE' || path.endsWith('/watched');
  state.pending = state.pending.filter(x => !(x.path === path && (terminal || x.method === method && path.endsWith('/feedback'))));
  state.pending.push({method, path, body, at:Date.now()}); savePending();
}
const nativeCallbacks = new Map();
window.__nativeApiResult = (id, payload) => { const callback = nativeCallbacks.get(id); if (!callback) return; nativeCallbacks.delete(id); clearTimeout(callback.timer); try { callback.resolve(JSON.parse(payload)); } catch (e) { callback.reject(e); } };
function nativeRequest(path, method, body) {
  return new Promise((resolve, reject) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const timer = setTimeout(() => { nativeCallbacks.delete(id); reject(new Error('The Android connection timed out.')); }, 30000);
    nativeCallbacks.set(id, {resolve, reject, timer});
    try { native.apiRequest(id, method, path, JSON.stringify(body || {}), state.token); } catch (e) { clearTimeout(timer); nativeCallbacks.delete(id); reject(e); }
  });
}
async function request(path, options = {}) {
  const method = options.method || 'GET';
  let status, data;
  if (native && path.startsWith('/api/')) {
    const result = await nativeRequest(path, method, options.body ? JSON.parse(options.body) : {});
    if (result.offline) { const e = new Error('Backend unreachable'); e.status = 503; throw e; }
    status = result.status; try { data = JSON.parse(result.body); } catch { data = {}; }
  } else {
    const headers = {'Content-Type':'application/json', ...(options.headers || {})};
    if (state.token) headers['X-Shorts-Token'] = state.token;
    const response = await fetch(path, {...options, headers, signal:AbortSignal.timeout(20000)});
    status = response.status; data = await response.json();
  }
  if (status < 200 || status >= 300) { const detail = data.detail; const e = new Error(typeof detail === 'string' ? detail : `Request failed (${status})`); e.status = status; e.detail = detail; throw e; }
  return data;
}
async function mutate(method, path, body) {
  enqueue(method, path, body);
  if (!navigator.onLine) { setOnline(false); return {queued:true}; }
  try { const result = await request(path, {method, body:JSON.stringify(body || {})}); state.pending = state.pending.filter(x => !(x.method === method && x.path === path)); savePending(); return result; }
  catch (e) { if (!e.status) setOnline(false); return {queued:true, error:e.message}; }
}
async function syncPending() {
  if (!state.pending.length || !navigator.onLine || Date.now() - lastSync < 3000) return;
  lastSync = Date.now();
  for (const action of [...state.pending]) {
    try { await request(action.path, {method:action.method, body:JSON.stringify(action.body || {})}); state.pending = state.pending.filter(x => x !== action); savePending(); }
    catch (e) { if (e.status && e.status !== 404 && e.status !== 409 && e.status < 500) { state.pending = state.pending.filter(x => x !== action); savePending(); toast(`Could not sync one action: ${e.message}`, true); } break; }
  }
}
function setOnline(value) {
  state.online = value;
  const pill = $('#connection-pill'); pill.classList.toggle('offline', !value);
  pill.innerHTML = `<i></i><span>${value ? 'Engine connected' : 'Offline mode'}</span>`;
  $('#engine-label').textContent = value ? 'Your engine is online' : 'Playing from your cache';
}
async function tellWorker() {
  const reg = state.sw || (navigator.serviceWorker && await navigator.serviceWorker.getRegistration());
  if (!reg?.active) return;
  await new Promise(resolve => { const channel = new MessageChannel(); const timer = setTimeout(resolve, 1500); channel.port1.onmessage = () => { clearTimeout(timer); resolve(); }; reg.active.postMessage({type:'config', token:state.token, limit:state.settings.device_cache_mb * 1048576}, [channel.port2]); });
}
async function initOffline() {
  if (native) {
    try { state.cached = new Set(JSON.parse(native.cachedIds())); native.setCacheLimit(String(state.settings.device_cache_mb * 1048576)); } catch {}
    $('#connection-card').hidden = false;
    $('#backend-url').value = native.getBackend();
    $('#access-token').value = state.token;
  } else if ('serviceWorker' in navigator && window.isSecureContext) {
    try {
      state.sw = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      navigator.serviceWorker.addEventListener('controllerchange', tellWorker);
      await tellWorker();
      if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
      await refreshCached();
    } catch { toast('Offline caching is unavailable in this browser context. Use HTTPS or the Android app.', true); }
  }
}
async function refreshCached() {
  if (native) { try { state.cached = new Set(JSON.parse(native.cachedIds())); } catch {} }
  else if ('caches' in window) { try { const cache = await caches.open('shorts-media-v1'); const keys = await cache.keys(); state.cached = new Set(keys.map(r => new URL(r.url).pathname.match(/\/media\/(.+)\.mp4$/)?.[1]).filter(Boolean)); } catch {} }
  updateCacheUI();
}
function updateCacheUI() {
  const available = state.videos.filter(v => state.cached.has(v.id));
  $('#device-count').textContent = available.length;
  $('#server-count').textContent = state.videos.length;
  $('#feed-count').textContent = state.videos.length;
  const total = state.videos.length, done = available.length;
  $('#cache-label').textContent = state.caching ? 'Saving a Short to this device…' : done ? 'Your offline feed is ready' : 'Preparing your offline feed';
  $('#cache-percent').textContent = `${total ? Math.round(done / total * 100) : 0}%`;
  $('#cache-meter').style.width = `${total ? done / total * 100 : 0}%`;
  $$('.video-card').forEach(card => { const saved = state.cached.has(card.dataset.id); const chip = $('.saved-chip', card); if (chip) chip.innerHTML = `${icon(saved ? 'check' : 'download')}${saved ? 'Saved on device' : 'Server cache'}`; });
}
async function removeDeviceCopy(id) {
  if (native) native.deleteCached(id);
  else if ('caches' in window) { const cache = await caches.open('shorts-media-v1'); await cache.delete(`/media/${id}.mp4`); }
  state.cached.delete(id); updateCacheUI();
}
async function cacheVideos() {
  if (state.caching || !state.online || !state.initialized || (native && !native.getBackend())) return;
  state.caching = true;
  try {
    await refreshCached();
    const limit = state.settings.device_cache_mb * 1048576;
    let used = state.videos.filter(v => state.cached.has(v.id)).reduce((n,v) => n + v.bytes, 0);
    for (const video of state.videos) {
      if (!state.online || !state.videos.some(v => v.id === video.id)) continue;
      if (state.cached.has(video.id)) continue;
      if (used + video.bytes > limit) continue;
      $('#cache-label').textContent = `Saving “${video.title.slice(0,32)}”…`;
      try {
        const response = await fetch(`/media/${encodeURIComponent(video.id)}.mp4`, {headers:state.token ? {'X-Shorts-Token':state.token} : {}, signal:AbortSignal.timeout(600000)});
        if (!response.ok) continue;
        if (!native && 'caches' in window) { const cache = await caches.open('shorts-media-v1'); await cache.put(`/media/${video.id}.mp4`, response.clone()); }
        // Drain native responses without allocating a second full-video buffer in JavaScript.
        if (response.body) { const reader = response.body.getReader(); while (!(await reader.read()).done) {} }
        state.cached.add(video.id); used += video.bytes; updateCacheUI();
      } catch { break; }
    }
    if (!native && 'caches' in window) {
      const cache = await caches.open('shorts-media-v1');
      for (const key of await cache.keys()) { const id = new URL(key.url).pathname.match(/\/media\/(.+)\.mp4$/)?.[1]; if (id && !state.videos.some(v => v.id === id)) await cache.delete(key); }
    }
  } finally { state.caching = false; updateCacheUI(); }
}
function videoCard(video, index) {
  const card = document.createElement('article'); card.className = 'video-card paused'; card.dataset.id = video.id;
  card.setAttribute('aria-label', `${video.title} by ${video.channel_name}`);
  const views = compact(video.view_count), initial = esc((video.channel_name || '?').charAt(0).toUpperCase());
  card.innerHTML = `<video playsinline muted loop preload="none" poster="/poster.svg" aria-label="${esc(video.title)}"></video>
    <div class="video-top"><span class="saved-chip">${icon('check')}Saved on device</span><span class="video-number">${String(index+1).padStart(2,'0')} / ${String(state.videos.length).padStart(2,'0')}</span></div>
    <button class="video-center-play" aria-label="Play video">${icon('play')}</button>
    <div class="video-actions"><button class="video-action mute" aria-label="Unmute"><span>${icon('volume')}</span><span>Sound on</span></button><button class="video-action skip" aria-label="Skip and show less like this"><span>${icon('skip')}</span><span>Skip</span></button><button class="video-action watched" aria-label="Mark as watched and free server storage"><span>${icon('check')}</span><span>Watched</span></button><button class="video-action delete" aria-label="Delete video permanently"><span>${icon('trash')}</span><span>Delete</span></button></div>
    <div class="video-info"><div class="creator"><span class="creator-avatar">${initial}${video.channel_avatar ? `<img src="${esc(video.channel_avatar)}" alt="" loading="lazy" onerror="this.remove()">` : ''}</span><div><div class="creator-name">${esc(video.channel_name)}</div><div class="creator-sub">${video.source === 'demo' ? 'Original demo creator' : 'Creator · YouTube Shorts'}</div></div></div><h2 class="video-title">${esc(video.title)}</h2><div class="video-meta">${icon('eye')}<span>${views ? esc(views) + ' views' : 'Views unavailable'}</span><i class="dot"></i><span>${esc(dateLabel(video.upload_date))}</span></div><div class="match-chip" title="${esc((video.reasons || []).join(' · '))}">${icon('spark')}<span>${video.source === 'demo' ? 'Demo clip · not from YouTube' : `${Math.round(video.score)}% match · ${esc(video.reasons?.[1] || 'Picked for your feed')}`}</span></div></div>
    <div class="video-progress"><i></i><input type="range" min="0" max="100" step="0.1" value="0" aria-label="Video playback position"></div><div class="video-bottom"><span>${icon('offline')}<span class="device-state">Offline ready</span></span><span class="duration">0:00 / 0:00</span></div>`;
  const v = $('video', card); v.muted = state.muted;
  const playButton = $('.video-center-play', card);
  function toggle() { if (v.paused) v.play().catch(() => { card.classList.add('paused'); }); else v.pause(); }
  v.addEventListener('click', toggle); playButton.addEventListener('click', toggle);
  v.addEventListener('play', () => card.classList.remove('paused'));
  v.addEventListener('pause', () => card.classList.add('paused'));
  v.addEventListener('error', () => { $('.device-state', card).textContent = state.cached.has(video.id) ? 'Playback error — try refreshing' : 'Waiting for connection'; });
  const time = s => `${Math.floor((s || 0)/60)}:${String(Math.floor((s || 0)%60)).padStart(2,'0')}`;
  let lastProgress = 0, completed = false;
  v.addEventListener('timeupdate', () => {
    const pct = v.duration ? v.currentTime / v.duration * 100 : 0;
    $('.video-progress i', card).style.width = pct + '%'; $('.video-progress input', card).value = pct;
    $('.duration', card).textContent = `${time(v.currentTime)} / ${time(v.duration || video.duration)}`;
    if (state.activeId === video.id && Date.now() - lastProgress > 10000 && v.currentTime > 1) { lastProgress = Date.now(); request(`/api/videos/${video.id}/feedback`, {method:'POST',body:JSON.stringify({event:'progress',position:v.currentTime,duration:v.duration || video.duration})}).catch(() => {}); }
    if (!completed && v.duration && v.currentTime / v.duration >= .9) { completed = true; mutate('POST', `/api/videos/${video.id}/feedback`, {event:'complete',position:v.currentTime,duration:v.duration}); }
  });
  $('.video-progress input', card).addEventListener('input', e => { if (v.duration) v.currentTime = Number(e.target.value) / 100 * v.duration; });
  function updateMute() { $('.mute', card).innerHTML = `<span>${icon(state.muted ? 'volume' : 'mute')}</span><span>${state.muted ? 'Sound on' : 'Mute'}</span>`; $('.mute', card).setAttribute('aria-label', state.muted ? 'Unmute' : 'Mute'); }
  updateMute();
  $('.mute', card).addEventListener('click', () => { state.muted = !state.muted; store.set('muted', state.muted); $$('video').forEach(el => el.muted = state.muted); $$('.video-card').forEach(el => { const b = $('.mute', el); b.innerHTML = `<span>${icon(state.muted ? 'volume' : 'mute')}</span><span>${state.muted ? 'Sound on' : 'Mute'}</span>`; b.setAttribute('aria-label', state.muted ? 'Unmute' : 'Mute'); }); });
  $('.skip', card).addEventListener('click', () => { mutate('POST', `/api/videos/${video.id}/feedback`, {event:'skip',position:v.currentTime,duration:v.duration || video.duration}); if (state.videos.length > 1) navigateVideo(1); else toast('Skipped. We’ll prioritize similar creators and topics a little less.'); });
  $('.watched', card).addEventListener('click', () => removeVideo(video, true, v.currentTime));
  $('.delete', card).addEventListener('click', () => removeVideo(video, false, v.currentTime));
  return card;
}
function renderFeed(force = false) {
  const feed = $('#feed'), visible = state.online ? state.videos : state.videos.filter(v => state.cached.has(v.id));
  $('#empty-state').hidden = visible.length > 0;
  feed.style.visibility = visible.length ? 'visible' : 'hidden';
  $('#feed-bottom').hidden = !visible.length;
  const signature = visible.map(v => v.id).join(',');
  if (!force && feed.dataset.signature === signature) { updateCacheUI(); return; }
  const previous = state.activeId, scrollIndex = Math.max(0, visible.findIndex(v => v.id === previous));
  observer?.disconnect(); $$('video', feed).forEach(v => v.pause());
  feed.replaceChildren(...visible.map(videoCard)); feed.dataset.signature = signature;
  observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const card = entry.target, v = $('video', card);
      if (entry.intersectionRatio >= .65 && state.page === 'feed') {
        state.activeId = card.dataset.id;
        if (!v.getAttribute('src')) { v.src = `/media/${card.dataset.id}.mp4`; v.load(); }
        v.preload = 'auto'; v.play().catch(() => card.classList.add('paused'));
      } else v.pause();
    }
  }, {root:feed, threshold:[0,.65]});
  $$('.video-card', feed).forEach(c => observer.observe(c));
  if (visible.length) { feed.scrollTop = scrollIndex * feed.clientHeight; state.activeId = visible[scrollIndex]?.id; }
  updateCacheUI();
}
function navigateVideo(direction) { const feed = $('#feed'); const index = Math.round(feed.scrollTop / feed.clientHeight); const next = Math.max(0, Math.min(state.videos.length - 1, index + direction)); feed.scrollTo({top:next * feed.clientHeight, behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'}); }
async function removeVideo(video, watched, position) {
  const card = $$('.video-card').find(c => c.dataset.id === video.id);
  if (card?.classList.contains('removing')) return;
  if (card) { $('video', card).pause(); card.classList.add('removing'); }
  // Optimistic removal is persisted before the network request. Offline deletion is real locally.
  state.videos = state.videos.filter(v => v.id !== video.id); store.set('feed', state.videos);
  removeDeviceCopy(video.id).catch(() => {});
  setTimeout(() => { card?.remove(); renderFeed(true); }, 270);
  const result = watched ? await mutate('POST', `/api/videos/${video.id}/watched`, {position}) : await mutate('DELETE', `/api/videos/${video.id}`, {});
  toast(watched ? `Watched. Server file ${result.queued ? 'will be freed when reconnected' : 'removed'}.` : result.queued ? 'Removed from this device. Server deletion will sync when reconnected.' : `Deleted everywhere. ${bytes(result.freed_bytes || 0)} freed on your server.`);
  updateStatus();
}
function showPage(page) {
  if (!['feed','activity','settings'].includes(page)) page = 'feed';
  state.page = page;
  $$('.page').forEach(el => el.hidden = el.id !== 'page-' + page);
  $$('[data-page]').forEach(el => { if (el.classList.contains('nav-item') || el.closest('.mobile-nav')) el.classList.toggle('active', el.dataset.page === page); });
  if (page !== 'feed') $$('video').forEach(v => v.pause()); else renderFeed();
  if (page === 'activity') updateActivity();
  if (page === 'settings') fillSettings();
  history.replaceState(null, '', '#' + page);
  window.scrollTo({top:0});
}
async function updateStatus() {
  if (!state.initialized || (native && !native.getBackend())) return;
  try {
    const status = await request('/api/status'); state.status = status; setOnline(true);
    const s = status.storage, pct = Math.min(100, Math.round(s.used_bytes / s.limit_bytes * 100));
    $('#storage-percent').textContent = pct + '%'; $('#storage-meter').style.width = pct + '%';
    $('#storage-label').textContent = `${bytes(s.used_bytes)} of ${bytes(s.limit_bytes)} used`;
    const mins = Math.max(0, Math.ceil((status.next_scan - Date.now()/1000)/60));
    $('#next-scan').textContent = status.scanning ? 'Scanning your sources right now…' : status.active ? 'Downloading your next Short…' : `Next automatic scan in ${mins} min`;
    $('#queued-count').textContent = (status.counts.queued || 0) + (status.counts.downloading || 0);
    $('#watched-count').textContent = status.counts.watched || 0;
    $('#scan-button').classList.toggle('spinning', status.scanning);
    renderPreferences(status.preferences);
    renderScanBanner(status);
    if (state.page === 'activity') updateActivity();
  } catch { setOnline(false); }
}
function renderScanBanner(status) {
  const banner = $('#scan-banner'); if (!banner) return;
  const scan = status.last_scan;
  const errors = (scan && scan.errors) || [];
  if (status.scanning) {
    banner.hidden = false; banner.className = 'scan-banner info';
    banner.innerHTML = `${icon('refresh')}<div><strong>Scanning your sources…</strong><span>New Shorts download automatically when found.</span></div>`;
  } else if (errors.length) {
    const unreachable = errors.some(e => /TLS|SSL|EOF|resolve|timed? ?out|Network|urlopen|Connection/i.test(e));
    const clean = errors[0]
      .replace(/^(channel|playlist|topic):\s*/,'')
      .replace(/^ERROR:\s*\[[^\]]*\]\s*/,'')
      .split(' (caused by')[0].split('; please report')[0]
      .replace(/\(_ssl\.c:\d+\)/,'').trim().slice(0,180);
    banner.hidden = false; banner.className = 'scan-banner warn';
    banner.innerHTML = `${icon('info')}<div><strong>Last scan couldn't fetch from YouTube</strong><span>${esc(clean)}</span>${unreachable ? '<span class="scan-hint">This backend can\'t reach youtube.com. It needs unrestricted internet — if it runs in a restricted or sandboxed network, run the backend on your own computer or server (see README).</span>' : '<span class="scan-hint">Check the source URL is public, or try again. YouTube may be rate-limiting; keep yt-dlp updated.</span>'}</div><button class="text-button" id="banner-retry">Retry</button>`;
    $('#banner-retry')?.addEventListener('click', scanNow);
  } else if (scan && scan.new > 0) {
    banner.hidden = false; banner.className = 'scan-banner ok';
    banner.innerHTML = `${icon('check')}<div><strong>Found ${scan.new} new Short${scan.new > 1 ? 's' : ''}</strong><span>Saving to your offline feed.</span></div>`;
  } else {
    banner.hidden = true; banner.innerHTML = '';
  }
}
async function refreshFeed(showToast = false) {
  if (native && !native.getBackend()) { renderFeed(); return; }
  await syncPending();
  try {
    const data = await request('/api/feed'); state.videos = data.videos; store.set('feed', state.videos); setOnline(true);
    renderFeed(); await refreshCached(); cacheVideos();
    if (showToast) toast(state.videos.length ? 'Feed refreshed. Saving available videos for offline.' : 'No finished downloads yet. Add sources or check Download activity.');
  } catch (e) { setOnline(false); renderFeed(); if (showToast) toast(state.cached.size ? 'You’re offline. Your saved Shorts are still here.' : e.status ? e.message : 'Cannot reach the engine. Check its URL in Settings.', true); }
  await updateStatus();
}
async function scanNow() {
  if (!state.online) { toast('Reconnect to ask your server to scan.', true); return; }
  try { await request('/api/scan', {method:'POST'}); toast('Scan requested. Fresh matches will save in the background.'); $('#scan-button').classList.add('spinning'); setTimeout(updateStatus, 1200); }
  catch (e) { toast(e.message, true); }
}
function renderPreferences(prefs = []) {
  $('#preference-list').innerHTML = prefs.filter(p => Math.abs(p.weight) > .2).slice(0,8).map(p => `<span class="preference-pill ${p.weight > 0 ? 'positive' : 'negative'}">${esc(p.key_name)} ${p.weight > 0 ? '+' : ''}${p.weight.toFixed(1)}</span>`).join('');
}
function fillSettings() {
  const s = state.settings;
  $('#playlist-url').value = s.playlist_url || '';
  $('#channels').value = (s.channels || []).join('\n'); $('#topics').value = (s.topics || []).join('\n');
  $('#auto-download').checked = s.auto_download !== false;
  $('#max-storage').value = s.max_storage_mb || 2048; $('#device-cache').value = s.device_cache_mb || 1024;
  $('#per-scan').value = s.per_scan_limit || 10; $('#max-duration').value = s.max_duration || 180;
}
async function saveSettings(event) {
  event.preventDefault();
  if (native && !native.getBackend()) { toast('Connect your Python backend first.', true); $('#connection-card').scrollIntoView({behavior:'smooth'}); return; }
  const split = text => [...new Set(text.split(/[\n,]+/).map(x => x.trim()).filter(Boolean))];
  const body = {playlist_url:$('#playlist-url').value.trim(), channels:split($('#channels').value), topics:split($('#topics').value), auto_download:$('#auto-download').checked, max_storage_mb:Number($('#max-storage').value), device_cache_mb:Number($('#device-cache').value), per_scan_limit:Number($('#per-scan').value), max_duration:Number($('#max-duration').value)};
  if (!body.playlist_url && !body.channels.length && !body.topics.length) { toast('Add a playlist, channel, or topic to start your feed.', true); return; }
  const button = $('#settings-form button[type=submit]'); button.disabled = true;
  try { state.settings = await request('/api/settings', {method:'PUT',body:JSON.stringify(body)}); store.set('settings', state.settings); if (native) native.setCacheLimit(String(body.device_cache_mb * 1048576)); await tellWorker(); $('#settings-result').textContent = 'Saved. Your engine will check these sources now.'; toast('Preferences saved. Let’s find your next favorite.'); updateStatus(); cacheVideos(); }
  catch (e) { const detail = Array.isArray(e.detail) ? e.detail.map(x => x.msg).join(' ') : e.message; $('#settings-result').textContent = typeof detail === 'string' ? detail : 'Check your source URLs and limits.'; toast(typeof detail === 'string' ? detail : 'Check your source URLs and limits.', true); }
  finally { button.disabled = false; }
}
async function connectBackend() {
  if (!native) return;
  const url = $('#backend-url').value.trim().replace(/\/+$/, '');
  try { const parsed = new URL(url); if (!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error(); }
  catch { $('#connection-result').textContent = 'Enter a valid http:// or https:// backend address.'; return; }
  native.setBackend(url); state.token = $('#access-token').value.trim(); store.set('token', state.token);
  $('#connection-result').textContent = 'Connecting…';
  try { const health = await request('/api/health'); if (!health.ok) throw new Error('Not a Shorts Manager backend'); state.settings = await request('/api/settings'); store.set('settings', state.settings); fillSettings(); $('#connection-result').textContent = `Connected to engine v${health.version}.`; toast('Your engine is connected.'); await refreshFeed(); }
  catch (e) { $('#connection-result').textContent = `Could not connect: ${e.message}. Check the server, token, and network.`; setOnline(false); }
}
async function updateActivity() {
  if (!state.online) return;
  try {
    const [queue, history] = await Promise.all([request('/api/queue'), request('/api/history')]);
    const row = (v, status, sub) => `<div class="list-row"><span class="list-thumb">${icon(status === 'watched' ? 'check' : 'feed')}</span><div class="list-copy"><strong>${esc(v.title)}</strong><p>${esc(v.channel_name)} · ${esc(sub)}</p></div><span class="list-badge ${status === 'error' ? 'error' : ''}">${esc(status)}</span></div>`;
    $('#queue-list').innerHTML = queue.videos.length ? queue.videos.map(v => row(v, v.status, v.error || `${Math.round(v.score)}% match · ${bytes(v.bytes)}`)).join('') : `<div class="list-empty">${icon('check')}All clear. Your next discoveries will appear here.</div>`;
    const events = history.events.filter(e => ['watched','deleted','skip'].includes(e.event));
    $('#history-list').innerHTML = events.length ? events.slice(0,40).map(e => row(e, e.event, ago(e.created_at))).join('') : `<div class="list-empty">${icon('clock')}A fresh start. Your watched and skipped Shorts will appear here.</div>`;
    const active = state.status?.active, panel = $('#active-download'); panel.hidden = !active;
    if (active) panel.innerHTML = `<strong>${esc(active.title)}</strong><div class="meter"><i style="width:${active.percent}%"></i></div><p>Downloading ${active.percent}% ${esc(active.speed)} · Highest-quality MP4</p>`;
  } catch {}
}
function confirmDialog(title, message, action, label = 'Delete') { $('#dialog-title').textContent = title; $('#dialog-message').textContent = message; $('#dialog-confirm').textContent = label; confirmAction = action; $('#confirm-dialog').showModal(); }
async function boot() {
  hydrate();
  $$('[data-page]').forEach(b => b.addEventListener('click', () => showPage(b.dataset.page)));
  $('#refresh-button').addEventListener('click', () => refreshFeed(true));
  $('#scan-button').addEventListener('click', scanNow); $('#activity-scan').addEventListener('click', scanNow);
  $('#previous-video').addEventListener('click', () => navigateVideo(-1)); $('#next-video').addEventListener('click', () => navigateVideo(1));
  $('#settings-form').addEventListener('submit', saveSettings); $('#connect-button').addEventListener('click', connectBackend);
  $('#demo-button').addEventListener('click', async () => { try { await request('/api/demo', {method:'POST'}); await refreshFeed(); toast('Three original demo clips are ready. These are not YouTube downloads.'); } catch (e) { toast(e.message, true); } });
  $('#reset-learning').addEventListener('click', () => confirmDialog('Reset your learned taste?', 'Creator and topic scores return to zero. Your watch history and deleted-video blocks stay intact.', async () => { try { await request('/api/preferences/reset', {method:'POST'}); toast('Learned preferences reset.'); updateStatus(); } catch (e) { toast(e.message, true); } }, 'Reset taste'));
  $('#clear-device').addEventListener('click', () => confirmDialog('Clear this device’s cache?', 'Remove all locally saved MP4s. Server copies and watch history are kept. Videos can be cached again when connected.', async () => { for (const id of [...state.cached]) await removeDeviceCopy(id); toast('Device video cache cleared.'); renderFeed(true); }, 'Clear cache'));
  $('#dialog-cancel').addEventListener('click', () => $('#confirm-dialog').close());
  $('#dialog-confirm').addEventListener('click', async () => { $('#confirm-dialog').close(); const action = confirmAction; confirmAction = null; if (action) await action(); });
  window.addEventListener('online', async () => { await syncPending(); refreshFeed(); });
  window.addEventListener('offline', () => { setOnline(false); renderFeed(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) $$('video').forEach(v => v.pause()); else if (state.page === 'feed') { const card = $$('.video-card').find(c => c.dataset.id === state.activeId); if (card) $('video',card).play().catch(() => {}); } });
  document.addEventListener('keydown', e => { if (state.page !== 'feed' || /INPUT|TEXTAREA|BUTTON/.test(e.target.tagName)) return; if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); navigateVideo(1); } if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); navigateVideo(-1); } if (e.code === 'Space') { e.preventDefault(); const card = $$('.video-card').find(c => c.dataset.id === state.activeId); if (card) $('video',card).paused ? $('video',card).play().catch(() => {}) : $('video',card).pause(); } });
  await initOffline(); savePending();
  if (native && !native.getBackend()) { showPage('settings'); renderFeed(); }
  else {
    try { const health = await request('/api/health'); $('#demo-button').hidden = !health.demo; state.settings = await request('/api/settings'); store.set('settings', state.settings); state.initialized = true; await refreshFeed(); } catch { renderFeed(); }
    showPage(location.hash.slice(1) || 'feed');
  }
  if (native && native.getBackend()) { state.initialized = true; await refreshFeed(); showPage(location.hash.slice(1) || 'feed'); }
  polling = setInterval(async () => { if (document.hidden) return; await refreshFeed(); }, 30000);
}
boot().catch(e => { console.error(e); toast('The app could not finish starting. Refresh to try again.', true); });
