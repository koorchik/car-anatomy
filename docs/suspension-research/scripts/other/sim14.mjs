// Throwaway benchmark for research notes: 14-DoF handling model (body 6, wheel vertical 4, wheel spin 4)
// plus 8 tyre relaxation states. Purpose: measure JS cost and stable step size. Not project code.
// Tyre: MF 6.1 pure + combined slip weights, coefficients from TNO_car205_60R15 sample.
const T = { Fz0: 4000, R0: 0.3135,
  PCY1: 1.338, PDY1: 0.8785, PDY2: -0.06451, PEY1: -0.804, PEY2: -0.6099, PEY3: 0.09907, PEY4: -6.694,
  PKY1: 15.323, PKY2: 1.7132, PKY3: 0.3699, PKY4: 2, PKY6: 0.8998, PKY7: 0.231, PVY3: 0.1616, PVY4: 0.4855,
  PCX1: 1.579, PDX1: 1.0422, PDX2: -0.08285, PEX1: 0.11113, PEX2: 0.3143, PEX3: 0, PEX4: 0.001719,
  PKX1: 21.687, PKX2: 13.728, PKX3: -0.4098,
  RBX1: 12.535, RBX2: 9.524, RCX1: 1.019, RBY1: 11.974, RBY2: 8.742, RCY1: 1.0503,
  Cfx: 371840, Cfy: 102673 };

function mfForces(kappa, alpha, Fz, gamma, out) {
  // Sign convention here: alpha>0 gives Fy>0 toward slip correction, gamma>0 gives Fy>0.
  const df = (Fz - T.Fz0) / T.Fz0;
  const gs = Math.sin(gamma);
  // Lateral
  const Kya = T.PKY1 * T.Fz0 * (1 - T.PKY3 * Math.abs(gs)) * Math.sin(T.PKY4 * Math.atan((Fz / T.Fz0) / T.PKY2));
  const Kyg0 = Fz * (T.PKY6 + T.PKY7 * df);
  const SVg = Fz * (T.PVY3 + T.PVY4 * df) * gs;
  const SHy = (Kyg0 * gs - SVg) / Kya;
  const ay = alpha + SHy;
  const muy = T.PDY1 + T.PDY2 * df;
  const Dy = muy * Fz;
  let Ey = (T.PEY1 + T.PEY2 * df) * (1 - (T.PEY3 + T.PEY4 * gs) * (ay >= 0 ? 1 : -1));
  if (Ey > 1) Ey = 1;
  const By = Kya / (T.PCY1 * Dy + 1e-3);
  const xy = By * ay;
  const Fy0 = Dy * Math.sin(T.PCY1 * Math.atan(xy - Ey * (xy - Math.atan(xy)))) + SVg;
  // Longitudinal
  const mux = T.PDX1 + T.PDX2 * df;
  const Dx = mux * Fz;
  const Kxk = Fz * (T.PKX1 + T.PKX2 * df) * Math.exp(T.PKX3 * df);
  const Bx = Kxk / (T.PCX1 * Dx + 1e-3);
  let Ex = (T.PEX1 + T.PEX2 * df + T.PEX3 * df * df) * (1 - T.PEX4 * (kappa >= 0 ? 1 : -1));
  if (Ex > 1) Ex = 1;
  const xx = Bx * kappa;
  const Fx0 = Dx * Math.sin(T.PCX1 * Math.atan(xx - Ex * (xx - Math.atan(xx))));
  // Combined (cosine weighting)
  const Bxa = T.RBX1 * Math.cos(Math.atan(T.RBX2 * kappa));
  const Gxa = Math.cos(T.RCX1 * Math.atan(Bxa * alpha));
  const Byk = T.RBY1 * Math.cos(Math.atan(T.RBY2 * alpha));
  const Gyk = Math.cos(T.RCY1 * Math.atan(Byk * kappa));
  out[0] = Fx0 * Gxa;
  out[1] = Fy0 * Gyk;
  out[2] = Kxk;
  out[3] = Math.abs(Kya);
}

