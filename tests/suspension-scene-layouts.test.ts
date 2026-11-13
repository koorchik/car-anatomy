// Every independent corner on links in 3D, without WebGL: double wishbones, a five-link and MacPherson struts with a
// split knuckle (dual-axis, RevoKnuckle) beside the plain strut of the macpherson page, and a double wishbone with its
// spring apart from the damper. The generic link builder must draw each link at the solver's length with both ends
// where the solver has them, over the whole travel and with the rack turned; coilovers stand on their arm or link at
// the tables' damper length, a lone coil at the tables' spring length; each part has a card.

import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { factorySetup, resolveCorner, type ResolvedCorner } from '../src/suspension/setup.ts';
import { doubleWishbone, wishboneDefaults } from '../src/suspension/templates/double-wishbone.ts';
import { jtektCorner, macphersonJtekt } from '../src/suspension/templates/macpherson.ts';
import { multilink, multilinkDefaults } from '../src/suspension/templates/multilink.ts';
import { typicalCorner, typicalWheelCentreZM } from '../src/suspension/templates/typical-corner.ts';
import type { AxleSpec, Vec3 } from '../src/suspension/spec.ts';
import { DRAWING } from '../src/scene/suspension/drawing.ts';

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

/**
 * The rear double wishbone with its coil apart from the damper, as many rear axles have it: the coil on the lower arm
 * nearer the body, the damper on the knuckle behind the hub. Not a template: it runs the builder's other seats.
 */
function springApart(): AxleSpec {
  const dw = doubleWishbone({ ...wishboneDefaults('rear'), wheelCentreZM: h });
  const arm = dw.linkage.wishbones.find((w) => w.id === dw.spring.on)!;
  const at = (a: Vec3, b: Vec3, s: number): Vec3 => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];
  const seat = at(at(arm.front, arm.rear, 0.5), arm.ball, 0.45);
  const [x, y, z] = dw.wheelCentre;
  return {
    ...dw,
    spring: { ...dw.spring, body: [seat[0], seat[1], seat[2] + 0.3], wheel: seat },
    damper: { ...dw.damper, body: [x - 0.12, y - 0.12, z + 0.42], wheel: [x - 0.12, y - 0.1, z - 0.05], on: undefined },
  };
}

