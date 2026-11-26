// Points of the 2D force polygon in the force card (balance-phasors.ts gives the vectors), and the word under it. Pure,
// like the rest of src/engine, so a test can check that what is drawn ends at the view's sum.
//
// Two ways to draw a view, both in the front view (x right, y up, the crank turning clockwise):
//   halves      the vectors turning with the crank head to tail, then those turning against it, starting where the
//               first chain ended. Each chain closes on its own when that half cancels, and the end of the second is
//               the view's sum. V, VR, W and boxer engines, and any view with counterweights or shafts, which turn
//               only one way. A boxer's halves are mirror images too, but its two banks are the point of the picture
//               (item 5 of A4 in the build order), so it keeps both.
//   projection  pistons alone on an inline engine: the chain against the crank is the mirror image of the one with
//               it (PhasorView.mirror), so only one polygon is drawn, of whole vectors turning with the crank (each
//               half doubled). The force along the cylinders is its shadow on their axis, as in the textbook picture of
//               an inline engine's orders.
// Either way the tip of the net force runs along the view's locus over a turn, and the word says what that path is.

import { netAt, phasorAt, type BalancePhasors, type Locus, type PhasorElement, type PhasorView, type Quantity, type Vec2 } from './balance-phasors.ts';

/** What the net force (or couple) does over a turn, one word of the card each. */
export type LocusWord = 'balanced' | 'vertical' | 'sideways' | 'oblique' | 'with' | 'against' | 'both';

/** A line within this many degrees of upright or level is called that. */
const SQUARE = 15;
/** A vector under this share of the largest one of its chain is not drawn: a counterweight has no half against the crank. */
const EMPTY = 1e-9;
/** Points of the trail over the last turn, and crank angles sampled to find how far a diagram reaches. */
const TRAIL = 60;
const REACH_STEPS = 48;
/** Vectors within this sine of each other's line count as lying along it. */
const COLLINEAR = 1e-3;

export function wordOf(locus: Locus): LocusWord {
  switch (locus.shape) {
    case 'point':
      return 'balanced';
    case 'circle':
      return locus.sense > 0 ? 'with' : 'against';
    case 'ellipse':
      return 'both';
    case 'line': {
      const a = locus.axis;
      if (Math.min(a, 180 - a) <= SQUARE) return 'vertical';
      if (Math.abs(a - 90) <= SQUARE) return 'sideways';
      return 'oblique';
    }
  }
}

export type DiagramMode = 'halves' | 'projection';
export type ChainSide = 'plus' | 'minus';

export interface DiagramChain {
  side: ChainSide;
  /**
   * Elements of the view this chain draws, those with nothing on this side left out. They go round by direction,
   * clockwise from +Y at theta = 0: all of a chain turn together, so a chain that closes stays a convex polygon
   * instead of a path that doubles back on itself, which is hard to see closing.
   */
  elements: PhasorElement[];
  /**
   * Whether the chain comes back to where it started, as the word says: every chain of a balanced view does, and of a
   * circle the half that is not turning. Read off the locus, so the picture and the word never disagree.
   */
  closes: boolean;
  /**
   * Whether all its vectors lie along one line and some of them point back: drawn as they are, the way back would lie
   * on top of the way out and a chain that closes would look like an open stroke (the first order of an I4, a flat-plane
   * V8 or a boxer). The card draws such a chain as a thin loop. All of a chain turn together, so this holds at any angle.
   */
  flat: boolean;
}

/** What a diagram of one view draws, worked out once per view; diagramAt gives the points for a crank angle. */
export interface DiagramPlan {
  view: PhasorView;
  quantity: Quantity;
  mode: DiagramMode;
  /** One chain (inline pistons, or a view whose vectors all turn with the crank) or two, with the crank first. */
  chains: DiagramChain[];
  /** The cylinders' axis in projection mode, degrees clockwise from +Y, 0 to 180; null in halves mode. */
  axis: number | null;
  locus: Locus;
  word: LocusWord;
  /**
   * The farthest any point of the diagram gets from the origin over a turn, in the units of the view (kg m, or kg m^2
   * for a couple, per unit omega^2). 0 when there is nothing to draw.
   */
  reach: number;
}

export interface DiagramFrame {
  /** Per chain: where it starts, then the head of each of its elements. */
  chains: Vec2[][];
  /** Tip of the net force or couple: the end of the last chain, or in projection mode the polygon's end on the axis. */
  net: Vec2;
  /** Tip of the net over the last crank turn, oldest first; the last point is net. */
  trail: Vec2[];
}

const size = (x: number, y: number): number => Math.hypot(x, y);

const weightOf = (el: PhasorElement, quantity: Quantity): number => (quantity === 'couple' ? el.z / 1000 : 1);

/** One bank of pistons: the engines whose diagram may be a single polygon. */
export const isInline = (phasors: BalancePhasors): boolean => !phasors.forces.engine.isRotary && phasors.forces.engine.banks.length === 1;

