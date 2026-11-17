import * as THREE from 'three';
import beaconRingFrag from '@/shaders/beaconRing.frag';
import beaconColumnFrag from '@/shaders/beaconColumn.frag';
import { toMeters } from '../geo';
import type { Building, RouteResult } from '../types';
import type { SceneModule } from './threeWorld';

const ringVertex = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const columnVertex = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

function makeRing(size: number, color: string, opacity: number) {
  const uniforms = {
    uTime: { value: 0 },
    uOpacity: { value: opacity },
    uColor: { value: new THREE.Color(color) },
    uFloorPulse: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: ringVertex,
    fragmentShader: beaconRingFrag,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const geometry = new THREE.PlaneGeometry(size, size);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.35;
  mesh.renderOrder = 4;
  return { mesh, material, uniforms, geometry };
}

/** Destination hologram: pulsing rings, a light column and a floating marker. */
export function createBeacon(): SceneModule {
  const root = new THREE.Group();
  root.name = 'beacon';
  root.visible = false;

  const mainRing = makeRing(30, '#5ff0ff', 1);
  const innerRing = makeRing(11, '#ffe6a8', 0.65);
  const startRing = makeRing(12, '#ffc46b', 0.8);
  startRing.mesh.visible = false;
  root.add(mainRing.mesh, innerRing.mesh, startRing.mesh);

  const columnUniforms = {
    uTime: { value: 0 },
    uOpacity: { value: 0.9 },
    uColor: { value: new THREE.Color('#4fe6ff') },
  };
  const columnMaterial = new THREE.ShaderMaterial({
    uniforms: columnUniforms,
    vertexShader: columnVertex,
    fragmentShader: beaconColumnFrag,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const columnGeometry = new THREE.CylinderGeometry(3.4, 3.4, 38, 28, 1, true);
  const column = new THREE.Mesh(columnGeometry, columnMaterial);
  column.position.y = 19;
  column.renderOrder = 4;
  root.add(column);

  const markerGeometry = new THREE.OctahedronGeometry(2.4, 0);
  const markerMaterial = new THREE.MeshBasicMaterial({
    color: '#9ff8ff',
    wireframe: true,
    transparent: true,
    opacity: 0.85,
    toneMapped: false,
  });
  const marker = new THREE.Mesh(markerGeometry, markerMaterial);
  marker.position.y = 22;
  root.add(marker);

  const dotGeometry = new THREE.SphereGeometry(0.9, 12, 10);
  const dotMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  const dot = new THREE.Mesh(dotGeometry, dotMaterial);
  dot.position.y = 22;
  root.add(dot);

  let destination: Building | null = null;

  return {
    name: 'beacon',
    root,
    update(dt, elapsed) {
      mainRing.uniforms.uTime.value = elapsed;
      innerRing.uniforms.uTime.value = elapsed * 1.3;
      startRing.uniforms.uTime.value = elapsed * 0.85;
      columnUniforms.uTime.value = elapsed;
      if (!root.visible) return;
      marker.rotation.y += dt * 1.2;
      marker.rotation.x += dt * 0.4;
      marker.position.y = 22 + Math.sin(elapsed * 1.8) * 1.4;
      dot.position.y = marker.position.y;
      dot.scale.setScalar(0.85 + Math.sin(elapsed * 3.4) * 0.12);
      mainRing.uniforms.uFloorPulse.value = 1;
    },
    setRoute(route: RouteResult | null, building: Building | null, _floor: number) {
      destination = building;
      if (!building) {
        root.visible = false;
        startRing.mesh.visible = false;
        return;
      }
      const { x, y } = toMeters(building.entrance);
      root.position.set(x, 0, -y);
      root.visible = true;
      innerRing.mesh.position.y = 0.5;
      column.visible = true;
      marker.visible = true;
      dot.visible = true;

      if (route && route.coordinates.length > 1) {
        const start = toMeters(route.coordinates[0]);
        startRing.mesh.position.set(start.x - root.position.x, 0.4, -start.y - root.position.z);
        startRing.mesh.visible = true;
      } else {
        startRing.mesh.visible = false;
      }
    },
    setSelection(building: Building | null) {
      if (!destination && building) {
        const { x, y } = toMeters(building.entrance);
        root.position.set(x, 0, -y);
        root.visible = true;
        mainRing.uniforms.uOpacity.value = 0.55;
      }
      if (!building) {
        root.visible = Boolean(destination);
      }
    },
    set3D(is3D: boolean) {
      column.visible = is3D;
      marker.visible = is3D;
      dot.visible = is3D;
    },
    dispose() {
      [mainRing, innerRing, startRing].forEach((ring) => {
        ring.geometry.dispose();
        ring.material.dispose();
      });
      columnGeometry.dispose();
      columnMaterial.dispose();
      markerGeometry.dispose();
      markerMaterial.dispose();
      dotGeometry.dispose();
      dotMaterial.dispose();
    },
  };
}
