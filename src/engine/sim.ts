import { ValveControl, type VariableValves } from './valve-control.ts';

// Crankshaft speed as a small dynamic system. Runs on the audio thread when sound is on,
// and on the main thread otherwise, so the code must stay free of DOM and Web Audio.

export type EngineState = 'off' | 'cranking' | 'running' | 'stopping';

export interface SimParams {
  cylinders: number;
  /** Crank degrees per chamber cycle. */
  cycle: number;
  /** Firing pulses per crank turn. */
  firesPerRev: number;
  idleRpm: number;
  redlineRpm: number;
  revTimeS: number;
  rough: number;
  turbo: boolean;
  /** Net torque over normalised speed from 0 to 1.2, peak = 1. A built-in curve is used without it. */
  torqueTable?: number[];
  /** Time for the turbo to come up to speed. */
  boostLagS?: number;
  /** False: the starter turns the engine but it never runs. */
  catches?: boolean;
  /** Variable valve gear, run by its own controller on every step. */
  valves?: VariableValves;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Speed asked for by a full pedal, as a share of redline. Past 1, so the end of the travel reaches the limiter. */
const PEDAL_TOP_SPEED = 1.1;
/** Butterfly opening per unit of normalised speed still missing. */
const PEDAL_GAIN = 10;

/** Normalised torque curve over normalised rpm. Peak around 65 % of redline, falls off above. */
const torqueAt = (n: number): number => {
  const x = clamp(n, 0, 1.2);
  return 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, x / 1.3)) - 0.15 * x * x;
};

export class EngineSim {
  params: SimParams;
  state: EngineState = 'off';
  /** Crank angle in degrees, wrapped to the cycle length. */
  angle = 0;
  rpm = 0;
  /** Pedal position 0..1 as asked for by the driver. */
  pedal = 0;
  /** Smoothed butterfly position, including what the idle controller adds. */
  throttle = 0;
  /** 0..1, how hard the engine is working right now. */
  load = 0;
  /** True while the rev limiter or a closed throttle cuts fuel. */
  fuelCut = false;
  /** Turbo shaft speed 0..1. */
  boost = 0;
  /** Hold the crank at this speed, ignoring the pedal. Used for slow motion. */
  lockedRpm: number | null = null;
  /** Cam phasers, cam profiles and resting cylinders, as the engine computer sets them. */
  readonly valves = new ValveControl();

  private idleIntegral = 0;
  private stateTime = 0;
  private limiter = false;
  private catchFlare = 0;

  constructor(params: SimParams) {
    this.params = params;
    this.valves.configure(params.valves, params.idleRpm, params.cylinders);
  }

  configure(params: SimParams): void {
    this.params = params;
    this.angle = this.angle % params.cycle;
    this.idleIntegral = 0;
    if (this.state === 'running') this.rpm = clamp(this.rpm, params.idleRpm * 0.8, params.redlineRpm);
    this.limiter = false;
    this.valves.configure(params.valves, params.idleRpm, params.cylinders);
  }

  start(): void {
    if (this.state === 'running' || this.state === 'cranking') return;
    this.state = 'cranking';
    this.stateTime = 0;
    this.idleIntegral = 0;
  }

  stop(): void {
    if (this.state === 'off') return;
    this.state = 'stopping';
    this.stateTime = 0;
  }

  /** Runs with no starter sequence, for switching between engines while already running. */
  startImmediately(): void {
    this.state = 'running';
    this.stateTime = 0;
    this.rpm = Math.max(this.rpm, this.params.idleRpm);
  }

  /** Scaled so that a full-throttle run from idle to redline takes about revTimeS. */
  private get accelWot(): number {
    const { redlineRpm, idleRpm, revTimeS } = this.params;
    return (1.5 * (redlineRpm - idleRpm)) / revTimeS;
  }

  private torque(n: number): number {
    const table = this.params.torqueTable;
    if (!table) return torqueAt(n);
    const x = (clamp(n, 0, 1.2) / 1.2) * (table.length - 1);
    const i = Math.min(Math.floor(x), table.length - 2);
    return table[i]! + (table[i + 1]! - table[i]!) * (x - i);
  }

  private drag(n: number): number {
    return this.accelWot * 0.42 * (0.2 + 0.8 * n * n);
  }

  /** Extra braking with fuel cut: the cylinders pump against a closed throttle. */
  private get pumping(): number {
    return this.accelWot * 0.14;
  }

  /** Opening at which thrust exactly balances friction at this speed. */
  private holdOpening(n: number): number {
    const drag = this.drag(n);
    const thrust = this.accelWot * Math.max(this.torque(n), 0.08);
    return this.params.torqueTable ? drag / (thrust + drag) : drag / thrust;
  }

  /**
   * With no load on the crank, the opening that holds a speed is almost the same from idle to a
   * third of redline, so a fixed pedal-to-butterfly curve leaps across that whole range. The pedal
   * therefore asks for a speed, and the butterfly settles at what holds it there. The pedal's
   * position also limits how hard it pulls on the way, so full throttle stays fully open.
   */
  private pedalOpening(n: number, idleN: number): number {
    const target = idleN + (PEDAL_TOP_SPEED - idleN) * this.throttle;
    return clamp(this.holdOpening(n) + Math.min(PEDAL_GAIN * (target - n), this.throttle), 0, 1);
  }

