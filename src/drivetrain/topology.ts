// buildGearbox(): everything the gearbox data implies (docs/gearbox-model.md, the derivation section).
//
// 1. Members and their inertias (gears add a steel disc on the reference circle).
// 2. Permanent links A: one row per mesh, z_a(ω_a − ω_c) ± z_b(ω_b − ω_c) = 0, and one per rigid coupling.
// 3. Base coordinates: ω = P·φ̇ over the null space of A, with the input first and the output second, so the base
//    coordinates mean something (input shaft speed, output speed).
// 4. Element rows in base coordinates: B_e = P_a − P_b for a clutch, B_e = P_a for a brake.
// 5. For each state of the shift matrix, its kind and ratio from the null space of its closed elements.
// 6. The power path: static equilibrium with every link explicit, Aᵀλ + B_closedᵀμ + τ = 0, under a unit input torque
//    with the output reaction unknown. λ of a mesh is its tangential force (F_t = 2λ/m_t) and rolling power.
// 7. Mesh phases: the starting angle of every gear so that no teeth overlap, from the formula of research §2.2.
// 8. Pair geometry: every mesh's centre distance must match the axes in the data (profile shift included).
//
// The audio thread never calls this: it gets flat arrays from the solver stage. Kinematics only, no DOM, no text.

import { direction, meshPhase, pairGeometry, type PairGeometry, wrap } from './gear-geometry.ts';
import { type Matrix, multiply, nullSpace, solveMinNorm } from './linalg.ts';
import type { GearboxSpec, GearDef } from './spec.ts';

const STEEL_DENSITY = 7850;
/** Relative size below which a speed, a torque or a mesh force counts as zero. */
const ZERO = 1e-9;
/** How far the axes in the data may sit from a pair's working centre distance, mm. */
const CENTRE_TOLERANCE = 1e-3;

/**
 * What a state does with the input and the output:
 * - gear: one motion links them, i = ω_in/ω_out;
 * - neutral: the output does not follow the input;
 * - input-locked: the input must stand while the output turns freely (8HP A+C+E);
 * - output-locked: the output must stand while the input turns (park);
 * - locked: both must stand, the box is jammed (two gears of a manual at once).
 */
export type StateKind = 'gear' | 'neutral' | 'input-locked' | 'output-locked' | 'locked';

export interface MeshLoad {
  /** Constraint multiplier for a unit input torque: the mesh puts z_a·λ on gear a and z_b·λ on gear b, N·m. */
  lambda: number;
  /** Tangential force on the reference circle, F_t = 2λ/m_t, newtons per N·m of input torque. */
  force: number;
  /** Rolling power |z_a·λ·(ω_a − ω_c)| as a share of the input power. */
  power: number;
}

export interface StateInfo {
  name: string;
  closed: string[];
  kind: StateKind;
  /** Degrees of freedom left with these elements closed. */
  dof: number;
  /** i = ω_in/ω_out, signed; null unless a gear. */
  ratio: number | null;
  /** Member speeds per unit input speed, in `Gearbox.members` order; null unless a gear. */
  speeds: number[] | null;
  /** Per mesh, in `Gearbox.meshes` order; null unless a gear. */
  meshLoads: MeshLoad[] | null;
  /** Indices of the meshes that carry torque. */
  loaded: number[];
  /** Torque the output delivers per N·m of input, from the equilibrium (equals the ratio without losses). */
  outputTorque: number | null;
  /** Reaction torque of each closed element per N·m of input. */
  elementTorques: Record<string, number>;
  /** η = 1 − Σ(1 − η_mesh)·P_rolling/P_in. */
  efficiency: number | null;
}

export interface MeshInfo {
  /** Gear ids. */
  a: string;
  b: string;
  memberA: string;
  memberB: string;
  carrier: string | null;
  internal: boolean;
  /** A crown wheel and its pinion on crossing axes: no centre distance, no phase from topology.ts. */
  bevel: boolean;
  /** For a bevel pair, the equivalent spur pair at the outer module: it gives the tangential force on the outer pitch circle. */
  geometry: PairGeometry;
  /** Distance between the two axes in the data, mm; 0 for a bevel pair. */
  axisDistance: number;
  /** Direction from a's axis to b's, rad, clockwise from +Y seen from the front. */
  direction: number;
}

