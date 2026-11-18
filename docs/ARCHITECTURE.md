# OU Spatial Engine — Architecture

## 1. Rendering stack

The viewport is **one MapLibre map** with a **single Three.js custom layer** (`ou-three-world`) added on top of the vector basemap. Sharing one WebGL2 context keeps state predictable and avoids the cost of a second renderer or canvas.

```
MapLibre Map
├── self-hosted GeoJSON sources (buildings, walkways, foliage, terrain, survey grid)
├── vector layers (ground, water, greenery, contours, roads, paths, stairs, extrusions, outlines)
└── custom layer "ou-three-world"   ← Three.js scene (single renderer)
    ├── shadow catcher (ShadowMaterial)
    ├── tree field          (2 InstancedMesh draw calls, 921 trees)
    ├── landmark models     (7 hero buildings, procedural architecture + window instances)
    ├── route beam          (GLSL ribbon from A* geometry)
    ├── destination beacon  (ring + column shaders)
    └── floor guide         (floor-stack line loops for the selected building)
```

### Coordinate bridge

Campus geometry is authored in a local tangent plane in **metres** relative to the datum `17.4175° N, 78.5285° E` (`x` = east, `y` = north). Three.js space is `x` = east, `y` = up, `z` = south, so a local point maps to `(x, altitude, -north)`.

The scene is placed onto the globe using MapLibre's mercator model transform:

```ts
const merc = MercatorCoordinate.fromLngLat([DATUM.lng, DATUM.lat], 0);
// translate = (merc.x, merc.y, merc.z), scale = merc.meterInMercatorCoordinateUnits()

const projection = mapProjectionMatrix
  .multiply(new Matrix4().makeTranslation(tx, ty, tz))
  .scale(new Vector3(s, -s, s))
  .multiply(new Matrix4().makeRotationX(Math.PI / 2));

camera.projectionMatrix = projection;
renderer.resetState();
renderer.render(scene, camera);
```

That matrix chain maps `(east, up, south)` → mercator `(tx + sx, ty + sz, tz + sy)` — i.e. altitude becomes mercator `z`, south becomes mercator `y`, and clip space stays identical to MapLibre's, so Three.js depth-tests correctly against extruded buildings.

`renderer.autoClear = false` preserves the basemap; `resetState()` restores GL state that MapLibre expects each frame.

## 2. Walking graph + A\*

`ou-walkways.geojson` stores one weighted LineString per edge. `graphBuilder.ts` turns shared endpoints into nodes and constructs `adjacency`, `edges`, `nodes`.

Edge cost (`astarPathfinder.ts`):

```
cost = length
     × surfaceFactor(paver 1.00, concrete 0.98, asphalt 1.06, gravel 1.16)
     × (1 + crowd × 1.7 × liveCrowd)          // live campus occupancy
     × (1 + grade × 4.5)  uphill / (1 + |grade| × 1.2) downhill
     × (night && !lit ? 1.75 : 1)
     × stairs penalty 1.20
     × road sharing 1.03
```

`stepFree` returns `Infinity` for any edge without `accessible: true` (steps). The heuristic is straight-line haversine distance, admissible because every edge cost ≥ its geometric length. A binary min-heap with lazy deletion keeps the search near-instant (84 edges → sub-millisecond).

On success the path is reconstructed into oriented geometry, cumulative elevation profile, ascent/descent, unlit metres and stair count. `directions.ts` converts bearing changes into human instructions, merging short straight segments and naming the next junction or landmark.

## 3. Solar + lighting

`sunCalc.ts` implements the NOAA solar position algorithm (Julian century, geometric mean longitude/anomaly, equation of centre, apparent longitude, obliquity, equation of time, hour angle, refraction). Hyderabad wall-clock minutes are converted to a UTC instant with a +05:30 offset, so the rig works in any browser timezone.

`lighting.ts` samples a colour/intensity LUT by solar elevation (astronomical night → twilight → golden → noon) and produces a complete `LightingState`: sky, ground, water, lawn, road, outlines, sun colour/intensity, ambient, fog, neon, exposure, star opacity and building palette.

The state feeds:

