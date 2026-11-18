# OU Spatial Engine

**A self-hosted 3D spatial navigation and campus-intelligence twin for Osmania University, Hyderabad.**
Built with Next.js 14, MapLibre GL, Three.js and a hand-authored campus vector survey — **zero external map APIs, zero tile tokens, zero Google Maps.**

> Campus datum: **17.4175° N, 78.5285° E** · 26 surveyed buildings · 70-node walkway graph · 14.4 km of paths · 921 instanced trees · 4.6 km².

---

## What you get

| Layer | What it does |
| --- | --- |
| **3D campus twin** | Every building footprint is extruded from self-hosted GeoJSON and dressed with procedural hero architecture: the library's glass atrium, OUCE's mast and louvres, the Jama Masjid minarets, the convocation colonnade and the sports barrel vault. |
| **Authored Arts College** | The Arts College is a real authored model — 352k triangles of granite, teak and bronze with 110 m of façade, pishtaq, galleries and ceremonial stairs — fitted onto the surveyed footprint, meshopt-compressed to 3.2 MB and streamed from the app's own bundle. |
| **A\* routing** | Custom binary-heap A\* over a 70-node / 84-edge walkway graph with terrain, surface, lighting, crowd and accessibility weights. Step-free routing removes steps entirely. |
| **Holographic navigation** | An elevated GLSL energy ribbon with animated chevrons, a pulsing destination beacon, and a light column — all written as real vertex/fragment shaders. |
| **Real solar lighting** | NOAA solar position for Hyderabad drives sun azimuth/elevation, shadow direction, neon intensity, HUD tint and a night sky. Presets: **Dawn · Noon · Golden Hour · Cyber Night · Live**. |
| **Tactical HUD** | Glassmorphic command palette (⌘K fuzzy search over buildings, labs, rooms, hostels and gates), turn-by-turn panel with elevation profile, floor slicer, live campus pulse and telemetry. |
| **Live campus feed** | Supabase realtime `campus_alerts` channel with graceful local simulation fallback. Crowd reports feed back into routing cost. |
| **Cinematic camera** | GSAP-choreographed fly-ins, route framing, GPS snapping and a full route flythrough at 70° pitch. |

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

Production:

```bash
npm run build
npm run start
```

Quality gates:

```bash
npm run typecheck    # strict TypeScript
npm run build        # production bundle
npm run data:build   # regenerate the campus geospatial survey
```

---

## Live campus feed (optional)

The app runs fully without credentials — it falls back to a deterministic local simulation and labels itself **LOCAL FEED**.

To switch on the realtime feed:

1. Create a Supabase project.
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor — it creates the `campus_alerts` table, RLS policies, index and realtime publication.
3. Copy `.env.example` to `.env.local` and fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

4. Restart. The HUD chip flips to **SUPABASE LIVE** and inserts stream in over the realtime channel.

Reports submitted from the **Campus pulse → Report** control insert into the same table, so every visitor shares the crowd signal.

---

## Geospatial data — 100% self-authored

No third-party basemap, glyph server or routing service is contacted at runtime.

```
src/data/
  ou-buildings.geojson   # 26 extruded footprints + metadata + POIs
  ou-walkways.geojson    # 84 weighted edges / 70 nodes (roads, promenades, paths, stairs)
  ou-foliage.geojson     # green zones + 921 tree points (species, height, canopy radius)
  ou-terrain.geojson     # campus boundary, lake, contour lines
  campus-meta.json       # datum, gates, revision, counts
```

All geometry is generated from a single declarative survey script:

```bash
npm run data:build     # scripts/build-campus-data.mjs → src/data/*.geojson
```

The script validates graph reachability (70/70 nodes) before writing. See [`docs/GEOSPATIAL.md`](docs/GEOSPATIAL.md) for the schema and how to add a building or path.

