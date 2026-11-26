// A gearbox page's box as a design (gearbox plan, stage 10): the panel "Set up" of a catalogue page carries its teeth
// and final drive to the designer, and the designer hands a design back to the table as a record. No DOM.

import { GEARBOX_PAGES } from '../data/gearboxes.ts';
import type { GearboxRecord } from '../drivetrain/catalogue.ts';
import type { LayshaftDesc } from '../drivetrain/layouts/layshaft.ts';
import type { TransaxleDesc } from '../drivetrain/layouts/transaxle.ts';
import { t } from '../i18n/t.ts';
import { resolveGearboxDesign } from './constraints.ts';
import type { GearboxDesign } from './design.ts';
import { designFromRecord } from './presets.ts';
import { designLayout } from './to-spec.ts';

/** A catalogue record by its id, page or page/variant. */
export const recordById = (id: string): GearboxRecord | undefined => GEARBOX_PAGES.flatMap((p) => [p.base, ...p.variants]).find((r) => r.id === id);

/**
 * The box a gearbox page's panel "Set up" has set, as a design: the record with the panel's teeth and final drive.
 * The factory box itself stays the catalogue copy, with its published figures; a changed one is the visitor's own.
 */
export function designFromTable(recordId: string, desc: LayshaftDesc | TransaxleDesc, finalDrive: number): GearboxDesign | null {
  const record = recordById(recordId);
  if (!record?.car) return null;
  const factory = designFromRecord(record);
  const same = JSON.stringify(desc) === JSON.stringify(record.layout.desc) && Math.abs(finalDrive - factory.finalDrive) < 1e-6;
  if (same) return factory;
  const changed = designFromRecord({ ...record, layout: record.layout.kind === 'layshaft' ? { kind: 'layshaft', desc: desc as LayshaftDesc } : { kind: 'transaxle', desc: desc as TransaxleDesc } });
  return resolveGearboxDesign({
    ...changed,
    name: t('{name}, змінена', { name: factory.name }),
    // A layshaft box's final drive is the axle's, which the panel sets; a transaxle's comes with its teeth.
    finalDrive: record.layout.kind === 'layshaft' ? finalDrive : changed.finalPair ? changed.finalPair.teeth[1] / changed.finalPair.teeth[0] : finalDrive,
    factory: null,
  });
}

/** A design as the table of a gearbox page takes a record: its layout, the box the 3D and the dash turn. */
export function designTableRecord(d: GearboxDesign): GearboxRecord {
  return { id: 'designer', name: d.name, car: d.car, layout: designLayout(d), published: { ratios: [], reverse: null, ratedTorqueNm: null, centreMm: null }, sources: [], unverified: [] };
}
