// What the oil-on-track page adds to the X-ray of a piston engine: the oil in the pan as it sloshes, what the sump kind
// puts round the pickup (a factory baffle, a trap-door box with a windage screen and a crank scraper, head scavenge
// tubes and a deaeration chamber), a red ring when the screen draws air, bubbles in the suction tube, a sight glass on
// a dry sump's tank, an accumulator and the crank's height over the pan floor. At most eight draw calls, nothing
// allocated per frame. Engine frame, scene units (1 = 100 mm).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Engine } from '../../engine/kinematics.ts';
import type { SystemsSpec } from '../../engine/systems-spec.ts';
import { ACCUMULATOR_DEAD_L, ACCUMULATOR_L } from '../../lubrication/constants.ts';
import { sumpLayout, type PanShape, type SumpLayout } from '../../systems/sump.ts';
import type { EngineMount } from '../../vehicle/vehicle.ts';
import { PARTS } from '../parts-info.ts';
import { SYSTEM_PARTS } from '../systems/parts.ts';
import { SUMP_PARTS } from './parts.ts';

// The pickup ring and bubbles are the oil layer's pickup; both tables explain themselves on click.
Object.assign(PARTS, SYSTEM_PARTS, SUMP_PARTS);

const MM = 0.01;
const NX = 12;
const NZ = 24;
const OIL = new THREE.Color('#e8a93a');
const STEEL = new THREE.Color('#9aa1a6');
const DARK = new THREE.Color('#3a3d40');
const MARK = new THREE.Color('#f2f2f2');

/** What the page plays back at one moment. */
export interface SumpSceneFrame {
  levelOut: number;
  levelBox: number;
  slopeX: number;
  slopeZ: number;
  /** Share of oil at the screen and at the pump. */
  pickupOil: number;
  pumpSupply: number;
  /** L/s into the compartment: its doors open while it fills. */
  boxFlow: number;
  /** Shares 0..1. */
  heads: ArrayLike<number>;
  tankShare: number;
  accumulatorShare: number;
  /** Seconds since the last frame, for the bubbles. */
  dt: number;
  /** Speed of the oil through the suction tube, m/s. */
  tubeSpeed: number;
}

interface Piece {
  geo: THREE.BufferGeometry;
  part: string;
  color: THREE.Color;
}

/** Merges pieces into one mesh that still tells each part apart on click (aPart, userData.partOf). */
function mergedMesh(pieces: Piece[], material: THREE.Material): THREE.Mesh {
  const keys: string[] = [];
  const geos = pieces.map(({ geo, part, color }) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    const n = g.getAttribute('position').count;
    let k = keys.indexOf(part);
    if (k < 0) k = keys.push(part) - 1;
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(n).fill(k), 1));
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) color.toArray(colors, i * 3);
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return g;
  });
  const mesh = new THREE.Mesh(mergeGeometries(geos, false)!, material);
  mesh.userData.partOf = keys;
  return mesh;
}

const boxAt = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): THREE.BufferGeometry => {
  const g = new THREE.BoxGeometry(Math.max(1e-4, sx), Math.max(1e-4, sy), Math.max(1e-4, sz));
  g.translate(cx, cy, cz);
  return g;
};

const tube = (points: THREE.Vector3[], radius: number): THREE.BufferGeometry => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.1), 24, radius, 6, false);

export interface SumpSceneOptions {
  accumulator: boolean;
  /** Bank angles of the heads, degrees, for the puddles and the scavenge tubes. */
  heads: number[];
  /** Pump inlet: height and position along the crank. */
  inlet: { y: number; z: number };
}

