// A MacPherson corner in 3D: knuckle, lower arm, strut with spring, damper, bump stop and top mount, tie rod with a
// piece of the rack, hub, brake, wheel, a tyre pressed onto the road, the halfshaft with its two joints, a glass piece
// of the body and a strip of road. Scene = (y, z, x)·10 of ISO 8855 (kinematics.ts), 1 unit = 100 mm; the model's
// origin is on the road under the middle of the axle at design ride height, like the hardpoints'.
//
// Every frame the knuckle's pose is solved exactly (Axle.solvePose, warm from the last frame), and each link is posed
// from its two ends: the lower arm turns about its bush axis until it meets the ball joint, the tie rod points from
// the rack to the steering arm, the strut's rod hangs from the top mount along the strut's own axis. Every link is
// rigid geometry of its real length, so nothing stretches (tests/suspension-scene.test.ts).
//
// Implements the shell's SceneModel<CornerFrame> structurally (whole-car plan, the Stage section); O2b adds
// the type, and this class then declares it.

import * as THREE from 'three';
import { markDamaged, tag, type ViewMode } from '../model-types.ts';
import { merge } from '../geometry.ts';
import { G } from '../../suspension/forces.ts';
import { KnuckleStatics } from '../../suspension/knuckle-statics.ts';
import type { Axle } from '../../suspension/kinematics.ts';
import type { QuarterOut } from '../../suspension/quarter.ts';
import type { RoadProfile } from '../../suspension/road.ts';
import type { ResolvedCorner } from '../../suspension/setup.ts';
import { POSE_SIZE, type SolveResult } from '../../suspension/solve.ts';
import { tyreVertical } from '../../vehicle/tyre-data.ts';
import type { PartInfo } from '../parts-info.ts';
import { SUSPENSION_PARTS } from './parts.ts';
import {
  annulus,
  Bellows,
  boss,
  capsule,
  CoilSpring,
  knuckleGeometry,
  lathe,
  latheAlong,
  rimProfile,
  ringProfile,
  rodBetween,
  slab,
  toScene,
  tyreProfile,
} from './geometry.ts';
import { HalfshaftView } from './halfshaft.ts';
import { createCornerMaterials, disposeMaterials, type CornerMaterials } from './materials.ts';
import { CamberLaser, ForceArrows } from './overlays.ts';
import { COLUMN_DZ, RoadStrip, type RoadView } from './road-strip.ts';
import { CornerSchematic } from './schematic.ts';
import { ROAD_SAMPLES, roadPressUniforms, type RoadPressUniforms } from './tyre-press.ts';

/** What the corner shows this frame. Lengths in metres, forces in newtons along their elements (QuarterOut). */
export interface CornerFrame {
  /** Wheel travel relative to the body from design, bump positive. */
  travel: number;
  /** Rack displacement: inner tie-rod end along +y (left), m. */
  rack: number;
  /** Body height over the corner relative to design. */
  bodyZ: number;
  /** Road under the wheel: its position along the profile and the height of the whole road (a rig's pad). */
  roadX: number;
  roadLift: number;
  /** Wheel turned forward since the start, rad. */
  spin: number;
  springN: number;
  damperN: number;
  /** Bump stop (positive) or top-out stop (negative), along the damper. */
  stopN: number;
  tyreN: number;
}

export const cornerFrame = (): CornerFrame => ({
  travel: 0, rack: 0, bodyZ: 0, roadX: 0, roadLift: 0, spin: 0, springN: 0, damperN: 0, stopN: 0, tyreN: 0,
});

/** Fills a frame from a quarter car's step: the bump, road and rig scenes. Rack and spin are the caller's. */
export function frameFromQuarter(out: QuarterOut, frame: CornerFrame): CornerFrame {
  frame.travel = out.travel;
  frame.bodyZ = out.bodyZ;
  frame.roadX = out.x;
  frame.roadLift = 0;
  frame.springN = out.springN;
  frame.damperN = out.damperN;
  frame.stopN = out.stopN;
  frame.tyreN = out.tyreN;
  return frame;
}

/**
 * Sizes the hardpoints do not give, metres: typical of a compact car's front corner, for the drawing only. The model
 * reads nothing from them.
 */
export const DRAWING = {
  /** Wheel offset (ET): the hub face outboard of the wheel's centre plane. */
  wheelOffsetM: 0.045,
  rimWidthM: 0.2032,
  discOuterM: 0.15,
  discInnerM: 0.088,
  discThickM: 0.026,
  /** The disc's braking ring sits this far inboard of the hub face. */
  hatDepthM: 0.039,
  strutTubeRadiusM: 0.026,
  rodRadiusM: 0.011,
  /** Coil spring: mean radius, total turns and closed turns at each end. */
  springMeanRadiusM: 0.06,
  springTurns: 6,
  springEndTurns: 0.75,
  /** Rod guide at the top of the strut tube, and the margin below the piston at full bump. */
  guideM: 0.02,
} as const;

/** Shear modulus of carbon steel, Pa: the handbook value (Shigley, table A-5), not checked against a primary source. */
const STEEL_SHEAR_PA = 79.3e9;

/**
 * Wire diameter (m) of a coil of DRAWING's size that has `rate` (N/m): k = G·d⁴ / (8·D³·n), the helical spring formula,
 * with n the active turns. 25 N/mm gives 11.8 mm.
 */
export function springWireM(rate: number): number {
  const D = 2 * DRAWING.springMeanRadiusM;
  const n = DRAWING.springTurns - 2 * DRAWING.springEndTurns;
  return ((8 * rate * D ** 3 * n) / STEEL_SHEAR_PA) ** 0.25;
}

/** Everything that decides the model's geometry: two resolved corners with the same key share a model. */
export function cornerGeometryKey(r: ResolvedCorner): string {
  const spec = r.corner.axle;
  const link = spec.linkage;
  return JSON.stringify([
    link.wishbones.map((w) => [w.front, w.rear, w.ball]),
    link.rods.map((rod) => [rod.body, rod.knuckle]),
    link.strut ? [link.strut.top, link.strut.lower] : null,
    spec.wheelCentre,
    spec.spinAxis,
    spec.spring.strutSeats,
    spec.halfshaft,
    r.bumpStop.contactM,
    r.bumpStop.lengthM,
    r.topOutM,
    r.tyre.freeRadiusM,
    r.tyre.widthM,
    r.corner.tyre,
  ]);
}

