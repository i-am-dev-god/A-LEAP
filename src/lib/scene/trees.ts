import * as THREE from 'three';
import { treePoints } from '../campusData';
import { toMeters } from '../geo';
import type { LightingState } from '../lighting';
import type { SceneModule } from './threeWorld';

const SPECIES_COLORS = ['#2f5137', '#476437', '#3c5c40', '#516b3c', '#42624a'];

function buildCanopyGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(1, 8, 6);
  const position = geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const noise =
      Math.sin(x * 5.7 + y * 3.1) * 0.1 +
      Math.cos(z * 4.3 - y * 2.2) * 0.09 +
      Math.sin((x + z) * 7.1) * 0.05;
    const scale = 1 + noise;
    position.setXYZ(i, x * scale, y * scale, z * scale);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** InstancedMesh tree field with vertex-shader wind and per-species foliage. */
export function createTreeField(): SceneModule {
  const root = new THREE.Group();
  root.name = 'trees';

  const count = treePoints.length;
  const canopyGeometry = buildCanopyGeometry();
  const canopyMaterial = new THREE.MeshLambertMaterial({
    color: '#ffffff',
    flatShading: true,
    emissive: new THREE.Color('#000000'),
  });

  const windUniforms = {
    uTime: { value: 0 },
    uWind: { value: 1 },
  };

  canopyMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWind = windUniforms.uWind;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uWind;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float phase = uTime * 1.25 + instanceMatrix[3][0] * 0.055 + instanceMatrix[3][2] * 0.045;
        float heightFactor = clamp(transformed.y + 0.6, 0.0, 1.8);
        transformed.x += sin(phase) * 0.055 * heightFactor * uWind;
        transformed.z += cos(phase * 1.31) * 0.048 * heightFactor * uWind;
        transformed.y += sin(phase * 0.7) * 0.012 * heightFactor;`
      );
  };
  canopyMaterial.customProgramCacheKey = () => 'ou-canopy-wind';

  const canopy = new THREE.InstancedMesh(canopyGeometry, canopyMaterial, count);
  canopy.castShadow = true;
  canopy.receiveShadow = true;
  canopy.frustumCulled = false;

  const trunkGeometry = new THREE.CylinderGeometry(0.34, 0.55, 1, 5);
  trunkGeometry.translate(0, 0.5, 0);
  const trunkMaterial = new THREE.MeshLambertMaterial({ color: '#3a2c22', flatShading: true });
  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, count);
  trunks.castShadow = true;
  trunks.receiveShadow = true;
  trunks.frustumCulled = false;

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();

  treePoints.forEach((tree, index) => {
    const { x: east, y: north } = toMeters([tree.lng, tree.lat]);
    const species = tree.species % SPECIES_COLORS.length;
    const trunkHeight = tree.height * (0.32 + (species === 3 ? 0.2 : 0));
    const radius = tree.radius;

    position.set(east, trunkHeight * 0.5, -north);
    quaternion.identity();
    scale.set(radius * 0.1, trunkHeight, radius * 0.1);
    matrix.compose(position, quaternion, scale);
    trunks.setMatrixAt(index, matrix);

    const squash = species === 1 ? 0.82 : species === 3 ? 1.18 : 0.96;
    position.set(east, trunkHeight + radius * 0.72, -north);
    quaternion.setFromEuler(new THREE.Euler(0, tree.phase, 0));
    scale.set(radius, radius * squash * 0.94, radius);
    matrix.compose(position, quaternion, scale);
    canopy.setMatrixAt(index, matrix);

    color.set(SPECIES_COLORS[species]);
    color.offsetHSL(0, (tree.tone - 0.5) * 0.1, (tree.tone - 0.5) * 0.09);
    canopy.setColorAt(index, color);
  });

  trunks.instanceMatrix.needsUpdate = true;
  canopy.instanceMatrix.needsUpdate = true;
  if (canopy.instanceColor) canopy.instanceColor.needsUpdate = true;

  root.add(trunks, canopy);

  const baseCanopy = new THREE.Color('#dfe7d8');

  return {
    name: 'trees',
    root,
    update(_dt, elapsed) {
      windUniforms.uTime.value = elapsed;
    },
    setLighting(lighting: LightingState) {
      const night = lighting.isNight;
      canopyMaterial.emissive.set(night ? '#07181d' : '#000000');
      canopyMaterial.emissiveIntensity = night ? 0.55 + lighting.neon * 0.7 : 0;
      canopyMaterial.color.copy(baseCanopy).multiplyScalar(night ? 0.42 : 0.94);
      trunkMaterial.color.set(night ? '#1d1712' : '#3a2c22');
      windUniforms.uWind.value = night ? 0.7 : 1.05;
      canopy.castShadow = lighting.isNight ? false : true;
      trunks.castShadow = lighting.isNight ? false : true;
    },
    set3D(is3D: boolean) {
      canopy.visible = true;
      trunks.visible = is3D;
      canopy.castShadow = is3D;
    },
    dispose() {
      canopyGeometry.dispose();
      trunkGeometry.dispose();
      canopyMaterial.dispose();
      trunkMaterial.dispose();
      canopy.dispose();
      trunks.dispose();
    },
  };
}
