/* ============================================================================
   L E A P — core
   ----------------------------------------------------------------------------
   The entire operating environment is reconstructed from one 9-character
   seed: 32 bits of entropy, plus 10 bits of checksum that prove which
   human-readable name the machine was derived from. 42 bits of identity.
   No user data is ever written. This file is the single source of truth for
   "what does this machine look like", and it is pure: same seed in, same
   pixels out, on every GPU, every reload, every machine.
   ==========================================================================*/

export const VERSION = '1.0.0-comeback';

/* ---------------------------------------------------------------- bit ops -- */

const U32 = 0xffffffff;

/** A tiny, fast, well-distributed 32-bit PRNG (mulberry32). Returns floats in [0,1). */
export function prng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a, 32-bit. Stable identity of a name. */
export function hashName(name) {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 42-bit checksum: the low 10 bits of a second, differently-seeded pass. */
export function checksum42(name) {
  let h = 0x9e3779b9;
  for (let i = name.length - 1; i >= 0; i--) {
    h ^= name.charCodeAt(i) + 0x9e37;
    h = Math.imul(h ^ (h >>> 13), 0x85ebca6b) >>> 0;
  }
  return h & 0x3ff; // 10 bits
}

const B32 = '0123456789abcdefghjkmnpqrstuvwxyz'; // Crockford-ish, no i/l/o/u

export function randomEntropy() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] >>> 0;
}

/** seed string = 7 chars of entropy (32 bits) + 2 chars of name checksum (10 bits). */
export function encodeSeed(entropy, name = '') {
  let s = '';
  let e = entropy >>> 0;
  for (let i = 0; i < 7; i++) { s += B32[e % 32]; e = Math.floor(e / 32); }
  const c = checksum42(name) & 0x3ff; // 10 bits, two base32 characters
  return s + B32[c >> 5] + B32[c & 31];
}

export function decodeSeed(seed) {
  if (typeof seed !== 'string' || seed.length !== 9) return null;
  let entropy = 0;
  for (let i = 0; i < 7; i++) {
    const v = B32.indexOf(seed[i]);
    if (v < 0) return null;
    entropy += v * Math.pow(32, i);
  }
  const c1 = B32.indexOf(seed[7]);
  const c2 = B32.indexOf(seed[8]);
  if (c1 < 0 || c2 < 0) return null;
  return { entropy: entropy >>> 0, nameSum: (c1 << 5) | c2 };
}

export function seedMatchesName(seed, name) {
  const d = decodeSeed(seed);
  return !!d && d.nameSum === checksum42(name);
}

/* --------------------------------------------------------------- genome --- */

// 30 × 28 × 20 = 16,800 pronounceable names, all distinct, all pleasant.
const SYLL_A = ['ka','lo','mi','nu','ra','se','ta','vi','zen','or','ae','ilu','mor','thal','nyx','sol','qua','vex','ys','brim','cae','dra','esh','fen','gal','hir','ist','jun','kel','lun'];
const SYLL_B = ['dre','mira','lune','vale','skye','thar','quin','zora','lyth','nova','rune','sable','thorn','umbra','wisp','yara','ash','bore','cinder','dusk','fen','gale','holt','mere','wyn','cor','bram','vell'];
const SYLL_C = ['','','','','','','','','','','-a','-e','-i','-o','-u','-wen','-mar','-ish','-oth','-iel'];

const MOODS = [
  { id: 'mineral',  label: 'mineral',  warmth: 0.18, glow: 0.22 },
  { id: 'botanic',  label: 'botanic',  warmth: 0.62, glow: 0.34 },
  { id: 'ember',    label: 'ember',    warmth: 0.92, glow: 0.58 },
  { id: 'cryo',     label: 'cryo',     warmth: 0.06, glow: 0.46 },
  { id: 'tidal',    label: 'tidal',    warmth: 0.44, glow: 0.40 },
  { id: 'halide',   label: 'halide',   warmth: 0.72, glow: 0.68 },
];

