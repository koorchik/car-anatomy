// The lever diagram of the automatic (research §10.1; nomogram.ts has the levers as data): each set a group of three
// columns S, C, R at distances proportional to the teeth, speed upward, the input at 1. A set's three speeds lie on
// one straight line; nodes that turn as one body share their tint with the 3D model; a closed brake pins its node to
// zero, a closed clutch joins its two nodes with a bar in the element's colour. In a neutral the free motion shows as
// a faint fan of lines through every speed the output could take.

import { levers, leverSpeeds, type Lever } from '../../../drivetrain/nomogram.ts';
import { speedsWith } from '../../../drivetrain/planetary-table.ts';
import type { Gearbox, StateInfo } from '../../../drivetrain/topology.ts';
import { numberLocale } from '../../../i18n/locale.ts';
import { t } from '../../../i18n/t.ts';
import { bodyTints, elementColor } from '../../../scene/gearbox/element-colors.ts';

const W = 340;
const H = 290;
const TOP = 18;
const BOTTOM = 44;
const LEFT = 30;
const RIGHT = 8;

const num = (v: number, digits = 2): string => v.toLocaleString(numberLocale, { maximumFractionDigits: digits, minimumFractionDigits: digits });

/** The range of speeds the diagram shows: every member in every gear of the matrix, and zero and the input. */
export function speedRange(box: Gearbox): [number, number] {
  let lo = 0;
  let hi = 1;
  // The nodes only: a planet's own spin is no point of the diagram.
  const nodes = levers(box).flatMap((l) => l.nodes.map((n) => box.members.indexOf(n.member)));
  for (const s of box.states) {
    if (s.kind !== 'gear') continue;
    for (const i of nodes) {
      lo = Math.min(lo, s.speeds![i]!);
      hi = Math.max(hi, s.speeds![i]!);
    }
  }
  const pad = 0.08 * (hi - lo);
  return [lo - pad, hi + pad];
}

interface Layout {
  x: (lever: number, pos: number) => number;
  y: (speed: number) => number;
}

function layout(count: number, range: [number, number]): Layout {
  const group = (W - LEFT - RIGHT) / count;
  const inner = group * 0.62;
  return {
    x: (lever, pos) => LEFT + group * lever + (group - inner) / 2 + inner * pos,
    y: (speed) => TOP + ((range[1] - speed) / (range[1] - range[0])) * (H - TOP - BOTTOM),
  };
}

/** The lines of one motion: per lever its straight line and its three nodes. */
function motion(box: Gearbox, all: Lever[], L: Layout, speeds: ArrayLike<number>, tints: Map<string, string>, faint: boolean): string {
  let out = '';
  all.forEach((lever, i) => {
    const v = leverSpeeds(box, lever, speeds);
    const x0 = L.x(i, 0);
    const x1 = L.x(i, 1);
    out += `<line class="${faint ? 'nm-fan' : 'nm-lever'}" x1="${x0.toFixed(1)}" y1="${L.y(v[0]).toFixed(1)}" x2="${x1.toFixed(1)}" y2="${L.y(v[2]).toFixed(1)}"/>`;
    if (faint) return;
    lever.nodes.forEach((node, j) => {
      out += `<circle class="nm-node" cx="${L.x(i, node.pos).toFixed(1)}" cy="${L.y(v[j]!).toFixed(1)}" r="4.2" fill="${tints.get(node.member)}"><title>${node.member}: ${num(v[j]!)}</title></circle>`;
    });
  });
  return out;
}

/**
 * The diagram for these closed elements. `state` is what they leave; in a gear the speeds are per unit input, with
 * the input held per unit output.
 */
