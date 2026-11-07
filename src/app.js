/* ============================================================================
   L E A P — app
   ----------------------------------------------------------------------------
   Boot sequence: read the address (never storage) -> derive a genome ->
   generate a shader -> compile it -> begin the itinerary. That is the entire
   persistence model of this operating system.
   ==========================================================================*/

import {
  VERSION, genome, shaderSource, encodeSeed, decodeSeed, seedMatchesName,
  randomEntropy, hashName,
} from './core.js';
import { plan, stateAt, liturgy, thesis, fmtTime } from './cognition.js';
import { Organ } from './organ.js';
import { Field } from './render.js';

const $ = (id) => document.getElementById(id);
const el = {
  field: $('field'), line: $('machine-line'), name: $('mode-name'), verb: $('mode-verb'),
  meter: $('meter'), itinerary: $('itinerary'), pos: $('itinerary-pos'),
  total: $('itinerary-total'), thesis: $('thesis'), cmd: $('cmd'), out: $('out'),
  shellMeta: $('shell-meta'), mint: $('mint'), word: $('word'), toast: $('toast'),
  seedBtn: $('btn-seed'), soundBtn: $('btn-sound'),
};

const M = {
  g: null, field: null, organ: null, p: null,
  t0: 0, paused: false, lastFrame: 0, ticks: [], clockOffset: 0, night: false,
};

/* --------------------------------------------------------------- address -- */