// Vehicle: "large saloon" corner values from course notes (M=300 per corner, m=30, Ks=20 kN/m, Kt=160 kN/m, Cs=1500)
const P = { ms: 1200, mu: 30, a: 1.25, b: 1.45, tf: 1.5, tr: 1.5, hcg: 0.55, hrcf: 0.08, hrcr: 0.12,
  Ks: 20000, Cs: 1500, Kt: 160000, Ct: 50, Karbf: 15000, Karbr: 4000,
  Ix: 500, Iy: 2200, Iz: 2500, Iw: 1.0, R: 0.3 };
P.m = P.ms + 4 * P.mu; P.L = P.a + P.b;
const G = 9.81;
const SX = [P.a, P.a, -P.b, -P.b];
const SY = [P.tf / 2, -P.tf / 2, P.tr / 2, -P.tr / 2];
const HRC = [P.hrcf, P.hrcf, P.hrcr, P.hrcr];
const FZ0 = [0, 0, 0, 0];
for (let i = 0; i < 4; i++) FZ0[i] = (i < 2 ? P.b : P.a) / P.L * P.m * G / 2;

// State layout
// 0 x,1 y,2 psi,3 u,4 v,5 r,6 z,7 zd,8 phi,9 p,10 th,11 q,
// 12..15 zu, 16..19 zud, 20..23 omega, 24..27 u' (long deflection), 28..31 v' (lat deflection)
const N = 32;
function initState(V) {
  const s = new Float64Array(N);
  s[3] = V;
  for (let i = 0; i < 4; i++) s[20 + i] = V / P.R;
  return s;
}

const tmp = new Float64Array(4);
export const opts = { relax: true, Vlow: 1.0, sigK: T.Fz0 * T.PKX1 / T.Cfx, sigA: 0.52, gammaStatic: 0, camberRoll: 0.5, toeF: 0, toeR: 0 };
// Toe-in positive: left wheels steer right (negative), right wheels steer left (positive).
function delOf(i, delta) {
  if (i === 0) return delta - opts.toeF;
  if (i === 1) return delta + opts.toeF;
  return i === 2 ? -opts.toeR : opts.toeR;
}

// inputs: delta (front steer, rad), Tb[4] wheel torques, road(i,t) profile
function deriv(s, t, input, d) {
  const u = s[3], v = s[4], r = s[5];
  const z = s[6], zd = s[7], phi = s[8], p = s[9], th = s[10], q = s[11];
  let sumFx = 0, sumFy = 0, Mz = 0, sumFs = 0, Mroll = 0, Mpitch = 0, sumFxh = 0;
  const delta = input.delta(t);
  for (let i = 0; i < 4; i++) {
    const sx = SX[i], sy = SY[i];
    const zc = z - sx * th + sy * phi;
    const zcd = zd - sx * q + sy * p;
    const zu = s[12 + i], zud = s[16 + i];
    let Fs = P.Ks * (zu - zc) + P.Cs * (zud - zcd);
    // ARB: couple across axle
    const j = i ^ 1, sy2 = SY[j];
    const karb = i < 2 ? P.Karbf : P.Karbr;
    const dOther = s[12 + j] - (z - SX[j] * th + sy2 * phi);
    Fs += karb * ((zu - zc) - dOther);
    const zr = input.road(i, t, s[0] + sx);
    const dzr = zr - zu;
    let Fz = FZ0[i] + P.Kt * dzr - P.Ct * zud;
    if (Fz < 1) Fz = 1;

    // slip
    const del = delOf(i, delta);
    const c = Math.cos(del), sn = Math.sin(del);
    const vxh = u - r * sy, vyh = v + r * sx;
    const Vw = vxh * c + vyh * sn;
    const Vl = -vxh * sn + vyh * c;
    const om = s[20 + i];
    let kap, alp;
    const Va = Math.abs(Vw);
    const sigK = opts.sigK, sigA = opts.sigA;
    if (opts.relax) {
      kap = s[24 + i] / sigK;
      alp = s[28 + i] / sigA;
      d[24 + i] = (om * P.R - Vw) - Va * s[24 + i] / sigK;
      d[28 + i] = -Vl - Va * s[28 + i] / sigA;
    } else {
      const den = Math.max(Va, opts.Vlow);
      kap = (om * P.R - Vw) / den;
      alp = -Vl / den;
      d[24 + i] = 0; d[28 + i] = 0;
    }
    const gam = (sy > 0 ? -1 : 1) * opts.gammaStatic - opts.camberRoll * phi;
    mfForces(kap, alp, Fz, gam, tmp);
    let Fx = tmp[0], Fy = tmp[1];
    // low-speed damping (only matters with relaxation deflection states)
    if (opts.relax && Va < 3) {
      const w = (3 - Va) / 3;
      Fx += w * 1500 * (om * P.R - Vw);
      Fy += w * 1500 * (-Vl);
    }
    const FxB = Fx * c - Fy * sn;
    const FyB = Fx * sn + Fy * c;
    sumFx += FxB; sumFy += FyB;
    Mz += sx * FyB - sy * FxB;
    // jacking through roll centre: lateral force on one wheel acts through link geometry
    const jack = (sy > 0 ? -1 : 1) * FyB * HRC[i] / Math.abs(sy);
    const Ftot = Fs + jack;
    sumFs += Ftot;
    Mroll += sy * Ftot;
    Mpitch += -sx * Ftot;
    sumFxh += FxB;
    // wheel
    d[12 + i] = zud;
    d[16 + i] = (Fz - FZ0[i] - Ftot) / P.mu;
    d[20 + i] = (input.torque(i, t) - Fx * P.R - 0.01 * Fz * P.R * Math.tanh(om)) / P.Iw;
  }
  const ax = sumFx / P.m + v * r;
  const ay = sumFy / P.m - u * r;
  d[0] = u * Math.cos(s[2]) - v * Math.sin(s[2]);
  d[1] = u * Math.sin(s[2]) + v * Math.cos(s[2]);
  d[2] = r;
  d[3] = ax;
  d[4] = ay;
  d[5] = Mz / P.Iz;
  d[6] = zd;
  d[7] = sumFs / P.ms;
  d[8] = p;
  // Roll: positive phi = left side up, right-hand convention consistent with zc above.
  d[9] = (Mroll + sumFy * P.hcg + P.ms * G * (P.hcg - 0.5 * (P.hrcf + P.hrcr)) * phi) / P.Ix;
  d[10] = q;
  // Pitch: positive th = nose down (zc decreases at +sx); braking Fx<0 gives nose-down.
  d[11] = (Mpitch - sumFxh * P.hcg) / P.Iy;
}