export interface Gearbox {
  spec: GearboxSpec;
  members: string[];
  /** kg·m², in `members` order: data inertia plus the gears' own. */
  inertia: number[];
  /** Permanent links in member space: one row per mesh, then one per coupling. */
  links: Matrix;
  /** ω = P·φ̇, members × base coordinates. */
  P: Matrix;
  /** The member each base coordinate stands for: the input first, the output second when it is free. */
  basis: string[];
  /** Element rows in base coordinates. */
  elementRows: Record<string, number[]>;
  meshes: MeshInfo[];
  states: StateInfo[];
  /** Angle of tooth 0 of every gear with every member at angle 0, rad. */
  phases: Record<string, number>;
}

const cache = new WeakMap<GearboxSpec, Gearbox>();

/** Derives everything from the data; the result is cached per spec object. Throws when the data is inconsistent. */
export function buildGearbox(spec: GearboxSpec): Gearbox {
  const hit = cache.get(spec);
  if (hit) return hit;
  const members = spec.members.map((m) => m.id);
  const index = new Map(members.map((id, i) => [id, i]));
  const at = (id: string, what: string): number => {
    const i = index.get(id);
    if (i === undefined) throw new Error(`${spec.id}: ${what} names unknown member ${id}`);
    return i;
  };
  const gears = new Map(spec.gears.map((g) => [g.id, g]));
  const gearOf = (id: string): GearDef => {
    const g = gears.get(id);
    if (!g) throw new Error(`${spec.id}: unknown gear ${id}`);
    return g;
  };
  const axes = new Map(spec.axes.map((a) => [a.id, a]));
  const axisOf = (member: string) => {
    const def = spec.members[at(member, 'axis lookup')]!;
    const axis = axes.get(def.axis);
    if (!axis) throw new Error(`${spec.id}: member ${member} sits on unknown axis ${def.axis}`);
    return axis;
  };

  // A gear with 0 or 20.5 teeth would build: its mesh row just decouples the shafts or gives a ratio no gear has.
  for (const g of spec.gears) {
    if (!Number.isInteger(g.teeth) || g.teeth < 1) throw new Error(`${spec.id}: gear ${g.id} has ${g.teeth} teeth`);
    if (!(g.module > 0) || !(g.faceWidth > 0)) throw new Error(`${spec.id}: gear ${g.id} needs a positive module and face width`);
  }

  // 1. Inertias.
  const inertia = spec.members.map((m) => m.inertia ?? 0);
  for (const g of spec.gears) {
    const r = (g.module * g.teeth) / Math.cos((g.helix * Math.PI) / 180) / 2000;
    const bore = (g.bore ?? 0) / 2000;
    inertia[at(g.member, `gear ${g.id}`)]! += (STEEL_DENSITY * Math.PI * (g.faceWidth / 1000) * (r ** 4 - bore ** 4)) / 2;
  }

  // 2. Permanent links, with the geometry of every mesh checked against the axes.
  const links: Matrix = [];
  const meshes: MeshInfo[] = spec.meshes.map((mesh) => {
    const a = gearOf(mesh.a);
    const b = gearOf(mesh.b);
    const internal = !!(a.internal || b.internal);
    const row = new Array<number>(members.length).fill(0);
    const sign = internal ? -1 : 1;
    row[at(a.member, `mesh ${mesh.a}`)]! += a.teeth;
    row[at(b.member, `mesh ${mesh.b}`)]! += sign * b.teeth;
    if (mesh.carrier) row[at(mesh.carrier, `mesh carrier`)]! -= a.teeth + sign * b.teeth;
    links.push(row);
    const axisA = axisOf(a.member);
    const axisB = axisOf(b.member);
    // A bevel pair (a crown wheel and its pinion) meshes across the shafts. Its row is an external mesh's, the sign
    // chosen so that forward stays forward; its axes cross, so there is no centre distance to check and no phase to
    // pass on through it (the 3D sets the bevel pair's own).
    const bevel = a.cone !== undefined || b.cone !== undefined;
    if (bevel !== ((axisA.across === undefined) !== (axisB.across === undefined))) {
      throw new Error(`${spec.id}: mesh ${mesh.a}/${mesh.b}: only a bevel pair, and every bevel pair, has one axis across the shafts`);
    }
    const axisDistance = bevel ? 0 : Math.hypot(axisB.x - axisA.x, axisB.y - axisA.y);
    if (internal) throw new Error(`${spec.id}: internal mesh ${mesh.a}/${mesh.b} needs the planetary stage`);
    const geometry = pairGeometry(a, b);
    if (!bevel && Math.abs(geometry.centre - axisDistance) > CENTRE_TOLERANCE) {
      throw new Error(`${spec.id}: mesh ${mesh.a}/${mesh.b} runs at ${geometry.centre.toFixed(4)} mm but its axes are ${axisDistance.toFixed(4)} mm apart`);
    }
    return {
      a: a.id, b: b.id, memberA: a.member, memberB: b.member, carrier: mesh.carrier ?? null, internal, bevel,
      geometry, axisDistance, direction: bevel ? 0 : direction(axisA, axisB),
    };
  });
  for (const [a, b] of spec.couplings) {
    const row = new Array<number>(members.length).fill(0);
    row[at(a, 'coupling')] = 1;
    row[at(b, 'coupling')] = -1;
    links.push(row);
  }

  // 3. Base coordinates: pivot on everything but the input and the output, so those two stay free when they can.
  const inputIndex = at(spec.input, 'input');
  const outputIndex = at(spec.output, 'output');
  const order = [...members.keys()].filter((i) => i !== inputIndex && i !== outputIndex);
  order.push(outputIndex, inputIndex);
  const { basis: P, free } = nullSpace(links, members.length, order);
  const basis = free.map((i) => members[i]!);

  // 4. Element rows.
  const elementRows: Record<string, number[]> = {};
  for (const e of spec.elements) {
    const a = P[at(e.a, `element ${e.id}`)]!;
    const b = e.b === null ? null : P[at(e.b, `element ${e.id}`)]!;
    elementRows[e.id] = a.map((v, k) => v - (b ? b[k]! : 0));
  }

  const box: Gearbox = { spec, members, inertia, links, P, basis, elementRows, meshes, states: [], phases: {} };
  // 5–6. States.
  box.states = spec.states.map((s) => analyseState(box, s.closed, s.name));
  // 7. Phases.
  box.phases = meshPhases(spec, meshes, gearOf);
  cache.set(spec, box);
  return box;
}

