// Main-thread side of the engine. Talks to the audio thread when sound is on,
// and runs its own copy of the simulation when it is not.

import type { Engine } from '../engine/kinematics.ts';
import type { LoadCommand, LoadSpec } from '../engine/load.ts';
import { LoadedCrank, type CrankReadings } from '../engine/loaded-crank.ts';
import { createLoad } from '../engine/loads.ts';
import { EngineSim, type EngineState } from '../engine/sim.ts';
import type { EngineTorqueMap } from '../engine/torque-map.ts';
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
  private listen: ListenPosition = 'exhaust';
  private lockedRpm: number | null = null;
  private pedal = 0;
  audioFailed = false;
  // A load on the crank, mirrored in the local copy and on the audio thread.
  private torqueMap: EngineTorqueMap | null = null;
  private loadSpec: LoadSpec | null = null;
  /** The last command that sets a lasting mode, replayed when the audio thread starts. */
  private keptCommand: LoadCommand | null = null;
  private readingQueue: CrankReadings[] = [];

  constructor(engine: Engine) {
    this.config = synthConfig(engine);
    this.local = new EngineSim(this.config.sim);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  get audioReady(): boolean {
    return this.node !== null && this.ctx?.state === 'running';
  }

  get sampleRate(): number {
    return this.ctx?.sampleRate ?? 48000;
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

  setEngine(engine: Engine): void {
    const running = this.snapshot().state === 'running';
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
    this.local.start();
    if (this.lockedRpm !== null) this.local.startImmediately();
    this.post({ type: 'start' });
    if (this.lockedRpm !== null) this.post({ type: 'lock', rpm: this.lockedRpm, running: true });
  }

  stop(): void {
    this.local.stop();
    this.post({ type: 'stop' });
  }

  /** Holds the crank at a fixed speed for slow motion. Null releases it. */
  lock(rpm: number | null): void {
    this.lockedRpm = rpm;
    this.local.lockedRpm = rpm;
    const running = this.snapshot().state === 'running';
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
    this.coupleLocal(true);
    this.post({ type: 'load', spec });
  }

  loadCommand(command: LoadCommand): void {
    this.local.crank?.load.command(command);
    this.post({ type: 'loadCommand', command });
    if (command.action === 'hold' || command.action === 'off' || command.action === 'free') this.keptCommand = command;
  }

  private coupleLocal(newLoad: boolean): void {
    this.readingQueue = [];
    if (!this.torqueMap || !this.loadSpec) this.local.attach(null);
    else if (this.local.crank && !newLoad) this.local.crank.setMap(this.torqueMap);
    else this.local.attach(new LoadedCrank(this.torqueMap, createLoad(this.loadSpec)));
  }

  private queueReading(reading: CrankReadings): void {
    this.readingQueue.push(reading);
    if (this.readingQueue.length > 64) this.readingQueue.shift();
  }

  /** Readings from the load since the last call, oldest first. */
  takeReadings(): CrankReadings[] {
    const out = this.readingQueue;
    this.readingQueue = [];
    return out;
  }

  /** Which simulation the readings come from. A change in the middle of a run means the run cannot be trusted. */
  get readingsSource(): 'worklet' | 'local' {
    return this.usingWorklet() ? 'worklet' : 'local';
  }

  private usingWorklet(): boolean {
    return this.node !== null && this.report !== null && this.ctx?.state === 'running';
  }

  /** Advance one frame and report the engine's state. */
  tick(dt: number): DriveSnapshot {
    if (!this.usingWorklet()) {
      // A slow frame must not become one big step: the pedal's speed control would overshoot.
      const steps = Math.max(1, Math.ceil(dt / 0.005));
      for (let i = 0; i < steps; i++) this.local.step(dt / steps);
      this.shownAngle = this.local.angle;
      if (this.local.crank) this.queueReading(this.local.crank.readings());
      return this.snapshot();
    }
    const r = this.report!;
    const cycle = this.config.sim.cycle;
    const age = (performance.now() - this.reportAt) / 1000;
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

  snapshot(): DriveSnapshot {
    if (this.usingWorklet()) {
      const r = this.report!;
      return {
        angle: this.shownAngle,
        rpm: r.rpm,
        state: r.state as EngineState,
        load: r.load,
        throttle: r.throttle,
        fuelCut: r.fuelCut,
        boost: r.boost,
      };
    }
    const s = this.local;
    return { angle: s.angle, rpm: s.rpm, state: s.state, load: s.load, throttle: s.throttle, fuelCut: s.fuelCut, boost: s.boost };
  }
}
