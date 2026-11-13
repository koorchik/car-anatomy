// A whole chassis built from its spec: both axles (chassis-axle.ts), where the four corners sit, the sprung body
// derived from the whole-car body, the static loads, and each corner's spring made for this car, so it stands at its
// design ride height on the tyres' static deflection. ChassisSim and statics.ts run on it. Conventions are at the top
// of kinematics.ts; the frame of the chassis is the CG frame of src/vehicle/car.ts: origin on the road under the whole
// car's centre of mass, x forward, y left, z up.
//
// The sprung body is the whole car of VehicleBody without the four unsprung corners, taken as point masses at the
// wheel centres at rest (their own spin inertia is left out): m_s = m − Σm_u, its centre of mass and its inertias
// about it by the parallel-axis theorem. NHTSA measures the whole car, so this is how the body equations get theirs
// (suspensions plan, the data types).

import type { ChassisAxleSpec, ChassisSpec, SprungBody } from './spec.ts';
import { ChassisAxle, newWheelSample, type WheelSample } from './chassis-axle.ts';
import { bumpStopForce, coilCompression, swayBarTorsionRate, G, type DamperCoeffs } from './forces.ts';
import { tyreVertical } from '../vehicle/tyre-data.ts';
import { CG_HEIGHT_ESTIMATE_M } from '../vehicle/car.ts';
import { bodyInertia, type BodyInertia } from '../vehicle/body-estimate.ts';

/** Corner order everywhere in the chassis: front left, front right, rear left, rear right. */
export const CORNERS = ['FL', 'FR', 'RL', 'RR'] as const;

export interface ChassisCorner {
  /** 0 front, 1 rear. */
  axle: 0 | 1;
  side: 'left' | 'right';
  /** Wheel centre at design relative to the whole car's centre of mass, m (y negative on the right). */
  x: number;
  y: number;
  unsprungKg: number;
  /** Tyre load and the load the suspension carries at rest, N. */
  staticN: number;
  sprungN: number;
  /** Wheel centre height at design (the axle's) and at rest on the tyre's static deflection, m. */
  designWheelZM: number;
  restWheelZM: number;
  spring: {
    rate: number;
    rate2: number;
    fromM: number;
    /** Free length that holds the car at design height, m, and the force along the spring at rest, N. */
    freeM: number;
    staticN: number;
  };
  damper: DamperCoeffs;
  /** Damper length where the bump stop touches and where the damper tops out, m. */
  bumpStop: { contactM: number; lengthM: number; rate: number };
  topOutM: number;
  tyre: { kt: number; ct: number; freeRadiusM: number };
}

export interface Chassis {
  spec: ChassisSpec;
  axles: readonly [ChassisAxle, ChassisAxle];
  corners: readonly [ChassisCorner, ChassisCorner, ChassisCorner, ChassisCorner];
  massKg: number;
  frontShare: number;
  /** Whole car's centre of mass height, m, and distances from it to the front and rear axles, m. */
  cgHeightM: number;
  a: number;
  b: number;
  wheelbaseM: number;
  /** Axle x positions in the CG frame: [a, −b]. */
  axleX: readonly [number, number];
  /** Tracks at design (between the contact points), m. */
  tracks: readonly [number, number];
  inertia: BodyInertia;
  sprung: SprungBody;
  /** Torsional rate of each axle's anti-roll bar (N·m/rad, 0 without one) and its arm, m. */
  bars: readonly [{ rate: number; armM: number }, { rate: number; armM: number }];
  /** Torsional rate of a twist beam (N·m/rad, 0 on other axles). */
  beamTorsion: readonly [number, number];
  /** Each axle's share of the lateral force in a steady turn (the front's is b/L, the static front share). */
  lateralShare: readonly [number, number];
  /** The body at rest relative to design: heave of the sprung centre of mass, pitch (nose down positive), and the
   *  wheel centres' heights above the road. Every corner sits at travel 0. */
  rest: { z: number; pitch: number; wheelZ: readonly [number, number, number, number] };
  /** Each corner's elastic support at rest (springs and stops through their motion ratios), N: the sprung load. */
  restSupportN: readonly [number, number, number, number];
}