const isZero = (v: number[], scale = 1): boolean => v.every((x) => Math.abs(x) <= ZERO * scale);

/** Kind, ratio and power path of the box with these elements closed (any combination, not only the matrix). */
export function analyseState(box: Gearbox, closed: string[], name = closed.join('+') || 'N'): StateInfo {
  const { spec, members, P } = box;
  const k = box.basis.length;
  const rows = closed.map((id) => {
    const row = box.elementRows[id];
    if (!row) throw new Error(`${spec.id}: state ${name} closes unknown element ${id}`);
    return row;
  });
  const N = nullSpace(rows, k).basis;
  const dof = N[0]?.length ?? 0;
  const PN = dof ? multiply(P, N) : members.map(() => [] as number[]);
  const inputIndex = members.indexOf(spec.input);
  const outputIndex = members.indexOf(spec.output);
  const a = PN[inputIndex]!;
  const b = PN[outputIndex]!;
  const scale = Math.max(1, ...PN.flatMap((row) => row.map(Math.abs)));
  const base: StateInfo = {
    name, closed, kind: 'neutral', dof, ratio: null, speeds: null, meshLoads: null, loaded: [], outputTorque: null, elementTorques: {}, efficiency: null,
  };
  const inputFree = !isZero(a, scale);
  const outputFree = !isZero(b, scale);
  if (!inputFree && !outputFree) return { ...base, kind: 'locked' };
  if (!inputFree) return { ...base, kind: 'input-locked' };
  if (!outputFree) return { ...base, kind: 'output-locked' };
  const aa = a.reduce((s, v) => s + v * v, 0);
  const c = a.reduce((s, v, i) => s + v * b[i]!, 0) / aa;
  if (!isZero(b.map((v, i) => v - c * a[i]!), scale)) return base;
  // A gear: the output follows the input. Speeds for ω_in = 1 (the minimum-norm motion if other members float).
  const psi = a.map((v) => v / aa);
  const speeds = PN.map((row) => row.reduce((s, v, i) => s + v * psi[i]!, 0));
  const ratio = 1 / c;
  return { ...base, kind: 'gear', ratio, speeds, ...powerPath(box, closed, speeds) };
}

/**
 * Static equilibrium under a unit input torque: unknowns are the link multipliers λ, the closed elements' torques μ
 * and the output reaction; every member's torques sum to zero.
 */
