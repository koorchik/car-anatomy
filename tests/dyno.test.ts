import { describe, expect, it } from 'vitest';
import { ENGINES, engineById, pageChoices } from '../src/data/engines.ts';
import { synthConfig } from '../src/audio/synth.ts';
import { resolveDesign } from '../src/designer/constraints.ts';
import { DEFAULT_DESIGN } from '../src/designer/design.ts';
import { evaluate } from '../src/designer/physics.ts';
import { designToSpec } from '../src/designer/to-spec.ts';
import { catalogueTorqueMap, torqueMapFor } from '../src/designer/torque-map.ts';
import {
  DynoLoad,
  absorberMax,
  absorberMin,
  freePedalFor,
  holdRange,
  sizeAbsorber,
  sweepEndRpm,
  sweepStartRpm,
  type AbsorberKind,
  type DynoCommand,
} from '../src/engine/dyno-load.ts';
import { buildEngine } from '../src/engine/kinematics.ts';
import type { CrankLoad, EngineRequest, LoadReadings } from '../src/engine/load.ts';
import { LoadedCrank, type CrankReadings } from '../src/engine/loaded-crank.ts';
import { EngineSim, PEDAL_TOP_SPEED, type SimParams } from '../src/engine/sim.ts';
import { ATM_BAR, brakeTorque, mapValue, peakPower, peakTorque, type EngineTorqueMap } from '../src/engine/torque-map.ts';

const DT = 1 / 3000;
const RAD = Math.PI / 30;

interface Rig {
  sim: EngineSim;
  load: DynoLoad;
  crank: LoadedCrank;
  map: EngineTorqueMap;
  params: SimParams;
}

const paramsFor = (id: string): SimParams => (id === 'designer' ? designedParams() : synthConfig(buildEngine(engineById(id)!)).sim);
const designed = resolveDesign({ ...DEFAULT_DESIGN, throws: [] });
const designedParams = (): SimParams => synthConfig(buildEngine(designToSpec(designed, evaluate(designed)))).sim;
const mapFor = (id: string): EngineTorqueMap => (id === 'designer' ? torqueMapFor(designed) : catalogueTorqueMap(engineById(id)!));

/** An engine idling on the dyno, the absorber off. */
function rig(id: string, absorber: AbsorberKind = 'eddy', idle = 2): Rig {
  const map = mapFor(id);
  const params = paramsFor(id);
  const sim = new EngineSim(params);
  const load = new DynoLoad(sizeAbsorber(map, absorber));
  const crank = new LoadedCrank(map, load);
  sim.start();
  run(sim, idle);
  sim.attach(crank);
  return { sim, load, crank, map, params };
}

function run(sim: EngineSim, seconds: number, onStep?: (t: number) => void, dt = DT): void {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    sim.step(dt);
    onStep?.(i * dt);
  }
}

type WithoutKind<T> = T extends unknown ? Omit<T, 'kind'> : never;
const cmd = (r: Rig, c: WithoutKind<DynoCommand>): void => r.load.command({ kind: 'dyno', ...c } as DynoCommand);
const hold = (r: Rig, rpm: number, throttle: number | null = null): void => cmd(r, { action: 'hold', rpm, throttle, keep: true });

interface Bin {
  rpm: number;
  measured: number;
  engine: number;
  alpha: number;
  n: number;
}

