import type {
  CampusGraph,
  ElevationSample,
  GraphEdge,
  LngLat,
  RouteResult,
} from './types';
import { haversine } from './geo';

export interface RouteOptions {
  /** Exclude steps / steep stairways and prefer ramps. */
  stepFree?: boolean;
  /** Apply night-time penalty on unlit edges. */
  night?: boolean;
  /** 0 = empty campus, 1 = peak congestion. */
  crowdFactor?: number;
  /** Cruising walking speed, m/s. */
  speedMps?: number;
}

class MinHeap {
  private heap: { f: number; id: string }[] = [];

  get size(): number {
    return this.heap.length;
  }

  push(f: number, id: string) {
    this.heap.push({ f, id });
    let i = this.heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.heap[parent].f <= this.heap[i].f) break;
      [this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]];
      i = parent;
    }
  }

  pop(): { f: number; id: string } | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let smallest = i;
        if (l < this.heap.length && this.heap[l].f < this.heap[smallest].f) smallest = l;
        if (r < this.heap.length && this.heap[r].f < this.heap[smallest].f) smallest = r;
        if (smallest === i) break;
        [this.heap[smallest], this.heap[i]] = [this.heap[i], this.heap[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}

const SURFACE_COST: Record<string, number> = {
  paver: 1,
  concrete: 0.98,
  asphalt: 1.06,
  gravel: 1.16,
  steps: 1.25,
};

/**
 * Movement cost for a single edge under the current environment.
 * Encodes surface, lighting, crowd, slope, stairs and accessibility.
 */
export function edgeCost(edge: GraphEdge, opts: RouteOptions = {}): number {
  if (opts.stepFree && !edge.accessible) return Infinity;
  const crowd = opts.crowdFactor ?? 0.5;

  let cost = edge.lengthM * (SURFACE_COST[edge.surface] ?? 1.05);

  if (opts.night && !edge.lit) cost *= 1.75;
  cost *= 1 + edge.crowd * 1.7 * crowd;

  if (edge.grade > 0.02) cost *= 1 + edge.grade * 4.5;
  else if (edge.grade < -0.02) cost *= 1 + Math.abs(edge.grade) * 1.2;

  if (edge.kind === 'stairs') cost *= 1.2;
  if (edge.kind === 'road') cost *= 1.03; // shared with campus traffic

  return cost;
}

function walkTime(edge: GraphEdge, opts: RouteOptions): number {
  const base = opts.speedMps ?? 1.35;
  const crowd = opts.crowdFactor ?? 0.5;
  let v = base * (1 - Math.max(0, edge.grade) * 1.15);
  if (edge.kind === 'stairs') v *= 0.55;
  v *= 1 - 0.18 * edge.crowd * crowd;
  v = Math.max(0.42, v);
  let t = edge.lengthM / v;
  if (!edge.lit) t += opts.night ? 6 : 0;
  if (edge.kind === 'stairs') t += 8;
  return t;
}

/**
 * A* over the campus walkway graph.
 * Heuristic is the straight-line distance to the goal — admissible because every
 * edge cost is at least its geometric length.
 */
export function findRoute(
  graph: CampusGraph,
  startId: string,
  goalId: string,
  opts: RouteOptions = {}
): RouteResult | null {
  const start = graph.nodes.get(startId);
  const goal = graph.nodes.get(goalId);
  if (!start || !goal) return null;

  const h = (id: string) => {
    const n = graph.nodes.get(id);
    return n ? haversine(n.coord, goal.coord) : 0;
  };

  const open = new MinHeap();
  open.push(h(startId), startId);
  const cameFrom = new Map<string, { nodeId: string; edgeId: string }>();
  const gScore = new Map<string, number>([[startId, 0]]);
  const closed = new Set<string>();

  let found = false;
  while (open.size > 0) {
    const current = open.pop()!;
    if (closed.has(current.id)) continue;
    if (current.id === goalId) {
      found = true;
      break;
    }
    closed.add(current.id);

    const edgeIds = graph.adjacency.get(current.id) ?? [];
    for (const edgeId of edgeIds) {
      const edge = graph.edges.get(edgeId);
      if (!edge) continue;
      const nextId = edge.from === current.id ? edge.to : edge.from;
      if (closed.has(nextId)) continue;

      const step = edgeCost(edge, opts);
      if (!Number.isFinite(step)) continue;

      const tentative = (gScore.get(current.id) ?? Infinity) + step;
      if (tentative < (gScore.get(nextId) ?? Infinity)) {
        gScore.set(nextId, tentative);
        cameFrom.set(nextId, { nodeId: current.id, edgeId });
        open.push(tentative + h(nextId), nextId);
      }
    }
  }

  if (!found) return null;

  // reconstruct node + edge path
  const nodeIds: string[] = [goalId];
  const edgeIds: string[] = [];
  let cursor = goalId;
  while (cursor !== startId) {
    const prev = cameFrom.get(cursor);
    if (!prev) return null;
    edgeIds.push(prev.edgeId);
    nodeIds.push(prev.nodeId);
    cursor = prev.nodeId;
  }
  nodeIds.reverse();
  edgeIds.reverse();

  const coordinates: LngLat[] = [];
  const profile: ElevationSample[] = [];
  let distanceM = 0;
  let durationS = 0;
  let ascentM = 0;
  let descentM = 0;
  let stepsCount = 0;
  let unlitM = 0;
  let crowdedM = 0;
  let previousElev: number | null = null;

  for (let edgeIndex = 0; edgeIndex < edgeIds.length; edgeIndex += 1) {
    const edge = graph.edges.get(edgeIds[edgeIndex]);
    if (!edge) continue;
    // nodeIds[edgeIndex] is the node this edge departs from
    const forward = edge.from === nodeIds[edgeIndex];
    const points = forward ? edge.geometry : [...edge.geometry].reverse();
    const startElev = forward ? edge.elevFrom : edge.elevTo;
    const endElev = forward ? edge.elevTo : edge.elevFrom;

    const edgeLen = edge.lengthM || 1;
    for (let i = 0; i < points.length; i += 1) {
      if (i === 0) {
        if (coordinates.length === 0) {
          coordinates.push(points[i]);
          profile.push({ d: distanceM, e: startElev });
        }
        continue;
      }
      coordinates.push(points[i]);
      const travelled = (edgeLen * i) / Math.max(1, points.length - 1);
      profile.push({
        d: distanceM + travelled,
        e: startElev + (endElev - startElev) * (i / Math.max(1, points.length - 1)),
      });
    }

    distanceM += edge.lengthM;
    durationS += walkTime(edge, opts);
    stepsCount += edge.steps;
    if (!edge.lit) unlitM += edge.lengthM;
    if (edge.crowd > 0.55) crowdedM += edge.lengthM;
    if (endElev > startElev) ascentM += endElev - startElev;
    else descentM += startElev - endElev;
  }

  if (coordinates.length === 0) return null;

  // keep the profile compact (max ~64 samples) for the HUD sparkline
  const compact: ElevationSample[] = [];
  const stride = Math.max(1, Math.floor(profile.length / 64));
  for (let i = 0; i < profile.length; i += stride) compact.push(profile[i]);
  if (compact[compact.length - 1]?.d !== profile[profile.length - 1]?.d) {
    compact.push(profile[profile.length - 1]);
  }

  return {
    id: `${startId}->${goalId}:${Math.round(distanceM)}:${Math.round(durationS)}`,
    nodeIds,
    edgeIds,
    coordinates,
    distanceM,
    durationS,
    ascentM,
    descentM,
    stepsCount,
    stepFree: Boolean(opts.stepFree),
    unlitM,
    crowdedM,
    profile: compact,
    destinationNodeId: goalId,
  };
}
