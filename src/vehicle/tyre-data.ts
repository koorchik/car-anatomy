// Tyre data shared by the whole site: the vertical data (stage 1a of the suspensions plan: stiffness, radius and width
// of the tyre files, and how static pressure changes the stiffness) and the Magic Formula PAC2002 sets that
// src/vehicle/tyre.ts evaluates (stage P2). No visitor-facing text here: names live in the UI and in src/data/.
//
// Source: Project Chrono vehicle data, BSD-3-Clause, https://github.com/projectchrono/chrono/tree/main/data/vehicle
//   sedan/tire/Sedan_Pac02Tire.tir (245/40 R18) and VW_microbus/json/mf_185_80R14.tir, read 2026-11-13.
//   Copyright (c) 2016, Project Chrono Development Team. All rights reserved. The licence text and both files sit in
//   tests/fixtures/chrono-tyres/, where tests/suspension-tyre.test.ts reads them to check every number below.

import type { TyreId } from './vehicle.ts';

/** The tyre choices of the site: the three of the lap plus a narrow tyre of the 1980s (TyreId has all four). */
export type TyreChoice = TyreId;

export type TyreFileId = 'sedan-pac02' | 'mf-185-80r14';

export interface TyreVertical {
  file: TyreFileId;
  /** Free radius, m (UNLOADED_RADIUS). */
  freeRadiusM: number;
  /** Nominal section width, m (WIDTH). */
  widthM: number;
  /** Rim radius, m (RIM_RADIUS). */
  rimRadiusM: number;
  /** Vertical stiffness at the nominal pressure, N/m (VERTICAL_STIFFNESS). */
  ktNm: number;
  /** Vertical damping, N·s/m. An estimate for every file, see TYRE_DAMPING_NSM. */
  ctNsm: number;
  /** Nominal cold gauge pressure, bar, and where it comes from. */
  nominalBar: number;
  nominalBarSource: 'file' | 'estimate';
}

/**
 * Vertical damping of the tyre. The files disagree 40-fold: 50 N·s/m in mf_185_80R14 and Continental, 500 in TNO,
 * 2000 in Sedan_Pac02Tire. 2000 would smear the invariant point of the quarter car, 50 moves it by a few per cent, so
 * every set takes 50 (estimate; docs/research/suspensions.md, 13.1).
 */
export const TYRE_DAMPING_NSM = 50;

export const TYRE_FILES: Record<TyreFileId, TyreVertical> = {
  'sedan-pac02': {
    file: 'sedan-pac02',
    freeRadiusM: 0.344,
    widthM: 0.245,
    rimRadiusM: 0.2286,
    ktNm: 280835.2941,
    ctNsm: TYRE_DAMPING_NSM,
    // The file gives no pressure. 2.3 bar is NOMPRES of the Continental 225/50 R18 file, a tyre of nearly the same
    // radius (0.341 m): order of magnitude only.
    nominalBar: 2.3,
    nominalBarSource: 'estimate',
  },
  'mf-185-80r14': {
    file: 'mf-185-80r14',
    // As in the file. The size itself gives 0.326 m (rim 0.1778 + 0.185 · 0.8); cars with a known size pass their own.
    freeRadiusM: 0.376,
    widthM: 0.185,
    rimRadiusM: 0.1778,
    ktNm: 175000,
    ctNsm: TYRE_DAMPING_NSM,
    // "Infl. pressure (Pa) 190000" in the file's header.
    nominalBar: 1.9,
    nominalBarSource: 'file',
  },
};

/** The file each tyre choice takes its vertical data from. Semi-slicks and slicks are illustrative variants of the
 *  sedan set, so they share its carcass. */
export const TYRE_VERTICAL: Record<TyreChoice, TyreFileId> = {
  street: 'sedan-pac02',
  semi: 'sedan-pac02',
  slick: 'sedan-pac02',
  classic: 'mf-185-80r14',
};

export const tyreVertical = (choice: TyreChoice): TyreVertical => TYRE_FILES[TYRE_VERTICAL[choice]];

/**
 * How much 1 % more pressure stiffens the tyre, in per cent: k_t = k_t0·(1 + s·(p − p0)/p0). Linear estimate in the
 * form of MF 6.2 (PFZ1 is 0.71 in the TNO 205/60 R15 file and 0.85 in the Continental 225/50 R18 file; order of
 * magnitude only, those files are not ours to ship).
 */
