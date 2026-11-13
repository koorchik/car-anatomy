import { describe, expect, it } from 'vitest';
import { ENGINES, engineById, pageChoices } from '../src/data/engines.ts';
import { resolveDesign } from '../src/designer/constraints.ts';
import { DEFAULT_DESIGN, type Design } from '../src/designer/design.ts';
import { evaluate } from '../src/designer/physics.ts';
import { designToSpec } from '../src/designer/to-spec.ts';
import { BalanceForces, harmonic, massesOf, type Complex, type ForceSum } from '../src/engine/balance-forces.ts';
import {
  BalancePhasors,
  locusOf,
  netAt,
  polygon,
  sumAt,
  trace,
  vectorAt,
  type BalanceView,
  type PhasorView,
  type PolygonSide,
  type Quantity,
  type Vec2,
  type ViewOptions,
} from '../src/engine/balance-phasors.ts';
import { buildEngine, pistonAcceleration, vibrationTable, type Engine } from '../src/engine/kinematics.ts';

const forces = (id: string, shafts?: 0 | 1 | 2): BalanceForces => {
  const e = buildEngine(engineById(id)!);
  const masses = massesOf(e.spec);
  return new BalanceForces(e, shafts === undefined ? masses : { ...masses, shafts });
};
const phasors = (id: string, shafts?: 0 | 1 | 2): BalancePhasors => new BalancePhasors(forces(id, shafts));
const designed = (over: Partial<Design>): BalancePhasors => {
  const d = resolveDesign({ ...DEFAULT_DESIGN, ...over });
  const spec = designToSpec(d, evaluate(d));
  return new BalancePhasors(new BalanceForces(buildEngine(spec), massesOf(spec)));
};

const BARE: ViewOptions = { counterweights: false, shafts: false };
const WEIGHTS: ViewOptions = { counterweights: true, shafts: false };
const ALL: ViewOptions = { counterweights: true, shafts: true };
const OPTIONS = [BARE, WEIGHTS, ALL];
const VIEWS: BalanceView[] = ['order1', 'order2', 'rotating'];

const size = (c: Complex): number => Math.hypot(c.re, c.im);
const add = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im });
const apart = (a: Complex, b: Complex): number => Math.hypot(a.re - b.re, a.im - b.im);
/** Angle between two axes, degrees, ignoring which way they point. */
const axisGap = (a: number, b: number): number => {
  const d = (((a - b) % 180) + 180) % 180;
  return Math.min(d, 180 - d);
};

/** Second harmonic of one piston's exact acceleration, per unit of crank radius: lambda (1 + lambda^2 / 4 + ...). */
const secondHarmonic = (e: Engine): number => {
  const c = { ...e.cylinders[0]!, pin: e.cylinders[0]!.alpha };
  let sum = 0;
  for (let i = 0; i < 3600; i++) {
    const g = i / 10;
    sum += pistonAcceleration(e, c, g) * Math.cos((2 * g * Math.PI) / 180);
  }
  return -sum / 1800 / e.r;
};

/** Distance between neighbouring crank throws, m. */
const throwSpacing = (e: Engine): number => {
  const zs = e.throws.map((t) => t.z).sort((a, b) => b - a);
  return (zs[0]! - zs[1]!) / 1000;
};

/** What vibrationTable leaves, as forces on the engine (the table holds accelerations), one complex sample per degree. */
const tableSamples = (bf: BalanceForces): { force: Complex[]; couple: Complex[] } => {
  const e = bf.engine;
  const table = vibrationTable(e);
  const k = (bf.masses.reciprocatingKg * e.r) / 1000;
  const pitch = (e.spec.bore * 1.18) / 1000;
  const force: Complex[] = [];
  const couple: Complex[] = [];
  for (let i = 0; i < 360; i++) {
    force.push({ re: -k * table.fy[i]!, im: -k * table.fx[i]! });
    // The couple as BalanceForces.residual() writes it: the sum of z (Fy + i Fx).
    couple.push({ re: -k * pitch * table.pitch[i]!, im: -k * pitch * table.yaw[i]! });
  }
  return { force, couple };
};

