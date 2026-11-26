// Page swing-axle (stage P5): the typical swing axle at the rear of a rear-engined car and three real cars, each written
// as a design (src/suspension-designer/page-cars.ts). English: src/i18n/en/suspension-swing-axle.ts.
//
// What is sourced (docs/suspension-model.md, the pivot pages' section):
// - Chevrolet Corvair (1960–1963): rear engine and a rear swing axle; a front anti-roll bar as an option for 1962 and
//   standard for 1964, when a transverse leaf between the rear wheels began to limit their camber; a new independent
//   rear in 1965 with the roll centre at half its height; 108 in (2743 mm) wheelbase and 2270–2305 lb (Wikipedia,
//   «Chevrolet Corvair»). NHTSA's 1972 report (DOT HS-820 198, as the research read it): understeer to about 0.4 g,
//   the turn through neutral to oversteer between 0.4 and 0.5 g, a limit of control near 0.6 g, and no abnormal
//   potential for loss of control, stable oversteer from 0.5 to 0.6 g; the tests ran from 1970 to the summer of 1972
//   on an early Corvair, a 1962 Falcon, a 1960 Valiant, a 1962 Beetle, a 1963 Renault and a 1967 Corvair, the 0.6 g
//   limit being GM's data and an expert witness's testimony as the report cites them (Ate Up With Motor, quoting the
//   report with its page numbers). The front
//   double wishbone, the weight split, the centre of mass, the tracks and the tyres are not checked.
// - Volkswagen Beetle: a swing axle at the rear and two trailing arms a side in front, all on torsion bars, and a front
//   anti-roll bar (Wikipedia, «Volkswagen Beetle»); the tyre-pressure split it shared with the Corvair and the Dauphine
//   (Wikipedia, «Swing axle»). Which later versions changed the rear and when is not checked, so the page stops at
//   1967. The weight split, the centre of mass and the tracks are NHTSA's 1971 Beetle (research), which the research
//   warns is not a confirmed swing axle: they stand as estimates. The designer has no front trailing arms.
// - Tatra 11 (1923–1927): the first Tatra with a backbone tube, swing half-axles and an air-cooled engine; the final
//   drive bolted to the tube lets the half-axles swing without flexible joints; a beam axle on a transverse leaf in
//   front; wheelbase 2635 mm and 680–900 kg (Wikipedia, «Tatra 11», a page flagged as resting on one source). The
//   tracks, the tyres, the weight split and the centre of mass are not checked.

import { t } from '../../i18n/t.ts';
import { designCorner, figuresDesign, TYPICAL_REAR_ENGINE, type PageCar, type SuspensionPage } from '../../suspension-designer/page-cars.ts';
import { DRIVER_KG } from '../../vehicle/mass.ts';
import { suspensionCarLink } from '../suspension-links.ts';

const CORVAIR: PageCar = {
  link: suspensionCarLink('swing-axle', 'chevrolet-corvair')!,
  design: figuresDesign({
    car: 'chevrolet-corvair',
    massKg: 1046 + DRIVER_KG,
    frontShare: 0.38,
    cgHeightMm: null,
    wheelbaseMm: 2743,
    trackMm: [1384, 1384],
    drive: 'rwd',
    tyres: ['165/80 R13', '165/80 R13'],
    layouts: ['double-wishbone', 'swing-axle'],
    bars: [false, false],
  }),
  facts: [
    t('Двигун ззаду, ззаду хитний міст. NHTSA у 1970–1972 роках випробувала ранній Corvair разом із Ford Falcon 1962 року, Plymouth Valiant 1960 року, VW Beetle 1962 року, Renault 1963 року й Corvair другого покоління 1967 року. До 0,4 g бічного прискорення він має недостатню поворотність, як звичайні авто, між 0,4 і 0,5 g переходить через нейтральну до надмірної, від 0,5 до 0,6 g надмірна поворотність стала, а межа керованості близько 0,6 g.'),
    t('Висновок звіту 1972 року: керованість і стійкість Corvair 1960–1963 не дають ненормальної схильності до втрати керування чи перекидання, і він не гірший за деякі тогочасні авто.'),
    t('У 1962 році з’явився передній стабілізатор опцією, у 1964 він став серійним, а між задніми колесами поставили поперечну ресору, яка обмежує їхній розвал. З 1965 року задня підвіска зовсім нова, незалежна, із центром крену вдвічі нижчим.'),
  ],
  sources: [
    'https://en.wikipedia.org/wiki/Chevrolet_Corvair',
    'https://rosap.ntl.bts.gov/view/dot/92396/dot_92396_DS1.pdf',
    'https://ateupwithmotor.com/model-histories/compact-economy-cars/reconsidering-the-1972-nhtsa-report-on-the-corvair/',
  ],
  unverified: ['frontShare', 'cgHeightMm', 'trackMmF', 'trackMmR', 'tyre size', 'layoutF'],
};

