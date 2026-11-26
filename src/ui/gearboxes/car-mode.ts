// The car mode of a gearbox page (stage K3a, the smallest version): the page's car on its drivetrain as the
// load on the shared Drive's crank. The engine drives the clutch, the gearbox the panel has set, the final drive, the
// wheels and the car along the road (VehicleLoad); the audio thread steps it while sound is on and the main-thread copy
// otherwise, and Drive hands the car's state between them, so muting mid-drive keeps the speed.
//
// The dash reads only drive.snapshot() (car-readings.ts): the speed, the gear, the clutch. The gate and the keys ask
// for a gear and the auto clutch does the rest; B and the brake pedal brake. The 3D turns every member of the box by
// the drivetrain's base angles (DrivePose), and the inset shows a driven wheel on the road.
//
// The full dash (stage K3b): the H-gate (gate.ts), the clutch pedal on C, which takes over from the auto clutch when
// pressed, the shift hints, and the drive panel in the left panel (drive-panel.ts): the helpers, the road, the clutch's
// heat, the times and the charts. An engine that stops while the visitor did not shut it off has stalled, and the dash
// says so; with the clutch the driver's own, it starts only in neutral or with the pedal down.

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
import type { RunStore } from '../../shell/section.ts';
import type { DynoRuns } from '../dyno/dyno-panel.ts';
import type { CarDemo, CarDemoStep, DemoControls, DemoView } from './car-demos.ts';
import { carReadings, type ClutchState } from './car-readings.ts';
import { DrivePanel, gradeRad, type DriveSettings } from './drive-panel.ts';
import { Gate, gateLayout } from './gate.ts';
import { DYNO_RUNS_KEY, shiftHint } from './traction.ts';
import { WheelRoad, wheelSlip } from './wheel-road.ts';

