import type { CampusAlert, AlertKind, AlertSeverity, PulseMetric } from './types';
import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import { clamp } from './geo';

interface AlertSeed {
  kind: AlertKind;
  title: string;
  detail: string;
  zone: string;
  severity: AlertSeverity;
  value?: string;
}

const SEEDS: AlertSeed[] = [
  {
    kind: 'library',
    title: 'Library · Floor 2 filling up',
    detail: 'Reading hall at 82% occupancy. 46 seats open on Floor 3; digital zone available.',
    zone: 'Dr. Zakir Husain Library',
    severity: 'info',
    value: '46 seats',
  },
  {
    kind: 'wifi',
    title: 'OU-WiFi · OUCE Block B degraded',
    detail: 'Throughput at 34 Mbps on the east access points. Wired uplink being rebalanced.',
    zone: 'OUCE Block B',
    severity: 'warn',
    value: '34 Mbps',
  },
  {
    kind: 'gate',
    title: 'Main Gate · queue clearing',
    detail: 'Visitor verification is down to a 2-minute average. Use East Gate for vehicles.',
    zone: 'Main Gate',
    severity: 'info',
    value: '2 min',
  },
  {
    kind: 'crowd',
    title: 'Arts College quad at 71% capacity',
    detail: 'Post-lecture surge between 13:10 and 13:40. Fountain Plaza is the densest node.',
    zone: 'Arts College',
    severity: 'info',
    value: '71%',
  },
  {
    kind: 'event',
    title: 'Convocation rehearsal · 17:00–19:00',
    detail: 'Centenary Auditorium access limited to invited delegates. Esplanade remains open.',
    zone: 'Convocation Hall',
    severity: 'info',
  },
  {
    kind: 'safety',
    title: 'Unlit stretch near Botanical Garden',
    detail: 'Three lamp posts offline on the gravel path. Night routing avoids this segment.',
    zone: 'Botanical Garden',
    severity: 'warn',
  },
  {
    kind: 'transport',
    title: 'Campus shuttle · Library stop',
    detail: 'Next electric shuttle in 6 minutes, then every 12 minutes on the ring loop.',
    zone: 'Library Plaza',
    severity: 'info',
    value: '6 min',
  },
  {
    kind: 'library',
    title: 'Exam-season 24×7 study zone active',
    detail: 'Floor 1 reading hall opens all night. Bring your ID for after-hours access.',
    zone: 'Dr. Zakir Husain Library',
    severity: 'info',
  },
  {
    kind: 'crowd',
    title: "Students' Centre canteen queue",
    detail: 'Chai terrace wait is 9 minutes; main canteen counter 2 is moving faster.',
    zone: "Students' Centre",
    severity: 'info',
    value: '9 min',
  },
  {
    kind: 'wifi',
    title: 'Wi-Fi mesh back to nominal',
    detail: 'All 96 campus access points online. Average 118 Mbps across the core.',
    zone: 'Campus core',
    severity: 'info',
    value: '118 Mbps',
  },
];

const source = (): 'live' | 'simulated' => (isSupabaseConfigured ? 'live' : 'simulated');

function minutesAgo(mins: number): string {
  return new Date(Date.now() - mins * 60000).toISOString();
}

function seededAlerts(): CampusAlert[] {
  return SEEDS.map((seed, i) => ({
    id: `seed-${i}`,
    kind: seed.kind,
    title: seed.title,
    detail: seed.detail,
    zone: seed.zone,
    severity: seed.severity,
    value: seed.value,
    created_at: minutesAgo(3 + i * 7),
    source: isSupabaseConfigured ? 'live' : 'simulated',
  }));
}

export function simulatedAlerts(): CampusAlert[] {
  return seededAlerts();
}

/** Deterministic-ish campus pulse derived from time of day + live drift. */
export function simulatedMetrics(minutes: number): PulseMetric[] {
  const hour = minutes / 60;
  const lecturePeak = Math.exp(-((hour - 11) ** 2) / 6) + 0.65 * Math.exp(-((hour - 15) ** 2) / 5);
  const libraryPeak = Math.exp(-((hour - 16.5) ** 2) / 9);
  const dinnerPeak = Math.exp(-((hour - 20) ** 2) / 3);
  const jitter = (seed: number) => Math.sin(minutes * 0.31 + seed) * 0.5 + 0.5;

  const seatsFree = Math.round(clamp(600 - lecturePeak * 330 - libraryPeak * 240 + jitter(1) * 60, 40, 600));
  const wifi = Math.round(clamp(64 + jitter(2) * 30 + (hour < 8 || hour > 22 ? -12 : 6), 22, 99));
  const gateFlow = Math.round(clamp(18 + lecturePeak * 62 + jitter(3) * 14, 4, 120));
  const canteen = Math.round(clamp(4 + dinnerPeak * 18 + lecturePeak * 9 + jitter(4) * 4, 1, 32));
  const occupancy = Math.round(clamp(24 + lecturePeak * 58 + jitter(5) * 12, 8, 98));

  return [
    {
      id: 'seats',
      label: 'Library seats',
      value: seatsFree,
      unit: 'open',
      capacity: 600,
      trend: seatsFree > 260 ? 1 : -1,
      zone: 'Library',
    },
    {
      id: 'wifi',
      label: 'Wi-Fi quality',
      value: wifi,
      unit: '%',
      trend: wifi > 70 ? 1 : -1,
      zone: 'Campus core',
    },
    {
      id: 'gate',
      label: 'Gate flow',
      value: gateFlow,
      unit: '/min',
      trend: gateFlow > 45 ? -1 : 1,
      zone: 'Main Gate',
    },
    {
      id: 'canteen',
      label: 'Canteen wait',
      value: canteen,
      unit: 'min',
      trend: canteen > 12 ? -1 : 1,
      zone: "Students' Centre",
    },
    {
      id: 'occupancy',
      label: 'Campus load',
      value: occupancy,
      unit: '%',
      trend: occupancy > 65 ? -1 : 1,
      zone: 'Campus-wide',
    },
  ];
}

