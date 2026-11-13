import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CARS } from '../src/data/cars.ts';
import { SUMP_CARS } from '../src/data/sump-cars.ts';
import { modelMassKg, type CarRecord } from '../src/vehicle/car.ts';
import {
  brushAdhesionShare,
  brushForce,
  inclinationOf,
  lateralPeakN,
  longitudinalOf,
  longitudinalPeakN,
  mfEval,
  mfForces,
  newMfForces,
  newTyreForces,
  newTyreState,
  sigmaAlpha,
  sigmaKappa,
  staticWheelLoadN,
  stepTyre,
  tyreAt,
  tyreFor,
  type Tyre,
  type TyreLongForce,
} from '../src/vehicle/tyre.ts';
import { BRUSH_SLIP_STIFFNESS, MF_185_80R14, SEDAN_PAC02, TYRE_FILES, TYRE_SETS, type MfSet } from '../src/vehicle/tyre-data.ts';
import { G, TYRE_IDS, TYRES, type TyreId } from '../src/vehicle/vehicle.ts';

const DEG = Math.PI / 180;
const o = newMfForces();

/** Name = value pairs of a .tir file, as the text gives them. */
function readTir(name: string): Map<string, number> {
  const text = readFileSync(join(import.meta.dirname, 'fixtures', 'chrono-tyres', name), 'utf8');
  const out = new Map<string, number>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z][A-Z_0-9]*)\s*=\s*([-+0-9.eE]+)\s*(?:\$.*)?$/.exec(line);
    if (m) out.set(m[1]!, Number(m[2]));
  }
  return out;
}

/** Coefficients the files carry that the site does not use: Mx, My, gyroscopic torque, belt, effective radius. */
const UNUSED = /^(QSX\d+|QSY\d+|QTZ1|MBELT|BREFF|DREFF|FREFF)$/;
const COEFFICIENT = /^(P[CDEKHVT][XY]\d+|Q[BCDEHS][XYZ]\d+|R[BCEHV][XY]\d+|SSZ\d+|QTZ1|MBELT)$/;

/** Largest |F| along the slip angle in one direction, by a scan of `steps` steps of `stepRad` (0.005° up to 30°). */
function peakFy(p: MfSet, fz: number, gamma: number, sign: 1 | -1, stepRad = 0.005 * DEG, steps = 6000): number {
  let best = 0;
  for (let i = 1; i <= steps; i++) {
    mfEval(p, 0, sign * i * stepRad, gamma, fz, 1, o);
    if (Math.abs(o.fy) > Math.abs(best)) best = o.fy;
  }
  return best;
}

function peakFx(p: MfSet, fz: number, sign: 1 | -1): number {
  let best = 0;
  for (let i = 1; i <= 5000; i++) {
    mfEval(p, sign * i * 1e-4, 0, 0, fz, 1, o);
    if (Math.abs(o.fx) > Math.abs(best)) best = o.fx;
  }
  return best;
}

const meanPeakMuY = (p: MfSet, fz: number): number => (Math.abs(peakFy(p, fz, 0, 1)) + Math.abs(peakFy(p, fz, 0, -1))) / 2 / fz;
const meanPeakMuX = (p: MfSet, fz: number): number => (Math.abs(peakFx(p, fz, 1)) + Math.abs(peakFx(p, fz, -1))) / 2 / fz;

/** The six cars of the oil-on-track page, whose lap the fitted tyre must agree with. */
const LAP_CARS: CarRecord[] = SUMP_CARS.map((c) => CARS[c.car!]!);