const X = new THREE.Vector3(1, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

/** A link as drawn: the object that carries it and both ends in that object's own frame, for the stretch test. */
export interface DrawnLink {
  name: string;
  object: THREE.Object3D;
  /** End on the body (or rack) and end on the knuckle, local to `object`. */
  bodyEnd: THREE.Vector3;
  knuckleEnd: THREE.Vector3;
}

/** A mesh that swaps material with the view. */
interface Shell {
  mesh: THREE.Mesh;
  solid: THREE.Material;
  glass: THREE.Material;
}

/** A MacPherson corner (the left one: outboard is +X). */
export class CornerModel {
  readonly group = new THREE.Group();
  /** Everything on the body: moves with bodyZ. Overlays live here too. */
  readonly body = new THREE.Group();
  readonly parts: Record<string, PartInfo> = SUSPENSION_PARTS;
  readonly materials: CornerMaterials;
  readonly press: RoadPressUniforms = roadPressUniforms();
  /** The links as drawn, for tests and for anyone checking that nothing stretches. */
  readonly links: DrawnLink[] = [];
  readonly knuckle = new THREE.Group();
  readonly halfshaft: HalfshaftView | null;
  /** The knuckle's pose this frame (solver layout) and the travel and rack it was solved for. */
  readonly pose = new Float64Array(POSE_SIZE);
  readonly road: RoadStrip;
  readonly tyre: THREE.Mesh;
  readonly forces = new ForceArrows();
  readonly laser = new CamberLaser();
  readonly schematic: CornerSchematic;
  private resolved: ResolvedCorner;
  private axle: Axle;
  private statics: KnuckleStatics;
  private readonly view: RoadView = { profile: null, x: 0, lift: 0 };
  private readonly frame = cornerFrame();
  private explode = 0;
  private viewMode: ViewMode = 'solid';
  private forcesOn = true;
  private laserOn = true;
  private readonly shells: Shell[] = [];
  /** Hidden in the mechanism view, and inner parts seen in the X-ray only. */
  private readonly solidOnly: THREE.Object3D[] = [];
  private readonly xrayOnly: THREE.Object3D[] = [];
  private failures: Array<() => void> = [];
  private failed: string | null = null;
  /** Whether the bump stop is drawn red for its squeeze (past 20 %); null: write it on the next frame. */
  private stopRed: boolean | null = null;
  private highlightUndo: Array<() => void> = [];
  private ghostAlpha = 1;
  private readonly ghostBase = new Map<THREE.Material, { opacity: number; transparent: boolean; depthWrite: boolean }>();
  private readonly orders = new Map<THREE.Object3D, number>();

  // Points of the drawing, scene units, body frame at design.
  private readonly c0: THREE.Vector3;
  private readonly spinAxis0: THREE.Vector3;
  private readonly armFront: THREE.Vector3;
  private readonly armRear: THREE.Vector3;
  private readonly ball0: THREE.Vector3;
  private readonly tieInner0: THREE.Vector3;
  private readonly tieOuter0: THREE.Vector3;
  private readonly strutTop0: THREE.Vector3;
  private readonly strutLower0: THREE.Vector3;
  private readonly upperSeat: number;
  private readonly lowerSeat: number;
  private readonly tubeTop: number;
  private readonly rodLength: number;
  private readonly stopLength: number;

  // Moving groups.
  private readonly arm = new THREE.Group();
  private readonly tie = new THREE.Group();
  private readonly tieRodMesh: THREE.Mesh;
  private readonly rack = new THREE.Group();
  private readonly rackBar: THREE.Mesh;
  private readonly rackBoot = new Bellows(0.3, 0.16, 7, 0.07);
  private readonly strutTop = new THREE.Group();
  private readonly topMount: THREE.Mesh;
  private readonly bumpStop: THREE.Mesh;
  private readonly springMesh: THREE.Mesh;
  private readonly spring: CoilSpring;
  private springWire: number;
  private readonly hubFrame = new THREE.Group();
  private readonly spin = new THREE.Group();
  private readonly hub: THREE.Mesh;
  private readonly disc: THREE.Mesh;
  private readonly caliper: THREE.Mesh;
  private readonly wheel: THREE.Mesh;
  private readonly nuts: THREE.Mesh;
  private readonly bodyShell: THREE.Mesh;
  private readonly subframe: THREE.Mesh;
  private readonly bumpSqueeze = { value: 0 };

  // Scratch, so update() allocates nothing.
  private readonly v1 = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();
  private readonly v3 = new THREE.Vector3();
  private readonly v4 = new THREE.Vector3();
  private readonly v5 = new THREE.Vector3();
  private readonly q1 = new THREE.Quaternion();
  private readonly m1 = new THREE.Matrix4();
  private readonly ball = new THREE.Vector3();
  private readonly tieOuter = new THREE.Vector3();
  private readonly tieInner = new THREE.Vector3();
  private readonly lower = new THREE.Vector3();
  private readonly top = new THREE.Vector3();
  private readonly wheelCentre = new THREE.Vector3();
  private readonly axis = new THREE.Vector3();
  private readonly inPlaneUp = new THREE.Vector3();
  private readonly contact = new THREE.Vector3();
  private readonly outerJoint = new THREE.Vector3();
  private readonly force = new THREE.Vector3();
  private readonly forceB = new THREE.Vector3();
  private readonly fa = [0, 0, 0];
  private readonly solved: SolveResult = { ok: false, iterations: 0, residual: 0, detSign: 0, worst: '' };

  constructor(resolved: ResolvedCorner, profile: RoadProfile | null = null) {
    this.resolved = resolved;
    this.axle = resolved.axle;
    this.statics = new KnuckleStatics(this.axle);
    this.view.profile = profile;
    const spec = resolved.corner.axle;
    const link = spec.linkage;
    const strut = link.strut;
    const wishbone = link.wishbones[0];
    const rod = link.rods.find((r) => r.steer) ?? link.rods[0];
    if (!strut || !wishbone || !rod || spec.spring.wheel !== 'strut') throw new Error('CornerModel draws a MacPherson strut corner');
    const m = (this.materials = createCornerMaterials(this.press));

    // ---- Points of the drawing (scene, design) ----
    this.c0 = toScene(spec.wheelCentre);
    this.spinAxis0 = toScene(spec.spinAxis).normalize();
    this.armFront = toScene(wishbone.front);
    this.armRear = toScene(wishbone.rear);
    this.ball0 = toScene(wishbone.ball);
    this.tieInner0 = toScene(rod.body);
    this.tieOuter0 = toScene(rod.knuckle);
    this.strutTop0 = toScene(strut.top);
    this.strutLower0 = toScene(strut.lower);
    const seats = spec.spring.strutSeats ?? { upperM: 0.03, lowerM: 0.15 };
    this.upperSeat = seats.upperM * 10;
    this.lowerSeat = seats.lowerM * 10;
    this.stopLength = resolved.bumpStop.lengthM * 10;
    // The tube's top meets the bump stop exactly when the damper is as short as the stop's contact length.
    this.tubeTop = resolved.bumpStop.contactM * 10 - this.upperSeat - this.stopLength;
    // The rod is long enough to keep the piston under the guide at top-out.
    this.rodLength = resolved.topOutM * 10 - this.tubeTop + DRAWING.guideM * 10 + 0.1;
    const shortest = this.axle.value('damperLen', this.axle.table.travel0 + (this.axle.table.n - 1) * this.axle.table.step) * 10;
    const tubeBottom = Math.min(-0.1, shortest - this.rodLength - 0.25);
    const strutDir0 = this.strutTop0.clone().sub(this.strutLower0).normalize();

    // ---- Body: glass piece of the shell and the subframe ----
    this.group.add(this.body);
    const T = this.strutTop0;
    const iso = (x: number, y: number, z: number): THREE.Vector3 => toScene([x, y, z]);
    const towerR = 0.95;
    const bodyParts = [
      // Strut tower round the top mount, closed at the top.
      latheAlong(
        [
          [towerR, -1.15],
          [towerR, 0.32],
          [towerR - 0.15, 0.4],
          [0.0001, 0.4],
        ],
        T,
        UP,
        32,
      ),
      // Inner fender from the tower to the front, and the frame rail under it along the car.
      slab(iso(-0.5, 0.452, 0.71), iso(0.42, 0.452, 0.71), X, 3.2, 0.15),
      slab(iso(-0.6, 0.395, 0.55), iso(0.6, 0.395, 0.55), X, 1.0, 0.7),
    ];
    this.bodyShell = tag(new THREE.Mesh(merge(bodyParts), m.body), 'susp.body');
    this.bodyShell.renderOrder = 2;
    const subParts = [
      slab(iso(-0.26, 0.275, 0.225), iso(0.3, 0.275, 0.225), UP, 0.5, 0.5),
      slab(iso(0.22, 0.29, 0.21), iso(0.22, 0.34, 0.26), X, 0.5, 0.7),
      slab(iso(-0.128, 0.29, 0.21), iso(-0.128, 0.33, 0.295), X, 0.5, 0.7),
    ];
    this.subframe = tag(new THREE.Mesh(merge(subParts), m.body), 'susp.subframe');
    this.subframe.renderOrder = 2;
    this.body.add(this.bodyShell, this.subframe);
    this.shells.push({ mesh: this.bodyShell, solid: m.body, glass: m.bodyXray }, { mesh: this.subframe, solid: m.body, glass: m.bodyXray });

    // ---- Top mount on the body (moves with the camber plates) ----
    this.topMount = tag(
      new THREE.Mesh(
        merge([
          latheAlong(ringProfile(0.12, 0.72, -0.12, 0.05), new THREE.Vector3(), UP, 32, true),
          latheAlong(ringProfile(0.12, 0.62, 0.05, 0.12), new THREE.Vector3(), UP, 32, true),
        ]),
        m.rubber,
      ),
      'susp.top-mount',
    );
    this.body.add(this.topMount);
    this.solidOnly.push(this.topMount);

    // ---- Strut top: rod, upper seat and bearing, bump stop, spring; local −Y runs down the strut axis ----
    this.strutTop.name = 'strut-top';
    this.body.add(this.strutTop);
    const seatR = DRAWING.springMeanRadiusM * 10 + 0.15;
    const upper = tag(
      new THREE.Mesh(
        merge([
          // Bearing under the mount, a neck down to the upper spring seat, and the seat itself.
          latheAlong(ringProfile(0.15, 0.5, -0.2, -0.12), new THREE.Vector3(), UP, 28, true),
          latheAlong(ringProfile(0.15, 0.36, -this.upperSeat + 0.04, -0.2), new THREE.Vector3(), UP, 28, true),
          latheAlong(ringProfile(0.15, seatR, -this.upperSeat, -this.upperSeat + 0.04), new THREE.Vector3(), UP, 36, true),
          // The nut on the rod's end above the mount: the same steel, so the same draw call.
          boss(new THREE.Vector3(0, 0.3, 0), UP, 0.17, 0.12, 6),
        ]),
        m.steel,
      ),
      'susp.top-mount',
    );
    const rodMesh = tag(new THREE.Mesh(rodBetween(new THREE.Vector3(0, 0.35, 0), new THREE.Vector3(0, -this.rodLength, 0), DRAWING.rodRadiusM * 10, 16), m.chrome), 'susp.damper-rod');
    const pistonY = -this.rodLength;
    const piston = tag(
      new THREE.Mesh(
        merge([
          boss(new THREE.Vector3(0, pistonY, 0), UP, 0.19, 0.1, 24),
          boss(new THREE.Vector3(0, pistonY + 0.09, 0), UP, 0.15, 0.025, 24),
          boss(new THREE.Vector3(0, pistonY + 0.12, 0), UP, 0.12, 0.02, 24),
          boss(new THREE.Vector3(0, pistonY - 0.09, 0), UP, 0.15, 0.025, 24),
          boss(new THREE.Vector3(0, pistonY - 0.12, 0), UP, 0.12, 0.02, 24),
          boss(new THREE.Vector3(0, pistonY - 0.17, 0), UP, 0.08, 0.06, 6),
        ]),
        m.piston,
      ),
      'susp.damper-piston',
    );
    this.xrayOnly.push(piston);
    // Bump stop: corrugated, hung under the upper seat, squeezed by scaling along the rod.
    const stopProfile: Array<[number, number]> = [];
    const folds = 4;
    for (let i = 0; i <= 48; i++) {
      const u = i / 48;
      stopProfile.push([0.24 + 0.06 * (0.5 - 0.5 * Math.cos(2 * Math.PI * folds * u)) + 0.03 * u, -u * this.stopLength]);
    }
    stopProfile.reverse();
    this.bumpStop = tag(new THREE.Mesh(lathe([[0.12, -this.stopLength], ...stopProfile, [0.12, 0]], 28), m.bumpStop), 'susp.bump-stop');
    this.bumpStop.position.y = -this.upperSeat;
    this.shells.push({ mesh: this.bumpStop, solid: m.bumpStop, glass: m.bumpStopGlass });
    this.spring = new CoilSpring(DRAWING.springMeanRadiusM * 10, DRAWING.springTurns, DRAWING.springEndTurns);
    this.springWire = springWireM(resolved.spring.rate) * 10;
    this.springMesh = tag(new THREE.Mesh(this.spring.geometry, m.spring), 'susp.spring');
    this.springMesh.position.y = -this.upperSeat;
    this.springMesh.frustumCulled = false;
    this.strutTop.add(upper, rodMesh, piston, this.bumpStop, this.springMesh);
    this.solidOnly.push(upper, rodMesh, this.bumpStop);

    // ---- Knuckle and everything rigid with it ----
    this.body.add(this.knuckle);
    const caliperAngle = 0.62;
    const hubBossLength = 0.6;
    const hubBossCentre = this.c0.clone().addScaledVector(this.spinAxis0, -0.15);
    const rear = new THREE.Vector3(0, 0, -1);
    const lug = (sign: number): THREE.Vector3 =>
      this.c0
        .clone()
        .addScaledVector(this.spinAxis0, -0.5)
        .addScaledVector(rear, Math.cos(caliperAngle) * 1.25)
        .addScaledVector(UP, sign * Math.sin(caliperAngle) * 1.25);
    const knuckleGeo = knuckleGeometry({
      hub: { centre: hubBossCentre, axis: this.spinAxis0, radius: 0.6, length: hubBossLength },
      clamp: {
        from: this.strutLower0.clone().addScaledVector(strutDir0, tubeBottom - 0.04),
        to: this.strutLower0.clone().addScaledVector(strutDir0, 0.45),
        radius: DRAWING.strutTubeRadiusM * 10 + 0.08,
      },
      ends: [
        { at: this.ball0.clone().addScaledVector(UP, 0.25), axis: UP, radius: 0.24, length: 0.4, arm: 0.2 },
        { at: this.tieOuter0.clone().addScaledVector(UP, 0.12), axis: UP, radius: 0.17, length: 0.3, arm: 0.15 },
        { at: lug(1), axis: this.spinAxis0, radius: 0.15, length: 0.3, arm: 0.13 },
        { at: lug(-1), axis: this.spinAxis0, radius: 0.15, length: 0.3, arm: 0.13 },
      ],
    });
    const knuckleMesh = tag(new THREE.Mesh(knuckleGeo, m.knuckle), 'susp.knuckle');
    // Strut tube with the lower spring seat, and the oil inside it.
    const tubeR = DRAWING.strutTubeRadiusM * 10;
    const tube = tag(
      new THREE.Mesh(
        merge([
          latheAlong(
            [
              [0.0001, tubeBottom],
              [tubeR, tubeBottom],
              [tubeR, this.tubeTop - 0.06],
              [tubeR - 0.06, this.tubeTop],
              [DRAWING.rodRadiusM * 10 + 0.02, this.tubeTop],
            ],
            this.strutLower0,
            strutDir0,
            28,
            true,
          ),
          latheAlong(ringProfile(tubeR, seatR, this.lowerSeat - 0.05, this.lowerSeat), this.strutLower0, strutDir0, 36, true),
        ]),
        m.strut,
      ),
      'susp.strut',
    );
    this.shells.push({ mesh: tube, solid: m.strut, glass: m.strutGlass });
    const oil = tag(
      new THREE.Mesh(latheAlong([[0.0001, tubeBottom + 0.04], [tubeR - 0.04, tubeBottom + 0.04], [tubeR - 0.04, this.tubeTop - 0.35], [0.0001, this.tubeTop - 0.35]], this.strutLower0, strutDir0, 24, true), m.oil),
      'susp.damper-oil',
    );
    oil.renderOrder = 1;
    this.xrayOnly.push(oil);
    // Caliper on the knuckle, straddling the disc at the rear.
    const ringIn = -DRAWING.hatDepthM * 10 + DRAWING.wheelOffsetM * 10 - DRAWING.discThickM * 10;
    const ringOut = ringIn + DRAWING.discThickM * 10;
    this.caliper = tag(new THREE.Mesh(caliperGeometry(ringIn, ringOut, caliperAngle - 0.08), m.caliper), 'susp.caliper');
    this.caliper.position.copy(this.c0);
    this.caliper.quaternion.setFromUnitVectors(X, this.spinAxis0);
    this.knuckle.add(knuckleMesh, tube, oil, this.caliper);
    this.solidOnly.push(tube, this.caliper);

    // Hub frame on the knuckle at the wheel centre, local +X along the spin axis; the spinning parts under it.
    this.hubFrame.position.copy(this.c0);
    this.hubFrame.quaternion.setFromUnitVectors(X, this.spinAxis0);
    this.knuckle.add(this.hubFrame);
    this.hubFrame.add(this.spin);
    const face = DRAWING.wheelOffsetM * 10;
    const hubGeo = merge([
      lathe(ringProfile(0.12, 0.7, face - 0.19, face - 0.07), 36, true),
      lathe(ringProfile(0.12, 0.34, -0.45, face - 0.19), 28, true),
    ]).rotateZ(-Math.PI / 2);
    this.hub = tag(new THREE.Mesh(hubGeo, m.steel), 'susp.hub');
    this.disc = tag(new THREE.Mesh(discGeometry(face, ringIn, ringOut), m.disc), 'susp.brake-disc');
    const rimR = tyreVertical(resolved.corner.tyre).rimRadiusM * 10;
    const rimW = DRAWING.rimWidthM * 10;
    this.wheel = tag(new THREE.Mesh(wheelGeometry(rimR, rimW, face), m.wheel), 'susp.wheel');
    this.shells.push({ mesh: this.wheel, solid: m.wheel, glass: m.wheelGlass });
    const nutParts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      nutParts.push(boss(new THREE.Vector3(face + 0.27, Math.cos(a) * 0.57, Math.sin(a) * 0.57), X, 0.1, 0.18, 6));
    }
    this.nuts = tag(new THREE.Mesh(merge(nutParts), m.nut), 'susp.wheel');
    const tyreGeo = lathe(tyreProfile(resolved.tyre.freeRadiusM * 10, rimR, resolved.tyre.widthM * 10, rimW), 120).rotateZ(-Math.PI / 2);
    this.tyre = tag(new THREE.Mesh(tyreGeo, m.tyre), 'susp.tyre');
    this.tyre.customDepthMaterial = m.tyreDepth;
    this.tyre.frustumCulled = false;
    this.shells.push({ mesh: this.tyre, solid: m.tyre, glass: m.tyreGlass });
    this.spin.add(this.hub, this.disc, this.wheel, this.nuts, this.tyre);
    this.solidOnly.push(this.hub, this.disc, this.wheel, this.nuts, this.tyre);

    // ---- Lower arm: two tubes and a web between them, the bushes and the ball joint; turns about the bush axis ----
    const armR = 0.16;
    const web = webGeometry(this.armFront, this.armRear, this.ball0, 0.1);
    const armMesh = tag(new THREE.Mesh(merge([capsule(this.armFront, this.ball0, armR, armR * 0.9), capsule(this.armRear, this.ball0, armR, armR * 0.9), web]), m.arm), 'susp.lower-arm');
    const bushAxis = this.armRear.clone().sub(this.armFront).normalize();
    const bushes = tag(
      new THREE.Mesh(
        merge([boss(this.armFront, bushAxis, 0.32, 0.62, 20), boss(this.armRear, bushAxis, 0.34, 0.7, 20)]),
        m.rubber,
      ),
      'susp.bush',
    );
    const ballJoint = tag(
      new THREE.Mesh(
        merge([
          boss(this.ball0.clone().addScaledVector(UP, -0.12), UP, 0.27, 0.26, 20),
          new THREE.SphereGeometry(0.17, 16, 12).translate(this.ball0.x, this.ball0.y, this.ball0.z),
          latheAlong([[0.22, 0], [0.24, 0.06], [0.17, 0.16], [0.1, 0.22]], this.ball0.clone().addScaledVector(UP, 0.02), UP, 18),
        ]),
        m.boot,
      ),
      'susp.ball-joint',
    );
    this.arm.add(armMesh, bushes, ballJoint);
    this.body.add(this.arm);
    this.solidOnly.push(armMesh, bushes, ballJoint);
    this.links.push(
      { name: 'lower-arm.front', object: this.arm, bodyEnd: this.armFront.clone(), knuckleEnd: this.ball0.clone() },
      { name: 'lower-arm.rear', object: this.arm, bodyEnd: this.armRear.clone(), knuckleEnd: this.ball0.clone() },
    );

    // ---- Tie rod (along local +Y from the rack end) and the rack's end with its boot ----
    this.tieRodMesh = tag(new THREE.Mesh(tieRodGeometry(this.tieLength()), m.steel), 'susp.tie-rod');
    this.tie.add(this.tieRodMesh);
    this.body.add(this.tie);
    this.solidOnly.push(this.tieRodMesh);
    this.links.push({ name: 'tie-rod', object: this.tie, bodyEnd: new THREE.Vector3(), knuckleEnd: new THREE.Vector3(0, this.tieLength(), 0) });
    const housingEnd = this.tieInner0.x - 0.75;
    const housing = tag(
      new THREE.Mesh(
        merge([
          latheAlong([[0.0001, 0], [0.3, 0], [0.3, housingEnd - 0.4], [0.36, housingEnd - 0.35], [0.36, housingEnd], [0.0001, housingEnd]], new THREE.Vector3(0, this.tieInner0.y, this.tieInner0.z), X, 28, true),
        ]),
        m.steel,
      ),
      'susp.rack',
    );
    this.rackBar = tag(new THREE.Mesh(rodBetween(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), 0.12, 14), m.chrome), 'susp.rack');
    const rackBootMesh = tag(new THREE.Mesh(this.rackBoot.geometry, m.boot), 'susp.rack');
    rackBootMesh.frustumCulled = false;
    rackBootMesh.userData.solid = m.boot;
    rackBootMesh.userData.glass = m.bootGlass;
    this.shells.push({ mesh: housing, solid: m.steel, glass: m.strutGlass }, { mesh: rackBootMesh, solid: m.boot, glass: m.bootGlass });
    this.rack.add(housing, this.rackBar, rackBootMesh);
    this.body.add(this.rack);
    this.rackHousingEnd = housingEnd;
    this.solidOnly.push(housing, rackBootMesh);
    this.xrayOnly.push(this.rackBar);

    // ---- Halfshaft ----
    if (spec.halfshaft) {
      const outerLocal = toScene(spec.halfshaft.outerJoint).sub(this.c0);
      // In the hub frame: along the spin axis, so the design spin axis is local +X.
      const outerInHub = new THREE.Vector3(outerLocal.dot(this.spinAxis0), 0, 0);
      this.halfshaft = new HalfshaftView(spec.halfshaft, toScene(spec.halfshaft.outerJoint), outerInHub, m);
      this.halfshaft.setBootMaterials(m.boot, m.bootGlass);
      this.body.add(this.halfshaft.group);
      this.spin.add(this.halfshaft.bell, this.halfshaft.balls);
      this.solidOnly.push(this.halfshaft.group, this.halfshaft.bell);
      this.bellX0 = outerInHub.x;
    } else {
      this.halfshaft = null;
      this.bellX0 = 0;
    }

    // ---- Road, overlays and the mechanism view's drawing ----
    const tyreHalf = (resolved.tyre.widthM / 2) * 10;
    this.road = new RoadStrip(m.road, spec.wheelCentre[0], this.c0.x - tyreHalf - 2.2, this.c0.x + tyreHalf + 1.6);
    this.group.add(this.road.mesh);
    this.body.add(this.forces.group, this.laser.group);
    this.schematic = new CornerSchematic(m);
    this.body.add(this.schematic.group);

    // Lines and sprites sort by renderOrder too, so the band takes every object, overlays included, not only meshes.
    this.group.traverse((o) => this.orders.set(o, o.renderOrder));
    // Shadows from what can cast one: not the road, not the overlays, and not parts that sit inside others (the piston,
    // the oil, the tripod's spider and the joint's balls, the rack's bar in its housing) or under the wheel (the nuts).
    const inside = new Set<THREE.Object3D>([...this.xrayOnly, this.nuts]);
    if (this.halfshaft) for (const o of [this.halfshaft.spider, this.halfshaft.balls]) inside.add(o);
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && o.userData.part && o !== this.road.mesh && !inside.has(o)) mesh.castShadow = true;
    });
    this.setView('solid');
    this.update(this.frame);
  }

  private readonly rackHousingEnd: number;
  private readonly bellX0: number;

  private tieLength(): number {
    const rod = this.resolved.axle.spec.linkage.rods.find((r) => r.steer) ?? this.resolved.axle.spec.linkage.rods[0]!;
    return (rod.lengthM ?? Math.hypot(rod.body[0] - rod.knuckle[0], rod.body[1] - rod.knuckle[1], rod.body[2] - rod.knuckle[2])) * 10;
  }

  /**
   * Takes a new setup of the same corner (cornerGeometryKey unchanged): the top mount's camber shift, the tie rod's
   * length, the spring's rate. A different key needs a new model.
   */
  setCorner(resolved: ResolvedCorner): void {
    if (cornerGeometryKey(resolved) !== cornerGeometryKey(this.resolved)) throw new Error('A corner of another geometry needs a new CornerModel');
    this.resolved = resolved;
    this.axle = resolved.axle;
    this.statics = new KnuckleStatics(this.axle);
    this.springWire = springWireM(resolved.spring.rate) * 10;
    this.tieRodMesh.geometry.dispose();
    this.tieRodMesh.geometry = tieRodGeometry(this.tieLength());
    this.links.find((l) => l.name === 'tie-rod')!.knuckleEnd.set(0, this.tieLength(), 0);
    this.pose.fill(0);
    this.update(this.frame);
  }

  /** The road under the wheel (null: flat). */
  setRoad(profile: RoadProfile | null): void {
    this.view.profile = profile;
  }

  /** Force arrows and the camber laser on or off. */
  setOverlays(on: { forces?: boolean; laser?: boolean }): void {
    if (on.forces !== undefined) this.forcesOn = on.forces;
    if (on.laser !== undefined) this.laserOn = on.laser;
    this.update(this.frame);
  }

  setView(view: ViewMode): void {
    this.viewMode = view;
    const mech = view === 'mechanism';
    for (const s of this.shells) {
      s.mesh.material = view === 'xray' ? s.glass : s.solid;
      // Glass casts no shadow: the shells in the X-ray, and the body, which is glass in every view.
      s.mesh.castShadow = view === 'solid' && !s.solid.transparent;
    }
    for (const o of this.solidOnly) o.visible = !mech;
    for (const o of this.xrayOnly) o.visible = view === 'xray';
    this.halfshaft?.setXray(view === 'xray');
    if (this.halfshaft && mech) {
      this.halfshaft.group.visible = false;
      this.halfshaft.bell.visible = false;
      this.halfshaft.balls.visible = false;
    }
    this.bodyShell.visible = !mech;
    this.subframe.visible = !mech;
    this.schematic.group.visible = mech;
    this.springMesh.visible = true;
    this.update(this.frame);
  }

  setExplode(amount: number): void {
    this.explode = Math.min(1, Math.max(0, amount));
    this.update(this.frame);
  }

  /** Marks the failed part (a cracked spring, a crushed bump stop): every material of meshes with that key glows. */
  setFailure(part: string | null): void {
    for (const undo of this.failures) undo();
    this.failures = [];
    this.failed = part;
    // The per-frame red marks of the bump stop and the shaft's joints are written afresh, except on the failed part.
    this.stopRed = null;
    this.halfshaft?.refreshMarks({ inner: part === 'susp.cv-inner', outer: part === 'susp.cv-outer' });
    if (!part) return;
    const seen = new Set<THREE.Material>();
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || o.userData.part !== part) return;
      for (const mat of [mesh.material, o.userData.solid, o.userData.glass].flat() as Array<THREE.Material | undefined>) {
        if (mat && 'emissive' in mat && !seen.has(mat)) {
          seen.add(mat);
          this.failures.push(markDamaged(mat as THREE.MeshStandardMaterial));
        }
      }
    });
  }

  setHighlight(on: boolean): void {
    for (const undo of this.highlightUndo) undo();
    if (this.highlightUndo.length > 0) {
      // The undo put back the tints of the moment the highlight came on; a stop or a joint may have changed since.
      if (this.failed !== 'susp.bump-stop') this.stopRed = null;
      this.halfshaft?.refreshMarks({ inner: this.failed === 'susp.cv-inner', outer: this.failed === 'susp.cv-outer' });
    }
    this.highlightUndo = [];
    if (!on) return;
    for (const mat of this.ownMaterials()) {
      if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
      const before = mat.emissive.clone();
      const intensity = mat.emissiveIntensity;
      mat.emissive.set('#ffb35c');
      mat.emissiveIntensity = 0.28;
      this.highlightUndo.push(() => {
        mat.emissive.copy(before);
        mat.emissiveIntensity = intensity;
      });
    }
  }

  setGhost(alpha: number): void {
    this.ghostAlpha = Math.min(1, Math.max(0, alpha));
    for (const mat of this.ownMaterials()) {
      let base = this.ghostBase.get(mat);
      if (!base) {
        base = { opacity: mat.opacity, transparent: mat.transparent, depthWrite: mat.depthWrite };
        this.ghostBase.set(mat, base);
      }
      const ghost = this.ghostAlpha < 1;
      mat.opacity = base.opacity * this.ghostAlpha;
      if (mat.transparent !== (ghost || base.transparent)) {
        mat.transparent = ghost || base.transparent;
        mat.needsUpdate = true;
      }
      mat.depthWrite = ghost ? false : base.depthWrite;
    }
  }

  setRenderBand(base: number): void {
    for (const [o, order] of this.orders) o.renderOrder = order + base;
  }

  /** Named points in the model's frame, scene units: for joining this corner to an axle or a car. */
  anchors(): Record<string, THREE.Vector3> {
    const toModel = (v: THREE.Vector3): THREE.Vector3 => v.clone().add(this.body.position);
    const out: Record<string, THREE.Vector3> = {
      wheelCentre: toModel(this.wheelCentre),
      contact: toModel(this.contact),
      strutTop: toModel(this.top),
      rackEnd: toModel(this.tieInner),
    };
    if (this.halfshaft) out.diffOutput = toModel(this.halfshaft.inner);
    return out;
  }

  private ownMaterials(): THREE.Material[] {
    // Every material of either view, not only the ones on show: the view may change while the tint is on.
    const list = new Set<THREE.Material>(Object.values(this.materials) as THREE.Material[]);
    for (const m of this.halfshaft?.materials() ?? []) list.add(m);
    this.group.traverse((o) => {
      const mat = (o as THREE.Mesh).material;
      for (const m of [mat].flat() as Array<THREE.Material | undefined>) if (m) list.add(m);
    });
    return [...list];
  }

  update(frame: CornerFrame): void {
    if (frame !== this.frame) Object.assign(this.frame, frame);
    const f = this.frame;
    const e = this.explode;
    const axle = this.axle;
    const spec = axle.spec;
    const mech = this.viewMode === 'mechanism';

    // Knuckle pose: exact, warm from the last frame (the table's pose the first time or after a failure).
    const warm = this.pose[6] === 0 && this.pose[3] === 0 ? null : this.pose;
    const res = axle.solvePose(f.travel, f.rack, warm, this.pose, this.solved);
    if (!res.ok) axle.solvePose(f.travel, f.rack, null, this.pose, this.solved);
    this.body.position.set(0, f.bodyZ * 10, 0);
    // ISO quaternion (x, y, z) → scene (y, z, x), as points are.
    const P = this.pose;
    this.q1.set(P[4]!, P[5]!, P[3]!, P[6]!);
    this.knuckle.quaternion.copy(this.q1);
    this.v1.copy(this.c0).applyQuaternion(this.q1);
    this.knuckle.position.set(this.c0.x + P[1]! * 10 - this.v1.x, this.c0.y + P[2]! * 10 - this.v1.y, this.c0.z + P[0]! * 10 - this.v1.z);
    this.knuckle.updateMatrix();
    const K = this.knuckle.matrix;
    this.ball.copy(this.ball0).applyMatrix4(K);
    this.tieOuter.copy(this.tieOuter0).applyMatrix4(K);
    this.lower.copy(this.strutLower0).applyMatrix4(K);
    this.wheelCentre.copy(this.c0).applyMatrix4(K);
    this.axis.copy(this.spinAxis0).applyQuaternion(this.q1);
    const shift = spec.linkage.strut!.topShift ?? [0, 0, 0];
    this.top.set(this.strutTop0.x + shift[1] * 10, this.strutTop0.y + shift[2] * 10, this.strutTop0.z + shift[0] * 10);
    this.tieInner.copy(this.tieInner0).setX(this.tieInner0.x + f.rack * 10);

    // Lower arm: turn about the bush axis until the ball joint meets the knuckle's.
    {
      const u = this.v1.copy(this.armRear).sub(this.armFront).normalize();
      const a = this.v2.copy(this.ball0).sub(this.armFront);
      a.addScaledVector(u, -a.dot(u));
      const b = this.v3.copy(this.ball).sub(this.armFront);
      b.addScaledVector(u, -b.dot(u));
      const angle = Math.atan2(this.v4.crossVectors(a, b).dot(u), a.dot(b));
      this.arm.quaternion.setFromAxisAngle(u, angle);
      this.arm.position.copy(this.armFront).sub(this.v5.copy(this.armFront).applyQuaternion(this.arm.quaternion));
      // Exploded: away from the knuckle along the arm.
      const away = this.v2.copy(this.armFront).add(this.armRear).multiplyScalar(0.5).sub(this.ball);
      const len = away.length();
      this.arm.position.addScaledVector(away.divideScalar(len), e * 0.6 * len);
    }

    // Tie rod from the rack end to the steering arm; exploded towards the rack, which goes inboard with it.
    {
      const d = this.v1.copy(this.tieOuter).sub(this.tieInner);
      const len = d.length();
      d.divideScalar(len);
      this.tie.quaternion.setFromUnitVectors(UP, d);
      this.tie.position.copy(this.tieInner).addScaledVector(d, -e * 0.6 * len);
      this.rack.position.set(-e * 0.6 * len, 0, 0);
      // Rack bar from the car's centre to the inner joint, and the boot from the housing's end to the rod. Both live
      // in the rack's group, which the explode moves inboard by the same amount as the rod.
      const shiftT = e * 0.6 * len;
      this.rackBar.position.set(0, this.tieInner0.y, this.tieInner0.z);
      this.rackBar.scale.set(Math.max(0.01, this.tieInner.x - d.x * shiftT + shiftT), 1, 1);
      this.v2.set(this.rackHousingEnd, this.tieInner0.y, this.tieInner0.z);
      this.v3.copy(this.tieInner).addScaledVector(d, 0.45 - shiftT);
      this.v3.x += shiftT;
      this.rackBoot.update(this.v2, X, this.v3, d);
    }

    // Strut: the rod hangs from the top mount along the strut's axis through the knuckle's strut point.
    const L = this.v1.copy(this.lower).sub(this.top).length();
    {
      const down = this.v2.copy(this.lower).sub(this.top).divideScalar(L);
      this.strutTop.quaternion.setFromUnitVectors(DOWN, down);
      this.strutTop.position.copy(this.top).addScaledVector(down, -e * 0.6 * L);
      this.topMount.position.copy(this.top).addScaledVector(UP, e * 0.6 * L + e * 1.2);
      const springLength = L - this.upperSeat - this.lowerSeat;
      this.spring.update(springLength, mech ? 0.035 : this.springWire / 2);
      this.springMesh.position.y = -this.upperSeat + e * 2.2;
      // Bump stop: squeezed by the tube's top once the gap closes. Red past 20 % (suspensions plan, 3D parts).
      const room = L - this.tubeTop - this.upperSeat;
      const squeeze = Math.min(0.85, Math.max(0, 1 - room / this.stopLength));
      this.bumpStop.scale.y = 1 - squeeze;
      this.bumpSqueeze.value = squeeze;
      // Written only when it changes, and never over a failure's own mark.
      const red = squeeze > 0.2;
      if (red !== this.stopRed && this.failed !== 'susp.bump-stop') {
        this.stopRed = red;
        for (const mat of [this.materials.bumpStop, this.materials.bumpStopGlass]) {
          mat.emissive.set(red ? '#ff2a10' : '#000000');
          mat.emissiveIntensity = 1;
        }
      }
    }

    // Wheel assembly: spin, and outboard when exploded (hub least, the tyre off its rim furthest).
    this.spin.rotation.x = f.spin;
    this.hub.position.x = e * 0.8;
    this.disc.position.x = e * 2.0;
    this.wheel.position.x = e * 3.6;
    this.nuts.position.x = e * 3.6;
    this.tyre.position.x = e * 5.2;
    this.caliper.position.copy(this.c0).addScaledVector(this.spinAxis0, e * 1.4);
    this.caliper.position.z -= e * 1.6;
    this.bodyShell.position.y = e * 6;
    this.subframe.position.y = -e * 1.5;

    // Halfshaft: from the differential to the outer joint on the hub.
    if (this.halfshaft) {
      const hs = spec.halfshaft!;
      this.outerJoint.copy(toScene(hs.outerJoint, this.v1)).applyMatrix4(K);
      this.halfshaft.update(this.outerJoint, this.axis, f.spin, e, e * 0.8);
      this.halfshaft.bell.position.x = this.bellX0 + e * 0.8;
      this.halfshaft.balls.position.x = this.bellX0 + e * 0.8;
    }

    // The wheel plane and the contact patch on the road under it (body frame).
    const ax = this.axis;
    this.inPlaneUp.set(-ax.x * ax.y, 1 - ax.y * ax.y, -ax.z * ax.y).normalize();
    this.view.x = f.roadX;
    this.view.lift = f.roadLift;
    const roadAtWheel = this.road.heightAt(this.view, this.wheelCentre.z) * 10 - f.bodyZ * 10;
    const down = (this.wheelCentre.y - roadAtWheel) / this.inPlaneUp.y;
    this.contact.copy(this.wheelCentre).addScaledVector(this.inPlaneUp, -down);

    // Road and the tyre's press: the profile under the wheel, in the model's frame.
    this.road.update(this.view);
    this.group.updateMatrixWorld(true);
    this.updatePress();

    // Overlays: they belong to the assembled corner, so a pulled-apart one has none.
    const assembled = e < 0.01;
    this.forces.group.visible = this.forcesOn && assembled;
    this.laser.group.visible = this.laserOn && assembled;
    if (this.forcesOn && assembled) this.updateForces(f);
    if (this.laserOn && assembled) {
      const camber = -Math.atan2(this.axis.y, Math.hypot(this.axis.x, this.axis.z));
      this.laser.update(this.contact, this.wheelCentre, this.inPlaneUp, this.axis, camber);
    }
    if (mech) {
      this.schematic.update({
        armFront: this.armFront,
        armRear: this.armRear,
        ball: this.ball,
        tieInner: this.tieInner,
        tieOuter: this.tieOuter,
        top: this.top,
        lower: this.lower,
        wheelCentre: this.wheelCentre,
        axis: this.axis,
        contact: this.contact,
        freeRadius: this.resolved.tyre.freeRadiusM * 10,
        diffOutput: this.halfshaft?.inner ?? null,
        outerJoint: this.halfshaft ? this.outerJoint : null,
      });
    }
  }

  private updatePress(): void {
    const u = this.press;
    this.m1.copy(this.group.matrixWorld).invert();
    u.uRoadFromLocal.value.multiplyMatrices(this.m1, this.tyre.matrixWorld);
    u.uLocalFromRoad.value.copy(u.uRoadFromLocal.value).invert();
    // The strip's own columns round the wheel centre, so the press reads the very top the strip draws. A wheel pulled
    // off its hub by the explode stands on nothing.
    const strip = this.road;
    const first = Math.round((this.wheelCentre.z - strip.firstZ) / COLUMN_DZ) - (ROAD_SAMPLES >> 1);
    u.uRoadZ0.value = strip.columnZ(first);
    u.uRoadDz.value = COLUMN_DZ;
    const h = u.uRoadH.value;
    const onRoad = this.explode < 0.01;
    for (let i = 0; i < ROAD_SAMPLES; i++) h[i] = onRoad ? strip.heightAt(this.view, strip.columnZ(first + i)) * 10 : -1e3;
  }

  private updateForces(f: CornerFrame): void {
    const arrows = this.forces;
    const v = this.force;
    // Tyre: up at the contact patch.
    arrows.set('tyre', this.contact, v.set(0, f.tyreN, 0));
    // Along the strut, pushing the knuckle away from the top mount: spring at its lower seat, damper and stop at the
    // tube's top.
    const down = this.v1.copy(this.lower).sub(this.top).normalize();
    const seat = this.v2.copy(this.lower).addScaledVector(down, -this.lowerSeat);
    arrows.set('spring', seat, v.copy(down).multiplyScalar(f.springN));
    const tubeTop = this.v3.copy(this.lower).addScaledVector(down, -this.tubeTop);
    arrows.set('damper', tubeTop, v.copy(down).multiplyScalar(f.damperN));
    if (f.stopN !== 0) arrows.set('stop', this.v4.copy(tubeTop).addScaledVector(down, -0.15), v.copy(down).multiplyScalar(f.stopN));
    else arrows.hide('stop');
    const weight = this.resolved.unsprungKg * G;
    arrows.set('weight', this.wheelCentre, v.set(0, -weight, 0));

    // Links: statics of the knuckle under those forces (in the ISO body frame, metres: ISO (x, y, z) = scene (z, x, y)/10).
    const s = this.statics;
    s.begin(this.pose, f.travel, f.rack);
    const c = this.contact;
    s.force(c.z / 10, c.x / 10, c.y / 10, 0, 0, f.tyreN);
    const strutN = f.springN + f.damperN + f.stopN;
    const l = this.lower;
    s.force(l.z / 10, l.x / 10, l.y / 10, down.z * strutN, down.x * strutN, down.y * strutN);
    const w = this.wheelCentre;
    s.force(w.z / 10, w.x / 10, w.y / 10, 0, 0, -weight);
    if (!s.solve()) {
      arrows.hide('arm');
      arrows.hide('tieRod');
      arrows.hide('strutTop');
      arrows.commit();
      return;
    }
    // Rows: the arm's two legs, the tie rod, then the strut's two (CornerSolver; the constructor demands this shape).
    const n = s.solver.distanceRows;
    arrows.set('arm', this.ball, this.rowSum(0, 2, this.forceB));
    arrows.set('tieRod', this.tieOuter, this.rowSum(n - 1, n, this.forceB));
    arrows.set('strutTop', this.top, this.rowSum(n, n + 2, this.forceB));
    arrows.commit();
  }

  /** Sum of the forces rows [from, to) put on the knuckle, scene axes, N. */
  private rowSum(from: number, to: number, out: THREE.Vector3): THREE.Vector3 {
    const fa = this.fa;
    out.set(0, 0, 0);
    for (let r = from; r < to; r++) {
      this.statics.rowForce(r, fa);
      out.x += fa[1]!;
      out.y += fa[2]!;
      out.z += fa[0]!;
    }
    return out;
  }

  /** How far the bump stop is squeezed, 0..1 of its length (for tests and pages). */
  get bumpStopSqueeze(): number {
    return this.bumpSqueeze.value;
  }

  dispose(): void {
    this.forces.dispose();
    this.laser.dispose();
    this.schematic.dispose();
    this.halfshaft?.dispose();
    this.road.dispose();
    const seen = new Set<THREE.BufferGeometry>();
    this.group.traverse((o) => {
      const g = (o as THREE.Mesh).geometry;
      if (g && !seen.has(g)) {
        seen.add(g);
        g.dispose();
      }
    });
    disposeMaterials(this.materials);
  }
}