/** Runs a full-throttle sweep and collects 25 rpm bins of the ramp, as the dyno's software does. */
function sweep(r: Rig, rate: number, dt = DT): { bins: Bin[]; from: number; to: number; readings: CrankReadings[] } {
  const from = sweepStartRpm(r.map, r.load.spec);
  const to = sweepEndRpm(r.load.spec);
  cmd(r, { action: 'sweep', fromRpm: from, toRpm: to, rate, throttle: 1 });
  r.crank.readings();
  const bins = new Map<number, Bin>();
  const readings: CrankReadings[] = [];
  const every = Math.max(1, Math.round(1 / 300 / dt));
  let step = 0;
  run(
    r.sim,
    4 + 2 + (to - from) / rate + (to - from) / 1000 + 1,
    () => {
      if (++step % every) return;
      const reading = r.crank.readings();
      readings.push(reading);
      const d = reading.load;
      if (d.phase !== 'ramp') return;
      const key = Math.floor(d.rpm / 25);
      const bin = bins.get(key) ?? { rpm: 0, measured: 0, engine: 0, alpha: 0, n: 0 };
      bin.rpm += d.rpm * d.samples;
      bin.measured += d.measuredNm * d.samples;
      bin.engine += reading.engineNm * d.samples;
      bin.alpha += d.alpha * d.samples;
      bin.n += d.samples;
      bins.set(key, bin);
    },
    dt,
  );
  const list = [...bins.values()].map((b) => ({ rpm: b.rpm / b.n, measured: b.measured / b.n, engine: b.engine / b.n, alpha: b.alpha / b.n, n: b.n }));
  return { bins: list.sort((a, b) => a.rpm - b.rpm), from, to, readings };
}

const LIST = ['i4', 'v8-cross', 'i3', 'i4d', 'r2', 'w16', 'i1/honda-cg125', 'designer'];
const NA = ['i4', 'v8-cross', 'i1/honda-cg125', 'designer'];

describe('absorber envelopes, after Martyr & Plint', () => {
  const map = catalogueTorqueMap(engineById('v8-cross')!);

  it('an eddy-current brake is weak only near standstill, then torque-limited, then power-limited', () => {
    const spec = sizeAbsorber(map, 'eddy');
    const base = (spec.ratedKw * 1000) / spec.ratedNm / RAD;
    expect(absorberMax(spec, 0)).toBe(0);
    expect(absorberMax(spec, 0.3 * base)).toBeCloseTo(spec.ratedNm, 6);
    expect(absorberMax(spec, 0.9 * base)).toBeCloseTo(spec.ratedNm, 6);
    for (const share of [1.2, 1.5]) {
      const rpm = share * base;
      expect((absorberMax(spec, rpm) * rpm * RAD) / 1000 / spec.ratedKw).toBeCloseTo(1, 3);
    }
    expect(absorberMax(spec, spec.maxRpm + 1)).toBe(0);
  });

  it('a water brake holds torque as the square of speed', () => {
    const spec = sizeAbsorber(map, 'water');
    const base = (spec.ratedKw * 1000) / spec.ratedNm / RAD;
    const a = absorberMax(spec, 0.2 * base);
    const b = absorberMax(spec, 0.4 * base);
    expect(b / a).toBeCloseTo(4, 3);
    expect(absorberMin(spec, 0.4 * base)).toBeLessThan(b);
  });

  it('is sized with margin over the engine, and rotor inertias follow the Horiba ranges', () => {
    for (const id of LIST) {
      const m = mapFor(id);
      for (const kind of ['eddy', 'water'] as const) {
        const spec = sizeAbsorber(m, kind);
        expect(spec.ratedNm).toBeGreaterThanOrEqual(1.3 * peakTorque(m).nm);
        expect(spec.ratedKw).toBeGreaterThanOrEqual(1.3 * peakPower(m).kw);
        expect(spec.maxRpm).toBeGreaterThan(spec.limitRpm);
      }
    }
    // Horiba WT190, WT300, WT470: 600, 1200, 3000 N·m and 0.17, 0.49, 1.96 kg·m². DT700, DT1200: 3000, 7500 N·m, 0.30, 1.2.
    const eddy = (nm: number): number => 0.17 * (nm / 600) ** 1.5;
    const water = (nm: number): number => 0.3 * (nm / 3000) ** 1.5;
    for (const [nm, j] of [[600, 0.17], [1200, 0.49], [3000, 1.96]] as const) expect(Math.abs(eddy(nm) / j - 1)).toBeLessThan(0.05);
    for (const [nm, j] of [[3000, 0.3], [7500, 1.2]] as const) expect(Math.abs(water(nm) / j - 1)).toBeLessThan(0.05);
  });
});

