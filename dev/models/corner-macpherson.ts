// The MacPherson corner of the macpherson page (JTEKT hardpoints) with its setup: on a rig that moves the wheel through
// its travel, or driven over a bump or a kerb by the quarter car, with the forces on the wheel and the camber laser.

import { jtektCorner } from '../../src/suspension/templates/macpherson.ts';
import { defineModel } from '../model-api.ts';
import { cornerModel } from '../corner-viewer.ts';

const corner = jtektCorner();

export default defineModel(
  cornerModel({
    title: 'Кут Макферсона (JTEKT)',
    corner: () => corner,
    // From the inboard side and the front: the strut, the arm, the rack and the shaft face the camera.
    home: [-0.72, 0.42, 0.8],
  }),
);
