import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAR_LIST, carById, CARS } from '../src/data/cars.ts';
import { engineById } from '../src/data/engines.ts';
import { SUMP_CARS } from '../src/data/sump-cars.ts';
import { SECTOR_NAMES, TYRE_NAMES } from '../src/data/vehicle-names.ts';
import { testTrack } from '../src/lubrication/scenario.ts';
import {
  bodyOf,
  carFrameToCg,
  cgPoint,
  cgToCarFrame,
  drivenShare,
  drivingMassKg,
  DRIVER_KG,
  vehicleSpec,
  type CarRecord,
  type Vec3,
} from '../src/vehicle/car.ts';
import { carLinks, carsWithEngine, pageIndex } from '../src/vehicle/links.ts';
import { aeroDragN, roadLoadCoeffs, roadLoadN } from '../src/vehicle/road-load.ts';
import { buildTrack, TEST_CIRCUIT, TEST_SECTORS } from '../src/vehicle/track.ts';
import { outerDiameterM, parseTyreSize, rollingRadiusM } from '../src/vehicle/tyre-size.ts';
import { dragForce, G, TYRES, type VehicleSpec } from '../src/vehicle/vehicle.ts';

/** Reads a dotted path like 'body.trackFrontM'; undefined when the record has no such field. */
const at = (car: CarRecord, path: string): unknown =>
  path.split('.').reduce<unknown>((value, key) => (value !== null && typeof value === 'object' && key in value ? (value as Record<string, unknown>)[key] : undefined), car);