const d1 = new Float64Array(N), d2 = new Float64Array(N), d3 = new Float64Array(N), d4 = new Float64Array(N), st = new Float64Array(N);
export function stepRK4(s, t, h, input) {
  deriv(s, t, input, d1);
  for (let k = 0; k < N; k++) st[k] = s[k] + 0.5 * h * d1[k];
  deriv(st, t + 0.5 * h, input, d2);
  for (let k = 0; k < N; k++) st[k] = s[k] + 0.5 * h * d2[k];
  deriv(st, t + 0.5 * h, input, d3);
  for (let k = 0; k < N; k++) st[k] = s[k] + h * d3[k];
  deriv(st, t + h, input, d4);
  for (let k = 0; k < N; k++) s[k] += h / 6 * (d1[k] + 2 * d2[k] + 2 * d3[k] + d4[k]);
}
// Semi-implicit (symplectic) Euler: velocities from forces at the old state, then positions from new velocities.
// Relaxation deflections use an exact-linear implicit update.
const VEL = [3, 4, 5, 7, 9, 11, 16, 17, 18, 19, 20, 21, 22, 23];
const POS = [[0, null], [1, null], [2, 5], [6, 7], [8, 9], [10, 11], [12, 16], [13, 17], [14, 18], [15, 19]];
export function stepSemi(s, t, h, input) {
  deriv(s, t, input, d1);
  for (const k of VEL) s[k] += h * d1[k];
  const c = Math.cos(s[2]), sn = Math.sin(s[2]);
  s[0] += h * (s[3] * c - s[4] * sn);
  s[1] += h * (s[3] * sn + s[4] * c);
  for (const [a, b] of POS) if (b !== null) s[a] += h * s[b];
  if (opts.relax) {
    const delta = input.delta(t + h);
    for (let i = 0; i < 4; i++) {
      const del = delOf(i, delta);
      const cd = Math.cos(del), sd = Math.sin(del);
      const vxh = s[3] - s[5] * SY[i], vyh = s[4] + s[5] * SX[i];
      const Vw = vxh * cd + vyh * sd, Vl = -vxh * sd + vyh * cd, Va = Math.abs(Vw);
      s[24 + i] = (s[24 + i] + h * (s[20 + i] * P.R - Vw)) / (1 + h * Va / opts.sigK);
      s[28 + i] = (s[28 + i] + h * (-Vl)) / (1 + h * Va / opts.sigA);
    }
  }
}

