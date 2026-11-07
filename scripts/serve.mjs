#!/usr/bin/env node
/* LEAP — a 40-line dev server. No framework, no dependency, no config.
   Serves the source directly (src/shell.html at /) so you can edit and reload,
   and mounts /index.html (the build) at /leap. */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const port = Number(process.env.PORT || 8080);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8',
  '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path === '/' || path === '/index.html') path = '/src/shell.html';
    const file = normalize(join(root, path));
    if (!file.startsWith(root)) { res.writeHead(403).end('no'); return; }
    const s = await stat(file);
    if (!s.isFile()) { res.writeHead(404).end('not here'); return; }
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': types[extname(file)] || 'application/octet-stream',
      'cache-control': 'no-store',
      // the machine is one page: allow it to be embedded anywhere
      'x-frame-options': 'ALLOWALL',
      'access-control-allow-origin': '*',
    }).end(body);
  } catch {
    res.writeHead(404).end('not here');
  }
}).listen(port, '0.0.0.0', () => {
  console.log(`leap · dev · http://0.0.0.0:${port}`);
});
