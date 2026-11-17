import type {
  CampusGraph,
  DirectionStep,
  RouteResult,
  TurnKind,
  WalkwayKind,
} from './types';
import { bearing, compassName } from './geo';

const angleDelta = (from: number, to: number) => ((to - from + 540) % 360) - 180;

function kindLabel(kind: WalkwayKind): string {
  switch (kind) {
    case 'road':
      return 'campus loop road';
    case 'promenade':
      return 'promenade';
    case 'stairs':
      return 'stairway';
    default:
      return 'walkway';
  }
}

function cleanLabel(label: string, destination: string): string {
  if (/entrance$/i.test(label)) return destination;
  return label;
}

/** Turn-by-turn directions derived from the weighted A* route. */
export function buildDirections(
  graph: CampusGraph,
  route: RouteResult,
  destinationLabel: string
): DirectionStep[] {
  const steps: DirectionStep[] = [];
  let previousBearing: number | null = null;

  for (let i = 0; i < route.edgeIds.length; i += 1) {
    const edge = graph.edges.get(route.edgeIds[i]);
    if (!edge) continue;
    const fromNodeId = route.nodeIds[i];
    const toNodeId = route.nodeIds[i + 1];
    if (!fromNodeId || !toNodeId) continue;

    const forward = edge.from === fromNodeId;
    const geom = forward ? edge.geometry : [...edge.geometry].reverse();
    const toNode = graph.nodes.get(toNodeId);
    const b = bearing(geom[0], geom[geom.length - 1]);

    let turn: TurnKind = 'straight';
    if (i === 0) turn = 'start';
    else if (edge.kind === 'stairs') turn = 'stairs';
    else if (previousBearing !== null) {
      const d = angleDelta(previousBearing, b);
      if (Math.abs(d) <= 18) turn = 'straight';
      else if (d > 50) turn = 'right';
      else if (d > 18) turn = 'slight-right';
      else if (d < -50) turn = 'left';
      else turn = 'slight-left';
    }

    const toLabel = cleanLabel(toNode?.label ?? 'the next junction', destinationLabel);
    const compass = compassName(b);
    const kind = kindLabel(edge.kind);

    let instruction: string;
    switch (turn) {
      case 'start':
        instruction = `Head ${compass} along the ${kind} toward ${toLabel}`;
        break;
      case 'stairs':
        instruction = `Take the ${edge.steps || 12}-step stairway toward ${toLabel}`;
        break;
      case 'left':
      case 'slight-left':
      case 'right':
      case 'slight-right': {
        const dir = turn === 'left' || turn === 'slight-left' ? 'left' : 'right';
        const slight = turn.startsWith('slight') ? 'slightly ' : '';
        instruction = `Turn ${slight}${dir} at ${cleanLabel(graph.nodes.get(fromNodeId)?.label ?? 'the junction', destinationLabel)} onto the ${kind} toward ${toLabel}`;
        break;
      }
      default:
        instruction = `Continue ${compass} toward ${toLabel}`;
    }

    const last = steps[steps.length - 1];
    const mergeable =
      last !== undefined &&
      turn === 'straight' &&
      last.distanceM < 70 &&
      last.kind === edge.kind &&
      last.turn !== 'arrive';

    if (mergeable) {
      last.distanceM += edge.lengthM;
      last.nodeLabel = toNode?.label ?? last.nodeLabel;
      last.lit = last.lit && edge.lit;
    } else {
      steps.push({
        index: steps.length,
        turn,
        instruction,
        distanceM: edge.lengthM,
        compass,
        nodeLabel: toNode?.label ?? '',
        kind: edge.kind,
        lit: edge.lit,
        ascentM: Math.max(0, edge.elevTo - edge.elevFrom),
        icon:
          turn === 'start'
            ? 'start'
            : turn === 'stairs'
              ? 'stairs'
              : turn.includes('left')
                ? 'left'
                : turn.includes('right')
                  ? 'right'
                  : 'straight',
      });
    }

    previousBearing = b;
  }

  steps.push({
    index: steps.length,
    turn: 'arrive',
    instruction: `Arrive at ${destinationLabel}`,
    distanceM: 0,
    compass: previousBearing !== null ? compassName(previousBearing) : 'north',
    nodeLabel: destinationLabel,
    kind: 'path',
    lit: true,
    ascentM: 0,
    icon: 'flag',
  });

  return steps;
}
