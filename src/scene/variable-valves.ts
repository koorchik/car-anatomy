// Variable valve gear in 3D: cam phasers at the front of the camshafts, the third lobe and locking pin of a
// VTEC-style switch, sliding cam blocks, Valvetronic's eccentric shaft and levers, MultiAir's oil block,
// and the sliding zero-lift lobes that hold a resting cylinder's valves shut.
//
// The piston engine model asks this module which lobes to put on each camshaft, hands over the camshafts
// once built, and calls update() every frame. Valve lift itself stays in updateValves, from liveTiming.

import * as THREE from 'three';
import { DEG, liftWindow, mod, type Cylinder, type Engine } from '../engine/kinematics.ts';
import { liveTiming, type ValveState, type VariableValves } from '../engine/valve-control.ts';
import type { ValveTiming } from '../engine/spec.ts';
import { MM, camshaftGeometry, extrude, roundedRect, zCylinder, type LobeDef } from './geometry.ts';
import type { EngineMaterials } from './materials.ts';
import { tag, type FrameState } from './model-types.ts';

export type CamRole = 'intake' | 'exhaust' | 'both';

export interface GearContext {
  engine: Engine;
  materials: EngineMaterials;
  /** Bore in scene units. */
  bore: number;
  heads: THREE.Group[];
  mounted: THREE.Group;
  /** Main cam lift, scene units. */
  valveLift: number;
  camBase: number;
  lobeWidth: number;
  spinners: Array<{ object: THREE.Object3D; ratio: number }>;
}

/** Where a valve's tip is, in its head's frame, and which way it opens. */
interface ValveTip {
  cyl: Cylinder;
  exhaust: boolean;
  bank: number;
  tip: THREE.Vector3;
  dir: THREE.Vector3;
}

/** A block of lobes that slides along the shaft: low and high profiles, or a lobe and a zero-lift ring. */
interface Sleeve {
  object: THREE.Mesh;
  cyl: Cylinder;
  exhaust: boolean;
  /** Which profile sits at each step along the shaft. */
  profiles: Array<'main' | 'low' | 'high' | 'zero'>;
  step: number;
  at: number;
}

/** Third lobe, its follower and the locking pins of one cylinder and one side. */
interface PinSet {
  camKey: string;
  /** The main lobe's angle and span, which the third lobe carries. */
  lobe: LobeDef;
  cyl: Cylinder;
  exhaust: boolean;
  bank: number;
  outer: ValveTip[];
  middle: { tip: THREE.Vector3; dir: THREE.Vector3 };
  locked: number;
}

interface Phaser {
  cam: THREE.Mesh;
  rotor: THREE.Object3D;
  role: CamRole;
}

const SLIDE_SECONDS = 0.05;

export class VariableValveGear {
  readonly vvt: VariableValves | null;
  private readonly ctx: GearContext;
  private readonly cams = new Map<THREE.Mesh, CamRole>();
  private readonly pendingSleeves = new Map<string, Array<{ cyl: Cylinder; exhaust: boolean; z: number; rotation: number; profiles: Sleeve['profiles'] }>>();
  private readonly sleeves: Sleeve[] = [];
  private readonly tips: ValveTip[] = [];
  private readonly pinSets: PinSet[] = [];
  private readonly phasers: Phaser[] = [];
  private padMeshes: THREE.InstancedMesh[] = [];
  private pinMeshes: THREE.InstancedMesh[] = [];
  private eccentric: Array<{ shaft: THREE.Object3D; levers: THREE.InstancedMesh; frames: THREE.Matrix4[] }> = [];
  private readonly resting = new Set<number>();
  private readonly lowTiming: ValveTiming | null;
  private readonly deactivatable = new Set<number>();

  constructor(ctx: GearContext) {
    this.ctx = ctx;
    this.vvt = ctx.engine.spec.vvt ?? null;
    this.lowTiming = this.vvt?.switching?.low ?? null;
    const d = this.vvt?.deactivation;
    // Only valves held shut need hardware on the camshaft; a fuel cut needs none.
    if (d && d.kind === 'valves' && ctx.engine.spec.valvetrain !== 'ohv') for (const set of d.sets) for (const n of set) this.deactivatable.add(n);
  }

  private switches(exhaust: boolean): boolean {
    const sw = this.vvt?.switching;
    return !!sw && (sw.cams === 'both' || sw.cams === (exhaust ? 'exhaust' : 'intake'));
  }