function powerPath(box: Gearbox, closed: string[], speeds: number[]): Pick<StateInfo, 'meshLoads' | 'loaded' | 'outputTorque' | 'elementTorques' | 'efficiency'> {
  const { spec, members, links, meshes } = box;
  const n = members.length;
  const elements = closed.map((id) => spec.elements.find((e) => e.id === id)!);
  const columns = links.length + elements.length + 1;
  const M: Matrix = Array.from({ length: n }, () => new Array<number>(columns).fill(0));
  links.forEach((row, j) => row.forEach((v, i) => (M[i]![j] = v)));
  elements.forEach((e, j) => {
    M[members.indexOf(e.a)]![links.length + j] = 1;
    if (e.b !== null) M[members.indexOf(e.b)]![links.length + j] = -1;
  });
  const outputIndex = members.indexOf(spec.output);
  M[outputIndex]![columns - 1] = 1;
  const rhs = new Array<number>(n).fill(0);
  rhs[members.indexOf(spec.input)] = -1;
  const { x, residual } = solveMinNorm(M, rhs);
  if (residual > 1e-6) throw new Error(`${spec.id}: no static equilibrium in state ${closed.join('+')}`);
  const memberIndex = new Map(members.map((id, i) => [id, i]));
  let lost = 0;
  const meshLoads = meshes.map((mesh, j) => {
    const lambda = x[j]!;
    const gearA = spec.gears.find((g) => g.id === mesh.a)!;
    const carrierSpeed = mesh.carrier ? speeds[memberIndex.get(mesh.carrier)!]! : 0;
    const power = Math.abs(gearA.teeth * lambda * (speeds[memberIndex.get(mesh.memberA)!]! - carrierSpeed));
    lost += (1 - spec.meshEfficiency) * power;
    return { lambda, force: (2 * lambda) / (mesh.geometry.a.mt / 1000), power };
  });
  const loaded = meshLoads.flatMap((load, j) => {
    const gearA = spec.gears.find((g) => g.id === meshes[j]!.a)!;
    return Math.abs(load.lambda * gearA.teeth) > ZERO ? [j] : [];
  });
  const elementTorques = Object.fromEntries(elements.map((e, j) => [e.id, x[links.length + j]!]));
  return { meshLoads, loaded, outputTorque: -x[columns - 1]!, elementTorques, efficiency: 1 - lost };
}

/**
 * Tooth-0 angle of every gear with all members at angle 0, propagated mesh by mesh from the first gear of each
 * connected group. A gear reached twice (a closed loop of meshes) must agree to a tooth, or the data cannot be built.
 * Bevel pairs are left out: a gear only in a bevel pair has no phase here.
 */
function meshPhases(spec: GearboxSpec, meshes: MeshInfo[], gearOf: (id: string) => GearDef): Record<string, number> {
  const phases: Record<string, number> = {};
  const pending = new Set(spec.gears.filter((g) => meshes.some((m) => !m.bevel && (m.a === g.id || m.b === g.id))).map((g) => g.id));
  while (pending.size) {
    const first = pending.values().next().value!;
    phases[first] = 0;
    pending.delete(first);
    const queue = [first];
    while (queue.length) {
      const id = queue.shift()!;
      for (const mesh of meshes) {
        if (mesh.bevel || (mesh.a !== id && mesh.b !== id)) continue;
        const from = gearOf(id);
        const to = gearOf(mesh.a === id ? mesh.b : mesh.a);
        const phi = mesh.a === id ? mesh.direction : mesh.direction + Math.PI;
        const theta = meshPhase(phases[id]!, from.teeth, to.teeth, phi);
        if (to.id in phases) {
          const pitch = (2 * Math.PI) / to.teeth;
          const off = wrap(theta - phases[to.id]!) % pitch;
          if (Math.min(off, pitch - off) > 1e-6) throw new Error(`${spec.id}: gear ${to.id} cannot mesh with both neighbours (assembly condition)`);
          continue;
        }
        phases[to.id] = theta;
        pending.delete(to.id);
        queue.push(to.id);
      }
    }
  }
  return phases;
}

/** The gear's angle when its member has turned by `memberAngle` (rad, positive in the crank's direction). */
export const gearAngle = (box: Gearbox, gear: string, memberAngle: number): number => wrap((box.phases[gear] ?? 0) + memberAngle);

export const stateByName = (box: Gearbox, name: string): StateInfo => {
  const s = box.states.find((x) => x.name === name);
  if (!s) throw new Error(`${box.spec.id}: no state ${name}`);
  return s;
};
