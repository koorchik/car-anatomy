// Every independent corner on links in 3D, without WebGL: double wishbones, a five-link and MacPherson struts with a
// split knuckle (dual-axis, RevoKnuckle) beside the plain strut of the macpherson page. The generic link builder must
// draw each link at the solver's length with both ends where the solver has them, over the whole travel and with the
// rack turned; coilovers stand on their arm or link at the tables' damper length; each part has a card.

import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { factorySetup, resolveCorner, type ResolvedCorner } from '../src/suspension/setup.ts';
import { doubleWishbone, wishboneDefaults } from '../src/suspension/templates/double-wishbone.ts';
import { jtektCorner, macphersonJtekt } from '../src/suspension/templates/macpherson.ts';
import { multilink, multilinkDefaults } from '../src/suspension/templates/multilink.ts';
import { typicalCorner, typicalWheelCentreZM } from '../src/suspension/templates/typical-corner.ts';
import type { AxleSpec, Vec3 } from '../src/suspension/spec.ts';

const context = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }), set: () => true });
vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });

const { CornerModel, cornerFrame } = await import('../src/scene/suspension/corner-model.ts');
type Model = InstanceType<typeof CornerModel>;

const h = typicalWheelCentreZM();
const resolve = (axle: AxleSpec): ResolvedCorner => {
  const corner = typicalCorner(axle);
  return resolveCorner(corner, factorySetup(corner));
};
const jtekt = jtektCorner();
const CORNERS: Array<[string, ResolvedCorner]> = [
  ['plain strut', resolveCorner(jtekt, factorySetup(jtekt))],
  ['dual-axis strut', resolve(macphersonJtekt({ wheelCentreZM: h, knuckle: 'dual-axis' }))],
  ['RevoKnuckle strut', resolve(macphersonJtekt({ wheelCentreZM: h, knuckle: 'revoknuckle' }))],
  ['front double wishbone', resolve(doubleWishbone({ ...wishboneDefaults('front'), wheelCentreZM: h }))],
  ['rear double wishbone', resolve(doubleWishbone({ ...wishboneDefaults('rear'), wheelCentreZM: h }))],
  ['front multilink', resolve(multilink({ ...multilinkDefaults('front'), wheelCentreZM: h }))],
  ['rear multilink', resolve(multilink({ ...multilinkDefaults('rear'), wheelCentreZM: h }))],
];

const scene = (p: ArrayLike<number>): THREE.Vector3 => new THREE.Vector3(p[1]! * 10, p[2]! * 10, p[0]! * 10);

const visible = (o: THREE.Object3D): boolean => {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
};

/** Part keys of everything that is shown (and could be clicked) in the model. */
function shownKeys(root: THREE.Object3D): Set<string> {
  const keys = new Set<string>();
  root.traverse((o) => {
    if (!visible(o)) return;
    if (o.userData.part) keys.add(o.userData.part as string);
    for (const k of (o.userData.instanceParts as string[] | undefined) ?? []) keys.add(k);
  });
  return keys;
}

/** Draw calls of a frame with the key light's shadow pass, as the strut corner's test counts them. */
function drawCalls(root: THREE.Object3D): number {
  let calls = 0;
  root.traverse((o) => {
    const any = o as THREE.Mesh & THREE.Line & THREE.Sprite;
    if (!(any.isMesh || any.isLine || any.isSprite) || !visible(o)) return;
    calls += any.isMesh && o.castShadow ? 2 : 1;
  });
  return calls;
}

