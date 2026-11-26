// One systems layer on the model: a plan turned into a handful of meshes. All pipes share one merged geometry and
// one material; parts share another with vertex colours; sprays are instanced. Each merged mesh carries a per-vertex
// part index (aPart) and its table (userData.partOf), so Stage.pick explains the very pipe under the pointer.
// Nothing is allocated per frame.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DEG, pistonPin, type Engine } from '../../engine/kinematics.ts';
import { glowTexture } from '../materials.ts';
import { FLUID, SPARK } from '../palette.ts';
import type { EngineAnchors } from './anchors.ts';
import { flowMaterial, MAX_CHANNELS, type FlowMaterial } from './flow-material.ts';
import { pathLength, tightPath, type LayerPlan, type PartMaterial, type PartPlacement, type Space } from './route.ts';

const MM = 0.01;
/** Most corners the oil surface can have once cut by the pan's floor and top. */
const LEVEL_CORNERS = 8;

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
  private readonly spraySlot: Int32Array;
  /** Event inputs, set by the layer's feed each frame (1 = happened this frame), and their fading display. */
  readonly events: Float32Array;
  private readonly shown: Float32Array;
  private flashPoints: THREE.Points | null = null;
  private flashColors: THREE.BufferAttribute | null = null;
  private readonly flashSlots: Int32Array;
  private readonly flashBase: Float32Array;
  private spinners: THREE.InstancedMesh | null = null;
  private readonly spinnerData: Array<{ position: THREE.Vector3; axis: THREE.Vector3; ratio: number; length: number; radius: number }> = [];
  private readonly spinQuat = new THREE.Quaternion();
  /** Pairs of channel index and event slot. */
  private readonly slotChannels: Int32Array;
  private readonly baseQuat = new THREE.Quaternion();
  private readonly sprayCylinder: Int32Array;
  private readonly sprayFrom: Float32Array;
  private readonly sprayTo: Float32Array;
  private readonly fixedSprays: Array<{ mesh: THREE.InstancedMesh; channels: Int32Array; slots: Int32Array }> = [];
  private level: THREE.Mesh | null = null;
  private levelBox: NonNullable<LayerPlan['level']> | null = null;
  /** Corners of the clipped surface, x and z in turn: two buffers the clipping passes between. */
  private readonly clipA = new Float64Array(LEVEL_CORNERS * 2);
  private readonly clipB = new Float64Array(LEVEL_CORNERS * 2);
  private movers: THREE.InstancedMesh | null = null;
  private readonly moverData: Array<{ position: THREE.Vector3; axis: THREE.Vector3; travel: number; channel: number; turn: boolean; radius: number }> = [];
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
    this.events = new Float32Array(plan.slots ?? 0);
    this.shown = new Float32Array(plan.slots ?? 0);
    const linked = Object.entries(plan.channelSlots ?? {}).filter(([id]) => this.channels.includes(id));
    this.slotChannels = new Int32Array(linked.length * 2);
    linked.forEach(([id, slot], i) => {
      this.slotChannels[i * 2] = this.channels.indexOf(id);
      this.slotChannels[i * 2 + 1] = slot;
    });
    this.baseColor = new THREE.Color(style.color);
    this.phase = new Float32Array(n);
    this.root.userData.noFit = true;
    this.flow = flowMaterial(style.color, style.hotColor, style.period);
    this.overlayFlow = flowMaterial(style.color, style.hotColor, style.period, true);
    // Additive light needs no back-to-front order, so it draws in one pass despite being two-sided.
    this.sprayMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, forceSinglePass: true });
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
        ? new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.55, roughness: 0.6, metalness: 0.4, side: THREE.DoubleSide, depthWrite: false, forceSinglePass: true })
        : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.7 });
      this.materials.push(material);
      const mesh = new THREE.Mesh(merged, material);
      mesh.userData.partOf = group.keys;
      this.attach(mesh, group.space, shaft);
    }

    // Sprays that follow a piston, and sprays fixed to the engine or a shaft.
    const count = plan.pistonSprays.length;
    this.sprayChannel = new Int32Array(count);
    this.spraySlot = new Int32Array(count).fill(-1);
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
        this.spraySlot[i] = s.slot ?? -1;
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
      const slots = new Int32Array(list.length).fill(-1);
      list.forEach((s, i) => {
        channels[i] = this.channels.indexOf(s.channel);
        slots[i] = s.slot ?? -1;
        const dir = this.scratchA.subVectors(s.to, s.from);
        const len = dir.length();
        this.scratchQuat.setFromUnitVectors(UP, dir.normalize());
        this.scratchMatrix.compose(s.from, this.scratchQuat, this.scratchScale.set(1, len, 1));
        mesh.setMatrixAt(i, this.scratchMatrix);
        mesh.setColorAt(i, this.scratchColor.setRGB(0, 0, 0));
      });
      this.fixedSprays.push({ mesh, channels, slots });
      this.attach(mesh, list[0]!.space ?? 'mounted', shaft);
    }

    // Flashes: one Points object; each point's colour is its brightness, added over the scene.
    const flashes = plan.flashes ?? [];
    this.flashSlots = new Int32Array(flashes.length);
    this.flashBase = new Float32Array(flashes.length * 3);
    if (flashes.length) {
      const positions = new Float32Array(flashes.length * 3);
      flashes.forEach((f, i) => {
        positions[i * 3] = f.position.x;
        positions[i * 3 + 1] = f.position.y;
        positions[i * 3 + 2] = f.position.z;
        this.flashSlots[i] = f.slot;
        const c = new THREE.Color(f.color ?? SPARK.plug);
        this.flashBase[i * 3] = c.r;
        this.flashBase[i * 3 + 1] = c.g;
        this.flashBase[i * 3 + 2] = c.b;
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      this.flashColors = new THREE.BufferAttribute(new Float32Array(flashes.length * 3), 3);
      this.flashColors.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('color', this.flashColors);
      const size = (anchors.kind === 'piston' ? anchors.bore : anchors.R) * 0.55 * (flashes[0]!.size ?? 1);
      const material = new THREE.PointsMaterial({ size, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
      this.materials.push(material);
      this.flashPoints = new THREE.Points(geo, material);
      this.flashPoints.frustumCulled = false;
      this.flashPoints.renderOrder = 22;
      // Light, not a part: clicks pass through it.
      this.flashPoints.raycast = () => {};
      this.root.add(this.flashPoints);
    }

    if (plan.spinners?.length) {
      const arm = new THREE.BoxGeometry(1, 1, 1);
      arm.translate(0.5, 0, 0);
      const material = new THREE.MeshStandardMaterial({ color: '#d9d2c4', roughness: 0.5, metalness: 0.3 });
      this.materials.push(material);
      const mesh = new THREE.InstancedMesh(arm, material, plan.spinners.length);
      mesh.frustumCulled = false;
      mesh.userData.instanceParts = plan.spinners.map((sp) => sp.part);
      for (const sp of plan.spinners) this.spinnerData.push({ position: sp.position.clone(), axis: sp.axis.clone().normalize(), ratio: sp.ratio, length: sp.length, radius: sp.radius });
      this.spinners = mesh;
      this.root.add(mesh);
    }

    if (plan.movers?.length) {
      const disc = new THREE.CylinderGeometry(1, 1, 0.12, 18);
      const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(style.color).multiplyScalar(0.8), roughness: 0.4, metalness: 0.6 });
      this.materials.push(material);
      const mesh = new THREE.InstancedMesh(disc, material, plan.movers.length);
      mesh.frustumCulled = false;
      mesh.userData.instanceParts = plan.movers.map((m) => m.part);
      for (const m of plan.movers) this.moverData.push({ position: m.position.clone(), axis: m.axis.clone().normalize(), travel: m.travel, channel: this.channels.indexOf(m.channel), turn: !!m.turn, radius: m.radius });
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
      // A flat polygon of up to eight corners, rebuilt in place whenever the surface tilts (setOilSurface).
      const geo = new THREE.BufferGeometry();
      const positions = new THREE.BufferAttribute(new Float32Array(LEVEL_CORNERS * 3), 3);
      const normals = new THREE.BufferAttribute(new Float32Array(LEVEL_CORNERS * 3), 3);
      positions.setUsage(THREE.DynamicDrawUsage);
      normals.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('position', positions);
      geo.setAttribute('normal', normals);
      const fan: number[] = [];
      for (let i = 1; i < LEVEL_CORNERS - 1; i++) fan.push(0, i, i + 1);
      geo.setIndex(fan);
      const material = new THREE.MeshStandardMaterial({ color: FLUID.oilSurface, emissive: FLUID.oilSurfaceGlow, transparent: true, opacity: 0.62, roughness: 0.25, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false, forceSinglePass: true });
      this.materials.push(material);
      this.level = new THREE.Mesh(geo, material);
      this.level.userData.part = 'oil-level';
      this.levelBox = { ...l };
      this.levelCentre.set(0, l.y, (l.zMin + l.zMax) / 2);
      this.level.renderOrder = 4;
      this.root.add(this.level);
      this.setOilSurface(l.y, 0, 0);
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
   * Lifts and tilts the oil surface about the pan's centre, as a rotation by tiltX about X and then tiltZ about Z
   * would: the hook feature/oil-sump drives with the slosh. The surface is cut to the pan: inside its rectangle, above
   * its floor and below its top, however far it tilts. Allocates nothing.
   */
  setOilSurface(level: number, tiltX: number, tiltZ: number): void {
    const box = this.levelBox;
    if (!this.level || !box) return;
    const cx = this.levelCentre.x;
    const cz = this.levelCentre.z;
    // The plane y = y0 + sx x + sz z; its normal follows from the same rotation.
    const sx = Math.tan(tiltZ) / Math.cos(tiltX);
    const sz = -Math.tan(tiltX);
    const y0 = level - sx * cx - sz * cz;
    let a = this.clipA;
    let b = this.clipB;
    a[0] = -box.halfW; a[1] = box.zMin;
    a[2] = box.halfW; a[3] = box.zMin;
    a[4] = box.halfW; a[5] = box.zMax;
    a[6] = -box.halfW; a[7] = box.zMax;
    let n = 4;
    // Sutherland-Hodgman: first keep what is above the floor, then what is below the top.
    for (let pass = 0; pass < 2 && n > 0; pass++) {
      const sign = pass === 0 ? 1 : -1;
      const offset = pass === 0 ? y0 - box.bottom : box.top - y0;
      let m = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const px = a[i * 2]!;
        const pz = a[i * 2 + 1]!;
        const qx = a[j * 2]!;
        const qz = a[j * 2 + 1]!;
        const dp = offset + sign * (sx * px + sz * pz);
        const dq = offset + sign * (sx * qx + sz * qz);
        if (dp >= 0 && m < LEVEL_CORNERS) {
          b[m * 2] = px;
          b[m * 2 + 1] = pz;
          m++;
        }
        if (dp >= 0 !== dq >= 0 && m < LEVEL_CORNERS) {
          const t = dp / (dp - dq);
          b[m * 2] = px + (qx - px) * t;
          b[m * 2 + 1] = pz + (qz - pz) * t;
          m++;
        }
      }
      const swap = a;
      a = b;
      b = swap;
      n = m;
    }
    const geo = this.level.geometry;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
    const len = Math.hypot(sx, 1, sz);
    for (let i = 0; i < LEVEL_CORNERS; i++) {
      // Unused corners repeat the last one; the draw range leaves them out.
      const k = n ? Math.min(i, n - 1) : 0;
      const x = n ? a[k * 2]! : cx;
      const z = n ? a[k * 2 + 1]! : cz;
      pos.setXYZ(i, x, y0 + sx * x + sz * z, z);
      nor.setXYZ(i, -sx / len, 1 / len, -sz / len);
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
    geo.setDrawRange(0, Math.max(0, n - 2) * 3);
    geo.computeBoundingSphere();
    this.level.visible = n >= 3;
  }

  /** Corners of the oil surface as drawn now, engine frame: for tests. */
  get oilSurface(): THREE.Vector3[] {
    if (!this.level?.visible) return [];
    const geo = this.level.geometry;
    const pos = geo.getAttribute('position');
    const count = geo.drawRange.count / 3 + 2;
    return Array.from({ length: count }, (_, i) => new THREE.Vector3().fromBufferAttribute(pos, i));
  }

  /**
   * Moves the dashes. Speeds are physical (m/s); on screen they slow with the square root of the slow motion,
   * so flows stay readable while the crank crawls, and level off at the top so fast flows don't flicker.
   * `hold` stills them for a snapshot: the dashes stand where that many seconds of the flow carry them.
   */
  update(dt: number, timeScale: number, reducedMotion: boolean, theta = 0, hold?: number): void {
    const v = this.values;
    // Events light at once and fade over about 40 ms of real time, so a spark is seen even at full speed.
    // A held picture shows only what happens at its angle, not the glow left from before it stopped.
    const fade = hold === undefined ? Math.exp(-dt / 0.04) : 0;
    for (let i = 0; i < this.events.length; i++) this.shown[i] = Math.max(this.events[i]!, this.shown[i]! * fade);
    for (let i = 0; i < this.slotChannels.length; i += 2) v.level[this.slotChannels[i]!] = 0.15 + 0.85 * this.shown[this.slotChannels[i + 1]!]!;
    if (this.flashPoints && this.flashColors) {
      const colors = this.flashColors.array as Float32Array;
      for (let i = 0; i < this.flashSlots.length; i++) {
        const level = this.shown[this.flashSlots[i]!] ?? 0;
        colors[i * 3] = this.flashBase[i * 3]! * level;
        colors[i * 3 + 1] = this.flashBase[i * 3 + 1]! * level;
        colors[i * 3 + 2] = this.flashBase[i * 3 + 2]! * level;
      }
      this.flashColors.needsUpdate = true;
    }
    if (this.spinners) {
      for (let i = 0; i < this.spinnerData.length; i++) {
        const sp = this.spinnerData[i]!;
        this.baseQuat.setFromUnitVectors(UP, sp.axis);
        // The arm is built along X and turns about Y, which the base turn points along the part's axis.
        this.spinQuat.setFromAxisAngle(UP, -theta * sp.ratio * DEG);
        this.scratchQuat.multiplyQuaternions(this.baseQuat, this.spinQuat);
        this.scratchMatrix.compose(sp.position, this.scratchQuat, this.scratchScale.set(sp.length, sp.radius, sp.radius));
        this.spinners.setMatrixAt(i, this.scratchMatrix);
      }
      this.spinners.instanceMatrix.needsUpdate = true;
    }
    const scale = Math.sqrt(Math.max(0, Math.min(1, timeScale)));
    for (let i = 0; i < this.channels.length; i++) {
      const u = v.speed[i]! * scale;
      const shown = u > 1e-5 ? Math.max(0.12, 2.5 * (1 - Math.exp(-u / 1.5))) : 0;
      if (hold !== undefined) this.phase[i] = (shown * hold) % 1000;
      else if (!reducedMotion) this.phase[i] = (this.phase[i]! + shown * dt) % 1000;
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
        this.baseQuat.setFromUnitVectors(UP, m.axis);
        if (m.turn) {
          // A plate about a diameter: its face across the bore when shut, nearly edge-on when open.
          this.spinQuat.setFromAxisAngle(this.scratchB.set(1, 0, 0), (8 + 80 * Math.min(1, Math.max(0, value))) * DEG);
          this.scratchQuat.multiplyQuaternions(this.baseQuat, this.spinQuat);
        } else {
          this.scratchQuat.copy(this.baseQuat);
        }
        this.scratchA.copy(m.position).addScaledVector(m.axis, m.travel * value);
        this.scratchMatrix.compose(this.scratchA, this.scratchQuat, this.scratchScale.set(m.radius, m.radius, m.radius));
        this.movers.setMatrixAt(i, this.scratchMatrix);
      }
      this.movers.instanceMatrix.needsUpdate = true;
    }
    for (const { mesh, channels, slots } of this.fixedSprays) {
      for (let i = 0; i < channels.length; i++) {
        const spray = slots[i]! >= 0 ? this.shown[slots[i]!]! : channels[i]! >= 0 ? v.spray[channels[i]!]! : 0;
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
      const open = this.spraySlot[i]! >= 0 ? this.shown[this.spraySlot[i]!]! : this.sprayChannel[i]! >= 0 ? this.values.spray[this.sprayChannel[i]!]! : 0;
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
