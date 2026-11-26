// The designer's gearbox mass (gearbox plan, the designer's model: mass; stage K9b): the gears as steel discs on their
// reference circles times a fill share, the shafts as steel bars over the gear stack, and the case with its oil in
// proportion to a²·L. The one case constant is set so that a reconstruction of the Tremec TR-6060 MZ6 weighs the
// 66.3 kg with oil Tremec publishes (research §3.3); every other box's mass is an estimate from it.
// Plain maths: no DOM, no text.

import { TR6060_MZ6 } from '../data/gearboxes/tr6060-mz6.ts';
import { stackLength } from '../drivetrain/layouts/layshaft.ts';
import type { GearboxSpec } from '../drivetrain/spec.ts';
import { resolveGearboxDesign } from './constraints.ts';
import { DEFAULT_GEARBOX_DESIGN, type GearboxDesign } from './design.ts';
import { shaftRadius } from './teeth.ts';
import { designBuild } from './to-spec.ts';

const STEEL = 7850;
/** Share of a gear's reference disc that is metal: webs, bores and tooth gaps take the rest [estimate]. */
const GEAR_FILL = 0.6;
/** Tremec TR-6060 with oil, kg (Tremec, research §3.3). */
export const TR6060_MASS_KG = 66.3;

export interface MassFigures {
  gearsKg: number;
  shaftsKg: number;
  caseKg: number;
  totalKg: number;
  /** Gear stack from the front wall, mm: the L of the case. */
  lengthMm: number;
}

function parts(spec: GearboxSpec, centreMm: number): { gearsKg: number; shaftsKg: number; lengthMm: number; caseUnit: number } {
  let gears = 0;
  for (const g of spec.gears) {
    const d = (g.module * g.teeth) / Math.cos((g.helix * Math.PI) / 180) / 1000;
    gears += (Math.PI / 4) * d * d * (g.faceWidth / 1000) * STEEL * GEAR_FILL;
  }
  const lengthMm = stackLength(spec);
  const shafts = spec.kind === 'layshaft' ? 3 : 2;
  const r = shaftRadius(centreMm) / 1000;
  const shaftsKg = shafts * Math.PI * r * r * (lengthMm / 1000) * STEEL;
  return { gearsKg: gears, shaftsKg, lengthMm, caseUnit: (centreMm / 1000) ** 2 * (lengthMm / 1000) };
}

/**
 * The TR-6060 MZ6 as the designer would build it: its published ratios with the direct fourth, its 85 mm centre
 * distance, the real constant-mesh and first pairs, the other pairs picked at the first pair's helix.
 */
export function tr6060Design(): GearboxDesign {
  const desc = TR6060_MZ6.layout.kind === 'layshaft' ? TR6060_MZ6.layout.desc : null;
  if (!desc) throw new Error('TR-6060 is a layshaft box');
  const published = TR6060_MZ6.published.ratios;
  const first = desc.speeds[0];
  if (!first || first === 'direct') throw new Error('TR-6060 record has no first pair');
  const pair = (p: { teeth: [number, number]; module: number; faceWidth: number }) => ({ teeth: p.teeth, module: p.module, faceWidth: p.faceWidth, shift: [0, 0] as [number, number] });
  return resolveGearboxDesign({
    ...DEFAULT_GEARBOX_DESIGN,
    gears: published.length,
    firstRatio: published[0]!,
    topRatio: published[published.length - 1]!,
    directGear: published.indexOf(1) + 1,
    ratios: published.map((r, i) => (i === 0 || r === 1 ? null : r)),
    pairs: published.map((_, i) => (i === 0 ? pair(first) : null)),
    mainPair: pair(desc.main),
    reverseRatio: TR6060_MZ6.published.reverse ?? DEFAULT_GEARBOX_DESIGN.reverseRatio,
    module: desc.main.module,
    lowModule: first.module,
    mainModule: desc.main.module,
    faceWidth: desc.main.faceWidth,
    helix: 25,
    centreMm: desc.centreMm,
    cones: published.map(() => 1),
  });
}

let caseConstant: number | null = null;
/** Case and oil per a²·L, kg/m³, from the TR-6060. */
function caseK(): number {
  if (caseConstant === null) {
    const d = tr6060Design();
    const p = parts(designBuild(d).spec, d.centreMm);
    caseConstant = (TR6060_MASS_KG - p.gearsKg - p.shaftsKg) / p.caseUnit;
  }
  return caseConstant;
}

export function gearboxMass(d: GearboxDesign, spec = designBuild(d).spec): MassFigures {
  const p = parts(spec, d.centreMm);
  const caseKg = caseK() * p.caseUnit;
  return { gearsKg: p.gearsKg, shaftsKg: p.shaftsKg, caseKg, totalKg: p.gearsKg + p.shaftsKg + caseKg, lengthMm: p.lengthMm };
}