  private halfSpan(timing: ValveTiming, exhaust: boolean): number {
    return (exhaust ? timing.exhaustClose - timing.exhaustOpen : timing.intakeClose - timing.intakeOpen) / 4;
  }

  /** Lobes a camshaft carries for one valve. Lobes that slide are kept back and built with the shaft. */
  lobesFor(camKey: string, bank: number, cyl: Cylinder, exhaust: boolean, lobe: LobeDef, tip: THREE.Vector3, dir: THREE.Vector3): LobeDef[] {
    if (!this.vvt) return [lobe];
    const sw = this.vvt.switching;
    const switched = this.switches(exhaust);
    const rests = this.deactivatable.has(cyl.n);
    const low: LobeDef = switched && this.lowTiming ? { ...lobe, halfSpan: this.halfSpan(this.lowTiming, exhaust), lift: sw!.lowLift * MM } : lobe;
    const tipInfo: ValveTip = { cyl, exhaust, bank, tip, dir };
    this.tips.push(tipInfo);
    const slide = switched && sw!.kind === 'slide';
    if (slide || rests) {
      const profiles: Sleeve['profiles'] = slide ? ['low', 'high'] : switched ? ['low'] : ['main'];
      if (rests) profiles.push('zero');
      const list = this.pendingSleeves.get(camKey) ?? [];
      list.push({ cyl, exhaust, z: lobe.z, rotation: lobe.rotation, profiles });
      this.pendingSleeves.set(camKey, list);
    }
    const lobes: LobeDef[] = slide || rests ? [] : [low];
    if (switched && sw!.kind === 'pin') {
      let set = this.pinSets.find((p) => p.cyl === cyl && p.exhaust === exhaust);
      if (!set) {
        set = { camKey, cyl, exhaust, bank, outer: [], middle: { tip: tip.clone(), dir: dir.clone() }, locked: 0, lobe };
        this.pinSets.push(set);
      }
      set.outer.push(tipInfo);
    }
    return lobes;
  }

  /** A shaft's lobes plus the third, high lobe of each pin set: between its two valves, or beside a single one. */
  finishLobes(camKey: string, lobes: LobeDef[]): LobeDef[] {
    const out = [...lobes];
    const w = this.ctx.lobeWidth;
    for (const set of this.pinSets.filter((p) => p.camKey === camKey)) {
      const [first, second] = set.outer;
      const mid = set.middle.tip;
      let width = w * 0.9;
      if (first && second) {
        mid.copy(first.tip).add(second.tip).multiplyScalar(0.5);
        width = Math.max(w * 0.35, Math.min(w * 0.9, Math.abs(second.tip.z - first.tip.z) - w * 1.05));
      } else if (first) {
        mid.copy(first.tip);
        mid.z -= w * 1.15;
      }
      out.push({ ...set.lobe, z: mid.z, width, lift: this.ctx.valveLift });
    }
    return out;
  }

  attachCam(mesh: THREE.Mesh, camKey: string, role: CamRole): void {
    this.cams.set(mesh, role);
    const pending = this.pendingSleeves.get(camKey);
    if (!pending || !this.vvt) return;
    const { camBase, valveLift, lobeWidth, materials } = this.ctx;
    const step = lobeWidth * 1.15;
    for (const p of pending) {
      const timing = this.ctx.engine.timing;
      const main = this.halfSpan(timing, p.exhaust);
      const lobes: LobeDef[] = p.profiles.map((profile, k) => {
        const z = p.z + k * step;
        if (profile === 'zero') return { z, rotation: p.rotation, halfSpan: main, lift: 0 };
        if (profile === 'low' && this.lowTiming) return { z, rotation: p.rotation, halfSpan: this.halfSpan(this.lowTiming, p.exhaust), lift: this.vvt!.switching!.lowLift * MM };
        return { z, rotation: p.rotation, halfSpan: main, lift: valveLift };
      });
      const geo = camshaftGeometry(lobes, camBase, valveLift, lobeWidth, camBase * 0.92, p.z - step * 0.55, p.z + step * (p.profiles.length - 0.45));
      const sleeve = tag(new THREE.Mesh(geo, materials.cam), p.profiles.includes('zero') && p.profiles.length <= 2 && !this.switches(p.exhaust) ? 'deactivated-lobe' : 'sliding-cam');
      sleeve.castShadow = true;
      mesh.add(sleeve);
      this.sleeves.push({ object: sleeve, cyl: p.cyl, exhaust: p.exhaust, profiles: p.profiles, step, at: 0 });
    }
  }

