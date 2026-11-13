// Inertia forces as arrows: where each one acts on the engine and how large it is, so the picture can show
// why one engine shakes and another does not. Pure, like the rest of src/engine.
//
// Every inertia force grows with the square of the crank speed, so forces are kept per unit omega^2, in kg m
// (newtons per (rad/s)^2). Multiplying by omega^2 gives newtons. Coordinates and angles follow kinematics.ts:
// X right, Y up, Z to the front, angles clockwise from +Y seen from the front, lengths in mm.
//
// The arrows add up to exactly what vibrationTable() leaves, with the sign of a force rather than of an
// acceleration: the pistons' own forces, the masses turning on each crankpin, and a counterweight on both webs of
// every throw that together cancel those masses and the half of each piston's first order that turns with the crank
// (the classic 50% balance factor). Balance shafts then take out what is left of their order.

import type { EngineSpec } from './spec.ts';
import { pistonAcceleration, pistonPin, type Engine } from './kinematics.ts';

const DEG = Math.PI / 180;

export type ForceKind = 'piston' | 'rotating' | 'counterweight' | 'shaft' | 'rotor';

export interface ForceArrow {
  kind: ForceKind;
  /** 1 changes once per crank turn, 2 twice (with the small higher orders folded in). */
  order: 1 | 2;
  /** Point where the force acts, engine frame, mm. */
  x: number;
  y: number;
  z: number;
  /** Force on the engine per unit omega^2, kg m. */
  fx: number;
  fy: number;
}

export interface BalanceShaft {
  /** 1 turns at crank speed, 2 at twice crank speed. */
  order: 1 | 2;
  /** 1 turns with the crank, -1 against it. */
  sense: 1 | -1;
  /** Axis position, mm. */
  x: number;
  y: number;
  /** Arrows of its front and rear weights. */
  weights: ForceArrow[];
}

export interface BalanceMasses {
  /** Piston, pin, rings and a third of the rod, per cylinder, kg. */
  reciprocatingKg: number;
  /** Rest of the rod and the crankpin share, per cylinder, kg. */
  rotatingKg: number;
  /** One rotor, kg. */
  rotorKg: number;
  shafts: 0 | 1 | 2;
}

/** Which groups of arrows are shown. Each shown arrow counts in the sum. */
export interface ForceLayers {
  /** Pistons' first order, the masses turning on the crankpins and the rotors: everything at crank frequency. */
  order1: boolean;
  order2: boolean;
  /** Counterweights and balance shafts, of the orders shown. */
  balancing: boolean;
}

export const ALL_LAYERS: ForceLayers = { order1: true, order2: true, balancing: true };

/** Masses the spec carries. A spec written by hand gets the figures of a typical car engine. */
export const massesOf = (spec: EngineSpec): BalanceMasses => ({
  reciprocatingKg: spec.tuning?.reciprocatingKg ?? 0.55,
  rotatingKg: spec.tuning?.rotatingKg ?? 0.55,
  rotorKg: spec.tuning?.rotorKg ?? 4.5,
  shafts: spec.tuning?.balanceShafts ?? 0,
});

/** Turning masses stay with the first order: they shake the engine whether or not anything fights them. */
export const isShown = (arrow: ForceArrow, layers: ForceLayers): boolean =>
  (arrow.order === 1 ? layers.order1 : layers.order2) && (layers.balancing || (arrow.kind !== 'counterweight' && arrow.kind !== 'shaft'));

export interface ForceSum {
  /** Net force per unit omega^2, kg m. */
  fx: number;
  fy: number;
  /** Rocking couple about the middle of the crank per unit omega^2, kg m^2: about X (pitch) and about Y (yaw). */
  mx: number;
  my: number;
}

/** Peak of each order of what is left, per unit omega^2: forces in kg m, couples in kg m^2. */
export interface OrderResidual {
  force1: number;
  force2: number;
  couple1: number;
  couple2: number;
}

/** A force or couple in the crank's plane as w = Fy + i Fx: e^(i theta) turns clockwise seen from the front, with the crank. */
export interface Complex {
  re: number;
  im: number;
}

const STEPS = 360;

/** Share of each piston's first order a counterweight balances: the half that turns with the crank. */
export const BALANCE_FACTOR = 0.5;

/**
 * How far past the outer rotor faces RotaryEngineModel.buildShaftAndEnds puts the pulley and the flywheel, mm:
 * 30 mm to the end of the housing, then 10 and 15 mm more.
 */
