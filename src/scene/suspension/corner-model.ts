// One independent corner on links in 3D, any `links` set (CornerLinkage): a MacPherson strut with a plain knuckle or a
// split one (dual-axis, RevoKnuckle), a double wishbone, a multilink. The parts are the same everywhere: the knuckle
// (with a split one, the strut carrier and the wheel knuckle that turns in it), the links (link-builder.ts), the strut
// or a coilover with its spring, damper, bump stop and top mount (damper-unit.ts), a tie rod with a piece of the rack
// on a steered corner, hub, brake, wheel, a tyre pressed onto the road, the halfshaft with its two joints on a driven
// one, a glass piece of the body and a strip of road. Scene = (y, z, x)·10 of ISO 8855 (kinematics.ts), 1 unit =
// 100 mm; the model's origin is on the road under the middle of the axle at design ride height, like the hardpoints'.
//
// Every frame the knuckle's pose is solved exactly (Axle.solvePose, warm from the last frame), and each link is posed
// from its two ends: an arm turns about its bush axis until it meets its ball joint, a rod points from its body end
// to its knuckle end, the strut's rod hangs from the top mount along the strut's own axis, a coilover stands on the
// arm, link or knuckle it sits on and points at its top mount. Every link is rigid geometry of the solver's length,
// so nothing stretches (tests/suspension-scene.test.ts).
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
import { POSE_SIZE } from '../../suspension/solve.ts';
import type { Vec3 } from '../../suspension/spec.ts';
import { tyreVertical } from '../../vehicle/tyre-data.ts';
import type { PartInfo } from '../parts-info.ts';
import { cornerParts, isCoilover } from './parts.ts';
import { armTo, Bellows, boss, knuckleGeometry, lathe, latheAlong, ringProfile, rodBetween, toScene, tyreProfile, type KnuckleEnd } from './geometry.ts';
import { linkBody, strutBody } from './corner-body.ts';
import { DamperUnit, LoneSpring } from './damper-unit.ts';
import { DRAWING, springWireM } from './drawing.ts';
import { HalfshaftView } from './halfshaft.ts';
import { armPlane, axisPivots, holdEnd, PIVOT_BOSS, type DiscRoom, type Hold } from './knuckle-shapes.ts';
import { LinkSet, type DrawnLink, type RodView } from './link-builder.ts';
import { createCornerMaterials, disposeMaterials, type CornerMaterials } from './materials.ts';
import { CamberLaser, ForceArrows } from './overlays.ts';
import { COLUMN_DZ, RoadStrip, type RoadView } from './road-strip.ts';
import { CornerSchematic, type SchematicPoints } from './schematic.ts';
import { ROAD_SAMPLES, roadPressUniforms, type RoadPressUniforms } from './tyre-press.ts';
import { caliperGeometry, discGeometry, wheelGeometry } from './wheel-geometry.ts';

export { DRAWING, springWireM } from './drawing.ts';
export type { DrawnLink } from './link-builder.ts';

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

