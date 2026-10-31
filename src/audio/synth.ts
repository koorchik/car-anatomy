// Physically informed engine sound. No samples: every noise is derived from the crank angle.
//
//   cylinder blowdown pulses -> primary pipes -> collectors -> mid pipes -> mufflers -> tailpipe
//   intake suction pulses    -> runners -> plenum
//   ignition events          -> block structure resonances
//
// This follows the structure of the pipe models in the Sound Design Toolkit and of
// Baldan et al., "Physically informed car engine sound synthesis" (2015).

import { mod, type Engine } from '../engine/kinematics.ts';
import { EngineSim, type SimParams } from '../engine/sim.ts';
import { LOUDNESS_TRIM } from './loudness-trim.ts';
import { Biquad, Noise, OnePoleHP, OnePoleLP, Pipe, softClip } from './dsp.ts';

export type ListenPosition = 'exhaust' | 'bay' | 'cabin';

const HOT_SOUND_SPEED = 480; // m/s in exhaust gas
const COLD_SOUND_SPEED = 345; // m/s in intake air

export interface SynthCylinder {
  fire: number;
  /** Crank angle at which the exhaust opens. */
  evo: number;
  /** Crank angle at which the intake opens. */
  ivo: number;
  group: number;
  headerM: number;
}

export interface SynthConfig {
  sim: SimParams;
  cylinders: SynthCylinder[];
  groupPans: number[];
  pipeM: number;
  open: number;
  rasp: number;
  trim: number;
  isDiesel: boolean;
  /** Exhaust port opens abruptly, as in a Wankel engine. */
  sharpPort: boolean;
  rough: number;
  pops: number;
  /** Audible share of the turbo's whistle. */
  turboWhine: number;
  /** Audible share of the boost dumped when the throttle closes. */
  blowoff: number;
  displacementCc: number;
  /** Number of turbochargers, 0 for none. */
  turbos: number;
  /** Mechanical supercharger, a whine locked to the crank. */
  supercharger: boolean;
  /** Intake runner length, metres. */
  intakeM: number;
}

export function synthConfig(engine: Engine, trimOverride?: number): SynthConfig {
  const spec = engine.spec;
  const header = spec.exhaust.headerM;
  const groups = spec.exhaust.groups;
  const groupOf = new Map<number, number>();
  groups.forEach((g, i) => g.forEach((n) => groupOf.set(n, i)));
  const pans = spec.exhaust.pans ?? groups.map(() => 0);
  const isRotary = engine.isRotary;
  const turbos = { na: 0, turbo: 1, 'twin-turbo': 2, 'quad-turbo': 4, supercharged: 0 }[spec.aspiration];
  const tuning = spec.tuning;
  return {
    sim: {
      cylinders: spec.cylinders,
      cycle: engine.cycle,
      // A rotor fires once per shaft turn, a piston once every two.
      firesPerRev: isRotary ? spec.cylinders : spec.cylinders / 2,
      idleRpm: spec.idleRpm,
      redlineRpm: spec.redlineRpm,
      revTimeS: spec.revTimeS,
      rough: spec.rough,
      turbo: turbos > 0,
      torqueTable: tuning?.torqueTable,
      boostLagS: tuning?.boostLagS,
      catches: tuning?.catches,
    },
    cylinders: engine.cylinders.map((c) => ({
      fire: c.fire,
      // A Wankel chamber is at 25 % of its cycle when its flank uncovers the port.
      evo: mod(c.fire + (isRotary ? 0.22 * engine.cycle : engine.timing.exhaustOpen), engine.cycle),
      ivo: mod(c.fire + (isRotary ? 0.48 * engine.cycle : engine.timing.intakeOpen), engine.cycle),
      group: groupOf.get(c.n) ?? 0,
      headerM: typeof header === 'number' ? header : (header[c.n - 1] ?? 0.6),
    })),
    groupPans: pans,
    pipeM: spec.exhaust.pipeM,
    open: spec.exhaust.open,
    rasp: spec.exhaust.rasp,
    trim: trimOverride ?? tuning?.trim ?? LOUDNESS_TRIM[spec.id] ?? 0.4,
    isDiesel: spec.fuel === 'diesel',
    sharpPort: isRotary,
    rough: spec.rough,
    pops: spec.pops,
    turboWhine: spec.turboWhine,
    blowoff: spec.blowoff,
    displacementCc: engine.displacementCc,
    turbos,
    supercharger: tuning?.supercharger ?? false,
    intakeM: tuning?.intakeM ?? 0.32,
  };
}

