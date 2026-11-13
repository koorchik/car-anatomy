// Published figures of the real engines, at factory tune. They are approximate public numbers,
// here only to keep the model honest: it must land near them with one set of global constants.
export const REAL_FIGURES: Record<string, { hp: number; hpRpm: number; nm: number; nmRpm: number }> = {
  i1: { hp: 27, hpRpm: 5250, nm: 41, nmRpm: 4000 },
  i2: { hp: 85, hpRpm: 5500, nm: 145, nmRpm: 1900 },
  b2: { hp: 29, hpRpm: 5750, nm: 39, nmRpm: 3500 },
  v2: { hp: 90, hpRpm: 5000, nm: 150, nmRpm: 3250 },
  i3: { hp: 272, hpRpm: 6500, nm: 370, nmRpm: 3000 },
  i4: { hp: 215, hpRpm: 8000, nm: 202, nmRpm: 7000 },
  i4d: { hp: 130, hpRpm: 4000, nm: 310, nmRpm: 1900 },
  b4: { hp: 300, hpRpm: 6000, nm: 407, nmRpm: 4000 },
  i5: { hp: 400, hpRpm: 6500, nm: 480, nmRpm: 2500 },
  i6: { hp: 320, hpRpm: 5600, nm: 441, nmRpm: 4000 },
  i6d: { hp: 215, hpRpm: 2500, nm: 597, nmRpm: 1600 },
  'v6-60': { hp: 287, hpRpm: 6200, nm: 363, nmRpm: 4800 },
  'v6-90': { hp: 155, hpRpm: 4400, nm: 305, nmRpm: 2400 },
  vr6: { hp: 250, hpRpm: 6300, nm: 320, nmRpm: 2800 },
  b6: { hp: 500, hpRpm: 8250, nm: 460, nmRpm: 6000 },
  i8: { hp: 265, hpRpm: 4200, nm: 500, nmRpm: 2000 },
  'v8-cross': { hp: 430, hpRpm: 5900, nm: 575, nmRpm: 4600 },
  'v8-flat': { hp: 570, hpRpm: 9000, nm: 540, nmRpm: 6000 },
  v10: { hp: 560, hpRpm: 8700, nm: 480, nmRpm: 6800 },
  v12: { hp: 627, hpRpm: 7400, nm: 650, nmRpm: 5600 },
  f12: { hp: 390, hpRpm: 6300, nm: 490, nmRpm: 4500 },
  w12: { hp: 560, hpRpm: 6100, nm: 650, nmRpm: 1600 },
  w16: { hp: 1001, hpRpm: 6000, nm: 1250, nmRpm: 3000 },
  r2: { hp: 280, hpRpm: 6500, nm: 314, nmRpm: 5000 },
  r4: { hp: 700, hpRpm: 9000, nm: 608, nmRpm: 6500 },
};


/**
 * Bands the valve gear model must land in, from what manufacturers publish. The knock cases are engines that
 * run a high compression on ordinary fuel thanks to the cam; the savings are claims over a whole test cycle,
 * so the single cruise point may fall anywhere from a fraction of them up to them.
 */
export const REAL_VALVETRAIN = {
  // Toyota 2ZR-FXE (Prius): 80.5 x 88.3 mm, 13 : 1, very late intake close, on regular fuel.
  atkinson: { design: { bore: 80.5, stroke: 88.3, rodLength: 145, compression: 13, fuel: 'ai92', intakeValve: 31, exhaustValve: 26, lift: 9, rpmLimit: 5600 }, maxRetard: 8 },
  // Mazda Skyactiv-G 2.0 for the US: 83.5 x 91.2 mm, 13 : 1 on regular, twin phasers and a 4-2-1 exhaust.
  skyactiv: { design: { bore: 83.5, stroke: 91.2, rodLength: 150, compression: 13, fuel: 'ai92', rpmLimit: 6500, headerLength: 900 }, maxRetard: 12 },
  // VW EA211 evo 1.5 TSI: 74.5 x 85.9 mm, 12.5 : 1 with an early intake close under boost.
  miller: { design: { bore: 74.5, stroke: 85.9, rodLength: 140, compression: 12.5, fuel: 'ai95', charger: 'turbo', boostBar: 1, turboSizeHp: 170, intercooler: 0.8, directInjection: true, intakeDuration: 180, lobeSeparation: 96, intakeValve: 28, exhaustValve: 24, lift: 8.5, rpmLimit: 6200 } },
  savings: {
    // GM AFM: 5.5-7.5 % in the EPA cycle.
    afm: [0.03, 0.12],
    // Ford Ti-VCT: up to 4.5 % (NRC 2015, appendix H).
    phasers: [0, 0.045],
    // BMW Valvetronic and Fiat MultiAir: about 10 % (NRC 2015, appendix I).
    liftControl: [0.02, 0.12],
  },
} as const;
