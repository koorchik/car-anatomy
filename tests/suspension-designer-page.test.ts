// The suspension designer's page (stage P8c) without a browser: the curves its graphs draw, the address that reopens a
// design, what makes the 3D rebuild, and the way in from a suspension page's Setup panel.

import { describe, expect, it, vi } from 'vitest';
import { SUSPENSION_PAGES } from '../src/data/suspensions.ts';
import { SpecChassisModel, drawsAxle } from '../src/scene/suspension/spec-chassis-model.ts';
import { evaluateChassis } from '../src/suspension/evaluate-chassis.ts';
import { evaluateSteering } from '../src/suspension/evaluate-steering.ts';
import { G } from '../src/suspension/forces.ts';
import { DAMPER_PRESETS, factorySetup } from '../src/suspension/setup.ts';
import { encodeChassis } from '../src/suspension-designer/codec.ts';
import { cornerSprungKg, resolveChassis, sameDesign } from '../src/suspension-designer/constraints.ts';
import { ROLL_CENTRE_SHOWN_M, rollCentreCurve, travelCurves, turnCurves, understeerParts } from '../src/suspension-designer/curves.ts';
import { DEFAULT_CHASSIS } from '../src/suspension-designer/defaults.ts';
import { axleKey, axleOf, type ChassisDesign } from '../src/suspension-designer/design.ts';
import { editChassis } from '../src/suspension-designer/edit.ts';
import { carriedNote, designWithSetup, handNote, pageDesign, takeNote } from '../src/suspension-designer/from-setup.ts';
import { designCorner, pageCorner } from '../src/suspension-designer/page-cars.ts';
import { CHASSIS_PRESETS, chassisPreset } from '../src/suspension-designer/presets.ts';
import { chassisToSpec } from '../src/suspension-designer/to-spec.ts';
import { rimRadiusM } from '../src/suspension-designer/geometry.ts';
import { designFromPath, modelKey } from '../src/ui/suspension-designer/page.ts';

const DEG = Math.PI / 180;

describe('the curves of the graphs', () => {
  const spec = chassisToSpec(DEFAULT_CHASSIS);

  it('run over the whole travel through rest, and the strut gains negative camber in bump', () => {
    const c = travelCurves(spec.front.axle);
    expect(c.travelM[0]).toBeCloseTo(-spec.front.axle.travel.droopM, 6);
    expect(c.travelM.at(-1)).toBeCloseTo(spec.front.axle.travel.bumpM, 6);
    const rest = c.travelM.indexOf(0);
    expect(rest).toBeGreaterThan(0);
    for (const ys of [c.camber, c.toe, c.rcHeight]) expect(ys.every(Number.isFinite)).toBe(true);
    // A strut gains negative camber in the first centimetres of bump (top of the wheel in), and less in droop.
    expect(c.camber[rest + 2]!).toBeLessThan(c.camber[rest]!);
    expect(c.camber[rest - 2]!).toBeGreaterThan(c.camber[rest]!);
  });

  it('give the roll centre at rest where the travel curve has it', () => {
    const travel = travelCurves(spec.front.axle);
    const roll = rollCentreCurve(spec.front.axle);
    expect(roll.rollRad[0]).toBe(0);
    expect(roll.heightM[0]).toBeCloseTo(travel.rcHeight[travel.travelM.indexOf(0)]!, 3);
  });

  it('follow the roll centre only as far as a graph can show it, and leave a gap where the force lines run parallel', () => {
    // A pure trailing arm's force lines lie along the road: in roll they barely cross, metres away.
    const trailing = editChassis(DEFAULT_CHASSIS, { layoutR: 'trailing-arm' } as Partial<ChassisDesign>);
    const designs = [trailing, ...CHASSIS_PRESETS.map((p) => resolveChassis(p.design()))];
    for (const d of designs) {
      const s = chassisToSpec(d);
      for (const axle of [s.front.axle, s.rear.axle]) {
        for (const h of rollCentreCurve(axle).heightM) if (Number.isFinite(h)) expect(Math.abs(h)).toBeLessThanOrEqual(ROLL_CENTRE_SHOWN_M);
      }
    }
    // A double wishbone's lines cross near the road all the way.
    expect(rollCentreCurve(spec.front.axle).heightM.every(Number.isFinite)).toBe(true);
  });

  it('carry the car on its four wheels at every lateral acceleration, and the outer wheels take more', () => {
    const perf = evaluateChassis(spec);
    const turn = turnCurves(perf, evaluateSteering(spec));
    const weight = DEFAULT_CHASSIS.massKg * G;
    for (const loads of turn.loads) expect(loads.reduce((s, l) => s + l, 0) / weight).toBeCloseTo(1, 2);
    // A left turn: the right wheels are the outer ones.
    const [fl, fr, rl, rr] = turn.loads.at(-1)!;
    expect(fr).toBeGreaterThan(fl);
    expect(rr).toBeGreaterThan(rl);
  });

  it('start the steering at the geometric angle and climb at the understeer gradient where the model takes it', () => {
    const perf = evaluateChassis(spec);
    const turn = turnCurves(perf, evaluateSteering(spec));
    expect(perf.understeerPerG).toBeGreaterThan(0);
    expect(turn.steeringWheel[0]).toBeCloseTo(turn.neutral, 6);
    // Past an axle's peak the angle is NaN, and the graph ends there.
    expect(turn.steeringWheel.filter(Number.isFinite).at(-1)!).toBeGreaterThan(turn.neutral);
    // The headline gradient is the slope at 0.3 g (evaluate-chassis.ts); the steady turn the graph draws is the same.
    const steer = (g: number): number => {
      const s = perf.turnAt(g * G);
      return s.slipDiff + s.rollSteerDiff;
    };
    expect((steer(0.35) - steer(0.25)) / 0.1 / perf.understeerPerG).toBeCloseTo(1, 3);
  });

  it('split the understeer into parts that add up to the gradient', () => {
    for (const preset of CHASSIS_PRESETS) {
      const perf = evaluateChassis(chassisToSpec(resolveChassis(preset.design())));
      const sum = understeerParts(perf).reduce((s, p) => s + p.value, 0);
      expect(sum / DEG, preset.id).toBeCloseTo(perf.understeerPerG / DEG, 3);
    }
  });
});

