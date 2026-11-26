// The roll scene's model (suspensions plan, the roll scene; stage P7): one axle of the car seen from the front or the
// rear with its slice of the body in glass, or the whole chassis, leaning on the road as the chassis simulation says.
// Over each wheel stands its load bar (load-bars.ts); in each axle's plane the lines from the contact patches through the
// instant centres meet at the roll centre, which moves as the travels do; an arrow shows the body jacking up or down.
//
// Frames. The body (axles, slices, the chassis's shell) is one group that heaves, rolls and pitches over the road, rigid,
// about the road under the car's centre of mass: the simulation's body over corner i moves z + y_i·φ − (x_i − x_s)·θ, and
// a small rotation about the road moves it the same. The wheels hang from it at the simulation's travels, and each tyre
// is pressed onto the road where the road is in the body's frame (AxleFrame.roadLift), so the tyres stand on the road
// and the wheels' camber to the road is the body's camber plus its lean. Bars, the road and the jacking arrow stay on the
// road. Scene = (y, z, x)·10. An axle view's origin is on the road under the middle of that axle; the chassis's is under
// the centre of mass, as ChassisModel's.
//
// A SceneModel<RollState>; the axles are any AxleModel. The roll centre lines need the axle's travels-to-numbers of the
// simulation (ChassisAxle.sample), so they work on any axle; the instant centres only on an axle of corners.

import * as THREE from 'three';
import type { SceneModel, ViewMode } from '../model-types.ts';
import type { PartInfo } from '../parts-info.ts';
import { Arrows, arrowHeadGeometry, arrowShaftGeometry, inert, ON_TOP, outOfFrame, overlayMaterial } from '../arrows.ts';
import { ROLL_CENTRE } from '../palette.ts';
import type { Chassis } from '../../suspension/chassis.ts';
import { newWheelSample, type WheelSample } from '../../suspension/chassis-axle.ts';
import type { CarChassis } from '../../suspension/car-chassis.ts';
import { rollCentre, type RollState } from '../../suspension/roll.ts';
import type { ResolvedCorner } from '../../suspension/setup.ts';
import { axleFrame, IndependentAxleModel, type AxleFrame, type AxleModel } from './axle-model.ts';
import { bodySection, sectionTopM } from './body-section.ts';
import { ChassisModel } from './chassis-model.ts';
import { spacedKey } from './corner-model.ts';
import { LoadBars } from './load-bars.ts';

export type RollView = 'front' | 'rear' | 'car';

/** One axle of the car as the model draws it. */
export interface RollAxle {
  which: 'front' | 'rear';
  /** The left corner, resolved; the right is its mirror. */
  corner: ResolvedCorner;
  antiRollBar: boolean;
}

export interface RollModelOptions {
  view: RollView;
  /** The chassis the simulation runs: corner positions, static loads and the axles' numbers. */
  chassis: Chassis;
  axles: readonly [RollAxle, RollAxle];
  /** A real car's chassis from P7-geom: the whole-chassis view then has its glass shell. */
  shell?: CarChassis | null;
}

/** How much the jacking arrow exaggerates the body's rise, and what it takes to show. */
export const JACK_SCALE = 10;
const JACK_MIN_M = 0.0005;
/** Farthest instant centre drawn, m from the middle of the car: beyond it the line runs to the roll centre only. */
const IC_FAR_M = 6;

interface Axis {
  k: 0 | 1;
  model: AxleModel;
  /** The axle's frame inside the body: on its axle line in the chassis view. */
  holder: THREE.Group;
  frame: AxleFrame;
  lines: THREE.LineSegments;
  positions: Float32Array;
  ic: THREE.Mesh[];
  rc: THREE.Mesh;
  /** Top of the body slice, m: where the bars stand and the jacking arrow starts. */
  topM: number;
  rcY: number;
  rcZ: number;
  rcShown: boolean;
}