export class SumpScene {
  readonly root = new THREE.Group();
  readonly layout: SumpLayout;
  readonly shape: PanShape;
  private readonly materials: THREE.Material[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  readonly oilBody: THREE.Mesh;
  private readonly floor: Float32Array;
  private readonly ceil: Float32Array;
  private readonly inBox: Uint8Array;
  private readonly gridX: Float32Array;
  private readonly gridZ: Float32Array;
  readonly doors: THREE.InstancedMesh | null = null;
  private readonly doorData: Array<{ hinge: THREE.Vector3; normal: THREE.Vector3; w: number; h: number; outside: THREE.Vector2 }> = [];
  readonly ring: THREE.Mesh | null = null;
  readonly bubbles: THREE.Points | null = null;
  private readonly bubblePath: THREE.Vector3[] = [];
  private readonly bubblePhase: Float32Array;
  readonly puddles: THREE.InstancedMesh | null = null;
  private readonly puddleData: Array<{ position: THREE.Vector3; rotation: number; size: THREE.Vector3 }> = [];
  readonly sightOil: THREE.Mesh | null = null;
  readonly accumulatorOil: THREE.Mesh | null = null;
  private readonly accumulatorSpan = { z0: 0, length: 1 };
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();

  constructor(engine: Engine, systems: SystemsSpec, mount: EngineMount, o: SumpSceneOptions) {
    this.layout = sumpLayout(engine, systems, { mount });
    const shape = (this.shape = this.layout.shape);
    const b = engine.spec.bore * MM;
    const r = engine.r * MM;
    const W = 2 * shape.halfW;
    const L = shape.zMax - shape.zMin;
    const zMid = (shape.zMin + shape.zMax) / 2;
    const steel = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.6, roughness: 0.45 });
    this.materials.push(steel);
    const pieces: Piece[] = [];
    const add = (geo: THREE.BufferGeometry, part: string, color = STEEL): void => {
      pieces.push({ geo, part, color });
    };
    const t = 2.5 * MM;

