// The layers' geometry, checked without WebGL for every engine of the catalogue: pipes stay inside the castings and
// clear of the moving parts, and the oil goes where oil can go.

import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ENGINES, engineById, pageChoices } from '../src/data/engines.ts';
import { buildEngine, type Engine } from '../src/engine/kinematics.ts';
import { systemsOf } from '../src/engine/systems-spec.ts';
import { PistonEngineModel } from '../src/scene/piston-engine.ts';
import { RotaryEngineModel } from '../src/scene/rotary-engine.ts';
import type { PistonAnchors, RotaryAnchors } from '../src/scene/systems/anchors.ts';
import { MAX_CHANNELS } from '../src/scene/systems/flow-material.ts';
import { layerPlan, LAYER_IDS } from '../src/scene/systems/index.ts';
import { addScavenge, mainBearingZ, OIL_SIZES, oilPlan } from '../src/scene/systems/routes-oil.ts';
import { distanceToOutline, insidePolygon, segmentDistance, toBank, type LayerPlan } from '../src/scene/systems/route.ts';
import { sumpLayout } from '../src/systems/sump.ts';
import { JACKET, jacketY } from '../src/scene/systems/routes-coolant.ts';

// The models draw a few canvas textures, which nothing here looks at.
const context = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }), set: () => true });
vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });

const ids = ENGINES.flatMap((page) => pageChoices(page.id).map((c) => c.id));
const built = new Map<string, { engine: Engine; anchors: PistonAnchors | RotaryAnchors }>();
const get = (id: string): { engine: Engine; anchors: PistonAnchors | RotaryAnchors } => {
  let hit = built.get(id);
  if (!hit) {
    const engine = buildEngine(engineById(id)!);
    const model = engine.isRotary ? new RotaryEngineModel(engine) : new PistonEngineModel(engine);
    hit = { engine, anchors: model.systemsAnchors() };
    built.set(id, hit);
  }
  return hit;
};
const pistonIds = ids.filter((id) => !engineById(id)!.layout.kind.startsWith('wankel'));
const rotaryIds = ids.filter((id) => engineById(id)!.layout.kind === 'wankel');

const oilOf = (id: string): LayerPlan => {
  const { engine, anchors } = get(id);
  return layerPlan('oil', engine, anchors)!;
};