> **Accuracy note:** the campus layout is a plausible, hand-authored demonstration survey — building footprints and path geometry are approximations of the real Osmania University campus, not a legal cadastral survey. Coordinates are anchored at the true campus datum. See [`docs/GEOSPATIAL.md`](docs/GEOSPATIAL.md#accuracy).

---

## Architecture

```
app/
  layout.tsx · page.tsx · globals.css
src/
  data/                     self-hosted GeoJSON survey
  lib/
    graphBuilder.ts         GeoJSON LineStrings → adjacency graph
    astarPathfinder.ts      weighted A* + route reconstruction + elevation profile
    sunCalc.ts              NOAA solar position for Hyderabad
    lighting.ts             solar elevation → full scene/HUD light rig
    mapStyle.ts             MapLibre style factory + live paint updates
    directions.ts           geometry → turn-by-turn instructions
    search.ts               fuzzy campus index (buildings, rooms, gates)
    liveBeacon.ts           Supabase feed + simulation + pulse metrics
    scene/                  Three.js modules (world, landmarks, trees, route, beacon, floors)
  shaders/
    routeBeam.vert / .frag  energy ribbon: chevrons, rails leading-edge pulse
    beaconRing.frag         holographic destination rings + scan sweep
    beaconColumn.frag       vertical light column
  components/
    canvas/                 SpatialCanvas + scene module components
    hud/                    CommandSearch · NavigationPanel · EnvironmentControls ·
                            LiveBeaconAlert · TopBar · BuildingCard · IntroOverlay
  store/useSpatialStore.ts  Zustand spatial state
supabase/schema.sql
docs/ARCHITECTURE.md · docs/GEOSPATIAL.md
```

Full technical write-up: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `⌘K` / `Ctrl K` / `/` | Command search |
| `1` `2` `3` `4` | Dawn / Noon / Golden / Night |
| `L` | Live Hyderabad time |
| `T` | Toggle 3D ↔ 2D |
| `A` | Toggle step-free routing |
| `H` | Fit campus |
| `Esc` | Close search |

---

## Performance

- One shared WebGL2 context — a single Three.js custom layer draws trees, landmarks, ribbons and beacons over MapLibre's vector basemap.
- 921 trees → **2 instanced draw calls**, with wind simulated entirely in the vertex shader.
- Shadow maps render on demand (`shadowMap.autoUpdate = false`) and only when the sun rig or scene changes.
- Renderer quality modes: **Cinematic** (2048² PCF-soft shadows, DPR ≤ 2) and **Balanced** (no shadows, DPR ≤ 1.5).
- The HUD reads throttled camera telemetry (≈9 Hz) so React never re-renders per frame.

Target: 60 fps on a mid-range 2020 laptop GPU at 1080p.

---

## Live

**https://i-am-dev-god.github.io/A-LEAP/** — served from the static export of this repo by `.github/workflows/pages.yml` on every push to `main`.

---

## Deployment

### GitHub Pages (live today)

`.github/workflows/pages.yml` runs `npm ci` → `typecheck` → `STATIC_EXPORT=1 PAGES_BASE_PATH=/A-LEAP npm run build` and publishes `out/` through `actions/deploy-pages`. No secrets required.

### Vercel

The project is a standard Next.js App Router app — import the repository in Vercel and deploy (framework preset **Next.js**, no build overrides, no environment variables required). Add the two optional Supabase environment variables in project settings if you want the live feed.

> Vercel deploys built from the Vercel dashboard need the repo authorised through *Vercel → Account Settings → Login Connections → GitHub*. Without it the API rejects repository linking, which is why the automated deploy currently targets GitHub Pages.

### Self-hosting

```bash
npm run build && npm run start   # binds 0.0.0.0:3000
```

Docker and any Node 20+ host work unchanged. There is no database, tile server or external API dependency for the core experience.

---

## Arts College model

The heritage landmark ships as an authored GLB rather than procedural geometry.

| Stage | Result |
| --- | --- |
| Drive source (`model.glb`) | 18.0 MB · 352k triangles · 12 PNG albedo maps |
| `@gltf-transform/cli optimize --compress meshopt --texture-compress webp --texture-size 1024` | 3.19 MB |
| Runtime | `GLTFLoader` + three's bundled `MeshoptDecoder` — no CDN, no decoder fetch |

The loader measures the model, fits the built mass to the surveyed 132 m × 48 m footprint, rotates it onto the building's 8° axis and nudges it north so the stair flight lands on the Fountain Plaza promenade instead of cutting the route. It streams in 900 ms after the scene mounts and rises into place over 0.85 s; the procedural heritage build stays on screen until then and remains the fallback if the model cannot load.

---

## Verified behaviour

- 260 origin→destination route assertions (5 gates × 26 buildings × step-free on/off) — all resolve, all start/end on the correct graph nodes.
- A\* cost compared against Dijkstra on representative routes — **Δ = 0.0000** (optimal).
- All 4,830 ordered node pairs routable.
- Solar model sanity-checked: noon elevation ≈ 53° in November, sunrise ≈ 06:30 IST, sunset ≈ 17:40 IST.
- `tsc --noEmit` and `next build` clean.

---

## Tech stack

Next.js 14 (App Router) · TypeScript strict · Tailwind CSS · MapLibre GL JS 4 · Three.js · GSAP · Framer Motion · Zustand · Supabase · lucide-react.

## License

MIT
