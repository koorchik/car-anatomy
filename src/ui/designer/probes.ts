// Turns the panel's controls into things the sensitivity code can try on a design.

import { numberProbe, choiceProbe, type Probe } from '../../designer/sensitivity.ts';
import type { Design } from '../../designer/design.ts';
import { t } from '../../i18n/t.ts';
import { PARAM_GROUPS } from './params.ts';

/** Changing these starts over from a different engine, so they aren't compared as a small move. */
const NOT_PROBED = new Set(['layout', 'cylinders', 'crankPreset']);

export function probesFor(d: Design): Probe[] {
  const probes: Probe[] = [];
  for (const group of PARAM_GROUPS) {
    if (group.applies && !group.applies(d)) continue;
    for (const param of group.params) {
      if (param.applies && !param.applies(d)) continue;
      if (NOT_PROBED.has(param.key)) continue;
      if (param.kind === 'number') {
        if (!param.only) probes.push(numberProbe(param.key, param.label));
      } else if (param.kind === 'choice') {
        const options = typeof param.options === 'function' ? param.options(d) : param.options;
        if (!param.only) probes.push(choiceProbe(param.key, param.label, options));
      } else if (param.kind === 'toggle') {
        probes.push(choiceProbe(param.key, param.label, [[true as unknown as string, t('увімкнути')], [false as unknown as string, t('вимкнути')]]));
      }
    }
  }
  return probes;
}