export function nomogramSvg(box: Gearbox, state: StateInfo, closed: readonly string[]): string {
  const all = levers(box);
  const range = speedRange(box);
  const L = layout(all.length, range);
  const tints = bodyTints(box.spec);
  const nodeOf = (member: string): { lever: number; pos: number } | null => {
    for (let i = 0; i < all.length; i++) {
      const n = all[i]!.nodes.find((x) => x.member === member);
      if (n) return { lever: i, pos: n.pos };
    }
    return null;
  };
  let svg = `<svg class="nomogram" viewBox="0 0 ${W} ${H}" role="img" aria-label="${t('Номограма швидкостей')}">`;
  // Axes: zero and the input's speed.
  for (const [v, label, cls] of [[0, '0', 'nm-zero'], [1, t('вхід'), 'nm-one']] as const) {
    svg += `<line class="${cls}" x1="${LEFT - 4}" x2="${W - RIGHT}" y1="${L.y(v).toFixed(1)}" y2="${L.y(v).toFixed(1)}"/>`;
    svg += `<text class="nm-axis" x="${LEFT - 6}" y="${(L.y(v) + 3.5).toFixed(1)}" text-anchor="end">${label}</text>`;
  }
  // Each lever's column ticks and its labels.
  all.forEach((lever, i) => {
    for (const node of lever.nodes) {
      const x = L.x(i, node.pos);
      svg += `<line class="nm-column" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${TOP}" y2="${H - BOTTOM + 4}"/>`;
      // The carrier's label a row lower: it can stand close to the ring's (set 4: 102/126 of the way).
      svg += `<text class="nm-label" x="${x.toFixed(1)}" y="${H - BOTTOM + (node.role === 'C' ? 27 : 16)}" text-anchor="middle">${node.member}</text>`;
    }
    svg += `<text class="nm-set" x="${L.x(i, 0.5).toFixed(1)}" y="${H - 4}" text-anchor="middle">${t('ряд {k}', { k: i + 1 })}</text>`;
  });
  // The free motion of a neutral, or of the output with the input held: a fan of faint lines.
  const free = state.kind === 'neutral' || state.kind === 'input-locked';
  if (free) {
    const steps = 9;
    for (let s = 0; s <= steps; s++) {
      const o = range[0] + ((range[1] - range[0]) * s) / steps;
      const v = state.kind === 'neutral' ? speedsWith(box, closed, 1, o) : speedsWith(box, closed, 0, o);
      if (v) svg += motion(box, all, L, v, tints, true);
    }
  }
  // The motion shown: the gear's, the neutral's with the output standing, the held input's with the output rolling.
  const shown = state.kind === 'gear' ? state.speeds : state.kind === 'neutral' ? speedsWith(box, closed, 1, 0) : state.kind === 'input-locked' ? speedsWith(box, closed, 0, 0.5) : box.members.map(() => 0);
  // Elements: a brake pins its node at zero, a clutch bars its two nodes.
  box.spec.elements.forEach((e, index) => {
    const on = closed.includes(e.id);
    const color = elementColor(e.id, index);
    const a = nodeOf(e.a);
    if (!a || !shown) return;
    const xa = L.x(a.lever, a.pos);
    const ya = L.y(shown[box.members.indexOf(e.a)]!);
    if (e.b === null) {
      const y0 = L.y(0);
      svg += `<g class="nm-element${on ? ' on' : ''}"><path d="M${(xa - 7).toFixed(1)} ${(y0 + 6).toFixed(1)}h14M${(xa - 6).toFixed(1)} ${(y0 + 10).toFixed(1)}l3-4M${(xa - 1).toFixed(1)} ${(y0 + 10).toFixed(1)}l3-4M${(xa + 4).toFixed(1)} ${(y0 + 10).toFixed(1)}l3-4" stroke="${color}"/><text x="${(xa + 10).toFixed(1)}" y="${(y0 + 12).toFixed(1)}" fill="${color}">${e.id}</text></g>`;
      return;
    }
    const b = nodeOf(e.b);
    if (!b || !on) return;
    const xb = L.x(b.lever, b.pos);
    const yb = L.y(shown[box.members.indexOf(e.b)]!);
    const yy = Math.min(ya, yb) - 9;
    svg += `<g class="nm-element on"><path d="M${xa.toFixed(1)} ${(ya - 5).toFixed(1)}V${yy.toFixed(1)}H${xb.toFixed(1)}V${(yb - 5).toFixed(1)}" stroke="${color}" fill="none"/><text x="${((xa + xb) / 2).toFixed(1)}" y="${(yy - 3).toFixed(1)}" fill="${color}" text-anchor="middle">${e.id}</text></g>`;
  });
  if (shown) svg += motion(box, all, L, shown, tints, false);
  // Input and output marks.
  const input = nodeOf(box.spec.input);
  const output = nodeOf(box.spec.output);
  if (input && shown) svg += `<text class="nm-io" x="${L.x(input.lever, input.pos).toFixed(1)}" y="${(L.y(shown[box.members.indexOf(box.spec.input)]!) - 8).toFixed(1)}" text-anchor="middle">${t('вхід')}</text>`;
  if (output && shown) {
    const v = shown[box.members.indexOf(box.spec.output)]!;
    const label = state.kind === 'gear' ? t('вихід 1/{ratio}', { ratio: num(state.ratio!, 3) }) : t('вихід');
    svg += `<text class="nm-io" x="${(L.x(output.lever, output.pos) - 4).toFixed(1)}" y="${(L.y(v) - 8).toFixed(1)}" text-anchor="end">${label}</text>`;
  }
  return `${svg}</svg>`;
}
