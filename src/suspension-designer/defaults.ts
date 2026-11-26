// Typical values of the designer: what each layout's template takes by default, written as design parameters, and the
// default design (a typical compact front-wheel-drive car). Nothing here is a real car's: the geometry is the templates'
// typical geometry (src/suspension/templates/), the masses the research's worked examples (docs/research/suspensions.md,
// 3.3 and 13.2), the bars and unsprung masses the typical chassis' sizes; every number is an estimate.

import { jtektKingpinOffsetM, SPLIT_KNUCKLE_DEFAULTS } from '../suspension/templates/macpherson.ts';
import { multilinkDefaults } from '../suspension/templates/multilink.ts';
import { wishboneDefaults } from '../suspension/templates/double-wishbone.ts';
import { pushrodDefaults } from '../suspension/templates/pushrod.ts';
import { PIVOT_TYPICAL } from '../suspension/templates/pivot.ts';
import { TWIST_BEAM_TYPICAL } from '../suspension/templates/twist-beam.ts';
import { SOLID_TYPICAL } from '../suspension/templates/solid-axle.ts';
import { TYPICAL_BRAKE_FRONT, TYPICAL_FINAL_DRIVE } from '../suspension/templates/typical-chassis.ts';
import { designOf, type AxleEnd, type AxleParams, type CarParams, type ChassisDesign, type DesignLayout } from './design.ts';

const mm = (m: number): number => Math.round(m * 1e6) / 1e3;

/** The steering gear a front layout brings; nothing at the rear, which is not steered. Leaving a live axle keeps its
 *  box: a box with a centre link and an idler arm steers an independent axle too. */
const steeredBy = (gear: AxleParams['steeringGear'], end: AxleEnd): Partial<AxleParams> => (end === 'F' ? { steeringGear: gear } : {});

/** The typical values of a layout's own parameters on one end of the car. */
export function layoutDefaults(layout: DesignLayout, end: AxleEnd): Partial<AxleParams> {
  const axle = end === 'F' ? 'front' : 'rear';
  switch (layout) {
    case 'macpherson': {
      const split = SPLIT_KNUCKLE_DEFAULTS['dual-axis'];
      return { knuckle: 'plain', kingpinOffsetMm: mm(split.kingpinOffsetM), kpiDeg: split.kpiDeg, diffOutputYMm: 250, diffOutputDzMm: 0, unsprungKg: 40 };
    }
    case 'double-wishbone':
    case 'multilink':
    case 'pushrod': {
      const it = layout === 'multilink' ? multilinkDefaults(axle) : wishboneDefaults(axle);
      const rocker = pushrodDefaults(axle);
      return {
        ...(layout === 'pushrod' ? { rockerRatio: rocker.rockerRatio, rockerProgressionDeg: rocker.progressionDeg, thirdSpringNmm: 0 } : {}),
        lowerArmMm: mm(it.lowerArmM),
        upperArmMm: mm(it.upperArmM),
        upperAngleDeg: it.upperAngleDeg,
        lowerPivotZMm: mm(it.lowerPivotZM),
        lowerBallZMm: mm(it.lowerBallZM),
        upperBallZMm: mm(it.upperBallZM),
        svAngleDeg: it.svAngleDeg,
        kpiDeg: it.kpiDeg,
        casterDeg: it.casterDeg,
        scrubMm: mm(it.scrubM),
        tieRodDzMm: 0,
        diffOutputYMm: mm(it.diffOutputYM),
        diffOutputDzMm: 0,
        unsprungKg: 40,
      };
    }
    case 'trailing-arm':
    case 'semi-trailing':
    case 'swing-axle': {
      const it = PIVOT_TYPICAL[layout];
      return {
        sweepDeg: it.sweepDeg,
        pivotArmMm: mm(it.armM),
        pivotYMm: mm(it.pivotYM),
        pivotDzMm: mm(it.pivotZM - it.wheelCentreZM),
        pivotSvDeg: it.svAngleDeg,
        diffOutputYMm: mm(it.diffOutputYM),
        diffOutputDzMm: 0,
        unsprungKg: 40,
      };
    }
    case 'twist-beam': {
      const it = TWIST_BEAM_TYPICAL;
      return {
        beamPos: it.beamPos,
        shearDzMm: mm(it.shearCentreDzM),
        beamArmMm: mm(it.armM),
        beamBushInMm: mm(it.trackM / 2 - it.pivotYM),
        beamBushDzMm: mm(it.pivotZM - it.wheelCentreZM),
        beamTorsionNmRad: it.torsionNmPerRad,
        unsprungKg: 40,
      };
    }
    case 'live-axle':
    case 'de-dion': {
      const it = layout === 'de-dion' ? SOLID_TYPICAL.deDion : SOLID_TYPICAL.panhard;
      return {
        solidLateral: it.lateral,
        solidLinks: it.links,
        lowerLinkMm: mm(it.lowerLinkM),
        upperLinkMm: mm(it.upperLinkM),
        linkAngleDeg: it.linkAngleDeg,
        upperLinkAngleDeg: it.upperAngleDeg,
        lateralZMm: mm(it.lateralZM),
        diffOutputYMm: mm(it.diffOutputYM),
        diffOutputDzMm: 0,
        // Half an axle housing with its differential (or half a de Dion tube) on top of the wheel: the typical chassis'
        // 60 kg, an estimate.
        unsprungKg: layout === 'live-axle' ? 60 : 50,
        // A steered live axle has a box and a pitman arm (decision 20).
        ...steeredBy('recirculating-ball', end),
      };
    }
  }
}

