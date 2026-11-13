import { describe, expect, it } from 'vitest';
import { resolveDesign } from '../src/designer/constraints.ts';
import { DEFAULT_DESIGN, type Design } from '../src/designer/design.ts';
import { evaluate } from '../src/designer/physics.ts';
import { designToSpec } from '../src/designer/to-spec.ts';
import { ENGINES, engineById, pageChoices } from '../src/data/engines.ts';
import { buildEngine, type Engine } from '../src/engine/kinematics.ts';
import { systemsOf } from '../src/engine/systems-spec.ts';
import { AMBIENT_C } from '../src/systems/air.ts';
import { WARNING_BAR } from '../src/systems/oil.ts';
import { SystemsSim, type SystemsFrame } from '../src/systems/sim.ts';
import { THERMOSTAT_FULL_C, THERMOSTAT_OPEN_C, WARMUP_SPEED, airFlowShare, thermostatTarget } from '../src/systems/thermal.ts';

const design = (over: Partial<Design>): Engine => {
  const d = resolveDesign({ ...DEFAULT_DESIGN, throws: [], ...over });
  return buildEngine(designToSpec(d, evaluate(d)));
};

/** EngineSim holds idle with the throttle at about 0.15 load. */
const IDLE_LOAD = 0.15;
const DT = 0.05;

const frame = (engine: Engine, over: Partial<SystemsFrame> = {}): SystemsFrame => ({
  theta: 0,
  advance: 0,
  rpm: 800,
  load: IDLE_LOAD,
  throttle: 0,
  boost: 0,
  running: true,
  cranking: false,
  fuelCut: false,
  live: true,
  dt: DT,
  timeScale: 1,
  ...over,
  ...(over.rpm === undefined ? { rpm: Math.max(800, engine.spec.idleRpm) } : {}),
});

const simFor = (engine: Engine, start: 'warm' | 'cold'): SystemsSim => {
  const sim = new SystemsSim();
  sim.configure(engine);
  sim.reset(start);
  return sim;
};

/** Runs model minutes. */
const run = (sim: SystemsSim, f: SystemsFrame, minutes: number, each?: (modelSeconds: number) => void): void => {
  const steps = Math.round((minutes * 60) / (f.dt * WARMUP_SPEED));
  for (let i = 0; i < steps; i++) {
    sim.step(f);
    each?.((i + 1) * f.dt * WARMUP_SPEED);
  }
};

const plain = design({});
const withCooler = design({ oilCooler: 'coolant' });
const airCooled = design({ layout: 'boxer', cylinders: 4, bore: 85.5, stroke: 69, rodLength: 137, cooling: 'fan', compression: 7.5, rpmLimit: 4600 });
const rideCooled = design({ cylinders: 1, bore: 84, stroke: 90, rodLength: 165, valvetrain: 'ohv', cooling: 'ram', compression: 8.5, rpmLimit: 5500 });
const catalogue = ENGINES.flatMap((page) => pageChoices(page.id).map((c) => buildEngine(engineById(c.id)!)));