const plusOf = (v: PhasorView, q: Quantity): Complex => v[q].plus;
const minusOf = (v: PhasorView, q: Quantity): Complex => v[q].minus;

const EVERY_ENGINE = ENGINES.flatMap((page) => pageChoices(page.id).map((c) => [c.id] as const));

describe('the views add up to what the kinematics leave', () => {
  it.each(EVERY_ENGINE)('%s', (id) => {
    const bf = forces(id);
    const ph = new BalancePhasors(bf);
    const want = tableSamples(bf);
    const residual = bf.residual();
    const unit = { force: bf.primary * 1e-5, couple: bf.primary * bf.lever * 1e-5 };
    // First order: the pistons with their share of the counterweights, and the turning masses with the rest.
    const first = [ph.view('order1', ALL), ph.view('rotating', ALL)];
    // Second order: the pistons and, where there are any, the shafts at twice crank speed.
    const second = ph.view('order2', ALL);
    for (const q of ['force', 'couple'] as const) {
      const plus1 = add(plusOf(first[0]!, q), plusOf(first[1]!, q));
      const minus1 = add(minusOf(first[0]!, q), minusOf(first[1]!, q));
      expect(apart(plus1, harmonic(want[q], 1)), `${q} +1`).toBeLessThan(unit[q]);
      expect(apart(minus1, harmonic(want[q], -1)), `${q} -1`).toBeLessThan(unit[q]);
      expect(apart(plusOf(second, q), harmonic(want[q], 2)), `${q} +2`).toBeLessThan(unit[q]);
      expect(apart(minusOf(second, q), harmonic(want[q], -2)), `${q} -2`).toBeLessThan(unit[q]);
      // The peaks the card and the article print.
      expect(Math.abs(size(plus1) + size(minus1) - residual[`${q}1`]), `${q}1`).toBeLessThan(unit[q]);
      expect(Math.abs(size(plusOf(second, q)) + size(minusOf(second, q)) - residual[`${q}2`]), `${q}2`).toBeLessThan(unit[q]);
    }
  });

  it('with balance shafts fitted, each shaft joins the view of its order and the views still add up', () => {
    for (const id of ['i1', 'i2', 'b2', 'v2', 'i3', 'i4', 'i5', 'v6-60', 'vr6', 'v8-flat', 'v10', 'w12']) {
      for (const shafts of [1, 2] as const) {
        const ph = phasors(id, shafts);
        const bf = ph.forces;
        const r = bf.residual();
        const first = [ph.view('order1', ALL), ph.view('rotating', ALL)];
        const second = ph.view('order2', ALL);
        const tol = { force: bf.primary * 1e-9, couple: bf.primary * bf.lever * 1e-9 };
        for (const q of ['force', 'couple'] as const) {
          const plus1 = add(plusOf(first[0]!, q), plusOf(first[1]!, q));
          const minus1 = add(minusOf(first[0]!, q), minusOf(first[1]!, q));
          expect(Math.abs(size(plus1) + size(minus1) - r[`${q}1`]), `${id} ${shafts} ${q}1`).toBeLessThan(tol[q]);
          expect(Math.abs(size(plusOf(second, q)) + size(minusOf(second, q)) - r[`${q}2`]), `${id} ${shafts} ${q}2`).toBeLessThan(tol[q]);
        }
        const drawn = (order: 1 | 2) => bf.shafts.filter((s) => s.order === order).reduce((n, s) => n + s.weights.length, 0);
        expect(ph.view('order1', ALL).elements.filter((el) => el.kind === 'shaft')).toHaveLength(drawn(1));
        expect(ph.view('order2', ALL).elements.filter((el) => el.kind === 'shaft')).toHaveLength(drawn(2));
        expect(ph.view('rotating', ALL).elements.some((el) => el.kind === 'shaft')).toBe(false);
        expect(ph.hasShafts('order1')).toBe(drawn(1) > 0);
        expect(ph.hasShafts('order2')).toBe(drawn(2) > 0);
      }
    }
  });

  it('a shaft against the crank takes what the counterweights cannot: the first-order couple of a split-pin 90° V6', () => {
    const ph = designed({ layout: 'vee', cylinders: 6, veeAngle: 90, balanceShafts: 1 });
    const left = ph.view('order1', WEIGHTS).couple.locus;
    // With the half turning with the crank cancelled, what is left turns against it.
    expect(left.shape).toBe('circle');
    expect(left.sense).toBe(-1);
    expect(ph.view('order1', ALL).couple.locus.shape).toBe('point');
  });
});

