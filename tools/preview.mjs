#!/usr/bin/env node
/* ============================================================================
   L E A P — preview
   ----------------------------------------------------------------------------
   A CPU re-implementation of the field shader, used to eyeball aesthetics
   without a GPU. It does not define the look: it *parses the generated GLSL*
   for its constants, so what it draws is what the shader will draw.
   Development tool only — never shipped, never fetched by the machine.
   ==========================================================================*/

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { genome, shaderSource, encodeSeed, hashName } from '../src/core.js';

/* ---------- extract the genome's constants straight from the shader ------- */
function constants(src) {
  const num = (re) => Number(src.match(re)[1]);
  const vec = (name) => src.match(new RegExp(`vec3 ${name}\\s*=\\s*vec3\\(([^)]*)\\)`))[1]
    .split(',').map(Number);
  return {
    GROUND: vec('GROUND'), BODY: vec('BODY'), LIGHT: vec('LIGHT'), ACCENT: vec('ACCENT'),
    GLOW: num(/float GLOW\s*=\s*([\d.]+)/),
    WARP: num(/float WARP\s*=\s*([\d.]+)/),
    SCALE: num(/float SCALE\s*=\s*([\d.]+)/),
    VIGNET: num(/float VIGNET\s*=\s*([\d.]+)/),
    GRAIN: num(/float GRAIN\s*=\s*([\d.]+)/),
    CONTOUR: num(/float CONTOUR\s*=\s*([\d.]+)/),
    SUNX: num(/vec2  SUN = vec2\(([-\d.]+),/),
    SUNY: num(/vec2  SUN = vec2\([-\d.]+, ([-\d.]+)\)/),
    SUNSIZE: num(/float SUNSIZE\s*=\s*([\d.]+)/),

  };
}

/* ---------- the shader's maths, in JavaScript ---------------------------- */
const fract = (x) => x - Math.floor(x);
const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smoothstep = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

function hash2(x, y) {
  let px = fract(x * 123.34), py = fract(y * 456.21);
  const d = px * (px + 45.32) + py * (py + 45.32);
  px += d; py += d;
  return fract(px * py);
}
function noise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return mix(
    mix(hash2(ix, iy), hash2(ix + 1, iy), ux),
    mix(hash2(ix, iy + 1), hash2(ix + 1, iy + 1), ux), uy);
}
function fbm(x, y) {
  let v = 0, a = 0.5;
  for (let i = 0; i < 5; i++) { v += a * noise(x, y); x *= 2.03; y *= 2.03; a *= 0.5; }
  return v;
}

function terrainAt(C, x, y, t) {
  const w = fbm(x * 1.7 + t, y * 1.7 - t * 0.7);
  const q = fbm(x * 2.3 + w * 1.8 - t * 1.3, y * 2.3 + w * 1.8 + t * 0.9);
  return fbm(x * 1.1 + q * 2.4 + t * 0.5, y * 1.1 + q * 2.4 + t * 0.35);
}