/** @param inline Whether the engine has one bank of cylinders (isInline). */
export function planDiagram(view: PhasorView, quantity: Quantity, inline: boolean): DiagramPlan {
  const sum = view[quantity];
  const projection = inline && view.mirror !== null;
  const amount = (el: PhasorElement, side: ChainSide): number => {
    const c = el[side];
    return Math.abs(weightOf(el, quantity)) * size(c.re, c.im);
  };
  const sides: ChainSide[] = projection ? ['plus'] : ['plus', 'minus'];
  const big = view.elements.reduce((m, el) => Math.max(m, amount(el, 'plus'), amount(el, 'minus')), 0);
  const chains: DiagramChain[] = [];
  for (const side of sides) {
    const direction = (el: PhasorElement): number => {
      const k = weightOf(el, quantity);
      // At theta = 0 a phasor w = Fy + i Fx points atan2(Fx, Fy) clockwise from +Y.
      const a = Math.atan2(k * el[side].im, k * el[side].re);
      return a < -1e-9 ? a + 2 * Math.PI : Math.max(a, 0);
    };
    const elements = view.elements
      .filter((el) => big > 0 && amount(el, side) > big * EMPTY)
      .map((el) => ({ el, a: direction(el) }))
      .sort((p, q) => p.a - q.a)
      .map((p) => p.el);
    const locus = sum.locus;
    const closes = locus.shape === 'point' || (!projection && locus.shape === 'circle' && side === (locus.sense > 0 ? 'minus' : 'plus'));
    if (elements.length) chains.push({ side, elements, closes, flat: flatChain(elements.map(direction)) });
  }
  const plan: DiagramPlan = {
    view,
    quantity,
    mode: projection ? 'projection' : 'halves',
    chains,
    axis: projection ? view.mirror : null,
    locus: sum.locus,
    word: wordOf(sum.locus),
    reach: 0,
  };
  let reach = 0;
  const frame = emptyFrame();
  for (let i = 0; i < REACH_STEPS; i++) {
    diagramAt(plan, (360 * i) / REACH_STEPS, frame, false);
    for (const chain of frame.chains) for (const p of chain) reach = Math.max(reach, size(p.x, p.y));
    reach = Math.max(reach, size(frame.net.x, frame.net.y));
  }
  plan.reach = reach;
  return plan;
}

/** Directions (radians) all along one line, with at least one pointing back along it. */
function flatChain(directions: number[]): boolean {
  if (directions.length < 2) return false;
  const first = directions[0]!;
  let back = false;
  for (const a of directions) {
    if (Math.abs(Math.sin(a - first)) > COLLINEAR) return false;
    if (Math.cos(a - first) < 0) back = true;
  }
  return back;
}

const emptyFrame = (): DiagramFrame => ({ chains: [], net: { x: 0, y: 0 }, trail: [] });

const fit = (points: Vec2[], count: number): Vec2[] => {
  if (points.length > count) points.length = count;
  while (points.length < count) points.push({ x: 0, y: 0 });
  return points;
};

/** Scratch for one vector, never handed out. */
const step: Vec2 = { x: 0, y: 0 };

/**
 * The diagram at crank angle theta, degrees. Pass the frame the last call returned as out and its points are reused,
 * as the card redraws every frame. trail false skips the trail.
 */
export function diagramAt(plan: DiagramPlan, theta: number, out: DiagramFrame = emptyFrame(), trail = true): DiagramFrame {
  const { view, quantity } = plan;
  const double = plan.mode === 'projection' ? 2 : 1;
  if (out.chains.length > plan.chains.length) out.chains.length = plan.chains.length;
  while (out.chains.length < plan.chains.length) out.chains.push([]);
  let x = 0;
  let y = 0;
  plan.chains.forEach((chain, c) => {
    const points = fit(out.chains[c]!, chain.elements.length + 1);
    points[0]!.x = x;
    points[0]!.y = y;
    chain.elements.forEach((el, i) => {
      phasorAt(el.plus, el.minus, view.order, theta, chain.side, step);
      const k = weightOf(el, quantity) * double;
      x += step.x * k;
      y += step.y * k;
      points[i + 1]!.x = x;
      points[i + 1]!.y = y;
    });
  });
  if (plan.axis === null) {
    out.net.x = x;
    out.net.y = y;
  } else {
    // The shadow of the polygon's end on the cylinders' axis.
    const ux = Math.sin((plan.axis * Math.PI) / 180);
    const uy = Math.cos((plan.axis * Math.PI) / 180);
    const along = x * ux + y * uy;
    out.net.x = along * ux;
    out.net.y = along * uy;
  }
  if (trail) {
    const points = fit(out.trail, TRAIL + 1);
    for (let i = 0; i < TRAIL; i++) netAt(view, theta - 360 + (360 * i) / TRAIL, quantity, 'net', points[i]);
    points[TRAIL]!.x = out.net.x;
    points[TRAIL]!.y = out.net.y;
  } else {
    out.trail.length = 0;
  }
  return out;
}
