// Tyre data shared by the whole site. So far the vertical data only (stage 1a of the suspensions plan): stiffness,
// radius and width of the tyre files, and how static pressure changes the stiffness. The Magic Formula sets join this
// file with the tyre stage. No visitor-facing text here: names live in the UI and in src/data/.
//
// Source: Project Chrono vehicle data, BSD-3-Clause, https://github.com/projectchrono/chrono/tree/main/data/vehicle
//   sedan/tire/Sedan_Pac02Tire.tir (245/40 R18) and VW_microbus/json/mf_185_80R14.tir, read 2026-11-13.

import type { TyreId } from './vehicle.ts';

/** The tyre choices of the site: the three of the lap plus a narrow tyre of the 1980s. */
export type TyreChoice = TyreId | 'classic';

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