describe.each(pistonIds)('oil in %s', (id) => {
  it('runs the main gallery and its drillings inside the block and clear of the crank', () => {
    const { engine, anchors } = get(id);
    const a = anchors as PistonAnchors;
    const plan = oilOf(id);
    const gallery = plan.routes.filter((r) => r.channel === 'gallery');
    expect(gallery.length).toBe(2);
    for (const route of gallery) {
      for (const p of route.points) {
        expect(insidePolygon(p.x, p.y, a.section), `${id} gallery inside`).toBe(true);
        expect(distanceToOutline(p.x, p.y, a.section), `${id} gallery wall`).toBeGreaterThanOrEqual(route.radius);
        expect(Math.hypot(p.x, p.y), `${id} gallery vs counterweights`).toBeGreaterThanOrEqual(a.crankSweep + route.radius);
      }
    }
    const feeds = plan.routes.filter((r) => r.channel === 'mains');
    expect(feeds.length).toBe(engine.throws.length + 1);
    expect(mainBearingZ(engine, a).length).toBe(engine.throws.length + 1);
    for (const f of feeds) {
      const end = f.points[f.points.length - 1]!;
      expect(Math.hypot(end.x, end.y)).toBeCloseTo(a.mainR, 1);
      expect(Math.abs(Math.hypot(end.x, end.y) - a.mainR) / a.mainR).toBeLessThan(0.1);
    }
    const drillings = plan.routes.filter((r) => r.channel === 'crank');
    expect(drillings.length).toBe(engine.throws.length);
    for (const d of drillings) {
      expect(d.space).toBe('crank');
      expect(d.overlay).toBe(true);
      const pin = d.points[1]!;
      expect(Math.hypot(pin.x, pin.y)).toBeCloseTo(a.crankR, 5);
    }
  });

  it('feeds the head clear of the valves, springs and cams', () => {
    const { engine, anchors } = get(id);
    const a = anchors as PistonAnchors;
    if (engine.spec.valvetrain === 'ohv') return;
    const plan = oilOf(id);
    const head = plan.routes.filter((r) => r.channel === 'head');
    expect(head.length).toBeGreaterThan(a.banks.length);
    const stems = a.valves.map((v) => {
      const base = new THREE.Vector3().setFromMatrixPosition(v.base);
      const up = new THREE.Vector3(0, 1, 0).transformDirection(v.base);
      return [base, base.clone().addScaledVector(up, a.stemLength)] as const;
    });
    for (const route of head) {
      for (let i = 1; i < route.points.length; i++) {
        const p = route.points[i - 1]!;
        const q = route.points[i]!;
        for (const [s0, s1] of stems) {
          expect(segmentDistance(p, q, s0, s1), `${id} head oil vs valve`).toBeGreaterThanOrEqual(a.springR + route.radius - 1e-6);
        }
      }
      // The gallery along the head stays outside the cams' sweep; the journal drillings end at the journal.
      if (Math.abs(route.points[0]!.z - route.points[1]!.z) > 0.2) {
        for (const cam of a.cams) {
          const bank = a.banks[cam.bank]!;
          const g = toBank(bank.alpha, route.points[0]!);
          if (cam.bank !== a.banks.findIndex((b) => Math.abs(toBank(b.alpha, route.points[0]!).x) <= b.halfWidth + 1e-6 && toBank(b.alpha, route.points[0]!).y > a.deck)) continue;
          expect(Math.hypot(g.x - cam.x, g.y - cam.y), `${id} head gallery vs cam`).toBeGreaterThanOrEqual(a.camBase + a.valveLift + route.radius);
        }
      }
    }
  });

  it('draws from under the oil and returns above it', () => {
    const { engine, anchors } = get(id);
    const sump = sumpLayout(engine, systemsOf(engine.spec));
    const plan = oilOf(id);
    const pan = sump.pan;
    expect(sump.levelY).toBeGreaterThan(pan.bottom);
    expect(sump.levelY).toBeLessThan(pan.top);
    const suction = plan.routes.find((r) => r.channel === 'suction')!;
    const pick = suction.points[0]!;
    expect(pick.y).toBeLessThan(sump.levelY);
    expect(pick.y).toBeGreaterThan(pan.bottom);
    for (const drain of plan.routes.filter((r) => r.channel === 'drain' || (r.channel === 'turbo-drain' && r.part === 'turbo-oil' && r.points.length > 2))) {
      const end = drain.points[drain.points.length - 1]!;
      expect(end.y, `${id} drain above the oil`).toBeGreaterThan(sump.levelY);
      expect(Math.abs(end.x)).toBeLessThanOrEqual(pan.halfW + 1e-6);
      for (let i = 1; i < drain.points.length; i++) expect(drain.points[i]!.y, `${id} drains fall`).toBeLessThanOrEqual(drain.points[i - 1]!.y + 1e-6);
    }
    // Garrett: the drain leaves the turbo within 15 degrees of vertical; one hung below the oil has a scavenge pump.
    for (const turbo of plan.routes.filter((r) => r.channel === 'turbo-drain' && r.points.length === 2)) {
      expect(plan.parts.some((p) => p.part === 'turbo-scavenge' && p.position.distanceTo(turbo.points[1]!) < 0.2), id).toBe(true);
    }
    for (const drain of plan.routes.filter((r) => r.channel === 'turbo-drain')) {
      const [p, q] = drain.points;
      if (p!.y - q!.y < 1e-6) continue;
      expect(Math.atan2(Math.hypot(q!.x - p!.x, q!.z - p!.z), p!.y - q!.y) / (Math.PI / 180)).toBeLessThanOrEqual(15);
    }
    void anchors;
  });

  it('keeps within the channel budget of the flow material', () => {
    const { engine, anchors } = get(id);
    for (const layer of LAYER_IDS) {
      const plan = layerPlan(layer, engine, anchors);
      if (plan) expect(plan.channels.length, `${id} ${layer}`).toBeLessThanOrEqual(MAX_CHANNELS);
    }
  });
});

