// Eigenvalues of a small real non-symmetric matrix: reduction to Hessenberg form by elimination with pivoting, then
// Francis double-shift QR (Press et al., «Numerical Recipes», 2nd ed., §11.5–11.6: elmhes and hqr). For the
// drivetrain's linearised state-space models (vehicle-modes.ts), a dozen or two states; main thread only.

export interface Eigenvalue {
  re: number;
  im: number;
}

export function eigenvalues(input: readonly (readonly number[])[]): Eigenvalue[] {
  const n = input.length;
  // 1-based copy, as the algorithm is written.
  const a: number[][] = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i && j ? input[i - 1]![j - 1]! : 0)));

  // elmhes: Gaussian elimination with pivoting to upper Hessenberg form.
  for (let m = 2; m < n; m++) {
    let x = 0;
    let i = m;
    for (let j = m; j <= n; j++) {
      if (Math.abs(a[j]![m - 1]!) > Math.abs(x)) {
        x = a[j]![m - 1]!;
        i = j;
      }
    }
    if (i !== m) {
      for (let j = m - 1; j <= n; j++) [a[i]![j], a[m]![j]] = [a[m]![j]!, a[i]![j]!];
      for (let j = 1; j <= n; j++) [a[j]![i], a[j]![m]] = [a[j]![m]!, a[j]![i]!];
    }
    if (x !== 0) {
      for (i = m + 1; i <= n; i++) {
        let y = a[i]![m - 1]!;
        if (y !== 0) {
          y /= x;
          a[i]![m - 1] = y;
          for (let j = m; j <= n; j++) a[i]![j]! -= y * a[m]![j]!;
          for (let j = 1; j <= n; j++) a[j]![m]! += y * a[j]![i]!;
        }
      }
    }
  }
  for (let i = 3; i <= n; i++) for (let j = 1; j < i - 1; j++) a[i]![j] = 0;

  // hqr.
  const wr = new Array<number>(n + 1).fill(0);
  const wi = new Array<number>(n + 1).fill(0);
  let anorm = 0;
  for (let i = 1; i <= n; i++) for (let j = Math.max(i - 1, 1); j <= n; j++) anorm += Math.abs(a[i]![j]!);
  let nn = n;
  let t = 0;
  let p = 0;
  let q = 0;
  let r = 0;
  let s = 0;
  let w = 0;
  let x = 0;
  let y = 0;
  let z = 0;
  while (nn >= 1) {
    let its = 0;
    let l: number;
    do {
      for (l = nn; l >= 2; l--) {
        s = Math.abs(a[l - 1]![l - 1]!) + Math.abs(a[l]![l]!);
        if (s === 0) s = anorm;
        if (Math.abs(a[l]![l - 1]!) + s === s) {
          a[l]![l - 1] = 0;
          break;
        }
      }
      x = a[nn]![nn]!;
      if (l === nn) {
        wr[nn] = x + t;
        wi[nn--] = 0;
      } else {
        y = a[nn - 1]![nn - 1]!;
        w = a[nn]![nn - 1]! * a[nn - 1]![nn]!;
        if (l === nn - 1) {
          p = 0.5 * (y - x);
          q = p * p + w;
          z = Math.sqrt(Math.abs(q));
          x += t;
          if (q >= 0) {
            z = p + (p >= 0 ? Math.abs(z) : -Math.abs(z));
            wr[nn - 1] = wr[nn] = x + z;
            if (z) wr[nn] = x - w / z;
            wi[nn - 1] = wi[nn] = 0;
          } else {
            wr[nn - 1] = wr[nn] = x + p;
            wi[nn - 1] = -(wi[nn] = z);
          }
          nn -= 2;
        } else {
          if (its === 60) throw new Error('eigenvalues: no convergence');
          if (its === 10 || its === 20) {
            t += x;
            for (let i = 1; i <= nn; i++) a[i]![i]! -= x;
            s = Math.abs(a[nn]![nn - 1]!) + Math.abs(a[nn - 1]![nn - 2]!);
            y = x = 0.75 * s;
            w = -0.4375 * s * s;
          }
          ++its;
          let m: number;
          for (m = nn - 2; m >= l; m--) {
            z = a[m]![m]!;
            r = x - z;
            s = y - z;
            p = (r * s - w) / a[m + 1]![m]! + a[m]![m + 1]!;
            q = a[m + 1]![m + 1]! - z - r - s;
            r = a[m + 2]![m + 1]!;
            s = Math.abs(p) + Math.abs(q) + Math.abs(r);
            p /= s;
            q /= s;
            r /= s;
            if (m === l) break;
            const u = Math.abs(a[m]![m - 1]!) * (Math.abs(q) + Math.abs(r));
            const v = Math.abs(p) * (Math.abs(a[m - 1]![m - 1]!) + Math.abs(z) + Math.abs(a[m + 1]![m + 1]!));
            if (u + v === v) break;
          }
          for (let i = m + 2; i <= nn; i++) {
            a[i]![i - 2] = 0;
            if (i !== m + 2) a[i]![i - 3] = 0;
          }
          for (let k = m; k <= nn - 1; k++) {
            if (k !== m) {
              p = a[k]![k - 1]!;
              q = a[k + 1]![k - 1]!;
              r = 0;
              if (k !== nn - 1) r = a[k + 2]![k - 1]!;
              x = Math.abs(p) + Math.abs(q) + Math.abs(r);
              if (x !== 0) {
                p /= x;
                q /= x;
                r /= x;
              }
            }
            const root = Math.sqrt(p * p + q * q + r * r);
            s = p >= 0 ? root : -root;
            if (s !== 0) {
              if (k === m) {
                if (l !== m) a[k]![k - 1] = -a[k]![k - 1]!;
              } else a[k]![k - 1] = -s * x;
              p += s;
              x = p / s;
              y = q / s;
              z = r / s;
              q /= p;
              r /= p;
              for (let j = k; j <= nn; j++) {
                p = a[k]![j]! + q * a[k + 1]![j]!;
                if (k !== nn - 1) {
                  p += r * a[k + 2]![j]!;
                  a[k + 2]![j]! -= p * z;
                }
                a[k + 1]![j]! -= p * y;
                a[k]![j]! -= p * x;
              }
              const mmin = nn < k + 3 ? nn : k + 3;
              for (let i = l; i <= mmin; i++) {
                p = x * a[i]![k]! + y * a[i]![k + 1]!;
                if (k !== nn - 1) {
                  p += z * a[i]![k + 2]!;
                  a[i]![k + 2]! -= p * r;
                }
                a[i]![k + 1]! -= p * q;
                a[i]![k]! -= p;
              }
            }
          }
        }
      }
    } while (l < nn - 1);
  }
  return Array.from({ length: n }, (_, i) => ({ re: wr[i + 1]!, im: wi[i + 1]! }));
}
