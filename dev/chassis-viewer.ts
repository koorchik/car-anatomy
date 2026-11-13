// A real car's chassis on the model viewer (stage P7-geom), shared by its model files: both axles and the glass body,
// standing still, with the steering from lock to lock and the body on or off. Its origin is on the road under the
// centre of mass, as the car overview will place it.

import { CARS } from '../src/data/cars.ts';
import { CHASSIS_CARS } from '../src/data/chassis.ts';
import { DRIVE_CARS } from '../src/data/drive-cars.ts';
import { carChassis } from '../src/suspension/car-chassis.ts';
import { ChassisModel, chassisFrame } from '../src/scene/suspension/chassis-model.ts';
import type { ModelDef } from './model-api.ts';

export function chassisViewer(carId: string, title: string): ModelDef {
  const car = CARS[carId]!;
  const chassis = carChassis(car, CHASSIS_CARS[carId]!, DRIVE_CARS[carId]?.driveline.diffOutputs ?? {});
  return {
    title,
    defaults: { view: 'solid' },
    controls: [
      { key: 'steer', label: 'Кермо, % повного повороту (вліво +)', kind: 'range', min: -100, max: 100, step: 1, value: 0 },
      { key: 'body', label: 'Кузов', kind: 'toggle', value: true },
    ],
    create(values) {
      const model = new ChassisModel(chassis);
      const frame = chassisFrame();
      const draw = (): void => {
        frame.front.rack = ((values.steer as number) / 100) * model.lockRackM;
        model.update(frame);
      };
      model.setBody(values.body as boolean);
      draw();
      return {
        group: model.group,
        // More head-on than the viewer's default: a car is long, and on a phone its nose would leave the frame.
        home: [0.5, 0.55, 1],
        groundY: 0,
        set(key, next) {
          if (key === 'body') model.setBody(next.body as boolean);
          draw();
        },
        setView: (view) => model.setView(view),
        setExplode: (amount) => model.setExplode(amount),
        setHighlight: (on) => model.setHighlight(on),
        setGhost: (alpha) => model.setGhost(alpha),
        part: (key) => model.parts[key],
        dispose: () => model.dispose(),
      };
    },
  };
}