export const PRESSURE_KT_SLOPE = 0.8;

/** Vertical stiffness at a cold gauge pressure, N/m. Pressure changes nothing else (suspensions plan, the tyre). */
export function verticalStiffness(tyre: TyreVertical, pressureBar: number): number {
  return tyre.ktNm * (1 + PRESSURE_KT_SLOPE * (pressureBar - tyre.nominalBar) / tyre.nominalBar);
}

/** Contact patch length of a tyre pressed by `deflectionM`: the chord of the free circle, ℓ ≈ 2·√(2·r·δ). */
export function patchLengthM(freeRadiusM: number, deflectionM: number): number {
  const d = Math.max(0, deflectionM);
  return 2 * Math.sqrt(Math.max(0, 2 * freeRadiusM * d - d * d));
}

// ---------------------------------------------------------------------------------------------------------------------
// Magic Formula PAC2002 sets. Names and values as in the .tir files (SI: m, N, rad). A coefficient a file does not have
// is 0, as in Chrono, which reads a missing one as 0. Scaling factors other than LFZO, LMUX and LMUY are 1 in both
// files and are left out; the three that are here are what tyre.ts fits to a car (tyreAt, tyreFor). Rolling resistance
// (QSY*), overturning moment (QSX*), the belt and the effective rolling radius are not used.

/** One PAC2002 coefficient set. Equations, signs and what each group does: src/vehicle/tyre.ts. */
export interface MfSet {
  /** Nominal load, N, and free radius, m. */
  FNOMIN: number;
  UNLOADED_RADIUS: number;
  /** Scale of the nominal load (F'z0 = LFZO·FNOMIN) and of the peak friction along and across. */
  LFZO: number;
  LMUX: number;
  LMUY: number;
  // Longitudinal: shape, peak, curvature, slip stiffness, shifts, relaxation.
  PCX1: number; PDX1: number; PDX2: number; PDX3: number; PEX1: number; PEX2: number; PEX3: number; PEX4: number;
  PKX1: number; PKX2: number; PKX3: number; PHX1: number; PHX2: number; PVX1: number; PVX2: number;
  PTX1: number; PTX2: number; PTX3: number;
  // Lateral, with the camber terms PDY3, PEY3/PEY4, PKY3, PHY3, PVY3/PVY4.
  PCY1: number; PDY1: number; PDY2: number; PDY3: number; PEY1: number; PEY2: number; PEY3: number; PEY4: number;
  PKY1: number; PKY2: number; PKY3: number; PHY1: number; PHY2: number; PHY3: number;
  PVY1: number; PVY2: number; PVY3: number; PVY4: number; PTY1: number; PTY2: number;
  // Combined slip: the weighting functions and the slip-induced side force.
  RBX1: number; RBX2: number; RCX1: number; REX1: number; REX2: number; RHX1: number;
  RBY1: number; RBY2: number; RBY3: number; RCY1: number; REY1: number; REY2: number; RHY1: number; RHY2: number;
  RVY1: number; RVY2: number; RVY3: number; RVY4: number; RVY5: number; RVY6: number;
  // Aligning moment: pneumatic trail, residual moment, and the arm of Fx under combined slip.
  QBZ1: number; QBZ2: number; QBZ3: number; QBZ4: number; QBZ5: number; QBZ9: number; QBZ10: number; QCZ1: number;
  QDZ1: number; QDZ2: number; QDZ3: number; QDZ4: number; QDZ6: number; QDZ7: number; QDZ8: number; QDZ9: number;
  QEZ1: number; QEZ2: number; QEZ3: number; QEZ4: number; QEZ5: number;
  QHZ1: number; QHZ2: number; QHZ3: number; QHZ4: number; SSZ1: number; SSZ2: number; SSZ3: number; SSZ4: number;
}

/** The combined-slip coefficients of a set. */
export type MfCombined = Pick<MfSet,
  'RBX1' | 'RBX2' | 'RCX1' | 'REX1' | 'REX2' | 'RHX1' | 'RBY1' | 'RBY2' | 'RBY3' | 'RCY1' | 'REY1' | 'REY2' | 'RHY1' |
  'RHY2' | 'RVY1' | 'RVY2' | 'RVY3' | 'RVY4' | 'RVY5' | 'RVY6'>;