describe('steady state: the absorber holds the speed and equals the engine', () => {
  it.each(LIST)('%s', (id) => {
    const r = rig(id);
    const target = Math.round((0.5 * r.map.limitRpm) / 50) * 50;
    hold(r, target);
    r.sim.pedal = 1;
    run(r.sim, 7);
    let worst = 0;
    run(r.sim, 3, () => {
      worst = Math.max(worst, Math.abs(r.sim.rpm - target));
    });
    r.crank.readings();
    run(r.sim, 1);
    const reading = r.crank.readings();
    const top = peakTorque(r.map).nm;
    expect(worst).toBeLessThan(10);
    expect(Math.abs(reading.load.measuredNm - reading.engineNm)).toBeLessThan(0.003 * top);
    expect(Math.abs(reading.engineNm / mapValue(r.map, r.map.wotNm, reading.load.rpm) - 1)).toBeLessThan(0.005);
    expect(r.sim.fuelCut).toBe(false);
  });
});

describe('a slow sweep draws the steady full-load curve', () => {
  it.each(LIST)('%s at 150 rpm/s on an eddy-current brake', (id) => {
    const r = rig(id);
    const { bins, from, to } = sweep(r, 150);
    const top = peakTorque(r.map).nm;
    const start = r.map.boostKind === 'turbo' ? Math.max(from + 300, r.map.spoolRpm + 1000) : from + 300;
    const inertiaNm = r.map.inertia * 150 * RAD;
    const checked = bins.filter((b) => b.rpm > start && b.rpm < to - 100);
    expect(checked.length).toBeGreaterThan(20);
    for (const b of checked) expect(Math.abs(mapValue(r.map, r.map.wotNm, b.rpm) - b.measured)).toBeLessThan(inertiaNm + 0.01 * top);
  });

  it.each(NA)('%s at 600 rpm/s reads low by exactly J·ε, and the inertia correction takes it back', (id) => {
    const r = rig(id);
    const { bins, from, to } = sweep(r, 600);
    const checked = bins.filter((b) => b.rpm > from + 300 && b.rpm < to - 100);
    const shortfall = checked.reduce((sum, b) => sum + (mapValue(r.map, r.map.wotNm, b.rpm) - b.measured), 0) / checked.length;
    const expected = r.map.inertia * 600 * RAD;
    expect(Math.abs(shortfall / expected - 1)).toBeLessThan(0.1);
    for (const b of checked) {
      const corrected = b.measured + r.map.inertia * b.alpha;
      expect(Math.abs(corrected / mapValue(r.map, r.map.wotNm, b.rpm) - 1)).toBeLessThan(0.005);
    }
  });

  it('corrected for inertia, the rate does not matter on a naturally aspirated engine (as Rototest found)', () => {
    const slow = sweep(rig('i4'), 150).bins;
    const fast = sweep(rig('i4'), 1200).bins;
    const corrected = (b: Bin): number => b.measured + mapFor('i4').inertia * b.alpha;
    let compared = 0;
    for (const b of fast) {
      const twin = slow.find((s) => Math.abs(s.rpm - b.rpm) < 12.5);
      if (!twin || b.rpm < 3000) continue;
      expect(Math.abs(corrected(b) / corrected(twin) - 1)).toBeLessThan(0.01);
      compared++;
    }
    expect(compared).toBeGreaterThan(50);
  });

  it('but a turbo engine still sags where the turbo comes in on a fast sweep', () => {
    const map = mapFor('i3');
    const slow = sweep(rig('i3'), 150).bins;
    const fast = sweep(rig('i3'), 1200).bins;
    const corrected = (b: Bin): number => b.measured + map.inertia * b.alpha;
    let worst = 0;
    for (const b of fast) {
      const twin = slow.find((s) => Math.abs(s.rpm - b.rpm) < 12.5);
      if (!twin || b.rpm > map.spoolRpm + 1000) continue;
      worst = Math.max(worst, 1 - corrected(b) / corrected(twin));
    }
    expect(worst).toBeGreaterThan(0.05);
  });
});

