'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Search,
  Building2,
  FlaskConical,
  DoorOpen,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  X,
  MapPin,
  Sparkles,
} from 'lucide-react';
import { searchCampus, categoryLabel } from '@/lib/search';
import { useSpatialStore } from '@/store/useSpatialStore';
import { gates } from '@/lib/campusData';
import type { SearchEntry } from '@/lib/types';

function EntryIcon({ entry }: { entry: SearchEntry }) {
  if (entry.type === 'gate') return <DoorOpen size={15} className="text-amber" />;
  if (entry.type === 'room')
    return entry.category === 'lab' ? (
      <FlaskConical size={15} className="text-mint" />
    ) : (
      <MapPin size={15} className="text-cyan" />
    );
  return <Building2 size={15} className="text-cyan" />;
}

export default function CommandSearch() {
  const open = useSpatialStore((s) => s.searchOpen);
  const setOpen = useSpatialStore((s) => s.setSearchOpen);
  const navigateToBuilding = useSpatialStore((s) => s.navigateToBuilding);
  const navigateToPoi = useSpatialStore((s) => s.navigateToPoi);
  const setDestinationGate = useSpatialStore((s) => s.setDestinationGate);
  const showToast = useSpatialStore((s) => s.showToast);

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => searchCampus(query, 9), [query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    const id = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  const choose = (entry: SearchEntry | undefined) => {
    if (!entry) return;
    if (entry.type === 'gate') {
      const gate = gates.find((g) => `g-${g.id}` === entry.id);
      if (gate) {
        setDestinationGate(gate.node, gate.name);
        setOpen(false);
        return;
      }
    }
    if (entry.type === 'room' && entry.buildingId) {
      navigateToPoi(entry.buildingId, entry.title, entry.floor ?? 0);
      setOpen(false);
      return;
    }
    if (entry.type === 'building' && entry.buildingId) {
      navigateToBuilding(entry.buildingId);
      setOpen(false);
      return;
    }
    showToast(`${entry.title} is not routable yet`, 'warn');
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(results[active]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-[70] flex items-start justify-center bg-black/45 p-3 pt-[8vh] backdrop-blur-[3px] sm:pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: -14, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.99 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-2xl overflow-hidden rounded-2xl glass-strong"
          >
            <div className="ou-corner ou-corner--tl" />
            <div className="ou-corner ou-corner--br" />

            <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3.5">
              <Search size={18} className="shrink-0 text-cyan" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search buildings, labs, rooms, hostels, gates…"
                className="w-full bg-transparent text-[14px] text-white placeholder:text-white/30 focus:outline-none"
                aria-label="Search campus"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-white/10 p-1 text-white/40 hover:text-white"
                aria-label="Close search"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex items-center justify-between px-4 py-2">
              <span className="ou-eyebrow">
                {query ? `${results.length} matches` : 'Suggested destinations'}
              </span>
              <span className="ou-chip">
                <Sparkles size={9} /> fuzzy matcher
              </span>
            </div>

            <div className="ou-scroll max-h-[52vh] overflow-y-auto px-2 pb-2">
              {results.length === 0 && (
                <div className="px-4 py-10 text-center">
                  <p className="text-sm text-white/60">No campus entity matches “{query}”.</p>
                  <p className="mt-1 text-xs text-white/30">
                    Try “library”, “OUCE”, “CSE lab”, “hostel” or a gate name.
                  </p>
                </div>
              )}
              {results.map((entry, index) => (
                <button
                  key={entry.id}
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(entry)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                    index === active
                      ? 'border-cyan/35 bg-cyan/[0.09]'
                      : 'border-transparent hover:border-white/10 hover:bg-white/[0.03]'
                  }`}
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.04]">
                    <EntryIcon entry={entry} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[13px] text-white/90">{entry.title}</span>
                      {entry.code && (
                        <span className="ou-mono shrink-0 text-[9px] text-white/30">{entry.code}</span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-white/40">
                      {entry.subtitle}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] text-white/40">
                    {entry.type === 'room' ? categoryLabel(entry.category) : entry.type}
                  </span>
                  {index === active && <CornerDownLeft size={13} className="shrink-0 text-cyan" />}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-2.5">
              <div className="flex items-center gap-3 ou-mono text-[10px] text-white/35">
                <span className="flex items-center gap-1">
                  <ArrowUp size={11} />
                  <ArrowDown size={11} /> navigate
                </span>
                <span className="flex items-center gap-1">
                  <CornerDownLeft size={11} /> route
                </span>
                <span>esc close</span>
              </div>
              <span className="ou-mono text-[9px] tracking-[0.14em] text-white/25">
                {results.length} / {9} SLOTS
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
