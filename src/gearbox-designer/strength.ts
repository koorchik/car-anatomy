// Tooth strength of a gearbox (gearbox plan, the designer's model: strength; stage K9b): root bending and flank
// contact of every loaded cylindrical mesh in every forward gear, at the engine's peak torque at the input.
//
// - The tangential force comes from the core's power path (topology.ts: F_t = 2λ/m_t per N·m at the input), so it is
//   the force the solver puts through that mesh. On a layshaft box it grows with the constant-mesh ratio and the pair's
//   own ratio and falls with the centre distance, as the plan's F_t = T_in·i_main·(1 + u)/a says.
// - Bending: σ_F = F_t/(b·m_n)·Y_FS(z_n)·Y_β with Y_FS ≈ 3.47 + 13.2/z_n [estimate, to check with ISO 6336-3],
//   z_n = z/cos³β and Y_β = max(0.75, 1 − ε_β·β/120°), on both gears of the mesh; the weaker counts.
// - Contact: σ_H = Z_E·Z_H·Z_ε·Z_β·√(F_t/(d₁·b)·(u + 1)/u) on the smaller gear's reference circle, Z_E = 189.8 √MPa
//   (steel on steel), Z_H, Z_ε and Z_β = √cos β as in ISO 6336-2 [textbook].
// - One bending constant: the first pair 19/43 of the Tremec TR-6060 MZ6 (the only real tooth counts of a passenger
//   car manual we have, src/data/gearboxes/tr6060-mz6.ts) loads 1.0 at its 580 N·m rating. The formula gives about
//   1170 MPa there (research §2.5): the finite-life limit of case-hardened steel, not a fudge to 1. Its life factor
//   over σ_FE = 2σ_Flim ≈ 1000 MPa [textbook, unverified] carries over to the contact limit σ_Hlim ≈ 1500 MPa
//   [unverified], so the MZ6 pair's contact load at its rating only checks the order (scripts/gearbox-table.ts).
// - Past 1.0 a gear lasts N = N₁·load^−8.7 full-throttle starts [exponent: estimate, gearbox plan], N₁ from TTAC's
//   estimate that the MZ6's first gear lasts about 12 000 starts behind 450 lb-ft (secondary, the author's estimate).
//
// A transaxle's final drive is left out: a crown wheel is judged by other rules (ISO 10300), and in the low gears the
// tyres, not the engine, cap its torque (the Civic's helical pair would load 2 at the engine's peak through first,
// which no Civic shows). Reverse is left out too.
// Plain maths: no DOM, no text.

import { TR6060_MZ6 } from '../data/gearboxes/tr6060-mz6.ts';
import { gearboxSpec } from '../drivetrain/catalogue.ts';
import type { PairGeometry } from '../drivetrain/gear-geometry.ts';
import { buildGearbox, type Gearbox, type MeshInfo } from '../drivetrain/topology.ts';

/** Elasticity factor of steel on steel, √MPa. */
const Z_E = 189.8;
/** σ_FE = 2σ_Flim of good case-hardened gear steel, MPa [textbook, research §2.5, unverified]. */
export const REFERENCE_BENDING_MPA = 1000;
/** σ_Hlim of case-hardened steel, MPa [research §2.5 via the plan, unverified]. */
export const REFERENCE_CONTACT_MPA = 1500;
/** Slope of the bending life curve: N ∝ load^−k [estimate, gearbox plan]. */
export const LIFE_EXPONENT = 8.7;
/** TTAC: the MZ6's first gear lasts about 12 000 full-throttle starts behind about 450 lb-ft (610 N·m). */
const LIFE_ANCHOR = { torqueNm: 450 * 1.3558179483, starts: 12000 };
/** The calibration pair's rated input torque, N·m (GM: validated to 428 lb-ft). */
export const CALIBRATION_TORQUE_NM = 580;

/** Strength of one mesh at a given input torque. */
export interface MeshStrength {
  /** Index in Gearbox.meshes. */
  mesh: number;
  /** Teeth of gear a and gear b of the mesh. */
  teeth: [number, number];
  forceN: number;
  bendingMpa: number;
  contactMpa: number;
  /** Over the calibrated limits: 1 is the MZ6 first pair at its rating. */
  bending: number;
  contact: number;
}

/** The forward gear's worst mesh by bending and by contact. */
export interface GearStrength {
  gear: number;
  meshes: MeshStrength[];
  bending: number;
  contact: number;
  /** The mesh with the highest bending load; null for a direct gear (nothing meshes under load). */
  weakest: MeshStrength | null;
}

const yFS = (zn: number): number => 3.47 + 13.2 / zn;

/** Root stress of the weaker gear of a pair under tangential force F, MPa (no calibration). */
export function bendingStress(g: PairGeometry, forceN: number): number {
  const beta = Math.abs(g.a.beta);
  const b = Math.min(g.a.faceWidth, g.b.faceWidth);
  const yBeta = Math.max(0.75, 1 - (g.epsBeta * beta) / ((120 * Math.PI) / 180));
  const cos3 = Math.cos(beta) ** 3;
  const y = Math.max(yFS(g.a.teeth / cos3), yFS(g.b.teeth / cos3));
  return (forceN / (b * g.a.module)) * y * yBeta;
}

