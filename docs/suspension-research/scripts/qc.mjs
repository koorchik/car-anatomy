// Sanity calculation for research notes: linear quarter car on an ISO 8608 road.
const ms = 300, mu = 30, k = 20000, kt = 160000, g = 9.81;
const c0 = (a, b = 0) => [a, b];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const div = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const abs = a => Math.hypot(a[0], a[1]);

// Frequency weighting from the ISO 2631-1 band-limiting/transition/step parameters.
function weight(f, p) {
  const s = [0, 2 * Math.PI * f];
  const w = x => 2 * Math.PI * x;
  const pw = (a) => mul(a, a);
  const hl = div(pw(s), add(add(pw(s), mul(s, c0(Math.SQRT2 * w(p.f1)))), c0(w(p.f1) ** 2)));
  const hh = div(c0(w(p.f2) ** 2), add(add(pw(s), mul(s, c0(Math.SQRT2 * w(p.f2)))), c0(w(p.f2) ** 2)));
  const tDen = add(add(pw(s), mul(s, c0(w(p.f4) / p.Q4))), c0(w(p.f4) ** 2));
  const ht = div(mul(c0(w(p.f4) ** 2 / w(p.f3)), add(s, c0(w(p.f3)))), tDen);
  let h = mul(mul(hl, hh), ht);
  if (p.f5) {
    const n = add(add(pw(s), mul(s, c0(w(p.f5) / p.Q5))), c0(w(p.f5) ** 2));
    const d = add(add(pw(s), mul(s, c0(w(p.f6) / p.Q6))), c0(w(p.f6) ** 2));
    h = mul(h, div(n, d));
  }
  return abs(h);
}
const Wk = { f1: 0.4, f2: 100, f3: 12.5, f4: 12.5, Q4: 0.63, f5: 2.37, Q5: 0.91, f6: 3.35, Q6: 0.91 };
console.log('Wk check (Hz: gain):', [0.5, 1, 2, 4, 5, 6.3, 8, 10, 16, 31.5].map(f => `${f}:${weight(f, Wk).toFixed(3)}`).join(' '));

function tf(f, c) {
  const s = [0, 2 * Math.PI * f];
  const sus = add(mul(c0(c), s), c0(k));
  const A = add(mul(c0(ms), mul(s, s)), sus);
  const B = add(add(mul(c0(mu), mul(s, s)), sus), c0(kt));
  // Zs = sus/A * Zu; Zu*(B - sus^2/A) = kt*Zr
  const Zu = div(c0(kt), add(B, [-div(mul(sus, sus), A)[0], -div(mul(sus, sus), A)[1]]));
  const Zs = mul(div(sus, A), Zu);
  const w2 = -((2 * Math.PI * f) ** 2);
  return { acc: mul(c0(w2), Zs), travel: add(Zs, [-Zu[0], -Zu[1]]), tyre: add(Zu, c0(-1)) };
}

function stats(zeta, v, G0, nMax = 2.83) {
  const c = zeta * 2 * Math.sqrt(k * ms);
  const n0 = 0.1, nMin = 0.011;
  let a2 = 0, aw2 = 0, t2 = 0, f2 = 0;
  const N = 6000;
  const r = Math.pow(nMax / nMin, 1 / N);
  for (let i = 0; i < N; i++) {
    const n = nMin * r ** (i + 0.5), dn = nMin * r ** i * (r - 1);
    const f = n * v, S = G0 * (n0 / n) ** 2 * dn;
    const h = tf(f, c);
    a2 += abs(h.acc) ** 2 * S;
    aw2 += (abs(h.acc) * weight(f, Wk)) ** 2 * S;
    t2 += abs(h.travel) ** 2 * S;
    f2 += (kt * abs(h.tyre)) ** 2 * S;
  }
  return { a: Math.sqrt(a2), aw: Math.sqrt(aw2), travelMm: 1000 * Math.sqrt(t2), dlc: Math.sqrt(f2) / ((ms + mu) * g) };
}

