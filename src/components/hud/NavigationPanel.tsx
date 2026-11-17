'use client';

import { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  ArrowRightLeft,
  CornerUpLeft,
  CornerUpRight,
  ArrowUp,
  Flag,
  Play,
  Square,
  Accessibility,
  Route as RouteIcon,
  Mountain,
  Footprints,
  TriangleAlert,
  Sun,
  Moon,
  MapPin,
  Building2,
  Search,
  Crosshair,
} from 'lucide-react';
import { useSpatialStore } from '@/store/useSpatialStore';
import { buildingsById, campusGraph } from '@/lib/campusData';
import { formatDistance, formatDuration, minutesToClock } from '@/lib/geo';
import { originOptions } from '@/store/useSpatialStore';
import type { DirectionStep } from '@/lib/types';

function StepIcon({ step }: { step: DirectionStep }) {
  const cls = 'shrink-0';
  switch (step.icon) {
    case 'left':
      return <CornerUpLeft size={15} className={`${cls} text-cyan`} />;
    case 'right':
      return <CornerUpRight size={15} className={`${cls} text-cyan`} />;
    case 'stairs':
      return <ArrowUp size={15} className={`${cls} text-amber`} />;
    case 'flag':
      return <Flag size={15} className={`${cls} text-mint`} />;
    case 'start':
      return <Crosshair size={15} className={`${cls} text-amber`} />;
    default:
      return <ArrowUp size={15} className={`${cls} text-white/45`} />;
  }
}

function ElevationProfile() {
  const route = useSpatialStore((s) => s.route);
  const chart = useMemo(() => {
    if (!route || route.profile.length < 2) return null;
    const values = route.profile.map((p) => p.e);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(1, max - min);
    const w = 320;
    const h = 58;
    const points = route.profile.map((p, i) => {
      const x = (p.d / Math.max(1, route.distanceM)) * w;
      const y = h - ((p.e - min) / span) * (h - 10) - 5;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const line = `M${points.join(' L')}`;
    const area = `${line} L${w},${h} L0,${h} Z`;
    return { line, area, min, max, gain: route.ascentM, loss: route.descentM };
  }, [route]);

  if (!chart) return null;

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5">
      <div className="flex items-center justify-between">
        <span className="ou-eyebrow flex items-center gap-1.5">
          <Mountain size={10} /> Terrain profile
        </span>
        <span className="ou-mono text-[9px] text-white/40">
          {chart.min.toFixed(0)}–{chart.max.toFixed(0)} m
        </span>
      </div>
      <svg viewBox="0 0 320 58" className="mt-1.5 h-[58px] w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="ou-elev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#43e2ff" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#43e2ff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((t) => (
          <line
            key={t}
            x1={0}
            x2={320}
            y1={58 * t}
            y2={58 * t}
            stroke="rgba(255,255,255,0.06)"
            strokeDasharray="3 4"
          />
        ))}
        <path d={chart.area} fill="url(#ou-elev)" />
        <path d={chart.line} fill="none" stroke="#5ff5d0" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <div className="mt-1 flex items-center justify-between ou-mono text-[9px] text-white/35">
        <span className="text-mint">↑ {chart.gain.toFixed(1)} m climb</span>
        <span>↓ {chart.loss.toFixed(1)} m descent</span>
      </div>
    </div>
  );
}

