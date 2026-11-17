'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl, { LngLatBounds, type LngLat, type Map as MLMap } from 'maplibre-gl';
import gsap from 'gsap';
import { ThreeWorld } from '@/lib/scene/threeWorld';
import { applyLightingToMap, createCampusStyle } from '@/lib/mapStyle';
import { buildings, buildingsById } from '@/lib/campusData';
import { bearing as geoBearing } from '@/lib/geo';
import { useLighting, useSpatialStore } from '@/store/useSpatialStore';
import { SceneContext } from './SceneContext';
import ProceduralTrees from './ProceduralTrees';
import LandmarkModels from './LandmarkModels';
import RouteBeam from './RouteBeam';
import Beacon from './Beacon';
import FloorGuide from './FloorGuide';

const CAMERA_HOME = { lng: 78.5285, lat: 17.4175, zoom: 15.7, pitch: 55, bearing: -26 };
const CAMERA_HERO = { lng: 78.5287, lat: 17.4172, zoom: 16.3, pitch: 58, bearing: -18 };

function normalizeBearing(current: number, target: number): number {
  const delta = ((target - current + 540) % 360) - 180;
  return current + delta;
}

export default function SpatialCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const worldRef = useRef<ThreeWorld | null>(null);
  const [world, setWorld] = useState<ThreeWorld | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  const cameraTween = useRef<ReturnType<typeof gsap.to> | null>(null);
  const idleTween = useRef<ReturnType<typeof gsap.to> | null>(null);
  const lastRouteId = useRef<string | null>(null);
  const lastSelection = useRef<string | null>(null);
  const labelsRef = useRef<{ el: HTMLElement; hero: boolean }[]>([]);

  const lighting = useLighting();
  const lightingRef = useRef(lighting);
  lightingRef.current = lighting;

  const is3D = useSpatialStore((s) => s.is3D);
  const quality = useSpatialStore((s) => s.quality);
  const route = useSpatialStore((s) => s.route);
  const destinationId = useSpatialStore((s) => s.destinationId);
  const selectedBuildingId = useSpatialStore((s) => s.selectedBuildingId);
  const activeFloor = useSpatialStore((s) => s.activeFloor);
  const flythrough = useSpatialStore((s) => s.flythrough);
  const introDismissed = useSpatialStore((s) => s.introDismissed);
  const cameraRequest = useSpatialStore((s) => s.cameraRequest);

  const animateCamera = useCallback(
    (target: { lng: number; lat: number; zoom: number; pitch: number; bearing: number }, duration = 1.9) => {
      const map = mapRef.current;
      if (!map) return;
      const center = map.getCenter();
      const proxy = {
        lng: center.lng,
        lat: center.lat,
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
      };
      cameraTween.current?.kill();
      idleTween.current?.kill();
      cameraTween.current = gsap.to(proxy, {
        lng: target.lng,
        lat: target.lat,
        zoom: target.zoom,
        pitch: target.pitch,
        bearing: normalizeBearing(proxy.bearing, target.bearing),
        duration,
        ease: 'power3.inOut',
        overwrite: true,
        onUpdate: () => {
          map.jumpTo({
            center: [proxy.lng, proxy.lat],
            zoom: proxy.zoom,
            pitch: proxy.pitch,
            bearing: proxy.bearing,
          });
        },
      });
    },
    []
  );

  const fitRoute = useCallback(
    (coords: [number, number][]) => {
      const map = mapRef.current;
      if (!map || coords.length < 2) return;
      const bounds = new LngLatBounds();
      for (const c of coords) bounds.extend(c);
      const width = typeof window !== 'undefined' ? window.innerWidth : 1440;
      const padding =
        width < 900
          ? { top: 90, bottom: 380, left: 30, right: 30 }
          : width < 1280
            ? { top: 100, bottom: 280, left: 60, right: 60 }
            : { top: 130, bottom: 300, left: 400, right: 430 };
      try {
        const camera = map.cameraForBounds(bounds, { padding, bearing: 0, pitch: 45 }) as
          | { center?: LngLat; zoom?: number }
          | undefined;
        if (camera?.center) {
          animateCamera(
            {
              lng: camera.center.lng,
              lat: camera.center.lat,
              zoom: Math.min(17.4, (camera.zoom ?? 16) - 0.05),
              pitch: 54,
              bearing: -20,
            },
            2.1
          );
          return;
        }
      } catch {
        /* fall through to a simple centre */
      }
      const center = bounds.getCenter();
      animateCamera({ lng: center.lng, lat: center.lat, zoom: 16.2, pitch: 54, bearing: -20 }, 2.1);
    },
    [animateCamera]
  );

  // ── boot the map + WebGL scene ──────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    let map: MLMap;
    try {
      map = new maplibregl.Map({
        container,
        style: createCampusStyle(lightingRef.current),
        center: [CAMERA_HOME.lng, CAMERA_HOME.lat],
        zoom: CAMERA_HOME.zoom,
        pitch: CAMERA_HOME.pitch,
        bearing: CAMERA_HOME.bearing,
        minZoom: 13.3,
        maxZoom: 18.6,
        maxPitch: 76,
        maxBounds: [
          [78.478, 17.366],
          [78.579, 17.468],
        ],
        antialias: true,
        attributionControl: false,
        fadeDuration: 0,
        dragRotate: true,
        pitchWithRotate: true,
      });
    } catch (err) {
      setFailure(err instanceof Error ? err.message : 'WebGL context could not be created');
      setLoading(false);
      return;
    }

    mapRef.current = map;
    map.touchZoomRotate.enableRotation();

    const bootTimer = window.setTimeout(() => {
      if (!worldRef.current) {
        setLoading(false);
        setFailure(
          'The map style took too long to initialise on this device. Try reloading with hardware acceleration enabled'
        );
      }
    }, 14000);

    map.on('error', (event) => {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[OU map]', event.error?.message ?? event);
      }
    });

    map.on('load', () => {
      const threeWorld = new ThreeWorld();
      threeWorld.onFps = (fps) => useSpatialStore.getState().setFps(fps);
      try {
        // the three.js shell is expanded 0.5 m outward and 1.1 m taller than the
        // vector extrusion, so the vector layer stays as an invisible click target
        map.addLayer(threeWorld as unknown as maplibregl.CustomLayerInterface);
      } catch (err) {
        setFailure(err instanceof Error ? err.message : '3D layer failed to initialise');
      }
      threeWorld.setLighting(lightingRef.current);
      threeWorld.setQuality(useSpatialStore.getState().quality);
      threeWorld.set3D(useSpatialStore.getState().is3D);
      worldRef.current = threeWorld;
      setWorld(threeWorld);
      setLoading(false);
      window.clearTimeout(bootTimer);
      setFailure(null);
      applyLightingToMap(map, lightingRef.current);

      // self-hosted building labels (no glyph PBFs, no external fonts)
      for (const building of buildings) {
        const el = document.createElement('button');
        el.type = 'button';
        el.setAttribute('aria-label', `Select ${building.name}`);
        el.className = 'ou-label';
        el.dataset.hero = building.hero ? '1' : '0';
        el.dataset.category = building.category;
        el.innerHTML = `<span class="ou-label__code">${building.short}</span><span class="ou-label__name">${building.name}</span>`;
        el.title = `${building.name} · ${building.hours}`;
        el.addEventListener('click', (event) => {
          event.stopPropagation();
          useSpatialStore.getState().selectBuilding(building.id);
        });
        el.addEventListener('dblclick', (event) => {
          event.stopPropagation();
          useSpatialStore.getState().navigateToBuilding(building.id);
        });
        const marker = new maplibregl.Marker({
          element: el,
          anchor: 'center',
          pitchAlignment: 'viewport',
          rotationAlignment: 'viewport',
        })
          .setLngLat(building.centroid)
          .addTo(map);
        marker.getElement().style.zIndex = building.hero ? '3' : '2';
        labelsRef.current.push({ el, hero: Boolean(building.hero) });
      }

      // slow orbital idle drift while the intro is on screen
      const proxy = { bearing: CAMERA_HOME.bearing };
      idleTween.current = gsap.to(proxy, {
        bearing: CAMERA_HOME.bearing - 14,
        duration: 26,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
        onUpdate: () => {
          if (!useSpatialStore.getState().introDismissed) {
            map.jumpTo({ bearing: proxy.bearing });
          }
        },
      });
    });

    let raf = 0;
    let lastViewUpdate = 0;
    const handleMove = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const zoom = map.getZoom();
        for (const label of labelsRef.current) {
          const visible = label.hero || zoom >= 14.85;
          label.el.style.opacity = visible ? '1' : '0';
          label.el.style.pointerEvents = visible ? 'auto' : 'none';
        }
        const now = performance.now();
        if (now - lastViewUpdate < 110) return;
        lastViewUpdate = now;
        const center = map.getCenter();
        useSpatialStore.getState().setView({
          zoom,
          bearing: map.getBearing(),
          pitch: map.getPitch(),
          lng: center.lng,
          lat: center.lat,
        });
      });
    };
    map.on('move', handleMove);

    const handleClick = (event: maplibregl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(event.point, { layers: ['buildings-3d'] });
      const id = features[0]?.properties?.id as string | undefined;
      if (id && buildingsById.has(id)) {
        useSpatialStore.getState().selectBuilding(id);
      }
    };
    map.on('click', handleClick);

    let cursorRaf = 0;
    let lastPoint: maplibregl.Point | null = null;
    const handleCursor = (event: maplibregl.MapMouseEvent) => {
      lastPoint = event.point;
      if (cursorRaf) return;
      cursorRaf = requestAnimationFrame(() => {
        cursorRaf = 0;
        if (!lastPoint) return;
        const features = map.queryRenderedFeatures(lastPoint, { layers: ['buildings-3d'] });
        map.getCanvas().style.cursor = features.length ? 'pointer' : '';
      });
    };
    map.on('mousemove', handleCursor);
    map.on('dragstart', () => useSpatialStore.getState().setFlythrough(false));

    return () => {
      window.clearTimeout(bootTimer);
      if (raf) cancelAnimationFrame(raf);
      if (cursorRaf) cancelAnimationFrame(cursorRaf);
      cameraTween.current?.kill();
      idleTween.current?.kill();
      labelsRef.current = [];
      worldRef.current?.dispose();
      worldRef.current = null;
      setWorld(null);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ── environment lighting ────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    applyLightingToMap(map, lighting);
    worldRef.current?.setLighting(lighting);
  }, [lighting, world]);

  // ── quality + 3D mode ───────────────────────────────────────────────────
  useEffect(() => {
    worldRef.current?.setQuality(quality);
  }, [quality, world]);

  useEffect(() => {
    const map = mapRef.current;
    worldRef.current?.set3D(is3D);
    if (!map) return;
    cameraTween.current?.kill();
    map.easeTo({ pitch: is3D ? 56 : 0, bearing: is3D ? map.getBearing() : 0, duration: 1100, essential: true });
  }, [is3D, world]);

  // ── route + destination ─────────────────────────────────────────────────
  useEffect(() => {
    const threeWorld = worldRef.current;
    if (!threeWorld) return;
    const destination = destinationId ? buildingsById.get(destinationId) ?? null : null;
    threeWorld.setRoute(destination ? route : null, destination, activeFloor);
    if (route && route.id !== lastRouteId.current) {
      lastRouteId.current = route.id;
      fitRoute(route.coordinates);
    }
    if (!route) lastRouteId.current = null;
  }, [route, destinationId, activeFloor, world, fitRoute]);

  // ── selection ───────────────────────────────────────────────────────────
  useEffect(() => {
    const threeWorld = worldRef.current;
    const map = mapRef.current;
    if (!threeWorld || !map) return;
    const building = selectedBuildingId ? buildingsById.get(selectedBuildingId) ?? null : null;
    threeWorld.setSelection(building, activeFloor);

    if (building && building.id !== lastSelection.current && !route) {
      const mobile = window.innerWidth < 900;
      animateCamera(
        {
          lng: building.centroid[0],
          lat: building.centroid[1],
          zoom: mobile ? 16.3 : 16.85,
          pitch: 58,
          bearing: -24,
        },
        1.8
      );
    }
    lastSelection.current = building?.id ?? null;
  }, [selectedBuildingId, activeFloor, route, world, animateCamera]);

  // ── intro dismissal ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!introDismissed || !world) return;
    idleTween.current?.kill();
    cameraTween.current?.kill();
    const map = mapRef.current;
    if (!map) return;
    animateCamera(CAMERA_HERO, 2.9);
  }, [introDismissed, world, animateCamera]);

  // ── HUD camera requests ─────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !cameraRequest) return;
    if (cameraRequest.kind === 'north') {
      cameraTween.current?.kill();
      map.easeTo({ bearing: 0, pitch: map.getPitch(), duration: 900, essential: true });
    } else if (cameraRequest.kind === 'home') {
      animateCamera(CAMERA_HERO, 1.7);
    } else {
      animateCamera({ ...CAMERA_HOME, zoom: 15.15, pitch: 46 }, 1.9);
    }
  }, [cameraRequest, world, animateCamera]);

  // ── cinematic flythrough ────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!flythrough || !route || !map) return;
    const coords = route.coordinates;
    if (coords.length < 2) return;
    cameraTween.current?.kill();
    idleTween.current?.kill();
    const proxy = { t: 0 };
    const duration = Math.min(24, Math.max(8, route.distanceM / 7));
    const tween = gsap.to(proxy, {
      t: 1,
      duration,
      ease: 'none',
      onUpdate: () => {
        const pos = proxy.t * (coords.length - 1);
        const index = Math.min(coords.length - 1, Math.max(0, Math.round(pos)));
        const next = coords[Math.min(coords.length - 1, index + 3)];
        const current = coords[index];
        const heading = geoBearing(current, next);
        map.jumpTo({
          center: current,
          zoom: 16.5,
          pitch: 70,
          bearing: normalizeBearing(map.getBearing(), Number.isFinite(heading) ? heading : 0),
        });
      },
      onComplete: () => useSpatialStore.getState().setFlythrough(false),
    });
    return () => {
      tween.kill();
    };
  }, [flythrough, route]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="absolute inset-0" />

      <SceneContext.Provider value={world}>
        <ProceduralTrees />
        <LandmarkModels />
        <RouteBeam />
        <Beacon />
        <FloorGuide />
      </SceneContext.Provider>

      {loading && (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center">
          <div className="ou-boot">
            <div className="ou-boot__ring" />
            <div>
              <p className="ou-eyebrow text-cyan/80">Booting geospatial core</p>
              <p className="mt-1 text-sm text-white/60">Compiling self-hosted vector campus…</p>
            </div>
          </div>
        </div>
      )}

      {failure && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-abyss/90 p-6 backdrop-blur-xl">
          <div className="max-w-md rounded-2xl border border-white/10 bg-white/5 p-6">
            <p className="ou-eyebrow text-amber">WebGL unavailable</p>
            <h2 className="mt-2 text-xl font-semibold text-white">The 3D campus could not start</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/60">
              {failure}. Enable hardware acceleration or open this page in a recent Chrome, Edge,
              Firefox or Safari build. The routing engine and live campus feed remain available.
            </p>
            <button
              type="button"
              className="ou-btn ou-btn--primary mt-4"
              onClick={() => window.location.reload()}
            >
              Retry renderer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
