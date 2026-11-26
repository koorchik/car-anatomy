// Page pushrod (stage P14): the typical pushrod corner of a racing car and a Formula 1 car of the 2022 rules, each
// written as a design (src/suspension-designer/page-cars.ts). English: src/i18n/en/suspension-pushrod.ts.
//
// The page's own corner is the designer's «racing car on rockers» preset (src/suspension-designer/presets.ts,
// 'pushrod-racer'), written out here so the section does not load the designer's dictionary: a 900 kg car with rockers
// and third springs on both axles, every number illustrative.
//
// What is sourced for the Formula 1 car:
// - the minimum mass, 798 kg with the driver, on dry tyres and without fuel; the 18-inch wheels of 2022 in place of the
//   13-inch ones and the tyre diameter raised from 670 to 720 mm; the widths, 305 mm in front and 405 mm at the rear, are
//   the 2017 sizes, which the article does not repeat for 2022 (Wikipedia, «Formula One car»);
// - the 2022 suspension rules: the wishbones' pick-ups within the height of the wheel hub (F1.com, Tech Tuesday,
//   30 Nov 2021) or inside the inner plane of the front wheel (The Race, Gary Anderson, 29 Jan 2022); at most 2 mm of
//   ride-height change at the car's centre line on 12° of steering lock (The Race); the steering's articulation at most
//   25 mm inboard of the hub against Ferrari's 2018 lowering on lock (F1.com); hydraulically operated remote helper springs
//   and dampers outlawed, everything that supports each end packaged in its own area (The Race).
// Not sourced, estimates: the weight split, the centre of mass, the wheelbase (3600 mm, the figure usually quoted as the
// rules' maximum), the tracks (the 2000 mm maximum width less a tyre) and the third springs. The corner springs give
// 3 Hz over each axle, the bottom of the 3–5 Hz OptimumG gives cars with much downforce (docs/research/suspensions.md 3.1). The tyre sizes
// are written from the diameter and the widths (305/43 R18, 405/32 R18); the designer holds a tyre to 355 mm, so the
// rear axle, which the page does not show, gets a narrower one.

import { t } from '../../i18n/t.ts';
import { cornerSprungKg, resolveChassis, springForRideHz } from '../../suspension-designer/constraints.ts';
import { DEFAULT_CAR, typicalAxle } from '../../suspension-designer/defaults.ts';
import { designOf, type AxleEnd, type ChassisDesign } from '../../suspension-designer/design.ts';
import { axleGeometry } from '../../suspension-designer/geometry.ts';
import { designCorner, figuresDesign, type PageCar, type SuspensionPage } from '../../suspension-designer/page-cars.ts';
import { tyreVertical } from '../../vehicle/tyre-data.ts';
import { suspensionCarLink } from '../suspension-links.ts';

/** The page's own car: the designer's 'pushrod-racer' preset (its numbers, illustrative). */
export const TYPICAL_PUSHROD: ChassisDesign = Object.freeze(
  designOf(
    { ...DEFAULT_CAR, massKg: 900, frontShare: 0.44, cgHeightMm: 330, wheelbaseMm: 2700, drive: 'rwd', tyre: 'slick' },
    { ...typicalAxle('pushrod', 'F'), trackMm: 1600, tyreWidthMm: 265, tyreAspect: 35, rimIn: 18, springNmm: 90, thirdSpringNmm: 40, damper: 'track', barMm: 26, camberDeg: -3, unsprungKg: 25 },
    { ...typicalAxle('pushrod', 'R'), trackMm: 1560, tyreWidthMm: 305, tyreAspect: 30, rimIn: 18, springNmm: 100, thirdSpringNmm: 50, damper: 'track', barMm: 20, camberDeg: -2, unsprungKg: 28 },
  ),
);

/** Body frequency the Formula 1 car's corner springs give over each axle, Hz (an estimate, see above). */
const F1_RIDE_HZ = 3;

/** The Formula 1 car: its figures, on slicks with the track damper and typical third springs, and corner springs for
 *  F1_RIDE_HZ, N/mm along the spring. */
function f1Design(): ChassisDesign {
  const figures = resolveChassis({
    ...figuresDesign({
      car: 'formula-1-2022',
      massKg: 798,
      frontShare: 0.45,
      cgHeightMm: 300,
      wheelbaseMm: 3600,
      trackMm: [1695, 1595],
      drive: 'rwd',
      tyres: ['305/43 R18', '405/32 R18'],
      layouts: ['pushrod', 'pushrod'],
    }),
    tyre: 'slick',
    damperF: 'track',
    damperR: 'track',
    thirdSpringNmmF: 40,
    thirdSpringNmmR: 50,
  });
  const kt = tyreVertical(figures.tyre).ktNm;
  const spring = (end: AxleEnd): number => Math.round(springForRideHz(cornerSprungKg(figures, end), kt, axleGeometry(figures, end).mrSpring, F1_RIDE_HZ)) / 1000;
  return resolveChassis({ ...figures, springNmmF: spring('F'), springNmmR: spring('R') });
}

const F1_2022: PageCar = {
  link: suspensionCarLink('pushrod', 'formula-1-2022')!,
  design: f1Design(),
  facts: [
    t('Найменша дозволена маса — 798 кг разом із пілотом, на шинах для сухої траси й без пального.'),
    t('З 2022 року колеса 18-дюймові замість 13-дюймових, а діаметр шини збільшили з 670 до 720 мм. Боковина стала нижчою, тож шина менше прогинається, і геометрія підвіски важить більше.'),
    t('Точки кріплення важелів до кулака мають бути в межах висоти маточини. Раніше верхній важіль ставили на високий виступ кулака, щоб звільнити шлях повітрю, і це заборонили.'),
    t('На 12° повороту керма висота авто на його осі може змінитися щонайбільше на 2 мм. Так заборонили опускати ніс у повільних поворотах, що з 2018 року робила Ferrari: шарнір на кулаці тепер стоїть не далі як за 25 мм від маточини.'),
    t('Передня й задня підвіски мають працювати незалежно: заборонено віддалені допоміжні пружини й амортизатори з гідравлічним керуванням, які ставили, наприклад, у бокові понтони. Усе, що тримає кожен кінець авто, — коромисло, амортизатор підйому, третя пружина, торсіони, стабілізатор — має стояти у своїй зоні.'),
  ],
  sources: [
    'https://en.wikipedia.org/wiki/Formula_One_car',
    'https://www.formula1.com/en/latest/article/tech-tuesday-the-banned-features-that-will-make-a-big-impact-on-2022s-wheel.1DLBALUtPidndI4E8TziHQ',
    'https://the-race.com/formula-1/gary-anderson-2022-f1-rules-give-teams-a-suspension-headache/',
  ],
  unverified: ['frontShare', 'cgHeightMm', 'wheelbaseMm', 'trackMmF', 'trackMmR', 'tyre size', 'springNmmF', 'thirdSpringNmmF'],
};

export const PUSHROD_PAGE: SuspensionPage = {
  id: 'pushrod',
  base: { end: 'F', corner: () => designCorner(TYPICAL_PUSHROD, 'F'), geometry: 'typical', design: () => TYPICAL_PUSHROD },
  cars: [F1_2022],
};
