// The engine chooser: every layout with every real engine of it, drawn from the data,
// with a small plan of each layout computed from its own bank angles.

import { ENGINES, pageChoices } from '../data/engines.ts';
import { DEG, buildEngine } from '../engine/kinematics.ts';
import { FAMILY_NAMES, type EngineSpec, type Family } from '../engine/spec.ts';

const escapeHtml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const FAMILIES: Family[] = ['inline', 'vee', 'flat', 'narrow', 'rotary'];

/** End-on sketch of the engine: where the cylinders point. */
export function layoutGlyph(spec: EngineSpec): string {
  const engine = buildEngine(spec);
  const size = 44;
  const c = size / 2;
  if (engine.isRotary) {
    return `<svg viewBox="0 0 ${size} ${size}" class="glyph" aria-hidden="true">
      <ellipse cx="${c}" cy="${c}" rx="14" ry="17" class="glyph-line" />
      <path d="M ${c} ${c - 11} L ${c + 10} ${c + 6} L ${c - 10} ${c + 6} Z" class="glyph-fill" />
    </svg>`;
  }
  const alphas = [...new Set(engine.cylinders.map((x) => Math.round(x.alpha * 10) / 10))];
  const flat = alphas.some((a) => Math.abs(a) >= 90);
  const cy = flat ? c : c + 10;
  const armLen = flat ? 15 : 22;
  const parts = alphas.map((a) => {
    const ax = Math.sin(a * DEG);
    const ay = -Math.cos(a * DEG);
    const x = c + ax * armLen;
    const y = cy + ay * armLen;
    return `<line x1="${c}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="glyph-arm" />`;
  });
  return `<svg viewBox="0 0 ${size} ${size}" class="glyph" aria-hidden="true">${parts.join('')}<circle cx="${c}" cy="${cy}" r="4" class="glyph-fill" /></svg>`;
}

/** Every layout as a card, with every real engine of it. Sorted by cylinders within each family. */
export function tableHtml(activeId: string): string {
  const pageId = activeId.split('/')[0];
  const sections = FAMILIES.map((family) => {
    const pages = ENGINES.filter((e) => e.family === family).sort((a, b) => a.cylinders - b.cylinders);
    if (!pages.length) return '';
    const cards = pages
      .map((page) => {
        const engines = pageChoices(page.id)
          .map((choice) => `<li><a class="card-engine${choice.id === activeId ? ' active' : ''}" href="#/engines/${choice.id}">${escapeHtml(choice.name)}</a></li>`)
          .join('');
        return `<section class="layout-card${page.id === pageId ? ' current' : ''}">
          <a class="layout-head" href="#/engines/${page.id}">
            ${layoutGlyph(page)}
            <span class="layout-name">${page.badge}${page.fuel === 'diesel' ? ' дизель' : ''}</span>
            <span class="layout-title">${escapeHtml(page.title)}</span>
          </a>
          <ul class="card-engines">${engines}</ul>
        </section>`;
      })
      .join('');
    return `<h3 class="family-name">${FAMILY_NAMES[family]}</h3><div class="layout-grid">${cards}</div>`;
  });
  const own = `<a class="own-engine" href="#/designer">
    <strong>Сконструюй свій двигун</strong>
    <span>Обери циліндри, поршні, наддув і вихлоп, а тоді заведи його й послухай, що вийшло.</span>
  </a>`;
  return own + sections.join('');
}