interface Pulse {
  t: number;
  amp: number;
  tau: number;
  bright: number;
}

class CylinderVoice {
  readonly header: Pipe;
  readonly exhaust: Pulse = { t: 1e9, amp: 0, tau: 1, bright: 0 };
  readonly intake: Pulse = { t: 1e9, amp: 0, tau: 1, bright: 0 };
  readonly gain: number;
  readonly angleOffset: number;
  readonly tauScale: number;
  readonly cfg: SynthCylinder;
  evoPrev = 0;
  ivoPrev = 0;
  firePrev = 0;

  constructor(cfg: SynthCylinder, fs: number, noise: Noise, rough: number) {
    this.cfg = cfg;
    // Primary pipe: a closed valve at one end, an open junction at the other.
    this.header = new Pipe(cfg.headerM, HOT_SOUND_SPEED, -0.38, 5200, fs);
    // No two cylinders are identical: this is what produces half-order content in real engines.
    this.gain = 1 + (noise.next() * 0.09 * (0.4 + rough));
    this.angleOffset = noise.next() * 0.9 * (0.4 + rough);
    this.tauScale = 1 + noise.next() * 0.1;
  }
}

/**
 * A turbine evens out the gas pulses, so the upper harmonics of the firing tone fall away first. My own
 * estimate, chosen by measurement: at 0.8 of full boost the top loses about 2 dB more than the bottom.
 */
const TURBINE_SMOOTHING_HZ = 300;

class GroupVoice {
  readonly pipe: Pipe;
  readonly shell: Pipe;
  readonly chamberA = new Biquad();
  readonly chamberB = new Biquad();
  readonly muffler = new Biquad();
  readonly radiate = new OnePoleHP();
  readonly rumbleCut = new OnePoleHP();
  readonly flowEnv = new OnePoleLP();
  readonly flowBand = new Biquad();
  readonly turbine = new OnePoleLP();
  readonly pan: number;
  sum = 0;

  constructor(pipeM: number, pan: number, fs: number, open: number) {
    this.pipe = new Pipe(pipeM, HOT_SOUND_SPEED, -0.3, 2600 + open * 3800, fs);
    this.shell = new Pipe(0.42 + (1 - open) * 0.5, HOT_SOUND_SPEED, 0.18 + (1 - open) * 0.22, 2400, fs);
    // Series boosts rather than parallel band-passes: parallel paths cancel and leave a fixed notch.
    this.chamberA.peaking(85 + open * 40, 0.9, 5 - open * 2, fs);
    this.chamberB.peaking(310 + open * 170, 1.6, 3.5, fs);
    this.muffler.lowpass(1100 + open * open * 9000, 0.75, fs);
    // A pipe end radiates the time derivative of its volume flow. Below this corner the far field
    // rises 6 dB per octave, which is why a tailpipe has little real energy under the firing tone.
    this.radiate.setCutoff(70, fs);
    this.rumbleCut.setCutoff(24, fs);
    this.flowEnv.setCutoff(70, fs);
    this.flowBand.bandpass(2400 + open * 2400, 0.6, fs);
    this.turbine.setCutoff(TURBINE_SMOOTHING_HZ, fs);
    this.pan = pan;
  }
}

/** Light gain matching on top of each engine's trim, so a 16-cylinder is not 12 dB above a single. */
const pulseScale = (count: number, cc: number): number => {
  const perCylinder = cc / count;
  return Math.pow(perCylinder / 500, 0.35) * Math.pow(4 / Math.max(1, count), 0.28);
};

