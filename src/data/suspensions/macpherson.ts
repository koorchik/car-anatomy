// Page macpherson: the strut corner JTEKT measured (src/suspension/templates/macpherson.ts) and, as its real car, the
// Honda Civic Type R FK8 with the dual-axis knuckle (stage P4). The Civic's design is the catalogue's own
// (src/suspension-designer/catalogue.ts, from its shared record, chassis and drivetrain), so the page and the designer
// show the same car. English: src/i18n/en/suspension-macpherson.ts.

import { t } from '../../i18n/t.ts';
import { catalogueEntry } from '../../suspension-designer/catalogue.ts';
import type { PageCar, SuspensionPage } from '../../suspension-designer/page-cars.ts';
import { jtektCorner } from '../../suspension/templates/macpherson.ts';
import { suspensionCarLink } from '../suspension-links.ts';

const CIVIC_FK8: PageCar = {
  link: suspensionCarLink('macpherson', 'civic-type-r-fk8')!,
  design: catalogueEntry('civic-type-r-fk8')!.design,
  facts: [
    t('Спереду стійка Макферсон з кулаком на двох осях (dual-axis): колесо повертається відносно стійки на власній осі, ближчій до колеса, тож стійка не повертається разом із ним.'),
    t('Плече обкатки на осі колеса через це менше, ніж у звичайної стійки, і кермо менше смикає, коли 320 к.с. ідуть на передні колеса.'),
    t('Ззаду багаторичажна підвіска, на обох осях стабілізатори.'),
  ],
  sources: [
    'https://hondanews.eu/eu/en/cars/media/pressreleases/108909/2017-honda-civic-type-r1',
    'https://www.honda.co.jp/auto-archive/civic/type-r/2021/common/pdf/civictype-r_spec_list.pdf',
  ],
  // The shared record's own: the weight split and the centre of mass. The knuckle's own axis: Honda gives no figures,
  // the split axis is the template's (SPLIT_KNUCKLE_DEFAULTS).
  unverified: ['frontShare', 'cgHeightMm', 'kingpinOffsetMmF', 'kpiDegF'],
};

export const MACPHERSON_PAGE: SuspensionPage = {
  id: 'macpherson',
  base: { end: 'F', corner: jtektCorner, geometry: 'measured' },
  cars: [CIVIC_FK8],
};