export function run(stepFn, h, tEnd, s, input, monitor) {
  const n = Math.round(tEnd / h);
  let t = 0;
  for (let k = 0; k < n; k++) {
    stepFn(s, t, h, input);
    t += h;
    if (monitor) monitor(s, t);
    if (!Number.isFinite(s[5]) || Math.abs(s[5]) > 20 || Math.abs(s[3]) > 200 || Math.abs(s[6]) > 5) return { ok: false, t };
  }
  return { ok: true, t };
}
export { initState, P, G, T, mfForces };

// ---------------- experiments ----------------
const zeroRoad = () => 0;
const noTorque = () => 0;
const stepSteer = { delta: (t) => (t < 0.5 ? 0 : Math.min(1, (t - 0.5) / 0.2) * 0.035), road: zeroRoad, torque: noTorque };
const bump = { delta: () => 0, torque: noTorque, road: (i, t, x) => {
  if (i !== 0) return 0;
  const x0 = 20, L = 0.5, H = 0.05; // half-sine 50 mm high, 0.5 m long under FL only
  return x > x0 && x < x0 + L ? H * Math.sin(Math.PI * (x - x0) / L) : 0; } };
const brake = { delta: () => 0, road: zeroRoad, torque: (i, t) => (t < 0.5 ? 0 : -(i < 2 ? 1500 : 500)) };

function ref(input, V, tEnd, sample) {
  const s = initState(V);
  const out = [];
  run(stepRK4, 1e-4, tEnd, s, input, (st, t) => { if (Math.abs(t / sample - Math.round(t / sample)) < 1e-6) out.push(st[5]); });
  return { s, out };
}