  /** Crank degrees later than park that a camshaft is turned by its phaser right now. */
  shiftOf(cam: THREE.Mesh, state: ValveState | undefined): number {
    if (!this.vvt || !state || this.vvt.phaser === 'none') return 0;
    const role = this.cams.get(cam);
    if (this.vvt.phaser === 'coupled') return state.intakeShift;
    if (role === 'intake') return state.intakeShift;
    if (role === 'exhaust') return state.exhaustShift;
    return 0;
  }

  /** Phasers on the camshafts' front ends, and the lift control parts on the heads. */
  build(front: number): void {
    const v = this.vvt;
    if (!v) return;
    const { materials: m, bore: b } = this.ctx;
    if (v.phaser !== 'none') {
      const mark = new THREE.MeshBasicMaterial({ color: '#ffd23f' });
      for (const [cam, role] of this.cams) {
        const phased = v.phaser === 'coupled' || role === 'both' || role === 'intake' || (v.phaser === 'dual' && role === 'exhaust');
        if (!phased || (v.phaser === 'intake' && role !== 'intake')) continue;
        const parent = cam.parent!;
        const z = front + b * 0.12;
        const housing = tag(new THREE.Mesh(zCylinder(b * 0.2, b * 0.12, 32), m.sprocket), 'phaser');
        housing.position.set(cam.position.x, cam.position.y, z);
        const housingMark = tag(new THREE.Mesh(new THREE.BoxGeometry(b * 0.025, b * 0.07, b * 0.01), mark), 'phaser');
        housingMark.position.set(0, b * 0.16, b * 0.065);
        housing.add(housingMark);
        parent.add(housing);
        this.ctx.spinners.push({ object: housing, ratio: 0.5 });
        const rotor = tag(new THREE.Mesh(vaneRotor(b * 0.17, b * 0.07), m.cam), 'phaser');
        rotor.position.set(cam.position.x, cam.position.y, z + b * 0.065);
        const rotorMark = tag(new THREE.Mesh(new THREE.BoxGeometry(b * 0.025, b * 0.08, b * 0.012), mark), 'phaser');
        rotorMark.position.set(0, b * 0.09, b * 0.008);
        rotor.add(rotorMark);
        parent.add(rotor);
        this.phasers.push({ cam, rotor, role });
      }
    }
    this.buildPins();
    if (v.lift?.kind === 'continuous') this.buildValvetronic();
    if (v.lift?.kind === 'multiair') this.buildMultiAir();
  }

  private buildPins(): void {
    if (!this.pinSets.length) return;
    const { bore: b, heads } = this.ctx;
    const padGeo = new THREE.BoxGeometry(b * 0.13, b * 0.045, b * 0.085);
    const pinGeo = zCylinder(b * 0.02, 1, 10);
    // Bright enough to pick out among the valves: brass followers and a yellow pin.
    const padMaterial = new THREE.MeshStandardMaterial({ color: '#c9a13b', metalness: 0.8, roughness: 0.35 });
    const pinMaterial = new THREE.MeshStandardMaterial({ color: '#ffd23f', metalness: 0.4, roughness: 0.3, emissive: '#5a4300' });
    heads.forEach((head, bank) => {
      const sets = this.pinSets.filter((s) => s.bank === bank);
      if (!sets.length) return;
      const pads = sets.reduce((n, s) => n + s.outer.length + 1, 0);
      const pins = sets.reduce((n, s) => n + s.outer.length, 0);
      const padMesh = tag(new THREE.InstancedMesh(padGeo, padMaterial, pads), 'cam-switch');
      const pinMesh = tag(new THREE.InstancedMesh(pinGeo, pinMaterial, pins), 'cam-switch');
      for (const mesh of [padMesh, pinMesh]) {
        mesh.frustumCulled = false;
        head.add(mesh);
      }
      padMesh.userData.bank = bank;
      pinMesh.userData.bank = bank;
      this.padMeshes.push(padMesh);
      this.pinMeshes.push(pinMesh);
    });
  }

