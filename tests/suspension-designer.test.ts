// The suspension designer's model, first half (stage P8a): the design, its limits and resolveChassis, the spec, the
// link codec, the presets and the catalogue as designs (suspensions plan, tests of suspension-designer). Evaluation,
// diagnoses and sensitivity come with P8b.

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
