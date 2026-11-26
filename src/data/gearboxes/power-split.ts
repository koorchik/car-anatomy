// Toyota's power-split transaxle of the third-generation Prius (XW30, 2009–2015), known as the P410: the one example
// of the type (owner decision A2). Stage K15a gives the core and the car its numbers; the page `power-split` with its
// article, its English text and the verify note comes with stage K15b, so the record has no page yet.
//
// What is published:
// - every tooth count: power-split set ring 78, planets 23, sun 30, four planets; MG2's reduction set ring 58,
//   planets 18, sun 22, five planets, its carrier fixed to the case; counter gears 54 → 55; final drive 24 → 77; the
//   reduction 2.636 and the ring-to-differential ratio (77/24)(55/54) = 3.27: ORNL/TM-2010/253, Table 2.6 (primary,
//   a teardown);
// - the differential ratio 3.267 (Toyota GB's 2009 launch pack, primary), which the teeth give as 3.2677;
// - MG2: 60 kW, 207 N·m, 13 500 rpm (ORNL Table 2.1 and Toyota); MG1: 42 kW (ORNL, Toyota); the rotors' masses and
//   diameters (ORNL Tables 2.7 and 2.9), from which the inertias here are a thick cylinder's.
//
// Ours: the modules, helix angles and face widths, the sun's profile shift (30 + 2·23 = 76, not 78, so the sun must be
// shifted for all three to run on one carrier: research §2.2), the sets' places along the axis and where the counter
// shaft and the differential stand. MG1's torque and speed limits are not published for this generation: its torque is
// taken as what holds the engine at its peak (30/108 of 142 N·m) with a fifth in hand, its speed as 10 000 rpm.

import type { GearboxRecord } from '../../drivetrain/catalogue.ts';

export const TOYOTA_P410: GearboxRecord = {
  id: 'power-split',
  name: 'Toyota P410',
  car: null,
  layout: {
    kind: 'power-split',
    desc: {
      id: 'power-split',
      pressureAngle: 20,
      split: { sun: 30, planet: 23, ring: 78, planets: 4, module: 1.5, helix: 20, faceWidth: 18, z: 50 },
      reduction: { sun: 22, planet: 18, ring: 58, planets: 5, module: 1.5, helix: 20, faceWidth: 18, z: 120 },
      counter: { teeth: [54, 55], module: 2.5, helix: 25, faceWidth: 24, z: 85 },
      final: { teeth: [24, 77], module: 3, helix: 22, faceWidth: 32, z: 40 },
      counterDirection: 110,
      diffDirection: 170,
      // Rotor inertias: ½·m·(r_o² + r_i²) of ORNL's 3.93 kg, 151.3/90 mm generator rotor and 6.7 kg, 160.4/51 mm motor rotor.
      mg1: { id: 'MG1', maxNm: 48, maxKw: 42, maxRpm: 10000, rotorInertia: 0.0152 },
      mg2: { id: 'MG2', maxNm: 207, maxKw: 60, maxRpm: 13500, rotorInertia: 0.0237 },
      meshEfficiency: 0.99,
    },
  },
  published: { ratios: [], reverse: null, ratedTorqueNm: null, centreMm: null, finalDrive: 3.267 },
  sources: [
    'https://info.ornl.gov/sites/publications/Files/Pub26762.pdf',
    'https://media.toyota.co.uk/wp-content/uploads/sites/5/pdf/Prius-gen3-UK-launch-pack-2009.pdf',
    'https://web.archive.org/web/20101226001731/http://pressroom.toyota.com/pr/tms/toyota/document/10_Prius_Product_Info_final.pdf',
  ],
  unverified: ['name', 'module', 'helix', 'faceWidth', 'shift', 'z', 'counterDirection', 'diffDirection', 'mg1.maxNm', 'mg1.maxRpm', 'rotorInertia'],
};