describe('coolant pump and thermostat', () => {
  it('a centrifugal pump flows in proportion to its speed', () => {
    const sim = simFor(plain, 'warm');
    sim.step(frame(plain, { rpm: 3000 }));
    const at3000 = sim.state.thermal.coolantFlow;
    sim.step(frame(plain, { rpm: 6000 }));
    expect(sim.state.thermal.coolantFlow / at3000).toBeCloseTo(2, 6);
  });

  it('pumps what the EJ205 does (Saab 9-2X: 100 L/min at 3000 rpm, 20 at 760)', () => {
    const ej205 = design({ layout: 'boxer', cylinders: 4, bore: 92, stroke: 75, rodLength: 130.5, charger: 'turbo' });
    const sim = simFor(ej205, 'warm');
    sim.step(frame(ej205, { rpm: 3000 }));
    expect(sim.state.thermal.coolantFlow).toBeCloseTo(100, -1);
    // The real pump falls off a little at idle; the similarity law gives a quarter more there.
    sim.step(frame(ej205, { rpm: 760 }));
    expect(sim.state.thermal.coolantFlow).toBeGreaterThan(15);
    expect(sim.state.thermal.coolantFlow).toBeLessThan(27);
  });

  it('keeps the radiator shut until the wax melts and opens it fully above 100 C', () => {
    for (let tC = 20; tC < 110; tC += 0.5) expect(thermostatTarget(tC + 0.5)).toBeGreaterThanOrEqual(thermostatTarget(tC));
    expect(thermostatTarget(THERMOSTAT_OPEN_C)).toBe(0);
    expect(thermostatTarget(THERMOSTAT_FULL_C)).toBe(1);
    const sim = simFor(plain, 'cold');
    run(sim, frame(plain, { rpm: 2500, load: 0.4 }), 40, () => {
      const s = sim.state.thermal;
      if (s.engineC < THERMOSTAT_OPEN_C - 1) expect(s.radiatorFlow).toBe(0);
    });
    // Held hot, the wax element opens all the way within a few of its time constants.
    const hot = simFor(plain, 'warm');
    hot.state.thermal.engineC = THERMOSTAT_FULL_C + 15;
    hot.step(frame(plain, { rpm: 0, load: 0, running: false, dt: 5 }));
    expect(hot.state.thermal.thermostat).toBeGreaterThan(0.95);
  });
});

describe('warm-up', () => {
  it('a 2-litre engine idling warms from the street to 88 C in 10 to 18 minutes', () => {
    const sim = simFor(plain, 'cold');
    let reached = -1;
    let oilReached = -1;
    let coolantAt80 = -1;
    run(sim, frame(plain), 40, (t) => {
      if (reached < 0 && sim.state.thermal.engineC >= 88) reached = t;
      if (coolantAt80 < 0 && sim.state.thermal.engineC >= 80) coolantAt80 = t;
      if (oilReached < 0 && sim.state.thermal.oilC >= 80) oilReached = t;
    });
    expect(reached / 60).toBeGreaterThan(10);
    expect(reached / 60).toBeLessThan(18);
    // The oil lags behind the coolant: it only picks up heat as fast as it circulates.
    expect(oilReached - coolantAt80).toBeGreaterThanOrEqual(60);
    // Idling warm, the thermostat barely opens and holds the coolant just above its opening.
    expect(sim.state.thermal.engineC).toBeGreaterThan(88);
    expect(sim.state.thermal.engineC).toBeLessThan(92);
    expect(sim.state.thermal.thermostat).toBeLessThan(0.3);
  });

  it('balances heat in and heat out once steady', () => {
    const sim = simFor(plain, 'warm');
    const f = frame(plain, { rpm: 4000, load: 0.6 });
    run(sim, f, 60);
    const s = sim.state.thermal;
    expect(Math.abs(s.toCoolant + s.toOil - s.rejected) / (s.toCoolant + s.toOil)).toBeLessThan(0.01);
  });

  it('at full power the radiator holds the coolant, and the oil runs hotter without a cooler', () => {
    const sim = simFor(plain, 'warm');
    run(sim, frame(plain, { rpm: plain.spec.redlineRpm, load: 1 }), 40);
    expect(sim.state.thermal.engineC).toBeLessThanOrEqual(110);
    expect(sim.state.thermal.oilC).toBeGreaterThan(110);
    expect(sim.state.thermal.oilC).toBeLessThan(140);
    const cooled = simFor(withCooler, 'warm');
    run(cooled, frame(withCooler, { rpm: withCooler.spec.redlineRpm, load: 1 }), 40);
    expect(cooled.state.thermal.oilC).toBeLessThanOrEqual(cooled.state.thermal.engineC + 20);
  });

  it.each([['a fan', airCooled], ['the riding', rideCooled]] as const)('an engine cooled by %s has no thermostat, and its oil stays in bounds at full power', (_, engine) => {
    const sim = simFor(engine, 'warm');
    run(sim, frame(engine, { rpm: engine.spec.redlineRpm, load: 1 }), 40);
    expect(sim.state.thermal.thermostat).toBe(0);
    expect(sim.state.thermal.coolantFlow).toBe(0);
    expect(sim.state.thermal.oilC).toBeGreaterThan(90);
    expect(sim.state.thermal.oilC).toBeLessThan(140);
  });

  it('ram air stands still at idle and blows hardest at full speed, as the motorcycle it stands for', () => {
    const { redlineRpm, idleRpm } = rideCooled.spec;
    expect(airFlowShare('ram', idleRpm, redlineRpm, idleRpm, true)).toBeCloseTo(airFlowShare('ram', 0, redlineRpm, idleRpm, false), 9);
    expect(airFlowShare('ram', redlineRpm, redlineRpm, idleRpm, true)).toBe(1);
    expect(airFlowShare('fan', redlineRpm, redlineRpm, idleRpm, true)).toBe(1);
    // Standing at idle it runs hotter than riding along at part throttle.
    const idle = simFor(rideCooled, 'warm');
    run(idle, frame(rideCooled), 60);
    const riding = simFor(rideCooled, 'warm');
    run(riding, frame(rideCooled, { rpm: 0.6 * redlineRpm, load: 0.4 }), 60);
    expect(idle.state.thermal.oilC).toBeGreaterThan(riding.state.thermal.oilC);
    expect(idle.state.thermal.oilC).toBeLessThan(140);
  });

  it('a stopped engine cools steadily, with nothing through the heater', () => {
    const sim = simFor(plain, 'warm');
    let last = sim.state.thermal.engineC;
    run(sim, frame(plain, { running: false, rpm: 0, load: 0 }), 20, () => {
      expect(sim.state.thermal.engineC).toBeLessThanOrEqual(last + 1e-9);
      last = sim.state.thermal.engineC;
      expect(sim.state.thermal.heaterFlow).toBe(0);
    });
    expect(last).toBeLessThan(80);
    expect(last).toBeGreaterThan(AMBIENT_C);
  });

  it('holds still in the demo and in slow motion', () => {
    const sim = simFor(plain, 'cold');
    run(sim, frame(plain, { live: false, load: 0.6, rpm: 3000 }), 30);
    expect(sim.state.thermal.engineC).toBe(AMBIENT_C);
    expect(sim.state.thermal.oilC).toBe(AMBIENT_C);
  });
});

