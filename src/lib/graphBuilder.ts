import type {
  CampusGraph,
  FeatureCollection,
  GraphEdge,
  GraphNode,
  LineGeometry,
  LngLat,
  MultiLineGeometry,
  WalkwayProps,
} from './types';
import { haversine } from './geo';

type WalkwayGeometry = LineGeometry | MultiLineGeometry;

const nodeKind = (id: string, label: string): GraphNode['kind'] => {
  if (id.startsWith('ent-')) return 'entrance';
  if (/gate$/i.test(id) || /\bgate\b/i.test(label)) return 'gate';
  if (/plaza|circle|forecourt|esplanade/i.test(label)) return 'plaza';
  return 'junction';
};

/**
 * Parses the self-hosted walkway GeoJSON into a spatial adjacency graph.
 * Every LineString is one weighted edge; shared endpoints become graph nodes.
 */
export function buildGraph(fc: FeatureCollection<WalkwayProps, WalkwayGeometry>): CampusGraph {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const adjacency = new Map<string, string[]>();

  const ensureNode = (
    id: string,
    label: string,
    coord: LngLat,
    elevation: number
  ): GraphNode => {
    const existing = nodes.get(id);
    if (existing) return existing;
    const buildingId = id.startsWith('ent-') ? id.slice(4) : undefined;
    const node: GraphNode = {
      id,
      label,
      kind: nodeKind(id, label),
      coord,
      elevation,
      buildingId,
    };
    nodes.set(id, node);
    adjacency.set(id, []);
    return node;
  };

  for (const feature of fc.features) {
    const p = feature.properties;
    const geometry = feature.geometry;
    const coords =
      geometry.type === 'LineString' ? geometry.coordinates : geometry.coordinates[0] ?? [];
    if (coords.length < 2) continue;

    const start = coords[0];
    const end = coords[coords.length - 1];

    ensureNode(p.from, p.from_label, start, p.elev_from);
    ensureNode(p.to, p.to_label, end, p.elev_to);

    const edge: GraphEdge = {
      id: p.id,
      from: p.from,
      to: p.to,
      lengthM: p.length_m || haversine(start, end),
      kind: p.kind,
      surface: p.surface,
      lit: Boolean(p.lit),
      crowd: p.crowd ?? 0.4,
      accessible: Boolean(p.accessible),
      steps: p.steps ?? 0,
      grade: p.grade ?? 0,
      elevFrom: p.elev_from,
      elevTo: p.elev_to,
      shade: p.shade ?? 0.3,
      geometry: coords,
      widthM: p.width_m ?? 3.5,
    };
    edges.set(edge.id, edge);
    adjacency.get(edge.from)!.push(edge.id);
    adjacency.get(edge.to)!.push(edge.id);
  }

  return { nodes, edges, adjacency };
}

export function nearestNodeId(
  graph: CampusGraph,
  coord: LngLat,
  filter?: (node: GraphNode) => boolean
): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const node of graph.nodes.values()) {
    if (filter && !filter(node)) continue;
    const d = haversine(coord, node.coord);
    if (d < bestDist) {
      bestDist = d;
      best = node.id;
    }
  }
  return best;
}

export function graphStats(graph: CampusGraph) {
  let litEdges = 0;
  let accessibleEdges = 0;
  let totalLength = 0;
  for (const edge of graph.edges.values()) {
    if (edge.lit) litEdges += 1;
    if (edge.accessible) accessibleEdges += 1;
    totalLength += edge.lengthM;
  }
  return {
    nodes: graph.nodes.size,
    edges: graph.edges.size,
    litEdges,
    accessibleEdges,
    totalLengthM: Math.round(totalLength),
  };
}
