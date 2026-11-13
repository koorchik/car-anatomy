// A transaxle of the manual-transaxle page on the table (stage K6a-3d), shared by its two model files: the input
// shaft is turned, the differential turns free, the buttons pick N, the speeds or R. Sleeves travel in 0.2 s and the
// power path glows in proportion to the power each mesh rolls: the speed's pair and the final drive in every gear.
// The car toggle reaches the stubs to the car's inner joints (DriveCar.diffOutputs and its mirror), as the overview will.

import { CARS } from '../src/data/cars.ts';
import { DRIVE_CARS } from '../src/data/drive-cars.ts';
import { engineById } from '../src/data/engines.ts';
import { gearboxById } from '../src/data/gearboxes.ts';
import { gearboxSpec } from '../src/drivetrain/catalogue.ts';
import { TableDrive } from '../src/drivetrain/table-drive.ts';
import { buildGearbox } from '../src/drivetrain/topology.ts';
import { buildEngine } from '../src/engine/kinematics.ts';
import { GEARBOX_PARTS } from '../src/scene/gearbox/parts.ts';
import { TransaxleModel } from '../src/scene/gearbox/transaxle-model.ts';
import { transaxleStubs } from '../src/vehicle/gearbox-place.ts';
import { flywheelRadiusMm } from '../src/vehicle/packaging.ts';
import type { ModelDef } from './model-api.ts';

export function transaxleViewer(recordId: string, title: string): ModelDef {
  const record = gearboxById(recordId)!;
  const spec = gearboxSpec(record);
  const box = buildGearbox(spec);
  const car = record.car ? CARS[record.car] : undefined;
  const drive = car ? DRIVE_CARS[car.id] : undefined;
  const joint = drive ? (drive.driveline.diffOutputs.front ?? drive.driveline.diffOutputs.rear) : undefined;
  const engine = car ? buildEngine(engineById(car.engine)!) : undefined;
  const stubs = car && engine && joint ? transaxleStubs(car, engine, spec, joint) : undefined;
  // The bellhousing wraps the flywheel the car's engine model draws.
  const flywheel = engine ? flywheelRadiusMm(engine) : undefined;
  const gears = box.states.map((s) => s.name);
  return {
    title,
    defaults: { view: 'xray' },
    controls: [
      { key: 'gear', label: 'Передача', kind: 'choice', buttons: true, value: 'N', options: gears.map((v) => ({ value: v, label: v })) },
      { key: 'rpm', label: 'Первинний вал, об/хв', kind: 'range', min: 0, max: 1200, step: 10, value: 60 },
      { key: 'glow', label: 'Шлях потужності', kind: 'toggle', value: true },
      { key: 'car', label: 'Піввісі до ШРУСів авто', kind: 'toggle', value: false, rebuild: true },
      {
        key: 'quality',
        label: 'Деталізація',
        kind: 'choice',
        rebuild: true,
        value: 'high',
        options: [
          { value: 'high', label: 'Повна' },
          { value: 'low', label: 'Телефон' },
        ],
      },
    ],
    create(values) {
      const model = new TransaxleModel(box, {
        quality: values.quality === 'low' ? 'low' : 'high',
        ...(flywheel ? { flywheelRadiusMm: flywheel } : {}),
        ...(values.car && stubs ? { stubs } : {}),
      });
      const table = new TableDrive(box, gears.includes(values.gear as string) ? (values.gear as string) : 'N');
      const pose = table.frame();
      const unlit = { angles: pose.angles, sleeves: pose.sleeves, meshPower: box.meshes.map(() => 0) };
      const draw = () => model.update(values.glow ? pose : unlit);
      draw();
      return {
        group: model.group,
        // More from the engine's side than the viewer's default: the boxes are long, and on a phone the bellhousing
        // would leave the frame.
        home: [0.35, 0.5, 1],
        groundY: 0,
        frame(_time, dt) {
          table.step(dt, values.rpm as number);
          draw();
        },
        set(key, next) {
          if (key === 'gear') table.select(next.gear as string);
          draw();
        },
        setView: (view) => model.setView(view),
        setExplode: (amount) => model.setExplode(amount),
        setHighlight: (on) => model.setHighlight(on),
        setGhost: (alpha) => model.setGhost(alpha),
        part: (key) => GEARBOX_PARTS[key],
        dispose: () => model.dispose(),
      };
    },
  };
}