describe('the turbo spools up at a held speed as Honda R&D measured', () => {
  // Honda R&D Technical Review, October 2009: from no load to full load the boost reaches its target in about 1.5 s
  // at 1500 rpm, sooner at higher speed, and 0.5-1 s near 3000 rpm.
  const t90 = (rpm: number): number => {
    const r = rig('i3');
    hold(r, rpm, 0.15);
    run(r.sim, 6);
    hold(r, rpm, 1);
    const target = (mapValue(r.map, r.map.pressureRatio, rpm) - 1) * ATM_BAR;
    let open = -1;
    let reached = -1;
    run(r.sim, 10, (t) => {
      const reading = r.crank.readings();
      if (open < 0 && reading.load.throttle >= 0.999) open = t;
      if (reached < 0 && reading.manifoldBar >= 0.9 * target) reached = t;
    });
    return reached - open;
  };
  const map = mapFor('i3');
  const times = [1500, 2000, 2500, 3000].map(t90);

  it('takes 1-3 s at 1500 rpm', () => {
    expect(times[0]!).toBeGreaterThan(1);
    expect(times[0]!).toBeLessThan(3);
  });

  it('gets quicker with speed, as the exhaust flow grows', () => {
    // Up to 2500 rpm, where this engine's boost target is still low. Above it the target grows fast, and a first-order
    // lag towards a higher target can take a touch longer; both stay well under the time at 1500.
    expect(times[1]!).toBeLessThan(times[0]!);
    expect(times[2]!).toBeLessThan(times[1]!);
    expect(times[3]!).toBeLessThan(times[0]! / 2);
  });

  it('takes under a second where full boost first arrives', () => {
    expect(t90(map.spoolRpm)).toBeLessThan(1);
  });

  it('settles at the boost the model gives for that speed', () => {
    const r = rig('i3');
    hold(r, 3500, 1);
    run(r.sim, 8);
    r.crank.readings();
    run(r.sim, 0.5);
    expect(r.crank.readings().manifoldBar).toBeCloseTo((mapValue(r.map, r.map.pressureRatio, 3500) - 1) * ATM_BAR, 1);
  });
});

describe('a water brake cannot hold full load at low speed', () => {
  it('lets the engine climb until its square-law torque meets the engine', () => {
    const r = rig('v8-cross', 'water');
    hold(r, 1500);
    r.sim.pedal = 1;
    run(r.sim, 8);
    r.crank.readings();
    run(r.sim, 1);
    const reading = r.crank.readings();
    const rpm = reading.load.rpm;
    expect(rpm).toBeGreaterThan(1800);
    const most = absorberMax(r.load.spec, rpm);
    expect(Math.abs(most - brakeTorque(r.map, rpm, 1))).toBeLessThan(0.02 * r.load.spec.ratedNm);
    expect(reading.load.tracking).toBe('absorber-weak');
  });
});

describe('with the absorber off the engine runs free, only slower', () => {
  it.each(['i4', 'v8-cross', 'i3'])('%s holds a part-pedal speed far from the limiter', (id) => {
    const r = rig(id);
    r.sim.pedal = 0.5;
    let cut = false;
    run(r.sim, 8, () => {
      cut ||= r.sim.fuelCut && r.sim.rpm > r.params.idleRpm * 1.5;
    });
    expect(r.sim.rpm).toBeLessThan(0.8 * r.params.redlineRpm);
    expect(cut).toBe(false);
  });

  it.each(['i4', 'v8-cross', 'i1/honda-cg125'])('%s takes longer to rev than off the dyno, by the rotor it now turns', (id) => {
    const reach = (onDyno: boolean): number => {
      const r = rig(id);
      if (!onDyno) r.sim.attach(null);
      r.sim.pedal = 1;
      let reached = Infinity;
      run(r.sim, 20, (t) => {
        if (reached === Infinity && r.sim.rpm >= r.params.redlineRpm) reached = t;
      });
      return reached;
    };
    const free = reach(false);
    const loaded = reach(true);
    const ratio = (mapFor(id).inertia + sizeAbsorber(mapFor(id), 'eddy').inertia) / mapFor(id).inertia;
    expect(loaded).toBeGreaterThanOrEqual(free);
    expect(Math.abs(loaded / free / ratio - 1)).toBeLessThan(0.15);
  });

  it('the inertia goes away with the dyno: the free path is bit for bit what it was', () => {
    const story = (sim: EngineSim): number[] => {
      const out: number[] = [];
      sim.start();
      run(sim, 2);
      sim.pedal = 1;
      run(sim, 1.5, () => out.push(sim.rpm, sim.angle, sim.load, sim.boost));
      sim.pedal = 0;
      run(sim, 2, () => out.push(sim.rpm, sim.angle, sim.load, sim.boost));
      return out;
    };
    const plain = new EngineSim(paramsFor('i3'));
    const used = new EngineSim(paramsFor('i3'));
    const map = mapFor('i3');
    used.attach(new LoadedCrank(map, new DynoLoad(sizeAbsorber(map, 'eddy'))));
    used.step(DT);
    used.attach(null);
    const fresh = new EngineSim(paramsFor('i3'));
    fresh.step(DT);
    expect(story(used)).toEqual(story(fresh));
    expect(plain.inertiaShare).toBe(1);
  });
});

