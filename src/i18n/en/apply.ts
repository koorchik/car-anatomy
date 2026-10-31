// The catalogue is written in the source language. In English its text is swapped before anything reads it.

import type { CatalogueEntry, EngineFacts, PageVariants } from '../../designer/catalogue.ts';
import { ENGINE_TEXT_EN } from './engines.ts';
import { VARIANT_TEXT_EN } from './variants.ts';

const applyFacts = (facts: EngineFacts, id: string): void => {
  const text = VARIANT_TEXT_EN[id];
  if (text) Object.assign(facts, text);
};

export function applyEnglish(catalogue: CatalogueEntry[], variants: Record<string, PageVariants>): void {
  for (const entry of catalogue) {
    const text = ENGINE_TEXT_EN[entry.id];
    if (text) {
      entry.title = text.title;
      entry.example = text.example;
      entry.article = text.article;
      entry.verifyNote = text.verifyNote;
    }
    const page = variants[entry.id];
    if (!page) continue;
    applyFacts(page.base, entry.id);
    if (text) page.base.name = text.example;
    for (const variant of page.variants) applyFacts(variant, `${entry.id}/${variant.id}`);
  }
}