describe('MF sets against the Chrono files', () => {
  const sedan = readTir('Sedan_Pac02Tire.tir');
  const classic = readTir('mf_185_80R14.tir');

  it('copies mf_185_80R14 number for number', () => {
    for (const [key, value] of Object.entries(MF_185_80R14)) {
      expect(classic.has(key), key).toBe(true);
      expect(value, key).toBe(classic.get(key));
    }
  });

  it('copies Sedan_Pac02Tire number for number, with the combined-slip terms of mf_185_80R14 and 0 where absent', () => {
    for (const [key, value] of Object.entries(SEDAN_PAC02)) {
      if (key.startsWith('R')) expect(value, key).toBe(classic.get(key));
      else expect(value, key).toBe(sedan.get(key) ?? 0);
    }
    expect([...sedan.keys()].filter((k) => k.startsWith('R'))).toEqual(['RIM_RADIUS', 'RIM_WIDTH']);
  });

  it('leaves out only the coefficients the site does not use', () => {
    for (const file of [sedan, classic]) {
      for (const key of file.keys()) {
        if (!COEFFICIENT.test(key) || UNUSED.test(key)) continue;
        expect(key in MF_185_80R14, key).toBe(true);
      }
      // Scaling factors other than the three the fit sets are 1 in both files.
      for (const [key, value] of file) if (/^L[A-Z]+$/.test(key) && !['LFZO', 'LMUX', 'LMUY', 'LONGVL'].includes(key)) expect(value, key).toBe(1);
    }
  });

  it('agrees with the vertical data of the same files', () => {
    expect(TYRE_FILES['sedan-pac02'].ktNm).toBe(sedan.get('VERTICAL_STIFFNESS'));
    expect(TYRE_FILES['sedan-pac02'].freeRadiusM).toBe(SEDAN_PAC02.UNLOADED_RADIUS);
    expect(TYRE_FILES['mf-185-80r14'].ktNm).toBe(classic.get('VERTICAL_STIFFNESS'));
    expect(TYRE_FILES['mf-185-80r14'].freeRadiusM).toBe(MF_185_80R14.UNLOADED_RADIUS);
  });

  it('takes the street and classic sets as published and derives only the illustrative two', () => {
    expect(TYRE_SETS.street).toBe(SEDAN_PAC02);
    expect(TYRE_SETS.classic).toBe(MF_185_80R14);
    expect(TYRE_SETS.semi.PKY1 / SEDAN_PAC02.PKY1).toBeCloseTo(1.3, 12);
    expect(TYRE_SETS.slick.PDY2 / SEDAN_PAC02.PDY2).toBeCloseTo(2, 12);
  });
});

