// Porsche 911 Carrera T (992): what the suspension knows of it beyond the shared car record (stage P7-geom).
//
// Porsche's US technical specifications (November 2022, primary): a MacPherson strut front axle and an aluminium
// multilink rear axle, variable-ratio electromechanical steering, and a turning circle of 36.8 ft (11.2 m) without
// rear-axle steering. The sheet clips the axle rows after "with anti-" and "with"; anti-roll bars at both ends are
// auto motor und sport's data for the 992 Carrera (docs/suspension-research/real_car_data.md), so they stay
// unverified. That 36.8 ft is the diameter the outer front tyre's outer edge traces (kerb to kerb) is our reading of
// the US sheet. The hardpoints are not published: the corners are typical geometry (src/suspension/car-chassis.ts).

import type { ChassisCar } from '../../suspension/car-chassis.ts';

/** 36.8 ft in metres. */
const TURNING_CIRCLE_M = 36.8 * 0.3048;

export const PORSCHE_911_CARRERA_T_992: ChassisCar = {
  car: 'porsche-911-carrera-t-992',
  front: { layout: 'macpherson', knuckle: 'plain' },
  rear: { layout: 'multilink' },
  turning: { kind: 'kerb-diameter', m: TURNING_CIRCLE_M },
  antiRollBars: { front: true, rear: true },
  sources: [
    'https://newsroom.porsche.com/dam/jcr:f50e6bb0-6e82-4062-b167-532afdf23ac9/992%20911%20Carrera%20T%20Technical%20Specifications.pdf',
    'https://www.auto-motor-und-sport.de/test/porsche-911-carrera-992-im-test/technische-daten/',
  ],
  unverified: ['turning.kind', 'antiRollBars'],
};