const ROTARY_PULLEY_MM = 40;
const ROTARY_FLYWHEEL_MM = 45;

/**
 * One harmonic of a quantity sampled evenly over a crank turn: the c in c e^(i order theta). A positive order turns
 * with the crank, a negative one against it.
 */
export const harmonic = (samples: Complex[], order: number): Complex => {
  let re = 0;
  let im = 0;
  samples.forEach((s, i) => {
    const a = (-2 * Math.PI * order * i) / samples.length;
    const c = Math.cos(a);
    const d = Math.sin(a);
    re += s.re * c - s.im * d;
    im += s.re * d + s.im * c;
  });
  return { re: re / samples.length, im: im / samples.length };
};

const size = (c: Complex): number => Math.hypot(c.re, c.im);

interface ShaftWeights {
  shaft: BalanceShaft;
  /** Complex amplitudes of the front and rear weights. */
  front: Complex;
  rear: Complex;
}

export class BalanceForces {
  readonly engine: Engine;
  readonly masses: BalanceMasses;
  readonly arrows: ForceArrow[] = [];
  readonly shafts: BalanceShaft[] = [];
  /** First-order force of one piston (m r), or the force of one rotor (m e), per unit omega^2. */
  readonly primary: number;
  /** Peak second-order force of one piston per unit omega^2. Zero on a rotary. */
  readonly secondary: number;
  /**
   * Largest inertia force of one piston over a turn, per unit omega^2: m r (1 + lambda) at top dead centre. Not
   * primary + secondary, since the second order peaks near 90 degrees. On a rotary, the force of one rotor.
   */
  readonly pistonPeak: number;
  /** Lever couples are measured on, as kinematics.balance() does: one cylinder spacing, m. */
  readonly lever: number;
  private readonly weights: ShaftWeights[] = [];
  /** Arrows of a rotary, split once so that placing them every frame does not search. */
  private readonly rotors: ForceArrow[] = [];
  private readonly rotaryWeights: ForceArrow[] = [];
  private readonly peakCache = new Map<string, { force: number; couple: number }>();
  private residualCache: OrderResidual | null = null;
  private theta = Number.NaN;

  constructor(engine: Engine, masses: BalanceMasses) {
    this.engine = engine;
    this.masses = masses;
    this.lever = (engine.spec.bore * 1.18) / 1000;
    const r = engine.r / 1000;
    if (engine.isRotary) {
      this.primary = masses.rotorKg * r;
      this.secondary = 0;
      this.pistonPeak = this.primary;
      this.buildRotary();
    } else {
      this.primary = masses.reciprocatingKg * r;
      this.buildPiston();
      let second = 0;
      let whole = 0;
      const one = this.engine.cylinders[0]!;
      for (let i = 0; i < STEPS; i++) {
        second = Math.max(second, Math.abs(this.secondAccel(one, i)));
        whole = Math.max(whole, Math.abs(pistonAcceleration(engine, one, i)));
      }
      this.secondary = masses.reciprocatingKg * (second / 1000);
      this.pistonPeak = masses.reciprocatingKg * (whole / 1000);
      this.buildShafts();
    }
    this.at(0);
  }

  private arrow(kind: ForceKind, order: 1 | 2, z: number): ForceArrow {
    const a: ForceArrow = { kind, order, x: 0, y: 0, z, fx: 0, fy: 0 };
    this.arrows.push(a);
    return a;
  }

  private buildPiston(): void {
    const e = this.engine;
    for (const c of e.cylinders) {
      this.arrow('piston', 1, c.z);
      this.arrow('piston', 2, c.z);
      // The big end of this cylinder's rod and its share of the pin.
      this.arrow('rotating', 1, c.z);
    }
    // A counterweight on the web either side of each pin, where the 3D crank has them.
    const web = e.rodWidth * 0.29;
    for (const t of e.throws) {
      for (const side of [1, -1]) this.arrow('counterweight', 1, t.z + side * (t.length / 2 + web));
    }
  }

  private buildRotary(): void {
    const e = this.engine;
    for (const bank of e.banks) {
      const c = e.cylinders.find((x) => x.n === bank.cylinders[0])!;
      this.rotors.push(this.arrow('rotor', 1, c.z));
    }
    // Counterweights sit at both ends of the eccentric shaft: on the front pulley and in the flywheel, where
    // RotaryEngineModel draws them. Their span sets how large each must be to cancel the rotors' couple.
    this.rotaryWeights.push(this.arrow('counterweight', 1, e.zMax + ROTARY_PULLEY_MM), this.arrow('counterweight', 1, e.zMin - ROTARY_FLYWHEEL_MM));
  }