describe('idle under the loaded crank', () => {
  it.each(['i4', 'v8-cross', 'i1/honda-cg125', 'r2', 'i4d'])('%s drops to idle when the pedal is released on a hold above it', (id) => {
    const r = rig(id);
    hold(r, r.map.idleRpm + 1500);
    r.sim.pedal = 0.6;
    run(r.sim, 4);
    r.sim.pedal = 0;
    run(r.sim, 5);
    const reading = r.crank.readings();
    expect(reading.coupled).toBe(true);
    expect(Math.abs(r.sim.rpm - r.map.idleRpm)).toBeLessThan(0.12 * r.map.idleRpm);
    expect(r.sim.state).toBe('running');
  });

  it.each(['w16', 'v8-cross/amg-c63s-m177'])('%s, with the most torque for its inertia, comes back to idle without hunting', (id) => {
    const r = rig(id);
    hold(r, r.map.idleRpm + 1500);
    run(r.sim, 0.5);
    r.sim.rpm = r.map.idleRpm * 0.8;
    let peak = 0;
    let lastOff = 0;
    run(r.sim, 4, (t) => {
      peak = Math.max(peak, r.sim.rpm);
      if (Math.abs(r.sim.rpm / r.map.idleRpm - 1) > 0.03) lastOff = t;
    });
    expect(peak).toBeLessThan(1.15 * r.map.idleRpm);
    expect(lastOff).toBeLessThan(2);
  });
});

describe('starting on the dyno', () => {
  /** An engine on the dyno, not yet started, the absorber already told to hold a speed above idle. */
  const parked = (id: string, absorber: AbsorberKind = 'eddy'): Rig => {
    const map = mapFor(id);
    const params = paramsFor(id);
    const sim = new EngineSim(params);
    const load = new DynoLoad(sizeAbsorber(map, absorber));
    const crank = new LoadedCrank(map, load);
    sim.attach(crank);
    return { sim, load, crank, map, params };
  };

  it('every catalogue engine starts with the hold already chosen, and the hold takes it once it idles', () => {
    // The step of the audio thread, so 131 engines stay quick.
    const dt = 16 / 44100;
    const failed: string[] = [];
    for (const page of ENGINES) {
      for (const choice of pageChoices(page.id)) {
        const r = parked(choice.id);
        hold(r, r.map.idleRpm + 1500);
        r.sim.start();
        run(r.sim, 4, undefined, dt);
        const at4 = r.sim.state;
        run(r.sim, 3, undefined, dt);
        r.crank.readings();
        run(r.sim, 1, undefined, dt);
        const reading = r.crank.readings();
        const idle = Math.abs(r.sim.rpm / r.map.idleRpm - 1) < 0.1;
        if (at4 !== 'running' || r.sim.state !== 'running' || !reading.coupled || !idle) {
          failed.push(`${choice.id}: ${at4} at 4 s, ${r.sim.state} ${Math.round(r.sim.rpm)} rpm at 8 s`);
        }
      }
    }
    expect(failed).toEqual([]);
  });

  it.each(['i4', 'i1', 'i1/honda-cg125', 'i6d/bmw-530d-b57', 'v2/ducati-1299-panigale'])('%s stopped under a hold starts again', (id) => {
    const r = rig(id);
    hold(r, r.map.idleRpm + 1500);
    r.sim.pedal = 0.5;
    run(r.sim, 3);
    r.sim.pedal = 0;
    r.sim.stop();
    run(r.sim, 8);
    expect(r.sim.state).toBe('off');
    r.sim.start();
    run(r.sim, 7);
    r.crank.readings();
    run(r.sim, 1);
    expect(r.sim.state).toBe('running');
    expect(r.crank.readings().coupled).toBe(true);
    expect(Math.abs(r.sim.rpm / r.map.idleRpm - 1)).toBeLessThan(0.1);
  });
});

