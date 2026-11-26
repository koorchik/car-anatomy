// The force polygon of the force card: each force of the chosen view as a vector, head to tail, in the front view,
// turning with the crank angle the 3D shows; the same, smaller, for the rocking couple; the trail of the net's tip over
// the last turn and a word under each. The points come from src/engine/balance-diagram.ts, the forces from
// balance-phasors.ts. One class draws the card's small copy and the sheet's large one.

import { diagramAt, isInline, planDiagram, type DiagramFrame, type DiagramPlan, type LocusWord } from '../engine/balance-diagram.ts';
import type { BalancePhasors, PhasorView, Quantity, Vec2 } from '../engine/balance-phasors.ts';
import { t } from '../i18n/t.ts';
import { FORCE_COLORS, colorOf } from '../scene/balance-arrows.ts';

const SVG = 'http://www.w3.org/2000/svg';
/** Half the drawing in viewBox units: the farthest point of a diagram lands this far from the middle. */
const RADIUS = 43;
/** Trail of the last turn in this many pieces, fading from the oldest. */
const TRAIL_PIECES = 6;
/**
 * How far a vector of a flat chain (DiagramChain.flat) is moved to its left, in viewBox units: the way out and the way
 * back then run side by side, a thin loop, instead of one on top of the other.
 */
const SIDESTEP = 2.4;
const ORIGIN: Vec2 = { x: 0, y: 0 };

const FORCE_WORDS: Record<LocusWord, string> = {
  balanced: t('Врівноважено'),
  vertical: t('Хитає вгору-вниз'),
  sideways: t('Хитає вбік'),
  oblique: t('Хитає навскіс'),
  with: t('Крутиться з валом'),
  against: t('Крутиться назустріч валу'),
  both: t('Хитає й крутиться'),
};

const COUPLE_WORDS: Record<LocusWord, string> = {
  balanced: t('Врівноважено'),
  vertical: t('Гойдає вгору-вниз'),
  sideways: t('Гойдає вбік'),
  oblique: t('Гойдає навскіс'),
  with: t('Гойдає по колу з валом'),
  against: t('Гойдає по колу назустріч валу'),
  both: t('Гойдає й крутиться'),
};

export const wordFor = (plan: DiagramPlan): string => (plan.quantity === 'force' ? FORCE_WORDS : COUPLE_WORDS)[plan.word];

