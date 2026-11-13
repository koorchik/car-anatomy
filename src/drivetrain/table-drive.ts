// A gearbox "on the table": something turns the input shaft, the output shaft turns free, and the driver picks a
// gear. Sleeves travel at a fixed rate (0.2 s from neutral to a gear), first out of the old gear, then into the new
// one; while a sleeve closes in on its gear the synchroniser brings the output to that gear's speed, and in neutral
// the free output coasts down. Kinematics only: no torques, no clutch, no engine (the solver stage brings those).
//
// Every member's angle comes from the two base angles (input and output) through P of topology.ts, never from
// integrating each member on its own: research §2.3, so the teeth of a pair can never drift apart.
//
// The pose is what the 3D draws (GearboxFrame in src/scene/gearbox/gearbox-model.ts has the same shape).

import type { Gearbox, StateInfo } from './topology.ts';
import type { SleevePlace } from './spec.ts';

/** Sleeve travel from neutral to a gear, seconds (gearboxes plan, stage 1b). */
export const SLEEVE_TRAVEL_S = 0.2;
/** How fast a synchroniser matches the output to the gear while its sleeve closes in, s. */
const SYNC_TAU = 0.03;
/** How fast the free output coasts down in neutral on the table, s. */
const COAST_TAU = 1.2;
/** Share of the sleeve travel where the blocker ring lets go and the dog teeth start to engage. */
const BLOCK_POINT = 0.5;

export interface TablePose {
  /** Angle of every member, rad, positive in the crank's direction, in `Gearbox.members` order. */
  angles: number[];
  /** Sleeve positions by id: −1 engaged at the front, 0 neutral, 1 engaged at the back. */
  sleeves: Record<string, number>;
  /** Share of the input power through each mesh, 0–1, in `Gearbox.meshes` order: the power path glow. */
  meshPower: number[];
}

/** Which sleeve and side close an element, from the spec's sleeve places. */
function sleeveSides(box: Gearbox): Map<string, { sleeve: SleevePlace; side: -1 | 1 }> {
  const out = new Map<string, { sleeve: SleevePlace; side: -1 | 1 }>();
  for (const s of box.spec.sleeves ?? []) {
    if (s.front) out.set(s.front, { sleeve: s, side: -1 });
    if (s.back) out.set(s.back, { sleeve: s, side: 1 });
  }
  return out;
}

/** Member angles from the input and output angles: ω = P·φ̇ integrates to θ = P·φ (any other base coordinate stays 0). */
export function memberAngles(box: Gearbox, input: number, output: number, out: number[] = new Array<number>(box.members.length).fill(0)): number[] {
  const inputIndex = box.basis.indexOf(box.spec.input);
  const outputIndex = box.basis.indexOf(box.spec.output);
  box.P.forEach((row, i) => {
    out[i] = (inputIndex >= 0 ? row[inputIndex]! * input : 0) + (outputIndex >= 0 ? row[outputIndex]! * output : 0);
  });
  return out;
}

/**
 * The pose with a state fully engaged and the input at `input` rad. In a gear the output follows the input through
 * the ratio; in neutral it stands at `output`.
 */
export function poseAt(box: Gearbox, stateName: string, input: number, output = 0): TablePose {
  const state = box.states.find((s) => s.name === stateName);
  if (!state) throw new Error(`${box.spec.id}: no state ${stateName}`);
  const sides = sleeveSides(box);
  const sleeves = Object.fromEntries((box.spec.sleeves ?? []).map((s) => [s.id, 0]));
  for (const id of state.closed) {
    const at = sides.get(id);
    if (at) sleeves[at.sleeve.id] = at.side;
  }
  const out = state.kind === 'gear' ? input / state.ratio! : output;
  return { angles: memberAngles(box, input, out), sleeves, meshPower: box.meshes.map((_, j) => state.meshLoads?.[j]?.power ?? 0) };
}

export class TableDrive {
  readonly box: Gearbox;
  private readonly sides: Map<string, { sleeve: SleevePlace; side: -1 | 1 }>;
  private readonly sleeveIds: string[];
  private readonly position: Record<string, number> = {};
  private inputAngle = 0;
  private outputAngle = 0;
  private outputSpeed = 0;
  private wanted: StateInfo;
  private readonly pose: TablePose;

  constructor(box: Gearbox, start = 'N') {
    this.box = box;
    this.sides = sleeveSides(box);
    this.sleeveIds = (box.spec.sleeves ?? []).map((s) => s.id);
    for (const id of this.sleeveIds) this.position[id] = 0;
    this.wanted = this.stateOf(start);
    this.pose = { angles: new Array<number>(box.members.length).fill(0), sleeves: { ...this.position }, meshPower: box.meshes.map(() => 0) };
    // Start already in the gear asked for, as a box that was left in it.
    for (const id of this.wanted.closed) {
      const at = this.sides.get(id);
      if (at) this.position[at.sleeve.id] = at.side;
    }
    this.refresh();
  }

