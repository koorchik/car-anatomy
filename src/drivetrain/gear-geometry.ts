// Involute gear geometry in the transverse plane (ISO 21771 form, docs/research/gearboxes.md §2.1–2.2): transverse
// module and pressure angle, the helix angle that a shared centre distance leaves, the working pressure angle with
// profile shift, contact ratios, the undercut limit, the tooth outline and the mesh phase.
//
// A helical pair meshes in every transverse section like a spur pair with the transverse module and pressure angle,
// so the outline, the phase and the interference check work in that section.
//
// Lengths are millimetres, angles inside are radians; the inputs that mirror GearDef are degrees.
// Angles around a gear follow kinematics.ts: clockwise from +Y, seen from the front. A gear angle θ is where the
// centre of tooth 0 points, and a member turning positive increases it.

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

/** Addendum and dedendum of the basic rack, in modules (ISO 53 profile A). */
export const ADDENDUM = 1;
export const DEDENDUM = 1.25;
/** Root fillet radius of the basic rack, in modules. */
export const ROOT_FILLET = 0.38;
/** Undercut shallower than this, in modules, is below grinding tolerance and does not count. */
export const UNDERCUT_TOLERANCE = 0.01;

/** inv α = tan α − α. */
export const involute = (alpha: number): number => Math.tan(alpha) - alpha;

/** The angle whose involute is `value` (Newton from a cube-root start; converges in a few steps). */
export function inverseInvolute(value: number): number {
  if (value <= 0) return 0;
  let a = Math.cbrt(3 * value);
  for (let i = 0; i < 50; i++) {
    const t = Math.tan(a);
    const step = (t - a - value) / (t * t);
    a -= step;
    if (Math.abs(step) < 1e-15) break;
  }
  return a;
}

/** Transverse module and pressure angle of a helical gear. */
export function transverse(module: number, helixDeg: number, pressureAngleDeg: number): { mt: number; alphaT: number } {
  const beta = helixDeg * DEG;
  return { mt: module / Math.cos(beta), alphaT: Math.atan(Math.tan(pressureAngleDeg * DEG) / Math.cos(beta)) };
}

/**
 * Working centre distance of a pair, mm; for an internal pair `teeth2` is the ring. With a profile shift sum the pair
 * runs at the working pressure angle α_wt: inv α_wt = inv α_t + 2 tan α_n·Σx/Σz.
 */
export function centreDistance(
  module: number, teeth1: number, teeth2: number, helixDeg: number, pressureAngleDeg: number, shiftSum = 0, internal = false,
): number {
  const { mt, alphaT } = transverse(module, helixDeg, pressureAngleDeg);
  const zSum = internal ? teeth2 - teeth1 : teeth1 + teeth2;
  const reference = (mt * zSum) / 2;
  if (shiftSum === 0) return reference;
  if (internal) throw new Error('profile shift of internal pairs comes with the planetary stage');
  const alphaWt = inverseInvolute(involute(alphaT) + (2 * Math.tan(pressureAngleDeg * DEG) * shiftSum) / zSum);
  return (reference * Math.cos(alphaT)) / Math.cos(alphaWt);
}

/**
 * The helix angle at which a pair with this module, these teeth and this shift sum runs at the centre distance `a`,
 * degrees. The working centre distance grows monotonically with the helix, so bisection finds it to rounding.
 * Returns NaN when no angle up to 60° fits (the teeth are too many for the centre distance, or too few).
 */
export function helixForCentre(a: number, module: number, teeth1: number, teeth2: number, pressureAngleDeg: number, shiftSum = 0): number {
  if (shiftSum === 0) {
    const c = (module * (teeth1 + teeth2)) / (2 * a);
    return c > 1 || c < Math.cos(60 * DEG) ? NaN : Math.acos(c) / DEG;
  }
  const at = (deg: number) => centreDistance(module, teeth1, teeth2, deg, pressureAngleDeg, shiftSum);
  let lo = 0;
  let hi = 60;
  // A spur pair whose shift sum was solved for this centre (shiftSumForCentre) spans it at 0° to a rounding hair, on
  // either side: it is spur, not NaN or a helix of a millionth of a degree.
  if (Math.abs(at(lo) - a) <= 1e-9 * a) return 0;
  if (at(lo) > a || at(hi) < a) return NaN;
  for (let i = 0; i < 200 && hi - lo > 1e-13; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) < a) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** The profile shift sum that makes a pair run at the working centre distance `a`. */
