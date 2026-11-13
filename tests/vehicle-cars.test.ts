import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calibrateRoadLoad, drives, epaForceN, K_EPA_LIST, type EpaRow } from '../scripts/calibrate-road-load.ts';
import { CAR_LIST, carById, CARS } from '../src/data/cars.ts';
import { driveCarById } from '../src/data/drive-cars.ts';
import { gearboxById } from '../src/data/gearboxes.ts';
import { buildCarDrive } from '../src/drivetrain/car-model.ts';
import { steadyTopSpeed } from '../src/drivetrain/runs.ts';
import { engineById, engineFacts } from '../src/data/engines.ts';
import { genericCar, SUMP_CARS } from '../src/data/sump-cars.ts';
import { SECTOR_NAMES, TYRE_NAMES } from '../src/data/vehicle-names.ts';
import { evaluate } from '../src/designer/physics.ts';
import { designFromSpec } from '../src/designer/presets.ts';
import { DRIVELINE, testTrack } from '../src/lubrication/scenario.ts';
import { lapTorqueCurve } from '../src/lubrication/torque.ts';
import {
  bodyOf,
  carFrameToCg,
  cgPoint,
  cgToCarFrame,
  drivenShare,
  drivenTyreRadiusM,
  drivingMassKg,
  DRIVER_KG,
  tyreRadiiM,
  vehicleSpec,
  type CarRecord,
  type Vec3,
} from '../src/vehicle/car.ts';
import { carLinks, carsWithEngine, pageIndex } from '../src/vehicle/links.ts';
import { AIR_DENSITY } from '../src/vehicle/constants.ts';
import { topSpeed } from '../src/vehicle/powertrain.ts';
import { aeroDragN, nonEpaRule, roadLoadCoeffs, roadLoadN, roadLoadRule } from '../src/vehicle/road-load.ts';
import { ROAD_LOAD_TRIM } from '../src/vehicle/road-load-trim.ts';
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
    // Whole words only: the Ukrainian ЛуАЗ ('luaz-969m') contains 'uaz' and Toyota's 'Gazoo Racing' contains 'gaz'.
    const russian = /(?<!\p{L})(vaz|lada|zhiguli|niva|gaz|volga|uaz|moskvich|azlk|izh|zil|kamaz|aurus|ваз|лада|жигулі?|нива|газ|волга|уаз|москвич|азлк|зіл|зил|камаз|аурус)(?!\p{L})/iu;
    for (const car of CAR_LIST) for (const text of [car.id, car.name]) expect(text, car.id).not.toMatch(russian);
  });

  describe.each(CAR_LIST.map((c) => [c.id, c] as const))('%s', (_id, car) => {
    it('drives a catalogue engine', () => {
      expect(engineById(car.engine), car.engine).toBeDefined();
    });

    it('links to a gearbox and suspensions by name only once those sections have them', () => {
      if (car.gearbox !== null) expect(car.gearbox).toMatch(/^[a-z0-9-]+(\/[a-z0-9-]+)?$/);
      // A gearbox link names a record of the catalogue, the same one the car's drivetrain uses.
      if (car.gearbox !== null) expect(gearboxById(car.gearbox), car.gearbox).toBeDefined();
      const drive = driveCarById(car.id);
      if (drive) expect(car.gearbox).toBe(drive.gearbox);
      if (car.suspension !== null) for (const type of [car.suspension.front, car.suspension.rear]) expect(type).toMatch(/^[a-z0-9-]+$/);
    });

    it('has tyres whose sizes parse to plausible radii', () => {
      for (const size of [car.tyre.size, car.tyre.sizeRear].filter((s): s is string => !!s)) {
        const r = rollingRadiusM(parseTyreSize(size));
        // From the ZAZ-1102 Tavria's 155/70 R13 (0.265 m) to an off-road 285/75 R16 (0.405 m).
        expect(r, size).toBeGreaterThan(0.25);
        expect(r, size).toBeLessThan(0.42);
      }
      expect(TYRES[car.tyre.id]).toBeDefined();
    });

    it('has plausible numbers', () => {
      expect(car.massKg).toBeGreaterThan(600);
      expect(car.massKg).toBeLessThan(3000);
      expect(car.body.frontShare).toBeGreaterThan(0.3);
      expect(car.body.frontShare).toBeLessThan(0.7);
      // A Smart ForTwo, on the plan's live-axle page, has about 1.8 m.
      expect(car.body.wheelbaseM).toBeGreaterThan(1.7);
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
  /** The oil page's cars as its lap saw them before the records existed; stage A1b changed only mass, drag and tyres. */
  const BEFORE: Record<string, Pick<VehicleSpec, 'name' | 'drive' | 'drivenShare' | 'mount'>> = {
    'v8-cross/camaro-ss-lt1': { name: 'Chevrolet Camaro SS', drive: 'rwd', drivenShare: 0.48, mount: { axis: 'longitudinal', front: 'forward', position: 'front' } },
    b4: { name: 'Subaru WRX STI', drive: 'awd', drivenShare: 1, mount: { axis: 'longitudinal', front: 'forward', position: 'front' } },
    'i4/civic-type-r-k20c1': { name: 'Honda Civic Type R (FK8)', drive: 'fwd', drivenShare: 0.62, mount: { axis: 'transverse', front: 'right', position: 'front' } },
    'b6/porsche-cayman-981-3-4': { name: 'Porsche Cayman S (981)', drive: 'rwd', drivenShare: 0.55, mount: { axis: 'longitudinal', front: 'forward', position: 'mid' } },
    b6: { name: 'Porsche 911 GT3 (991.2)', drive: 'rwd', drivenShare: 0.61, mount: { axis: 'longitudinal', front: 'rearward', position: 'rear' } },
    'v8-flat/corvette-z06-c8-lt6': { name: 'Chevrolet Corvette Z06 (C8)', drive: 'rwd', drivenShare: 0.6, mount: { axis: 'longitudinal', front: 'forward', position: 'mid' } },
  };

  it('give the oil page its cars from their records: the same six, now with driver, road load and tyre radius', () => {
    expect(SUMP_CARS.map((c) => c.engineId)).toEqual(Object.keys(BEFORE));
    for (const sump of SUMP_CARS) {
      const car = CARS[sump.car!]!;
      expect(sump.engineId).toBe(car.engine);
      expect(sump.vehicle).toEqual(vehicleSpec(car));
      expect(sump.vehicle).toEqual({
        ...BEFORE[sump.engineId],
        massKg: drivingMassKg(car),
        roadLoad: roadLoadCoeffs(car),
        clA: 0,
        tyreRadiusM: drivenTyreRadiusM(car),
      });
    }
  });

  it('gives a visitor\'s engine the generic car it had', () => {
    const car = genericCar('x', 400);
    expect(car.massKg).toBe(1450);
    expect(car.tyreRadiusM).toBe(0.33);
    for (const kmh of [50, 100, 200]) {
      const v = kmh / 3.6;
      expect(roadLoadN(car.roadLoad, v, 0)).toBeCloseTo(0.5 * AIR_DENSITY * 0.7 * v * v + 0.015 * 1450 * G, 9);
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

  it.each(CAR_LIST.map((c) => [c.id, c] as const))('%s: vehicleSpec and roadLoadCoeffs give the same forces, split into body and wheels', (_id, car) => {
    const rl = roadLoadCoeffs(car);
    const spec = vehicleSpec(car);
    expect(rl.massKg).toBe(spec.massKg);
    expect(spec.massKg).toBe(drivingMassKg(car));
    expect(rl.aeroC).toBeGreaterThan(0);
    expect(rl.aeroC).toBeLessThanOrEqual(rl.c);
    for (const kmh of [50, 100, 200]) {
      const v = kmh / 3.6;
      expect(roadLoadN(rl, v, 0)).toBeCloseTo(dragForce(spec, v), 9);
      expect(roadLoadN(spec.roadLoad, v, 0)).toBe(roadLoadN(rl, v, 0));
      expect(roadLoadN(rl, -v, 0)).toBeCloseTo(roadLoadN(rl, v, 0), 9);
      const wheels = rl.a + rl.b * v + (rl.c - rl.aeroC) * v * v;
      expect(aeroDragN(rl, v) + wheels).toBeCloseTo(roadLoadN(rl, v, 0), 9);
      expect(roadLoadN(rl, v, 0.05) - roadLoadN(rl, v, 0)).toBeCloseTo(rl.massKg * G * Math.sin(0.05), 9);
    }
  });
});

describe('road load', () => {
  /** The EPA rows as the test car lists print them, copied a second time so a slip in a record's SI shows. */
  const EPA: Record<string, EpaRow> = {
    'chevrolet-camaro-ss-gen6': { list: '16tstcar.csv', vehicle: '621GFE2116', etwLb: 4000, A: 36.88, B: 0.5551, C: 0.01826 },
    'chevrolet-corvette-z06-c8': { list: '23-testcar-2024-05-17_0.xlsx', vehicle: '551PYE2173', etwLb: 4000, A: 36.81, B: 0.728, C: 0.01761 },
    'civic-type-r-fk8': { list: '17tstcar-2018-05-30.xlsx', vehicle: 'EHBF1M', etwLb: 3375, A: 34.74, B: 0.2581, C: 0.02216 },
    'porsche-911-gt3-991-2': { list: '18tstcar-2018-10-24.xlsx', vehicle: 'FE-991IIGT3-MT-18', etwLb: 3625, A: 34.396, B: 0.43415, C: 0.016303 },
    'subaru-wrx-sti-va': { list: '15tstcar.csv', vehicle: 'FBE-UG74', etwLb: 3750, A: 41, B: 0.5674, C: 0.01874 },
  };

  it('has an EPA row for exactly the cars listed here, and names it', () => {
    expect(CAR_LIST.filter((c) => c.roadLoad).map((c) => c.id).sort()).toEqual(Object.keys(EPA).sort());
    for (const [id, row] of Object.entries(EPA)) {
      expect(CARS[id]!.roadLoad!.source).toContain(row.vehicle);
      expect(CARS[id]!.roadLoad!.source).toContain(row.list);
    }
  });

  it.each(Object.entries(EPA))('%s: reproduces its EPA row within 1 N', (id, row) => {
    const rl = roadLoadCoeffs(CARS[id]!);
    expect(roadLoadRule(CARS[id]!)).toBe('epa');
    for (const kmh of [30, 100, 150]) expect(Math.abs(roadLoadN(rl, kmh / 3.6, 0) - epaForceN(row, kmh / 3.6)), `${kmh} km/h`).toBeLessThan(1);
  });

  it('keeps road-load-trim.ts what scripts/calibrate-road-load.ts writes', () => {
    expect(readFileSync('src/vehicle/road-load-trim.ts', 'utf8')).toBe(calibrateRoadLoad().source);
  });

  it('fits k_EPA on at least four cars, the 911 among them, and lands within 1.0-1.4', () => {
    const { list, trim } = calibrateRoadLoad();
    const used = list.filter((r) => r.k !== null);
    expect(used.length).toBeGreaterThanOrEqual(4);
    expect(used.some((r) => r.name.includes('911'))).toBe(true);
    expect(K_EPA_LIST.some((c) => c.name.includes('MX-5'))).toBe(true);
    expect(trim.kEpa).toBeGreaterThanOrEqual(1);
    expect(trim.kEpa).toBeLessThanOrEqual(1.4);
    expect(trim.kEpa).toBeCloseTo(used.reduce((s, r) => s + r.k!, 0) / used.length, 3);
  });

  it.each(CAR_LIST.filter((c) => !c.roadLoad).map((c) => [c.id, c] as const))('%s: has no EPA row and follows the rule its record allows', (_id, car) => {
    const rule = nonEpaRule(car);
    expect(rule).not.toBeNull();
    expect(ROAD_LOAD_TRIM.cars[car.id]?.rule).toBe(rule);
    const rl = roadLoadCoeffs(car);
    const m = drivingMassKg(car);
    expect(rl.a).toBeCloseTo(ROAD_LOAD_TRIM.rolling.aPerKg * m, 9);
    expect(rl.b).toBeCloseTo(ROAD_LOAD_TRIM.rolling.bPerKg * m, 9);
    if (rule === 'brochure') {
      // An unchecked or limited top speed says nothing about drag: the maker's Cd·A times k_EPA, marked unverified.
      expect(rl.c).toBeCloseTo(0.5 * AIR_DENSITY * car.aero!.cd * car.aero!.areaM2 * ROAD_LOAD_TRIM.kEpa, 3);
      expect(car.unverified.some((p) => p.startsWith('published.vmax')) || car.published.vmaxLimited).toBe(true);
    } else if (drives(car)) {
      // A car the gearbox model drives is calibrated on its force at the wheels: the model's steady top speed is the
      // published one (the lap's ideal gearbox takes its real one at stage K7).
      expect(steadyTopSpeed(buildCarDrive(car.id), rl).v * 3.6).toBeCloseTo(car.published.vmaxKmh, 0);
    } else {
      // The lap's own top speed with this road load is the published one.
      const design = designFromSpec(engineById(car.engine)!);
      const peak = lapTorqueCurve(evaluate({ ...design, factory: null }).points, engineFacts(car.engine)?.powerHp ?? null).peakPowerW;
      expect(topSpeed(vehicleSpec(car), peak, DRIVELINE.efficiency) * 3.6).toBeCloseTo(car.published.vmaxKmh, 0);
    }
  });

  it('refuses a car nobody calibrated instead of guessing its drag', () => {
    const e30 = CARS['bmw-m3-e30']!;
    expect(() => roadLoadCoeffs({ ...e30, id: 'uncalibrated' })).toThrow(/calibrate-road-load/);
    // The record's rule changed (its top speed no longer checked) but the trim was not rerun.
    expect(() => roadLoadCoeffs({ ...e30, unverified: [...e30.unverified, 'published.vmaxKmh'] })).toThrow(/calibrate-road-load/);
  });

  it.each(CAR_LIST.map((c) => [c.id, c] as const))('%s: rolls the lap on the driven tyres\' radius, from their size', (_id, car) => {
    const radii = tyreRadiiM(car);
    expect(radii.front).toBe(rollingRadiusM(parseTyreSize(car.tyre.size)));
    expect(radii.rear).toBe(rollingRadiusM(parseTyreSize(car.tyre.sizeRear ?? car.tyre.size)));
    expect(vehicleSpec(car).tyreRadiusM).toBe(car.drive === 'fwd' ? radii.front : radii.rear);
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
    // US passenger and light-truck sizes as Ford, Jeep and GM print them, and a van tyre's C.
    expect(parseTyreSize('P225/75R15')).toEqual({ widthMm: 225, aspect: 75, rimIn: 15, speed: '' });
    expect(parseTyreSize('P235/50ZR18')).toEqual({ widthMm: 235, aspect: 50, rimIn: 18, speed: 'Z' });
    expect(parseTyreSize('LT265/75R16')).toEqual({ widthMm: 265, aspect: 75, rimIn: 16, speed: '' });
    expect(parseTyreSize('205/65 R16C')).toEqual({ widthMm: 205, aspect: 65, rimIn: 16, speed: '' });
    expect(() => parseTyreSize('R16')).toThrow();
    expect(() => parseTyreSize('155SR13')).toThrow();
    expect(() => parseTyreSize('245/40 R185')).toThrow();
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
    // No gearbox link while the record has none, even if the page exists; the E30 has one since stage K2b.
    expect(carLinks({ ...e30, gearbox: null }, pageIndex({ gearboxes: () => true }))).toEqual([]);
    expect(carLinks(e30, pageIndex({ gearboxes: () => true })).map((l) => l.href)).toEqual(['#/gearboxes/manual-rwd']);
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
