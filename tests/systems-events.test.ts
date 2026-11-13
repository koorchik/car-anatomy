import { describe, expect, it } from 'vitest';
import { engineById } from '../src/data/engines.ts';
import { resolveDesign } from '../src/designer/constraints.ts';
import { DEFAULT_DESIGN, type Design } from '../src/designer/design.ts';
import { evaluate } from '../src/designer/physics.ts';
import { designToSpec } from '../src/designer/to-spec.ts';
import { buildEngine, mod, type Engine } from '../src/engine/kinematics.ts';
import { systemsOf } from '../src/engine/systems-spec.ts';
import { airParams, airStep, newAirState } from '../src/systems/air.ts';
import { FuelModel, sparkAdvance, TRAILING_LAG, type FuelInput } from '../src/systems/fuel.ts';
import { shownAdvance, SystemsSim } from '../src/systems/sim.ts';

const design = (over: Partial<Design>): Engine => {
  const d = resolveDesign({ ...DEFAULT_DESIGN, throws: [], ...over });
  return buildEngine(designToSpec(d, evaluate(d)));
};

const input = (engine: Engine, over: Partial<FuelInput> = {}): FuelInput => {
  const rpm = over.rpm ?? engine.spec.idleRpm;
  const load = over.load ?? 0.15;
  const air = newAirState();
  airStep(airParams(engine, systemsOf(engine.spec)), { rpm, load, boost: 0, fuelCut: false }, air);
  return { theta: 0, advance: 0, rpm, load, pressureRatio: 1, fuelGs: air.fuelGs, fuelCut: false, running: true, cranking: false, engineC: 90, sinceStart: 1e6, ...over };
};

/** Turns the crank through a cycle a degree at a time and lists the angles each spark fired or each injection began at. */
const sweep = (model: FuelModel, base: FuelInput, field: 'sparks' | 'injecting' | 'piloting'): number[][] => {
  const e = model.engine;
  const n = field === 'sparks' ? model.state.sparks.length : e.cylinders.length;
  const hits: number[][] = Array.from({ length: n }, () => []);
  const before = new Array<boolean>(n).fill(false);
  model.step({ ...base, theta: 0, advance: 0 });
  for (let i = 0; i < n; i++) before[i] = model.state[field][i]! > 0;
  for (let deg = 1; deg <= e.cycle; deg++) {
    model.step({ ...base, theta: deg, advance: 1 });
    const arr = model.state[field];
    for (let i = 0; i < n; i++) {
      const on = arr[i]! > 0;
      if (on && (field === 'sparks' || !before[i])) hits[i]!.push(deg);
      before[i] = on;
    }
  }
  return hits;
};

const plain = design({});
const wasted = design({ ignition: 'wasted-spark' });
const direct = design({ directInjection: true });
const v8 = buildEngine(engineById('v8-cross')!);