describe('car records', () => {
  it('keep one file per car, named by its id, and unique ids', () => {
    const files = readdirSync('src/data/cars').filter((f) => f.endsWith('.ts')).map((f) => f.replace(/\.ts$/, '')).sort();
    expect(CAR_LIST.map((c) => c.id).sort()).toEqual(files);
    expect(Object.keys(CARS)).toHaveLength(CAR_LIST.length);
    for (const car of CAR_LIST) expect(car.id).not.toBe('designer');
  });

  it('find no car for an address naming a property of Object.prototype', () => {
    for (const id of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(carById(id), id).toBeUndefined();
      expect(CARS[id], id).toBeUndefined();
    }
    for (const car of CAR_LIST) expect(carById(car.id)).toBe(car);
  });

  it('has no Russian cars', () => {
    for (const car of CAR_LIST) expect(car.name + car.id, car.id).not.toMatch(/vaz|lada|ваз|лада|gaz|uaz|moskvich|niva/i);
  });

  describe.each(CAR_LIST.map((c) => [c.id, c] as const))('%s', (_id, car) => {
    it('drives a catalogue engine', () => {
      expect(engineById(car.engine), car.engine).toBeDefined();
    });

    it('links to a gearbox and suspensions by name only once those sections have them', () => {
      if (car.gearbox !== null) expect(car.gearbox).toMatch(/^[a-z0-9-]+(\/[a-z0-9-]+)?$/);
      if (car.suspension !== null) for (const type of [car.suspension.front, car.suspension.rear]) expect(type).toMatch(/^[a-z0-9-]+$/);
    });

    it('has tyres whose sizes parse to plausible radii', () => {
      for (const size of [car.tyre.size, car.tyre.sizeRear].filter((s): s is string => !!s)) {
        const r = rollingRadiusM(parseTyreSize(size));
        expect(r, size).toBeGreaterThan(0.27);
        expect(r, size).toBeLessThan(0.4);
      }
      expect(TYRES[car.tyre.id]).toBeDefined();
    });

    it('has plausible numbers', () => {
      expect(car.massKg).toBeGreaterThan(600);
      expect(car.massKg).toBeLessThan(3000);
      expect(car.body.frontShare).toBeGreaterThan(0.3);
      expect(car.body.frontShare).toBeLessThan(0.7);
      expect(car.body.wheelbaseM).toBeGreaterThan(2);
      expect(car.body.wheelbaseM).toBeLessThan(3.2);
      for (const track of [car.body.trackFrontM, car.body.trackRearM]) {
        expect(track).toBeGreaterThan(1.2);
        expect(track).toBeLessThan(1.8);
      }
      expect(car.published.vmaxKmh).toBeGreaterThan(100);
      expect(car.published.vmaxKmh).toBeLessThan(400);
      if (car.published.zeroTo100S !== null) expect(car.published.zeroTo100S).toBeGreaterThan(2);
      expect(car.years).toMatch(/^\d{4}-(\d{4})?$/);
    });

    it('mounts the engine the way its axis allows', () => {
      const along = car.mount.front === 'forward' || car.mount.front === 'rearward';
      expect(along, car.id).toBe(car.mount.axis === 'longitudinal');
    });

    it('names a source and lists only real fields as unverified', () => {
      expect(car.sources.length).toBeGreaterThan(0);
      for (const url of car.sources) expect(url).toMatch(/^https:\/\//);
      expect(new Set(car.unverified).size).toBe(car.unverified.length);
      for (const path of car.unverified) expect(at(car, path), path).not.toBeUndefined();
      // A missing CG height means the estimate, and an estimate is unverified.
      if (car.body.cgHeightM === null) expect(car.unverified).toContain('body.cgHeightM');
      if (car.roadLoad) expect(car.roadLoad.source).not.toBe('');
    });
  });
});

describe('derived models', () => {
  /** The oil page's cars as its lap saw them before the records existed: stage A1a must not change them. */
  const BEFORE: Record<string, Pick<VehicleSpec, 'name' | 'massKg' | 'drive' | 'drivenShare' | 'mount'>> = {
    'v8-cross/camaro-ss-lt1': { name: 'Chevrolet Camaro SS', massKg: 1670, drive: 'rwd', drivenShare: 0.48, mount: { axis: 'longitudinal', front: 'forward', position: 'front' } },
    b4: { name: 'Subaru WRX STI', massKg: 1540, drive: 'awd', drivenShare: 1, mount: { axis: 'longitudinal', front: 'forward', position: 'front' } },
    'i4/civic-type-r-k20c1': { name: 'Honda Civic Type R (FK8)', massKg: 1415, drive: 'fwd', drivenShare: 0.62, mount: { axis: 'transverse', front: 'right', position: 'front' } },
    'b6/porsche-cayman-981-3-4': { name: 'Porsche Cayman S (981)', massKg: 1320, drive: 'rwd', drivenShare: 0.55, mount: { axis: 'longitudinal', front: 'forward', position: 'mid' } },
    b6: { name: 'Porsche 911 GT3 (991.2)', massKg: 1413, drive: 'rwd', drivenShare: 0.61, mount: { axis: 'longitudinal', front: 'rearward', position: 'rear' } },
    'v8-flat/corvette-z06-c8-lt6': { name: 'Chevrolet Corvette Z06 (C8)', massKg: 1560, drive: 'rwd', drivenShare: 0.6, mount: { axis: 'longitudinal', front: 'forward', position: 'mid' } },
  };

  it('give the oil page exactly the cars it had', () => {
    expect(SUMP_CARS.map((c) => c.engineId)).toEqual(Object.keys(BEFORE));
    for (const sump of SUMP_CARS) {
      const car = CARS[sump.car!]!;
      expect(sump.engineId).toBe(car.engine);
      expect(sump.vehicle).toEqual(vehicleSpec(car));
      expect(sump.vehicle).toEqual({ ...BEFORE[sump.engineId], cdA: 0.7, clA: 0, crr: 0.015, tyreRadiusM: 0.33 });
    }
  });

  it.each(CAR_LIST.map((c) => [c.id, c] as const))('%s: vehicleSpec and bodyOf are deterministic and agree', (_id, car) => {
    expect(vehicleSpec(car)).toEqual(vehicleSpec(car));
    expect(bodyOf(car)).toEqual(bodyOf(car));
    expect(bodyOf(car).massKg).toBe(vehicleSpec(car).massKg);
    const share = car.drive === 'fwd' ? bodyOf(car).frontShare : car.drive === 'rwd' ? 1 - bodyOf(car).frontShare : 1;
    expect(vehicleSpec(car).drivenShare).toBe(share);
    expect(drivenShare(car)).toBe(share);
  });

  it('adds the driver exactly once', () => {
    const car = CAR_LIST[0]!;
    expect(drivingMassKg({ ...car, massBasis: 'kerb' })).toBe(car.massKg + DRIVER_KG);
    expect(drivingMassKg({ ...car, massBasis: 'measured' })).toBe(car.massKg + DRIVER_KG);
    expect(drivingMassKg({ ...car, massBasis: 'eu' })).toBe(car.massKg);
  });

  it.each(CAR_LIST.map((c) => [c.id, c] as const))('%s: road load reproduces the lap drag and splits into body and wheels', (_id, car) => {
    const rl = roadLoadCoeffs(car);
    const spec = vehicleSpec(car);
    expect(rl.massKg).toBe(spec.massKg);
    for (const kmh of [50, 100, 200]) {
      const v = kmh / 3.6;
      expect(roadLoadN(rl, v, 0)).toBeCloseTo(dragForce(spec, v), 9);
      expect(roadLoadN(rl, -v, 0)).toBeCloseTo(roadLoadN(rl, v, 0), 9);
      const wheels = rl.a + rl.b * v + (rl.c - rl.aeroC) * v * v;
      expect(aeroDragN(rl, v) + wheels).toBeCloseTo(roadLoadN(rl, v, 0), 9);
      expect(roadLoadN(rl, v, 0.05) - roadLoadN(rl, v, 0)).toBeCloseTo(rl.massKg * G * Math.sin(0.05), 9);
    }
  });
});

describe('car frame', () => {
  it.each(CAR_LIST.map((c) => [c.id, c] as const))('%s: the CG sits at the CG frame origin and points go there and back', (_id, car) => {
    const toCg = carFrameToCg(car);
    const back = cgToCarFrame(car);
    const cg = toCg(cgPoint(car));
    expect(cg[0]).toBeCloseTo(0, 12);
    expect(cg[1]).toBe(0);
    expect(cg[2]).toBe(cgPoint(car)[2]);
    // The CG lies between the axles, which in the front-axle frame are at x = 0 and x = −L.
    expect(cgPoint(car)[0]).toBeLessThan(0);
    expect(cgPoint(car)[0]).toBeGreaterThan(-car.body.wheelbaseM);
    const points: Vec3[] = [[0, 0, 0], [-car.body.wheelbaseM, 0.7, 0.3], [0.9, -0.4, 0.6]];
    for (const p of points) {
      const q = back(toCg(p));
      for (let k = 0; k < 3; k++) expect(q[k]).toBeCloseTo(p[k]!, 12);
    }
  });
});

describe('tyre sizes', () => {
  it('reads the ways makers print them', () => {
    expect(parseTyreSize('245/30 R20')).toEqual({ widthMm: 245, aspect: 30, rimIn: 20, speed: '' });
    expect(parseTyreSize('235/40 ZR 19')).toEqual({ widthMm: 235, aspect: 40, rimIn: 19, speed: 'Z' });
    expect(parseTyreSize('205/55 VR15')).toEqual({ widthMm: 205, aspect: 55, rimIn: 15, speed: 'V' });
    expect(parseTyreSize('245/40 R18 97W')).toEqual({ widthMm: 245, aspect: 40, rimIn: 18, speed: '' });
    expect(() => parseTyreSize('R16')).toThrow();
    expect(() => parseTyreSize('155SR13')).toThrow();
  });

  it('gives a 205/55 R16 its published circumference', () => {
    const size = parseTyreSize('205/55 R16');
    // Static 1.98 m, rolling about 1.94 m (docs/research/gearboxes.md, §16).
    expect(Math.PI * outerDiameterM(size)).toBeCloseTo(1.985, 2);
    expect(Math.abs(2 * Math.PI * rollingRadiusM(size) - 1.94)).toBeLessThan(0.02);
  });
});

describe('links between sections', () => {
  const e30 = CARS['bmw-m3-e30']!;

  it('finds the cars of an engine', () => {
    expect(carsWithEngine('i4/bmw-m3-e30-s14', CAR_LIST)).toEqual([e30]);
    expect(carsWithEngine('i4', CAR_LIST)).toEqual([]);
  });

  it('links only to pages that exist', () => {
    const engines = pageIndex({ engines: (id) => !!engineById(id) });
    expect(carLinks(e30, engines)).toEqual([{ section: 'engines', target: 'i4/bmw-m3-e30-s14', href: '#/engines/i4/bmw-m3-e30-s14' }]);
    // No gearbox link while the record has none, even if the page exists.
    expect(carLinks(e30, pageIndex({ gearboxes: () => true }))).toEqual([]);
    const linked: CarRecord = { ...e30, gearbox: 'manual-rwd', suspension: { front: 'macpherson', rear: 'semi-trailing' } };
    expect(carLinks(linked, pageIndex({ gearboxes: () => true, suspensions: (type) => type === 'semi-trailing' })).map((l) => l.href)).toEqual([
      '#/gearboxes/manual-rwd',
      '#/suspensions/semi-trailing/bmw-m3-e30',
    ]);
  });

  it('links every car of the oil page to its engine and its oil', () => {
    const pages = pageIndex({ engines: (id) => !!engineById(id), sump: (id) => SUMP_CARS.some((c) => c.engineId === id) });
    for (const sump of SUMP_CARS) expect(carLinks(CARS[sump.car!]!, pages).map((l) => l.section)).toEqual(['engines', 'sump']);
  });
});

describe('names of the vehicle core', () => {
  it('name every tyre and every sector of the test circuit', () => {
    expect(Object.keys(TYRE_NAMES).sort()).toEqual(Object.keys(TYRES).sort());
    const used = [...new Set(TEST_CIRCUIT.pieces.map((p) => p.name).filter((n): n is string => !!n))];
    expect(used).toEqual([...TEST_SECTORS]);
    expect(Object.keys(SECTOR_NAMES).sort()).toEqual([...TEST_SECTORS].sort());
  });

  it('reach the oil page as before: sectors by name on its track, ids on a bare one', () => {
    expect(testTrack().sectors.map((s) => s.name)).toEqual(TEST_SECTORS.map((id) => SECTOR_NAMES[id]));
    expect(buildTrack(TEST_CIRCUIT).sectors.map((s) => s.name)).toEqual([...TEST_SECTORS]);
    expect(TYRES.street.name).toBe(TYRE_NAMES.street);
  });

  it('keep text out of src/vehicle: only the compatibility import in vehicle.ts reaches src/data, nothing reaches src/i18n', () => {
    const dir = 'src/vehicle';
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      const imports = [...readFileSync(join(dir, file), 'utf8').matchAll(/from '([^']+)'/g)].map((m) => m[1]!);
      expect(imports.filter((i) => i.includes('/i18n/')), file).toEqual([]);
      expect(imports.filter((i) => i.includes('/data/')), file).toEqual(file === 'vehicle.ts' ? ['../data/vehicle-names.ts'] : []);
    }
  });
});
