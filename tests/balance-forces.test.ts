import { describe, expect, it } from 'vitest';
import { ENGINES, engineById, pageChoices } from '../src/data/engines.ts';
import { resolveDesign } from '../src/designer/constraints.ts';
import { DEFAULT_DESIGN, type Design } from '../src/designer/design.ts';
import { evaluate } from '../src/designer/physics.ts';
import { designToSpec } from '../src/designer/to-spec.ts';
import { ALL_LAYERS, BalanceForces, arrowScale, massesOf, type ForceLayers } from '../src/engine/balance-forces.ts';
import { BalancePhasors, sumAt, type PhasorView, type ViewOptions } from '../src/engine/balance-phasors.ts';
import { ShownForces, sumOf } from '../src/engine/balance-shown.ts';
import { buildEngine, pistonAcceleration, vibrationTable, type Engine } from '../src/engine/kinematics.ts';

const engine = (id: string): Engine => buildEngine(engineById(id)!);
const forces = (id: string, shafts?: 0 | 1 | 2): BalanceForces => {
  const e = engine(id);
  const masses = massesOf(e.spec);
  return new BalanceForces(e, shafts === undefined ? masses : { ...masses, shafts });
};
const designed = (over: Partial<Design>): BalanceForces => {
  const d = resolveDesign({ ...DEFAULT_DESIGN, ...over });
  const spec = designToSpec(d, evaluate(d));
  return new BalanceForces(buildEngine(spec), massesOf(spec));
};

const FIRST_ONLY: ForceLayers = { order1: true, order2: false, balancing: false };
const SECOND_ONLY: ForceLayers = { order1: false, order2: true, balancing: false };

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

/** Size of one harmonic of a quantity sampled once per crank degree. */
const harmonicSize = (values: number[], order: number): number => {
  let re = 0;
  let im = 0;
  values.forEach((v, i) => {
    re += v * Math.cos((order * i * Math.PI) / 180);
    im += v * Math.sin((order * i * Math.PI) / 180);
  });
  return (2 * Math.hypot(re, im)) / values.length;
};

/** Second-order force along X and along Y over one turn. */
const secondOrderXY = (bf: BalanceForces): { x: number; y: number } => {
  const sums = Array.from({ length: 360 }, (_, i) => bf.at(i).sum(SECOND_ONLY));
  return { x: harmonicSize(sums.map((s) => s.fx), 2), y: harmonicSize(sums.map((s) => s.fy), 2) };
};

/** Distance between neighbouring crank throws, m. */
const throwSpacing = (e: Engine): number => {
  const zs = e.throws.map((t) => t.z).sort((a, b) => b - a);
  return (zs[0]! - zs[1]!) / 1000;
};

const EVERY_ENGINE = ENGINES.flatMap((page) => pageChoices(page.id).map((c) => [c.id] as const));