describe('the rev limiter and fuel under load', () => {
  it('a hold above the limit is brought under it, and full load never touches the limiter', () => {
    const r = rig('v8-cross');
    hold(r, r.map.limitRpm + 500);
    r.sim.pedal = 1;
    run(r.sim, 6);
    let top = 0;
    let cut = false;
    run(r.sim, 10, () => {
      top = Math.max(top, r.sim.rpm);
      cut ||= r.sim.fuelCut;
    });
    expect(top).toBeLessThan(r.map.limitRpm);
    expect(top).toBeGreaterThan(holdRange(r.load.spec).max - 20);
    expect(cut).toBe(false);
  });

  it('with the absorber off the same pedal reaches the limiter and the fuel is cut', () => {
    const r = rig('v8-cross');
    r.sim.pedal = 1;
    let cut = false;
    run(r.sim, 10, () => {
      cut ||= r.sim.fuelCut && r.sim.rpm > r.params.redlineRpm - 200;
    });
    expect(cut).toBe(true);
  });

  it('a sweep keeps full load and fuel on; the ramp down afterwards is a real overrun', () => {
    const r = rig('v8-cross');
    let cutInRun = false;
    let lowLoad = 1;
    let overrunCut = false;
    const from = sweepStartRpm(r.map, r.load.spec);
    const to = sweepEndRpm(r.load.spec);
    cmd(r, { action: 'sweep', fromRpm: from, toRpm: to, rate: 300, throttle: 1 });
    run(r.sim, 6 + (to - from) / 300 + (to - from) / 1000, () => {
      const reading = r.crank.readings().load;
      if (reading.phase === 'settle' || reading.phase === 'ramp') cutInRun ||= r.sim.fuelCut;
      if (reading.phase === 'ramp') lowLoad = Math.min(lowLoad, r.sim.load);
      if (reading.phase === 'rampdown' && r.sim.rpm > 1.25 * r.map.idleRpm && reading.throttle < 0.01) overrunCut ||= r.sim.fuelCut;
    });
    expect(cutInRun).toBe(false);
    expect(lowLoad).toBeGreaterThan(0.98);
    expect(overrunCut).toBe(true);
  });

  it('a free-revving engine at the limiter spends much of its time with fuel off, so its load is lower', () => {
    const r = rig('v8-cross');
    r.sim.attach(null);
    r.sim.pedal = 1;
    run(r.sim, 6);
    let sum = 0;
    let n = 0;
    run(r.sim, 2, () => {
      sum += r.sim.load;
      n++;
    });
    expect(sum / n).toBeLessThan(0.7);
  });
});