    const box = shape.box;
    const track = shape.kind === 'baffled' || shape.kind === 'integrated-dry';
    if (shape.kind === 'wet') {
      // A factory pan's low baffles where the shelves step down into the well, with a cut-out for the oil to pass.
      const top = shape.yShelf + 0.5 * (shape.yFull - shape.yShelf) + 0.01;
      const h = top - shape.yShelf;
      const w = shape.well;
      const along = w.x1 - w.x0 > W - 1e-6;
      for (const edge of along ? [w.z0, w.z1] : [w.x0, w.x1]) {
        if (along && (edge <= shape.zMin + 1e-6 || edge >= shape.zMax - 1e-6)) continue;
        if (!along && (edge <= -shape.halfW + 1e-6 || edge >= shape.halfW - 1e-6)) continue;
        const span = along ? W : L;
        const piece = span * 0.38;
        for (const side of [-1, 1]) {
          const c = side * (span / 2 - piece / 2);
          add(along ? boxAt(c, shape.yShelf + h / 2, edge, piece, h, t) : boxAt(edge, shape.yShelf + h / 2, zMid + c, t, h, piece), 'sump-baffle');
        }
      }
    }
    if (box && track) {
      // A track pan's box round the pickup: four walls, each with a trap door at its foot, under a lid.
      const bottom = shape.yFloor;
      const height = box.top - bottom;
      const walls: Array<{ along: 'x' | 'z'; at: number; from: number; to: number; normal: THREE.Vector3 }> = [
        { along: 'x', at: box.z0, from: box.x0, to: box.x1, normal: new THREE.Vector3(0, 0, 1) },
        { along: 'x', at: box.z1, from: box.x0, to: box.x1, normal: new THREE.Vector3(0, 0, -1) },
        { along: 'z', at: box.x0, from: box.z0, to: box.z1, normal: new THREE.Vector3(1, 0, 0) },
        { along: 'z', at: box.x1, from: box.z0, to: box.z1, normal: new THREE.Vector3(-1, 0, 0) },
      ];
      for (const wall of walls) {
        const span = wall.to - wall.from;
        const doorW = Math.min(0.6, span * 0.4);
        const doorH = Math.min(0.3, height * 0.45);
        const mid = (wall.from + wall.to) / 2;
        const side = (span - doorW) / 2;
        const segs: Array<[number, number, number, number]> = [
          [wall.from + side / 2, bottom + height / 2, side, height],
          [wall.to - side / 2, bottom + height / 2, side, height],
          [mid, bottom + doorH + (height - doorH) / 2, doorW, height - doorH],
        ];
        for (const [c, y, len, h] of segs) add(wall.along === 'x' ? boxAt(c, y, wall.at, len, h, t) : boxAt(wall.at, y, c, t, h, len), 'sump-box');
        const hinge = wall.along === 'x' ? new THREE.Vector3(mid, bottom + doorH, wall.at) : new THREE.Vector3(wall.at, bottom + doorH, mid);
        const outside = new THREE.Vector2(hinge.x - wall.normal.x * 0.05, hinge.z - wall.normal.z * 0.05);
        this.doorData.push({ hinge, normal: wall.normal, w: doorW, h: doorH, outside });
      }
      // The windage screen over the well, level with the box's lid: a grid of thin bars.
      const w = shape.well;
      const bars = 9;
      for (let i = 0; i <= bars; i++) {
        const x = w.x0 + ((w.x1 - w.x0) * i) / bars;
        add(boxAt(x, box.top, (w.z0 + w.z1) / 2, 1.2 * MM, 1.2 * MM, w.z1 - w.z0), 'windage-screen');
        const z = w.z0 + ((w.z1 - w.z0) * i) / bars;
        add(boxAt((w.x0 + w.x1) / 2, box.top, z, w.x1 - w.x0, 1.2 * MM, 1.2 * MM), 'windage-screen');
      }
      // The crank scraper: a curved blade a few millimetres off the counterweights, on the side they throw oil.
      const orbit = r + 0.3 * b + 3 * MM;
      const zLen = (engine.zMax - engine.zMin) * MM;
      const zc = ((engine.zMax + engine.zMin) / 2) * MM;
      for (let k = 0; k < 6; k++) {
        const a = ((105 + k * 9) * Math.PI) / 180;
        const g = new THREE.BoxGeometry(0.16 * orbit, t, zLen);
        g.rotateZ(-a);
        g.translate(Math.sin(a) * orbit, Math.cos(a) * orbit, zc);
        add(g, 'crank-scraper');
      }
    }
    if (shape.kind === 'integrated-dry' && shape.pickup) {
      // Scavenge stages pull oil out of each head down to a deaeration chamber by the pump.
      const p = shape.pickup;
      const chamber = new THREE.Vector3(p.x + 0.35 * b, shape.yShelf + 0.12 * b, p.z + 0.3 * b);
      const cyl = new THREE.CylinderGeometry(0.16 * b, 0.16 * b, 0.36 * b, 16);
      cyl.translate(chamber.x, chamber.y, chamber.z);
      add(cyl, 'deaeration', DARK);
      for (const alpha of o.heads) {
        const a = (alpha * Math.PI) / 180;
        const reach = engine.deck * MM * 0.9;
        const head = new THREE.Vector3(Math.sin(a) * reach, Math.cos(a) * reach - 0.25 * b, shape.zMin + 0.1 * b);
        const down = new THREE.Vector3(Math.sign(Math.sin(a) || 1) * (shape.halfW + 0.12 * b), shape.top - 0.05, shape.zMin + 0.1 * b);
        add(tube([head, down, new THREE.Vector3(down.x, chamber.y, chamber.z), chamber.clone()], 0.025 * b), 'head-scavenge', DARK);
      }
    }
    // The crank's height over the pan floor: a white rule at the front of the pan.
    {
      const x = shape.halfW + 0.12;
      const z = shape.zMax + 0.05;
      const g = new THREE.CylinderGeometry(0.008, 0.008, -shape.yFloor, 6);
      g.translate(x, shape.yFloor / 2, z);
      add(g, 'crank-height', MARK);
      for (const y of [0, shape.yFloor]) add(boxAt(x, y, z, 0.12, 0.012, 0.012), 'crank-height', MARK);
    }
    // A dry sump's tank gets a sight glass with its level; an accumulator stands beside the engine.
    const tank = this.layout.tank;
    if (tank) {
      const glass = new THREE.CylinderGeometry(0.035, 0.035, tank.height, 10, 1, true);
      glass.translate(tank.position.x, tank.position.y, tank.position.z + tank.radius + 0.05);
      add(glass, 'sight-glass', new THREE.Color('#c9d6dc'));
      const oil = new THREE.CylinderGeometry(0.028, 0.028, 1, 10);
      oil.translate(0, 0.5, 0);
      const material = new THREE.MeshStandardMaterial({ color: OIL, emissive: '#5a3405', roughness: 0.3 });
      this.materials.push(material);
      this.sightOil = new THREE.Mesh(oil, material);
      this.sightOil.position.set(tank.position.x, tank.position.y - tank.height / 2, tank.position.z + tank.radius + 0.05);
      this.sightOil.userData.part = 'sight-glass';
      this.root.add(this.sightOil);
      this.geometries.push(oil);
      this.sightOil.userData.height = tank.height;
    }
    if (o.accumulator && shape.kind !== 'dry') {
      // A 3-quart Accusump, 4¼ x 16 inches, lying along the engine, with its hose to the gallery by the filter.
      const radius = 108 * MM * 0.5;
      const length = 406 * MM;
      const x = shape.halfW + 1.0;
      const y = shape.yFloor + 0.4;
      const z0 = zMid - length / 2;
      const glassGeo = new THREE.CylinderGeometry(radius, radius, length, 20, 1, false);
      glassGeo.rotateX(Math.PI / 2);
      glassGeo.translate(x, y, zMid);
      const glassMat = new THREE.MeshStandardMaterial({ color: '#cfe3ea', transparent: true, opacity: 0.22, roughness: 0.1, depthWrite: false });
      this.materials.push(glassMat);
      const glass = new THREE.Mesh(glassGeo, glassMat);
      glass.userData.part = 'accumulator';
      glass.renderOrder = 7;
      this.root.add(glass);
      this.geometries.push(glassGeo);
      // Oil from the valve end up to the piston, the piston a dark disc at its far end; scaled along Z each frame.
      const oilGeo = new THREE.CylinderGeometry(radius * 0.92, radius * 0.92, 1, 20);
      oilGeo.rotateX(Math.PI / 2);
      oilGeo.translate(0, 0, 0.5);
      const piston = new THREE.CylinderGeometry(radius * 0.95, radius * 0.95, 0.04, 20);
      piston.rotateX(Math.PI / 2);
      piston.translate(0, 0, 1);
      const oilMesh = mergedMesh([{ geo: oilGeo, part: 'accumulator', color: OIL }, { geo: piston, part: 'accumulator', color: DARK }], new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35 }));
      this.materials.push(oilMesh.material as THREE.Material);
      oilMesh.position.set(x, y, z0);
      this.root.add(oilMesh);
      this.accumulatorOil = oilMesh;
      this.accumulatorSpan.z0 = z0;
      this.accumulatorSpan.length = length;
      add(tube([new THREE.Vector3(x, y, z0), new THREE.Vector3(x, y, z0 - 0.2), new THREE.Vector3(shape.halfW + 0.1, shape.top + 0.3, z0 - 0.2), new THREE.Vector3(shape.halfW, shape.top + 0.4, zMid - 0.3)], 0.025), 'accumulator', DARK);
    }

    const internals = mergedMesh(pieces, steel);
    internals.renderOrder = 6;
    this.root.add(internals);
    this.geometries.push(internals.geometry);

    if (this.doorData.length) {
      const plate = new THREE.BoxGeometry(1, 1, 1);
      // Hinged at the top edge: the plate hangs below its origin.
      plate.translate(0, -0.5, 0);
      const material = new THREE.MeshStandardMaterial({ color: '#c3c8cc', metalness: 0.7, roughness: 0.4 });
      this.materials.push(material);
      this.geometries.push(plate);
      this.doors = new THREE.InstancedMesh(plate, material, this.doorData.length);
      this.doors.userData.instanceParts = this.doorData.map(() => 'trap-door');
      this.doors.frustumCulled = false;
      this.root.add(this.doors);
      this.setDoors(new Float32Array(this.doorData.length));
    }

    // The oil itself: a height field over the pan's columns plus a skirt round its edge, one mesh, one draw call.
    const vx = NX + 1;
    const vz = NZ + 1;
    const inset = 2 * MM;
    this.gridX = new Float32Array(vx);
    this.gridZ = new Float32Array(vz);
    for (let i = 0; i < vx; i++) this.gridX[i] = -shape.halfW + inset + ((W - 2 * inset) * i) / NX;
    for (let j = 0; j < vz; j++) this.gridZ[j] = shape.zMin + inset + ((L - 2 * inset) * j) / NZ;
    const surface = vx * vz;
    const perimeter = 2 * (NX + NZ);
    const count = surface + 2 * (perimeter + 1);
    this.floor = new Float32Array(surface);
    this.ceil = new Float32Array(surface);
    this.inBox = new Uint8Array(surface);
    const w = shape.well;
    for (let j = 0; j < vz; j++) {
      for (let i = 0; i < vx; i++) {
        const x = this.gridX[i]!;
        const z = this.gridZ[j]!;
        const k = j * vx + i;
        const inWell = x >= w.x0 - 1e-6 && x <= w.x1 + 1e-6 && z >= w.z0 - 1e-6 && z <= w.z1 + 1e-6;
        this.floor[k] = (inWell ? shape.yFloor : shape.yShelf) + 1 * MM;
        const inside = !!box && x >= box.x0 && x <= box.x1 && z >= box.z0 && z <= box.z1;
        this.inBox[k] = inside ? 1 : 0;
        this.ceil[k] = inside && track ? box!.top : shape.top;
      }
    }
    const geo = new THREE.BufferGeometry();
    const pos = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    const col = new THREE.BufferAttribute(new Float32Array(count * 4), 4);
    pos.setUsage(THREE.DynamicDrawUsage);
    col.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', pos);
    geo.setAttribute('color', col);
    const index: number[] = [];
    for (let j = 0; j < NZ; j++) {
      for (let i = 0; i < NX; i++) {
        const a = j * vx + i;
        index.push(a, a + vx, a + 1, a + 1, a + vx, a + vx + 1);
      }
    }
    for (let e = 0; e < perimeter; e++) {
      const top = surface + 2 * e;
      index.push(top, top + 1, top + 2, top + 2, top + 1, top + 3);
    }
    geo.setIndex(index);
    this.geometries.push(geo);
    const oilMat = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, roughness: 0.25, metalness: 0.05, emissive: '#5a3405', side: THREE.DoubleSide, depthWrite: false, forceSinglePass: true });
    this.materials.push(oilMat);
    this.oilBody = new THREE.Mesh(geo, oilMat);
    this.oilBody.userData.part = 'oil-body';
    this.oilBody.renderOrder = 6;
    this.oilBody.frustumCulled = false;
    this.root.add(this.oilBody);
    this.perimeter = [];
    for (let i = 0; i < NX; i++) this.perimeter.push(i);
    for (let j = 0; j < NZ; j++) this.perimeter.push(j * vx + NX);
    for (let i = NX; i > 0; i--) this.perimeter.push(NZ * vx + i);
    for (let j = NZ; j > 0; j--) this.perimeter.push(j * vx);
    this.perimeter.push(0);

    // What the pump draws: a ring round the screen when it takes air, bubbles up the tube to the pump.
    const p = shape.pickup;
    if (p) {
      const ringGeo = new THREE.TorusGeometry(p.radius * 1.25, 0.012, 8, 32);
      ringGeo.rotateX(Math.PI / 2);
      ringGeo.translate(p.x, p.y + p.bell, p.z);
      const ringMat = new THREE.MeshBasicMaterial({ color: '#ff3b2f', transparent: true, opacity: 0, depthTest: false });
      this.materials.push(ringMat);
      this.geometries.push(ringGeo);
      this.ring = new THREE.Mesh(ringGeo, ringMat);
      this.ring.userData.part = 'oil-pickup';
      this.ring.renderOrder = 9;
      this.root.add(this.ring);
      const a = new THREE.Vector3(p.x, p.y + p.bell, p.z);
      const up = new THREE.Vector3(p.x, Math.min(o.inlet.y, p.y + 0.6 * b), p.z);
      this.bubblePath.push(a, up, new THREE.Vector3(0, o.inlet.y, (up.z + o.inlet.z) / 2), new THREE.Vector3(0, o.inlet.y, o.inlet.z));
      const n = 28;
      this.bubblePhase = new Float32Array(n);
      for (let i = 0; i < n; i++) this.bubblePhase[i] = i / n;
      const bubbleGeo = new THREE.BufferGeometry();
      const bp = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
      bp.setUsage(THREE.DynamicDrawUsage);
      bubbleGeo.setAttribute('position', bp);
      this.geometries.push(bubbleGeo);
      const bubbleMat = new THREE.PointsMaterial({ color: '#ffffff', size: 0.045, transparent: true, opacity: 0, depthTest: false });
      this.materials.push(bubbleMat);
      this.bubbles = new THREE.Points(bubbleGeo, bubbleMat);
      this.bubbles.userData.part = 'oil-pickup';
      this.bubbles.renderOrder = 9;
      this.bubbles.frustumCulled = false;
      this.root.add(this.bubbles);
    } else {
      this.bubblePhase = new Float32Array(0);
    }

    // Oil standing in each head: a puddle at the head's low point, as deep as its share of what the head holds.
    if (o.heads.length) {
      const plate = new THREE.BoxGeometry(1, 1, 1);
      this.geometries.push(plate);
      const material = new THREE.MeshStandardMaterial({ color: OIL, emissive: '#5a3405', transparent: true, opacity: 0.55, roughness: 0.3, depthWrite: false });
      this.materials.push(material);
      this.puddles = new THREE.InstancedMesh(plate, material, o.heads.length);
      this.puddles.userData.instanceParts = o.heads.map(() => 'head-oil');
      this.puddles.frustumCulled = false;
      this.puddles.renderOrder = 6;
      for (const alpha of o.heads) {
        const a = (alpha * Math.PI) / 180;
        // A slab in the middle of the head that grows as the head fills: how much oil is held up there.
        const reach = engine.deck * MM + 0.35 * b;
        this.puddleData.push({
          position: new THREE.Vector3(Math.sin(a) * reach, Math.cos(a) * reach, ((engine.zMax + engine.zMin) / 2) * MM),
          rotation: -a,
          size: new THREE.Vector3(0.3 * b, 0.3 * b, ((engine.zMax - engine.zMin) * MM + 0.4 * b) * 0.85),
        });
      }
      this.root.add(this.puddles);
    }
  }

  private readonly perimeter: number[];

  addTo(mounted: THREE.Object3D): void {
    mounted.add(this.root);
  }

  /** Objects that cost a draw call, for the budget test. */
  get drawn(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    this.root.traverse((o) => ((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints ? out.push(o) : undefined));
    return out;
  }

  private setDoors(open: ArrayLike<number>): void {
    if (!this.doors) return;
    for (let i = 0; i < this.doorData.length; i++) {
      const d = this.doorData[i]!;
      // Turned about the hinge's axis (the wall's own direction) inward, by up to 60°.
      const axis = this.v.set(d.normal.z, 0, -d.normal.x);
      this.q.setFromAxisAngle(axis, -Math.min(1, Math.max(0, open[i]!)) * (Math.PI / 3));
      const wide = Math.abs(d.normal.z) > 0.5;
      this.s.set(wide ? d.w : 2 * MM, d.h, wide ? 2 * MM : d.w);
      this.m4.compose(d.hinge, this.q, this.s);
      this.doors.setMatrixAt(i, this.m4);
    }
    this.doors.instanceMatrix.needsUpdate = true;
  }

  private readonly doorOpen = new Float32Array(4);

  update(f: SumpSceneFrame): void {
    const shape = this.shape;
    const geo = this.oilBody.geometry;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const col = geo.getAttribute('color') as THREE.BufferAttribute;
    const posA = pos.array as Float32Array;
    const colA = col.array as Float32Array;
    const vx = NX + 1;
    const vz = NZ + 1;
    const surface = vx * vz;
    for (let j = 0; j < vz; j++) {
      const z = this.gridZ[j]!;
      for (let i = 0; i < vx; i++) {
        const x = this.gridX[i]!;
        const k = j * vx + i;
        const h = this.inBox[k] ? f.levelBox : f.levelOut;
        const raw = h + f.slopeX * x + f.slopeZ * z;
        const fl = this.floor[k]!;
        const y = Math.min(this.ceil[k]!, Math.max(fl, raw));
        posA[k * 3] = x;
        posA[k * 3 + 1] = y;
        posA[k * 3 + 2] = z;
        colA[k * 4] = OIL.r;
        colA[k * 4 + 1] = OIL.g;
        colA[k * 4 + 2] = OIL.b;
        colA[k * 4 + 3] = raw > fl + 1.5 * MM ? 0.86 : 0;
      }
    }
    // The skirt: from the floor up to the surface along the edge.
    const per = this.perimeter;
    for (let e = 0; e < per.length; e++) {
      const k = per[e]!;
      const top = surface + 2 * e;
      const x = posA[k * 3]!;
      const z = posA[k * 3 + 2]!;
      posA[top * 3] = x;
      posA[top * 3 + 1] = posA[k * 3 + 1]!;
      posA[top * 3 + 2] = z;
      posA[(top + 1) * 3] = x;
      posA[(top + 1) * 3 + 1] = this.floor[k]!;
      posA[(top + 1) * 3 + 2] = z;
      const alpha = colA[k * 4 + 3]!;
      for (let v = top; v <= top + 1; v++) {
        colA[v * 4] = OIL.r * 0.8;
        colA[v * 4 + 1] = OIL.g * 0.8;
        colA[v * 4 + 2] = OIL.b * 0.8;
        colA[v * 4 + 3] = alpha;
      }
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    geo.computeVertexNormals();

    if (this.doors && shape.box) {
      for (let i = 0; i < this.doorData.length; i++) {
        const d = this.doorData[i]!;
        const outside = f.levelOut + f.slopeX * d.outside.x + f.slopeZ * d.outside.y;
        const inside = f.levelBox + f.slopeX * d.hinge.x + f.slopeZ * d.hinge.z;
        // A door opens inward while oil outside stands above the oil inside and the box is filling.
        this.doorOpen[i] = f.boxFlow > 0 && outside > inside ? Math.min(1, (outside - inside) / 0.04) : 0;
      }
      this.setDoors(this.doorOpen);
    }
    if (this.ring) (this.ring.material as THREE.MeshBasicMaterial).opacity = Math.min(1, 1.6 * (1 - f.pickupOil));
    if (this.bubbles) {
      const air = 1 - f.pumpSupply;
      const mat = this.bubbles.material as THREE.PointsMaterial;
      mat.opacity = air > 0.12 ? Math.min(1, air * 1.8) : 0;
      const attr = this.bubbles.geometry.getAttribute('position') as THREE.BufferAttribute;
      const path = this.bubblePath;
      let total = 0;
      for (let i = 1; i < path.length; i++) total += path[i]!.distanceTo(path[i - 1]!);
      // Shown at a tenth of the real speed, so the bubbles can be followed.
      const step = (Math.min(3, f.tubeSpeed) * 0.1 * f.dt) / Math.max(total * 0.1, 1e-3);
      for (let n = 0; n < this.bubblePhase.length; n++) {
        const ph = (this.bubblePhase[n]! + step) % 1;
        this.bubblePhase[n] = ph;
        let d = ph * total;
        let i = 1;
        while (i < path.length - 1 && d > path[i]!.distanceTo(path[i - 1]!)) {
          d -= path[i]!.distanceTo(path[i - 1]!);
          i++;
        }
        const a = path[i - 1]!;
        const bpt = path[i]!;
        const share = Math.min(1, d / Math.max(1e-6, a.distanceTo(bpt)));
        attr.setXYZ(n, a.x + (bpt.x - a.x) * share + Math.sin(n * 7.3) * 0.006, a.y + (bpt.y - a.y) * share, a.z + (bpt.z - a.z) * share + Math.cos(n * 3.1) * 0.006);
      }
      attr.needsUpdate = true;
    }
    if (this.puddles) {
      for (let i = 0; i < this.puddleData.length; i++) {
        const d = this.puddleData[i]!;
        const share = Math.min(1, Math.max(0.001, f.heads[i] ?? 0));
        this.q.setFromAxisAngle(this.v.set(0, 0, 1), d.rotation);
        const k = Math.sqrt(share);
        this.s.set(d.size.x * k, d.size.y * k, d.size.z);
        this.m4.compose(d.position, this.q, this.s);
        this.puddles.setMatrixAt(i, this.m4);
      }
      this.puddles.instanceMatrix.needsUpdate = true;
    }
    if (this.sightOil) this.sightOil.scale.set(1, Math.max(0.001, f.tankShare) * (this.sightOil.userData.height as number), 1);
    if (this.accumulatorOil) this.accumulatorOil.scale.set(1, 1, Math.max(0.02, f.accumulatorShare) * this.accumulatorSpan.length);
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}

/** Accumulator fill shown: oil over the most it can hold. */
export const accumulatorShare = (oilL: number): number => oilL / (ACCUMULATOR_L - ACCUMULATOR_DEAD_L);
