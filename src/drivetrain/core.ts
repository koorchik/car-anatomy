// The drivetrain as the solver sees it (DrivetrainCore): flat arrays built once on the main thread from a derived
// Gearbox, the launch parts in front of it and whatever hangs on its output. The audio thread, the main-thread copy
// and the tests all step this same object, and it crosses to the worklet by postMessage. Stepping it needs nothing
// but numbers: the derivation (topology.ts) and the gear geometry stay on the main thread (drivetrain-topology 10).
//
// The pieces come as drafts in member space: members with their inertia, rigid links, springs, elements. Merging
// drafts and taking the null space of all links once gives base coordinates for the whole drivetrain, ω = P·φ̇, with
// the mass matrix M = Pᵀ·diag(J)·P constant for good. The axle is one more draft (final-drive.ts): its halfshaft
// springs end on wheel angles the chassis integrates (anchors), its plate differential takes a capacity from the
// halfshaft torques, and the gearbox and the final drive lose a share of the torque they carry.

import { DISC_HUB, DRY_STRIBECK, ESTIMATED_SYNCHRO, MANUAL_SPIN_LOSS, clampTorque, plateHeatCapacity } from './elements.ts';
import { type Matrix, nullSpace } from './linalg.ts';
import type { DamperDef, FrictionDef, SpinLossDef, SynchroDef } from './spec.ts';
import { coneTorquePerN } from './synchro-math.ts';
import type { Gearbox } from './topology.ts';

/** What a shift element does in the solver. Codes, because the audio thread steps them in a loop. */
export const FRICTION = 0;
export const SYNCHRO = 1;
export const DOG = 2;
export const ONEWAY = 3;
export type CoreElementKind = typeof FRICTION | typeof SYNCHRO | typeof DOG | typeof ONEWAY;

export interface DraftMember {
  id: string;
  /** kg·m². */
  inertia: number;
}

/** Torsion spring between two members (b null: the case), N·m/rad and N·m·s/rad. */
export interface DraftSpring {
  id: string;
  a: string;
  b: string | null;
  /**
   * With b null: the spring ends on an angle outside the drivetrain, slot `anchor` of the solver's anchorAngle and
   * anchorSpeed (a wheel: the WheelBus index). What it passes on is the solver's springApplied.
   */
  anchor?: number;
  stiffness: number;
  damping: number;
}

/**
 * A differential's friction element whose capacity follows the torque on the case, re-read every step from the two
 * halfshaft springs: T_high − T_low = preload + S·|T_case|, so the element between the side gears holds half of it
 * (spec.ts, the plate differential).
 */
export interface DraftDiff {
  element: string;
  /** Halfshaft springs of the left and right outputs. */
  left: string;
  right: string;
  /** Locking value S on drive (case torque forward) and on coast. */
  lockDrive: number;
  lockCoast: number;
  /** Breakaway torque with the case held (one wheel turned, the other turns back), N·m. */
  preloadNm: number;
}

/**
 * A loss proportional to the torque a part carries: −share·|Σ gain·T_spring| against the turning of `member`, so it
 * brakes on drive and on coast alike (the gearbox plan, losses). `states` makes the share depend on which shift
 * elements are locked (a gearbox: 1 − η of the gear); without them the share is fixed (the final drive).
 */
export interface DraftLoss {
  member: string;
  source: Array<[string, number]>;
  share: number;
  states?: Array<{ elements: string[]; share: number }>;
}

export type DraftElement =
  | { id: string; kind: 'friction'; a: string; b: string | null; friction: FrictionDef; heated?: boolean }
  | { id: string; kind: 'synchro'; a: string; b: string | null; synchro: SynchroDef }
  | { id: string; kind: 'dog' | 'oneway'; a: string; b: string | null };

export interface CoreDraft {
  members: DraftMember[];
  /** Rigid links in member space: Σ coefficient·ω_member = 0 (gear meshes, couplings). */
  links: Array<Array<[string, number]>>;
  springs: DraftSpring[];
  elements: DraftElement[];
  /** Members that should become base coordinates, in this order, when they are free. */
  prefer: string[];
  /** Spin loss, applied at this member (the gearbox input). */
  drag: { member: string; loss: SpinLossDef } | null;
  /** Gear meshes for the sound and the reports: member and teeth on each side. */
  meshes: Array<{ a: string; teethA: number; b: string; teethB: number }>;
  diffs?: DraftDiff[];
  losses?: DraftLoss[];
}

