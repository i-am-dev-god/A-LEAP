'use client';

import { create } from 'zustand';
import { useMemo } from 'react';
import type {
  CampusAlert,
  DirectionStep,
  PulseMetric,
  RouteResult,
} from '@/lib/types';
import {
  buildings,
  campusGraph,
  gates,
  getBuilding,
  meta,
  treePoints,
} from '@/lib/campusData';
import { findRoute } from '@/lib/astarPathfinder';
import { buildDirections } from '@/lib/directions';
import { DATUM, haversine, minutesToClock } from '@/lib/geo';
import { currentHyderabadMinutes, hyderabadInstant, solarPosition } from '@/lib/sunCalc';
import {
  lightingFromSun,
  TIME_PRESETS,
  type LightingState,
  type Quality,
  type TimePreset,
} from '@/lib/lighting';
import { nearestNodeId } from '@/lib/graphBuilder';
import {
  fetchAlerts,
  postAlert,
  simulatedMetrics,
  subscribeToAlerts,
} from '@/lib/liveBeacon';

export interface OriginOption {
  id: string;
  label: string;
  kind: 'gate' | 'plaza';
}

const GATE_OPTIONS: OriginOption[] = gates.map((g) => ({
  id: g.node,
  label: g.name,
  kind: 'gate',
}));

const PLAZA_OPTIONS: OriginOption[] = [
  { id: 'libPlaza', label: 'Library Plaza', kind: 'plaza' },
  { id: 'fountain', label: 'Fountain Plaza', kind: 'plaza' },
  { id: 'northPlaza', label: 'North Plaza', kind: 'plaza' },
  { id: 'sportsFront', label: 'Sports Complex Forecourt', kind: 'plaza' },
  { id: 'ouceFront', label: 'OUCE Plaza', kind: 'plaza' },
];

export const originOptions: OriginOption[] = [...GATE_OPTIONS, ...PLAZA_OPTIONS].filter((o) =>
  campusGraph.nodes.has(o.id)
);

interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'warn' | 'success';
}

interface SpatialState {
  // scene + environment
  minutes: number;
  preset: TimePreset;
  is3D: boolean;
  quality: Quality;
  introDismissed: boolean;
  flythrough: boolean;
  cameraMode: 'orbit' | 'top' | 'focus' | 'flythrough' | 'overview';

  // navigation
  originId: string;
  originLabel: string;
  destinationId: string | null;
  destinationLabel: string | null;
  route: RouteResult | null;
  steps: DirectionStep[];
  routeError: string | null;
  routeMs: number;
  stepFree: boolean;
  selectedBuildingId: string | null;
  selectedPoi: { name: string; floor: number } | null;
  activeFloor: number;
  location: { lng: number; lat: number; accuracy: number; nodeId: string } | null;

  // ui
  searchOpen: boolean;
  feedOpen: boolean;
  controlsOpen: boolean;
  commandHint: boolean;

  // live data
  alerts: CampusAlert[];
  metrics: PulseMetric[];
  feedSource: 'live' | 'simulated';
  feedLoading: boolean;

  // telemetry
  fps: number;
  toast: Toast | null;
  view: { zoom: number; bearing: number; pitch: number; lng: number; lat: number };
  cameraRequest: { id: number; kind: 'home' | 'north' | 'campus' } | null;

  // actions
  dismissIntro: () => void;
  setMinutes: (minutes: number) => void;
  applyPreset: (preset: TimePreset) => void;
  toggle3D: () => void;
  setQuality: (q: Quality) => void;
  setFlythrough: (v: boolean) => void;

  selectBuilding: (id: string | null) => void;
  navigateToBuilding: (id: string, floor?: number) => void;
  navigateToPoi: (buildingId: string, poiName: string, floor: number) => void;
  setDestinationGate: (nodeId: string, gateName: string) => void;
  setOrigin: (nodeId: string, label?: string) => void;
  setStepFree: (v: boolean) => void;
  planRoute: (destinationId?: string) => void;
  clearRoute: () => void;
  swapEnds: () => void;
  setActiveFloor: (floor: number) => void;
  setLocation: (lng: number, lat: number, accuracy: number) => void;

  setSearchOpen: (v: boolean) => void;
  setFeedOpen: (v: boolean) => void;
  setControlsOpen: (v: boolean) => void;
  setFps: (fps: number) => void;
  setView: (view: Partial<SpatialState['view']>) => void;
  requestCamera: (kind: 'home' | 'north' | 'campus') => void;
  showToast: (message: string, tone?: Toast['tone']) => void;
  clearToast: () => void;

  refreshFeed: () => Promise<void>;
  receiveAlert: (alert: CampusAlert) => void;
  reportCrowd: (zone: string, level: number) => Promise<void>;
  refreshMetrics: () => void;
  subscribeFeed: () => () => void;
}

const initialMinutes = TIME_PRESETS.find((p) => p.id === 'golden')?.minutes ?? 1032;

