'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Info, TriangleAlert } from 'lucide-react';
import { useLighting, useSpatialStore } from '@/store/useSpatialStore';
import { cssColor } from '@/lib/lighting';
import { randomSimulatedAlert } from '@/lib/liveBeacon';
import TopBar from './hud/TopBar';
import CommandSearch from './hud/CommandSearch';
import EnvironmentControls from './hud/EnvironmentControls';
import NavigationPanel from './hud/NavigationPanel';
import LiveBeaconAlert from './hud/LiveBeaconAlert';
import BuildingCard from './hud/BuildingCard';
import IntroOverlay from './hud/IntroOverlay';

const SpatialCanvas = dynamic(() => import('./canvas/SpatialCanvas'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center bg-ink">
      <div className="ou-boot">
        <div className="ou-boot__ring" />
        <div>
          <p className="ou-eyebrow text-cyan/80">Initialising WebGL</p>
          <p className="mt-1 text-sm text-white/50">Loading self-hosted campus twin…</p>
        </div>
      </div>
    </div>
  ),
});

function Atmosphere() {
  const lighting = useLighting();
  const bearing = useSpatialStore((s) => s.view.bearing);
  const azimuth = ((lighting.sun.azimuthDeg - bearing) * Math.PI) / 180;
  const sunX = 50 + Math.sin(azimuth) * 38;
  const sunY = 10 + (1 - Math.max(0, lighting.sun.elevationDeg) / 90) * 30;

  return (
    <>
      <div className="ou-vignette z-[6]" />
      {lighting.starOpacity > 0.02 && (
        <div className="ou-stars z-[7]" style={{ opacity: lighting.starOpacity }} />
      )}
      <div
        className="ou-atmosphere z-[8]"
        style={{
          background: `radial-gradient(34% 26% at ${sunX}% ${sunY}%, ${cssColor(lighting.sunColor, 0.42)}, transparent 68%), linear-gradient(180deg, ${cssColor(lighting.sky, 0.5)} 0%, transparent 26%, transparent 76%, ${cssColor(lighting.ground, 0.55)} 100%)`,
          opacity: lighting.isNight ? 0.62 : 0.78,
        }}
      />
    </>
  );
}

function Toast() {
  const toast = useSpatialStore((s) => s.toast);
  const Icon = toast?.tone === 'warn' ? TriangleAlert : toast?.tone === 'success' ? CheckCircle2 : Info;
  const color =
    toast?.tone === 'warn' ? 'text-amber' : toast?.tone === 'success' ? 'text-mint' : 'text-cyan';

  return (
    <div className="pointer-events-none absolute left-1/2 top-[72px] z-[80] -translate-x-1/2">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.99 }}
            className="flex items-center gap-2 rounded-xl glass-strong px-3.5 py-2"
          >
            <Icon size={14} className={color} />
            <span className="text-[11px] text-white/80">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ScaleBar() {
  const zoom = useSpatialStore((s) => s.view.zoom);
  const lat = useSpatialStore((s) => s.view.lat);
  const metersPerPixel = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
  const steps = [10, 20, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  let nice = steps[0];
  for (const value of steps) {
    if (value / metersPerPixel <= 110) nice = value;
  }
  const width = nice / metersPerPixel;
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="block h-1.5 border-b border-l border-r border-cyan/50"
        style={{ width: Math.max(18, Math.min(120, width)) }}
      />
      <span className="ou-mono text-[9px] text-white/35">
        {nice >= 1000 ? `${nice / 1000} km` : `${nice} m`}
      </span>
    </span>
  );
}

function SurveyBadge() {
  const cameraMode = useSpatialStore((s) => s.cameraMode);
  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 hidden -translate-x-1/2 items-center gap-3 rounded-full glass px-4 py-1.5 2xl:flex">
      <span className="flex items-center gap-1.5 ou-mono text-[9px] uppercase tracking-[0.14em] text-white/40">
        <span className="h-1.5 w-1.5 rounded-full bg-mint ou-anim-blink" />
        Self-hosted vector core
      </span>
      <span className="h-3 w-px bg-white/10" />
      {[
        ['#cbb089', 'Heritage'],
        ['#8cb4ad', 'Library'],
        ['#93a7b7', 'Academic'],
        ['#ac8e7d', 'Hostel'],
        ['#84a996', 'Sports'],
      ].map(([color, label]) => (
        <span key={label} className="flex items-center gap-1.5 text-[9px] text-white/40">
          <span className="h-1.5 w-1.5 rounded-sm" style={{ background: color }} />
          {label}
        </span>
      ))}
      <span className="h-3 w-px bg-white/10" />
      <ScaleBar />
      <span className="h-3 w-px bg-white/10" />
      <span className="ou-mono text-[9px] uppercase tracking-[0.14em] text-white/30">
        cam · {cameraMode}
      </span>
      <span className="ou-mono text-[9px] tracking-[0.14em] text-white/30">2026.11</span>
    </div>
  );
}

export default function SpatialApp() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const store = useSpatialStore.getState();
    if (window.innerWidth < 900) store.setFeedOpen(false);
    void store.refreshFeed();

    const unsubscribe = store.subscribeFeed();
    const metricsTimer = window.setInterval(() => useSpatialStore.getState().refreshMetrics(), 24000);
    const simulationTimer = window.setInterval(() => {
      const state = useSpatialStore.getState();
      if (state.feedSource !== 'simulated') return;
      if (Math.random() > 0.55) return;
      const alert = randomSimulatedAlert(state.minutes);
      if (alert) state.receiveAlert(alert);
    }, 32000);

    return () => {
      unsubscribe();
      window.clearInterval(metricsTimer);
      window.clearInterval(simulationTimer);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT';
      const store = useSpatialStore.getState();

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        store.setSearchOpen(!store.searchOpen);
        return;
      }
      if (typing) return;

      if (event.key === 'Escape') {
        store.setSearchOpen(false);
        return;
      }
      if (event.key === '/') {
        event.preventDefault();
        store.setSearchOpen(true);
        return;
      }
      if (event.key === '1') store.applyPreset('dawn');
      if (event.key === '2') store.applyPreset('noon');
      if (event.key === '3') store.applyPreset('golden');
      if (event.key === '4') store.applyPreset('night');
      if (event.key.toLowerCase() === 'l') store.applyPreset('live');
      if (event.key.toLowerCase() === 't') store.toggle3D();
      if (event.key.toLowerCase() === 'a') store.setStepFree(!store.stepFree);
      if (event.key.toLowerCase() === 'h') store.requestCamera('campus');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-ink">
      <SpatialCanvas />
      <Atmosphere />
      <TopBar />
      <BuildingCard />
      <EnvironmentControls />
      <NavigationPanel />
      <LiveBeaconAlert />
      <CommandSearch />
      <SurveyBadge />
      <Toast />
      <IntroOverlay />

      {mounted && (
        <div className="pointer-events-none absolute bottom-1 left-1/2 z-10 hidden -translate-x-1/2 ou-mono text-[9px] tracking-[0.18em] text-white/20 md:block">
          ⌘K SEARCH · 1–4 LIGHT PRESETS · T 3D/2D · A STEP-FREE · H FIT CAMPUS
        </div>
      )}
    </div>
  );
}
