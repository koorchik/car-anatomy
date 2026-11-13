import { describe, expect, it } from 'vitest';
import { ENGINES } from '../src/data/engines.ts';
import { resolveDesign } from '../src/designer/constraints.ts';
import { DEFAULT_DESIGN, type Design } from '../src/designer/design.ts';
import { diagnose } from '../src/designer/diagnostics.ts';
import { FUELS } from '../src/designer/fuels.ts';
import { brakeEfficiency, evaluate, turbineInletPressure } from '../src/designer/physics.ts';
import { designFromSpec } from '../src/designer/presets.ts';
import { REAL_FIGURES } from './real-engines.ts';

const REAL = REAL_FIGURES;

const designOf = (id: string): Design => designFromSpec(ENGINES.find((e) => e.id === id)!);

describe('the model lands near real engines with one set of constants', () => {
  it.each(Object.entries(REAL))('%s', (id, real) => {
    const perf = evaluate(designOf(id));
    expect(perf.peakPower.powerHp / real.hp).toBeGreaterThan(0.68);
    expect(perf.peakPower.powerHp / real.hp).toBeLessThan(1.32);
    expect(perf.peakTorque.torqueNm / real.nm).toBeGreaterThan(0.68);
    expect(perf.peakTorque.torqueNm / real.nm).toBeLessThan(1.32);
  });

  it('has no large bias across the catalogue', () => {
    const ratios = Object.entries(REAL).map(([id, real]) => evaluate(designOf(id)).peakPower.powerHp / real.hp);
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    expect(mean).toBeGreaterThan(0.9);
    expect(mean).toBeLessThan(1.1);
  });

  it('gives best specific consumption in a realistic range', () => {
    const petrol = evaluate(designOf('v8-cross')).bestBsfc.bsfc;
    const diesel = evaluate(designOf('i4d')).bestBsfc.bsfc;
    expect(petrol).toBeGreaterThan(230);
    expect(petrol).toBeLessThan(330);
    expect(diesel).toBeGreaterThan(190);
    expect(diesel).toBeLessThan(260);
    expect(diesel).toBeLessThan(petrol);
  });

  it('brake efficiency matches the energy balance and stays physical', () => {
    for (const id of Object.keys(REAL)) {
      const perf = evaluate(designOf(id));
      const fuel = FUELS[designOf(id).fuel];
      const best = brakeEfficiency(perf.bestBsfc.bsfc, fuel.lhv);
      expect(best).toBeGreaterThan(0.15);
      expect(best).toBeLessThan(0.5);
      expect(brakeEfficiency(perf.peakPower.bsfc, fuel.lhv)).toBeCloseTo(perf.peakPower.energy.brake, 2);
    }
    expect(brakeEfficiency(250, 43)).toBeCloseTo(0.335, 2);
  });

  it('gives a cruise fuel burn in a realistic range', () => {
    const lh = (id: string): number => evaluate(designOf(id)).cruise.fuelLh;
    expect(lh('i4')).toBeGreaterThan(6);
    expect(lh('i4')).toBeLessThan(13);
    expect(lh('i4d')).toBeLessThan(lh('i4'));
    expect(lh('v8-cross')).toBeGreaterThan(lh('i4'));
  });
});

const base = (over: Partial<Design> = {}): Design => resolveDesign({ ...DEFAULT_DESIGN, throws: [], ...over });
const peak = (over: Partial<Design> = {}) => evaluate(base(over)).peakPower;

