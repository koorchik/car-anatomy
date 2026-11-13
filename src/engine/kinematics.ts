// Pure geometry and timing. No rendering, no audio, safe to run anywhere.
//
// Conventions
//   Crank axis is Z, front of the engine is +Z, X is to the right seen from the front, Y is up.
//   The crank turns clockwise seen from the front. Angles are degrees, measured clockwise from +Y.
//   Crank pin of cylinder i sits at theta + pin_i. Piston i is at TDC when theta + pin_i = alpha_i.
//   phi_i = theta - fire_i is the cylinder's own cycle position: phi = 0 is TDC at ignition.

import type { EngineSpec, LayoutDef, ValveTiming } from './spec.ts';

export const DEG = Math.PI / 180;

export const mod = (a: number, m: number): number => ((a % m) + m) % m;

export interface Cylinder {
  /** 1-based cylinder number (for rotary engines: chamber index). */
  n: number;
  /** Index into Engine.banks. */
  bank: number;
  /** Cylinder axis angle from vertical, degrees. */
  alpha: number;
  /** Position along the crank axis, mm. */
  z: number;
  /** Crank angle of this cylinder's firing TDC, 0..cycle. */
  fire: number;
  /** Crank pin angle, 0..360. */
  pin: number;
  /** Position in the firing order, 0-based. */
  orderIndex: number;
}

export interface Bank {
  /** Centre angle of the head on this bank. */
  alpha: number;
  cylinders: number[];
}

export interface Throw {
  /** Pin angle, degrees. */
  angle: number;
  /** Centre along Z, mm. */
  z: number;
  /** Axial length of the pin, mm. */
  length: number;
  cylinders: number[];
}

export interface Engine {
  spec: EngineSpec;
  /** Crank degrees per complete cycle of one chamber. */
  cycle: number;
  cylinders: Cylinder[];
  banks: Bank[];
  throws: Throw[];
  /** Crank radius, mm. */
  r: number;
  /** Rod length, mm. */
  l: number;
  /** Distance from crank centre to the deck along a cylinder axis, mm. */
  deck: number;
  /** Rod big-end width, mm. */
  rodWidth: number;
  zMin: number;
  zMax: number;
  displacementCc: number;
  /** Smallest and largest gap between successive firings. */
  intervals: number[];
  isRotary: boolean;
  timing: ValveTiming;
}

interface Slot {
  n: number;
  bank: number;
  alpha: number;
  z: number;
}

const bankOf = (numbering: 'alternating' | 'sequential', n: number, count: number): 0 | 1 => {
  if (numbering === 'alternating') return n % 2 === 1 ? 0 : 1;
  return n <= count / 2 ? 0 : 1;
};

const rowOf = (numbering: 'alternating' | 'sequential', n: number, count: number): number => {
  if (numbering === 'alternating') return Math.floor((n - 1) / 2);
  return n <= count / 2 ? n - 1 : n - 1 - count / 2;
};

