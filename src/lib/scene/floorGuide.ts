import * as THREE from 'three';
import { toMeters } from '../geo';
import type { Building } from '../types';
import type { SceneModule } from './threeWorld';

function floorPlate(points: [number, number][], height: number, material: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = height;
  return mesh;
}

function floorLoop(points: [number, number][], height: number, material: THREE.Material): THREE.LineLoop {
  const geometry = new THREE.BufferGeometry().setFromPoints(
    points.map(([x, y]) => new THREE.Vector3(x, height, -y))
  );
  return new THREE.LineLoop(geometry, material);
}

/** Vertical floor stack + active-floor highlight for the selected building. */
export function createFloorGuide(): SceneModule {
  const root = new THREE.Group();
  root.name = 'floor-guide';
  root.visible = false;

  const inactiveMaterial = new THREE.LineBasicMaterial({
    color: '#6ce9ff',
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    toneMapped: false,
  });
  const activeMaterial = new THREE.LineBasicMaterial({
    color: '#b6fbff',
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    toneMapped: false,
  });
  const plateMaterial = new THREE.MeshBasicMaterial({
    color: '#3fe3ff',
    transparent: true,
    opacity: 0.14,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });

  let builtFor: string | null = null;
  let builtFloor = -1;
  let current: Building | null = null;
  let group: THREE.Group | null = null;
  const extraGeometries: THREE.BufferGeometry[] = [];

  const clear = () => {
    if (group) root.remove(group);
    extraGeometries.forEach((g) => g.dispose());
    extraGeometries.length = 0;
    group = null;
  };

  const build = (building: Building, floor: number) => {
    clear();
    current = building;
    builtFor = building.id;
    group = new THREE.Group();

    const centre = toMeters(building.centroid);
    const points = building.polygon.slice(0, -1).map(([lng, lat]) => {
      const m = toMeters([lng, lat]);
      return [m.x - centre.x, m.y - centre.y] as [number, number];
    });
    const floorH = building.height_m / Math.max(1, building.floors);
    const active = Math.min(floor, building.floors - 1);

    for (let f = 0; f < building.floors; f += 1) {
      const height = f * floorH + 0.3;
      const isActive = f === active;
      const loop = floorLoop(points, height, isActive ? activeMaterial : inactiveMaterial);
      group.add(loop);
      extraGeometries.push(loop.geometry);
    }

    const plate = floorPlate(points, active * floorH + 0.4, plateMaterial);
    extraGeometries.push(plate.geometry);
    group.add(plate);

    // vertical corner guides
    const cornerPoints: THREE.Vector3[] = [];
    for (const [x, y] of points) {
      cornerPoints.push(new THREE.Vector3(x, 0.3, -y), new THREE.Vector3(x, building.height_m + 0.8, -y));
    }
    const verticalGeo = new THREE.BufferGeometry().setFromPoints(cornerPoints);
    extraGeometries.push(verticalGeo);
    group.add(new THREE.LineSegments(verticalGeo, inactiveMaterial));

    group.position.set(centre.x, 0, -centre.y);
    root.add(group);
    root.visible = true;
  };

  return {
    name: 'floor-guide',
    root,
    setSelection(building: Building | null, floor: number) {
      if (!building) {
        root.visible = false;
        clear();
        current = null;
        builtFor = null;
        builtFloor = -1;
        return;
      }
      if (builtFor !== building.id || builtFloor !== floor) {
        build(building, Math.min(floor, building.floors - 1));
        builtFloor = floor;
      }
    },
    set3D() {
      plateMaterial.opacity = 0.14;
    },
    setLighting(lighting) {
      inactiveMaterial.opacity = lighting.isNight ? 0.3 : 0.2;
      plateMaterial.opacity = lighting.isNight ? 0.2 : 0.12;
    },
    dispose() {
      clear();
      inactiveMaterial.dispose();
      activeMaterial.dispose();
      plateMaterial.dispose();
    },
  };
}
