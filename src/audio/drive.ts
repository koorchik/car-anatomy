// Main-thread side of the engine. Talks to the audio thread when sound is on,
// and runs its own copy of the simulation when it is not.

import type { Engine } from '../engine/kinematics.ts';
import type { AnyLoadReadings, LoadCommand, LoadFrame, LoadReadings, LoadSpec } from '../engine/load.ts';
import { LoadedCrank, type CrankReadings } from '../engine/loaded-crank.ts';
import { createLoad } from '../engine/loads.ts';
import { EngineSim, type EngineState } from '../engine/sim.ts';
import type { EngineTorqueMap } from '../engine/torque-map.ts';
import type { ValveState } from '../engine/valve-control.ts';
import type { LoadMethod } from './process-meter.ts';
import { synthConfig, type ListenPosition, type SynthConfig } from './synth.ts';
import type { WorkletCommand, WorkletReport } from './worklet.ts';
import workletUrl from './worklet.ts?worker&url';

export interface DriveSnapshot {
  angle: number;
  rpm: number;
  state: EngineState;
  load: number;
  throttle: number;
  fuelCut: boolean;
  boost: number;
  /** Phasers, cam profile, lift and resting cylinders, for engines with variable valve gear. */
  valves?: ValveState;
  /**
   * What a page shows of the load on the crank (a car's speed, gear, wheels and drivetrain angles), with its angles
   * continued to this frame by their speeds, as the crank's. The same object every frame; absent without such a load.
   */
  vehicle?: LoadFrame;
  /**
   * The audio thread's time (process-meter.ts), while it runs: the share of the blocks' time process() took over the
   * last second, how that was timed, and the samples per simulation step (16, or 32 once it ran short).
   */
  processShare?: number;
  loadMethod?: LoadMethod;
  stepSamples?: number;
  /**
   * The main thread's check of the same: the share of wall time the audio clock fell behind over the last second or
   * more (AudioContext.getOutputTimestamp). Above 0 the output lost blocks, which is heard as crackle.
   */
  audioLag?: number;
}

/**
 * Beyond a turn plus this long of the coordinate's own motion, s, the shown angles jump to the reported ones instead of
 * easing: another car on the crank, or frames far apart. Ordinary jitter of the reports stays well inside it.
 */
const SNAP_S = 0.1;

/** A frame continued toward the reported one: angles move on by their speeds and ease toward where they should be. */
function continueAngles(shown: Float64Array, at: Float64Array, speed: Float64Array, age: number, dt: number): void {
  const ahead = Math.min(age, 0.1);
  for (let k = 0; k < shown.length; k++) {
    if (Math.abs(at[k]! + speed[k]! * ahead - shown[k]!) <= 2 * Math.PI + Math.abs(speed[k]!) * SNAP_S) continue;
    // All of them at once, so the members (P·φ) stay in mesh.
    for (let j = 0; j < shown.length; j++) shown[j] = at[j]! + speed[j]! * ahead;
    return;
  }
  for (let k = 0; k < shown.length; k++) {
    const predicted = at[k]! + speed[k]! * ahead;
    shown[k] = shown[k]! + speed[k]! * dt;
    shown[k] = shown[k]! + (predicted - shown[k]!) * 0.25;
  }
}

/** Short synthetic room so the engine isn't heard in a vacuum. */
function roomImpulse(ctx: BaseAudioContext): AudioBuffer {
  const seconds = 0.55;
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const decay = Math.pow(1 - t, 3.2) * Math.exp(-t * 5);
      lp += ((Math.random() * 2 - 1) * decay - lp) * (0.55 - 0.4 * t);
      data[i] = lp;
    }
  }
  return buffer;
}

