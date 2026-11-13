import { describe, expect, it, vi } from 'vitest';
import { engineById } from '../src/data/engines.ts';
import { resolveDesign } from '../src/designer/constraints.ts';
import { DEFAULT_DESIGN, type Design } from '../src/designer/design.ts';
import { compressorOutletK, evaluate, superchargerRatio } from '../src/designer/physics.ts';
import { designToSpec } from '../src/designer/to-spec.ts';
import { buildEngine, intakeLift, mod, type Engine } from '../src/engine/kinematics.ts';
import { systemsOf } from '../src/engine/systems-spec.ts';
import { PistonEngineModel } from '../src/scene/piston-engine.ts';
import { SystemsLayers } from '../src/scene/systems/index.ts';
import { runnerChannel } from '../src/scene/systems/routes-air.ts';
import { AMBIENT_C, airParams, airStep, newAirState } from '../src/systems/air.ts';
import { SystemsSim } from '../src/systems/sim.ts';
import { fourStrokeLitres, litresPerRev, strokeM } from '../src/systems/size.ts';

const context = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }), set: () => true });
vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });

const design = (over: Partial<Design>): Engine => {
  const d = resolveDesign({ ...DEFAULT_DESIGN, throws: [], ...over });
  return buildEngine(designToSpec(d, evaluate(d)));
};

const flow = (engine: Engine, rpm: number, load: number, boost = 0) => {
  const out = newAirState();
  airStep(airParams(engine, systemsOf(engine.spec)), { rpm, load, boost, fuelCut: false }, out);
  return out;
};

describe('air', () => {
  it('flows in proportion to displacement, speed and throttle', () => {
    const two = design({});
    const four = design({ bore: 86 * Math.SQRT2, stroke: 86, intakeValve: 40, exhaustValve: 34 });
    expect(flow(two, 4000, 1).airGs / flow(two, 2000, 1).airGs).toBeCloseTo(2, 6);
    expect(flow(four, 2000, 1).airGs / flow(two, 2000, 1).airGs).toBeCloseTo(litresPerRev(four) / litresPerRev(two), 6);
    // The throttle passes 15 % at rest and all of it wide open.
    expect(flow(two, 2000, 0).airGs / flow(two, 2000, 1).airGs).toBeCloseTo(0.15, 6);
    // A 2-litre four at idle and at full throttle near its limit.
    expect(flow(two, 800, 0.15).airGs).toBeGreaterThan(3);
    expect(flow(two, 800, 0.15).airGs).toBeLessThan(4.5);
    expect(flow(two, 6500, 1).airGs).toBeGreaterThan(100);
    expect(flow(two, 6500, 1).airGs).toBeLessThan(120);
  });

  it('counts a rotor as taking one chamber a shaft turn: 1.31 L a turn for a 13B, 2.6 L as a four-stroke', () => {
    const r2 = buildEngine(engineById('r2')!);
    expect(litresPerRev(r2)).toBeCloseTo(1.309, 2);
    expect(fourStrokeLitres(r2)).toBeCloseTo(2.62, 1);
    expect(strokeM(r2.spec)).toBeCloseTo(0.06, 6);
  });

  it('heats compressed air as the designer’s model does, and the intercooler takes most of it back', () => {
    expect(compressorOutletK(2) - 273).toBeCloseTo(116, -0.5);
    const turbo = design({ charger: 'turbo', boostBar: 1, intercooler: 0.7 });
    const st = flow(turbo, 5000, 1, 1);
    expect(st.pressureRatio).toBeCloseTo(2, 6);
    expect(st.compressorC).toBeCloseTo(compressorOutletK(2) - 273, 6);
    expect(st.chargeC).toBeCloseTo(52, -0.5);
    expect(flow(design({}), 5000, 1).chargeC).toBe(AMBIENT_C);
  });

  it('gives a supercharger at full throttle the designer’s pressure ratio', () => {
    const roots = design({ charger: 'roots', boostBar: 0.6 });
    for (const rpm of [1000, 2500, 6000]) {
      expect(flow(roots, rpm, 1).pressureRatio).toBeCloseTo(superchargerRatio('roots', 0.6, rpm, strokeM(roots.spec)), 9);
    }
    // At part throttle the bypass valve stands open.
    expect(flow(roots, 3000, 0.2).pressureRatio).toBe(1);
  });

  it('pulses each runner only while its intake valve is open', () => {
    const engine = buildEngine(engineById('i4')!);
    const model = new PistonEngineModel(engine);
    const layers = new SystemsLayers(engine, model);
    layers.set('air', true);
    const layer = layers.layer('air')!;
    const sim = new SystemsSim();
    sim.configure(engine);
    const c = engine.cylinders[0]!;
    const channel = layer.channel(runnerChannel(c.n));
    for (const phi of [100, 470, 650]) {
      const theta = mod(c.fire + phi, 720);
      const state = sim.step({ theta, advance: 1, rpm: 3000, load: 0.6, throttle: 0.5, boost: 0, running: true, cranking: false, fuelCut: false, live: true, dt: 0.016, timeScale: 1 });
      layers.update(state, theta, 0.016);
      const open = intakeLift(phi, engine.timing) > 0;
      if (open) expect(layer.values.level[channel]!).toBeGreaterThan(0.3);
      else expect(layer.values.level[channel]!).toBeCloseTo(0.12, 6);
    }
  });
});
