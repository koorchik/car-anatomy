// What the table page does differently for each layout it shows: the layshaft box (manual-rwd, stage K1b) and the
// two-shaft transaxle with its final drive inside (manual-transaxle, stage K6a-geom). The section is one; it asks
// this for the box, the 3D model, the settings panel and its words, the article's figures and the dash's notes.

import type * as THREE from 'three';
import type { GearboxRecord } from '../../drivetrain/catalogue.ts';
import { layshaftSpec, type LayshaftDesc } from '../../drivetrain/layouts/layshaft.ts';
import { speedRatios } from '../../drivetrain/layouts/layshaft-setup.ts';
import { layshaftSetupModel, transaxleSetupModel, type SetupModel } from '../../drivetrain/layouts/setup-model.ts';
import { transaxleFinal, transaxleRatios } from '../../drivetrain/layouts/transaxle-setup.ts';
import { speedRatio, transaxleSpec, type TransaxleDesc } from '../../drivetrain/layouts/transaxle.ts';
import { buildGearbox, type Gearbox, type StateInfo } from '../../drivetrain/topology.ts';
import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import type { MeshQuality } from '../../scene/gearbox/gear-mesh.ts';
import { GearboxModel, type GearboxFrame } from '../../scene/gearbox/gearbox-model.ts';
import { TransaxleModel } from '../../scene/gearbox/transaxle-model.ts';
import type { SceneModel } from '../../scene/model-types.ts';
import type { SetupLabels } from './setup-panel.ts';

const num = (v: number, digits = 0): string => v.toLocaleString(numberLocale, { maximumFractionDigits: digits, minimumFractionDigits: digits });

/** A gearbox model on the table: what the section drives each frame, and the gear a demonstration lights. */
export type TableModel = SceneModel<GearboxFrame> & {
  gearMesh(id: string): THREE.Mesh | undefined;
  /** The teeth blurred by the members' speeds, rad/s, in real time; null sharp (a model without it stays sharp). */
  setBlur?(speeds: ArrayLike<number> | null): void;
};

/** The description a page's box is built from: the layout's own. */
export type TableDesc = LayshaftDesc | TransaxleDesc;

export interface TableLayout {
  readonly kind: 'layshaft' | 'transaxle';
  /** The page's heading. */
  readonly title: string;
  /** The factory box. */
  readonly factory: TableDesc;
  /** The final drive of the factory car: the axle's (layshaft) or the pair in the case (transaxle). */
  readonly finalDrive: number;
  /** Demonstration 1 (why the gears always turn) is told on the layshaft box's gears. */
  readonly demo: boolean;
  /** The final drive is a pair in this box's own case. */
  readonly finalInside: boolean;
  build(desc: TableDesc): Gearbox;
  model(box: Gearbox, quality: MeshQuality): TableModel;
  setup: SetupModel<TableDesc, unknown>;
  labels: SetupLabels;
  /** Each forward speed's ratio and reverse's, the final drive left out. */
  ratios(desc: TableDesc): number[];
  reverse(desc: TableDesc): number | null;
  /** Input over the shaft a speed's power leaves on (the output shaft, or the layshaft box's own output), and input over the differential where it is in the box. */
  shafts(box: Gearbox, state: StateInfo | undefined): { output: number | null; diff: number | null };
  /** The line under the dash's readouts. */
  note(box: Gearbox, state: StateInfo | undefined): string;
}

/** Overall reverse of a layshaft description, the magnitude. */
function layshaftReverse(desc: LayshaftDesc): number | null {
  const r = desc.reverse;
  return r ? (desc.main.teeth[1] / desc.main.teeth[0]) * (r.teeth[2] / r.teeth[0]) : null;
}

/** Reverse of a transaxle, the final drive left out: through one idler or a compound one. */
function transaxleReverse(desc: TransaxleDesc): number {
  const z = desc.reverse.teeth;
  return z.length === 3 ? z[2] / z[0] : (z[1] / z[0]) * (z[3] / z[2]);
}

