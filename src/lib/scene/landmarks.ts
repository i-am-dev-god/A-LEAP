import * as THREE from 'three';
import { buildings } from '../campusData';
import { toMeters } from '../geo';
import type { Building } from '../types';
import type { LightingState } from '../lighting';
import { applyPaletteLighting, createPalette, type Palette } from './materials';
import type { SceneModule } from './threeWorld';

const DEG = Math.PI / 180;

function shapeFrom(points: [number, number][]): THREE.Shape {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => {
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();
  return shape;
}

function extrude(points: [number, number][], height: number, material: THREE.Material): THREE.Mesh {
  const geometry = new THREE.ExtrudeGeometry(shapeFrom(points), {
    depth: height,
    bevelEnabled: false,
    curveSegments: 3,
  });
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function expand(points: [number, number][], amount: number): [number, number][] {
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
  return points.map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return [x + (dx / len) * amount, y + (dy / len) * amount];
  });
}

interface WindowSpec {
  x: number;
  y: number;
  z: number;
  rotY: number;
  color: THREE.Color;
}

const WARM = ['#ffd9a0', '#ffc477', '#ffe9c7', '#9fe8ff', '#0b1a24'];

function windowSpecs(building: Building): WindowSpec[] {
  const pts = building.polygon.slice(0, -1).map(([lng, lat]) => toMeters([lng, lat]));
  const floorH = building.height_m / Math.max(1, building.floors);
  const specs: WindowSpec[] = [];
  let seed = 7;

  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length < 9) continue;
    const ux = dx / length;
    const uy = dy / length;
    const nx = uy;
    const ny = -ux;
    const rotY = Math.atan2(nx, -ny);
    const count = Math.max(1, Math.floor((length - 5) / 4.6));

    for (let floor = 0; floor < building.floors; floor += 1) {
      const y = 1.5 + floor * floorH + floorH * 0.46;
      if (y > building.height_m - 1.4) continue;
      for (let k = 0; k < count; k += 1) {
        const t = (k + 0.5) / count;
        const px = a.x + dx * t + nx * 0.92;
        const py = a.y + dy * t + ny * 0.92;
        seed = (seed * 1103515245 + 12345) % 2147483647;
        const pick = WARM[seed % WARM.length];
        specs.push({
          x: px,
          y,
          z: -py,
          rotY,
          color: new THREE.Color(pick),
        });
      }
    }
  }
  return specs;
}

