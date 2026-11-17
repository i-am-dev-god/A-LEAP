import type { Map as MLMap, StyleSpecification } from 'maplibre-gl';
import buildingsRaw from '@/data/ou-buildings.geojson';
import walkwaysRaw from '@/data/ou-walkways.geojson';
import foliageRaw from '@/data/ou-foliage.geojson';
import terrainRaw from '@/data/ou-terrain.geojson';
import type { BuildingCategory, LngLat } from './types';
import { buildingPalette, type LightingState } from './lighting';
import { clamp, mixHex, toLngLat } from './geo';

const CATEGORIES: BuildingCategory[] = [
  'heritage',
  'academic',
  'library',
  'research',
  'admin',
  'hostel',
  'residential',
  'amenity',
  'sports',
  'health',
  'worship',
  'events',
];

function buildingColorExpression(lighting: LightingState): unknown[] {
  const palette = buildingPalette(lighting);
  const expr: unknown[] = ['match', ['get', 'category']];
  for (const category of CATEGORIES) {
    expr.push(category, palette[category]);
  }
  expr.push(palette.academic);
  return expr;
}

/** Tactical survey grid generated in-memory (no tile servers involved). */
function buildGrid() {
  const features: {
    type: 'Feature';
    properties: Record<string, unknown>;
    geometry: { type: 'LineString'; coordinates: LngLat[] };
  }[] = [];
  const step = 250;
  for (let x = -1250; x <= 1250; x += step) {
    features.push({
      type: 'Feature',
      properties: { axis: 'x' },
      geometry: { type: 'LineString', coordinates: [toLngLat(x, -1000), toLngLat(x, 1000)] },
    });
  }
  for (let y = -1000; y <= 1000; y += step) {
    features.push({
      type: 'Feature',
      properties: { axis: 'y' },
      geometry: { type: 'LineString', coordinates: [toLngLat(-1250, y), toLngLat(1250, y)] },
    });
  }
  return { type: 'FeatureCollection' as const, features };
}

const gridData = buildGrid();

const lineWidth = (a: number, b: number, c: number, d: number): any => [
  'interpolate',
  ['linear'],
  ['zoom'],
  13.4,
  a,
  16,
  b,
  18.5,
  c + (d - c) * 0.35,
];

