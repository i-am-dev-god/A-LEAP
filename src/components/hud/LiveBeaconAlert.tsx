'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  Wifi,
  BookOpen,
  DoorOpen,
  Users,
  CalendarDays,
  ShieldAlert,
  Bus,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  RadioTower,
  Radio,
  ArrowUpRight,
  ArrowDownRight,
  Send,
} from 'lucide-react';
import { useSpatialStore } from '@/store/useSpatialStore';
import { alertKindLabel, timeAgo } from '@/lib/liveBeacon';
import type { AlertKind, PulseMetric } from '@/lib/types';
import { buildingsById } from '@/lib/campusData';

const KIND_ICON: Record<AlertKind, typeof Wifi> = {
  wifi: Wifi,
  library: BookOpen,
  gate: DoorOpen,
  crowd: Users,
  event: CalendarDays,
  safety: ShieldAlert,
  transport: Bus,
};

function severityColor(severity: string) {
  if (severity === 'critical') return 'text-ember';
  if (severity === 'warn') return 'text-amber';
  return 'text-mint';
}

function MetricTile({ metric }: { metric: PulseMetric }) {
  const good = metric.trend >= 0;
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-2 py-1.5">
      <p className="ou-mono text-[13px] leading-none text-white/90">
        {metric.value}
        <span className="ml-0.5 text-[8px] text-white/35">{metric.unit}</span>
      </p>
      <div className="mt-1 flex items-center justify-between gap-1">
        <p className="truncate text-[8px] uppercase tracking-[0.1em] text-white/30">{metric.label}</p>
        {good ? (
          <ArrowUpRight size={9} className="shrink-0 text-mint" />
        ) : (
          <ArrowDownRight size={9} className="shrink-0 text-amber" />
        )}
      </div>
    </div>
  );
}