const svg = <K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string> = {}): SVGElementTagNameMap[K] => {
  const el = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

const f = (v: number): string => v.toFixed(2);

/** A small line in the style of a chain, for the legend. */
const chainSwatch = (dashed: boolean): string =>
  `<svg class="forces-chain-swatch" viewBox="0 0 18 6" aria-hidden="true"><path d="M1 3H17" stroke="currentColor" stroke-width="2"${dashed ? ' stroke-dasharray="3 2.5"' : ''} fill="none"/></svg>`;

/** The legend of the chains and what cancels each, in words. */
export function chainsNote(plan: DiagramPlan): string {
  const view = plan.view;
  const sides = plan.chains.map((c) => c.side);
  if (plan.mode === 'projection') {
    const what =
      view.order === 1
        ? t('Половину, що крутиться з валом, гасять противаги, а ту, що назустріч, лише вал, який крутиться назустріч.')
        : t('Їх гасять лише вали Ланчестера на подвійних обертах.');
    return `<span>${chainSwatch(false)}${t('вектори, що крутяться з валом; сила — їхня тінь на осі циліндрів')}</span> ${what}`;
  }
  const plus = sides.includes('plus') || sides.length === 0;
  const minus = sides.includes('minus');
  if (view.view === 'rotating') return `<span>${chainSwatch(false)}${t('з валом: гасять противаги')}</span>`;
  if (view.order === 2) {
    return `${plus ? `<span>${chainSwatch(false)}${t('з валом')}</span> ` : ''}${minus ? `<span>${chainSwatch(true)}${t('назустріч валу')}</span> ` : ''}${t('Обидва гасять лише вали Ланчестера на подвійних обертах.')}`;
  }
  return `${plus ? `<span>${chainSwatch(false)}${t('з валом: гасять противаги')}</span> ` : ''}${minus ? `<span>${chainSwatch(true)}${t('назустріч валу: гасить лише вал, що крутиться назустріч')}</span>` : ''}`;
}

/** The diagram in words, for a screen reader: which chains close, and the word of each. */
export function diagramLabel(force: DiagramPlan, couple: DiagramPlan): string {
  const closing = (plan: DiagramPlan): string => {
    if (plan.chains.length === 0) return '';
    if (plan.mode === 'projection') return plan.chains[0]!.closes ? t('многокутник замикається') : t('многокутник не замикається');
    return plan.chains
      .map((c) => {
        const side = c.side === 'plus' ? t('з валом') : t('назустріч валу');
        return c.closes ? t('{side} замикається', { side }) : t('{side} не замикається', { side });
      })
      .join(', ');
  };
  const part = (name: string, plan: DiagramPlan): string => {
    const how = closing(plan);
    return how ? `${name}: ${how}; ${wordFor(plan)}.` : `${name}: ${wordFor(plan)}.`;
  };
  return `${t('Многокутник сил, вигляд спереду.')} ${part(t('Сила'), force)} ${part(t('Момент гойдання'), couple)}`;
}

/** One quantity's drawing: force or couple. */
class Panel {
  readonly figure = document.createElement('figure');
  private readonly root = svg('svg', { viewBox: '-50 -50 100 100', 'aria-hidden': 'true' });
  private readonly axis = svg('path', { class: 'axis' });
  private readonly shadow = svg('path', { class: 'shadow' });
  private readonly closing = svg('path', { class: 'closing' });
  private readonly net = svg('path', { class: 'net' });
  private readonly origin = svg('circle', { class: 'origin', r: '1.6' });
  private readonly rest = svg('circle', { class: 'rest', r: '4' });
  private readonly trail: SVGPathElement[] = [];
  private readonly chains = svg('g');
  private readonly word = document.createElement('b');
  /** Per chain, per colour: the path and the elements it draws. */
  private groups: { chain: number; path: SVGPathElement; elements: number[]; sidestep: number }[] = [];
  private plan: DiagramPlan | null = null;
  private frame: DiagramFrame = { chains: [], net: { x: 0, y: 0 }, trail: [] };
  private scale = 1;

  constructor(quantity: Quantity) {
    this.figure.className = `forces-fig ${quantity}`;
    const color = quantity === 'force' ? FORCE_COLORS.net : FORCE_COLORS.couple;
    this.root.style.setProperty('--net', color);
    for (let i = 0; i < TRAIL_PIECES; i++) {
      const piece = svg('path', { class: 'trail' });
      piece.style.opacity = f(0.12 + (0.6 * (i + 1)) / TRAIL_PIECES);
      this.trail.push(piece);
    }
    this.root.append(this.axis, ...this.trail, this.chains, this.shadow, this.closing, this.net, this.rest, this.origin);
    const caption = document.createElement('figcaption');
    const name = document.createElement('span');
    name.textContent = quantity === 'force' ? t('сила') : t('момент гойдання');
    caption.append(this.word, name);
    this.figure.append(this.root, caption);
  }

  set(plan: DiagramPlan, reach: number): void {
    this.plan = plan;
    this.scale = reach > 0 ? RADIUS / reach : 0;
    this.word.textContent = wordFor(plan);
    this.figure.dataset.word = plan.word;
    this.chains.replaceChildren();
    this.groups = [];
    plan.chains.forEach((chain, c) => {
      const byColor = new Map<string, number[]>();
      chain.elements.forEach((el, i) => {
        const color = colorOf({ kind: el.kind, order: plan.view.order });
        const list = byColor.get(color) ?? [];
        list.push(i);
        byColor.set(color, list);
      });
      for (const [color, elements] of byColor) {
        const path = svg('path', { class: `vectors ${chain.side}`, stroke: color });
        this.chains.append(path);
        this.groups.push({ chain: c, path, elements, sidestep: chain.flat ? SIDESTEP : 0 });
      }
    });
    if (plan.axis !== null) {
      const a = (plan.axis * Math.PI) / 180;
      const x = Math.sin(a) * 48;
      const y = -Math.cos(a) * 48;
      this.axis.setAttribute('d', `M${f(-x)} ${f(-y)}L${f(x)} ${f(y)}`);
    } else {
      this.axis.setAttribute('d', '');
    }
    this.rest.style.display = plan.word === 'balanced' ? '' : 'none';
  }

  /**
   * An arrow from a to b in viewBox units, as path data; nothing when it is too short to see. sidestep moves it that far
   * to its left, so that one pointing back along the same line runs beside it.
   */
  private arrow(a: Vec2, b: Vec2, head: number, sidestep = 0): string {
    const k = this.scale;
    let ax = a.x * k;
    let ay = -a.y * k;
    let bx = b.x * k;
    let by = -b.y * k;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 0.4) return '';
    const h = Math.min(head, len * 0.45);
    const ux = dx / len;
    const uy = dy / len;
    // Left of the way it points, on screen (y down).
    ax += uy * sidestep;
    ay -= ux * sidestep;
    bx += uy * sidestep;
    by -= ux * sidestep;
    const w = h * 0.55;
    const lx = bx - ux * h - uy * w;
    const ly = by - uy * h + ux * w;
    const rx = bx - ux * h + uy * w;
    const ry = by - uy * h - ux * w;
    return `M${f(ax)} ${f(ay)}L${f(bx)} ${f(by)}M${f(lx)} ${f(ly)}L${f(bx)} ${f(by)}L${f(rx)} ${f(ry)}`;
  }

  draw(theta: number): void {
    const plan = this.plan;
    if (!plan) return;
    const frame = diagramAt(plan, theta, this.frame);
    for (const g of this.groups) {
      const points = frame.chains[g.chain]!;
      let d = '';
      for (const i of g.elements) d += this.arrow(points[i]!, points[i + 1]!, 4, g.sidestep);
      g.path.setAttribute('d', d);
    }
    const balanced = plan.word === 'balanced';
    this.net.setAttribute('d', balanced ? '' : this.arrow(ORIGIN, frame.net, 6));
    if (plan.axis !== null && frame.chains.length && !balanced) {
      const points = frame.chains[0]!;
      const end = points[points.length - 1]!;
      this.closing.setAttribute('d', this.arrow(ORIGIN, end, 4.5));
      const k = this.scale;
      this.shadow.setAttribute('d', `M${f(end.x * k)} ${f(-end.y * k)}L${f(frame.net.x * k)} ${f(-frame.net.y * k)}`);
    } else {
      this.closing.setAttribute('d', '');
      this.shadow.setAttribute('d', '');
    }
    const trail = frame.trail;
    const per = (trail.length - 1) / TRAIL_PIECES;
    this.trail.forEach((piece, k) => {
      if (balanced) {
        piece.setAttribute('d', '');
        return;
      }
      let d = '';
      for (let i = Math.round(k * per); i <= Math.round((k + 1) * per); i++) {
        const p = trail[i]!;
        d += `${d ? 'L' : 'M'}${f(p.x * this.scale)} ${f(-p.y * this.scale)}`;
      }
      piece.setAttribute('d', d);
    });
  }
}

