// The car mode of a gearbox page (stage K3a, the smallest version): the page's car on its drivetrain as the
// load on the shared Drive's crank. The engine drives the clutch, the gearbox the panel has set, the final drive, the
// wheels and the car along the road (VehicleLoad); the audio thread steps it while sound is on and the main-thread copy
// otherwise, and Drive hands the car's state between them, so muting mid-drive keeps the speed.
//
// The dash reads only drive.snapshot() (car-readings.ts): the speed, the gear, the clutch. The gear buttons and keys
// ask for a gear and the auto clutch, always on here, does the rest; B and the brake pedal brake. The 3D turns every
// member of the box by the drivetrain's base angles (DrivePose), and the inset shows a driven wheel on the road.

import type { Drive, DriveSnapshot } from '../../audio/drive.ts';
import { carById } from '../../data/cars.ts';
import { driveCarById } from '../../data/drive-cars.ts';
import { engineById } from '../../data/engines.ts';
import { catalogueTorqueMap } from '../../designer/torque-map.ts';
import { vehicleLoadSpec } from '../../drivetrain/car-load.ts';
import { carDriveOf, type CarDrive, type CarDriveRecords } from '../../drivetrain/car-model.ts';
import type { GearboxRecord } from '../../drivetrain/catalogue.ts';
import { DrivePose } from '../../drivetrain/drive-pose.ts';
import type { LayshaftDesc } from '../../drivetrain/layouts/layshaft.ts';
import type { TablePose } from '../../drivetrain/table-drive.ts';
import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import { carReadings, type ClutchState } from './car-readings.ts';
import { WheelRoad } from './wheel-road.ts';

/** The brake key eases the pedal toward this far, of floored [estimate: a firm stop that does not lock dry tyres]. */
const KEY_BRAKE = 0.6;
/** How fast the brake key presses and lets go, 1/s. */
const KEY_RATE_ON = 5;
const KEY_RATE_OFF = 12;

const num = (v: number): string => v.toLocaleString(numberLocale, { maximumFractionDigits: 0 });

const CLUTCH_TEXT: Record<ClutchState, () => string> = {
  locked: () => t('замкнене'),
  slipping: () => t('ковзає'),
  open: () => t('розімкнене'),
};

/**
 * The records of a page's car with the box and the final drive the panel has set: the car drives what the visitor sees
 * on the table. The engine's torque map is the catalogue's, as on the dyno.
 */
export function pageCarRecords(carId: string, gearbox: GearboxRecord, desc: LayshaftDesc, finalDrive: number): CarDriveRecords {
  const car = carById(carId);
  const drive = driveCarById(carId);
  const engine = car && engineById(car.engine);
  if (!car || !drive || !engine) throw new Error(`${carId}: the car mode needs the car, its drive record and its engine`);
  return {
    car,
    drive: { ...drive, finalDrive: { ...drive.finalDrive, ratio: finalDrive } },
    gearbox: { ...gearbox, layout: { kind: 'layshaft', desc } },
    map: catalogueTorqueMap(engine),
  };
}

export class CarMode {
  private readonly root: HTMLElement;
  private readonly drive: () => Drive;
  readonly inset: WheelRoad;
  private cd: CarDrive | null = null;
  private pose: DrivePose | null = null;
  /** The driven wheel the inset shows. */
  private wheel = 2;
  /** The brake: from the pedal on screen, from the key, and what was last sent. */
  private brakePointer = 0;
  private brakeKey = false;
  private brakeKeyValue = 0;
  private brakeSent = -1;
  private shown = { kmh: '', gear: '', speed: '', clutch: '' };

  constructor(root: HTMLElement, drive: () => Drive) {
    this.root = root;
    this.drive = drive;
    this.inset = new WheelRoad(root);
    const pedal = this.el('gbx-brake');
    const fromPointer = (event: PointerEvent): void => {
      const box = pedal.getBoundingClientRect();
      this.brakePointer = Math.min(1, Math.max(0.15, (box.bottom - event.clientY) / box.height));
    };
    pedal.addEventListener('pointerdown', (event) => {
      pedal.setPointerCapture(event.pointerId);
      fromPointer(event);
    });
    pedal.addEventListener('pointermove', (event) => {
      if (pedal.hasPointerCapture(event.pointerId)) fromPointer(event);
    });
    const release = (): void => {
      this.brakePointer = 0;
    };
    pedal.addEventListener('pointerup', release);
    pedal.addEventListener('pointercancel', release);
    window.addEventListener('blur', () => {
      this.brakePointer = 0;
      this.brakeKey = false;
    });
  }