describe('the controller', () => {
  it.each(['eddy', 'water'] as const)('%s brake follows a 300 rpm/s sweep within 30 rpm', (absorber) => {
    const r = rig('v8-cross', absorber);
    const from = sweepStartRpm(r.map, r.load.spec);
    cmd(r, { action: 'sweep', fromRpm: from, toRpm: sweepEndRpm(r.load.spec), rate: 300, throttle: 1 });
    let rampTime = 0;
    let worst = 0;
    run(r.sim, 6 + (sweepEndRpm(r.load.spec) - from) / 300, () => {
      const reading = r.crank.readings().load;
      if (reading.phase !== 'ramp') return;
      rampTime += reading.seconds;
      if (rampTime > 0.5) worst = Math.max(worst, Math.abs(reading.rpm - reading.setpointRpm!));
    });
    expect(rampTime).toBeGreaterThan(5);
    expect(worst).toBeLessThan(30);
  });

  it('gives the same curve on the audio thread and on the main thread, whatever the step', () => {
    const curves = [DT, 16 / 44100, 0.005, 1 / 240].map((dt) => sweep(rig('i4'), 300, dt).bins);
    const reference = curves[0]!;
    for (const curve of curves.slice(1)) {
      let compared = 0;
      for (const b of curve) {
        const twin = reference.find((s) => Math.abs(s.rpm - b.rpm) < 12.5);
        if (!twin || b.rpm < 3000) continue;
        expect(Math.abs(b.measured / twin.measured - 1)).toBeLessThan(0.005);
        compared++;
      }
      expect(compared).toBeGreaterThan(30);
    }
  });

  it('takes hold without a jolt', () => {
    const r = rig('v8-cross');
    r.sim.pedal = 0.35;
    run(r.sim, 6);
    const start = r.sim.rpm;
    expect(start).toBeGreaterThan(2000);
        hold(r, start);
    let worst = 0;
    run(r.sim, 2, () => {
      worst = Math.max(worst, Math.abs(r.sim.rpm - start));
    });
    expect(worst).toBeLessThan(30);
  });

  it('lets go for "listen without load" and the free engine keeps the same revs', () => {
    const r = rig('v8-cross');
    hold(r, 3000);
    r.sim.pedal = 1;
    run(r.sim, 6);
    cmd(r, { action: 'free', pedal: freePedalFor(3000, r.params.idleRpm, r.params.redlineRpm, PEDAL_TOP_SPEED) });
    run(r.sim, 3);
    r.crank.readings();
    run(r.sim, 1);
    expect(Math.abs(r.sim.rpm - 3000)).toBeLessThan(150);
    expect(r.sim.load).toBeLessThan(0.4);
    expect(r.crank.readings().coupled).toBe(false);
  });
});

/** A stand-in for a future drivetrain: always coupled, its torque and requests set by the test. */
class StubLoad implements CrankLoad {
  torque = 0;
  request: EngineRequest | null = null;
  active(): boolean {
    return true;
  }
  inertia(): number {
    return 0.05;
  }
  step(): { torqueNm: number; dTorque: number } {
    return { torqueNm: this.torque, dTorque: 0 };
  }
  engineRequest(): EngineRequest | null {
    return this.request;
  }
  command(): void {}
  engage(): void {}
  readings(): LoadReadings {
    return {} as LoadReadings;
  }
}

describe('hooks the drivetrain will use', () => {
  const stubbed = (): { sim: EngineSim; stub: StubLoad; crank: LoadedCrank } => {
    const map = mapFor('i4');
    const sim = new EngineSim(paramsFor('i4'));
    sim.start();
    run(sim, 2);
    const stub = new StubLoad();
    const crank = new LoadedCrank(map, stub);
    sim.attach(crank);
    return { sim, stub, crank };
  };

  it('a load can cut the ignition for a moment, as for a flat shift', () => {
    const { sim, stub, crank } = stubbed();
    sim.pedal = 0.6;
    stub.torque = 60;
    run(sim, 2);
    stub.request = { cutFuel: true, throttle: 0.6 };
    crank.readings();
    let cut = true;
    run(sim, 0.1, () => {
      cut &&= sim.fuelCut;
    });
    const during = crank.readings();
    expect(cut).toBe(true);
    expect(during.engineNm).toBeLessThan(0);
    stub.request = null;
    run(sim, 0.2);
    expect(sim.fuelCut).toBe(false);
    expect(crank.readings().engineNm).toBeGreaterThan(0);
  });

  it('a load the engine cannot turn stalls it', () => {
    const { sim, stub } = stubbed();
    stub.torque = 3 * peakTorque(mapFor('i4')).nm;
    run(sim, 3);
    expect(sim.state === 'stopping' || sim.state === 'off').toBe(true);
  });

  it('a load can turn a stopped engine, as a car rolling in gear would', () => {
    const { sim, stub } = stubbed();
    sim.stop();
    run(sim, 3);
    expect(sim.state).toBe('off');
    stub.torque = -80;
    run(sim, 1);
    expect(sim.rpm).toBeGreaterThan(200);
    expect(sim.fuelCut).toBe(true);
  });
});
