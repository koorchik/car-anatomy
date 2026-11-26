// The suspension designer's model (suspensions plan, tests of suspension-designer). Stage P8a: the design, its limits and
// resolveChassis, the spec, the link codec, the presets and the catalogue as designs. Stage P8b: the quick estimates
// (evaluateChassis), the diagnoses and the character of the ride, the sensitivity checks, and that no control is dead.

import { describe, expect, it } from 'vitest';
import { buildChassis } from '../src/suspension/chassis.ts';
import { Axle, newCornerSample } from '../src/suspension/kinematics.ts';
import { carChassis } from '../src/suspension/car-chassis.ts';
import type { AxleSpec } from '../src/suspension/spec.ts';
import { CARS } from '../src/data/cars.ts';
import { CHASSIS_CARS } from '../src/data/chassis.ts';
import { DRIVE_CARS } from '../src/data/drive-cars.ts';
import {
  AXLE_KEYS, axleOf, CAR_KEYS, FRONT_LAYOUTS, REAR_LAYOUTS, withAxle, type ChassisDesign, type DesignKey,
} from '../src/suspension-designer/design.ts';
import { DEFAULT_CHASSIS, typicalAxle } from '../src/suspension-designer/defaults.ts';
import { axleRange, paramRange, resolveChassis, sameDesign, type AxleNumericKey } from '../src/suspension-designer/constraints.ts';
import { axleGeometry } from '../src/suspension-designer/geometry.ts';
import { chassisToSpec, rideHz } from '../src/suspension-designer/to-spec.ts';
import { decodeChassis, encodeChassis } from '../src/suspension-designer/codec.ts';
import { CHASSIS_CATALOGUE, catalogueChassis } from '../src/suspension-designer/catalogue.ts';
import { CHASSIS_PRESETS, ODD_PRESETS, chassisPreset, randomChassis, seededRandom } from '../src/suspension-designer/presets.ts';
import { editChassis, withLayout } from '../src/suspension-designer/edit.ts';
import { evaluateChassis, type ChassisPerformance } from '../src/suspension/evaluate-chassis.ts';
import { chassisCharacter, diagnoseChassis } from '../src/suspension-designer/diagnostics.ts';
import { CHASSIS_CONTROLS, controlsFor } from '../src/suspension-designer/controls.ts';
import {
  causesOfChassis, chassisProbe, chassisSnapshot, controlTries, previewChassisEffects, sensitivityPass,
} from '../src/suspension-designer/sensitivity.ts';
import { withDesignOnlyGeometry } from '../src/suspension-designer/geometry.ts';
import { G } from '../src/suspension/forces.ts';

const DEG = Math.PI / 180;
const KEYS = [...CAR_KEYS, ...AXLE_KEYS.flatMap((k) => [`${k}F`, `${k}R`])].sort();
const NUMERIC_AXLE_KEYS = AXLE_KEYS.filter((k) => typeof DEFAULT_CHASSIS[`${k}F` as DesignKey] === 'number') as AxleNumericKey[];

/** 500 random designs from seeds, made once: the slow part of this file. */
const RANDOM: ChassisDesign[] = Array.from({ length: 500 }, (_, i) => randomChassis(seededRandom(i + 1)));

describe('the default design', () => {
  it('has every key of the car and both axles, and nothing else', () => {
    expect(Object.keys(DEFAULT_CHASSIS).sort()).toEqual(KEYS);
  });

  it('is its own resolution and builds a car that stands on its springs at the typical ride frequencies', () => {
    expect(sameDesign(resolveChassis(DEFAULT_CHASSIS), DEFAULT_CHASSIS)).toBe(true);
    const c = buildChassis(chassisToSpec(DEFAULT_CHASSIS));
    expect(c.massKg).toBe(1400);
    expect(c.tracks[0]).toBeCloseTo(1.55, 3);
    expect(c.tracks[1]).toBeCloseTo(1.54, 3);
    expect(rideHz(DEFAULT_CHASSIS, 'F')).toBeCloseTo(1.3, 6);
    expect(rideHz(DEFAULT_CHASSIS, 'R')).toBeCloseTo(1.45, 6);
  });
});

describe('the spec', () => {
  it('gives an own damper its coefficients, knee and slope, and a preset the templates\' knee', () => {
    const own = editChassis(DEFAULT_CHASSIS, { damperR: 'custom', damperCompressionR: 3000, damperReboundR: 7000, damperKneeMsR: 0.2, damperHighRatioR: 0.8 });
    expect(chassisToSpec(own).rear.axle.damper).toMatchObject({ compression: 3000, rebound: 7000, kneeMs: 0.2, highRatio: 0.8 });
    expect(chassisToSpec(own).front.axle.damper.kneeMs).toBe(0.1);
  });

  it('puts inboard brakes only on a driven axle: their torque needs the half-shafts', () => {
    const inboard = editChassis(DEFAULT_CHASSIS, { brakeInboardF: true, brakeInboardR: true });
    expect(chassisToSpec(inboard).longitudinal.brakeInboard).toEqual([true, false]);
    expect(chassisToSpec(editChassis(inboard, { drive: 'awd' })).longitudinal.brakeInboard).toEqual([true, true]);
  });
});

