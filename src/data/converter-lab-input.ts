// What the torque converter's lab (src/drivetrain/converter-lab.ts) runs on the automatic page: the ZF 8HP51 with its
// converter, the GR Supra's B58 from the engine catalogue, and the car as one inertia behind its final drive.
//
// The car's figures come from Toyota GB's technical specifications of the GR Supra (2024, primary, the same document
// as the gearbox's ratios): 3.0 with the 8AT, kerb weight ECE 1570 kg (with a 75 kg driver), rear tyres 275/35 ZR19,
// final drive 3.150. The car has no shared record yet (stage K12b brings it); until then these few numbers live here.

import { catalogueTorqueMap } from '../designer/torque-map.ts';
import type { AutomaticLoad } from '../drivetrain/automatic.ts';
import { gearboxSpec } from '../drivetrain/catalogue.ts';
import type { LabInput } from '../drivetrain/converter-lab.ts';
import { parseTyreSize, rollingRadiusM } from '../vehicle/tyre-size.ts';
import { engineById } from './engines.ts';
import { AUTOMATIC_CAR } from './gearboxes/automatic.ts';
import { gearboxById } from './gearboxes.ts';

/** GR Supra 3.0 8AT, Toyota GB 2024: kerb weight ECE, kg, and the rear tyre. */
const SUPRA_MASS_KG = 1570;
const SUPRA_REAR_TYRE = '275/35 ZR19';
/** Each wheel with its tyre, kg·m² [estimate for a 19-inch wheel]. */
const WHEEL_INERTIA = 1.2;
/**
 * Brake torque at the wheels in the stall test, N·m [estimate]: enough to hold the turbine's torque at stall through
 * first gear (about 15 kN·m), which this lab takes as given; on a car this strong a real stall test asks a lot of the
 * rear brakes.
 */
const STALL_BRAKE_NM = 25000;

/** The lab's input for the automatic page. */
export function automaticLabInput(): LabInput {
  const record = gearboxById('automatic');
  const spec = engineById(AUTOMATIC_CAR.engine);
  if (!record || !spec) throw new Error('converter lab: the automatic page needs its gearbox and engine');
  const radiusM = rollingRadiusM(parseTyreSize(SUPRA_REAR_TYRE));
  const load: AutomaticLoad = {
    wheelInertia: SUPRA_MASS_KG * radiusM * radiusM + 4 * WHEEL_INERTIA,
    finalDrive: AUTOMATIC_CAR.finalDrive,
    brakeNm: STALL_BRAKE_NM,
    radiusM,
  };
  return { spec: gearboxSpec(record), ratedInputNm: record.published.ratedTorqueNm ?? 500, map: catalogueTorqueMap(spec), load };
}
