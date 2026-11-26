// One axle of a design as the templates draw it: the hardpoints from the layout's intents on the design's track and
// tyre, the half-shaft's inner joint where the design puts it, the static alignment built into the knuckle. The spring
// rate, the damper and the bar are set later (to-spec.ts): they do not move a single point, so the geometry is cached by
// the parameters that do, and a change of spring or mass costs nothing here.
//
// buildAxleGeometry also proves the axle assembles over its whole travel, the way the chassis will read it: a corner
// builds its table, a twist beam passes its template's grid, a solid axle walks to the four corners of its travel
// square. resolveChassis (constraints.ts) leans on that to keep a design buildable.
//
// The wheel centre sits at the tyre's rolling radius above the road and the tyre's free radius goes to the chassis, as
// on a real car's chassis (car-chassis.ts). Static camber and toe are built into the knuckle (the spin axis turns), the
// way a twist beam's stub axle has them; the camber plates and tie-rod lengths of setup.ts belong to the setup panels.

import type { AnyAxleLinkage, AxleSpec, Vec3 } from '../suspension/spec.ts';
import { Axle, newCornerSample } from '../suspension/kinematics.ts';
import { TwistBeamAxle, newBeamSample } from '../suspension/beam-kinematics.ts';
import { SolidAxle, newSolidSample } from '../suspension/solid-kinematics.ts';
import { buildAxleLite } from '../suspension/axle-lite.ts';
import { widenCorner } from '../suspension/car-chassis.ts';
import { macphersonJtekt } from '../suspension/templates/macpherson.ts';
import { doubleWishbone } from '../suspension/templates/double-wishbone.ts';
import { multilink, multilinkDefaults } from '../suspension/templates/multilink.ts';
import { pivotAxle } from '../suspension/templates/pivot.ts';
import { twistBeamAxle } from '../suspension/templates/twist-beam.ts';
import { SOLID_TYPICAL, solidAxle } from '../suspension/templates/solid-axle.ts';
import { outerDiameterM, ROLLING_SHARE } from '../vehicle/tyre-size.ts';
import { axleOf, isDriven, type AxleEnd, type AxleParams, type ChassisDesign, type Drive } from './design.ts';

const DEG = Math.PI / 180;

/** Second bush of a pivot arm along its axis, m: the template's typical span. */
const PIVOT_BUSH_SPAN_M = 0.35;
/** A leaf spring sits this far inside the wheel centre at most, m, and never wider than the template's 0.5 m. */
const LEAF_INSIDE_M = 0.15;

export interface AxleGeometry {
  /** The axle with the template's spring and damper placeholders (to-spec.ts sets them). */
  spec: AxleSpec<AnyAxleLinkage>;
  /** Spring and damper motion ratios at design in heave of both wheels (on a corner just its own). */
  mrSpring: number;
  mrDamper: number;
}

/** Free radius of a tyre size, m. */
export const freeRadiusM = (a: Pick<AxleParams, 'tyreWidthMm' | 'tyreAspect' | 'rimIn'>): number =>
  outerDiameterM({ widthMm: a.tyreWidthMm, aspect: a.tyreAspect, rimIn: a.rimIn, speed: '' }) / 2;

/** Wheel centre height at design, m: the rolling radius (tyre-size.ts). */
export const wheelCentreZM = (a: Pick<AxleParams, 'tyreWidthMm' | 'tyreAspect' | 'rimIn'>): number => ROLLING_SHARE * freeRadiusM(a);

/** Rim radius, m. */
export const rimRadiusM = (a: Pick<AxleParams, 'rimIn'>): number => (a.rimIn * 0.0254) / 2;

/** The spin axis turned to the static camber (negative: top in) and toe (positive: in), from the template's own. */
function aligned(spin: Vec3, camberDeg: number, toeDeg: number): Vec3 {
  if (camberDeg === 0 && toeDeg === 0) return spin;
  const g = Math.asin(-spin[2]) + camberDeg * DEG;
  const t = Math.atan2(spin[0], spin[1]) + toeDeg * DEG;
  return [Math.cos(g) * Math.sin(t), Math.cos(g) * Math.cos(t), -Math.sin(g)];
}

