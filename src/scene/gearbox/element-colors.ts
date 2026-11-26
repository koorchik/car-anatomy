// Colours an automatic shows the same way in 3D and on its lever diagram, so the two read as one thing: one per shift
// element (its plate pack, its button, its marks on the diagram) and one tint per body of members that turn together.

import type { GearboxSpec } from '../../drivetrain/spec.ts';

const COLORS: Record<string, string> = { A: '#e2675f', B: '#e3a43b', C: '#5bb56c', D: '#4d9be0', E: '#ad80e6' };
const FALLBACK = ['#e2675f', '#e3a43b', '#5bb56c', '#4d9be0', '#ad80e6', '#47c2c2'];

export const elementColor = (id: string, index = 0): string => COLORS[id] ?? FALLBACK[index % FALLBACK.length]!;

/** Tints of the bodies that turn together, in the order they first appear. */
const TINTS = ['#9db5d8', '#a5d29b', '#e2b588', '#c5a8e2', '#8fd1cb', '#dccf8d', '#dca2aa', '#b9bdc1'];

/** One tint per body: the members joined by the permanent couplings share it. */
export function bodyTints(spec: GearboxSpec): Map<string, string> {
  const parent = new Map(spec.members.map((m) => [m.id, m.id]));
  const find = (id: string): string => (parent.get(id) === id ? id : find(parent.get(id)!));
  for (const [a, b] of spec.couplings) parent.set(find(a), find(b));
  const tintOf = new Map<string, string>();
  const out = new Map<string, string>();
  for (const m of spec.members) {
    const root = find(m.id);
    if (!tintOf.has(root)) tintOf.set(root, TINTS[tintOf.size % TINTS.length]!);
    out.set(m.id, tintOf.get(root)!);
  }
  return out;
}