describe('sparks', () => {
  it('each cylinder fires once a cycle, before its TDC by the advance, in firing order', () => {
    for (const e of [plain, v8]) {
      const model = new FuelModel(e, systemsOf(e.spec));
      const base = input(e);
      const hits = sweep(model, base, 'sparks');
      const adv = model.state.advance;
      e.cylinders.forEach((c, i) => {
        expect(hits[i]!.length, `${c.n}`).toBe(1);
        expect(mod(hits[i]![0]! - (c.fire - adv), e.cycle)).toBeLessThan(1);
      });
      const order = e.cylinders.map((c, i) => ({ n: c.n, at: mod(hits[i]![0]! - hits[0]![0]!, e.cycle) })).sort((a, b) => a.at - b.at).map((x) => x.n);
      const start = e.spec.firingOrder.indexOf(e.cylinders[0]!.n);
      expect(order).toEqual([...e.spec.firingOrder.slice(start), ...e.spec.firingOrder.slice(0, start)]);
    }
  });

  it('a wasted spark fires the same plug again a turn later', () => {
    const model = new FuelModel(wasted, systemsOf(wasted.spec));
    const hits = sweep(model, input(wasted), 'sparks');
    for (const h of hits) {
      expect(h.length).toBe(2);
      expect(mod(h[1]! - h[0]!, 720)).toBeCloseTo(360, -1);
    }
  });

  it('advances about 12 degrees at idle, less with boost, and moves with the design offset', () => {
    expect(sparkAdvance(800, 800, 0, 1, 0)).toBe(12);
    expect(sparkAdvance(4000, 800, 0.3, 1, 0)).toBeGreaterThan(30);
    expect(sparkAdvance(4000, 800, 1, 2, 0)).toBeLessThan(sparkAdvance(4000, 800, 1, 1, 0));
    expect(sparkAdvance(3000, 800, 0.5, 1, -6)).toBeCloseTo(sparkAdvance(3000, 800, 0.5, 1, 0) - 6, 9);
  });

  it('a rotary fires each plug once a shaft turn, the trailing one after the leading one', () => {
    const r2 = buildEngine(engineById('r2/rx8-renesis')!);
    const model = new FuelModel(r2, { ...systemsOf(r2.spec), ignition: 'coil-on-plug' });
    const hits = sweep(model, input(r2), 'sparks');
    for (let rotor = 0; rotor < 2; rotor++) {
      const lead = hits[rotor * 2]!;
      const trail = hits[rotor * 2 + 1]!;
      expect(lead.length).toBe(3);
      expect(trail.length).toBe(3);
      expect(mod(lead[1]! - lead[0]!, 1080)).toBeCloseTo(360, -1);
      expect(mod(trail[0]! - lead[0]!, 1080)).toBeCloseTo(TRAILING_LAG, -1);
    }
  });

  it('a 13B’s shared leading coil fires each leading plug twice a turn, the trailing plugs once', () => {
    const r2 = buildEngine(engineById('r2')!);
    const model = new FuelModel(r2, { ...systemsOf(r2.spec), ignition: 'wasted-spark' });
    const hits = sweep(model, input(r2), 'sparks');
    expect(hits[0]!.length).toBe(6);
    expect(hits[1]!.length).toBe(3);
    const gaps = hits[0]!.map((h, i) => mod(hits[0]![(i + 1) % hits[0]!.length]! - h, 1080));
    for (const g of gaps) expect(g).toBeCloseTo(180, -1);
  });
});

