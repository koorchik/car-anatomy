import { describe, expect, it } from 'vitest';
import { ENGINES, engineById } from '../src/data/engines.ts';
import { BalanceForces, massesOf } from '../src/engine/balance-forces.ts';
import { diagramAt, isInline, planDiagram, wordOf, type DiagramFrame, type LocusWord } from '../src/engine/balance-diagram.ts';
import { BalancePhasors, netAt, sumAt, type BalanceView, type Locus, type Quantity, type ViewOptions } from '../src/engine/balance-phasors.ts';
import { buildEngine } from '../src/engine/kinematics.ts';

const phasors = (id: string, shafts?: 0 | 1 | 2): BalancePhasors => {
  const e = buildEngine(engineById(id)!);
  const masses = massesOf(e.spec);
  return new BalancePhasors(new BalanceForces(e, shafts === undefined ? masses : { ...masses, shafts }));
};

/** The diagram of a view of these phasors, inline or not as the engine is. */
const planOf = (ph: BalancePhasors, view: BalanceView, o: ViewOptions, q: Quantity) => planDiagram(ph.view(view, o), q, isInline(ph));

const BARE: ViewOptions = { counterweights: false, shafts: false };
const WEIGHTS: ViewOptions = { counterweights: true, shafts: false };
const ALL: ViewOptions = { counterweights: true, shafts: true };
const OPTIONS = [BARE, WEIGHTS, ALL];
const VIEWS: BalanceView[] = ['order1', 'order2', 'rotating'];
const QUANTITIES: Quantity[] = ['force', 'couple'];
const THETAS = [0, 17.3, 90, 123.4, 271.9, 600];

/** The engines «А4» of the build order names, plus the shafts of an I4 and the turning masses of a rotary. */
const A4 = ['i4', 'i6', 'v8-cross', 'v8-flat', 'v6-90', 'b4', 'i1'];

const far = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);
const unitOf = (ph: BalancePhasors, q: Quantity): number => (q === 'force' ? ph.forces.primary : ph.forces.primary * ph.forces.lever);