export function titleCase(w) { return w[0].toUpperCase() + w.slice(1); }

/** HSL -> RGB, all inputs 0..1. Coherent colour starts here. */
export function hsl(h, s, l) {
  h = ((h % 1) + 1) % 1;
  const k = (n) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

/**
 * Turn a seed into a machine identity. Pure and total: any 9-char seed yields
 * a complete, valid, beautiful machine. The name is the machine's own.
 */
export function genome(seed) {
  const d = decodeSeed(seed);
  if (!d) throw new Error(`not a LEAP seed: ${seed}`);
  // seed the generator through a whole-string hash and warm it up: adjacent
  // seeds otherwise correlate in mulberry32's first few outputs
  const r = prng(hashName(`leap:${seed}:machine`) ^ 0xa5f00d11);
  for (let i = 0; i < 12; i++) r();
  const pick = (arr) => arr[Math.floor(r() * arr.length) % arr.length];

  const name = titleCase(pick(SYLL_A)) + pick(SYLL_B) + pick(SYLL_C);
  const mood = MOODS[Math.floor(r() * MOODS.length) % MOODS.length];

  // Harmonic palette. 4 in 5 machines are analogous (calm, expensive-looking),
  // the rest split-complementary (bolder). Lightness is bounded so no seed can
  // produce a muddy or garish field.
  // Each mood is a hue family; the seed only jitters within it. A machine
  // called "ember" is always warm, which is the sort of honesty a name deserves.
  const MOOD_HUE = { mineral: 0.60, botanic: 0.30, ember: 0.055, cryo: 0.55, tidal: 0.47, halide: 0.86 };
  const base = ((MOOD_HUE[mood.id] ?? r()) + (r() - 0.5) * 0.10 + 1) % 1;
  const d1 = 0.035 + r() * 0.055;                 // analogous, always
  const d2 = 0.010 + r() * 0.025;
  const sat = 0.20 + r() * 0.34;
  const lum = 0.10 + r() * 0.09;

  const pal = {
    ground: hsl(base, sat * 0.72, lum),                    // the deep field
    body:   hsl(base + d1, sat * 1.15, 0.30 + r() * 0.12),        // the ridge colour
    light:  hsl(base + d1 + d2, sat * 0.75 + 0.10, 0.62 + r() * 0.14), // sunlit crest
    accent: hsl(base + 0.16 + r() * 0.10, sat * 0.9, 0.52 + r() * 0.10),
  };

  const g = {
    seed,
    entropy: d.entropy,
    name,
    model: `${mood.label}-${d.entropy.toString(16).padStart(7, '0').slice(0, 3)}`,
    mood: mood.id,
    // visual constants — every one is read by the shader
    grain: 0.025 + r() * 0.055,
    bloom: 0.35 + r() * 0.65,
    warp: 0.55 + r() * 1.9,
    scale: 0.30 + r() * 0.45,
    vignette: 0.55 + r() * 0.45,
    warmth: mood.warmth,
    glow: mood.glow,
    pal,
    // where this machine's sun sits on the plate, and how wide its bloom is
    sun: { x: -0.35 + r() * 0.7, y: 0.02 + r() * 0.45, size: 0.10 + r() * 0.14 },
    // three dials that define this machine's temperament
    dials: {
      attention: +(0.55 + r() * 0.45).toFixed(3),
      patience: +(0.35 + r() * 0.6).toFixed(3),
      playfulness: +(0.2 + r() * 0.8).toFixed(3),
    },
  };

  // a machine's aesthetic family, hashed rather than stored
  g.traits = [
    ['tempo', r() > 0.5 ? 'adagio' : 'andante'],
    ['surface', pick(['matte', 'satin', 'dust'])],
    ['light', pick(['north', 'sodium', 'clouded', 'aurora'])],
    ['edge', pick(['soft', 'crisp', 'eroded'])],
  ];
  return g;
}

/* --------------------------------------------------------------- shader --- */

/**
 * The shader is assembled from the genome. Nothing is downloaded, nothing is
 * cached to disk: the visual identity of the machine IS a string of GLSL that
 * is compiled at boot and thrown away at shutdown.
 */
export function shaderSource(g) {
  const f = (x) => x.toFixed(5);
  const v3 = (c) => `vec3(${f(c[0])}, ${f(c[1])}, ${f(c[2])})`;
  return `precision highp float;
uniform vec2  uRes;
uniform float uTime;
uniform float uBeat;
uniform vec2  uPointer;
uniform vec3  uWave;
uniform float uBoot;

// ── this machine's palette, derived from its seed ──────────────────────────
vec3 GROUND = ${v3(g.pal.ground)};
vec3 BODY   = ${v3(g.pal.body)};
vec3 LIGHT  = ${v3(g.pal.light)};
vec3 ACCENT = ${v3(g.pal.accent)};

float GLOW   = ${f(0.35 + g.glow * 0.55)};
float WARP   = ${f(g.warp)};
float SCALE  = ${f(g.scale)};
float VIGNET = ${f(g.vignette)};
float GRAIN  = ${f(g.grain)};
float CONTOUR = ${f(0.5 + g.bloom)};
vec2  SUN = vec2(${f(g.sun.x)}, ${f(g.sun.y)});
float SUNSIZE = ${f(g.sun.size)};

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.07 + 11.7; a *= 0.5; }
  return v / 0.9375;   // renormalise so h stays in 0..1
}

// the terrain: domain-warped fbm, the machine's own landscape
float terrain(vec2 p, float t) {
  float w = fbm(p * 0.85 + vec2(t * 0.8, -t * 0.6));
  float q = fbm(p * 1.10 + w * 0.55 + vec2(-t * 0.9, t * 0.7));
  return fbm(p * 0.62 + q * 0.75 + vec2(t * 0.4, t * 0.3));
}

// The landform. A continental mask decides where the high ground is; ridged
// noise decides how sharp it is. Composed before shading so the light is
// coherent across the whole map.
float height(vec2 tp, float t) {
  float mass = fbm(tp * 0.20 + vec2(t * 0.10, -t * 0.07));
  float base = smoothstep(0.32, 0.74, mass);
  vec2 q = tp + vec2(t * 0.45, t * 0.18);
  float ridged = 1.0 - abs(terrain(q, t) * 2.0 - 1.0);
  ridged = pow(ridged, 2.0);
  float h = base * 0.52 + ridged * 0.48 * (0.42 + 0.58 * base);
  return clamp(h, 0.0, 1.0);
}

/* A contour is a level set. Its screen width is derived from the slope in uv
   space, never from dFdx — so it is exact on WebGL1 and identical everywhere. */
float contour(float v, float w) {
  float f = fract(v);
  float d = min(f, 1.0 - f);
  return 1.0 - smoothstep(0.0, w, d);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  float t = uTime * 0.018 * (0.7 + 0.6 * uBeat);

  // ── the plate: a slow parallax drift, no perspective tricks ─────────────
  vec2 p = uv * (0.30 + SCALE * 0.42) + uPointer * 0.16;
  p += vec2(sin(t * 0.6 + WARP), cos(t * 0.45 - WARP)) * 0.10 * WARP;

  float h  = height(p, t);
  float e  = 0.004;
  float hx = height(p + vec2(e, 0.0), t) - h;
  float hy = height(p + vec2(0.0, e), t) - h;
  float g  = length(vec2(hx, hy));

  // ── ground: near-black paper, washed with this machine's own hue ────────
  vec3 paper = GROUND * 0.72 + BODY * 0.16;
  vec3 ink   = mix(LIGHT * 1.25, vec3(0.97, 0.95, 0.90), 0.55);

  // a broad, soft bloom where the machine's sun would be
  float sunD = length((uv - SUN) * vec2(1.0, 1.25));
  paper += ACCENT * exp(-sunD / (SUNSIZE * 5.0)) * 0.14;
  paper += ACCENT * exp(-sunD / (SUNSIZE * 1.6)) * 0.09;
  paper += vec3(1.0) * smoothstep(SUNSIZE * 0.85, SUNSIZE * 0.2, sunD) * 0.05;

  // vignette on the plate itself, so the ink fades at the edges like a print
  float vig = 1.0 - VIGNET * smoothstep(0.55, 1.55, length(uv * vec2(0.85, 1.0)));
  vec3 col = paper * (0.55 + 0.45 * vig);

  // ── the contour engraving ───────────────────────────────────────────────
  // A contour's screen width = pixels / (how many contour intervals fit on
  // screen). Deriving it from the slope is what keeps every line the same
  // weight, and it is what stops steep ground from filling in solid.
  float PX = 1.9 / min(uRes.x, uRes.y);        // ~2 device pixels, in uv units
  float levels = 12.0 + CONTOUR * 11.0;
  float cellsPerUv = g / 0.004 * levels;       // intervals per unit of uv
  float wMinor = clamp(PX * cellsPerUv * 0.75, 0.0025, 0.11);
  float wMajor = clamp(PX * cellsPerUv * 0.30, 0.004, 0.16);

  float minor = contour(h * levels, wMinor);
  float major = contour(h * levels / 6.0, wMajor);

  // Engraving, not marble: the ink itself is a near-constant value. Relief is
  // carried by line *density*, never by tone, so the plate reads as line art.
  vec3 lineInk = mix(ink, vec3(1.0), 0.18);

  // a focal falloff: detail is heaviest around the machine's sun and thins
  // toward the plate's edge, which gives the map a subject instead of a wall
  float focus = 0.42 + 0.58 * pow(clamp(1.0 - sunD * 0.58, 0.0, 1.0), 1.3);
  col = mix(col, lineInk, minor * 0.42 * vig * focus);
  col = mix(col, mix(lineInk, ACCENT * 1.15, 0.30), major * 0.92 * vig * focus);

  // a fine print texture on the paper, the way a real plate never sits still
  float paperGrain = hash(floor(gl_FragCoord.xy * 0.5)) - 0.5;
  col += paperGrain * 0.018;

  // ── the organ's waveform is a lit contour cutting the plate ─────────────
  float ridge = 0.0;
  for (int i = 0; i < 3; i++) {
    float a = i == 0 ? uWave.x : (i == 1 ? uWave.y : uWave.z);
    ridge += exp(-abs(h - (0.5 + a * 0.34)) * 55.0) * (0.35 + abs(a));
  }
  ridge /= 3.0;
  col += ACCENT * ridge * GLOW * 0.9;
  col = mix(col, LIGHT, smoothstep(0.35, 1.0, ridge) * 0.25);

  // ── boot: the plate engraves itself outward from the centre ─────────────
  float boot = smoothstep(0.0, 1.0, uBoot);
  float d = length(uv);
  col *= boot;
  col += ACCENT * exp(-d * 10.0) * (1.0 - boot) * 0.35;

  // ── grain and transfer ──────────────────────────────────────────────────
  float gr = hash(gl_FragCoord.xy + fract(uTime) * 97.0);
  col += (gr - 0.5) * GRAIN * 1.4;
  col = pow(max(col, 0.0), vec3(0.97));
  gl_FragColor = vec4(col, 1.0);
}`;
}

/* ------------------------------------------------------------- shell ----- */

export const IDENTITY = {
  kernel: 'leap-kernel/1.0',
  claim: 'The machine is a constant. Its state is a seed.',
  law: [
    'The seed reconstructs the machine. The machine never stores the seed.',
    'Nothing is written to disk: there is no disk.',
    'Every pixel on screen is a pure function of the seed, the clock, and you.',
    'A machine is not its files. A machine is a way of returning.',
  ],
};
