// A power-split hybrid transaxle (research §12, Toyota THS of the Prius 3, P410): no clutches, no brakes and no shift
// matrix. The engine turns the carrier of one planetary set, the generator MG1 its sun, and the ring drives the
// wheels; the traction motor MG2 adds its torque to the same ring through a second set whose carrier is bolted to the
// case. The ring member carries both ring gears and, on its outside, the counter drive gear; the counter shaft takes
// it to the final drive pinion, and the differential case is the output. With nothing to close, the box keeps two
// motions, the engine's and the wheels': the motors' torques decide the rest (control/ths.ts).
//
// Members: C1 (the engine's carrier, the input), S1 (MG1's rotor), P1 (its planets), RING, S2 (MG2's rotor), P2 and
// C2 (grounded), COUNTER and DIFF (the output). The kinematics needs only the teeth. The modules, helix angles, face
// widths, the profile shift that lets 30/23/78 run on one carrier, the positions along the axis and where the counter
// shaft and the differential stand are estimates for the 3D, marked as such in the data.
//
// No DOM, no text: the audio thread gets the flat core, never this file.

import { pairGeometry, shiftSumForCentre, transverse } from '../gear-geometry.ts';
import type { AxisDef, GearboxSpec, GearDef, MemberDef, MeshDef, MotorDef } from '../spec.ts';
import type { Gearbox } from '../topology.ts';

export const ENGINE_CARRIER = 'C1';
export const MG1_ROTOR = 'S1';
export const RING = 'RING';
export const MG2_ROTOR = 'S2';
export const REDUCTION_CARRIER = 'C2';
export const COUNTER = 'COUNTER';
export const DIFF = 'DIFF';
export const MG1 = 'MG1';
export const MG2 = 'MG2';

/** A simple planetary set of the transaxle; its planet may have fewer teeth than (z_r − z_s)/2 (a shifted sun). */
export interface SplitSetDesc {
  sun: number;
  planet: number;
  ring: number;
  planets: number;
  /** Normal module, mm, and helix angle, degrees (the sun's hand; planet and ring take the other). */
  module: number;
  helix: number;
  faceWidth: number;
  /** Middle of the set along the axis, mm behind the front face. */
  z: number;
}

/** A pair of parallel-axis helical gears: the first on the driving side. */
export interface SplitPairDesc {
  teeth: [number, number];
  module: number;
  /** Helix of the first gear, degrees; the second has the other hand. */
  helix: number;
  faceWidth: number;
  z: number;
}

/** A motor as the data gives it, on a member this layout names. */
export type SplitMotorDesc = Omit<MotorDef, 'member'>;

export interface PowerSplitDesc {
  id: string;
  pressureAngle: number;
  /** Engine on the carrier, MG1 on the sun, the ring to the wheels. */
  split: SplitSetDesc;
  /** MG2 on the sun, the carrier bolted to the case, its ring part of the split set's ring member. */
  reduction: SplitSetDesc;
  /** Counter drive gear on the ring member, counter driven gear on the counter shaft. */
  counter: SplitPairDesc;
  /** Final drive: pinion on the counter shaft, ring gear on the differential case. */
  final: SplitPairDesc;
  /** Directions of the counter shaft from the main axis and of the differential from the counter shaft, degrees clockwise from +Y seen from the front. */
  counterDirection: number;
  diffDirection: number;
  mg1: SplitMotorDesc & { rotorInertia: number };
  mg2: SplitMotorDesc & { rotorInertia: number };
  meshEfficiency: number;
}

const DEG = Math.PI / 180;

