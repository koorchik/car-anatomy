import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PARTS, type PartInfo } from './parts-info.ts';
import type { EngineModel } from './model-types.ts';

/** Studio lighting captured as an environment map, so metal has something to reflect. */
function buildStudioEnv(renderer: THREE.WebGLRenderer): THREE.Texture {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#10262e');
  const panel = (color: string, intensity: number, w: number, h: number, x: number, y: number, z: number): void => {
    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.position.set(x, y, z);
    mesh.lookAt(0, 0, 0);
    scene.add(mesh);
  };
  panel('#fff4e4', 7, 8, 5, 0, 9, 2); // overhead softbox
  panel('#ffe2c4', 4, 3, 9, -9, 2, 4); // warm side
  panel('#a9dcf0', 3.2, 3, 9, 9, 2, -3); // cool side
  panel('#d6f1ff', 1.8, 10, 1.5, 0, 1, -9.5); // rim strip
  panel('#3e6a78', 1, 20, 20, 0, -7, 0); // floor bounce
  panel('#bcd6df', 1.5, 14, 8, 0, 1, 10); // large front fill, so metal facing the viewer isn't black
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(scene, 0.035).texture;
  pmrem.dispose();
  return env;
}

/** The part under a ray hit: a merged mesh of the systems layers keeps one key per vertex, an instanced one per instance. */
export function partKeyOf(hit: THREE.Intersection): string | undefined {
  const o = hit.object;
  const table = o.userData.partOf as string[] | undefined;
  const index = (o as THREE.Mesh).geometry?.getAttribute('aPart');
  if (table && index && hit.face) return table[index.getX(hit.face.a)];
  const instances = o.userData.instanceParts as string[] | undefined;
  if (instances && hit.instanceId !== undefined) return instances[hit.instanceId];
  return o.userData.part as string | undefined;
}

/** Bounds of a model without what sits outside it on purpose (userData.noFit), such as the systems layers' hose stubs. */
export function fitBox(root: THREE.Object3D): THREE.Box3 {
  const skipped: Array<[THREE.Object3D, THREE.Object3D]> = [];
  root.traverse((o) => {
    if (o !== root && o.userData.noFit && o.parent) skipped.push([o, o.parent]);
  });
  for (const [o, parent] of skipped) parent.remove(o);
  const box = new THREE.Box3().setFromObject(root);
  for (const [o, parent] of skipped) parent.add(o);
  return box;
}