describe('each element is a share of its arrow', () => {
  it.each(EVERY_ENGINE)('%s', (id) => {
    const ph = phasors(id);
    const bf = ph.forces;
    const tol = bf.primary * 1e-9;
    const first = ph.views.filter((v) => v !== 'order2').map((v) => ph.view(v, ALL));
    for (const theta of [0, 37, 128.5, 300]) {
      bf.at(theta);
      // The first order is a pure harmonic, so every element is exactly what its arrow shows, times its share.
      for (const view of first) {
        for (const el of view.elements) {
          const a = bf.arrows[el.arrow]!;
          const v = vectorAt(el, 1, theta);
          expect(Math.abs(v.x - a.fx * el.share), `${view.view} ${el.kind} x`).toBeLessThan(tol);
          expect(Math.abs(v.y - a.fy * el.share), `${view.view} ${el.kind} y`).toBeLessThan(tol);
          expect(el.z).toBe(a.z);
        }
      }
      // Both first-order views together are the arrows BalanceForces shows for the first order.
      const want = bf.sum({ order1: true, order2: false, balancing: true });
      const got: ForceSum = { fx: 0, fy: 0, mx: 0, my: 0 };
      for (const view of first) {
        const s = sumAt(view, theta);
        got.fx += s.fx;
        got.fy += s.fy;
        got.mx += s.mx;
        got.my += s.my;
      }
      expect(Math.abs(got.fx - want.fx)).toBeLessThan(tol);
      expect(Math.abs(got.fy - want.fy)).toBeLessThan(tol);
      expect(Math.abs(got.mx - want.mx)).toBeLessThan(tol * bf.lever);
      expect(Math.abs(got.my - want.my)).toBeLessThan(tol * bf.lever);
    }
  });

  it('the two shares of every counterweight make the whole weight', () => {
    for (const id of ['i1', 'i4', 'v6-90', 'v8-cross', 'b6', 'w16', 'r2']) {
      const ph = phasors(id);
      const shares = new Map<number, number>();
      for (const view of ['order1', 'rotating'] as const) {
        for (const el of ph.view(view, ALL).elements) {
          if (el.kind === 'counterweight') shares.set(el.arrow, (shares.get(el.arrow) ?? 0) + el.share);
        }
      }
      const weights = ph.forces.arrows.filter((a) => a.kind === 'counterweight');
      expect(shares.size).toBe(weights.length);
      for (const share of shares.values()) expect(share).toBeCloseTo(1, 12);
    }
  });

  it('the turning masses take the rods, the pistons take half their own mass', () => {
    const ph = phasors('i4');
    const { rotatingKg, reciprocatingKg } = ph.forces.masses;
    expect(ph.turningShare).toBeCloseTo(rotatingKg / (rotatingKg + reciprocatingKg / 2), 12);
    expect(phasors('r2').turningShare).toBe(1);
  });

  it('elements name what they belong to', () => {
    const ph = phasors('v8-cross');
    const e = ph.forces.engine;
    const one = ph.view('order1', WEIGHTS).elements;
    expect(one.filter((el) => el.kind === 'piston').map((el) => el.cylinder)).toEqual(e.cylinders.map((c) => c.n));
    expect(one.filter((el) => el.kind === 'counterweight').map((el) => el.throw)).toEqual(e.throws.flatMap((_, i) => [i, i]));
    expect(ph.view('rotating', BARE).elements.map((el) => el.cylinder)).toEqual(e.cylinders.map((c) => c.n));
    expect(phasors('r4').view('rotating', BARE).elements.map((el) => [el.kind, el.cylinder])).toEqual([
      ['rotor', 1],
      ['rotor', 2],
      ['rotor', 3],
      ['rotor', 4],
    ]);
  });
});