/** mf_185_80R14.tir as published: 185/80 R14, 1.9 bar, dry, tested at 16.7 m/s. */
export const MF_185_80R14: MfSet = {
  FNOMIN: 3800, UNLOADED_RADIUS: 0.376, LFZO: 1, LMUX: 1, LMUY: 1,
  PCX1: 1.5587, PDX1: 1.09, PDX2: -0.079328, PDX3: 9.9376e-6, PEX1: 0.27403, PEX2: 0.10232, PEX3: 0.074903,
  PEX4: -0.00026944, PKX1: 19.733, PKX2: 0.093405, PKX3: 0.12433, PHX1: -0.001779, PHX2: 0.00021808,
  PVX1: -9.9052e-6, PVX2: -2.8568e-5, PTX1: 1.9021, PTX2: -0.0014739, PTX3: 0.03631,
  PCY1: 1.4675, PDY1: 0.94002, PDY2: -0.17669, PDY3: -0.69602, PEY1: 0.0040023, PEY2: 0.00085719, PEY3: 41.465,
  PEY4: 665.25, PKY1: -12.536, PKY2: 1.3856, PKY3: -0.93342, PHY1: 0.0024749, PHY2: 0.0037538, PHY3: 0.037561,
  PVY1: 0.031255, PVY2: -0.0017359, PVY3: -0.38166, PVY4: -0.033117, PTY1: 1.8473, PTY2: 1.9465,
  RBX1: 14.927, RBX2: -10.534, RCX1: 1.1288, REX1: 0.62334, REX2: -0.0039079, RHX1: 0.001683,
  RBY1: 5.5228, RBY2: 2.7966, RBY3: 0.08688, RCY1: 1.0783, REY1: 0.055543, REY2: -0.0022958, RHY1: -0.0027141,
  RHY2: -0.00098972, RVY1: 0.0076305, RVY2: -0.09933, RVY3: 0.16991, RVY4: -9.6324e-5, RVY5: 1.9, RVY6: 0,
  QBZ1: 9.2824, QBZ2: -2.6095, QBZ3: -0.86548, QBZ4: -0.16332, QBZ5: -0.35511, QBZ9: 13.946, QBZ10: 0, QCZ1: 1.1119,
  QDZ1: 0.14332, QDZ2: -0.0062385, QDZ3: -0.43424, QDZ4: -8.1598, QDZ6: -0.0073867, QDZ7: 0.0016767,
  QDZ8: -0.17212, QDZ9: -0.033444, QEZ1: -2.9203, QEZ2: -0.91079, QEZ3: 0, QEZ4: 0.32935, QEZ5: -1.9083,
  QHZ1: 0.0019422, QHZ2: 0.0034645, QHZ3: 0.14727, QHZ4: -0.035133,
  SSZ1: 0.026243, SSZ2: -0.013391, SSZ3: 0.3923, SSZ4: -0.16022,
};

const combinedOf = (s: MfSet): MfCombined => ({
  RBX1: s.RBX1, RBX2: s.RBX2, RCX1: s.RCX1, REX1: s.REX1, REX2: s.REX2, RHX1: s.RHX1,
  RBY1: s.RBY1, RBY2: s.RBY2, RBY3: s.RBY3, RCY1: s.RCY1, REY1: s.REY1, REY2: s.REY2, RHY1: s.RHY1, RHY2: s.RHY2,
  RVY1: s.RVY1, RVY2: s.RVY2, RVY3: s.RVY3, RVY4: s.RVY4, RVY5: s.RVY5, RVY6: s.RVY6,
});

/**
 * Sedan_Pac02Tire.tir: 245/40 R18, PAC2002 with camber terms, measured as a left tyre. The file has no combined-slip
 * coefficients, so they come from mf_185_80R14 (also Chrono, BSD-3-Clause); without them the weighting functions would
 * be undefined. tyreAt (tyre.ts) rescales their slip scales to the tyre they are put on. It has no PDX3, QBZ10 or
 * SSZ*, which stay 0 as in Chrono. LFZO 0.81 is the file's: its nominal load is 3929 N, not FNOMIN.
 */
