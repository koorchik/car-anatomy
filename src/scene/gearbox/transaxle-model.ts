// Parametric 3D model of a two-shaft transaxle (stage K6a-3d): the input and output shafts with a pair per speed,
// sleeves on both shafts, the reverse idler, the final drive (a helical pair, or a straight bevel crown wheel and
// pinion), the limited-slip differential's case, the halfshaft stubs with their inner joints, the case, the
// differential's housing and the bellhousing. Built from the derived Gearbox of topology.ts and the layout of
// layouts/transaxle.ts (transaxleFrame), the same layout the car reads its halfshafts' inner joints from.
//
// Frame (`mounted`): the gearbox frame of layouts/transaxle.ts in scene units: the input axis is Z at x = y = 0, spec
// millimetres behind the case's front face map to −z·MM, so the engine sits at +Z as in kinematics.ts. A member on an
// axis across the shafts (the crown wheel's) has its frame turned so that its own Z runs along ∓X.
//
// Each member is one group turned by its own angle, as in gearbox-model.ts; a cylindrical gear sits in it at its
// phase from topology.ts, the bevel pair at phases set here (tooth on tooth's gap where the pitch cones touch). The
// differential's case and the stubs turn with the case: on the table both wheels turn alike.
//
// Implements the SceneModel<GearboxFrame> contract structurally (scene-base.ts).

import * as THREE from 'three';
import { transaxleFrame, TRANSAXLE_LAYOUT, type GearboxPoint, type TransaxleFrame } from '../../drivetrain/layouts/transaxle.ts';
import type { GearDef, SleevePlace } from '../../drivetrain/spec.ts';
import type { Gearbox } from '../../drivetrain/topology.ts';
import { extrude, gearShape, hullShape, merge, MM, zCylinder, type Pulley2D } from '../geometry.ts';
import { brassMaterial, castAluminiumMaterial } from '../materials.ts';
import { tag } from '../model-types.ts';
import { acquireBevelGeometry, bevelSize } from './bevel-mesh.ts';
import { acquireGearGeometry, drawnGear, type MeshQuality } from './gear-mesh.ts';
import type { GearboxFrame } from './gearbox-model.ts';
import { GearboxSceneBase, lathe, ring } from './scene-base.ts';

export interface TransaxleModelOptions {
  /** Points per tooth and layers: 'low' for phones and slow machines. */
  quality?: MeshQuality;
  /** The flywheel the bellhousing wraps, mm: in a car its engine's (packaging.ts, flywheelRadiusMm). Default TRANSAXLE_LAYOUT.flywheelMm. */
  flywheelRadiusMm?: number;
  /**
   * Inner joint centres the two stubs reach, gearbox frame (mm, z behind the front face), in the order of
   * transaxleFrame().stubs: in a car, the left joint of DriveCar.diffOutputs and its mirror. Default: the layout's own
   * short stubs.
   */
  stubs?: [GearboxPoint, GearboxPoint];
}

// Layout estimates (not data), as fractions of the input-to-output centre distance a unless marked mm.
const INPUT_SHAFT = 0.17;
const OUTPUT_SHAFT = 0.19;
const IDLER_SHAFT = 0.12;
const IDLER_STUB = 8;
const STUB_CLEAR = 1;
const NEEDLE = 0.07;
const HUB = 0.4;
const SLEEVE = 0.52;
const GROOVE_DEPTH = 0.06;
const RAIL = 0.085;
const RAIL_CLEAR = 0.12;
/** Halfshaft stub and inner joint housing, in differential case radii. */
const STUB = 0.24;
const JOINT = 0.62;

const TAU = Math.PI * 2;
const wrap = (angle: number): number => angle - Math.floor(angle / TAU) * TAU;

interface MemberView {
  id: string;
  index: number;
  /** Axis position, mm, relative to the input axis. */
  x: number;
  y: number;
  /** A crown wheel's axis across the shafts: where it crosses, mm behind the front face. */
  across: number | null;
  /** Carries its own shaft or body (input, output, differential); otherwise it turns on a shaft. */
  shaft: boolean;
  frame: THREE.Group;
  spin: THREE.Group;
}

interface GearView {
  id: string;
  def: GearDef;
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  meshes: number[];
  /** Tip radius and bore as drawn, mm. */
  tip: number;
  bore: number;
}

interface SleeveView {
  place: SleevePlace;
  sliders: THREE.Object3D[];
  travel: number;
}