describe('the research numbers, same coefficients (docs/research/suspensions.md §13.1)', () => {
  // The research evaluated the file's FNOMIN without LFZO for the peaks and the camber split, with LFZO for E_y.
  const flat: MfSet = { ...SEDAN_PAC02, LFZO: 1 };

  it('peaks 5268 and 4906 N in the two directions at 4850 N: PVY1 and PHY1 tilt the curve', () => {
    expect(peakFy(flat, 4850, 0, -1)).toBeCloseTo(5268, -0.5);
    expect(peakFy(flat, 4850, 0, 1)).toBeCloseTo(-4906, -0.5);
  });

  it('a wheel leaning towards the force gains 1.4 % of peak, leaning away loses 0.9 % (sign of KIT 2006)', () => {
    // Fy > 0 (to the left) comes from α < 0; γ = −2° leans the top to the left, into the force. The research scanned
    // α in 0.0005 rad steps up to 0.2 rad.
    const scan = (gamma: number): number => peakFy(flat, 4850, gamma, -1, 0.0005, 399);
    expect(scan(-2 * DEG) / scan(0) - 1).toBeCloseTo(0.014, 3);
    expect(scan(2 * DEG) / scan(0) - 1).toBeCloseTo(-0.0085, 3);
    // Leaning away moves the peak to 12.8°, past that scan: over the whole range the loss is 0.7 %.
    expect(peakFy(flat, 4850, 2 * DEG, -1) / peakFy(flat, 4850, 0, -1) - 1).toBeCloseTo(-0.0072, 3);
    expect(peakFy(flat, 4850, -2 * DEG, -1) / peakFy(flat, 4850, 0, -1) - 1).toBeCloseTo(0.014, 3);
  });

  it('the camber effect comes from the S_Vy shift, not from PDY3', () => {
    const split = (p: MfSet): number => (peakFy(p, 4850, -2 * DEG, -1) - peakFy(p, 4850, 2 * DEG, -1)) / peakFy(p, 4850, 0, -1);
    const full = split(flat);
    const noShift = split({ ...flat, PVY3: 0, PVY4: 0 });
    expect(Math.abs(noShift)).toBeLessThan(0.2 * Math.abs(full));
    // PDY3 alone: (1 − PDY3·γ²) raises μ by 0.35 % at 2° with the file's negative PDY3, and the peak of the whole
    // curve moves by about that, either way the wheel leans.
    expect(-SEDAN_PAC02.PDY3 * (2 * DEG) ** 2).toBeCloseTo(0.0035, 4);
    for (const gamma of [-2 * DEG, 2 * DEG]) {
      for (const sign of [1, -1] as const) {
        const gain = peakFy(flat, 4850, gamma, sign) / peakFy({ ...flat, PDY3: 0 }, 4850, gamma, sign) - 1;
        expect(gain).toBeGreaterThan(0);
        expect(gain).toBeLessThan(0.005);
      }
    }
  });

  it('E_y stays at or below 1 from −5° to +3.5° over the file loads; at +5° and 10 kN it reaches 1.31', () => {
    let worst = -Infinity;
    for (let gd = -5; gd <= 3.5; gd += 0.5) {
      for (let fz = 225; fz <= 10125; fz += 100) {
        for (const s of [1, -1]) {
          mfEval(SEDAN_PAC02, 0, s * 0.05, gd * DEG, fz, 1, o);
          worst = Math.max(worst, o.eyRaw);
        }
      }
    }
    expect(worst).toBeLessThanOrEqual(1);
    mfEval(SEDAN_PAC02, 0, -0.05, 5 * DEG, 10125, 1, o);
    expect(o.eyRaw).toBeCloseTo(1.31, 2);
    expect(o.ey).toBe(1);
  });

  it('past the camber range the clamp keeps the side force monotonic up to its peak', () => {
    for (const gd of [5, 8, -8]) {
      for (const sign of [1, -1] as const) {
        // The force against the slip, −sign·Fy, from α = 0 to 30°: it must not dip before its largest value.
        const f: number[] = [];
        for (let i = 0; i <= 6000; i++) {
          mfEval(SEDAN_PAC02, 0, sign * i * 0.005 * DEG, gd * DEG, 10000, 1, o);
          f.push(-sign * o.fy);
        }
        const top = f.indexOf(Math.max(...f));
        for (let i = 1; i <= top; i++) expect(f[i]! - f[i - 1]!, `${gd}° ${sign}`).toBeGreaterThanOrEqual(-1e-9);
      }
    }
  });

  it('with one flat nominal load μ would follow the car mass: Camaro 0.993, Cayman 1.030 (1.027 and 1.057 without LFZO)', () => {
    const rel = (p: MfSet, kg: number): number => lateralPeakN(p, (kg * G) / 4) / ((kg * G) / 4) / p.PDY1;
    expect(rel(SEDAN_PAC02, 1670)).toBeCloseTo(0.993, 3);
    expect(rel(SEDAN_PAC02, 1320)).toBeCloseTo(1.03, 3);
    expect(rel(flat, 1670)).toBeCloseTo(1.027, 3);
    expect(rel(flat, 1320)).toBeCloseTo(1.057, 3);
  });
});

