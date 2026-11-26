// The cars whose steering the steering scene (stage P13) shows beside the rack: an independent front axle steered by a
// box with a pitman arm, a centre link and an idler arm, and a steered solid axle with a drag link (suspensions plan,
// decision 20; build order, A1: the Mercedes-Benz 190 for the independent axle).
//
// What was checked (P13-core, 2026-11): no Mercedes-Benz document on the W201's steering gear was found. Two web
// searches turned up only secondary pages: a workshop guide for the W201 that unhooks a tie rod from the idler arm, a
// specialist's overhaul of the W201's steering box, and a Mercedes club article saying many Mercedes models of the time
// used recirculating-ball steering. So the gear and the linkage of the W201 stay unverified, and until a primary source
// confirms them the P13 page shows the pitman arm on the Wrangler YJ's steered axle alone (build order, A1). The YJ's
// leaf springs and track bars are on its Wikipedia page; its steering box and drag link are not, and stay unverified too.
// The scene's geometry is typical (templates/steered-beam.ts), not either car's.

import type { SteeringGearKind } from '../suspension/steering.ts';

export interface SteeringExample {
  id: string;
  /** Make and model: the same in both languages. */
  name: string;
  gear: SteeringGearKind;
  /** How the gear reaches the knuckles: tie rods on a rack, a centre link between a pitman arm and an idler arm, or a
   *  drag link to one knuckle of a solid axle and a tie rod between the two. */
  linkage: 'rack' | 'idler' | 'drag-link';
  /** Fields no primary source confirms. */
  unverified: ReadonlyArray<'gear' | 'linkage'>;
  sources: readonly string[];
}

export const STEERING_EXAMPLES: readonly SteeringExample[] = [
  {
    id: 'mercedes-190-w201',
    name: 'Mercedes-Benz 190 (W201)',
    gear: 'recirculating-ball',
    linkage: 'idler',
    unverified: ['gear', 'linkage'],
    sources: [
      'https://club.autodoc.co.uk/manuals/how-to-change-inner-tie-rod-on-mercedes-w201-replacement-guide-37830',
      'https://rpm-depot.de/en/product/steering-box-overhaul-mercedes-w201-190e-190d-16v-evo',
      'https://starmagazine.mbca.org/node/7148070',
    ],
  },
  {
    id: 'jeep-wrangler-yj',
    name: 'Jeep Wrangler YJ',
    gear: 'recirculating-ball',
    linkage: 'drag-link',
    unverified: ['gear', 'linkage'],
    sources: ['https://en.wikipedia.org/wiki/Jeep_Wrangler_(YJ)'],
  },
];