export class TransaxleModel extends GearboxSceneBase {
  readonly box: Gearbox;
  readonly layout: TransaxleFrame;
  private readonly quality: MeshQuality;
  private readonly members: MemberView[] = [];
  private readonly gears: GearView[] = [];
  private readonly sleeveViews: SleeveView[] = [];
  /** Input to output shaft, mm. */
  private readonly a: number;
  private readonly steel: THREE.MeshStandardMaterial;
  /** The crown wheel's side of the pinion's axis along X (bevel final drive), else 0. */
  private readonly side: number;
  private readonly stubEnds: [GearboxPoint, GearboxPoint];
  /** z range of the speed gears, mm: rails and the main case follow it. */
  private stackFront = 0;
  private stackBack = 0;
  private railSpots: Array<{ x: number; y: number }> = [];

  constructor(box: Gearbox, options: TransaxleModelOptions = {}) {
    super();
    const spec = box.spec;
    if (!spec.finalDrive) throw new Error(`${spec.id}: not a transaxle with its final drive inside`);
    this.box = box;
    this.layout = transaxleFrame(spec);
    this.quality = options.quality ?? 'high';
    this.side = spec.finalDrive.kind === 'bevel' ? (spec.finalDrive.side ?? 1) : 0;
    this.stubEnds = options.stubs ?? this.layout.stubs;
    const axes = new Map(spec.axes.map((ax) => [ax.id, ax]));
    const out = axes.get(spec.members.find((m) => m.id === spec.finalDrive!.shaft)!.axis)!;
    this.a = Math.hypot(out.x, out.y);
    this.steel = this.own(new THREE.MeshStandardMaterial({ color: '#a9adb1', metalness: 1, roughness: 0.32 }));

    const perAxis = new Map<string, number>();
    for (const m of spec.members) perAxis.set(m.axis, (perAxis.get(m.axis) ?? 0) + 1);
    spec.members.forEach((m, index) => {
      const ax = axes.get(m.axis)!;
      const frame = new THREE.Group();
      const across = ax.across ?? null;
      if (across === null) {
        frame.position.set(ax.x * MM, ax.y * MM, 0);
      } else {
        // Its own Z along −X for side −1… along +X: the crown wheel then lies on its −Z, like a pinion.
        frame.position.set(ax.x * MM, ax.y * MM, -across * MM);
        frame.rotation.y = (this.side < 0 ? 1 : -1) * (Math.PI / 2);
      }
      const spin = new THREE.Group();
      frame.add(spin);
      this.mounted.add(frame);
      const shaft = m.id === spec.input || m.id === spec.output || m.id === spec.finalDrive!.shaft;
      this.members.push({ id: m.id, index, x: ax.x, y: ax.y, across, shaft, frame, spin });
    });

    try {
      this.buildGears();
      this.buildShafts();
      this.buildSynchros();
      this.buildDifferential();
      this.buildCase(options.flywheelRadiusMm ?? TRANSAXLE_LAYOUT.flywheelMm);
    } catch (error) {
      this.dispose();
      throw error;
    }

    // Stand it on the floor, centred along its length, the input axis at x = 0.
    this.mounted.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(this.mounted);
    this.mounted.position.set(0, -bounds.min.y, -(bounds.min.z + bounds.max.z) / 2);
    this.setView('xray');
  }

  // ---- Building ----

  private member(id: string): MemberView {
    return this.members.find((m) => m.id === id)!;
  }

  private shaftRadius(m: MemberView): number {
    const spec = this.box.spec;
    // A shaft is never thicker than the root of a gear cut on it.
    const roots = () => Math.min(...spec.gears.filter((g) => g.member === m.id && g.cone === undefined).map((g) => drawnGear({ ...g, boreRadius: 0 }).rf - 1));
    if (m.id === spec.input) return Math.min(INPUT_SHAFT * this.a, roots());
    if (m.id === spec.finalDrive!.shaft) return Math.min(OUTPUT_SHAFT * this.a, roots());
    // A loose gear turns on the shaft of its axis; the idler on a standing shaft of its own.
    const owner = this.members.find((o) => o.shaft && o.across === null && Math.hypot(o.x - m.x, o.y - m.y) < 1e-6 && o.id !== spec.output);
    if (owner) return this.shaftRadius(owner);
    const rf = Math.min(...spec.gears.filter((g) => g.member === m.id).map((g) => drawnGear({ ...g, boreRadius: 0 }).rf));
    return Math.min(IDLER_SHAFT * this.a, 0.5 * rf);
  }

  private looseBore(m: MemberView, rf: number): number {
    const shaft = this.shaftRadius(m);
    return Math.min(shaft + NEEDLE * this.a, shaft + 0.5 * (rf - shaft));
  }

  private partOfGear(m: MemberView, def: GearDef): string {
    const spec = this.box.spec;
    const fd = spec.finalDrive!;
    if (def.id === fd.pinion || def.id === fd.ring) return 'gbx-final-drive';
    if (m.id === spec.input || m.id === fd.shaft) return 'gbx-ta-gear-fixed';
    return m.id === 'idler' ? 'gbx-ta-reverse-idler' : 'gbx-ta-gear-loose';
  }

