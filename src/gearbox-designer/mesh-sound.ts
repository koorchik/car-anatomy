// The designer's gear whine in numbers (gearbox plan, the designer's model: sound; stage K9b): the mesh frequency of
// every loaded mesh in every forward gear at 3000 rpm, f = z·n/60, and its level relative to a straight-cut pair of
// ε_α 1.43 by the overlap law of research §18.1 [fitted to NASA TM-106511]:
// c = (ε_α/1.43)^−0.6·(1 + (2.5·ε_β)²)^−1/2, L = 20·lg c dB. A direct gear has no loaded mesh and is silent. A crown
// wheel is left out: the core keeps it as its equivalent spur pair, without the spiral that quietens a real one.
// Plain maths: no DOM, no text.

import type { PairGeometry } from '../drivetrain/gear-geometry.ts';
import type { Gearbox } from '../drivetrain/topology.ts';

/** Input speed the frequencies are given at, rpm (gearbox plan). */
export const SOUND_RPM = 3000;

export interface MeshTone {
  teeth: [number, number];
  hz: number;
  /** Relative to a straight-cut pair of ε_α 1.43, dB. */
  db: number;
}

export interface GearTones {
  gear: number;
  meshes: MeshTone[];
  /** The loudest loaded mesh, dB; null when none is loaded. */
  db: number | null;
}

/** Relative whine level of a pair by its contact ratios, dB. */
export function whineDb(g: Pick<PairGeometry, 'epsAlpha' | 'epsBeta'>): number {
  const c = (g.epsAlpha / 1.43) ** -0.6 * (1 + (2.5 * g.epsBeta) ** 2) ** -0.5;
  return 20 * Math.log10(c);
}

export function gearTones(box: Gearbox, gears: number): GearTones[] {
  return Array.from({ length: gears }, (_, i) => {
    const s = box.states.find((x) => x.name === String(i + 1));
    const meshes: MeshTone[] = [];
    if (s && s.speeds) {
      for (const j of s.loaded) {
        const m = box.meshes[j]!;
        if (m.bevel) continue;
        const speed = Math.abs(s.speeds[box.members.indexOf(m.memberA)]!);
        meshes.push({ teeth: [m.geometry.a.teeth, m.geometry.b.teeth], hz: (m.geometry.a.teeth * speed * SOUND_RPM) / 60, db: whineDb(m.geometry) });
      }
    }
    return { gear: i + 1, meshes, db: meshes.length ? Math.max(...meshes.map((m) => m.db)) : null };
  });
}
