// Builds a load from its description, the same way on the audio thread and the main thread.

import { VehicleLoad } from '../vehicle/vehicle-load.ts';
import { DynoLoad } from './dyno-load.ts';
import type { CrankLoad, LoadSpec } from './load.ts';

export function createLoad(spec: LoadSpec): CrankLoad {
  switch (spec.kind) {
    case 'dyno':
      return new DynoLoad(spec);
    case 'vehicle':
      return new VehicleLoad(spec);
  }
}