/** Ventilated disc with its hat, built along +X from the wheel centre (hub frame). */
function discGeometry(face: number, ringIn: number, ringOut: number): THREE.BufferGeometry {
  const outer = DRAWING.discOuterM * 10;
  const inner = DRAWING.discInnerM * 10;
  const plate = (ringOut - ringIn) * 0.32;
  const parts = [
    annulus(inner, outer, ringIn, ringIn + plate, 64),
    annulus(inner, outer, ringOut - plate, ringOut, 64),
    // Hat: a cylinder from the ring up to the hub face and the face itself, with the hub's bore.
    lathe(
      [
        [inner, ringOut],
        [0.78, ringOut],
        [0.78, face + 0.07],
        [0.36, face + 0.07],
        [0.36, face],
        [0.72, face],
        [0.72, ringOut + 0.04],
        [inner, ringOut + 0.04],
      ],
      48,
      true,
    ),
  ];
  const vanes = 36;
  for (let i = 0; i < vanes; i++) {
    const a = (i / vanes) * Math.PI * 2;
    const r = (inner + outer) / 2;
    const vane = new THREE.BoxGeometry(outer - inner - 0.06, ringOut - ringIn - 2 * plate + 0.01, 0.05);
    vane.rotateZ(Math.PI / 2);
    vane.rotateY(-a + Math.PI / 2);
    vane.translate(Math.cos(a) * r, (ringIn + ringOut) / 2, Math.sin(a) * r);
    parts.push(vane);
  }
  return merge(parts).rotateZ(-Math.PI / 2);
}