export default function NavigationPanel() {
  const route = useSpatialStore((s) => s.route);
  const steps = useSpatialStore((s) => s.steps);
  const routeError = useSpatialStore((s) => s.routeError);
  const routeMs = useSpatialStore((s) => s.routeMs);
  const destinationId = useSpatialStore((s) => s.destinationId);
  const destinationLabel = useSpatialStore((s) => s.destinationLabel);
  const originId = useSpatialStore((s) => s.originId);
  const originLabel = useSpatialStore((s) => s.originLabel);
  const stepFree = useSpatialStore((s) => s.stepFree);
  const setStepFree = useSpatialStore((s) => s.setStepFree);
  const clearRoute = useSpatialStore((s) => s.clearRoute);
  const swapEnds = useSpatialStore((s) => s.swapEnds);
  const setOrigin = useSpatialStore((s) => s.setOrigin);
  const setSearchOpen = useSpatialStore((s) => s.setSearchOpen);
  const flythrough = useSpatialStore((s) => s.flythrough);
  const setFlythrough = useSpatialStore((s) => s.setFlythrough);
  const minutes = useSpatialStore((s) => s.minutes);
  const location = useSpatialStore((s) => s.location);
  const activeFloor = useSpatialStore((s) => s.activeFloor);
  const selectedBuildingId = useSpatialStore((s) => s.selectedBuildingId);

  const destination = destinationId ? buildingsById.get(destinationId) : null;
  const building = selectedBuildingId ? buildingsById.get(selectedBuildingId) : null;
  const activeStepIndex = 0;

  const originNode = campusGraph.nodes.get(originId);
  const originSelectValue = originOptions.some((o) => o.id === originId) ? originId : '';

  return (
    <AnimatePresence>
      {(destinationId || routeError) && (
        <motion.aside
          initial={{ opacity: 0, y: 26, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.99 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-x-3 bottom-3 z-40 md:inset-x-auto md:bottom-5 md:left-5 md:w-[404px]"
        >
          <div className="relative flex max-h-[62dvh] flex-col overflow-hidden rounded-2xl glass-strong md:max-h-[min(48vh,520px)]">
            <div className="ou-corner ou-corner--tl" />
            <div className="ou-corner ou-corner--br" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-mint/60 to-transparent" />

            <header className="flex items-start justify-between gap-3 px-4 pb-2.5 pt-3.5">
              <div className="min-w-0">
                <p className="ou-eyebrow flex items-center gap-1.5">
                  <RouteIcon size={10} /> Active route
                  <span className="text-white/25">·</span>
                  <span className="text-mint">{route ? formatDistance(route.distanceM) : '—'}</span>
                  <span className="text-white/25">·</span>
                  <span className="text-amber">{route ? formatDuration(route.durationS) : '—'}</span>
                </p>
                <h2 className="mt-1 truncate text-[15px] font-medium leading-tight text-white">
                  {destination?.name ?? destinationLabel ?? 'Unreachable'}
                </h2>
                <p className="mt-0.5 truncate text-[10px] text-white/35">
                  {route
                    ? `A* · ${route.edgeIds.length} edges · solved in ${routeMs.toFixed(1)} ms`
                    : 'Route engine returned no path'}
                </p>
              </div>
              <button
                type="button"
                onClick={clearRoute}
                className="shrink-0 rounded-lg border border-white/10 p-1.5 text-white/45 transition hover:border-ember/40 hover:text-ember"
                aria-label="End route"
              >
                <X size={14} />
              </button>
            </header>

            <div className="ou-scroll flex-1 overflow-y-auto px-4 pb-3">
              {/* origin / destination */}
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-2.5">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-amber" />
                  <select
                    value={originSelectValue}
                    onChange={(event) => {
                      const option = originOptions.find((o) => o.id === event.target.value);
                      if (option) setOrigin(option.id, option.label);
                    }}
                    className="min-w-0 flex-1 cursor-pointer appearance-none bg-transparent text-[11px] text-white/80 focus:outline-none"
                    aria-label="Route origin"
                  >
                    <option value="" className="bg-abyss">
                      {location ? `My location · ${originNode?.label ?? ''}` : originLabel}
                    </option>
                    {originOptions.map((option) => (
                      <option key={option.id} value={option.id} className="bg-abyss">
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={swapEnds}
                    className="rounded-md border border-white/10 p-1 text-white/45 hover:border-cyan/40 hover:text-cyan"
                    title="Swap origin and destination"
                    aria-label="Swap origin and destination"
                  >
                    <ArrowRightLeft size={12} />
                  </button>
                </div>
                <div className="my-2 ml-1 h-3 w-px bg-gradient-to-b from-amber/50 to-mint/50" />
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-mint" />
                  <button
                    type="button"
                    onClick={() => setSearchOpen(true)}
                    className="min-w-0 flex-1 truncate text-left text-[11px] text-white/80 hover:text-white"
                  >
                    {destination?.name ?? 'Choose destination'}
                  </button>
                  <span className="ou-mono shrink-0 text-[9px] text-white/35">
                    {destination ? `F${activeFloor}` : ''}
                  </span>
                  <Search size={11} className="shrink-0 text-white/30" />
                </div>
              </div>

              {routeError && (
                <div className="mt-2.5 flex gap-2 rounded-xl border border-ember/30 bg-ember/[0.08] p-2.5">
                  <TriangleAlert size={14} className="mt-0.5 shrink-0 text-ember" />
                  <div>
                    <p className="text-[11px] font-medium text-ember/90">No route available</p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-white/50">{routeError}</p>
                    {!stepFree && (
                      <button
                        type="button"
                        onClick={() => setStepFree(true)}
                        className="mt-1.5 text-[10px] text-cyan underline-offset-2 hover:underline"
                      >
                        Try step-free routing
                      </button>
                    )}
                  </div>
                </div>
              )}

              {route && (
                <>
                  <div className="mt-2.5 grid grid-cols-4 gap-1.5">
                    {[
                      { label: 'Distance', value: formatDistance(route.distanceM), icon: Footprints },
                      { label: 'ETA', value: formatDuration(route.durationS), icon: RouteIcon },
                      { label: 'Climb', value: `${route.ascentM.toFixed(0)} m`, icon: Mountain },
                      { label: 'Steps', value: stepFree ? '0' : `${route.stepsCount}`, icon: Accessibility },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-2 py-1.5"
                      >
                        <stat.icon size={11} className="text-cyan/70" />
                        <p className="ou-mono mt-1 text-[11px] leading-none text-white/85">{stat.value}</p>
                        <p className="mt-0.5 text-[8px] uppercase tracking-[0.12em] text-white/30">
                          {stat.label}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-2.5">
                    <ElevationProfile />
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setStepFree(!stepFree)}
                      className={`ou-chip transition ${
                        stepFree ? 'border-mint/50 bg-mint/10 text-mint' : 'hover:border-cyan/40'
                      }`}
                    >
                      <Accessibility size={10} />
                      {stepFree ? 'Step-free on' : 'Step-free off'}
                    </button>
                    {route.unlitM > 40 && (
                      <span className="ou-chip ou-chip--amber">
                        <Moon size={9} /> {formatDistance(route.unlitM)} unlit
                      </span>
                    )}
                    {route.crowdedM > 80 && (
                      <span className="ou-chip">
                        <Sun size={9} /> {formatDistance(route.crowdedM)} busy
                      </span>
                    )}
                    <span className="ou-chip">
                      <MapPin size={9} /> {minutesToClock(minutes)} IST
                    </span>
                  </div>

                  {building && destination && (
                    <div className="mt-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5">
                      <p className="ou-eyebrow flex items-center gap-1.5">
                        <Building2 size={10} /> Arrival intel
                      </p>
                      <p className="mt-1 text-[11px] leading-relaxed text-white/60">
                        {destination.access} · {destination.hours}
                      </p>
                    </div>
                  )}
                </>
              )}

              {steps.length > 0 && (
                <div className="mt-3">
                  <div className="flex items-center justify-between">
                    <p className="ou-eyebrow">Turn-by-turn</p>
                    <span className="ou-mono text-[9px] text-white/30">{steps.length} steps</span>
                  </div>
                  <ol className="mt-1.5 space-y-1">
                    {steps.map((step, index) => (
                      <li
                        key={`${step.index}-${step.instruction}`}
                        className={`flex gap-2.5 rounded-lg border px-2 py-2 transition ${
                          index === activeStepIndex
                            ? 'border-cyan/35 bg-cyan/[0.07]'
                            : 'border-transparent hover:border-white/[0.08] hover:bg-white/[0.02]'
                        }`}
                      >
                        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[0.03]">
                          <StepIcon step={step} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[11px] leading-snug text-white/80">
                            {step.instruction}
                          </span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-2 ou-mono text-[9px] text-white/30">
                            {step.distanceM > 0 && <span>{formatDistance(step.distanceM)}</span>}
                            {step.kind === 'stairs' && <span className="text-amber">stairs</span>}
                            {!step.lit && <span className="text-amber">unlit</span>}
                            {step.ascentM > 1 && <span>↑{step.ascentM.toFixed(0)}m</span>}
                          </span>
                        </span>
                        <span className="ou-mono shrink-0 text-[9px] text-white/25">
                          {(step.index + 1).toString().padStart(2, '0')}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>

            <footer className="flex items-center gap-2 border-t border-white/10 px-4 py-2.5">
              <button
                type="button"
                onClick={() => setFlythrough(!flythrough)}
                disabled={!route}
                className={`ou-btn flex-1 ${flythrough ? 'ou-btn--primary' : ''}`}
              >
                {flythrough ? <Square size={13} /> : <Play size={13} />}
                {flythrough ? 'Stop flythrough' : 'Fly the route'}
              </button>
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="ou-btn"
                title="Change destination"
                aria-label="Change destination"
              >
                <Search size={13} />
              </button>
              <button type="button" onClick={clearRoute} className="ou-btn ou-btn--danger" title="End route">
                <X size={13} />
              </button>
            </footer>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
