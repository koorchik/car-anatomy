// The lever analogy of a planetary box (Benford and Leising, SAE 810102; research §10.1) as data for a speed diagram:
// each simple set is a lever with its sun, carrier and ring at distances proportional to the teeth, S at 0, C at
// z_r/(z_s + z_r) and R at 1, so the three speeds lie on one straight line: ω_c = ω_s + (ω_r − ω_s)·z_r/(z_s + z_r)
// is z_s·ω_s + z_r·ω_r = (z_s + z_r)·ω_c. The UI draws the levers side by side with speed upward; the output node's
// height is 1/i of the input's.
//
// Kinematics only; no DOM, no text.

import type { Gearbox } from './topology.ts';

export interface LeverNode {
  member: string;
  /** 'S', 'C' or 'R'. */
  role: 'S' | 'C' | 'R';
  /** Place along the lever, 0–1. */
  pos: number;
}

export interface Lever {
  /** The carrier's id names the set. */
  carrier: string;
  nodes: [LeverNode, LeverNode, LeverNode];
}

/**
 * The levers of a box's simple sets, in the order of their carriers: for every member with planets, the gear on the
 * carrier's axis it meshes outside (the sun) and inside (the ring).
 */
export function levers(box: Gearbox): Lever[] {
  const out: Lever[] = [];
  const gear = (id: string) => box.spec.gears.find((g) => g.id === id)!;
  for (const member of box.spec.members) {
    if (!member.carrier) continue;
    const planetGear = box.spec.gears.find((g) => g.member === member.id);
    if (!planetGear) continue;
    let sun: { member: string; teeth: number } | null = null;
    let ring: { member: string; teeth: number } | null = null;
    for (const m of box.meshes) {
      if (m.a !== planetGear.id && m.b !== planetGear.id) continue;
      const other = gear(m.a === planetGear.id ? m.b : m.a);
      if (other.internal) ring = { member: other.member, teeth: other.teeth };
      else sun = { member: other.member, teeth: other.teeth };
    }
    if (!sun || !ring) continue;
    out.push({
      carrier: member.carrier,
      nodes: [
        { member: sun.member, role: 'S', pos: 0 },
        { member: member.carrier, role: 'C', pos: ring.teeth / (sun.teeth + ring.teeth) },
        { member: ring.member, role: 'R', pos: 1 },
      ],
    });
  }
  return out;
}

/** Each lever's node speeds, from member speeds in `Gearbox.members` order. */
export function leverSpeeds(box: Gearbox, lever: Lever, speeds: ArrayLike<number>): [number, number, number] {
  const at = (m: string) => speeds[box.members.indexOf(m)]!;
  return [at(lever.nodes[0].member), at(lever.nodes[1].member), at(lever.nodes[2].member)];
}

/** How far a lever's carrier lies off the straight line through its sun and ring speeds (zero for a real motion). */
export function leverBend(lever: Lever, nodeSpeeds: [number, number, number]): number {
  const [s, c, r] = nodeSpeeds;
  return c - (s + (r - s) * lever.nodes[1].pos);
}
