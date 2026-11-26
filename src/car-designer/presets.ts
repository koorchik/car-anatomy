// Starting points of the car builder: every donor as made, and a few deliberately odd builds from the plan. The plan's
// Russian saloon with a Civic Type R engine is a BMW M3 E30 with one (the build order's A1: no Russian cars).

import { t } from '../i18n/t.ts';
import { DONORS, factoryBuild, type CarBuild } from './build.ts';
import { resolveBuild } from './resolve.ts';

export interface BuildPreset {
  id: string;
  name: string;
  build: CarBuild;
}

/** Each donor with nothing replaced: its own engine, gearbox, suspension and tyres. */
export const factoryPresets = (): BuildPreset[] => DONORS.map((car) => ({ id: car.id, name: car.name, build: factoryBuild(car.id) }));

/** The odd builds of the plan. Their figures are the models', not a real car's. */
export function oddPresets(): BuildPreset[] {
  return [
    {
      // Sixteen cylinders and four turbochargers driving the front wheels of a hatchback through its own gearbox.
      id: 'w16-civic',
      name: t('W16 у Civic'),
      build: resolveBuild({ donor: 'civic-type-r-fk8', engine: { catalogue: 'w16' } }),
    },
    {
      // A modern turbocharged four in a 1980s rear-drive saloon, through the saloon's five-speed box.
      id: 'e30-civic-engine',
      name: t('BMW M3 E30 з двигуном Civic Type R'),
      build: resolveBuild({ donor: 'bmw-m3-e30', engine: { catalogue: 'i4/civic-type-r-k20c1' } }),
    },
    {
      // Slicks pull harder in the corners than the wet sump was made for; a dry sump does not care.
      id: 'civic-slicks-dry',
      name: t('Civic на сліках із сухим картером'),
      build: resolveBuild({ donor: 'civic-type-r-fk8', tyre: { id: 'slick', size: '245/30 R20' }, lubrication: { sump: 'dry', oilL: 7 } }),
    },
  ];
}
