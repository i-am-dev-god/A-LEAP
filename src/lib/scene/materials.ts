import * as THREE from 'three';
import type { LightingState } from '../lighting';

export interface Palette {
  stone: THREE.MeshStandardMaterial;
  stoneWarm: THREE.MeshStandardMaterial;
  stoneDark: THREE.MeshStandardMaterial;
  lime: THREE.MeshStandardMaterial;
  copper: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  roof: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  window: THREE.MeshBasicMaterial;
  edge: THREE.LineBasicMaterial;
}

export function createPalette(): Palette {
  return {
    stone: new THREE.MeshStandardMaterial({ color: '#b9a483', roughness: 0.82, metalness: 0.06 }),
    stoneWarm: new THREE.MeshStandardMaterial({ color: '#cbb894', roughness: 0.76, metalness: 0.04 }),
    stoneDark: new THREE.MeshStandardMaterial({ color: '#6b5c48', roughness: 0.9, metalness: 0.03 }),
    lime: new THREE.MeshStandardMaterial({ color: '#ddd6c2', roughness: 0.65, metalness: 0.05 }),
    copper: new THREE.MeshStandardMaterial({ color: '#7f8b7a', roughness: 0.45, metalness: 0.55 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: '#7fd9e6',
      roughness: 0.12,
      metalness: 0.35,
      transparent: true,
      opacity: 0.34,
      emissive: new THREE.Color('#1f7f8f'),
      emissiveIntensity: 0.55,
    }),
    roof: new THREE.MeshStandardMaterial({ color: '#3a4348', roughness: 0.9, metalness: 0.1 }),
    metal: new THREE.MeshStandardMaterial({ color: '#8e9aa2', roughness: 0.35, metalness: 0.75 }),
    window: new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      toneMapped: false,
    }),
    edge: new THREE.LineBasicMaterial({
      color: '#7fe8ff',
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
      toneMapped: false,
    }),
  };
}

export function applyPaletteLighting(palette: Palette, lighting: LightingState): void {
  const night = lighting.isNight;
  palette.stone.color.set(night ? '#7d7a72' : '#b9a483');
  palette.stoneWarm.color.set(night ? '#8a8274' : '#cbb894');
  palette.lime.color.set(night ? '#a9b4b8' : '#ddd6c2');
  palette.roof.color.set(night ? '#232e36' : '#3a4348');
  palette.glass.opacity = night ? 0.5 : 0.3;
  palette.glass.emissiveIntensity = 0.35 + lighting.neon * 0.9;
  palette.window.opacity = night ? 0.92 : 0.1;
  palette.edge.opacity = night ? 0.62 : 0.3;
  palette.edge.color.set(night ? '#6ef0ff' : '#bfeef7');
}