describe.each(pistonIds)('coolant in %s', (id) => {
  it('keeps the jacket between the liners and the block wall, and the hoses short', () => {
    const { engine, anchors } = get(id);
    const a = anchors as PistonAnchors;
    const plan = layerPlan('coolant', engine, a)!;
    if (systemsOf(engine.spec).cooling !== 'liquid') {
      expect(plan.parts.some((p) => p.part === 'cooling-fins')).toBe(true);
      return;
    }
    const jacket = plan.routes.filter((r) => r.channel === 'jacket');
    expect(jacket.length).toBe(2 * a.banks.length);
    for (const route of jacket) {
      const [p, q] = route.points;
      expect(route.radius).toBeCloseTo(JACKET.radius * a.bore, 9);
      expect(p!.distanceTo(q!)).toBeGreaterThan(0);
      for (const c of a.cylinders) {
        if (c.z > Math.max(p!.z, q!.z) || c.z < Math.min(p!.z, q!.z)) continue;
        const at = p!.clone().lerp(q!, (c.z - p!.z) / (q!.z - p!.z));
        const axis = new THREE.Vector2(Math.sin((c.alpha * Math.PI) / 180), Math.cos((c.alpha * Math.PI) / 180));
        const along = at.x * axis.x + at.y * axis.y;
        const off = Math.hypot(at.x - axis.x * along, at.y - axis.y * along);
        expect(off, `${id} jacket vs liner of ${c.n}`).toBeGreaterThanOrEqual(a.linerR + route.radius);
        expect(insidePolygon(at.x, at.y, a.section), `${id} jacket inside`).toBe(true);
        expect(distanceToOutline(at.x, at.y, a.section), `${id} jacket vs wall`).toBeGreaterThanOrEqual(route.radius);
      }
      expect(jacketY(a)).toBeLessThan(a.deck);
    }
    const front = Math.max(a.front, a.pulley.z);
    for (const r of plan.routes.filter((x) => x.part === 'radiator-hose')) for (const p of r.points) expect(p.z, `${id} radiator stub`).toBeLessThanOrEqual(front + 1.55 * a.bore);
    for (const r of plan.routes.filter((x) => x.part === 'heater-hose')) for (const p of r.points) expect(p.z, `${id} heater stub`).toBeGreaterThanOrEqual(a.rear - 1.55 * a.bore);
  });
});

describe.each(pistonIds)('fuel and ignition in %s', (id) => {
  it('puts plug tips and direct injectors in the chamber and port injectors in their runners', () => {
    const { engine, anchors } = get(id);
    const a = anchors as PistonAnchors;
    const plan = layerPlan('fuel', engine, a)!;
    const offAxis = (p: THREE.Vector3, c: { alpha: number; z: number }): { off: number; along: number } => {
      const axis = new THREE.Vector3(Math.sin((c.alpha * Math.PI) / 180), Math.cos((c.alpha * Math.PI) / 180), 0);
      const rel = p.clone().setZ(p.z - c.z);
      const along = rel.dot(axis);
      return { off: rel.clone().addScaledVector(axis, -along).length(), along };
    };
    for (const f of plan.flashes ?? []) {
      if (f.part !== 'spark-plug') continue;
      // A plug's spark slot is its cylinder's index.
      const { off, along } = offAxis(f.position, a.cylinders[f.slot]!);
      expect(off, `${id} plug tip in the bore`).toBeLessThan(a.bore / 2);
      expect(Math.abs(along - a.deck), `${id} plug tip at the deck`).toBeLessThan(0.05 * a.bore);
    }
    for (const s of plan.pistonSprays.filter((x) => x.part === 'injector-direct')) {
      expect(Math.abs(s.from.x), `${id} direct injector in the bore`).toBeLessThan(a.bore / 2);
    }
    for (const s of plan.fixedSprays.filter((x) => x.part === 'injector-port')) {
      const runner = a.runners.reduce((best, r) => {
        const d = Math.min(...r.points.map((p) => p.distanceTo(s.from)));
        return d < best.d ? { r, d } : best;
      }, { r: a.runners[0]!, d: Infinity }).r;
      const pts = runner.points;
      let best = Infinity;
      for (let i = 1; i < pts.length; i++) best = Math.min(best, segmentDistance(pts[i - 1]!, pts[i]!, s.from, s.from));
      expect(best, `${id} port injector inside its runner`).toBeLessThan(runner.r * 1.2);
    }
  });
});