  private buildValvetronic(): void {
    const { materials: m, bore: b, heads, engine } = this.ctx;
    for (const [cam, role] of this.cams) {
      if (role !== 'intake') continue;
      const bank = heads.indexOf(cam.parent as THREE.Group);
      if (bank < 0) continue;
      const head = heads[bank]!;
      const tips = this.tips.filter((t) => t.bank === bank && !t.exhaust);
      if (!tips.length) continue;
      const out = Math.sign(cam.position.x) || -1;
      const x = cam.position.x + out * b * 0.2;
      const y = cam.position.y + b * 0.17;
      const zs = tips.map((t) => t.tip.z);
      const zMin = Math.min(...zs) - b * 0.3;
      const zMax = Math.max(...zs) + b * 0.3;
      const shaft = new THREE.Group();
      shaft.position.set(x, y, 0);
      const core = tag(new THREE.Mesh(zCylinder(b * 0.035, zMax - zMin, 16, 0, 0, (zMin + zMax) / 2), m.cam), 'valvetronic');
      shaft.add(core);
      for (const n of new Set(tips.map((t) => t.cyl.n))) {
        const z = engine.cylinders.find((c) => c.n === n)!.z * MM;
        const disc = tag(new THREE.Mesh(zCylinder(b * 0.06, b * 0.05, 20, b * 0.025, 0, z), m.cam), 'valvetronic');
        shaft.add(disc);
      }
      head.add(shaft);
      const leverGeo = new THREE.BoxGeometry(b * 0.05, b * 0.22, b * 0.05);
      const levers = tag(new THREE.InstancedMesh(leverGeo, m.rod, tips.length), 'valvetronic');
      levers.frustumCulled = false;
      head.add(levers);
      // Each lever stands between the eccentric shaft and its valve, beside the cam lobe.
      const frames = tips.map((t) => {
        const mid = new THREE.Vector3((x + t.tip.x) / 2 + out * b * 0.04, (y + t.tip.y + this.ctx.camBase) / 2, t.tip.z);
        return new THREE.Matrix4().makeTranslation(mid.x, mid.y, mid.z);
      });
      const motor = tag(new THREE.Mesh(extrude(roundedRect(-b * 0.09, -b * 0.09, b * 0.09, b * 0.09, b * 0.03), b * 0.3, { thickness: 0.006, segments: 1 }), m.housing), 'valvetronic');
      motor.position.set(x + out * b * 0.08, y + b * 0.12, zMin - b * 0.05);
      head.add(motor);
      this.eccentric.push({ shaft, levers, frames });
    }
  }

  private buildMultiAir(): void {
    const { materials: m, bore: b, heads, engine } = this.ctx;
    heads.forEach((head, bank) => {
      const tips = this.tips.filter((t) => t.bank === bank && !t.exhaust);
      if (!tips.length) return;
      const exhaustSign = engine.banks[bank]!.alpha >= 0 ? 1 : -1;
      const side = engine.spec.valvetrain === 'dohc' ? Math.sign(tips[0]!.tip.x) || -exhaustSign : -exhaustSign;
      const zs = tips.map((t) => t.tip.z);
      const zMin = Math.min(...zs) - b * 0.25;
      const zMax = Math.max(...zs) + b * 0.25;
      const top = Math.max(...tips.map((t) => t.tip.y)) + this.ctx.camBase * 2.2;
      const x = tips[0]!.tip.x + side * b * 0.3;
      const blockGeo = extrude(roundedRect(x - b * 0.125, top, x + b * 0.125, top + b * 0.18, b * 0.03), zMax - zMin, { thickness: 0.008, segments: 1 });
      blockGeo.translate(0, 0, (zMin + zMax) / 2);
      const block = tag(new THREE.Mesh(blockGeo, m.housing), 'multiair');
      block.castShadow = true;
      head.add(block);
      for (const n of new Set(tips.map((t) => t.cyl.n))) {
        const z = engine.cylinders.find((c) => c.n === n)!.z * MM;
        const solenoid = tag(new THREE.Mesh(new THREE.CylinderGeometry(b * 0.05, b * 0.05, b * 0.12, 16), m.plastic), 'multiair');
        solenoid.position.set(x, top + b * 0.24, z);
        head.add(solenoid);
      }
    });
  }