/** The brake key eases the pedal toward this far, of floored [estimate: a firm stop that does not lock dry tyres]. */
const KEY_BRAKE = 0.6;
/** How fast the brake key presses and lets go, 1/s. */
const KEY_RATE_ON = 5;
const KEY_RATE_OFF = 12;
/** The clutch key presses the pedal down at this rate, 1/s, and lets it up linearly at the second, so a pull-away on keys can be fed [estimate]. */
const CLUTCH_KEY_DOWN = 8;
const CLUTCH_KEY_UP = 0.6;
/** Below this the pedal does not hold the clutch open: pedalClamp's band starts at 0.75 (elements.ts). */
const CLUTCH_DOWN = 0.75;
/** The stall message stays this long, s. */
const STALL_S = 6;

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
  private shown = { kmh: '', gear: '', speed: '', clutch: '', disc: '', hint: '' };
  /** The clutch pedal: from the pointer, from the key (held, and where it has got to), and what was last sent. */
  private clutchPointer: number | null = null;
  private clutchKey = false;
  private clutchKeyValue = 0;
  private clutchSent = -1;
  readonly gate: Gate;
  readonly panel: DrivePanel;
  /** The engine was running on the last frame, and the visitor has asked it to stop since. */
  private wasRunning = false;
  private stopAsked = false;
  /** Seconds the stall message has left, and a message the section asked to show for a while. */
  private stalledFor = 0;
  private note: { text: string; left: number } | null = null;
  /** A demonstration driving the car: the step running, and whether it has done its part. */
  private demo: { step: CarDemoStep; done: boolean; controls: DemoControls; view: DemoView } | null = null;

  constructor(root: HTMLElement, drive: () => Drive, runs: RunStore, engineHref: () => string) {
    this.root = root;
    this.drive = drive;
    this.inset = new WheelRoad(root);
    this.gate = new Gate(this.el('gbx-gate'), { gear: (name) => this.gear(name) });
    this.panel = new DrivePanel(root, {
      settings: (s) => this.applySettings(s),
      engineHref,
      runs: () => runs.get<DynoRuns>(DYNO_RUNS_KEY),
    });
    this.listenClutch();
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
      this.clutchKey = false;
    });
  }

  private listenClutch(): void {
    const pedal = this.el('gbx-clutch');
    const fromPointer = (event: PointerEvent): void => {
      const box = pedal.getBoundingClientRect();
      this.clutchPointer = Math.min(1, Math.max(0, (box.bottom - event.clientY) / box.height));
    };
    pedal.addEventListener('pointerdown', (event) => {
      pedal.setPointerCapture(event.pointerId);
      this.takeClutch(false);
      fromPointer(event);
    });
    pedal.addEventListener('pointermove', (event) => {
      if (pedal.hasPointerCapture(event.pointerId)) fromPointer(event);
    });
    // Let go with the pointer and the pedal springs up at once: that is how a car is stalled on purpose.
    const release = (): void => {
      this.clutchPointer = null;
      if (!this.clutchKey) this.clutchKeyValue = 0;
    };
    pedal.addEventListener('pointerup', release);
    pedal.addEventListener('pointercancel', release);
  }

  /**
   * The driver's foot on the clutch: the auto clutch lets go of it. The key's pedal starts where the auto clutch had
   * it, so taking over does not slam it shut; the pointer sets the pedal where it presses.
   */
  private takeClutch(byKey: boolean): void {
    if (this.panel.settings.autoClutch) {
      if (byKey) this.clutchKeyValue = Math.max(this.clutchKeyValue, this.autoPedal());
      this.panel.set({ autoClutch: false });
    }
  }

  /** The pedal position the auto clutch's clamp stands for now. */
  private autoPedal(): number {
    const f = this.drive().snapshot().vehicle;
    return f ? Math.min(1, 0.35 + 0.4 * (1 - f.clutch)) * (f.clutch < 1 ? 1 : 0) : 0;
  }

  holdClutchKey(on: boolean): void {
    if (on) this.takeClutch(true);
    this.clutchKey = on;
  }

  /** The clutch pedal now, 0 up … 1 floored. */
  get clutchPedal(): number {
    return this.clutchPointer ?? this.clutchKeyValue;
  }

  /** The panel's settings on the car on the crank. */
  private applySettings(s: DriveSettings): void {
    if (!this.cd) return;
    const drive = this.drive();
    drive.loadCommand({ kind: 'vehicle', action: 'autoClutch', on: s.autoClutch });
    drive.loadCommand({ kind: 'vehicle', action: 'revMatch', on: s.revMatch });
    drive.loadCommand({ kind: 'vehicle', action: 'road', gradeRad: gradeRad(s.gradePct), surfaceMu: this.panel.surfaceMu() });
    this.clutchSent = -1;
    this.el('gbx-clutch-key').textContent = s.autoClutch ? t('авто') : 'C';
  }

  /** Why the engine cannot be started now, or null: with the driver's clutch, only in neutral or with it down. */
  startBlocked(): string | null {
    const f = this.drive().snapshot().vehicle;
    if (!this.cd || !f || this.panel.settings.autoClutch) return null;
    if (f.lever === 'N' || this.clutchPedal >= CLUTCH_DOWN) return null;
    return t('Щоб завести, вичавіть зчеплення (C) або поставте нейтраль (N).');
  }

  /**
   * A step of a demonstration drives the car from now: the pedals and the lever are its until it is stopped. `gas`
   * and `start` are the section's (its pedal and its ignition).
   */
  startDemo(demo: CarDemo, at: number, host: { gas(value: number): void; start(): void }): CarDemoStep {
    const step = demo.steps[at]!;
    const controls: DemoControls = {
      gas: (v) => host.gas(v),
      clutch: (v) => (this.clutchPointer = v),
      gear: (name) => this.gear(name),
      brake: (v) => (this.brakePointer = v),
      settings: (patch) => this.panel.set(patch),
      start: () => host.start(),
    };
    const view: DemoView = { rpm: 0, speed: 0, gear: 'N', shift: 'engaged', accel: 0, running: false, launchJ: 0, clutchJ: 0, clutchC: 0, slip: 0 };
    this.demo = { step, done: false, controls, view };
    return step;
  }

  /** The demonstration lets go of the pedals; the car stays as it is. */
  stopDemo(): void {
    if (!this.demo) return;
    this.demo = null;
    this.clutchPointer = null;
    this.brakePointer = 0;
  }

  /** The step running has done its part. */
  get demoDone(): boolean {
    return this.demo?.done ?? false;
  }

  /** What the step running came to, in numbers. */
  demoResult(): string {
    return this.demo?.step.result() ?? '';
  }

  /** The car on the crank, as its records derive it. */
  get carDrive(): CarDrive | null {
    return this.cd;
  }

  /** The visitor shut the engine off: its stop is not a stall. */
  stopping(): void {
    this.stopAsked = true;
  }

  /** Shows a line in the hint's place for a few seconds. */
  say(text: string, seconds = 4): void {
    this.note = { text, left: seconds };
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
    this.clutchSent = -1;
    this.clutchPointer = null;
    this.clutchKey = false;
    this.clutchKeyValue = 0;
    this.shown = { kmh: '', gear: '', speed: '', clutch: '', disc: '', hint: '' };
    this.stalledFor = 0;
    this.note = null;
    this.stopAsked = false;
    this.wasRunning = drive.snapshot().state === 'running';
    this.gate.setLayout(gateLayout(records.gearbox.layout.kind === 'layshaft' ? records.gearbox.layout.desc.sleeves : []));
    this.panel.enter(cd);
    // The car is new on the crank, standing in neutral: the visitor's helpers and road go on it.
    this.applySettings(this.panel.settings);
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
    this.clutchPointer = null;
    this.clutchKey = false;
    this.clutchKeyValue = 0;
    this.demo = null;
    this.panel.leave();
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

  /**
   * The car's frame: the pedals sent, the dash, the gate, the panel and the inset drawn, and the box's pose, or null
   * before the first frame. `panelShown`: the drive panel is on screen, so its figures are worth writing.
   */
  frame(dt: number, snap: DriveSnapshot | null, panelShown = true): TablePose | null {
    if (!this.cd) return null;
    this.sendClutch(dt);
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
    const disc = t('{c} °C', { c: num(vehicle.clutchC) });
    if (disc !== s.disc) this.el('gbx-car-disc').textContent = s.disc = disc;
    this.gate.frame(dt, readings.selected, readings.gear);
    this.showHint(snap!, readings.gear, dt);
    this.panel.frame(vehicle, snap!.rpm, dt, panelShown);
    const demo = this.demo;
    if (demo && !demo.done && dt > 0) {
      const v = demo.view;
      v.rpm = snap!.rpm;
      v.speed = vehicle.speed;
      v.gear = vehicle.gear;
      v.shift = vehicle.shift;
      v.accel = vehicle.accel;
      v.running = snap!.state === 'running';
      v.launchJ = this.panel.meter.figures.launchJ;
      v.clutchJ = vehicle.clutchJ;
      v.clutchC = vehicle.clutchC;
      v.slip = wheelSlip(vehicle, this.wheel).slip;
      demo.done = demo.step.frame(v, demo.controls, dt);
    }
    if (this.panel.settings.autoClutch) this.fillClutch(1 - vehicle.clutch);
    this.inset.draw(vehicle, this.wheel);
    return this.pose.update(vehicle, dt);
  }

  /** The clutch pedal's key eased, and the pedal sent to the car when it moved. */
  private sendClutch(dt: number): void {
    if (this.clutchKey) this.clutchKeyValue += (1 - this.clutchKeyValue) * Math.min(1, CLUTCH_KEY_DOWN * dt);
    else this.clutchKeyValue = Math.max(0, this.clutchKeyValue - CLUTCH_KEY_UP * dt);
    if (this.panel.settings.autoClutch) return;
    const pedal = Math.round(this.clutchPedal * 100) / 100;
    if (pedal === this.clutchSent) return;
    this.clutchSent = pedal;
    this.drive().loadCommand({ kind: 'vehicle', action: 'clutch', pedal });
    this.fillClutch(pedal);
  }

  private fillClutch(value: number): void {
    this.el('gbx-clutch-fill').style.height = `${Math.round(value * 100)}%`;
    this.el('gbx-clutch').setAttribute('aria-valuenow', String(Math.round(value * 100)));
  }

  /** A stall, a note, or the gear a driver would want now, in the line under the dash's figures. */
  private showHint(snap: DriveSnapshot, gear: string, dt: number): void {
    const running = snap.state === 'running' || snap.state === 'cranking';
    if (this.wasRunning && !running && !this.stopAsked) this.stalledFor = STALL_S;
    if (running) this.stopAsked = false;
    this.wasRunning = running;
    this.stalledFor = Math.max(0, this.stalledFor - dt);
    if (this.note && (this.note.left -= dt) <= 0) this.note = null;
    let text = '';
    if (this.note) text = this.note.text;
    else if (this.stalledFor > 0 && !running) text = t('Двигун заглух: зчеплення замкнулося, а обертів не вистачило. Вичавіть зчеплення (C) або поставте нейтраль і заведіть знову.');
    else if (this.panel.settings.hints && running && snap.vehicle && snap.vehicle.shift === 'engaged') {
      const hint = shiftHint(this.cd!, gear, snap.rpm, snap.vehicle.speed, snap.throttle);
      if (hint) text = hint.direction === 'up' ? t('Перемкніть вище: {gear}', { gear: hint.to }) : t('Перемкніть нижче: {gear}', { gear: hint.to });
    }
    if (text === this.shown.hint) return;
    this.shown.hint = text;
    const el = this.el('gbx-hint');
    el.textContent = text;
    el.hidden = !text;
  }

  private show(on: boolean): void {
    for (const id of ['gbx-speedo', 'gbx-brake', 'gbx-clutch', 'gbx-car-figures', 'gbx-wheel-road', 'gbx-gate', 'gbx-drive']) this.el(id).hidden = !on;
    for (const id of ['gbx-table-figures', 'gbx-gears', 'gbx-setup']) this.el(id).hidden = on;
    if (!on) this.el('gbx-hint').hidden = true;
    document.body.classList.toggle('gbx-car', on);
  }

  private el(id: string): HTMLElement {
    return this.root.querySelector<HTMLElement>(`#${id}`)!;
  }
}