describe('injection', () => {
  it('port injection ends on a closed valve before it opens, and grows with load and speed', () => {
    const model = new FuelModel(plain, systemsOf(plain.spec));
    const part = model.step(input(plain, { rpm: 2500, load: 0.4 }));
    const ivo = plain.timing.intakeOpen;
    expect(mod(ivo - part.injectEnd, 720)).toBeCloseTo(20, 6);
    const short = part.pulseMs;
    expect(model.step(input(plain, { rpm: 2500, load: 0.8 })).pulseMs).toBeGreaterThan(short);
    const top = model.step(input(plain, { rpm: plain.spec.redlineRpm, load: 1 }));
    const cycleMs = (60000 / plain.spec.redlineRpm) * 2;
    expect(top.pulseMs / cycleMs).toBeLessThanOrEqual(0.85);
  });

  it('moves with valve timing from feature/vvt and skips a switched-off cylinder', () => {
    const model = new FuelModel(plain, systemsOf(plain.spec));
    const timing = { ...plain.timing, intakeOpen: plain.timing.intakeOpen - 30 };
    const moved = model.step(input(plain, { rpm: 2500, load: 0.4, timing }));
    expect(mod(timing.intakeOpen - moved.injectEnd, 720)).toBeCloseTo(20, 6);
    const active = plain.cylinders.map((_, i) => i !== 0);
    const base = input(plain, { rpm: 2500, load: 0.4, active });
    const sparks = sweep(model, base, 'sparks');
    const shots = sweep(model, base, 'injecting');
    expect(sparks[0]!.length).toBe(0);
    expect(shots[0]!.length).toBe(0);
    expect(sparks[1]!.length).toBe(1);
  });

  it('direct injection falls in the intake stroke, with a second shot before TDC on a cold engine', () => {
    const model = new FuelModel(direct, systemsOf(direct.spec));
    const warm = model.step(input(direct, { rpm: 2500, load: 0.4 }));
    expect(warm.injectStart).toBeGreaterThanOrEqual(420);
    expect(warm.injectEnd).toBeLessThanOrEqual(direct.timing.intakeClose);
    expect(warm.pilotEnd - warm.pilotStart).toBe(0);
    expect(warm.secondEnd - warm.secondStart).toBe(0);
    const cold = model.step(input(direct, { rpm: 1500, load: 0.3, engineC: 25 }));
    expect(cold.secondEnd).toBeCloseTo(700, 6);
    expect(cold.secondStart).toBeLessThan(cold.secondEnd);
    // Both shots come from the one injector in the chamber, so both light its slot.
    const shots = sweep(model, input(direct, { rpm: 1500, load: 0.3, engineC: 25 }), 'injecting');
    const c = direct.cylinders[0]!;
    const began = shots[0]!.map((deg) => mod(deg - c.fire, 720));
    expect(began.length).toBe(2);
    [cold.injectStart, cold.secondStart].forEach((start, k) => {
      expect(began[k]!).toBeGreaterThanOrEqual(start - 1e-9);
      expect(began[k]!).toBeLessThan(start + 1);
    });
    expect(sweep(model, input(direct, { rpm: 1500, load: 0.3, engineC: 25 }), 'piloting')[0]).toEqual([]);
  });

  it('dual injection lights the injectors that spray: port at light load, both in between, direct at full load', () => {
    const i3 = buildEngine(engineById('i3')!);
    const s = systemsOf(i3.spec);
    expect(s.fuelSystem).toBe('dual');
    const model = new FuelModel(i3, s);
    const shots = (load: number, engineC = 90): { port: number; direct: number; st: ReturnType<FuelModel['step']> } => {
      const base = input(i3, { rpm: 3000, load, engineC });
      const port = sweep(model, base, 'injecting')[0]!.length;
      const direct = sweep(model, base, 'piloting')[0]!.length;
      return { port, direct, st: model.step(base) };
    };
    const light = shots(0.2);
    expect(light.st.portShare).toBe(1);
    expect([light.port, light.direct]).toEqual([1, 0]);
    const mid = shots(0.5);
    expect(mid.st.portShare).toBeGreaterThan(0);
    expect(mid.st.portShare).toBeLessThan(1);
    expect([mid.port, mid.direct]).toEqual([1, 1]);
    const full = shots(1);
    expect(full.st.portShare).toBe(0);
    expect([full.port, full.direct]).toEqual([0, 1]);
    expect(full.st.pilotStart).toBeGreaterThanOrEqual(420);
    expect(full.st.pilotEnd).toBeLessThanOrEqual(i3.timing.intakeClose);
    expect(full.st.injectEnd - full.st.injectStart).toBe(0);
    // Cold, the second shot also comes from the direct injector.
    const cold = shots(1, 25);
    expect([cold.port, cold.direct]).toEqual([0, 2]);
  });

  it('a diesel injects near TDC, with a pilot before it on common rail and none from a mechanical pump', () => {
    const cr = buildEngine(engineById('i6d/bmw-530d-b57')!);
    const model = new FuelModel(cr, systemsOf(cr.spec));
    for (const load of [0.1, 0.5, 1]) {
      const st = model.step(input(cr, { rpm: 2500, load }));
      const btdc = mod(cr.cycle - st.injectStart, cr.cycle);
      const signed = btdc > 360 ? btdc - 720 : btdc;
      expect(signed).toBeGreaterThanOrEqual(-4);
      expect(signed).toBeLessThanOrEqual(15);
      expect(mod(st.injectStart - st.pilotEnd, cr.cycle)).toBeCloseTo(12, 6);
    }
    const pump = new FuelModel(cr, { ...systemsOf(cr.spec), fuelSystem: 'diesel-pump' });
    const p = pump.step(input(cr, { rpm: 2000, load: 0.6 }));
    expect(p.pilotEnd - p.pilotStart).toBe(0);
  });

  it('meters the fuel the air carries, rich only at full load as the design asks', () => {
    const e = design({ lambda: 0.86 });
    const air = newAirState();
    const params = airParams(e, systemsOf(e.spec));
    airStep(params, { rpm: 3000, load: 0.5, boost: 0, fuelCut: false }, air);
    expect(air.fuelGs).toBeCloseTo(air.airGs / 14.7, 9);
    airStep(params, { rpm: 3000, load: 1, boost: 0, fuelCut: false }, air);
    expect(air.lambda).toBeCloseTo(0.86, 9);
    expect(air.fuelGs).toBeCloseTo(air.airGs / (14.7 * 0.86), 9);
  });
});

