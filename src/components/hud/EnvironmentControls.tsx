'use client';

import { useState } from 'react';
import {
  SunMedium,
  Moon,
  Box,
  Square,
  Building2,
  LocateFixed,
  Home,
  Accessibility,
  Gauge,
  X,
  Sunrise,
  Sunset,
  RadioTower,
  Layers3,
} from 'lucide-react';
import { useLighting, useSpatialStore, useSun } from '@/store/useSpatialStore';
import { TIME_PRESETS, type TimePreset } from '@/lib/lighting';
import { buildingsById } from '@/lib/campusData';
import { minutesToClock } from '@/lib/geo';

type Panel = 'time' | 'floor' | null;

const PRESET_ICONS = {
  dawn: Sunrise,
  noon: SunMedium,
  golden: Sunset,
  night: Moon,
  live: RadioTower,
} as const;

const FLOOR_LABELS = ['Ground', 'First', 'Second', 'Third', 'Fourth', 'Fifth'];

export default function EnvironmentControls() {
  const [panel, setPanel] = useState<Panel>(null);
  const lighting = useLighting();
  const { sun } = useSun();
  const minutes = useSpatialStore((s) => s.minutes);
  const preset = useSpatialStore((s) => s.preset);
  const setMinutes = useSpatialStore((s) => s.setMinutes);
  const applyPreset = useSpatialStore((s) => s.applyPreset);
  const is3D = useSpatialStore((s) => s.is3D);
  const toggle3D = useSpatialStore((s) => s.toggle3D);
  const quality = useSpatialStore((s) => s.quality);
  const setQuality = useSpatialStore((s) => s.setQuality);
  const stepFree = useSpatialStore((s) => s.stepFree);
  const setStepFree = useSpatialStore((s) => s.setStepFree);
  const selectedBuildingId = useSpatialStore((s) => s.selectedBuildingId);
  const activeFloor = useSpatialStore((s) => s.activeFloor);
  const setActiveFloor = useSpatialStore((s) => s.setActiveFloor);
  const setLocation = useSpatialStore((s) => s.setLocation);
  const requestCamera = useSpatialStore((s) => s.requestCamera);
  const showToast = useSpatialStore((s) => s.showToast);

  const building = selectedBuildingId ? buildingsById.get(selectedBuildingId) : undefined;

  const locate = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      showToast('Geolocation is unavailable in this browser', 'warn');
      return;
    }
    showToast('Acquiring GPS fix…');
    navigator.geolocation.getCurrentPosition(
      (position) =>
        setLocation(
          position.coords.longitude,
          position.coords.latitude,
          position.coords.accuracy ?? 25
        ),
      () => showToast('Location permission denied — keeping the selected origin', 'warn'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
    );
  };

  return (
    <div className="pointer-events-none absolute right-3 top-[70px] z-30 flex flex-col items-end gap-2 md:right-5 md:top-[76px]">
      <div className="ou-toolbar pointer-events-auto flex items-center gap-1 rounded-2xl glass px-1.5 py-1.5">
      {/* time ─────────────────────────────────────────────── */}
      <div className="relative">
        <button
          type="button"
          className="ou-rail-btn"
          data-active={panel === 'time'}
          onClick={() => setPanel(panel === 'time' ? null : 'time')}
          aria-label="Time of day"
        >
          {lighting.isNight ? <Moon size={17} /> : <SunMedium size={17} />}
          <span className="ou-rail-tip">Light rig · {lighting.label}</span>
        </button>
        {panel === 'time' && (
          <div className="absolute right-0 top-full z-40 mt-2 w-[292px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl glass-strong p-4">
            <div className="ou-corner ou-corner--tl" />
            <div className="flex items-start justify-between">
              <div>
                <p className="ou-eyebrow">Light rig</p>
                <p className="ou-mono mt-1 text-2xl leading-none text-white">{minutesToClock(minutes)}</p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-amber">{lighting.label}</p>
              </div>
              <button
                type="button"
                onClick={() => setPanel(null)}
                className="text-white/40 hover:text-white"
                aria-label="Close time panel"
              >
                <X size={14} />
              </button>
            </div>

            <input
              type="range"
              min={0}
              max={1439}
              step={5}
              value={minutes}
              onChange={(event) => setMinutes(Number(event.target.value))}
              className="ou-range mt-4"
              aria-label="Time of day"
            />
            <div className="mt-1 flex justify-between ou-mono text-[9px] text-white/30">
              <span>00:00</span>
              <span>12:00</span>
              <span>23:59</span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-1.5">
              {TIME_PRESETS.map((entry) => {
                const Icon = PRESET_ICONS[entry.id as keyof typeof PRESET_ICONS] ?? SunMedium;
                const active = preset === entry.id;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => applyPreset(entry.id as TimePreset)}
                    className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-2 transition ${
                      active
                        ? 'border-mint/50 bg-mint/10 text-white'
                        : 'border-white/10 bg-white/[0.02] text-white/50 hover:border-cyan/30 hover:text-white'
                    }`}
                    title={entry.hint}
                  >
                    <Icon size={13} />
                    <span className="text-[9px] uppercase tracking-[0.12em]">{entry.label}</span>
                  </button>
                );
              })}
              <div className="flex flex-col items-center justify-center rounded-lg border border-white/10 bg-white/[0.02] px-1 py-2 text-white/35">
                <Gauge size={13} />
                <span className="text-[9px] uppercase tracking-[0.12em]">Solar</span>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-1.5 ou-mono text-[9px]">
              <div className="rounded-lg border border-white/10 bg-white/[0.02] px-2 py-1.5">
                <p className="text-white/35">AZIMUTH</p>
                <p className="text-[11px] text-white/80">{sun.azimuthDeg.toFixed(1)}°</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.02] px-2 py-1.5">
                <p className="text-white/35">ELEVATION</p>
                <p className={`text-[11px] ${sun.elevationDeg > 0 ? 'text-amber' : 'text-cyan'}`}>
                  {sun.elevationDeg.toFixed(1)}°
                </p>
              </div>
            </div>
            <p className="mt-2.5 text-[10px] leading-relaxed text-white/30">
              NOAA solar position for 17.4175°N, 78.5285°E — drives shadows, neon fill and HUD tint.
            </p>
          </div>
        )}
      </div>

      {/* 3D / 2D ──────────────────────────────────────────── */}
      <div className="relative">
        <button
          type="button"
          className="ou-rail-btn"
          data-active={is3D}
          onClick={toggle3D}
          aria-label="Toggle 3D / 2D"
        >
          {is3D ? <Box size={17} /> : <Square size={17} />}
          <span className="ou-rail-tip">{is3D ? '3D · orbit view' : '2D · plan view'}</span>
        </button>
      </div>

      {/* floors ──────────────────────────────────────────── */}
      <div className="relative">
        <button
          type="button"
          className="ou-rail-btn"
          data-active={panel === 'floor'}
          onClick={() => setPanel(panel === 'floor' ? null : 'floor')}
          aria-label="Floor selector"
        >
          <Building2 size={17} />
          <span className="ou-rail-tip">
            {building ? `${building.short} · floor ${activeFloor}` : 'Floor selector'}
          </span>
          {building && (
            <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full border border-cyan/50 bg-abyss px-1 ou-mono text-[8px] text-cyan">
              {activeFloor}
            </span>
          )}
        </button>
        {panel === 'floor' && (
          <div className="absolute right-0 top-full z-40 mt-2 w-[292px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl glass-strong p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="ou-eyebrow">Vertical slice</p>
                <p className="mt-1 text-[13px] text-white/90">
                  {building ? building.name : 'No building selected'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPanel(null)}
                className="text-white/40 hover:text-white"
                aria-label="Close floor panel"
              >
                <X size={14} />
              </button>
            </div>

            {!building && (
              <p className="mt-3 text-[11px] leading-relaxed text-white/40">
                Select a building on the map or through search to slice it into floors.
              </p>
            )}

            {building && (
              <div className="ou-scroll mt-3 max-h-[280px] space-y-1 overflow-y-auto pr-1">
                {Array.from({ length: building.floors }).map((_, floor) => {
                  const pois = building.pois.filter((p) => p.floor === floor);
                  const active = floor === activeFloor;
                  return (
                    <button
                      key={floor}
                      type="button"
                      onClick={() => setActiveFloor(floor)}
                      className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition ${
                        active
                          ? 'border-cyan/45 bg-cyan/10'
                          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15'
                      }`}
                    >
                      <span className="ou-mono w-12 shrink-0 text-[10px] text-white/40">
                        {floor === 0 ? 'G' : `L${floor}`}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] text-white/80">
                          {FLOOR_LABELS[floor] ?? `Floor ${floor}`} floor
                        </span>
                        <span className="block truncate text-[10px] text-white/35">
                          {pois.length ? pois.map((p) => p.name).join(' · ') : 'Circulation / plant'}
                        </span>
                      </span>
                      {active && <span className="h-1.5 w-1.5 rounded-full bg-mint" />}
                    </button>
                  );
                })}
                <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
                  <span className="text-[10px] text-white/35">Height / footprint</span>
                  <span className="ou-mono text-[10px] text-white/60">
                    {building.height_m} m · {building.footprint_m2.toLocaleString()} m²
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <span className="mx-0.5 h-5 w-px shrink-0 bg-white/10" />

      {/* locate ──────────────────────────────────────────── */}
      <button type="button" className="ou-rail-btn" onClick={locate} aria-label="Use my location">
        <LocateFixed size={17} />
        <span className="ou-rail-tip">Snap to my GPS</span>
      </button>

      {/* home ────────────────────────────────────────────── */}
      <button
        type="button"
        className="ou-rail-btn"
        onClick={() => requestCamera('campus')}
        aria-label="Fit campus"
      >
        <Home size={17} />
        <span className="ou-rail-tip">Fit campus</span>
      </button>

      {/* accessibility ───────────────────────────────────── */}
      <button
        type="button"
        className="ou-rail-btn"
        data-active={stepFree}
        onClick={() => setStepFree(!stepFree)}
        aria-label="Toggle step-free routing"
      >
        <Accessibility size={17} />
        <span className="ou-rail-tip">{stepFree ? 'Step-free routes on' : 'Step-free routes off'}</span>
      </button>

      {/* quality ─────────────────────────────────────────── */}
      <button
        type="button"
        className="ou-rail-btn"
        data-active={quality === 'cinematic'}
        onClick={() => setQuality(quality === 'cinematic' ? 'balanced' : 'cinematic')}
        aria-label="Toggle render quality"
      >
        <Layers3 size={17} />
        <span className="ou-rail-tip">{quality === 'cinematic' ? 'Cinematic · shadows on' : 'Balanced · shadows off'}</span>
      </button>
      </div>
    </div>
  );
}
