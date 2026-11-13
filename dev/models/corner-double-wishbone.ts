// A double wishbone corner from the template's intents (typical geometry, docs/suspension-model.md): the front one
// steered by a tie rod, the rear one driven, with a toe link. The coilover stands on the lower arm. On the driven rear
// the template puts it right over the halfshaft, which runs through the spring and the damper's body (63 mm deep at
// worst): the template's to fix, so the viewer shows it as it is.

import { doubleWishbone, wishboneDefaults } from '../../src/suspension/templates/double-wishbone.ts';
import { typicalCorner, typicalWheelCentreZM } from '../../src/suspension/templates/typical-corner.ts';
import type { CornerSpec } from '../../src/suspension/spec.ts';
import { defineModel } from '../model-api.ts';
import { cornerModel } from '../corner-viewer.ts';

const corners = new Map<string, CornerSpec>();
const cornerOf = (axle: 'front' | 'rear'): CornerSpec => {
  let c = corners.get(axle);
  if (!c) corners.set(axle, (c = typicalCorner(doubleWishbone({ ...wishboneDefaults(axle), wheelCentreZM: typicalWheelCentreZM() }))));
  return c;
};

export default defineModel(
  cornerModel({
    title: 'Подвійні важелі (типова геометрія)',
    variants: [
      {
        key: 'axle',
        label: 'Вісь',
        kind: 'choice',
        buttons: true,
        value: 'front',
        options: [
          { value: 'front', label: 'Передня' },
          { value: 'rear', label: 'Задня, ведуча' },
        ],
      },
    ],
    corner: (values) => cornerOf(values.axle === 'rear' ? 'rear' : 'front'),
    home: [-0.72, 0.42, 0.8],
  }),
);