function render(C, W, H, time = 24) {
  const out = new Float32Array(W * H * 3);
  const minD = Math.min(W, H);
  const t = time * 0.018;
  const mix3 = (a, b, k) => a.map((v, n) => mix(v, b[n], k));
  const add3 = (a, b, k) => a.map((v, n) => v + b[n] * k);
  const mul3 = (a, k) => a.map((v) => v * k);
  const contour = (v, w) => {
    const f = fract(v);
    const d = Math.min(f, 1 - f);
    return 1 - smoothstep(0, w, d);
  };

  const Hfn = (x, y) => {
    const m = fbm(x * 0.20 + t * 0.10, y * 0.20 - t * 0.07);
    const base = smoothstep(0.32, 0.74, m);
    const ridged = Math.pow(1 - Math.abs(terrainAt(C, x + t * 0.45, y + t * 0.18, t) * 2 - 1), 2.0);
    return clamp01(base * 0.52 + ridged * 0.48 * (0.42 + 0.58 * base));
  };

  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const gx = i + 0.5, gy = H - j - 0.5;
      const ux = (gx - 0.5 * W) / minD, uy = (gy - 0.5 * H) / minD;

      const k = 0.30 + C.SCALE * 0.42;
      const px = ux * k, py = uy * k;
      const h = Hfn(px, py);
      const e = 0.004;
      const hx = Hfn(px + e, py) - h;
      const hy = Hfn(px, py + e) - h;
      const g = Math.hypot(hx, hy);

      let paper = mix3(mul3(C.GROUND, 0.72), mul3(C.BODY, 0.16), 0.5);
      const ink = mix3(mul3(C.LIGHT, 1.25), [0.97, 0.95, 0.90], 0.55);

      const sunD = Math.hypot(ux - C.SUNX, (uy - C.SUNY) * 1.25);
      paper = add3(paper, C.ACCENT, Math.exp(-sunD / (C.SUNSIZE * 6.0)) * 0.16);
      paper = add3(paper, C.ACCENT, Math.exp(-sunD / (C.SUNSIZE * 1.7)) * 0.10);
      paper = add3(paper, [1, 1, 1], smoothstep(C.SUNSIZE * 0.9, C.SUNSIZE * 0.2, sunD) * 0.06);

      const vig = 1 - C.VIGNET * smoothstep(0.55, 1.55, Math.hypot(ux * 0.85, uy));
      let col = mul3(paper, 0.55 + 0.45 * vig);

      const PX = 1.9 / Math.min(W, H);
      const levels = 12 + C.CONTOUR * 11;
      const cellsPerUv = (g / 0.004) * levels;
      const wMinor = Math.min(0.11, Math.max(0.0025, PX * cellsPerUv * 0.75));
      const wMajor = Math.min(0.16, Math.max(0.004, PX * cellsPerUv * 0.30));
      const minor = contour(h * levels, wMinor);
      const major = contour((h * levels) / 6, wMajor);

      const lineInk = mix3(ink, [1, 1, 1], 0.18);
      const focus = 0.42 + 0.58 * Math.pow(clamp01(1 - sunD * 0.58), 1.3);

      col = mix3(col, lineInk, minor * 0.42 * vig * focus);
      col = mix3(col, mix3(lineInk, mul3(C.ACCENT, 1.15), 0.30), major * 0.92 * vig * focus);
      col = col.map((v) => v + (hash2(Math.floor(gx * 0.5), Math.floor(gy * 0.5)) - 0.5) * 0.018);

      const d = Math.hypot(ux, uy);
      const gr = hash2(gx, gy + fract(time) * 97);
      col = col.map((v) => v + (gr - 0.5) * C.GRAIN * 1.4);
      col = col.map((v) => Math.pow(Math.max(0, v), 0.97));

      const o = (j * W + i) * 3;
      out[o] = col[0]; out[o + 1] = col[1]; out[o + 2] = col[2];
    }
  }
  return out;
}

/* ---------- tiny PNG encoder -------------------------------------------- */
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return (buf) => {
    let c = -1;
    for (const b of buf) c = t[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w * 3; x++) {
      raw[y * (w * 3 + 1) + 1 + x] = Math.round(clamp01(rgb[y * w * 3 + x]) * 255);
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- run ---------------------------------------------------------- */
const dir = process.argv[2] || '/tmp/leap-preview';
mkdirSync(dir, { recursive: true });
const words = process.argv.slice(3);
const seeds = words.length
  ? words.map((w) => encodeSeed(hashName(w), w))
  : [encodeSeed(hashName('naaldwijk'), 'naaldwijk')];

for (const seed of seeds) {
  const g = genome(seed);
  const C = constants(shaderSource(g));
  const t0 = Date.now();
  const W = 900, H = 560;
  const rgb = render(C, W, H);
  const file = `${dir}/${g.name.toLowerCase()}-${seed}.png`;
  writeFileSync(file, png(W, H, rgb));
  const mean = rgb.reduce((a, b) => a + b, 0) / rgb.length;
  console.log(`${file}  ${g.model} · ${g.mood} · mean ${mean.toFixed(3)} · ${Date.now() - t0}ms`);
}