function addWindows(root: THREE.Group, building: Building, palette: Palette): void {
  const specs = windowSpecs(building);
  if (specs.length === 0) return;
  const geometry = new THREE.PlaneGeometry(2.3, 1.7);
  const mesh = new THREE.InstancedMesh(geometry, palette.window, specs.length);
  mesh.name = `windows-${building.id}`;
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);

  specs.forEach((spec, i) => {
    position.set(spec.x, spec.y, spec.z);
    quaternion.setFromEuler(new THREE.Euler(0, spec.rotY, 0));
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(i, matrix);
    mesh.setColorAt(i, spec.color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  root.add(mesh);
}

export function createLandmarks(): SceneModule {
  const root = new THREE.Group();
  root.name = 'landmarks';
  const palette = createPalette();
  const disposables: THREE.BufferGeometry[] = [];

  for (const b of buildings) {
    const centre = toMeters(b.centroid);
    // absolute campus metres — the same frame the detail helpers place into
    const pts = b.polygon.slice(0, -1).map(([lng, lat]) => {
      const p = toMeters([lng, lat]);
      return [p.x, p.y] as [number, number];
    });
    const outward = expand(pts, 0.5);
    const group = new THREE.Group();

    // plinth
    const plinth = extrude(expand(outward, 1.2), 1.5, palette.stoneDark);
    group.add(plinth);

    // main mass — sized to swallow the MapLibre extrusion beneath it
    const wall = extrude(outward, b.height_m + 1.1, palette.stone);
    group.add(wall);

    // crisply outlined roof line
    const edgeGeo = new THREE.EdgesGeometry(wall.geometry, 32);
    disposables.push(edgeGeo);
    const edges = new THREE.LineSegments(edgeGeo, palette.edge);
    group.add(edges);

    const roofY = b.height_m + 1.1;
    const depth = b.d_m / 2;
    const width = b.w_m / 2;

    const place = (lx: number, ly: number): [number, number] => {
      const rad = b.rot * DEG;
      return [
        centre.x + lx * Math.cos(rad) - ly * Math.sin(rad),
        centre.y + lx * Math.sin(rad) + ly * Math.cos(rad),
      ];
    };

    const addCylinder = (
      radiusTop: number,
      radiusBottom: number,
      height: number,
      lx: number,
      ly: number,
      y: number,
      material: THREE.Material,
      segments = 20
    ) => {
      const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments);
      disposables.push(geo);
      const mesh = new THREE.Mesh(geo, material);
      const [wx, wy] = place(lx, ly);
      mesh.position.set(wx, y, -wy);
      mesh.rotation.y = b.rot * DEG;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };

    const addBox = (
      w: number,
      h: number,
      d: number,
      lx: number,
      ly: number,
      y: number,
      material: THREE.Material
    ) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      disposables.push(geo);
      const mesh = new THREE.Mesh(geo, material);
      const [wx, wy] = place(lx, ly);
      mesh.position.set(wx, y, -wy);
      mesh.rotation.y = b.rot * DEG;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };

    const addDome = (radius: number, lx: number, ly: number, y: number, material: THREE.Material) => {
      const geo = new THREE.SphereGeometry(radius, 26, 14, 0, Math.PI * 2, 0, Math.PI / 2);
      disposables.push(geo);
      const mesh = new THREE.Mesh(geo, material);
      const [wx, wy] = place(lx, ly);
      mesh.position.set(wx, y, -wy);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };

    if (!b.hero) {
      // parapet + rooftop plant so every block reads as built architecture
      const slabGeo = new THREE.BoxGeometry(b.w_m + 1.5, 0.9, b.d_m + 1.5);
      disposables.push(slabGeo);
      const slab = new THREE.Mesh(slabGeo, palette.roof);
      slab.position.set(centre.x, roofY + 0.45, -centre.y);
      slab.rotation.y = b.rot * DEG;
      slab.castShadow = true;
      slab.receiveShadow = true;
      group.add(slab);

      addBox(b.w_m * 0.28, 2.4, b.d_m * 0.24, b.w_m * 0.16, b.d_m * 0.1, roofY + 1.2, palette.metal);
      addBox(b.w_m * 0.16, 1.6, b.d_m * 0.14, -b.w_m * 0.22, -b.d_m * 0.16, roofY + 0.8, palette.metal);
    } else {
    switch (b.hero) {
      case 'arts': {
        // drum + great dome + finial
        addCylinder(14, 15.5, 6.5, 0, 0, roofY + 3.2, palette.lime, 28);
        addDome(13.8, 0, 0, roofY + 6.4, palette.lime);
        addCylinder(1.1, 1.6, 3.2, 0, 0, roofY + 20.4, palette.copper, 10);
        addDome(1.15, 0, 0, roofY + 21.9, palette.copper);
        // corner chhatris
        for (const sx of [-1, 1]) {
          for (const sy of [-1, 1]) {
            addCylinder(2.8, 3.2, 2.6, sx * (width - 4.5), sy * (depth - 4.5), roofY + 1.3, palette.stoneWarm, 12);
            addDome(3.0, sx * (width - 4.5), sy * (depth - 4.5), roofY + 2.6, palette.lime);
          }
        }
        // south colonnade
        for (let i = 0; i < 10; i += 1) {
          const lx = -width * 0.72 + (i / 9) * width * 1.44;
          addCylinder(0.65, 0.8, 7.2, lx, -depth - 2.6, 4.4, palette.stoneWarm, 10);
        }
        // grand steps
        for (let s = 0; s < 5; s += 1) {
          addBox(width * 1.3 - s * 2.4, 0.42, 1.5 + s * 1.2, 0, -depth - 4.4 - s * 0.65, 0.24 + s * 0.42, palette.stoneDark);
        }
        break;
      }
      case 'library': {
        // glass daylight atrium over the reading hall
        addBox(17, b.height_m * 0.9, 12, 0, 0, b.height_m * 0.52, palette.glass);
        addBox(b.w_m * 1.06, 0.7, b.d_m * 1.06, 0, 0, roofY + 0.35, palette.roof);
        addBox(b.w_m * 0.55, 0.5, b.d_m * 0.55, 0, 0, roofY + 1.1, palette.metal);
        for (let i = -3; i <= 3; i += 1) {
          addBox(0.35, 4.5, b.d_m * 0.92, i * 7.2, 0, roofY + 2.4, palette.metal);
        }
        break;
      }
      case 'mosque': {
        addCylinder(9, 10, 5, 0, 0, roofY + 2.5, palette.lime, 22);
        addDome(9.2, 0, 0, roofY + 5, palette.lime);
        for (const sx of [-1, 1]) {
          addCylinder(1.5, 2.1, 24, sx * (width - 1.5), depth - 2, 12, palette.lime, 14);
          addCylinder(2.6, 2.6, 0.6, sx * (width - 1.5), depth - 2, 18.5, palette.copper, 14);
          addDome(1.9, sx * (width - 1.5), depth - 2, 24, palette.copper);
        }
        addBox(6.5, 8.5, 2.2, 0, -depth - 1.2, 4.25, palette.stoneWarm);
        break;
      }
      case 'ouce': {
        addBox(26, 5.5, 18, 4, 0, roofY + 2.75, palette.roof);
        addCylinder(0.3, 0.45, 22, width - 8, depth - 10, roofY + 15, palette.metal, 8);
        const beacon = new THREE.Mesh(
          new THREE.SphereGeometry(1.1, 12, 8),
          new THREE.MeshBasicMaterial({ color: '#ff5f6d', toneMapped: false })
        );
        const [bx, by] = place(width - 8, depth - 10);
        beacon.position.set(bx, roofY + 26.5, -by);
        group.add(beacon);
        for (let i = 0; i < 7; i += 1) {
          addBox(44, 3.4, 0.5, 6, -depth - 0.4 - i * 0.1, 8 + i * 3.6, palette.metal);
        }
        break;
      }
      case 'science': {
        addBox(18, 4, 14, 0, 0, roofY + 2, palette.roof);
        for (let i = -2; i <= 2; i += 1) {
          addBox(3.2, 2.2, 3.2, i * 9, depth - 8, roofY + 1.1, palette.metal);
        }
        break;
      }
      case 'sports': {
        const geo = new THREE.CylinderGeometry(b.w_m * 0.5, b.w_m * 0.5, b.d_m * 0.92, 22, 1, true, 0, Math.PI);
        disposables.push(geo);
        const roof = new THREE.Mesh(geo, palette.roof);
        geo.rotateZ(Math.PI / 2);
        roof.position.set(centre.x, roofY + 2.2, -centre.y);
        roof.rotation.y = b.rot * DEG;
        roof.castShadow = true;
        group.add(roof);
        break;
      }
      case 'hall': {
        for (let i = 0; i < 8; i += 1) {
          const lx = -width * 0.8 + (i / 7) * width * 1.6;
          addCylinder(0.7, 0.9, 7.6, lx, -depth - 2.2, 4.3, palette.stoneWarm, 10);
        }
        addBox(b.w_m * 0.9, 0.9, 5.6, 0, -depth - 2.3, 8.4, palette.stoneWarm);
        addBox(12, 0.6, 9, 0, 0, roofY + 0.3, palette.roof);
        break;
      }
      default:
        break;
    }
    }

    addWindows(group, b, palette);
    root.add(group);
  }

  let windowMaterials: THREE.MeshBasicMaterial[] = [];
  root.traverse((obj) => {
    if (obj instanceof THREE.InstancedMesh && obj.material === palette.window) {
      windowMaterials.push(palette.window);
    }
  });

  return {
    name: 'landmarks',
    root,
    setLighting(lighting: LightingState) {
      applyPaletteLighting(palette, lighting);
      palette.window.opacity = lighting.isNight ? 0.9 : 0.12;
      palette.glass.emissiveIntensity = 0.4 + lighting.neon * 1.1;
    },
    set3D(is3D: boolean) {
      root.visible = true;
      palette.window.opacity = is3D ? palette.window.opacity : 0.4;
    },
    update(_dt, elapsed) {
      // subtle breathing on the entrance markers/edge glow
      palette.edge.opacity = 0.28 + Math.sin(elapsed * 1.2) * 0.06 + (palette.window.opacity > 0.5 ? 0.3 : 0);
    },
    dispose() {
      disposables.forEach((geo) => geo.dispose());
      root.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.geometry) obj.geometry.dispose();
      });
      palette.window.dispose();
      palette.edge.dispose();
    },
  };
}
