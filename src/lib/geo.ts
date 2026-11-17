import type { LngLat } from './types';

/** Campus datum — the Arts College dome axis, Osmania University, Hyderabad. */
export const DATUM = { lng: 78.5285, lat: 17.4175 } as const;
export const M_PER_DEG_LAT = 110574;
export const M_PER_DEG_LNG = 111320 * Math.cos((DATUM.lat * Math.PI) / 180);

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function toMeters([lng, lat]: LngLat): { x: number; y: number } {
  return { x: (lng - DATUM.lng) * M_PER_DEG_LNG, y: (lat - DATUM.lat) * M_PER_DEG_LAT };
}

export function toLngLat(x: number, y: number): LngLat {
  return [DATUM.lng + x / M_PER_DEG_LNG, DATUM.lat + y / M_PER_DEG_LAT];
}

/** Local metres → three.js scene space (x east, y up, z south). */
export function toScene(x: number, y: number, altitude = 0): [number, number, number] {
  return [x, altitude, -y];
}

export function haversine(a: LngLat, b: LngLat): number {
  const R = 6371008.8;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const la1 = (a[1] * Math.PI) / 180;
  const la2 = (b[1] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing a→b, degrees clockwise from north. */
export function bearing(a: LngLat, b: LngLat): number {
  const φ1 = (a[1] * Math.PI) / 180;
  const φ2 = (b[1] * Math.PI) / 180;
  const Δλ = ((b[0] - a[0]) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export function compassName(deg: number): string {
  const idx = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return COMPASS[idx];
}
export function compassAbbr(deg: number): string {
  const idx = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][idx];
}

export function polylineLength(coords: LngLat[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i += 1) total += haversine(coords[i - 1], coords[i]);
  return total;
}

export function formatDistance(m: number): string {
  if (!Number.isFinite(m)) return '—';
  if (m < 1000) return `${Math.round(m / 5) * 5} m`;
  return `${(m / 1000).toFixed(2)} km`;
}

export function formatDuration(s: number): string {
  if (!Number.isFinite(s)) return '—';
  const mins = Math.round(s / 60);
  if (mins < 1) return '<1 min';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const rest = mins % 60;
  return `${h}h ${rest.toString().padStart(2, '0')}m`;
}

export function minutesToClock(minutes: number): string {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function polygonBounds(coords: LngLat[]): [number, number, number, number] {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLng, minLat, maxLng, maxLat];
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const int = parseInt(full, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

export function rgbToHex(rgb: [number, number, number]): string {
  return `#${rgb.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')}`;
}

export function mixHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex([lerp(ca[0], cb[0], t), lerp(ca[1], cb[1], t), lerp(ca[2], cb[2], t)]);
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Smooth 1D value noise used by the procedural terrain-shading helpers. */
export function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}