describe('events between frames', () => {
  const model = new FuelModel(plain, systemsOf(plain.spec));
  const st0 = model.step(input(plain));
  const c = plain.cylinders[0]!;
  const sparkAt = mod(c.fire - st0.advance, 720);

  it('catches a spark that fell between two frames, and not twice', () => {
    expect(model.step(input(plain, { theta: sparkAt + 3, advance: 5 })).sparks[0]).toBe(1);
    expect(model.step(input(plain, { theta: sparkAt + 8, advance: 5 })).sparks[0]).toBe(0);
  });

  it('catches it across the end of the cycle', () => {
    // A frame from just before the spark to 3 degrees past the cycle's end.
    const wrapModel = new FuelModel(plain, systemsOf(plain.spec));
    const turned = mod(3 - sparkAt, 720) + 1;
    const st = wrapModel.step(input(plain, { theta: 3, advance: turned }));
    expect(st.sparks[0]).toBe(1);
    expect(3 - turned).toBeLessThan(0);
  });

  it('a frame of one and a half cycles fires everything once; a step backwards fires nothing', () => {
    const big = model.step(input(plain, { theta: 100, advance: 1080 }));
    expect([...big.sparks].every((x) => x === 1)).toBe(true);
    const back = model.step(input(plain, { theta: sparkAt + 1, advance: -3 }));
    expect([...back.sparks].every((x) => x === 0)).toBe(true);
  });

  it('takes the advance from how far the shown angle moved, not from the nominal speed', () => {
    // Drive nudges the shown angle: a frame that moved 9 degrees at a nominal 12 advances 9.
    expect(shownAdvance(100, 109, 12, 720)).toBeCloseTo(9, 9);
    expect(shownAdvance(715, 4, 12, 720)).toBeCloseTo(9, 9);
    // Pulled back, nothing happened; a dropped frame at speed keeps its whole cycles.
    expect(shownAdvance(100, 97, 12, 720)).toBe(0);
    expect(shownAdvance(100, 100 + 4200 - 5 * 720, 4200, 720)).toBeCloseTo(4200, 9);
    expect(shownAdvance(100, 100 + 4100 - 5 * 720, 4200, 720)).toBeCloseTo(4100, 9);
  });

  it('keeps its crank-degree windows in slow motion, where the systems run at idle', () => {
    const atIdle = model.step(input(plain, { rpm: plain.spec.idleRpm }));
    const width = mod(atIdle.injectEnd - atIdle.injectStart, 720);
    expect(width).toBeCloseTo(atIdle.pulseMs * 1e-3 * plain.spec.idleRpm * 6, 6);
    expect(width).toBeGreaterThan(10);
  });
});

describe('starting', () => {
  it('injects and sparks while the starter turns the engine, though EngineSim cuts the fuel sound', () => {
    for (const e of [plain, direct, buildEngine(engineById('i4d')!)]) {
      const sim = new SystemsSim();
      sim.configure(e);
      let sparks = 0;
      let shots = 0;
      for (let deg = 1; deg <= e.cycle; deg++) {
        const st = sim.step({ theta: deg, advance: 1, rpm: 240, load: 0.04, throttle: 0, boost: 0, running: false, cranking: true, fuelCut: true, live: true, dt: 1 / 1440, timeScale: 1 });
        sparks += [...st.fuel.sparks].reduce((a, b) => a + b, 0);
        shots += st.fuel.injecting[0]!;
      }
      const diesel = e.spec.fuel === 'diesel';
      expect(sparks, e.spec.id).toBe(diesel ? 0 : e.cylinders.length);
      expect(shots, e.spec.id).toBeGreaterThan(0);
      expect(sim.state.air.fuelGs, e.spec.id).toBeGreaterThan(0);
    }
  });
});

describe('the rotary’s plugs', () => {
  it('lead from below the short axis, where the rotor face sweeps down past them', async () => {
    const { vi } = await import('vitest');
    const context = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }), set: () => true });
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
    const { RotaryEngineModel } = await import('../src/scene/rotary-engine.ts');
    const r2 = buildEngine(engineById('r2')!);
    const model = new RotaryEngineModel(r2);
    const a = model.systemsAnchors();
    for (const p of a.plugs) {
      expect(p.leading.y).toBeLessThan(0);
      expect(p.trailing.y).toBeGreaterThan(0);
      expect(p.leading.x).toBeGreaterThan(0);
    }
    // The rotor turns clockwise seen from the front, so on the plug side (+x) its face moves downwards.
    const frame = { theta: 0, rpm: 800, load: 0.2, fuelCut: false, running: true, boost: 0, dt: 0.016, shake: 0 };
    const rotor = (model as unknown as { rotors: Array<{ group: { rotation: { z: number } } }> }).rotors[0]!.group;
    model.update(frame);
    const before = rotor.rotation.z;
    model.update({ ...frame, theta: 10 });
    expect(rotor.rotation.z).toBeLessThan(before);
    vi.unstubAllGlobals();
  });
});