export interface Insets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private readonly canvas: HTMLCanvasElement;
  private readonly floor: THREE.Mesh;
  private readonly key: THREE.DirectionalLight;
  private model: EngineModel | null = null;
  /** Things beside the engine that do not shake with it, such as a dyno. Framed and picked with the model. */
  readonly extras = new THREE.Group();
  private readonly raycaster = new THREE.Raycaster();
  private insets: Insets = { left: 0, right: 0, top: 0, bottom: 0 };
  private width = 1;
  private height = 1;
  private qualityScale = 1;
  private slowFrames = 0;
  private idleSince = 0;
  private orbitAllowed = true;
  /** Held still for a snapshot: the resolution stays put and the orbit does not pick itself back up. */
  private frozen = false;
  /** How tightly the model fills the free area. Below 1 it may reach under the panels when turned. */
  fitScale = 0.68;
  private frameScale = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene.environment = buildStudioEnv(this.renderer);
    this.scene.environmentIntensity = 0.95;

    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 200);
    this.camera.position.set(6, 3.2, 7);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.55;
    this.controls.maxPolarAngle = Math.PI * 0.92;
    this.controls.addEventListener('start', () => {
      this.controls.autoRotate = false;
      this.idleSince = 0;
    });
    this.controls.addEventListener('end', () => {
      this.idleSince = performance.now();
    });

    this.key = new THREE.DirectionalLight('#fff1e0', 2.1);
    this.key.position.set(5, 9, 6);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0005;
    this.key.shadow.normalBias = 0.02;
    this.key.shadow.radius = 5;
    this.scene.add(this.key);
    const rim = new THREE.DirectionalLight('#a7dcf0', 0.85);
    rim.position.set(-6, 3, -6);
    this.scene.add(rim);

    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.42, color: '#04141a' }));
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -0.02;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);
    this.scene.add(this.extras);
  }

  /** Lowers the shadow floor, for a rig that stands below the engine's own base. */
  setFloor(y: number): void {
    this.floor.position.y = y - 0.02;
  }

  resize(width: number, height: number, insets: Insets): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.insets = insets;
    this.applyPixelRatio();
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    // Shift the view so the engine sits in the free area, not behind the panels.
    const shiftX = (insets.right - insets.left) / 2;
    const shiftY = (insets.bottom - insets.top) / 2;
    this.camera.setViewOffset(this.width, this.height, shiftX, shiftY, this.width, this.height);
    this.camera.updateProjectionMatrix();
    this.fit(false);
  }

  private applyPixelRatio(): void {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * this.qualityScale);
  }

  /** Direction the camera looks from when a new engine appears. */
  private homeDirection = new THREE.Vector3(0.82, 0.42, 0.92).normalize();

  /** Pixels on screen for one world unit (100 mm) at the depth of the engine. */
  get pixelsPerUnit(): number {
    const distance = this.camera.position.distanceTo(this.controls.target);
    return this.height / (2 * distance * Math.tan((this.camera.fov * Math.PI) / 360));
  }

  /**
   * @param keepScale Stay at the same distance, so that a smaller engine looks smaller. It only refits if the new
   *   model stops fitting or would be lost in the frame.
   * @param frameScale How much larger than this model to frame for: the biggest engine this one is compared with.
   */
  setModel(model: EngineModel, home?: [number, number, number], keepCamera = false, keepScale = false, frameScale = 1): void {
    this.frameScale = frameScale;
    this.homeDirection.set(...(home ?? [0.82, 0.42, 0.92])).normalize();
    if (this.model) {
      this.scene.remove(this.model.group);
      this.model.dispose();
    }
    this.model = model;
    this.scene.add(model.group);
    this.fit(!keepCamera, keepCamera && keepScale);
    model.group.updateMatrixWorld(true);
  }

  /** Frames the current model in the free part of the window. */
  fit(resetAngle: boolean, keepScale = false): void {
    if (!this.model) return;
    this.model.group.updateMatrixWorld(true);
    const box = fitBox(this.model.group);
    if (this.extras.children.some((c) => c.visible)) box.union(new THREE.Box3().setFromObject(this.extras));
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const freeW = Math.max(120, this.width - this.insets.left - this.insets.right);
    const freeH = Math.max(120, this.height - this.insets.top - this.insets.bottom);
    const vFov = (this.camera.fov * Math.PI) / 180;
    // Fit using the smaller free side, scaled to the full frustum.
    const framed = sphere.radius * this.frameScale;
    const heightLimit = framed / Math.sin((vFov * (freeH / this.height)) / 2);
    const hFovFree = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect * (freeW / this.width));
    const widthLimit = framed / Math.sin(hFovFree / 2);
    const fitted = Math.max(heightLimit, widthLimit) * this.fitScale;
    const current = this.camera.position.distanceTo(this.controls.target);
    const distance = keepScale && current > fitted * 0.8 && current < fitted * 1.8 ? current : fitted;
    const target = sphere.center.clone();
    const direction = resetAngle
      ? this.homeDirection.clone()
      : this.camera.position.clone().sub(this.controls.target).normalize();
    this.controls.target.copy(target);
    this.camera.position.copy(target).addScaledVector(direction, distance);
    this.controls.minDistance = sphere.radius * 0.6;
    this.controls.maxDistance = Math.max(fitted * 2.2, distance);

    const s = sphere.radius * 1.7;
    const cam = this.key.shadow.camera;
    cam.left = -s;
    cam.right = s;
    cam.top = s;
    cam.bottom = -s;
    cam.near = 0.5;
    cam.far = 40;
    cam.updateProjectionMatrix();
    this.key.position.copy(target).add(new THREE.Vector3(5, 9, 6));
    this.key.target.position.copy(target);
    this.key.target.updateMatrixWorld();
    this.controls.update();
  }

  setOrbit(enabled: boolean): void {
    this.orbitAllowed = enabled;
    this.controls.autoRotate = enabled;
  }

  /**
   * Holds the picture still for a snapshot: the resolution at `quality` of the device's, the orbit as asked and the
   * camera at the page's home. Null lets go: the orbit and the slow-machine fallback work as before.
   */
  freeze(options: { quality: number; orbit: boolean } | null): void {
    if (!options) {
      if (!this.frozen) return;
      this.frozen = false;
      this.controls.enableDamping = true;
      this.controls.autoRotate = this.orbitAllowed;
      return;
    }
    this.frozen = true;
    this.controls.autoRotate = options.orbit;
    // Without damping the controls drop what is left of a drag or of the orbit at once instead of drifting on.
    this.controls.enableDamping = false;
    this.controls.update(0);
    this.qualityScale = options.quality;
    this.slowFrames = 0;
    this.applyPixelRatio();
    this.renderer.setSize(this.width, this.height, false);
    this.fit(true);
  }

  /** Part name at a pointer position, or null. Ignores the transparent shell when something solid is behind it. */
  pick(clientX: number, clientY: number): PartInfo | null {
    if (!this.model) return null;
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects([this.model.group, this.extras], true);
    const shown = (hit: THREE.Intersection): boolean => {
      for (let obj: THREE.Object3D | null = hit.object; obj; obj = obj.parent) if (!obj.visible) return false;
      return true;
    };
    // Drillings inside a solid shaft are drawn over everything, so they are picked as they are seen.
    for (const hit of hits) {
      const key = hit.object.userData.overlay && shown(hit) ? partKeyOf(hit) : undefined;
      if (key && PARTS[key]) return PARTS[key];
    }
    let fallback: PartInfo | null = null;
    for (const hit of hits) {
      if (!shown(hit)) continue;
      const key = partKeyOf(hit);
      if (!key) continue;
      const info = PARTS[key];
      if (!info) continue;
      const material = (hit.object as THREE.Mesh).material as THREE.Material;
      if (material.transparent) {
        fallback ??= info;
        continue;
      }
      return info;
    }
    return fallback;
  }

  render(dtSeconds: number): void {
    // Picks the slow orbit back up after the viewer has left the model alone for a while.
    if (!this.frozen && this.orbitAllowed && this.idleSince > 0 && performance.now() - this.idleSince > 12000) {
      this.controls.autoRotate = true;
      this.idleSince = 0;
    }
    this.controls.update(dtSeconds);
    this.renderer.render(this.scene, this.camera);
    // Lower the resolution a step when a machine can't keep up.
    if (this.frozen) return;
    if (dtSeconds > 1 / 28) {
      this.slowFrames++;
      if (this.slowFrames > 45 && this.qualityScale > 0.6) {
        this.qualityScale = Math.max(0.6, this.qualityScale - 0.2);
        this.slowFrames = 0;
        this.applyPixelRatio();
        this.renderer.setSize(this.width, this.height, false);
      }
    } else if (this.slowFrames > 0) {
      this.slowFrames--;
    }
  }
}