export const useSpatialStore = create<SpatialState>((set, get) => ({
  minutes: initialMinutes,
  preset: 'golden',
  is3D: true,
  quality: 'cinematic',
  introDismissed: false,
  flythrough: false,
  cameraMode: 'orbit',

  originId: 'mainGate',
  originLabel: 'Main Gate',
  destinationId: null,
  destinationLabel: null,
  route: null,
  steps: [],
  routeError: null,
  routeMs: 0,
  stepFree: false,
  selectedBuildingId: null,
  selectedPoi: null,
  activeFloor: 0,
  location: null,

  searchOpen: false,
  feedOpen: true,
  controlsOpen: false,
  commandHint: true,

  alerts: [],
  metrics: simulatedMetrics(initialMinutes),
  feedSource: 'simulated',
  feedLoading: true,

  fps: 0,
  toast: null,
  view: { zoom: 15.15, bearing: -26, pitch: 54, lng: 78.5285, lat: 17.4175 },
  cameraRequest: null,

  dismissIntro: () => set({ introDismissed: true, commandHint: true }),

  setMinutes: (minutes) => {
    const clamped = ((Math.round(minutes) % 1440) + 1440) % 1440;
    set({ minutes: clamped, preset: 'custom' });
  },

  applyPreset: (preset) => {
    const entry = TIME_PRESETS.find((p) => p.id === preset);
    if (preset === 'live') {
      const live = currentHyderabadMinutes();
      set({ minutes: live, preset: 'live' });
      return;
    }
    if (entry?.minutes != null) set({ minutes: entry.minutes, preset });
  },

  toggle3D: () => set((s) => ({ is3D: !s.is3D, cameraMode: s.is3D ? 'top' : 'orbit' })),
  setQuality: (quality) => set({ quality }),
  setFlythrough: (flythrough) => set({ flythrough, cameraMode: flythrough ? 'flythrough' : 'orbit' }),

  selectBuilding: (id) => {
    const building = getBuilding(id);
    set({
      cameraMode: 'focus',
      selectedBuildingId: building?.id ?? null,
      selectedPoi: null,
      activeFloor: 0,
    });
  },

  navigateToBuilding: (id, floor) => {
    const building = getBuilding(id);
    if (!building) return;
    set({
      destinationId: building.id,
      destinationLabel: building.name,
      selectedBuildingId: building.id,
      selectedPoi: null,
      activeFloor: floor ?? 0,
    });
    get().planRoute(building.id);
  },

  navigateToPoi: (buildingId, poiName, floor) => {
    const building = getBuilding(buildingId);
    if (!building) return;
    set({
      destinationId: building.id,
      destinationLabel: `${poiName} · ${building.short}`,
      selectedBuildingId: building.id,
      selectedPoi: { name: poiName, floor },
      activeFloor: floor,
    });
    get().planRoute(building.id);
  },

  setDestinationGate: (nodeId, gateName) => {
    const node = campusGraph.nodes.get(nodeId);
    if (!node) return;
    set({ originId: nodeId, originLabel: gateName });
    if (get().destinationId) get().planRoute();
    get().showToast(`Route origin set to ${gateName}`);
  },

  setOrigin: (nodeId, label) => {
    const node = campusGraph.nodes.get(nodeId);
    if (!node) return;
    set({ originId: nodeId, originLabel: label ?? node.label, location: null });
    if (get().destinationId) get().planRoute();
  },

  setStepFree: (v) => {
    set({ stepFree: v });
    if (get().destinationId) get().planRoute();
  },

  planRoute: (destinationId) => {
    const state = get();
    const target = getBuilding(destinationId ?? state.destinationId);
    if (!target) {
      set({ routeError: 'Unknown destination' });
      return;
    }
    if (!campusGraph.nodes.has(state.originId)) {
      set({ routeError: 'Origin node offline' });
      return;
    }

    const sun = solarPosition(hyderabadInstant(state.minutes), DATUM.lat, DATUM.lng);
    const night = sun.elevationDeg < 2;
    const occupancy = state.metrics.find((m) => m.id === 'occupancy');
    const crowdFactor = Math.max(0.15, Math.min(1, (occupancy?.value ?? 52) / 100));

    const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const route = findRoute(campusGraph, state.originId, target.entrance_node, {
      stepFree: state.stepFree,
      night,
      crowdFactor,
    });
    const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started;

    if (!route) {
      set({
        destinationId: target.id,
        destinationLabel: target.name,
        route: null,
        steps: [],
        routeError: state.stepFree
          ? 'No step-free route available to this entrance. Try from another origin.'
          : 'Destination unreachable on the current network.',
        routeMs: elapsed,
      });
      return;
    }

    const steps = buildDirections(campusGraph, route, target.name);
    set({
      destinationId: target.id,
      destinationLabel: target.name,
      route,
      steps,
      routeError: null,
      routeMs: elapsed,
      selectedBuildingId: target.id,
    });
  },

  clearRoute: () =>
    set({
      route: null,
      steps: [],
      destinationId: null,
      destinationLabel: null,
      selectedPoi: null,
      routeError: null,
      selectedBuildingId: null,
      flythrough: false,
      cameraMode: 'orbit',
    }),

  swapEnds: () => {
    const { destinationId, originId } = get();
    const dest = getBuilding(destinationId);
    if (!dest) return;
    const originBuilding = buildings.find((b) => b.entrance_node === originId) ?? null;
    set({ originId: dest.entrance_node, originLabel: dest.name });
    if (originBuilding) {
      set({
        destinationId: originBuilding.id,
        destinationLabel: originBuilding.name,
        selectedBuildingId: originBuilding.id,
      });
      get().planRoute();
    } else {
      set({
        destinationId: null,
        destinationLabel: null,
        route: null,
        steps: [],
        selectedBuildingId: null,
      });
      get().showToast(`Origin swapped to ${dest.name}`);
    }
  },

  setActiveFloor: (floor) => set({ activeFloor: Math.max(0, floor) }),

  setLocation: (lng, lat, accuracy) => {
    const nodeId = nearestNodeId(campusGraph, [lng, lat]);
    const node = nodeId ? campusGraph.nodes.get(nodeId) : null;
    const distance = node ? haversine([lng, lat], node.coord) : Infinity;
    if (!node || distance > 450) {
      get().showToast('Position is outside the campus walkway network', 'warn');
      return;
    }
    set({
      location: { lng, lat, accuracy, nodeId: node.id },
      originId: node.id,
      originLabel: 'My location',
    });
    if (get().destinationId) get().planRoute();
    get().showToast(`Snapped to ${node.label} · ±${Math.round(accuracy)} m`, 'success');
  },

  setSearchOpen: (searchOpen) => {
    set({ searchOpen });
    if (searchOpen) set({ controlsOpen: false, feedOpen: false });
  },
  setFeedOpen: (feedOpen) => set({ feedOpen }),
  setControlsOpen: (controlsOpen) => set({ controlsOpen }),
  setFps: (fps) => {
    if (Math.abs(fps - get().fps) >= 2) set({ fps });
  },
  setView: (view) => {
    const current = get().view;
    const next = { ...current, ...view };
    if (
      Math.abs(next.zoom - current.zoom) > 0.02 ||
      Math.abs(next.bearing - current.bearing) > 0.4 ||
      Math.abs(next.pitch - current.pitch) > 0.4 ||
      Math.abs(next.lat - current.lat) > 0.00002 ||
      Math.abs(next.lng - current.lng) > 0.00002
    ) {
      set({ view: next });
    }
  },
  requestCamera: (kind) =>
    set({
      cameraRequest: { id: Date.now(), kind },
      cameraMode: kind === 'north' ? get().cameraMode : kind === 'home' ? 'focus' : 'overview',
    }),
  showToast: (message, tone = 'info') => {
    set({ toast: { id: Date.now(), message, tone } });
    setTimeout(() => {
      if (get().toast?.message === message) set({ toast: null });
    }, 4200);
  },
  clearToast: () => set({ toast: null }),

  refreshFeed: async () => {
    set({ feedLoading: true });
    const result = await fetchAlerts();
    set({
      alerts: result.alerts,
      feedSource: result.source,
      feedLoading: false,
    });
  },

  receiveAlert: (alert) => {
    set((s) => ({ alerts: [alert, ...s.alerts.filter((a) => a.id !== alert.id)].slice(0, 30) }));
  },

  reportCrowd: async (zone, level) => {
    const label = level > 0.72 ? 'Heavy' : level > 0.45 ? 'Moderate' : 'Light';
    const alert = await postAlert({
      kind: 'crowd',
      title: `${zone} · ${label} footfall reported`,
      detail: `Crowdsourced report from the campus feed. Estimated occupancy ${Math.round(level * 100)}% at ${minutesToClock(get().minutes)} IST.`,
      zone,
      severity: level > 0.72 ? 'warn' : 'info',
      value: `${Math.round(level * 100)}%`,
    });
    get().receiveAlert(alert);
    get().showToast('Crowd report shared to the campus feed', 'success');
  },

  refreshMetrics: () => {
    set({ metrics: simulatedMetrics(get().minutes) });
  },

  subscribeFeed: () => {
    const unsubscribe = subscribeToAlerts((alert) => get().receiveAlert(alert));
    return unsubscribe;
  },
}));

export function useLighting(): LightingState {
  const minutes = useSpatialStore((s) => s.minutes);
  const preset = useSpatialStore((s) => s.preset);
  return useMemo(() => {
    const instant = hyderabadInstant(minutes);
    const sun = solarPosition(instant, DATUM.lat, DATUM.lng);
    return lightingFromSun(sun, minutes, preset);
  }, [minutes, preset]);
}

export function useSun() {
  const minutes = useSpatialStore((s) => s.minutes);
  return useMemo(() => {
    const instant = hyderabadInstant(minutes);
    return {
      instant,
      sun: solarPosition(instant, DATUM.lat, DATUM.lng),
      clock: minutesToClock(minutes),
    };
  }, [minutes]);
}

export const campusSummary = {
  buildings: buildings.length,
  gates: meta.gates.length,
  trees: treePoints.length,
};
