'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  Navigation,
  Clock,
  DoorOpen,
  Search,
  Building2,
  ArrowUpRight,
  Layers3,
  FlaskConical,
  MapPin,
  Briefcase,
  Wrench,
} from 'lucide-react';
import { useSpatialStore } from '@/store/useSpatialStore';
import { buildingsById, campusTotals } from '@/lib/campusData';
import { categoryAccent } from '@/lib/lighting';
import { categoryLabel } from '@/lib/search';
import type { PoiKind } from '@/lib/types';

const QUICK = ['artscollege', 'library', 'ouce', 'canteen', 'nizam', 'health'];

const POI_ICON: Record<PoiKind, typeof MapPin> = {
  room: MapPin,
  lab: FlaskConical,
  office: Briefcase,
  facility: Wrench,
};

export default function BuildingCard() {
  const selectedBuildingId = useSpatialStore((s) => s.selectedBuildingId);
  const selectBuilding = useSpatialStore((s) => s.selectBuilding);
  const navigateToBuilding = useSpatialStore((s) => s.navigateToBuilding);
  const navigateToPoi = useSpatialStore((s) => s.navigateToPoi);
  const activeFloor = useSpatialStore((s) => s.activeFloor);
  const setActiveFloor = useSpatialStore((s) => s.setActiveFloor);
  const setSearchOpen = useSpatialStore((s) => s.setSearchOpen);
  const destinationId = useSpatialStore((s) => s.destinationId);
  const hasRoute = useSpatialStore((s) => Boolean(s.route));

  const building = selectedBuildingId ? buildingsById.get(selectedBuildingId) : undefined;
  const accent = building ? categoryAccent(building.category) : '#43e2ff';

  if (hasRoute) return null;

  return (
    <div className="pointer-events-none absolute left-3 top-[150px] z-30 w-[322px] max-w-[calc(100vw-1.5rem)] md:left-5 md:top-[122px]">
      <AnimatePresence mode="wait">
        {building ? (
          <motion.section
            key={building.id}
            initial={{ opacity: 0, x: -18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -14 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="relative overflow-hidden rounded-2xl glass"
          >
            <div className="ou-corner ou-corner--tl" />
            <div className="h-[2px] w-full" style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }} />

            <header className="flex items-start gap-2 px-3.5 pb-2 pt-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className="rounded-full border px-1.5 py-0.5 ou-mono text-[8px] uppercase tracking-[0.12em]"
                    style={{ borderColor: `${accent}55`, color: accent, background: `${accent}14` }}
                  >
                    {categoryLabel(building.category)}
                  </span>
                  <span className="ou-mono text-[9px] text-white/30">{building.code}</span>
                  {building.hero && (
                    <span className="ou-chip ou-chip--amber !px-1.5 !py-0 !text-[8px]">Landmark</span>
                  )}
                </div>
                <h2 className="mt-1.5 text-[15px] font-medium leading-tight text-white">
                  {building.name}
                </h2>
                <p className="ou-mono mt-0.5 text-[9px] text-white/35">
                  {building.floors} floor{building.floors > 1 ? 's' : ''} · {building.height_m} m ·{' '}
                  {building.footprint_m2.toLocaleString()} m²
                </p>
              </div>
              <button
                type="button"
                onClick={() => selectBuilding(null)}
                className="shrink-0 rounded-md border border-white/10 p-1 text-white/40 transition hover:text-white"
                aria-label="Close building card"
              >
                <X size={13} />
              </button>
            </header>

            <div className="ou-scroll max-h-[38vh] overflow-y-auto px-3.5 pb-3">
              <p className="text-[11px] leading-relaxed text-white/55">{building.description}</p>

              <div className="mt-2.5 space-y-1.5">
                <div className="flex items-start gap-2 text-[10px] text-white/55">
                  <Clock size={11} className="mt-0.5 shrink-0 text-cyan/70" />
                  <span>{building.hours}</span>
                </div>
                <div className="flex items-start gap-2 text-[10px] text-white/55">
                  <DoorOpen size={11} className="mt-0.5 shrink-0 text-cyan/70" />
                  <span>{building.access}</span>
                </div>
              </div>

              <div className="mt-3">
                <p className="ou-eyebrow flex items-center gap-1.5">
                  <Layers3 size={10} /> Floors
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {Array.from({ length: building.floors }).map((_, floor) => {
                    const active = floor === activeFloor;
                    return (
                      <button
                        key={floor}
                        type="button"
                        onClick={() => setActiveFloor(floor)}
                        className={`h-7 min-w-7 rounded-md border px-1.5 ou-mono text-[10px] transition ${
                          active
                            ? 'border-cyan/60 bg-cyan/15 text-white'
                            : 'border-white/10 bg-white/[0.02] text-white/45 hover:border-white/25'
                        }`}
                      >
                        {floor === 0 ? 'G' : floor}
                      </button>
                    );
                  })}
                </div>
              </div>

              {building.pois.length > 0 && (
                <div className="mt-3">
                  <p className="ou-eyebrow">Points of interest</p>
                  <div className="mt-1 space-y-0.5">
                    {building.pois.map((poi) => {
                      const Icon = POI_ICON[poi.kind] ?? MapPin;
                      return (
                        <button
                          key={`${poi.name}-${poi.floor}`}
                          type="button"
                          onClick={() => navigateToPoi(building.id, poi.name, poi.floor)}
                          className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition hover:bg-white/[0.04]"
                        >
                          <Icon size={11} className="shrink-0 text-white/35" />
                          <span className="min-w-0 flex-1 truncate text-[10px] text-white/65">{poi.name}</span>
                          <span className="ou-mono shrink-0 text-[8px] text-white/25">
                            {poi.floor === 0 ? 'G' : `L${poi.floor}`}
                          </span>
                          <ArrowUpRight size={9} className="shrink-0 text-cyan/40" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <footer className="flex gap-1.5 border-t border-white/[0.07] px-3.5 py-2.5">
              <button
                type="button"
                onClick={() => navigateToBuilding(building.id, activeFloor)}
                className="ou-btn ou-btn--primary flex-1"
              >
                <Navigation size={12} />
                {destinationId === building.id ? 'Re-route' : 'Navigate here'}
              </button>
              <button type="button" onClick={() => setSearchOpen(true)} className="ou-btn" aria-label="Search">
                <Search size={12} />
              </button>
            </footer>
          </motion.section>
        ) : (
          <motion.section
            key="quick"
            initial={{ opacity: 0, x: -14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.28 }}
            className="relative overflow-hidden rounded-2xl glass p-3.5"
          >
            <div className="ou-corner ou-corner--tl" />
            <div className="flex items-center justify-between">
              <p className="ou-eyebrow flex items-center gap-1.5">
                <Building2 size={10} /> Quick access
              </p>
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="text-[9px] uppercase tracking-[0.12em] text-cyan/70 transition hover:text-cyan"
              >
                Search all
              </button>
            </div>
            <div className="mt-2 space-y-0.5">
              {QUICK.map((id) => {
                const item = buildingsById.get(id);
                if (!item) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => navigateToBuilding(id)}
                    className="group flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition hover:bg-white/[0.04]"
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: categoryAccent(item.category) }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] text-white/80">{item.short}</span>
                      <span className="block truncate text-[9px] text-white/35">{item.name}</span>
                    </span>
                    <ArrowUpRight size={11} className="shrink-0 text-white/20 transition group-hover:text-cyan" />
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-white/[0.07] pt-2 ou-mono text-[9px] text-white/25">
              <span>{campusTotals.buildings} buildings · {campusTotals.nodes} nodes</span>
              <span>{campusTotals.pathsKm.toFixed(1)} km network</span>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
