// The torque converter lab's run for the automatic page, a chunk of its own: the engine's torque map comes from the
// designer's model (designer/torque-map.ts), whose words load with it (the 'presets' dictionary), as for the manual
// pages' car mode.

import { automaticLabInput } from '../../../data/converter-lab-input.ts';
import { runConverterLab, type ConverterLabRun } from '../../../drivetrain/converter-lab.ts';

export const automaticLabRun = (): ConverterLabRun => runConverterLab(automaticLabInput());