export default function LiveBeaconAlert() {
  const alerts = useSpatialStore((s) => s.alerts);
  const metrics = useSpatialStore((s) => s.metrics);
  const feedSource = useSpatialStore((s) => s.feedSource);
  const feedOpen = useSpatialStore((s) => s.feedOpen);
  const setFeedOpen = useSpatialStore((s) => s.setFeedOpen);
  const refreshFeed = useSpatialStore((s) => s.refreshFeed);
  const feedLoading = useSpatialStore((s) => s.feedLoading);
  const reportCrowd = useSpatialStore((s) => s.reportCrowd);
  const selectedBuildingId = useSpatialStore((s) => s.selectedBuildingId);
  const hasRoute = useSpatialStore((s) => Boolean(s.route));
  const [reporting, setReporting] = useState(false);

  const zoneLabel = buildingsById.get(selectedBuildingId ?? 'artscollege')?.name ?? 'Arts College';

  const [severityFilter, setSeverityFilter] = useState<'all' | 'warn'>('all');
  const visibleAlerts = alerts
    .filter((alert) => (severityFilter === 'all' ? true : alert.severity !== 'info'))
    .slice(0, 12);

  return (
    <div
      className={`pointer-events-none absolute bottom-3 right-3 z-30 w-[330px] max-w-[calc(100vw-1.5rem)] md:bottom-5 md:right-5 md:w-[344px] ${
        hasRoute ? 'hidden md:block' : ''
      }`}
    >
      <AnimatePresence>
        {feedOpen ? (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="relative overflow-hidden rounded-2xl glass"
          >
            <div className="ou-corner ou-corner--tl" />
            <header className="flex items-center justify-between gap-2 px-3.5 pb-2 pt-3">
              <div className="flex items-center gap-2">
                <span className="relative grid h-6 w-6 place-items-center rounded-md border border-cyan/25 bg-cyan/10">
                  <Activity size={12} className="text-cyan" />
                  <span className="absolute inset-0 rounded-md ou-anim-pulse border border-cyan/10" />
                </span>
                <div>
                  <p className="ou-eyebrow">Campus pulse</p>
                  <p className="ou-mono text-[9px] text-white/35">
                    {feedSource === 'live' ? 'supabase · realtime' : 'local simulation'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSeverityFilter(severityFilter === 'all' ? 'warn' : 'all')}
                  className={`rounded-md border px-1.5 py-1 ou-mono text-[8px] uppercase tracking-[0.1em] transition ${
                    severityFilter === 'warn'
                      ? 'border-amber/50 bg-amber/10 text-amber'
                      : 'border-white/10 text-white/40 hover:text-white'
                  }`}
                  title="Filter critical signals"
                >
                  {severityFilter === 'warn' ? 'Alerts' : 'All'}
                </button>
                <button
                  type="button"
                  onClick={() => void refreshFeed()}
                  className="rounded-md border border-white/10 p-1 text-white/40 transition hover:text-cyan"
                  aria-label="Refresh feed"
                >
                  <RefreshCw size={11} className={feedLoading ? 'ou-anim-spin' : ''} />
                </button>
                <button
                  type="button"
                  onClick={() => setFeedOpen(false)}
                  className="rounded-md border border-white/10 p-1 text-white/40 transition hover:text-white"
                  aria-label="Collapse campus pulse"
                >
                  <ChevronDown size={12} />
                </button>
              </div>
            </header>

            <div className="grid grid-cols-5 gap-1 px-3 pb-2.5">
              {metrics.map((metric) => (
                <MetricTile key={metric.id} metric={metric} />
              ))}
            </div>

            <div className="mx-3 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            <div className="ou-scroll max-h-[190px] overflow-y-auto px-2 py-1.5">
              {visibleAlerts.length === 0 && (
                <p className="px-2 py-4 text-center text-[11px] text-white/35">No signals right now.</p>
              )}
              {visibleAlerts.map((alert) => {
                const Icon = KIND_ICON[alert.kind] ?? Activity;
                return (
                  <div
                    key={alert.id}
                    className="group flex gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-white/[0.03]"
                  >
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[0.03]">
                      <Icon size={12} className={severityColor(alert.severity)} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-1.5">
                        <p className="min-w-0 flex-1 truncate text-[11px] text-white/85">{alert.title}</p>
                        {alert.value && (
                          <span className="ou-mono shrink-0 text-[9px] text-mint">{alert.value}</span>
                        )}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-white/40">
                        {alert.detail}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2 ou-mono text-[8px] uppercase tracking-[0.1em] text-white/25">
                        <span>{alertKindLabel[alert.kind]}</span>
                        <span className="text-white/15">·</span>
                        <span className="truncate">{alert.zone}</span>
                        <span className="ml-auto shrink-0">{timeAgo(alert.created_at)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <footer className="border-t border-white/[0.07] px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="ou-mono truncate text-[9px] text-white/30">
                  {feedSource === 'live' ? 'Live campus feed' : 'Simulated · connect Supabase for live'}
                </p>
                <button
                  type="button"
                  onClick={() => setReporting(!reporting)}
                  className="flex items-center gap-1 rounded-md border border-cyan/25 bg-cyan/[0.07] px-2 py-1 text-[9px] uppercase tracking-[0.1em] text-cyan transition hover:bg-cyan/15"
                >
                  <Send size={9} /> Report
                </button>
              </div>
              {reporting && (
                <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.02] p-2">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-white/35">
                    Crowd level · {zoneLabel}
                  </p>
                  <div className="mt-1.5 grid grid-cols-3 gap-1">
                    {[
                      { label: 'Light', level: 0.25 },
                      { label: 'Moderate', level: 0.55 },
                      { label: 'Heavy', level: 0.82 },
                    ].map((option) => (
                      <button
                        key={option.label}
                        type="button"
                        onClick={() => {
                          void reportCrowd(zoneLabel, option.level);
                          setReporting(false);
                        }}
                        className="rounded-md border border-white/10 bg-white/[0.03] py-1.5 text-[9px] text-white/65 transition hover:border-cyan/40 hover:text-white"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </footer>
          </motion.section>
        ) : (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            onClick={() => setFeedOpen(true)}
            className="pointer-events-auto flex items-center gap-2 rounded-xl glass px-3 py-2 text-left transition hover:border-cyan/40"
          >
            {feedSource === 'live' ? <RadioTower size={13} className="text-mint" /> : <Radio size={13} className="text-cyan" />}
            <span>
              <span className="block ou-eyebrow">Campus pulse</span>
              <span className="ou-mono text-[10px] text-white/50">{alerts.length} signals · open</span>
            </span>
            <ChevronUp size={13} className="ml-auto text-white/40" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