  private buildGears(): void {
    const box = this.box;
    const fd = box.spec.finalDrive!;
    for (const def of box.spec.gears) {
      const m = this.member(def.member);
      const meshes = box.meshes.flatMap((mesh, j) => (mesh.a === def.id || mesh.b === def.id ? [j] : []));
      const material = this.own(new THREE.MeshStandardMaterial({ color: '#b9bdc1', metalness: 1, roughness: 0.28 }));
      let geometry: THREE.BufferGeometry;
      let tip: number;
      let bore: number;
      let phase = box.phases[def.id] ?? 0;
      let z = -def.z * MM;
      if (def.cone !== undefined) {
        bore = def.id === fd.ring ? this.layout.diff.radius : 0;
        const shape = { teeth: def.teeth, module: def.module, pressureAngle: def.pressureAngle, shift: def.shift, faceWidth: def.faceWidth, cone: def.cone, boreRadius: bore };
        geometry = acquireBevelGeometry(shape, this.quality);
        tip = bevelSize(shape).tip;
        // Tooth on gap where the pitch cones touch: on the pinion's side toward the crown wheel (±X), and on the
        // crown wheel's side toward the pinion (its local ±X, the gearbox's −Z).
        const pinionTouch = this.side > 0 ? Math.PI / 2 : (3 * Math.PI) / 2;
        const crownTouch = this.side > 0 ? (3 * Math.PI) / 2 : Math.PI / 2;
        phase = def.id === fd.pinion ? pinionTouch : crownTouch + Math.PI / def.teeth;
        // Both are drawn with the pitch cones' apex at their origin: the crossing of the two axes.
        z = def.id === fd.pinion ? -this.diffAxisAcross() * MM : 0;
      } else {
        const tipShortening = Math.max(0, ...meshes.map((j) => box.meshes[j]!.geometry.tipShortening));
        const drawn = drawnGear({ ...def, boreRadius: 0, tipShortening });
        bore = def.id === fd.ring ? this.layout.diff.radius : m.shaft ? 0 : this.looseBore(m, drawn.rf);
        geometry = acquireGearGeometry({ ...def, boreRadius: bore, tipShortening }, this.quality);
        tip = drawn.ra;
      }
      this.acquired.push(geometry);
      const mesh = tag(new THREE.Mesh(geometry, material), this.partOfGear(m, def));
      mesh.userData.gear = def.id;
      mesh.position.z = z;
      mesh.rotation.z = -phase;
      mesh.castShadow = true;
      m.spin.add(mesh);
      this.gears.push({ id: def.id, def, mesh, material, meshes, tip, bore });
    }
    const speedGears = this.box.spec.gears.filter((g) => g.id !== fd.pinion && g.id !== fd.ring);
    this.stackFront = Math.min(...speedGears.map((g) => g.z - g.faceWidth / 2));
    this.stackBack = Math.max(...speedGears.map((g) => g.z + g.faceWidth / 2), ...(this.box.spec.sleeves ?? []).map((s) => s.z + s.width / 2 + s.gap));
  }

  /** Where the crown wheel's axis crosses the pinion's, mm behind the front face. */
  private diffAxisAcross(): number {
    return this.member(this.box.spec.output).across ?? 0;
  }