/** Every axle parameter at a typical value, before the layout's own (layoutDefaults). */
function baseAxle(end: AxleEnd): AxleParams {
  const front = end === 'F';
  return {
    layout: front ? 'macpherson' : 'multilink',
    trackMm: front ? 1550 : 1540,
    knuckle: 'plain',
    kingpinOffsetMm: mm(jtektKingpinOffsetM() / 2),
    kpiDeg: front ? 9.5 : 6,
    casterDeg: front ? 5.5 : 0,
    scrubMm: front ? 0 : 20,
    lowerArmMm: 380,
    upperArmMm: 270,
    upperAngleDeg: front ? 5 : 1.64,
    lowerPivotZMm: front ? 143 : 165,
    lowerBallZMm: 130,
    upperBallZMm: 470,
    svAngleDeg: front ? 5 : 6,
    tieRodDzMm: 0,
    sweepDeg: 15,
    pivotArmMm: 350,
    pivotYMm: 200,
    pivotDzMm: 0,
    pivotSvDeg: 0,
    beamPos: 0.35,
    shearDzMm: 0,
    beamArmMm: 450,
    beamBushInMm: 100,
    beamBushDzMm: 0,
    beamTorsionNmRad: 2000,
    rockerRatio: 1,
    rockerProgressionDeg: 15,
    thirdSpringNmm: 0,
    solidLateral: 'panhard',
    solidLinks: 'four',
    lowerLinkMm: 550,
    upperLinkMm: 400,
    linkAngleDeg: 4,
    upperLinkAngleDeg: 4,
    lateralZMm: 400,
    diffOutputYMm: front ? 250 : 170,
    diffOutputDzMm: 0,
    camberDeg: 0,
    toeDeg: 0,
    springNmm: null,
    springKind: 'coil',
    damper: 'comfort',
    // About what the «comfort» preset gives the default car (to-spec.ts), so switching to 'custom' starts near it.
    damperCompression: 2500,
    damperRebound: 5500,
    // The templates' knee and the slope past it (to-spec.ts used them for every own damper before they were parameters).
    damperKneeMs: 0.1,
    damperHighRatio: 0.5,
    // The typical chassis' bars: 22 mm in front, 16 mm at the rear, solid, on 0.2 m arms (estimates).
    barMm: front ? 22 : 16,
    barWallMm: 0,
    barArmMm: 200,
    unsprungKg: 40,
    tyreWidthMm: 225,
    tyreAspect: 45,
    rimIn: 17,
    brakeInboard: false,
    // Steering: a rack, 50 mm a turn, which gives the typical strut about 14:1 overall; a box of 16:1 when the
    // design takes one; a constant ratio; an electric motor on the column, as compact cars have it; the template's
    // steering arms; a level drag link on a steered axle. Estimates.
    steeringGear: 'rack',
    rackMmPerRev: 50,
    boxRatio: 16,
    variableRatio: 1,
    assist: 'electric-column',
    ackermann: null,
    dragLinkDeg: 0,
  };
}

/** An axle of `layout` with every parameter typical. */
export function typicalAxle(layout: DesignLayout, end: AxleEnd): AxleParams {
  return { ...baseAxle(end), ...layoutDefaults(layout, end), layout };
}

/** The default design: a typical compact front-wheel-drive car on a strut and a multilink, the research's worked
 *  example in mass and centre of mass (1400 kg, 60 % in front, 0.55 m); estimates throughout. */
export const DEFAULT_CAR: CarParams = {
  car: null,
  massKg: 1400,
  frontShare: 0.6,
  cgHeightMm: 550,
  wheelbaseMm: 2650,
  drive: 'fwd',
  brakeFront: TYPICAL_BRAKE_FRONT,
  driveFront: 0.5,
  finalDrive: TYPICAL_FINAL_DRIVE,
  tyre: 'street',
  dampers: 'passive',
};

export const DEFAULT_CHASSIS: ChassisDesign = Object.freeze(designOf(DEFAULT_CAR, typicalAxle('macpherson', 'F'), typicalAxle('multilink', 'R')));