export class Drive {
  private local: EngineSim;
  private config: SynthConfig;
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private output: GainNode | null = null;
  analyser: AnalyserNode | null = null;
  private audioStarting: Promise<boolean> | null = null;
  private report: WorkletReport | null = null;
  private reportAt = 0;
  private shownAngle = 0;
  private volume = 0.8;
  private muted = false;
  /** Silenced by the page (pause): the audio thread stays suspended even when the tab comes back. */
  private paused = false;
  private listen: ListenPosition = 'exhaust';
  private lockedRpm: number | null = null;
  private pedal = 0;
  /** Set by start, cleared by stop: the audio thread's last report can still say running just after a stop. */
  private wanted = false;
  audioFailed = false;
  // A load on the crank, mirrored in the local copy and on the audio thread.
  private torqueMap: EngineTorqueMap | null = null;
  private loadSpec: LoadSpec | null = null;
  /** The last command that sets a lasting mode, replayed when the audio thread starts. */
  private keptCommand: LoadCommand | null = null;
  private readingQueue: CrankReadings<AnyLoadReadings>[] = [];
  /** The last frame ran on the audio thread: when that stops, the local copy goes on from its last report. */
  private wasWorklet = false;
  /**
   * The last hand-over to the audio thread (loadRestore's seq). Its reports count only from the one that carries it:
   * the ones before describe a car the local copy has driven on since (the sound was off, or the tab hidden).
   */
  private seq = 0;
  /** A hand-over has been sent and its first report has not come yet: the local copy goes on meanwhile. */
  private awaiting = false;
  /** The load's frame as shown (DriveSnapshot.vehicle), and the local copy's, filled in place every frame. */
  private shownFrame: LoadFrame | null = null;
  private localFrame: LoadFrame | null = null;
  /** The audio clock against the wall clock (DriveSnapshot.audioLag): where the window began, ms and s. */
  private lagFrom = { wall: 0, audio: 0 };
  private audioLag: number | undefined = undefined;