export class EngineSynth {
  readonly sim: EngineSim;
  private cfg: SynthConfig;
  private readonly fs: number;
  private readonly noise = new Noise();
  private cyl: CylinderVoice[] = [];
  private groups: GroupVoice[] = [];
  private ampScale = 1;
  private blowdownTau = 0.001;

  // Listening position, smoothed.
  private mixExhaust = 1;
  private mixIntake = 0.25;
  private mixMech = 0.2;
  private mixCabin = 0;
  private targetExhaust = 1;
  private targetIntake = 0.25;
  private targetMech = 0.2;
  private targetCabin = 0;
  private readonly cabinLpL = new Biquad();
  private readonly cabinLpR = new Biquad();
  private readonly cabinBoomL = new Biquad();
  private readonly cabinBoomR = new Biquad();

  // Intake path.
  private runner: Pipe;
  private blowerPhase = 0;
  private distress = 0;
  private readonly plenum = new Biquad();
  private readonly snorkel = new Biquad();
  private readonly hiss = new Biquad();
  private readonly airLp = new OnePoleLP();

  // Block structure: damped modes rung by each combustion event.
  private readonly modes: Biquad[] = [];
  private readonly modeGain: number[] = [];
  private mechExcite = 0;
  private readonly body = new Biquad();
  private tickEnv = 0;
  private readonly tickFilter = new Biquad();

  // Turbocharger.
  private whinePhase = 0;
  private readonly whineLp = new OnePoleLP();
  private bov = 0;
  private bovPrevThrottle = 0;
  private bovArmed = 0;
  private bovFlutter = 0;
  private readonly bovFilter = new Biquad();

  // Pops on overrun.
  private popEnv = 0;
  private popAmp = 0;
  private readonly popFilter = new Biquad();
  private popDelay = 0;

  // The start itself isn't modelled: the engine turns over in silence and is heard from the moment it catches.
  private startGate = 0;

  private readonly dcL = new OnePoleHP();
  private readonly dcR = new OnePoleHP();
  private fade = 1;
  private fadeTarget = 1;
  private fadeRate = 0;
  private pendingCfg: SynthConfig | null = null;

  constructor(cfg: SynthConfig, fs: number) {
    this.fs = fs;
    this.cfg = cfg;
    this.sim = new EngineSim(cfg.sim);
    this.runner = new Pipe(0.32, COLD_SOUND_SPEED, 0.55, 3200, fs);
    this.plenum.bandpass(150, 1.4, fs);
    this.snorkel.bandpass(520, 1.1, fs);
    this.hiss.bandpass(2300, 0.9, fs);
    this.airLp.setCutoff(5400, fs);
    this.tickFilter.bandpass(6100, 1.6, fs);
    this.body.lowpass(180, 0.9, fs);
    this.whineLp.setCutoff(11000, fs);
    this.bovFilter.bandpass(2800, 1.2, fs);
    this.popFilter.bandpass(760, 0.8, fs);
    this.dcL.setCutoff(16, fs);
    this.dcR.setCutoff(16, fs);
    this.cabinLpL.lowpass(760, 0.7, fs);
    this.cabinLpR.lowpass(760, 0.7, fs);
    this.cabinBoomL.peaking(85, 1.2, 8, fs);
    this.cabinBoomR.peaking(85, 1.2, 8, fs);
    this.applyConfig(cfg);
  }

