// The force polygon behind the balance arrows: why one engine shakes and another does not, in numbers a diagram can
// draw. Pure, like the rest of src/engine. BalanceForces stays the one source of the forces; this module only takes
// its arrows apart.
//
// A force along a cylinder axis does not turn, it only changes length. It is still exactly two turning vectors of half
// its size, one turning with the crank and one against it:
//   A cos(n theta - psi) u = 1/2 A u (e^(i (n theta - psi)) + e^(-i (n theta - psi))).
// So every element of a view keeps two complex amplitudes at theta = 0: plus, the +n harmonic that turns with the
// crank, and minus, the -n one that turns against it. Laid head to tail, the vectors of each kind close when the view
// is balanced, and the gap is what is left. Complex numbers follow balance-forces.ts: w = Fy + i Fx.
//
// Three views, one harmonic each:
//   order1    the pistons' first order;
//   order2    the pistons' second order. Only its 2nd harmonic: the arrows of BalanceForces also carry the small 4th
//             and 6th orders, which no balancer fights and the residual does not count;
//   rotating  the big ends and crankpins, or the rotors of a rotary.
// A counterweight cancels the turning masses of its throw and the half of each of its pistons' first order that turns
// with the crank (BALANCE_FACTOR). It is split along those lines: the first share belongs to 'rotating', the second to
// 'order1'. Either view then closes on its own where the engine is balanced, and the two shares together are the
// counterweight arrow of BalanceForces. A balance shaft belongs to the view of its order.
//
// Couples are taken about the middle of the crank (z = 0 of kinematics.ts), as BalanceForces.sum does: each force
// weighted by its z, in m.

import { BALANCE_FACTOR, harmonic, type BalanceForces, type Complex, type ForceArrow, type ForceSum } from './balance-forces.ts';

const DEG = Math.PI / 180;
const STEPS = 360;

/** Below this share of one piston's first order (its couple over the bore pitch for couples) a sum counts as nothing. */
const NOTHING = 0.01;
/** A locus whose short axis is under this share of its long one is a line; one whose smaller phasor is under this share of the larger is a circle. */
const SLIM = 0.05;

export type BalanceView = 'order1' | 'order2' | 'rotating';

export interface ViewOptions {
  /** The counterweights' share of this view. Only 'order1' and 'rotating' have one. */
  counterweights: boolean;
  /** Balance shafts of this view's order, where the engine has them. */
  shafts: boolean;
}

export type ElementKind = 'piston' | 'rotating' | 'rotor' | 'counterweight' | 'shaft';

export interface PhasorElement {
  kind: ElementKind;
  /** Index into BalanceForces.arrows of the arrow this element is a share of, which says where it acts. */
  arrow: number;
  /** Share of that arrow the element carries: 1, or the counterweight's share that belongs to this view. */
  share: number;
  /** Cylinder number of a piston or a big end, rotor number (from 1) of a rotor. */
  cylinder?: number;
  /** Index into Engine.throws of a counterweight's throw. */
  throw?: number;
  /** Index into BalanceForces.shafts of a shaft's weight. */
  shaft?: number;
  /** Position along the crank from its middle, mm. */
  z: number;
  /** Amplitude of the harmonic turning with the crank at theta = 0, kg m per unit omega^2. */
  plus: Complex;
  /** Amplitude of the harmonic turning against the crank at theta = 0. */
  minus: Complex;
}

export type LocusShape = 'point' | 'line' | 'circle' | 'ellipse';

/** Path of the tip of a net force (or couple) over a turn. */
export interface Locus {
  shape: LocusShape;
  /** Which way the tip runs round: 1 with the crank, -1 against it, 0 for a point or a line. */
  sense: 1 | -1 | 0;
  /** Direction of the long axis, degrees clockwise from +Y seen from the front, 0 to 180. 0 for a point or a circle. */
  axis: number;
  /** Half the long axis, |plus| + |minus|: the largest the sum gets. */
  major: number;
  /** Half the short axis, ||plus| - |minus||: the smallest it gets. */
  minor: number;
}

export interface PhasorSum {
  plus: Complex;
  minus: Complex;
  locus: Locus;
}

