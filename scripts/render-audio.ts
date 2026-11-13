// Offline render of the engine synth for analysis: `npm run render-audio [ids...]`.
// Writes WAV files and a loudness table to .tmp/audio. `--dyno <ids>` puts the engines on the dyno; `--drive <car ids>`
// drives a car with its engine on its drivetrain (src/drivetrain/drive-story.ts) and prints each shift's drop.

import { mkdirSync, writeFileSync } from 'node:fs';
import { ENGINES, engineById } from '../src/data/engines.ts';
import { buildEngine } from '../src/engine/kinematics.ts';
import { EngineSynth, synthConfig, type SynthConfig } from '../src/audio/synth.ts';
import { DynoLoad, freePedalFor, sizeAbsorber, sweepEndRpm, sweepStartRpm, type AbsorberKind, type DynoCommand } from '../src/engine/dyno-load.ts';
import { LoadedCrank } from '../src/engine/loaded-crank.ts';
import { PEDAL_TOP_SPEED } from '../src/engine/sim.ts';
import { catalogueTorqueMap } from '../src/designer/torque-map.ts';
import { carById } from '../src/data/cars.ts';
import { buildCarDrive } from '../src/drivetrain/car-model.ts';
import { vehicleLoadSpec } from '../src/drivetrain/car-load.ts';
import { DriveStory, type StoryOptions } from '../src/drivetrain/drive-story.ts';
import { VehicleLoad } from '../src/vehicle/vehicle-load.ts';

const FS = 48000;
const OUT = '.tmp/audio';