describe('each choice pushes the result the way engineering says it should', () => {
  it('more displacement, more torque', () => {
    expect(evaluate(base({ bore: 96 })).peakTorque.torqueNm).toBeGreaterThan(evaluate(base({ bore: 80 })).peakTorque.torqueNm * 1.2);
  });

  it('higher compression gives more torque and better consumption, until knock', () => {
    const low = evaluate(base({ compression: 8, fuel: 'race' }));
    const mid = evaluate(base({ compression: 11, fuel: 'race' }));
    expect(mid.peakTorque.torqueNm).toBeGreaterThan(low.peakTorque.torqueNm);
    expect(mid.bestBsfc.bsfc).toBeLessThan(low.bestBsfc.bsfc);
  });

  it('too much compression on poor fuel retards ignition and costs torque', () => {
    const fine = evaluate(base({ compression: 10, fuel: 'ai92' }));
    const hot = evaluate(base({ compression: 15, fuel: 'ai92' }));
    expect(Math.max(...hot.points.map((p) => p.knockRetard))).toBeGreaterThan(Math.max(...fine.points.map((p) => p.knockRetard)));
  });

  it('better fuel removes knock', () => {
    const over: Partial<Design> = { compression: 12.5, charger: 'turbo', boostBar: 1, turboSizeHp: 300 };
    const worst = (d: Design) => Math.max(...evaluate(d).points.map((p) => p.knockRetard));
    expect(worst(base({ ...over, fuel: 'e85' }))).toBeLessThan(worst(base({ ...over, fuel: 'ai92' })));
  });

  it('boost raises power, and more boost raises it further', () => {
    const na = peak().powerKw;
    const small = peak({ charger: 'turbo', boostBar: 0.5, turboSizeHp: 350 }).powerKw;
    const big = peak({ charger: 'turbo', boostBar: 1.2, turboSizeHp: 450, fuel: 'ai98', compression: 8.5 }).powerKw;
    expect(small).toBeGreaterThan(na * 1.2);
    expect(big).toBeGreaterThan(small);
  });

  it('a small turbo spools early, a big one late but makes more on top', () => {
    const small = evaluate(base({ charger: 'turbo', boostBar: 1.2, turboSizeHp: 180, compression: 9, fuel: 'ai98' }));
    const large = evaluate(base({ charger: 'turbo', boostBar: 1.2, turboSizeHp: 700, compression: 9, fuel: 'ai98' }));
    const spool = (p: typeof small): number => p.points.find((x) => x.boostBar > 0.9)?.rpm ?? Infinity;
    expect(spool(small)).toBeLessThan(spool(large));
    const backAtLimit = (p: typeof small): number => p.points[p.points.length - 1]!.backpressureBar;
    expect(backAtLimit(small)).toBeGreaterThan(backAtLimit(large));
  });

  it('a supercharger gives boost down low but takes power from the crank', () => {
    const turbo = evaluate(base({ charger: 'turbo', boostBar: 0.8, turboSizeHp: 300, compression: 9 }));
    const roots = evaluate(base({ charger: 'roots', boostBar: 0.8, compression: 9 }));
    const at = (p: typeof turbo, rpm: number) => p.points.reduce((a, b) => (Math.abs(b.rpm - rpm) < Math.abs(a.rpm - rpm) ? b : a));
    expect(at(roots, 1800).boostBar).toBeGreaterThan(at(turbo, 1800).boostBar);
  });

  it('an intercooler adds power', () => {
    const over: Partial<Design> = { charger: 'turbo', boostBar: 1, turboSizeHp: 300, compression: 8.5, fuel: 'ai98' };
    expect(peak({ ...over, intercooler: 0.85 }).powerKw).toBeGreaterThan(peak({ ...over, intercooler: 0 }).powerKw);
  });

  it('small valves choke the top end', () => {
    const big = evaluate(base({ rpmLimit: 8500, springForce: 1400 }));
    const tiny = evaluate(base({ rpmLimit: 8500, springForce: 1400, intakeValve: 22, exhaustValve: 20, lift: 6 }));
    expect(tiny.peakPower.rpm).toBeLessThan(big.peakPower.rpm);
    expect(tiny.peakPower.powerKw).toBeLessThan(big.peakPower.powerKw * 0.85);
    expect(tiny.peakPower.machIndex).toBeGreaterThan(big.peakPower.machIndex);
  });

  it('a long cam moves torque up the rev range and costs bottom end', () => {
    const mild = evaluate(base({ intakeDuration: 225, exhaustDuration: 225, rpmLimit: 8000, springForce: 1200 }));
    const wild = evaluate(base({ intakeDuration: 300, exhaustDuration: 300, rpmLimit: 8000, springForce: 1200, compression: 9 }));
    expect(wild.peakTorque.rpm).toBeGreaterThan(mild.peakTorque.rpm);
    expect(wild.points[3]!.torqueNm).toBeLessThan(mild.points[3]!.torqueNm);
  });

  it('runner length moves the intake tune: shorter means higher rpm', () => {
    expect(evaluate(base({ runnerLength: 180 })).intakeTuneRpm).toBeGreaterThan(evaluate(base({ runnerLength: 500 })).intakeTuneRpm);
  });

  it('header length moves the exhaust tune as in Bell: 53 in tunes near 4200 rpm at 82 deg EVO', () => {
    const d = base({ headerLength: 1346 });
    const events = evaluate(d).events;
    const ed = 180 + events.evoBbdc;
    expect(evaluate(d).exhaustTuneRpm).toBeCloseTo((850 * ed) / (1346 / 25.4 + 3), 3);
  });

  it('a road muffler on a thin pipe costs power, an open pipe frees it', () => {
    const tight = peak({ muffler: 'road', pipeDia: 35 }).powerKw;
    const free = peak({ muffler: 'open', pipeDia: 75, catalyst: false }).powerKw;
    expect(free).toBeGreaterThan(tight * 1.1);
  });

  it('power peaks rich of stoichiometric and consumption is best slightly lean', () => {
    const power = (lambda: number) => peak({ lambda }).powerKw;
    expect(power(0.88)).toBeGreaterThan(power(1.1));
    const bsfc = (lambda: number) => evaluate(base({ lambda, compression: 10 })).bestBsfc.bsfc;
    expect(bsfc(1.05)).toBeLessThan(bsfc(0.8));
  });

  it('wrong ignition timing costs power both ways', () => {
    const best = peak({ fuel: 'race', compression: 9.5 }).powerKw;
    expect(peak({ fuel: 'race', compression: 9.5, ignitionOffset: -20 }).powerKw).toBeLessThan(best * 0.95);
    expect(peak({ fuel: 'race', compression: 9.5, ignitionOffset: 15 }).powerKw).toBeLessThan(best);
  });

  it('a heavier flywheel slows the revs', () => {
    expect(evaluate(base({ flywheelKg: 30 })).revTimeS).toBeGreaterThan(evaluate(base({ flywheelKg: 3 })).revTimeS * 1.3);
  });

  it('methanol burns far more fuel per horsepower', () => {
    const e = base({ fuel: 'methanol', compression: 12, lambda: 0.88 });
    expect(evaluate(e).bestBsfc.bsfc).toBeGreaterThan(evaluate(base({ fuel: 'ai98', lambda: 0.88 })).bestBsfc.bsfc * 1.7);
  });
});

