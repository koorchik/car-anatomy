import type { GearboxArticle } from '../../drivetrain/catalogue.ts';
import type { GearboxTextEn } from './apply-gearbox.ts';

/** English for the automatic gearbox page, by record id. */
export const GEARBOX_AUTOMATIC_EN: Record<string, GearboxTextEn> = {
  automatic: {
    verifyNote:
      'The gear ratios, the reverse and the final drive come from Toyota\'s 2024 technical specifications of the GR Supra. We took the gearset teeth 48/96, 54/96, 60/96 and 24/102, the joins between the sets and the shift matrix from the English Wikipedia, ' +
      'which cites a ZF repair manual for sets 1 and 2. These teeth reproduce every Toyota figure to the last digit. The 500 N·m torque rating is from Wikipedia too. ' +
      'The sources do not say how many planets each set has. They can be spaced evenly only if the sun and ring teeth add up to a multiple of the planet count: 144 allows 3, 4 or 6, 150 allows 3, 5 or 6, 156 allows 3, 4 or 6, 126 allows 3 or 6. ' +
      'We took the largest count up to five that leaves room for the carrier\'s posts between the planets: 4, 5, 4 and 3. The 1.75 mm module, the face widths, the straight-cut teeth and the places of the sets and plate packs along the axis are our estimates.',
  },
};

/** English for the automatic page's article. */
export const GEARBOX_AUTOMATIC_ARTICLE_EN: GearboxArticle = {
  lead:
    'A torque-converter automatic has no gears to slide into mesh: all its gears are always in mesh. Clutches and brakes pick the gear by joining parts of planetary gearsets to each other or holding them to the case. ' +
    'The eight speeds of the ZF 8HP come from four planetary gearsets and five shift elements, three of which are closed in every gear.',
  how:
    'A planetary gearset is a sun gear in the middle, a ring gear with its teeth inside, and planets between them on a carrier. When any two of the three turn at known speeds, the third is set too: z_s·ω_s + z_r·ω_r = (z_s + z_r)·ω_c. ' +
    'In the 8HP, parts of different sets are joined for good, so together the four sets have four degrees of freedom. Each closed element takes one away, and three closed ones leave exactly one motion: the output turns at a fixed speed relative to the input, and that is the gear. ' +
    'The speeds of a set\'s parts lie on one straight line when they are placed on a lever at distances proportional to the teeth: this is how engineers read an automatic, and it is the lever diagram next to the model. ' +
    'Neighboring gears differ by one element only, so a shift is one clutch letting go while another closes, and the torque never drops out.',
  sound:
    'Planetary gearsets are quiet: the torque is shared between several planets, and each set has many meshes. In sixth gear the whole mechanism turns as one piece, and no mesh rolls at all. ' +
    'For now this page plays only the engine; the torque converter and automatic shifting come later.',
  pros: [
    'The gears are always in mesh and one clutch changes the gear: shifts without a break in pull',
    'Eight speeds with a ratio span of 8.2 from four gearsets, because each set works in several gears',
    'Compact: the sets sit on one axis and the planets share the torque',
  ],
  cons: [
    'Open clutches spin in oil and their drag takes a little power',
    'More complex than a manual: hydraulic control, a pump and a valve body',
    'The ratios are set by the teeth of the sets, so one cannot be changed without touching others',
  ],
  cars: [
    'Toyota GR Supra A90 with the B58 engine: ZF 8HP51',
    'BMW 3 Series G20, Z4 G29: ZF 8HP51',
    'Ineos Grenadier, gasoline: ZF 8HP51',
  ],
};