export function floatToWav(left: Float32Array, right: Float32Array, fs: number): Buffer {
  const n = left.length;
  const data = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.max(-1, Math.min(1, left[i]!)) * 32767, i * 4);
    data.writeInt16LE(Math.max(-1, Math.min(1, right[i]!)) * 32767, i * 4 + 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(fs, 24);
  header.writeUInt32LE(fs * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** What the dyno does from the start of a step: let go, hold a speed on the pedal, run a sweep, or listen free. */
export type DynoStep = 'off' | { hold: number } | { sweep: { from: number; to: number; rate: number } } | { free: number };

export interface Step {
  seconds: number;
  pedal: number;
  /** Hold at an exact speed, for measurements. */
  rpm?: number;
  /** Puts the engine on the dyno, with its catalogue torque map. */
  dyno?: DynoStep;
}

export interface RenderOptions {
  absorber?: AbsorberKind;
  /** Changes to the synth's configuration, for experiments. */
  config?: (cfg: SynthConfig) => SynthConfig;
  /** Holds the variable valve gear at rest: phasers at park, the main cam, every cylinder firing. */
  park?: boolean;
}

export interface Rendered {
  l: Float32Array;
  r: Float32Array;
  rpm: Float32Array;
  /** The crank under load, when a step put the engine on the dyno. */
  crank: LoadedCrank | null;
  synth: EngineSynth;
}

export function render(id: string, steps: Step[], trim?: number, options: RenderOptions = {}): Rendered {
  const spec = engineById(id);
  if (!spec) throw new Error(`Unknown engine ${id}`);
  const base = synthConfig(buildEngine(options.park ? { ...spec, vvt: undefined } : spec), trim);
  const synth = new EngineSynth(options.config ? options.config(base) : base, FS);
  let crank: LoadedCrank | null = null;
  let load: DynoLoad | null = null;
  if (steps.some((s) => s.dyno !== undefined)) {
    const map = catalogueTorqueMap(spec);
    load = new DynoLoad(sizeAbsorber(map, options.absorber ?? 'eddy'));
    crank = new LoadedCrank(map, load);
    synth.sim.attach(crank);
  }
  synth.sim.start();
  const total = steps.reduce((a, s) => a + s.seconds, 0);
  const samples = Math.floor(total * FS);
  const l = new Float32Array(samples);
  const r = new Float32Array(samples);
  const rpm = new Float32Array(Math.ceil(samples / 128));
  let offset = 0;
  for (const step of steps) {
    const end = Math.min(samples, offset + Math.floor(step.seconds * FS));
    synth.sim.pedal = step.pedal;
    synth.sim.lockedRpm = step.rpm ?? null;
    if (step.dyno !== undefined && load) load.command(dynoCommand(step.dyno, spec.idleRpm, spec.redlineRpm));
    if (step.rpm !== undefined) {
      synth.sim.state = 'running';
      synth.sim.rpm = step.rpm;
      synth.sim.load = step.pedal;
    }
    while (offset < end) {
      const n = Math.min(128, end - offset);
      synth.process(l.subarray(offset, offset + n), r.subarray(offset, offset + n));
      rpm[Math.floor(offset / 128)] = synth.sim.rpm;
      offset += n;
    }
  }
  return { l, r, rpm, crank, synth };
}

function dynoCommand(step: DynoStep, idleRpm: number, redlineRpm: number): DynoCommand {
  if (step === 'off') return { kind: 'dyno', action: 'off' };
  if ('hold' in step) return { kind: 'dyno', action: 'hold', rpm: step.hold, throttle: null, keep: true };
  if ('free' in step) return { kind: 'dyno', action: 'free', pedal: freePedalFor(step.free, idleRpm, redlineRpm, PEDAL_TOP_SPEED) };
  return { kind: 'dyno', action: 'sweep', fromRpm: step.sweep.from, toRpm: step.sweep.to, rate: step.sweep.rate, throttle: 1 };
}

/** Idle, a held full-load point at half the limit, a 300 rpm/s sweep, the ramp down and idle again. */
export function dynoStory(id: string, rate = 300): Step[] {
  const spec = engineById(id)!;
  const map = catalogueTorqueMap(spec);
  const dyno = sizeAbsorber(map, 'eddy');
  const from = sweepStartRpm(map, dyno);
  const to = sweepEndRpm(dyno);
  return [
    { seconds: 2, pedal: 0, dyno: 'off' },
    { seconds: 8, pedal: 1, dyno: { hold: Math.round((0.5 * map.limitRpm) / 50) * 50 } },
    { seconds: 3 + (to - from) / rate + (to - from) / 1000, pedal: 0, dyno: { sweep: { from, to, rate } } },
    { seconds: 2, pedal: 0, dyno: 'off' },
  ];
}

export interface DriveRender {
  l: Float32Array;
  r: Float32Array;
  /** Engine speed and road speed, m/s, every 128 samples. */
  rpm: Float32Array;
  speed: Float32Array;
  story: DriveStory;
}

/**
 * A car with its catalogue engine on its drivetrain through the scripted drive: idle, the auto clutch's pull-away,
 * an upshift into every gear, braking to a stop and idle in neutral. The worklet's way: the synth steps the engine
 * every 16 samples and the driver acts between blocks of 128.
 */
export function renderDrive(carId: string, story?: Partial<StoryOptions>): DriveRender {
  const car = carById(carId);
  const spec = car && engineById(car.engine);
  if (!car || !spec) throw new Error(`Unknown car ${carId} or its engine`);
  const cd = buildCarDrive(carId);
  const synth = new EngineSynth(synthConfig(buildEngine(spec)), FS);
  const load = new VehicleLoad(vehicleLoadSpec(cd));
  synth.sim.attach(new LoadedCrank(cd.map, load));
  const drive = new DriveStory(cd, load, synth.sim);
  Object.assign(drive.o, story);
  const block = 128;
  const most = 120 * FS;
  const l = new Float32Array(most);
  const r = new Float32Array(most);
  const rpm = new Float32Array(most / block);
  const speed = new Float32Array(most / block);
  let offset = 0;
  while (!drive.done && offset + block <= most) {
    drive.drive(block / FS);
    synth.process(l.subarray(offset, offset + block), r.subarray(offset, offset + block));
    rpm[offset / block] = synth.sim.rpm;
    speed[offset / block] = load.chassis.v;
    offset += block;
  }
  return { l: l.slice(0, offset), r: r.slice(0, offset), rpm: rpm.slice(0, offset / block), speed: speed.slice(0, offset / block), story: drive };
}

export const rmsDb = (x: Float32Array, from = 0, to = x.length): number => {
  let sum = 0;
  for (let i = from; i < to; i++) sum += x[i]! * x[i]!;
  return 10 * Math.log10(sum / Math.max(1, to - from) + 1e-12);
};

export const peak = (x: Float32Array): number => {
  let m = 0;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]!));
  return m;
};

const STORY: Step[] = [
  { seconds: 3, pedal: 0 }, // start and idle
  { seconds: 1.2, pedal: 1 }, // blip to the limiter
  { seconds: 1.6, pedal: 0 }, // lift, pops
  { seconds: 1.5, pedal: 0.45 }, // part throttle
  { seconds: 2.2, pedal: 1 }, // full throttle and limiter
  { seconds: 2.5, pedal: 0 }, // back to idle
];

