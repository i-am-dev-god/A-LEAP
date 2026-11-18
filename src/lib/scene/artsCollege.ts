import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import artsModelUrl from '@/data/arts-college.glb';
import { toMeters } from '../geo';
import type { LightingState } from '../lighting';
import type { Building } from '../types';

/**
 * Arts College — authored model.
 *
 * The GLB is a 110 m × 72 m survey-grade granite model with the ceremonial
 * stair flight on its +Z face. It is authored axis-aligned in metres, y-up,
 * which matches the campus frame once the building's 8° rotation is applied.
 *
 * The file shipped here is the optimised build of the Drive source
 * (`model.glb`, 18 MB): meshopt-compressed geometry, quantised attributes and
 * 1024 px WebP albedo maps, 3.2 MB total. Both extensions are decoded in the
 * browser by three's bundled MeshoptDecoder — no CDN, no external service.
 */

/** Share of the model's depth occupied by the building itself (rest is stairs). */
const BUILT_MASS_SHARE = 0.82;

export interface FittedLandmark {
  group: THREE.Group;
  materials: THREE.MeshStandardMaterial[];
  geometries: THREE.BufferGeometry[];
  textures: THREE.Texture[];
}

function collect(gltf: { scene: THREE.Group }): Omit<FittedLandmark, 'group'> {
  const materials: THREE.MeshStandardMaterial[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const textures = new Set<THREE.Texture>();

  gltf.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;

    mesh.castShadow = true;
    mesh.receiveShadow = true;
    geometries.push(mesh.geometry);

    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const entry of list) {
      const material = entry as THREE.MeshStandardMaterial;
      if (!material || materials.includes(material)) continue;
      material.envMapIntensity = 0.85;
      materials.push(material);

      for (const key of [
        'map',
        'normalMap',
        'roughnessMap',
        'metalnessMap',
        'aoMap',
        'emissiveMap',
      ] as const) {
        const texture = material[key] as THREE.Texture | null | undefined;
        if (texture) {
          texture.anisotropy = 4;
          textures.add(texture);
        }
      }
    }
  });

  return { materials, geometries, textures: [...textures] };
}

/** Loads the model and fits it onto the surveyed Arts College footprint. */
export async function loadArtsCollege(building: Building): Promise<FittedLandmark> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  const gltf = await loader.loadAsync(artsModelUrl);
  const model = gltf.scene;

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const modelCentre = box.getCenter(new THREE.Vector3());

  const scaleByWidth = building.w_m / Math.max(1, size.x);
  const scaleByDepth = building.d_m / Math.max(1, size.z * BUILT_MASS_SHARE);
  const scale = THREE.MathUtils.clamp((scaleByWidth + scaleByDepth) / 2, 0.6, 1.7);

  const centre = toMeters(building.centroid);
  const entrance = toMeters(building.entrance);

  const pivot = new THREE.Group();
  pivot.name = 'arts-college-model';
  pivot.position.set(centre.x, 0.08, -centre.y);
  pivot.rotation.y = THREE.MathUtils.degToRad(building.rot);

  model.scale.setScalar(scale);
  model.position.set(-modelCentre.x * scale, -box.min.y * scale, -modelCentre.z * scale);
  pivot.add(model);

  // The stair flight lands on the fountain-side plaza; nudge the model north so
  // the flight stops at the promenade instead of cutting through the route.
  const halfDepth = ((box.max.z - box.min.z) / 2) * scale;
  const plazaEdge = Math.max(14, Math.abs(entrance.y - centre.y) - 0.6);
  if (halfDepth > plazaEdge) model.position.z -= halfDepth - plazaEdge;

  return { group: pivot, ...collect(gltf) };
}

/** Warm heritage uplighting once the sun is down. */
export function applyLandmarkLighting(materials: THREE.MeshStandardMaterial[], lighting: LightingState): void {
  const night = lighting.isNight;
  for (const material of materials) {
    if (!material.emissive) continue;
    material.emissive.set(night ? '#4a3118' : '#000000');
    material.emissiveIntensity = night ? 0.55 : 0;
    material.needsUpdate = false;
  }
}

export function disposeLandmark(landmark: FittedLandmark): void {
  landmark.geometries.forEach((geometry) => geometry.dispose());
  landmark.materials.forEach((material) => material.dispose());
  landmark.textures.forEach((texture) => texture.dispose());
}