describe('the arrows add up to what the kinematics leave', () => {
  it.each(EVERY_ENGINE)('%s', (id) => {
    const bf = forces(id);
    const e = bf.engine;
    const table = vibrationTable(e);
    const k = (bf.masses.reciprocatingKg * e.r) / 1000;
    const pitch = (e.spec.bore * 1.18) / 1000;
    for (let i = 0; i < 360; i += 3) {
      const s = bf.at(i).sum(ALL_LAYERS);
      // vibrationTable holds the piston accelerations, the force on the engine has the opposite sign.
      const want = e.isRotary
        ? { fx: 0, fy: 0, mx: 0, my: 0 }
        : { fx: -k * table.fx[i]!, fy: -k * table.fy[i]!, mx: k * table.pitch[i]! * pitch, my: -k * table.yaw[i]! * pitch };
      const tolerance = bf.primary * 1e-5;
      expect(Math.abs(s.fx - want.fx), `fx at ${i}°`).toBeLessThan(tolerance);
      expect(Math.abs(s.fy - want.fy), `fy at ${i}°`).toBeLessThan(tolerance);
      expect(Math.abs(s.mx - want.mx), `pitch at ${i}°`).toBeLessThan(tolerance * pitch);
      expect(Math.abs(s.my - want.my), `yaw at ${i}°`).toBeLessThan(tolerance * pitch);
    }
  });

  it('counterweights cancel the turning masses and the half of the first order that turns with the crank', () => {
    for (const id of ['i3', 'v6-60', 'v8-cross', 'b6', 'w12']) {
      const bf = forces(id);
      const e = bf.engine;
      for (let i = 0; i < 360; i += 10) {
        bf.at(i);
        const turning = bf.arrows.filter((a) => a.kind === 'rotating' || a.kind === 'counterweight');
        const fx = turning.reduce((sum, a) => sum + a.fx, 0);
        const fy = turning.reduce((sum, a) => sum + a.fy, 0);
        // Half of each piston's first order points along its own crankpin.
        const half = bf.primary / 2;
        const wantX = -e.cylinders.reduce((sum, c) => sum + half * Math.sin(((i + c.pin) * Math.PI) / 180), 0);
        const wantY = -e.cylinders.reduce((sum, c) => sum + half * Math.cos(((i + c.pin) * Math.PI) / 180), 0);
        expect(fx).toBeCloseTo(wantX, 9);
        expect(fy).toBeCloseTo(wantY, 9);
      }
    }
  });
});