  private applyConfig(cfg: SynthConfig): void {
    const fs = this.fs;
    this.cfg = cfg;
    this.cyl = cfg.cylinders.map((c) => new CylinderVoice(c, fs, this.noise, cfg.rough));
    const groupCount = cfg.groupPans.length;
    this.groups = Array.from({ length: groupCount }, (_, i) => new GroupVoice(cfg.pipeM, cfg.groupPans[i] ?? 0, fs, cfg.open));
    this.ampScale = pulseScale(cfg.sim.cylinders, cfg.displacementCc) * 2.1 * cfg.trim;
    this.runner = new Pipe(cfg.intakeM, COLD_SOUND_SPEED, 0.55, 3200, fs);
    const perCylinder = cfg.displacementCc / cfg.sim.cylinders;
    this.blowdownTau = 0.00042 * Math.pow(perCylinder / 500, 0.33) * (cfg.sharpPort ? 0.38 : 1);

    // Blocks ring lower when bigger and iron-heavier; only the rough scale of it matters here.
    const sizeScale = Math.pow(500 / perCylinder, 0.2);
    const freqs = cfg.isDiesel ? [1250, 1880, 2550, 3400] : [1500, 2350, 3350, 4700];
    const qs = [7, 9, 11, 13];
    const gains = cfg.isDiesel ? [1, 0.9, 0.7, 0.4] : [0.8, 0.6, 0.35, 0.2];
    this.modes.length = 0;
    this.modeGain.length = 0;
    freqs.forEach((f, i) => {
      this.modes.push(new Biquad().bandpass(f * sizeScale, qs[i]!, fs));
      this.modeGain.push(gains[i]!);
    });
    this.sim.configure(cfg.sim);
    const dir = this.sim.angle;
    for (const v of this.cyl) {
      v.evoPrev = mod(dir - v.cfg.evo - v.angleOffset, cfg.sim.cycle);
      v.ivoPrev = mod(dir - v.cfg.ivo, cfg.sim.cycle);
      v.firePrev = mod(dir - v.cfg.fire, cfg.sim.cycle);
    }
  }

  /** 0 to 1: how much the engine is suffering. Heard as irregular knocks from the block. */
  setDistress(value: number): void {
    this.distress = Math.max(0, Math.min(1, value));
  }

  /** The moment something lets go. */
  bang(): void {
    this.popAmp = 1.6;
    this.popDelay = 1;
    this.mechExcite += 14;
  }

  /** Loudness only, with no interruption of the sound. */
  setTrim(trim: number): void {
    const cfg = this.cfg;
    cfg.trim = trim;
    this.ampScale = pulseScale(cfg.sim.cylinders, cfg.displacementCc) * 2.1 * trim;
  }

  /** Switch to another engine. A brief fade hides the swap of delay lines. */
  setConfig(cfg: SynthConfig): void {
    this.pendingCfg = cfg;
    this.fadeTarget = 0;
    this.fadeRate = 1 / (0.018 * this.fs);
  }

  setListen(pos: ListenPosition): void {
    const mix = {
      exhaust: [1.0, 0.16, 0.14, 0],
      bay: [0.3, 1.0, 1.0, 0],
      cabin: [0.75, 0.25, 0.5, 1],
    }[pos];
    this.targetExhaust = mix[0]!;
    this.targetIntake = mix[1]!;
    this.targetMech = mix[2]!;
    this.targetCabin = mix[3]!;
  }