/** Wheel: the rim and five spokes from the centre disc to the outer lip, along +X from the wheel centre. */
function wheelGeometry(rimR: number, rimW: number, face: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [lathe(rimProfile(rimR, rimW), 72)];
  // Centre disc with the bore, at the hub face.
  parts.push(lathe([[0.36, face], [0.9, face], [0.95, face + 0.08], [0.85, face + 0.2], [0.36, face + 0.2], [0.36, face]], 48, true));
  // Lathe frame: y is the axle, x and z are radial. Spokes slope outboard from the centre disc to the outer lip.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + Math.PI / 10;
    const c = Math.cos(a);
    const s = Math.sin(a);
    // From inside the centre disc into the barrel by the outer flange, so each spoke grows out of both.
    const p0 = new THREE.Vector3(c * 0.62, face + 0.14, s * 0.62);
    const p1 = new THREE.Vector3(c * (rimR - 0.03), rimW / 2 - 0.02, s * (rimR - 0.03));
    parts.push(capsuleFlat(p0, p1, 0.6, 0.36, 0.22));
  }
  return merge(parts).rotateZ(-Math.PI / 2);
}

/** A flat spoke from p0 to p1 (lathe frame: x and z radial, y axial), wider at the hub. */
function capsuleFlat(p0: THREE.Vector3, p1: THREE.Vector3, w0: number, w1: number, thick: number): THREE.BufferGeometry {
  const len = p0.distanceTo(p1);
  const shape = new THREE.Shape();
  shape.moveTo(-w0 / 2, 0);
  shape.lineTo(w0 / 2, 0);
  shape.lineTo(w1 / 2, len);
  shape.lineTo(-w1 / 2, len);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 });
  geo.translate(0, 0, -thick / 2);
  // Local Y along the spoke, local Z across the wheel's face (the axial direction, roughly).
  const y = p1.clone().sub(p0).normalize();
  const axial = new THREE.Vector3(0, 1, 0);
  const z = axial.clone().addScaledVector(y, -axial.dot(y)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  geo.applyMatrix4(new THREE.Matrix4().makeBasis(x, y, z).setPosition(p0));
  return geo;
}