describe('the tyre fitted to a car', () => {
  it('centres the set on each oil-page car and gives the lap μ there, along and across', () => {
    expect(LAP_CARS).toHaveLength(6);
    for (const car of LAP_CARS) {
      const load = (modelMassKg(car) * G) / 4;
      expect(staticWheelLoadN(car)).toBeCloseTo(load, 9);
      for (const id of TYRE_IDS) {
        const tyre = tyreFor(car, id);
        expect(tyre.set.LFZO * tyre.set.FNOMIN, `${car.id} ${id}`).toBeCloseTo(load, 6);
        expect(Math.abs(meanPeakMuY(tyre.set, load) / TYRES[id].mu - 1), `${car.id} ${id} across`).toBeLessThan(0.005);
        expect(Math.abs(meanPeakMuX(tyre.set, load) / TYRES[id].mu - 1), `${car.id} ${id} along`).toBeLessThan(0.005);
        expect(lateralPeakN(tyre.set, load) / load).toBeCloseTo(TYRES[id].mu, 12);
        expect(longitudinalOf(tyre).peakMu(load)).toBeCloseTo(TYRES[id].mu, 12);
      }
    }
  });

  it('loses 0.5–1 % of the summed peak at rest to the weight split, and no more', () => {
    for (const car of LAP_CARS) {
      const tyre = tyreFor(car);
      const m = modelMassKg(car);
      const front = (m * G * car.body.frontShare) / 2;
      const rear = (m * G * (1 - car.body.frontShare)) / 2;
      const sum = 2 * (lateralPeakN(tyre.set, front) + lateralPeakN(tyre.set, rear));
      const share = sum / (tyre.mu * m * G);
      expect(share, car.id).toBeGreaterThanOrEqual(0.99);
      expect(share, car.id).toBeLessThanOrEqual(1);
      // The loss is the convexity of μ(F_z): 1 + (PDY2/PDY1)·(2·share − 1)².
      const d = 2 * car.body.frontShare - 1;
      expect(share).toBeCloseTo(1 + (SEDAN_PAC02.PDY2 / SEDAN_PAC02.PDY1) * d * d, 9);
    }
  });

  it('gives the street tyre a cornering stiffness of 10–25 per radian per load', () => {
    for (const car of LAP_CARS) {
      const tyre = tyreFor(car, 'street');
      mfEval(tyre.set, 0, 0, 0, tyre.wheelLoadN, 1, o);
      expect(-o.ky / tyre.wheelLoadN).toBeGreaterThan(10);
      expect(-o.ky / tyre.wheelLoadN).toBeLessThan(25);
    }
  });

  it('puts the M3 E30 on the classic tyre at μ 0.8', () => {
    const e30 = CARS['bmw-m3-e30']!;
    const tyre = tyreFor(e30);
    expect(tyre.id).toBe('classic');
    expect(meanPeakMuY(tyre.set, tyre.wheelLoadN)).toBeCloseTo(0.8, 3);
  });

  it('gains grip with load less than in proportion', () => {
    for (const id of ['classic', 'street', 'semi', 'slick'] as TyreId[]) {
      const tyre = tyreAt(id, 3500);
      const one = Math.abs(peakFy(tyre.set, 3500, 0, -1));
      const two = Math.abs(peakFy(tyre.set, 7000, 0, -1));
      expect(two, id).toBeLessThan(2 * one);
      expect(two, id).toBeGreaterThan(one);
    }
  });

  it('refuses a load that is not positive', () => {
    expect(() => tyreAt('street', 0)).toThrow();
  });
});