  /** Render one block. `left` and `right` must be the same length. */
  process(left: Float32Array, right: Float32Array): void {
    const fs = this.fs;
    const dt = 1 / fs;
    const sim = this.sim;
    const n = left.length;
    const cycle = this.cfg.sim.cycle;
    const noise = this.noise;

    for (let s = 0; s < n; s++) {
      if (s % 16 === 0) sim.step(dt * 16);
      if (this.fadeRate > 0) {
        this.fade += this.fade < this.fadeTarget ? this.fadeRate : -this.fadeRate;
        if (this.fade <= 0 && this.pendingCfg) {
          this.fade = 0;
          this.applyConfig(this.pendingCfg);
          this.pendingCfg = null;
          this.fadeTarget = 1;
        } else if (this.fade >= 1 && this.fadeTarget === 1) {
          this.fade = 1;
          this.fadeRate = 0;
        }
      }

      const rpm = sim.rpm;
      const nRpm = rpm / this.cfg.sim.redlineRpm;
      const stepDeg = rpm * 6 * dt;
      const running = sim.state === 'running';
      const load = sim.load;
      const firing = running && !sim.fuelCut;
      const movementAmp = rpm > 2 ? Math.min(1, rpm / 40) : 0;

      for (const g of this.groups) g.sum = 0;
      let intakeIn = 0;
      let ignitionKick = 0;

      for (const v of this.cyl) {
        // Event detection: each phase wraps at 0 when the crank passes its angle.
        const evoPhase = mod(sim.angle - v.cfg.evo - v.angleOffset, cycle);
        if (evoPhase < v.evoPrev && stepDeg > 0 && movementAmp > 0) this.triggerExhaust(v, firing, load, nRpm);
        v.evoPrev = evoPhase;

        const ivoPhase = mod(sim.angle - v.cfg.ivo, cycle);
        if (ivoPhase < v.ivoPrev && stepDeg > 0 && movementAmp > 0) {
          v.intake.t = 0;
          const flow = 0.1 + 0.9 * sim.throttle;
          v.intake.amp = flow * v.gain * (0.35 + 0.65 * nRpm);
          v.intake.tau = 0.0015 + 0.0024 * (1 - nRpm);
          this.tickEnv = Math.max(this.tickEnv, 0.4 + 0.6 * noise.unit());
        }
        v.ivoPrev = ivoPhase;

        const firePhase = mod(sim.angle - v.cfg.fire - v.angleOffset, cycle);
        if (firePhase < v.firePrev && stepDeg > 0 && movementAmp > 0 && firing) {
          ignitionKick += (this.cfg.isDiesel ? 0.9 + 0.5 * (1 - load) : 0.2 + 0.8 * load) * (0.8 + 0.4 * noise.unit());
        }
        v.firePrev = firePhase;

        // Blowdown: a fast rise as the gas escapes, then decay. Its time scale is set by the gas,
        // not the crank, so a pulse keeps its shape whatever the engine speed.
        let x = 0;
        const e = v.exhaust;
        if (e.t < 0.05) {
          const u = e.t / e.tau;
          const env = u * Math.exp(1 - u);
          x += e.amp * (env + env * noise.next() * e.bright);
          // Rarefaction following the main pulse.
          const u2 = Math.max(0, e.t - e.tau * 2.4) / (e.tau * 2.6);
          x -= 0.1 * e.amp * u2 * Math.exp(1 - u2);
          e.t += dt;
        }
        // Displacement phase of the exhaust stroke: the piston pushing out what remains.
        const phi = (mod(sim.angle - v.cfg.fire, cycle) / cycle) * 4;
        if (phi > 1 && phi < 2) {
          const w = Math.sin(Math.PI * (phi - 1));
          x += 0.1 * w * w * (0.2 + 0.8 * Math.min(1, nRpm * 1.6)) * (0.3 + 0.7 * load);
        }
        const out = v.header.process(x);
        const g = this.groups[v.cfg.group];
        if (g) g.sum += out;

        const i = v.intake;
        if (i.t < 0.04) {
          const u = i.t / i.tau;
          const env = u * Math.exp(1 - u);
          intakeIn -= i.amp * env * (1 + 0.5 * noise.next());
          i.t += dt;
        }
      }

      // Exhaust path. Turbines absorb most of the pulse energy and smooth what is left.
      const turboShare = this.cfg.turbos > 0 ? 1 : 0;
      const damping = 0.55 + 0.25 * sim.boost;
      const raspDrive = 1 + this.cfg.rasp * (0.5 + 2.8 * load * Math.min(1, nRpm * 1.5));
      let exL = 0;
      let exR = 0;
      for (const g of this.groups) {
        let v = g.sum * this.ampScale;
        // Large-amplitude waves steepen, which is where the rasp of a race exhaust comes from.
        v = v > 0 ? Math.tanh(v * raspDrive) / raspDrive + v * 0.12 : v * 0.7;
        v = g.pipe.process(v);
        if (turboShare) v = g.turbine.process(v) * damping + v * (1 - damping) * 0.75;
        const open = this.cfg.open;
        const muffled = g.muffler.process(g.chamberB.process(g.chamberA.process(v)));
        const shelled = g.shell.process(muffled);
        // Keep some of the bottom: the listener is close to the car, not in the far field.
        const radiated = g.radiate.process(shelled) * 1.15 + g.rumbleCut.process(shelled) * 0.5;
        // Turbulent roar of the gas leaving the pipe follows the pulses and grows with load.
        const pulse = g.flowEnv.process(Math.abs(muffled));
        const flow = g.flowBand.process(noise.next()) * pulse * (0.25 + 1.1 * open) * (0.3 + 0.7 * load);
        const out = radiated + flow;
        const l = 0.5 - g.pan * 0.5;
        const r = 0.5 + g.pan * 0.5;
        exL += out * l * 1.4;
        exR += out * r * 1.4;
      }
      if (this.groups.length > 1) {
        const norm = 1 / Math.pow(this.groups.length, 0.3);
        exL *= norm;
        exR *= norm;
      }

      // Pops: unburnt fuel igniting in the hot exhaust on overrun.
      let pop = 0;
      if (this.popDelay > 0) {
        this.popDelay -= 1;
        if (this.popDelay <= 0) {
          this.popEnv = 1;
        }
      }
      if (this.popEnv > 0.002) {
        pop = this.popFilter.process((noise.next() * 0.8 + 0.25) * this.popEnv) * this.popAmp * 2.4;
        this.popEnv *= 0.99925 - 0.0012;
      }
      exL += pop;
      exR += pop;

      // Intake path.
      const airflow = Math.max(0, sim.throttle) * Math.min(1, 0.15 + nRpm);
      const run = this.runner.process(intakeIn * 0.5);
      const hiss = this.hiss.process(noise.next()) * airflow * (0.1 + 0.3 * nRpm) * 0.7;
      const plen = this.plenum.process(run);
      const snork = this.snorkel.process(run);
      const air = this.airLp.process(plen * 0.9 + snork * 1.2 + run * 0.25 + hiss);

      if (this.distress > 0 && rpm > 100 && noise.unit() < this.distress * 0.0022) this.mechExcite += 0.8 + 2.2 * this.distress * noise.unit();

      // Block: combustion rings the structure, valvegear ticks at high frequency.
      this.mechExcite += ignitionKick;
      const exciteNoise = this.mechExcite * (0.6 + noise.next() * 0.4);
      this.mechExcite *= this.cfg.isDiesel ? 0.82 : 0.76;
      let mech = 0;
      for (let m = 0; m < this.modes.length; m++) {
        mech += this.modes[m]!.process(exciteNoise) * this.modeGain[m]!;
      }
      const dieselGain = this.cfg.isDiesel ? 2.5 : 1.0;
      mech *= 0.65 * dieselGain;
      mech += this.body.process(ignitionKick) * 0.8;
      if (this.tickEnv > 0.001) {
        mech += this.tickFilter.process(noise.next()) * this.tickEnv * 0.045;
        this.tickEnv *= 0.9915;
      }

      // Turbocharger: a shaft whine that follows boost, plus a blow-off when the throttle closes.
      let turbo = 0;
      if (this.cfg.turbos > 0) {
        const boost = sim.boost;
        const hz = 1600 + 8200 * boost;
        this.whinePhase += hz * dt;
        if (this.whinePhase > 1) this.whinePhase -= 1;
        const tone = Math.sin(2 * Math.PI * this.whinePhase);
        const tone2 = Math.sin(2 * Math.PI * this.whinePhase * 2.01);
        turbo = this.whineLp.process(tone * 0.7 + tone2 * 0.3) * boost * boost * 0.1 * this.cfg.turboWhine * (0.4 + 0.6 * Math.sqrt(this.cfg.turbos));
        const throttleDrop = this.bovPrevThrottle - sim.throttle;
        if (this.cfg.blowoff > 0 && throttleDrop > 0.0012 && boost > 0.22 && this.bovArmed <= 0) {
          this.bov = boost;
          this.bovArmed = fs * 0.35;
        }
        if (this.bovArmed > 0) this.bovArmed -= 1;
        this.bovPrevThrottle = sim.throttle;
        if (this.bov > 0.001) {
          this.bovFlutter += (22 * dt) % 1;
          if (this.bovFlutter > 1) this.bovFlutter -= 1;
          const flutter = 0.7 + 0.3 * Math.sin(2 * Math.PI * this.bovFlutter);
          turbo += this.bovFilter.process(noise.next()) * this.bov * flutter * 0.32 * this.cfg.blowoff;
          this.bov *= 0.99988 - 0.00005;
        }
      }

      // A belt-driven supercharger sings in step with the crank.
      if (this.cfg.supercharger && running) {
        const hz = (rpm / 60) * 8;
        this.blowerPhase += hz * dt;
        if (this.blowerPhase > 1) this.blowerPhase -= 1;
        const s1 = Math.sin(2 * Math.PI * this.blowerPhase);
        const s2 = Math.sin(4 * Math.PI * this.blowerPhase);
        turbo += (s1 * 0.7 + s2 * 0.3) * (0.015 + 0.075 * sim.throttle * Math.min(1, nRpm * 1.8));
      }

      // Slowly crossfade the listening position.
      const k = 0.0009;
      this.mixExhaust += (this.targetExhaust - this.mixExhaust) * k;
      this.mixIntake += (this.targetIntake - this.mixIntake) * k;
      this.mixMech += (this.targetMech - this.mixMech) * k;
      this.mixCabin += (this.targetCabin - this.mixCabin) * k;

      const centre = air * 0.8 * this.mixIntake + mech * this.mixMech + turbo * Math.max(this.mixIntake, 0.45);
      let outL = exL * this.mixExhaust + centre;
      let outR = exR * this.mixExhaust + centre;

      if (this.mixCabin > 0.002) {
        const cabinL = this.cabinBoomL.process(this.cabinLpL.process(outL));
        const cabinR = this.cabinBoomR.process(this.cabinLpR.process(outR));
        outL += (cabinL * 0.9 - outL) * this.mixCabin;
        outR += (cabinR * 0.9 - outR) * this.mixCabin;
      }

      // An engine that won't catch keeps its pumping sound, or the failed start would seem like a dead button.
      const silent = sim.state === 'cranking' && this.cfg.sim.catches !== false;
      this.startGate += ((silent ? 0 : 1) - this.startGate) * (silent ? 0.02 : 0.0009);
      outL = softClip(this.dcL.process(outL) * this.fade * this.startGate);
      outR = softClip(this.dcR.process(outR) * this.fade * this.startGate);
      left[s] = outL;
      right[s] = outR;
    }
  }

