// The gearbox designer's two charts, as SVG strings: the traction of every gear against road speed with the road load
// (and a pinned variant's gears dashed under it), and the speed of the full run "Drive" over time with the moment
// it reaches 100 km/h. The playhead of the run is a separate element the page moves each frame.

import type { TractionCurves } from '../../gearbox-designer/evaluate.ts';
import type { RunSample } from '../../gearbox-designer/drive-run.ts';
import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';

const W = 320;
const H = 190;
const PAD = { l: 34, r: 10, t: 10, b: 24 };
/** One colour per gear, first to tenth, light enough on the panel's dark ground. */
export const GEAR_COLOURS = ['#ff7a1a', '#ffb347', '#ffd27a', '#c7e27a', '#7fd6a4', '#62c6ec', '#7fa6ff', '#b18cff', '#e58bd8', '#ece6d6'];

const num = (v: number, digits = 0): string => v.toLocaleString(numberLocale, { maximumFractionDigits: digits, minimumFractionDigits: digits });

const niceStep = (span: number, wanted: number): number => {
  const raw = span / Math.max(wanted, 1);
  const pow = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / pow;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * pow;
};

interface Frame {
  x: (v: number) => number;
  y: (v: number) => number;
  axes: string;
}

function frame(xMax: number, yMax: number, xUnit: string, yUnit: string, yDigits = 0): Frame {
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const x = (v: number): number => PAD.l + (v / xMax) * plotW;
  const y = (v: number): number => PAD.t + plotH - (v / yMax) * plotH;
  const parts: string[] = [];
  const xs = niceStep(xMax, 5);
  for (let v = 0; v <= xMax + 1e-9; v += xs) {
    parts.push(`<line class="grid-dash" x1="${x(v).toFixed(1)}" x2="${x(v).toFixed(1)}" y1="${PAD.t}" y2="${y(0)}" />`);
    parts.push(`<text class="chart-label" x="${x(v).toFixed(1)}" y="${H - 8}" text-anchor="middle">${num(v)}</text>`);
  }
  const ys = niceStep(yMax, 4);
  for (let v = ys; v <= yMax + 1e-9; v += ys) {
    parts.push(`<line class="grid-dash" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" />`);
    parts.push(`<text class="chart-label" x="${PAD.l - 4}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${num(v, yDigits)}</text>`);
  }
  parts.push(`<line class="axis" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(0)}" y2="${y(0)}" />`);
  parts.push(`<text class="chart-label" x="${W - PAD.r}" y="${PAD.t + 10}" text-anchor="end">${yUnit}</text>`);
  parts.push(`<text class="chart-label" x="${W - PAD.r}" y="${y(0) - 4}" text-anchor="end">${xUnit}</text>`);
  return { x, y, axes: parts.join('') };
}

