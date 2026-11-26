// ZF 8HP: four simple planetary sets, two brakes and three clutches, three of the five closed in every gear
// (research §10.2, from the raw text of the English Wikipedia article on the ZF 8HP, secondary). Every generation
// shares the joins and the shift matrix and differs only in its teeth:
// - joins S1 = S2, C1 = R4, R2 = S3, R3 = S4; the input is C2 (the turbine), the output C4;
// - brake A holds S1/S2, brake B holds R1, clutch C joins R3/S4 to the input, clutch D joins C3 to C4, clutch E
//   joins R2/S3 to R3/S4;
// - R ABD, 1 ABC, 2 ABE, 3 BCE, 4 BDE, 5 BCD, 6 CDE, 7 ACD, 8 ADE.
//
// The page shows the 8HP51 of the Toyota GR Supra A90 (automatic.ts, owner decision A2). The 8HP45, the 8HP70 and the
// 8HP50 here have no page: their teeth reproduce their published ratios, and the derivation is tested on all four.
//
// Ours, not published: the planet counts (the most the assembly condition (z_s + z_r)/n allows, up to five, with room
// for the carrier's posts between the planets: chosenPlanetCount in layouts/planetary.ts), the module, face widths,
// spur teeth, the sets' places along the axis and where each plate pack sits.

import type { GearboxRecord } from '../../drivetrain/catalogue.ts';
import type { PlanetaryDesc, PlanetarySetDesc } from '../../drivetrain/layouts/planetary.ts';

/** Sun and ring teeth of sets 1–4, and the planets per set. */
export type Zf8hpTeeth = [[number, number, number], [number, number, number], [number, number, number], [number, number, number]];

/** Module and face widths of every 8HP set here [estimate: a 96-tooth ring then spans 168 mm, inside a case of about 245 mm]. */
const MODULE = 1.75;
const FACE = [20, 20, 22, 26];
/** Middle of each set along the axis, mm behind the front face [estimate, room for the packs between them]. */
const SET_Z = [46, 86, 146, 210];

export const ZF8HP_GEARS: PlanetaryDesc['gears'] = [
  { name: 'R', closed: ['A', 'B', 'D'] },
  { name: '1', closed: ['A', 'B', 'C'] },
  { name: '2', closed: ['A', 'B', 'E'] },
  { name: '3', closed: ['B', 'C', 'E'] },
  { name: '4', closed: ['B', 'D', 'E'] },
  { name: '5', closed: ['B', 'C', 'D'] },
  { name: '6', closed: ['C', 'D', 'E'] },
  { name: '7', closed: ['A', 'C', 'D'] },
  { name: '8', closed: ['A', 'D', 'E'] },
];

/** The 8HP's description with these teeth. */
export function zf8hpDesc(id: string, teeth: Zf8hpTeeth): PlanetaryDesc {
  const sets: PlanetarySetDesc[] = teeth.map(([sun, ring, planets], i) => ({ sun, ring, planets, module: MODULE, faceWidth: FACE[i]!, z: SET_Z[i]! }));
  return {
    id,
    pressureAngle: 20,
    sets,
    couplings: [
      ['S1', 'S2'],
      ['C1', 'R4'],
      ['R2', 'S3'],
      ['R3', 'S4'],
    ],
    input: 'C2',
    output: 'C4',
    // Packs [estimate]: A at the front wall inside, B round ring 1, E between sets 2 and 3, C and D one inside the
    // other between sets 3 and 4.
    elements: [
      { id: 'A', kind: 'brake', a: 'S1', b: null, pack: { z: 16, rIn: 30, rOut: 48, plates: 4 } },
      { id: 'B', kind: 'brake', a: 'R1', b: null, pack: { z: 46, rIn: 98, rOut: 112, plates: 4 } },
      { id: 'C', kind: 'clutch', a: 'R3', b: 'C2', pack: { z: 178, rIn: 36, rOut: 52, plates: 5 } },
      { id: 'D', kind: 'clutch', a: 'C3', b: 'C4', pack: { z: 178, rIn: 62, rOut: 78, plates: 5 } },
      { id: 'E', kind: 'clutch', a: 'R2', b: 'R3', pack: { z: 116, rIn: 56, rOut: 72, plates: 4 } },
    ],
    gears: ZF8HP_GEARS,
    // Per tooth contact: a simple set's two meshes then lose as one stationary ratio with η₀ = 0.98, the upper value
    // of the Wikipedia article's efficiency table.
    meshEfficiency: Math.sqrt(0.98),
    caseRadius: 122,
  };
}

const record = (id: string, name: string, teeth: Zf8hpTeeth, ratios: number[], reverse: number, ratedTorqueNm: number | null): GearboxRecord => ({
  id,
  name,
  car: null,
  layout: { kind: 'planetary', desc: zf8hpDesc(id, teeth) },
  published: { ratios, reverse, ratedTorqueNm, centreMm: null },
  sources: ['https://en.wikipedia.org/w/index.php?title=ZF_8HP_transmission&action=raw'],
  unverified: ['published.ratios', 'published.reverse', 'teeth', 'planets', 'module', 'faceWidth', 'packs'],
});

/** First generation, 2010: the 450 N·m box. */
export const ZF_8HP45 = record('zf-8hp45', 'ZF 8HP45', [[48, 96, 4], [48, 96, 4], [60, 96, 4], [28, 104, 4]], [4.714, 3.143, 2.106, 1.667, 1.285, 1.0, 0.839, 0.667], 3.295, 450);
/** First generation, the 8HP55/65/70/90 set: only set 3 differs from the 8HP45 (and the reverse with it). */
export const ZF_8HP70 = record('zf-8hp70', 'ZF 8HP70', [[48, 96, 4], [48, 96, 4], [69, 111, 5], [28, 104, 4]], [4.714, 3.143, 2.106, 1.667, 1.285, 1.0, 0.839, 0.667], 3.317, 700);
/** Second generation, 2014: the 500 N·m box (BMW 530d G30 among others). */
export const ZF_8HP50 = record('zf-8hp50', 'ZF 8HP50', [[48, 96, 4], [54, 96, 5], [60, 96, 4], [24, 96, 4]], [5.0, 3.2, 2.143, 1.72, 1.314, 1.0, 0.822, 0.64], 3.456, 500);