  /** Piston acceleration minus its first order, mm per unit omega^2. */
  private secondAccel(c: Engine['cylinders'][number], theta: number): number {
    const gamma = (theta + c.pin - c.alpha) * DEG;
    return pistonAcceleration(this.engine, c, theta) + this.engine.r * Math.cos(gamma);
  }

  /** What a balance shaft must cancel: one harmonic of the pistons' own forces and couples. */
  private pistonHarmonic(order: 1 | 2, harmonicOrder: number): { force: Complex; couple: Complex } {
    const force: Complex[] = [];
    const couple: Complex[] = [];
    const m = this.masses.reciprocatingKg / 1000;
    for (let i = 0; i < STEPS; i++) {
      const f = { re: 0, im: 0 };
      const z = { re: 0, im: 0 };
      for (const c of this.engine.cylinders) {
        const gamma = (i + c.pin - c.alpha) * DEG;
        const along = order === 1 ? m * this.engine.r * Math.cos(gamma) : -m * this.secondAccel(c, i);
        const re = along * Math.cos(c.alpha * DEG);
        const im = along * Math.sin(c.alpha * DEG);
        f.re += re;
        f.im += im;
        z.re += c.z * re;
        z.im += c.z * im;
      }
      force.push(f);
      couple.push(z);
    }
    return { force: harmonic(force, harmonicOrder), couple: harmonic(couple, harmonicOrder) };
  }

  private buildShafts(): void {
    const { shafts } = this.masses;
    if (shafts === 0) return;
    const e = this.engine;
    const b = e.spec.bore;
    const cw = e.spec.tuning?.counterweightMm ?? e.r + b * 0.3;
    const span = Math.max(e.zMax - e.zMin, 1);
    const left = (...parts: Array<{ force: Complex; couple: Complex }>): boolean =>
      parts.reduce((sum, p) => sum + size(p.force) + size(p.couple) / span, 0) > this.primary * 1e-3;
    // The designer's "one shaft" takes out the first order, "two shafts" both orders, which may take three shafts.
    // A shaft is drawn only where its order is left: one resting with nothing to cancel would explain nothing.
    const reverse1 = this.pistonHarmonic(1, -1);
    const forward2 = this.pistonHarmonic(2, 2);
    const reverse2 = this.pistonHarmonic(2, -2);
    const wantFirst = left(reverse1);
    const below = cw + b * 0.32;
    if (wantFirst) this.addShaft(1, -1, 0, -below, reverse1);
    if (shafts === 2 && left(forward2, reverse2)) {
      const y = wantFirst ? -(below + b * 0.42) : -below;
      this.addShaft(2, 1, -b * 0.42, y, forward2);
      this.addShaft(2, -1, b * 0.42, y, reverse2);
    }
  }

  /** A shaft with a weight at each end of the cylinder row, sized to cancel both the force and the couple. */
  private addShaft(order: 1 | 2, sense: 1 | -1, x: number, y: number, target: { force: Complex; couple: Complex }): void {
    const zs = this.engine.cylinders.map((c) => c.z);
    const zFront = Math.max(...zs);
    const zRear = Math.min(...zs);
    const shaft: BalanceShaft = { order, sense, x, y, weights: [] };
    const F = target.force;
    const M = target.couple;
    let front: Complex;
    let rear: Complex;
    if (zFront - zRear < 1) {
      // One cylinder: a single weight in line with it carries everything.
      front = { re: -F.re, im: -F.im };
      rear = { re: 0, im: 0 };
    } else {
      // front + rear = -F and zFront front + zRear rear = -M.
      const span = zFront - zRear;
      front = { re: (zRear * F.re - M.re) / span, im: (zRear * F.im - M.im) / span };
      rear = { re: -F.re - front.re, im: -F.im - front.im };
    }
    shaft.weights.push(this.arrow('shaft', order, zFront));
    if (zFront - zRear >= 1) shaft.weights.push(this.arrow('shaft', order, zRear));
    this.shafts.push(shaft);
    this.weights.push({ shaft, front, rear });
  }

  /** Crank angle the arrows were last put at, degrees. */
  get angle(): number {
    return this.theta;
  }