export class RollModel implements SceneModel<RollState> {
  readonly group = new THREE.Group();
  readonly view: RollView;
  readonly parts: Record<string, PartInfo>;
  /** The roll centre of each shown axle above the road, m, and across from the middle (NaN when none). */
  readonly rollCentres: Array<{ which: 'front' | 'rear'; y: number; z: number }> = [];
  private readonly chassis: Chassis;
  private readonly body = new THREE.Group();
  private readonly axes: Axis[] = [];
  private readonly sections: THREE.Mesh[] = [];
  private readonly chassisModel: ChassisModel | null;
  private readonly bars: LoadBars;
  /** Which corners the bars stand for, in their order. */
  private readonly barCorners: number[];
  private readonly road: THREE.Mesh;
  private readonly jackMat = overlayMaterial('#ffffff');
  private readonly jackShaft = arrowShaftGeometry();
  private readonly jackHead = arrowHeadGeometry();
  private readonly jack: Arrows;
  private readonly lineMat = new THREE.LineBasicMaterial({ color: '#ffffff', vertexColors: true, depthTest: false, depthWrite: false, transparent: true, opacity: 0.9, toneMapped: false });
  private readonly icMat = overlayMaterial(ROLL_CENTRE.instant);
  private readonly rcMat = overlayMaterial(ROLL_CENTRE.roll);
  private readonly dot = outOfFrame(new THREE.SphereGeometry(0.09, 16, 12));
  private readonly rcDot = outOfFrame(new THREE.SphereGeometry(0.13, 18, 14));
  private readonly sL = newWheelSample();
  private readonly sR = newWheelSample();
  private readonly rcOut = { y: 0, z: 0 };
  private readonly v = new THREE.Vector3();
  private construction = true;
  private readonly loads = { staticN: 0, geometric: 0, elastic: 0, unsprung: 0 };

  constructor(options: RollModelOptions) {
    const { chassis, view } = options;
    this.chassis = chassis;
    this.view = view;
    const shown: Array<0 | 1> = view === 'front' ? [0] : view === 'rear' ? [1] : [0, 1];
    const models = options.axles.map((a) => new IndependentAxleModel({ which: a.which, corner: a.corner, antiRollBar: a.antiRollBar }));
    const shell = view === 'car' ? (options.shell ?? null) : null;
    this.chassisModel = shell ? new ChassisModel(shell, { axles: { front: models[0]!, rear: models[1]! } }) : null;
    if (this.chassisModel) this.body.add(this.chassisModel.group);
    for (const k of [0, 1] as const) if (!shown.includes(k) && !this.chassisModel) models[k]!.dispose();
    const color = new THREE.Color();
    for (const k of shown) {
      const model = models[k]!;
      const spec = options.axles[k]!.corner.axle.spec;
      const tyre = options.axles[k]!.corner.tyre;
      const holder = new THREE.Group();
      // In the chassis view each axle sits on its axle line (ChassisModel puts its own there already).
      const xScene = view === 'car' ? (this.chassisModel ? model.group.position.z : chassis.axleX[k] * 10) : 0;
      holder.position.z = xScene;
      if (this.chassisModel) model.group.position.z = 0;
      holder.add(model.group);
      if (this.chassisModel) {
        // The chassis keeps its axles in its own group; the holder moves with the body just the same.
        this.chassisModel.group.add(holder);
      } else {
        this.body.add(holder);
        const section = bodySection(spec, tyre.freeRadiusM, tyre.widthM, spacedKey('susp.body', options.axles[k]!.which));
        holder.add(section);
        this.sections.push(section);
      }
      // Patch → instant centre (or roll centre) on each side, in the axle's plane.
      const positions = new Float32Array(4 * 3);
      const geo = outOfFrame(new THREE.BufferGeometry());
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
      const colors = new Float32Array(4 * 3);
      color.set(ROLL_CENTRE.instant);
      for (let i = 0; i < 4; i++) colors.set([color.r, color.g, color.b], 3 * i);
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const lines = new THREE.LineSegments(geo, this.lineMat);
      lines.frustumCulled = false;
      lines.renderOrder = ON_TOP;
      lines.raycast = () => {};
      const ic = [0, 1].map(() => inert(new THREE.Mesh(this.dot, this.icMat)));
      const rc = inert(new THREE.Mesh(this.rcDot, this.rcMat), ON_TOP + 1);
      holder.add(lines, ...ic, rc);
      this.axes.push({ k, model, holder, frame: axleFrame(), lines, positions, ic, rc, topM: sectionTopM(spec, tyre.freeRadiusM), rcY: 0, rcZ: 0, rcShown: false });
      this.rollCentres.push({ which: options.axles[k]!.which, y: Number.NaN, z: Number.NaN });
    }
    this.group.add(this.body);

    // ---- On the road: the road itself, the bars over the wheels, the jacking arrow ----
    const at: THREE.Vector3[] = [];
    this.barCorners = [];
    for (const a of this.axes) {
      for (const i of [2 * a.k, 2 * a.k + 1]) {
        const c = chassis.corners[i]!;
        at.push(new THREE.Vector3(c.y * 10, (a.topM + 0.12) * 10, a.holder.position.z));
        this.barCorners.push(i);
      }
    }
    this.bars = new LoadBars(at);
    this.group.add(this.bars.group);
    this.jack = new Arrows(this.jackShaft, this.jackHead, this.jackMat, [ROLL_CENTRE.jack], [0.06]);
    this.jack.hide(0);
    this.jack.commit();
    this.group.add(this.jack.shafts, this.jack.heads);
    const track = Math.max(...chassis.corners.map((c) => Math.abs(c.y))) * 2;
    const length = view === 'car' ? chassis.wheelbaseM + 3 : 2.4;
    const roadGeo = new THREE.BoxGeometry((track + 1.6) * 10, 0.2, length * 10).translate(0, -0.1, view === 'car' ? ((chassis.axleX[0] + chassis.axleX[1]) / 2) * 10 : 0);
    this.road = new THREE.Mesh(roadGeo, new THREE.MeshStandardMaterial({ color: '#2b3438', roughness: 0.95, metalness: 0 }));
    this.road.receiveShadow = true;
    this.road.userData.noFit = true;
    this.road.raycast = () => {};
    this.group.add(this.road);

    const shownModels = this.chassisModel ? [this.chassisModel] : this.axes.map((a) => a.model);
    this.parts = Object.assign({}, ...shownModels.map((m) => m.parts)) as Record<string, PartInfo>;
    this.setView('solid');
  }