export interface CoreSprings {
  ids: string[];
  /** count × n, row-major: the spring's twist rate in base coordinates. */
  rows: Float64Array;
  stiffness: Float64Array;
  damping: Float64Array;
  /** Anchor slot of each spring's b end, −1 for a member or the case. */
  anchor: Int32Array;
}

/** Differentials with a torque-dependent capacity (DraftDiff), as indices. */
export interface CoreDiffs {
  element: Int32Array;
  left: Int32Array;
  right: Int32Array;
  drive: Float64Array;
  coast: Float64Array;
  preload: Float64Array;
}

/** A DraftLoss as indices: the state table lists element indices. */
export interface CoreLoss {
  member: number;
  springs: Int32Array;
  gains: Float64Array;
  share: number;
  states: Array<{ elements: Int32Array; share: number }>;
}

export interface CoreElements {
  ids: string[];
  kind: Uint8Array;
  /** Member indices on each side; −1 is the case. */
  a: Int32Array;
  b: Int32Array;
  /** count × n, row-major: Δω = ω_a − ω_b in base coordinates. */
  rows: Float64Array;
  /** Friction: F·r_m·z at full clamp, N·m per unit μ. Synchro: cone torque per newton of sleeve force, N·m/N. */
  scale: Float64Array;
  muStatic: Float64Array;
  muKinetic: Float64Array;
  /** Stribeck decay, rad/s. */
  stribeck: Float64Array;
  /** 1/(b·M⁻¹·bᵀ): the inertia the element's slip sees with everything else free, kg·m². */
  slipInertia: Float64Array;
  /** Heat capacity the slip heats, J/K; 0 keeps no temperature. */
  heatCapacity: Float64Array;
}

export interface DrivetrainCore {
  /** Number of base coordinates. */
  n: number;
  /** The member each base coordinate stands for. */
  coords: string[];
  members: string[];
  /** ω = P·φ̇: members × n, row-major. */
  P: Float64Array;
  /** kg·m² per member. */
  inertia: Float64Array;
  /** M = Pᵀ·diag(J)·P and its inverse, n × n. */
  mass: Float64Array;
  massInverse: Float64Array;
  springs: CoreSprings;
  elements: CoreElements;
  /** Spin loss a + b·ω at a member; member −1 for none. */
  drag: { member: number; a: number; b: number };
  meshes: { a: Int32Array; teethA: Float64Array; b: Int32Array; teethB: Float64Array };
  /** Number of outside angles springs may end on (the wheels: 4), 0 without any. */
  anchorSlots: number;
  diffs: CoreDiffs;
  losses: CoreLoss[];
}

const emptyDraft = (): CoreDraft => ({ members: [], links: [], springs: [], elements: [], prefer: [], drag: null, meshes: [], diffs: [], losses: [] });

/** One draft of several: members, links, springs and elements side by side; the first drag wins. */
export function mergeDrafts(...drafts: CoreDraft[]): CoreDraft {
  const out = emptyDraft();
  for (const d of drafts) {
    out.members.push(...d.members);
    out.links.push(...d.links);
    out.springs.push(...d.springs);
    out.elements.push(...d.elements);
    out.prefer.push(...d.prefer);
    out.meshes.push(...d.meshes);
    out.diffs!.push(...(d.diffs ?? []));
    out.losses!.push(...(d.losses ?? []));
    out.drag ??= d.drag;
  }
  return out;
}

/**
 * A derived gearbox as a draft: its members and inertias, its meshes and couplings as links, its shift elements
 * (a synchroniser without data gets ESTIMATED_SYNCHRO) and its spin loss at the input.
 */
