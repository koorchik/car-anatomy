// The small ladder of gears: revs against road speed, each gear a ray from the origin, and the saw the revs make when
// every gear is held to the rev limit and the next one taken. How far each tooth of the saw drops is the step between
// the two gears.

import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';

const W = 300;
const H = 150;
const PAD = { l: 34, r: 8, t: 10, b: 18 };

const num = (v: number): string => v.toLocaleString(numberLocale, { maximumFractionDigits: 0 });

/** SVG of the ladder for these overall ratios, the revs up to `redlineRpm`. */
export function ladderSvg(ratios: readonly number[], redlineRpm: number): string {
  if (!ratios.length) return '';
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  // Road speed in units of rpm per ratio: the top gear at the limit reaches the right edge.
  const vMax = Math.max(...ratios.map((r) => redlineRpm / r));
  const x = (v: number): number => PAD.l + (v / vMax) * plotW;
  const y = (rpm: number): number => PAD.t + plotH - (rpm / redlineRpm) * plotH;
  const rays = ratios.map((r) => `<line class="ladder-ray" x1="${x(0)}" y1="${y(0)}" x2="${x(redlineRpm / r).toFixed(1)}" y2="${y(redlineRpm)}" />`).join('');
  let path = `M ${x(0)} ${y(0)}`;
  const labels: string[] = [];
  ratios.forEach((r, i) => {
    const v = redlineRpm / r;
    path += ` L ${x(v).toFixed(1)} ${y(redlineRpm).toFixed(1)}`;
    labels.push(`<text class="chart-label" x="${(x(v) - 3).toFixed(1)}" y="${y(redlineRpm) - 2}" text-anchor="end">${i + 1}</text>`);
    const next = ratios[i + 1];
    if (next !== undefined) {
      const after = (redlineRpm * next) / r;
      path += ` L ${x(v).toFixed(1)} ${y(after).toFixed(1)}`;
      labels.push(`<text class="chart-label ladder-after" x="${(x(v) + 3).toFixed(1)}" y="${(y(after) + 11).toFixed(1)}">${num(after)}</text>`);
    }
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="ladder-chart" role="img" aria-label="${t('Драбина передач: оберти двигуна за швидкістю, з перемиканням на межі обертів')}">
    <line class="axis" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(0)}" y2="${y(0)}" />
    <line class="grid-dash" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(redlineRpm)}" y2="${y(redlineRpm)}" />
    <text class="chart-label" x="${PAD.l - 4}" y="${y(redlineRpm) + 4}" text-anchor="end">${num(redlineRpm)}</text>
    <text class="chart-label" x="${PAD.l - 4}" y="${y(0) + 4}" text-anchor="end">0</text>
    <text class="chart-label" x="${W - PAD.r}" y="${H - 4}" text-anchor="end">${t('швидкість')} →</text>
    ${rays}
    <path class="ladder-saw" d="${path}" />
    ${labels.join('')}
  </svg>`;
}
