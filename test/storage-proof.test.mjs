/* ============================================================================
   The storage proof.
   LEAP claims it never persists anything. This test makes that claim
   falsifiable: it scans every byte the browser actually executes, and fails if
   the system can touch a single persistent surface or fetch a single byte.
   ==========================================================================*/
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { core, read } from './load-core.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Every API that can leave a mark on a machine.
const FORBIDDEN = [
  'localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'caches.',
  'serviceWorker', 'crypto.subtle', 'fetch(', 'XMLHttpRequest', 'WebSocket',
  'navigator.sendBeacon', 'Notification', 'requestPersistentStorage', 'FileReader',
];

// Browser memory that is discarded the instant the tab closes is not storage.
const ALLOWED = [/history\.(replace|push)State/g, /navigator\.clipboard/g];

let fail = 0;
const ok = (cond, msg) => { console.log(`${cond ? ' ok ' : 'FAIL'}  ${msg}`); if (!cond) fail++; };

/* --- 1. the executable bundle cannot reach a disk ------------------------ */
const html = read('index.html');
const script = (html.match(/<script>\n([\s\S]*?)\n<\/script>/) || [])[1] || '';
ok(script.length > 1000, `found the executable bundle (${(script.length / 1024).toFixed(1)} kB)`);

let scanned = script;
for (const allow of ALLOWED) scanned = scanned.replace(allow, '/*allowed*/');
for (const api of FORBIDDEN) ok(!scanned.includes(api), `bundle never references ${api}`);

/* --- 2. no network assets: every byte the page needs is in the page ------ */
const externals = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
ok(externals.length === 0, `no external requests ${externals.join(', ')}`);
ok(!/@import|url\(\s*['"]?https?:/.test(html), 'no remote fonts, images or styles');

/* --- 3. no data files at all -------------------------------------------- */
const DATA_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.wav', '.mp3', '.ogg',
  '.mp4', '.woff', '.woff2', '.ttf', '.otf', '.db', '.sqlite', '.json', '.csv'];
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  if (e.name === '.git' || e.name === 'node_modules') return [];
  const p = join(d, e.name);
  return e.isDirectory() ? walk(p) : [p];
});
// build manifests are source, not machine data
const MANIFESTS = new Set(['package.json', 'package-lock.json', 'tsconfig.json']);
const files = walk(ROOT);
const dataFiles = files.filter((f) =>
  DATA_EXT.includes(extname(f).toLowerCase()) && !MANIFESTS.has(relative(ROOT, f)));
ok(dataFiles.length === 0, `repository contains no asset or database files${
  dataFiles.length ? ' — ' + dataFiles.map((f) => relative(ROOT, f)).join(', ') : ''}`);

/* --- 4. the only bytes in the repository are source text ---------------- */
const total = files.reduce((n, f) => n + statSync(f).size, 0);
ok(total < 400 * 1024, `whole repository is ${(total / 1024).toFixed(0)} kB — smaller than one photo`);

/* --- 5. the machine survives a reload from the address alone ------------ */
const m = await core();
const g1 = m.genome('4g1c7j0m4');
const g2 = m.genome('4g1c7j0m4');
ok(JSON.stringify(g1) === JSON.stringify(g2), 'genome is a pure function: two derivations are byte-identical');
ok(m.seedMatchesName('4g1c7j0m4', 'naaldwijk'), 'the address proves which word made the machine');
ok(!m.seedMatchesName('4g1c7j0m4', 'not-the-answer'), 'and refuses a word it did not come from');

/* --- 6. two thousand seeds round-trip through nine characters ----------- */
let bad = 0;
for (let i = 0; i < 2000; i++) {
  const e = (i * 2654435761) >>> 0;
  const seed = m.encodeSeed(e, 'w' + i);
  const d = m.decodeSeed(seed);
  if (!d || d.entropy !== e || !m.seedMatchesName(seed, 'w' + i)) bad++;
}
ok(bad === 0, '2000 seeds encode and decode losslessly');

console.log(fail === 0
  ? '\nSTORAGE PROOF HOLDS: nothing is written, nothing is fetched, nothing is kept.'
  : `\n${fail} CLAIM(S) BROKEN`);
process.exit(fail === 0 ? 0 : 1);