export const SEDAN_PAC02: MfSet = {
  FNOMIN: 4850, UNLOADED_RADIUS: 0.344, LFZO: 0.81, LMUX: 1, LMUY: 1,
  PCX1: 1.6411, PDX1: 1.1739, PDX2: -0.16395, PDX3: 0, PEX1: 0.46403, PEX2: 0.25022, PEX3: 0.067842,
  PEX4: -3.7604e-5, PKX1: 22.303, PKX2: 0.48896, PKX3: 0.21253, PHX1: 0.0012297, PHX2: 0.0004318,
  PVX1: -8.8098e-6, PVX2: 1.862e-5, PTX1: 2.3657, PTX2: 1.4112, PTX3: 0.56626,
  PCY1: 1.3507, PDY1: 1.0489, PDY2: -0.18033, PDY3: -2.8821, PEY1: -0.0074722, PEY2: -0.0063208, PEY3: -9.9935,
  PEY4: -760.14, PKY1: -21.92, PKY2: 2.0012, PKY3: -0.024778, PHY1: 0.0026747, PHY2: 8.9094e-5, PHY3: 0.031415,
  PVY1: 0.037318, PVY2: -0.010049, PVY3: -0.32931, PVY4: -0.69553, PTY1: 2.1439, PTY2: 1.9829,
  ...combinedOf(MF_185_80R14),
  QBZ1: 10.904, QBZ2: -1.8412, QBZ3: -0.52041, QBZ4: 0.039211, QBZ5: 0.41511, QBZ9: 8.9846, QBZ10: 0, QCZ1: 1.2136,
  QDZ1: 0.093509, QDZ2: -0.0092183, QDZ3: -0.057061, QDZ4: 0.73954, QDZ6: -0.0067783, QDZ7: 0.0052254,
  QDZ8: -0.18175, QDZ9: 0.029952, QEZ1: -1.5697, QEZ2: 0.33394, QEZ3: 0, QEZ4: 0.26711, QEZ5: -3.594,
  QHZ1: 0.0047326, QHZ2: 0.0026687, QHZ3: 0.11998, QHZ4: 0.059083,
  SSZ1: 0, SSZ2: 0, SSZ3: 0, SSZ4: 0,
};

/**
 * Longitudinal slip stiffness of the brush form, C_κ/F_z, per tyre (gearbox plan: 22 street, 26 semi-slick, 30 slick,
 * from the .tir files of the suspension research; classic 20 from PKX1 19.7 of mf_185_80R14). The semi-slick and slick
 * MF sets below scale PKX1 to the same ratios, so the brush form and the MF are one tyre for every choice.
 */
export const BRUSH_SLIP_STIFFNESS: Record<TyreId, number> = { classic: 20, street: 22, semi: 26, slick: 30 };

/**
 * Peak friction of each choice, the same along and across (TYRES in vehicle.ts says where the numbers come from). Here
 * as plain data so that the tyre step, which the audio worklet runs, loads no names.
 */
export const TYRE_MU: Record<TyreId, number> = { classic: 0.8, street: 1.0, semi: 1.25, slick: 1.6 };

/**
 * The MF set of each tyre choice, before it is fitted to a car (tyre.ts sets LFZO, LMUX and LMUY from the car's load
 * and the lap's μ). Street and classic are the Chrono files. Semi-slick and slick are illustrative variants of the
 * street set (suspensions plan, the tyre section): the semi-slick 30 % more cornering stiffness, so it peaks at a smaller slip
 * angle; the slick twice the fall of μ with load (PDY2, PDX2) and twice the cornering stiffness, so it too peaks earlier
 * than the street tyre (research §4.1: 6–10° on road tyres, about 3° in F1). Slip stiffness along the road follows
 * BRUSH_SLIP_STIFFNESS. Our estimates, not tyre data.
 */
export const TYRE_SETS: Record<TyreId, MfSet> = {
  classic: MF_185_80R14,
  street: SEDAN_PAC02,
  semi: {
    ...SEDAN_PAC02,
    PKY1: SEDAN_PAC02.PKY1 * 1.3,
    PKX1: (SEDAN_PAC02.PKX1 * BRUSH_SLIP_STIFFNESS.semi) / BRUSH_SLIP_STIFFNESS.street,
  },
  slick: {
    ...SEDAN_PAC02,
    PDY2: SEDAN_PAC02.PDY2 * 2,
    PDX2: SEDAN_PAC02.PDX2 * 2,
    PKY1: SEDAN_PAC02.PKY1 * 2,
    PKX1: (SEDAN_PAC02.PKX1 * BRUSH_SLIP_STIFFNESS.slick) / BRUSH_SLIP_STIFFNESS.street,
  },
};