function readAddress() {
  const url = new URL(location.href);
  // the whole machine may live in the hash (#name.seed) or a query (?seed=)
  const raw = (url.hash || '').replace(/^#/, '');
  let name = '', seed = '';
  if (raw) {
    const i = raw.lastIndexOf('.');
    if (i > 0) { name = decodeURIComponent(raw.slice(0, i)); seed = raw.slice(i + 1); }
    else seed = raw;
  }
  if (!seed && url.searchParams.get('seed')) seed = url.searchParams.get('seed');
  const d = decodeSeed(seed);
  if (!d) return null;
  const nm = name || url.searchParams.get('name') || '';
  return { seed, name: nm, honest: !nm || seedMatchesName(seed, nm) };
}

function writeAddress(name, seed) {
  const hash = name ? `#${encodeURIComponent(slug(name))}.${seed}` : `#${seed}`;
  history.replaceState(null, '', `${location.pathname}${hash}`);
  return location.href;
}

/** Write text only when it changes: 60 identical text-node replacements a
 *  second would spam assistive tech and force needless layout. */
const memo = new Map();
function setText(node, value) {
  if (memo.get(node) === value) return;
  memo.set(node, value);
  node.textContent = value;
}

const slug = (s) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

/** The only way a word becomes a machine. Normalised first, so the address
 *  that comes back is the address that was written. */
function seedForWord(word) {
  const w = slug(word);
  return { seed: encodeSeed(hashName(w), w), name: w };
}

/* ------------------------------------------------------------- booting --- */

function bootMachine(seed, name, { mint = null } = {}) {
  const g = genome(seed);
  M.g = g;
  document.title = `${g.name} — LEAP`;
  el.line.textContent = `${g.model} · ${g.mood} · ${g.traits.map(t => t[1]).join(' · ')}`;
  el.seedBtn.textContent = `seed · ${seed}`;

  // regenerate the shader from the new genome and compile it live
  try {
    M.field.setMachine(shaderSource(g));
    M.field.boot = 0;
    document.body.style.background = '#0a0908';
  } catch (e) {
    console.error(e);
    toast('this machine could not be rendered here');
  }

  M.p = plan(g);
  M.t0 = performance.now();
  M.ticks = buildTicks(M.p);
  el.thesis.textContent = '“' + thesis(g) + '”';
  M.organ = new Organ(g);

  writeAddress(name || '', seed);
  paint(0);
  if (mint) {
    mint.classList.add('gone');
    toast(`${g.name} is awake — nothing was saved`);
  }
}

function buildTicks(p) {
  el.itinerary.innerHTML = '';
  const ticks = p.steps.map((s) => {
    const d = document.createElement('div');
    d.className = 'tick';
    d.style.flexGrow = String(Math.max(0.25, s.dur / 1000));
    d.title = s.mode;
    const i = document.createElement('i');
    d.appendChild(i);
    el.itinerary.appendChild(d);
    return { node: d, fill: i };
  });
  return ticks;
}

/* -------------------------------------------------------------- painting -- */

function paint(now) {
  const g = M.g, p = M.p;
  if (!g || !p) return;
  const t = (M.paused ? M.pausedAt : now - M.t0 + M.clockOffset);
  const s = stateAt(g, p, Math.max(0, t));

  if (s.mode !== document.body.dataset.mode) document.body.dataset.mode = s.mode;
  setText(el.name, s.label);
  setText(el.verb, s.verb);
  el.meter.style.transform = `scaleX(${s.progress.toFixed(3)})`;

  // itinerary ticks reflect only what time it is — they are never "written"
  const idx = p.steps.indexOf(s.step);
  M.ticks.forEach((tk, i) => {
    tk.node.classList.toggle('done', i < idx);
    tk.node.classList.toggle('now', i === idx);
    tk.fill.style.transform = i < idx ? 'scaleX(1)' : i === idx ? `scaleX(${s.progress})` : 'scaleX(0)';
  });
  setText(el.pos, `${String(idx + 1).padStart(2, '0')} / ${String(p.steps.length).padStart(2, '0')} · ${s.label}`);
  setText(el.total, `${fmtTime(Math.max(0, t))} elapsed · ${fmtTime(p.total)} itinerary`);

  // the machine's pulse when a step turns over: derived, not stored
  if (M._lastStep !== idx) {
    M._lastStep = idx;
    if (M.organ && M.organ.ready) M.organ.pulse();
    if (s.mode === 'compose' && M.organ && M.organ.ready) {
      M.organ.bell(s.cycle % 5, 0.7);
    }
  }
}

/* ---------------------------------------------------------------- loop --- */

function loop(now) {
  const dt = Math.min(0.05, (now - (M.lastFrame || now)) / 1000);
  M.lastFrame = now;
  if (M.field) M.field.frame(dt, M.organ && M.organ.ready ? M.organ : null);
  paint(now);
  requestAnimationFrame(loop);
}

/* ------------------------------------------------------------- commands -- */

const HELP = `commands — everything below is enough; there is nothing to install.
  <b>seed</b>            show this machine's nine characters and its address
  <b>name</b> &lt;word&gt;     re-derive the machine from a word (the seed follows the name)
  <b>again</b> / <b>new</b>   mint a completely new machine
  <b>verify</b>          recompute the genome and check it against the address
  <b>settle</b>          jump the itinerary to rest
  <b>pause</b> / <b>play</b>   the plate keeps moving; the itinerary holds
  <b>motion</b>          stop or start the plate's drift (also honours your OS setting)
  <b>night</b>           dim the shell, keep the field
  <b>sound</b>           the machine's synthesised voice on / off
  <b>liturgy</b>         three lines written by this seed
  <b>law</b>             the four laws of a machine without storage
  <b>about</b>           what this is, and what it refuses to be
  <b>close</b>           shut the machine down (nothing to lose)`;

const LAW = `1. the seed reconstructs the machine. the machine never stores the seed.
2. nothing is written to disk: there is no disk.
3. every pixel is a pure function of the seed, the clock, and you.
4. a machine is not its files. a machine is a way of returning.`;

function say(html, { sticky = false } = {}) {
  el.out.innerHTML = html;
  el.out.classList.add('show');
  if (!sticky) clearTimeout(M._sayT);
  if (!sticky) M._sayT = setTimeout(hideOut, 11000);
}
function hideOut() { el.out.classList.remove('show'); }

async function command(raw) {
  const line = raw.trim();
  if (!line) return hideOut();
  const [word, ...rest] = line.split(/\s+/);
  const arg = rest.join(' ');
  const w = word.toLowerCase();

  switch (w) {
    case 'help': case '?':
      return say(HELP, { sticky: true });

    case 'seed': {
      const url = location.href;
      const txt = `<b>${M.g.seed}</b>  ·  ${M.g.name} · ${M.g.model}\n` +
        `entropy ${M.g.entropy}  checksum ${decodeSeed(M.g.seed).nameSum}  address ${url}\n` +
        `the nine characters are the machine. the machine never stores them.`;
      say(txt, { sticky: true });
      return copy(M.g.seed, 'seed copied');
    }

    case 'name': {
      if (!arg) return say('give it a name: <b>name</b> naaldwijk');
      const { seed, name } = seedForWord(arg);
      bootMachine(seed, name);
      return say(`<b>${M.g.name}</b> — derived from “${arg}”.\n` +
        `A name is not a label here; it is a hash, and the hash is the machine.`);
    }

    case 'again': case 'new': case 'random':
      return mintFresh();

    case 'verify': {
      const s = M.g.seed;
      const again = genome(s);
      const ok = again.name === M.g.name && again.hueA === M.g.hueA &&
        again.mood === M.g.mood && again.seed === M.g.seed;
      const addr = readAddress();
      const honest = addr && addr.seed === s && (!addr.name || seedMatchesName(s, addr.name));
      return say(
        `recomputed genome … ${ok ? '<i>identical</i>' : '<b>mismatch</b>'}\n` +
        `address checks … ${honest ? '<i>honest</i>' : '<b>address does not prove this machine</b>'}\n` +
        `storage used … <i>0 bytes</i>   (nothing was written, nothing was read)\n` +
        `name checksum ${decodeSeed(s).nameSum} — the name and seed agree.`
      );
    }

    case 'settle':
      M.clockOffset = M.p.total - (performance.now() - M.t0);
      return say('the itinerary is complete. the field keeps breathing; you are at rest.');

    case 'pause':
      M.paused = true; M.pausedAt = performance.now() - M.t0 + M.clockOffset;
      if (M.field) M.field.paused = true;
      return say('time holds. the field still breathes — it is never the same frame twice.');
    case 'play':
      M.paused = false; M.t0 = performance.now() + M.pausedAt - M.clockOffset;
      if (M.field) M.field.paused = false;
      return say('time resumes exactly where it stopped — from the clock, not a save file.');

    case 'motion':
      M.field.paused = !M.field.paused;
      return say(M.field.paused
        ? 'the plate is still. the map holds its lines.'
        : 'the plate drifts again.');

    case 'night':
      M.night = !M.night;
      document.body.style.setProperty('--paper', M.night ? '#c9c2b6' : '#f4efe6');
      return say(M.night ? 'night. the shell recedes.' : 'day.');

    case 'sound': case 'audio':
      return toggleSound();

    case 'liturgy': {
      const lines = liturgy(M.g);
      return say(lines.map(l => `<i>${l}</i>`).join('\n'));
    }

    case 'law': return say(LAW, { sticky: true });

    case 'about':
      return say(`<b>LEAP ${VERSION}</b> — an operating environment that refuses to persist.\n` +
        `it has no disk, no files, no profile, no database, no cookies, no storage.\n` +
        `the shader you are looking at, the key you are hearing, and the itinerary you are\n` +
        `following were all generated from nine characters in the address bar.`, { sticky: true });

    case 'close': case 'exit': case 'quit':
      shutDown();
      return;

    default:
      // an unknown word is a new name — the shell is a naming ceremony
      if (/^[a-z0-9-]{2,40}$/i.test(w)) {
        const { seed, name } = seedForWord(w);
        bootMachine(seed, name);
        return say(`no such command — but “${w}” is a better name than a command.\n` +
          `<b>${M.g.name}</b> is now here.`);
      }
      return say(`unknown: ${w} — try <b>help</b>`);
  }
}

async function copy(text, okMsg) {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMsg);
  } catch {
    toast('select the seed and copy it by hand');
  }
}

