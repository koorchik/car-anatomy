// A catalogue engine with the inertia force arrows of its page, one view of them at a time, as the engine page draws them.

import { CATALOGUE, engineById, pageChoices } from '../../src/data/engines.ts';
import { BalanceForces, arrowScale, massesOf } from '../../src/engine/balance-forces.ts';
import { BalancePhasors, type BalanceView, type PhasorView } from '../../src/engine/balance-phasors.ts';
import { buildEngine } from '../../src/engine/kinematics.ts';
import { BalanceOverlay } from '../../src/scene/balance-arrows.ts';
import type { EngineModel } from '../../src/scene/model-types.ts';
import { PARTS } from '../../src/scene/parts-info.ts';
import { PistonEngineModel } from '../../src/scene/piston-engine.ts';
import { RotaryEngineModel } from '../../src/scene/rotary-engine.ts';
import { defineModel, type Values } from '../model-api.ts';

/** The engine page's scale: the largest piston of the page gets an arrow as long as its bore. */
const pageArrowScale = (id: string): number => arrowScale(pageChoices(id).map((c) => buildEngine(engineById(c.id)!)));

/** Crank degrees per second while it turns: slow enough to follow one arrow round. */
const SPIN = 60;

/** The view the controls choose, or null when the forces are off. A rotary has only its turning masses. */
const viewOf = (phasors: BalancePhasors, values: Values): PhasorView | null => {
  const chosen = values.forces as BalanceView | 'off';
  if (chosen === 'off') return null;
  const view = phasors.views.includes(chosen) ? chosen : phasors.views[0]!;
  return phasors.view(view, { counterweights: values.counterweights as boolean, shafts: values.balancers as boolean });
};

export default defineModel({
  title: 'Двигун каталогу з силами інерції',
  defaults: { view: 'xray' },
  controls: [
    {
      key: 'engine',
      label: 'Двигун',
      kind: 'choice',
      rebuild: true,
      value: 'i4',
      options: CATALOGUE.flatMap((entry) => pageChoices(entry.id)).map((c) => ({ value: c.id, label: `${c.id} · ${c.name}` })),
    },
    {
      key: 'shafts',
      label: 'Балансирні вали',
      kind: 'choice',
      rebuild: true,
      value: 'spec',
      options: [
        { value: 'spec', label: 'Як у двигуна' },
        { value: '0', label: 'Немає' },
        { value: '1', label: '1: проти 1-го порядку' },
        { value: '2', label: '2: проти обох порядків' },
      ],
    },
    { key: 'theta', label: 'Кут колінвала, °', kind: 'range', min: 0, max: 720, step: 1, value: 30 },
    { key: 'spin', label: 'Крутити колінвал', kind: 'toggle', value: false },
    { key: 'running', label: 'Працює (спалахи й гази)', kind: 'toggle', value: false },
    {
      key: 'forces',
      label: 'Сили інерції',
      kind: 'choice',
      value: 'order1',
      options: [
        { value: 'order1', label: '1-й порядок' },
        { value: 'order2', label: '2-й порядок' },
        { value: 'rotating', label: 'Обертові маси' },
        { value: 'off', label: 'Вимкнено' },
      ],
    },
    { key: 'counterweights', label: 'Противаги', kind: 'toggle', value: true },
    { key: 'balancers', label: 'Вали', kind: 'toggle', value: true },
  ],
  create(values) {
    const spec = engineById(values.engine as string)!;
    const engine = buildEngine(spec);
    const model: EngineModel = engine.isRotary ? new RotaryEngineModel(engine) : new PistonEngineModel(engine);
    // No catalogue engine has balance shafts yet: the designer's choice, tried on any of them.
    const masses = values.shafts === 'spec' ? massesOf(spec) : { ...massesOf(spec), shafts: Number(values.shafts) as 0 | 1 | 2 };
    const phasors = new BalancePhasors(new BalanceForces(engine, masses));
    const overlay = new BalanceOverlay(phasors, pageArrowScale(spec.id));
    model.mounted.add(overlay.group);
    overlay.setView(viewOf(phasors, values));
    /** Degrees turned since spinning started, so the crank starts from the slider's angle and not from the clock. */
    let spun = 0;
    return {
      group: model.group,
      // A rotary explains itself from the front, as on its page. The site's floor is under y = 0.
      home: engine.isRotary ? [0.34, 0.22, 1] : undefined,
      groundY: 0,
      frame(_time, dt) {
        spun = values.spin ? (spun + dt * SPIN) % engine.cycle : 0;
        const theta = values.spin ? ((values.theta as number) + spun) % engine.cycle : (values.theta as number);
        const running = values.running as boolean;
        model.update({ theta, rpm: running ? spec.idleRpm : 0, load: 0.35, fuelCut: false, running, boost: 0, dt, shake: 0 });
        if (overlay.group.visible) overlay.update(theta);
      },
      set(key, next) {
        if (key === 'forces' || key === 'counterweights' || key === 'balancers') overlay.setView(viewOf(phasors, next));
      },
      setView: (view) => model.setView(view),
      setExplode: (amount) => model.setExplode(amount),
      part: (key) => PARTS[key],
      dispose() {
        overlay.dispose();
        model.dispose();
      },
    };
  },
});