if (process.argv[1]?.endsWith('render-audio.ts') && process.argv.includes('--drive')) {
  // A car driven with its engine on its drivetrain: `npm run render-audio -- --drive bmw-m3-e30`.
  mkdirSync(OUT, { recursive: true });
  for (const id of process.argv.slice(2).filter((a) => a !== '--drive')) {
    const { l, r, story } = renderDrive(id);
    const file = `${OUT}/${id}-drive.wav`;
    writeFileSync(file, floatToWav(l, r, FS));
    console.log(file, (l.length / FS).toFixed(1), 's, peak', Math.max(peak(l), peak(r)).toFixed(2), ', top', (story.topSpeed * 3.6).toFixed(0), 'km/h');
    console.log('shift   lever s  rpm   km/h   drop  lock s  rpm  km/h  at lock  wheels   (rpm: before, i_new/i_old drop, at the lock,');
    console.log('                                                             the drop with the speed change, the wheels through the gear)');
    for (const x of story.shifts) {
      const f = (v: number | null, d = 0) => (v === null ? '—' : v.toFixed(d));
      console.log(
        `${x.from}→${x.to}`.padEnd(6), x.t.toFixed(2).padStart(7), f(x.rpmBefore).padStart(5), f(x.speedBefore * 3.6, 1).padStart(6), f(x.rpmDrop).padStart(6),
        f(x.tLocked, 2).padStart(7), f(x.rpmLocked).padStart(5), f(x.speedLocked === null ? null : x.speedLocked * 3.6, 1).padStart(5), f(x.rpmAtLock).padStart(8), f(x.rpmWheels).padStart(8),
      );
    }
  }
} else if (process.argv[1]?.endsWith('render-audio.ts') && process.argv.includes('--dyno')) {
  // The same engines under load: `npm run render-audio -- --dyno i3 v8-cross`.
  mkdirSync(OUT, { recursive: true });
  for (const id of process.argv.slice(2).filter((a) => a !== '--dyno')) {
    const { l, r } = render(id, dynoStory(id));
    writeFileSync(`${OUT}/${id.replace('/', '-')}-dyno.wav`, floatToWav(l, r, FS));
    console.log(`${OUT}/${id.replace('/', '-')}-dyno.wav`, (l.length / FS).toFixed(1), 's, peak', Math.max(peak(l), peak(r)).toFixed(2));
  }
} else if (process.argv[1]?.endsWith('render-audio.ts')) {
  mkdirSync(OUT, { recursive: true });
  const ids = process.argv.slice(2);
  const list = ids.length ? ids : ENGINES.map((e) => e.id);
  console.log('engine      idle   mid   wot  peak  crest  maxRpm');
  for (const id of list) {
    const spec = engineById(id)!;
    const { l, r, rpm } = render(id, STORY);
    writeFileSync(`${OUT}/${id}.wav`, floatToWav(l, r, FS));
    const hold = render(id, [
      { seconds: 0.6, pedal: 0, rpm: spec.idleRpm },
      { seconds: 1.5, pedal: 0, rpm: spec.idleRpm },
    ]);
    const mid = render(id, [
      { seconds: 0.6, pedal: 0.5, rpm: spec.redlineRpm * 0.5 },
      { seconds: 1, pedal: 0.5, rpm: spec.redlineRpm * 0.5 },
    ]);
    const wot = render(id, [
      { seconds: 0.6, pedal: 1, rpm: spec.redlineRpm * 0.85 },
      { seconds: 1, pedal: 1, rpm: spec.redlineRpm * 0.85 },
    ]);
    const skip = Math.floor(0.6 * FS);
    const idleDb = rmsDb(hold.l, skip);
    const midDb = rmsDb(mid.l, skip);
    const wotDb = rmsDb(wot.l, skip);
    const p = Math.max(peak(l), peak(r));
    console.log(
      id.padEnd(10),
      idleDb.toFixed(1).padStart(6),
      midDb.toFixed(1).padStart(5),
      wotDb.toFixed(1).padStart(5),
      p.toFixed(2).padStart(5),
      (20 * Math.log10(peak(hold.l) / Math.pow(10, idleDb / 20))).toFixed(1).padStart(6),
      Math.max(...rpm).toFixed(0).padStart(7),
    );
  }
}