/** Everything that decides the model's geometry: two resolved corners with the same key share a model. */
export function cornerGeometryKey(r: ResolvedCorner): string {
  const spec = r.corner.axle;
  const link = spec.linkage;
  return JSON.stringify([
    link.wishbones.map((w) => [w.front, w.rear, w.ball]),
    link.rods.map((rod) => [rod.body, rod.knuckle, !!rod.steer]),
    link.strut ? [link.strut.top, link.strut.lower] : null,
    link.knuckle ? [link.knuckle.kind, link.knuckle.axisLower, link.knuckle.axisUpper] : null,
    [spec.spring.body, spec.spring.wheel, spec.spring.on ?? null, spec.damper.body, spec.damper.wheel, spec.damper.on ?? null],
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

/**
 * How a corner sits in a larger model (an axle of a chassis, stage P7-geom). The defaults draw the corner on its own,
 * as the corner's pages and the model viewer show it.
 */
export interface CornerModelOptions {
  /** Draw the strip of road under the wheel; without it the tyre is still pressed onto a flat road. Default true. */
  road?: boolean;
  /** Draw the glass piece of the body round the corner and its subframe. An axle draws its own. Default true. */
  bodyPieces?: boolean;
  /** Draw the end of the rack inboard of a steered tie rod. An axle draws the whole rack. Default true. */
  rackEnd?: boolean;
  /** The car's wheel in place of the tyre file's: rim and section width; the free radius is the corner's tyreRadiusM. */
  wheel?: { rimRadiusM: number; rimWidthM: number; tyreWidthM: number };
  /**
   * A space put into every part key: 'front' turns susp.spring into susp.front.spring. Two axles of one chassis have
   * different cards for the same part (a strut's spring, a link's), and the keys must tell them apart.
   */
  partSpace?: string;
}

/** A part key in a space: susp.spring → susp.front.spring. */
export const spacedKey = (key: string, space: string | undefined): string => (space && key.startsWith('susp.') ? `susp.${space}.${key.slice(5)}` : key);

/** A mesh that swaps material with the view. */
interface Shell {
  mesh: THREE.Mesh;
  solid: THREE.Material;
  glass: THREE.Material;
}

/** Where the wheel end of a coilover (or a lone coil) sits: on an arm, on a link's line, or on the knuckle. */
type Seat =
  | { kind: 'arm'; arm: number; at: THREE.Vector3 }
  | { kind: 'rod'; rod: number; along: number }
  /** On the knuckle (a split knuckle's carrier): the point in the scene and as given (ISO), both at design. */
  | { kind: 'knuckle'; at: THREE.Vector3; iso: Vec3 };

/** An independent corner on links (the left one: outboard is +X). */
export class CornerModel {
  readonly group = new THREE.Group();
  /** Everything on the body: moves with bodyZ. Overlays live here too. */
  readonly body = new THREE.Group();
  readonly parts: Record<string, PartInfo>;
  readonly materials: CornerMaterials;
  readonly press: RoadPressUniforms = roadPressUniforms();
  /** The links as drawn, for tests and for anyone checking that nothing stretches. */
  readonly links: DrawnLink[];
  readonly linkSet: LinkSet;
  /** The knuckle the wheel turns in (a split knuckle's wheel knuckle), and a split knuckle's strut carrier. */
  readonly knuckle = new THREE.Group();
  readonly carrier: THREE.Group | null;
  readonly damper: DamperUnit;
  readonly loneSpring: LoneSpring | null;
  readonly halfshaft: HalfshaftView | null;
  /** The knuckle's pose this frame (solver layout) and the travel and rack it was solved for. */
  readonly pose = new Float64Array(POSE_SIZE);
  readonly road: RoadStrip;
  readonly tyre: THREE.Mesh;
  readonly forces: ForceArrows;
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
  /** The strut's top mount and lower point, or the coilover's ends; a split knuckle's axis point and direction. */
  private readonly top0: THREE.Vector3;
  private readonly lower0: THREE.Vector3;
  private readonly unitSeat: Seat;
  private readonly springSeat: Seat | null;
  private readonly springTop0: THREE.Vector3 | null;
  private readonly axisPoint0: THREE.Vector3 | null;
  private readonly axisDir0: THREE.Vector3 | null;
  /** The steered rod, its rack, and where the rack's housing ends. */
  private readonly steerRod: RodView | null;
  private readonly rack: THREE.Group | null;
  private readonly rackBar: THREE.Mesh | null;
  private readonly rackBoot: Bellows | null;
  private readonly rackHousingEnd: number;
  private readonly bellX0: number;
  /** Height the steering axis is drawn up to in the mechanism view. */
  private readonly axisTopY: number;
  private springWire: number;

  // Moving groups.
  private readonly hubFrame = new THREE.Group();
  private readonly spin = new THREE.Group();
  private readonly hub: THREE.Mesh;
  private readonly disc: THREE.Mesh;
  private readonly caliper: THREE.Mesh;
  private readonly wheel: THREE.Mesh;
  private readonly nuts: THREE.Mesh;
  private readonly bodyShell: THREE.Mesh | null;
  private readonly subframe: THREE.Mesh | null;
  /** The part keys' space (CornerModelOptions.partSpace). */
  private readonly space: string | undefined;

  // Scratch, so update() allocates nothing.
  private readonly v1 = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();
  private readonly v3 = new THREE.Vector3();
  private readonly v4 = new THREE.Vector3();
  private readonly q1 = new THREE.Quaternion();
  private readonly q2 = new THREE.Quaternion();
  private readonly m1 = new THREE.Matrix4();
  private readonly top = new THREE.Vector3();
  private readonly lower = new THREE.Vector3();
  private readonly springTop = new THREE.Vector3();
  private readonly springLower = new THREE.Vector3();
  private readonly wheelCentre = new THREE.Vector3();
  private readonly axis = new THREE.Vector3();
  private readonly inPlaneUp = new THREE.Vector3();
  private readonly contact = new THREE.Vector3();
  private readonly outerJoint = new THREE.Vector3();
  private readonly force = new THREE.Vector3();
  private readonly forceB = new THREE.Vector3();
  private readonly push = new THREE.Vector3();
  private readonly s1 = new THREE.Vector3();
  private readonly s2 = new THREE.Vector3();
  private readonly s3 = new THREE.Vector3();
  private readonly steerTop = new THREE.Vector3();
  private readonly steerRoad = new THREE.Vector3();
  private readonly schematicPoints: SchematicPoints;
  private readonly fa = [0, 0, 0];
  private readonly axisPoint = new Float64Array(3);
  private readonly axisDir = new Float64Array(3);
  /** Per link (arms first, then rods): an applied force from the coilover that sits on it, scene axes, N. */
  private readonly seatForce: THREE.Vector3[];

  constructor(resolved: ResolvedCorner, profile: RoadProfile | null = null, options: CornerModelOptions = {}) {
    this.resolved = resolved;
    this.space = options.partSpace;
    this.axle = resolved.axle;
    this.statics = new KnuckleStatics(this.axle);
    this.view.profile = profile;
    const spec = resolved.corner.axle;
    const link = spec.linkage;
    const strut = link.strut ?? null;
    const split = link.knuckle ?? null;
    if (strut ? spec.damper.wheel !== 'strut' : spec.damper.wheel === 'strut') throw new Error('A strut corner has its damper in the strut, and only a strut corner does');
    const m = (this.materials = createCornerMaterials(this.press));

    // ---- Points of the drawing (scene, design) ----
    this.c0 = toScene(spec.wheelCentre);
    this.spinAxis0 = toScene(spec.spinAxis).normalize();
    this.group.add(this.body);

    // ---- Links ----
    const solver = this.axle.solver;
    const nW = link.wishbones.length;
    const rodLengths = link.rods.map((_, i) => solver.lengthOf(2 * nW + i) * 10);
    this.linkSet = new LinkSet(link, rodLengths, this.c0.y, m);
    this.links = this.linkSet.drawn;
    this.body.add(this.linkSet.group);
    for (const arm of this.linkSet.arms) this.solidOnly.push(arm.arm, arm.bushes, arm.joint);
    for (const rod of this.linkSet.rods) this.solidOnly.push(rod.mesh);
    if (this.linkSet.bushes) this.solidOnly.push(this.linkSet.bushes);
    this.seatForce = [...this.linkSet.arms, ...this.linkSet.rods].map(() => new THREE.Vector3());
    this.steerRod = this.linkSet.rods.find((r) => r.tie) ?? null;

    // ---- Spring and damper: the strut, or a coilover (and a coil of its own where it sits elsewhere) ----
    const seatOf = (wheel: Vec3, on: string | undefined): Seat => {
      const arm = this.linkSet.arms.findIndex((a) => a.spec.id === on);
      if (arm >= 0) return { kind: 'arm', arm, at: toScene(wheel) };
      const rod = link.rods.findIndex((r) => r.id === on);
      if (rod >= 0) {
        const r = link.rods[rod]!;
        const d = [r.knuckle[0] - r.body[0], r.knuckle[1] - r.body[1], r.knuckle[2] - r.body[2]];
        const along = ((wheel[0] - r.body[0]) * d[0]! + (wheel[1] - r.body[1]) * d[1]! + (wheel[2] - r.body[2]) * d[2]!) / (d[0]! ** 2 + d[1]! ** 2 + d[2]! ** 2);
        return { kind: 'rod', rod, along };
      }
      if (on) throw new Error(`A spring or damper sits on a link the corner lacks: ${on}`);
      return { kind: 'knuckle', at: toScene(wheel), iso: wheel };
    };
    const damperWheel = spec.damper.wheel;
    const shortest = this.axle.value('damperLen', this.axle.table.travel0 + (this.axle.table.n - 1) * this.axle.table.step) * 10;
    const coilOnUnit = strut ? spec.spring.wheel === 'strut' : isCoilover(spec);
    if (strut) {
      this.top0 = toScene(strut.top);
      this.lower0 = toScene(strut.lower);
      this.unitSeat = { kind: 'knuckle', at: this.lower0, iso: strut.lower };
    } else {
      this.top0 = toScene(spec.damper.body);
      this.lower0 = toScene(damperWheel as Vec3);
      this.unitSeat = seatOf(damperWheel as Vec3, spec.damper.on);
    }
    const seats = strut
      ? spec.spring.strutSeats ?? { upperM: 0.03, lowerM: 0.15 }
      : { upperM: DRAWING.coiloverUpperSeatM, lowerM: DRAWING.coiloverLowerSeatM };
    const meanR = strut ? DRAWING.springMeanRadiusM : DRAWING.coiloverSpringMeanRadiusM;
    this.springWire = springWireM(resolved.spring.rate, meanR) * 10;
    const strutDir0 = this.top0.clone().sub(this.lower0).normalize();
    this.damper = new DamperUnit(
      {
        strut: !!strut,
        part: strut ? 'susp.strut' : 'susp.damper',
        tubeR: (strut ? DRAWING.strutTubeRadiusM : DRAWING.coiloverTubeRadiusM) * 10,
        rodR: (strut ? DRAWING.rodRadiusM : DRAWING.coiloverRodRadiusM) * 10,
        springMeanR: meanR * 10,
        springTurns: DRAWING.springTurns,
        springEndTurns: DRAWING.springEndTurns,
        upperSeat: seats.upperM * 10,
        lowerSeat: seats.lowerM * 10,
        stopLength: resolved.bumpStop.lengthM * 10,
        contact: resolved.bumpStop.contactM * 10,
        topOut: resolved.topOutM * 10,
        shortest,
        guide: DRAWING.guideM * 10,
        wire: coilOnUnit ? this.springWire : null,
        seatR: meanR * 10 + 0.15,
      },
      m,
      strut ? { lower: this.lower0, dir: strutDir0 } : null,
    );
    const unit = this.damper;
    unit.wire = this.springWire;
    this.body.add(unit.topMount, unit.top);
    if (!strut) this.body.add(unit.bottom);
    this.solidOnly.push(unit.topMount, unit.upper, unit.rod, unit.bumpStop, unit.tube);
    this.xrayOnly.push(unit.piston, unit.oil);
    this.shells.push({ mesh: unit.bumpStop, solid: m.bumpStop, glass: m.bumpStopGlass }, { mesh: unit.tube, solid: m.strut, glass: m.strutGlass });
    if (!coilOnUnit && spec.spring.wheel !== 'strut') {
      this.loneSpring = new LoneSpring(meanR * 10, DRAWING.springTurns, DRAWING.springEndTurns, this.springWire, m);
      this.springTop0 = toScene(spec.spring.body);
      this.springSeat = seatOf(spec.spring.wheel, spec.spring.on);
      this.body.add(this.loneSpring.group);
      this.solidOnly.push(this.loneSpring.seats, this.loneSpring.lowerSeat);
    } else {
      this.loneSpring = null;
      this.springTop0 = null;
      this.springSeat = null;
    }

    // ---- Body: glass piece of the shell and the subframe ----
    if (options.bodyPieces !== false) {
      const pieces = strut ? strutBody(this.top0) : linkBody(spec);
      this.bodyShell = tag(new THREE.Mesh(pieces.shell, m.body), 'susp.body');
      this.bodyShell.renderOrder = 2;
      this.subframe = tag(new THREE.Mesh(pieces.subframe, m.body), 'susp.subframe');
      this.subframe.renderOrder = 2;
      this.body.add(this.bodyShell, this.subframe);
      this.shells.push({ mesh: this.bodyShell, solid: m.body, glass: m.bodyXray }, { mesh: this.subframe, solid: m.body, glass: m.bodyXray });
    } else {
      this.bodyShell = null;
      this.subframe = null;
    }

    // ---- Knuckle (and a split knuckle's carrier) and everything rigid with it ----
    this.body.add(this.knuckle);
    const caliperAngle = 0.62;
    const ringIn = -DRAWING.hatDepthM * 10 + DRAWING.wheelOffsetM * 10 - DRAWING.discThickM * 10;
    const ringOut = ringIn + DRAWING.discThickM * 10;
    const disc: DiscRoom = { outer: DRAWING.discOuterM * 10 };
    const rear = new THREE.Vector3(0, 0, -1);
    const lug = (sign: number): THREE.Vector3 =>
      this.c0
        .clone()
        .addScaledVector(this.spinAxis0, -0.5)
        .addScaledVector(rear, Math.cos(caliperAngle) * 1.25)
        .addScaledVector(UP, sign * Math.sin(caliperAngle) * 1.25);
    const hub = { centre: this.c0.clone().addScaledVector(this.spinAxis0, -0.15), axis: this.spinAxis0, radius: 0.6, length: 0.6 };
    const end = (hold: Hold): KnuckleEnd => holdEnd(hold, this.c0, this.spinAxis0, disc);
    const tubeBottom = unit.tubeBottom;
    let axisTop = 0;
    if (split) {
      // The wheel knuckle: hub boss, the axis's two bearings, the steering arm, the caliper's lugs. The carrier: the
      // strut clamp, the lower arm's joint and the bearings' ears, reaching round behind the caliper.
      const lower = toScene(split.axisLower);
      const upper = toScene(split.axisUpper);
      const pivots = axisPivots(this.c0, this.spinAxis0, lower, upper, DRAWING.discOuterM * 10 + 0.25);
      this.axisPoint0 = lower;
      this.axisDir0 = upper.clone().sub(lower).normalize();
      const wheelEnds = [
        end({ at: pivots.above, kind: 'pivot', axis: pivots.dir, side: -1 }),
        end({ at: pivots.below, kind: 'pivot', axis: pivots.dir, side: 1 }),
        ...this.linkSet.rods.map((r) => end({ at: r.knuckle0, kind: r.tie ? 'steer' : 'link' })),
        end({ at: lug(1), kind: 'lug' }),
        end({ at: lug(-1), kind: 'lug' }),
      ];
      const knuckleMesh = tag(new THREE.Mesh(knuckleGeometry({ hub, ends: wheelEnds, rootShare: 0.5 }), m.knuckle), split.knucklePart);
      this.knuckle.add(knuckleMesh);
      this.carrier = new THREE.Group();
      this.body.add(this.carrier);
      const clampFrom = this.lower0.clone().addScaledVector(strutDir0, tubeBottom - 0.04);
      const clampTo = this.lower0.clone().addScaledVector(strutDir0, 0.45);
      const clampR = DRAWING.strutTubeRadiusM * 10 + 0.08;
      const root = clampFrom.clone().lerp(clampTo, 0.35);
      // Round the back of the wheel, behind the caliper and clear of the halfshaft, at the hub's height.
      const behind = this.c0.clone().addScaledVector(this.spinAxis0, -1.05).addScaledVector(rear, 1.25);
      const ear = (at: THREE.Vector3, side: 1 | -1): KnuckleEnd => ({ at: at.clone().addScaledVector(pivots.dir, (side * PIVOT_BOSS) / 2), axis: pivots.dir, radius: 0.18, length: PIVOT_BOSS, arm: 0.13 });
      const above = ear(pivots.above, 1);
      const below = ear(pivots.below, -1);
      // Behind the disc, out past its edge in the arms' plane, then outboard to the ear.
      below.via = [behind, armPlane(below.at, this.c0, this.spinAxis0)];
      const carrierParts = [
        rodBetween(clampFrom, clampTo, clampR, 20),
        ...armTo(root, above),
        ...armTo(root, below),
        ...this.linkSet.arms.flatMap((a) => armTo(root, { ...end({ at: a.ball0, kind: 'ball' }), via: [behind] })),
      ];
      const carrierMesh = tag(new THREE.Mesh(merge(carrierParts), m.carrier), split.carrierPart);
      this.carrier.add(carrierMesh, unit.tube, unit.oil);
      axisTop = Math.max(pivots.above.y, upper.y);
    } else {
      this.carrier = null;
      this.axisPoint0 = null;
      this.axisDir0 = null;
      const ends: KnuckleEnd[] = [];
      let knuckleGeo: THREE.BufferGeometry;
      if (strut) {
        // The plain strut's knuckle as the strut corner of the page has it: the clamp, the ball joint, the steering
        // arm and the lugs straight from the hub boss.
        const wishbone = link.wishbones[0]!;
        const ball0 = toScene(wishbone.ball);
        for (const rod of this.linkSet.rods) ends.push({ at: rod.knuckle0.clone().addScaledVector(UP, 0.12), axis: UP, radius: 0.17, length: 0.3, arm: 0.15 });
        knuckleGeo = knuckleGeometry({
          rootShare: 0.5,
          hub,
          clamp: {
            from: this.lower0.clone().addScaledVector(strutDir0, tubeBottom - 0.04),
            to: this.lower0.clone().addScaledVector(strutDir0, 0.45),
            radius: DRAWING.strutTubeRadiusM * 10 + 0.08,
          },
          ends: [
            { at: ball0.clone().addScaledVector(UP, 0.25), axis: UP, radius: 0.24, length: 0.4, arm: 0.2 },
            ...ends,
            { at: lug(1), axis: this.spinAxis0, radius: 0.15, length: 0.3, arm: 0.13 },
            { at: lug(-1), axis: this.spinAxis0, radius: 0.15, length: 0.3, arm: 0.13 },
          ],
        });
        axisTop = this.top0.y;
      } else {
        const holds: Hold[] = [
          ...this.linkSet.arms.map((a): Hold => ({ at: a.ball0, kind: 'ball' })),
          ...this.linkSet.rods.map((r): Hold => ({ at: r.knuckle0, kind: r.tie ? 'steer' : 'link' })),
        ];
        axisTop = Math.max(...holds.map((h) => h.at.y));
        if (this.unitSeat.kind === 'knuckle') holds.push({ at: this.unitSeat.at, kind: 'link' });
        holds.push({ at: lug(1), kind: 'lug' }, { at: lug(-1), kind: 'lug' });
        knuckleGeo = knuckleGeometry({ hub, ends: holds.map(end), rootShare: 0.5 });
      }
      const knuckleMesh = tag(new THREE.Mesh(knuckleGeo, m.knuckle), 'susp.knuckle');
      this.knuckle.add(knuckleMesh);
      if (strut) this.knuckle.add(unit.tube, unit.oil);
    }
    this.axisTopY = axisTop + 1.5;
    // Caliper on the wheel knuckle, straddling the disc at the rear.
    this.caliper = tag(new THREE.Mesh(caliperGeometry(ringIn, ringOut, caliperAngle - 0.08), m.caliper), 'susp.caliper');
    this.caliper.position.copy(this.c0);
    this.caliper.quaternion.setFromUnitVectors(X, this.spinAxis0);
    this.knuckle.add(this.caliper);
    this.solidOnly.push(this.caliper);

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
    const rimR = (options.wheel?.rimRadiusM ?? tyreVertical(resolved.corner.tyre).rimRadiusM) * 10;
    const rimW = (options.wheel?.rimWidthM ?? DRAWING.rimWidthM) * 10;
    this.wheel = tag(new THREE.Mesh(wheelGeometry(rimR, rimW, face), m.wheel), 'susp.wheel');
    this.shells.push({ mesh: this.wheel, solid: m.wheel, glass: m.wheelGlass });
    const nutParts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      nutParts.push(boss(new THREE.Vector3(face + 0.27, Math.cos(a) * 0.57, Math.sin(a) * 0.57), X, 0.1, 0.18, 6));
    }
    this.nuts = tag(new THREE.Mesh(merge(nutParts), m.nut), 'susp.wheel');
    const tyreWidth = (options.wheel?.tyreWidthM ?? resolved.tyre.widthM) * 10;
    const tyreGeo = lathe(tyreProfile(resolved.tyre.freeRadiusM * 10, rimR, tyreWidth, rimW), 120).rotateZ(-Math.PI / 2);
    this.tyre = tag(new THREE.Mesh(tyreGeo, m.tyre), 'susp.tyre');
    this.tyre.customDepthMaterial = m.tyreDepth;
    this.tyre.frustumCulled = false;
    this.shells.push({ mesh: this.tyre, solid: m.tyre, glass: m.tyreGlass });
    this.spin.add(this.hub, this.disc, this.wheel, this.nuts, this.tyre);
    this.solidOnly.push(this.hub, this.disc, this.wheel, this.nuts, this.tyre);

    // ---- The rack's end with its boot, inboard of a steered rod ----
    if (this.steerRod && options.rackEnd !== false) {
      const inner = this.steerRod.body0;
      const housingEnd = inner.x - 0.75;
      const housing = tag(
        new THREE.Mesh(
          merge([
            latheAlong([[0.0001, 0], [0.3, 0], [0.3, housingEnd - 0.4], [0.36, housingEnd - 0.35], [0.36, housingEnd], [0.0001, housingEnd]], new THREE.Vector3(0, inner.y, inner.z), X, 28, true),
          ]),
          m.steel,
        ),
        'susp.rack',
      );
      this.rackBar = tag(new THREE.Mesh(rodBetween(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), 0.12, 14), m.chrome), 'susp.rack');
      this.rackBoot = new Bellows(0.3, 0.16, 7, 0.07);
      const rackBootMesh = tag(new THREE.Mesh(this.rackBoot.geometry, m.boot), 'susp.rack');
      rackBootMesh.frustumCulled = false;
      rackBootMesh.userData.solid = m.boot;
      rackBootMesh.userData.glass = m.bootGlass;
      this.shells.push({ mesh: housing, solid: m.steel, glass: m.strutGlass }, { mesh: rackBootMesh, solid: m.boot, glass: m.bootGlass });
      this.rack = new THREE.Group();
      this.rack.add(housing, this.rackBar, rackBootMesh);
      this.body.add(this.rack);
      this.rackHousingEnd = housingEnd;
      this.solidOnly.push(housing, rackBootMesh);
      this.xrayOnly.push(this.rackBar);
    } else {
      this.rack = null;
      this.rackBar = null;
      this.rackBoot = null;
      this.rackHousingEnd = 0;
    }

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
    if (options.road !== false) this.group.add(this.road.mesh);
    this.forces = new ForceArrows(this.linkSet.arms.length + this.linkSet.rods.length);
    this.body.add(this.forces.group, this.laser.group);
    this.schematicPoints = this.schematicLayout(!!strut);
    this.schematic = new CornerSchematic(m, this.schematicPoints);
    this.body.add(this.schematic.group);

    // Lines and sprites sort by renderOrder too, so the band takes every object, overlays included, not only meshes.
    this.group.traverse((o) => this.orders.set(o, o.renderOrder));
    // Shadows from what can cast one: not the road, not the overlays, and not parts that sit inside others (the piston,
    // the oil, the tripod's spider and the joint's balls, the rack's bar in its housing, the links' bushes in their
    // eyes, a lone coil's seat cups under its end turns) or under the wheel (the nuts).
    const inside = new Set<THREE.Object3D>([...this.xrayOnly, this.nuts]);
    if (this.loneSpring) inside.add(this.loneSpring.seats).add(this.loneSpring.lowerSeat);
    if (this.halfshaft) for (const o of [this.halfshaft.spider, this.halfshaft.balls]) inside.add(o);
    if (this.linkSet.bushes) inside.add(this.linkSet.bushes);
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && o.userData.part && o !== this.road.mesh && !inside.has(o)) mesh.castShadow = true;
    });
    this.parts = this.space ? this.spaceKeys(cornerParts(spec)) : cornerParts(spec);
    this.setView('solid');
    this.update(this.frame);
  }

  /** Puts the part space into every key the corner tagged, and gives back its cards under the spaced keys. */
  private spaceKeys(parts: Record<string, PartInfo>): Record<string, PartInfo> {
    const key = (k: string): string => spacedKey(k, this.space);
    this.group.traverse((o) => {
      const d = o.userData;
      if (typeof d.part === 'string') d.part = key(d.part);
      for (const name of ['partOf', 'instanceParts']) if (Array.isArray(d[name])) d[name] = (d[name] as string[]).map(key);
    });
    return Object.fromEntries(Object.entries(parts).map(([k, info]) => [key(k), info]));
  }

  /** The key of one of the corner's own parts, in its space. */
  private key(part: string): string {
    return spacedKey(part, this.space);
  }

  /** The mechanism view's joints, bars and lines, as references to the live points update() keeps. */
  private schematicLayout(strut: boolean): SchematicPoints {
    const joints: SchematicPoints['joints'] = [];
    const bars: SchematicPoints['bars'] = [];
    for (const arm of this.linkSet.arms) {
      joints.push({ at: arm.front, part: 'susp.bush' }, { at: arm.rear, part: 'susp.bush' }, { at: arm.ball, part: 'susp.ball-joint' });
      bars.push({ a: arm.front, b: arm.ball, part: arm.spec.part }, { a: arm.rear, b: arm.ball, part: arm.spec.part });
    }
    for (const rod of this.linkSet.rods) {
      joints.push({ at: rod.bodyEnd, part: rod.tie ? 'susp.rack' : 'susp.bush' }, { at: rod.knuckleEnd, part: rod.spec.part });
      bars.push({ a: rod.bodyEnd, b: rod.knuckleEnd, part: rod.spec.part });
    }
    joints.push({ at: this.top, part: 'susp.top-mount' });
    if (!strut) joints.push({ at: this.lower, part: 'susp.damper' });
    bars.push({ a: this.top, b: this.lower, part: strut ? 'susp.strut' : 'susp.damper' });
    if (this.loneSpring) bars.push({ a: this.springTop, b: this.springLower, part: 'susp.spring' });
    const hs = this.halfshaft;
    joints.push({ at: hs ? hs.inner : null, part: 'susp.cv-inner' }, { at: hs ? this.outerJoint : null, part: 'susp.cv-outer' });
    bars.push({ a: hs ? hs.inner : null, b: hs ? this.outerJoint : null, part: 'susp.halfshaft' });
    return {
      joints,
      bars,
      bushAxes: this.linkSet.arms.map((a): [THREE.Vector3, THREE.Vector3] => [a.front, a.rear]),
      steer: { top: this.steerTop, road: this.steerRoad, shown: false },
      wheelCentre: this.wheelCentre,
      axis: this.axis,
      freeRadius: this.resolved.tyre.freeRadiusM * 10,
    };
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
    const meanR = this.damper.size.springMeanR / 10;
    this.springWire = springWireM(resolved.spring.rate, meanR) * 10;
    this.damper.wire = this.springWire;
    if (this.loneSpring) this.loneSpring.wire = this.springWire;
    const nW = this.linkSet.arms.length;
    this.linkSet.rods.forEach((rod, i) => rod.setLength(this.axle.solver.lengthOf(2 * nW + i) * 10));
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
    if (this.bodyShell) this.bodyShell.visible = !mech;
    if (this.subframe) this.subframe.visible = !mech;
    this.schematic.group.visible = mech;
    if (this.damper.springMesh) this.damper.springMesh.visible = true;
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
    this.halfshaft?.refreshMarks({ inner: part === this.key('susp.cv-inner'), outer: part === this.key('susp.cv-outer') });
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
      if (this.failed !== this.key('susp.bump-stop')) this.stopRed = null;
      this.halfshaft?.refreshMarks({ inner: this.failed === this.key('susp.cv-inner'), outer: this.failed === this.key('susp.cv-outer') });
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
    };
    out[this.damper.size.strut ? 'strutTop' : 'damperTop'] = toModel(this.top);
    if (this.steerRod) out.rackEnd = toModel(this.steerRod.bodyEnd);
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

  /** Where a seat is now (body frame, scene), from the posed links and knuckle. */
  private seatPoint(seat: Seat, out: THREE.Vector3): THREE.Vector3 {
    if (seat.kind === 'arm') {
      const arm = this.linkSet.arms[seat.arm]!;
      arm.object.updateMatrix();
      return out.copy(seat.at).applyMatrix4(arm.object.matrix);
    }
    if (seat.kind === 'rod') {
      // On the rod's line, and with the rod where the explode has moved it (its object stands on its body end).
      const rod = this.linkSet.rods[seat.rod]!;
      return out.copy(rod.bodyEnd).lerp(rod.knuckleEnd, seat.along).add(rod.object.position).sub(rod.bodyEnd);
    }
    return out.copy(seat.at).applyMatrix4(this.carrierMatrix());
  }

  /** The strut carrier's matrix, or the knuckle's on a corner without a split. */
  private carrierMatrix(): THREE.Matrix4 {
    return (this.carrier ?? this.knuckle).matrix;
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
    const res = axle.solvePose(f.travel, f.rack, warm, this.pose);
    if (!res.ok) axle.solvePose(f.travel, f.rack, null, this.pose);
    this.body.position.set(0, f.bodyZ * 10, 0);
    // ISO quaternion (x, y, z) → scene (y, z, x), as points are.
    const P = this.pose;
    this.q1.set(P[4]!, P[5]!, P[3]!, P[6]!);
    this.knuckle.quaternion.copy(this.q1);
    this.v1.copy(this.c0).applyQuaternion(this.q1);
    this.knuckle.position.set(this.c0.x + P[1]! * 10 - this.v1.x, this.c0.y + P[2]! * 10 - this.v1.y, this.c0.z + P[0]! * 10 - this.v1.z);
    this.knuckle.updateMatrix();
    const K = this.knuckle.matrix;
    if (this.carrier && this.axisPoint0 && this.axisDir0) {
      // The carrier is the knuckle turned back by ψ about the split axis, which both share: its axis point stays put.
      this.q2.setFromAxisAngle(this.axisDir0, -P[7]!);
      this.carrier.quaternion.multiplyQuaternions(this.q1, this.q2);
      const A = this.v1.copy(this.axisPoint0).applyMatrix4(K);
      this.carrier.position.copy(A).sub(this.v2.copy(this.axisPoint0).applyQuaternion(this.carrier.quaternion));
      this.carrier.updateMatrix();
    }
    const C = this.carrierMatrix();
    this.wheelCentre.copy(this.c0).applyMatrix4(K);
    this.axis.copy(this.spinAxis0).applyQuaternion(this.q1);

    // Links: arms meet their ball joints on the knuckle (a split knuckle's carrier), rods run from the body (the rack
    // for a steered one) to the knuckle.
    for (const arm of this.linkSet.arms) arm.ball.copy(arm.ball0).applyMatrix4(C);
    for (const rod of this.linkSet.rods) {
      rod.knuckleEnd.copy(rod.knuckle0).applyMatrix4(K);
      rod.bodyEnd.copy(rod.body0);
      if (rod.tie) rod.bodyEnd.x += f.rack * 10;
    }
    this.linkSet.update(e);

    // The rack's end: bar from the car's centre to the inner joint, boot from the housing's end to the rod, both in
    // the rack's group, which the explode moves inboard by as much as the rod.
    if (this.steerRod && this.rack && this.rackBar && this.rackBoot) {
      const rod = this.steerRod;
      const d = this.v1.copy(rod.knuckleEnd).sub(rod.bodyEnd);
      const len = d.length();
      d.divideScalar(len);
      const shiftT = e * 0.6 * len;
      this.rack.position.set(-shiftT, 0, 0);
      const inner0 = rod.body0;
      this.rackBar.position.set(0, inner0.y, inner0.z);
      this.rackBar.scale.set(Math.max(0.01, rod.bodyEnd.x - d.x * shiftT + shiftT), 1, 1);
      this.v2.set(this.rackHousingEnd, inner0.y, inner0.z);
      this.v3.copy(rod.bodyEnd).addScaledVector(d, 0.45 - shiftT);
      this.v3.x += shiftT;
      this.rackBoot.update(this.v2, X, this.v3, d);
    }

    // Strut or coilover: from the top mount to the strut's point on the knuckle (carrier), or to its seat.
    if (this.damper.size.strut) {
      const shift = spec.linkage.strut!.topShift ?? [0, 0, 0];
      this.top.set(this.top0.x + shift[1] * 10, this.top0.y + shift[2] * 10, this.top0.z + shift[0] * 10);
      this.lower.copy(this.lower0).applyMatrix4(C);
    } else {
      this.top.copy(this.top0);
      this.seatPoint(this.unitSeat, this.lower);
    }
    this.damper.update(this.top, this.lower, e, mech);
    if (this.loneSpring && this.springSeat && this.springTop0) {
      this.springTop.copy(this.springTop0);
      this.seatPoint(this.springSeat, this.springLower);
      this.loneSpring.update(this.springTop, this.springLower, e, mech);
    }
    // Bump stop red past 20 % of its squeeze (suspensions plan, 3D parts). Written only when it changes, and never
    // over a failure's own mark.
    const red = this.damper.squeeze > 0.2;
    if (red !== this.stopRed && this.failed !== this.key('susp.bump-stop')) {
      this.stopRed = red;
      for (const mat of [this.materials.bumpStop, this.materials.bumpStopGlass]) {
        mat.emissive.set(red ? '#ff2a10' : '#000000');
        mat.emissiveIntensity = 1;
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
    if (this.bodyShell) this.bodyShell.position.y = e * 6;
    if (this.subframe) this.subframe.position.y = -e * 1.5;

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
    if (mech) this.updateSchematic(f);
  }

  /** The steering axis from the solver's pose, drawn from above the knuckle to the road, and the rest by reference. */
  private updateSchematic(f: CornerFrame): void {
    const shown = this.axle.steeringAxis(this.pose, f.rack, this.axisPoint, this.axisDir);
    const p = this.schematicPoints.steer;
    p.shown = shown;
    if (shown) {
      // ISO (x, y, z) → scene (y, z, x)·10.
      const a = this.axisPoint;
      const d = this.axisDir;
      const pt = this.v1.set(a[1]! * 10, a[2]! * 10, a[0]! * 10);
      const dir = this.v2.set(d[1]!, d[2]!, d[0]!);
      p.top.copy(pt).addScaledVector(dir, (this.axisTopY - pt.y) / dir.y);
      p.road.copy(pt).addScaledVector(dir, (this.contact.y - pt.y) / dir.y);
    }
    this.schematic.update();
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

  /**
   * The forces of one free-body picture: the tyre at the contact patch, the unsprung weight at the wheel centre, the
   * spring, damper and bump stop along their unit (on the knuckle for a strut, on the arm or link for a coilover), and
   * what each link puts on the knuckle, from the knuckle's statics. A coilover on an arm turns it about its bush
   * axis, so its push reaches the knuckle through the arm's ball joint: an applied force there with the same moment
   * about that axis. On a link it reaches the knuckle end in the share of its seat along the link.
   */
  private updateForces(f: CornerFrame): void {
    const arrows = this.forces;
    const v = this.force;
    arrows.set('tyre', this.contact, v.set(0, f.tyreN, 0));
    // Along the unit, pushing its lower end away from the top mount: spring at its lower seat, damper and stop at the
    // tube's top.
    const unit = this.damper;
    const down = this.v1.copy(this.lower).sub(this.top).normalize();
    const springAt = this.loneSpring ? this.v2.copy(this.springLower) : this.v2.copy(this.lower).addScaledVector(down, -unit.size.lowerSeat);
    const springDir = this.loneSpring ? this.v4.copy(this.springLower).sub(this.springTop).normalize() : down;
    arrows.set('spring', springAt, v.copy(springDir).multiplyScalar(f.springN));
    const tubeTop = this.v3.copy(this.lower).addScaledVector(down, -unit.tubeTop);
    arrows.set('damper', tubeTop, v.copy(down).multiplyScalar(f.damperN));
    if (f.stopN !== 0) arrows.set('stop', this.forceB.copy(tubeTop).addScaledVector(down, -0.15), v.copy(down).multiplyScalar(f.stopN));
    else arrows.hide('stop');
    const weight = this.resolved.unsprungKg * G;
    arrows.set('weight', this.wheelCentre, v.set(0, -weight, 0));

    // Statics of the knuckle under those forces, in the ISO body frame, metres: ISO (x, y, z) = scene (z, x, y)/10.
    const s = this.statics;
    s.begin(this.pose, f.travel, f.rack);
    const c = this.contact;
    s.force(c.z / 10, c.x / 10, c.y / 10, 0, 0, f.tyreN);
    const w = this.wheelCentre;
    s.force(w.z / 10, w.x / 10, w.y / 10, 0, 0, -weight);
    for (const sf of this.seatForce) sf.set(0, 0, 0);
    const spec = this.axle.spec;
    const unitN = f.damperN + f.stopN + (this.loneSpring ? 0 : f.springN);
    if (unit.size.strut) s.carrierForce(spec.linkage.strut!.lower, down.z * unitN, down.x * unitN, down.y * unitN);
    else this.seatPush(this.unitSeat, this.lower, this.push.copy(down).multiplyScalar(unitN));
    if (this.loneSpring && this.springSeat) this.seatPush(this.springSeat, this.springLower, this.push.copy(springDir).multiplyScalar(f.springN));
    if (!s.solve()) {
      arrows.hideLinks();
      arrows.hide('strutTop');
      arrows.commit();
      return;
    }
    // Rows: two per wishbone, then one per rod, then the strut's two (CornerSolver's order).
    const { arms, rods } = this.linkSet;
    const nW = arms.length;
    for (let i = 0; i < nW; i++) arrows.setLink(i, arms[i]!.ball, this.rowSum(2 * i, 2 * i + 2, this.forceB).add(this.seatForce[i]!));
    for (let j = 0; j < rods.length; j++) arrows.setLink(nW + j, rods[j]!.knuckleEnd, this.rowSum(2 * nW + j, 2 * nW + j + 1, this.forceB).add(this.seatForce[nW + j]!));
    if (unit.size.strut) {
      const n = s.solver.distanceRows;
      arrows.set('strutTop', this.top, this.rowSum(n, n + 2, this.forceB));
    } else arrows.hide('strutTop');
    arrows.commit();
  }

  /**
   * A coilover's (or a lone coil's) push `F` (scene axes, N) on what it sits on, as an applied force on the knuckle:
   * kept in seatForce for that link's arrow, and handed to the statics.
   */
  private seatPush(seat: Seat, at: THREE.Vector3, F: THREE.Vector3): void {
    const s = this.statics;
    if (seat.kind === 'knuckle') {
      // On the knuckle itself (the carrier, on a split one).
      s.carrierForce(seat.iso, F.z, F.x, F.y);
      return;
    }
    const out = this.s1;
    if (seat.kind === 'rod') {
      // A link with ball ends takes no moment: the share of the push the knuckle end carries is the seat's share of
      // the way along it.
      const rod = this.linkSet.rods[seat.rod]!;
      out.copy(F).multiplyScalar(seat.along);
      this.seatForce[this.linkSet.arms.length + seat.rod]!.add(out);
      const p = rod.knuckleEnd;
      s.force(p.z / 10, p.x / 10, p.y / 10, out.z, out.x, out.y);
      return;
    }
    // The same moment about the arm's bush axis from a force at its ball joint, square to the arm's radius there. The
    // ball is on the knuckle, or on a split knuckle's carrier.
    const arm = this.linkSet.arms[seat.arm]!;
    const u = this.s2.copy(arm.rear).sub(arm.front).normalize();
    const moment = u.dot(this.s3.copy(at).sub(arm.front).cross(F));
    const r = this.s3.copy(arm.ball).sub(arm.front);
    r.addScaledVector(u, -r.dot(u));
    out.crossVectors(u, r).multiplyScalar(moment / r.lengthSq());
    this.seatForce[seat.arm]!.add(out);
    s.carrierForce(arm.spec.ball, out.z, out.x, out.y);
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
    return this.damper.squeeze;
  }

  dispose(): void {
    this.forces.dispose();
    this.laser.dispose();
    this.schematic.dispose();
    this.halfshaft?.dispose();
    this.road.dispose();
    this.linkSet.dispose();
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

