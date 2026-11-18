import * as THREE from 'three';
import { MercatorCoordinate } from 'maplibre-gl';
import type { Map as MLMap } from 'maplibre-gl';
import { DATUM } from '../geo';
import type { LightingState } from '../lighting';
import { sunDirection } from '../sunCalc';
import type { Building, RouteResult } from '../types';

export interface SceneModule {
  name: string;
  root: THREE.Object3D;
  /** Called when the module joins the world, giving it access to the map/renderer. */
  attach?(world: ThreeWorld): void;
  update?(dt: number, elapsed: number): void;
  setLighting?(lighting: LightingState): void;
  setRoute?(route: RouteResult | null, destination: Building | null, floor: number): void;
  setSelection?(building: Building | null, floor: number): void;
  set3D?(is3D: boolean): void;
  dispose?(): void;
}

/**
 * MapLibre ↔ Three.js bridge.
 *
 * A single WebGLRenderer shares MapLibre's GL context. The campus is authored
 * in local metres (x = east, y = up, z = south) and placed onto the globe via a
 * mercator model transform, so every object lives in one continuous 3D world.
 */
export class ThreeWorld {
  readonly id = 'ou-three-world';
  readonly type = 'custom';
  readonly renderingMode = '3d';

  map: MLMap | null = null;
  renderer: THREE.WebGLRenderer | null = null;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(36, 1, 0.5, 60000);
  modules = new Map<string, SceneModule>();

  onFps: ((fps: number) => void) | null = null;
  onReady: (() => void) | null = null;

  private sunLight: THREE.DirectionalLight;
  private ambient: THREE.AmbientLight;
  private hemi: THREE.HemisphereLight;
  private neonA: THREE.PointLight;
  private neonB: THREE.PointLight;
  private shadowCatcher: THREE.Mesh;
  private shadowPlaneMaterial: THREE.ShadowMaterial;

  private translateX = 0;
  private translateY = 0;
  private translateZ = 0;
  private scale = 1;

  private raf = 0;
  private elapsed = 0;
  private lastFrame = 0;
  private frames = 0;
  private fpsClock = 0;
  private lastLighting: LightingState | null = null;
  private initialized = false;
  private quality: 'cinematic' | 'balanced' = 'cinematic';
  private route: RouteResult | null = null;
  private destination: Building | null = null;
  private selection: Building | null = null;
  private floor = 0;
  private is3D = true;
  private shadowCatcherDim = 1;
  private warned = new Set<string>();