/** Model minutes in coarse steps: the warm-up runs ten model seconds per step, the same equations. */
const settle = (engine: Engine, f: Partial<SystemsFrame>, minutes: number): SystemsSim => {
  const sim = simFor(engine, 'warm');
  const fr = frame(engine, { dt: 0.5, ...f });
  for (let i = 0; i < (minutes * 60) / (fr.dt * WARMUP_SPEED); i++) sim.step(fr);
  return sim;
};

describe('every engine of the catalogue', () => {
  it('stays in bounds held at the limiter on full throttle and full boost, whatever cools it', () => {
    const kinds = new Set<string>();
    for (const e of catalogue) {
      kinds.add(systemsOf(e.spec).cooling);
      const s = settle(e, { rpm: e.spec.redlineRpm, load: 1, throttle: 1, boost: 1 }, 120).state;
      // Motor oil flashes at about 230 C; finned metal of an air-cooled head is sized for 180 C here.
      expect(s.thermal.oilC, `${e.spec.id} oil`).toBeLessThan(150);
      expect(s.thermal.engineC, `${e.spec.id} metal`).toBeLessThan(220);
      expect(s.oil.pressure, `${e.spec.id} oil pressure`).toBeGreaterThan(WARNING_BAR);
      // Garrett asks 40-45 psi of the turbo's feed; the hot oil still gives it 2.8 bar.
      if (e.spec.aspiration.includes('turbo')) expect(s.oil.pressure, `${e.spec.id} turbo feed`).toBeGreaterThanOrEqual(2.8);
    }
    expect([...kinds].sort()).toEqual(['fan', 'liquid', 'ram']);
  });

  it('a warm liquid-cooled engine left idling keeps its thermostat at the opening point', () => {
    for (const e of catalogue) {
      if (systemsOf(e.spec).cooling !== 'liquid') continue;
      // Three minutes on screen, and then long enough to settle.
      expect(settle(e, {}, 60).state.thermal.engineC, `${e.spec.id} after 3 min`).toBeGreaterThanOrEqual(85);
      expect(settle(e, {}, 300).state.thermal.engineC, `${e.spec.id} settled`).toBeGreaterThanOrEqual(85);
    }
  });
});