describe('signs, mirror and combined slip', () => {
  const tyre = tyreAt('street', 4000);
  const p = tyre.set;

  it('pushes against the sliding, drives with positive slip and aligns the wheel with its path', () => {
    mfEval(p, 0, 3 * DEG, 0, 4000, 1, o);
    expect(o.fy).toBeLessThan(0);
    expect(o.mz).toBeGreaterThan(0);
    mfEval(p, 0.05, 0, 0, 4000, 1, o);
    expect(o.fx).toBeGreaterThan(0);
    mfEval(p, -0.05, 0, 0, 4000, 1, o);
    expect(o.fx).toBeLessThan(0);
    // Camber thrust: a positive inclination (top to the right) pushes to the right.
    mfEval(p, 0, 0, 2 * DEG, 4000, 1, o);
    const leaning = o.fy;
    mfEval(p, 0, 0, 0, 4000, 1, o);
    expect(leaning).toBeLessThan(o.fy);
  });

  it('mirrors the right tyre exactly: Fy_R(α, γ) = −Fy_L(−α, −γ)', () => {
    const l = newMfForces();
    const r = newMfForces();
    for (const k of [-0.2, -0.03, 0, 0.01, 0.1]) {
      for (const a of [-0.2, -0.02, 0, 0.004, 0.15]) {
        for (const g of [-0.05, 0, 0.03]) {
          mfForces(p, 'right', k, a, g, 4100, 1, r);
          mfForces(p, 'left', k, -a, -g, 4100, 1, l);
          expect(r.fy).toBe(-l.fy);
          expect(r.mz).toBe(-l.mz);
          expect(r.fx).toBe(l.fx);
        }
      }
    }
    // A car with equal camber on both sides corners the same both ways.
    const left = newMfForces();
    const right = newMfForces();
    const gL = inclinationOf('left', -2 * DEG);
    const gR = inclinationOf('right', -2 * DEG);
    mfForces(p, 'left', 0, 4 * DEG, gL, 4000, 1, left);
    mfForces(p, 'right', 0, 4 * DEG, gR, 4000, 1, right);
    const turnA = left.fy + right.fy;
    mfForces(p, 'left', 0, -4 * DEG, gL, 4000, 1, left);
    mfForces(p, 'right', 0, -4 * DEG, gR, 4000, 1, right);
    expect(left.fy + right.fy).toBeCloseTo(-turnA, 9);
  });

  it('negative camber helps the outer wheel of a turn on either side', () => {
    for (const side of ['left', 'right'] as const) {
      // Outer wheel: a left wheel in a right turn pushes to the right (Fy < 0, α > 0); the right wheel the other way.
      const sign = side === 'left' ? 1 : -1;
      const peak = (camber: number): number => {
        let best = 0;
        for (let i = 1; i <= 4000; i++) {
          mfForces(p, side, 0, sign * i * 0.005 * DEG, inclinationOf(side, camber), 4000, 1, o);
          best = Math.max(best, Math.abs(o.fy));
        }
        return best;
      };
      expect(peak(-2 * DEG), side).toBeGreaterThan(peak(0));
      expect(peak(2 * DEG), side).toBeLessThan(peak(0));
    }
  });

  it('reduces to pure slip when the other slip is zero', () => {
    for (const a of [-0.1, 0.02, 0.2]) {
      mfEval(p, 0, a, 0.01, 3800, 1, o);
      expect(o.fy).toBe(o.fy0);
    }
    for (const k of [-0.1, 0.02, 0.2]) {
      mfEval(p, k, 0, 0, 3800, 1, o);
      expect(o.fx).toBeCloseTo(o.fx0, 12);
    }
  });

  it('keeps the combined force near the friction ellipse on every set, dry to snow', () => {
    for (const id of ['classic', 'street', 'semi', 'slick'] as TyreId[]) {
      for (const load of [3200, 4100]) {
        const set = tyreAt(id, load).set;
        for (const mu of [1, 0.6, 0.3]) {
          // On snow only the bulge is checked: deep in the slide the pure curves themselves fall below their peaks.
          let lo = Infinity;
          let hi = -Infinity;
          for (const ad of [0.5, 1, 2, 3, 4, 6, 8, 10, 12, 15, -1, -2, -4, -6, -8, -12]) {
            // The envelope for this slip angle: the largest resultant over κ, against the pure peaks.
            let env = 0;
            for (let k = -0.4; k <= 0.4001; k += 0.0025) {
              mfEval(set, k, ad * DEG, 0, load, mu, o);
              env = Math.max(env, Math.hypot(o.fx / o.dx, o.fy / o.dy));
            }
            lo = Math.min(lo, env);
            hi = Math.max(hi, env);
          }
          if (mu >= 0.6) expect(lo, `${id} ${load} μ ${mu}`).toBeGreaterThan(0.85);
          expect(hi, `${id} ${load} μ ${mu}`).toBeLessThan(1.05);
        }
      }
    }
  });

  it('peaks the aligning moment before the side force, on a trail of about a sixth of the patch', () => {
    for (const id of ['classic', 'street'] as TyreId[]) {
      const set = tyreAt(id, 4000).set;
      let fyPeak = 0;
      let fyAt = 0;
      let mzPeak = 0;
      let mzAt = 0;
      for (let i = 1; i <= 3000; i++) {
        const a = i * 0.005 * DEG;
        mfEval(set, 0, a, 0, 4000, 1, o);
        if (Math.abs(o.fy) > fyPeak) [fyPeak, fyAt] = [Math.abs(o.fy), a];
        if (o.mz > mzPeak) [mzPeak, mzAt] = [o.mz, a];
      }
      expect(mzAt, id).toBeLessThan(fyAt / 2);
      mfEval(set, 0, 0.002, 0, 4000, 1, o);
      const [f1, m1] = [o.fy, o.mz];
      mfEval(set, 0, -0.002, 0, 4000, 1, o);
      const trail = -(m1 - o.mz) / (f1 - o.fy);
      expect(trail, id).toBeGreaterThan(0.02);
      expect(trail, id).toBeLessThan(0.06);
    }
  });
});

