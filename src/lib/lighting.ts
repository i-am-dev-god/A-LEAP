import type { BuildingCategory } from './types';
import { clamp, hexToRgb, lerp, mixHex, rgbToHex } from './geo';
import type { SunPosition } from './sunCalc';

export type TimePreset = 'dawn' | 'noon' | 'golden' | 'night' | 'live' | 'custom';
export type Quality = 'cinematic' | 'balanced';

export const TIME_PRESETS: {
  id: TimePreset;
  label: string;
  minutes: number | null;
  hint: string;
}[] = [
  { id: 'dawn', label: 'Dawn', minutes: 400, hint: '06:40 · soft north light' },
  { id: 'noon', label: 'Noon', minutes: 744, hint: '12:24 · high sun' },
  { id: 'golden', label: 'Golden', minutes: 1032, hint: '17:12 · long shadows' },
  { id: 'night', label: 'Night', minutes: 1305, hint: '21:45 · cyber neon grid' },
  { id: 'live', label: 'Live', minutes: null, hint: 'Hyderabad right now' },
];

export interface LightingState {
  minutes: number;
  preset: TimePreset;
  label: string;
  sun: SunPosition;
  sky: string;
  ground: string;
  horizon: string;
  water: string;
  lawn: string;
  grove: string;
  turf: string;
  road: string;
  roadCasing: string;
  path: string;
  steps: string;
  contour: string;
  boundary: string;
  outline: string;
  sunColor: string;
  sunIntensity: number;
  ambientColor: string;
  ambientIntensity: number;
  fog: string;
  neon: number;
  exposure: number;
  starOpacity: number;
  buildingTint: string;
  buildingTintAmount: number;
  isNight: boolean;
}

interface Stop {
  e: number;
  sky: string;
  ground: string;
  horizon: string;
  sunColor: string;
  sunIntensity: number;
  ambientColor: string;
  ambientIntensity: number;
  neon: number;
}

const STOPS: Stop[] = [
  {
    e: -18,
    sky: '#03060d',
    ground: '#050a12',
    horizon: '#0a1622',
    sunColor: '#7fa8ff',
    sunIntensity: 0.16,
    ambientColor: '#12263f',
    ambientIntensity: 0.62,
    neon: 1,
  },
  {
    e: -7,
    sky: '#050b15',
    ground: '#070e17',
    horizon: '#12263b',
    sunColor: '#8fb2ff',
    sunIntensity: 0.24,
    ambientColor: '#16314c',
    ambientIntensity: 0.66,
    neon: 0.92,
  },
  {
    e: -1.5,
    sky: '#191a2c',
    ground: '#141a22',
    horizon: '#4b3c58',
    sunColor: '#ff8f63',
    sunIntensity: 0.6,
    ambientColor: '#2b3450',
    ambientIntensity: 0.7,
    neon: 0.62,
  },
  {
    e: 4,
    sky: '#33291f',
    ground: '#20241f',
    horizon: '#8c5c37',
    sunColor: '#ffb178',
    sunIntensity: 1.25,
    ambientColor: '#3c3a3c',
    ambientIntensity: 0.6,
    neon: 0.32,
  },
  {
    e: 18,
    sky: '#1b2f38',
    ground: '#1e2b27',
    horizon: '#708b86',
    sunColor: '#ffe3bf',
    sunIntensity: 1.75,
    ambientColor: '#40504f',
    ambientIntensity: 0.55,
    neon: 0.16,
  },
  {
    e: 42,
    sky: '#16303c',
    ground: '#23332d',
    horizon: '#8fa9a5',
    sunColor: '#fff8ec',
    sunIntensity: 2.05,
    ambientColor: '#4b5b59',
    ambientIntensity: 0.5,
    neon: 0.1,
  },
  {
    e: 70,
    sky: '#122c3a',
    ground: '#25352f',
    horizon: '#9bb4b0',
    sunColor: '#fffdf6',
    sunIntensity: 2.2,
    ambientColor: '#51625f',
    ambientIntensity: 0.48,
    neon: 0.08,
  },
];

const CATEGORY_BASE: Record<BuildingCategory, string> = {
  heritage: '#cbb089',
  academic: '#93a7b7',
  library: '#8cb4ad',
  research: '#8da1af',
  admin: '#9aa6b4',
  hostel: '#ac8e7d',
  residential: '#a39c8e',
  amenity: '#b29b81',
  sports: '#84a996',
  health: '#bba4a4',
  worship: '#d8d1be',
  events: '#b8a68d',
};

