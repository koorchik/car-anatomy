// The designer's controls as the model sees them: which design key each one moves, what kind of value it takes, and on
// which designs it means anything (a layout's own geometry, a split knuckle's offset, an own damper's coefficients).
// The page (P8c) gives them their names, help and groups; the sensitivity checks (sensitivity.ts) and the test that no
// control is dead walk this list. No text here.
//
// Every control changes a figure of the model on the designs it applies to (tests: "no control is dead"); a control
// that only changes the looks would carry `only: 'looks'`, and none does yet. `car` is not a control: it says which
// real car the design started from (to-spec.ts).

import {
  axleOf, DAMPER_CHOICES, DRIVES, FRONT_LAYOUTS, isDriven, isPivot, isSolid, isWishbone, KNUCKLES, REAR_LAYOUTS,
  SOLID_LATERALS, SOLID_LINKS, TYRES, type AxleEnd, type AxleKey, type AxleParams, type ChassisDesign, type DesignKey,
} from './design.ts';

export interface ChassisControl {
  key: DesignKey;
  /** 'spring' is a number that may be null (the typical rate). */
  kind: 'number' | 'choice' | 'toggle' | 'spring';
  /** The values of a choice on this design. */
  options?: (d: ChassisDesign) => readonly (string | number)[];
  /** Whether the control means anything on this design; absent: always. */
  applies?: (d: ChassisDesign) => boolean;
  only?: 'looks';
}

/** Whether an axle's differential sits on the axle (a driven live axle): the final drive then reacts on it. */
const diffOnAxle = (d: ChassisDesign, end: AxleEnd): boolean => isDriven(d.drive, end) && axleOf(d, end).layout === 'live-axle';

const CAR_CONTROLS: readonly ChassisControl[] = [
  { key: 'massKg', kind: 'number' },
  { key: 'frontShare', kind: 'number' },
  { key: 'cgHeightMm', kind: 'number' },
  { key: 'wheelbaseMm', kind: 'number' },
  { key: 'drive', kind: 'choice', options: () => DRIVES },
  { key: 'brakeFront', kind: 'number' },
  { key: 'driveFront', kind: 'number', applies: (d) => d.drive === 'awd' },
  { key: 'finalDrive', kind: 'number', applies: (d) => diffOnAxle(d, 'F') || diffOnAxle(d, 'R') },
  { key: 'tyre', kind: 'choice', options: () => TYRES },
];

type AxleRule = (a: AxleParams, end: AxleEnd, d: ChassisDesign) => boolean;

const strut: AxleRule = (a) => a.layout === 'macpherson';
const split: AxleRule = (a) => a.layout === 'macpherson' && a.knuckle !== 'plain';
const wishbone: AxleRule = (a) => isWishbone(a.layout);
/** A steering axis the design draws: a split strut knuckle's or the ball joints' of a double wishbone or multilink. */
const axis: AxleRule = (a, end, d) => split(a, end, d) || wishbone(a, end, d);
const pivot: AxleRule = (a) => isPivot(a.layout);
const armed: AxleRule = (a) => a.layout === 'trailing-arm' || a.layout === 'semi-trailing';
/** A pivot axis that is not square across the car: sliding it along itself or tilting it about itself changes nothing
 *  on a trailing arm. */
const swept: AxleRule = (a) => a.layout === 'semi-trailing' || a.layout === 'swing-axle';
const beam: AxleRule = (a) => a.layout === 'twist-beam';
const solid: AxleRule = (a) => isSolid(a.layout);
const linked: AxleRule = (a) => isSolid(a.layout) && a.solidLateral !== 'leaf';
const rodLateral: AxleRule = (a) => isSolid(a.layout) && (a.solidLateral === 'panhard' || a.solidLateral === 'watt');
const adjustable: AxleRule = (a) => a.layout !== 'swing-axle';
/** Half-shafts with an inner joint the design places: a driven axle with the differential on the body (a swing axle's
 *  joint is its pivot). */
const shafts: AxleRule = (a, end, d) => isDriven(d.drive, end) && a.layout !== 'swing-axle' && a.layout !== 'live-axle';
const ownDamper: AxleRule = (a) => a.damper === 'custom';
const withBar: AxleRule = (a) => a.barMm > 0;
/** Inboard brakes change where the brake torque reacts only where the hub and the differential are on different
 *  parts: not on a live axle (the differential turns with it) nor on a swing axle (the shaft is the arm). On a de Dion
 *  tube whose links keep it from pitching the two react alike, and the figures stay. */
const inboard: AxleRule = (a, end, d) => isDriven(d.drive, end) && a.layout !== 'live-axle' && a.layout !== 'swing-axle';

interface AxleControl {
  key: AxleKey;
  kind: ChassisControl['kind'];
  options?: (d: ChassisDesign, end: AxleEnd) => readonly string[];
  applies?: AxleRule;
  /** The one end whose layouts have this parameter (the front has only steered corners, the rear no strut). */
  end?: AxleEnd;
}

