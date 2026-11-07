#!/usr/bin/env node
/* ============================================================================
   L E A P — build
   Assembles the whole operating system into one distributable file: index.html.
   No bundler, no dependencies, no node_modules. The build is itself an
   argument for the design: the machine is small enough to be a single page.
   ==========================================================================*/

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

/* ---- 1. resolve the ES module graph by hand (it is tiny and known) -------- */

const ENTRY = 'src/app.js';
const seen = new Map();

function resolveSpec(fromFile, spec) {
  if (!spec.startsWith('.')) throw new Error(`bare import not allowed: ${spec}`);
  const url = new URL(spec, 'file://' + join(root, fromFile));
  const path = url.pathname.replace(root + '/', '');
  return path;
}

/** Strip import/export syntax and return a bare function body per module. */
function transform(file) {
  let src = read(file);
  const deps = [];

  src = src.replace(/^import\s+\{([^}]*)\}\s+from\s+['"]([^'"]+)['"];?\s*$/gm, (_, names, spec) => {
    deps.push(resolveSpec(file, spec));
    return `/* from ${spec}: ${names.trim().replace(/\s+/g, ' ')} */`;
  });
  src = src.replace(/^import\s+(\w+)\s+from\s+['"]([^'"]+)['"];?\s*$/gm, (_, name, spec) => {
    deps.push(resolveSpec(file, spec));
    return `/* from ${spec}: ${name} */`;
  });
  src = src.replace(/^export\s+default\s+/gm, 'const __default__ = ');
  src = src.replace(/^export\s+(const|let|var|function|class)\s/gm, '$1 ');
  src = src.replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, '');
  return { src, deps };
}

function collect(file) {
  if (seen.has(file)) return;
  const { src, deps } = transform(file);
  seen.set(file, src);
  for (const d of deps) collect(d);
}

collect(ENTRY);

/* order matters only in that module bodies must not run before their deps;
   in this codebase every module body is declarations and constants, so we emit
   dependencies first via the insertion order collected above (DFS). */

const modules = [...seen.entries()].reverse()
  .map(([file, src]) => `/* ── ${file} ─────────────────────────────────────── */\n${src.trim()}`)
  .join('\n\n');

/* ---- 2. inline it into the shell ---------------------------------------- */

let html = read('src/shell.html');
const stylesheet = read('src/shell.html').match(/<style>([\s\S]*?)<\/style>/)[1];

html = html.replace(
  /<script type="module" src="\.\/src\/app\.js"><\/script>/,
  `<script>\n(function(){\n'use strict';\n${modules}\n})();\n</script>`
);

/* ---- 3. write ----------------------------------------------------------- */

const out = join(root, 'index.html');
writeFileSync(out, html);

const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
const kbCss = (Buffer.byteLength(stylesheet) / 1024).toFixed(1);
const kbJs = (Buffer.byteLength(modules) / 1024).toFixed(1);

// also emit a copy for GitHub Pages from /docs, if the developer wants it
mkdirSync(join(root, 'docs'), { recursive: true });
writeFileSync(join(root, 'docs', 'index.html'), html);

console.log(`leap · built index.html and docs/index.html`);
console.log(`       ${kb} kB total  (${kbCss} kB shell + ${kbJs} kB system)`);
console.log(`       no dependencies · no assets · no storage`);