/** The force and couple diagrams of one view side by side, with the legend of their chains. */
export class ForceDiagram {
  readonly element = document.createElement('div');
  private readonly force = new Panel('force');
  private readonly couple = new Panel('couple');
  private readonly note = document.createElement('p');
  private plans: { force: DiagramPlan; couple: DiagramPlan } | null = null;
  private lastTheta = NaN;

  constructor() {
    this.element.className = 'forces-diagram';
    const row = document.createElement('div');
    row.className = 'forces-figs';
    row.append(this.force.figure, this.couple.figure);
    this.note.className = 'forces-chains';
    this.element.append(row, this.note);
  }

  /**
   * A new view, scaled so that it fills its box over a turn: what the diagram tells is whether the polygon closes,
   * not how large it is next to another view. The arrows on the model keep the page's scale for that.
   */
  set(phasors: BalancePhasors, view: PhasorView): void {
    const inline = isInline(phasors);
    const force = planDiagram(view, 'force', inline);
    const couple = planDiagram(view, 'couple', inline);
    this.plans = { force, couple };
    this.force.set(force, force.reach);
    this.couple.set(couple, couple.reach);
    this.note.innerHTML = chainsNote(force);
    this.element.dataset.mode = force.mode;
    this.lastTheta = NaN;
  }

  get label(): string {
    return this.plans ? diagramLabel(this.plans.force, this.plans.couple) : '';
  }

  draw(theta: number): void {
    if (theta === this.lastTheta) return;
    this.lastTheta = theta;
    this.force.draw(theta);
    this.couple.draw(theta);
  }
}

/** The diagram large, over the page: a sheet from the bottom on a phone, a box in the middle elsewhere. */
export class DiagramSheet {
  private readonly dialog = document.createElement('dialog');
  private readonly diagram = new ForceDiagram();
  private readonly heading = document.createElement('h2');

  constructor() {
    this.dialog.className = 'forces-sheet';
    this.dialog.setAttribute('aria-labelledby', 'forces-sheet-title');
    this.heading.id = 'forces-sheet-title';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn forces-sheet-close';
    close.textContent = t('Закрити');
    close.addEventListener('click', () => this.dialog.close());
    const head = document.createElement('div');
    head.className = 'forces-sheet-head';
    head.append(this.heading, close);
    const how = document.createElement('p');
    how.className = 'forces-sheet-how';
    how.textContent = t(
      'Кожна сила вибраного виду — вектор, і їх складено один за одним, голова до хвоста, як видно спереду двигуна. Замкнувся многокутник — ці сили гасять одна одну. Ні — біла стрілка від початку до кінця і є залишком, а її слід за останній оберт показує, куди він тягне двигун. Мала схема — те саме для моменту гойдання: кожну силу помножено на відстань циліндра від середини колінвала.',
    );
    this.dialog.append(head, this.diagram.element, how);
    // A tap on the backdrop closes the sheet, as on the panels of a phone.
    this.dialog.addEventListener('click', (event) => {
      if (event.target === this.dialog) this.dialog.close();
    });
    document.body.append(this.dialog);
  }

  get isOpen(): boolean {
    return this.dialog.open;
  }

  set(phasors: BalancePhasors, view: PhasorView, name: string): void {
    this.diagram.set(phasors, view);
    this.heading.textContent = t('Многокутник сил: {view}', { view: name });
  }

  open(): void {
    if (!this.dialog.open) this.dialog.showModal();
  }

  close(): void {
    if (this.dialog.open) this.dialog.close();
  }

  draw(theta: number): void {
    if (this.dialog.open) this.diagram.draw(theta);
  }
}
