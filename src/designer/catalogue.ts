// A catalogue engine is a designer configuration plus its article. There is no separate description of it:
// the model, the sound and the charts on the catalogue page come from the same path as a visitor's own engine.

import { LOUDNESS_TRIM } from '../audio/loudness-trim.ts';
import { mod } from '../engine/kinematics.ts';
import type { Article, EngineSpec } from '../engine/spec.ts';
import { resolveDesign } from './constraints.ts';
import { axisAngle } from './crank.ts';
import { DEFAULT_DESIGN, type CrankThrow, type Design } from './design.ts';
import { factoryInputs, designToSpec } from './to-spec.ts';

export interface CatalogueEntry {
  id: string;
  title: string;
  /** Real engine used for all figures. Also the design's name. */
  example: string;
  firing: {
    /** Cylinder numbers in firing order. Rotors, for a Wankel. */
    order: number[];
    /** Crank degrees to the next firing. Even spacing if left out. */
    intervals?: number[];
  };
  /** Published behaviour of the real engine, used until the visitor changes something. */
  factory: { idleRpm: number; revTimeS: number; rough: number };
  /** Everything that differs from the designer's defaults. */
  design: Partial<Design>;
  article: Article;
  /** Short note when a figure could not be confirmed against a primary source. */
  verifyNote?: string;
}

/** What a page says about a real engine, beside what the model computes. */
export interface EngineFacts {
  name: string;
  cars: string[];
  years: string;
  engineCode: string | null;
  /** How this one differs from the others on the page. */
  note: string;
  powerHp: number;
  /** Null where no source gives the figure: early engines were often published with power alone. */
  powerRpm: number | null;
  torqueNm: number | null;
  torqueRpm: number | null;
  /** How the whistle, the dump valve and the pops were settled: from reports on this car, or the quiet default. */
  voiceEvidence: 'sourced' | 'owner' | 'estimate' | 'default';
  /** Field names that could not be confirmed against a source. */
  unverified: string[];
  sources: string[];
}

/** Another real engine of a page's layout: only what differs from the page's own configuration. */
export interface EngineVariant extends EngineFacts {
  id: string;
  factory: CatalogueEntry['factory'];
  firing?: CatalogueEntry['firing'];
  design: Partial<Design>;
}

export interface PageVariants {
  base: EngineFacts;
  variants: EngineVariant[];
}

/** The crank table that gives this firing order on this layout. */
function throwsForFiring(d: Design, order: number[], intervals: number[]): CrankThrow[] {
  const throws: CrankThrow[] = Array.from({ length: d.cylinders }, () => ({ pin: 0, turn: 0 }));
  let fire = 0;
  order.forEach((n, i) => {
    throws[n - 1] = { pin: mod(axisAngle(d, n) - fire, 360), turn: fire >= 360 ? 1 : 0 };
    fire += intervals[i]!;
  });
  return throws;
}

export function catalogueDesign(entry: CatalogueEntry, variant?: EngineVariant): Design {
  const name = variant?.name ?? entry.example;
  const trimKey = variant ? `${entry.id}/${variant.id}` : entry.id;
  const base: Design = { ...DEFAULT_DESIGN, ...entry.design, ...variant?.design, name };
  const rotary = base.layout === 'rotary';
  const firing = variant?.firing ?? entry.firing;
  const { order } = firing;
  return resolveDesign({
    ...base,
    crankPreset: rotary ? 'even' : 'custom',
    throws: rotary ? [] : throwsForFiring(base, order, firing.intervals ?? order.map(() => 720 / order.length)),
    rotorOrder: rotary ? order : null,
    factory: { ...(variant?.factory ?? entry.factory), trim: LOUDNESS_TRIM[trimKey] ?? 0.4 },
  });
}

export function catalogueSpec(entry: CatalogueEntry, variant?: EngineVariant): EngineSpec {
  const design = catalogueDesign(entry, variant);
  return {
    ...designToSpec(design, factoryInputs(design)),
    id: variant ? `${entry.id}/${variant.id}` : entry.id,
    title: entry.title,
    example: variant?.name ?? entry.example,
    article: entry.article,
    verifyNote: variant ? undefined : entry.verifyNote,
  };
}