/**
 * Caliper straddling the disc's ring: an inboard body over the pistons, an outboard finger and the bridge over the
 * disc's edge, an arc about the hub axis centred at the rear. Built in the hub frame (+X outboard).
 */
function caliperGeometry(ringIn: number, ringOut: number, span: number): THREE.BufferGeometry {
  const r0 = 1.05;
  const r1 = DRAWING.discOuterM * 10 + 0.07;
  const r2 = r1 + 0.2;
  const sector = (ra: number, rb: number): THREE.Shape => {
    const s = new THREE.Shape();
    const steps = 16;
    for (let i = 0; i <= steps; i++) {
      const a = Math.PI + (-span + (2 * span * i) / steps);
      const x = Math.cos(a) * rb;
      const y = Math.sin(a) * rb;
      if (i === 0) s.moveTo(x, y);
      else s.lineTo(x, y);
    }
    for (let i = steps; i >= 0; i--) {
      const a = Math.PI + (-span + (2 * span * i) / steps);
      s.lineTo(Math.cos(a) * ra, Math.sin(a) * ra);
    }
    return s;
  };
  const block = (ra: number, rb: number, x0: number, x1: number): THREE.BufferGeometry => {
    const g = new THREE.ExtrudeGeometry(sector(ra, rb), { depth: x1 - x0, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 2, curveSegments: 4 });
    g.translate(0, 0, x0);
    // Shape plane (x, y) → (scene Z, Y) round the hub axis; extrusion along +X.
    g.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)));
    return g;
  };
  return merge([block(r0, r2, ringIn - 0.38, ringIn - 0.03), block(r0 + 0.12, r2, ringOut + 0.03, ringOut + 0.2), block(r1, r2, ringIn - 0.03, ringOut + 0.03)]);
}

