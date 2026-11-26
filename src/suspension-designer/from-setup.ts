// What a suspension page's Setup panel (build order, A3) carries into the designer (stage P8c): the page's car as a
// design, with the setup of the corner it shows written onto that corner's axle. The spring rate, a damper preset and
// the static camber and toe have design fields of their own; a damping ratio ζ becomes the visitor's own damper with
// the coefficients a preset of that ζ would have (to-spec.ts). The ride height and the tyre pressure have none yet, so
// they stay behind and the page says so. An unchanged setup opens the car's design as it is.

import { t } from '../i18n/t.ts';
import { dampingFromZeta } from '../suspension/forces.ts';
import type { CornerSetup } from '../suspension/setup.ts';
import { cornerSprungKg } from './constraints.ts';
import { DEFAULT_CHASSIS } from './defaults.ts';
import { axleKey, type AxleEnd, type ChassisDesign } from './design.ts';
import { editChassis } from './edit.ts';
import { axleGeometry } from './geometry.ts';
import { TYPICAL_RWD, type PageCar, type SuspensionPage } from './page-cars.ts';
import { rideHz } from './to-spec.ts';

/** The setup's values the designer cannot hold yet. */
export type DroppedSetting = 'rideHeight' | 'pressure';

export interface CarriedSetup {
  design: ChassisDesign;
  dropped: DroppedSetting[];
}

/** Knee of a preset's damper, m/s (to-spec.ts PRESET_KNEE_MS). */
const PRESET_KNEE_MS = 0.1;

export function designWithSetup(base: ChassisDesign, end: AxleEnd, setup: CornerSetup, factory: CornerSetup): CarriedSetup {
  const patch: Record<string, unknown> = {};
  if (Math.abs(setup.springNmm - factory.springNmm) > 1e-9) patch[axleKey('springNmm', end)] = setup.springNmm;
  if (typeof setup.damper === 'number') {
    // ζ belongs to the body frequency on the visitor's spring (setup.ts does the same), not on the factory one.
    const sprung = axleKey('springNmm', end) in patch ? editChassis(base, patch as Partial<ChassisDesign>) : base;
    const g = axleGeometry(sprung, end);
    const own = dampingFromZeta(setup.damper, rideHz(sprung, end, g), cornerSprungKg(sprung, end), g.mrDamper);
    patch[axleKey('damper', end)] = 'custom';
    patch[axleKey('damperCompression', end)] = Math.round(own.compression);
    patch[axleKey('damperRebound', end)] = Math.round(own.rebound);
    patch[axleKey('damperKneeMs', end)] = PRESET_KNEE_MS;
    patch[axleKey('damperHighRatio', end)] = own.highRatio;
  } else if (setup.damper !== 'factory') {
    patch[axleKey('damper', end)] = setup.damper;
  }
  if (typeof setup.camberDeg === 'number') patch[axleKey('camberDeg', end)] = setup.camberDeg;
  if (typeof setup.toeDeg === 'number') patch[axleKey('toeDeg', end)] = setup.toeDeg;
  const dropped: DroppedSetting[] = [];
  if (Math.abs(setup.rideHeightM) > 1e-9) dropped.push('rideHeight');
  if (Math.abs(setup.pressureBar - factory.pressureBar) > 1e-9) dropped.push('pressure');
  return { design: Object.keys(patch).length ? editChassis(base, patch as Partial<ChassisDesign>) : base, dropped };
}

/** The design a suspension page stands for: its car's, or the typical car its own corner comes from. The macpherson
 *  page's own corner is the JTEKT's measured one, which belongs to no design: the default design, a strut in front,
 *  stands in for it. */
export function pageDesign(page: SuspensionPage, car: PageCar | null): ChassisDesign {
  if (car) return car.design;
  return page.base.geometry === 'typical' ? TYPICAL_RWD : DEFAULT_CHASSIS;
}

/** What the designer says of a design carried from a page: which settings stayed behind. */
export function carriedNote(dropped: readonly DroppedSetting[]): string {
  const lead = t('Авто зі сторінки підвіски з твоїм налаштуванням.');
  if (!dropped.length) return lead;
  const names = dropped.map((d) => (d === 'rideHeight' ? t('висоту кузова') : t('тиск у шині')));
  return `${lead} ${t('Конструктор поки не задає {settings}: тут стоять заводські значення.', { settings: names.join(t(' і ')) })}`;
}

/** The note handed from the page's Setup panel to the designer as it opens: both pages share this module. */
let pendingNote = '';

export function handNote(note: string): void {
  pendingNote = note;
}

/** The note handed over, once. */
export function takeNote(): string {
  const note = pendingNote;
  pendingNote = '';
  return note;
}