export function shiftSumForCentre(a: number, module: number, teeth1: number, teeth2: number, helixDeg: number, pressureAngleDeg: number): number {
  const { mt, alphaT } = transverse(module, helixDeg, pressureAngleDeg);
  const zSum = teeth1 + teeth2;
  const reference = (mt * zSum) / 2;
  const alphaWt = Math.acos((reference * Math.cos(alphaT)) / a);
  return ((involute(alphaWt) - involute(alphaT)) * zSum) / (2 * Math.tan(pressureAngleDeg * DEG));
}

/**
 * Undercut by the generating rack: it cuts into the flank root when (h_a − x)·m_n > r·sin²α_t, i.e. when
 * x < x_min = 1 − z·sin²α_t/(2 cos β). For a spur gear at 20° that is z < 2/sin²20° ≈ 17.1. `depth` is in modules.
 */
export function undercut(teeth: number, shift: number, helixDeg: number, pressureAngleDeg: number): { minShift: number; depth: number; undercut: boolean } {
  const { alphaT } = transverse(1, helixDeg, pressureAngleDeg);
  const minShift = ADDENDUM - (teeth * Math.sin(alphaT) ** 2) / (2 * Math.cos(helixDeg * DEG));
  const depth = Math.max(0, minShift - shift);
  return { minShift, depth, undercut: depth > UNDERCUT_TOLERANCE };
}

/** The shape of one gear, everything in the transverse plane. */
export interface GearGeometry {
  teeth: number;
  /** Normal module, mm. */
  module: number;
  /** Helix angle, rad (signed: positive is a right hand). */
  beta: number;
  alphaN: number;
  alphaT: number;
  /** Transverse module, mm. */
  mt: number;
  shift: number;
  /** Reference, base, tip and root radii, mm. */
  r: number;
  rb: number;
  ra: number;
  rf: number;
  /** Half the tooth angle on the reference circle, rad, after the backlash allowance. */
  halfAngle: number;
  /** Half the tooth angle on the tip circle, rad; zero or less means a pointed tooth. */
  tipHalfAngle: number;
  faceWidth: number;
}

export interface GearShape {
  teeth: number;
  module: number;
  helix: number;
  pressureAngle: number;
  shift: number;
  faceWidth: number;
}

/**
 * Geometry of one external gear. `thinning` is the transverse tooth thickness taken off on the reference circle for
 * backlash, mm; `tipShortening` (in modules) keeps the tip clearance when a pair's shift sum spreads the centres less
 * than it raises the tips.
 */
export function gearGeometry(gear: GearShape, thinning = 0, tipShortening = 0): GearGeometry {
  const beta = gear.helix * DEG;
  const alphaN = gear.pressureAngle * DEG;
  const { mt, alphaT } = transverse(gear.module, Math.abs(gear.helix), gear.pressureAngle);
  const r = (mt * gear.teeth) / 2;
  const rb = r * Math.cos(alphaT);
  const ra = r + gear.module * (ADDENDUM + gear.shift - tipShortening);
  const rf = r - gear.module * (DEDENDUM - gear.shift);
  const halfAngle = (Math.PI / 2 + 2 * gear.shift * Math.tan(alphaN)) / gear.teeth - thinning / (2 * r);
  const geometry: GearGeometry = {
    teeth: gear.teeth, module: gear.module, beta, alphaN, alphaT, mt, shift: gear.shift,
    r, rb, ra, rf, halfAngle, tipHalfAngle: 0, faceWidth: gear.faceWidth,
  };
  geometry.tipHalfAngle = halfToothAngle(geometry, ra);
  return geometry;
}

/**
 * Half the tooth angle at radius ρ: ψ(ρ) = ψ_ref + inv α_t − inv α_ρ with cos α_ρ = r_b/ρ. Below the base circle
 * the flank is taken as radial, which is what the root fillet leaves of it.
 */
export function halfToothAngle(gear: GearGeometry, rho: number): number {
  const alphaRho = rho > gear.rb ? Math.acos(gear.rb / rho) : 0;
  return gear.halfAngle + involute(gear.alphaT) - involute(alphaRho);
}

/** A pair at its working centre distance. */
export interface PairGeometry {
  a: GearGeometry;
  b: GearGeometry;
  /** Reference centre distance m_t(z_a + z_b)/2 and the working one, mm. */
  reference: number;
  centre: number;
  /** Working transverse pressure angle, rad. */
  alphaWt: number;
  /** Transverse and overlap contact ratios. */
  epsAlpha: number;
  epsBeta: number;
  /** Tip shortening applied to both gears, in modules. */
  tipShortening: number;
}