  /** The state the driver asked for. */
  get selected(): string {
    return this.wanted.name;
  }

  /** The gear whose sleeve is fully home, or 'N' while none is. */
  get engaged(): string {
    return this.box.states.find((s) => s.kind === 'gear' && this.engagement(s) >= 1)?.name ?? 'N';
  }

  /** Asks for a state of the shift matrix ('N', '1'…, 'R'). An unknown name means neutral. */
  select(name: string): void {
    this.wanted = this.box.states.find((s) => s.name === name) ?? this.stateOf('N');
  }

  /** Advances by `dt` seconds with the input turning at `inputRpm`. */
  step(dt: number, inputRpm: number): void {
    const omega = (inputRpm * Math.PI) / 30;
    this.moveSleeves(dt);
    const home = this.box.states.find((s) => s.kind === 'gear' && this.engagement(s) >= 1);
    const closing = this.wanted.kind === 'gear' ? this.engagement(this.wanted) : 0;
    if (home) {
      this.outputSpeed = omega / home.ratio!;
    } else if (this.wanted.kind === 'gear' && closing > 0) {
      // The blocker ring holds the sleeve until the cone has matched the speeds.
      this.outputSpeed += (omega / this.wanted.ratio! - this.outputSpeed) * Math.min(1, dt / SYNC_TAU);
    } else {
      this.outputSpeed *= Math.exp(-dt / COAST_TAU);
    }
    // Not wrapped: a whole turn of the input is no whole turn of the countershaft, so a wrapped input would make the
    // countershaft jump. A float64 angle stays exact to 1e-9 rad over hours; the 3D wraps each member's own angle.
    this.inputAngle += omega * dt;
    this.outputAngle += this.outputSpeed * dt;
    this.refresh();
  }

  /** The pose to draw now. The same object every call, updated by step(). */
  frame(): TablePose {
    return this.pose;
  }

  private stateOf(name: string): StateInfo {
    const s = this.box.states.find((x) => x.name === name);
    if (!s) throw new Error(`${this.box.spec.id}: no state ${name}`);
    return s;
  }

  /** Where each sleeve should end up for the wanted state: the side of its closed element, else neutral. */
  private targets(): Record<string, number> {
    const target: Record<string, number> = Object.fromEntries(this.sleeveIds.map((id) => [id, 0]));
    for (const id of this.wanted.closed) {
      const at = this.sides.get(id);
      if (at) target[at.sleeve.id] = at.side;
    }
    return target;
  }

  /** Out of the old gear first, then into the new one: two sleeves never stand engaged at once (the interlock). */
  private moveSleeves(dt: number): void {
    const target = this.targets();
    const reach = dt / SLEEVE_TRAVEL_S;
    const wrongSide = (id: string) => this.position[id]! !== 0 && Math.sign(this.position[id]!) !== Math.sign(target[id]!);
    const leaving = this.sleeveIds.filter(wrongSide);
    if (leaving.length) {
      for (const id of leaving) this.position[id] = towards(this.position[id]!, 0, reach);
      return;
    }
    for (const id of this.sleeveIds) this.position[id] = towards(this.position[id]!, target[id]!, reach);
  }

  /** How far a state's sleeves are home, 0–1: the least of its closed elements. */
  private engagement(state: StateInfo): number {
    if (!state.closed.length) return 0;
    let least = 1;
    for (const id of state.closed) {
      const at = this.sides.get(id);
      least = Math.min(least, at ? Math.max(0, this.position[at.sleeve.id]! * at.side) : 0);
    }
    return least;
  }

  private refresh(): void {
    memberAngles(this.box, this.inputAngle, this.outputAngle, this.pose.angles);
    Object.assign(this.pose.sleeves, this.position);
    this.pose.meshPower.fill(0);
    for (const state of this.box.states) {
      if (state.kind !== 'gear' || !state.meshLoads) continue;
      const e = this.engagement(state);
      // The glow comes up as the dog teeth engage, past the blocker point.
      const glow = smooth((e - BLOCK_POINT) / (1 - BLOCK_POINT));
      if (glow <= 0) continue;
      state.meshLoads.forEach((load, j) => (this.pose.meshPower[j]! += glow * load.power));
    }
  }
}

const towards = (from: number, to: number, step: number): number => (from < to ? Math.min(to, from + step) : Math.max(to, from - step));
const smooth = (x: number): number => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