describe('the brush form', () => {
  it('has the slip stiffness of the MF set at its nominal load (10 %)', () => {
    for (const id of ['classic', 'street', 'semi', 'slick'] as TyreId[]) {
      const set = TYRE_SETS[id];
      const fz = set.LFZO * set.FNOMIN;
      mfEval(set, 0, 0, 0, fz, 1, o);
      expect(Math.abs(BRUSH_SLIP_STIFFNESS[id] / (o.kx / fz) - 1), id).toBeLessThan(0.1);
    }
  });

  it('gives the same force as the MF at small slip (5 %)', () => {
    // Small: up to about 5 % of the full-slide slip 3μ/C (0.12–0.15 here). The brush is concave from zero slip, the MF
    // nearly straight, so by κ = 0.01 they part by 7 % on the street tyre.
    for (const id of ['classic', 'street', 'semi', 'slick'] as TyreId[]) {
      const tyre = tyreAt(id, 4000);
      const muFz = longitudinalPeakN(tyre.set, 4000);
      for (const k of [0.001, 0.0025, 0.005]) {
        // The odd part of the MF curve: the files' small shifts at zero slip (PHX1, PVX1) cancel.
        mfEval(tyre.set, k, 0, 0, 4000, 1, o);
        const plus = o.fx;
        mfEval(tyre.set, -k, 0, 0, 4000, 1, o);
        const mf = (plus - o.fx) / 2;
        const brush = brushForce(BRUSH_SLIP_STIFFNESS[id] * 4000, muFz, k);
        expect(Math.abs(brush / mf - 1), `${id} κ ${k}`).toBeLessThan(0.05);
      }
    }
  });

  it('slides fully at 3μF_z/C, where the adhesion zone has gone', () => {
    const c = 22 * 4000;
    const muFz = 4000;
    const full = (3 * muFz) / c;
    expect(brushForce(c, muFz, full)).toBeCloseTo(muFz, 9);
    expect(brushForce(c, muFz, -2 * full)).toBe(-muFz);
    expect(brushAdhesionShare(c, muFz, 0)).toBe(1);
    expect(brushAdhesionShare(c, muFz, full / 2)).toBeCloseTo(0.5, 12);
    expect(brushAdhesionShare(c, muFz, full)).toBe(0);
    // Monotonic up to the full slide.
    let last = 0;
    for (let s = 0; s <= full; s += full / 200) {
      const f = brushForce(c, muFz, s);
      expect(f).toBeGreaterThanOrEqual(last - 1e-9);
      last = f;
    }
  });
});