const CORNERS: Array<[string, ResolvedCorner]> = [
  ['plain strut', resolveCorner(jtekt, factorySetup(jtekt))],
  ['dual-axis strut', resolve(macphersonJtekt({ wheelCentreZM: h, knuckle: 'dual-axis' }))],
  ['RevoKnuckle strut', resolve(macphersonJtekt({ wheelCentreZM: h, knuckle: 'revoknuckle' }))],
  ['front double wishbone', resolve(doubleWishbone({ ...wishboneDefaults('front'), wheelCentreZM: h }))],
  ['rear double wishbone', resolve(doubleWishbone({ ...wishboneDefaults('rear'), wheelCentreZM: h }))],
  ['front multilink', resolve(multilink({ ...multilinkDefaults('front'), wheelCentreZM: h }))],
  ['rear multilink', resolve(multilink({ ...multilinkDefaults('rear'), wheelCentreZM: h }))],
  ['rear double wishbone with the spring apart', resolve(springApart())],
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

  it('stands the strut, the coilover or the lone coil on its seat at the tables’ lengths', () => {
    const model = new CornerModel(resolved);
    const frame = cornerFrame();
    const table = resolved.axle.table;
    for (let i = 0; i < table.n; i += 5) {
      frame.travel = table.travel0 + i * table.step;
      model.update(frame);
      // The tables interpolate between exact nodes; on a node they are exact.
      expect(Math.abs(model.damper.length / 10 - resolved.axle.value('damperLen', frame.travel)), `at ${frame.travel}`).toBeLessThan(1e-6);
      if (model.loneSpring) expect(Math.abs(model.loneSpring.length / 10 - resolved.axle.value('springLen', frame.travel)), `spring at ${frame.travel}`).toBeLessThan(1e-6);
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

  it('keeps the knuckle’s castings out of the spinning brake disc over the travel and the rack', () => {
    // The disc's braking ring in the hub frame (along the spin axis from the wheel centre, outboard positive), as the
    // model draws it; the caliper straddles it by design. Every casting the knuckle or a split knuckle's carrier has
    // must stay out of the ring with 2 mm to spare, sampled over each triangle, not only at its corners.
    const model = new CornerModel(resolved);
    const frame = cornerFrame();
    const table = resolved.axle.table;
    const face = DRAWING.wheelOffsetM;
    const ringIn = face - DRAWING.hatDepthM - DRAWING.discThickM;
    const ringOut = ringIn + DRAWING.discThickM;
    const clear = 0.002;
    const castings: THREE.Mesh[] = [];
    for (const group of [model.knuckle, model.carrier]) {
      for (const o of group?.children ?? []) {
        const part = o.userData.part as string | undefined;
        if ((o as THREE.Mesh).isMesh && part !== 'susp.caliper' && (part === 'susp.knuckle' || part === link.knuckle?.knucklePart || part === link.knuckle?.carrierPart)) castings.push(o as THREE.Mesh);
      }
    }
    expect(castings.length).toBe(link.knuckle ? 2 : 1);
    const toHub = new THREE.Matrix4();
    const corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const p = new THREE.Vector3();
    let deepest = -Infinity;
    let where = '';
    for (const rack of steered ? [-0.03, 0, 0.03] : [0]) {
      for (let i = 0; i < table.n; i += 10) {
        frame.travel = table.travel0 + i * table.step;
        frame.rack = rack;
        model.update(frame);
        model.group.updateMatrixWorld(true);
        toHub.copy((model as unknown as { hubFrame: THREE.Object3D }).hubFrame.matrixWorld).invert();
        for (const mesh of castings) {
          const pos = mesh.geometry.attributes.position!;
          const index = mesh.geometry.index;
          const count = index ? index.count : pos.count;
          const m = new THREE.Matrix4().multiplyMatrices(toHub, mesh.matrixWorld);
          for (let t = 0; t < count; t += 3) {
            for (let k = 0; k < 3; k++) corners[k]!.fromBufferAttribute(pos, index ? index.getX(t + k) : t + k).applyMatrix4(m);
            for (let a = 0; a <= 4; a++) {
              for (let b = 0; a + b <= 4; b++) {
                p.set(0, 0, 0).addScaledVector(corners[0]!, a / 4).addScaledVector(corners[1]!, b / 4).addScaledVector(corners[2]!, (4 - a - b) / 4);
                const axial = p.x / 10;
                const radius = Math.hypot(p.y, p.z) / 10;
                if (axial < ringIn - clear || axial > ringOut + clear || radius < DRAWING.discInnerM) continue;
                const depth = DRAWING.discOuterM + clear - radius;
                if (depth > deepest) {
                  deepest = depth;
                  where = `${mesh.userData.part} at ${(frame.travel * 1000).toFixed(0)} mm, rack ${rack}`;
                }
              }
            }
          }
        }
      }
    }
    expect(deepest, where).toBeLessThanOrEqual(0);
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
    const [plain, dual, , dw, , ml, , apart] = models;
    expect(plain!.parts['susp.knuckle']!.text).not.toBe(dw!.parts['susp.knuckle']!.text);
    expect(dw!.parts['susp.knuckle']!.text).not.toBe(ml!.parts['susp.knuckle']!.text);
    expect(dual!.parts['susp.strut']!.text).not.toBe(plain!.parts['susp.strut']!.text);
    expect(dw!.parts['susp.spring']!.text).not.toBe(plain!.parts['susp.spring']!.text);
    // The coil on a link is not on an arm, and a damper with its coil apart has none wound round it.
    expect(ml!.parts['susp.spring']!.text).not.toBe(dw!.parts['susp.spring']!.text);
    expect(apart!.parts['susp.damper']!.text).not.toBe(dw!.parts['susp.damper']!.text);
    for (const m of models) m.dispose();
  });

  it('says nothing of steering on a wheel that does not steer, nor of a gearbox at a driven rear wheel', () => {
    for (const [name, resolved] of CORNERS) {
      if (resolved.axle.spec.linkage.rods.some((r) => r.steer)) continue;
      const model = new CornerModel(resolved);
      for (const view of ['solid', 'xray', 'mechanism'] as const) {
        model.setView(view);
        for (const key of shownKeys(model.group)) {
          const card = model.parts[key]!;
          expect(`${card.name}. ${card.text}`, `${name}: ${key}`).not.toMatch(/керм|Поворотний|коробк/);
        }
      }
      model.dispose();
    }
  });
});