const fbb = Math.sqrt(k * kt / (k + kt) / ms) / (2 * Math.PI);
console.log('body bounce Hz', fbb.toFixed(2), 'wheel hop Hz', (Math.sqrt((k + kt) / mu) / (2 * Math.PI)).toFixed(2));
console.log('accel invariant Hz', (Math.sqrt(kt / mu) / (2 * Math.PI)).toFixed(2), 'gain kt/ms', (kt / ms).toFixed(1), 's^-2');
console.log('travel invariant Hz', (Math.sqrt(kt / (ms + mu)) / (2 * Math.PI)).toFixed(2), 'gain', ((ms + mu) / ms).toFixed(3));

// Invariant-point verification across damping.
for (const z of [0.1, 0.3, 1]) {
  const c = z * 2 * Math.sqrt(k * ms);
  const fa = Math.sqrt(kt / mu) / (2 * Math.PI), ft = Math.sqrt(kt / (ms + mu)) / (2 * Math.PI);
  console.log(`zeta ${z}: |acc/zr|@fa=${abs(tf(fa, c).acc).toFixed(2)} |travel/zr|@ft=${abs(tf(ft, c).travel).toFixed(3)}`);
}

console.log('\nClass, speed, zeta -> rms acc, Wk rms acc, rms travel mm, DLC (tyre force CoV)');
for (const [cls, G0] of [['A', 16e-6], ['B', 64e-6], ['C', 256e-6], ['D', 1024e-6]]) {
  for (const v of [50 / 3.6, 90 / 3.6, 130 / 3.6]) {
    const o = stats(0.3, v, G0);
    console.log(cls, (v * 3.6).toFixed(0) + 'km/h', 'z0.3', o.a.toFixed(2), o.aw.toFixed(2), o.travelMm.toFixed(1), o.dlc.toFixed(3));
  }
}
console.log('\nDamping sweep class C, 90 km/h');
for (const z of [0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1, 1.5]) {
  const o = stats(z, 25, 256e-6);
  console.log('zeta', z, 'a', o.a.toFixed(2), 'aw', o.aw.toFixed(3), 'travel', o.travelMm.toFixed(1), 'dlc', o.dlc.toFixed(3));
}
console.log('\nSpring sweep effect is left to the caller; bump below');

// Time-domain half-sine hump with unilateral tyre, for illustration.
function bump(zeta, kmh, H = 0.08, L = 1.0) {
  const c = zeta * 2 * Math.sqrt(k * ms), v = kmh / 3.6, dt = 2e-5;
  const stS = -(ms + mu) * g / k - 0, stT = (ms + mu) * g / kt;
  let zs = 0, vs = 0, zu = 0, vu = 0;
  let peak = 0, minF = Infinity, maxTravel = 0, last = 0;
  const F0 = (ms + mu) * g;
  for (let t = 0; t < 6; t += dt) {
    const x = v * t - 2;
    const zr = x > 0 && x < L ? H * Math.sin(Math.PI * x / L) ** 2 : 0;
    const dF = k * (zu - zs) + c * (vu - vs);
    const tyreF = Math.max(0, F0 + kt * (zr - zu));
    const as = dF / ms;
    const au = (-dF + tyreF - F0) / mu;
    vs += as * dt; zs += vs * dt; vu += au * dt; zu += vu * dt;
    if (Math.abs(as) > peak) peak = Math.abs(as);
    if (tyreF < minF) minF = tyreF;
    if (Math.abs(zs - zu) > maxTravel) maxTravel = Math.abs(zs - zu);
    if (Math.abs(as) > 0.05 * 9.81) last = t;
  }
  return { peakG: peak / 9.81, minF: minF / F0, travelMm: maxTravel * 1000, settle: last - 2 / v };
}
console.log('\nHump 80 mm x 1 m (sin^2) peak g, min tyre force fraction, peak travel mm, time to |a|<0.05g');
for (const kmh of [20, 40]) for (const z of [0.1, 0.3, 0.6]) {
  const o = bump(z, kmh);
  console.log(kmh + 'km/h z' + z, o.peakG.toFixed(2), o.minF.toFixed(2), o.travelMm.toFixed(0), o.settle.toFixed(2));
}