/** A polyline through the points that are not null, broken where a curve has no value. */
function paths(xs: readonly number[], ys: ReadonlyArray<number | null>, f: Frame): string {
  let d = '';
  let pen = false;
  ys.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${f.x(xs[i]!).toFixed(1)} ${f.y(v).toFixed(1)}`;
    pen = true;
  });
  return d;
}

/** Force at the wheels of each gear, kN, against road speed, with the road load; `pinned` dashed underneath. */
export function tractionSvg(now: TractionCurves, pinned: TractionCurves | null): string {
  const all = [now, ...(pinned ? [pinned] : [])];
  const xMax = Math.max(...all.map((c) => c.kmh[c.kmh.length - 1] ?? 0), 50);
  const yMax = Math.max(1, ...all.flatMap((c) => c.gears.flatMap((g) => g.filter((v): v is number => v !== null)))) / 1000;
  const f = frame(xMax, yMax * 1.05, t('км/год'), t('кН'), yMax < 4 ? 1 : 0);
  const kn = (list: ReadonlyArray<number | null>): Array<number | null> => list.map((v) => (v === null ? null : v / 1000));
  const ghost = pinned
    ? pinned.gears.map((g) => `<path class="gbd-ghost" d="${paths(pinned.kmh, kn(g), f)}" />`).join('') +
      `<path class="gbd-ghost gbd-road" d="${paths(pinned.kmh, kn(pinned.roadLoadN), f)}" />`
    : '';
  const gears = now.gears
    .map((g, i) => {
      const d = paths(now.kmh, kn(g), f);
      const last = g.reduce<number>((at, v, k) => (v !== null ? k : at), -1);
      const label = last >= 0 ? `<text class="chart-label gbd-gear-label" x="${(f.x(now.kmh[last]!) - 2).toFixed(1)}" y="${(f.y(g[last]! / 1000) - 3).toFixed(1)}" text-anchor="end" fill="${GEAR_COLOURS[i % GEAR_COLOURS.length]}">${i + 1}</text>` : '';
      return `<path class="gbd-gear-line" stroke="${GEAR_COLOURS[i % GEAR_COLOURS.length]}" d="${d}" />${label}`;
    })
    .join('');
  const road = `<path class="gbd-road" d="${paths(now.kmh, kn(now.roadLoadN), f)}" />`;
  return `<svg viewBox="0 0 ${W} ${H}" class="gbd-chart" role="img" aria-label="${t('Тяга на колесах у кожній передачі за швидкістю й опір руху')}">${f.axes}${ghost}${road}${gears}</svg>`;
}

/** Speed over time of the full run, with a dashed mark at 100 km/h and its time. */
export function runSvg(samples: readonly RunSample[], zeroTo100S: number | null): string {
  if (!samples.length) return '';
  const tMax = samples[samples.length - 1]!.t;
  const vMax = Math.max(110, ...samples.map((s) => s.kmh));
  const f = frame(Math.max(tMax, 1), vMax * 1.05, t('с'), t('км/год'));
  const line = paths(
    samples.map((s) => s.t),
    samples.map((s) => s.kmh),
    f,
  );
  // Each gear in its colour along the line.
  const spans: string[] = [];
  let from = 0;
  for (let i = 1; i <= samples.length; i++) {
    if (i === samples.length || samples[i]!.gear !== samples[from]!.gear) {
      const part = samples.slice(from, Math.min(i + 1, samples.length));
      spans.push(`<path class="gbd-gear-line" stroke="${GEAR_COLOURS[(samples[from]!.gear - 1) % GEAR_COLOURS.length]}" d="${paths(part.map((s) => s.t), part.map((s) => s.kmh), f)}" />`);
      from = i;
    }
  }
  const mark =
    zeroTo100S === null
      ? ''
      : `<line class="gbd-mark" x1="${PAD.l}" x2="${f.x(zeroTo100S).toFixed(1)}" y1="${f.y(100).toFixed(1)}" y2="${f.y(100).toFixed(1)}" />
         <line class="gbd-mark" x1="${f.x(zeroTo100S).toFixed(1)}" x2="${f.x(zeroTo100S).toFixed(1)}" y1="${f.y(100).toFixed(1)}" y2="${f.y(0)}" />
         <text class="chart-label" x="${(f.x(zeroTo100S) + 3).toFixed(1)}" y="${(f.y(100) - 4).toFixed(1)}">${t('100 км/год за {s} с', { s: num(zeroTo100S, 1) })}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" class="gbd-chart" role="img" aria-label="${t('Швидкість за часом у заїзді з місця')}" data-tmax="${tMax}" data-pad-l="${PAD.l}" data-pad-r="${PAD.r}" data-w="${W}">${f.axes}<path class="gbd-run-shadow" d="${line}" />${spans.join('')}${mark}<line class="gbd-playhead" x1="${PAD.l}" x2="${PAD.l}" y1="${PAD.t}" y2="${f.y(0)}" visibility="hidden" /></svg>`;
}

/** Moves the playhead of a chart runSvg drew to time `t`, s; null hides it. */
export function movePlayhead(svg: SVGSVGElement | null, time: number | null): void {
  const line = svg?.querySelector<SVGLineElement>('.gbd-playhead');
  if (!svg || !line) return;
  if (time === null) {
    line.setAttribute('visibility', 'hidden');
    return;
  }
  const tMax = Number(svg.dataset.tmax);
  const l = Number(svg.dataset.padL);
  const w = Number(svg.dataset.w) - l - Number(svg.dataset.padR);
  const x = (l + (Math.min(time, tMax) / Math.max(tMax, 1)) * w).toFixed(1);
  line.setAttribute('x1', x);
  line.setAttribute('x2', x);
  line.setAttribute('visibility', 'visible');
}
