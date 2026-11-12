// One systems layer on the model: a plan turned into a handful of meshes. All pipes share one merged geometry and
// one material; parts share another with vertex colours; sprays are instanced. Each merged mesh carries a per-vertex
// part index (aPart) and its table (userData.partOf), so Stage.pick explains the very pipe under the pointer.
// Nothing is allocated per frame.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pistonPin, type Engine } from '../../engine/kinematics.ts';
import type { EngineAnchors } from './anchors.ts';
import { flowMaterial, MAX_CHANNELS, type FlowMaterial } from './flow-material.ts';
import { pathLength, tightPath, type LayerPlan, type PartMaterial, type PartPlacement, type Space } from './route.ts';

const MM = 0.01;

const PART_COLORS: Record<Exclude<PartMaterial, 'mesh'>, THREE.Color> = {
  metal: new THREE.Color('#9aa1a6'),
  dark: new THREE.Color('#2b2e31'),
  rubber: new THREE.Color('#1f2022'),
  tint: new THREE.Color('#9aa1a6'),
};

export interface LayerStyle {
  color: string;
  hotColor: string;
  /** Dash spacing, scene units. */
  period: number;
}

/** Per channel, set by the layer's adapter every frame: physical speed m/s, brightness, heat and spray 0..1. */
export interface ChannelValues {
  speed: Float32Array;
  level: Float32Array;
  heat: Float32Array;
  /** How hard the channel's sprays spray. */
  spray: Float32Array;
}

const UP = new THREE.Vector3(0, 1, 0);

/** Marks every vertex of a geometry with the index of its part in the merged mesh's table. */
function tagParts(geo: THREE.BufferGeometry, index: number): void {
  const count = geo.getAttribute('position').count;
  geo.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(count).fill(index), 1));
}

const keyIndex = (keys: string[], key: string): number => {
  let i = keys.indexOf(key);
  if (i < 0) {
    keys.push(key);
    i = keys.length - 1;
  }
  return i;
};

/** Geometry of one part, placed and turned, without colour. */
function partGeometry(p: PartPlacement): THREE.BufferGeometry {
  let geo: THREE.BufferGeometry;
  const radius = p.radius ?? 0.05;
  const length = p.length ?? radius * 2;
  switch (p.shape) {
    case 'cylinder':
    case 'disc':
      geo = new THREE.CylinderGeometry(radius, radius, length, 18);
      break;
    case 'ring': {
      const shape = new THREE.Shape();
      shape.absarc(0, 0, radius, 0, Math.PI * 2, false);
      const hole = new THREE.Path();
      hole.absarc(0, 0, p.inner ?? radius * 0.6, 0, Math.PI * 2, true);
      shape.holes.push(hole);
      geo = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false, curveSegments: 20 });
      geo.translate(0, 0, -length / 2);
      // Extrusion runs along Z; turn it so the axis below (Y-based) treats it like the other round parts.
      geo.rotateX(-Math.PI / 2);
      break;
    }
    case 'box': {
      const h = p.half ?? new THREE.Vector3(radius, radius, radius);
      geo = new THREE.BoxGeometry(h.x * 2, h.y * 2, h.z * 2);
      geo.rotateX(-Math.PI / 2);
      break;
    }
    case 'sphere':
      geo = new THREE.SphereGeometry(radius, 14, 10);
      break;
  }
  // Round parts are built along Y; point that axis where the part wants it (Z by default).
  const axis = (p.axis ?? new THREE.Vector3(0, 0, 1)).clone().normalize();
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, axis));
  geo.translate(p.position.x, p.position.y, p.position.z);
  if (geo.index) geo = geo.toNonIndexed();
  geo.deleteAttribute('uv');
  return geo;
}

