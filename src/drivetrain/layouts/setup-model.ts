// What the settings panel of a gearbox page (owner decision A3) needs of a layout, so that one panel serves the
// layshaft page and the transaxle page: the setup of each layout is its own module (layshaft-setup.ts,
// transaxle-setup.ts), and this binds it to the page's factory box. No text here: the panel's words are the page's.

import {
  factorySetup,
  FINAL_DRIVE_RANGE,
  isFactory,
  pairHelix,
  RATIO_RANGE,
  sameBox,
  SETUP_SPEEDS,
  setFinalDrive,
  setSpeeds,
  setTeeth,
  setupDesc,
  speedRatios,
  stepTeeth,
  teethForRatio,
  type LayshaftSetup,
} from './layshaft-setup.ts';
import type { LayshaftDesc } from './layshaft.ts';
import {
  factoryTransaxleSetup,
  isFactoryTransaxle,
  sameTransaxle,
  setTransaxleFinal,
  setTransaxleSpeeds,
  setTransaxleTeeth,
  transaxleFinal,
  transaxleHelix,
  transaxleRatios,
  transaxleSetupDesc,
  transaxleStepTeeth,
  transaxleTeethForRatio,
  TRANSAXLE_FINAL_RANGE,
  TRANSAXLE_RATIO_RANGE,
  TRANSAXLE_SPEEDS,
  type TransaxleSetup,
} from './transaxle-setup.ts';
import type { TransaxleDesc } from './transaxle.ts';

/** One forward speed as the panel shows it. */
export interface SetupRow {
  /** The two gears of the speed's own pair; null for a direct speed. */
  teeth: readonly [number, number] | null;
  /** How the ratio comes from the teeth, as numbers ('45/23 × 38/20 ='). */
  formula: string;
  /** Helix angle of the pair, degrees; null for a direct speed. */
  helix: number | null;
}

export interface SetupModel<D, S> {
  readonly speedCounts: readonly number[];
  readonly ratioRange: readonly [number, number];
  readonly finalRange: readonly [number, number];
  /** The setup that changes nothing. */
  readonly factory: S;
  isFactory(setup: S): boolean;
  /** The description of the box as set. */
  desc(setup: S): D;
  /** Whether two setups give the same box, so a page need not rebuild it. */
  sameBox(a: S, b: S): boolean;
  speeds(setup: S): number;
  /** The final drive the figures use: the panel's (layshaft) or the teeth's (transaxle). */
  finalDrive(setup: S, desc: D): number;
  /** Each forward speed's ratio, the final drive left out: what the slider sets and the makers publish. */
  ratios(desc: D): number[];
  rows(desc: D): SetupRow[];
  centreMm(desc: D): number;
  teethForRatio(desc: D, index: number, ratio: number): [number, number] | null;
  stepTeeth(desc: D, index: number, which: 0 | 1, delta: 1 | -1): [number, number] | null;
  setTeeth(setup: S, index: number, teeth: readonly [number, number]): S;
  setSpeeds(setup: S, speeds: number): S;
  setFinalDrive(setup: S, ratio: number): S;
}

/** The layshaft page's panel: the constant-mesh pair stays, the final drive is the axle's. */
export function layshaftSetupModel(factory: LayshaftDesc, finalDrive: number): SetupModel<LayshaftDesc, LayshaftSetup> {
  return {
    speedCounts: SETUP_SPEEDS,
    ratioRange: RATIO_RANGE,
    finalRange: FINAL_DRIVE_RANGE,
    factory: factorySetup(factory, finalDrive),
    isFactory: (setup) => isFactory(factory, finalDrive, setup),
    desc: (setup) => setupDesc(factory, setup),
    sameBox,
    speeds: (setup) => setup.speeds,
    finalDrive: (setup) => setup.finalDrive,
    ratios: speedRatios,
    rows: (desc) => {
      const main = desc.main.teeth;
      return desc.speeds.map((speed) =>
        speed === 'direct'
          ? { teeth: null, formula: '', helix: null }
          : { teeth: speed.teeth, formula: `${main[1]}/${main[0]} × ${speed.teeth[1]}/${speed.teeth[0]} =`, helix: pairHelix(desc, speed, speed.teeth) },
      );
    },
    centreMm: (desc) => desc.centreMm,
    teethForRatio,
    stepTeeth,
    setTeeth: (setup, index, teeth) => setTeeth(factory, setup, index, teeth),
    setSpeeds,
    setFinalDrive,
  };
}

/** The transaxle page's panel: one pair per speed, and the final drive is a pair in the same case. */
export function transaxleSetupModel(factory: TransaxleDesc): SetupModel<TransaxleDesc, TransaxleSetup> {
  return {
    speedCounts: TRANSAXLE_SPEEDS,
    ratioRange: TRANSAXLE_RATIO_RANGE,
    finalRange: TRANSAXLE_FINAL_RANGE,
    factory: factoryTransaxleSetup(factory),
    isFactory: (setup) => isFactoryTransaxle(factory, setup),
    desc: (setup) => transaxleSetupDesc(factory, setup),
    sameBox: sameTransaxle,
    speeds: (setup) => setup.speeds,
    finalDrive: (_setup, desc) => transaxleFinal(desc),
    ratios: transaxleRatios,
    rows: (desc) => desc.speeds.map((s) => ({ teeth: s.teeth, formula: `${s.teeth[1]}/${s.teeth[0]} =`, helix: transaxleHelix(desc, s, s.teeth) })),
    centreMm: (desc) => desc.centreMm,
    teethForRatio: (desc, index, ratio) => transaxleTeethForRatio(desc, index, ratio, factory),
    stepTeeth: transaxleStepTeeth,
    setTeeth: (setup, index, teeth) => setTransaxleTeeth(factory, setup, index, teeth),
    setSpeeds: setTransaxleSpeeds,
    setFinalDrive: (setup, ratio) => setTransaxleFinal(factory, setup, ratio),
  };
}