  update(theta: number, state: FrameState): void {
    const v = this.vvt;
    if (!v) return;
    const vs = state.valves;
    this.resting.clear();
    if (vs && v.deactivation?.kind === 'valves') for (const n of vs.off) this.resting.add(n);
    const highCam = vs?.highCam ?? false;
    const ease = Math.min(1, state.dt / SLIDE_SECONDS);

    for (const s of this.sleeves) {
      const wanted = this.resting.has(s.cyl.n) ? s.profiles.indexOf('zero') : s.profiles.includes('high') && highCam ? s.profiles.indexOf('high') : 0;
      s.at += (wanted - s.at) * ease;
      s.object.position.z = -s.at * s.step;
    }

    for (const p of this.phasers) p.rotor.rotation.z = p.cam.rotation.z;

    if (this.padMeshes.length) this.updatePins(theta, vs, ease);

    if (this.eccentric.length) {
      const s = vs?.liftShare ?? 1;
      const turn = (1 - s) * 225 * DEG;
      const m = new THREE.Matrix4();
      const tiltM = new THREE.Matrix4().makeRotationZ(-(1 - s) * 15 * DEG);
      for (const e of this.eccentric) {
        e.shaft.rotation.z = -turn;
        e.frames.forEach((f, i) => {
          m.multiplyMatrices(f, tiltM);
          e.levers.setMatrixAt(i, m);
        });
        e.levers.instanceMatrix.needsUpdate = true;
      }
    }
  }

  /** Followers ride their lobes: the outer ones the low profile, or the high one once the pin is in. */
  private updatePins(theta: number, vs: ValveState | undefined, ease: number): void {
    const e = this.ctx.engine;
    const b = this.ctx.bore;
    const high = liveTiming(e.timing, this.vvt, vs ? { ...vs, highCam: true } : undefined);
    const now = liveTiming(e.timing, this.vvt, vs);
    const lift = this.ctx.valveLift;
    const m = new THREE.Matrix4();
    const counters = new Map<number, { pad: number; pin: number }>();
    for (const set of this.pinSets) {
      set.locked += ((vs?.highCam ? 1 : 0) - set.locked) * ease;
      const phi = mod(theta - set.cyl.fire, 720);
      const window = (t: ValveTiming): number => (set.exhaust ? liftWindow(phi, t.exhaustOpen, t.exhaustClose) : liftWindow(phi, t.intakeOpen, t.intakeClose));
      const highLift = window(high.timing) * lift * (set.exhaust ? high.exhaustLift : high.intakeLift);
      const outerLift = this.resting.has(set.cyl.n) ? 0 : window(now.timing) * lift * (set.exhaust ? now.exhaustLift : now.intakeLift);
      const meshIndex = this.padMeshes.findIndex((p) => p.userData.bank === set.bank);
      const pads = this.padMeshes[meshIndex]!;
      const pins = this.pinMeshes[meshIndex]!;
      const c = counters.get(set.bank) ?? { pad: 0, pin: 0 };
      counters.set(set.bank, c);
      const place = (tip: THREE.Vector3, dir: THREE.Vector3, l: number): THREE.Vector3 => tip.clone().addScaledVector(dir, -b * 0.03 - l);
      const middle = place(set.middle.tip, set.middle.dir, highLift);
      m.makeTranslation(middle.x, middle.y, middle.z);
      pads.setMatrixAt(c.pad++, m);
      for (const o of set.outer) {
        const at = place(o.tip, o.dir, outerLift);
        m.makeTranslation(at.x, at.y, at.z);
        pads.setMatrixAt(c.pad++, m);
        // The pin starts inside the outer follower and slides halfway into the middle one.
        const gap = middle.z - at.z;
        const length = Math.abs(gap) * (0.35 + 0.65 * set.locked) + b * 0.02;
        const centre = at.z + gap * (0.2 + 0.3 * set.locked);
        m.makeTranslation(at.x, at.y, centre).multiply(new THREE.Matrix4().makeScale(1, 1, length));
        pins.setMatrixAt(c.pin++, m);
      }
    }
    for (const mesh of [...this.padMeshes, ...this.pinMeshes]) mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Four-vane rotor of a cam phaser, seen end on. */
function vaneRotor(radius: number, depth: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const hub = radius * 0.45;
  const vanes = 4;
  const steps = 64;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const inVane = Math.abs(((a * vanes) / (Math.PI * 2)) % 1 - 0.5) < 0.16;
    const r = inVane ? radius : hub;
    const x = Math.sin(a) * r;
    const y = Math.cos(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  const geo = extrude(shape, depth, undefined, 8);
  return geo;
}