export interface PhasorView {
  view: BalanceView;
  /** Harmonic the view shows: 1 for once per crank turn, 2 for twice. */
  order: 1 | 2;
  options: ViewOptions;
  /** In the order BalanceForces lists its arrows: pistons or turning masses by cylinder, counterweights by throw, then shafts. */
  elements: PhasorElement[];
  /** Net force, kg m per unit omega^2. */
  force: PhasorSum;
  /**
   * Rocking couple about the middle of the crank, kg m^2 per unit omega^2. Its vectors are each force weighted by its
   * z, so they point the way the front of the engine is pushed; the couple itself is about the axis square to that.
   */
  couple: PhasorSum;
  /**
   * When the polygon turning against the crank is the mirror image of the one turning with it, the mirror's axis in
   * degrees (0 to 180): pistons alone on an inline engine, whose forces all act along one axis. Otherwise null.
   */
  mirror: number | null;
}

export interface Vec2 {
  x: number;
  y: number;
}

/** Which vectors a polygon adds: those turning with the crank, those turning against it, or whole forces. */
export type PolygonSide = 'plus' | 'minus' | 'net';
export type Quantity = 'force' | 'couple';

const NONE: ViewOptions = { counterweights: false, shafts: false };

const size = (c: Complex): number => Math.hypot(c.re, c.im);
const scaled = (c: Complex, k: number): Complex => ({ re: c.re * k, im: c.im * k });

/** Degrees folded into 0 to 180, the range of an axis. */
const axisOf = (deg: number): number => {
  const a = ((deg % 180) + 180) % 180;
  return 180 - a < 1e-9 ? 0 : a;
};

/**
 * Where a turning pair puts its tip at crank angle theta (degrees), in the front view: x right, y up. Written into out
 * when given, so a picture redrawn every frame makes no garbage, as BalanceForces.sum does.
 */
export function phasorAt(plus: Complex, minus: Complex, order: number, theta: number, side: PolygonSide = 'net', out: Vec2 = { x: 0, y: 0 }): Vec2 {
  const a = order * theta * DEG;
  const c = Math.cos(a);
  const s = Math.sin(a);
  let re = 0;
  let im = 0;
  if (side !== 'minus') {
    re += plus.re * c - plus.im * s;
    im += plus.re * s + plus.im * c;
  }
  if (side !== 'plus') {
    re += minus.re * c + minus.im * s;
    im += minus.im * c - minus.re * s;
  }
  out.x = im;
  out.y = re;
  return out;
}

/** One element's vector at crank angle theta, written into out when given. */
export const vectorAt = (element: PhasorElement, order: number, theta: number, side: PolygonSide = 'net', out?: Vec2): Vec2 =>
  phasorAt(element.plus, element.minus, order, theta, side, out);

/** Scratch for the functions below that hand back points of their own, never anything a caller keeps. */
const step: Vec2 = { x: 0, y: 0 };
const forceTip: Vec2 = { x: 0, y: 0 };
const coupleTip: Vec2 = { x: 0, y: 0 };

/**
 * Path of the tip of plus e^(i n theta) + minus e^(-i n theta): an ellipse with half axes |plus| + |minus| and
 * ||plus| - |minus||. unit is what counts as large (one piston's first order, or its couple over the bore pitch).
 */
export function locusOf(plus: Complex, minus: Complex, unit: number): Locus {
  const a = size(plus);
  const b = size(minus);
  const major = a + b;
  const minor = Math.abs(a - b);
  // The two phasors line up where the sum is longest, half way between their angles.
  const axis = axisOf((Math.atan2(plus.im, plus.re) + Math.atan2(minus.im, minus.re)) / 2 / DEG);
  if (major <= unit * NOTHING) return { shape: 'point', sense: 0, axis: 0, major, minor };
  if (minor <= major * SLIM) return { shape: 'line', sense: 0, axis, major, minor };
  const sense = a > b ? 1 : -1;
  if (Math.min(a, b) <= Math.max(a, b) * SLIM) return { shape: 'circle', sense, axis: 0, major, minor };
  return { shape: 'ellipse', sense, axis, major, minor };
}

/**
 * Elements laid head to tail at crank angle theta: the origin, then the tip after each element, so point k + 1 is the
 * head of element k and the last point is the view's sum. A couple polygon weights each vector by its z, in m. Pass the
 * array the last call returned as out and its points are reused.
 */