describe('resolveChassis', () => {
  it('is idempotent on every preset and on 500 random designs', () => {
    for (const d of [...CHASSIS_PRESETS.map((p) => p.design()), ...RANDOM]) expect(sameDesign(resolveChassis(d), d)).toBe(true);
  }, 60_000);

  it('leaves every number inside its range, and every range is a range', () => {
    for (const d of [DEFAULT_CHASSIS, ...RANDOM.slice(0, 100)]) {
      for (const end of ['F', 'R'] as const) {
        for (const key of NUMERIC_AXLE_KEYS) {
          const r = axleRange(d, end, key);
          expect(r.min, `${key}${end}`).toBeLessThanOrEqual(r.max);
          const v = axleOf(d, end)[key];
          if (v === null) continue;
          if (key === 'barMm' && v === 0) continue;
          if (key === 'barWallMm' && v === 0) continue;
          expect(v, `${key}${end}`).toBeGreaterThanOrEqual(r.min - 1e-9);
          expect(v, `${key}${end}`).toBeLessThanOrEqual(r.max + 1e-9);
        }
      }
      for (const key of ['massKg', 'frontShare', 'cgHeightMm', 'wheelbaseMm', 'brakeFront', 'driveFront', 'finalDrive'] as const) {
        const r = paramRange(d, key);
        expect(d[key]).toBeGreaterThanOrEqual(r.min);
        expect(d[key]).toBeLessThanOrEqual(r.max);
      }
    }
  }, 30_000);

  it('turns hostile input into a buildable design with the default keys and a plain prototype', () => {
    const hostile: unknown[] = [
      null,
      undefined,
      42,
      'chassis',
      [],
      [1, 2, 3],
      JSON.parse('{"__proto__": {"massKg": 99999, "polluted": true}, "constructor": {"prototype": {"x": 1}}}'),
      { massKg: Number.NaN, frontShare: Infinity, cgHeightMm: -1e9, wheelbaseMm: '2600', drive: 'tank', tyre: 'wooden' },
      { layoutF: 'twist-beam', layoutR: 'macpherson', knuckleF: 'banana', damperF: 'magic', solidLateralR: 'rope' },
      { car: '__proto__', springNmmF: 'stiff', springNmmR: -5, barMmF: 3, barWallMmF: 40, barMmR: 1e6 },
      { car: 'constructor', trackMmF: 1e9, trackMmR: -1e9, lowerArmMmF: 1e9, upperArmMmF: 0, rimInF: 99, tyreAspectF: 1 },
      { layoutR: 'twist-beam', drive: 'rwd', sweepDegR: 1e9, pivotArmMmR: Number.NaN },
      { layoutR: 'swing-axle', camberDegR: -4, toeDegR: 0.5, drive: 'awd' },
      { layoutR: 'live-axle', solidLateralR: 'leaf', lateralZMmR: 1e9, linkAngleDegR: 89, unsprungKgR: 1e9, massKg: 1 },
      Object.create({ massKg: 2000 }),
    ];
    for (const input of hostile) {
      const d = resolveChassis(input);
      expect(Object.getPrototypeOf(d)).toBe(Object.prototype);
      expect(Object.keys(d).sort()).toEqual(KEYS);
      expect(sameDesign(resolveChassis(d), d)).toBe(true);
      expect(() => buildChassis(chassisToSpec(d))).not.toThrow();
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    // Read from own properties only: an inherited mass is not the design's.
    expect(resolveChassis(Object.create({ massKg: 2000 })).massKg).toBe(DEFAULT_CHASSIS.massKg);
    // A car id must name a car; a driven rear axle cannot keep a twist beam.
    expect(resolveChassis({ car: '__proto__' }).car).toBeNull();
    expect(resolveChassis({ car: 'civic-type-r-fk8' }).car).toBe('civic-type-r-fk8');
    expect(resolveChassis({ layoutR: 'twist-beam', drive: 'rwd' }).layoutR).toBe('multilink');
    // A front axle takes only steered links.
    expect(FRONT_LAYOUTS).toContain(resolveChassis({ layoutF: 'live-axle' }).layoutF);
  }, 30_000);

  it('gives an axle that cannot assemble its layout\'s typical geometry, and keeps one that can', () => {
    // Steep arms with the pivots far below the ball joints still assemble; the layout's limits keep it so.
    const d = resolveChassis(withAxle(DEFAULT_CHASSIS, 'R', { ...typicalAxle('trailing-arm', 'R'), pivotArmMm: 200, pivotDzMm: 150 }));
    expect(d.layoutR).toBe('trailing-arm');
    expect(() => axleGeometry(d, 'R')).not.toThrow();
  });

  it('keeps a spring between 0.6 and 6 Hz of body ride over its corners', () => {
    const soft = resolveChassis(withAxle(DEFAULT_CHASSIS, 'F', { springNmm: 0.001 }));
    const stiff = resolveChassis(withAxle(DEFAULT_CHASSIS, 'F', { springNmm: 1e6 }));
    expect(rideHz(soft, 'F')).toBeCloseTo(0.6, 2);
    expect(rideHz(stiff, 'F')).toBeGreaterThan(4);
    expect(soft.springNmmF).toBe(axleRange(soft, 'F', 'springNmm').min);
  });
});

describe('the link codec', () => {
  it('stores only what differs from the default', () => {
    expect(encodeChassis(DEFAULT_CHASSIS)).toBe('e30');
    expect(atob(encodeChassis({ ...DEFAULT_CHASSIS, massKg: 1500 }))).toBe('{"massKg":1500}');
  });

  it('gives back the same design for every preset and 500 random designs', () => {
    for (const d of [...CHASSIS_PRESETS.map((p) => p.design()), ...RANDOM]) {
      const back = decodeChassis(encodeChassis(d));
      expect(back).not.toBeNull();
      expect(sameDesign(back!, d)).toBe(true);
    }
  }, 60_000);

  it('tolerates anything: not base64, not JSON, not an object, unknown keys, wrong types', () => {
    const b64 = (s: string): string => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    for (const text of ['', '!!!', '%%%%', b64('not json'), b64('42'), b64('null'), b64('[1,2]'), b64('"x"'), '\u0000']) {
      expect(decodeChassis(text)).toBeNull();
    }
    const odd = decodeChassis(b64('{"massKg":"heavy","layoutR":"live-axle","whatever":1,"__proto__":{"a":1},"springNmmR":null}'));
    expect(odd).not.toBeNull();
    expect(odd!.massKg).toBe(DEFAULT_CHASSIS.massKg);
    expect(odd!.layoutR).toBe('live-axle');
    expect(Object.keys(odd!).sort()).toEqual(KEYS);
  });
});

describe('500 random designs', () => {
  it('never throw and assemble into a chassis', () => {
    let built = 0;
    for (const [i, d] of RANDOM.entries()) {
      const spec = chassisToSpec(d);
      expect(spec.front.axle.layout).toBe(d.layoutF);
      expect(spec.rear.axle.layout).toBe(d.layoutR);
      // A solid axle's grid takes a few hundred least-squares walks (100–300 ms): every fifth one is built, the rest
      // were walked to the four corners of their travel by resolveChassis (geometry.ts).
      const solid = spec.rear.axle.linkage.kind === 'solid';
      if (solid && i % 5 !== 0) continue;
      const c = buildChassis(spec);
      expect(c.corners.every((k) => k.spring.staticN > 0)).toBe(true);
      built++;
    }
    expect(built).toBeGreaterThan(400);
  }, 120_000);

  it('cover every layout of both axles', () => {
    expect(new Set(RANDOM.map((d) => d.layoutF))).toEqual(new Set(FRONT_LAYOUTS));
    expect(new Set(RANDOM.map((d) => d.layoutR))).toEqual(new Set(REAR_LAYOUTS));
  });
});

describe('the catalogue', () => {
  it('has every car with a chassis, as a design the designer leaves unchanged', () => {
    expect(CHASSIS_CATALOGUE.map((e) => e.id).sort()).toEqual(Object.keys(CHASSIS_CARS).sort());
    for (const entry of CHASSIS_CATALOGUE) expect(sameDesign(resolveChassis(entry.design), entry.design), entry.id).toBe(true);
  });

  it.each(CHASSIS_CATALOGUE.map((e) => [e.id, e] as const))('%s opens in the designer and gives the same spec', (_id, entry) => {
    const opened = decodeChassis(encodeChassis(entry.design));
    expect(opened).not.toBeNull();
    expect(chassisToSpec(opened!)).toEqual(catalogueChassis(entry));
  });

  it.each(CHASSIS_CATALOGUE.map((e) => [e.id, e] as const))('%s keeps the record and the 3D chassis: layouts, tracks, mass, wheels, half-shafts', (id, entry) => {
    const car = CARS[id]!;
    const spec = catalogueChassis(entry);
    expect(car.suspension).toEqual({ front: spec.front.axle.layout, rear: spec.rear.axle.layout });
    const c = buildChassis(spec);
    expect(c.tracks[0]).toBeCloseTo(car.body.trackFrontM, 6);
    expect(c.tracks[1]).toBeCloseTo(car.body.trackRearM, 6);
    expect(spec.body.massKg).toBeGreaterThan(car.massKg);
    expect(spec.tyre).toBe(car.tyre.id);
    // The 3D chassis (carChassis) builds the same corners from the same record: same hardpoints of the links, same
    // wheel centre, same free tyre radius, and the half-shaft from the same inner joint.
    const three = carChassis(car, CHASSIS_CARS[id]!, DRIVE_CARS[id]?.driveline.diffOutputs ?? {});
    for (const [mine, theirs] of [[spec.front, three.front], [spec.rear, three.rear]] as const) {
      const a = mine.axle as AxleSpec;
      const b = theirs.corner.axle;
      expect(a.wheelCentre[1]).toBeCloseTo(b.wheelCentre[1], 9);
      expect(a.wheelCentre[2]).toBeCloseTo(b.wheelCentre[2], 9);
      expect(a.linkage.rods.map((r) => r.body)).toEqual(b.linkage.rods.map((r) => r.body));
      expect(a.linkage.wishbones).toEqual(b.linkage.wishbones);
      expect(mine.tyreRadiusM).toBeCloseTo(theirs.wheel.outerRadiusM, 9);
      if (b.halfshaft) {
        expect(a.halfshaft!.diffOutput[1]).toBeCloseTo(b.halfshaft.diffOutput[1], 9);
        expect(a.halfshaft!.diffOutput[2]).toBeCloseTo(b.halfshaft.diffOutput[2], 9);
      } else expect(a.halfshaft).toBeNull();
    }
  });
});

describe('buildChassis', () => {
  const best = (f: () => void, n = 5): number => {
    let t = Infinity;
    for (let i = 0; i < n; i++) {
      const t0 = performance.now();
      f();
      t = Math.min(t, performance.now() - t0);
    }
    return t;
  };

  it('takes under 30 ms for the default design and every catalogue car', () => {
    for (const d of [DEFAULT_CHASSIS, ...CHASSIS_CATALOGUE.map((e) => e.design)]) {
      const spec = chassisToSpec(d);
      expect(best(() => buildChassis(spec))).toBeLessThan(30);
    }
  });
});

describe('presets', () => {
  it('have unique ids, and each builds', () => {
    expect(new Set(CHASSIS_PRESETS.map((p) => p.id)).size).toBe(CHASSIS_PRESETS.length);
    for (const p of CHASSIS_PRESETS) expect(() => buildChassis(chassisToSpec(p.design())), p.id).not.toThrow();
  }, 30_000);

  it('the odd ones are odd in the way their names say', () => {
    expect(ODD_PRESETS.map((p) => p.id).sort()).toEqual(['bump-steer', 'corvair-swing-axle', 'high-roll-centre', 'too-soft']);
    const sample = (d: ChassisDesign) => {
      const s = newCornerSample();
      new Axle(axleGeometry(d, 'F').spec as AxleSpec, { table: false }).measureAt(0, s);
      return s;
    };
    // Bump steer past the 10°/m of the plan's diagnosis; the factory-like default has none.
    expect(Math.abs(sample(chassisPreset('bump-steer')!.design()).bumpSteer)).toBeGreaterThan(10 * DEG);
    expect(Math.abs(sample(withLayout(DEFAULT_CHASSIS, 'F', 'double-wishbone')).bumpSteer)).toBeLessThan(1e-6);
    // A roll centre above the 250 mm of the plan's diagnosis.
    expect(sample(chassisPreset('high-roll-centre')!.design()).rcHeight).toBeGreaterThan(0.25);
    // Springs at the lowest ride frequency the limits allow.
    const soft = chassisPreset('too-soft')!.design();
    expect(rideHz(soft, 'F')).toBeCloseTo(0.6, 2);
    expect(soft.damperF).toBe('worn');
    const corvair = chassisPreset('corvair-swing-axle')!.design();
    expect([corvair.layoutR, corvair.drive]).toEqual(['swing-axle', 'rwd']);
    expect(corvair.frontShare).toBeLessThan(0.45);
  });

  it('a random design repeats from its seed', () => {
    expect(sameDesign(randomChassis(seededRandom(7)), randomChassis(seededRandom(7)))).toBe(true);
    expect(sameDesign(randomChassis(seededRandom(7)), randomChassis(seededRandom(8)))).toBe(false);
  });
});

describe('editChassis', () => {
  it('a new layout brings its typical geometry and a typical spring', () => {
    const stiff = editChassis(DEFAULT_CHASSIS, { springNmmR: 80 });
    const moved = editChassis(stiff, { layoutR: 'semi-trailing' });
    expect(moved.layoutR).toBe('semi-trailing');
    expect(moved.sweepDegR).toBe(typicalAxle('semi-trailing', 'R').sweepDeg);
    expect(moved.springNmmR).toBeNull();
  });

  it('a twist beam takes the drive to the front wheels, and rear drive takes the twist beam away', () => {
    const rwd = editChassis(DEFAULT_CHASSIS, { drive: 'rwd' });
    expect(editChassis(rwd, { layoutR: 'twist-beam' }).drive).toBe('fwd');
    const beam = editChassis(DEFAULT_CHASSIS, { layoutR: 'twist-beam' });
    expect(editChassis(beam, { drive: 'awd' }).layoutR).toBe('multilink');
  });

  it('a split strut knuckle brings its own kingpin offset and inclination', () => {
    const revo = editChassis(DEFAULT_CHASSIS, { knuckleF: 'revoknuckle' });
    expect(revo.kingpinOffsetMmF).toBe(25);
    expect(revo.kpiDegF).toBe(8);
    const s = newCornerSample();
    new Axle(axleGeometry(revo, 'F').spec as AxleSpec, { table: false }).measureAt(0, s);
    expect(s.kingpinOffset).toBeCloseTo(0.025, 3);
  });

  it('static camber and toe are what the wheel has at design', () => {
    const d = editChassis(DEFAULT_CHASSIS, { camberDegF: -2, toeDegF: 0.2 });
    const s = newCornerSample();
    new Axle(axleGeometry(d, 'F').spec as AxleSpec, { table: false }).measureAt(0, s);
    expect(s.camber / DEG).toBeCloseTo(-2, 6);
    expect(s.toe / DEG).toBeCloseTo(0.2, 6);
  });
});

/** The best of `n` runs of `f(i)`, ms: the machine may be shared, and only the quickest run says what the code costs. */
function bestOf(n: number, f: (i: number) => void): number {
  let t = Infinity;
  for (let i = 1; i <= n; i++) {
    const t0 = performance.now();
    f(i);
    t = Math.min(t, performance.now() - t0);
  }
  return t;
}

/** The design with both tracks a fraction of a millimetre wider: new geometry for every cache, the same car. */
const nudged = (d: ChassisDesign, i: number): ChassisDesign =>
  withDesignOnlyGeometry(() => resolveChassis({ ...d, trackMmF: d.trackMmF + 0.3 * i, trackMmR: d.trackMmR + 0.3 * i }));

describe('evaluateChassis', () => {
  it('takes under 5 ms for a design it has not seen, a solid axle too', () => {
    const rwd = editChassis(DEFAULT_CHASSIS, { drive: 'rwd' });
    const designs: Array<[string, ChassisDesign]> = [
      ...CHASSIS_PRESETS.map((p): [string, ChassisDesign] => [p.id, p.design()]),
      ['de Dion', editChassis(rwd, { layoutR: 'de-dion' })],
      ['live axle', editChassis(rwd, { layoutR: 'live-axle' })],
    ];
    for (const [id, d] of designs) {
      const specs = Array.from({ length: 8 }, (_, i) => chassisToSpec(nudged(d, i + 1)));
      expect(bestOf(8, (i) => evaluateChassis(specs[i - 1])), id).toBeLessThan(5);
    }
  }, 60_000);

  it("gives the full grid's numbers within 0.5 %", () => {
    const figures = (x: ChassisPerformance): Array<[string, number, number]> => {
      // [name, value, the size below which a difference is not worth a figure on the page]
      const out: Array<[string, number, number]> = [
        ['comfort', x.comfortAw, 1e-3], ['grip', x.roughGrip, 1e-4], ['roll', x.rollPerG, 1e-5], ['front transfer', x.frontTransferShare, 1e-4],
        ['understeer', x.understeerPerG, 1e-5], ['skidpad', x.skidpadAcc, 1e-3], ['braking', x.brakingM, 1e-3], ['pitch', x.pitchPerG, 1e-5],
        ['rollover', x.rolloverAcc, 1e-3], ['anti-dive', x.anti.braking[0], 0.01], ['anti-lift', x.anti.braking[1], 0.01],
      ];
      for (const [k, v] of Object.entries(x.understeerTerms)) out.push([`understeer: ${k}`, v, 1e-5]);
      x.axles.forEach((a, k) => {
        const end = k === 0 ? 'F' : 'R';
        out.push(
          [`ride ${end}`, a.rideHz, 1e-4], [`ζ ${end}`, a.body.zeta, 1e-4], [`roll centre ${end}`, a.rollCentreM, 1e-5],
          [`outer camber ${end}`, a.outerCamberRoad, 1e-5], [`reserve ${end}`, a.travelReserveM, 1e-5], [`DLC ${end}`, a.smooth.dlc, 1e-4],
          [`roll steer ${end}`, a.rollSteer, 1e-4], [`bump steer ${end}`, a.bumpSteer, 1e-4],
        );
      });
      return out;
    };
    for (const p of CHASSIS_PRESETS) {
      const spec = chassisToSpec(p.design());
      const lite = figures(evaluateChassis(spec));
      const full = figures(evaluateChassis(spec, { full: true }));
      lite.forEach(([name, v], i) => {
        const [, w, floor] = full[i];
        expect(Math.abs(v - w), `${p.id}: ${name} ${v} against ${w}`).toBeLessThanOrEqual(Math.max(0.005 * Math.abs(w), floor));
      });
    }
  }, 120_000);

  it('moves the way the physics says', () => {
    const at = (patch: Partial<ChassisDesign>) => evaluateChassis(chassisToSpec(editChassis(DEFAULT_CHASSIS, patch)));
    const base = evaluateChassis(chassisToSpec(DEFAULT_CHASSIS));
    // A stiffer front bar takes more of the transfer to the front and adds understeer, and the body rolls less.
    const bar = at({ barMmF: 30 });
    expect(bar.frontTransferShare).toBeGreaterThan(base.frontTransferShare);
    expect(bar.understeerPerG).toBeGreaterThan(base.understeerPerG);
    expect(bar.rollPerG).toBeLessThan(base.rollPerG);
    // More negative static camber leans the outer wheel less to the road: −2° keeps the front off its shoulder.
    const cambered = at({ camberDegF: -2 }).axles[0].outerCamberRoad;
    expect(cambered).toBeLessThan(base.axles[0].outerCamberRoad - 1.5 * DEG);
    expect(base.axles[0].outerCamberRoad).toBeGreaterThan(0.5 * DEG);
    expect(cambered).toBeLessThan(0.5 * DEG);
    // Harder dampers damp the body more, and the ride frequency stays.
    const track = at({ damperF: 'track' });
    expect(track.axles[0].body.zeta).toBeGreaterThan(base.axles[0].body.zeta);
    expect(track.axles[0].rideHz).toBeCloseTo(base.axles[0].rideHz, 6);
    // A higher centre of mass rolls more, pitches more, and tips sooner.
    const tall = at({ cgHeightMm: 700 });
    expect(tall.rollPerG).toBeGreaterThan(base.rollPerG);
    expect(tall.pitchPerG).toBeGreaterThan(base.pitchPerG);
    expect(tall.rolloverAcc).toBeLessThan(base.rolloverAcc);
    // Static toe costs drag only when there is some.
    expect(base.toeDragShare).toBe(0);
    expect(at({ toeDegR: 0.3 }).toeDragShare).toBeGreaterThan(0);
    // The tyres hold about their μ (street: 1.0) across and along.
    expect(base.skidpadAcc / G).toBeGreaterThan(0.7);
    expect(base.skidpadAcc / G).toBeLessThan(1.05);
    expect(base.brakingAcc / G).toBeLessThan(1.05);
    // Without roll steer the parts add up to the gradient.
    const t = base.understeerTerms;
    expect(t.tyres + t.transfer + t.camber + t.rollSteer).toBeCloseTo(base.understeerPerG, 12);
  });

  it('with an ideal ABS the brake balance sets which axle locks first, not the stopping distance', () => {
    const at = (brakeFront: number) => evaluateChassis(chassisToSpec(editChassis(DEFAULT_CHASSIS, { brakeFront })));
    const front = at(0.9);
    const rear = at(0.4);
    // ABS holds the axle that reaches its peak there while the other one's pressure keeps rising to its own peak.
    expect(front.brakingM).toBeCloseTo(rear.brakingM, 9);
    expect(front.firstLock).toBe(0);
    expect(rear.firstLock).toBe(1);
    // Without ABS a balance far from the grip of each axle locks sooner; the best balance reaches what ABS gets.
    for (const p of [front, rear]) expect(p.lockAcc).toBeLessThan(p.brakingAcc);
    let best = 0;
    for (let beta = 0.4; beta <= 0.9; beta += 0.005) best = Math.max(best, at(beta).lockAcc);
    expect(best).toBeGreaterThan(0.995 * front.brakingAcc);
    expect(best).toBeLessThanOrEqual(front.brakingAcc * (1 + 1e-9));
    // A rear-engined car (the Corvair, 38 % on the front) stops in about the same distance as a front-heavy one on the
    // same tyres, though the typical balance of 0.7 locks its front wheels early.
    const corvair = evaluateChassis(chassisToSpec(chassisPreset('corvair-swing-axle')!.design()));
    expect(corvair.firstLock).toBe(0);
    expect(corvair.lockAcc).toBeLessThan(0.8 * corvair.brakingAcc);
  });

  it('a live axle under drive unloads one rear wheel, and the final drive sets how much', () => {
    const live = editChassis(editChassis(DEFAULT_CHASSIS, { drive: 'rwd' }), { layoutR: 'live-axle' });
    const short = evaluateChassis(chassisToSpec(live)).propUnload;
    expect(short).toBeGreaterThan(0);
    expect(evaluateChassis(chassisToSpec(editChassis(live, { finalDrive: 2 * live.finalDrive > 6 ? 6 : 2 * live.finalDrive }))).propUnload).toBeLessThan(short);
    expect(Number.isNaN(evaluateChassis(chassisToSpec(DEFAULT_CHASSIS)).propUnload)).toBe(true);
  });
});

describe('diagnoses', () => {
  const diagnosed = (d: ChassisDesign) => diagnoseChassis(d, evaluateChassis(chassisToSpec(d)));
  const ids = (d: ChassisDesign) => diagnosed(d).map((x) => x.id);

  it('no car of the catalogue gets a fatal one', () => {
    for (const e of CHASSIS_CATALOGUE) expect(diagnosed(e.design).filter((x) => x.severity === 'fatal'), e.id).toEqual([]);
  });

  it('the odd presets get theirs, and the default design none of those', () => {
    const odd: Record<string, string[]> = {
      'too-soft': ['floaty', 'bottoming'],
      'bump-steer': ['bump-steer'],
      'high-roll-centre': ['jacking'],
      'corvair-swing-axle': ['unstable'],
    };
    for (const [id, expected] of Object.entries(odd)) expect(ids(chassisPreset(id)!.design()), id).toEqual(expect.arrayContaining(expected));
    const plain = ids(DEFAULT_CHASSIS);
    for (const expected of Object.values(odd).flat()) expect(plain).not.toContain(expected);
  });

  it('jacking is a diagnosis of independent wheels: a high live axle does not jack, a swing axle does', () => {
    const leaf = chassisPreset('leaf-offroader')!.design();
    const perf = evaluateChassis(chassisToSpec(leaf));
    expect(leaf.layoutR).toBe('live-axle');
    expect(perf.axles[1].rollCentreM).toBeGreaterThan(0.25);
    expect(ids(leaf)).not.toContain('jacking');
    expect(ids(chassisPreset('corvair-swing-axle')!.design())).toContain('jacking');
  });

  it('each has a title and a text, worst first', () => {
    const rank = { fatal: 0, warning: 1, note: 2 };
    for (const p of CHASSIS_PRESETS) {
      const list = diagnosed(p.design());
      for (const x of list) expect(x.title.length * x.text.length, `${p.id}: ${x.id}`).toBeGreaterThan(0);
      expect(list.map((x) => rank[x.severity])).toEqual(list.map((x) => rank[x.severity]).sort());
    }
  });

  it('the character of the ride is three figures in 0..1 and a verdict', () => {
    for (const p of CHASSIS_PRESETS) {
      const c = chassisCharacter(evaluateChassis(chassisToSpec(p.design())));
      for (const v of [c.comfort, c.grip, c.control]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      expect(c.label.length).toBeGreaterThan(0);
    }
    expect(chassisCharacter(evaluateChassis(chassisToSpec(chassisPreset('too-soft')!.design()))).verdict).toBe('floaty');
    // A body that rolls 6°/g is not composed, whatever its damping: the leaf-sprung off-roader and the Corvair.
    for (const id of ['leaf-offroader', 'corvair-swing-axle']) {
      const perf = evaluateChassis(chassisToSpec(chassisPreset(id)!.design()));
      expect(perf.rollPerG / DEG, id).toBeGreaterThan(5);
      expect(chassisCharacter(perf).verdict, id).not.toBe('composed');
    }
    const track = chassisCharacter(evaluateChassis(chassisToSpec(chassisPreset('track')!.design())));
    const sedan = chassisCharacter(evaluateChassis(chassisToSpec(chassisPreset('comfort-sedan')!.design())));
    expect(track.control).toBeGreaterThan(sedan.control);
    expect(track.comfort).toBeLessThan(sedan.comfort);
  });
});

describe('sensitivity', () => {
  it('a full pass over every control takes under 150 ms', () => {
    const solid: Array<[string, ChassisDesign]> = [
      ['leaf-offroader', chassisPreset('leaf-offroader')!.design()],
      ['de Dion', editChassis(editChassis(DEFAULT_CHASSIS, { drive: 'rwd' }), { layoutR: 'de-dion' })],
    ];
    for (const [id, d] of [['default', DEFAULT_CHASSIS] as [string, ChassisDesign], ...CHASSIS_CATALOGUE.map((e): [string, ChassisDesign] => [e.id, e.design]), ...solid]) {
      sensitivityPass(d);
      expect(bestOf(3, (i) => sensitivityPass(nudged(d, i))), id).toBeLessThan(150);
    }
  }, 60_000);

  it('never lists a change its decimals cannot show', () => {
    for (const p of CHASSIS_PRESETS) {
      for (const c of sensitivityPass(p.design())) {
        for (const e of c.effects) {
          const both = e.text.match(/^([−\d,.+]+)→([−\d,.+]+)/);
          if (both) expect(both[1], `${p.id}: ${c.key} → ${e.id} ${e.text}`).not.toBe(both[2]);
        }
      }
    }
  }, 60_000);

  it('names what a stiffer front bar changes, and leaves the design as it was', () => {
    const d = DEFAULT_CHASSIS;
    const copy = JSON.stringify(d);
    const effects = previewChassisEffects(d, 'barMmF', 30);
    expect(effects.map((e) => e.id)).toEqual(expect.arrayContaining(['frontTransfer', 'roll']));
    const bars = CHASSIS_CONTROLS.filter((c) => c.key === 'barMmF' || c.key === 'barMmR').map((c) => chassisProbe(c, c.key));
    expect(causesOfChassis(d, 'frontTransfer', bars).map((c) => c.key).sort()).toEqual(['barMmF', 'barMmR']);
    const pass = sensitivityPass(d);
    expect(pass.length).toBe(controlsFor(d).filter((c) => controlTries(d, c).length > 0).length);
    expect(JSON.stringify(d)).toBe(copy);
  });
});

describe('no control is dead', () => {
  const base = DEFAULT_CHASSIS;
  const designs: Array<[string, ChassisDesign]> = [
    ...CHASSIS_PRESETS.map((p): [string, ChassisDesign] => [p.id, p.design()]),
    ['own dampers and tube bars', editChassis(base, { damperF: 'custom', damperR: 'custom', barWallMmF: 4, barWallMmR: 3 })],
    ['dual-axis strut', editChassis(base, { knuckleF: 'dual-axis' })],
    ['RevoKnuckle, all-wheel drive', editChassis(base, { knuckleF: 'revoknuckle', drive: 'awd' })],
    ['semi-trailing arms', editChassis(editChassis(base, { drive: 'rwd' }), { layoutR: 'semi-trailing' })],
    ['trailing arms', editChassis(base, { layoutR: 'trailing-arm' })],
    // Level lower links let the tube pitch, so inboard brakes react differently from outboard ones.
    ['de Dion, inboard brakes', editChassis(editChassis(base, { drive: 'rwd', layoutR: 'de-dion' }), { brakeInboardR: true, linkAngleDegR: 0 })],
    ['live axle on a Watt linkage', editChassis(editChassis(base, { drive: 'rwd', layoutR: 'live-axle' }), { solidLateralR: 'watt' })],
    ['triangulated live axle, all-wheel drive', editChassis(editChassis(base, { drive: 'awd', layoutR: 'live-axle' }), { solidLateralR: 'triangulated' })],
    ['multilink front, rear drive', editChassis(base, { layoutF: 'multilink', drive: 'rwd' })],
  ];
  const figures = (d: ChassisDesign): string => JSON.stringify(chassisSnapshot(d).map((m) => [m.id, Math.round(m.value * 1e4)]));

  it('every control applies to one of these designs', () => {
    const seen = new Set(designs.flatMap(([, d]) => controlsFor(d).map((c) => c.key)));
    expect(CHASSIS_CONTROLS.map((c) => c.key).filter((k) => !seen.has(k))).toEqual([]);
  });

  for (const [label, d] of designs) {
    it(`${label}: every control changes a figure`, () => {
      const before = figures(d);
      const dead: string[] = [];
      for (const control of controlsFor(d)) {
        if (control.only === 'looks') continue;
        const tries = controlTries(d, control);
        if (!tries.length) continue; // A single available option leaves nothing to move.
        if (!tries.some((t) => figures(editChassis(d, { [control.key]: t.value } as Partial<ChassisDesign>)) !== before)) dead.push(control.key);
      }
      expect(dead).toEqual([]);
    }, 60_000);
  }
});