function placeCylinders(layout: LayoutDef, count: number, bore: number): { slots: Slot[]; banks: Bank[] } {
  const pitch = bore * 1.18;
  const stagger = bore * 0.15; // half a rod width between neighbours on one crank pin
  const slots: Slot[] = [];
  switch (layout.kind) {
    case 'inline': {
      for (let n = 1; n <= count; n++) {
        slots.push({ n, bank: 0, alpha: layout.tilt ?? 0, z: ((count + 1) / 2 - n) * pitch });
      }
      return { slots, banks: [{ alpha: layout.tilt ?? 0, cylinders: slots.map((s) => s.n) }] };
    }
    case 'vee': {
      const rows = Math.ceil(count / 2);
      for (let n = 1; n <= count; n++) {
        const bank = bankOf(layout.numbering, n, count);
        const row = rowOf(layout.numbering, n, count);
        slots.push({
          n,
          bank,
          alpha: bank === 0 ? layout.bankA : layout.bankB,
          z: ((rows - 1) / 2 - row) * pitch + (bank === 0 ? stagger : -stagger),
        });
      }
      return {
        slots,
        banks: [
          { alpha: layout.bankA, cylinders: slots.filter((s) => s.bank === 0).map((s) => s.n) },
          { alpha: layout.bankB, cylinders: slots.filter((s) => s.bank === 1).map((s) => s.n) },
        ],
      };
    }
    case 'boxer': {
      // A boxer has one crank throw per cylinder, so opposite cylinders sit half a pitch apart.
      const half = pitch * 0.56;
      for (let n = 1; n <= count; n++) {
        const bank = bankOf(layout.numbering, n, count);
        const row = rowOf(layout.numbering, n, count);
        const index = row * 2 + bank;
        slots.push({ n, bank, alpha: bank === 0 ? 90 : -90, z: ((count - 1) / 2 - index) * half });
      }
      return {
        slots,
        banks: [
          { alpha: 90, cylinders: slots.filter((s) => s.bank === 0).map((s) => s.n) },
          { alpha: -90, cylinders: slots.filter((s) => s.bank === 1).map((s) => s.n) },
        ],
      };
    }
    case 'vr': {
      // Zig-zag: odd cylinders lean one way, even cylinders the other, sharing one head.
      const step = pitch * 0.56;
      for (let n = 1; n <= count; n++) {
        const odd = n % 2 === 1;
        slots.push({ n, bank: 0, alpha: odd ? layout.narrow / 2 : -layout.narrow / 2, z: ((count + 1) / 2 - n) * step });
      }
      return { slots, banks: [{ alpha: 0, cylinders: slots.map((s) => s.n) }] };
    }
    case 'w': {
      // Bank A carries the first half of the numbers, bank B the second, each one a VR.
      const perBank = count / 2;
      const step = pitch * 0.56;
      for (let n = 1; n <= count; n++) {
        const bank = n <= perBank ? 0 : 1;
        const index = bank === 0 ? n - 1 : n - 1 - perBank;
        const centre = bank === 0 ? -layout.between / 2 : layout.between / 2;
        const lean = index % 2 === 0 ? -layout.narrow / 2 : layout.narrow / 2;
        slots.push({
          n,
          bank,
          alpha: centre + lean,
          z: ((perBank - 1) / 2 - index) * step + (bank === 0 ? stagger * 0.7 : -stagger * 0.7),
        });
      }
      return {
        slots,
        banks: [
          { alpha: -layout.between / 2, cylinders: slots.filter((s) => s.bank === 0).map((s) => s.n) },
          { alpha: layout.between / 2, cylinders: slots.filter((s) => s.bank === 1).map((s) => s.n) },
        ],
      };
    }
    case 'wankel':
      throw new Error('Wankel engines are built by buildRotary');
  }
}

/** Firing angle per cylinder, from the firing order and the gaps between firings. */
export function firingAngles(order: number[], intervals: number[]): Map<number, number> {
  const out = new Map<number, number>();
  let angle = 0;
  order.forEach((n, i) => {
    out.set(n, angle);
    angle += intervals[i]!;
  });
  return out;
}

function buildThrows(cylinders: Cylinder[], rodWidth: number): Throw[] {
  // Rods next to each other along Z whose pins coincide share one crank pin.
  const sorted = [...cylinders].sort((a, b) => b.z - a.z);
  const throws: Throw[] = [];
  for (const c of sorted) {
    const last = throws[throws.length - 1];
    const close = last && Math.abs(last.z - c.z) < rodWidth * 1.6 && last.cylinders.length < 2;
    if (last && close && Math.abs(mod(last.angle - c.pin + 180, 360) - 180) < 0.5) {
      last.z = (last.z + c.z) / 2;
      last.length = Math.abs(last.z - c.z) * 2 + rodWidth;
      last.cylinders.push(c.n);
    } else {
      throws.push({ angle: c.pin, z: c.z, length: rodWidth, cylinders: [c.n] });
    }
  }
  return throws;
}

