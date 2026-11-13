// Honda Civic Type R FK8: what the suspension knows of it beyond the shared car record (stage P7-geom).
//
// Honda Europe's 2017 release (primary): a lower-arm MacPherson strut with Honda's dual-axis knuckle in front, an
// all-new multilink at the rear, dual-pinion variable-ratio electric rack-and-pinion steering. Honda Japan's spec sheet
// for the 2020-2021 car (6BA-FK8, primary): torsion-bar anti-roll bars front and rear, and a minimum turning radius of
// 5.9 m (最小回転半径: the radius the outer front tyre's contact centre traces, as Japanese sheets give it).
// The hardpoints are not published: the corners are typical geometry (src/suspension/car-chassis.ts).

import type { ChassisCar } from '../../suspension/car-chassis.ts';

export const CIVIC_TYPE_R_FK8: ChassisCar = {
  car: 'civic-type-r-fk8',
  front: { layout: 'macpherson', knuckle: 'dual-axis' },
  rear: { layout: 'multilink' },
  turning: { kind: 'radius', m: 5.9 },
  antiRollBars: { front: true, rear: true },
  sources: [
    'https://hondanews.eu/eu/en/cars/media/pressreleases/108909/2017-honda-civic-type-r1',
    'https://www.honda.co.jp/auto-archive/civic/type-r/2021/common/pdf/civictype-r_spec_list.pdf',
  ],
  unverified: [],
};