/** Tie rod along +Y from its inner ball joint (origin) to the outer joint at `length`. */
function tieRodGeometry(length: number): THREE.BufferGeometry {
  const o = new THREE.Vector3();
  const end = new THREE.Vector3(0, length, 0);
  return merge([
    new THREE.SphereGeometry(0.17, 16, 12),
    rodBetween(o.clone().setY(0.1), end.clone().setY(length - 0.35), 0.1, 14),
    rodBetween(end.clone().setY(length - 0.5), end.clone().setY(length - 0.18), 0.15, 6),
    new THREE.SphereGeometry(0.21, 16, 12).translate(0, length, 0),
    // The joint's housing across the rod: upright on the car, where the rod runs across it.
    boss(end.clone(), new THREE.Vector3(1, 0, 0), 0.2, 0.18, 16),
  ]);
}

/** The arm's web: a plate inside the triangle of its pivots and ball joint, inset so the tubes stay visible. */
function webGeometry(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, thickness: number): THREE.BufferGeometry {
  const centre = a.clone().add(b).add(c).divideScalar(3);
  const inset = (p: THREE.Vector3): THREE.Vector3 => p.clone().lerp(centre, 0.22);
  const [pa, pb, pc] = [inset(a), inset(b), inset(c)];
  const e1 = pb.clone().sub(pa).normalize();
  const n = new THREE.Vector3().crossVectors(pb.clone().sub(pa), pc.clone().sub(pa)).normalize();
  const e2 = new THREE.Vector3().crossVectors(n, e1);
  const to2 = (p: THREE.Vector3): THREE.Vector2 => new THREE.Vector2(p.clone().sub(pa).dot(e1), p.clone().sub(pa).dot(e2));
  const shape = new THREE.Shape([to2(pa), to2(pb), to2(pc)]);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geo.translate(0, 0, -thickness / 2);
  geo.applyMatrix4(new THREE.Matrix4().makeBasis(e1, e2, n).setPosition(pa));
  return geo;
}