  private triggerExhaust(v: CylinderVoice, firing: boolean, load: number, nRpm: number): void {
    const cfg = this.cfg;
    const noise = this.noise;
    const e = v.exhaust;
    const roughness = cfg.rough * (1 - load * 0.6) * (1 - nRpm * 0.5);
    const jitter = 1 + noise.next() * 0.22 * roughness;
    if (firing) {
      // At closed throttle the cylinder holds little pressure when the valve opens; wide open it holds a lot.
      e.amp = (0.15 + 0.85 * load) * v.gain * jitter;
      e.tau = Math.min(this.blowdownTau * v.tauScale, (40 / Math.max(this.sim.rpm * 6, 1)) * 0.6 + 0.0001);
      e.bright = 0.1 + 0.14 * load + cfg.rasp * 0.1;
      if (cfg.isDiesel) e.amp *= 0.72;
    } else {
      // Pumping only. The fuel is cut or the starter is turning: the exhaust just sighs.
      const starter = this.sim.state === 'cranking';
      e.amp = (starter ? 0.26 : 0.075) * v.gain * jitter;
      e.tau = this.blowdownTau * 1.8;
      e.bright = 0.35;
      const running = this.sim.state === 'running';
      if (running && nRpm > 0.4 && cfg.pops > 0 && noise.unit() < cfg.pops * 0.09) {
        this.popAmp = (0.25 + 0.75 * noise.unit()) * (0.4 + cfg.pops * 0.7);
        this.popDelay = Math.floor((0.004 + noise.unit() * 0.02) * this.fs);
      }
    }
    e.t = 0;
  }
}
