// A catalogue engine with the inertia force arrows of its page, as the engine page draws them today.

import { CATALOGUE, engineById, pageChoices } from '../../src/data/engines.ts';
import { BalanceForces, arrowScale, massesOf, type ForceLayers } from '../../src/engine/balance-forces.ts';
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

const layersOf = (values: Values): ForceLayers => ({
  order1: values.order1 as boolean,
  order2: values.order2 as boolean,
  balancing: values.balancing as boolean,
});

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
    { key: 'forces', label: 'Сили інерції', kind: 'toggle', value: true },
    { key: 'order1', label: '1-й порядок', kind: 'toggle', value: true },
    { key: 'order2', label: '2-й порядок', kind: 'toggle', value: true },
    { key: 'balancing', label: 'Противаги й вали', kind: 'toggle', value: true },
  ],
  create(values) {
    const spec = engineById(values.engine as string)!;
    const engine = buildEngine(spec);
    const model: EngineModel = engine.isRotary ? new RotaryEngineModel(engine) : new PistonEngineModel(engine);
    // No catalogue engine has balance shafts yet: the designer's choice, tried on any of them.
    const masses = values.shafts === 'spec' ? massesOf(spec) : { ...massesOf(spec), shafts: Number(values.shafts) as 0 | 1 | 2 };
    const overlay = new BalanceOverlay(new BalanceForces(engine, masses), pageArrowScale(spec.id), layersOf(values));
    model.mounted.add(overlay.group);
    overlay.group.visible = values.forces as boolean;
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
        if (key === 'forces') overlay.group.visible = next.forces as boolean;
        else if (key === 'order1' || key === 'order2' || key === 'balancing') overlay.setLayers(layersOf(next));
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