const has = (over: Partial<Design>, id: string): boolean => {
  const d = base(over);
  return diagnose(d, evaluate(d)).some((x) => x.id === id);
};

describe('limits are explained, not hidden', () => {
  it('reports rod failure when over-revved', () => {
    expect(has({ rpmLimit: 21000, stroke: 110, rodLength: 200 }, 'rod-failure')).toBe(true);
    expect(has({ rpmLimit: 6500 }, 'rod-failure')).toBe(false);
  });

  it('titanium rods and a shorter stroke raise the failure speed', () => {
    const steel = evaluate(base());
    expect(evaluate(base({ rodMaterial: 'titanium' })).failureRpm).toBeGreaterThan(steel.failureRpm);
    expect(evaluate(base({ stroke: 60 })).failureRpm).toBeGreaterThan(steel.failureRpm);
  });

  it('reports valve float with soft springs and drops the torque past it', () => {
    const d = base({ springForce: 220, rpmLimit: 9000, lift: 12 });
    const perf = evaluate(d);
    expect(has({ springForce: 220, rpmLimit: 9000, lift: 12 }, 'valve-float')).toBe(true);
    expect(perf.floatRpm).toBeLessThan(9000);
    expect(perf.points[perf.points.length - 1]!.torqueNm).toBeLessThan(perf.peakTorque.torqueNm * 0.3);
  });

  it('reports a valve hitting the piston with a wild cam on high compression, not with a mild one', () => {
    const wild: Partial<Design> = { compression: 14, intakeDuration: 330, exhaustDuration: 330, lobeSeparation: 98, lift: 15, intakeValve: 36 };
    expect(has(wild, 'valve-hit')).toBe(true);
    expect(has({}, 'valve-hit')).toBe(false);
  });

  it('a diesel below self-ignition compression does not start', () => {
    const d = base({ fuel: 'diesel', lambda: 1.5, compression: 9 });
    expect(evaluate(d).catches).toBe(false);
    expect(has({ fuel: 'diesel', lambda: 1.5, compression: 9 }, 'no-ignition')).toBe(true);
    expect(evaluate(base({ fuel: 'diesel', lambda: 1.5, compression: 18 })).catches).toBe(true);
  });

  it('reports hard knock on a boosted high-compression engine with poor fuel', () => {
    expect(has({ charger: 'turbo', boostBar: 2.5, turboSizeHp: 300, compression: 13, fuel: 'ai92', intercooler: 0 }, 'knock')).toBe(true);
    expect(has({ compression: 9.5, fuel: 'ai95' }, 'knock')).toBe(false);
  });

  it('reports destructive cylinder pressure on extreme boost, not on factory engines', () => {
    expect(has({ charger: 'turbo', boostBar: 4, turboSizeHp: 300, compression: 12, fuel: 'methanol', lambda: 0.85, intercooler: 0.9 }, 'cylinder-pressure')).toBe(true);
    for (const id of Object.keys(REAL)) {
      const d = designOf(id);
      expect(diagnose(d, evaluate(d)).some((x) => x.id === 'cylinder-pressure')).toBe(false);
    }
  });

  it('a small turbo engine can use boost to cruise', () => {
    const d = base({ cylinders: 3, bore: 74, stroke: 77, charger: 'turbo', boostBar: 1, turboSizeHp: 150, compression: 9.5 });
    expect(evaluate(d).cruise.reachable).toBe(true);
    const na = base({ cylinders: 2, bore: 60, stroke: 60, rpmLimit: 6000 });
    expect(evaluate(na).cruise.reachable).toBe(false);
  });

  it('reports smoke on a rich diesel', () => {
    expect(has({ fuel: 'diesel', compression: 18, lambda: 1 }, 'smoke')).toBe(true);
  });

  it('reports a badly undersized turbo', () => {
    expect(has({ charger: 'turbo', boostBar: 1.5, turboSizeHp: 60, compression: 8.5, bore: 100, stroke: 100, fuel: 'ai98' }, 'turbo-small')).toBe(true);
  });

  it('praises a balanced inline six and warns about a flat-crank single-bank shake', () => {
    expect(has({ cylinders: 6 }, 'balanced')).toBe(true);
    expect(has({ cylinders: 2, crankPreset: 'flat' }, 'balanced')).toBe(false);
  });
});