function sample(elevation: number): Stop {
  if (elevation <= STOPS[0].e) return STOPS[0];
  if (elevation >= STOPS[STOPS.length - 1].e) return STOPS[STOPS.length - 1];
  for (let i = 1; i < STOPS.length; i += 1) {
    const a = STOPS[i - 1];
    const b = STOPS[i];
    if (elevation <= b.e) {
      const t = (elevation - a.e) / (b.e - a.e);
      return {
        e: elevation,
        sky: mixHex(a.sky, b.sky, t),
        ground: mixHex(a.ground, b.ground, t),
        horizon: mixHex(a.horizon, b.horizon, t),
        sunColor: mixHex(a.sunColor, b.sunColor, t),
        sunIntensity: lerp(a.sunIntensity, b.sunIntensity, t),
        ambientColor: mixHex(a.ambientColor, b.ambientColor, t),
        ambientIntensity: lerp(a.ambientIntensity, b.ambientIntensity, t),
        neon: lerp(a.neon, b.neon, t),
      };
    }
  }
  return STOPS[STOPS.length - 1];
}

export function presetLabel(preset: TimePreset): string {
  return TIME_PRESETS.find((p) => p.id === preset)?.label ?? 'Custom';
}

export function lightingFromSun(
  sun: SunPosition,
  minutes: number,
  preset: TimePreset
): LightingState {
  const stop = sample(sun.elevationDeg);
  const night = sun.elevationDeg < 1.5;
  const ground = stop.ground;
  const darken = clamp(1 - stop.sunIntensity * 0.18, 0.72, 1);

  return {
    minutes,
    preset,
    label: presetLabel(preset),
    sun,
    sky: stop.sky,
    ground,
    horizon: stop.horizon,
    water: mixHex(ground, '#0e2a3d', night ? 0.62 : 0.5),
    lawn: mixHex(ground, '#1c3a2a', night ? 0.5 : 0.72),
    grove: mixHex(ground, '#153122', night ? 0.52 : 0.68),
    turf: mixHex(ground, '#234a32', night ? 0.46 : 0.66),
    road: mixHex(ground, '#31404b', 0.62),
    roadCasing: mixHex(ground, '#0a1219', 0.7),
    path: mixHex(ground, '#5b6a6c', 0.5),
    steps: mixHex(ground, '#7b898b', 0.44),
    contour: mixHex(ground, '#6f8f92', 0.55),
    boundary: mixHex('#43e2ff', ground, 0.35),
    outline: mixHex('#dff8ff', ground, 0.62),
    sunColor: stop.sunColor,
    sunIntensity: stop.sunIntensity,
    ambientColor: stop.ambientColor,
    ambientIntensity: stop.ambientIntensity,
    fog: mixHex(stop.sky, stop.ground, 0.45),
    neon: stop.neon,
    exposure: lerp(0.92, 1.08, clamp(stop.sunIntensity / 2.2, 0, 1)),
    starOpacity: clamp((-sun.elevationDeg - 2) / 12, 0, 0.85),
    buildingTint: mixHex('#0d2233', '#0a0f14', darken),
    buildingTintAmount: night ? 0.52 : 0.18,
    isNight: night,
  };
}

export function buildingPalette(l: LightingState): Record<BuildingCategory, string> {
  const entries = Object.entries(CATEGORY_BASE) as [BuildingCategory, string][];
  const out = {} as Record<BuildingCategory, string>;
  for (const [category, base] of entries) {
    const lit = mixHex(base, l.sunColor, l.isNight ? 0.02 : 0.16);
    out[category] = mixHex(lit, l.buildingTint, l.buildingTintAmount);
  }
  return out;
}

export function categoryAccent(category: BuildingCategory): string {
  switch (category) {
    case 'heritage':
      return '#ffc46b';
    case 'library':
      return '#66f0d0';
    case 'academic':
      return '#7fd4ff';
    case 'hostel':
      return '#ff9e7d';
    case 'sports':
      return '#8dffb0';
    case 'health':
      return '#ff9db5';
    case 'worship':
      return '#e6dcae';
    case 'admin':
      return '#b4c8ff';
    case 'amenity':
      return '#ffcf8a';
    case 'events':
      return '#ffd08a';
    case 'research':
      return '#84e2ff';
    default:
      return '#a9b6c2';
  }
}

export function skyGradient(l: LightingState): string {
  const top = mixHex(l.sky, '#000000', 0.18);
  const mid = l.horizon;
  const bottom = mixHex(l.ground, l.sky, 0.4);
  return `radial-gradient(120% 90% at 50% 8%, ${mid} 0%, ${top} 46%, ${bottom} 100%)`;
}

export function rgbTuple(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  return [r, g, b];
}

export function cssColor(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function normalizeHex(hex: string): string {
  return rgbToHex(hexToRgb(hex));
}
