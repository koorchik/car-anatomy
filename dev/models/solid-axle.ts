// A solid axle from the template's typical intents (stage P6b): a live axle on four links with a Panhard rod, on
// Watt's linkage, on four triangulated links or on leaf springs, and a de Dion tube on Watt's linkage. The two wheels'
// travels are separate, so the bushes of a binding set redden in roll.

import { solidAxle, SOLID_TYPICAL } from '../../src/suspension/templates/solid-axle.ts';
import { SolidAxleModel } from '../../src/scene/suspension/solid-axle-model.ts';
import { axleFrame } from '../../src/scene/suspension/axle-model.ts';
import { defineModel } from '../model-api.ts';

type Kind = keyof typeof SOLID_TYPICAL;

export default defineModel({
  title: 'Нерозрізний міст і де Діон (типова геометрія)',
  defaults: { view: 'solid' },
  controls: [
    {
      key: 'kind',
      label: 'Міст',
      kind: 'choice',
      rebuild: true,
      value: 'panhard',
      options: [
        { value: 'panhard', label: 'Чотири тяги й Панар' },
        { value: 'watt', label: 'Чотири тяги й Ватт' },
        { value: 'triangulated', label: 'Трикутні тяги' },
        { value: 'leaf', label: 'Ресори' },
        { value: 'deDion', label: 'Де Діон' },
      ],
    },
    { key: 'upper', label: 'Верхні тяги, кут, °', kind: 'range', min: -6, max: 8, step: 0.5, value: 4, rebuild: true },
    { key: 'left', label: 'Хід лівого колеса, мм', kind: 'range', min: -90, max: 110, step: 1, value: 0 },
    { key: 'right', label: 'Хід правого колеса, мм', kind: 'range', min: -90, max: 110, step: 1, value: 0 },
  ],
  create(values) {
    const intent = SOLID_TYPICAL[values.kind as Kind];
    const upper = values.kind === 'triangulated' ? intent.upperAngleDeg : (values.upper as number);
    const model = new SolidAxleModel({
      which: 'rear',
      spec: solidAxle({ ...intent, upperAngleDeg: upper }),
      wheel: { rimRadiusM: 0.2159, rimWidthM: 0.19, tyreWidthM: 0.225 },
    });
    const frame = axleFrame();
    const draw = (): void => {
      frame.travel[0] = (values.left as number) / 1000;
      frame.travel[1] = (values.right as number) / 1000;
      model.update(frame);
    };
    draw();
    return {
      group: model.group,
      home: [-0.75, 0.45, -0.85],
      groundY: 0,
      set: draw,
      setView: (view) => model.setView(view),
      setExplode: (amount) => model.setExplode(amount),
      setHighlight: (on) => model.setHighlight(on),
      setGhost: (alpha) => model.setGhost(alpha),
      part: (key) => model.parts[key],
      dispose: () => model.dispose(),
    };
  },
});
