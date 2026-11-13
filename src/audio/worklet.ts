// Runs on the audio thread. The crank angle lives here while sound is on, so firing and
// the picture cannot drift apart.

import type { ValveState } from '../engine/valve-control.ts';
import { EngineSynth, type ListenPosition, type SynthConfig } from './synth.ts';
import type { AnyLoadReadings, LoadCommand, LoadSnapshot, LoadSpec } from '../engine/load.ts';
import { LoadedCrank, type CrankReadings } from '../engine/loaded-crank.ts';
import { createLoad } from '../engine/loads.ts';
import type { EngineState } from '../engine/sim.ts';
import type { EngineTorqueMap } from '../engine/torque-map.ts';

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
  | { type: 'lock'; rpm: number | null; running: boolean }
  | { type: 'listen'; position: ListenPosition }
  | { type: 'trim'; value: number }
  | { type: 'distress'; value: number }
  | { type: 'bang' }
  | { type: 'torqueMap'; map: EngineTorqueMap | null }
  | { type: 'load'; spec: LoadSpec | null }
  | { type: 'loadCommand'; command: LoadCommand }
  /** The load's state from the other copy (LoadSnapshot), with the state and speed of that copy's engine. */
  | { type: 'loadRestore'; snapshot: LoadSnapshot; state: EngineState; rpm: number };

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
}

const REPORT_EVERY = 512;

class EngineProcessor extends AudioWorkletProcessor {
  private synth: EngineSynth | null = null;
  private sinceReport = 0;
  private torqueMap: EngineTorqueMap | null = null;
  private loadSpec: LoadSpec | null = null;

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
        const sim = this.synth?.sim;
        if (!sim?.crank?.load.restore) break;
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
    const left = out[0]!;
    const right = out[1] ?? left;
    this.synth.process(left, right);
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
      };
      this.port.postMessage(report);
    }
    return true;
  }
}

registerProcessor('engine-processor', EngineProcessor);