describe('known results, derived from the physics', () => {
  const tiny = 1e-3;

  it('inline six: no force and no couple of either order', () => {
    const r = forces('i6').residual();
    const bf = forces('i6');
    expect(r.force1 / bf.primary).toBeLessThan(tiny);
    expect(r.force2 / bf.primary).toBeLessThan(tiny);
    expect(r.couple1 / bf.primary).toBeLessThan(tiny);
    expect(r.couple2 / bf.primary).toBeLessThan(tiny);
  });

  it('inline four: a vertical second-order force of four pistons, nothing else', () => {
    const bf = forces('i4');
    const a2 = secondHarmonic(bf.engine);
    const r = bf.residual();
    expect(r.force1 / bf.primary).toBeLessThan(tiny);
    expect(r.force2 / bf.primary).toBeCloseTo(4 * a2, 3);
    expect(r.couple1 + r.couple2).toBeLessThan(tiny * bf.primary);
    // It acts along the cylinders: up and down.
    const xy = secondOrderXY(bf);
    expect(xy.x / bf.primary).toBeLessThan(tiny);
    expect(xy.y / bf.primary).toBeCloseTo(4 * a2, 3);
  });

  it('flat-plane V8: each bank is an inline four, and at 90° their second orders add to a horizontal force √2 times larger', () => {
    const bf = forces('v8-flat');
    const a2 = secondHarmonic(bf.engine);
    const r = bf.residual();
    expect(r.force1 / bf.primary).toBeLessThan(tiny);
    expect(r.force2 / bf.primary).toBeCloseTo(4 * Math.SQRT2 * a2, 3);
    const xy = secondOrderXY(bf);
    expect(xy.y / bf.primary).toBeLessThan(tiny);
    expect(xy.x / bf.primary).toBeCloseTo(4 * Math.SQRT2 * a2, 3);
  });

  it('cross-plane V8: counterweights leave nothing, though without them a couple of √10 throws turns with the crank', () => {
    const bf = forces('v8-cross');
    const r = bf.residual();
    for (const v of Object.values(r)) expect(v / bf.primary).toBeLessThan(tiny);
    const a = throwSpacing(bf.engine);
    // A 90° pair on one pin: their first orders add up to one piston's force turning with the crank, plus two rods turning.
    const perThrow = bf.primary + (2 * bf.masses.rotatingKg * bf.engine.r) / 1000;
    const peak = bf.peaks(FIRST_ONLY);
    expect(peak.couple / (perThrow * a)).toBeCloseTo(Math.sqrt(10), 3);
    // Constant size: a couple that turns, which is exactly what counterweights can cancel.
    for (let i = 0; i < 360; i += 15) {
      const s = bf.at(i).sum(FIRST_ONLY);
      expect(Math.hypot(s.mx, s.my) / (perThrow * a)).toBeCloseTo(Math.sqrt(10), 3);
    }
  });

  it('90° V6 with shared crankpins: forces cancel, a second-order couple of √6 remains', () => {
    const bf = forces('v6-90');
    const a2 = secondHarmonic(bf.engine);
    const r = bf.residual();
    expect(r.force1 / bf.primary).toBeLessThan(tiny);
    expect(r.force2 / bf.primary).toBeLessThan(tiny);
    expect(r.couple1 / bf.primary).toBeLessThan(tiny);
    expect(r.couple2 / (bf.primary * throwSpacing(bf.engine))).toBeCloseTo(Math.sqrt(6) * a2, 3);
  });

  it('flat four: forces and the first-order couple cancel, a second-order couple of 2·h remains', () => {
    const bf = forces('b4');
    const e = bf.engine;
    const a2 = secondHarmonic(e);
    const c = (n: number) => e.cylinders.find((x) => x.n === n)!;
    // Opposite cylinders sit h apart along the crank.
    const h = Math.abs(c(1).z - c(2).z) / 1000;
    const r = bf.residual();
    expect(r.force1 / bf.primary).toBeLessThan(tiny);
    expect(r.force2 / bf.primary).toBeLessThan(tiny);
    expect(r.couple1 / bf.primary).toBeLessThan(tiny);
    expect(r.couple2 / (bf.primary * h)).toBeCloseTo(2 * a2, 3);
  });

  it('single: half the first order is left, turning against the crank at constant size', () => {
    const bf = forces('i1');
    const half = { order1: true, order2: false, balancing: true };
    for (let i = 0; i < 360; i += 15) {
      const s = bf.at(i).sum(half);
      expect(Math.hypot(s.fx, s.fy) / bf.primary).toBeCloseTo(0.5, 6);
    }
    expect(bf.residual().force1 / bf.primary).toBeCloseTo(0.5, 6);
  });

  it('rotary: counterweights cancel the rotors exactly; without them two rotors rock the engine', () => {
    for (const id of ['r2', 'r4']) {
      const bf = forces(id);
      for (const v of Object.values(bf.residual())) expect(v / bf.primary).toBeLessThan(1e-9);
      expect(bf.peaks(ALL_LAYERS).force).toBeLessThan(bf.primary * 1e-9);
    }
    const bf = forces('r2');
    const [front, rear] = bf.engine.banks.map((b) => bf.engine.cylinders.find((c) => c.n === b.cylinders[0])!.z);
    const peak = bf.peaks(FIRST_ONLY);
    // Rotors half a turn apart: their forces cancel and leave a couple of one rotor times the distance.
    expect(peak.force / bf.primary).toBeLessThan(1e-9);
    expect(peak.couple / (bf.primary * Math.abs(front! - rear!) / 1000)).toBeCloseTo(1, 6);
  });

  it('rotary: the counterweights sit on the pulley and in the flywheel, where the model draws them', () => {
    const bf = forces('r2');
    const weights = bf.arrows.filter((a) => a.kind === 'counterweight').map((a) => a.z);
    // 13B: outer rotor faces at ±91 mm, pulley about 131 mm in front, flywheel about 136 mm behind.
    expect(weights).toEqual([bf.engine.zMax + 40, bf.engine.zMin - 45]);
  });
});

describe('figures for the text', () => {
  it('the largest force of one piston is m r (1 + lambda), at top dead centre', () => {
    for (const id of ['i4', 'v8-cross', 'i1']) {
      const bf = forces(id);
      const e = bf.engine;
      expect(bf.pistonPeak / ((bf.masses.reciprocatingKg * e.r * (1 + e.r / e.l)) / 1000)).toBeCloseTo(1, 4);
      // The second order peaks away from TDC, so the two peaks together overstate it.
      expect(bf.pistonPeak).toBeLessThan(bf.primary + bf.secondary);
    }
  });

  it('higher orders show only where the first two cancel and something is still left', () => {
    expect(forces('v8-cross').higherLeft()).toBe(true);
    expect(forces('i6').higherLeft()).toBe(false);
  });
});