export function createCampusStyle(lighting: LightingState): StyleSpecification {
  const canopyColor = mixHex(lighting.grove, lighting.lawn, 0.4);
  const ground = mixHex(lighting.ground, lighting.sky, 0.16);

  return {
    version: 8,
    name: 'OU Spatial Engine — self-hosted campus core',
    sources: {
      buildings: { type: 'geojson', data: buildingsRaw as never },
      walkways: { type: 'geojson', data: walkwaysRaw as never },
      foliage: { type: 'geojson', data: foliageRaw as never },
      terrain: { type: 'geojson', data: terrainRaw as never },
      grid: { type: 'geojson', data: gridData as never },
    },
    layers: [
      {
        id: 'bg',
        type: 'background',
        paint: { 'background-color': lighting.ground },
      },
      {
        id: 'campus-ground',
        type: 'fill',
        source: 'terrain',
        filter: ['==', ['get', 'class'], 'boundary'],
        paint: { 'fill-color': ground, 'fill-opacity': 1 },
      },
      {
        id: 'grid',
        type: 'line',
        source: 'grid',
        minzoom: 13.8,
        paint: {
          'line-color': mixHex(lighting.boundary, ground, 0.72),
          'line-width': 0.6,
          'line-opacity': 0.24,
        },
      },
      {
        id: 'foliage-fill',
        type: 'fill',
        source: 'foliage',
        filter: ['in', ['get', 'class'], ['literal', ['lawn', 'garden', 'grove', 'turf']]],
        paint: {
          'fill-color': [
            'match',
            ['get', 'class'],
            'lawn',
            lighting.lawn,
            'garden',
            mixHex(lighting.lawn, lighting.grove, 0.45),
            'grove',
            lighting.grove,
            'turf',
            lighting.turf,
            lighting.lawn,
          ],
          'fill-opacity': 0.92,
        },
      },
      {
        id: 'water-fill',
        type: 'fill',
        source: 'terrain',
        filter: ['==', ['get', 'class'], 'water'],
        paint: { 'fill-color': lighting.water, 'fill-opacity': 0.94 },
      },
      {
        id: 'water-shore',
        type: 'line',
        source: 'terrain',
        filter: ['==', ['get', 'class'], 'water'],
        paint: {
          'line-color': mixHex(lighting.boundary, lighting.water, 0.4),
          'line-width': 1.4,
          'line-opacity': 0.55,
        },
      },
      {
        id: 'contours',
        type: 'line',
        source: 'terrain',
        filter: ['==', ['get', 'class'], 'contour'],
        minzoom: 14.2,
        paint: {
          'line-color': lighting.contour,
          'line-width': ['case', ['==', ['get', 'major'], 1], 1.2, 0.6],
          'line-opacity': ['case', ['==', ['get', 'major'], 1], 0.3, 0.16],
          'line-dasharray': [4, 3],
        },
      },
      {
        id: 'canopy-fill',
        type: 'circle',
        source: 'foliage',
        filter: ['==', ['get', 'class'], 'tree'],
        paint: {
          'circle-color': canopyColor,
          'circle-opacity': ['interpolate', ['linear'], ['zoom'], 13.5, 0.5, 15.2, 0.34, 16.2, 0],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 13.5, 1.4, 16, 3.2, 17.5, 5],
          'circle-blur': 0.6,
        },
      },
      {
        id: 'boundary',
        type: 'line',
        source: 'terrain',
        filter: ['==', ['get', 'class'], 'boundary'],
        paint: {
          'line-color': lighting.boundary,
          'line-width': 1.6,
          'line-opacity': 0.5,
          'line-dasharray': [6, 5],
        },
      },
      {
        id: 'road-glow',
        type: 'line',
        source: 'walkways',
        filter: ['==', ['get', 'kind'], 'road'],
        paint: {
          'line-color': mixHex(lighting.boundary, lighting.road, 0.45),
          'line-width': ['interpolate', ['linear'], ['zoom'], 13.4, 6, 16, 20, 18.5, 44],
          'line-blur': 16,
          'line-opacity': 0.35,
        },
      },
      {
        id: 'road-casing',
        type: 'line',
        source: 'walkways',
        filter: ['==', ['get', 'kind'], 'road'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': lighting.roadCasing,
          'line-width': lineWidth(2.2, 7.5, 12, 26),
          'line-opacity': 0.9,
        },
      },
      {
        id: 'road-surface',
        type: 'line',
        source: 'walkways',
        filter: ['==', ['get', 'kind'], 'road'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': lighting.road,
          'line-width': lineWidth(1.3, 5.2, 9, 20),
          'line-opacity': 1,
        },
      },
      {
        id: 'road-centreline',
        type: 'line',
        source: 'walkways',
        filter: ['all', ['==', ['get', 'kind'], 'road'], ['==', ['get', 'lit'], 1]],
        minzoom: 15,
        paint: {
          'line-color': mixHex('#ffc46b', lighting.road, 0.25),
          'line-width': lineWidth(0.5, 1, 1.4, 2),
          'line-opacity': 0.35,
          'line-dasharray': [3, 4],
        },
      },
      {
        id: 'paths',
        type: 'line',
        source: 'walkways',
        filter: ['in', ['get', 'kind'], ['literal', ['path', 'promenade']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': lighting.path,
          'line-width': lineWidth(1, 2.6, 4, 8.5),
          'line-opacity': 0.92,
        },
      },
      {
        id: 'path-warm',
        type: 'line',
        source: 'walkways',
        filter: ['all', ['==', ['get', 'kind'], 'promenade'], ['==', ['get', 'lit'], 1]],
        layout: { 'line-cap': 'round' },
        paint: {
          'line-color': mixHex('#ffc46b', lighting.path, 0.55),
          'line-width': lineWidth(0.4, 0.8, 1.2, 2),
          'line-opacity': 0.22,
        },
      },
      {
        id: 'stairs',
        type: 'line',
        source: 'walkways',
        filter: ['==', ['get', 'kind'], 'stairs'],
        paint: {
          'line-color': lighting.steps,
          'line-width': lineWidth(1.4, 3.4, 5, 10),
          'line-opacity': 0.9,
          'line-dasharray': [1.4, 1.1],
        },
      },
      {
        id: 'buildings-outline',
        type: 'line',
        source: 'buildings',
        paint: {
          'line-color': lighting.outline,
          'line-width': 0.9,
          'line-opacity': 0.26,
        },
      },
      {
        id: 'buildings-hero-outline',
        type: 'line',
        source: 'buildings',
        filter: ['!=', ['get', 'hero'], ''],
        paint: {
          'line-color': mixHex('#ffe1a1', lighting.outline, 0.35),
          'line-width': 1.5,
          'line-opacity': 0.55,
        },
      },
      {
        id: 'buildings-3d',
        type: 'fill-extrusion',
        source: 'buildings',
        paint: {
          'fill-extrusion-color': buildingColorExpression(lighting) as never,
          'fill-extrusion-height': ['get', 'height_m'],
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0.94,
          'fill-extrusion-vertical-gradient': true,
        },
      },
    ],
  };
}