const AXLE_CONTROLS: readonly AxleControl[] = [
  {
    key: 'layout',
    kind: 'choice',
    // A twist beam carries no half-shafts.
    options: (d, end) => (end === 'F' ? FRONT_LAYOUTS : REAR_LAYOUTS.filter((l) => l !== 'twist-beam' || !isDriven(d.drive, 'R'))),
  },
  { key: 'trackMm', kind: 'number' },
  { key: 'knuckle', kind: 'choice', options: () => KNUCKLES, applies: strut, end: 'F' },
  { key: 'kingpinOffsetMm', kind: 'number', applies: split, end: 'F' },
  { key: 'kpiDeg', kind: 'number', applies: axis },
  { key: 'casterDeg', kind: 'number', applies: wishbone },
  { key: 'scrubMm', kind: 'number', applies: wishbone },
  { key: 'lowerArmMm', kind: 'number', applies: wishbone },
  { key: 'upperArmMm', kind: 'number', applies: wishbone },
  { key: 'upperAngleDeg', kind: 'number', applies: wishbone },
  { key: 'lowerPivotZMm', kind: 'number', applies: wishbone },
  { key: 'lowerBallZMm', kind: 'number', applies: wishbone },
  { key: 'upperBallZMm', kind: 'number', applies: wishbone },
  { key: 'svAngleDeg', kind: 'number', applies: wishbone },
  { key: 'tieRodDzMm', kind: 'number', applies: wishbone },
  { key: 'sweepDeg', kind: 'number', applies: (a) => a.layout === 'semi-trailing', end: 'R' },
  { key: 'pivotArmMm', kind: 'number', applies: armed, end: 'R' },
  { key: 'pivotYMm', kind: 'number', applies: swept, end: 'R' },
  { key: 'pivotDzMm', kind: 'number', applies: pivot, end: 'R' },
  { key: 'pivotSvDeg', kind: 'number', applies: swept, end: 'R' },
  { key: 'beamPos', kind: 'number', applies: beam, end: 'R' },
  { key: 'shearDzMm', kind: 'number', applies: beam, end: 'R' },
  { key: 'beamArmMm', kind: 'number', applies: beam, end: 'R' },
  { key: 'beamBushInMm', kind: 'number', applies: beam, end: 'R' },
  { key: 'beamBushDzMm', kind: 'number', applies: beam, end: 'R' },
  { key: 'beamTorsionNmRad', kind: 'number', applies: beam, end: 'R' },
  { key: 'solidLateral', kind: 'choice', options: () => SOLID_LATERALS, applies: solid, end: 'R' },
  { key: 'solidLinks', kind: 'choice', options: () => SOLID_LINKS, applies: rodLateral, end: 'R' },
  { key: 'lowerLinkMm', kind: 'number', applies: linked, end: 'R' },
  { key: 'upperLinkMm', kind: 'number', applies: linked, end: 'R' },
  { key: 'linkAngleDeg', kind: 'number', applies: linked, end: 'R' },
  { key: 'upperLinkAngleDeg', kind: 'number', applies: linked, end: 'R' },
  { key: 'lateralZMm', kind: 'number', applies: rodLateral, end: 'R' },
  { key: 'diffOutputYMm', kind: 'number', applies: shafts },
  { key: 'diffOutputDzMm', kind: 'number', applies: shafts },
  { key: 'camberDeg', kind: 'number', applies: adjustable },
  { key: 'toeDeg', kind: 'number', applies: adjustable },
  { key: 'springNmm', kind: 'spring' },
  { key: 'damper', kind: 'choice', options: () => DAMPER_CHOICES },
  { key: 'damperCompression', kind: 'number', applies: ownDamper },
  { key: 'damperRebound', kind: 'number', applies: ownDamper },
  { key: 'damperKneeMs', kind: 'number', applies: ownDamper },
  { key: 'damperHighRatio', kind: 'number', applies: ownDamper },
  { key: 'barMm', kind: 'number' },
  { key: 'barWallMm', kind: 'number', applies: withBar },
  { key: 'barArmMm', kind: 'number', applies: withBar },
  { key: 'unsprungKg', kind: 'number' },
  { key: 'tyreWidthMm', kind: 'number' },
  { key: 'tyreAspect', kind: 'number' },
  { key: 'rimIn', kind: 'number' },
  { key: 'brakeInboard', kind: 'toggle', applies: inboard },
];

/** Every control of the designer: the car's, then the front axle's, then the rear's. */
export const CHASSIS_CONTROLS: readonly ChassisControl[] = [
  ...CAR_CONTROLS,
  ...(['F', 'R'] as const).flatMap((end) =>
    AXLE_CONTROLS.filter((c) => !c.end || c.end === end).map(({ key, kind, options, applies }): ChassisControl => ({
      key: `${key}${end}` as DesignKey,
      kind,
      options: options && ((d) => options(d, end)),
      applies: applies && ((d) => applies(axleOf(d, end), end, d)),
    })),
  ),
];

/** The controls that mean something on this design. */
export const controlsFor = (d: ChassisDesign): ChassisControl[] => CHASSIS_CONTROLS.filter((c) => !c.applies || c.applies(d));

/** The axle and the bare key of an axle control ('springNmmR' → ['R', 'springNmm']), or null for a car control. */
export function axleControl(key: DesignKey): [AxleEnd, AxleKey] | null {
  const end = key.at(-1);
  if (end !== 'F' && end !== 'R') return null;
  const bare = key.slice(0, -1) as AxleKey;
  return (AXLE_CONTROLS.some((c) => c.key === bare) ? [end, bare] : null);
}
