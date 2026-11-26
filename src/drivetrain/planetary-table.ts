// A planetary automatic "on the table" (stage K11, demonstration 8): something turns the input, the output is free,
// and the visitor closes any of the brakes and clutches, not only the triples of the shift matrix. What the closed
// elements leave decides the motion (topology.ts, StateKind):
// - a gear: one motion, the output follows the input through the ratio;
// - a neutral (two or fewer closed): the input turns, the free output stands, as on the table; the members that
//   still float take the least motion that agrees with both;
// - input-locked (8HP A+C+E): the input cannot turn; the output still can, so it turns at `rollRpm`, as a car
//   rolling with the engine held;
// - locked (four closed): nothing turns.
// Elements close at once: there is no torque converter and no shift timing yet (stages K12a, K12b).
//
// Member speeds always lie in the null space of the permanent links, so the angles integrated from them keep every
// mesh in step. Kinematics only; no DOM.

import { multiply, nullSpace, type Matrix } from './linalg.ts';
import { analyseState, type Gearbox, type StateInfo } from './topology.ts';

export interface PlanetaryPose {
  /** Angle of every member, rad, in `Gearbox.members` order. */
  angles: number[];
  /** Speed of every member per unit input speed (or per unit output speed when the input is held). */
  speeds: number[];
  /** Share of the input power through each mesh, 0–1, in `Gearbox.meshes` order: the power path glow. */
  meshPower: number[];
  /** Closed elements, by id. */
  closed: ReadonlySet<string>;
}

/**
 * Member speeds with these elements closed, the input at `input` and the output at `output` (rad/s or any unit):
 * the least-norm motion that holds them, or null when the elements forbid it (the input of a jammed box turning).
 */
export function speedsWith(box: Gearbox, closed: readonly string[], input: number, output: number): number[] | null {
  const k = box.basis.length;
  const rows = closed.map((id) => box.elementRows[id]!);
  const N = nullSpace(rows, k).basis;
  const dof = N[0]?.length ?? 0;
  if (dof === 0) return input === 0 && output === 0 ? box.members.map(() => 0) : null;
  const PN: Matrix = multiply(box.P, N);
  const a = PN[box.members.indexOf(box.spec.input)]!;
  const b = PN[box.members.indexOf(box.spec.output)]!;
  // Least-norm c with a·c = input, b·c = output: c = Mᵀ(MMᵀ)⁻¹t, M = [a; b], or one equation when they are parallel.
  const aa = dot(a, a);
  const bb = dot(b, b);
  const ab = dot(a, b);
  const det = aa * bb - ab * ab;
  let c: number[];
  const tiny = 1e-12 * Math.max(1, aa * bb);
  if (det > tiny) {
    const ya = (bb * input - ab * output) / det;
    const yb = (aa * output - ab * input) / det;
    c = a.map((v, i) => v * ya + b[i]! * yb);
  } else if (aa > 1e-12) {
    c = a.map((v) => (v * input) / aa);
    if (Math.abs(dot(b, c) - output) > 1e-9 * Math.max(1, Math.abs(output))) return null;
  } else if (bb > 1e-12) {
    if (Math.abs(input) > 1e-12) return null;
    c = b.map((v) => (v * output) / bb);
  } else {
    if (Math.abs(input) > 1e-12 || Math.abs(output) > 1e-12) return null;
    c = new Array<number>(dof).fill(0);
  }
  return PN.map((row) => dot(row, c));
}

const dot = (x: number[], y: number[]): number => x.reduce((s, v, i) => s + v * y[i]!, 0);

export class PlanetaryTable {
  readonly box: Gearbox;
  private closedSet = new Set<string>();
  private info: StateInfo;
  /** Member speeds per unit of what drives the state (the input, or the output when the input is held); null: jammed. */
  private per: number[] | null = null;
  private closedKey = '';
  private readonly pose: PlanetaryPose;
  private readonly cache = new Map<string, StateInfo>();

  constructor(box: Gearbox, closed: readonly string[] = []) {
    this.box = box;
    this.pose = { angles: box.members.map(() => 0), speeds: box.members.map(() => 0), meshPower: box.meshes.map(() => 0), closed: this.closedSet };
    this.info = this.analyse([]);
    this.set(closed);
  }

  /** The closed elements, in the order of the spec. */
  get closed(): string[] {
    return this.box.spec.elements.map((e) => e.id).filter((id) => this.closedSet.has(id));
  }

  /** The closed elements joined by '+', in the order of the spec: the same string while they stay the same. */
  get key(): string {
    return this.closedKey;
  }

  /** What the closed elements leave: a gear, a neutral, the input held, or a jam. */
  get state(): StateInfo {
    return this.info;
  }

  /** The gear of the shift matrix these elements make, if any. */
  get gear(): string | null {
    const key = [...this.closed].sort().join('+');
    if (!key) return null;
    return this.box.spec.states.find((s) => [...s.closed].sort().join('+') === key)?.name ?? null;
  }

  /** Closes exactly these elements. */
  set(closed: readonly string[]): void {
    this.closedSet.clear();
    for (const id of closed) this.closedSet.add(id);
    const ids = this.closed;
    this.closedKey = ids.join('+');
    this.info = this.analyse(ids);
    // Worked out once per change, not every frame: the neutral's and the held input's motions need a null space.
    const kind = this.info.kind;
    this.per = kind === 'gear' ? this.info.speeds! : kind === 'neutral' ? speedsWith(this.box, ids, 1, 0) : kind === 'input-locked' ? speedsWith(this.box, ids, 0, 1) : null;
  }

  /** Opens a closed element or closes an open one. */
  toggle(id: string): void {
    const next = new Set(this.closedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.set([...next]);
  }

  /** Selects a state of the shift matrix ('R', 'N', '1'…). */
  select(name: string): void {
    const s = this.box.spec.states.find((x) => x.name === name);
    this.set(s ? s.closed : []);
  }

  /**
   * Advances by `dt` s with the input driven at `inputRpm`; when the closed elements hold the input, the output rolls
   * at `rollRpm` instead.
   */
  step(dt: number, inputRpm: number, rollRpm = 0): void {
    const w = (inputRpm * Math.PI) / 30;
    const roll = (rollRpm * Math.PI) / 30;
    const s = this.info;
    const speeds = this.pose.speeds;
    const per = this.per;
    const scale = s.kind === 'gear' || s.kind === 'neutral' ? w : s.kind === 'input-locked' ? roll : 0;
    for (let i = 0; i < speeds.length; i++) speeds[i] = per ? per[i]! : 0;
    const angles = this.pose.angles;
    for (let i = 0; i < angles.length; i++) angles[i]! += speeds[i]! * scale * dt;
    const power = this.pose.meshPower;
    for (let j = 0; j < power.length; j++) power[j] = s.kind === 'gear' ? (s.meshLoads?.[j]?.power ?? 0) : 0;
  }

  /** The pose to draw: the same object every call, updated by step(). */
  frame(): PlanetaryPose {
    return this.pose;
  }

  private analyse(closed: string[]): StateInfo {
    const key = closed.join('+');
    let hit = this.cache.get(key);
    if (!hit) {
      hit = analyseState(this.box, closed);
      this.cache.set(key, hit);
    }
    return hit;
  }
}