describe('the address', () => {
  it('reopens the same design from its code, and a preset by name', () => {
    const design = editChassis(DEFAULT_CHASSIS, { [axleKey('barMm', 'F')]: 26 } as Partial<ChassisDesign>);
    expect(sameDesign(designFromPath([encodeChassis(design)])!, design)).toBe(true);
    const preset = CHASSIS_PRESETS.at(-1)!;
    expect(sameDesign(designFromPath(['from', preset.id])!, resolveChassis(chassisPreset(preset.id)!.design()))).toBe(true);
    expect(designFromPath([])).toBeNull();
    expect(designFromPath(['from'])).toBeNull();
  });
});

describe('the 3D', () => {
  it('rebuilds for a new geometry or a visibly thicker coil, and not for a damper or a mass on its own springs', () => {
    // Springs of their own, so the mass does not move the rate (a typical spring follows it).
    const base = editChassis(DEFAULT_CHASSIS, { springNmmF: 32, springNmmR: 60 } as Partial<ChassisDesign>);
    const key = modelKey(base);
    const same = (patch: Partial<ChassisDesign>): boolean => modelKey(editChassis(base, patch)) === key;
    expect(same({ [axleKey('damper', 'F')]: 'track' } as Partial<ChassisDesign>)).toBe(true);
    expect(same({ massKg: base.massKg + 100 })).toBe(true);
    expect(same({ wheelbaseMm: base.wheelbaseMm + 100 })).toBe(false);
    expect(same({ layoutR: 'twist-beam' } as Partial<ChassisDesign>)).toBe(false);
    // The coil's wire is drawn from the rate (d ∝ k^¼): twice the rate is a wire 19% thicker.
    expect(same({ springNmmR: 120 } as Partial<ChassisDesign>)).toBe(false);
  });
});