/** Applies a new light rig to live map paint properties without a style reload. */
export function applyLightingToMap(map: MLMap, lighting: LightingState): void {
  const setPaint = (layer: string, prop: string, value: unknown) => {
    if (map.getLayer(layer)) {
      try {
        map.setPaintProperty(layer, prop, value as never);
      } catch {
        /* layer still loading — the next frame will reconcile */
      }
    }
  };

  const ground = mixHex(lighting.ground, lighting.sky, 0.16);
  const canopyColor = mixHex(lighting.grove, lighting.lawn, 0.4);

  setPaint('bg', 'background-color', lighting.ground);
  setPaint('campus-ground', 'fill-color', ground);
  setPaint('grid', 'line-color', mixHex(lighting.boundary, ground, 0.72));
  setPaint('water-fill', 'fill-color', lighting.water);
  setPaint('water-shore', 'line-color', mixHex(lighting.boundary, lighting.water, 0.4));
  setPaint('foliage-fill', 'fill-color', [
    'match',
    ['get', 'class'],
    'lawn',
    lighting.lawn,
    'garden',
    mixHex(lighting.lawn, lighting.grove, 0.45),
    'grove',
    lighting.grove,
    'turf',
    lighting.turf,
    lighting.lawn,
  ]);
  setPaint('contours', 'line-color', lighting.contour);
  setPaint('boundary', 'line-color', lighting.boundary);
  setPaint('canopy-fill', 'circle-color', canopyColor);
  setPaint('road-glow', 'line-color', mixHex(lighting.boundary, lighting.road, 0.45));
  setPaint('road-casing', 'line-color', lighting.roadCasing);
  setPaint('road-surface', 'line-color', lighting.road);
  setPaint('road-centreline', 'line-color', mixHex('#ffc46b', lighting.road, 0.25));
  setPaint('paths', 'line-color', lighting.path);
  setPaint('path-warm', 'line-color', mixHex('#ffc46b', lighting.path, 0.55));
  setPaint('stairs', 'line-color', lighting.steps);
  setPaint('buildings-outline', 'line-color', lighting.outline);
  setPaint('buildings-hero-outline', 'line-color', mixHex('#ffe1a1', lighting.outline, 0.35));
  setPaint('buildings-3d', 'fill-extrusion-color', buildingColorExpression(lighting));
  setPaint('buildings-3d', 'fill-extrusion-opacity', lighting.isNight ? 0.88 : 0.96);

  try {
    const dir = lighting.sun;
    const az = (dir.azimuthDeg * Math.PI) / 180;
    const el = Math.max(6, dir.elevationDeg) * (Math.PI / 180);
    const east = Math.sin(az) * Math.cos(el);
    const north = Math.cos(az) * Math.cos(el);
    const up = Math.sin(el);
    map.setLight({
      anchor: 'viewport',
      color: lighting.sunColor,
      intensity: clamp(lighting.sunIntensity * 0.75, 0.15, 1.6),
      position: [east * 2.4, up * 3.2, -north * 2.4],
      castShadows: !lighting.isNight,
      shadowIntensity: 0.46,
    } as never);
  } catch {
    /* lighting API unavailable on this GPU — geometry lighting still applies */
  }
}