function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  clearTimeout(M._toastT);
  M._toastT = setTimeout(() => el.toast.classList.remove('show'), 2600);
}

async function toggleSound() {
  if (!M.organ) return;
  if (!M.organ.ready) await M.organ.boot();
  else M.organ.toggle();
  const on = M.organ.enabled && M.organ.ready;
  el.soundBtn.dataset.on = String(on);
  el.soundBtn.setAttribute('aria-pressed', String(on));
  el.soundBtn.textContent = `sound · ${on ? 'on' : 'off'}`;
}

function mintFresh() {
  const seed = encodeSeed(randomEntropy(), '');
  bootMachine(seed, '');
  say(`a new machine: <b>${M.g.seed}</b> — address updated.\n` +
    `nothing was deleted to get here, because nothing was ever kept.`);
}

function shutDown() {
  if (M.organ && M.organ.ready) M.organ.fade(0, 0.8);
  const veil = document.createElement('div');
  veil.style.cssText = `position:fixed;inset:0;background:#0a0908;z-index:99;opacity:0;` +
    `transition:opacity 1.1s ease;display:grid;place-items:center;text-align:center;padding:24px;`;
  veil.innerHTML = `<div style="font-family:var(--mono);font-size:10px;letter-spacing:.32em;
    text-transform:uppercase;color:rgba(244,239,230,.4);line-height:2.4">
    ${M.g.name} is off<br/><span style="color:rgba(244,239,230,.22)">
    nothing was lost. reload the address and it is exactly here.</span></div>`;
  document.body.appendChild(veil);
  requestAnimationFrame(() => (veil.style.opacity = '1'));
  history.replaceState(null, '', location.pathname + location.hash);
}

