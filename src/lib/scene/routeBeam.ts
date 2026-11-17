import * as THREE from 'three';
import routeVert from '@/shaders/routeBeam.vert';
import routeFrag from '@/shaders/routeBeam.frag';
import { toMeters } from '../geo';
import type { Building, RouteResult } from '../types';
import type { SceneModule } from './threeWorld';

interface RibbonBuild {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  total: number;
}

function elevationAt(route: RouteResult, fraction: number): number {
  if (route.profile.length === 0) return 0;
  const target = fraction * route.distanceM;
  let best = route.profile[0];
  for (const sample of route.profile) {
    if (sample.d <= target) best = sample;
    else break;
  }
  return best.e;
}

function buildRibbon(route: RouteResult, width: number, yLift: number): RibbonBuild | null {
  if (route.coordinates.length < 2) return null;

  const control = route.coordinates.map(([lng, lat], i) => {
    const { x, y } = toMeters([lng, lat]);
    const fraction = i / Math.max(1, route.coordinates.length - 1);
    return new THREE.Vector3(x, elevationAt(route, fraction) + yLift, -y);
  });

  const curve = new THREE.CatmullRomCurve3(control, false, 'centripetal', 0.25);
  const sampleCount = THREE.MathUtils.clamp(Math.round(route.distanceM / 2.2), 32, 1200);
  const samples = curve.getPoints(sampleCount);

  const positions: number[] = [];
  const dists: number[] = [];
  const sides: number[] = [];
  const elevs: number[] = [];
  const indices: number[] = [];
  let travelled = 0;

  for (let i = 0; i < samples.length; i += 1) {
    const point = samples[i];
    const prev = samples[Math.max(0, i - 1)];
    const next = samples[Math.min(samples.length - 1, i + 1)];
    const tangent = next.clone().sub(prev);
    tangent.y = 0;
    if (tangent.lengthSq() < 1e-6) tangent.set(1, 0, 0);
    tangent.normalize();
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x);

    if (i > 0) travelled += point.distanceTo(samples[i - 1]);

    for (const s of [-1, 1]) {
      const vertex = point.clone().addScaledVector(side, (s * width) / 2);
      vertex.y = point.y - 0.18;
      positions.push(vertex.x, vertex.y, vertex.z);
      dists.push(travelled);
      sides.push(s);
      elevs.push(point.y);
    }

    if (i > 0) {
      const a = (i - 1) * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aDist', new THREE.Float32BufferAttribute(dists, 1));
  geometry.setAttribute('aSide', new THREE.Float32BufferAttribute(sides, 1));
  geometry.setAttribute('aElev', new THREE.Float32BufferAttribute(elevs, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();

  const material = new THREE.MeshBasicMaterial({ visible: false });
  const mesh = new THREE.Mesh(geometry, material);
  return { mesh, geometry, total: travelled };
}

/** Elevated holographic energy ribbon following the A* route. */
export function createRouteBeam(): SceneModule & { setProgressInstant: (v: number) => void } {
  const root = new THREE.Group();
  root.name = 'route-beam';
  root.visible = false;

  const uniforms = {
    uTime: { value: 0 },
    uTotal: { value: 1 },
    uProgress: { value: 0 },
    uIntensity: { value: 1 },
    uColorA: { value: new THREE.Color('#35f3ff') },
    uColorB: { value: new THREE.Color('#ffc46b') },
    uLift: { value: 1.9 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: routeVert,
    fragmentShader: routeFrag,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });

  let progress = 0;
  let target = 0;
  let meshes: THREE.Mesh[] = [];
  let geometries: THREE.BufferGeometry[] = [];

  const disposeRoute = () => {
    meshes.forEach((mesh) => root.remove(mesh));
    geometries.forEach((geo) => geo.dispose());
    meshes = [];
    geometries = [];
  };

  return {
    name: 'route-beam',
    root,
    setRoute(route: RouteResult | null, _destination: Building | null) {
      disposeRoute();
      if (!route || route.coordinates.length < 2) {
        root.visible = false;
        return;
      }

      const core = buildRibbon(route, 3.4, 2.1);
      const halo = buildRibbon(route, 9.0, 1.95);
      if (!core || !halo) {
        root.visible = false;
        return;
      }

      const coreMesh = new THREE.Mesh(core.geometry, material);
      coreMesh.renderOrder = 3;
      coreMesh.frustumCulled = false;

      const haloMesh = new THREE.Mesh(halo.geometry, material);
      haloMesh.renderOrder = 2;
      haloMesh.frustumCulled = false;

      geometries = [core.geometry, halo.geometry];
      meshes = [haloMesh, coreMesh];
      root.add(haloMesh, coreMesh);
      root.visible = true;

      uniforms.uTotal.value = Math.max(1, core.total);
      progress = 0;
      target = 1;
      uniforms.uProgress.value = 0;
    },
    update(dt, elapsed) {
      uniforms.uTime.value = elapsed;
      if (!root.visible) return;
      progress += (target - progress) * Math.min(1, dt * 2.4);
      if (Math.abs(target - progress) < 0.0015) progress = target;
      uniforms.uProgress.value = progress;
    },
    set3D(is3D: boolean) {
      uniforms.uLift.value = is3D ? 1.9 : 0.4;
      uniforms.uIntensity.value = is3D ? 1 : 0.8;
    },
    setProgressInstant(v: number) {
      progress = v;
      target = v;
      uniforms.uProgress.value = v;
    },
    dispose() {
      disposeRoute();
      material.dispose();
    },
  };
}