export function gearboxDraft(box: Gearbox, synchro: SynchroDef = ESTIMATED_SYNCHRO): CoreDraft {
  const { spec } = box;
  const elements: DraftElement[] = spec.elements.map((e): DraftElement => {
    switch (e.kind) {
      case 'synchro':
        return { id: e.id, kind: 'synchro', a: e.a, b: e.b, synchro: e.synchro ?? synchro };
      case 'dog':
      case 'oneway':
        return { id: e.id, kind: e.kind, a: e.a, b: e.b };
      case 'clutch':
      case 'brake':
        if (!e.friction) throw new Error(`${spec.id}: friction element ${e.id} has no friction data`);
        return { id: e.id, kind: 'friction', a: e.a, b: e.b, friction: e.friction };
      case 'variator':
        throw new Error(`${spec.id}: element ${e.id}: the variator comes with its own stage`);
    }
  });
  const teeth = new Map(spec.gears.map((g) => [g.id, g]));
  return {
    members: box.members.map((id, i) => ({ id, inertia: box.inertia[i]! })),
    links: box.links.map((row) => row.flatMap((v, i): Array<[string, number]> => (v === 0 ? [] : [[box.members[i]!, v]]))),
    springs: [],
    elements,
    prefer: [spec.input, spec.output],
    drag: { member: spec.input, loss: spec.spinLoss ?? MANUAL_SPIN_LOSS },
    meshes: box.meshes.map((m) => ({ a: m.memberA, teethA: teeth.get(m.a)!.teeth, b: m.memberB, teethB: teeth.get(m.b)!.teeth })),
  };
}

/** What sits between the crank and the gearbox input. */
export interface LaunchParts {
  /** Crank, flywheel (a DMF's primary) and the clutch cover: everything ahead of the damper spring, kg·m². */
  engineInertia: number;
  damper: DamperDef;
  /** The driver's clutch between the damper's secondary and the input; null bolts the input to the secondary. */
  clutch: FrictionDef | null;
  /** The disc's hub and side plates, which always turn with the input shaft, kg·m² (default DISC_HUB). */
  discHub?: number;
}

/** Member ids of the launch draft. */
export const CRANK = 'crank';
export const DISC = 'disc';
export const DISC_HUB_MEMBER = 'disc-hub';
export const CLUTCH = 'clutch';
export const DAMPER = 'damper';

/**
 * Crank → damper spring → the mass behind it (disc ring or DMF secondary) → clutch → gearbox input. In a real disc
 * the friction sits ahead of the springs; with a light ring the dynamics is the same, and for a DMF this order is
 * the real one (gearbox plan, the clutch and damper section).
 */
export function launchDraft(input: string, parts: LaunchParts): CoreDraft {
  const d = emptyDraft();
  d.members.push(
    { id: CRANK, inertia: parts.engineInertia },
    { id: DISC, inertia: parts.damper.inertia },
    { id: DISC_HUB_MEMBER, inertia: parts.discHub ?? DISC_HUB },
  );
  d.links.push([[DISC_HUB_MEMBER, 1], [input, -1]]);
  d.springs.push({ id: DAMPER, a: CRANK, b: DISC, stiffness: parts.damper.stiffness, damping: parts.damper.damping });
  if (parts.clutch) d.elements.push({ id: CLUTCH, kind: 'friction', a: DISC, b: input, friction: parts.clutch, heated: true });
  else d.links.push([[DISC, 1], [input, -1]]);
  d.prefer.push(CRANK, DISC);
  return d;
}

/**
 * The draft with the crank taken out of it (stage K2c): the damper spring runs from the disc to outside angle `slot`
 * instead of from the crank member, so the engine (LoadedCrank) owns the crank and the drivetrain sees only its
 * angle and speed, as it sees the wheels. springApplied of the damper is then the torque on the crank.
 */
export function anchorCrank(draft: CoreDraft, slot: number): CoreDraft {
  const damper = draft.springs.find((s) => s.id === DAMPER);
  if (!damper || damper.a !== CRANK || damper.b !== DISC) throw new Error(`drivetrain: no damper from ${CRANK} to ${DISC} to anchor`);
  const touches = (id: string | null) => id === CRANK;
  if (draft.links.some((l) => l.some(([id]) => touches(id))) || draft.elements.some((e) => touches(e.a) || touches(e.b))) {
    throw new Error(`drivetrain: the ${CRANK} is linked to more than its damper`);
  }
  return {
    ...draft,
    members: draft.members.filter((m) => m.id !== CRANK),
    springs: draft.springs.map((s) => (s === damper ? { id: DAMPER, a: DISC, b: null, anchor: slot, stiffness: s.stiffness, damping: s.damping } : s)),
    prefer: draft.prefer.filter((id) => id !== CRANK),
  };
}

