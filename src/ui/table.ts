// The engine chooser: a table of layout family against cylinder count, drawn from the data,
// with a small plan of each engine computed from its own bank angles.

import { ENGINES } from '../data/engines.ts';
import { DEG, buildEngine } from '../engine/kinematics.ts';
import { FAMILY_NAMES, type EngineSpec, type Family } from '../engine/spec.ts';

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

export function tableHtml(activeId: string): string {
  const cylinderCounts = [...new Set(ENGINES.map((e) => e.cylinders))].sort((a, b) => a - b);
  const head = cylinderCounts.map((n) => `<th scope="col">${n}</th>`).join('');
  const rows = FAMILIES.map((family) => {
    const cells = cylinderCounts
      .map((n) => {
        const engines = ENGINES.filter((e) => e.family === family && e.cylinders === n);
        if (!engines.length) return '<td class="empty"></td>';
        return `<td>${engines
          .map(
            (e) => `<a class="cell${e.id === activeId ? ' active' : ''}" href="#/engines/${e.id}" data-engine="${e.id}">
              ${layoutGlyph(e)}
              <span class="cell-name">${e.badge}${e.fuel === 'diesel' ? ' дизель' : ''}</span>
              <span class="cell-note">${tableNote(e)}</span>
            </a>`,
          )
          .join('')}</td>`;
      })
      .join('');
    return `<tr><th scope="row">${FAMILY_NAMES[family]}</th>${cells}</tr>`;
  }).join('');
  return `<table class="engine-table"><thead><tr><th scope="col" class="corner">Циліндри</th>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

const tableNote = (e: EngineSpec): string => {
  const notes: Record<string, string> = {
    i8: 'Duesenberg J',
    'v8-cross': 'хрестовий вал',
    'v8-flat': 'плоский вал',
    'v6-60': '60°',
    'v6-90': '90°, нерівний',
    v2: '45°',
    v10: '72°',
    v12: '60°',
    f12: '180°',
    vr6: '15°',
    w12: 'два VR6',
    w16: 'чотири турбіни',
    r2: '2 секції',
    r4: '4 секції',
  };
  return notes[e.id] ?? e.example.split(' ').slice(0, 2).join(' ');
};