/** Expands the description into the core's GearboxSpec. Throws on a description that cannot be built. */
export function powerSplitSpec(desc: PowerSplitDesc): GearboxSpec {
  const alpha = desc.pressureAngle;
  const axes: AxisDef[] = [{ id: 'main', x: 0, y: 0 }];
  const members: MemberDef[] = [];
  const gears: GearDef[] = [];
  const meshes: MeshDef[] = [];
  const set = (k: 1 | 2, s: SplitSetDesc, sun: string, carrier: string) => {
    const radius = (transverse(s.module, s.helix, alpha).mt * (s.ring - s.planet)) / 2;
    // The planet and the ring stay unshifted (internal shift is not modelled); the sun takes all the shift the
    // centre distance asks, which is none when z_s + 2·z_p = z_r.
    const shift = s.sun + 2 * s.planet === s.ring ? 0 : shiftSumForCentre(radius, s.module, s.sun, s.planet, s.helix, alpha);
    const planet = `P${k}`;
    axes.push({ id: `planet-${k}`, x: 0, y: radius });
    members.push({ id: sun, axis: 'main' }, { id: carrier, axis: 'main' }, { id: planet, axis: `planet-${k}`, carrier, count: s.planets });
    const tooth = { module: s.module, pressureAngle: alpha, faceWidth: s.faceWidth, z: s.z };
    const hand = s.helix === 0 ? 0 : -s.helix;
    gears.push(
      { id: `sun-${k}`, member: sun, teeth: s.sun, helix: s.helix, shift, ...tooth },
      { id: `planet-${k}`, member: planet, teeth: s.planet, helix: hand, shift: 0, ...tooth, bore: 0.45 * s.module * s.planet },
      { id: `ring-${k}`, member: RING, teeth: s.ring, helix: hand, shift: 0, ...tooth, internal: true },
    );
    meshes.push({ a: `sun-${k}`, b: `planet-${k}`, carrier }, { a: `planet-${k}`, b: `ring-${k}`, carrier });
  };
  members.push({ id: RING, axis: 'main' });
  set(1, desc.split, MG1_ROTOR, ENGINE_CARRIER);
  set(2, desc.reduction, MG2_ROTOR, REDUCTION_CARRIER);
  const pair = (p: SplitPairDesc, a: { id: string; member: string }, b: { id: string; member: string }): number => {
    const tooth = { module: p.module, pressureAngle: alpha, faceWidth: p.faceWidth, z: p.z, shift: 0 };
    const ga: GearDef = { id: a.id, member: a.member, teeth: p.teeth[0], helix: p.helix, ...tooth };
    const gb: GearDef = { id: b.id, member: b.member, teeth: p.teeth[1], helix: p.helix === 0 ? 0 : -p.helix, ...tooth };
    gears.push(ga, gb);
    meshes.push({ a: a.id, b: b.id });
    return pairGeometry(ga, gb).centre;
  };
  const counterCentre = pair(desc.counter, { id: 'counter-drive', member: RING }, { id: 'counter-driven', member: COUNTER });
  const cx = counterCentre * Math.sin(desc.counterDirection * DEG);
  const cy = counterCentre * Math.cos(desc.counterDirection * DEG);
  axes.push({ id: 'counter', x: cx, y: cy });
  members.push({ id: COUNTER, axis: 'counter' });
  const finalCentre = pair(desc.final, { id: 'final-pinion', member: COUNTER }, { id: 'final-ring', member: DIFF });
  axes.push({ id: 'diff', x: cx + finalCentre * Math.sin(desc.diffDirection * DEG), y: cy + finalCentre * Math.cos(desc.diffDirection * DEG) });
  members.push({ id: DIFF, axis: 'diff' });
  const rotor = (id: string, inertia: number) => {
    const m = members.find((x) => x.id === id)!;
    m.inertia = (m.inertia ?? 0) + inertia;
  };
  rotor(MG1_ROTOR, desc.mg1.rotorInertia);
  rotor(MG2_ROTOR, desc.mg2.rotorInertia);
  const motor = (id: string, member: string, m: SplitMotorDesc): MotorDef => ({ id, member, maxNm: m.maxNm, maxKw: m.maxKw, maxRpm: m.maxRpm });
  return {
    id: desc.id,
    kind: 'power-split',
    axes,
    members,
    gears,
    meshes,
    couplings: [],
    grounded: [REDUCTION_CARRIER],
    elements: [],
    // Nothing to close: the one state leaves the engine and the wheels free, and the motors set the rest.
    states: [{ name: 'D', closed: [] }],
    input: ENGINE_CARRIER,
    output: DIFF,
    motors: [motor(MG1, MG1_ROTOR, desc.mg1), motor(MG2, MG2_ROTOR, desc.mg2)],
    // The ring side's drag rolls in the coast-down of an EPA car; the engine's own friction is in its torque map.
    spinLoss: { a: 0, b: 0 },
    meshEfficiency: desc.meshEfficiency,
    finalDrive: { pinion: 'final-pinion', ring: 'final-ring', shaft: COUNTER, kind: 'helical' },
  };
}

/**
 * The transaxle's kinematics from the derived gearbox, not from the teeth again: every member's speed is
 * P[m]·(ω_engine, ω_output), and a torque T on member m pushes P[m][0]·T on the engine and P[m][1]·T on the output.
 */
export interface SplitKinematics {
  /** ω_MG1 = mg1[0]·ω_engine + mg1[1]·ω_out. */
  mg1: [number, number];
  /** ω_MG2 = mg2·ω_out. */
  mg2: number;
  /** ω_ring = ring·ω_out. */
  ring: number;
}

export function splitKinematics(box: Gearbox): SplitKinematics {
  if (box.spec.kind !== 'power-split') throw new Error(`${box.spec.id}: not a power-split box`);
  if (box.basis[0] !== box.spec.input || box.basis[1] !== box.spec.output || box.basis.length !== 2) {
    throw new Error(`${box.spec.id}: a power-split box must leave the engine and the output free, and nothing else`);
  }
  const row = (id: string): number[] => box.P[box.members.indexOf(id)]!;
  const s1 = row(MG1_ROTOR);
  const s2 = row(MG2_ROTOR);
  const r = row(RING);
  return { mg1: [s1[0]!, s1[1]!], mg2: s2[1]!, ring: r[1]! };
}

/**
 * The output speed at which MG1 stands with the engine at ω_engine: past it MG1 turns backward and has to drive
 * (the circulating power of research §12). From 30·ω_MG1 + 78·ω_ring = 108·ω_engine: ω_ring = (z_s + z_r)/z_r·ω_engine.
 */
export const mg1StillOutput = (k: SplitKinematics, omegaEngine: number): number => (-k.mg1[0] / k.mg1[1]) * omegaEngine;