export const BRAKE = 'brake';

/**
 * A brake from a member to the case: the output stub of stage K2a, before the axle exists. A disc brake of 2 × 125 mm
 * at μ 0.40/0.36 whose full clamp holds `capacityNm` [a stub, not a car's brake].
 */
export function brakeDraft(member: string, capacityNm: number): CoreDraft {
  const d = emptyDraft();
  const friction: FrictionDef = { faces: 2, rIn: 100, rOut: 150, muStatic: 0.4, muKinetic: 0.36, stribeck: DRY_STRIBECK, clampN: 0, actuator: 'hydraulic' };
  friction.clampN = capacityNm / (friction.muStatic * ((friction.rIn + friction.rOut) / 2000) * friction.faces);
  d.elements.push({ id: BRAKE, kind: 'friction', a: member, b: null, friction });
  return d;
}

/** Flattens a draft: base coordinates from the null space of every link, then the mass matrix and the rows. */
export function buildCore(draft: CoreDraft): DrivetrainCore {
  const members = draft.members.map((m) => m.id);
  const index = new Map<string, number>();
  members.forEach((id, i) => {
    if (index.has(id)) throw new Error(`drivetrain: member ${id} appears twice`);
    index.set(id, i);
  });
  const at = (id: string, what: string): number => {
    const i = index.get(id);
    if (i === undefined) throw new Error(`drivetrain: ${what} names unknown member ${id}`);
    return i;
  };
  const nm = members.length;
  const links: Matrix = draft.links.map((link) => {
    const row = new Array<number>(nm).fill(0);
    for (const [id, v] of link) row[at(id, 'a link')]! += v;
    return row;
  });

  // Base coordinates: the preferred members are pivoted last, so they stay free when they can, in the given order.
  const preferred = draft.prefer.map((id) => at(id, 'the coordinate preference'));
  const order = [...members.keys()].filter((i) => !preferred.includes(i));
  order.push(...[...preferred].reverse());
  const { basis, free } = nullSpace(links, nm, order);
  const n = free.length;
  const P = new Float64Array(nm * n);
  basis.forEach((row, i) => row.forEach((v, k) => (P[i * n + k] = v)));
  const inertia = Float64Array.from(draft.members, (m) => m.inertia);

  const mass = new Float64Array(n * n);
  for (let i = 0; i < nm; i++) {
    for (let r = 0; r < n; r++) {
      const pr = P[i * n + r]! * inertia[i]!;
      if (pr === 0) continue;
      for (let c = 0; c < n; c++) mass[r * n + c]! += pr * P[i * n + c]!;
    }
  }
  const massInverse = invertSpd(mass, n, () => {
    const empty = free.filter((_, k) => mass[k * n + k]! <= 0).map((i) => members[i]);
    return `drivetrain: the mass matrix is singular; coordinates without inertia: ${empty.join(', ') || 'none (dependent)'}`;
  });

  const memberRow = (id: string | null, what: string): Float64Array => {
    const row = new Float64Array(n);
    if (id === null) return row;
    const i = at(id, what);
    for (let k = 0; k < n; k++) row[k] = P[i * n + k]!;
    return row;
  };
  const relRow = (a: string, b: string | null, what: string): Float64Array => {
    const ra = memberRow(a, what);
    const rb = memberRow(b, what);
    return ra.map((v, k) => v - rb[k]!);
  };

  const springs: CoreSprings = {
    ids: draft.springs.map((s) => s.id),
    rows: new Float64Array(draft.springs.length * n),
    stiffness: Float64Array.from(draft.springs, (s) => s.stiffness),
    damping: Float64Array.from(draft.springs, (s) => s.damping),
    anchor: Int32Array.from(draft.springs, (s) => s.anchor ?? -1),
  };
  draft.springs.forEach((s, j) => {
    if (s.anchor !== undefined && (s.b !== null || !(Number.isInteger(s.anchor) && s.anchor >= 0))) {
      throw new Error(`drivetrain: spring ${s.id} needs b null and a slot index to end on an anchor`);
    }
    springs.rows.set(relRow(s.a, s.b, `spring ${s.id}`), j * n);
  });
  const springAt = (id: string, what: string): number => {
    const j = springs.ids.indexOf(id);
    if (j < 0) throw new Error(`drivetrain: ${what} names unknown spring ${id}`);
    return j;
  };

  const ne = draft.elements.length;
  const elements: CoreElements = {
    ids: draft.elements.map((e) => e.id),
    kind: new Uint8Array(ne),
    a: new Int32Array(ne),
    b: new Int32Array(ne),
    rows: new Float64Array(ne * n),
    scale: new Float64Array(ne),
    muStatic: new Float64Array(ne),
    muKinetic: new Float64Array(ne),
    stribeck: new Float64Array(ne).fill(1),
    slipInertia: new Float64Array(ne),
    heatCapacity: new Float64Array(ne),
  };
  const seen = new Set<string>();
  draft.elements.forEach((e, j) => {
    if (seen.has(e.id)) throw new Error(`drivetrain: element ${e.id} appears twice`);
    seen.add(e.id);
    const row = relRow(e.a, e.b, `element ${e.id}`);
    let rmr = 0;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) rmr += row[r]! * massInverse[r * n + c]! * row[c]!;
    if (!(rmr > 1e-12)) throw new Error(`drivetrain: element ${e.id} joins members that can never slip against each other`);
    elements.rows.set(row, j * n);
    elements.a[j] = at(e.a, `element ${e.id}`);
    elements.b[j] = e.b === null ? -1 : at(e.b, `element ${e.id}`);
    elements.slipInertia[j] = 1 / rmr;
    switch (e.kind) {
      case 'friction':
        // A zero decay makes μ(0) = 0/0 on the audio thread; μ_s below μ_k would let go at a torque it then exceeds.
        if (!(e.friction.stribeck > 0) || !(e.friction.muKinetic > 0) || !(e.friction.muStatic >= e.friction.muKinetic)) {
          throw new Error(`drivetrain: element ${e.id} needs μ_s ≥ μ_k > 0 and a positive Stribeck decay`);
        }
        elements.kind[j] = FRICTION;
        elements.scale[j] = clampTorque(e.friction);
        elements.muStatic[j] = e.friction.muStatic;
        elements.muKinetic[j] = e.friction.muKinetic;
        elements.stribeck[j] = e.friction.stribeck;
        if (e.heated) elements.heatCapacity[j] = plateHeatCapacity(e.friction);
        break;
      case 'synchro':
        elements.kind[j] = SYNCHRO;
        elements.scale[j] = coneTorquePerN(e.synchro);
        break;
      case 'dog':
        elements.kind[j] = DOG;
        break;
      case 'oneway':
        elements.kind[j] = ONEWAY;
        break;
    }
  });

  const elementAt = (id: string, what: string): number => {
    const j = elements.ids.indexOf(id);
    if (j < 0) throw new Error(`drivetrain: ${what} names unknown element ${id}`);
    return j;
  };
  const diffs = draft.diffs ?? [];
  for (const d of diffs) {
    if (draft.elements[elementAt(d.element, 'a differential')]!.kind !== 'friction') throw new Error(`drivetrain: differential ${d.element} is not a friction element`);
  }
  const coreDiffs: CoreDiffs = {
    element: Int32Array.from(diffs, (d) => elementAt(d.element, 'a differential')),
    left: Int32Array.from(diffs, (d) => springAt(d.left, `differential ${d.element}`)),
    right: Int32Array.from(diffs, (d) => springAt(d.right, `differential ${d.element}`)),
    drive: Float64Array.from(diffs, (d) => d.lockDrive),
    coast: Float64Array.from(diffs, (d) => d.lockCoast),
    preload: Float64Array.from(diffs, (d) => d.preloadNm),
  };
  const losses: CoreLoss[] = (draft.losses ?? []).map((l) => ({
    member: at(l.member, 'a loss'),
    springs: Int32Array.from(l.source, ([id]) => springAt(id, `the loss at ${l.member}`)),
    gains: Float64Array.from(l.source, ([, g]) => g),
    share: l.share,
    states: (l.states ?? []).map((st) => ({ elements: Int32Array.from(st.elements, (id) => elementAt(id, `the loss at ${l.member}`)), share: st.share })),
  }));
  const anchorSlots = draft.springs.reduce((m, s) => Math.max(m, s.anchor === undefined ? 0 : s.anchor + 1), 0);

  return {
    n,
    coords: free.map((i) => members[i]!),
    members,
    P,
    inertia,
    mass,
    massInverse,
    springs,
    elements,
    drag: draft.drag ? { member: at(draft.drag.member, 'the spin loss'), a: draft.drag.loss.a, b: draft.drag.loss.b } : { member: -1, a: 0, b: 0 },
    meshes: {
      a: Int32Array.from(draft.meshes, (m) => at(m.a, 'a mesh')),
      teethA: Float64Array.from(draft.meshes, (m) => m.teethA),
      b: Int32Array.from(draft.meshes, (m) => at(m.b, 'a mesh')),
      teethB: Float64Array.from(draft.meshes, (m) => m.teethB),
    },
    anchorSlots,
    diffs: coreDiffs,
    losses,
  };
}

