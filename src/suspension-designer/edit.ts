// One edit from the designer's panel, with what it implies for the fields that depended on the old value (the engine
// designer's editDesign and withLayout, src/designer/presets.ts). A new layout brings its typical geometry and the
// typical spring, since the old rate was chosen for another motion ratio; a split strut knuckle brings its own kingpin
// offset and inclination; a drive that powers the rear wheels cannot keep a twist beam there, and a twist beam cannot
// stay under a driven rear axle. Everything ends in resolveChassis.

import { SPLIT_KNUCKLE_DEFAULTS } from '../suspension/templates/macpherson.ts';
import { resolveChassis } from './constraints.ts';
import { layoutDefaults } from './defaults.ts';
import { axleOf, isDriven, withAxle, type AxleEnd, type ChassisDesign, type DesignLayout } from './design.ts';

/** Moves one end of the car to another layout with that layout's typical geometry and a typical spring. */
export function withLayout(d: ChassisDesign, end: AxleEnd, layout: DesignLayout): ChassisDesign {
  const { unsprungKg: _unsprung, ...geometry } = layoutDefaults(layout, end);
  let out = withAxle(d, end, { ...geometry, layout, springNmm: null, camberDeg: 0, toeDeg: 0 });
  // A twist beam carries no half-shafts.
  if (end === 'R' && layout === 'twist-beam' && isDriven(out.drive, 'R')) out = { ...out, drive: 'fwd' };
  return resolveChassis(out);
}

/** One edit: a patch of fields of the design (suffixed keys for an axle), applied with its consequences. */
export function editChassis(d: ChassisDesign, patch: Partial<ChassisDesign>): ChassisDesign {
  let out: ChassisDesign = { ...d, ...patch };
  for (const end of ['F', 'R'] as const) {
    const a = axleOf(out, end);
    if (a.layout !== axleOf(d, end).layout) out = withLayout(out, end, a.layout);
    if (a.knuckle !== axleOf(d, end).knuckle && a.knuckle !== 'plain') {
      const split = SPLIT_KNUCKLE_DEFAULTS[a.knuckle];
      out = withAxle(out, end, { kingpinOffsetMm: Math.round(split.kingpinOffsetM * 1e6) / 1e3, kpiDeg: split.kpiDeg });
    }
  }
  if (out.drive !== d.drive && out.layoutR === 'twist-beam' && isDriven(out.drive, 'R')) out = withLayout(out, 'R', 'multilink');
  return resolveChassis(out);
}