describe.each(CORNERS)('the %s in 3D', (_name, resolved) => {
  const spec = resolved.axle.spec;
  const link = spec.linkage;
  const solver = resolved.axle.solver;
  const steered = link.rods.some((r) => r.steer);

  it('draws every link at the solver’s length with both ends on the solver’s points, over the travel and the rack', () => {
    const model = new CornerModel(resolved);
    const frame = cornerFrame();
    const table = resolved.axle.table;
    const tol = 1e-5; // scene units: 1e-6 m
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const out = [0, 0, 0];
    expect(model.links.map((l) => l.name)).toEqual(solver.rows.slice(0, solver.distanceRows));
    let checked = 0;
    for (const rack of steered ? [-0.03, 0, 0.03] : [0]) {
      for (let i = 0; i < table.n; i += 2) {
        frame.travel = table.travel0 + i * table.step;
        frame.rack = rack;
        model.update(frame);
        model.group.updateMatrixWorld(true);
        const pose = model.pose;
        model.links.forEach((drawn, row) => {
          a.copy(drawn.bodyEnd).applyMatrix4(drawn.object.matrixWorld);
          b.copy(drawn.knuckleEnd).applyMatrix4(drawn.object.matrixWorld);
          const at = `${drawn.name} at ${(frame.travel * 1000).toFixed(0)} mm, rack ${rack}`;
          expect(Math.abs(a.distanceTo(b) - solver.lengthOf(row) * 10), `${at}: length`).toBeLessThan(tol);
          // The solver's ends: a wishbone's pivot and ball (on a split knuckle's carrier), a rod's body end (moved by
          // the rack when steered) and knuckle end.
          let body: Vec3;
          if (row < 2 * link.wishbones.length) {
            const w = link.wishbones[row >> 1]!;
            body = row % 2 === 0 ? w.front : w.rear;
            solver.carrierPoint(pose, w.ball, out);
          } else {
            const r = link.rods[row - 2 * link.wishbones.length]!;
            body = [r.body[0], r.body[1] + (r.steer ? rack : 0), r.body[2]];
            solver.point(pose, r.knuckle, out);
          }
          expect(a.distanceTo(scene(body)), `${at}: body end`).toBeLessThan(tol);
          expect(b.distanceTo(scene(out)), `${at}: knuckle end`).toBeLessThan(tol);
        });
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(40);
    model.dispose();
  });

  it('stands the strut or the coilover on its seat at the tables’ damper length', () => {
    const model = new CornerModel(resolved);
    const frame = cornerFrame();
    const table = resolved.axle.table;
    for (let i = 0; i < table.n; i += 5) {
      frame.travel = table.travel0 + i * table.step;
      model.update(frame);
      // The tables interpolate between exact nodes; on a node they are exact.
      expect(Math.abs(model.damper.length / 10 - resolved.axle.value('damperLen', frame.travel)), `at ${frame.travel}`).toBeLessThan(1e-6);
    }
    model.dispose();
  });

  it('turns a split knuckle’s carrier with the strut and the wheel knuckle with the wheel', () => {
    if (!link.knuckle) return;
    const model = new CornerModel(resolved);
    const frame = cornerFrame();
    const out = [0, 0, 0];
    const p = new THREE.Vector3();
    for (const rack of [-0.03, 0.03]) {
      frame.travel = 0.05;
      frame.rack = rack;
      model.update(frame);
      model.group.updateMatrixWorld(true);
      expect(Math.abs(model.pose[7]!), 'the knuckle turns in the carrier').toBeGreaterThan(0.01);
      // Carrier points (the strut's lower point, the axis) and knuckle points (the wheel centre, the axis) where the
      // solver has them.
      for (const k of [link.strut!.lower, link.knuckle.axisLower, link.knuckle.axisUpper]) {
        solver.carrierPoint(model.pose, k, out);
        p.copy(scene(k)).applyMatrix4(model.carrier!.matrixWorld);
        expect(p.distanceTo(scene(out))).toBeLessThan(1e-5);
      }
      for (const k of [spec.wheelCentre, link.knuckle.axisLower, link.knuckle.axisUpper]) {
        solver.point(model.pose, k, out);
        p.copy(scene(k)).applyMatrix4(model.knuckle.matrixWorld);
        expect(p.distanceTo(scene(out))).toBeLessThan(1e-5);
      }
    }
    model.dispose();
  });

  it('has a card for every part, in every view', () => {
    const model = new CornerModel(resolved);
    for (const view of ['solid', 'xray', 'mechanism'] as const) {
      model.setView(view);
      for (const key of shownKeys(model.group)) expect(model.parts[key], `${key} in ${view}`).toBeDefined();
    }
    model.setView('solid');
    const keys = shownKeys(model.group);
    for (const key of ['susp.hub', 'susp.brake-disc', 'susp.caliper', 'susp.wheel', 'susp.tyre', 'susp.spring', 'susp.bump-stop', 'susp.top-mount', 'susp.body', 'susp.subframe', 'susp.road']) {
      expect(keys, key).toContain(key);
    }
    for (const w of link.wishbones) expect(keys, w.part).toContain(w.part);
    for (const r of link.rods) expect(keys, r.part).toContain(r.part);
    if (link.knuckle) for (const key of [link.knuckle.carrierPart, link.knuckle.knucklePart]) expect(keys, key).toContain(key);
    else expect(keys).toContain('susp.knuckle');
    expect(keys).toContain(link.strut ? 'susp.strut' : 'susp.damper');
    if (spec.halfshaft) for (const key of ['susp.halfshaft', 'susp.cv-inner', 'susp.cv-outer']) expect(keys, key).toContain(key);
    if (steered) expect(keys).toContain('susp.rack');
    model.dispose();
  });

  it('shows the damper’s piston and oil in the X-ray only, and the links as bars in «Механізм»', () => {
    const model = new CornerModel(resolved);
    const shown = (key: string): boolean => {
      let any = false;
      model.group.traverse((o) => {
        if (o.userData.part === key && (o as THREE.Mesh).isMesh && visible(o)) any = true;
      });
      return any;
    };
    expect(shown('susp.damper-piston')).toBe(false);
    model.setView('xray');
    expect(shown('susp.damper-piston')).toBe(true);
    expect(shown('susp.damper-oil')).toBe(true);
    model.setView('mechanism');
    for (const part of [...link.wishbones.map((w) => w.part), ...link.rods.map((r) => r.part)]) {
      expect(shown(part), `${part} solid in «Механізм»`).toBe(false);
      expect(shownKeys(model.group), part).toContain(part);
    }
    for (const gone of ['susp.tyre', 'susp.wheel', 'susp.body', 'susp.brake-disc']) expect(shownKeys(model.group), gone).not.toContain(gone);
    model.dispose();
  });

  it('stays within the corner budget of 60 draw calls in every view, shadows included', () => {
    const model = new CornerModel(resolved);
    for (const view of ['solid', 'xray', 'mechanism'] as const) {
      model.setView(view);
      expect(drawCalls(model.group), view).toBeLessThanOrEqual(60);
    }
    model.dispose();
  });

  it('balances the knuckle at rest: the links leave nothing to accelerate the wheel', () => {
    // A rig at the static point: the tyre carries the corner's weight, the spring its static force.
    const model = new CornerModel(resolved);
    const frame = cornerFrame();
    frame.travel = resolved.staticTravelM;
    frame.bodyZ = resolved.bodyStaticM;
    frame.springN = resolved.spring.staticN;
    frame.tyreN = (resolved.sprungKg + resolved.unsprungKg) * 9.81;
    model.update(frame);
    // The travel row's multiplier is the vertical force left at the wheel centre.
    const lambda = (model as unknown as { statics: { lambda: Float64Array } }).statics.lambda;
    const travelRow = solver.rows.length - 1;
    expect(Math.abs(lambda[travelRow]!)).toBeLessThan(0.02 * frame.tyreN);
    model.dispose();
  });
});

describe('the corners side by side', () => {
  it('keeps the plain strut’s cards and gives the others their own', () => {
    const models = CORNERS.map(([, r]) => new CornerModel(r)) as Model[];
    const [plain, dual, , dw, , ml] = models;
    expect(plain!.parts['susp.knuckle']!.text).not.toBe(dw!.parts['susp.knuckle']!.text);
    expect(dw!.parts['susp.knuckle']!.text).not.toBe(ml!.parts['susp.knuckle']!.text);
    expect(dual!.parts['susp.strut']!.text).not.toBe(plain!.parts['susp.strut']!.text);
    expect(dw!.parts['susp.spring']!.text).not.toBe(plain!.parts['susp.spring']!.text);
    for (const m of models) m.dispose();
  });
});
