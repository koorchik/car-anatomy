// The gearbox catalogue is written in the source language. In English each page's text is swapped in when its data
// module loads, before anything reads it, the same way as the engine catalogue.

import type { GearboxPage, GearboxRecord } from '../../drivetrain/catalogue.ts';

/** English for one gearbox record, by record id. */
export interface GearboxTextEn {
  verifyNote?: string;
}

export function applyGearboxEnglish(page: GearboxPage, text: Record<string, GearboxTextEn>): void {
  const apply = (record: GearboxRecord): void => {
    const en = text[record.id];
    if (en?.verifyNote !== undefined) record.verifyNote = en.verifyNote;
  };
  apply(page.base);
  page.variants.forEach(apply);
}