  private buildShafts(): void {
    const spec = this.box.spec;
    const fd = spec.finalDrive!;
    const L = TRANSAXLE_LAYOUT;
    const segments = this.quality === 'low' ? 20 : 32;
    const gearsOf = (id: string) => spec.gears.filter((g) => g.member === id);
    for (const m of this.members) {
      if (m.id === spec.output) continue;
      const r = this.shaftRadius(m);
      let from: number;
      let to: number;
      if (m.id === spec.input) {
        // From the clutch splines inside the bellhousing to the back wall.
        from = this.layout.bellhousing + 0.15 * L.bellhousingMm;
        to = this.layout.back - L.wall / 2;
      } else if (m.id === fd.shaft) {
        const pinion = spec.gears.find((g) => g.id === fd.pinion)!;
        if (pinion.cone !== undefined) {
          // The pinion's heel: the shaft carries it from behind.
          const size = bevelSize({ ...pinion, cone: pinion.cone, boreRadius: 0 });
          from = this.diffAxisAcross() - size.heelZ;
        } else {
          from = pinion.z - pinion.faceWidth / 2 - 4;
        }
        to = this.layout.back - L.wall / 2;
      } else if (m.id === 'idler') {
        // A standing shaft for the idler, cut short of any gear on another axis whose tips sweep past it.
        const gears = gearsOf(m.id);
        const front = Math.min(...gears.map((g) => g.z - g.faceWidth / 2));
        const rear = Math.max(...gears.map((g) => g.z + g.faceWidth / 2));
        from = front - IDLER_STUB;
        to = rear + IDLER_STUB;
        for (const g of this.gears) {
          const other = this.member(g.def.member);
          if (other === m || other.across !== null || Math.hypot(other.x - m.x, other.y - m.y) >= g.tip + r + STUB_CLEAR) continue;
          const gFront = g.def.z - g.def.faceWidth / 2;
          const gBack = g.def.z + g.def.faceWidth / 2;
          if (gBack <= front) from = Math.max(from, gBack + STUB_CLEAR);
          else if (gFront >= rear) to = Math.min(to, gFront - STUB_CLEAR);
        }
      } else {
        continue;
      }
      const geometry = zCylinder(r * MM, (to - from) * MM, segments, 0, 0, -((from + to) / 2) * MM);
      const part = m.id === spec.input ? 'gbx-ta-input' : m.id === fd.shaft ? 'gbx-ta-output' : 'gbx-ta-reverse-idler';
      const shaft = tag(new THREE.Mesh(geometry, this.steel), part);
      shaft.castShadow = true;
      (m.shaft ? m.spin : m.frame).add(shaft);
      if (m.id === spec.input) {
        const splineLength = 0.35 * L.bellhousingMm;
        const splines = extrude(gearShape(r * 1.08 * MM, r * 0.92 * MM, 18, 0), splineLength * MM, undefined, 8);
        splines.translate(0, 0, -(from + splineLength / 2) * MM);
        const splineMesh = tag(new THREE.Mesh(splines, this.steel), 'gbx-ta-input');
        splineMesh.castShadow = true;
        m.spin.add(splineMesh);
        this.points.input = new THREE.Vector3(0, 0, -from * MM);
      }
    }
  }