- `map.setLight` + per-layer paint updates in place (no style reload).
- Three.js directional sun/moon light with cascade-free orthographic shadow camera, hemisphere + ambient fill, two neon point lights at night, fog density and tone-mapping exposure.
- CSS atmosphere: sun glow positioned by `azimuth − camera bearing`, sky/ground gradients, stars, vignette.

Night switches the beacon and window emissives on and turns the shadow contribution down without changing geometry.

## 4. Shaders

**`routeBeam.vert`** — lifts the ribbon above terrain, adds low-frequency undulation along arc length and a centre camber. Attributes: `aDist` (metres along route), `aSide` (−1…1), `aElev`.

**`routeBeam.frag`** — reveal clip by `uProgress`, origin→destination gradient, feathered lateral edge, two edge rails, travelling chevrons (`fract(dist/spacing − time)`), a leading-edge flare and an elevation-cooled tint. Additive blending for the hologram look.

**`beaconRing.frag`** — three expanding range pulses, inner reticle, rotating scan sweep, cardinal ticks and a core glow, all derived from planar UV radius/angle.

**`beaconColumn.frag`** — vertical alpha fade with travelling bands and a soft horizontal edge.

## 5. State

`useSpatialStore.ts` (Zustand) holds environment (minutes, preset, 3D, quality), navigation (origin, destination, route, steps, step-free, floor), selection, live feed, telemetry and derived `lighting` via `useLighting()`. Camera requests are nonce-based so HUD components never need a map reference.

Route planning is a store action: it reads current environment (night flag from the solar model, crowd from live metrics), runs A\*, builds directions and updates state. Changing origin, step-free mode or destination re-plans immediately.

## 6. Failure modes

- WebGL context failure → full-screen explanation with retry, no blank page.
- Style/3D boot timeout (14 s) → explicit failure message.
- Supabase unreachable/unconfigured → deterministic local simulation, labelled in the HUD.
- Geolocation denied → stays on the selected origin and surfaces a toast.
- Step-free route impossible → explicit error card with a hint, never a silent failure.

## 7. Performance budget

| Item | Budget |
| --- | --- |
| Trees | 921 instances, 2 draw calls |
| Hero buildings | 7 groups, ~120 meshes, merged by material |
| Window emissives | 1 InstancedMesh per hero |
| Shadows | 2048², on-demand only |
| HUD updates | camera telemetry ~9 Hz, metrics 24 s |
| Data | ~420 KB raw GeoJSON, bundled as JSON modules (lazy chunked with the map) |


---

## Authored landmark: Arts College

`src/data/arts-college.glb` is an offline-processed asset, not a runtime download.

1. **Source** — `model.glb` from Google Drive: 18.0 MB, 9 nodes / 9 meshes, 352,372 vertices, 13 materials, 12 PNG albedo maps, authored y-up in metres with the ceremonial stairs on +Z.
2. **Optimise** — `npx gltf-transform optimize ... --compress meshopt --texture-compress webp --texture-size 1024` produces 3.19 MB: meshopt-compressed buffers (`EXT_meshopt_compression`), quantised attributes (`KHR_mesh_quantization`), 1024 px WebP maps (`EXT_texture_webp`).
3. **Ship** — webpack `asset/resource` emits it as `_next/static/media/arts-college.<hash>.glb`; Next prefixes the URL with the deployment `basePath`, so the same import works at `/` on Vercel and `/A-LEAP/` on GitHub Pages.
4. **Decode** — `GLTFLoader.setMeshoptDecoder(MeshoptDecoder)` uses the decoder bundled inside `three` (WASM embedded as base64), so the page makes exactly one request for the model and no third-party calls.
5. **Fit** — `src/lib/scene/artsCollege.ts` measures the `Box3`, averages the width-fit (132 m) and built-mass depth-fit (48 m ÷ 0.82 of the model depth) to get a uniform scale ≈ 1.0, centres it on the surveyed centroid, applies the building's 8° rotation, and shifts north by the stair overhang so the flight stops at the promenade at 33 m south.
6. **Swap** — the procedural Arts College is built first and removed only when the model resolves; lighting is re-applied to its `MeshStandardMaterial`s (warm emissive uplighting after dark) and `markShadowsDirty()` re-bakes the static 2048² shadow map. Failures are caught and leave the procedural building in place.
