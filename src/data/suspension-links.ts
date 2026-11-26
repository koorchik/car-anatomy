// The real cars of the suspension pages as other sections link to them: which page shows which car, its name (the
// maker's, the same in every language), the axle the page shows and the catalogue engine the car has on this site. An
// engine article names its car's suspension from here (src/ui/article.ts), without loading the suspension data, its
// designs and its text; the pages' own records (src/data/suspensions/<page>.ts) take these lines, so the two cannot
// differ. One line per car, in the order of the page's list. Nothing here but plain data: the shell's registry loads it.

/** The suspension pages, in the order of the catalogue. The shell's registry takes them from here: a link from another
 *  section may lead to these and no others. */
export const SUSPENSION_PAGE_IDS = ['macpherson', 'double-wishbone', 'multilink', 'pushrod'] as const;
export type SuspensionPageId = (typeof SUSPENSION_PAGE_IDS)[number];

export interface SuspensionCarLink {
  page: SuspensionPageId;
  /** Shared car id: the address is #/suspensions/<page>/<car>. */
  car: string;
  name: string;
  years: string;
  /** The axle the page shows: the one with the page's layout. */
  end: 'F' | 'R';
  /** The car's engine on this site (page/variant), or null when the catalogue does not have it. */
  engine: string | null;
}

export const SUSPENSION_CAR_LINKS: readonly SuspensionCarLink[] = [
  { page: 'macpherson', car: 'civic-type-r-fk8', name: 'Honda Civic Type R (FK8)', years: '2017–2021', end: 'F', engine: 'i4/civic-type-r-k20c1' },
  { page: 'double-wishbone', car: 'mazda-mx5-nd', name: 'Mazda MX-5 (ND)', years: '2015–', end: 'F', engine: null },
  { page: 'double-wishbone', car: 'porsche-911-gt3-992', name: 'Porsche 911 GT3 (992)', years: '2021–', end: 'F', engine: null },
  { page: 'double-wishbone', car: 'chevrolet-corvette-z06-c8', name: 'Chevrolet Corvette Z06 (C8)', years: '2023–', end: 'F', engine: 'v8-flat/corvette-z06-c8-lt6' },
  { page: 'double-wishbone', car: 'subaru-brz-zd8', name: 'Subaru BRZ (ZD8)', years: '2021–', end: 'R', engine: 'b4/gr86-fa24' },
  { page: 'multilink', car: 'mercedes-190-w201', name: 'Mercedes-Benz 190 (W201)', years: '1982–1993', end: 'R', engine: null },
  { page: 'multilink', car: 'toyota-gr-supra-a90', name: 'Toyota GR Supra (A90)', years: '2019–', end: 'R', engine: 'i6/toyota-supra-b58' },
  { page: 'multilink', car: 'vw-golf-7', name: 'Volkswagen Golf 7 2.0 TDI', years: '2012–2020', end: 'R', engine: 'i4d/vw-20-tdi-ea288' },
  { page: 'pushrod', car: 'formula-1-2022', name: 'Formula 1', years: '2022–2025', end: 'F', engine: null },
];

/** The link line of a car on a page, or undefined. */
export const suspensionCarLink = (page: string, car: string): SuspensionCarLink | undefined =>
  SUSPENSION_CAR_LINKS.find((l) => l.page === page && l.car === car);