describe.each(rotaryIds)('oil in rotary %s', (id) => {
  it('feeds the eccentric shaft, cools the rotors and meters oil into every rotor', () => {
    const { anchors } = get(id);
    const a = anchors as RotaryAnchors;
    const plan = oilOf(id);
    const drillings = plan.routes.filter((r) => r.channel === 'crank');
    expect(drillings.length).toBe(1 + a.rotorZ.length);
    for (const d of drillings) expect(d.space).toBe('shaft');
    expect(plan.fixedSprays.filter((s) => s.part === 'rotor-cooling').length).toBe(2 * a.rotorZ.length);
    expect(plan.routes.filter((r) => r.channel === 'metering').length).toBe(2 * a.rotorZ.length);
    const pick = plan.routes.find((r) => r.channel === 'suction')!.points[0]!;
    expect(pick.y).toBeLessThan(plan.level!.y);
    expect(pick.y).toBeGreaterThan(a.pan.bottom);
  });
});

it('a dry sump layout draws its scavenge stages and tank, and the pressure stage draws from the tank alone', () => {
  const { engine, anchors } = get('b6');
  const s = systemsOf(engine.spec);
  const sump = sumpLayout(engine, s);
  const tank = { position: new THREE.Vector3(1.2, 0, sump.pan.zMax), radius: 0.15, height: 0.6 };
  const outlet = tank.position.clone().add(new THREE.Vector3(0, -tank.height / 2, 0));
  const dry = {
    ...sump,
    // On a dry sump the layout's pressure inlet is the tank's outlet.
    pressureInlet: outlet,
    scavengePickups: [new THREE.Vector3(0, sump.pan.bottom + 0.05, sump.pan.zMin + 0.3), new THREE.Vector3(0, sump.pan.bottom + 0.05, 0), new THREE.Vector3(0, sump.pan.bottom + 0.05, sump.pan.zMax - 0.3)],
    tank,
  };
  const plan = oilPlan(engine, s, anchors as PistonAnchors, dry);
  expect(plan.routes.filter((r) => r.channel === 'scavenge').length).toBe(4);
  const tankLines = plan.routes.filter((r) => r.channel === 'tank');
  expect(tankLines.length).toBe(1);
  expect(tankLines[0]!.points[0]!.distanceTo(outlet)).toBeLessThan(1e-9);
  expect(plan.parts.some((p) => p.part === 'oil-tank')).toBe(true);
  // No pan pickup or suction line for the pressure stage: only the three scavenge screens are in the pan.
  expect(plan.routes.some((r) => r.channel === 'suction')).toBe(false);
  const screens = plan.parts.filter((p) => p.part === 'oil-pickup');
  expect(screens.length).toBe(3);
  for (const p of screens) expect(dry.scavengePickups.some((q) => q.distanceTo(p.position) < 1e-9)).toBe(true);
  const wet = oilPlan(engine, s, anchors as PistonAnchors, sump);
  expect(wet.routes.some((r) => r.channel === 'scavenge' || r.channel === 'tank')).toBe(false);
  expect(wet.routes.filter((r) => r.channel === 'suction').length).toBe(1);
  void addScavenge;
  void OIL_SIZES;
});
