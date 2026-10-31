// Crank pins and firing. A cylinder's pin angle and firing turn fully define when it fires, so any table
// here is a mechanically valid engine. Presets only fill the table in.

import { buildEngine, DEG, mod } from '../engine/kinematics.ts';
import type { EngineSpec, LayoutDef } from '../engine/spec.ts';
import type { CrankPreset, CrankThrow, Design } from './design.ts';

/** Cylinder axis angles and rows, without any firing information. */
export function layoutDef(d: Design): LayoutDef {
  const side = d.veeMirror ? -1 : 1;
  switch (d.layout) {
    case 'inline':
      return { kind: 'inline', tilt: d.tilt };
    case 'vee':
      return { kind: 'vee', bankA: (-side * d.veeAngle) / 2, bankB: (side * d.veeAngle) / 2, numbering: d.numbering };
    case 'flatvee':
      return { kind: 'vee', bankA: -side * 90, bankB: side * 90, numbering: d.numbering };
    case 'boxer':
      return { kind: 'boxer', numbering: d.numbering };
    case 'vr':
      return { kind: 'vr', narrow: d.narrowAngle };
    case 'w':
      return { kind: 'w', between: d.wAngle, narrow: d.narrowAngle };
    case 'rotary':
      return { kind: 'wankel', rotors: d.cylinders, R: d.rotorR, e: d.rotorE, width: d.rotorWidth };
  }
}

/** Cylinder axis angle in degrees, for each 1-based cylinder number. */
export function axisAngle(d: Design, n: number): number {
  const firstBank = d.numbering === 'alternating' ? n % 2 === 1 : n <= d.cylinders / 2;
  const side = d.veeMirror ? -1 : 1;
  switch (d.layout) {
    case 'inline':
      return d.tilt;
    case 'vee':
      return firstBank ? (-side * d.veeAngle) / 2 : (side * d.veeAngle) / 2;
    case 'flatvee':
      return firstBank ? -side * 90 : side * 90;
    case 'boxer':
      return firstBank ? 90 : -90;
    case 'vr':
      return n % 2 === 1 ? d.narrowAngle / 2 : -d.narrowAngle / 2;
    case 'w': {
      const perBank = d.cylinders / 2;
      const bank = n <= perBank ? 0 : 1;
      const index = bank === 0 ? n - 1 : n - 1 - perBank;
      const centre = bank === 0 ? -d.wAngle / 2 : d.wAngle / 2;
      return centre + (index % 2 === 0 ? -d.narrowAngle / 2 : d.narrowAngle / 2);
    }
    case 'rotary':
      return 0;
  }
}

export interface FiringPlan {
  /** Cylinder numbers in the order they fire. */
  order: number[];
  /** Crank degrees to the next firing, same length as order. Sums to 720. */
  intervals: number[];
}

/** Firing order and gaps that follow from the crank table. Two cylinders may fire together: their gap is 0. */
export function firingFromCrank(d: Design, throws: CrankThrow[]): FiringPlan {
  const fires = throws.map((t, i) => {
    const n = i + 1;
    return { n, fire: mod(axisAngle(d, n) - t.pin, 360) + (t.turn ? 360 : 0) };
  });
  fires.sort((a, b) => a.fire - b.fire || a.n - b.n);
  const intervals = fires.map((f, i) => {
    const next = fires[i + 1];
    return next ? next.fire - f.fire : 720 - f.fire + fires[0]!.fire;
  });
  return { order: fires.map((f) => f.n), intervals };
}

/** The table that fires the given order at evenly spaced intervals. */
function evenThrows(d: Design, order: number[]): CrankThrow[] {
  const step = 720 / d.cylinders;
  const throws: CrankThrow[] = Array.from({ length: d.cylinders }, () => ({ pin: 0, turn: 0 }));
  order.forEach((n, i) => {
    const fire = i * step;
    throws[n - 1] = { pin: mod(axisAngle(d, n) - fire, 360), turn: fire >= 360 ? 1 : 0 };
  });
  return throws;
}

/** Small deterministic generator, so the same design always gets the same firing order. */
const seeded = (seed: number): (() => number) => {
  let s = seed | 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
};

