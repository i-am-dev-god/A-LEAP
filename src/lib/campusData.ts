import buildingsRaw from '@/data/ou-buildings.geojson';
import walkwaysRaw from '@/data/ou-walkways.geojson';
import foliageRaw from '@/data/ou-foliage.geojson';
import terrainRaw from '@/data/ou-terrain.geojson';
import metaRaw from '@/data/campus-meta.json';

import type {
  Building,
  BuildingProps,
  CampusGraph,
  CampusMeta,
  FeatureCollection,
  FoliageProps,
  LineGeometry,
  MultiLineGeometry,
  PointGeometry,
  PolygonGeometry,
  Poi,
  TerrainProps,
  WalkwayProps,
} from './types';
import { buildGraph } from './graphBuilder';

const buildingsFC = buildingsRaw as unknown as FeatureCollection<BuildingProps, PolygonGeometry>;
const walkwaysFC = walkwaysRaw as unknown as FeatureCollection<WalkwayProps, LineGeometry>;
const foliageFC = foliageRaw as unknown as FeatureCollection<FoliageProps, PolygonGeometry | PointGeometry>;
const terrainFC = terrainRaw as unknown as FeatureCollection<TerrainProps, PolygonGeometry | MultiLineGeometry>;

export const meta = metaRaw as CampusMeta;

function parsePois(raw: string): Poi[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p): p is Poi => Boolean(p) && typeof (p as Poi).name === 'string')
      .map((p) => ({ name: p.name, floor: Number(p.floor) || 0, kind: p.kind ?? 'room' }));
  } catch {
    return [];
  }
}

export const buildings: Building[] = buildingsFC.features.map((feature) => {
  const p = feature.properties;
  return {
    ...p,
    aliases: p.aliases ? p.aliases.split('|') : [],
    pois: parsePois(p.pois),
    polygon: feature.geometry.coordinates[0],
    entrance: [p.entrance_lng, p.entrance_lat],
    centroid: [p.cx_lng, p.cy_lat],
  };
});

export const buildingsById = new Map(buildings.map((b) => [b.id, b]));
export const buildingsByEntranceNode = new Map(
  buildings.map((b) => [b.entrance_node, b] as const)
);

export const campusGraph: CampusGraph = buildGraph(walkwaysFC);

export const walkways = walkwaysFC.features;
export const foliageFeatures = foliageFC.features;
export const terrainFeatures = terrainFC.features;

export const treePoints = foliageFeatures
  .filter((f) => f.properties.class === 'tree')
  .map((f) => {
    const [lng, lat] = (f.geometry as PointGeometry).coordinates;
    return {
      lng,
      lat,
      species: f.properties.species ?? 0,
      height: f.properties.h ?? 9,
      radius: f.properties.r ?? 3.2,
      phase: f.properties.phase ?? 0,
      tone: f.properties.tone ?? 0.5,
      elevation: f.properties.elev ?? 0,
    };
  });

export const greenZones = foliageFeatures.filter((f) => f.properties.class !== 'tree');

export const gates = meta.gates;

export function getBuilding(id: string | null | undefined): Building | undefined {
  if (!id) return undefined;
  return buildingsById.get(id);
}

export function entranceNodeForBuilding(id: string): string | null {
  return getBuilding(id)?.entrance_node ?? null;
}

export const campusTotals = {
  buildings: buildings.length,
  edges: campusGraph.edges.size,
  nodes: campusGraph.nodes.size,
  trees: treePoints.length,
  pathsKm: Object.values(Object.fromEntries(campusGraph.edges)).reduce((sum, e) => sum + e.lengthM, 0) / 1000,
  heroLandmarks: buildings.filter((b) => b.hero).length,
};
