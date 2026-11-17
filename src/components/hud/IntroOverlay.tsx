'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Building2, Footprints, Trees, Crosshair } from 'lucide-react';
import { useSpatialStore } from '@/store/useSpatialStore';
import { campusTotals, meta } from '@/lib/campusData';

const stats = [
  { icon: Building2, value: campusTotals.buildings, label: 'buildings surveyed' },
  { icon: Footprints, value: campusTotals.edges, label: 'walkway edges' },
  { icon: Trees, value: campusTotals.trees, label: 'instanced trees' },
  { icon: Crosshair, value: `${meta.areaKm2} km²`, label: 'campus area' },
];

export default function IntroOverlay() {
  const introDismissed = useSpatialStore((s) => s.introDismissed);
  const dismissIntro = useSpatialStore((s) => s.dismissIntro);
  const setSearchOpen = useSpatialStore((s) => s.setSearchOpen);

  if (introDismissed) return null;

  return (
    <motion.div
      className="ou-intro absolute inset-0 z-[60] grid place-items-center p-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      <div className="ou-grid-lines pointer-events-none absolute inset-0" />
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
        className="relative w-full max-w-3xl"
      >
        <div className="relative overflow-hidden rounded-3xl glass-strong p-7 md:p-10">
          <div className="ou-corner ou-corner--tl" />
          <div className="ou-corner ou-corner--br" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan/70 to-transparent" />

          <div className="flex flex-wrap items-center gap-3">
            <span className="ou-chip">
              <span className="h-1.5 w-1.5 rounded-full bg-mint ou-anim-blink" />
              Geospatial core online
            </span>
            <span className="ou-chip ou-chip--amber">Revision {meta.revision}</span>
            <span className="ou-chip">Zero external map APIs</span>
          </div>

          <p className="ou-eyebrow mt-7">Osmania University · Hyderabad · 17.4175°N 78.5285°E</p>
          <h2 className="ou-title mt-2 text-[34px] leading-[1.05] text-white md:text-[52px]">
            OU Spatial
            <br />
            <span className="bg-gradient-to-r from-cyan via-mint to-amber bg-clip-text text-transparent">
              Engine
            </span>
          </h2>
          <p className="mt-4 max-w-xl text-[13px] leading-relaxed text-white/60 md:text-sm">
            A self-rendered 3D campus twin for Osmania University: A* pedestrian routing over a
            hand-surveyed walkway graph, GPU-instanced foliage, real-time solar lighting for
            Hyderabad, and a live crowdsourced campus pulse.
          </p>

          <div className="mt-7 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5"
              >
                <stat.icon size={14} className="text-cyan/80" />
                <p className="ou-mono mt-1.5 text-lg leading-none text-white">{stat.value}</p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-white/35">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-7 flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <button type="button" onClick={dismissIntro} className="ou-btn ou-btn--primary h-11 px-5 text-[13px]">
              Enter campus
              <ArrowRight size={15} />
            </button>
            <button
              type="button"
              onClick={() => {
                dismissIntro();
                setSearchOpen(true);
              }}
              className="ou-btn h-11 px-5 text-[13px]"
            >
              Find a building
            </button>
            <p className="ou-mono text-[10px] leading-relaxed text-white/35 sm:ml-auto sm:text-right">
              Best experienced with hardware acceleration
              <br />
              60 fps target · WebGL2
            </p>
          </div>
        </div>

        <p className="mt-4 text-center ou-mono text-[10px] tracking-[0.16em] text-white/25">
          {meta.survey.toUpperCase()}
        </p>
      </motion.div>
    </motion.div>
  );
}