/* ---------------------------------------------------------------- wiring -- */

function wire() {
  el.cmd.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const v = el.cmd.value;
      el.cmd.value = '';
      command(v);
    }
    if (e.key === 'Escape') hideOut();
  });

  // any key anywhere jumps to the shell — it is the only input this OS has
  window.addEventListener('keydown', (e) => {
    if (el.mint.classList.contains('gone') && e.key.length === 1 && document.activeElement !== el.cmd) {
      el.cmd.focus();
    }
    if (e.key === '/' && document.activeElement !== el.cmd) {
      e.preventDefault(); el.cmd.focus(); el.cmd.value = 'help';
    }
  });

  el.seedBtn.addEventListener('click', () => command('seed'));
  $('btn-new').addEventListener('click', mintFresh);
  el.soundBtn.addEventListener('click', toggleSound);

  $('btn-boot').addEventListener('click', () => {
    const w = el.word.value.trim();
    if (!w) return bootMachine(encodeSeed(randomEntropy(), ''), '');
    const { seed, name } = seedForWord(w);
    bootMachine(seed, name);
  });
  $('btn-random').addEventListener('click', () => {
    el.word.value = '';
    bootMachine(encodeSeed(randomEntropy(), ''), '');
  });
  el.word.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-boot').click(); });

  window.addEventListener('pointermove', (e) => {
    if (!M.field) return;
    M.field.target[0] = (e.clientX / window.innerWidth - 0.5) * 2;
    M.field.target[1] = -(e.clientY / window.innerHeight - 0.5) * 2;
  });

  window.addEventListener('resize', () => M.field && M.field.resize());
  document.addEventListener('visibilitychange', () => {
    // no state is kept across this boundary — the clock is the only witness
    if (!document.hidden) M.lastFrame = 0;
  });
}

/* ----------------------------------------------------------------- boot --- */

function main() {
  M.field = new Field(el.field);
  // a machine that respects the request to hold still
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    M.field.paused = true;
    M.field.boot = 1;   // no condensing animation either
  }
  wire();

  const addr = readAddress();
  if (addr && addr.honest) {
    bootMachine(addr.seed, addr.name);
    el.mint.classList.add('gone');
  } else if (addr) {
    // a seed that doesn't match its name: the machine refuses to lie
    bootMachine(addr.seed, '');
    el.mint.classList.add('gone');
    say('this address claims a name its seed does not prove. the machine is here; the name is not.');
  } else {
    const home = seedForWord('leap');
    bootMachine(home.seed, home.name);
    el.mint.classList.remove('gone');
    el.word.focus();
  }

  el.shellMeta.textContent = `v${VERSION.split('-')[0]} · no storage`;
  requestAnimationFrame(loop);
}

try { main(); } catch (e) {
  console.error(e);
  document.getElementById('mint-title').innerHTML = 'this machine needs WebGL';
  document.querySelector('.mint-card p').textContent =
    'the field is computed on your graphics card. enable hardware acceleration and reload — nothing else is required.';
}

