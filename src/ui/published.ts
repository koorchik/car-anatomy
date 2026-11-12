// Published figures of a real engine in words, the same way the article writes them.

import type { PublishedFiguresLike } from '../engine/torque-map.ts';
import { numberLocale } from '../i18n/locale.ts';
import { t } from '../i18n/t.ts';

const num = (v: number): string => v.toLocaleString(numberLocale, { maximumFractionDigits: 0 });

/** "280 hp at 5600 rpm, 431 N·m at 4800 rpm", leaving out what was never published. */
export function publishedText(p: PublishedFiguresLike): string {
  const figure = (value: number | null, unit: string, rpm: number | null): string =>
    value === null ? '' : rpm === null ? `${num(value)} ${unit}` : t('{value} {unit} при {rpm} об/хв', { value: num(value), unit, rpm: num(rpm) });
  return [figure(p.powerHp, t('к.с.'), p.powerRpm), figure(p.torqueNm, t('Н·м'), p.torqueRpm)].filter(Boolean).join(', ');
}