describe('diagram points', () => {
  it('end at the sum of the view for every engine of «А4», whatever the angle and switches', () => {
    for (const [id, shafts] of [...A4.map((id) => [id, undefined] as const), ['i4', 2] as const, ['i1', 1] as const, ['r2', undefined] as const]) {
      const ph = phasors(id, shafts);
      for (const view of VIEWS) {
        for (const o of OPTIONS) {
          const v = ph.view(view, o);
          for (const q of QUANTITIES) {
            const tol = unitOf(ph, q) * 1e-12;
            const plan = planOf(ph, view, o, q);
            let frame: DiagramFrame | undefined;
            for (const theta of THETAS) {
              frame = diagramAt(plan, theta, frame);
              const label = `${id} ${view} ${JSON.stringify(o)} ${q} ${theta}`;
              const sum = sumAt(v, theta);
              const net = q === 'force' ? { x: sum.fx, y: sum.fy } : { x: sum.my, y: -sum.mx };
              expect(far(frame.net, net), label).toBeLessThan(tol);
              expect(far(frame.trail[frame.trail.length - 1]!, net), label).toBeLessThan(tol);
              expect(frame.chains).toHaveLength(plan.chains.length);
              if (plan.mode === 'halves') {
                // The chains follow on from each other, and the last one ends at the sum.
                let start = { x: 0, y: 0 };
                frame.chains.forEach((points, c) => {
                  expect(far(points[0]!, start), label).toBeLessThan(tol);
                  const end = points[points.length - 1]!;
                  const half = netAt(v, theta, q, plan.chains[c]!.side);
                  expect(far({ x: end.x - start.x, y: end.y - start.y }, half), label).toBeLessThan(tol);
                  start = end;
                });
                expect(far(start, net), label).toBeLessThan(tol);
              } else {
                // One polygon of whole vectors turning with the crank, whose shadow on the cylinders' axis is the sum.
                // A single cylinder has no lever for a couple: nothing to draw, and nothing to sum.
                if (plan.chains.length === 0) {
                  expect(Math.hypot(net.x, net.y), label).toBeLessThan(tol);
                  continue;
                }
                expect(frame.chains).toHaveLength(1);
                const points = frame.chains[0]!;
                const end = points[points.length - 1]!;
                const plus = netAt(v, theta, q, 'plus');
                expect(far(end, { x: 2 * plus.x, y: 2 * plus.y }), label).toBeLessThan(tol);
                const a = (plan.axis! * Math.PI) / 180;
                const along = end.x * Math.sin(a) + end.y * Math.cos(a);
                expect(far({ x: along * Math.sin(a), y: along * Math.cos(a) }, net), label).toBeLessThan(tol);
              }
            }
          }
        }
      }
    }
  });

  it('draw one polygon for pistons alone on an inline engine and two halves for a V, a boxer or any counterweight', () => {
    const chains = (id: string, view: BalanceView, o: ViewOptions, q: Quantity = 'force') => {
      const plan = planOf(phasors(id), view, o, q);
      return [plan.mode, plan.chains.map((c) => c.side).join(' ')];
    };
    expect(chains('i4', 'order1', BARE)).toEqual(['projection', 'plus']);
    expect(chains('i4', 'order2', BARE)).toEqual(['projection', 'plus']);
    expect(chains('i6', 'order2', BARE, 'couple')).toEqual(['projection', 'plus']);
    expect(chains('i1', 'order1', BARE)).toEqual(['projection', 'plus']);
    expect(chains('v8-cross', 'order1', BARE)).toEqual(['halves', 'plus minus']);
    expect(chains('v8-flat', 'order2', BARE)).toEqual(['halves', 'plus minus']);
    expect(chains('b4', 'order2', BARE)).toEqual(['halves', 'plus minus']);
    expect(chains('v6-90', 'order2', BARE, 'couple')).toEqual(['halves', 'plus minus']);
    // Counterweights turn only with the crank, so the halves stop being mirror images even on an inline engine.
    expect(chains('i1', 'order1', WEIGHTS)).toEqual(['halves', 'plus minus']);
    // Turning masses have no half against the crank.
    expect(chains('v8-cross', 'rotating', WEIGHTS)).toEqual(['halves', 'plus']);
    // One cylinder has no lever for a couple.
    expect(chains('i1', 'order1', BARE, 'couple')).toEqual(['projection', '']);
  });

  it('close where they come back to their start, and all of them exactly when the word is «balanced»', () => {
    for (const spec of ENGINES) {
      const ph = phasors(spec.id);
      for (const view of ph.views) {
        for (const o of OPTIONS) {
          for (const q of QUANTITIES) {
            const plan = planOf(ph, view, o, q);
            const label = `${spec.id} ${view} ${JSON.stringify(o)} ${q}`;
            expect(plan.chains.every((c) => c.closes), label).toBe(plan.word === 'balanced');
            // A chain that closes leaves a gap no bigger than the 5 % that still counts as a circle; one that does not, more.
            const frame = diagramAt(plan, 37, undefined, false);
            plan.chains.forEach((chain, c) => {
              const points = frame.chains[c]!;
              const gap = far(points[0]!, points[points.length - 1]!);
              const most = plan.locus.major;
              if (chain.closes) expect(gap, label).toBeLessThanOrEqual(Math.max(most * 0.05, unitOf(ph, q) * 0.01) + 1e-12);
              else expect(gap, label).toBeGreaterThan(most * 0.05);
            });
          }
        }
      }
    }
  });

  it('reach as far as the diagram ever gets, and no further', () => {
    for (const id of A4) {
      const ph = phasors(id);
      for (const view of VIEWS) {
        for (const q of QUANTITIES) {
          const plan = planOf(ph, view, WEIGHTS, q);
          let most = 0;
          let frame: DiagramFrame | undefined;
          for (let i = 0; i < 720; i++) {
            frame = diagramAt(plan, i / 2, frame, false);
            for (const p of frame.chains.flat()) most = Math.max(most, Math.hypot(p.x, p.y));
          }
          expect(plan.reach, `${id} ${view} ${q}`).toBeGreaterThanOrEqual(most * 0.98);
          expect(plan.reach, `${id} ${view} ${q}`).toBeLessThanOrEqual(most * 1.0001 + unitOf(ph, q) * 1e-12);
        }
      }
    }
  });

  it('redrawn into the same frame give what a fresh frame would', () => {
    const ph = phasors('v8-cross');
    const plans = [planOf(ph, 'order1', WEIGHTS, 'couple'), planOf(ph, 'rotating', BARE, 'force'), planOf(ph, 'order2', BARE, 'force')];
    const frame: DiagramFrame = { chains: [], net: { x: 0, y: 0 }, trail: [] };
    for (const theta of [0, 41, 233]) {
      for (const plan of plans) {
        expect(diagramAt(plan, theta, frame)).toBe(frame);
        expect(frame).toEqual(diagramAt(plan, theta));
      }
    }
  });
});

