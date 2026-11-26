// Page automatic, the planetary automatic: the ZF 8HP51 of the Toyota GR Supra A90 (owner decision A2, one example of
// the type). The other 8HP tooth sets are calibration records without a page (zf-8hp.ts).
//
// What is published:
// - the 8HP51 in the GR Supra 3.0, ratios 5.250 / 3.360 / 2.172 / 1.720 / 1.316 / 1.000 / 0.822 / 0.640, reverse
//   3.712, final drive 3.150: Toyota GB's technical specifications of 2024 (primary);
// - the teeth 48/96, 54/96, 60/96, 24/102, the joins, the elements and the shift matrix: the English Wikipedia
//   article on the ZF 8HP (secondary, with a ZF repair manual cited for sets 1 and 2); they reproduce Toyota's
//   ratios to the last place (−464/125, 21/4, 84/25, 63/29, 43/25, 6371/4841, 1, 208/253, 16/25);
// - the 500 N·m rating: the same article (secondary); ZF's brochure gives 220–1000 N·m for the family (primary).
//
// The car's engine is the catalogue's B58 (i6/toyota-supra-b58). The car itself has no shared record yet: the drive
// comes with stage K12b, so the record names no car and the page names its engine (AUTOMATIC_CAR).

import { applyGearboxEnglish } from '../../i18n/en/apply-gearbox.ts';
import { GEARBOX_AUTOMATIC_ARTICLE_EN, GEARBOX_AUTOMATIC_EN } from '../../i18n/en/gearbox-automatic.ts';
import { locale } from '../../i18n/locale.ts';
import type { GearboxArticle, GearboxPage, GearboxRecord } from '../../drivetrain/catalogue.ts';
import { GEARBOX_PAGE_NAMES } from '../gearbox-names.ts';
import { zf8hpDesc } from './zf-8hp.ts';

/** The car on the page until it has a shared record: its name, its engine in the catalogue and its final drive. */
export const AUTOMATIC_CAR = { name: 'Toyota GR Supra A90', years: '2019–', engine: 'i6/toyota-supra-b58', finalDrive: 3.15 } as const;

const ZF_8HP51_SUPRA: GearboxRecord = {
  id: 'automatic',
  name: GEARBOX_PAGE_NAMES['automatic']!,
  car: null,
  layout: { kind: 'planetary', desc: zf8hpDesc('automatic', [[48, 96, 4], [54, 96, 5], [60, 96, 4], [24, 102, 3]]) },
  published: { ratios: [5.25, 3.36, 2.172, 1.72, 1.316, 1.0, 0.822, 0.64], reverse: 3.712, ratedTorqueNm: 500, centreMm: null },
  verifyNote:
    'Передаточні числа, задній хід і головну передачу дає технічна специфікація Toyota GR Supra 2024 року. Зубці рядів 48/96, 54/96, 60/96 і 24/102, з’єднання рядів і матрицю перемикань ми взяли з англійської Вікіпедії, ' +
    'а вона для рядів 1 і 2 посилається на інструкцію з ремонту ZF. Ці зубці відтворюють усі числа Toyota до останнього знака. Розрахунковий момент 500 Н·м теж із Вікіпедії. ' +
    'Скільки сателітів у кожному ряду, у джерелах немає. Їх можна рівно розставити лише тоді, коли сума зубців сонячної й коронної ділиться на їхню кількість: 144 — на 3, 4 або 6, 150 — на 3, 5 або 6, 156 — на 3, 4 або 6, 126 — на 3 або 6. ' +
    'Ми взяли найбільше число до п’яти, за якого між сателітами лишається місце для стійок водила: 4, 5, 4 і 3. Модуль 1,75 мм, ширини вінців, прямі зубці, місця рядів і пакетів уздовж осі — наша оцінка.',
  sources: [
    'https://media.toyota.co.uk/wp-content/uploads/sites/5/pdf/240429-GR-Supra-Tech-Specs.pdf',
    'https://en.wikipedia.org/w/index.php?title=ZF_8HP_transmission&action=raw',
    'https://www.zf.com/public/org/zf_pkw_getriebebroschuere2017_de_web_72250.pdf',
  ],
  unverified: ['published.ratedTorqueNm', 'teeth', 'planets', 'module', 'faceWidth', 'packs'],
};

// The article (stage K11). Research §10: the lever analogy (Benford and Leising, SAE 810102), the 8HP's matrix, the
// two open elements and the one-element shifts (ZF, via Wikipedia), the brochure's 87 kg and 7.81 span. The torque
// converter and the automatic shifting come with stages K12a and K12b.
const ARTICLE: GearboxArticle = {
  lead:
    'Гідромеханічний автомат не має шестерень, які треба вводити в зачеплення: усі його шестерні зачеплені завжди. Передачу вибирають муфти й гальма, які з’єднують між собою частини планетарних рядів або тримають їх на картері. ' +
    'Вісім передач ZF 8HP дають чотири планетарні ряди і п’ять елементів, з яких у кожній передачі замкнено три.',
  how:
    'Планетарний ряд — це сонячна шестерня в центрі, коронна з зубцями всередині й сателіти між ними на водилі. Якщо будь-які дві з трьох частин крутяться з відомою швидкістю, третя теж визначена: z_с·ω_с + z_к·ω_к = (z_с + z_к)·ω_в. ' +
    'У 8HP частини різних рядів з’єднано назавжди, тож разом чотири ряди мають чотири ступені свободи. Кожен замкнений елемент забирає один, і три замкнені лишають рівно один рух: вихід крутиться з певною швидкістю відносно входу, це й є передача. ' +
    'Швидкості частин ряду лежать на одній прямій, якщо поставити їх на важелі на відстанях, пропорційних зубцям: так інженери й читають автомат, це номограма поруч із моделлю. ' +
    'Між сусідніми передачами міняється лише один елемент, тому перемикання — це одна муфта відпускає, друга замикає, і момент не зникає.',
  sound:
    'Планетарні ряди звучать тихо: момент ділиться між кількома сателітами, а зачеплень у кожному ряду багато. На шостій передачі весь механізм крутиться як одне ціле, і жодне зачеплення не котиться. ' +
    'На цій сторінці поки чути лише двигун, а гідротрансформатор і автоматичні перемикання з’являться пізніше.',
  pros: [
    'Шестерні завжди в зачепленні, а передачу міняє одна муфта: перемикання без розриву тяги',
    'Вісім передач із діапазоном 8,2 від чотирьох рядів, бо кожен ряд працює в кількох передачах',
    'Компактна: ряди стоять на одній осі, а момент ділиться між сателітами',
  ],
  cons: [
    'Розімкнені муфти крутяться в оливі й тертям забирають трохи потужності',
    'Складніша за механічну: гідравлічне керування, насос і блок клапанів',
    'Числа передач задані зубцями рядів, тож змінити одне, не зачепивши інших, не можна',
  ],
  cars: [
    'Toyota GR Supra A90 з двигуном B58: ZF 8HP51',
    'BMW серії 3 G20, Z4 G29: ZF 8HP51',
    'Ineos Grenadier з бензиновим двигуном: ZF 8HP51',
  ],
};

export const AUTOMATIC: GearboxPage = { id: 'automatic', base: ZF_8HP51_SUPRA, variants: [], article: ARTICLE };

if (locale === 'en') applyGearboxEnglish(AUTOMATIC, GEARBOX_AUTOMATIC_EN, GEARBOX_AUTOMATIC_ARTICLE_EN);
