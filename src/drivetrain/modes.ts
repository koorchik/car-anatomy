// Natural frequencies of a drivetrain linearised about a set of locks: the tables, the designer and the tests use
// them; the audio thread never does. Locked elements and held members are constraints; the springs give K and C.
// The modes solve K·x = ω²·M·x on the null space of the constraints (undamped), and each gets the damping ratio
// ζ = xᵀCx/(2ω·xᵀMx) its own shape would have.

import { type DrivetrainCore, elementIndex, memberIndex } from './core.ts';
import { type Matrix, nullSpace } from './linalg.ts';

export interface Mode {
  hz: number;
  zeta: number;
  /** Member speeds of the mode shape, in `core.members` order, scaled to 1 at the largest. */
  shape: number[];
}

export interface Linearisation {
  /** Elements taken as locked. */
  locked: string[];
  /** Members held still (a locked brake on the case, a held output). */
  held?: string[];
}

/** Elastic modes, lowest first; rigid-body motions (ω ≈ 0) are left out. */
export function naturalModes(core: DrivetrainCore, lin: Linearisation): Mode[] {
  const { n, P } = core;
  const rows: Matrix = [
    ...lin.locked.map((id) => {
      const e = elementIndex(core, id);
      return Array.from(core.elements.rows.subarray(e * n, (e + 1) * n));
    }),
    ...(lin.held ?? []).map((id) => {
      const i = memberIndex(core, id);
      return Array.from(P.subarray(i * n, (i + 1) * n));
    }),
  ];
  const N = nullSpace(rows, n).basis;
  const k = N[0]?.length ?? 0;
  if (k === 0) return [];
  const full = (flat: Float64Array): Matrix => Array.from({ length: n }, (_, r) => Array.from(flat.subarray(r * n, (r + 1) * n)));
  const M = full(core.mass);
  const K: Matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const C: Matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const S = core.springs;
  for (let j = 0; j < S.ids.length; j++) {
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const rr = S.rows[j * n + r]! * S.rows[j * n + c]!;
        K[r]![c]! += S.stiffness[j]! * rr;
        C[r]![c]! += S.damping[j]! * rr;
      }
    }
  }
  const reduce = (X: Matrix): Matrix => {
    const XN = X.map((row) => Array.from({ length: k }, (_, b) => row.reduce((s, v, i) => s + v * N[i]![b]!, 0)));
    return Array.from({ length: k }, (_, a) => Array.from({ length: k }, (_, b) => N.reduce((s, row, i) => s + row[a]! * XN[i]![b]!, 0)));
  };
  const Mr = reduce(M);
  const Kr = reduce(K);
  const Cr = reduce(C);

  // K·x = λ·M·x with M = L·Lᵀ: the symmetric L⁻¹·K·L⁻ᵀ has the same eigenvalues.
  const L = choleskyOf(Mr);
  const inv = lowerInverse(L);
  const A = mult(mult(inv, Kr), transpose(inv));
  const { values, vectors } = jacobi(A);
  const scale = Math.max(...values.map(Math.abs), 1e-300);
  const modes: Mode[] = [];
  values.forEach((lambda, idx) => {
    if (lambda <= 1e-9 * scale) return;
    const omega = Math.sqrt(lambda);
    const y = vectors.map((row) => row[idx]!);
    const xr = transpose(inv).map((row) => row.reduce((s, v, i) => s + v * y[i]!, 0));
    const quad = (X: Matrix) => X.reduce((s, row, a) => s + xr[a]! * row.reduce((t, v, b) => t + v * xr[b]!, 0), 0);
    const zeta = quad(Cr) / (2 * omega * quad(Mr));
    const phi = N.map((row) => row.reduce((s, v, b) => s + v * xr[b]!, 0));
    const speeds = core.members.map((_, i) => phi.reduce((s, v, c) => s + P[i * n + c]! * v, 0));
    const top = speeds.reduce((best, v) => (Math.abs(v) > Math.abs(best) ? v : best), 0) || 1;
    modes.push({ hz: omega / (2 * Math.PI), zeta, shape: speeds.map((v) => v / top) });
  });
  return modes.sort((a, b) => a.hz - b.hz);
}

const transpose = (m: Matrix): Matrix => m[0]!.map((_, j) => m.map((row) => row[j]!));
const mult = (a: Matrix, b: Matrix): Matrix => a.map((row) => b[0]!.map((_, j) => row.reduce((s, v, k) => s + v * b[k]![j]!, 0)));

function choleskyOf(a: Matrix): Matrix {
  const n = a.length;
  const l: Matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let j = 0; j < n; j++) {
    let d = a[j]![j]!;
    for (let k = 0; k < j; k++) d -= l[j]![k]! ** 2;
    if (!(d > 0)) throw new Error('modes: the reduced mass matrix is not positive definite');
    l[j]![j] = Math.sqrt(d);
    for (let i = j + 1; i < n; i++) {
      let s = a[i]![j]!;
      for (let k = 0; k < j; k++) s -= l[i]![k]! * l[j]![k]!;
      l[i]![j] = s / l[j]![j]!;
    }
  }
  return l;
}

function lowerInverse(l: Matrix): Matrix {
  const n = l.length;
  const inv: Matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let c = 0; c < n; c++) {
    for (let i = 0; i < n; i++) {
      let s = i === c ? 1 : 0;
      for (let k = 0; k < i; k++) s -= l[i]![k]! * inv[k]![c]!;
      inv[i]![c] = s / l[i]![i]!;
    }
  }
  return inv;
}

/** Eigenvalues and eigenvectors (columns) of a small symmetric matrix by cyclic Jacobi rotations. */
function jacobi(input: Matrix): { values: number[]; vectors: Matrix } {
  const n = input.length;
  const a = input.map((row) => row.slice());
  const v: Matrix = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p]![q]! ** 2;
    if (off < 1e-30 * Math.max(1, ...a.map((row, i) => row[i]! ** 2))) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p]![q]!;
        if (apq === 0) continue;
        const theta = (a[q]![q]! - a[p]![p]!) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k]![p]!;
          const akq = a[k]![q]!;
          a[k]![p] = c * akp - s * akq;
          a[k]![q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p]![k]!;
          const aqk = a[q]![k]!;
          a[p]![k] = c * apk - s * aqk;
          a[q]![k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k]![p]!;
          const vkq = v[k]![q]!;
          v[k]![p] = c * vkp - s * vkq;
          v[k]![q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return { values: a.map((row, i) => row[i]!), vectors: v };
}
