// A five-link corner from the template's intents (typical geometry, docs/suspension-model.md): two lower and two upper
// links whose lines meet at virtual ball joints, and a tie rod in front or a toe link at the rear. The coilover stands
// on the rear lower link.

import { multilink, multilinkDefaults } from '../../src/suspension/templates/multilink.ts';
import { typicalCorner, typicalWheelCentreZM } from '../../src/suspension/templates/typical-corner.ts';
import type { CornerSpec } from '../../src/suspension/spec.ts';
import { defineModel } from '../model-api.ts';
import { cornerModel } from '../corner-viewer.ts';

const corners = new Map<string, CornerSpec>();
const cornerOf = (axle: 'front' | 'rear'): CornerSpec => {
  let c = corners.get(axle);
  if (!c) corners.set(axle, (c = typicalCorner(multilink({ ...multilinkDefaults(axle), wheelCentreZM: typicalWheelCentreZM() }))));
  return c;
};

export default defineModel(
  cornerModel({
    title: 'Багатоважільна, п’ять тяг (типова геометрія)',
    variants: [
      {
        key: 'axle',
        label: 'Вісь',
        kind: 'choice',
        buttons: true,
        value: 'rear',
        options: [
          { value: 'front', label: 'Передня' },
          { value: 'rear', label: 'Задня, ведуча' },
        ],
      },
    ],
    corner: (values) => cornerOf(values.axle === 'front' ? 'front' : 'rear'),
    home: [-0.72, 0.42, 0.8],
  }),
);