describe('the model never produces nonsense', () => {
  const finite = (d: Design): void => {
    const perf = evaluate(d);
    for (const p of perf.points) {
      for (const v of [p.torqueNm, p.powerKw, p.boostBar, p.backpressureBar, p.egtC, p.peakPressureBar, p.fillRatio]) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
    expect(Number.isFinite(perf.revTimeS)).toBe(true);
    expect(Number.isFinite(perf.massKg)).toBe(true);
    expect(perf.idleRpm).toBeGreaterThan(0);
    expect(perf.topRpm).toBeGreaterThan(perf.idleRpm);
    expect(perf.torqueTable).toHaveLength(25);
  };

  it('stays finite at the corners of the parameter space', () => {
    for (const over of [
      { bore: 30, stroke: 280, rpmLimit: 1500 },
      { bore: 220, stroke: 20, rpmLimit: 22000 },
      { bore: 220, stroke: 280, cylinders: 12, charger: 'quadturbo', boostBar: 4, turboSizeHp: 40 },
      { bore: 30, stroke: 20, cylinders: 1, compression: 4, rpmLimit: 22000 },
      { compression: 26, lambda: 0.65, ignitionOffset: 15, fuel: 'ai92' },
      { fuel: 'diesel', compression: 4, lambda: 3 },
      { layout: 'rotary', cylinders: 4, rotorR: 160, rotorE: 16, rotorWidth: 130, rpmLimit: 22000 },
      { layout: 'rotary', cylinders: 1, rotorR: 60, rotorE: 6, rotorWidth: 30, charger: 'roots', boostBar: 4 },
      { pipeDia: 25, headerDia: 15, muffler: 'road', runnerDia: 14, runnerLength: 900, intakeValve: 12, exhaustValve: 10, lift: 3 },
    ] as Array<Partial<Design>>) {
      finite(base(over));
    }
  });

  it('computes fast enough to follow a slider', () => {
    const d = base({ cylinders: 12, layout: 'vee', charger: 'quadturbo' });
    const start = performance.now();
    for (let i = 0; i < 20; i++) evaluate(d);
    expect((performance.now() - start) / 20).toBeLessThan(15);
  });
});

describe('defects found by review stay fixed', () => {
  const turbo: Partial<Design> = { charger: 'turbo', boostBar: 1, compression: 9.5, fuel: 'ai98', directInjection: true, springForce: 1500 };
  const near = (points: Array<{ rpm: number }>, rpm: number) => points.reduce((a, b) => (Math.abs(b.rpm - rpm) < Math.abs(a.rpm - rpm) ? b : a));

  it('the boost loop settles: no chatter along the rev range at any turbo size', () => {
    for (const fuelSet of [{}, { fuel: 'diesel', compression: 18, lambda: 1.5, directInjection: true }] as Array<Partial<Design>>) {
      for (const turboSizeHp of [50, 80, 100, 120, 150, 220, 400]) {
        const { points } = evaluate(base({ ...turbo, ...fuelSet, turboSizeHp, rpmLimit: 6800 }));
        // A hopeless turbine's pressure climbs steeply, and it may bend where the target is lost. It must not zigzag.
        let reversals = 0;
        for (let i = 2; i < points.length; i++) {
          const before = points[i - 1]!.backpressureBar - points[i - 2]!.backpressureBar;
          const now = points[i]!.backpressureBar - points[i - 1]!.backpressureBar;
          if (before * now < 0 && Math.abs(before) > 0.02 && Math.abs(now) > 0.02) reversals++;
        }
        expect(reversals, `back pressure reversals, size ${turboSizeHp}`).toBeLessThanOrEqual(1);
        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1]!;
          const b = points[i]!;
          const size = Math.max(Math.abs(a.torqueNm), 20);
          // A small turbine coming on boost between two points is a real step up, not chatter: boost and torque
          // both rise there and the boost keeps rising or holds after it. Main measured 0.19 for this step.
          const next = points[i + 1];
          const spooling = b.boostBar - a.boostBar > 0.2 && b.torqueNm > a.torqueNm && (!next || next.boostBar >= b.boostBar - 1e-6);
          expect(Math.abs(b.torqueNm - a.torqueNm) / size, `torque jump at ${b.rpm} rpm, size ${turboSizeHp}`).toBeLessThan(spooling ? 0.25 : 0.2);
        }
      }
    }
  });

  it('a mixture richer than best power cools the exhaust, and a lean one past stoichiometric does too', () => {
    const egt = (lambda: number) => evaluate(base({ lambda })).peakPower.egtC;
    expect(egt(0.7)).toBeLessThan(egt(0.9));
    expect(egt(1.5)).toBeLessThan(egt(1));
  });

  it('turbine back pressure follows the ellipse law, with temperature', () => {
    const p4 = 101300;
    const p = (flow: number, t3: number) => turbineInletPressure(p4, flow, t3);
    expect(p(0, 1100)).toBeCloseTo(p4, 3);
    const k = (flow: number, t3: number) => (p(flow, t3) ** 2 - p4 ** 2) / (flow * flow * t3);
    expect(k(1, 1100) / k(2, 900)).toBeCloseTo(1, 6);
    // The term scales with the reference pressure, not with what the pipe adds.
    const clogged = turbineInletPressure(4 * p4, 1, 1150);
    expect(clogged).toBeLessThan(4 * p4 * 1.2);
  });

  it('a diesel at 14:1 starts, as real low-compression diesels do, and well below that it does not', () => {
    expect(evaluate(base({ fuel: 'diesel', lambda: 1.5, compression: 14 })).catches).toBe(true);
    expect(evaluate(base({ fuel: 'diesel', lambda: 1.5, compression: 10 })).catches).toBe(false);
  });

  it('calls out tiny valves and tiny runners, and spares the catalogue', () => {
    expect(has({ intakeValve: 16 }, 'valve-choke')).toBe(true);
    expect(has({ runnerDia: 16 }, 'runner-choke')).toBe(true);
    for (const id of Object.keys(REAL)) {
      const d = designOf(id);
      const ids = diagnose(d, evaluate(d)).map((x) => x.id);
      expect(ids, id).not.toContain('valve-choke');
      expect(ids, id).not.toContain('runner-choke');
      expect(ids, id).not.toContain('exhaust-choke');
      expect(ids, id).not.toContain('turbo-small');
    }
  });

  it('a supercharger does not know where the rev limit is set', () => {
    for (const charger of ['roots', 'centrifugal'] as const) {
      const common: Partial<Design> = { charger, boostBar: 0.8, compression: 9, fuel: 'ai98', springForce: 1500 };
      const low = near(evaluate(base({ ...common, rpmLimit: 5000 })).points, 3000) as ReturnType<typeof evaluate>['points'][number];
      const high = near(evaluate(base({ ...common, rpmLimit: 10000 })).points, 3000) as ReturnType<typeof evaluate>['points'][number];
      expect(Math.abs(low.boostBar - high.boostBar)).toBeLessThan(0.03);
    }
  });

  it('a tiny exhaust valve strangles the engine', () => {
    const fine = peak({ exhaustValve: 29 }).powerKw;
    expect(peak({ exhaustValve: 10 }).powerKw).toBeLessThan(fine * 0.9);
    expect(peak({ exhaustValve: 22 }).powerKw).toBeLessThan(fine);
  });

  it('narrow primaries help at low speed and hurt at high speed', () => {
    const at = (headerDia: number, rpm: number) => (near(evaluate(base({ headerDia })).points, rpm) as ReturnType<typeof evaluate>['points'][number]).torqueNm;
    expect(at(28, 2000)).toBeGreaterThan(at(52, 2000));
    expect(at(28, 6800)).toBeLessThan(at(52, 6800));
  });

  it('blames the pipe, not the turbine, when the pipe is what chokes', () => {
    const over: Partial<Design> = { ...turbo, pipeDia: 25, turboSizeHp: 1500 };
    expect(has(over, 'turbo-small')).toBe(false);
    expect(has(over, 'exhaust-choke')).toBe(true);
  });

  it('names the speed where the ignition really retards most', () => {
    const d = base({ ...turbo, compression: 13, turboSizeHp: 250 });
    const perf = evaluate(d);
    const knock = diagnose(d, perf).find((x) => x.id === 'knock' || x.id === 'knock-limited')!;
    const worst = perf.points.reduce((a, b) => (b.knockRetard > a.knockRetard ? b : a), perf.points[0]!);
    expect(worst.knockRetard).toBeGreaterThan(0);
    const worstHard = perf.points.reduce((a, b) => (b.knockSeverity > a.knockSeverity ? b : a), perf.points[0]!);
    const named = knock.id === 'knock' && worstHard.knockSeverity > 1.1 ? worstHard.rpm : worst.rpm;
    expect(knock.title).toContain((Math.round(named / 100) * 100).toLocaleString('uk-UA'));
  });

  it('energy shares add up at every speed, even where the engine makes no power', () => {
    for (const over of [{}, { springForce: 220, rpmLimit: 9000, lift: 12 }, turbo, { fuel: 'diesel', compression: 18, lambda: 1.5 }, { layout: 'rotary', cylinders: 2 }] as Array<Partial<Design>>) {
      for (const p of evaluate(base(over)).points) {
        const e = p.energy;
        const sum = e.brake + e.friction + e.pumping + e.coolant + e.exhaust + e.unburned;
        expect(sum).toBeCloseTo(1, 3);
        for (const share of Object.values(e)) expect(share).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