  /** The body's rigid pose: heave at the scene origin, roll, and pitch in the chassis view. */
  private poseBody(s: RollState): void {
    const xs = this.chassis.sprung.cgX;
    if (this.view === 'car') {
      this.body.position.y = (s.z + xs * s.pitch) * 10;
      this.body.rotation.set(s.pitch, 0, s.roll, 'XYZ');
    } else {
      const k = this.view === 'front' ? 0 : 1;
      this.body.position.y = (s.z - (this.chassis.axleX[k] - xs) * s.pitch) * 10;
      this.body.rotation.set(0, 0, s.roll, 'XYZ');
    }
  }

  update(s: RollState): void {
    this.poseBody(s);
    const c = this.chassis;
    const xs = c.sprung.cgX;
    let jack = 0;
    let jackTop = 0;
    for (let n = 0; n < this.axes.length; n++) {
      const a = this.axes[n]!;
      const iL = 2 * a.k;
      const iR = iL + 1;
      const f = a.frame;
      f.travel[0] = s.travel[iL]!;
      f.travel[1] = s.travel[iR]!;
      // The road under each patch in the body's frame: as far down as the body rose there.
      const lift = (f.roadLift ??= [0, 0]);
      const cl = c.corners[iL]!;
      const cr = c.corners[iR]!;
      lift[0] = -(s.z + cl.y * s.roll - (cl.x - xs) * s.pitch);
      lift[1] = -(s.z + cr.y * s.roll - (cr.x - xs) * s.pitch);
      a.model.update(f);
      this.updateLines(a, s.travel[iL]!, s.travel[iR]!, n);
      const rise = s.z - (c.axleX[a.k] - xs) * s.pitch;
      jack += rise / this.axes.length;
      jackTop = Math.max(jackTop, a.topM);
    }
    // Loads over the wheels.
    for (let b = 0; b < this.barCorners.length; b++) {
      const i = this.barCorners[b]!;
      const l = this.loads;
      l.staticN = c.corners[i]!.staticN;
      l.geometric = s.geometric[i]!;
      l.elastic = s.elastic[i]!;
      l.unsprung = s.unsprung[i]!;
      this.bars.set(b, l);
    }
    // Jacking: from where the body's top stood at rest, exaggerated.
    const dz = jack - this.restRiseM;
    if (Math.abs(dz) >= JACK_MIN_M) {
      const z0 = this.view === 'car' ? ((c.axleX[0] + c.axleX[1]) / 2) * 10 : 0;
      this.jack.set(0, 0, (jackTop + 0.05) * 10, z0, 0, dz * JACK_SCALE * 10, 0);
    } else this.jack.hide(0);
    this.jack.commit();
  }

  /** The body's rise at the shown axles when the car stands still: a lowered chassis stands below design. */
  private restRiseM = 0;

  /** Where the body stands at rest (the scene's state at 0 g), for the jacking arrow. */
  setRest(s: RollState): void {
    const c = this.chassis;
    const xs = c.sprung.cgX;
    let sum = 0;
    for (const a of this.axes) sum += s.z - (c.axleX[a.k] - xs) * s.pitch;
    this.restRiseM = sum / this.axes.length;
  }

