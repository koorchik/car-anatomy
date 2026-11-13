// Every colour that carries a meaning on the site (the plan of the whole car, «Візуальна мова» → «Кольори»): the
// fluids and gases of the systems layers, the gases of the strokes, the power path, damage, highlights, marks, lasers
// and the force arrows. Sections take them from here, so the same thing has the same colour everywhere: the oil in the
// sump, in the oil layer and in a damper in the X-ray is one colour.
//
// The colours of the parts themselves (steel, cast aluminium, rubber, glass) are materials and stay in materials.ts.
// Plain strings without Three.js, so a legend in the interface takes them without the 3D code.
//
// The rule that keeps them apart: dashes that run in a pipe are a fluid or a gas; a part that glows shows mechanical
// power or the heat of friction. So the warm glow of a gearbox's power path never reads as hot charge air.

/** Fluids and gases of the systems layers: the colour of the running dashes, and where each turns when hot. */
export const FLUID = {
  oil: '#e8a93a',
  oilHot: '#ffd27a',
  /** The dark glow oil gives off in the sump, the sight glass and the puddles of the oil page. */
  oilGlow: '#5a3405',
  /** The oil layer's own flat surface in the sump. */
  oilSurface: '#c98a1c',
  oilSurfaceGlow: '#6a3c05',
  /** Coolant goes cold → working → overheated. */
  coolantCold: '#3fa9f5',
  coolant: '#2fd3a0',
  coolantHot: '#ff5a3c',
  fuel: '#e0559b',
  fuelHot: '#ffd0e8',
  /** The same blue as the intake stroke's gas (GAS_COLORS.intake). */
  air: '#62c6ec',
  /** Compressed and heated by a compressor. */
  airHot: '#f0a060',
  /** Charge air the intercooler has cooled again. */
  airCooled: '#bfe6ff',
} as const;

/** Sparks and glows of the systems layers' fuel and ignition. */
export const SPARK = {
  /** A spark at a plug: the default flash of a layer. */
  plug: '#cfe6ff',
  /** A coil-on-plug's own spark. */
  coil: '#9fd0ff',
  /** A diesel's glow plug. */
  glowPlug: '#ff7a2a',
} as const;

/** Gas colours by stroke, shared by piston and rotary engines. */
export const GAS_COLORS = {
  intake: '#62c6ec',
  compression: '#bfe4ff',
  flash: '#fff0c8',
  fire: '#ff7a1a',
  smoke: '#8a6a55',
  exhaust: '#6a635c',
  /** The light a combustion throws on the chamber walls. */
  flame: '#ff8a3a',
} as const;

/** A part that failed (markDamaged), and a part past its limit (a bump stop squeezed hard, a joint over its angle). */
export const DAMAGE = '#ff2a10';

/** The gearbox's power path: warm orange, as bright as the share of the input power a mesh carries. */
export const POWER = '#ea6a15';

/** Hover highlight of a whole system in the car overview, as each section tints its own materials. */
export const HIGHLIGHT = {
  gearbox: '#3d7fd9',
  suspension: '#ffb35c',
} as const;

/** Marks that read an angle or a position: the phaser's marks and the cam switch's pin. */
export const MARK = {
  vvt: '#ffd23f',
  vvtGlow: '#5a4300',
} as const;

/** The oil page's pickup ring when it draws air. */
export const STARVED = '#ff3b2f';

/**
 * The engine's inertia forces (balance-arrows.ts), shared with their legend. Never shown together with the
 * suspension's forces, so the two sets keep their own colours; white is a sum in both.
 */
export const BALANCE_FORCE = {
  order1: '#ffbf3c',
  order2: '#b48cff',
  rotating: '#6fa8ff',
  counterweight: '#63e28c',
  shaft: '#4fd2e0',
  net: '#ffffff',
  couple: '#ff5c93',
  /** The connecting rods drawn with the arrows. */
  rod: '#5d7c84',
} as const;

/**
 * The suspension's forces on the wheel (suspensions plan, 3D overlays; whole-car plan, force arrows: white is a sum,
 * grey a weight, yellow the tyre).
 */
export const SUSPENSION_FORCE = {
  spring: '#3ccf6e',
  damper: '#3d8bff',
  /** The bump stop is an elastic element like the spring: a paler green. */
  stop: '#a8f0c6',
  links: '#ff9b3d',
  tyre: '#ffd23d',
  weight: '#a3abb0',
} as const;

/** The overlays' own white: arrows whose instances carry their colour, a sum. */
export const OVERLAY_WHITE = '#ffffff';

/** The suspension's measuring lines: the camber laser, its plumb line and the schematic's axes. */
export const MEASURE = {
  laser: '#ff3b30',
  plumb: '#d8e2e6',
  /** A bush's axis, dashed. */
  bushAxis: '#ffd27a',
  /** The steering axis, dashed down to the road. */
  steerAxis: '#ff9b3d',
  /** The wheel's circle in the schematic. */
  wheel: '#9fb6bf',
} as const;
