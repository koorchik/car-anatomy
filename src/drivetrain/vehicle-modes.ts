// Natural frequencies of the car on its tyres, linearised about steady rolling at speed v in a gear: the shunt of the
// gearbox plan (drivetrain-dynamics 4). The drivetrain, the driven wheels and the body (as a member of
// inertia m·r²) are joined as in the solver; each driven tyre is its relaxation model linearised, a spring
// K = C_κ/σ in series with the slip damper: u̇ = r·(ω_w − ω_body) − (v/σ)·u, F = K·u. The tyre is what makes the
// shunt softer than rigid wheels would: at town speeds v/σ is near the shunt's own frequency. The first-order
// system's eigenvalues give each mode's damped frequency and damping ratio. Main thread only.

import { drivingMassKg } from '../vehicle/car.ts';
import { roadLoadCoeffs } from '../vehicle/road-load.ts';
import { mfEval, newMfForces, sigmaKappa } from '../vehicle/tyre.ts';
import { FL, FR, RL, RR } from '../vehicle/wheel-bus.ts';
import { CLUTCH, WHEEL_LEFT, WHEEL_RIGHT, type CarDrive, type CarGear } from './car-model.ts';
import { buildCore, type CoreDraft } from './core.ts';
import { eigenvalues } from './eigen.ts';
import { LSD } from './final-drive.ts';
import { nullSpace } from './linalg.ts';

export const BODY = 'body';

export interface VehicleMode {
  /** Damped frequency, Hz, and damping ratio. */
  hz: number;
  zeta: number;
}

/** Oscillating modes of the car rolling at v, m/s, in gear g with the clutch closed, lowest first. */
export function vehicleModes(cd: CarDrive, g: CarGear, v: number): VehicleMode[] {
  const [l, r] = cd.driven;
  const rd = cd.radius[l]!;
  const undriven = [FL, FR, RL, RR].filter((i) => i !== l && i !== r);
  const body = drivingMassKg(cd.car) * rd * rd + undriven.reduce((s, i) => s + cd.wheelInertia[i]! * (rd / cd.radius[i]!) ** 2, 0);
  const base = cd.draft;
  const wheelOf = (slot: number | undefined) => (slot === l ? WHEEL_LEFT : slot === r ? WHEEL_RIGHT : null);
  const draft: CoreDraft = {
    ...base,
    members: [...base.members, { id: WHEEL_LEFT, inertia: cd.wheelInertia[l]! }, { id: WHEEL_RIGHT, inertia: cd.wheelInertia[r]! }, { id: BODY, inertia: body }],
    springs: base.springs.map((s) => (s.anchor === undefined ? s : { id: s.id, a: s.a, b: wheelOf(s.anchor), stiffness: s.stiffness, damping: s.damping })),
  };
  const core = buildCore(draft);
  const { n, P } = core;
  const locked = [CLUTCH, g.element, ...(core.elements.ids.includes(LSD) ? [LSD] : [])];
  const rows = locked.map((id) => {
    const e = core.elements.ids.indexOf(id);
    return Array.from(core.elements.rows.subarray(e * n, (e + 1) * n));
  });
  const N = nullSpace(rows, n).basis;
  const k = N[0]!.length;
  const row = (id: string) => {
    const i = core.members.indexOf(id);
    return Array.from({ length: k }, (_, b) => N.reduce((s, nr, c) => s + P[i * n + c]! * nr[b]!, 0));
  };
  const reduce = (flat: (a: number, b: number) => number) =>
    Array.from({ length: k }, (_, a) => Array.from({ length: k }, (_, b) => {
      let s = 0;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) s += N[i]![a]! * flat(i, j) * N[j]![b]!;
      return s;
    }));
  const S = core.springs;
  const springMatrix = (coef: Float64Array) => (i: number, j: number) => {
    let s = 0;
    for (let q = 0; q < S.ids.length; q++) s += coef[q]! * S.rows[q * n + i]! * S.rows[q * n + j]!;
    return s;
  };
  const M = reduce((i, j) => core.mass[i * n + j]!);
  const K = reduce(springMatrix(S.stiffness));
  const C = reduce(springMatrix(S.damping));
  // The road load's slope on the body, and the spin loss's on the input.
  const rl = roadLoadCoeffs(cd.car);
  const gb = row(BODY);
  const gin = row(cd.box.spec.input);
  const dRdv = rl.b + 2 * rl.c * v;
  for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) C[a]![b]! += rd * rd * dRdv * gb[a]! * gb[b]! + cd.spinLoss.b * gin[a]! * gin[b]!;

  // The tyres about rolling with no slip at the static load of a driven wheel.
  const fz = (drivingMassKg(cd.car) * 9.81 * (cd.car.drive === 'fwd' ? cd.car.body.frontShare : 1 - cd.car.body.frontShare)) / 2;
  const mf = newMfForces();
  mfEval(cd.tyre.set, 0, 0, 0, fz, 1, mf);
  const sigma = sigmaKappa(cd.tyre.set, fz);
  const kt = mf.kx / sigma;
  const relax = v / sigma;
  const wheels = [row(WHEEL_LEFT), row(WHEEL_RIGHT)];

  // x = [η, η̇, u_L, u_R]: η̇' = M⁻¹(−Kη − Cη̇ + Σ r·K_t·(g_body − g_wheel)·u), u' = r·(g_wheel − g_body)·η̇ − (v/σ)·u.
  const Minv = invert(M);
  const size = 2 * k + 2;
  const A = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  for (let a = 0; a < k; a++) A[a]![k + a] = 1;
  for (let a = 0; a < k; a++) {
    for (let b = 0; b < k; b++) {
      let mk = 0;
      let mc = 0;
      for (let c = 0; c < k; c++) {
        mk += Minv[a]![c]! * K[c]![b]!;
        mc += Minv[a]![c]! * C[c]![b]!;
      }
      A[k + a]![b] = -mk;
      A[k + a]![k + b] = -mc;
    }
    wheels.forEach((gw, t) => {
      let s = 0;
      for (let c = 0; c < k; c++) s += Minv[a]![c]! * rd * kt * (gb[c]! - gw[c]!);
      A[k + a]![2 * k + t] = s;
    });
  }
  wheels.forEach((gw, t) => {
    for (let b = 0; b < k; b++) A[2 * k + t]![k + b] = rd * (gw[b]! - gb[b]!);
    A[2 * k + t]![2 * k + t] = -relax;
  });
  return eigenvalues(A)
    .filter((e) => e.im > 1e-6)
    .map((e) => ({ hz: e.im / (2 * Math.PI), zeta: -e.re / Math.hypot(e.re, e.im) }))
    .sort((x, y) => x.hz - y.hz);
}

function invert(m: number[][]): number[][] {
  const n = m.length;
  const a = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let i = c + 1; i < n; i++) if (Math.abs(a[i]![c]!) > Math.abs(a[p]![c]!)) p = i;
    [a[c], a[p]] = [a[p]!, a[c]!];
    const d = a[c]![c]!;
    for (let j = 0; j < 2 * n; j++) a[c]![j]! /= d;
    for (let i = 0; i < n; i++) {
      if (i === c) continue;
      const f = a[i]![c]!;
      if (f !== 0) for (let j = 0; j < 2 * n; j++) a[i]![j]! -= f * a[c]![j]!;
    }
  }
  return a.map((row) => row.slice(n));
}