  constructor() {
    const mercator = MercatorCoordinate.fromLngLat([DATUM.lng, DATUM.lat], 0);
    this.translateX = mercator.x;
    this.translateY = mercator.y;
    this.translateZ = mercator.z;
    this.scale = mercator.meterInMercatorCoordinateUnits();

    this.scene.fog = new THREE.FogExp2('#060c15', 0.00022);

    this.hemi = new THREE.HemisphereLight('#7ba8c2', '#0a1410', 0.7);
    this.scene.add(this.hemi);

    this.ambient = new THREE.AmbientLight('#33556e', 0.55);
    this.scene.add(this.ambient);

    this.sunLight = new THREE.DirectionalLight('#ffe7c4', 1.7);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.left = -1350;
    this.sunLight.shadow.camera.right = 1350;
    this.sunLight.shadow.camera.top = 1250;
    this.sunLight.shadow.camera.bottom = -1250;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 5200;
    this.sunLight.shadow.bias = -0.0006;
    this.sunLight.shadow.normalBias = 0.8;
    this.sunLight.shadow.camera.updateProjectionMatrix();
    this.sunLight.position.set(900, 1500, 900);
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.neonA = new THREE.PointLight('#3fd6ff', 0.0, 2600, 1.8);
    this.neonA.position.set(420, 120, 260);
    this.scene.add(this.neonA);
    this.neonB = new THREE.PointLight('#ffa14d', 0.0, 2600, 1.8);
    this.neonB.position.set(-620, 110, -420);
    this.scene.add(this.neonB);

    this.shadowPlaneMaterial = new THREE.ShadowMaterial({
      color: '#02070d',
      opacity: 0.42,
      transparent: true,
      depthWrite: false,
    });
    this.shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(3000, 2500), this.shadowPlaneMaterial);
    this.shadowCatcher.rotation.x = -Math.PI / 2;
    this.shadowCatcher.position.set(0, 0.2, 0);
    this.shadowCatcher.receiveShadow = true;
    this.shadowCatcher.renderOrder = 0;
    this.scene.add(this.shadowCatcher);
  }

  onAdd(map: MLMap, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map;
    const canvas = map.getCanvas();
    const renderer = new THREE.WebGLRenderer({
      canvas,
      context: gl as WebGL2RenderingContext,
      antialias: true,
      alpha: true,
    });
    renderer.autoClear = false;
    renderer.setPixelRatio(1);
    renderer.setSize(canvas.width, canvas.height, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    this.renderer = renderer;
    this.initialized = true;
    this.startLoop();
    if (this.lastLighting) this.applyLighting(this.lastLighting, true);
    this.onReady?.();
  }

  onRemove(): void {
    this.stopLoop();
    for (const module of this.modules.values()) {
      this.scene.remove(module.root);
      module.dispose?.();
    }
    this.modules.clear();
    this.renderer?.dispose();
    this.renderer = null;
    this.map = null;
  }

  addModule(module: SceneModule): void {
    if (this.modules.has(module.name)) this.removeModule(module.name);
    this.modules.set(module.name, module);
    this.scene.add(module.root);
    if (this.lastLighting) module.setLighting?.(this.lastLighting);
    if (this.renderer) this.renderer.shadowMap.needsUpdate = true;
    module.setRoute?.(this.route, this.destination, this.floor);
    module.setSelection?.(this.selection, this.floor);
    module.set3D?.(this.is3D);
    module.attach?.(this);
  }

  removeModule(name: string): void {
    const module = this.modules.get(name);
    if (!module) return;
    this.scene.remove(module.root);
    module.dispose?.();
    this.modules.delete(name);
  }

  setLighting(lighting: LightingState): void {
    this.lastLighting = lighting;
    if (!this.initialized) return;
    try {
      this.applyLighting(lighting);
    } catch (error) {
      console.warn('[OU scene] lighting update failed', error);
    }
  }

  private applyLighting(lighting: LightingState, force = false): void {
    if (!this.renderer) return;
    const sun = lighting.sun;
    const isNight = sun.elevationDeg < 2;
    const az = isNight ? sun.azimuthDeg + 180 : sun.azimuthDeg;
    const el = isNight ? Math.max(24, Math.abs(sun.elevationDeg)) : Math.max(7, sun.elevationDeg);
    const dir = sunDirection(az, el);

    this.sunLight.position.set(dir.east * 2200, dir.up * 2200, -dir.north * 2200);
    this.sunLight.target.position.set(0, 0, 0);
    this.sunLight.color.set(lighting.sunColor);
    this.sunLight.intensity = isNight ? 0.28 : lighting.sunIntensity * 1.15;

    this.hemi.color.set(lighting.sky);
    this.hemi.groundColor.set(lighting.ground);
    this.hemi.intensity = lighting.isNight ? 0.52 : 0.78;
    this.ambient.color.set(lighting.ambientColor);
    this.ambient.intensity = lighting.ambientIntensity;

    this.neonA.color.set('#3fd6ff');
    this.neonA.intensity = lighting.neon * 2.6;
    this.neonB.color.set('#ff9a4d');
    this.neonB.intensity = lighting.neon * 1.8;

    this.renderer.toneMappingExposure = lighting.exposure;
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.set(lighting.fog);
    fog.density = lighting.isNight ? 0.00034 : 0.0002;

    this.shadowCatcherDim = lighting.isNight ? 0.2 : 0.46;
    this.shadowPlaneMaterial.opacity = this.shadowCatcherDim;
    this.shadowCatcher.visible = this.is3D;
    this.sunLight.castShadow = this.is3D && this.quality === 'cinematic';
    this.sunLight.shadow.needsUpdate = true;

    for (const module of this.modules.values()) module.setLighting?.(lighting);
    if (force || this.renderer.shadowMap) this.renderer.shadowMap.needsUpdate = true;
  }

  /** Re-bake the static shadow map after late geometry (e.g. a loaded model) appears. */
  markShadowsDirty(): void {
    if (!this.renderer) return;
    this.renderer.shadowMap.needsUpdate = true;
    this.sunLight.shadow.needsUpdate = true;
  }

  setQuality(quality: 'cinematic' | 'balanced'): void {
    this.quality = quality;
    if (!this.renderer) return;
    this.renderer.shadowMap.enabled = quality === 'cinematic';
    this.sunLight.castShadow = quality === 'cinematic' && this.is3D;
    this.renderer.shadowMap.needsUpdate = true;
    this.setPixelRatioCap(quality === 'cinematic' ? 2 : 1.5);
  }

  private setPixelRatioCap(cap: number): void {
    const map = this.map;
    if (!map) return;
    map.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
  }

  set3D(is3D: boolean): void {
    this.is3D = is3D;
    this.shadowCatcher.visible = is3D;
    this.sunLight.castShadow = is3D && this.quality === 'cinematic';
    for (const module of this.modules.values()) module.set3D?.(is3D);
    this.renderer && (this.renderer.shadowMap.needsUpdate = true);
  }

  setRoute(route: RouteResult | null, destination: Building | null, floor: number): void {
    this.route = route;
    this.destination = destination;
    this.floor = floor;
    for (const module of this.modules.values()) module.setRoute?.(route, destination, floor);
  }

  setSelection(building: Building | null, floor: number): void {
    this.selection = building;
    this.floor = floor;
    for (const module of this.modules.values()) module.setSelection?.(building, floor);
  }

  /** Local metres → three.js world vector. */
  worldFromLocal(x: number, north: number, altitude = 0): THREE.Vector3 {
    return new THREE.Vector3(x, altitude, -north);
  }

  worldFromLngLat(lng: number, lat: number, altitude = 0): THREE.Vector3 {
    const mercator = MercatorCoordinate.fromLngLat([lng, lat], altitude);
    return new THREE.Vector3(
      (mercator.x - this.translateX) / this.scale,
      (mercator.z - this.translateZ) / this.scale,
      (mercator.y - this.translateY) / this.scale
    );
  }

  private startLoop(): void {
    if (this.raf) return;
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      if (!this.map || typeof document === 'undefined' || document.hidden) return;
      const dt = this.lastFrame ? Math.min(0.06, (now - this.lastFrame) / 1000) : 0.016;
      this.lastFrame = now;
      this.elapsed += dt;
      for (const module of this.modules.values()) this.safeUpdate(module, dt);
      this.map.triggerRepaint();
    };
    this.raf = requestAnimationFrame(tick);
  }

  private safeUpdate(module: SceneModule, dt: number): void {
    if (!module.update) return;
    try {
      module.update(dt, this.elapsed);
    } catch (error) {
      if (!this.warned.has(module.name)) {
        this.warned.add(module.name);
        console.warn(`[OU scene] module "${module.name}" update failed`, error);
      }
    }
  }

  private stopLoop(): void {
    if (this.raf && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  render(
    gl: WebGLRenderingContext | WebGL2RenderingContext,
    matrix: ArrayLike<number>
  ): void {
    const renderer = this.renderer;
    const map = this.map;
    if (!renderer || !map) return;

    const m = new THREE.Matrix4().fromArray(Array.from(matrix));
    const l = new THREE.Matrix4()
      .makeTranslation(this.translateX, this.translateY, this.translateZ)
      .scale(new THREE.Vector3(this.scale, -this.scale, this.scale))
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));

    this.camera.projectionMatrix = m.multiply(l);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();

    const canvas = map.getCanvas();
    if (canvas.width !== renderer.domElement.width || canvas.height !== renderer.domElement.height) {
      renderer.setSize(canvas.width, canvas.height, false);
    }
    renderer.setViewport(0, 0, canvas.width, canvas.height);
    renderer.resetState();
    try {
      renderer.render(this.scene, this.camera);
    } catch (error) {
      if (!this.warned.has('render')) {
        this.warned.add('render');
        console.warn('[OU scene] render failed', error);
      }
    }

    // fps telemetry
    this.frames += 1;
    const now = performance.now();
    if (!this.fpsClock) this.fpsClock = now;
    if (now - this.fpsClock > 600) {
      const fps = Math.round((this.frames * 1000) / (now - this.fpsClock));
      this.frames = 0;
      this.fpsClock = now;
      this.onFps?.(fps);
    }
    map.triggerRepaint();
  }

  dispose(): void {
    this.onRemove();
    this.scene.clear();
  }
}