describe('the 3D of every preset', () => {
  it('draws whole every axle it can draw, wishbones with a bar too, and the rest as wheels', () => {
    const context = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }), set: () => true });
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
    try {
      for (const preset of CHASSIS_PRESETS) {
        const d = resolveChassis(preset.design());
        const spec = chassisToSpec(d);
        const wheel = (end: 'F' | 'R') => {
          const a = axleOf(d, end);
          return { rimRadiusM: rimRadiusM(a), rimWidthM: (a.tyreWidthMm / 1000) * 0.9, tyreWidthM: a.tyreWidthMm / 1000 };
        };
        const model = new SpecChassisModel({ spec, wheels: { front: wheel('F'), rear: wheel('R') }, sprungKg: { front: cornerSprungKg(d, 'F'), rear: cornerSprungKg(d, 'R') } });
        expect(model.axles.map((a) => a !== null), preset.id).toEqual([drawsAxle(spec.front.axle), drawsAxle(spec.rear.axle)]);
        model.dispose();
      }
    } finally {
      vi.unstubAllGlobals();
    }
    // Twenty chassis built whole: slow on a busy machine.
  }, 30_000);
});

describe('from a suspension page into the designer', () => {
  it('an untouched setup opens the page car as it is, on every page and car', () => {
    for (const page of SUSPENSION_PAGES) {
      for (const car of [null, ...page.cars]) {
        const corner = pageCorner(page, car);
        const factory = factorySetup(corner);
        const carried = designWithSetup(pageDesign(page, car), car ? car.link.end : page.base.end, factory, factory);
        expect(carried.design, `${page.id} ${car?.link.car ?? ''}`).toBe(pageDesign(page, car));
        expect(carried.dropped).toEqual([]);
      }
    }
  });

  it('the typical pages stand for the design their corner comes from', () => {
    for (const page of SUSPENSION_PAGES) {
      if (page.base.geometry !== 'typical') continue;
      expect(designCorner(pageDesign(page, null), page.base.end)).toEqual(page.base.corner());
    }
  });

  it('carries the spring, a damping ratio, camber and toe onto the axle shown, and says what stayed behind', () => {
    const corner = designCorner(DEFAULT_CHASSIS, 'F');
    const factory = factorySetup(corner);
    const setup = { ...factory, springNmm: factory.springNmm + 10, damper: 0.45, camberDeg: -1.5, toeDeg: 0.1, rideHeightM: -0.02 };
    const carried = designWithSetup(DEFAULT_CHASSIS, 'F', setup, factory);
    const d = carried.design;
    expect(d.springNmmF).toBeCloseTo(setup.springNmm, 6);
    expect(d.damperF).toBe('custom');
    expect(d.camberDegF).toBeCloseTo(-1.5, 6);
    expect(d.toeDegF).toBeCloseTo(0.1, 6);
    expect(d.springNmmR).toBe(DEFAULT_CHASSIS.springNmmR);
    expect(carried.dropped).toEqual(['rideHeight']);
    // The damping ratio asked for is what the evaluated axle has, near enough for a damper of two slopes.
    expect(evaluateChassis(chassisToSpec(d)).axles[0].body.zeta).toBeGreaterThan(0.3);
    expect(sameDesign(resolveChassis(d), d)).toBe(true);
  });

  it('a damping ratio carried with a new spring damps the body as the designer\'s preset of that ratio does', () => {
    // The ratio belongs to the body frequency on the visitor's spring: a stiffer spring needs a stiffer damper for the
    // same ζ (c = 4π·ζ·f·m), as the Setup panel itself computes it.
    const corner = designCorner(DEFAULT_CHASSIS, 'F');
    const factory = factorySetup(corner);
    const spring = factory.springNmm * 1.4;
    const carried = designWithSetup(DEFAULT_CHASSIS, 'F', { ...factory, springNmm: spring, damper: DAMPER_PRESETS.sport }, factory).design;
    const preset = editChassis(DEFAULT_CHASSIS, { springNmmF: spring, damperF: 'sport' } as Partial<ChassisDesign>);
    const zeta = (d: ChassisDesign): number => evaluateChassis(chassisToSpec(d)).axles[0].body.zeta;
    expect(zeta(carried) / zeta(preset)).toBeCloseTo(1, 2);
  });

  it('hands its note to the designer once', () => {
    handNote(carriedNote(['pressure']));
    const note = takeNote();
    expect(note.length).toBeGreaterThan(0);
    expect(takeNote()).toBe('');
  });
});