export class SystemLayer {
  /** Child of the model's mounted group. Skipped by Stage.fit. */
  readonly root = new THREE.Group();
  /** Children of the crank or eccentric shaft: they turn with it. */
  private readonly onShaft: THREE.Object3D[] = [];
  private readonly flow: FlowMaterial;
  private readonly overlayFlow: FlowMaterial;
  private readonly sprayMaterial: THREE.MeshBasicMaterial;
  private readonly materials: THREE.Material[] = [];
  readonly channels: string[];
  readonly values: ChannelValues;
  private readonly phase: Float32Array;
  private sprays: THREE.InstancedMesh | null = null;
  private readonly sprayChannel: Int32Array;
  private readonly sprayCylinder: Int32Array;
  private readonly sprayFrom: Float32Array;
  private readonly sprayTo: Float32Array;
  private readonly fixedSprays: Array<{ mesh: THREE.InstancedMesh; channels: Int32Array }> = [];
  private level: THREE.Mesh | null = null;
  private movers: THREE.InstancedMesh | null = null;
  private readonly moverData: Array<{ position: THREE.Vector3; axis: THREE.Vector3; travel: number; channel: number }> = [];
  private levelCentre = new THREE.Vector3();
  private readonly engine: Engine;
  private readonly frames: THREE.Object3D[];
  private readonly scratchMatrix = new THREE.Matrix4();
  private readonly scratchQuat = new THREE.Quaternion();
  private readonly scratchScale = new THREE.Vector3();
  private readonly scratchA = new THREE.Vector3();
  private readonly scratchB = new THREE.Vector3();
  private readonly scratchColor = new THREE.Color();
  private readonly baseColor: THREE.Color;
  private visible = true;