describe('the word under the diagram', () => {
  /** What the trail of the tip really does over a turn, read off its points alone. */
  const shapeOf = (trail: { x: number; y: number }[], unit: number): LocusWord => {
    const radii = trail.map((p) => Math.hypot(p.x, p.y));
    const big = Math.max(...radii);
    if (big < unit * 0.01) return 'balanced';
    const small = Math.min(...radii);
    if (small < big * 0.05) {
      const p = trail[radii.indexOf(big)]!;
      const axis = ((((Math.atan2(p.x, p.y) * 180) / Math.PI) % 180) + 180) % 180;
      if (Math.min(axis, 180 - axis) <= 15) return 'vertical';
      if (Math.abs(axis - 90) <= 15) return 'sideways';
      return 'oblique';
    }
    // Clockwise seen from the front, with the crank, turns x right and y up the negative way.
    const a = trail[0]!;
    const b = trail[1]!;
    const sense = -Math.sign(a.x * b.y - a.y * b.x);
    // The two turning halves a and b give radii from a + b down to |a - b|: a circle while the smaller is 5 % or less.
    if (small >= big * (0.95 / 1.05)) return sense > 0 ? 'with' : 'against';
    return 'both';
  };

  it('matches the path the tip takes, for every engine of the catalogue', () => {
    for (const spec of ENGINES) {
      const ph = phasors(spec.id);
      for (const view of ph.views) {
        for (const o of OPTIONS) {
          const v = ph.view(view, o);
          for (const q of QUANTITIES) {
            const plan = planOf(ph, view, o, q);
            // The trail of the last turn, in fine steps: as many points as the locus needs to show its shape.
            const trail = Array.from({ length: 720 }, (_, i) => netAt(v, i / 2, q));
            const seen = shapeOf(trail, unitOf(ph, q));
            const label = `${spec.id} ${view} ${JSON.stringify(o)} ${q}: ${plan.locus.shape} ${plan.locus.axis.toFixed(1)}`;
            // Right at the edges of a category (a line at 15°, a circle at 5 %) the reading off points may round the other way.
            if (nearEdge(plan.locus)) continue;
            expect(plan.word, label).toBe(seen);
          }
        }
      }
    }
  });

  it('says what «А4» expects of each engine', () => {
    const word = (id: string, view: BalanceView, o: ViewOptions, q: Quantity) => planOf(phasors(id), view, o, q).word;
    expect(word('i4', 'order2', BARE, 'force')).toBe('vertical');
    expect(word('i4', 'order1', BARE, 'force')).toBe('balanced');
    expect(word('v8-flat', 'order2', BARE, 'force')).toBe('sideways');
    expect(word('v8-cross', 'order1', BARE, 'couple')).toBe('with');
    expect(word('v8-cross', 'order1', WEIGHTS, 'couple')).toBe('balanced');
    expect(word('v8-cross', 'rotating', BARE, 'couple')).toBe('with');
    expect(word('v6-90', 'order2', BARE, 'couple')).toBe('sideways');
    expect(word('v6-90', 'order2', BARE, 'force')).toBe('balanced');
    expect(word('b4', 'order2', BARE, 'couple')).toBe('sideways');
    expect(word('i1', 'order1', BARE, 'force')).toBe('vertical');
    expect(word('i1', 'order1', WEIGHTS, 'force')).toBe('against');
    for (const view of VIEWS) for (const o of OPTIONS) for (const q of QUANTITIES) expect(word('i6', view, o, q)).toBe('balanced');
  });

  it('names each shape of locus', () => {
    const l = (shape: Locus['shape'], sense: Locus['sense'], axis: number): Locus => ({ shape, sense, axis, major: 1, minor: 0 });
    expect(wordOf(l('point', 0, 0))).toBe('balanced');
    expect(wordOf(l('line', 0, 0))).toBe('vertical');
    expect(wordOf(l('line', 0, 172))).toBe('vertical');
    expect(wordOf(l('line', 0, 95))).toBe('sideways');
    expect(wordOf(l('line', 0, 45))).toBe('oblique');
    expect(wordOf(l('circle', 1, 0))).toBe('with');
    expect(wordOf(l('circle', -1, 0))).toBe('against');
    expect(wordOf(l('ellipse', 1, 30))).toBe('both');
  });
});

/** A locus within a hair of the line between two words. */
function nearEdge(locus: Locus): boolean {
  if (locus.shape === 'line') {
    const a = locus.axis;
    return Math.abs(Math.min(a, 180 - a) - 15) < 1 || Math.abs(Math.abs(a - 90) - 15) < 1;
  }
  if (locus.shape === 'point') return false;
  const halves = (locus.major - locus.minor) / (locus.major + locus.minor);
  return Math.abs(locus.minor / locus.major - 0.05) < 0.005 || Math.abs(halves - 0.05) < 0.005;
}