/**
 * Two meshing external gears. Their modules, pressure angles and helix magnitudes must agree (a helical pair has
 * opposite hands), otherwise they cannot mesh and this throws.
 */
export function pairGeometry(a: GearShape, b: GearShape, thinning = 0): PairGeometry {
  if (Math.abs(a.module - b.module) > 1e-9 || Math.abs(Math.abs(a.helix) - Math.abs(b.helix)) > 1e-9 || a.pressureAngle !== b.pressureAngle) {
    throw new Error(`gears ${a.teeth} and ${b.teeth} cannot mesh: module, helix or pressure angle differ`);
  }
  if (a.helix !== 0 && Math.sign(a.helix) === Math.sign(b.helix)) {
    throw new Error(`external helical gears ${a.teeth} and ${b.teeth} need opposite hands`);
  }
  const helix = Math.abs(a.helix);
  const shiftSum = a.shift + b.shift;
  const centre = centreDistance(a.module, a.teeth, b.teeth, helix, a.pressureAngle, shiftSum);
  const { mt, alphaT } = transverse(a.module, helix, a.pressureAngle);
  const reference = (mt * (a.teeth + b.teeth)) / 2;
  const alphaWt = Math.acos((reference * Math.cos(alphaT)) / centre);
  const tipShortening = Math.max(0, shiftSum - (centre - reference) / a.module);
  const ga = gearGeometry(a, thinning, tipShortening);
  const gb = gearGeometry(b, thinning, tipShortening);
  const pbt = Math.PI * mt * Math.cos(alphaT);
  const epsAlpha = (Math.sqrt(ga.ra ** 2 - ga.rb ** 2) + Math.sqrt(gb.ra ** 2 - gb.rb ** 2) - centre * Math.sin(alphaWt)) / pbt;
  const epsBeta = (Math.min(a.faceWidth, b.faceWidth) * Math.sin(helix * DEG)) / (Math.PI * a.module);
  return { a: ga, b: gb, reference, centre, alphaWt, epsAlpha, epsBeta, tipShortening };
}

/**
 * Starting angle of the driven gear B so that its teeth fall into A's gaps (research §2.2): with B's centre in the
 * direction φ from A's, θ_B = φ + π + π/z_B − (z_A/z_B)(θ_A − φ). Checked numerically on 19/43, 20/20, 17/31, 29/38.
 */
export function meshPhase(thetaA: number, teethA: number, teethB: number, phi: number): number {
  return wrap(phi + Math.PI + Math.PI / teethB - (teethA / teethB) * (thetaA - phi));
}

/** Direction from one axis to another in the gear angle convention (clockwise from +Y, seen from the front). */
export const direction = (from: { x: number; y: number }, to: { x: number; y: number }): number => Math.atan2(to.x - from.x, to.y - from.y);

/** Angle in [0, 2π). */
export const wrap = (angle: number): number => ((angle % TAU) + TAU) % TAU;

/**
 * Outline of the whole gear in its own frame, as x, y pairs in mm: tooth k is centred at 2πk/z clockwise from +Y.
 * Each tooth runs root arc, fillet arc, involute flank, tip arc, involute flank, fillet arc. `steps` sets the points
 * per flank; the 3D extrudes this outline along a helix.
 */
export function toothOutline(gear: GearGeometry, steps = 10): Float32Array {
  const tooth = singleTooth(gear, steps);
  const out = new Float32Array(tooth.length * gear.teeth);
  for (let k = 0; k < gear.teeth; k++) {
    const turn = (TAU * k) / gear.teeth;
    for (let i = 0; i < tooth.length; i += 2) {
      const rho = tooth[i]!;
      const angle = tooth[i + 1]! + turn;
      out[k * tooth.length + i] = rho * Math.sin(angle);
      out[k * tooth.length + i + 1] = rho * Math.cos(angle);
    }
  }
  return out;
}

/**
 * One tooth from the middle of the gap before it to the middle of the gap after it, as (ρ, angle) pairs. A bevel gear
 * draws it on its back cone, from the equivalent spur gear (gear-mesh's bevel builder); the teeth need not be whole.
 */
