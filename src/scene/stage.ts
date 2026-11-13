// The one 3D stage of the site: renderer, studio light, shadow floor, orbit camera, framing in the free part of the
// window, part picking and the resolution a machine can keep up with (the plan of the whole car, «Stage для всіх
// розділів»). Every section shows its model here through SceneModel (model-types.ts); several models at once come as
// one composed model. The pure parts are in camera-moves.ts and stage-quality.ts.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CameraMove, DEFAULT_MOVE_S, fitDistance, presetDirection, type CameraPose, type CameraPreset, type Insets, type MoveOptions } from './camera-moves.ts';
import type { SceneModel } from './model-types.ts';
import { partInfo, type PartInfo } from './parts-registry.ts';
import { QualityGovernor } from './stage-quality.ts';

export type { CameraPreset, Insets, MoveOptions } from './camera-moves.ts';

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

/** The system a picked object belongs to: its own userData.system or its nearest ancestor's. */
export function systemOf(object: THREE.Object3D): string | null {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) {
    const system = o.userData.system as string | undefined;
    if (system) return system;
  }
  return null;
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

/** What sits under a point of the canvas. */
export interface PartPick {
  key: string;
  info: PartInfo;
  /** The system it belongs to (userData.system on it or its nearest ancestor that has one), such as a car's gearbox. */
  system: string | null;
}

/** How a model arrives on the stage. */
export interface ModelOptions {
  /** Direction from the model toward the camera when the view is reset; the stage's own three-quarter view if left out. */
  home?: readonly [number, number, number];
  /** Keep the camera's angle: the same page's next model. */
  keepCamera?: boolean;
  /**
   * With keepCamera, stay at the same distance too, so that a smaller model looks smaller. It only refits if the new
   * model stops fitting or would be lost in the frame.
   */
  keepScale?: boolean;
  /** How much larger than this model to frame for: the biggest model it is compared with on its page. */
  frameScale?: number;
  /** How tightly the model fills the free area (Stage.fitScale); the current one if left out. */
  fitScale?: number;
}

/** Where the shadow floor lies, and how wide it is. */
export interface Ground {
  /** Height of the ground, scene units: lower for a rig that stands below the model's own base. */
  y: number;
  /** Side of the floor, scene units; left out, it follows the framed radius. */
  size?: number;
}

