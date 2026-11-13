// A real gearbox as the catalogue keeps it: its layout description, the figures it is checked against, and what
// could not be verified. The data lives in src/data/gearboxes/<page>.ts, one file per page, so parallel work on
// different pages does not touch the same file.

import { layshaftSpec, type LayshaftDesc } from './layouts/layshaft.ts';
import type { GearboxSpec } from './spec.ts';

/** Grows with each layout: transaxle, dct, sequential, planetary… */
export type GearboxLayout = { kind: 'layshaft'; desc: LayshaftDesc };

/** Figures as published, to compare with what the teeth give. */
export interface PublishedGearbox {
  /** Forward ratios, first gear first. */
  ratios: number[];
  /** Magnitude, as published. */
  reverse: number | null;
  /** Torque the maker rates the input for, N·m. */
  ratedTorqueNm: number | null;
  /** Countershaft to mainshaft (or input to output shaft), mm. */
  centreMm: number | null;
}

export interface GearboxRecord {
  /** 'manual-rwd' for a page's base, 'manual-rwd/<variant>' for a variant, a plain id for a record without a page. */
  id: string;
  /** The maker's name, the same in every language. */
  name: string;
  /** Shared car id ('bmw-m3-e30'), or null when the gearbox is in no car of the site. */
  car: string | null;
  layout: GearboxLayout;
  published: PublishedGearbox;
  /** What could not be checked against a primary source, shown in the article (source language; English per page). */
  verifyNote?: string;
  sources: string[];
  /** Field names not confirmed against a source. */
  unverified: string[];
}

/** A gearbox page: its base gearbox and the variants of the same type. */
export interface GearboxPage {
  id: string;
  base: GearboxRecord;
  variants: GearboxRecord[];
}

/** The core's spec of a record. Expanding is cheap; buildGearbox() caches per spec object. */
export function gearboxSpec(record: GearboxRecord): GearboxSpec {
  switch (record.layout.kind) {
    case 'layshaft':
      return layshaftSpec(record.layout.desc);
  }
}