/**
 * The gearbox's mesh losses at its input: in each gear, 1 − η of its power path (StateInfo.efficiency: η_m per
 * loaded mesh) times the torque the damper spring passes on. The direct gear loses nothing; neutral and a gear
 * half-engaged lose nothing either, since no state matches. Needs the launch draft's damper.
 */
export function gearLossDraft(box: Gearbox): CoreDraft {
  const d = emptyDraft();
  const states = box.states
    .filter((s) => s.kind === 'gear' && s.efficiency !== null && s.efficiency < 1)
    .map((s) => ({ elements: s.closed, share: 1 - s.efficiency! }));
  if (states.length) d.losses!.push({ member: box.spec.input, source: [[DAMPER, 1]], share: 0, states });
  return d;
}

/** What hangs on the gearbox output before the axle exists (stage K2a). */
export type OutputStub = { kind: 'brake'; capacityNm: number } | { kind: 'free' };

/** The drivetrain of stage K2a: launch parts, the gearbox with its mesh losses and an output stub. */
export function drivetrainCore(box: Gearbox, launch: LaunchParts, output: OutputStub = { kind: 'free' }): DrivetrainCore {
  const parts = [launchDraft(box.spec.input, launch), gearboxDraft(box), gearLossDraft(box)];
  if (output.kind === 'brake') parts.push(brakeDraft(box.spec.output, output.capacityNm));
  return buildCore(mergeDrafts(...parts));
}