  constructor(engine: Engine, anchors: EngineAnchors, plan: LayerPlan, style: LayerStyle) {
    this.engine = engine;
    this.channels = plan.channels.slice(0, MAX_CHANNELS);
    const n = this.channels.length;
    this.values = { speed: new Float32Array(n), level: new Float32Array(n), heat: new Float32Array(n), spray: new Float32Array(n) };
    this.baseColor = new THREE.Color(style.color);
    this.phase = new Float32Array(n);
    this.root.userData.noFit = true;
    this.flow = flowMaterial(style.color, style.hotColor, style.period);
    this.overlayFlow = flowMaterial(style.color, style.hotColor, style.period, true);
    this.sprayMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.materials.push(this.flow.material, this.overlayFlow.material, this.sprayMaterial);
    const shaft = anchors.kind === 'piston' ? anchors.crank : anchors.shaft;
    this.frames = anchors.kind === 'piston' ? anchors.cylinders.map((c) => c.frame) : [];

    // Pipes: one merged mesh per place they hang on.
    const groups = new Map<string, { geos: THREE.BufferGeometry[]; keys: string[]; space: Space; overlay: boolean }>();
    for (const route of plan.routes) {
      const channel = this.channels.indexOf(route.channel);
      if (channel < 0 || route.points.length < 2) continue;
      const space = route.space ?? 'mounted';
      const overlay = !!route.overlay;
      const id = `${space}/${overlay}`;
      let group = groups.get(id);
      if (!group) groups.set(id, (group = { geos: [], keys: [], space, overlay }));
      const pts = tightPath(route.points);
      const length = Math.max(pathLength(pts), 1e-4);
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      const tube = new THREE.TubeGeometry(curve, Math.min(160, Math.max(6, Math.round(length / 0.025))), route.radius, 6, false);
      const uv = tube.getAttribute('uv');
      const along = new Float32Array(uv.count);
      for (let i = 0; i < uv.count; i++) along[i] = (route.reverse ? 1 - uv.getX(i) : uv.getX(i)) * length;
      tube.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1));
      tube.setAttribute('aChannel', new THREE.Float32BufferAttribute(new Float32Array(uv.count).fill(channel), 1));
      tagParts(tube, keyIndex(group.keys, route.part));
      tube.deleteAttribute('uv');
      group.geos.push(tube);
    }
    for (const group of groups.values()) {
      const merged = mergeGeometries(group.geos, false);
      if (!merged) continue;
      for (const g of group.geos) g.dispose();
      const mesh = new THREE.Mesh(merged, group.overlay ? this.overlayFlow.material : this.flow.material);
      mesh.userData.partOf = group.keys;
      if (group.overlay) {
        mesh.renderOrder = 20;
        mesh.userData.overlay = true;
      }
      this.attach(mesh, group.space, shaft);
    }

    // Parts: solid ones with vertex colours in one mesh per place, see-through screens and grids in another.
    const tint = new THREE.Color(style.color).multiplyScalar(0.55);
    const partGroups = new Map<string, { geos: THREE.BufferGeometry[]; keys: string[]; space: Space; screen: boolean }>();
    for (const part of plan.parts) {
      const space = part.space ?? 'mounted';
      const screen = part.material === 'mesh';
      const id = `${space}/${screen}`;
      let group = partGroups.get(id);
      if (!group) partGroups.set(id, (group = { geos: [], keys: [], space, screen }));
      const geo = partGeometry(part);
      const color = part.material === 'tint' ? tint : part.material === 'mesh' ? tint : PART_COLORS[part.material];
      const colors = new Float32Array(geo.getAttribute('position').count * 3);
      for (let i = 0; i < colors.length; i += 3) {
        colors[i] = color.r;
        colors[i + 1] = color.g;
        colors[i + 2] = color.b;
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      tagParts(geo, keyIndex(group.keys, part.part));
      group.geos.push(geo);
    }
    for (const group of partGroups.values()) {
      const merged = mergeGeometries(group.geos, false);
      if (!merged) continue;
      for (const g of group.geos) g.dispose();
      const material = group.screen
        ? new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.55, roughness: 0.6, metalness: 0.4, side: THREE.DoubleSide, depthWrite: false })
        : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.7 });
      this.materials.push(material);
      const mesh = new THREE.Mesh(merged, material);
      mesh.userData.partOf = group.keys;
      this.attach(mesh, group.space, shaft);
    }

    // Sprays that follow a piston, and sprays fixed to the engine or a shaft.
    const count = plan.pistonSprays.length;
    this.sprayChannel = new Int32Array(count);
    this.sprayCylinder = new Int32Array(count);
    this.sprayFrom = new Float32Array(count * 2);
    this.sprayTo = new Float32Array(count * 2);
    if (count) {
      const r = plan.pistonSprays[0]!.radius;
      const cone = new THREE.CylinderGeometry(r, r * 0.12, 1, 10, 1, true);
      cone.translate(0, 0.5, 0);
      const mesh = new THREE.InstancedMesh(cone, this.sprayMaterial, count);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.userData.instanceParts = plan.pistonSprays.map((s) => s.part);
      plan.pistonSprays.forEach((s, i) => {
        this.sprayChannel[i] = this.channels.indexOf(s.channel);
        this.sprayCylinder[i] = s.cylinder;
        this.sprayFrom[i * 2] = s.from.x;
        this.sprayFrom[i * 2 + 1] = s.from.y;
        this.sprayTo[i * 2] = s.toX;
        this.sprayTo[i * 2 + 1] = s.aboveWrist;
        mesh.setColorAt(i, this.scratchColor.setRGB(0, 0, 0));
      });
      this.sprays = mesh;
      this.root.add(mesh);
    }
    const fixedBy = new Map<string, typeof plan.fixedSprays>();
    for (const s of plan.fixedSprays) {
      const id = `${s.space ?? 'mounted'}/${!!s.overlay}`;
      fixedBy.set(id, [...(fixedBy.get(id) ?? []), s]);
    }
    for (const list of fixedBy.values()) {
      const r = list[0]!.radius;
      const cone = new THREE.CylinderGeometry(r, r * 0.12, 1, 10, 1, true);
      cone.translate(0, 0.5, 0);
      const material = list[0]!.overlay ? this.sprayMaterial.clone() : this.sprayMaterial;
      if (material !== this.sprayMaterial) {
        material.depthTest = false;
        this.materials.push(material);
      }
      const mesh = new THREE.InstancedMesh(cone, material, list.length);
      mesh.frustumCulled = false;
      mesh.userData.instanceParts = list.map((s) => s.part);
      if (list[0]!.overlay) {
        mesh.renderOrder = 21;
        mesh.userData.overlay = true;
      }
      const channels = new Int32Array(list.length);
      list.forEach((s, i) => {
        channels[i] = this.channels.indexOf(s.channel);
        const dir = this.scratchA.subVectors(s.to, s.from);
        const len = dir.length();
        this.scratchQuat.setFromUnitVectors(UP, dir.normalize());
        this.scratchMatrix.compose(s.from, this.scratchQuat, this.scratchScale.set(1, len, 1));
        mesh.setMatrixAt(i, this.scratchMatrix);
        mesh.setColorAt(i, this.scratchColor.setRGB(0, 0, 0));
      });
      this.fixedSprays.push({ mesh, channels });
      this.attach(mesh, list[0]!.space ?? 'mounted', shaft);
    }

    if (plan.movers?.length) {
      const disc = new THREE.CylinderGeometry(1, 1, 0.12, 18);
      const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(style.color).multiplyScalar(0.8), roughness: 0.4, metalness: 0.6 });
      this.materials.push(material);
      const mesh = new THREE.InstancedMesh(disc, material, plan.movers.length);
      mesh.frustumCulled = false;
      mesh.userData.instanceParts = plan.movers.map((m) => m.part);
      for (const m of plan.movers) this.moverData.push({ position: m.position.clone(), axis: m.axis.clone().normalize(), travel: m.travel, channel: this.channels.indexOf(m.channel) });
      plan.movers.forEach((m, i) => {
        this.scratchQuat.setFromUnitVectors(UP, this.moverData[i]!.axis);
        this.scratchMatrix.compose(m.position, this.scratchQuat, this.scratchScale.set(m.radius, m.radius, m.radius));
        mesh.setMatrixAt(i, this.scratchMatrix);
      });
      this.movers = mesh;
      this.root.add(mesh);
    }

    if (plan.level) {
      const l = plan.level;
      const geo = new THREE.PlaneGeometry(l.halfW * 2, l.zMax - l.zMin);
      geo.rotateX(-Math.PI / 2);
      const material = new THREE.MeshStandardMaterial({ color: '#c98a1c', emissive: '#6a3c05', transparent: true, opacity: 0.62, roughness: 0.25, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false });
      this.materials.push(material);
      this.level = new THREE.Mesh(geo, material);
      this.level.userData.part = 'oil-level';
      this.levelCentre.set(0, l.y, (l.zMin + l.zMax) / 2);
      this.level.position.copy(this.levelCentre);
      this.level.renderOrder = 4;
      this.root.add(this.level);
    }
  }

  private attach(object: THREE.Object3D, space: Space, shaft: THREE.Object3D): void {
    if (space === 'mounted') {
      this.root.add(object);
    } else {
      object.userData.noFit = true;
      shaft.add(object);
      this.onShaft.push(object);
    }
  }

  /** Adds the root to the model's mounted group. */
  addTo(mounted: THREE.Object3D): void {
    mounted.add(this.root);
  }

  setVisible(on: boolean): void {
    this.visible = on;
    this.root.visible = on;
    for (const o of this.onShaft) o.visible = on;
  }

  /** The layer's root and what it hangs on the shafts: everything it draws. */
  get roots(): THREE.Object3D[] {
    return [this.root, ...this.onShaft];
  }

  get isVisible(): boolean {
    return this.visible;
  }

  /**
   * Tilts and lifts the oil surface around the pan's centre: the hook feature/oil-sump drives with the slosh.
   * Small tilts keep it inside the pan's rectangle.
   */
  setOilSurface(level: number, tiltX: number, tiltZ: number): void {
    if (!this.level) return;
    this.level.position.set(this.levelCentre.x, level, this.levelCentre.z);
    this.level.rotation.set(tiltX, 0, tiltZ);
  }

  /**
   * Moves the dashes. Speeds are physical (m/s); on screen they slow with the square root of the slow motion,
   * so flows stay readable while the crank crawls, and level off at the top so fast flows don't flicker.
   */
  update(dt: number, timeScale: number, reducedMotion: boolean): void {
    const v = this.values;
    const scale = Math.sqrt(Math.max(0, Math.min(1, timeScale)));
    for (let i = 0; i < this.channels.length; i++) {
      const u = v.speed[i]! * scale;
      const shown = u > 1e-5 ? Math.max(0.12, 2.5 * (1 - Math.exp(-u / 1.5))) : 0;
      if (!reducedMotion) this.phase[i] = (this.phase[i]! + shown * dt) % 1000;
      this.flow.channels[i * 4] = this.phase[i]!;
      this.flow.channels[i * 4 + 1] = v.level[i]!;
      this.flow.channels[i * 4 + 2] = v.heat[i]!;
      this.overlayFlow.channels[i * 4] = this.phase[i]!;
      this.overlayFlow.channels[i * 4 + 1] = v.level[i]!;
      this.overlayFlow.channels[i * 4 + 2] = v.heat[i]!;
    }
    if (this.movers) {
      for (let i = 0; i < this.moverData.length; i++) {
        const m = this.moverData[i]!;
        const value = m.channel >= 0 ? v.spray[m.channel]! : 0;
        this.movers.getMatrixAt(i, this.scratchMatrix);
        this.scratchMatrix.decompose(this.scratchB, this.scratchQuat, this.scratchScale);
        this.scratchA.copy(m.position).addScaledVector(m.axis, m.travel * value);
        this.scratchMatrix.compose(this.scratchA, this.scratchQuat, this.scratchScale);
        this.movers.setMatrixAt(i, this.scratchMatrix);
      }
      this.movers.instanceMatrix.needsUpdate = true;
    }
    for (const { mesh, channels } of this.fixedSprays) {
      for (let i = 0; i < channels.length; i++) {
        const spray = channels[i]! >= 0 ? v.spray[channels[i]!]! : 0;
        mesh.setColorAt(i, this.scratchColor.copy(this.baseColor).multiplyScalar(0.8 * spray));
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  /** Piston sprays follow the piston; their brightness is their channel's spray value. */
  updatePistonSprays(theta: number): void {
    const mesh = this.sprays;
    if (!mesh) return;
    const e = this.engine;
    const color = this.baseColor;
    for (let i = 0; i < this.sprayCylinder.length; i++) {
      const cyl = e.cylinders[this.sprayCylinder[i]!]!;
      const frame = this.frames[this.sprayCylinder[i]!]!;
      const wrist = pistonPin(e, cyl, theta) * MM;
      const from = this.scratchA.set(this.sprayFrom[i * 2]!, this.sprayFrom[i * 2 + 1]!, 0).applyMatrix4(frame.matrix);
      const to = this.scratchB.set(this.sprayTo[i * 2]!, wrist + this.sprayTo[i * 2 + 1]!, 0).applyMatrix4(frame.matrix);
      const dir = to.sub(from);
      const len = dir.length();
      this.scratchQuat.setFromUnitVectors(UP, dir.multiplyScalar(1 / Math.max(len, 1e-6)));
      this.scratchMatrix.compose(from, this.scratchQuat, this.scratchScale.set(1, len, 1));
      mesh.setMatrixAt(i, this.scratchMatrix);
      const open = this.sprayChannel[i]! >= 0 ? this.values.spray[this.sprayChannel[i]!]! : 0;
      mesh.setColorAt(i, this.scratchColor.copy(color).multiplyScalar(0.9 * open));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  /** Colours the whole layer's flow, as the coolant warms from blue to green to red. */
  setFlowColor(color: THREE.Color): void {
    this.baseColor.copy(color);
    this.flow.color.copy(color);
    this.overlayFlow.color.copy(color);
    this.flow.material.color.copy(color).multiplyScalar(0.3);
  }

  /** Index of a channel by id, or -1. */
  channel(id: string): number {
    return this.channels.indexOf(id);
  }

  dispose(): void {
    this.root.parent?.remove(this.root);
    for (const o of this.onShaft) o.parent?.remove(o);
    const geos = new Set<THREE.BufferGeometry>();
    const collect = (o: THREE.Object3D): void => o.traverse((c) => (c as THREE.Mesh).geometry && geos.add((c as THREE.Mesh).geometry));
    collect(this.root);
    for (const o of this.onShaft) collect(o);
    for (const g of geos) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