  constructor(engine: Engine) {
    this.config = synthConfig(engine);
    this.local = new EngineSim(this.config.sim);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else if (!this.paused) void this.ctx.resume();
    });
  }

  get audioReady(): boolean {
    return this.node !== null && this.ctx?.state === 'running';
  }

  get sampleRate(): number {
    return this.ctx?.sampleRate ?? 48000;
  }

  /**
   * Suspends the audio thread, so nothing is heard at once, the tail of a stopping engine included; false lets it run
   * again. The engine's state is the caller's: stop it first, and the local copy takes over from the last report.
   */
  pause(on: boolean): void {
    this.paused = on;
    if (!this.ctx) return;
    if (on) void this.ctx.suspend();
    else if (!document.hidden) void this.ctx.resume();
  }

  /** Has to be called from a user gesture the first time, because browsers require it. */
  ensureAudio(): Promise<boolean> {
    this.audioStarting ??= this.startAudio();
    void this.ctx?.resume();
    return this.audioStarting;
  }

  private async startAudio(): Promise<boolean> {
    try {
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      this.ctx = ctx;
      await ctx.audioWorklet.addModule(workletUrl);
      const node = new AudioWorkletNode(ctx, 'engine-processor', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
      node.port.onmessage = (event: MessageEvent<WorkletReport>) => {
        this.report = event.data;
        this.reportAt = performance.now();
        if (event.data.crank) this.queueReading(event.data.crank);
      };
      this.node = node;

      const dry = ctx.createGain();
      dry.gain.value = 0.86;
      const wet = ctx.createGain();
      wet.gain.value = 0.2;
      const room = ctx.createConvolver();
      room.buffer = roomImpulse(ctx);
      const bus = ctx.createGain();
      bus.gain.value = 1.5;
      // Gentle compression brings idle up: at listening level an engine is never as quiet as its true ratio.
      const glue = ctx.createDynamicsCompressor();
      glue.threshold.value = -30;
      glue.knee.value = 12;
      glue.ratio.value = 2.4;
      glue.attack.value = 0.012;
      glue.release.value = 0.22;
      const makeup = ctx.createGain();
      makeup.gain.value = 1.7;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -4;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.12;
      const output = ctx.createGain();
      output.gain.value = this.muted ? 0 : this.volume;
      this.output = output;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 8192;
      analyser.smoothingTimeConstant = 0.72;
      this.analyser = analyser;

      node.connect(dry).connect(bus);
      node.connect(wet).connect(room).connect(bus);
      bus.connect(glue).connect(makeup).connect(limiter).connect(output).connect(ctx.destination);
      limiter.connect(analyser);

      this.post({ type: 'config', config: this.config, running: false });
      this.post({ type: 'pedal', value: this.pedal });
      this.post({ type: 'listen', position: this.listen });
      if (this.lockedRpm !== null) this.post({ type: 'lock', rpm: this.lockedRpm, running: false });
      if (this.torqueMap) this.post({ type: 'torqueMap', map: this.torqueMap });
      if (this.loadSpec) this.post({ type: 'load', spec: this.loadSpec });
      if (this.keptCommand) this.post({ type: 'loadCommand', command: this.keptCommand });
      // The hand-over (loadRestore) follows on the first frame with the context running (tick).
      await ctx.resume();
      return true;
    } catch (error) {
      console.warn('Sound is unavailable:', error);
      this.audioFailed = true;
      return false;
    }
  }

  private post(cmd: WorkletCommand): void {
    this.node?.port.postMessage(cmd);
  }

  /** Started and not stopped since. */
  get wantsRunning(): boolean {
    return this.wanted;
  }

  setEngine(engine: Engine): void {
    const running = this.wanted && this.snapshot().state === 'running';
    this.config = synthConfig(engine);
    this.local.configure(this.config.sim);
    this.post({ type: 'config', config: this.config, running });
  }

  /** Loudness correction for the current engine, without touching its sound otherwise. */
  setTrim(value: number): void {
    this.config.trim = value;
    this.post({ type: 'trim', value });
  }

  setDistress(value: number): void {
    this.post({ type: 'distress', value });
  }

  bang(): void {
    this.post({ type: 'bang' });
  }

  setPedal(value: number): void {
    this.pedal = value;
    this.local.pedal = value;
    this.post({ type: 'pedal', value });
  }

  start(): void {
    this.wanted = true;
    this.local.start();
    if (this.lockedRpm !== null) this.local.startImmediately();
    this.post({ type: 'start' });
    if (this.lockedRpm !== null) this.post({ type: 'lock', rpm: this.lockedRpm, running: true });
  }

  stop(): void {
    this.wanted = false;
    this.local.stop();
    this.post({ type: 'stop' });
  }

  /**
   * The engine stands still at once, with no run-down: for a section that silences the engine (ShellAudio.suspend).
   * A stop would only freeze the run-down with the audio thread, and the visitor would hear the rest of it on coming back.
   */
  halt(): void {
    this.wanted = false;
    this.local.adopt('off', 0);
    this.post({ type: 'halt' });
  }

  /** Holds the crank at a fixed speed for slow motion. Null releases it. */
  lock(rpm: number | null): void {
    this.lockedRpm = rpm;
    this.local.lockedRpm = rpm;
    const running = this.wanted && this.snapshot().state === 'running';
    this.post({ type: 'lock', rpm, running });
  }

  setListen(position: ListenPosition): void {
    this.listen = position;
    this.post({ type: 'listen', position });
  }

  setVolume(volume: number, muted: boolean): void {
    this.volume = volume;
    this.muted = muted;
    if (this.output && this.ctx) {
      this.output.gain.setTargetAtTime(muted ? 0 : volume, this.ctx.currentTime, 0.02);
    }
  }

  /** The engine's torque map for a load on the crank. Null when nothing is attached. */
  setTorqueMap(map: EngineTorqueMap | null): void {
    this.torqueMap = map;
    this.coupleLocal(false);
    this.post({ type: 'torqueMap', map });
  }

  /** Puts a load on the crank, or takes it off with null. A new load starts in its resting state. */
  setLoad(spec: LoadSpec | null): void {
    this.loadSpec = spec;
    this.keptCommand = null;
    // A new load starts at rest: its angles are not eased toward from the old one's (the box would spin back).
    this.shownFrame = null;
    this.localFrame = null;
    this.coupleLocal(true);
    this.post({ type: 'load', spec });
  }

  loadCommand(command: LoadCommand): void {
    this.local.crank?.load.command(command);
    this.post({ type: 'loadCommand', command });
    // A car keeps its controls in its state (loadRestore); the dyno's lasting modes are replayed.
    if (command.kind === 'dyno' && (command.action === 'hold' || command.action === 'off' || command.action === 'free')) this.keptCommand = command;
  }

  private coupleLocal(newLoad: boolean): void {
    this.readingQueue = [];
    if (!this.torqueMap || !this.loadSpec) this.local.attach(null);
    else if (this.local.crank && !newLoad) this.local.crank.setMap(this.torqueMap);
    else this.local.attach(new LoadedCrank(this.torqueMap, createLoad(this.loadSpec)));
  }

  private queueReading(reading: CrankReadings<AnyLoadReadings>): void {
    this.readingQueue.push(reading);
    if (this.readingQueue.length > 64) this.readingQueue.shift();
  }

  /** Readings from the load since the last call, oldest first: of the kind the page put on the crank (the dyno's by default). */
  takeReadings<R extends AnyLoadReadings = LoadReadings>(): CrankReadings<R>[] {
    const out = this.readingQueue as CrankReadings<R>[];
    this.readingQueue = [];
    return out;
  }

  /** Which simulation the readings come from. A change in the middle of a run means the run cannot be trusted. */
  get readingsSource(): 'worklet' | 'local' {
    return this.usingWorklet() ? 'worklet' : 'local';
  }

  private usingWorklet(): boolean {
    return this.node !== null && this.report !== null && this.ctx?.state === 'running' && this.report.seq === this.seq;
  }

  /** Advance one frame and report the engine's state. */
  tick(dt: number): DriveSnapshot {
    const audioRunning = this.node !== null && this.ctx?.state === 'running';
    // The audio thread starts or comes back: it takes the state of the local copy, which runs on until it answers.
    if (!audioRunning) this.awaiting = false;
    else if (!this.wasWorklet && !this.awaiting) this.handOver();
    this.measureLag(audioRunning);
    if (!this.usingWorklet()) {
      if (this.wasWorklet) this.takeOver();
      // A slow frame must not become one big step: the pedal's speed control would overshoot, and a car's drivetrain
      // is stable only below its own step.
      const longest = Math.min(0.005, this.local.crank?.load.maxStepS?.() ?? Number.POSITIVE_INFINITY);
      const steps = Math.max(1, Math.ceil(dt / longest));
      for (let i = 0; i < steps; i++) this.local.step(dt / steps);
      this.shownAngle = this.local.angle;
      if (this.local.crank) this.queueReading(this.local.crank.readings());
      const frame = this.local.crank?.load.frame?.(this.localFrame ?? undefined);
      this.localFrame = frame ?? null;
      this.continueFrame(frame, 0, dt);
      return this.snapshot();
    }
    this.awaiting = false;
    this.wasWorklet = true;
    const r = this.report!;
    const cycle = this.config.sim.cycle;
    const age = (performance.now() - this.reportAt) / 1000;
    this.continueFrame(r.frame, age, dt);
    const predicted = r.angle + r.rpm * 6 * Math.min(age, 0.1);
    this.shownAngle += r.rpm * 6 * dt;
    // Ease toward the audio thread's angle rather than jumping on each message.
    let error = (predicted - this.shownAngle) % cycle;
    if (error > cycle / 2) error -= cycle;
    if (error < -cycle / 2) error += cycle;
    this.shownAngle += error * 0.25;
    this.shownAngle = ((this.shownAngle % cycle) + cycle) % cycle;
    return this.snapshot();
  }

  /**
   * The audio thread takes over. A load that hands its state over (a car) goes on there from where the local copy has
   * it; any other load and the engine alone go on with the audio thread's own state, as before.
   */
  private handOver(): void {
    this.seq++;
    this.awaiting = true;
    const kept = this.local.crank?.load.snapshot?.() ?? null;
    this.post({ type: 'loadRestore', snapshot: kept, state: this.local.state, rpm: this.local.rpm, seq: this.seq });
  }

  /** The shown frame of the load from the one reported `age` s ago (or from the local copy, age 0). */
  private continueFrame(at: LoadFrame | undefined, age: number, dt: number): void {
    const shown = this.shownFrame;
    if (!at) {
      this.shownFrame = null;
      return;
    }
    if (!shown || shown.phi.length !== at.phi.length) {
      // Another car, or the first frame: from where it is now.
      const ahead = Math.min(age, 0.1);
      this.shownFrame = {
        ...at,
        phi: at.phi.map((v, k) => v + at.phiDot[k]! * ahead),
        phiDot: Float64Array.from(at.phiDot),
        wheelAngle: at.wheelAngle.map((v, k) => v + at.wheelOmega[k]! * ahead),
      };
      return;
    }
    continueAngles(shown.phi, at.phi, at.phiDot, age, dt);
    continueAngles(shown.wheelAngle, at.wheelAngle, at.wheelOmega, age, dt);
    shown.phiDot.set(at.phiDot);
    shown.wheelOmega = at.wheelOmega;
    shown.wheelRadius = at.wheelRadius;
    shown.speed = at.speed;
    shown.distance = at.distance;
    shown.gear = at.gear;
    shown.selected = at.selected;
    shown.lever = at.lever;
    shown.shift = at.shift;
    shown.clutch = at.clutch;
    shown.clutchSlip = at.clutchSlip;
    shown.brake = at.brake;
  }

  /** The audio clock against the wall clock over windows of a second or more (DriveSnapshot.audioLag). */
  private measureLag(running: boolean): void {
    const ctx = this.ctx;
    const stamp = running && ctx && typeof ctx.getOutputTimestamp === 'function' ? ctx.getOutputTimestamp() : null;
    if (!stamp?.performanceTime || stamp.contextTime === undefined) {
      this.lagFrom.wall = 0;
      return;
    }
    const from = this.lagFrom;
    if (!from.wall) {
      from.wall = stamp.performanceTime;
      from.audio = stamp.contextTime;
      return;
    }
    const wall = (stamp.performanceTime - from.wall) / 1000;
    if (wall < 1) return;
    this.audioLag = Math.max(0, 1 - (stamp.contextTime - from.audio) / wall);
    from.wall = stamp.performanceTime;
    from.audio = stamp.contextTime;
  }

  /**
   * The audio thread stopped: the local copy goes on from its last report, the load from its snapshot. The local engine
   * was not stepped while the audio thread ran, so it takes the reported state too (it may still be cranking from the
   * start), unless the page has stopped it since.
   */
  private takeOver(): void {
    this.wasWorklet = false;
    const r = this.report;
    if (!r) return;
    if (r.loadSnapshot) this.local.crank?.load.restore?.(r.loadSnapshot);
    this.local.adopt(r.state as EngineState, r.rpm);
    // The crank goes on from where the picture showed it, not from where the local copy stopped.
    this.local.angle = this.shownAngle;
    if (!this.wanted) this.local.stop();
  }

  snapshot(): DriveSnapshot {
    // Between the audio thread stopping and the next frame's take-over, its last report is still the newest state.
    if (this.usingWorklet() || this.wasWorklet) {
      const r = this.report!;
      return {
        angle: this.shownAngle,
        rpm: r.rpm,
        state: r.state as EngineState,
        load: r.load,
        throttle: r.throttle,
        fuelCut: r.fuelCut,
        boost: r.boost,
        valves: r.valves,
        vehicle: this.shownFrame ?? undefined,
        processShare: r.processShare,
        loadMethod: r.loadMethod,
        stepSamples: r.stepSamples,
        audioLag: this.audioLag,
      };
    }
    const s = this.local;
    return {
      angle: s.angle,
      rpm: s.rpm,
      state: s.state,
      load: s.load,
      throttle: s.throttle,
      fuelCut: s.fuelCut,
      boost: s.boost,
      valves: s.valves.vvt ? s.valves.state : undefined,
      vehicle: this.shownFrame ?? undefined,
      audioLag: this.audioLag,
    };
  }
}
