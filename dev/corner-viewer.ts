// A suspension corner on the model viewer with its setup: on a rig that moves the wheel through its travel, or driven
// over a bump, a kerb or a pothole by the quarter car, with the forces on the wheel and the camber laser. Each corner
// type has its own file in dev/models/ that hands its corner (and the controls that pick a variant of it) to
// cornerModel().

import type { CornerSpec } from '../src/suspension/spec.ts';
import { coilForce, bumpStopForce, G } from '../src/suspension/forces.ts';
import { QUARTER_STEP_S, QuarterSim } from '../src/suspension/quarter.ts';
import { EventRoad, RoadBuffer, type RoadEvent } from '../src/suspension/road.ts';
import { DAMPER_PRESETS, SETUP_RANGES, factorySetup, resolveCorner, type CornerSetup, type DamperPreset } from '../src/suspension/setup.ts';
import { CornerModel, cornerFrame, frameFromQuarter } from '../src/scene/suspension/corner-model.ts';
import type { ChoiceControl, Control, ModelDef, Values } from './model-api.ts';

/** Scenes of the quarter car: where the event starts and how long a lap of the loop is, m. */
const SCENES: Record<string, { events: RoadEvent[]; lapM: number }> = {
  bump: { events: [{ kind: 'bump', atM: 5, lengthM: 0.5, heightM: 0.05 }], lapM: 11 },
  kerb: {
    events: [
      { kind: 'step', atM: 5, heightM: 0.1 },
      { kind: 'step', atM: 8, heightM: -0.1 },
    ],
    lapM: 14,
  },
  pothole: { events: [{ kind: 'pothole', atM: 5, lengthM: 0.2, depthM: 0.06 }], lapM: 11 },
};

const PRESET_NAMES: Record<DamperPreset, string> = { worn: 'Зношений', comfort: 'Комфорт', sport: 'Спорт', track: 'Трек' };

function setupOf(values: Values): CornerSetup {
  const damper = values.damper as string;
  return {
    springNmm: values.spring as number,
    damper: damper === 'factory' ? 'factory' : (damper as DamperPreset),
    rideHeightM: (values.ride as number) / 1000,
    camberDeg: values.camberSet ? (values.camber as number) : 'factory',
    toeDeg: values.toeSet ? (values.toe as number) : 'factory',
    pressureBar: values.pressure as number,
  };
}

export interface CornerViewerOptions {
  title: string;
  /** The corner for the current values; `variants` controls pick among its kinds and rebuild the model. */
  corner: (values: Values) => CornerSpec;
  variants?: ChoiceControl[];
  /** Camera direction from the corner's centre when it appears. */
  home?: [number, number, number];
}

/**
 * The model definition of a corner. The setup controls are those the corner has hardware for: the camber with a
 * strut's top mount, the toe and the rack with a steered tie rod.
 */