describe('what is left', () => {
  it.each([
    ['i1', ['force1', 'force2']],
    ['i3', ['couple1', 'couple2']],
    ['i4', ['force2']],
    ['i5', ['couple1', 'couple2']],
    ['i6', []],
    ['v6-90', ['couple2']],
    ['v8-cross', []],
    ['v8-flat', ['force2', 'couple2']],
    ['b4', ['couple2']],
    ['b6', []],
    ['r2', []],
  ] as const)('%s', (id, left) => {
    expect(forces(id).left()).toEqual(left);
  });

  it('turning masses shake the engine when the counterweights are hidden', () => {
    // An inline four's pins pair off, so its turning masses cancel; a single's do not.
    const noWeights = { order1: true, order2: false, balancing: false };
    expect(forces('i4').peaks(noWeights).force / forces('i4').primary).toBeLessThan(1e-3);
    const single = forces('i1');
    const turning = (single.masses.rotatingKg * single.engine.r) / 1000;
    // At TDC the piston and the crankpin pull the same way.
    expect(single.at(0).sum(noWeights).fy).toBeCloseTo(single.primary + turning, 9);
  });
});

describe('balance shafts take out their own order and nothing else', () => {
  it('inline three: one shaft against the crank cancels the first-order couple', () => {
    const without = forces('i3', 0).residual();
    const bf = forces('i3', 1);
    const r = bf.residual();
    expect(bf.shafts.map((s) => [s.order, s.sense])).toEqual([[1, -1]]);
    expect(without.couple1 / bf.primary).toBeGreaterThan(0.05);
    expect(r.couple1 / bf.primary).toBeLessThan(1e-6);
    expect(r.couple2).toBeCloseTo(without.couple2, 9);
  });

  it('inline four: two shafts at twice crank speed, turning opposite ways (Lanchester)', () => {
    const bf = forces('i4', 2);
    expect(bf.shafts.map((s) => [s.order, s.sense])).toEqual([
      [2, 1],
      [2, -1],
    ]);
    const r = bf.residual();
    expect(r.force2 / bf.primary).toBeLessThan(1e-6);
    // Equal weights: together they push straight up and down.
    const [a, b] = bf.shafts;
    const weight = (s: typeof a) => s!.weights.reduce((sum, w) => sum + Math.hypot(w.fx, w.fy), 0);
    expect(weight(a)).toBeCloseTo(weight(b), 9);
    for (let i = 0; i < 360; i += 15) {
      bf.at(i);
      const fx = [...a!.weights, ...b!.weights].reduce((sum, w) => sum + w.fx, 0);
      expect(Math.abs(fx) / bf.primary).toBeLessThan(1e-9);
    }
  });

  it('with both orders left, the full set takes three shafts', () => {
    const bf = forces('i3', 2);
    expect(bf.shafts.map((s) => [s.order, s.sense])).toEqual([
      [1, -1],
      [2, 1],
      [2, -1],
    ]);
    for (const v of Object.values(bf.residual())) expect(v / bf.primary).toBeLessThan(1e-6);
  });

  it('a shaft with nothing to cancel is not drawn', () => {
    // An inline four has no first order left for one shaft; an inline six has nothing left for either order.
    expect(forces('i4', 1).shafts).toEqual([]);
    expect(forces('i6', 2).shafts).toEqual([]);
    expect(forces('i3', 1).shafts).toHaveLength(1);
  });

  it('even-firing 90° V6 with split pins keeps a first-order couple, the reason for a single balance shaft', () => {
    const plain = designed({ layout: 'vee', cylinders: 6, veeAngle: 90 });
    expect(plain.residual().couple1 / plain.primary).toBeGreaterThan(0.01);
    const shaft = designed({ layout: 'vee', cylinders: 6, veeAngle: 90, balanceShafts: 1 });
    expect(shaft.shafts).toHaveLength(1);
    expect(shaft.residual().couple1 / shaft.primary).toBeLessThan(1e-6);
  });
});

