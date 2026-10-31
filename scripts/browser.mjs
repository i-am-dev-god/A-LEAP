#!/usr/bin/env node
/**
 * Provisions a Chromium for Remotion without touching the internet.
 *
 * Remotion normally downloads "Chrome Headless Shell" from its CDN. On hosts
 * where that is blocked, @sparticuz/chromium ships an equivalent build inside
 * the npm registry, including the three shared libraries stock Debian lacks
 * (libnspr4, libnss3, libnssutil3).
 *
 * Everything lands in .cache/chromium/ and remotion.config.ts picks it up from
 * .cache/chromium/browser.json, so `npm run render` just works.
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import chromium from '@sparticuz/chromium';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(root, '.cache', 'chromium');
const BIN = path.join(CACHE, 'chromium');
const LAUNCHER = path.join(CACHE, 'launcher.sh');
const LIB = path.join(CACHE, 'lib');
const CONFIG = path.join(CACHE, 'browser.json');

/** Just enough ustar to unpack a flat .so bundle. */
const untar = (buffer, dest) => {
  let offset = 0;
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;

    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    const size = parseInt(header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim() || '0', 8);
    const type = String.fromCharCode(header[156] || 48);
    const dataStart = offset + 512;

    if ((type === '0' || type === '\0' || type === '7') && name) {
      const out = path.join(dest, name);
      mkdirSync(path.dirname(out), { recursive: true });
      writeFileSync(out, buffer.subarray(dataStart, dataStart + size));
      chmodSync(out, 0o755);
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
};

if (existsSync(CONFIG) && existsSync(BIN)) {
  const config = JSON.parse(readFileSync(CONFIG, 'utf8'));
  console.log(`browser ready: ${config.executable}`);
  process.exit(0);
}

mkdirSync(LIB, { recursive: true });

const extracted = await chromium.executablePath();
copyFileSync(extracted, BIN);
chmodSync(BIN, 0o755);

const layered = path.join(root, 'node_modules', '@sparticuz', 'chromium', 'bin', 'al2023.tar.br');
if (existsSync(layered)) {
  untar(brotliDecompressSync(readFileSync(layered)), CACHE);
}

// Remotion spawns the browser with a curated environment, so LD_LIBRARY_PATH
// set in remotion.config.ts never reaches it. A two-line launcher does.
writeFileSync(
  LAUNCHER,
  `#!/bin/sh\nDIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexport LD_LIBRARY_PATH="$DIR/lib${'${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}'}"\nexec "$DIR/chromium" "$@"\n`,
);
chmodSync(LAUNCHER, 0o755);

writeFileSync(
  CONFIG,
  JSON.stringify({ executable: LAUNCHER, binary: BIN, libDir: LIB, source: '@sparticuz/chromium' }, null, 2) + '\n',
);
console.log(`browser ready: ${BIN}`);