/** Inverse of a small symmetric positive definite matrix by Cholesky; throws with `why()` when it is not one. */
function invertSpd(a: Float64Array, n: number, why: () => string): Float64Array {
  const l = new Float64Array(n * n);
  for (let j = 0; j < n; j++) {
    let d = a[j * n + j]!;
    for (let k = 0; k < j; k++) d -= l[j * n + k]! ** 2;
    if (!(d > 1e-14 * Math.max(1e-30, a[j * n + j]!))) throw new Error(why());
    const root = Math.sqrt(d);
    l[j * n + j] = root;
    for (let i = j + 1; i < n; i++) {
      let s = a[i * n + j]!;
      for (let k = 0; k < j; k++) s -= l[i * n + k]! * l[j * n + k]!;
      l[i * n + j] = s / root;
    }
  }
  const inv = new Float64Array(n * n);
  const col = new Float64Array(n);
  for (let c = 0; c < n; c++) {
    col.fill(0);
    col[c] = 1;
    for (let i = 0; i < n; i++) {
      let s = col[i]!;
      for (let k = 0; k < i; k++) s -= l[i * n + k]! * col[k]!;
      col[i] = s / l[i * n + i]!;
    }
    for (let i = n - 1; i >= 0; i--) {
      let s = col[i]!;
      for (let k = i + 1; k < n; k++) s -= l[k * n + i]! * col[k]!;
      col[i] = s / l[i * n + i]!;
    }
    for (let r = 0; r < n; r++) inv[r * n + c] = col[r]!;
  }
  return inv;
}

/** Index of a member, throwing on an unknown id. */
export function memberIndex(core: DrivetrainCore, id: string): number {
  const i = core.members.indexOf(id);
  if (i < 0) throw new Error(`drivetrain: no member ${id}`);
  return i;
}

/** Index of an element, throwing on an unknown id. */
export function elementIndex(core: DrivetrainCore, id: string): number {
  const i = core.elements.ids.indexOf(id);
  if (i < 0) throw new Error(`drivetrain: no element ${id}`);
  return i;
}