/** The inner joint of the half-shaft moved to the design's place (its x stays the template's). */
function withDiffOutput<L extends AnyAxleLinkage>(spec: AxleSpec<L>, a: AxleParams, zW: number): AxleSpec<L> {
  if (!spec.halfshaft) return spec;
  const d = spec.halfshaft.diffOutput;
  return { ...spec, halfshaft: { ...spec.halfshaft, diffOutput: [d[0], a.diffOutputYMm / 1000, zW + a.diffOutputDzMm / 1000] } };
}

/** The axle's hardpoints from the design, before the proof that it travels. Throws where a template does. */
function draw(a: AxleParams, end: AxleEnd, drive: Drive): AxleSpec<AnyAxleLinkage> {
  const zW = wheelCentreZM(a);
  const trackM = a.trackMm / 1000;
  const driven = isDriven(drive, end);
  const which = end === 'F' ? 'front' : 'rear';
  switch (a.layout) {
    case 'macpherson': {
      if (end === 'R') throw new Error('A rear strut needs a toe link in place of the tie rod, which the designer does not build');
      const jtekt = macphersonJtekt({ wheelCentreZM: zW, knuckle: a.knuckle, kingpinOffsetM: a.kingpinOffsetMm / 1000, kpiDeg: a.kpiDeg });
      const spec = widenCorner(jtekt, trackM / 2 - jtekt.wheelCentre[1]);
      return driven ? withDiffOutput(spec, a, zW) : { ...spec, driven: false, diff: 'none', halfshaft: null };
    }
    case 'double-wishbone':
    case 'multilink': {
      // The multilink's intent is the double wishbone's with the gaps of its links (the double wishbone ignores them);
      // every field the two templates' defaults differ in is the design's.
      const base = multilinkDefaults(which);
      const it = {
        ...base,
        trackM,
        wheelCentreZM: zW,
        lowerArmM: a.lowerArmMm / 1000,
        upperArmM: a.upperArmMm / 1000,
        upperAngleDeg: a.upperAngleDeg,
        lowerBallZM: a.lowerBallZMm / 1000,
        upperBallZM: a.upperBallZMm / 1000,
        lowerPivotZM: a.lowerPivotZMm / 1000,
        svAngleDeg: a.svAngleDeg,
        kpiDeg: a.kpiDeg,
        casterDeg: a.casterDeg,
        scrubM: a.scrubMm / 1000,
        tieRodDzM: a.tieRodDzMm / 1000,
        steered: end === 'F',
        driven,
        diffOutputYM: a.diffOutputYMm / 1000,
      };
      const spec = a.layout === 'multilink' ? multilink(it) : doubleWishbone(it);
      return withDiffOutput(spec, a, zW);
    }
    case 'trailing-arm':
    case 'semi-trailing':
    case 'swing-axle': {
      const spec = pivotAxle({
        sweepDeg: a.sweepDeg,
        svAngleDeg: a.pivotSvDeg,
        armM: a.pivotArmMm / 1000,
        pivotYM: a.pivotYMm / 1000,
        pivotZM: zW + a.pivotDzMm / 1000,
        bushSpanM: PIVOT_BUSH_SPAN_M,
        trackM,
        wheelCentreZM: zW,
        driven,
        diffOutputYM: a.diffOutputYMm / 1000,
      });
      // The swing axle's joint is on its axis; the others take the design's.
      if (a.layout === 'swing-axle') {
        if (spec.layout !== 'swing-axle') throw new Error(`A sweep of ${a.sweepDeg}° is not a swing axle`);
        return spec;
      }
      if (spec.layout !== a.layout) throw new Error(`A sweep of ${a.sweepDeg}° is not a ${a.layout}`);
      return withDiffOutput(spec, a, zW);
    }
    case 'twist-beam': {
      if (driven) throw new Error('A twist beam carries no half-shafts');
      return twistBeamAxle({
        beamPos: a.beamPos,
        shearCentreDzM: a.shearDzMm / 1000,
        armM: a.beamArmMm / 1000,
        pivotYM: trackM / 2 - a.beamBushInMm / 1000,
        pivotZM: zW + a.beamBushDzMm / 1000,
        trackM,
        wheelCentreZM: zW,
        camberDeg: 0,
        toeDeg: 0,
        torsionNmPerRad: a.beamTorsionNmRad,
      });
    }
    case 'live-axle':
    case 'de-dion': {
      const leaf = SOLID_TYPICAL.leaf.leaf;
      const spec = solidAxle({
        ...SOLID_TYPICAL.panhard,
        layout: a.layout,
        lateral: a.solidLateral,
        links: a.solidLinks,
        trackM,
        wheelCentreZM: zW,
        lowerLinkM: a.lowerLinkMm / 1000,
        upperLinkM: a.upperLinkMm / 1000,
        linkAngleDeg: a.linkAngleDeg,
        upperAngleDeg: a.upperLinkAngleDeg,
        lateralZM: a.lateralZMm / 1000,
        leaf: { ...leaf, yM: Math.min(leaf.yM, trackM / 2 - LEAF_INSIDE_M) },
        driven,
        diffOutputYM: a.diffOutputYMm / 1000,
      });
      return withDiffOutput(spec, a, zW);
    }
  }
}

