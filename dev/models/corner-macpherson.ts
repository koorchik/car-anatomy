// The MacPherson corner of the macpherson page (JTEKT hardpoints) with its setup: on a rig that moves the wheel through
// its travel, or driven over a bump or a kerb by the quarter car, with the forces on the wheel and the camber laser.

import { coilForce, bumpStopForce, G } from '../../src/suspension/forces.ts';
import { QuarterSim } from '../../src/suspension/quarter.ts';
import { EventRoad, RoadBuffer, type RoadEvent } from '../../src/suspension/road.ts';
import { DAMPER_PRESETS, SETUP_RANGES, factorySetup, resolveCorner, type CornerSetup, type DamperPreset } from '../../src/suspension/setup.ts';
import { jtektCorner } from '../../src/suspension/templates/macpherson.ts';
import { CornerModel, cornerFrame, frameFromQuarter } from '../../src/scene/suspension/corner-model.ts';
import { defineModel, type Values } from '../model-api.ts';

const corner = jtektCorner();
const factory = factorySetup(corner);
const spec = corner.axle;

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

export default defineModel({
  title: 'Кут Макферсона (JTEKT)',
  defaults: { view: 'solid' },
  controls: [
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
    { key: 'rack', label: 'Рейка, мм', kind: 'range', min: -50, max: 50, step: 1, value: 0 },
    { key: 'speed', label: 'Швидкість, км/год', kind: 'range', min: 5, max: 60, step: 1, value: 30 },
    { key: 'spring', label: 'Пружина, Н/мм', kind: 'range', min: SETUP_RANGES.springNmm[0], max: SETUP_RANGES.springNmm[1], step: 1, value: factory.springNmm },
    {
      key: 'damper',
      label: 'Амортизатор',
      kind: 'choice',
      value: 'factory',
      options: [{ value: 'factory', label: 'Заводський' }, ...Object.entries(DAMPER_PRESETS).map(([id, zeta]) => ({ value: id, label: `${PRESET_NAMES[id as DamperPreset]}, ζ ${zeta}` }))],
    },
    { key: 'ride', label: 'Висота кузова, мм', kind: 'range', min: SETUP_RANGES.rideHeightM[0] * 1000, max: SETUP_RANGES.rideHeightM[1] * 1000, step: 1, value: 0 },
    { key: 'camberSet', label: 'Виставити розвал', kind: 'toggle', value: false },
    { key: 'camber', label: 'Розвал, °', kind: 'range', min: SETUP_RANGES.camberDeg[0], max: SETUP_RANGES.camberDeg[1], step: 0.05, value: -1 },
    { key: 'toeSet', label: 'Виставити сходження', kind: 'toggle', value: false },
    { key: 'toe', label: 'Сходження, °', kind: 'range', min: SETUP_RANGES.toeDeg[0], max: SETUP_RANGES.toeDeg[1], step: 0.01, value: 0.1 },
    { key: 'pressure', label: 'Тиск шини, бар', kind: 'range', min: SETUP_RANGES.pressureBar[0], max: SETUP_RANGES.pressureBar[1], step: 0.05, value: factory.pressureBar },
    { key: 'forces', label: 'Сили на колесо', kind: 'toggle', value: true },
    { key: 'laser', label: 'Лазер розвалу', kind: 'toggle', value: true },
  ],
  create(values) {
    let resolved = resolveCorner(corner, setupOf(values));
    const model = new CornerModel(resolved);
    const frame = cornerFrame();
    let sim: QuarterSim | null = null;
    let scene: (typeof SCENES)[string] | null = null;

    /** The quarter car of the current scene, or none on the rig. */
    const restart = (): void => {
      const mode = values.mode as string;
      scene = SCENES[mode] ?? null;
      if (!scene) {
        sim = null;
        model.setRoad(null);
        return;
      }
      const road = new EventRoad(scene.events);
      model.setRoad(road);
      sim = new QuarterSim(resolved, new RoadBuffer(road, resolved.tyre.freeRadiusM, resolved.tyre.patchM), ((values.speed as number) / 3.6));
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
      // From the inboard side and the front: the strut, the arm, the rack and the shaft face the camera.
      home: [-0.72, 0.42, 0.8],
      groundY: 0,
      frame(_time, dt) {
        frame.rack = (values.rack as number) / 1000;
        if (sim && scene) {
          const steps = Math.min(100, Math.round(dt / 0.001));
          for (let i = 0; i < steps; i++) sim.step();
          if (sim.x > scene.lapM) sim.reset(0);
          frameFromQuarter(sim.observe(), frame);
          frame.spin += (sim.speed * dt) / resolved.wheelCentreZM;
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
});