export function cornerModel(options: CornerViewerOptions): ModelDef {
  const defaults: Values = Object.fromEntries((options.variants ?? []).map((c) => [c.key, c.value]));
  const first = options.corner(defaults);
  const factory = factorySetup(first);
  const spec = first.axle;
  const strut = !!spec.linkage.strut;
  const steered = spec.linkage.rods.some((r) => r.steer);
  const controls: Control[] = [
    ...(options.variants ?? []).map((c) => ({ ...c, rebuild: true })),
    {
      key: 'mode',
      label: 'Сцена',
      kind: 'choice',
      buttons: true,
      value: 'travel',
      options: [
        { value: 'travel', label: 'Хід' },
        { value: 'bump', label: 'Горб' },
        { value: 'kerb', label: 'Бордюр' },
        { value: 'pothole', label: 'Яма' },
      ],
    },
    { key: 'travel', label: 'Хід колеса від проєктного, мм (стенд)', kind: 'range', min: -spec.travel.droopM * 1000, max: spec.travel.bumpM * 1000, step: 1, value: 0 },
    ...(steered ? [{ key: 'rack', label: 'Рейка, мм', kind: 'range', min: -50, max: 50, step: 1, value: 0 } as const] : []),
    { key: 'speed', label: 'Швидкість, км/год', kind: 'range', min: 5, max: 60, step: 1, value: 30 },
    { key: 'spring', label: 'Пружина, Н/мм', kind: 'range', min: SETUP_RANGES.springNmm[0], max: SETUP_RANGES.springNmm[1], step: 1, value: Math.round(factory.springNmm * 10) / 10 },
    {
      key: 'damper',
      label: 'Амортизатор',
      kind: 'choice',
      value: 'factory',
      options: [{ value: 'factory', label: 'Заводський' }, ...Object.entries(DAMPER_PRESETS).map(([id, zeta]) => ({ value: id, label: `${PRESET_NAMES[id as DamperPreset]}, ζ ${zeta}` }))],
    },
    { key: 'ride', label: 'Висота кузова, мм', kind: 'range', min: SETUP_RANGES.rideHeightM[0] * 1000, max: SETUP_RANGES.rideHeightM[1] * 1000, step: 1, value: 0 },
    ...(strut
      ? [
          { key: 'camberSet', label: 'Виставити розвал', kind: 'toggle', value: false } as const,
          { key: 'camber', label: 'Розвал, °', kind: 'range', min: SETUP_RANGES.camberDeg[0], max: SETUP_RANGES.camberDeg[1], step: 0.05, value: -1 } as const,
        ]
      : []),
    ...(steered
      ? [
          { key: 'toeSet', label: 'Виставити сходження', kind: 'toggle', value: false } as const,
          { key: 'toe', label: 'Сходження, °', kind: 'range', min: SETUP_RANGES.toeDeg[0], max: SETUP_RANGES.toeDeg[1], step: 0.01, value: 0.1 } as const,
        ]
      : []),
    { key: 'pressure', label: 'Тиск шини, бар', kind: 'range', min: SETUP_RANGES.pressureBar[0], max: SETUP_RANGES.pressureBar[1], step: 0.05, value: factory.pressureBar },
    { key: 'forces', label: 'Сили на колесо', kind: 'toggle', value: true },
    { key: 'laser', label: 'Лазер розвалу', kind: 'toggle', value: true },
  ];

  return {
    title: options.title,
    defaults: { view: 'solid' },
    controls,
    create(values) {
      const corner = options.corner(values);
      const hasRack = corner.axle.linkage.rods.some((r) => r.steer);
      let resolved = resolveCorner(corner, setupOf(values));
      const model = new CornerModel(resolved);
      const frame = cornerFrame();
      let sim: QuarterSim | null = null;
      let scene: (typeof SCENES)[string] | null = null;
      /** Time not yet stepped, s: the quarter car steps 1 ms at a time whatever the frame rate. */
      let pending = 0;

      /** The quarter car of the current scene, or none on the rig. */
      const restart = (): void => {
        const mode = values.mode as string;
        scene = SCENES[mode] ?? null;
        pending = 0;
        if (!scene) {
          sim = null;
          model.setRoad(null);
          return;
        }
        const road = new EventRoad(scene.events);
        model.setRoad(road);
        sim = new QuarterSim(resolved, new RoadBuffer(road, resolved.tyre.freeRadiusM, resolved.tyre.patchM), (values.speed as number) / 3.6);
        sim.reset(0);
      };

      /** The rig: the body held at its height for this setup, a pad under the tyre following the wheel. */
      const rig = (): void => {
        const q = (values.travel as number) / 1000;
        const axle = resolved.axle;
        const springLen = axle.value('springLen', q);
        const damperLen = axle.value('damperLen', q);
        const sp = resolved.spring;
        const springN = coilForce(sp.rate, sp.freeM, springLen, sp.rate2, sp.fromM);
        const bs = resolved.bumpStop;
        const stopN =
          damperLen < bs.contactM ? bumpStopForce(bs.contactM - damperLen, bs.rate, bs.lengthM) : damperLen > resolved.topOutM ? -bumpStopForce(damperLen - resolved.topOutM, bs.rate, bs.lengthM) : 0;
        const support = springN * axle.value('mrSpring', q) + stopN * axle.value('mrDamper', q);
        frame.travel = q;
        frame.bodyZ = resolved.bodyStaticM;
        frame.roadX = 0;
        frame.roadLift = q - resolved.staticTravelM;
        frame.springN = springN;
        frame.damperN = 0;
        frame.stopN = stopN;
        frame.tyreN = support + resolved.unsprungKg * G;
      };

      model.setOverlays({ forces: values.forces as boolean, laser: values.laser as boolean });
      restart();
      return {
        group: model.group,
        home: options.home ?? [-0.72, 0.42, 0.8],
        groundY: 0,
        frame(_time, dt) {
          frame.rack = hasRack && steered ? (values.rack as number) / 1000 : 0;
          if (sim && scene) {
            // At most 0.1 s per frame: a frame that took longer (a tab in the background) is not caught up.
            pending = Math.min(pending + dt, 0.1);
            const steps = Math.floor(pending / QUARTER_STEP_S);
            pending -= steps * QUARTER_STEP_S;
            for (let i = 0; i < steps; i++) sim.step();
            // The wheel rolls the distance the quarter car went.
            frame.spin += (sim.speed * steps * QUARTER_STEP_S) / resolved.wheelCentreZM;
            if (sim.x > scene.lapM) sim.reset(0);
            frameFromQuarter(sim.observe(), frame);
          } else {
            rig();
          }
          model.update(frame);
        },
        set(key, next) {
          if (key === 'forces' || key === 'laser') {
            model.setOverlays({ forces: next.forces as boolean, laser: next.laser as boolean });
            return;
          }
          if (key === 'mode') {
            restart();
            return;
          }
          if (key === 'speed') {
            if (sim) sim.speed = (next.speed as number) / 3.6;
            return;
          }
          if (key === 'travel' || key === 'rack') return;
          resolved = resolveCorner(corner, setupOf(next));
          model.setCorner(resolved);
          restart();
        },
        setView: (view) => model.setView(view),
        setExplode: (amount) => model.setExplode(amount),
        setHighlight: (on) => model.setHighlight(on),
        setGhost: (alpha) => model.setGhost(alpha),
        part: (key) => model.parts[key],
        dispose: () => model.dispose(),
      };
    },
  };
}