/** Framed radius up to which the floor, the shadow and the key light's reach stay as they are for an engine. */
const GROUND_RADIUS = 10;
const FLOOR_SIZE = 60;
const KEY_OFFSET = new THREE.Vector3(5, 9, 6);

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private readonly canvas: HTMLCanvasElement;
  private readonly floor: THREE.Mesh;
  private readonly key: THREE.DirectionalLight;
  private model: SceneModel<unknown> | null = null;
  /** Things beside the engine that do not shake with it, such as a dyno. Framed and picked with the model. */
  readonly extras = new THREE.Group();
  private readonly raycaster = new THREE.Raycaster();
  private insets: Insets = { left: 0, right: 0, top: 0, bottom: 0 };
  private width = 1;
  private height = 1;
  private readonly quality = new QualityGovernor();
  private groundY = 0;
  private groundSize: number | null = null;
  /** A camera move under way (setCameraPreset, focus); null when the camera rests or the visitor holds it. */
  private move: CameraMove | null = null;
  private reducedMotion = false;
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
      // The visitor takes the camera: a move under way stops where it is.
      this.move = null;
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

    // A unit square scaled to the floor's size, which follows the framed radius (fit).
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.42, color: '#04141a' }));
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -0.02;
    this.floor.scale.set(FLOOR_SIZE, FLOOR_SIZE, 1);
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);
    this.scene.add(this.extras);

    const motion = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    this.reducedMotion = motion?.matches ?? false;
    motion?.addEventListener('change', (event) => {
      this.reducedMotion = event.matches;
    });
  }

  /**
   * Where the shadow floor lies: lower for a rig that stands below the model's own base. The floor and the shadow
   * follow the framed radius unless `size` fixes the floor's side.
   */
  setGround(ground: Ground): void {
    this.groundY = ground.y;
    this.groundSize = ground.size ?? null;
    this.floor.position.y = ground.y - 0.02;
    if (this.groundSize !== null) this.floor.scale.set(this.groundSize, this.groundSize, 1);
  }

  /** The resolution drawn now, as a share of the device's: 1, 0.8 or 0.6. A section may draw less detail below 1. */
  get qualityLevel(): number {
    return this.quality.scale;
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * this.quality.scale);
  }

  /** Direction the camera looks from when a new engine appears. */
  private homeDirection = new THREE.Vector3(0.82, 0.42, 0.92).normalize();

  /** Pixels on screen for one world unit (100 mm) at the depth of the engine. */
  get pixelsPerUnit(): number {
    const distance = this.camera.position.distanceTo(this.controls.target);
    return this.height / (2 * distance * Math.tan((this.camera.fov * Math.PI) / 360));
  }

  /**
   * Puts a model on the stage in place of the last one, which is disposed. The section keeps it updated each frame.
   * Without keepCamera the camera goes to the model's home view.
   */
  setModel(model: SceneModel<unknown>, options: ModelOptions = {}): void {
    const { home, keepCamera = false, keepScale = false, frameScale = 1, fitScale } = options;
    this.frameScale = frameScale;
    if (fitScale !== undefined) this.fitScale = fitScale;
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

  /** The model's bounds with the extras beside it, as framing sees them. */
  private framedBox(): THREE.Box3 | null {
    if (!this.model) return null;
    this.model.group.updateMatrixWorld(true);
    const box = fitBox(this.model.group);
    if (this.extras.children.some((c) => c.visible)) box.union(new THREE.Box3().setFromObject(this.extras));
    return box;
  }

  /** Camera distance that frames a sphere of this radius in the free part of the window. */
  private fittedDistance(radius: number): number {
    return fitDistance(radius, { fovDeg: this.camera.fov, width: this.width, height: this.height, insets: this.insets }, this.fitScale);
  }

  /** Frames the current model in the free part of the window. */
  fit(resetAngle: boolean, keepScale = false): void {
    const box = this.framedBox();
    if (!box) return;
    this.move = null;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    // Fit using the smaller free side, scaled to the full frustum.
    const fitted = this.fittedDistance(sphere.radius * this.frameScale);
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

    // Up to an engine's radius the floor, the shadow's reach and the key light stand as they always have; a bigger
    // frame (a car, up to a radius of 2.6 m) scales them with it. The light keeps its direction, so nothing shades
    // differently.
    const reach = Math.max(1, sphere.radius / GROUND_RADIUS);
    if (this.groundSize === null) this.floor.scale.set(FLOOR_SIZE * reach, FLOOR_SIZE * reach, 1);
    const s = sphere.radius * 1.7;
    const cam = this.key.shadow.camera;
    cam.left = -s;
    cam.right = s;
    cam.top = s;
    cam.bottom = -s;
    cam.near = 0.5 * reach;
    cam.far = 40 * reach;
    cam.updateProjectionMatrix();
    this.key.position.copy(target).addScaledVector(KEY_OFFSET, reach);
    this.key.target.position.copy(target);
    this.key.target.updateMatrixWorld();
    this.controls.update();
  }

  /** Where the camera stands now. */
  private pose(): CameraPose {
    const target = this.controls.target.clone();
    const offset = this.camera.position.clone().sub(target);
    return { target, direction: offset.clone().normalize(), distance: offset.length() };
  }

  /** Starts a move to `to`, or jumps there with prefers-reduced-motion or no duration. */
  private moveTo(to: CameraPose, options: MoveOptions): void {
    const durationS = this.reducedMotion ? 0 : (options.durationS ?? DEFAULT_MOVE_S);
    // A chosen view holds: the slow orbit picks itself back up only after the visitor has left the page alone a while.
    this.controls.autoRotate = false;
    this.idleSince = performance.now();
    this.move = new CameraMove(this.pose(), to, durationS);
    if (durationS === 0) this.stepMove(0);
  }

  private stepMove(dt: number): void {
    const move = this.move;
    if (!move) return;
    move.step(dt, this.camera.position, this.controls.target);
    if (move.done) {
      this.move = null;
      this.idleSince = performance.now();
    }
  }

  /** Looks at the model from the front, the side, above, or its home view, at the distance the camera has now. */
  setCameraPreset(name: CameraPreset, options: MoveOptions = {}): void {
    const { target, distance } = this.pose();
    this.moveTo({ target, direction: presetDirection(name, this.homeDirection), distance }, options);
  }

  /** Brings a part of the model, such as one system of a car, to fill the free area, from where the camera looks now. */
  focus(box: THREE.Box3, options: MoveOptions = {}): void {
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    this.moveTo({ target: sphere.center.clone(), direction: this.pose().direction, distance: this.fittedDistance(sphere.radius) }, options);
  }

  /** True while the camera is on its way to a view. */
  get moving(): boolean {
    return this.move !== null;
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
    this.quality.set(options.quality);
    this.applyPixelRatio();
    this.renderer.setSize(this.width, this.height, false);
    this.fit(true);
  }

  /** The card of a part: the model's own words first, then the registry's. */
  private infoOf(key: string): PartInfo | null {
    return this.model?.parts?.[key] ?? partInfo(key);
  }

  /** The part at a pointer position, or null. Ignores the transparent shell when something solid is behind it. */
  pick(clientX: number, clientY: number): PartPick | null {
    if (!this.model) return null;
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects([this.model.group, this.extras], true);
    const shown = (hit: THREE.Intersection): boolean => {
      for (let obj: THREE.Object3D | null = hit.object; obj; obj = obj.parent) if (!obj.visible) return false;
      return true;
    };
    const picked = (hit: THREE.Intersection, key: string, info: PartInfo): PartPick => ({ key, info, system: systemOf(hit.object) });
    // Drillings inside a solid shaft are drawn over everything, so they are picked as they are seen.
    for (const hit of hits) {
      const key = hit.object.userData.overlay && shown(hit) ? partKeyOf(hit) : undefined;
      const info = key ? this.infoOf(key) : null;
      if (key && info) return picked(hit, key, info);
    }
    let fallback: PartPick | null = null;
    for (const hit of hits) {
      if (!shown(hit)) continue;
      const key = partKeyOf(hit);
      if (!key) continue;
      const info = this.infoOf(key);
      if (!info) continue;
      const material = (hit.object as THREE.Mesh).material as THREE.Material;
      if (material.transparent) {
        fallback ??= picked(hit, key, info);
        continue;
      }
      return picked(hit, key, info);
    }
    return fallback;
  }

  render(dtSeconds: number): void {
    // Picks the slow orbit back up after the viewer has left the model alone for a while.
    if (!this.frozen && this.orbitAllowed && this.idleSince > 0 && performance.now() - this.idleSince > 12000) {
      this.controls.autoRotate = true;
      this.idleSince = 0;
    }
    this.stepMove(dtSeconds);
    this.controls.update(dtSeconds);
    this.renderer.render(this.scene, this.camera);
    // A step less resolution when a machine can't keep up, and a step back once it can; a frozen page holds its own.
    if (this.frozen) return;
    if (this.quality.frame(dtSeconds)) {
      this.applyPixelRatio();
      this.renderer.setSize(this.width, this.height, false);
    }
  }
}
