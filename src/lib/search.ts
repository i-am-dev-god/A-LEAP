import { buildings, gates } from './campusData';
import { campusGraph } from './campusData';
import type { SearchEntry } from './types';

const CATEGORY_LABEL: Record<string, string> = {
  heritage: 'Heritage',
  academic: 'Academic',
  library: 'Library',
  research: 'Research',
  admin: 'Administration',
  hostel: 'Hostel',
  residential: 'Residence',
  amenity: 'Amenity',
  sports: 'Sports',
  health: 'Health',
  worship: 'Worship',
  events: 'Events',
};

function buildIndex(): SearchEntry[] {
  const entries: SearchEntry[] = [];

  for (const b of buildings) {
    entries.push({
      id: `b-${b.id}`,
      title: b.name,
      subtitle: `${CATEGORY_LABEL[b.category] ?? 'Building'} · ${b.short} · ${b.floors} floor${b.floors > 1 ? 's' : ''}`,
      type: 'building',
      buildingId: b.id,
      category: b.category,
      code: b.code,
      keywords: [
        b.name,
        b.short,
        b.code,
        b.category,
        ...b.aliases,
        ...b.pois.map((p) => p.name),
      ]
        .join(' ')
        .toLowerCase(),
    });

    for (const poi of b.pois) {
      entries.push({
        id: `p-${b.id}-${poi.floor}-${poi.name}`,
        title: poi.name,
        subtitle: `${b.short} · ${b.name} · Floor ${poi.floor}`,
        type: 'room',
        buildingId: b.id,
        floor: poi.floor,
        category: poi.kind,
        keywords: `${poi.name} ${poi.kind} ${b.name} ${b.short} ${b.aliases.join(' ')}`.toLowerCase(),
      });
    }
  }

  for (const gate of gates) {
    const node = campusGraph.nodes.get(gate.node);
    entries.push({
      id: `g-${gate.id}`,
      title: gate.name,
      subtitle: `Campus gate · ${node ? 'gate node online' : 'location unavailable'}`,
      type: 'gate',
      category: 'gate',
      keywords: `${gate.name} ${gate.aliases.join(' ')} gate entrance exit`.toLowerCase(),
    });
  }

  return entries;
}

export const searchIndex = buildIndex();

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function subsequence(needle: string, haystack: string): boolean {
  let i = 0;
  for (let j = 0; j < haystack.length && i < needle.length; j += 1) {
    if (haystack[j] === needle[i]) i += 1;
  }
  return i === needle.length;
}

export function scoreEntry(query: string, entry: SearchEntry): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;

  const title = entry.title.toLowerCase();
  const haystack = `${title} ${entry.subtitle.toLowerCase()} ${entry.keywords}`;
  const tokens = q.split(/\s+/).filter(Boolean);

  let score = 0;
  for (const token of tokens) {
    if (title === token) score += 240;
    else if (title.startsWith(token)) score += 160;
    else if (new RegExp(`\\b${escapeRegExp(token)}`).test(haystack)) score += 92;
    else if (haystack.includes(token)) score += 48;
    else if (token.length > 2 && subsequence(token, title)) score += 18;
    else score -= 55;
  }

  if (title.includes(q)) score += 180;
  if (entry.code?.toLowerCase() === q) score += 280;
  if (entry.type === 'building') score += 12;
  if (entry.type === 'room' && score > 0) score += 4;
  return score;
}

export function searchCampus(query: string, limit = 9): SearchEntry[] {
  const q = query.trim();
  if (!q) {
    const featured = ['artscollege', 'library', 'ouce', 'nizam', 'convocation'];
    return featured
      .map((id) => searchIndex.find((e) => e.id === `b-${id}`))
      .filter((e): e is SearchEntry => Boolean(e));
  }
  return searchIndex
    .map((entry) => ({ entry, score: scoreEntry(q, entry) }))
    .filter((r) => r.score > 20)
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
    .slice(0, limit)
    .map((r) => r.entry);
}

export function categoryLabel(category: string): string {
  return CATEGORY_LABEL[category] ?? category;
}
