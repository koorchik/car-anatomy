// Small dense linear algebra for the gearbox derivation: row reduction with a pivot order, null spaces and the
// minimum-norm solution of a consistent system. Matrices are arrays of rows; sizes are tens, never thousands.

export type Matrix = number[][];

const scale = (m: Matrix): number => Math.max(1, ...m.flatMap((row) => row.map(Math.abs)));

/**
 * Reduced row echelon form of `m` (cols columns), choosing pivots among the columns in `order` (default 0…cols−1):
 * a column late in the order becomes a pivot only if no earlier column can. Returns the non-zero rows and their
 * pivot columns.
 */
export function rref(m: Matrix, cols: number, order?: number[]): { rows: Matrix; pivots: number[] } {
  const tol = 1e-10 * scale(m);
  const rows = m.map((row) => row.slice());
  const pivots: number[] = [];
  let r = 0;
  for (const c of order ?? Array.from({ length: cols }, (_, i) => i)) {
    if (r >= rows.length) break;
    let best = r;
    for (let i = r + 1; i < rows.length; i++) if (Math.abs(rows[i]![c]!) > Math.abs(rows[best]![c]!)) best = i;
    if (Math.abs(rows[best]![c]!) <= tol) continue;
    [rows[r], rows[best]] = [rows[best]!, rows[r]!];
    const pivotRow = rows[r]!;
    const p = pivotRow[c]!;
    for (let j = 0; j < pivotRow.length; j++) pivotRow[j]! /= p;
    for (let i = 0; i < rows.length; i++) {
      if (i === r) continue;
      const f = rows[i]![c]!;
      if (f === 0) continue;
      for (let j = 0; j < pivotRow.length; j++) rows[i]![j]! -= f * pivotRow[j]!;
    }
    pivots.push(c);
    r++;
  }
  return { rows: rows.slice(0, r), pivots };
}

/**
 * Basis of the null space of `m` as columns (a cols × k matrix), one column per free variable. Free variables come
 * in the order given by `freeOrder` among those the pivot order left free; pass the pivot order with the columns
 * you want free at its end.
 */
export function nullSpace(m: Matrix, cols: number, order?: number[]): { basis: Matrix; free: number[] } {
  const { rows, pivots } = rref(m, cols, order);
  const pivotSet = new Set(pivots);
  const preferred = order ? [...order].reverse() : Array.from({ length: cols }, (_, i) => i);
  const free = preferred.filter((c) => !pivotSet.has(c));
  const basis: Matrix = Array.from({ length: cols }, () => new Array<number>(free.length).fill(0));
  free.forEach((f, k) => {
    basis[f]![k] = 1;
    rows.forEach((row, i) => {
      basis[pivots[i]!]![k] = -row[f]!;
    });
  });
  return { basis, free };
}

export const multiply = (a: Matrix, b: Matrix): Matrix =>
  a.map((row) => Array.from({ length: b[0]?.length ?? 0 }, (_, j) => row.reduce((s, v, k) => s + v * b[k]![j]!, 0)));

export const transpose = (m: Matrix, cols = m[0]?.length ?? 0): Matrix => Array.from({ length: cols }, (_, j) => m.map((row) => row[j]!));

/**
 * The minimum-norm x with m·x = b, and the residual |m·x − b| (zero when the system is consistent). A particular
 * solution from row reduction loses its component along the null space.
 */
export function solveMinNorm(m: Matrix, b: number[]): { x: number[]; residual: number } {
  const cols = m[0]?.length ?? 0;
  const augmented = m.map((row, i) => [...row, b[i]!]);
  const { rows, pivots } = rref(augmented, cols, Array.from({ length: cols }, (_, i) => i));
  const x = new Array<number>(cols).fill(0);
  rows.forEach((row, i) => {
    x[pivots[i]!] = row[cols]!;
  });
  // Orthonormal null-space basis by Gram–Schmidt, then project it out.
  const { basis } = nullSpace(m, cols);
  const k = basis[0]?.length ?? 0;
  const q: number[][] = [];
  for (let j = 0; j < k; j++) {
    const v = basis.map((row) => row[j]!);
    for (const u of q) {
      const d = u.reduce((s, ui, i) => s + ui * v[i]!, 0);
      for (let i = 0; i < cols; i++) v[i]! -= d * u[i]!;
    }
    const n = Math.hypot(...v);
    if (n > 1e-12) q.push(v.map((vi) => vi / n));
  }
  for (const u of q) {
    const d = u.reduce((s, ui, i) => s + ui * x[i]!, 0);
    for (let i = 0; i < cols; i++) x[i]! -= d * u[i]!;
  }
  const residual = Math.hypot(...m.map((row, i) => row.reduce((s, v, j) => s + v * x[j]!, 0) - b[i]!));
  return { x, residual };
}
