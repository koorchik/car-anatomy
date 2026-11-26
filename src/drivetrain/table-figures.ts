// Figures of a gearbox on the table that the page shows beside the 3D: road speed in each gear and how far the revs
// drop at each upshift. Pure arithmetic on ratios, shared by the settings panel and its tests.

/** Road speed, km/h, with the engine at `engineRpm` through an overall gearbox ratio, the final drive and a rolling radius in metres. */
export const roadSpeedKmh = (engineRpm: number, gearRatio: number, finalDrive: number, rollingRadiusM: number): number =>
  ((engineRpm / (gearRatio * finalDrive)) * 2 * Math.PI * rollingRadiusM * 60) / 1000;

export interface ShiftDrop {
  /** Gear shifted from, from 1. */
  from: number;
  /** Revs before and after the shift, the road speed held. */
  before: number;
  after: number;
}

/** Each upshift at `shiftRpm`: the revs fall by the ratio of the two gears. */
export function shiftDrops(ratios: readonly number[], shiftRpm: number): ShiftDrop[] {
  const drops: ShiftDrop[] = [];
  for (let i = 0; i + 1 < ratios.length; i++) drops.push({ from: i + 1, before: shiftRpm, after: (shiftRpm * ratios[i + 1]!) / ratios[i]! });
  return drops;
}