console.log('--- A: step steer 2 deg at 100 km/h, relaxation states ON. rel = yaw-rate RMS error vs RK4 h=0.1ms');
{
  opts.relax = true;
  const V = 27.8, tEnd = 5, sample = 0.05;
  const r = ref(stepSteer, V, tEnd, sample);
  console.log('final state ref: u', r.s[3].toFixed(2), 'v', r.s[4].toFixed(3), 'r', r.s[5].toFixed(4), 'phi[deg]', (r.s[8] * 57.3).toFixed(2), 'ay/g', (r.s[3] * r.s[5] / G).toFixed(3));
  for (const [name, fn] of [['semi', stepSemi], ['rk4', stepRK4]]) {
    for (const h of [0.00025, 0.0005, 0.001, 0.002, 0.004, 0.00833, 0.01667]) {
      const s = initState(V); const out = [];
      const res = run(fn, h, tEnd, s, stepSteer, (st, t) => { const k = t / sample; if (Math.abs(k - Math.round(k)) < h / sample / 2) out.push(st[5]); });
      let e = 0, n = Math.min(out.length, r.out.length);
      for (let i = 0; i < n; i++) e += (out[i] - r.out[i]) ** 2;
      const hopRms = Math.abs(s[16]);
      console.log(name.padEnd(5), 'h=', (h * 1000).toFixed(2) + 'ms', res.ok ? 'stable  ' : 'UNSTABLE@' + res.t.toFixed(2), 'yaw RMSerr=', res.ok ? Math.sqrt(e / n).toExponential(2) : '-', 'zud', res.ok ? hopRms.toExponential(1) : '-');
    }
  }
}
console.log('--- A2: same manoeuvre, steady-state slip (no relaxation), slip floor Vlow=1 m/s');
{
  opts.relax = false;
  for (const [name, fn] of [['semi', stepSemi], ['rk4', stepRK4]]) {
    for (const h of [0.00025, 0.0005, 0.001, 0.002, 0.004, 0.00833, 0.01667]) {
      const s = initState(27.8);
      const res = run(fn, h, 5, s, stepSteer);
      console.log(name.padEnd(5), 'h=', (h * 1000).toFixed(2) + 'ms', res.ok ? 'stable' : 'UNSTABLE@' + res.t.toFixed(2), 'r', res.ok ? s[5].toFixed(4) : '-', 'om-spread', res.ok ? (Math.max(s[20], s[21], s[22], s[23]) - Math.min(s[20], s[21], s[22], s[23])).toFixed(2) : '-');
    }
  }
}
console.log('--- B: brake from 30 m/s to rest, then hold 3 s. Wheel-speed noise at low speed; both slip formulations');
for (const relax of [false, true]) {
  opts.relax = relax;
  for (const [name, fn] of [['semi', stepSemi], ['rk4', stepRK4]]) {
    for (const h of [0.00025, 0.0005, 0.001, 0.002, 0.004, 0.00833]) {
      const s = initState(30);
      let vmin = 1e9, tStop = null; let maxOmDot = 0; let prev = s[20];
      const input = { delta: () => 0, road: zeroRoad, torque: (i, t) => { const om = s[20 + i]; const tq = (i < 2 ? 1500 : 500) * Math.tanh(om * 2); return t < 0.5 ? 0 : -tq; } };
      let lastU = [];
      const res = run(fn, h, 9, s, input, (st, t) => {
        if (tStop === null && st[3] < 0.2) tStop = t;
        if (tStop !== null) { lastU.push(st[3]); }
      });
      let rms = 0; const tail = lastU.slice(Math.floor(lastU.length / 2));
      for (const x of tail) rms += x * x;
      console.log('relax=' + relax, name.padEnd(5), 'h=', (h * 1000).toFixed(2) + 'ms', res.ok ? 'stable' : 'UNSTABLE@' + res.t.toFixed(2), 'tStop', tStop ? tStop.toFixed(2) : '-', 'u RMS after stop', tail.length ? Math.sqrt(rms / tail.length).toExponential(2) : '-');
    }
  }
}
console.log('--- C: single-wheel bump 50 mm x 0.5 m at 60 km/h. Peak Fz deviation via zu; RMS vs ref');
{
  opts.relax = true;
  const V = 16.67;
  const rs = initState(V); let refPk = 0, refPhi = 0;
  run(stepRK4, 1e-4, 3, rs, bump, (st) => { refPk = Math.max(refPk, Math.abs(st[12])); refPhi = Math.max(refPhi, Math.abs(st[8])); });
  console.log('ref peak zu[mm]', (refPk * 1000).toFixed(1), 'peak roll[deg]', (refPhi * 57.3).toFixed(3));
  for (const [name, fn] of [['semi', stepSemi], ['rk4', stepRK4]]) {
    for (const h of [0.0005, 0.001, 0.002, 0.004, 0.00833, 0.01667]) {
      const s = initState(V); let pk = 0, phi = 0;
      const res = run(fn, h, 3, s, bump, (st) => { pk = Math.max(pk, Math.abs(st[12])); phi = Math.max(phi, Math.abs(st[8])); });
      console.log(name.padEnd(5), 'h=', (h * 1000).toFixed(2) + 'ms', res.ok ? 'stable' : 'UNSTABLE@' + res.t.toFixed(2), 'peak zu[mm]', res.ok ? (pk * 1000).toFixed(1) : '-', 'peak roll[deg]', res.ok ? (phi * 57.3).toFixed(3) : '-');
    }
  }
}
console.log('--- D: CPU cost (single thread, this machine). Node', process.version);
{
  opts.relax = true;
  for (const [name, fn, evals] of [['semi', stepSemi, 1], ['rk4', stepRK4, 4]]) {
    const s = initState(27.8);
    const n = 2000000 / evals;
    let t = 0; const h = 0.001;
    const t0 = performance.now();
    for (let k = 0; k < n; k++) { fn(s, t, h, stepSteer); t += h; if (t > 5) { t = 0; s.set(initState(27.8)); } }
    const dt = performance.now() - t0;
    const us = dt * 1000 / n;
    console.log(name, 'us/step', us.toFixed(3), 'steps/s', (1e6 / us).toExponential(2), 'frame budget used at 1 kHz (16.67 steps per 60Hz frame)', (us * 16.67 / 1000).toFixed(3), 'ms');
  }
  // tyre only
  const out = new Float64Array(4); let acc = 0;
  const t0 = performance.now(); const n = 5000000;
  for (let i = 0; i < n; i++) { mfForces(0.01 + 1e-9 * i, 0.03, 4000 + (i & 1023), 0.01, out); acc += out[0]; }
  console.log('one MF combined-slip tyre eval us', ((performance.now() - t0) * 1000 / n).toFixed(4), acc > 0);
}