  /** Puts every arrow at crank angle theta, degrees. */
  at(theta: number): this {
    if (theta === this.theta) return this;
    this.theta = theta;
    if (this.engine.isRotary) this.placeRotary(theta);
    else this.placePiston(theta);
    return this;
  }

  private placePiston(theta: number): void {
    const e = this.engine;
    const m = this.masses;
    const r = e.r;
    const cw = (e.spec.tuning?.counterweightMm ?? r + e.spec.bore * 0.3) * 0.62;
    const turning = (m.rotatingKg * r) / 1000;
    let k = 0;
    for (const c of e.cylinders) {
      const gamma = (theta + c.pin - c.alpha) * DEG;
      const ux = Math.sin(c.alpha * DEG);
      const uy = Math.cos(c.alpha * DEG);
      const d = pistonPin(e, c, theta);
      const first = (m.reciprocatingKg * r * Math.cos(gamma)) / 1000;
      const second = (-m.reciprocatingKg * this.secondAccel(c, theta)) / 1000;
      for (const along of [first, second]) {
        const a = this.arrows[k++]!;
        a.x = d * ux;
        a.y = d * uy;
        a.fx = along * ux;
        a.fy = along * uy;
      }
      const px = Math.sin((theta + c.pin) * DEG);
      const py = Math.cos((theta + c.pin) * DEG);
      const pin = this.arrows[k++]!;
      pin.x = r * px;
      pin.y = r * py;
      pin.fx = turning * px;
      pin.fy = turning * py;
    }
    for (const t of e.throws) {
      const px = Math.sin((theta + t.angle) * DEG);
      const py = Math.cos((theta + t.angle) * DEG);
      // Each of the two webs takes half of what turns on its pin.
      const counter = (t.cylinders.length * (m.rotatingKg + m.reciprocatingKg * BALANCE_FACTOR) * r) / 2000;
      for (let side = 0; side < 2; side++) {
        const weight = this.arrows[k++]!;
        weight.x = -cw * px;
        weight.y = -cw * py;
        weight.fx = -counter * px;
        weight.fy = -counter * py;
      }
    }
    const ecc = e.spec.bore * 0.1;
    for (const { shaft, front, rear } of this.weights) {
      const a = shaft.sense * shaft.order * theta * DEG;
      const c = Math.cos(a);
      const s = Math.sin(a);
      for (let i = 0; i < shaft.weights.length; i++) {
        const amp = i === 0 ? front : rear;
        const w = shaft.weights[i]!;
        w.fy = amp.re * c - amp.im * s;
        w.fx = amp.re * s + amp.im * c;
        const len = Math.hypot(w.fx, w.fy);
        // The weight sits on the side it pulls towards. A weight with nothing to do rests at the bottom.
        w.x = shaft.x + (len > 0 ? (w.fx / len) * ecc : 0);
        w.y = shaft.y + (len > 0 ? (w.fy / len) * ecc : -ecc);
      }
    }
  }

  private placeRotary(theta: number): void {
    const e = this.engine;
    const m = this.masses;
    const rotors = this.rotors;
    let fx = 0;
    let fy = 0;
    let zx = 0;
    let zy = 0;
    e.banks.forEach((bank, i) => {
      const c = e.cylinders.find((x) => x.n === bank.cylinders[0])!;
      // Same angle the rotary model gives the rotor centre.
      const a = (theta + c.pin + 90) * DEG;
      const px = Math.sin(a);
      const py = Math.cos(a);
      const arrow = rotors[i]!;
      const f = (m.rotorKg * e.r) / 1000;
      arrow.x = e.r * px;
      arrow.y = e.r * py;
      arrow.fx = f * px;
      arrow.fy = f * py;
      fx += arrow.fx;
      fy += arrow.fy;
      zx += arrow.z * arrow.fx;
      zy += arrow.z * arrow.fy;
    });
    const [front, rear] = this.rotaryWeights as [ForceArrow, ForceArrow];
    const span = front.z - rear.z;
    front.fx = (rear.z * fx - zx) / span;
    front.fy = (rear.z * fy - zy) / span;
    rear.fx = -fx - front.fx;
    rear.fy = -fy - front.fy;
    const radius = e.spec.bore * 0.45;
    for (const w of this.rotaryWeights) {
      const len = Math.hypot(w.fx, w.fy);
      w.x = len > 0 ? (w.fx / len) * radius : 0;
      w.y = len > 0 ? (w.fy / len) * radius : 0;
    }
  }