describe('loci from the physics', () => {
  const tiny = 1e-9;

  it('inline four: the second order is a vertical line of four pistons', () => {
    const ph = phasors('i4');
    const a2 = secondHarmonic(ph.forces.engine);
    const v = ph.view('order2', BARE);
    expect(v.force.locus.shape).toBe('line');
    expect(axisGap(v.force.locus.axis, 0)).toBeLessThan(1e-6);
    expect(v.force.locus.major / ph.forces.primary).toBeCloseTo(4 * a2, 3);
    expect(v.couple.locus.shape).toBe('point');
  });

  it('flat-plane V8: the second order is a horizontal line √2 times larger', () => {
    const ph = phasors('v8-flat');
    const a2 = secondHarmonic(ph.forces.engine);
    const v = ph.view('order2', BARE);
    expect(v.force.locus.shape).toBe('line');
    expect(axisGap(v.force.locus.axis, 90)).toBeLessThan(1e-6);
    expect(v.force.locus.major / ph.forces.primary).toBeCloseTo(4 * Math.SQRT2 * a2, 3);
  });

  it('cross-plane V8: a first-order couple turns with the crank, and counterweights leave nothing; the same for the turning masses', () => {
    const ph = phasors('v8-cross');
    const bf = ph.forces;
    const a = throwSpacing(bf.engine);
    const pistons = ph.view('order1', BARE).couple.locus;
    expect(pistons.shape).toBe('circle');
    expect(pistons.sense).toBe(1);
    // A 90° pair on one pin: their first orders add up to one piston's force turning with the crank.
    expect(pistons.major / (bf.primary * a)).toBeCloseTo(Math.sqrt(10), 3);
    const rods = ph.view('rotating', BARE).couple.locus;
    expect(rods.shape).toBe('circle');
    expect(rods.sense).toBe(1);
    expect(rods.major / (((2 * bf.masses.rotatingKg * bf.engine.r) / 1000) * a)).toBeCloseTo(Math.sqrt(10), 3);
    for (const view of ['order1', 'rotating'] as const) {
      expect(ph.view(view, WEIGHTS).couple.locus.shape).toBe('point');
      expect(ph.view(view, WEIGHTS).couple.locus.major).toBeLessThan(bf.primary * bf.lever * tiny);
      for (const o of [BARE, WEIGHTS]) expect(ph.view(view, o).force.locus.shape).toBe('point');
    }
  });

  it('90° V6 with shared crankpins: no force, a second-order couple of √6 that rocks along one line', () => {
    const ph = phasors('v6-90');
    const a2 = secondHarmonic(ph.forces.engine);
    const v = ph.view('order2', BARE);
    expect(v.force.locus.shape).toBe('point');
    expect(v.couple.locus.major / (ph.forces.primary * throwSpacing(ph.forces.engine))).toBeCloseTo(Math.sqrt(6) * a2, 3);
    expect(v.couple.locus.shape).toBe('line');
  });

  it('flat four: no force, a second-order couple of 2·h that yaws along a line', () => {
    const ph = phasors('b4');
    const e = ph.forces.engine;
    const a2 = secondHarmonic(e);
    const c = (n: number) => e.cylinders.find((x) => x.n === n)!;
    const h = Math.abs(c(1).z - c(2).z) / 1000;
    const v = ph.view('order2', BARE);
    expect(v.force.locus.shape).toBe('point');
    expect(v.couple.locus.shape).toBe('line');
    expect(axisGap(v.couple.locus.axis, 90)).toBeLessThan(1e-6);
    expect(v.couple.locus.major / (ph.forces.primary * h)).toBeCloseTo(2 * a2, 3);
    for (const o of OPTIONS) expect(ph.view('order1', o).couple.locus.shape).toBe('point');
  });

  it('inline six: a point in every view, with and without counterweights', () => {
    const ph = phasors('i6');
    const bf = ph.forces;
    for (const view of VIEWS) {
      for (const o of OPTIONS) {
        const v = ph.view(view, o);
        expect(v.force.locus.shape, `${view} force`).toBe('point');
        expect(v.couple.locus.shape, `${view} couple`).toBe('point');
        expect(v.force.locus.major).toBeLessThan(bf.primary * tiny);
        expect(v.couple.locus.major).toBeLessThan(bf.primary * bf.lever * tiny);
      }
    }
  });

  it('single: a line of m·r along the cylinder; with counterweights a circle of m·r/2 against the crank', () => {
    const ph = phasors('i1');
    const bf = ph.forces;
    const bare = ph.view('order1', BARE).force.locus;
    expect(bare.shape).toBe('line');
    expect(axisGap(bare.axis, bf.engine.cylinders[0]!.alpha)).toBeLessThan(1e-6);
    expect(bare.major / bf.primary).toBeCloseTo(1, 9);
    expect(bare.minor / bf.primary).toBeLessThan(tiny);
    const weighted = ph.view('order1', WEIGHTS).force.locus;
    expect(weighted.shape).toBe('circle');
    expect(weighted.sense).toBe(-1);
    expect(weighted.major / bf.primary).toBeCloseTo(0.5, 9);
    expect(weighted.minor / bf.primary).toBeCloseTo(0.5, 9);
  });

  it('rotary: only turning masses, which the counterweights cancel; without them two rotors rock the engine', () => {
    const ph = phasors('r2');
    const bf = ph.forces;
    expect(ph.views).toEqual(['rotating']);
    expect(ph.view('order1', ALL).elements).toEqual([]);
    expect(ph.view('order2', ALL).elements).toEqual([]);
    const [front, rear] = bf.engine.banks.map((b) => bf.engine.cylinders.find((c) => c.n === b.cylinders[0])!.z);
    const bare = ph.view('rotating', BARE);
    expect(bare.force.locus.shape).toBe('point');
    expect(bare.couple.locus.shape).toBe('circle');
    expect(bare.couple.locus.sense).toBe(1);
    expect(bare.couple.locus.major / ((bf.primary * Math.abs(front! - rear!)) / 1000)).toBeCloseTo(1, 9);
    expect(ph.view('rotating', WEIGHTS).couple.locus.shape).toBe('point');
  });
});