export function singleTooth(gear: GearGeometry, steps: number): number[] {
  const halfPitch = Math.PI / gear.teeth;
  const start = Math.max(gear.rb, gear.rf);
  const flankRoot = halfToothAngle(gear, start);
  const tip = Math.max(gear.tipHalfAngle, 0);
  // Fillet: an arc tangent to the root circle and to the radial line through the flank's start. It stays inside the
  // gap and inside the root clearance, below the deepest point the mate's tip reaches, as the generated fillet does.
  const clearance = (DEDENDUM - ADDENDUM) * gear.module;
  const gapLimit = (gear.rf * Math.sin(halfPitch - flankRoot)) / (1 - Math.sin(halfPitch - flankRoot));
  const rho = Math.min(ROOT_FILLET * gear.module, 0.8 * clearance, gapLimit);
  const rc = gear.rf + rho;
  const centreAngle = flankRoot + Math.asin(Math.min(1, rho / rc));
  const left: number[] = [];
  left.push(gear.rf, -halfPitch);
  // Fillet from the root circle (point under the arc centre) to the radial flank line.
  for (let i = 0; i <= steps / 2; i++) {
    const u = i / (steps / 2);
    // Sweep the arc from its root contact (pointing at the gear centre) to its flank contact (pointing at the flank).
    const a0 = Math.PI;
    const a1 = Math.PI / 2 + (centreAngle - flankRoot);
    const ang = a0 + (a1 - a0) * u;
    // Arc centre in a local frame: radial distance rc, angle −centreAngle. Offsets along radial and tangential axes.
    const radial = rc + rho * Math.cos(ang);
    const tangential = rho * Math.sin(ang);
    left.push(Math.hypot(radial, tangential), -centreAngle + Math.atan2(tangential, radial));
  }
  // The involute starts where the fillet ends, or at the base circle if the radial flank runs above the fillet.
  const contact = Math.sqrt(rc * rc - rho * rho);
  const from = Math.max(start, contact);
  if (start > contact) left.push(start, -flankRoot);
  for (let i = 1; i <= steps; i++) {
    const r = from + ((gear.ra - from) * i) / steps;
    left.push(r, -Math.max(halfToothAngle(gear, r), 0));
  }
  const points = [...left];
  for (let i = 1; i < 4; i++) points.push(gear.ra, -tip + (2 * tip * i) / 4);
  for (let i = left.length - 2; i >= 0; i -= 2) points.push(left[i]!, -left[i + 1]!);
  return points;
}

/**
 * How far a point lies inside gear material, mm along the circle (zero or less: outside). The gear sits at
 * `centre` with tooth 0 at angle `theta`. Used by the interference check; the radial flank below the base circle
 * makes it conservative there.
 */
export function penetration(gear: GearGeometry, centre: { x: number; y: number }, theta: number, px: number, py: number): number {
  const dx = px - centre.x;
  const dy = py - centre.y;
  const rho = Math.hypot(dx, dy);
  if (rho >= gear.ra) return gear.ra - rho;
  if (rho <= gear.rf) return gear.rf - rho + 1;
  const pitch = TAU / gear.teeth;
  const local = wrap(Math.atan2(dx, dy) - theta);
  const fromCentre = Math.abs(local - Math.round(local / pitch) * pitch);
  return (halfToothAngle(gear, rho) - fromCentre) * rho;
}

/**
 * Points of either outline that lie deeper than `tolerance` mm inside the other gear: zero for a correct mesh. Gear
 * A sits at `centreA` with tooth 0 at `thetaA`, B likewise.
 */
export function interference(
  a: GearGeometry, centreA: { x: number; y: number }, thetaA: number,
  b: GearGeometry, centreB: { x: number; y: number }, thetaB: number,
  tolerance = 1e-4, steps = 24,
): number {
  let count = 0;
  const check = (g: GearGeometry, c: { x: number; y: number }, th: number, other: GearGeometry, oc: { x: number; y: number }, oth: number) => {
    const outline = toothOutline(g, steps);
    const cos = Math.cos(th);
    const sin = Math.sin(th);
    for (let i = 0; i < outline.length; i += 2) {
      // Rotate clockwise by th: in this convention a point at angle α moves to α + th.
      const x = outline[i]! * cos + outline[i + 1]! * sin;
      const y = -outline[i]! * sin + outline[i + 1]! * cos;
      if (penetration(other, oc, oth, c.x + x, c.y + y) > tolerance) count++;
    }
  };
  check(a, centreA, thetaA, b, centreB, thetaB);
  check(b, centreB, thetaB, a, centreA, thetaA);
  return count;
}