  private buildSynchros(): void {
    const spec = this.box.spec;
    const places = spec.sleeves ?? [];
    if (!places.length) return;
    const a = this.a;
    const segments = this.quality === 'low' ? 28 : 48;
    const syncSteel = this.own(new THREE.MeshStandardMaterial({ color: '#9da2a7', metalness: 1, roughness: 0.36 }));
    const dogSteel = this.own(new THREE.MeshStandardMaterial({ color: '#c4c7ca', metalness: 1, roughness: 0.3 }));
    const brass = this.own(brassMaterial());
    const forkSteel = this.own(new THREE.MeshStandardMaterial({ color: '#7d8288', metalness: 0.9, roughness: 0.45 }));
    const railSteel = this.own(new THREE.MeshStandardMaterial({ color: '#cfd2d4', metalness: 1, roughness: 0.2 }));
    const elements = new Map(spec.elements.map((e) => [e.id, e]));
    const input = this.member(spec.input);
    const output = this.member(spec.finalDrive!.shaft);
    const hubs = new Map<MemberView, THREE.BufferGeometry[]>();
    const blockers = new Map<MemberView, THREE.BufferGeometry[]>();
    const railLength = this.stackBack - this.stackFront + 8;
    const railMid = (this.stackFront + this.stackBack) / 2;
    const perShaft = new Map<MemberView, number>();
    for (const place of [...places].sort((p, q) => p.z - q.z)) {
      const shaft = this.member(place.shaft ?? spec.output);
      const other = shaft === input ? output : input;
      const shaftR = this.shaftRadius(shaft);
      // Hub and sleeve no larger than the gears they engage.
      const engaged = [place.front, place.back].flatMap((id) => (id ? [elements.get(id)!.a] : []));
      const gearRoots = this.gears.filter((g) => engaged.includes(g.def.member)).map((g) => drawnGear({ ...g.def, boreRadius: 0 }).rf);
      const hubR = Math.min(HUB * a, Math.max(shaftR + 6, Math.min(...gearRoots) - 1));
      const sleeveR = Math.max(hubR + 4, Math.min(SLEEVE * a, Math.min(...gearRoots) + 8));
      const groove = GROOVE_DEPTH * a;
      const w = place.width;
      if (!hubs.has(shaft)) hubs.set(shaft, []);
      if (!blockers.has(shaft)) blockers.set(shaft, []);
      hubs.get(shaft)!.push(ring(shaftR, hubR - 0.3, w - 1, -place.z, segments));
      const half = (w - 1) / 2;
      const gw = 0.3 * w;
      const sleeve = lathe(
        [
          [hubR, half], [hubR, -half], [sleeveR, -half], [sleeveR, -gw / 2], [sleeveR - groove, -gw / 2],
          [sleeveR - groove, gw / 2], [sleeveR, gw / 2], [sleeveR, half], [hubR, half],
        ],
        segments,
      );
      const sleeveMesh = tag(new THREE.Mesh(sleeve, syncSteel), 'gbx-synchro-sleeve');
      sleeveMesh.position.z = -place.z * MM;
      sleeveMesh.castShadow = true;
      shaft.spin.add(sleeveMesh);

      // Fork and rail on the side of the shaft away from the other shaft (and from the differential for the output).
      const away = new THREE.Vector2(shaft.x - other.x, shaft.y - other.y).normalize();
      if (shaft === output) {
        const diff = this.layout.diff.centre;
        const toDiff = new THREE.Vector2(diff[0] - shaft.x, diff[1] - shaft.y);
        if (toDiff.length() > 1 && this.layout.diff.axis === 'z') away.sub(toDiff.normalize()).normalize();
      }
      const k = perShaft.get(shaft) ?? 0;
      perShaft.set(shaft, k + 1);
      // Above the tips of every speed gear on this shaft's axis.
      const onAxis = (g: GearView) => {
        const gm = this.member(g.def.member);
        return gm.across === null && Math.hypot(gm.x - shaft.x, gm.y - shaft.y) < 1e-6 && g.def.id !== spec.finalDrive!.pinion && g.def.id !== spec.finalDrive!.ring;
      };
      const tips = Math.max(...this.gears.filter(onAxis).map((g) => g.tip), sleeveR);
      const reach = tips + RAIL_CLEAR * a;
      const sideways = new THREE.Vector2(away.y, -away.x).multiplyScalar((k - 0.5) * 0.24 * a);
      const rail = new THREE.Vector2(away.x * reach, away.y * reach).add(sideways);
      this.railSpots.push({ x: shaft.x + rail.x, y: shaft.y + rail.y });
      const forkR = sleeveR - groove + gw * 0.4;
      const tube = gw * 0.4;
      const torus = new THREE.TorusGeometry(forkR * MM, tube * MM, 8, this.quality === 'low' ? 16 : 28, Math.PI);
      // The half ring opens away from the rail.
      torus.rotateZ(Math.atan2(rail.y, rail.x) - Math.PI / 2);
      const armLength = Math.hypot(rail.x, rail.y) - forkR;
      const arm = new THREE.BoxGeometry(5 * MM, armLength * MM, gw * MM);
      arm.rotateZ(Math.atan2(rail.y, rail.x) - Math.PI / 2);
      const armMid = (forkR + armLength / 2) / Math.hypot(rail.x, rail.y);
      arm.translate(rail.x * armMid * MM, rail.y * armMid * MM, 0);
      const boss = zCylinder((RAIL * a + 3) * MM, (gw + 10) * MM, 16, rail.x * MM, rail.y * MM, 0);
      const fork = tag(new THREE.Mesh(merge([torus, arm, boss]), forkSteel), 'gbx-fork');
      const railMesh = tag(
        new THREE.Mesh(zCylinder(RAIL * a * MM, railLength * MM, 16, rail.x * MM, rail.y * MM, (place.z - railMid) * MM), railSteel),
        'gbx-rail',
      );
      const slider = new THREE.Group();
      slider.position.z = -place.z * MM;
      slider.add(fork, railMesh);
      fork.castShadow = railMesh.castShadow = true;
      shaft.frame.add(slider);
      this.sleeveViews.push({ place, sliders: [sleeveMesh, slider], travel: (place.gap - 1) * MM });

      for (const [sideSign, id] of [[-1, place.front], [1, place.back]] as const) {
        if (!id) continue;
        const element = elements.get(id);
        if (!element) continue;
        const gearMember = this.member(element.a);
        const dogW = 0.45 * place.gap;
        const blockW = 0.3 * place.gap;
        const face = place.z + sideSign * (w / 2 + place.gap);
        const inner = Math.max(...this.gears.filter((g) => g.def.member === gearMember.id).map((g) => g.bore));
        const dogOuter = hubR - 0.6;
        const teeth = Math.max(12, Math.round((TAU * dogOuter) / 4));
        const dog = extrude(gearShape(dogOuter * MM, (dogOuter - 1.6) * MM, teeth, inner * MM), dogW * MM, undefined, 16);
        dog.translate(0, 0, -(face - sideSign * (dogW / 2)) * MM);
        const dogMesh = tag(new THREE.Mesh(dog, dogSteel), 'gbx-dog-ring');
        dogMesh.castShadow = true;
        gearMember.spin.add(dogMesh);
        blockers.get(shaft)!.push(ring(hubR - 4.5, hubR - 1, blockW, -(face - sideSign * (dogW + 0.5 + blockW / 2)), this.quality === 'low' ? 20 : 32));
      }
    }
    for (const [shaft, list] of hubs) {
      const hubMesh = tag(new THREE.Mesh(merge(list), syncSteel), 'gbx-ta-synchro-hub');
      const blockerMesh = tag(new THREE.Mesh(merge(blockers.get(shaft)!), brass), 'gbx-blocker-ring');
      hubMesh.castShadow = blockerMesh.castShadow = true;
      shaft.spin.add(hubMesh, blockerMesh);
    }
  }

