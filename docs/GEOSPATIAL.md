# Campus Geospatial Survey

## Conventions

- **Datum:** `17.4175° N, 78.5285° E` (Arts College axis, Osmania University, Hyderabad).
- **Local frame:** metres, `x` = east, `y` = north. Converted to WGS84 with a tangent-plane approximation:
  - `lng = 78.5285 + x / (111320 · cos(17.4175°))`
  - `lat = 17.4175 + y / 110574`
- Polygons are emitted counter-clockwise (RFC 7946 exterior rings).
- All files are `FeatureCollection` with a `metadata` block.

## Files

### `ou-buildings.geojson`
Polygon per building. Properties:

| key | meaning |
| --- | --- |
| `id`, `name`, `short`, `code` | identity + search keys |
| `category` | `heritage · academic · library · research · admin · hostel · residential · amenity · sports · health · worship · events` |
| `floors`, `height_m`, `base_m` | vertical metrics (height drives MapLibre extrusion) |
| `rot`, `w_m`, `d_m`, `footprint_m2` | footprint dimensions |
| `hero` | procedural landmark key (`arts`, `library`, `mosque`, `ouce`, `science`, `sports`, `hall`) |
| `hub`, `entrance_node`, `entrance_lng`, `entrance_lat` | routing connection |
| `aliases` | pipe-separated fuzzy-search synonyms |
| `hours`, `access`, `description` | HUD intel |
| `pois` | JSON string of `{name, floor, kind}` for rooms/labs |

### `ou-walkways.geojson`
One LineString per graph edge. Properties include `from`, `to`, `from_label`, `to_label`, `kind` (`road · promenade · path · stairs`), `surface`, `width_m`, `lit`, `crowd`, `accessible`, `steps`, `length_m`, `elev_from`, `elev_to`, `grade`, `shade`.

Edges are gently curved with a seeded bend so the network reads organically. Entrance connectors are generated automatically from each building's `hub` and door position.

### `ou-foliage.geojson`
Polygons for `lawn`, `garden`, `grove`, `turf`, `water`; Point features for every tree with `species`, `h`, `r`, `phase`, `tone`, `elev`. Trees are excluded from building footprints and the lake, and spaced ≥ 7.5 m apart.

### `ou-terrain.geojson`
Campus boundary polygon, lake polygon and 2 m marching-squares contour lines derived from the synthetic terrain field (`elev(x, y)`), used for the elevation profile and the dashed contour layer.

## Regenerating

```bash
npm run data:build
```

`scripts/build-campus-data.mjs` is the single source of truth: node network, buildings, green zones, tree scatter, contours and reachability audit. It writes all four GeoJSON files plus `campus-meta.json`.

## Adding a building

1. Append a definition to `BUILDINGS` in the generator (centre in metres, width/depth, rotation, floors, hero key optional).
2. Point `hub` at an existing node id (see `NODES`) — the entrance connector is generated on the nearest façade.
3. Add aliases and POIs.
4. `npm run data:build` — the script fails loudly if the new entrance is unreachable.
5. Optional: add a `case` in `src/lib/scene/landmarks.ts` for bespoke architecture.

## Adding a path

Add `[from, to, kind, surface, lit, crowd]` to `EDGE_DEFS`, creating nodes in `NODES` if needed. Duplicate pairs are skipped; all nodes must be reachable from `rrS` or the build exits non-zero.

## Accuracy

The survey is a **plausible, hand-authored demonstration** of the Osmania University campus core, anchored at the true campus datum. Footprints, path alignments and tree positions are approximations designed to exercise the routing and rendering engine — they are not an official or cadastral survey, and building names/POIs are illustrative. Do not use for emergency navigation.

## Licensing

All geometry is authored in this repository; no OpenStreetMap, Google, Mapbox or other third-party geodata is bundled. Rendering uses MapLibre GL (BSD-3) and Three.js (MIT).