const probeSpec = (d: Design, order: number[]): EngineSpec => {
  const step = 720 / d.cylinders;
  return {
    id: 'probe',
    family: 'inline',
    badge: '',
    cylinders: d.cylinders,
    title: '',
    example: '',
    fuel: 'petrol',
    aspiration: 'na',
    bore: d.bore,
    stroke: d.stroke,
    rodRatio: d.rodLength / d.stroke,
    compression: d.compression,
    layout: layoutDef(d),
    firingOrder: order,
    firingIntervals: order.map(() => step),
    valvetrain: 'dohc',
    valvesPerCyl: 4,
    idleRpm: 800,
    redlineRpm: 7000,
    revTimeS: 1,
    rough: 0,
    pops: 0,
    turboWhine: 0,
    turboHp: 0,
    blowoff: 0,
    exhaust: { groups: [order], headerM: 0.6, pipeM: 1.6, open: 0.5, rasp: 0 },
    coverColor: '#000',
    blockMaterial: 'iron',
    article: { lead: '', how: '', sound: '', pros: [], cons: [], cars: [] },
  };
};

/** Residual shake of an even-firing order, in closed form. Fast enough to call thousands of times. */
const orderCost = (d: Design, order: number[], zOf: number[], step: number, lambda: number): number => {
  const sum = { f1: [0, 0], f2p: [0, 0], f2m: [0, 0], m1: [0, 0], m2p: [0, 0], m2m: [0, 0] };
  order.forEach((n, i) => {
    const alpha = axisAngle(d, n) * DEG;
    const gamma = -(i * step) * DEG; // pin - alpha = -fire
    const z = zOf[n - 1]!;
    // Reverse first order is what counterweights can't reach; second order has both senses.
    const addTo = (bucket: number[], moment: number, angle: number): void => {
      bucket[0]! += moment * Math.cos(angle);
      bucket[1]! += moment * Math.sin(angle);
    };
    addTo(sum.f1, 1, alpha - gamma);
    addTo(sum.m1, z, alpha - gamma);
    addTo(sum.f2p, lambda, alpha + 2 * gamma);
    addTo(sum.f2m, lambda, alpha - 2 * gamma);
    addTo(sum.m2p, z * lambda, alpha + 2 * gamma);
    addTo(sum.m2m, z * lambda, alpha - 2 * gamma);
  });
  const size = (b: number[]): number => Math.hypot(b[0]!, b[1]!);
  let neighbours = 0;
  for (let i = 0; i < order.length; i++) {
    if (Math.abs(order[i]! - order[(i + 1) % order.length]!) === 1) neighbours += 0.02;
  }
  return size(sum.f1) * 3 + (size(sum.f2p) + size(sum.f2m)) * 2 + size(sum.m1) + (size(sum.m2p) + size(sum.m2m)) * 0.7 + neighbours;
};

const orderCache = new Map<string, number[]>();

/**
 * Finds a firing order for even firing with the least shake, by hill climbing from random starts.
 * Geometry barely changes the answer, so results are cached by layout and cylinder count.
 */
export function balancedOrder(d: Design): number[] {
  const n = d.cylinders;
  if (n <= 2) return Array.from({ length: n }, (_, i) => i + 1);
  const key = `${d.layout}/${n}/${Math.round(d.veeAngle / 5)}/${d.narrowAngle}/${d.wAngle}/${d.numbering}/${d.veeMirror}`;
  const cached = orderCache.get(key);
  if (cached) return cached;
  const random = seeded(n * 7919 + d.layout.length * 104729);
  const engine = buildEngine(probeSpec(d, Array.from({ length: n }, (_, i) => i + 1)));
  const pitch = d.bore * 1.18;
  const zOf = Array.from({ length: n }, (_, i) => engine.cylinders.find((c) => c.n === i + 1)!.z / pitch);
  const step = 720 / n;
  const lambdaRod = d.stroke / 2 / d.rodLength;
  const cost = (o: number[]): number => orderCost(d, o, zOf, step, lambdaRod);
  let best: number[] = [];
  let bestCost = Infinity;
  const restarts = 24;
  for (let r = 0; r < restarts; r++) {
    const order = Array.from({ length: n }, (_, i) => i + 1);
    for (let i = n - 1; i > 1; i--) {
      const j = 1 + Math.floor(random() * i);
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    let current = cost(order);
    let improved = true;
    let rounds = 0;
    while (improved && rounds < 12) {
      improved = false;
      rounds++;
      for (let i = 1; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          [order[i], order[j]] = [order[j]!, order[i]!];
          const next = cost(order);
          if (next + 1e-6 < current) {
            current = next;
            improved = true;
          } else {
            [order[i], order[j]] = [order[j]!, order[i]!];
          }
        }
      }
    }
    if (current < bestCost) {
      bestCost = current;
      best = [...order];
    }
  }
  orderCache.set(key, best);
  return best;
}