  step(dt: number): void {
    const p = this.params;
    this.stateTime += dt;
    // Pedal response is quick but not instantaneous, like a real butterfly and manifold.
    const pedalRate = this.pedal > this.throttle ? 18 : 9;
    this.throttle += (this.pedal - this.throttle) * Math.min(1, pedalRate * dt);

    if (this.lockedRpm !== null) {
      this.rpm += (this.lockedRpm - this.rpm) * Math.min(1, 6 * dt);
      this.load = this.state === 'off' ? 0 : Math.max(0.15, this.throttle);
      this.fuelCut = this.state === 'off';
      this.boost += (0 - this.boost) * Math.min(1, 2 * dt);
      this.advance(dt);
      return;
    }

    const n = this.rpm / p.redlineRpm;
    let accel = 0;
    let requested = 0;

    switch (this.state) {
      case 'off':
        this.rpm = Math.max(0, this.rpm - 600 * dt);
        this.load = 0;
        this.fuelCut = true;
        break;
      case 'cranking': {
        const target = 240;
        this.rpm += (target - this.rpm) * Math.min(1, 7 * dt);
        this.load = 0.04;
        this.fuelCut = true;
        // Catches after a moment; a large or diesel engine would take longer, the exact value is cosmetic.
        if (p.catches === false) {
          if (this.stateTime > 2.6) this.stop();
        } else if (this.stateTime > 0.3) {
          this.state = 'running';
          this.stateTime = 0;
          this.catchFlare = 1;
        }
        break;
      }
      case 'stopping':
        accel = -this.drag(n) - this.pumping;
        this.fuelCut = true;
        this.load = 0;
        this.rpm = Math.max(0, this.rpm + accel * dt);
        if (this.rpm < 40) {
          this.rpm = 0;
          this.state = 'off';
        }
        break;
      case 'running': {
        // Idle controller: opens the throttle just enough to hold idle speed.
        const err = (p.idleRpm - this.rpm) / p.idleRpm;
        this.idleIntegral = clamp(this.idleIntegral + err * dt * 0.8, -0.1, 0.2);
        const idleN = p.idleRpm / p.redlineRpm;
        const idleOpen = clamp(this.holdOpening(idleN) + err * 0.9 + this.idleIntegral, 0, 0.55);
        requested = Math.max(this.pedalOpening(n, idleN), idleOpen);
        this.catchFlare *= Math.exp(-dt * 3.2);
        requested = Math.max(requested, this.catchFlare * 0.7);

        if (this.rpm >= p.redlineRpm) this.limiter = true;
        else if (this.rpm < p.redlineRpm - 180) this.limiter = false;

        const closedThrottleOverrun = this.throttle < 0.02 && this.rpm > p.idleRpm * 1.25;
        this.fuelCut = this.limiter || closedThrottleOverrun;
        const thrust = this.fuelCut ? 0 : this.accelWot * this.torque(n) * requested;
        // A measured torque table is already net of friction, so wide open it adds no drag of its own.
        const dragShare = p.torqueTable && !this.fuelCut ? 1 - requested : 1;
        accel = thrust - this.drag(n) * dragShare - (this.fuelCut ? this.pumping : 0);
        this.rpm = Math.max(0, this.rpm + accel * dt);
        const targetLoad = this.fuelCut ? 0 : clamp(requested + Math.max(0, thrust / this.accelWot) * 0.25, 0, 1);
        this.load += (targetLoad - this.load) * Math.min(1, 14 * dt);
        break;
      }
    }

    if (p.turbo) {
      const running = this.state === 'running';
      const target = running ? clamp(this.load * Math.pow(n * 1.15, 0.8), 0, 1) : 0;
      const rate = target > this.boost ? 1 / (p.boostLagS ?? 0.7) : 0.9;
      this.boost += (target - this.boost) * Math.min(1, rate * dt);
    }

    this.advance(dt);
  }

  private advance(dt: number): void {
    const p = this.params;
    // Here rather than at the end of step(), so locked-speed playback runs the valve gear too.
    this.valves.step(dt, this);
    const firing = this.valves.state.active;
    // Crank speed ripples with the firing pulses, more so with fewer cylinders and at low speed.
    const speedShare = clamp(1.4 - this.rpm / (p.idleRpm * 4), 0.05, 1);
    const baseRipple = this.state === 'cranking' ? 0.32 : 0.16;
    const ripple = (baseRipple / Math.sqrt(p.cylinders * firing)) * speedShare * (0.5 + 0.5 * p.rough);
    const inst = this.rpm * (1 + ripple * Math.sin(this.angle * (Math.PI / 180) * p.firesPerRev * firing));
    this.angle = (this.angle + inst * 6 * dt) % p.cycle;
  }

  /** Instantaneous crank speed in degrees per second, for extrapolating between updates. */
  get degreesPerSecond(): number {
    return this.rpm * 6;
  }
}