  /** The lines from the patches through the instant centres to the roll centre, in the axle's frame. */
  private updateLines(a: Axis, qL: number, qR: number, n: number): void {
    const axle = this.chassis.axles[a.k];
    const L = this.sL;
    const R = this.sR;
    axle.sample(qL, qR, L, R);
    const rc = rollCentre(L, R, this.rcOut);
    const out = this.rollCentres[n]!;
    const rcOn = !!rc && Math.abs(rc.y) < IC_FAR_M;
    a.rc.visible = this.construction && rcOn;
    if (rc && rcOn) {
      a.rc.position.set(rc.y * 10, rc.z * 10, 0);
      // Where it is over the road: through the body's lean and heave.
      const w = this.v.set(rc.y * 10, rc.z * 10, a.holder.position.z).applyEuler(this.body.rotation).add(this.body.position);
      out.y = w.x / 10;
      out.z = w.y / 10;
    } else {
      out.y = Number.NaN;
      out.z = Number.NaN;
    }
    this.side(a, 0, L, qL, rcOn ? rc : null);
    this.side(a, 1, R, qR, rcOn ? rc : null);
    (a.lines.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  /** One wheel's line: from its patch to its instant centre or the roll centre, whichever is farther (both lie on it). */
  private side(a: Axis, side: 0 | 1, s: WheelSample, q: number, rc: { y: number; z: number } | null): void {
    const corner = this.chassis.axles[a.k].corner;
    let ex = rc ? rc.y : s.contactY;
    let ez = rc ? rc.z : s.contactZ;
    const icY = corner ? (side === 0 ? 1 : -1) * corner.value('icFrontY', q) : Number.NaN;
    const icZ = corner ? corner.value('icFrontZ', q) : Number.NaN;
    const icOn = Number.isFinite(icY) && Number.isFinite(icZ) && Math.abs(icY) < IC_FAR_M;
    const dot = a.ic[side]!;
    dot.visible = this.construction && icOn;
    if (icOn) {
      dot.position.set(icY * 10, icZ * 10, 0);
      if (!rc || Math.hypot(icY - s.contactY, icZ - s.contactZ) > Math.hypot(ex - s.contactY, ez - s.contactZ)) {
        ex = icY;
        ez = icZ;
      }
    }
    const p = a.positions;
    const o = side * 6;
    p[o] = s.contactY * 10;
    p[o + 1] = s.contactZ * 10;
    p[o + 2] = 0;
    p[o + 3] = ex * 10;
    p[o + 4] = ez * 10;
    p[o + 5] = 0;
  }

  /** Shows or hides the construction of the roll centres (it shows again on the next update). */
  setConstruction(on: boolean): void {
    this.construction = on;
    for (const a of this.axes) {
      a.lines.visible = on;
      if (!on) {
        for (const d of a.ic) d.visible = false;
        a.rc.visible = false;
      }
    }
  }

  setView(view: ViewMode): void {
    if (this.chassisModel) this.chassisModel.setView(view);
    else for (const a of this.axes) a.model.setView(view);
    for (const s of this.sections) s.visible = view !== 'mechanism';
  }

  setExplode(amount: number): void {
    if (this.chassisModel) this.chassisModel.setExplode(amount);
    else for (const a of this.axes) a.model.setExplode(amount);
  }

  setFailure(part: string | null): void {
    if (this.chassisModel) this.chassisModel.setFailure(part);
    else for (const a of this.axes) a.model.setFailure(part);
  }

  anchors(): Record<string, THREE.Vector3> {
    return { cg: new THREE.Vector3(0, 0, 0) };
  }

  dispose(): void {
    if (this.chassisModel) this.chassisModel.dispose();
    else for (const a of this.axes) a.model.dispose();
    for (const s of this.sections) {
      s.geometry.dispose();
      (s.material as THREE.Material).dispose();
    }
    for (const a of this.axes) a.lines.geometry.dispose();
    this.bars.dispose();
    this.jack.dispose();
    this.jackShaft.dispose();
    this.jackHead.dispose();
    for (const m of [this.jackMat, this.lineMat, this.icMat, this.rcMat]) m.dispose();
    this.dot.dispose();
    this.rcDot.dispose();
    this.road.geometry.dispose();
    (this.road.material as THREE.Material).dispose();
  }
}