/** Proves the axle travels its range as the chassis reads it, and measures its motion ratios at design. */
function prove(spec: AxleSpec<AnyAxleLinkage>): { mrSpring: number; mrDamper: number } {
  const link = spec.linkage;
  if (link.kind === 'twist-beam') {
    // The template has walked its grid already; the axle's own constructor checks the design.
    const axle = new TwistBeamAxle(spec as AxleSpec<typeof link>);
    const s = newBeamSample();
    axle.measureAt(0, 0, 'left', s);
    return { mrSpring: s.mrSpring + s.mrSpringCross, mrDamper: s.mrDamper + s.mrDamperCross };
  }
  if (link.kind === 'solid') {
    const axle = new SolidAxle(spec as AxleSpec<typeof link>);
    const s = newSolidSample();
    const { bumpM, droopM } = spec.travel;
    for (const [zL, zR] of [[bumpM, bumpM], [-droopM, -droopM], [bumpM, -droopM], [-droopM, bumpM]] as const) {
      axle.measureAt(zL, zR, 'left', s);
    }
    axle.measureAt(0, 0, 'left', s);
    return { mrSpring: s.mrSpring + s.mrSpringCross, mrDamper: s.mrDamper + s.mrDamperCross };
  }
  // A corner: the table over the whole travel (throws where the linkage cannot follow).
  const axle = new Axle(spec as AxleSpec<typeof link>);
  const s = newCornerSample();
  axle.measureAt(0, s);
  return { mrSpring: s.mrSpring, mrDamper: s.mrDamper };
}

/** The axle of one end of a design: drawn, aligned and proven. Throws when it cannot assemble or travel. */
export function buildAxleGeometry(a: AxleParams, end: AxleEnd, drive: Drive): AxleGeometry {
  const drawn = draw(a, end, drive);
  const spec = { ...drawn, spinAxis: aligned(drawn.spinAxis, a.camberDeg, a.toeDeg) };
  const mr = prove(spec);
  if (!(mr.mrSpring > 0.05 && mr.mrDamper > 0.05)) throw new Error('The spring or the damper barely moves with the wheel');
  return { spec, ...mr };
}

/** Parameters that move a point of the axle: everything but the spring, damper, bar, masses and brakes. */
const GEOMETRY_KEYS = [
  'layout', 'trackMm', 'knuckle', 'kingpinOffsetMm', 'kpiDeg', 'casterDeg', 'scrubMm', 'lowerArmMm', 'upperArmMm',
  'upperAngleDeg', 'lowerPivotZMm', 'lowerBallZMm', 'upperBallZMm', 'svAngleDeg', 'tieRodDzMm', 'sweepDeg',
  'pivotArmMm', 'pivotYMm', 'pivotDzMm', 'pivotSvDeg', 'beamPos', 'shearDzMm', 'beamArmMm', 'beamBushInMm',
  'beamBushDzMm', 'beamTorsionNmRad', 'solidLateral', 'solidLinks', 'lowerLinkMm', 'upperLinkMm', 'linkAngleDeg',
  'upperLinkAngleDeg', 'lateralZMm', 'diffOutputYMm', 'diffOutputDzMm', 'camberDeg', 'toeDeg', 'tyreWidthMm',
  'tyreAspect', 'rimIn',
] as const satisfies readonly (keyof AxleParams)[];