export function polygon(view: PhasorView, theta: number, side: PolygonSide = 'net', quantity: Quantity = 'force', out: Vec2[] = []): Vec2[] {
  const count = view.elements.length + 1;
  if (out.length > count) out.length = count;
  while (out.length < count) out.push({ x: 0, y: 0 });
  out[0]!.x = 0;
  out[0]!.y = 0;
  let x = 0;
  let y = 0;
  view.elements.forEach((el, i) => {
    const v = vectorAt(el, view.order, theta, side, step);
    const k = quantity === 'couple' ? el.z / 1000 : 1;
    x += v.x * k;
    y += v.y * k;
    const p = out[i + 1]!;
    p.x = x;
    p.y = y;
  });
  return out;
}

/** The view's net force or couple at crank angle theta, or one turning half of it, written into out when given. */
export function netAt(view: PhasorView, theta: number, quantity: Quantity = 'force', side: PolygonSide = 'net', out?: Vec2): Vec2 {
  const sum = view[quantity];
  return phasorAt(sum.plus, sum.minus, view.order, theta, side, out);
}

/** The view's sum at crank angle theta in the form BalanceForces.sum gives it: forces, then pitch and yaw couples. */
export function sumAt(view: PhasorView, theta: number, out: ForceSum = { fx: 0, fy: 0, mx: 0, my: 0 }): ForceSum {
  const f = netAt(view, theta, 'force', 'net', forceTip);
  const c = netAt(view, theta, 'couple', 'net', coupleTip);
  out.fx = f.x;
  out.fy = f.y;
  // The couple polygon holds z F; the couple itself is z x F: -z Fy about X, z Fx about Y.
  out.mx = -c.y;
  out.my = c.x;
  return out;
}

/** Tip of the net force or couple over one crank turn, steps points from theta = 0. */
export function trace(view: PhasorView, quantity: Quantity = 'force', steps = 72): Vec2[] {
  return Array.from({ length: steps }, (_, i) => netAt(view, (360 * i) / steps, quantity));
}

/** The common mirror axis of each element's two halves, when every element has one: minus = e^(2 i psi) conj(plus). */
function mirrorOf(elements: PhasorElement[]): number | null {
  const big = elements.reduce((m, el) => Math.max(m, size(el.plus) + size(el.minus)), 0);
  if (big === 0) return null;
  const tol = big * 1e-9;
  let first: number | null = null;
  for (const el of elements) {
    const p = size(el.plus);
    const m = size(el.minus);
    if (p < tol && m < tol) continue;
    if (Math.abs(p - m) > tol) return null;
    // Taking angles of minus = e^(2 i psi) conj(plus): 2 psi = arg minus + arg plus.
    const twice = Math.atan2(el.minus.im, el.minus.re) + Math.atan2(el.plus.im, el.plus.re);
    if (first === null) first = twice;
    else if (Math.abs(Math.sin((twice - first) / 2)) > 1e-6) return null;
  }
  return first === null ? null : axisOf(first / 2 / DEG);
}

interface Amplitudes {
  plus: Complex;
  minus: Complex;
}

/**
 * Every arrow of a BalanceForces taken apart into its turning harmonics once, so views are only sums. The forces may
 * be shared with the 3D layer: sampling leaves them at the angle they were at. Views are cached and shared, so callers
 * read them and never change them.
 */
export class BalancePhasors {
  readonly forces: BalanceForces;
  /** Views this engine has: a rotary has no pistons, only turning masses. */
  readonly views: BalanceView[];
  /** Share of each counterweight that cancels the turning masses; the rest cancels the pistons' first order. */
  readonly turningShare: number;
  private readonly amplitudes: Amplitudes[];
  private readonly cache = new Map<string, PhasorView>();