/** Flank stress at the pitch point under tangential force F, MPa (no calibration). */
export function contactStress(g: PairGeometry, forceN: number): number {
  const beta = Math.abs(g.a.beta);
  const at = g.a.alphaT;
  const betaB = Math.atan(Math.tan(beta) * Math.cos(at));
  const zH = Math.sqrt((2 * Math.cos(betaB)) / (Math.cos(at) ** 2 * Math.tan(g.alphaWt)));
  const ea = g.epsAlpha;
  const eb = g.epsBeta;
  const zEps = eb >= 1 ? Math.sqrt(1 / ea) : Math.sqrt(((4 - ea) / 3) * (1 - eb) + eb / ea);
  const zBeta = Math.sqrt(Math.cos(beta));
  const small = g.a.teeth <= g.b.teeth ? g.a : g.b;
  const big = small === g.a ? g.b : g.a;
  const u = big.teeth / small.teeth;
  const b = Math.min(g.a.faceWidth, g.b.faceWidth);
  return Z_E * zH * zEps * zBeta * Math.sqrt((forceN / (2 * small.r * b)) * ((u + 1) / u));
}

/** Tangential force of every mesh in state `name` per N·m at the input, newtons (0 where it carries nothing). */
function meshForces(box: Gearbox, name: string): number[] {
  const s = box.states.find((x) => x.name === name);
  if (!s || !s.meshLoads) return [];
  return s.meshLoads.map((l, j) => (s.loaded.includes(j) ? Math.abs(l.force) : 0));
}

function rawMesh(m: MeshInfo, j: number, force: number) {
  return { mesh: j, teeth: [m.geometry.a.teeth, m.geometry.b.teeth] as [number, number], forceN: force, bendingMpa: bendingStress(m.geometry, force), contactMpa: contactStress(m.geometry, force) };
}

/** The calibration pair: the MZ6 record's first gear at its rating. */
function calibrationStresses(): { bending: number; contact: number } {
  const box = buildGearbox(gearboxSpec(TR6060_MZ6));
  const forces = meshForces(box, '1');
  // The speed pair 19/43, not the constant-mesh pair.
  const j = box.meshes.findIndex((m) => m.geometry.a.teeth === 19 && m.geometry.b.teeth === 43);
  const r = rawMesh(box.meshes[j]!, j, forces[j]! * CALIBRATION_TORQUE_NM);
  return { bending: r.bendingMpa, contact: r.contactMpa };
}

const CAL = calibrationStresses();
/** The one bending constant: the stress at which a tooth loads 1.0, MPa (about 1170, research §2.5). */
export const BENDING_LIMIT_MPA = CAL.bending;
/** The same life factor over the contact limit of case-hardened steel, MPa. */
export const CONTACT_LIMIT_MPA = REFERENCE_CONTACT_MPA * (BENDING_LIMIT_MPA / REFERENCE_BENDING_MPA);
/** The MZ6 first pair's contact load at its rating: a check of the order, 0.7–1.3 expected (gearbox plan). */
export const CALIBRATION_CONTACT_LOAD = CAL.contact / CONTACT_LIMIT_MPA;

/** Full-throttle starts a gear lasts at this bending load; Infinity at 1 or below. */
export function startsAt(load: number): number {
  if (!(load > 1)) return Infinity;
  const anchor = LIFE_ANCHOR.torqueNm / CALIBRATION_TORQUE_NM;
  return LIFE_ANCHOR.starts * (load / anchor) ** -LIFE_EXPONENT;
}

/** Load at which a gear lasts this many starts. */
export const loadForStarts = (starts: number): number => (LIFE_ANCHOR.torqueNm / CALIBRATION_TORQUE_NM) * (starts / LIFE_ANCHOR.starts) ** (-1 / LIFE_EXPONENT);

/** Strength of every loaded cylindrical mesh of state `name` at input torque T. */
export function stateStrength(box: Gearbox, name: string, torqueNm: number): MeshStrength[] {
  const forces = meshForces(box, name);
  const fd = box.spec.finalDrive;
  const out: MeshStrength[] = [];
  box.meshes.forEach((m, j) => {
    const f = forces[j] ?? 0;
    if (m.bevel || !(f > 0) || (fd && (m.a === fd.pinion || m.b === fd.pinion))) return;
    const r = rawMesh(m, j, f * torqueNm);
    out.push({ ...r, bending: r.bendingMpa / BENDING_LIMIT_MPA, contact: r.contactMpa / CONTACT_LIMIT_MPA });
  });
  return out;
}

/** Every forward gear's strength at input torque T (state names '1'…'n'). */
export function gearboxStrength(box: Gearbox, gears: number, torqueNm: number): GearStrength[] {
  return Array.from({ length: gears }, (_, i) => {
    const meshes = stateStrength(box, String(i + 1), torqueNm);
    const weakest = meshes.reduce<MeshStrength | null>((w, m) => (!w || m.bending > w.bending ? m : w), null);
    return { gear: i + 1, meshes, bending: weakest?.bending ?? 0, contact: Math.max(0, ...meshes.map((m) => m.contact)), weakest };
  });
}
