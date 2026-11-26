// Efficiency of a gear with every mesh's loss applied where it acts, not summed to first order.
//
// topology.ts gives η = 1 − Σ(1 − η_m)·P_rolling/P_in, which is exact to first order in the losses. Here each mesh
// passes its torque on with the loss: seen from its carrier (a fixed frame for a plain pair), the gear that drives
// hands the driven one η_m of the lossless torque, T_driven = −(±z_driven/z_driving)·T_driving·η_m, and the carrier
// takes up the difference. Which gear drives follows from the sign of the mesh's rolling power, which the losses do
// not change in practice; the solution is iterated until it holds. A layshaft gear through two meshes then gives
// η_m² exactly, and an automatic's power recirculating through a set loses on what recirculates.
//
// Kinematics and statics only; no DOM, no text.

import { type Matrix, solveMinNorm } from './linalg.ts';
import type { Gearbox, StateInfo } from './topology.ts';

/** η of a gear with each mesh's loss applied in its direction of power: −T_out·ω_out/(T_in·ω_in). Null unless a gear. */
export function exactEfficiency(box: Gearbox, state: StateInfo, meshEfficiency = box.spec.meshEfficiency): number | null {
  if (state.kind !== 'gear' || !state.speeds || !state.meshLoads) return null;
  const { spec, members, meshes } = box;
  const speeds = state.speeds;
  const index = new Map(members.map((id, i) => [id, i]));
  const teeth = new Map(spec.gears.map((g) => [g.id, g.teeth]));
  const relative = meshes.map((m) => speeds[index.get(m.memberA)!]! - (m.carrier ? speeds[index.get(m.carrier)!]! : 0));
  // Gear a drives when the mesh's torque on it opposes its motion relative to the carrier.
  let drives = meshes.map((m, j) => teeth.get(m.a)! * state.meshLoads![j]!.lambda * relative[j]! < 0);
  const elements = state.closed.map((id) => spec.elements.find((e) => e.id === id)!);
  const n = members.length;
  const couplings = spec.couplings;
  const columns = meshes.length + couplings.length + elements.length + 1;
  let outputTorque = 0;
  for (let iteration = 0; iteration < 8; iteration++) {
    const M: Matrix = Array.from({ length: n }, () => new Array<number>(columns).fill(0));
    meshes.forEach((m, j) => {
      const sign = m.internal ? -1 : 1;
      const ca = drives[j] ? 1 : meshEfficiency;
      const cb = drives[j] ? meshEfficiency : 1;
      const za = teeth.get(m.a)! * ca;
      const zb = sign * teeth.get(m.b)! * cb;
      M[index.get(m.memberA)!]![j]! += za;
      M[index.get(m.memberB)!]![j]! += zb;
      if (m.carrier) M[index.get(m.carrier)!]![j]! -= za + zb;
    });
    couplings.forEach(([a, b], k) => {
      M[index.get(a)!]![meshes.length + k] = 1;
      M[index.get(b)!]![meshes.length + k] = -1;
    });
    elements.forEach((e, k) => {
      M[index.get(e.a)!]![meshes.length + couplings.length + k] = 1;
      if (e.b !== null) M[index.get(e.b)!]![meshes.length + couplings.length + k] = -1;
    });
    M[index.get(spec.output)!]![columns - 1] = 1;
    const rhs = new Array<number>(n).fill(0);
    rhs[index.get(spec.input)!] = -1;
    const { x, residual } = solveMinNorm(M, rhs);
    if (residual > 1e-6) throw new Error(`${spec.id}: no static equilibrium with losses in state ${state.name}`);
    outputTorque = -x[columns - 1]!;
    const next = meshes.map((m, j) => teeth.get(m.a)! * x[j]! * (drives[j] ? 1 : meshEfficiency) * relative[j]! < 0);
    if (next.every((v, j) => v === drives[j])) break;
    drives = next;
  }
  return outputTorque / state.ratio!;
}
