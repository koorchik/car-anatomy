// Tremec TR-6060, gear set MZ6 (Corvette C6 Z51): a calibration record with no page. Its main pair 29/38 and first
// pair 19/43 are the only real tooth counts of a passenger-car manual we have (TTAC, research §2.4), so the derivation
// is tested on them and the designer calibrates its tooth bending on the first pair at the 580 N·m rating.
//
// Published: ratios 2.966 / 2.066 / 1.426 / 1.000 / 0.710 / 0.562, reverse 3.276, validated to 580 N·m (GM spec
// sheet, secondary); centre distance 85 mm (Tremec, primary). First-gear face width 30 mm and a helix "about 25°"
// are TTAC's (secondary, the helix an estimate by the author). Only the first-gear path is described: the other
// pairs' teeth are not published, and this record has no need to invent them. The main pair's module is ours.

import type { GearboxRecord } from '../../drivetrain/catalogue.ts';

export const TR6060_MZ6: GearboxRecord = {
  id: 'tr6060-mz6',
  name: 'Tremec TR-6060 MZ6',
  car: null,
  layout: {
    kind: 'layshaft',
    desc: {
      id: 'tr6060-mz6',
      centreMm: 85,
      pressureAngle: 20,
      counterHand: 'right',
      // 2.25 mm leaves a 27.5° helix at 85 mm; 2.5 mm on the first pair leaves 24.2°, TTAC's "about 25°".
      main: { teeth: [29, 38], module: 2.25, faceWidth: 26 },
      speeds: [{ teeth: [19, 43], module: 2.5, faceWidth: 30 }],
      reverse: null,
      sleeves: [{ id: '1-2', front: null, back: 1 }],
      sleeveWidth: 24,
      meshEfficiency: 0.99,
    },
  },
  published: { ratios: [2.966, 2.066, 1.426, 1.0, 0.71, 0.562], reverse: 3.276, ratedTorqueNm: 580, centreMm: 85 },
  sources: [
    'https://www.thetruthaboutcars.com/2014/07/saturation-dive-manual-transmission-gear-design/?print=1',
    'https://corvetteactioncenter.com/specs/c6/2008/2008tr6060.html',
    'https://web.archive.org/web/20240430101326/https://www.tremec.com/anexos/TREMEC_TR-6060_1017.pdf',
  ],
  unverified: ['main.module', 'main.faceWidth', 'speeds.module', 'counterHand'],
};
