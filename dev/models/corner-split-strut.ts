// A MacPherson strut with a split steering axis on the JTEKT strut, arm and rack: Honda's dual-axis or Ford's
// RevoKnuckle. The strut stands on a carrier that does not steer; the wheel knuckle turns in it about its own axis,
// nearer the wheel (docs/suspension-model.md for what is measured and what is estimated).

import { macphersonJtekt } from '../../src/suspension/templates/macpherson.ts';
import { typicalCorner, typicalWheelCentreZM } from '../../src/suspension/templates/typical-corner.ts';
import type { CornerSpec } from '../../src/suspension/spec.ts';
import { defineModel } from '../model-api.ts';
import { cornerModel } from '../corner-viewer.ts';

const corners = new Map<string, CornerSpec>();
const cornerOf = (knuckle: 'dual-axis' | 'revoknuckle'): CornerSpec => {
  let c = corners.get(knuckle);
  if (!c) corners.set(knuckle, (c = typicalCorner(macphersonJtekt({ wheelCentreZM: typicalWheelCentreZM(), knuckle }))));
  return c;
};

export default defineModel(
  cornerModel({
    title: 'Макферсон з розщепленим кулаком',
    variants: [
      {
        key: 'knuckle',
        label: 'Кулак',
        kind: 'choice',
        buttons: true,
        value: 'dual-axis',
        options: [
          { value: 'dual-axis', label: 'Dual-axis (Honda)' },
          { value: 'revoknuckle', label: 'RevoKnuckle (Ford)' },
        ],
      },
    ],
    corner: (values) => cornerOf(values.knuckle === 'revoknuckle' ? 'revoknuckle' : 'dual-axis'),
    home: [-0.72, 0.42, 0.8],
  }),
);