describe('relaxation and low speed', () => {
  const dt = 1 / 3000;

  /** Time for the force to cover 63.2 % of a step in slip, from the force before the step. */
  function riseTime(tyre: Tyre, v: number, vy: number, omega: number, pick: 'fx' | 'fy'): number {
    const f = newTyreForces();
    const steady = newTyreState();
    for (let i = 0; i < 60000; i++) stepTyre(tyre, 'left', steady, omega, 0.33, v, vy, tyre.wheelLoadN, 0, 1, dt, f);
    const target = f[pick];
    const before = newTyreState();
    stepTyre(tyre, 'left', before, v / 0.33, 0.33, v, 0, tyre.wheelLoadN, 0, 1, dt, f);
    const start = f[pick];
    const s = newTyreState();
    for (let i = 1; i < 60000; i++) {
      stepTyre(tyre, 'left', s, omega, 0.33, v, vy, tyre.wheelLoadN, 0, 1, dt, f);
      if ((f[pick] - start) / (target - start) >= 1 - Math.exp(-1)) return i * dt;
    }
    return NaN;
  }

  it('answers a step in slip angle or slip with a first-order lag of σ/v (5 %)', () => {
    const tyre = tyreAt('street', 4000);
    for (const v of [5, 20, 50]) {
      for (const deg of [0.2, 0.5]) {
        const t = riseTime(tyre, v, v * Math.tan(deg * DEG), v / 0.33, 'fy');
        expect(Math.abs(t / (sigmaAlpha(tyre.set, 4000) / v) - 1), `${v} m/s ${deg}°`).toBeLessThan(0.05);
      }
      const t = riseTime(tyre, v, 0, (v * 1.002) / 0.33, 'fx');
      expect(Math.abs(t / (sigmaKappa(tyre.set, 4000) / v) - 1), `${v} m/s along`).toBeLessThan(0.05);
    }
  });

  it('settles at speed on the steady Magic Formula, peaks included, on both sides', () => {
    const tyre = tyreAt('street', 4000);
    const steady = newMfForces();
    const f = newTyreForces();
    for (const side of ['left', 'right'] as const) {
      for (const deg of [-11, -3, 2, 11]) {
        for (const k of [-0.1, 0, 0.05]) {
          const v = 25;
          const s = newTyreState();
          for (let i = 0; i < 6000; i++) stepTyre(tyre, side, s, (v * (1 + k)) / 0.33, 0.33, v, v * Math.tan(deg * DEG), 4000, 0.02, 1, dt, f);
          mfForces(tyre.set, side, k, deg * DEG, 0.02, 4000, 1, steady);
          expect(f.fx, `${side} ${deg}° κ ${k}`).toBeCloseTo(steady.fx, 3);
          expect(f.fy, `${side} ${deg}° κ ${k}`).toBeCloseTo(steady.fy, 3);
          expect(f.mz, `${side} ${deg}° κ ${k}`).toBeCloseTo(steady.mz, 4);
        }
      }
    }
  });

  /** A car on four tyres along the road: rear-wheel drive torque, a handbrake on the rear, a slope. */
  function drive(opts: { slope: number; handbrake: boolean; driveNm: number; v0: number; seconds: number }) {
    const m = 1500;
    const r = 0.33;
    const J = 1;
    const th = Math.atan(opts.slope);
    const fz = (m * G * Math.cos(th)) / 4;
    const tyre = longitudinalOf(tyreAt('street', (m * G) / 4));
    const states = [{ u: 0 }, { u: 0 }, { u: 0 }, { u: 0 }];
    const omega = [0, 0, 0, 0].map(() => opts.v0 / r);
    const out: TyreLongForce = { fx: 0, dFxdOmega: 0, dFxdV: 0 };
    let v = opts.v0;
    let x = 0;
    const xs: number[] = [];
    const fs: number[] = [];
    for (let i = 0; i < Math.round(opts.seconds / dt); i++) {
      let sum = 0;
      for (let w = 0; w < 4; w++) {
        tyre.step(states[w]!, omega[w]!, r, v, fz, 1, dt, out);
        sum += out.fx;
        const torque = w >= 2 ? opts.driveNm : 0;
        let next = omega[w]! + (dt * (torque - r * out.fx)) / (J + dt * r * out.dFxdOmega);
        if (opts.handbrake && w >= 2) {
          // Static friction of the brake: it holds the wheel still when it can stop it within the step.
          const capNm = 1500;
          next = Math.abs((J * next) / dt) <= capNm ? 0 : next - (Math.sign(next) * capNm * dt) / J;
        }
        omega[w] = next;
      }
      v += (dt * (sum - m * G * Math.sin(th))) / m;
      x += v * dt;
      xs.push(x);
      fs.push(sum);
    }
    return { xs, fs, v };
  }

  it('holds a car with the handbrake on a 10 % slope for 10 s, and a free car on the level does not creep', () => {
    const slope = drive({ slope: 0.1, handbrake: true, driveNm: 0, v0: 0, seconds: 11 });
    const settled = slope.xs[Math.round(1 / dt)]!;
    // It settles on the carcass deflection of the two braked tyres, a few millimetres, then stays.
    expect(Math.abs(settled)).toBeLessThan(0.01);
    expect(Math.abs(slope.xs.at(-1)! - settled)).toBeLessThan(0.001);
    // On the level a parked tyre makes no force: the files' zero-slip shifts need rolling (lowSpeedShare).
    const level = drive({ slope: 0, handbrake: false, driveNm: 0, v0: 0, seconds: 10 });
    expect(level.xs.at(-1)).toBe(0);
  });

  it('pulls away from standstill without NaN and creeps at 0.5 m/s without shaking', () => {
    const launch = drive({ slope: 0, handbrake: false, driveNm: 500, v0: 0, seconds: 1.5 });
    expect(launch.fs.every(Number.isFinite)).toBe(true);
    expect(launch.v).toBeGreaterThan(2);
    // Creep up a 2 % slope at 0.5 m/s with the drive torque that balances it.
    const m = 1500;
    const hold = ((m * G * Math.sin(Math.atan(0.02))) / 2) * 0.33;
    const creep = drive({ slope: 0.02, handbrake: false, driveNm: hold, v0: 0.5, seconds: 2 });
    const tail = creep.fs.slice(Math.round(0.2 / dt));
    const mean = tail.reduce((a, b) => a + b, 0) / tail.length;
    expect((Math.max(...tail) - Math.min(...tail)) / mean).toBeLessThan(0.01);
    expect(creep.v).toBeCloseTo(0.5, 3);
  });

  it('keeps no more deflection after a braked stop than the carcass spring holds at the friction limit', () => {
    // Four braked wheels held by static friction below 0.1 m/s, from 5 m/s. With the wheels locked the tyres slide to
    // the stop; once the car stands, the deflection springs it back. A carcass of K/σ holds the friction force D at
    // σ·D/K, so that is as far back as the car may come to rest, however hard it braked.
    const m = 1500;
    const r = 0.33;
    const fz = (m * G) / 4;
    const tyre = tyreAt('street', fz);
    const long = longitudinalOf(tyre);
    mfEval(tyre.set, 0, 0, 0, fz, 1, o);
    const limit = (sigmaKappa(tyre.set, fz) * longitudinalPeakN(tyre.set, fz)) / o.kx;
    for (const brakeNm of [800, 3000]) {
      const states = [{ u: 0 }, { u: 0 }, { u: 0 }, { u: 0 }];
      const omega = [5 / r, 5 / r, 5 / r, 5 / r];
      const out: TyreLongForce = { fx: 0, dFxdOmega: 0, dFxdV: 0 };
      let v = 5;
      let x = 0;
      let stop = NaN;
      for (let i = 0; i < Math.round(5 / dt); i++) {
        let sum = 0;
        for (let w = 0; w < 4; w++) {
          long.step(states[w]!, omega[w]!, r, v, fz, 1, dt, out);
          sum += out.fx;
          const next = omega[w]! - (dt * r * out.fx) / (1 + dt * r * out.dFxdOmega);
          omega[w] = Math.abs(next / dt) <= brakeNm ? 0 : next - Math.sign(next) * brakeNm * dt;
        }
        v += (dt * sum) / m;
        x += v * dt;
        if (Number.isNaN(stop) && v <= 0) stop = x;
      }
      expect(Math.abs(v), `${brakeNm} N·m`).toBeLessThan(1e-6);
      expect(stop - x, `${brakeNm} N·m`).toBeGreaterThan(0);
      expect(stop - x, `${brakeNm} N·m`).toBeLessThanOrEqual(limit * 1.001);
    }
  });

  it('drops all force and deflection when the wheel leaves the road', () => {
    const tyre = tyreAt('street', 4000);
    const s = newTyreState();
    const f = newTyreForces();
    stepTyre(tyre, 'left', s, 70, 0.33, 20, 1, 4000, 0, 1, dt, f);
    expect(s.uy).not.toBe(0);
    stepTyre(tyre, 'left', s, 70, 0.33, 20, 1, 0, 0, 1, dt, f);
    expect([s.ux, s.uy, f.fx, f.fy, f.mz]).toEqual([0, 0, 0, 0, 0]);
  });

  it('gives the drivetrain the same force as the full tyre at zero slip angle', () => {
    const tyre = tyreAt('street', 4000);
    const long = longitudinalOf(tyre);
    const ls = { u: 0 };
    const lf: TyreLongForce = { fx: 0, dFxdOmega: 0, dFxdV: 0 };
    const s = newTyreState();
    const f = newTyreForces();
    for (let i = 0; i < 300; i++) {
      const omega = 60 + 5 * Math.sin(i / 20);
      long.step(ls, omega, 0.33, 20, 4000, 0.8, dt, lf);
      stepTyre(tyre, 'left', s, omega, 0.33, 20, 0, 4000, 0, 0.8, dt, f);
      expect(lf.fx).toBe(f.fx);
      expect(lf.dFxdOmega).toBe(f.dFxdOmega);
    }
    // Its slope matches a finite difference of the step itself.
    const a = { u: ls.u };
    const b = { u: ls.u };
    const fa: TyreLongForce = { fx: 0, dFxdOmega: 0, dFxdV: 0 };
    const fb: TyreLongForce = { fx: 0, dFxdOmega: 0, dFxdV: 0 };
    long.step(a, 61, 0.33, 20, 4000, 1, dt, fa);
    long.step(b, 61.001, 0.33, 20, 4000, 1, dt, fb);
    expect((fb.fx - fa.fx) / 0.001 / fa.dFxdOmega).toBeCloseTo(1, 2);
  });
});
