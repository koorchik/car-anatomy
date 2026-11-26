// Runs on the audio thread. The crank angle lives here while sound is on, so firing and
// the picture cannot drift apart.

import type { ValveState } from '../engine/valve-control.ts';
import { EngineSynth, type ListenPosition, type SynthConfig } from './synth.ts';
import type { AnyLoadReadings, LoadCommand, LoadFrame, LoadSnapshot, LoadSpec } from '../engine/load.ts';
import { LoadedCrank, type CrankReadings } from '../engine/loaded-crank.ts';
import { createLoad } from '../engine/loads.ts';
import type { EngineState } from '../engine/sim.ts';
import type { EngineTorqueMap } from '../engine/torque-map.ts';
import { ProcessMeter, scopeClock, type LoadMethod } from './process-meter.ts';

declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

export type WorkletCommand =
  | { type: 'config'; config: SynthConfig; running: boolean }
  | { type: 'pedal'; value: number }
  | { type: 'start' }
  | { type: 'stop' }
  /** Off at once, without the run-down (Drive.halt). */
  | { type: 'halt' }
  | { type: 'lock'; rpm: number | null; running: boolean }
  | { type: 'listen'; position: ListenPosition }
  | { type: 'trim'; value: number }
  | { type: 'distress'; value: number }
  | { type: 'bang' }
  | { type: 'torqueMap'; map: EngineTorqueMap | null }
  | { type: 'load'; spec: LoadSpec | null }
  | { type: 'loadCommand'; command: LoadCommand }
  /**
   * The audio thread takes over from the main-thread copy: the load's state (LoadSnapshot, null for a load without
   * one), with the state and speed of that copy's engine. `seq` comes back in every report from then on, so the main
   * thread can tell reports from before the hand-over, which describe a car it has driven on since.
   */
  | { type: 'loadRestore'; snapshot: LoadSnapshot | null; state: EngineState; rpm: number; seq: number };

export interface WorkletReport {
  angle: number;
  rpm: number;
  state: string;
  load: number;
  throttle: number;
  fuelCut: boolean;
  boost: number;
  /** Averages from a load on the crank since the last report. */
  crank: CrankReadings<AnyLoadReadings> | null;
  /** The load's whole state, for a load that hands it over (a car), so the main-thread copy can go on from it. */
  loadSnapshot?: LoadSnapshot;
  /** Variable valve gear, only for engines that have it. */
  valves?: ValveState;
  /** What a page shows of the load (a car's speed, gear and angles), for a load that has it. */
  frame?: LoadFrame;
  /** The last hand-over this thread has taken (loadRestore's seq). */
  seq: number;
  /** Share of the blocks' time process() took over the last window (process-meter.ts), and how it was timed. */
  processShare: number;
  loadMethod: LoadMethod;
  /** Samples per simulation step now: 16, or 32 while the thread runs short of time. */
  stepSamples: number;
}

const REPORT_EVERY = 512;

class EngineProcessor extends AudioWorkletProcessor {
  private synth: EngineSynth | null = null;
  private sinceReport = 0;
  private torqueMap: EngineTorqueMap | null = null;
  private loadSpec: LoadSpec | null = null;
  private seq = 0;
  private readonly meter = new ProcessMeter(scopeClock(), sampleRate);

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<WorkletCommand>) => this.handle(event.data);
  }

  private handle(cmd: WorkletCommand): void {
    switch (cmd.type) {
      case 'config':
        if (this.synth) this.synth.setConfig(cmd.config);
        else {
          this.synth = new EngineSynth(cmd.config, sampleRate);
          this.couple(true);
        }
        if (cmd.running) this.synth.sim.startImmediately();
        break;
      case 'pedal':
        if (this.synth) this.synth.sim.pedal = cmd.value;
        break;
      case 'start':
        this.synth?.sim.start();
        break;
      case 'stop':
        this.synth?.sim.stop();
        break;
      case 'halt':
        this.synth?.sim.adopt('off', 0);
        break;
      case 'lock':
        if (!this.synth) break;
        this.synth.sim.lockedRpm = cmd.rpm;
        if (cmd.running) this.synth.sim.startImmediately();
        break;
      case 'listen':
        this.synth?.setListen(cmd.position);
        break;
      case 'trim':
        this.synth?.setTrim(cmd.value);
        break;
      case 'distress':
        this.synth?.setDistress(cmd.value);
        break;
      case 'bang':
        this.synth?.bang();
        break;
      case 'torqueMap':
        this.torqueMap = cmd.map;
        this.couple(false);
        break;
      case 'load':
        this.loadSpec = cmd.spec;
        this.couple(true);
        break;
      case 'loadCommand':
        this.synth?.sim.crank?.load.command(cmd.command);
        break;
      case 'loadRestore': {
        this.seq = cmd.seq;
        const sim = this.synth?.sim;
        if (!cmd.snapshot || !sim?.crank?.load.restore) break;
        sim.crank.load.restore(cmd.snapshot);
        sim.adopt(cmd.state, cmd.rpm);
        break;
      }
    }
  }

  /** A load needs both its description and the engine's torque map. A new map keeps the load and its state. */
  private couple(newLoad: boolean): void {
    const sim = this.synth?.sim;
    if (!sim) return;
    if (!this.torqueMap || !this.loadSpec) sim.attach(null);
    else if (sim.crank && !newLoad) sim.crank.setMap(this.torqueMap);
    else sim.attach(new LoadedCrank(this.torqueMap, createLoad(this.loadSpec)));
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    if (!out || !this.synth) return true;
    const meter = this.meter;
    meter.begin();
    const left = out[0]!;
    const right = out[1] ?? left;
    const synth = this.synth;
    // Short of time for two windows running: a step twice as long, if the load on the crank is stable at it; with time
    // to spare again, back to the fine one.
    if (synth.stepSamples === 16) {
      if (meter.wantsCoarse && (synth.sim.crank?.load.maxStepS?.() ?? Infinity) >= 32 / sampleRate) {
        synth.stepSamples = 32;
        meter.settle();
      }
    } else if (meter.wantsFine) {
      synth.stepSamples = 16;
      meter.settle();
    }
    synth.process(left, right);
    this.sinceReport += left.length;
    if (this.sinceReport >= REPORT_EVERY) {
      this.sinceReport = 0;
      const sim = this.synth.sim;
      const report: WorkletReport = {
        angle: sim.angle,
        rpm: sim.rpm,
        state: sim.state,
        load: sim.load,
        throttle: sim.throttle,
        fuelCut: sim.fuelCut,
        boost: sim.boost,
        crank: sim.crank ? sim.crank.readings() : null,
        valves: sim.valves.vvt ? { ...sim.valves.state } : undefined,
        loadSnapshot: sim.crank?.load.snapshot?.(),
        frame: sim.crank?.load.frame?.(),
        seq: this.seq,
        processShare: meter.share,
        loadMethod: meter.method,
        stepSamples: synth.stepSamples,
      };
      this.port.postMessage(report);
    }
    meter.end(left.length);
    return true;
  }
}

registerProcessor('engine-processor', EngineProcessor);