describe('pistons alone on an inline engine', () => {
  const inline = EVERY_ENGINE.filter(([id]) => engineById(id)!.layout.kind === 'inline');

  it.each(inline)('%s: the halves turning with and against the crank are mirror images', (id) => {
    const ph = phasors(id);
    const bf = ph.forces;
    const tilt = bf.engine.cylinders[0]!.alpha;
    for (const view of ['order1', 'order2'] as const) {
      const v = ph.view(view, BARE);
      expect(Math.abs(size(v.force.plus) - size(v.force.minus))).toBeLessThan(bf.primary * 1e-9);
      expect(Math.abs(size(v.couple.plus) - size(v.couple.minus))).toBeLessThan(bf.primary * bf.lever * 1e-9);
      expect(axisGap(v.mirror!, tilt)).toBeLessThan(1e-6);
    }
  });

  it('counterweights, and cylinders on different axes, break the mirror', () => {
    expect(phasors('i4').view('order1', WEIGHTS).mirror).toBeNull();
    expect(phasors('v8-cross').view('order1', BARE).mirror).toBeNull();
    expect(phasors('vr6').view('order2', BARE).mirror).toBeNull();
  });
});

describe('polygons', () => {
  const SIDES: PolygonSide[] = ['plus', 'minus', 'net'];

  it('end at the sum for any crank angle', () => {
    for (const id of ['i1', 'v2', 'i3', 'i4', 'v6-90', 'vr6', 'v8-cross', 'v8-flat', 'b4', 'w12', 'r2']) {
      const ph = phasors(id, 2);
      const bf = ph.forces;
      for (const view of VIEWS) {
        for (const o of OPTIONS) {
          const v = ph.view(view, o);
          for (const theta of [0, 17.3, 90, 123.4, 271.9]) {
            for (const q of ['force', 'couple'] as const) {
              const tol = q === 'force' ? bf.primary * 1e-12 : bf.primary * bf.lever * 1e-12;
              for (const side of SIDES) {
                const points = polygon(v, theta, side, q);
                expect(points).toHaveLength(v.elements.length + 1);
                expect(points[0]).toEqual({ x: 0, y: 0 });
                const end = points[points.length - 1]!;
                const sum = netAt(v, theta, q, side);
                expect(Math.hypot(end.x - sum.x, end.y - sum.y), `${id} ${view} ${q} ${side} ${theta}`).toBeLessThan(tol);
              }
              // Whole forces are the two turning halves together.
              const whole = netAt(v, theta, q);
              const plus = netAt(v, theta, q, 'plus');
              const minus = netAt(v, theta, q, 'minus');
              expect(Math.hypot(whole.x - plus.x - minus.x, whole.y - plus.y - minus.y)).toBeLessThan(tol);
            }
          }
        }
      }
    }
  });

  it('redrawn every frame into the same points, give what fresh ones would, whatever the view', () => {
    const ph = phasors('v8-cross');
    const views = [ph.view('order1', WEIGHTS), ph.view('rotating', BARE), ph.view('order1', BARE), ph.view('order2', BARE)];
    const points: Vec2[] = [];
    const tip: Vec2 = { x: 0, y: 0 };
    for (const theta of [0, 41, 233]) {
      for (const v of views) {
        // Views of different sizes one after another: the array grows and shrinks to fit.
        expect(polygon(v, theta, 'minus', 'couple', points)).toBe(points);
        expect(points).toEqual(polygon(v, theta, 'minus', 'couple'));
        expect(netAt(v, theta, 'force', 'plus', tip)).toBe(tip);
        expect(tip).toEqual(netAt(v, theta, 'force', 'plus'));
        expect(vectorAt(v.elements[0]!, v.order, theta, 'net', tip)).toBe(tip);
        expect(tip).toEqual(vectorAt(v.elements[0]!, v.order, theta));
      }
    }
  });

  it('give the sum BalanceForces.sum would: pitch and yaw from the z-weighted forces', () => {
    const v = phasors('v8-cross').view('order1', BARE);
    for (const theta of [0, 45, 200]) {
      const s = sumAt(v, theta);
      const c = netAt(v, theta, 'couple');
      expect(s.mx).toBeCloseTo(-c.y, 12);
      expect(s.my).toBeCloseTo(c.x, 12);
      let mx = 0;
      let my = 0;
      for (const el of v.elements) {
        const f = vectorAt(el, 1, theta);
        mx -= (el.z / 1000) * f.y;
        my += (el.z / 1000) * f.x;
      }
      expect(s.mx).toBeCloseTo(mx, 12);
      expect(s.my).toBeCloseTo(my, 12);
    }
  });
});