function buildRotary(spec: EngineSpec, layout: Extract<LayoutDef, { kind: 'wankel' }>): Engine {
  // Each rotor face is a chamber with a cycle of three shaft revolutions.
  const cycle = 1080;
  const cylinders: Cylinder[] = [];
  const pitch = layout.width + 22;
  const orderIndexOf = new Map(spec.firingOrder.map((rotor, i) => [rotor, i]));
  const rotorGap = 360 / layout.rotors;
  for (let rotor = 0; rotor < layout.rotors; rotor++) {
    const order = orderIndexOf.get(rotor + 1) ?? rotor;
    const base = order * rotorGap;
    for (let face = 0; face < 3; face++) {
      cylinders.push({
        n: rotor * 3 + face + 1,
        bank: rotor,
        alpha: 0,
        z: ((layout.rotors - 1) / 2 - rotor) * pitch,
        fire: mod(base + face * 360, cycle),
        pin: mod(-base, 360),
        orderIndex: order,
      });
    }
  }
  const faces = spec.firingOrder.length * 3;
  const fires = cylinders.map((c) => c.fire).sort((a, b) => a - b);
  const intervals = fires.map((f, i) => mod((fires[(i + 1) % faces] ?? 0) - f, cycle));
  const halfLen = ((layout.rotors - 1) / 2) * pitch + layout.width / 2;
  return {
    spec,
    cycle,
    cylinders,
    banks: Array.from({ length: layout.rotors }, (_, rotor) => ({
      alpha: 0,
      cylinders: cylinders.filter((c) => c.bank === rotor).map((c) => c.n),
    })),
    throws: [],
    r: layout.e,
    l: 0,
    deck: layout.R + layout.e + 20,
    rodWidth: layout.width,
    zMin: -halfLen,
    zMax: halfLen,
    // Swept volume of one chamber of a Wankel: 3 sqrt(3) R e b.
    displacementCc: (spec.cylinders * 3 * Math.sqrt(3) * layout.R * layout.e * layout.width) / 1000,
    intervals,
    isRotary: true,
    timing: DEFAULT_TIMING,
  };
}

export function buildEngine(spec: EngineSpec): Engine {
  if (spec.layout.kind === 'wankel') return buildRotary(spec, spec.layout);
  const count = spec.firingOrder.length;
  const cycle = 720;
  const intervals = spec.firingIntervals ?? spec.firingOrder.map(() => cycle / count);
  const angles = firingAngles(spec.firingOrder, intervals);
  const { slots, banks } = placeCylinders(spec.layout, count, spec.bore);
  const r = spec.stroke / 2;
  const l = spec.stroke * spec.rodRatio;
  const rodWidth = spec.bore * 0.28;
  const cylinders: Cylinder[] = slots.map((s) => {
    const fire = angles.get(s.n);
    if (fire === undefined) throw new Error(`${spec.id}: cylinder ${s.n} is missing from the firing order`);
    return {
      ...s,
      fire,
      pin: mod(s.alpha - fire, 360),
      orderIndex: spec.firingOrder.indexOf(s.n),
    };
  });
  const zs = cylinders.map((c) => c.z);
  const zMargin = spec.bore / 2 + spec.bore * 0.14;
  return {
    spec,
    cycle,
    cylinders,
    banks,
    throws: buildThrows(cylinders, rodWidth),
    r,
    l,
    // Crown height plus the room the compression ratio leaves above the piston.
    deck: l + r + spec.stroke * 0.42 + Math.max(2, (spec.stroke / Math.max(spec.compression - 1, 1)) * 0.55),
    rodWidth,
    zMin: Math.min(...zs) - zMargin,
    zMax: Math.max(...zs) + zMargin,
    displacementCc: (((Math.PI / 4) * spec.bore * spec.bore * spec.stroke) / 1000) * count,
    intervals,
    isRotary: false,
    timing: spec.timing ?? DEFAULT_TIMING,
  };
}

/** Distance from the crank centre to the wrist pin along the cylinder axis. */
export function pistonPin(engine: Engine, cyl: Cylinder, theta: number): number {
  const gamma = (theta + cyl.pin - cyl.alpha) * DEG;
  const { r, l } = engine;
  const s = r * Math.sin(gamma);
  return r * Math.cos(gamma) + Math.sqrt(l * l - s * s);
}

/** Axial acceleration of the piston per unit omega^2, in the cylinder's own frame. */
export function pistonAcceleration(engine: Engine, cyl: Cylinder, theta: number): number {
  const gamma = (theta + cyl.pin - cyl.alpha) * DEG;
  const { r, l } = engine;
  const lam = r / l;
  const s = Math.sin(gamma);
  const c = Math.cos(gamma);
  const k = Math.sqrt(1 - lam * lam * s * s);
  // Exact second derivative of r cos g + l sqrt(1 - lam^2 sin^2 g) with respect to g.
  return -r * c - (r * lam * (c * c - s * s)) / k - (r * lam * lam * lam * s * s * c * c) / (k * k * k);
}

export type Stroke = 'power' | 'exhaust' | 'intake' | 'compression';

/** Cycle position of a chamber at crank angle theta, 0..1. 0 = ignition. */
export function cyclePhase(engine: Engine, cyl: Cylinder, theta: number): number {
  return mod(theta - cyl.fire, engine.cycle) / engine.cycle;
}