  get on(): boolean {
    return this.cd !== null;
  }

  /** The car of these records on the crank, standing in neutral; the Drive's engine is already the car's. */
  enter(records: CarDriveRecords): CarDrive {
    const cd = carDriveOf(records);
    this.cd = cd;
    const spec = vehicleLoadSpec(cd);
    this.pose = new DrivePose(cd.box, spec.drivetrain);
    this.wheel = cd.driven[0];
    const drive = this.drive();
    drive.setTorqueMap(cd.map);
    drive.setLoad(spec);
    this.brakeSent = -1;
    this.shown = { kmh: '', gear: '', speed: '', clutch: '' };
    this.show(true);
    return cd;
  }

  /** Off the crank: the engine runs free again. */
  leave(): void {
    if (!this.cd) return;
    this.cd = null;
    this.pose = null;
    this.brakePointer = 0;
    this.brakeKey = false;
    this.brakeKeyValue = 0;
    const drive = this.drive();
    drive.setLoad(null);
    drive.setTorqueMap(null);
    this.show(false);
  }

  gear(name: string): void {
    if (this.cd) this.drive().loadCommand({ kind: 'vehicle', action: 'gear', gear: name });
  }

  holdBrakeKey(on: boolean): void {
    this.brakeKey = on;
  }

  /** The car's frame: the brake sent, the dash and the inset drawn, and the box's pose, or null before the first frame. */
  frame(dt: number, snap: DriveSnapshot | null): TablePose | null {
    if (!this.cd) return null;
    const target = this.brakeKey ? KEY_BRAKE : 0;
    this.brakeKeyValue += (target - this.brakeKeyValue) * Math.min(1, (this.brakeKey ? KEY_RATE_ON : KEY_RATE_OFF) * dt);
    if (this.brakeKeyValue < 0.005) this.brakeKeyValue = 0;
    const brake = Math.round(Math.max(this.brakePointer, this.brakeKeyValue) * 100) / 100;
    if (brake !== this.brakeSent) {
      this.brakeSent = brake;
      this.drive().loadCommand({ kind: 'vehicle', action: 'brake', value: brake });
      const pedal = this.el('gbx-brake');
      this.el('gbx-brake-fill').style.height = `${brake * 100}%`;
      pedal.setAttribute('aria-valuenow', String(Math.round(brake * 100)));
    }
    const vehicle = snap?.vehicle;
    const readings = snap && carReadings(snap);
    if (!vehicle || !readings || !this.pose) return null;
    const s = this.shown;
    const kmh = num(readings.kmh);
    const gear = readings.gear === readings.selected ? readings.gear : `${readings.gear}→${readings.selected}`;
    const speed = t('{kmh} км/год', { kmh });
    const clutch = CLUTCH_TEXT[readings.clutch]();
    if (kmh !== s.kmh) this.el('gbx-kmh').textContent = s.kmh = kmh;
    if (gear !== s.gear) this.el('gbx-gear-now').textContent = s.gear = gear;
    if (speed !== s.speed) this.el('gbx-car-speed').textContent = s.speed = speed;
    if (clutch !== s.clutch) this.el('gbx-car-clutch').textContent = s.clutch = clutch;
    this.inset.draw(vehicle, this.wheel);
    return this.pose.update(vehicle, dt);
  }

  private show(on: boolean): void {
    for (const id of ['gbx-speedo', 'gbx-brake', 'gbx-car-figures', 'gbx-wheel-road']) this.el(id).hidden = !on;
    this.el('gbx-table-figures').hidden = on;
    document.body.classList.toggle('gbx-car', on);
  }

  private el(id: string): HTMLElement {
    return this.root.querySelector<HTMLElement>(`#${id}`)!;
  }
}
