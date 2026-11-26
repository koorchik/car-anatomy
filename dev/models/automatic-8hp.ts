// The ZF 8HP51 of the Toyota GR Supra on the table (stage K11): the input turns, the output is free, and the gear
// buttons close the matrix's three elements; the element toggles close any combination (demonstration 8).

import { gearboxById } from '../../src/data/gearboxes.ts';
import { gearboxSpec } from '../../src/drivetrain/catalogue.ts';
import { PlanetaryTable } from '../../src/drivetrain/planetary-table.ts';
import { buildGearbox } from '../../src/drivetrain/topology.ts';
import { PLANETARY_PARTS } from '../../src/scene/gearbox/planetary-parts.ts';
import { PlanetaryModel } from '../../src/scene/gearbox/planetary-model.ts';
import { defineModel } from '../model-api.ts';

const box = buildGearbox(gearboxSpec(gearboxById('automatic')!));

export default defineModel({
  title: 'Автомат ZF 8HP51 на столі',
  defaults: { view: 'xray' },
  controls: [
    {
      key: 'gear',
      label: 'Передача',
      kind: 'choice',
      buttons: true,
      value: '1',
      options: ['R', 'N', '1', '2', '3', '4', '5', '6', '7', '8', 'ACE'].map((v) => ({ value: v, label: v })),
    },
    { key: 'rpm', label: 'Вхідний вал, об/хв', kind: 'range', min: 0, max: 600, step: 10, value: 60 },
    { key: 'glow', label: 'Шлях потужності', kind: 'toggle', value: true },
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
    const model = new PlanetaryModel(box, { quality: values.quality === 'low' ? 'low' : 'high' });
    const table = new PlanetaryTable(box);
    const choose = (gear: string) => (gear === 'ACE' ? table.set(['A', 'C', 'E']) : table.select(gear));
    choose(values.gear as string);
    const pose = table.frame();
    const unlit = { angles: pose.angles, closed: pose.closed, meshPower: box.meshes.map(() => 0) };
    const draw = () => model.update(values.glow ? pose : unlit);
    draw();
    return {
      group: model.group,
      groundY: 0,
      frame(_time, dt) {
        table.step(dt, values.rpm as number, (values.rpm as number) / 4);
        draw();
      },
      set(key, next) {
        if (key === 'gear') choose(next.gear as string);
        draw();
      },
      setView: (view) => model.setView(view),
      setExplode: (amount) => model.setExplode(amount),
      setHighlight: (on) => model.setHighlight(on),
      setGhost: (alpha) => model.setGhost(alpha),
      part: (key) => PLANETARY_PARTS[key],
      dispose: () => model.dispose(),
    };
  },
});