  /** Sum of the shown arrows at the current angle, written into out when given. */
  sum(layers: ForceLayers, out: ForceSum = { fx: 0, fy: 0, mx: 0, my: 0 }): ForceSum {
    out.fx = 0;
    out.fy = 0;
    out.mx = 0;
    out.my = 0;
    for (const a of this.arrows) {
      if (!isShown(a, layers)) continue;
      out.fx += a.fx;
      out.fy += a.fy;
      // M = r x F with F in the XY plane: the Z lever gives the rocking couple.
      out.mx -= (a.z / 1000) * a.fy;
      out.my += (a.z / 1000) * a.fx;
    }
    return out;
  }

  /** Sums over one crank turn, one per degree. Leaves the arrows where they were. */
  private turn(layers: ForceLayers): ForceSum[] {
    const keep = this.theta;
    const out: ForceSum[] = [];
    for (let i = 0; i < STEPS; i++) out.push(this.at(i).sum(layers));
    this.at(Number.isNaN(keep) ? 0 : keep);
    return out;
  }

  /** Largest net force and rocking couple over a turn, per unit omega^2. */
  peaks(layers: ForceLayers): { force: number; couple: number } {
    const key = `${+layers.order1}${+layers.order2}${+layers.balancing}`;
    const cached = this.peakCache.get(key);
    if (cached) return cached;
    let force = 0;
    let couple = 0;
    for (const s of this.turn(layers)) {
      force = Math.max(force, Math.hypot(s.fx, s.fy));
      couple = Math.max(couple, Math.hypot(s.mx, s.my));
    }
    const peak = { force, couple };
    this.peakCache.set(key, peak);
    return peak;
  }

  /** What is left of the first and second orders with everything in place, per unit omega^2. */
  residual(): OrderResidual {
    if (this.residualCache) return this.residualCache;
    const sums = this.turn(ALL_LAYERS);
    const force = sums.map((s) => ({ re: s.fy, im: s.fx }));
    // The couple as a complex number in the same sense: pitch about X pairs with Fy, yaw about Y with Fx.
    const couple = sums.map((s) => ({ re: -s.mx, im: s.my }));
    const amp = (samples: Complex[], order: number): number => size(harmonic(samples, order)) + size(harmonic(samples, -order));
    this.residualCache = { force1: amp(force, 1), force2: amp(force, 2), couple1: amp(couple, 1), couple2: amp(couple, 2) };
    return this.residualCache;
  }

  /**
   * With the first and second orders cancelled, whether the 4th and higher orders of the pistons still show. They are
   * never cancelled and are small, but the net force arrow and the figures show them.
   */
  higherLeft(): boolean {
    const all = this.peaks(ALL_LAYERS);
    return all.force > this.primary * 0.005 || all.couple > this.primary * this.lever * 0.005;
  }

  /**
   * Orders that are still there with everything in place. Measured as kinematics.balance() does: against one piston's
   * first order, couples over the bore pitch too, and anything under 1% of that counts as cancelled.
   */
  left(): Array<keyof OrderResidual> {
    const r = this.residual();
    const share = { force1: r.force1, force2: r.force2, couple1: r.couple1 / this.lever, couple2: r.couple2 / this.lever };
    return (Object.keys(share) as Array<keyof OrderResidual>).filter((k) => share[k] > this.primary * 0.01);
  }
}

/** Newtons at a crank speed for a figure kept per unit omega^2. */
export const atRpm = (perOmega2: number, rpm: number): number => perOmega2 * ((rpm * Math.PI) / 30) ** 2;

/** Three significant figures: the masses behind every force are estimates. */
export const roughly = (v: number): number => {
  if (v === 0 || !Number.isFinite(v)) return 0;
  const step = 10 ** (Math.floor(Math.log10(Math.abs(v))) - 2);
  return Math.round(v / step) * step;
};

/**
 * Arrow length per unit of force, mm per kg m, shared by a set of engines shown together: the largest
 * piston (or rotor) among them gets an arrow as long as its bore (or rotor radius).
 */
export function arrowScale(engines: Engine[]): number {
  let best = 0;
  let size = 100;
  for (const e of engines) {
    const m = massesOf(e.spec);
    const mr = ((e.isRotary ? m.rotorKg : m.reciprocatingKg) * e.r) / 1000;
    if (mr > best) {
      best = mr;
      size = e.spec.bore;
    }
  }
  return best > 0 ? size / best : 1;
}