  /** The differential's case and the two stubs with their inner joints, all turning with the case. */
  private buildDifferential(): void {
    const spec = this.box.spec;
    const diff = this.member(spec.output);
    const d = this.layout.diff;
    const segments = this.quality === 'low' ? 24 : 40;
    // Along the case's own axis (its spin group's Z), mm: z behind the front face for a parallel axis, along X (with
    // the frame's turn) for one across.
    const along = (p: GearboxPoint): number => (d.axis === 'z' ? -p[2] : -this.side * (p[0] - diff.x));
    const c = along(d.centre);
    const R = d.radius;
    const h = d.halfLength;
    const caseMaterial = this.own(new THREE.MeshStandardMaterial({ color: '#8f8a80', metalness: 0.85, roughness: 0.45 }));
    // A barrel with bosses for the bearings, the ring gear's flange round its middle.
    const body = lathe(
      [
        [0.3 * R, c - h], [0.62 * R, c - h], [0.7 * R, c - h + 0.12 * h], [R, c - 0.45 * h], [R, c + 0.45 * h],
        [0.7 * R, c + h - 0.12 * h], [0.62 * R, c + h], [0.3 * R, c + h], [0.3 * R, c - h],
      ],
      segments,
    );
    const caseMesh = tag(new THREE.Mesh(body, caseMaterial), 'gbx-diff-case');
    caseMesh.castShadow = true;
    diff.spin.add(caseMesh);

    const shaftMaterial = this.own(new THREE.MeshStandardMaterial({ color: '#9ea3a8', metalness: 1, roughness: 0.3 }));
    const bootMaterial = this.own(new THREE.MeshStandardMaterial({ color: '#2a2b2e', metalness: 0, roughness: 0.75 }));
    const ends = this.stubEnds.map(along);
    const names = ['stub0', 'stub1'];
    ends.forEach((end, i) => {
      const sign = end < c ? -1 : 1;
      const start = c + sign * (h - 0.02 * h);
      const jointHalf = JOINT * R * 0.9;
      const shaftEnd = end - sign * jointHalf;
      if (sign * (shaftEnd - start) <= 0) throw new Error(`${spec.id}: a stub end lies inside the differential case`);
      const stub = tag(new THREE.Mesh(zCylinder(STUB * R * MM, Math.abs(shaftEnd - start) * MM, segments, 0, 0, ((start + shaftEnd) / 2) * MM), shaftMaterial), 'gbx-halfshaft');
      // The inner joint's housing, centred on the joint, and its boot toward the wheel.
      const housing = lathe(
        [
          [STUB * R, end - sign * jointHalf * 1.15], [0.55 * JOINT * R, end - sign * jointHalf], [JOINT * R, end - sign * 0.6 * jointHalf],
          [JOINT * R, end + sign * 0.55 * jointHalf], [STUB * R, end + sign * 0.55 * jointHalf], [STUB * R, end - sign * jointHalf * 1.15],
        ],
        segments,
      );
      const joint = tag(new THREE.Mesh(housing, shaftMaterial), 'gbx-cv-joint');
      const boot = tag(new THREE.Mesh(lathe([[0.8 * JOINT * R, end + sign * 0.55 * jointHalf], [0.42 * JOINT * R, end + sign * 1.5 * jointHalf], [STUB * R, end + sign * 1.5 * jointHalf]], segments), bootMaterial), 'gbx-cv-joint');
      for (const mesh of [stub, joint, boot]) {
        mesh.castShadow = true;
        diff.spin.add(mesh);
      }
      const p = this.stubEnds[i]!;
      this.points[names[i]!] = new THREE.Vector3(p[0] * MM, p[1] * MM, -p[2] * MM);
    });
  }