  constructor(forces: BalanceForces) {
    this.forces = forces;
    const rotary = forces.engine.isRotary;
    this.views = rotary ? ['rotating'] : ['order1', 'order2', 'rotating'];
    const { rotatingKg, reciprocatingKg } = forces.masses;
    const weight = rotatingKg + reciprocatingKg * BALANCE_FACTOR;
    this.turningShare = rotary ? 1 : weight > 0 ? rotatingKg / weight : 0;

    const keep = forces.angle;
    const samples: Complex[][] = forces.arrows.map(() => []);
    for (let i = 0; i < STEPS; i++) {
      forces.at((360 * i) / STEPS);
      forces.arrows.forEach((a, k) => samples[k]!.push({ re: a.fy, im: a.fx }));
    }
    forces.at(keep);
    this.amplitudes = forces.arrows.map((a, k) => ({ plus: harmonic(samples[k]!, a.order), minus: harmonic(samples[k]!, -a.order) }));
  }

  /** Whether a view has counterweights to switch: the turning masses always do, the first order on a piston engine. */
  hasCounterweights(view: BalanceView): boolean {
    return this.views.includes(view) && view !== 'order2';
  }

  /** Whether the engine has a balance shaft of this view's order. */
  hasShafts(view: BalanceView): boolean {
    if (view === 'rotating') return false;
    const order = view === 'order1' ? 1 : 2;
    return this.forces.shafts.some((s) => s.order === order);
  }

  view(view: BalanceView, options: ViewOptions = NONE): PhasorView {
    const key = `${view}${+options.counterweights}${+options.shafts}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const built = this.build(view, options);
    this.cache.set(key, built);
    return built;
  }

  private build(view: BalanceView, options: ViewOptions): PhasorView {
    const bf = this.forces;
    const e = bf.engine;
    const order: 1 | 2 = view === 'order2' ? 2 : 1;
    const elements: PhasorElement[] = [];
    const seen = { piston: 0, rotating: 0, rotor: 0, counterweight: 0 };
    const add = (a: ForceArrow, k: number, share: number, extra: Partial<PhasorElement>): void => {
      const amp = this.amplitudes[k]!;
      elements.push({ kind: a.kind, arrow: k, share, z: a.z, plus: scaled(amp.plus, share), minus: scaled(amp.minus, share), ...extra });
    };
    bf.arrows.forEach((a, k) => {
      switch (a.kind) {
        case 'piston': {
          // BalanceForces gives each cylinder its two orders in turn.
          if (a.order === order && view !== 'rotating') add(a, k, 1, { cylinder: e.cylinders[seen.piston >> 1]!.n });
          seen.piston++;
          return;
        }
        case 'rotating':
          if (view === 'rotating') add(a, k, 1, { cylinder: e.cylinders[seen.rotating]!.n });
          seen.rotating++;
          return;
        case 'rotor':
          if (view === 'rotating') add(a, k, 1, { cylinder: seen.rotor + 1 });
          seen.rotor++;
          return;
        case 'counterweight': {
          const share = view === 'rotating' ? this.turningShare : view === 'order1' ? 1 - this.turningShare : 0;
          // Two webs to a throw; a rotary's two weights sit on the pulley and the flywheel instead.
          if (options.counterweights && share > 0) add(a, k, share, e.isRotary ? {} : { throw: seen.counterweight >> 1 });
          seen.counterweight++;
          return;
        }
        case 'shaft': {
          if (options.shafts && view !== 'rotating' && a.order === order) add(a, k, 1, { shaft: bf.shafts.findIndex((s) => s.weights.includes(a)) });
          return;
        }
      }
    });

    const force = { plus: { re: 0, im: 0 }, minus: { re: 0, im: 0 } };
    const couple = { plus: { re: 0, im: 0 }, minus: { re: 0, im: 0 } };
    for (const el of elements) {
      const z = el.z / 1000;
      force.plus.re += el.plus.re;
      force.plus.im += el.plus.im;
      force.minus.re += el.minus.re;
      force.minus.im += el.minus.im;
      couple.plus.re += z * el.plus.re;
      couple.plus.im += z * el.plus.im;
      couple.minus.re += z * el.minus.re;
      couple.minus.im += z * el.minus.im;
    }
    return {
      view,
      order,
      options: { ...options },
      elements,
      force: { ...force, locus: locusOf(force.plus, force.minus, bf.primary) },
      couple: { ...couple, locus: locusOf(couple.plus, couple.minus, bf.primary * bf.lever) },
      mirror: mirrorOf(elements),
    };
  }
}