export function strokeAt(phase: number): Stroke {
  if (phase < 0.25) return 'power';
  if (phase < 0.5) return 'exhaust';
  if (phase < 0.75) return 'intake';
  return 'compression';
}

export const liftWindow = (phi: number, open: number, close: number): number => {
  const span = close - open;
  const x = mod(phi - open, 720) / span;
  if (x <= 0 || x >= 1) return 0;
  const s = Math.sin(Math.PI * x);
  return s * s;
};

// Valve events in crank degrees after firing TDC, typical of a road engine.
export const EXHAUST_OPEN = 130;
export const EXHAUST_CLOSE = 372;
export const INTAKE_OPEN = 348;
export const INTAKE_CLOSE = 590;
export const EXHAUST_PEAK = (EXHAUST_OPEN + EXHAUST_CLOSE) / 2;
export const INTAKE_PEAK = (INTAKE_OPEN + INTAKE_CLOSE) / 2;

export const DEFAULT_TIMING: ValveTiming = {
  exhaustOpen: EXHAUST_OPEN,
  exhaustClose: EXHAUST_CLOSE,
  intakeOpen: INTAKE_OPEN,
  intakeClose: INTAKE_CLOSE,
};

export const exhaustLift = (phi: number, t: ValveTiming = DEFAULT_TIMING): number => liftWindow(phi, t.exhaustOpen, t.exhaustClose);
export const intakeLift = (phi: number, t: ValveTiming = DEFAULT_TIMING): number => liftWindow(phi, t.intakeOpen, t.intakeClose);

/** Gaps between firings seen by one collector group, crank degrees. */
export function groupIntervals(engine: Engine, group: number[]): number[] {
  const fires = group
    .map((n) => engine.cylinders.find((c) => c.n === n)!.fire)
    .sort((a, b) => a - b);
  return fires.map((f, i) => mod((fires[(i + 1) % fires.length] ?? 0) - f + (fires.length === 1 ? engine.cycle : 0), engine.cycle) || engine.cycle);
}