console.log('--- E: toe and camber effect in time domain. Step steer 1 deg at 100 km/h, h=1ms semi-implicit');
{
  opts.relax = true;
  const inp = { delta: (t) => (t < 0.5 ? 0 : Math.min(1, (t - 0.5) / 0.05) * 0.01745), road: zeroRoad, torque: noTorque };
  const D = Math.PI / 180;
  const cases = [['base', {}], ['F toe-in 0.25deg/wheel', { toeF: 0.25 * D }], ['F toe-out 0.25', { toeF: -0.25 * D }], ['R toe-in 0.25', { toeR: 0.25 * D }], ['R toe-out 0.25', { toeR: -0.25 * D }], ['static neg camber 2deg all', { gammaStatic: 2 * D }], ['no camber recovery in roll (0)', { camberRoll: 0 }], ['full roll camber (1)', { camberRoll: 1 }]];
  for (const [name, o] of cases) {
    Object.assign(opts, { toeF: 0, toeR: 0, gammaStatic: 0, camberRoll: 0.5 }, o);
    // settle first
    const s = initState(27.8);
    const tr = [];
    run(stepSemi, 0.001, 6, s, inp, (st, t) => tr.push([t, st[5], st[3] * st[5] / G, st[8]]));
    const r0 = tr[480][1], rEnd = tr[tr.length - 1][1];
    const dr = rEnd - r0;
    let t63 = null, t90 = null, pk = 0;
    for (const x of tr) { if (x[0] > 0.5) { const f = (x[1] - r0) / dr; if (t63 === null && f > 0.63) t63 = x[0] - 0.5; if (t90 === null && f > 0.9) t90 = x[0] - 0.5; if (f > pk) pk = f; } }
    console.log(name.padEnd(32), 'yaw(pre)', r0.toExponential(2), 'yaw ss', rEnd.toFixed(4), 't63', t63 && t63.toFixed(3), 't90', t90 && t90.toFixed(3), 'overshoot%', ((pk - 1) * 100).toFixed(1), 'ay/g', tr[tr.length - 1][2].toFixed(3), 'roll deg', (tr[tr.length - 1][3] * 57.3).toFixed(2), 'u', s[3].toFixed(2));
  }
  Object.assign(opts, { toeF: 0, toeR: 0, gammaStatic: 0, camberRoll: 0.5 });
}
console.log('--- F: limit: slow ramp steer at 100 km/h to find max ay and over/understeer at limit; brake-in-turn');
{
  opts.relax = true;
  const inp = { delta: (t) => Math.min(0.12, 0.012 * t), road: zeroRoad, torque: (i, t) => 0 };
  const s = initState(27.8); let ayMax = 0, spin = null;
  run(stepSemi, 0.001, 12, s, inp, (st, t) => { const ay = st[3] * st[5] / G; ayMax = Math.max(ayMax, Math.abs(ay)); if (spin === null && Math.abs(st[4]) > 6) spin = t; });
  console.log('ramp steer peak ay/g', ayMax.toFixed(3), 'large sideslip at t', spin);
  for (const Tq of [0, 300, 600, 900, 1200]) {
    const inp2 = { delta: (t) => (t < 1 ? 0.012 * t * 3 : 0.036), road: zeroRoad, torque: (i, t) => (t < 4 ? 0 : -(i < 2 ? Tq * 0.75 : Tq * 0.25) * Math.tanh(sNow[20 + i] * 2)) };
    const sNow = initState(25);
    let rPk = 0, betaPk = 0, r0 = 0;
    run(stepSemi, 0.001, 8, sNow, inp2, (st, t) => { if (t < 3.99) r0 = st[5]; if (t > 4) { rPk = Math.max(rPk, st[5]); } betaPk = Math.max(betaPk, Math.abs(Math.atan2(st[4], Math.max(0.5, st[3])))); });
    console.log('brake-in-turn torque/wheel-sum', Tq, 'yaw before', r0.toFixed(3), 'peak after', rPk.toFixed(3), 'peak beta deg', (betaPk * 57.3).toFixed(1));
  }
}