describe('the trace of the tip over a turn', () => {
  it('reaches the long half axis and comes down to the short one', () => {
    for (const [id, view, q] of [
      ['v2', 'order1', 'force'],
      ['v2', 'order2', 'couple'],
      ['w12', 'order1', 'couple'],
      ['v10', 'order2', 'couple'],
    ] as const) {
      const v = phasors(id).view(view, BARE);
      const locus = v[q].locus;
      expect(locus.shape, `${id} ${view} ${q}`).toBe('ellipse');
      const radii = trace(v, q, 1440).map((p) => Math.hypot(p.x, p.y));
      expect(Math.max(...radii) / locus.major).toBeCloseTo(1, 4);
      expect(Math.min(...radii) / locus.major).toBeCloseTo(locus.minor / locus.major, 4);
      // The farthest point lies on the long axis.
      const far = trace(v, q, 1440).reduce((best, p) => (Math.hypot(p.x, p.y) > Math.hypot(best.x, best.y) ? p : best));
      expect(axisGap((Math.atan2(far.x, far.y) * 180) / Math.PI, locus.axis)).toBeLessThan(0.5);
    }
  });

  it('runs round the way the sense says', () => {
    for (const [id, view, o, q] of [
      ['v8-cross', 'order1', BARE, 'couple'],
      ['i1', 'order1', WEIGHTS, 'force'],
      ['i1', 'rotating', BARE, 'force'],
      ['v2', 'order1', BARE, 'force'],
      ['v2', 'order2', BARE, 'couple'],
    ] as const) {
      const v = phasors(id).view(view, o);
      const sense = v[q].locus.sense;
      expect(sense, `${id} ${view} ${q}`).not.toBe(0);
      const points = trace(v, q, 360);
      for (let i = 0; i < points.length; i++) {
        const a = points[i]!;
        const b = points[(i + 1) % points.length]!;
        // Clockwise seen from the front, with the crank, turns x right and y up the negative way.
        expect(Math.sign(a.x * b.y - a.y * b.x), `${id} ${view} ${q} at ${i}`).toBe(-sense);
      }
    }
  });
});