/** What decides an axle's points: its geometry parameters, its end and whether it is driven. */
export function geometryKey(a: AxleParams, end: AxleEnd, drive: Drive): string {
  return JSON.stringify([end, isDriven(drive, end), ...GEOMETRY_KEYS.map((k) => a[k])]);
}

/** The axle of one end of a design drawn, aligned and solved at design only: what buildAxleGeometry gives for an axle
 *  that travels its range, without walking it. Throws when it does not assemble at design. */
export function designAxleGeometry(a: AxleParams, end: AxleEnd, drive: Drive): AxleGeometry {
  const drawn = draw(a, end, drive);
  const spec = { ...drawn, spinAxis: aligned(drawn.spinAxis, a.camberDeg, a.toeDeg) };
  const link = spec.linkage;
  let mr: { mrSpring: number; mrDamper: number };
  if (link.kind === 'twist-beam' || link.kind === 'solid') {
    const s = link.kind === 'twist-beam' ? newBeamSample() : newSolidSample();
    if (link.kind === 'twist-beam') new TwistBeamAxle(spec as AxleSpec<typeof link>).measureAt(0, 0, 'left', s as ReturnType<typeof newBeamSample>);
    else new SolidAxle(spec as AxleSpec<typeof link>).measureAt(0, 0, 'left', s as ReturnType<typeof newSolidSample>);
    mr = { mrSpring: s.mrSpring + s.mrSpringCross, mrDamper: s.mrDamper + s.mrDamperCross };
  } else {
    const d = buildAxleLite(spec as AxleSpec).design;
    mr = { mrSpring: d.mrSpring, mrDamper: d.mrDamper };
  }
  if (!(mr.mrSpring > 0.05 && mr.mrDamper > 0.05)) throw new Error('The spring or the damper barely moves with the wheel');
  return { spec, ...mr };
}

const CACHE_SIZE = 64;
const cache = new Map<string, AxleGeometry | Error>();
const designOnly = new Map<string, AxleGeometry | Error>();

/** Whether axleGeometryOf proves the travel (see withDesignOnlyGeometry). */
let proving = true;

/**
 * Runs `fn` with axles that are solved at design only (designAxleGeometry), unless a proven one is remembered: the
 * sensitivity checks try dozens of geometries a pass and read only what the quick estimates read, which is all at or
 * near design (suspensions plan: the pass goes through buildAxleLite). A design resolved inside may keep an axle that
 * would not travel its whole range; the page never shows such a design, it only previews a control's effect.
 */
export function withDesignOnlyGeometry<T>(fn: () => T): T {
  const was = proving;
  proving = false;
  try {
    return fn();
  } finally {
    proving = was;
  }
}

function remembered(store: Map<string, AxleGeometry | Error>, key: string, make: () => AxleGeometry): AxleGeometry | Error {
  const hit = store.get(key);
  if (hit) {
    // Most recently used last.
    store.delete(key);
    store.set(key, hit);
    return hit;
  }
  let made: AxleGeometry | Error;
  try {
    made = make();
  } catch (e) {
    made = e instanceof Error ? e : new Error(String(e));
  }
  store.set(key, made);
  if (store.size > CACHE_SIZE) store.delete(store.keys().next().value!);
  return made;
}

/** buildAxleGeometry, remembered for the last few geometries; an axle that cannot be built is remembered as its error. */
export function axleGeometryOf(a: AxleParams, end: AxleEnd, drive: Drive): AxleGeometry | Error {
  const key = geometryKey(a, end, drive);
  if (!proving) return cache.get(key) ?? remembered(designOnly, key, () => designAxleGeometry(a, end, drive));
  return remembered(cache, key, () => buildAxleGeometry(a, end, drive));
}

/** The axle of a resolved design; throws if it cannot be built (resolveChassis guarantees it can). */
export function axleGeometry(d: ChassisDesign, end: AxleEnd): AxleGeometry {
  const g = axleGeometryOf(axleOf(d, end), end, d.drive);
  if (g instanceof Error) throw g;
  return g;
}
