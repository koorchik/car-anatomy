// Runs on the audio thread. The crank angle lives here while sound is on, so firing and
// the picture cannot drift apart.

import { EngineSynth, type ListenPosition, type SynthConfig } from './synth.ts';

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
  | { type: 'bang' };

export interface WorkletReport {
  angle: number;
  rpm: number;
  state: string;
  load: number;
  throttle: number;
  fuelCut: boolean;
  boost: number;
}

const REPORT_EVERY = 512;

class EngineProcessor extends AudioWorkletProcessor {
  private synth: EngineSynth | null = null;
  private sinceReport = 0;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<WorkletCommand>) => this.handle(event.data);
  }

  private handle(cmd: WorkletCommand): void {
    switch (cmd.type) {
      case 'config':
        if (this.synth) this.synth.setConfig(cmd.config);
        else this.synth = new EngineSynth(cmd.config, sampleRate);
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
    }
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
      };
      this.port.postMessage(report);
    }
    return true;
  }
}

registerProcessor('engine-processor', EngineProcessor);