function damperOf(axle: ChassisAxleSpec): DamperCoeffs {
  const d = axle.axle.damper;
  return { compression: d.compression, rebound: d.rebound, kneeMs: d.kneeMs, highRatio: d.highRatio };
}

/** Builds the chassis; throws if an axle cannot assemble or cannot hold its load. */
export function buildChassis(spec: ChassisSpec): Chassis {
  const body = spec.body;
  const m = body.massKg;
  const fs = body.frontShare;
  const L = body.wheelbaseM;
  if (!(m > 0 && fs > 0 && fs < 1 && L > 0)) throw new Error('The chassis needs a mass, a front share inside (0, 1) and a wheelbase');
  const a = L * (1 - fs);
  const b = L * fs;
  const h = body.cgHeightM ?? CG_HEIGHT_ESTIMATE_M;
  const axleSpecs = [spec.front, spec.rear] as const;
  const axles = [new ChassisAxle(spec.front.axle, spec.front.swayBar), new ChassisAxle(spec.rear.axle, spec.rear.swayBar)] as const;
  const axleX = [a, -b] as const;
  const tyreData = tyreVertical(spec.tyre);

  // Design samples of each axle.
  const sL = newWheelSample();
  const sR = newWheelSample();
  const corners: ChassisCorner[] = [];
  const restSupport: number[] = [];
  const tracks: number[] = [];
  for (const k of [0, 1] as const) {
    const ax = axles[k];
    const as = axleSpecs[k];
    const mu = as.unsprungKg;
    if (!(mu > 0)) throw new Error('Each corner needs an unsprung mass');
    ax.sample(0, 0, sL, sR);
    tracks.push(sL.contactY - sR.contactY);
    const share = k === 0 ? fs : 1 - fs;
    const staticN = (m * G * share) / 2;
    const sprungN = staticN - mu * G;
    if (!(sprungN > 0)) throw new Error('The unsprung corners weigh more than the axle carries');
    const kt = tyreData.ktNm;
    const freeRadiusM = as.tyreRadiusM ?? tyreData.freeRadiusM;
    const restWheelZM = freeRadiusM - staticN / kt;
    // Damper stops: contact a gap short of the design length, top-out at full droop.
    const bump = as.axle.bumpStop;
    const droop = -as.axle.travel.droopM;
    const top = [newWheelSample(), newWheelSample()];
    ax.sample(droop, droop, top[0], top[1]);
    const stops = [sL, sR].map((s, i) => ({ contactM: s.damperLen - bump.gapM, topOutM: top[i].damperLen }));
    // Stop forces at rest along each damper (none on a sane design), then the springs carry the rest: per side
    // F_L·mr_L + F_R·mrX_R = load_L and F_L·mrX_L + F_R·mr_R = load_R.
    const stopAt = (s: WheelSample, i: number): number => {
      const st = stops[i];
      if (s.damperLen < st.contactM) return bumpStopForce(st.contactM - s.damperLen, bump.rate, bump.lengthM);
      if (s.damperLen > st.topOutM) return -bumpStopForce(s.damperLen - st.topOutM, bump.rate, bump.lengthM);
      return 0;
    };
    const fStop = [stopAt(sL, 0), stopAt(sR, 1)];
    const loadL = sprungN - fStop[0] * sL.mrDamper - fStop[1] * sR.mrDamperCross;
    const loadR = sprungN - fStop[0] * sL.mrDamperCross - fStop[1] * sR.mrDamper;
    const det = sL.mrSpring * sR.mrSpring - sR.mrSpringCross * sL.mrSpringCross;
    const fL = (loadL * sR.mrSpring - sR.mrSpringCross * loadR) / det;
    const fR = (sL.mrSpring * loadR - sL.mrSpringCross * loadL) / det;
    const spring = as.axle.spring;
    const rate = spring.rate;
    const rate2 = spring.progressive ? spring.progressive.rate : rate;
    const fromM = spring.progressive ? spring.progressive.fromM : Infinity;
    for (const [i, s, f] of [[0, sL, fL], [1, sR, fR]] as const) {
      if (!(f > 0)) throw new Error('A spring of the chassis would have to pull to hold the car');
      corners.push({
        axle: k,
        side: i === 0 ? 'left' : 'right',
        x: axleX[k] + s.wheelX,
        y: s.wheelY,
        unsprungKg: mu,
        staticN,
        sprungN,
        designWheelZM: s.wheelZ,
        restWheelZM,
        spring: { rate, rate2, fromM, freeM: s.springLen + coilCompression(f, rate, rate2, fromM), staticN: f },
        damper: damperOf(as),
        bumpStop: { contactM: stops[i].contactM, lengthM: bump.lengthM, rate: bump.rate },
        topOutM: stops[i].topOutM,
        tyre: { kt, ct: tyreData.ctNsm, freeRadiusM },
      });
      restSupport.push(sprungN);
    }
  }

  // The sprung body: the whole car minus four point masses at the wheel centres at rest.
  const inertia = bodyInertia(body, m);
  const mu = corners.reduce((s, c) => s + c.unsprungKg, 0);
  const ms = m - mu;
  const cgX = -corners.reduce((s, c) => s + c.unsprungKg * c.x, 0) / ms;
  const hs = (m * h - corners.reduce((s, c) => s + c.unsprungKg * c.restWheelZM, 0)) / ms;
  let ixx = inertia.ixx - ms * (hs - h) ** 2;
  let iyy = inertia.iyy - ms * (cgX ** 2 + (hs - h) ** 2);
  let izz = inertia.izz - ms * cgX ** 2;
  for (const c of corners) {
    const dz = c.restWheelZM - h;
    ixx -= c.unsprungKg * (c.y ** 2 + dz ** 2);
    iyy -= c.unsprungKg * (c.x ** 2 + dz ** 2);
    izz -= c.unsprungKg * (c.x ** 2 + c.y ** 2);
  }
  if (!(ixx > 0 && iyy > 0 && izz > 0)) throw new Error('The unsprung corners take more inertia than the whole car has');
  const sprung: SprungBody = { massKg: ms, cgHeightM: hs, cgX, ixx, iyy, izz };

  // At rest every corner sits at travel 0: the body over each corner is where its wheel centre's rest height puts it.
  const zc = corners.map((c) => c.restWheelZM - c.designWheelZM);
  const zf = (zc[0] + zc[1]) / 2;
  const zr = (zc[2] + zc[3]) / 2;
  const pitch = (zr - zf) / L;
  const z = zf + (a - cgX) * pitch;

  const bar = (as: ChassisAxleSpec): { rate: number; armM: number } =>
    as.swayBar ? { rate: swayBarTorsionRate(as.swayBar.diameterM, as.swayBar.wallM, as.swayBar.spanM), armM: as.swayBar.armM } : { rate: 0, armM: 1 };
  const torsion = (as: ChassisAxleSpec): number => (as.axle.linkage.kind === 'twist-beam' ? as.axle.linkage.torsionNmPerRad : 0);

  return {
    spec,
    axles,
    corners: corners as unknown as Chassis['corners'],
    massKg: m,
    frontShare: fs,
    cgHeightM: h,
    a,
    b,
    wheelbaseM: L,
    axleX,
    tracks: [tracks[0], tracks[1]],
    inertia,
    sprung,
    bars: [bar(spec.front), bar(spec.rear)],
    beamTorsion: [torsion(spec.front), torsion(spec.rear)],
    lateralShare: [fs, 1 - fs],
    rest: { z, pitch, wheelZ: [corners[0].restWheelZM, corners[1].restWheelZM, corners[2].restWheelZM, corners[3].restWheelZM] },
    restSupportN: [restSupport[0], restSupport[1], restSupport[2], restSupport[3]],
  };
}