export interface BalanceReport {
  /** Residual forces and couples, normalised to one cylinder's first-order force.
   *  Couples are further divided by the bore pitch so engines of different size compare. */
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

/**
 * One harmonic of a quantity sampled evenly over a crank turn: the c in c e^(i order theta). A positive order turns
 * with the crank, a negative one against it. The one copy: balance-forces.ts and balance-phasors.ts take it from here.
 */
export const harmonic = (samples: Complex[], order: number): Complex => {
  let re = 0;
  let im = 0;
  const n = samples.length;
  samples.forEach((s, i) => {
    const a = (-2 * Math.PI * order * i) / n;
    const c = Math.cos(a);
    const d = Math.sin(a);
    re += s.re * c - s.im * d;
    im += s.re * d + s.im * c;
  });
  return { re: re / n, im: im / n };
};

const abs = (c: Complex): number => Math.hypot(c.re, c.im);

/** Inertial force and couple from the reciprocating pistons at crank angle theta, as complex plane vectors. */
function inertia(engine: Engine, theta: number): { force: Complex; couple: Complex } {
  const force = { re: 0, im: 0 };
  const couple = { re: 0, im: 0 };
  for (const cyl of engine.cylinders) {
    const a = pistonAcceleration(engine, cyl, theta);
    const al = cyl.alpha * DEG;
    // w = Fy + i Fx turns with +theta for anything rotating with the crank.
    const re = a * Math.cos(al);
    const im = a * Math.sin(al);
    force.re += re;
    force.im += im;
    couple.re += cyl.z * re;
    couple.im += cyl.z * im;
  }
  return { force, couple };
}

const STEPS = 360;

export interface VibrationTable {
  /** Per crank degree: residual x force, y force, pitch and yaw couple, normalised. */
  fx: Float32Array;
  fy: Float32Array;
  pitch: Float32Array;
  yaw: Float32Array;
}

/**
 * Removes what crank counterweights can cancel (the part of the first order turning with the crank),
 * which leaves the shake a real engine has to live with or fight with balance shafts.
 */
function residualSamples(engine: Engine): { force: Complex[]; couple: Complex[] } {
  const force: Complex[] = [];
  const couple: Complex[] = [];
  for (let i = 0; i < STEPS; i++) {
    const v = inertia(engine, i);
    force.push(v.force);
    couple.push(v.couple);
  }
  const strip = (samples: Complex[]): Complex[] => {
    const h = harmonic(samples, 1);
    return samples.map((s, i) => {
      const a = (2 * Math.PI * i) / STEPS;
      return { re: s.re - (h.re * Math.cos(a) - h.im * Math.sin(a)), im: s.im - (h.re * Math.sin(a) + h.im * Math.cos(a)) };
    });
  };
  return { force: strip(force), couple: strip(couple) };
}

export function balance(engine: Engine): BalanceReport {
  if (engine.isRotary) return { force1: 0, force2: 0, couple1: 0, couple2: 0 };
  const { force, couple } = residualSamples(engine);
  const pitch = engine.spec.bore * 1.18;
  const r = engine.r;
  const amp = (samples: Complex[], order: number): number => abs(harmonic(samples, order)) + abs(harmonic(samples, -order));
  return {
    force1: amp(force, 1) / r,
    force2: amp(force, 2) / r,
    couple1: amp(couple, 1) / (r * pitch),
    couple2: amp(couple, 2) / (r * pitch),
  };
}

export function vibrationTable(engine: Engine): VibrationTable {
  const table: VibrationTable = {
    fx: new Float32Array(STEPS),
    fy: new Float32Array(STEPS),
    pitch: new Float32Array(STEPS),
    yaw: new Float32Array(STEPS),
  };
  if (engine.isRotary) return table;
  const { force, couple } = residualSamples(engine);
  const pitch = engine.spec.bore * 1.18;
  for (let i = 0; i < STEPS; i++) {
    table.fy[i] = force[i]!.re / engine.r;
    table.fx[i] = force[i]!.im / engine.r;
    table.pitch[i] = couple[i]!.re / (engine.r * pitch);
    table.yaw[i] = couple[i]!.im / (engine.r * pitch);
  }
  return table;
}

/** Chamber volume per unit swept volume, at a chamber's cycle position. */
function chamberVolume(engine: Engine, cyl: Cylinder, phase: number): number {
  const cr = engine.spec.compression;
  const clearance = 1 / (cr - 1);
  if (engine.isRotary) {
    return clearance + (1 - Math.cos(phase * 2 * Math.PI * 2)) / 2;
  }
  const { r, l } = engine;
  const theta = cyl.fire + phase * engine.cycle;
  const top = l + r;
  return clearance + (top - pistonPin(engine, cyl, theta)) / (2 * r);
}

/** Simplified cylinder pressure over the cycle: polytropic compression and expansion, Wiebe-style heat release. */
function pressure(engine: Engine, cyl: Cylinder, phase: number, load: number): number {
  const cr = engine.spec.compression;
  const v = chamberVolume(engine, cyl, phase);
  const vMax = 1 + 1 / (cr - 1);
  const stroke = strokeAt(phase);
  const intakeP = 0.25 + 0.75 * load;
  if (stroke === 'intake') return intakeP;
  if (stroke === 'exhaust') return 1.05;
  const n = 1.32;
  const compressionP = intakeP * Math.pow(vMax / v, n);
  if (stroke === 'compression') return compressionP;
  const peakRatio = engine.spec.fuel === 'diesel' ? 2.0 : 3.6;
  const burn = 1 - Math.exp(-6.9 * Math.pow(Math.min(phase * engine.cycle, 60) / 60, 2.2));
  return compressionP * (1 + (peakRatio - 1) * burn);
}

/** Net shaft torque over one engine cycle, from p dV/dtheta summed over chambers. Normalised to mean = 1. */
export function torqueCurve(engine: Engine, samples = 360, load = 1): Float32Array {
  const out = new Float32Array(samples);
  const delta = 0.5 / engine.cycle;
  let mean = 0;
  for (let i = 0; i < samples; i++) {
    const theta = (i / samples) * engine.cycle;
    let torque = 0;
    for (const cyl of engine.cylinders) {
      const phase = cyclePhase(engine, cyl, theta);
      const dv = chamberVolume(engine, cyl, mod(phase + delta, 1)) - chamberVolume(engine, cyl, mod(phase - delta, 1));
      torque += pressure(engine, cyl, phase, load) * dv;
    }
    out[i] = torque;
    mean += torque / samples;
  }
  for (let i = 0; i < samples; i++) out[i]! /= mean || 1;
  return out;
}
