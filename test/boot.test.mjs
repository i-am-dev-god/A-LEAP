/* ============================================================================
   Boot smoke test.
   Runs the built index.html in a simulated browser with a recording WebGL stub,
   drives the shell through its commands, and asserts the machine behaves:
   nothing throws, a reload is identical, a false name is refused.
   Requires jsdom (npm i). Skips cleanly if it is not installed.
   ==========================================================================*/
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { core } from './load-core.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');

let JSDOM, VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = await import('jsdom'));
} catch {
  console.log('skip  jsdom not installed (npm install) — storage proof still ran');
  process.exit(0);
}

/* a graphics card, reduced to a recording device */
const calls = [];
function stubGL() {
  const consts = new Proxy({}, { get: () => 1 });
  const impl = {
    createShader: () => ({}), shaderSource: (s, src) => { s.src = src; },
    compileShader: (s) => { if (!s.src) throw new Error('no src'); },
    getShaderParameter: () => true, getShaderInfoLog: () => '',
    getProgramParameter: () => true, getProgramInfoLog: () => '',
    createProgram: () => ({ p: 1 }), attachShader() {}, linkProgram() {},
    deleteProgram() {}, deleteShader() {}, createBuffer: () => ({}),
    useProgram() {}, getAttribLocation: () => 0, enableVertexAttribArray() {},
    vertexAttribPointer() {}, getUniformLocation: (p, n) => n,
    uniform1f: (u, v) => calls.push([u, v]), uniform2f: (u, a, b) => calls.push([u, a, b]),
    uniform3f: (u, a, b, c) => calls.push([u, a, b, c]),
    viewport() {}, disable() {}, enable() {}, bindBuffer() {}, bufferData() {},
    drawArrays() { calls.push(['draw']); },
  };
  return new Proxy(impl, { get: (t, k) => (k in t ? t[k] : consts[k]) });
}

function boot(url) {
  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', (e) => errors.push(e.message));
  vc.on('error', (e) => errors.push(String(e)));
  const dom = new JSDOM(html, {
    url, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.HTMLCanvasElement.prototype.getContext = () => stubGL();
      w.requestAnimationFrame = (cb) => { w.__raf = cb; return 1; };
      w.performance.now = () => 1234;
      w.AudioContext = undefined;
    },
  });
  return { w: dom.window, errors };
}

function frame(w, times = 1) {
  const cb = w.__raf;
  if (!cb) throw new Error('no animation frame scheduled');
  for (let i = 0; i < times; i++) cb(1234 + i * 16);
}

let fail = 0;
const ok = (cond, msg) => { console.log(`${cond ? ' ok ' : 'FAIL'}  ${msg}`); if (!cond) fail++; };

/* ---- 1. first boot: no address -> the mint screen ---------------------- */
{
  const { w, errors } = boot('https://example.test/leap/');
  ok(errors.length === 0, `boot without errors ${errors[0] || ''}`);
  ok(!w.document.getElementById('mint').classList.contains('gone'), 'mint screen shown on first boot');
  ok(w.location.hash.startsWith('#'), `address derived: ${w.location.hash}`);
  ok(calls.filter(c => c[0] === 'draw').length === 0, 'nothing drawn before the first frame');
  frame(w, 3);
  ok(calls.some(c => c[0] === 'uBoot'), 'shader uniforms bound every frame');
  ok(calls.some(c => c[0] === 'uTime'), 'the clock is passed into the shader');
  ok(calls.filter(c => c[0] === 'draw').length === 3, 'each frame draws the one triangle');
  const name = w.document.getElementById('mode-name').textContent;
  ok(!!name && name.length > 2, `mode named: ${name}`);
}

/* ---- 2. determinism: same address, same machine ----------------------- */
function snapshot(url) {
  const { w } = boot(url);
  frame(w, 5);
  return [
    w.document.getElementById('machine-line').textContent,
    w.document.getElementById('mode-name').textContent,
    w.document.getElementById('mode-verb').textContent,
    w.document.getElementById('itinerary').children.length,
    w.document.getElementById('btn-seed').textContent,
  ].join(' | ');
}
{
  const a = snapshot('https://example.test/leap/#naaldwijk.4g1c7j0m4');
  const b = snapshot('https://example.test/leap/#naaldwijk.4g1c7j0m4');
  ok(a === b, 'two loads of one address are the same machine');
  ok(a.includes('ember-247'), `expected genome for 4g1c7j0m4: ${a.split(' | ')[0]}`);
}

/* ---- 3. the name space is broad --------------------------------------- */
{
  const m = await core();
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    seen.add(m.genome(m.encodeSeed((i * 2654435761) >>> 0, 's' + i)).name);
  }
  ok(seen.size > 185, `200 seeds yield ${seen.size} distinct names`);
}

/* ---- 4. the shell ----------------------------------------------------- */
{
  const { w, errors } = boot('https://example.test/leap/#naaldwijk.4g1c7j0m4');
  frame(w, 2);
  const cmd = w.document.getElementById('cmd');
  const out = w.document.getElementById('out');
  const run = (v) => {
    cmd.value = v;
    cmd.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  };

  run('verify');
  ok(out.innerHTML.includes('identical'), 'verify recomputes the same genome');
  ok(out.innerHTML.includes('0 bytes'), 'verify reports zero storage');

  run('seed');
  ok(out.innerHTML.includes('4g1c7j0m4'), 'seed reports the address seed');

  run('law');
  ok(out.innerHTML.includes('no disk'), 'law states the four laws');

  run('settle');
  ok(out.innerHTML.includes('at rest'), 'settle jumps the itinerary to rest');

  run('help');
  ok(out.innerHTML.includes('commands'), 'help lists the shell');

  run('naaldwijk');
  ok(w.location.hash.includes('naaldwijk.'), `an unknown word renames the machine: ${w.location.hash}`);

  ok(errors.length === 0, `the whole command pass produced no errors ${errors[0] || ''}`);
}

/* ---- 5. a corrupt address must not crash ------------------------------ */
{
  const { w, errors } = boot('https://example.test/leap/#somename.ZZZ!!!bad');
  ok(errors.length === 0, `corrupt seed falls back gracefully ${errors[0] || ''}`);
  ok(!w.document.getElementById('mint').classList.contains('gone'), 'corrupt seed shows the mint screen');
}

/* ---- 6. a name its seed does not prove -------------------------------- */
{
  const { w } = boot('https://example.test/leap/#someone-else.4g1c7j0m4');
  frame(w, 2);
  ok(w.document.getElementById('out').innerHTML.includes('does not prove'),
    'the machine refuses a false name claim');
}

console.log(fail === 0 ? '\nALL CHECKS PASSED' : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
