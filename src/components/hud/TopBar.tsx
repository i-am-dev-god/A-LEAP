'use client';

import { useEffect, useState } from 'react';
import {
  Search,
  Radio,
  RadioTower,
  Compass,
  Gauge,
  Clock3,
  MapPin,
} from 'lucide-react';
import { useSpatialStore, useSun } from '@/store/useSpatialStore';
import { categoryAccent } from '@/lib/lighting';

function ISTClock() {
  const [now, setNow] = useState<string>('--:--:--');
  useEffect(() => {
    const tick = () => {
      const date = new Date(Date.now() + 330 * 60000);
      const h = date.getUTCHours().toString().padStart(2, '0');
      const m = date.getUTCMinutes().toString().padStart(2, '0');
      const s = date.getUTCSeconds().toString().padStart(2, '0');
      setNow(`${h}:${m}:${s}`);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  return <span className="ou-mono text-[11px] text-white/70">{now}</span>;
}

export default function TopBar() {
  const setSearchOpen = useSpatialStore((s) => s.setSearchOpen);
  const view = useSpatialStore((s) => s.view);
  const fps = useSpatialStore((s) => s.fps);
  const feedSource = useSpatialStore((s) => s.feedSource);
  const alerts = useSpatialStore((s) => s.alerts);
  const requestCamera = useSpatialStore((s) => s.requestCamera);
  const { clock } = useSun();
  const preset = useSpatialStore((s) => s.preset);

  const fpsTone = fps >= 55 ? 'text-mint' : fps >= 35 ? 'text-amber' : 'text-ember';
  const feedTone = feedSource === 'live' ? 'text-mint' : 'text-cyan';

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-3 sm:p-4 md:p-5">
      <div className="pointer-events-auto relative flex items-center gap-3 overflow-hidden rounded-2xl glass px-3 py-2 md:px-4 md:py-2.5">
        <div className="ou-corner ou-corner--tl" />
        <div className="relative grid h-9 w-9 place-items-center rounded-xl border border-cyan/30 bg-cyan/10">
          <svg viewBox="0 0 32 32" className="h-6 w-6" aria-hidden="true">
            <circle cx="16" cy="16" r="12" fill="none" stroke="#43e2ff" strokeOpacity="0.35" />
            <circle cx="16" cy="16" r="7.5" fill="none" stroke="#5ff5d0" strokeOpacity="0.55" />
            <path d="M16 4.5c4.2 3 6.4 7 6.4 11.5S20.2 24.5 16 27.5" fill="none" stroke="#43e2ff" strokeWidth="1.1" />
            <path d="M16 4.5c-4.2 3-6.4 7-6.4 11.5s2.2 8.5 6.4 11.5" fill="none" stroke="#43e2ff" strokeOpacity="0.5" strokeWidth="1.1" />
            <path d="M16 9.5l2.2 4.3h-4.4z" fill="#ffb648" />
            <circle cx="16" cy="16" r="1.8" fill="#eaffff" />
          </svg>
          <span className="absolute inset-0 rounded-xl border border-cyan/20 ou-anim-pulse" />
        </div>
        <div className="min-w-0">
          <p className="ou-eyebrow truncate">Osmania University · Hyderabad</p>
          <h1 className="ou-title truncate text-[13px] text-white md:text-[15px]">OU Spatial Engine</h1>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="pointer-events-auto group relative hidden min-w-0 max-w-[420px] flex-1 items-center gap-3 rounded-2xl glass px-4 py-2.5 text-left transition hover:border-cyan/40 md:flex"
      >
        <Search size={15} className="shrink-0 text-cyan" />
        <span className="truncate text-[12px] text-white/45">
          Search buildings, labs, hostels, gates…
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 ou-mono text-[9px] text-white/50">⌘</kbd>
          <kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 ou-mono text-[9px] text-white/50">K</kbd>
        </span>
      </button>

      <div className="pointer-events-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="ou-rail-btn md:hidden"
          aria-label="Search campus"
        >
          <Search size={16} />
        </button>

        <div className="hidden items-center gap-2 rounded-2xl glass px-3 py-2 sm:flex">
          <span className={`flex items-center gap-1.5 ou-mono text-[10px] uppercase tracking-[0.14em] ${feedTone}`}>
            {feedSource === 'live' ? <RadioTower size={12} /> : <Radio size={12} />}
            {feedSource === 'live' ? 'Supabase live' : 'Local feed'}
          </span>
          <span className="h-4 w-px bg-white/10" />
          <span className="flex items-center gap-1.5 ou-mono text-[10px] text-white/45">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-mint ou-anim-blink" />
            </span>
            {alerts.length} signals
          </span>
        </div>

        <div className="hidden flex-col rounded-2xl glass px-3 py-1.5 md:flex">
          <span className="flex items-center gap-1.5 ou-eyebrow">
            <Clock3 size={10} /> IST live
          </span>
          <ISTClock />
        </div>

        <div className="hidden flex-col rounded-2xl glass px-3 py-1.5 sm:flex">
          <span className="flex items-center gap-1.5 ou-eyebrow">
            <Clock3 size={10} /> Light rig
          </span>
          <span className="ou-mono text-[11px] text-amber">
            {clock} <span className="text-[9px] text-white/40">{preset.toUpperCase()}</span>
          </span>
        </div>

        <div className="hidden flex-col items-end rounded-2xl glass px-3 py-1.5 sm:flex">
          <span className="flex items-center gap-1.5 ou-eyebrow">
            <Gauge size={10} /> Render
          </span>
          <span className={`ou-mono text-[11px] ${fpsTone}`}>{fps || '—'} fps</span>
        </div>

        <button
          type="button"
          onClick={() => requestCamera('north')}
          className="relative grid h-[46px] w-[46px] shrink-0 place-items-center rounded-2xl glass text-white/70 transition hover:text-white"
          title="Reset compass north"
          aria-label="Reset compass north"
        >
          <Compass
            size={22}
            className="absolute text-cyan/25"
            style={{ transform: `rotate(${-view.bearing}deg)`, transition: 'transform 120ms linear' }}
          />
          <span
            className="absolute inset-0 grid place-items-center"
            style={{ transform: `rotate(${-view.bearing}deg)`, transition: 'transform 120ms linear' }}
          >
            <span className="h-4 w-0.5 rounded bg-amber" style={{ transform: 'translateY(-6px)' }} />
            <span className="absolute h-1.5 w-1.5 rounded-full bg-white/80" />
          </span>
          <span className="absolute bottom-1 ou-mono text-[8px] text-white/45">N</span>
        </button>
      </div>

      <div className="pointer-events-none absolute left-1/2 top-[74px] hidden -translate-x-1/2 items-center gap-2 lg:flex">
        <span className="ou-chip">
          <MapPin size={9} /> 17.4175°N 78.5285°E
        </span>
        <span className="ou-chip" style={{ borderColor: `${categoryAccent('heritage')}44`, color: categoryAccent('heritage') }}>
          Self-hosted vector core
        </span>
      </div>
    </header>
  );
}
