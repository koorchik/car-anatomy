// The BMW M3 E30's Getrag 265/5 on the table (stage K1b-3d): the input shaft is turned, the output turns free, and
// the buttons pick N, 1–5 or R. Sleeves travel in 0.2 s, out of the old gear first, and the power path glows warm
// in proportion to the power each mesh rolls: two pairs in first, none in the direct fifth.
//
// The speed count and the second gear's ratio rebuild the box as the settings panel of K1b will: teeth from
// gear-pick, a pair added or taken off the top, the case following the gear stack, unchanged gears from the cache.

import { gearboxById } from '../../src/data/gearboxes.ts';
import { pickPair } from '../../src/drivetrain/gear-pick.ts';
import { layshaftSpec, type LayshaftDesc, type PairDesc } from '../../src/drivetrain/layouts/layshaft.ts';
import { withSpeedCount } from '../../src/drivetrain/layouts/layshaft-speeds.ts';
import { TableDrive } from '../../src/drivetrain/table-drive.ts';
import { buildGearbox } from '../../src/drivetrain/topology.ts';
import { GearboxModel } from '../../src/scene/gearbox/gearbox-model.ts';
import { GEARBOX_PARTS } from '../../src/scene/gearbox/parts.ts';
import { defineModel, type Values } from '../model-api.ts';

const record = gearboxById('manual-rwd')!;
const factory = record.layout.desc;
const mainRatio = factory.main.teeth[1] / factory.main.teeth[0];
const factorySecond = factory.speeds[1] as PairDesc;
const factorySecondRatio = mainRatio * (factorySecond.teeth[1] / factorySecond.teeth[0]);

/** The description the controls ask for: second gear's teeth picked for its ratio, then the speed count. */
function describe(values: Values): LayshaftDesc {
  let desc: LayshaftDesc = factory;
  const second = values.second as number;
  if (Math.abs(second - factorySecondRatio) > 0.004) {
    const pick = pickPair({ ratio: second / mainRatio, centreMm: factory.centreMm, module: factorySecond.module, helixRange: [15, 35], pressureAngle: factory.pressureAngle });
    if (pick) desc = { ...desc, speeds: desc.speeds.map((s, i) => (i === 1 ? { ...factorySecond, teeth: pick.teeth } : s)) };
  }
  return withSpeedCount(desc, Number(values.speeds));
}

export default defineModel({
  title: 'Коробка BMW M3 E30 на столі',
  defaults: { view: 'xray' },
  controls: [
    {
      key: 'gear',
      label: 'Передача',
      kind: 'choice',
      buttons: true,
      value: 'N',
      options: ['R', 'N', '1', '2', '3', '4', '5', '6'].map((v) => ({ value: v, label: v })),
    },
    { key: 'rpm', label: 'Первинний вал, об/хв', kind: 'range', min: 0, max: 1200, step: 10, value: 60 },
    { key: 'glow', label: 'Шлях потужності', kind: 'toggle', value: true },
    {
      key: 'speeds',
      label: 'Передач',
      kind: 'choice',
      buttons: true,
      rebuild: true,
      value: '5',
      options: ['4', '5', '6'].map((v) => ({ value: v, label: v })),
    },
    { key: 'second', label: 'Число другої передачі', kind: 'range', min: 2, max: 3.2, step: 0.01, value: Math.round(factorySecondRatio * 100) / 100, rebuild: true },
    {
      key: 'quality',
      label: 'Деталізація',
      kind: 'choice',
      rebuild: true,
      value: 'high',
      options: [
        { value: 'high', label: 'Повна' },
        { value: 'low', label: 'Телефон' },
      ],
    },
  ],
  create(values) {
    const box = buildGearbox(layshaftSpec(describe(values)));
    const model = new GearboxModel(box, { quality: values.quality === 'low' ? 'low' : 'high' });
    const drive = new TableDrive(box, box.states.some((s) => s.name === values.gear) ? (values.gear as string) : 'N');
    const dark = box.meshes.map(() => 0);
    const draw = () => {
      const pose = drive.frame();
      model.update(values.glow ? pose : { ...pose, meshPower: dark });
    };
    draw();
    return {
      group: model.group,
      groundY: 0,
      frame(_time, dt) {
        drive.step(dt, values.rpm as number);
        draw();
      },
      set(key, next) {
        if (key === 'gear') drive.select(next.gear as string);
        draw();
      },
      setView: (view) => model.setView(view),
      setExplode: (amount) => model.setExplode(amount),
      setHighlight: (on) => model.setHighlight(on),
      setGhost: (alpha) => model.setGhost(alpha),
      part: (key) => GEARBOX_PARTS[key],
      dispose: () => model.dispose(),
    };
  },
});