function layshaftLayout(desc: LayshaftDesc, finalDrive: number): TableLayout {
  const main = desc.main.teeth;
  return {
    kind: 'layshaft',
    title: t('Механічна коробка з проміжним валом'),
    factory: desc,
    finalDrive,
    demo: true,
    finalInside: false,
    build: (d) => buildGearbox(layshaftSpec(d as LayshaftDesc)),
    model: (box, quality) => new GearboxModel(box, { quality }),
    setup: layshaftSetupModel(desc, finalDrive) as SetupModel<TableDesc, unknown>,
    labels: {
      note: (a) => t('Кожна пара лишається на тій самій міжосьовій {a} мм зі своїм модулем: змінюються лише зубці, а кут нахилу зубців підлаштовується. Зміни одразу видно в 3D, у числах і в таблиці.', { a: num(a) }),
      through: t('Головна пара {z1} → {z2}: {ratio}, постійно крутить проміжний вал', { z1: main[0], z2: main[1], ratio: num(main[1] / main[0], 3) }),
      gears: [t('шестерня проміжного вала'), t('шестерня передачі')],
      direct: t('пряма: муфта з’єднує первинний вал із вторинним'),
      reverse: (ratio) => t('Задній хід: {ratio}, через проміжну шестерню', { ratio }),
    },
    ratios: (d) => speedRatios(d as LayshaftDesc),
    reverse: (d) => layshaftReverse(d as LayshaftDesc),
    shafts: (_box, state) => ({ output: state?.kind === 'gear' ? state.ratio! : null, diff: null }),
    note: (_box, state) => {
      const ratio = state?.kind === 'gear' ? state.ratio! : null;
      if (ratio === null) return t('Шестерні крутяться, вторинний вал стоїть');
      if (state!.meshLoads?.every((m) => m.power === 0)) return t('Пряма: момент іде крізь муфту, без зачеплень');
      return ratio < 0 ? t('Три зачеплення, вал крутиться назад') : t('Два зачеплення: головна пара й пара передачі');
    },
  };
}

function transaxleLayout(desc: TransaxleDesc): TableLayout {
  return {
    kind: 'transaxle',
    title: t('Двовальна механічна коробка'),
    factory: desc,
    finalDrive: transaxleFinal(desc),
    demo: false,
    finalInside: true,
    build: (d) => buildGearbox(transaxleSpec(d as TransaxleDesc)),
    model: (box, quality) => new TransaxleModel(box, { quality }),
    setup: transaxleSetupModel(desc) as SetupModel<TableDesc, unknown>,
    labels: {
      note: (a) =>
        t('Кожна передача — одна пара між первинним і вторинним валами за {a} мм. Пара лишається на цій міжосьовій зі своїм модулем: змінюються лише зубці, а кут нахилу зубців підлаштовується. Головна передача теж пара зубців у тому самому картері, тож інше число дає їй інші зубці. Зміни одразу видно в 3D, у числах і в таблиці.', { a: num(a) }),
      through: null,
      gears: [t('шестерня первинного вала'), t('шестерня вторинного вала')],
      direct: '',
      reverse: (ratio) =>
        desc.reverse.teeth.length === 4
          ? t('Задній хід: {ratio}, через подвійну проміжну шестерню', { ratio })
          : t('Задній хід: {ratio}, через проміжну шестерню', { ratio }),
    },
    ratios: (d) => transaxleRatios(d as TransaxleDesc),
    reverse: (d) => transaxleReverse(d as TransaxleDesc),
    shafts: (box, state) => {
      if (state?.kind !== 'gear' || state.ratio === null) return { output: null, diff: null };
      const own = speedRatio(box, state);
      return { output: own === null ? null : Math.sign(state.ratio) * Math.abs(own), diff: state.ratio };
    },
    note: (_box, state) => {
      if (state?.kind !== 'gear' || state.ratio === null) return t('Шестерні крутяться, вторинний вал і диференціал стоять');
      const lit = state.meshLoads?.filter((m) => m.power > 1e-9).length ?? 0;
      return state.ratio < 0
        ? t('{n} зачеплення: пари заднього ходу через проміжну шестерню й головна пара, колеса крутяться назад', { n: lit })
        : t('Два зачеплення: пара передачі й головна пара');
    },
  };
}

/** The table's layout of a gearbox record; `axleFinalDrive` is the car's final drive where it is outside the box. */
export function tableLayout(record: GearboxRecord, axleFinalDrive: number | null): TableLayout {
  switch (record.layout.kind) {
    case 'layshaft':
      if (axleFinalDrive === null) throw new Error(`${record.id}: a layshaft box on the table needs its car's final drive`);
      return layshaftLayout(record.layout.desc, axleFinalDrive);
    case 'transaxle':
      return transaxleLayout(record.layout.desc);
    case 'planetary':
      // The planetary automatic has a page of its own (pages.ts), not the layshaft table.
      throw new Error(`${record.id}: a planetary box is shown on its own page, not on the table`);
    case 'power-split':
      throw new Error(`${record.id}: a power-split box has no table layout`);
  }
}
