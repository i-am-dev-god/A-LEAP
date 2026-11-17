export type LngLat = [number, number];

export interface GeoFeature<P, G = unknown> {
  type: 'Feature';
  properties: P;
  geometry: G;
}

export interface FeatureCollection<P, G = unknown> {
  type: 'FeatureCollection';
  name?: string;
  metadata?: Record<string, unknown>;
  features: GeoFeature<P, G>[];
}

export interface LineGeometry {
  type: 'LineString';
  coordinates: LngLat[];
}
export interface MultiLineGeometry {
  type: 'MultiLineString';
  coordinates: LngLat[][];
}
export interface PolygonGeometry {
  type: 'Polygon';
  coordinates: LngLat[][];
}
export interface PointGeometry {
  type: 'Point';
  coordinates: LngLat;
}

export type BuildingCategory =
  | 'heritage'
  | 'academic'
  | 'library'
  | 'research'
  | 'admin'
  | 'hostel'
  | 'residential'
  | 'amenity'
  | 'sports'
  | 'health'
  | 'worship'
  | 'events';

export type PoiKind = 'room' | 'lab' | 'office' | 'facility';

export interface Poi {
  name: string;
  floor: number;
  kind: PoiKind;
}

export interface BuildingProps {
  id: string;
  name: string;
  short: string;
  code: string;
  category: BuildingCategory;
  floors: number;
  height_m: number;
  base_m: number;
  rot: number;
  w_m: number;
  d_m: number;
  footprint_m2: number;
  hero: string;
  hub: string;
  entrance_node: string;
  entrance_lng: number;
  entrance_lat: number;
  cx_lng: number;
  cy_lat: number;
  aliases: string;
  hours: string;
  access: string;
  description: string;
  pois: string;
}

export interface Building extends Omit<BuildingProps, 'aliases' | 'pois'> {
  aliases: string[];
  pois: Poi[];
  polygon: LngLat[];
  entrance: LngLat;
  centroid: LngLat;
}

export type WalkwayKind = 'road' | 'promenade' | 'path' | 'stairs';
export type Surface = 'asphalt' | 'paver' | 'concrete' | 'gravel' | 'steps';

export interface WalkwayProps {
  id: string;
  from: string;
  to: string;
  from_label: string;
  to_label: string;
  kind: WalkwayKind;
  surface: Surface;
  width_m: number;
  lit: number;
  crowd: number;
  accessible: number;
  steps: number;
  length_m: number;
  elev_from: number;
  elev_to: number;
  grade: number;
  shade: number;
  name: string;
}

export interface FoliageProps {
  class: 'lawn' | 'garden' | 'grove' | 'turf' | 'water' | 'tree';
  name?: string;
  species?: number;
  h?: number;
  r?: number;
  phase?: number;
  tone?: number;
  elev?: number;
}

export interface TerrainProps {
  class: 'boundary' | 'water' | 'contour';
  name?: string;
  elev?: number;
  major?: number;
}

export interface CampusGate {
  id: string;
  node: string;
  name: string;
  aliases: string[];
}

export interface CampusMeta {
  name: string;
  shortName: string;
  city: string;
  state: string;
  country: string;
  datum: { lng: number; lat: number };
  centroid: [number, number];
  elevationMean: number;
  areaKm2: number;
  gates: CampusGate[];
  counts: { buildings: number; walkwayEdges: number; trees: number; terrainFeatures: number };
  survey: string;
  revision: string;
}

export interface GraphNode {
  id: string;
  label: string;
  kind: 'junction' | 'plaza' | 'gate' | 'entrance';
  coord: LngLat;
  elevation: number;
  buildingId?: string;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  lengthM: number;
  kind: WalkwayKind;
  surface: Surface;
  lit: boolean;
  crowd: number;
  accessible: boolean;
  steps: number;
  grade: number;
  elevFrom: number;
  elevTo: number;
  shade: number;
  geometry: LngLat[];
  widthM: number;
}

export interface CampusGraph {
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
  adjacency: Map<string, string[]>;
}

export interface ElevationSample {
  d: number;
  e: number;
}

export interface RouteResult {
  id: string;
  nodeIds: string[];
  edgeIds: string[];
  coordinates: LngLat[];
  distanceM: number;
  durationS: number;
  ascentM: number;
  descentM: number;
  stepsCount: number;
  stepFree: boolean;
  unlitM: number;
  crowdedM: number;
  profile: ElevationSample[];
  destinationNodeId: string;
}

export type TurnKind = 'start' | 'left' | 'right' | 'slight-left' | 'slight-right' | 'straight' | 'stairs' | 'arrive';

export interface DirectionStep {
  index: number;
  turn: TurnKind;
  instruction: string;
  distanceM: number;
  compass: string;
  nodeLabel: string;
  kind: WalkwayKind;
  lit: boolean;
  ascentM: number;
  icon: 'start' | 'left' | 'right' | 'straight' | 'stairs' | 'flag';
}

export type AlertKind = 'wifi' | 'library' | 'gate' | 'crowd' | 'event' | 'safety' | 'transport';
export type AlertSeverity = 'info' | 'warn' | 'critical';

export interface CampusAlert {
  id: string;
  kind: AlertKind;
  title: string;
  detail: string;
  zone: string;
  severity: AlertSeverity;
  value?: string;
  created_at: string;
  source: 'live' | 'simulated';
}

export interface PulseMetric {
  id: string;
  label: string;
  value: number;
  unit: string;
  capacity?: number;
  trend: number;
  zone: string;
}

export interface SearchEntry {
  id: string;
  title: string;
  subtitle: string;
  type: 'building' | 'room' | 'gate' | 'zone';
  buildingId?: string;
  floor?: number;
  category: string;
  keywords: string;
  code?: string;
}
