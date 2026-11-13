// The catalogue (`#/engines/<page>[/<variant>]`): an engine of a layout and the real engines beside it.

import { ENGINES, engineById, pageChoices } from '../../data/engines.ts';
import { buildEngine, type Engine } from '../../engine/kinematics.ts';
import { ASPIRATION_NAMES } from '../../data/engine-names.ts';
import { t } from '../../i18n/t.ts';
import { articleHtml } from '../article.ts';
import { tableHtml } from '../table.ts';
import { $ } from './dom.ts';
import { catalogueEngineId, DEFAULT_ENGINE } from './routes.ts';
import type { EnginesSection } from './section.ts';

export class CataloguePage {
  private readonly section: EnginesSection;

  constructor(section: EnginesSection) {
    this.section = section;
    $('variants').addEventListener('scroll', () => this.markListEnd(), { passive: true });
    $('prev').addEventListener('click', () => this.step(-1));
    $('next').addEventListener('click', () => this.step(1));
  }

  /** The engine the address asks for. */
  resolveEngine(): Engine {
    const wanted = catalogueEngineId(this.section.ctx.router.current);
    // A variant that no longer exists falls back to its page rather than to another engine.
    const spec = (wanted && (engineById(wanted) ?? engineById(wanted.split('/')[0]!))) || engineById(DEFAULT_ENGINE)!;
    return buildEngine(spec);
  }

  /** How much bigger the largest engine of this page is. Size goes as the cube root of displacement, near enough to frame by. */
  pageFrameScale(next: Engine): number {
    const largest = Math.max(...pageChoices(next.spec.id).map((c) => buildEngine(engineById(c.id)!).displacementCc));
    return Math.cbrt(largest / next.displacementCc);
  }

  /** Puts an engine of the catalogue on the page, heard and drawn. */
  load(next: Engine, keepRunning: boolean, keepCamera = false): void {
    const s = this.section;
    const { slots } = s.ctx;
    s.drive.setEngine(next);
    s.showEngine(next, keepCamera);
    // Each catalogue engine starts warm: the usual picture. A cold start is the visitor's own choice.
    s.features.systems.reset('warm');
    s.features.setDynoEngine(next, { kind: 'catalogue' });
    const spec = s.engine.spec;
    this.renderVariants(spec.id);
    $('engine-title').textContent = spec.title;
    const asp = spec.aspiration === 'na' ? '' : `, ${ASPIRATION_NAMES[spec.aspiration]}`;
    $('engine-sub').textContent = `${spec.example}${asp}`;
    slots.panelTitle.textContent = t('Про цей двигун');
    $('article').innerHTML = articleHtml(s.engine);
    $('article').scrollTop = 0;
    document.title = t('{title}. Анатомія авто', { title: spec.title });
    slots.table.body.innerHTML = tableHtml(spec.id);
    slots.table.open(false);
    $<HTMLAnchorElement>('to-designer').href = `#/designer/from/${spec.id}`;
    $<HTMLAnchorElement>('to-catalog').href = `#/engines/${spec.id}`;
    if (!keepRunning) s.visualTheta = 0;
  }

  /** Another address in the catalogue. */
  enter(): void {
    const s = this.section;
    const next = this.resolveEngine();
    const now = s.engine;
    if (next.spec.id !== now.spec.id) {
      // Within one layout the camera stays where it is, so one engine next to another shows its real size.
      this.load(next, true, next.spec.id.split('/')[0] === now.spec.id.split('/')[0]);
      if (window.innerWidth <= 860) s.setPanel(false);
    } else {
      s.ctx.slots.table.open(false);
    }
  }

  /** The previous or next layout. */
  step(delta: number): void {
    const i = ENGINES.findIndex((e) => e.id === this.section.engine.spec.id.split('/')[0]);
    const next = ENGINES[(i + delta + ENGINES.length) % ENGINES.length]!;
    this.section.ctx.router.push({ section: 'engines', page: 'catalogue', path: [next.id] });
  }

  /** The real engines of this layout, to click through and hear. */
  private renderVariants(id: string): void {
    const list = $('variants');
    const choices = pageChoices(id);
    list.hidden = choices.length < 2;
    list.replaceChildren(
      ...choices.map((choice) => {
        const link = document.createElement('a');
        link.href = `#/engines/${choice.id}`;
        link.textContent = choice.name;
        link.className = `variant${choice.id === id ? ' active' : ''}`;
        if (choice.id === id) link.setAttribute('aria-current', 'true');
        return link;
      }),
      Object.assign(document.createElement('a'), { href: '#/designer', textContent: t('Сконструювати свій'), className: 'variant variant-own' }),
    );
    // On a phone the list is a row: the chosen engine may be out of sight.
    const active = list.querySelector<HTMLElement>('.active');
    if (active) list.scrollLeft = active.offsetLeft - list.offsetLeft - 8;
    this.fitVariants();
  }

  /** On a short stage the compact force card, at the bottom left, would cover the end of the list: the list scrolls instead. */
  fitVariants(): void {
    const list = $('variants');
    if (list.style.maxHeight) list.style.maxHeight = '';
    list.classList.remove('clipped');
    const card = this.section.ctx.slots.root.querySelector<HTMLElement>('.forces-card');
    if (window.innerWidth <= 860 || list.hidden || list.offsetParent === null || !card || card.hidden || !card.classList.contains('compact') || card.offsetParent === null) return;
    const room = Math.floor(card.getBoundingClientRect().top - list.getBoundingClientRect().top - 10);
    if (room >= list.scrollHeight) return;
    list.style.maxHeight = `${Math.max(56, room)}px`;
    list.classList.add('clipped');
    const active = list.querySelector<HTMLElement>('.active');
    if (active) list.scrollTop = Math.max(0, active.offsetTop - list.offsetTop - (room - active.offsetHeight) / 2);
    this.markListEnd();
  }

  private markListEnd(): void {
    const list = $('variants');
    list.classList.toggle('at-end', list.scrollTop + list.clientHeight >= list.scrollHeight - 2);
  }
}
