// Ukrainian text is the source and its own key: t('Запустити двигун'). English lives in src/i18n/en/.

import { DESIGNER_EN } from './en/designer.ts';
import { DYNO_EN } from './en/dyno.ts';
import { GEARBOX_PARTS_EN } from './en/gearbox-parts.ts';
import { LUBRICATION_EN } from './en/lubrication.ts';
import { SUSPENSION_EN } from './en/suspension.ts';
import { SYSTEMS_EN } from './en/systems.ts';
import { UI_EN } from './en/ui.ts';
import { locale } from './locale.ts';

const ENGLISH: Record<string, string> = { ...UI_EN, ...DESIGNER_EN, ...SYSTEMS_EN, ...LUBRICATION_EN, ...DYNO_EN, ...SUSPENSION_EN, ...GEARBOX_PARTS_EN };

/** Translates a source string. `{name}` in the text is filled from `values`. */
export function t(source: string, values?: Record<string, string | number>): string {
  const text = locale === 'en' ? (ENGLISH[source] ?? source) : source;
  if (!values) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in values ? String(values[name]) : whole));
}

const PLURAL = new Intl.PluralRules(locale);

/**
 * The form that agrees with the count: Ukrainian has three (1 чайник, 3 чайники, 5 чайників), English two, which
 * take `one` and `many`. Pass each form already through t().
 */
export function plural(count: number, forms: { one: string; few: string; many: string }): string {
  const rule = PLURAL.select(count);
  return rule === 'one' ? forms.one : rule === 'few' ? forms.few : forms.many;
}