function rowToAlert(row: Record<string, unknown>): CampusAlert {
  return {
    id: String(row.id ?? `live-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    kind: (row.kind as AlertKind) ?? 'crowd',
    title: String(row.title ?? 'Campus update'),
    detail: String(row.detail ?? ''),
    zone: String(row.zone ?? 'Osmania University'),
    severity: (row.severity as AlertSeverity) ?? 'info',
    value: row.value ? String(row.value) : undefined,
    created_at: String(row.created_at ?? new Date().toISOString()),
    source: 'live',
  };
}

export interface AlertFeedResult {
  alerts: CampusAlert[];
  source: 'live' | 'simulated';
}

/** Pulls the crowdsourced campus feed; falls back to the local simulation. */
export async function fetchAlerts(): Promise<AlertFeedResult> {
  const sb = getSupabase();
  if (!sb) return { alerts: simulatedAlerts(), source: 'simulated' };
  try {
    const { data, error } = await sb
      .from('campus_alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(24);
    if (error || !data || data.length === 0) {
      return { alerts: simulatedAlerts(), source: 'simulated' };
    }
    return {
      alerts: (data as Record<string, unknown>[]).map(rowToAlert),
      source: 'live',
    };
  } catch {
    return { alerts: simulatedAlerts(), source: 'simulated' };
  }
}

/** Realtime subscription to new campus alerts. Returns an unsubscribe function. */
export function subscribeToAlerts(onAlert: (alert: CampusAlert) => void): () => void {
  const sb = getSupabase();
  if (!sb) return () => undefined;
  try {
    const channel = sb
      .channel('ou-campus-alerts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'campus_alerts' },
        (payload) => {
          if (payload.new) onAlert(rowToAlert(payload.new as Record<string, unknown>));
        }
      )
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  } catch {
    return () => undefined;
  }
}

/** Pushes a crowdsourced report; falls back to a local echo when Supabase is absent. */
export async function postAlert(input: {
  kind: AlertKind;
  title: string;
  detail: string;
  zone: string;
  severity: AlertSeverity;
  value?: string;
}): Promise<CampusAlert> {
  const local: CampusAlert = {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ...input,
    created_at: new Date().toISOString(),
    source: source(),
  };
  const sb = getSupabase();
  if (!sb) return local;
  try {
    const { data, error } = await sb.from('campus_alerts').insert(input).select().single();
    if (error || !data) return local;
    return rowToAlert(data as Record<string, unknown>);
  } catch {
    return local;
  }
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.round(diff / 60000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export const alertKindLabel: Record<AlertKind, string> = {
  wifi: 'Network',
  library: 'Library',
  gate: 'Gate',
  crowd: 'Crowd',
  event: 'Event',
  safety: 'Safety',
  transport: 'Shuttle',
};

const RANDOM_TEMPLATES: Omit<AlertSeed, 'severity'>[] = [
  {
    kind: 'crowd',
    title: 'Fountain Plaza density rising',
    detail: 'Post-lecture footfall is building around the Arts College axis. Ring road remains clear.',
    zone: 'Fountain Plaza',
    value: '64%',
  },
  {
    kind: 'transport',
    title: 'Shuttle now boarding · OUCE stop',
    detail: 'Electric shuttle 04 is at the OUCE plaza stop with 9 seats free on the ring loop.',
    zone: 'OUCE Plaza',
    value: '9 seats',
  },
  {
    kind: 'library',
    title: 'Library seat released',
    detail: '14 seats freed on Floor 2 as the afternoon cohort rotates out.',
    zone: 'Dr. Zakir Husain Library',
    value: '14 seats',
  },
  {
    kind: 'gate',
    title: 'East Gate lane open',
    detail: 'Vehicle verification lane 3 is now staffed. Expected clearance under a minute.',
    zone: 'East Gate',
    value: '<1 min',
  },
  {
    kind: 'wifi',
    title: 'Wi-Fi mesh rebalanced',
    detail: 'Access points near the Science College moved to a quieter channel — latency down.',
    zone: 'University College of Science',
    value: '22 ms',
  },
  {
    kind: 'safety',
    title: 'Lighting restored · Botanical path',
    detail: 'Two lamp posts came back online on the gravel path from Health Centre.',
    zone: 'Botanical Garden',
  },
];

/** Generates a plausible live alert for the local simulation. */
export function randomSimulatedAlert(_minutes?: number): CampusAlert | null {
  const template = RANDOM_TEMPLATES[Math.floor(Math.random() * RANDOM_TEMPLATES.length)];
  if (!template) return null;
  const severity: AlertSeverity =
    template.kind === 'safety' ? 'warn' : template.kind === 'crowd' ? 'info' : 'info';
  return {
    id: `sim-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind: template.kind,
    title: template.title,
    detail: template.detail,
    zone: template.zone,
    severity,
    value: template.value,
    created_at: new Date().toISOString(),
    source: 'simulated',
  };
}