describe('locusOf', () => {
  const c = (deg: number, r = 1): Complex => ({ re: r * Math.cos((deg * Math.PI) / 180), im: r * Math.sin((deg * Math.PI) / 180) });

  it('names each shape', () => {
    expect(locusOf(c(0, 0), c(0, 0), 1).shape).toBe('point');
    expect(locusOf(c(0, 0.004), c(0, 0.004), 1).shape).toBe('point');
    const circle = locusOf(c(30), c(0, 0), 1);
    expect(circle).toMatchObject({ shape: 'circle', sense: 1 });
    expect(circle.major).toBeCloseTo(1, 12);
    expect(circle.minor).toBeCloseTo(1, 12);
    expect(locusOf(c(0, 0), c(30), 1)).toMatchObject({ shape: 'circle', sense: -1 });
    const line = locusOf(c(20), c(100), 1);
    expect(line).toMatchObject({ shape: 'line', sense: 0 });
    expect(line.axis).toBeCloseTo(60, 9);
    expect(line.major).toBeCloseTo(2, 12);
    expect(line.minor).toBeCloseTo(0, 12);
    const e = locusOf(c(20, 2), c(100, 1), 1);
    expect(e).toMatchObject({ shape: 'ellipse', sense: 1 });
    expect(e.axis).toBeCloseTo(60, 9);
    expect(e.major).toBeCloseTo(3, 12);
    expect(e.minor).toBeCloseTo(1, 12);
    expect(locusOf(c(20, 1), c(100, 2), 1).sense).toBe(-1);
  });

  it('lays the axis between 0 and 180 degrees', () => {
    expect(locusOf(c(170), c(-170), 1).axis).toBeCloseTo(0, 9);
    expect(locusOf(c(-100), c(-100), 1).axis).toBeCloseTo(80, 9);
  });
});

describe('switches', () => {
  it('counterweights belong to the first order and the turning masses, shafts to the order they turn at', () => {
    const ph = phasors('i3', 2);
    expect(ph.hasCounterweights('order1')).toBe(true);
    expect(ph.hasCounterweights('order2')).toBe(false);
    expect(ph.hasCounterweights('rotating')).toBe(true);
    expect(ph.hasShafts('rotating')).toBe(false);
    expect(ph.view('order2', WEIGHTS).elements).toEqual(ph.view('order2', BARE).elements);
    expect(phasors('i6').hasShafts('order1')).toBe(false);
    const rotary = phasors('r2');
    expect(rotary.hasCounterweights('rotating')).toBe(true);
    expect(rotary.hasCounterweights('order1')).toBe(false);
  });

  it('leave the shared forces at the angle they were at', () => {
    const bf = forces('v6-60');
    bf.at(123);
    const before = bf.arrows.map((a) => ({ ...a }));
    const ph = new BalancePhasors(bf);
    expect(bf.angle).toBe(123);
    expect(bf.arrows).toEqual(before);
    expect(ph.view('order1', ALL)).toBe(ph.view('order1', { ...ALL }));
  });
});