  private buildCase(flywheelRadius: number): void {
    const a = this.a;
    const spec = this.box.spec;
    const L = TRANSAXLE_LAYOUT;
    const frame = this.layout;
    const d = frame.diff;
    const segments = this.quality === 'low' ? 32 : 56;
    const solid = this.own(castAluminiumMaterial());
    const glass = this.glass('#bcd9e4', 0.025, 0.34);
    const shell = (geometry: THREE.BufferGeometry, part: string, order: number): THREE.Mesh => {
      const mesh = tag(new THREE.Mesh(geometry, solid), part);
      mesh.userData.ownOrder = order;
      mesh.renderOrder = order;
      this.shells.push({ mesh, solid, glass });
      this.mounted.add(mesh);
      return mesh;
    };

    // Main case: every shaft's largest tip circle plus the margin, the sleeves and the rails, over the gear stack.
    const circles: Pulley2D[] = [];
    for (const m of this.members) {
      if (m.across !== null || m.id === spec.output) continue;
      const tips = this.gears.filter((g) => g.def.member === m.id && g.def.cone === undefined && g.def.id !== spec.finalDrive!.ring).map((g) => g.tip);
      if (tips.length) circles.push({ x: m.x * MM, y: m.y * MM, r: (Math.max(...tips) + L.margin) * MM });
    }
    for (const s of this.sleeveViews) {
      const m = this.member(s.place.shaft ?? spec.output);
      circles.push({ x: m.x * MM, y: m.y * MM, r: (SLEEVE * a + L.margin) * MM });
    }
    for (const r of this.railSpots) circles.push({ x: r.x * MM, y: r.y * MM, r: (RAIL * a + 3 + L.margin) * MM });
    const section = hullShape(circles);
    const outline = section.getPoints();
    const reach = Math.max(...outline.map((p) => p.length())) / MM;
    const caseFront = -L.wall;
    const caseBack = frame.back;
    const caseGeo = extrude(section, (caseBack - caseFront) * MM, { thickness: 2 * MM, segments: 2 }, 12);
    caseGeo.translate(0, 0, -((caseFront + caseBack) / 2) * MM);
    const caseMesh = shell(caseGeo, 'gbx-case', 5);
    this.explode(caseMesh, new THREE.Vector3(0, 2.2, 0), a);

    // The differential's housing: round its axis, wide enough for the ring gear (crown wheel), over the case.
    const housingR = d.ringTip + L.margin;
    let housing: THREE.BufferGeometry;
    if (d.axis === 'z') {
      const output = this.member(spec.finalDrive!.shaft);
      const outTip = Math.max(...this.gears.filter((g) => g.def.member === output.id).map((g) => g.tip));
      const shape = hullShape([
        { x: d.centre[0] * MM, y: d.centre[1] * MM, r: housingR * MM },
        { x: output.x * MM, y: output.y * MM, r: (outTip + L.margin) * MM },
      ]);
      const z0 = d.centre[2] - d.halfLength - L.margin;
      const z1 = d.centre[2] + d.halfLength + L.margin;
      housing = extrude(shape, (z1 - z0) * MM, { thickness: 2 * MM, segments: 2 }, 12);
      housing.translate(0, 0, -((z0 + z1) / 2) * MM);
    } else {
      const half = d.halfLength + L.margin;
      housing = lathe([[0.62 * d.radius, -half], [housingR - 10, -half], [housingR, -half + 10], [housingR, half - 10], [housingR - 10, half], [0.62 * d.radius, half]], segments);
      housing.rotateY(Math.PI / 2);
      housing.translate(d.centre[0] * MM, d.centre[1] * MM, -d.centre[2] * MM);
    }
    const housingMesh = shell(housing, 'gbx-case', 5);
    this.explode(housingMesh, new THREE.Vector3(0, 2.2, 0), a);

    // Bellhousing: from the case's front out to the flywheel, open toward the engine. Sized by the flywheel alone: in
    // front of a transaxle sits the differential's housing, not the gear case.
    const rFront = flywheelRadius + 14;
    const rBack = Math.min(reach + 4, rFront - 10);
    const y1 = -frame.bellhousing;
    let bell: THREE.BufferGeometry;
    if (d.axis === 'z') {
      // Beside a transverse engine the clutch housing also holds the differential's engine side, whose output leaves
      // through its face next to the block: one casting round the flywheel and the ring gear, closed toward the case
      // round the differential's housing, which may reach on into it beside the clutch (transaxleFrame).
      const y0 = -frame.front;
      const around = (grow: number) =>
        hullShape([
          { x: 0, y: 0, r: (rFront + grow) * MM },
          { x: d.centre[0] * MM, y: d.centre[1] * MM, r: (housingR + grow) * MM },
        ]);
      const wall = around(6);
      wall.holes.push(new THREE.Path(around(-2).getPoints()));
      const tube = extrude(wall, (y1 - y0) * MM, undefined, 12);
      tube.translate(0, 0, ((y0 + y1) / 2) * MM);
      const plate = around(6);
      if (d.centre[2] - d.halfLength - L.margin < frame.front) {
        plate.holes.push(new THREE.Path().absarc(d.centre[0] * MM, d.centre[1] * MM, housingR * MM, 0, Math.PI * 2, true));
      }
      const back = extrude(plate, 8 * MM, undefined, 12);
      back.translate(0, 0, (y0 + 4) * MM);
      bell = merge([tube, back]);
    } else {
      const y0 = -frame.front;
      const bore = INPUT_SHAFT * a + 0.22 * a;
      bell = lathe(
        [
          [bore, y0], [rBack + 8, y0], [rBack + 8, y0 + 8], [rBack, y0 + 8], [rFront, y1 - 8], [rFront + 10, y1 - 8],
          [rFront + 10, y1], [rFront - 5, y1], [rBack - 5, y0 + 6], [bore, y0 + 6], [bore, y0],
        ],
        segments,
      );
    }
    const bellMesh = shell(bell, 'gbx-bellhousing', 6);
    this.explode(bellMesh, new THREE.Vector3(0, 0, 2.6), a);
    this.points.bellhousing = new THREE.Vector3(0, 0, y1 * MM);

    // Ribs on the main case (solid view only).
    const grown = (extra: number) => hullShape(circles.map((c) => ({ ...c, r: c.r + extra * MM })));
    const ribs: THREE.BufferGeometry[] = [];
    const span = caseBack - caseFront;
    for (const [z, extra, thick] of [[caseFront + 4, 8, 8], [caseBack - 4, 7, 8], [caseFront + span * 0.5, 4, 6]] as const) {
      const g = extrude(grown(extra), thick * MM, undefined, 12);
      g.translate(0, 0, -z * MM);
      ribs.push(g);
    }
    const ribMesh = tag(new THREE.Mesh(merge(ribs), solid), 'gbx-case');
    ribMesh.castShadow = true;
    this.mounted.add(ribMesh);
    this.solidOnly.push(ribMesh);
    this.explode(ribMesh, new THREE.Vector3(0, 2.2, 0), a);

    // Bearings in the walls: the shafts' back ends, and the differential's two sides.
    const bearingSteel = this.own(new THREE.MeshStandardMaterial({ color: '#6e7378', metalness: 0.95, roughness: 0.4 }));
    const bearings: THREE.BufferGeometry[] = [];
    for (const m of this.members) {
      if (!m.shaft || m.across !== null || m.id === spec.output) continue;
      const r = this.shaftRadius(m) + 0.3;
      const g = ring(r, r + 0.22 * a, L.wall - 1, -(caseBack - L.wall / 2), this.quality === 'low' ? 20 : 32);
      g.translate(m.x * MM, m.y * MM, 0);
      bearings.push(g);
    }
    const bearingMesh = tag(new THREE.Mesh(merge(bearings), bearingSteel), 'gbx-bearing');
    this.mounted.add(bearingMesh);
    this.peripheral.push(bearingMesh);
    this.explode(bearingMesh, new THREE.Vector3(0, 2.2, 0), a);

    // Pulled apart: the input toward the engine, the other shafts and the differential away from the input axis.
    for (const m of this.members) {
      const away = Math.hypot(m.x, m.y);
      if (m.id === spec.input) this.explode(m.frame, new THREE.Vector3(0, 0, 1.4), a);
      else if (m.id === spec.output && m.across !== null) this.explode(m.frame, new THREE.Vector3(0, -1.6, 0), a);
      else if (away > 1e-6 && this.isOwnAxis(m)) this.explode(m.frame, new THREE.Vector3((m.x / away) * 1.3, (m.y / away) * 1.3, 0), a);
      else {
        // Loose gears slide off along their shaft, those further back further; they go with their shaft's offset.
        const z = Math.min(...spec.gears.filter((g) => g.member === m.id).map((g) => g.z));
        const offset = away > 1e-6 ? new THREE.Vector3((m.x / away) * 1.3, (m.y / away) * 1.3, 0) : new THREE.Vector3();
        this.explode(m.frame, offset.add(new THREE.Vector3(0, 0, -1.1 - (0.9 * z) / span)), a);
      }
    }
  }

  /** A member alone on its axis among the shafts: the output shaft, the idler, a parallel differential. */
  private isOwnAxis(m: MemberView): boolean {
    return m.shaft || m.id === 'idler' || m.id === this.box.spec.output;
  }

  // ---- SceneModel ----

  update(frame: GearboxFrame): void {
    for (const m of this.members) m.spin.rotation.z = -wrap(frame.angles[m.index] ?? 0);
    for (const s of this.sleeveViews) {
      const p = Math.max(-1, Math.min(1, frame.sleeves[s.place.id] ?? 0));
      for (const o of s.sliders) o.position.z = -s.place.z * MM - p * s.travel;
    }
    for (const g of this.gears) {
      let glow = 0;
      for (const j of g.meshes) glow = Math.max(glow, frame.meshPower[j] ?? 0);
      this.setGlow(g.material, glow);
    }
  }

  // ---- For tests, demonstrations and the budget ----

  memberFrame(id: string): THREE.Group | undefined {
    return this.members.find((m) => m.id === id)?.frame;
  }

  gearMesh(id: string): THREE.Mesh | undefined {
    return this.gears.find((g) => g.id === id)?.mesh;
  }
}