describe('arrow scale', () => {
  it('gives the largest piston of a page an arrow as long as its bore', () => {
    for (const page of ['i4', 'v8-cross', 'r2']) {
      const engines = pageChoices(page).map((c) => buildEngine(engineById(c.id)!));
      const scale = arrowScale(engines);
      const longest = Math.max(...engines.map((e) => new BalanceForces(e, massesOf(e.spec)).primary * scale));
      const owner = engines.find((e) => Math.abs(new BalanceForces(e, massesOf(e.spec)).primary * scale - longest) < 1e-9)!;
      expect(longest).toBeCloseTo(owner.spec.bore, 6);
    }
  });
});

describe('one view at a time: the arrows the 3D layer draws', () => {
  const OPTIONS: ViewOptions[] = [
    { counterweights: false, shafts: false },
    { counterweights: true, shafts: false },
    { counterweights: true, shafts: true },
  ];
  const DEG = Math.PI / 180;

  /** Every view and switch of an engine, with the arrows of each at a few crank angles checked against its sum. */
  const addsUp = (bf: BalanceForces): void => {
    const phasors = new BalancePhasors(bf);
    const shown = new ShownForces(phasors);
    const tolerance = bf.primary * 1e-9;
    for (const name of phasors.views) {
      for (const options of OPTIONS) {
        const view = phasors.view(name, options);
        for (let theta = 0; theta < 720; theta += 25) {
          const arrows = shown.at(view, theta);
          expect(arrows).toHaveLength(view.elements.length);
          const got = sumOf(arrows);
          const want = sumAt(view, theta);
          const at = `${name} ${JSON.stringify(view.options)} at ${theta}°`;
          expect(Math.abs(got.fx - want.fx), `fx, ${at}`).toBeLessThan(tolerance);
          expect(Math.abs(got.fy - want.fy), `fy, ${at}`).toBeLessThan(tolerance);
          expect(Math.abs(got.mx - want.mx), `pitch, ${at}`).toBeLessThan(tolerance * bf.lever);
          expect(Math.abs(got.my - want.my), `yaw, ${at}`).toBeLessThan(tolerance * bf.lever);
          // Each arrow is drawn where BalanceForces puts its force at this angle.
          for (const a of arrows) {
            const from = bf.arrows[a.slot]!;
            expect([a.x, a.y, a.z], at).toEqual([from.x, from.y, from.z]);
          }
        }
      }
    }
  };

  it.each(EVERY_ENGINE)('%s: in each view the arrows shown add up to its sum', (id) => addsUp(forces(id)));

  it('with balance shafts too', () => {
    for (const shafts of [1, 2] as const) {
      for (const id of ['i3', 'i4', 'i1', 'v6-90']) addsUp(forces(id, shafts));
    }
  });

  it("a piston's arrow acts along its cylinder axis, and in the first order it is the arrow of BalanceForces", () => {
    for (const id of ['i4', 'v6-90', 'v8-cross', 'b6', 'w12', 'vr6']) {
      const bf = forces(id);
      const phasors = new BalancePhasors(bf);
      const shown = new ShownForces(phasors);
      for (const name of ['order1', 'order2'] as const) {
        const view = phasors.view(name);
        for (let theta = 0; theta < 360; theta += 20) {
          shown.at(view, theta).forEach((a, i) => {
            const el = view.elements[i]!;
            const c = bf.engine.cylinders.find((x) => x.n === el.cylinder)!;
            const across = a.fx * Math.cos(c.alpha * DEG) - a.fy * Math.sin(c.alpha * DEG);
            expect(Math.abs(across), `${id} cylinder ${c.n}`).toBeLessThan(bf.primary * 1e-9);
            if (name === 'order1') {
              expect(a.fx).toBeCloseTo(bf.arrows[a.slot]!.fx, 9);
              expect(a.fy).toBeCloseTo(bf.arrows[a.slot]!.fy, 9);
            }
          });
        }
      }
    }
  });

  /** Sum and couple of a view over a turn. */
  const turn = (view: PhasorView): Array<{ force: number; couple: number; fx: number; fy: number; mx: number; my: number }> =>
    Array.from({ length: 36 }, (_, i) => {
      const s = sumAt(view, i * 10);
      return { ...s, force: Math.hypot(s.fx, s.fy), couple: Math.hypot(s.mx, s.my) };
    });

  it('inline four, 2nd order: four arrows in phase and a vertical sum four times as long', () => {
    const bf = forces('i4');
    const phasors = new BalancePhasors(bf);
    const shown = new ShownForces(phasors);
    const view = phasors.view('order2');
    for (let theta = 5; theta < 180; theta += 20) {
      const arrows = shown.at(view, theta);
      expect(arrows).toHaveLength(4);
      for (const a of arrows) {
        expect(a.kind).toBe('piston');
        expect(a.fx).toBeCloseTo(arrows[0]!.fx, 9);
        expect(a.fy).toBeCloseTo(arrows[0]!.fy, 9);
      }
      const sum = sumAt(view, theta);
      expect(Math.abs(sum.fx)).toBeLessThan(bf.primary * 1e-9);
      expect(sum.fy).toBeCloseTo(4 * arrows[0]!.fy, 9);
      expect(Math.hypot(sum.mx, sum.my)).toBeLessThan(bf.primary * bf.lever * 1e-9);
    }
  });

  it('inline six: no sum and no couple in any view, with counterweights or without', () => {
    const phasors = new BalancePhasors(forces('i6'));
    for (const name of phasors.views) {
      for (const options of OPTIONS) {
        for (const s of turn(phasors.view(name, options))) {
          expect(s.force).toBeLessThan(phasors.forces.primary * 1e-6);
          expect(s.couple).toBeLessThan(phasors.forces.primary * phasors.forces.lever * 1e-6);
        }
      }
    }
  });

  it('cross-plane V8: without counterweights the 1st order and the turning masses each rock it with a couple that turns; with them, nothing', () => {
    const phasors = new BalancePhasors(forces('v8-cross'));
    const unit = phasors.forces.primary * phasors.forces.lever;
    for (const name of ['order1', 'rotating'] as const) {
      const bare = turn(phasors.view(name, { counterweights: false, shafts: false }));
      const biggest = Math.max(...bare.map((s) => s.couple));
      expect(biggest, name).toBeGreaterThan(unit);
      // A couple that turns: the same size all round, pointing round the clock.
      for (const s of bare) expect(s.couple / biggest, name).toBeGreaterThan(0.999);
      expect(Math.hypot(bare[0]!.mx - bare[9]!.mx, bare[0]!.my - bare[9]!.my) / biggest, name).toBeCloseTo(Math.SQRT2, 3);
      for (const s of bare) expect(s.force, name).toBeLessThan(phasors.forces.primary * 1e-6);
      for (const s of turn(phasors.view(name, { counterweights: true, shafts: false }))) {
        expect(s.couple, name).toBeLessThan(unit * 1e-6);
        expect(s.force, name).toBeLessThan(phasors.forces.primary * 1e-6);
      }
    }
  });

  it('single: with counterweights the first-order sum is half a piston, turning against the crank', () => {
    const bf = forces('i1');
    const phasors = new BalancePhasors(bf);
    const sums = turn(phasors.view('order1', { counterweights: true, shafts: false }));
    for (const s of sums) expect(s.force).toBeCloseTo(bf.primary / 2, 9);
    // Angles clockwise from +Y, as the crank turns: the sum goes the other way, by as much as the crank.
    const angle = (s: { fx: number; fy: number }): number => Math.atan2(s.fx, s.fy) / DEG;
    const step = ((angle(sums[1]!) - angle(sums[0]!) + 540) % 360) - 180;
    expect(step).toBeCloseTo(-10, 6);
  });
});
