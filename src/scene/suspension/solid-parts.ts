// Cards of a solid axle's parts (solid-axle-model.ts): what is its own (the housing or the de Dion tube, the trailing
// links, the Panhard rod, Watt's linkage, the leaf springs, the differential on the body) and the wheel end shared with
// the corners (parts.ts). Only the keys the axle draws get a card. Text: src/i18n/en/suspension-axles.ts.

import { t } from '../../i18n/t.ts';
import type { AxleSpec, SolidAxleLinkage } from '../../suspension/spec.ts';
import type { PartInfo } from '../parts-info.ts';
import { SUSPENSION_PARTS } from './parts.ts';

const OWN: Record<string, PartInfo> = {
  'susp.axle-housing': {
    name: t('Картер моста'),
    text: t('Сталева труба від колеса до колеса з диференціалом посередині. Обидва колеса сидять на ній жорстко, тож удар під одним нахиляє й друге, а вся вага картера з диференціалом і головною передачею ходить разом із колесами як непідресорена маса. Піввісі обертаються всередині картера.'),
  },
  'susp.de-dion-tube': {
    name: t('Труба де Діона'),
    text: t('Легка труба, що жорстко тримає обидві маточини, як картер моста, але без диференціала: його закріплено на кузові. Тому колеса лишаються паралельними, а непідресорена маса менша. Труба обходить диференціал ззаду.'),
  },
  'susp.lower-link': {
    name: t('Нижня поздовжня тяга'),
    text: t('Тримає міст уздовж авто й передає на кузов силу тяги й гальмування. Хитається на сайлентблоках з обох кінців.'),
  },
  'susp.upper-link': {
    name: t('Верхня поздовжня тяга'),
    text: t('Разом із нижньою тягою не дає мосту провертатися від моменту на колесах. Кут між верхніми й нижніми тягами в боковому виді задає, наскільки задок присідає під час розгону.'),
  },
  'susp.panhard-rod': {
    name: t('Тяга Панара'),
    text: t('Поперечна тяга від кузова з одного боку до моста з другого. Тримає міст упоперек, але ходить по дузі, тож на ході зсуває міст убік. Центр крену лежить на її висоті.'),
  },
  'susp.watt-linkage': {
    name: t('Механізм Ватта'),
    text: t('Коромисло на мосту й дві тяги до кузова в протилежні боки. Коли міст іде вгору чи вниз, коромисло повертається, і середина моста лишається майже на одній вертикалі, без бічного зсуву тяги Панара. Центр крену лежить на осі коромисла.'),
  },
  'susp.leaf-spring': {
    name: t('Ресора'),
    text: t('Пакет зігнутих сталевих листів. Тримає вагу, працює пружиною й сама тримає міст уздовж і впоперек, тож тяг не треба. Видно, як вона прогинається на ході, а міст на ній трохи повертається.'),
  },
  'susp.leaf-shackle': {
    name: t('Сережка ресори'),
    text: t('Коротка ланка між заднім вушком ресори й кузовом. Ресора на ході змінює довжину між вушками, і сережка хитається, щоб їй не заважати.'),
  },
  'susp.bush': {
    name: t('Сайлентблок'),
    text: t('Гумова втулка у вушку тяги. Коли тяг більше, ніж треба, міст не може рухатися, не стиснувши їх, і тоді сайлентблоки беруть закушування. Сайт фарбує їх червоним відповідно до того, наскільки розтягнуто чи стиснуто тягу.'),
  },
  'susp.spring': {
    name: t('Пружина'),
    text: t('Стоїть на мосту й упирається в кузов. Міст тримають тяги, тож пружина лише несе вагу й приймає удари.'),
  },
  'susp.damper': {
    name: t('Амортизатор'),
    text: t('Нижнім вушком кріпиться до моста, верхнім до кузова. Гасить коливання кузова й підскакування важкого моста.'),
  },
  'susp.hub': {
    name: t('Маточина'),
    text: t('Обертається на підшипнику в кінці моста. До її фланця кріпляться гальмівний диск і колесо.'),
  },
  'susp.caliper': {
    name: t('Супорт'),
    text: t('Закріплений на кінці моста й охоплює диск. Тиск гальмівної рідини притискає колодки до диска.'),
  },
  'susp.differential': {
    name: t('Диференціал на кузові'),
    text: t('Головна передача й диференціал закріплені на кузові, а не на мосту, тож їхня вага не ходить із колесами. Момент до коліс передають піввісі з шарнірами на обох кінцях.'),
  },
  'susp.halfshaft': {
    name: t('Піввісь'),
    text: t('Іде від диференціала на кузові до маточини на трубі. Відстань між маточинами стала, а виходи диференціала нерухомі, тож на ході піввісь мусить трохи змінювати довжину: це бере внутрішній шарнір.'),
  },
  'susp.body': {
    name: t('Кузов'),
    text: t('Підлога над мостом і кронштейни, до яких кріпляться тяги, пружини й амортизатори.'),
  },
};

const SHARED = ['susp.tyre', 'susp.wheel', 'susp.brake-disc', 'susp.cv-inner', 'susp.cv-outer'] as const;

/** Cards of the parts a solid axle draws, under the keys it tags them with (`key` adds the axle's space). */
export function solidAxleParts(spec: AxleSpec<SolidAxleLinkage>, key: (k: string) => string = (k) => k): Record<string, PartInfo> {
  const link = spec.linkage;
  const have = new Set<string>([link.axlePart, 'susp.bush', 'susp.damper', 'susp.hub', 'susp.caliper', 'susp.body', 'susp.tyre', 'susp.wheel', 'susp.brake-disc']);
  for (const r of link.rods) have.add(r.part);
  if (link.lateral.kind === 'panhard') have.add('susp.panhard-rod');
  if (link.lateral.kind === 'watt') have.add('susp.watt-linkage');
  if (link.lateral.kind === 'leaf') have.add('susp.leaf-spring').add('susp.leaf-shackle');
  else have.add('susp.spring');
  if (spec.halfshaft) have.add('susp.differential').add('susp.halfshaft').add('susp.cv-inner').add('susp.cv-outer');
  const out: Record<string, PartInfo> = {};
  for (const k of have) {
    const info = OWN[k] ?? (SHARED.includes(k as (typeof SHARED)[number]) ? SUSPENSION_PARTS[k] : undefined);
    if (info) out[key(k)] = info;
  }
  return out;
}