const BEETLE: PageCar = {
  link: suspensionCarLink('swing-axle', 'vw-beetle')!,
  design: figuresDesign({
    car: 'vw-beetle',
    massKg: 730 + DRIVER_KG,
    frontShare: 0.414,
    cgHeightMm: 499,
    wheelbaseMm: 2400,
    trackMm: [1313, 1328],
    drive: 'rwd',
    tyres: ['145/80 R15', '145/80 R15'],
    layouts: ['macpherson', 'swing-axle'],
    bars: [true, false],
  }),
  facts: [
    t('Двигун ззаду, ззаду хитний міст на торсіонах. Спереду з кожного боку два поздовжні важелі, теж на торсіонах, і стабілізатор.'),
    t('Як і Corvair, ранній Beetle покладався на різний тиск у шинах: менший спереду й більший ззаду, щоб авто не мало надмірної повертаності. Накачані однаково шини повертали її назад.'),
    t('Пізніші версії отримали іншу задню підвіску; з якого року яку, сторінка не звіряла й тому показує авто до 1967 року. Розподіл ваги й центр мас NHTSA виміряла на Beetle 1971 року, тож для раннього авто вони лише орієнтир. Конструктор не має передніх поздовжніх важелів, тому спереду в дизайні типова стійка.'),
  ],
  sources: ['https://en.wikipedia.org/wiki/Volkswagen_Beetle', 'https://en.wikipedia.org/wiki/Swing_axle', 'https://www.lfs.net/attachment/44487'],
  unverified: ['massKg', 'frontShare', 'cgHeightMm', 'trackMmF', 'trackMmR', 'tyre size'],
};

const TATRA_11: PageCar = {
  link: suspensionCarLink('swing-axle', 'tatra-11')!,
  design: figuresDesign({
    car: 'tatra-11',
    massKg: 680 + DRIVER_KG,
    frontShare: 0.5,
    cgHeightMm: null,
    wheelbaseMm: 2635,
    trackMm: [1200, 1200],
    drive: 'rwd',
    tyres: ['135/80 R19', '135/80 R19'],
    layouts: ['live-axle', 'swing-axle'],
    bars: [false, false],
  }),
  facts: [
    t('Перша Tatra з хребтовою рамою-трубою, хитними піввісями й мотором повітряного охолодження. Конструктор — Ганс Ледвінка.'),
    t('Ззаду до труби прикручено головну передачу: її шестерні дають піввісям хитатися без гнучких шарнірів у приводі. Спереду нерозрізна балка на поперечній ресорі.'),
    t('Tatra досі ставить хитні піввісі на хребтову трубу своїх вантажівок: на бездоріжжі така рама менше скручується.'),
  ],
  sources: ['https://en.wikipedia.org/wiki/Tatra_11', 'https://en.wikipedia.org/wiki/Swing_axle'],
  unverified: ['massKg', 'frontShare', 'cgHeightMm', 'trackMmF', 'trackMmR', 'tyre size'],
};

export const SWING_AXLE_PAGE: SuspensionPage = {
  id: 'swing-axle',
  base: { end: 'R', corner: () => designCorner(TYPICAL_REAR_ENGINE, 'R'), geometry: 'typical', design: () => TYPICAL_REAR_ENGINE },
  cars: [CORVAIR, BEETLE, TATRA_11],
};