/** Pins in rows that mirror around the middle of the engine: 0, 180, 180, 0 and so on. */
const mirrored = (rows: number, values: number[]): number[] =>
  Array.from({ length: rows }, (_, i) => {
    const fromEnd = Math.min(i, rows - 1 - i);
    return values[fromEnd % values.length]!;
  });

const rowOf = (d: Design, n: number): number => {
  const count = d.cylinders;
  if (d.layout === 'inline' || d.layout === 'vr') return n - 1;
  if (d.layout === 'w' || d.numbering === 'sequential') return n <= count / 2 ? n - 1 : n - 1 - count / 2;
  return Math.floor((n - 1) / 2);
};

const rowCount = (d: Design): number => {
  if (d.layout === 'inline' || d.layout === 'vr') return d.cylinders;
  if (d.layout === 'w') return d.cylinders / 2;
  return Math.ceil(d.cylinders / 2);
};

/** Picks firing turns so a given set of pins fires as evenly as it can. */
function spreadTurns(d: Design, pins: number[]): CrankThrow[] {
  const items = pins.map((pin, i) => ({ i, tdc: mod(axisAngle(d, i + 1) - pin, 360) })).sort((a, b) => a.tdc - b.tdc);
  const throws: CrankThrow[] = pins.map((pin) => ({ pin, turn: 0 }));
  // Alternating turns along the sorted TDC list spaces the firings across both turns of the cycle.
  items.forEach((item, k) => {
    throws[item.i]!.turn = (k % 2) as 0 | 1;
  });
  return throws;
}

/** Fills the crank table for a preset. `custom` keeps what is there. */
export function crankForPreset(d: Design, preset: CrankPreset): CrankThrow[] {
  const n = d.cylinders;
  switch (preset) {
    case 'even':
      return evenThrows(d, balancedOrder(d));
    case 'flat': {
      const rows = rowCount(d);
      const pins = mirrored(rows, [0, 180]);
      return spreadTurns(d, Array.from({ length: n }, (_, i) => pins[rowOf(d, i + 1)]!));
    }
    case 'cross': {
      const rows = rowCount(d);
      const pins = Array.from({ length: rows }, (_, i) => {
        const sequence = [0, 90, 270, 180];
        return sequence[i % 4]!;
      });
      return spreadTurns(d, Array.from({ length: n }, (_, i) => pins[rowOf(d, i + 1)]!));
    }
    case 'bigbang': {
      // Two groups of near-simultaneous firings, one per crank turn, with long silences between.
      const halves = Math.ceil(n / 2);
      const clump = 720 / n / 3;
      const throws: CrankThrow[] = Array.from({ length: n }, () => ({ pin: 0, turn: 0 }));
      for (let k = 0; k < n; k++) {
        const nCyl = k + 1;
        const group = k < halves ? 0 : 1;
        const index = group === 0 ? k : k - halves;
        const fire = group * 360 + index * clump;
        throws[k] = { pin: mod(axisAngle(d, nCyl) - fire, 360), turn: group as 0 | 1 };
      }
      return throws;
    }
    case 'custom':
      return d.throws.length === n ? d.throws : evenThrows(d, balancedOrder(d));
  }
}

/** Radians, for drawing the crank end-on. */
export const pinVector = (pin: number): [number, number] => [Math.sin(pin * DEG), Math.cos(pin * DEG)];
