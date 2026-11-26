// The corner seen from the front as a drawing, computed from its hardpoints (suspensions plan, the travel scene, step 3,
// and the glyphs of the table of all suspensions): the links as lines from the body to the knuckle, the wheel tilted to its camber,
// the lines of the links carried on to the instant centre, and the line from the contact patch through the instant
// centre, which meets the car's centre line at the roll centre. A left corner, so outboard is to the right. Returns SVG
// text and touches no DOM, so a test can read it.

import type { Axle, CornerSample } from '../../suspension/kinematics.ts';
import type { Vec3 } from '../../suspension/spec.ts';

export interface FrontViewInput {
  axle: Axle;
  pose: Float64Array;
  sample: CornerSample;
  rack: number;
  /** Tyre's free radius and section width, m. */
  radiusM: number;
  tyreWidthM: number;
  /** Roll centre heights the visitor has passed through, m, drawn as a trail on the centre line. */
  trail?: readonly number[];
}

export interface FrontViewOptions {
  /** Pixels across; the height follows the corner. With `height`, the drawing fits inside both. */
  width: number;
  height?: number;
  /** Show the instant-centre construction and the roll centre (the table's glyphs keep it too, thinner). */
  construction?: boolean;
  /** Classes for the colours: the page's CSS gives them (suspensions.css, .susp-fv-*). */
  className?: string;
  /** Names the drawing for a screen reader. */
  label: string;
}

/** Points of the drawing in metres: y across (0 on the centre line), z up from the road. */
type P = readonly [number, number];

const f = (v: number): string => (Math.round(v * 1000) / 1000).toString();

/** The lower and the upper element of a corner as two points each (body end, knuckle end), front view, posed. */
function elements(input: FrontViewInput): { links: Array<[P, P, string]>; lower: [P, P] | null; upper: [P, P] | null } {
  const { axle, pose, rack } = input;
  const link = axle.spec.linkage;
  const out = new Float64Array(3);
  const knuckle = (k: Vec3): P => {
    axle.knucklePoint(pose, k, out);
    return [out[1]!, out[2]!];
  };
  const body = (b: Vec3): P => [b[1], b[2]];
  const mid = (a: P, b: P): P => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const links: Array<[P, P, string]> = [];
  // A single pivot arm (rigidArm): the links that only hold it to its axis are not drawn, and its instant centre lies on
  // the axis, not where two element lines meet, so it gets no construction lines.
  const hidden = new Set(link.rigidArm?.hidden ?? []);
  const arms = link.wishbones.filter((w) => !hidden.has(w.id)).map((w) => ({ inner: mid(body(w.front), body(w.rear)), outer: knuckle(w.ball), z: w.ball[2] }));
  for (const a of arms) links.push([a.inner, a.outer, 'arm']);
  for (const r of link.rods.filter((r) => !hidden.has(r.id))) {
    const b: P = [r.body[1] + (r.steer ? rack : 0), r.body[2]];
    links.push([b, knuckle(r.knuckle), r.steer || r.id === 'toe-link' ? 'tie' : 'rod']);
  }
  let lower: [P, P] | null = null;
  let upper: [P, P] | null = null;
  const sorted = [...arms].sort((a, b) => a.z - b.z);
  if (sorted[0]) lower = [sorted[0].inner, sorted[0].outer];
  if (sorted[1]) upper = [sorted[1].inner, sorted[1].outer];
  if (link.rigidArm) lower = null;
  if (link.strut) {
    const shift = link.strut.topShift ?? [0, 0, 0];
    const top: P = [link.strut.top[1] + shift[1], link.strut.top[2] + shift[2]];
    const bottom = knuckle(link.strut.lower);
    links.push([top, bottom, 'strut']);
    // The strut's instant-centre line is square to the strut through its top mount.
    const dy = bottom[0] - top[0];
    const dz = bottom[1] - top[1];
    upper = [[top[0] - dz, top[1] + dy], top];
  }
  if (!arms.length) {
    // A five-link: each pair of links as one virtual arm, from the mean of their body ends to the mean of their knuckle
    // ends.
    const pair = (prefix: string): [P, P] | null => {
      const rods = link.rods.filter((r) => r.id.startsWith(prefix));
      if (!rods.length) return null;
      const b = rods.map((r) => body(r.body));
      const k = rods.map((r) => knuckle(r.knuckle));
      const mean = (ps: P[]): P => [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length];
      return [mean(b), mean(k)];
    };
    lower = pair('lower');
    upper = pair('upper');
  }
  return { links, lower, upper };
}

/** The SVG of a corner's front view. */
export function frontViewSvg(input: FrontViewInput, options: FrontViewOptions): string {
  const s = input.sample;
  const { links, lower, upper } = elements(input);
  const construction = options.construction ?? true;
  const R = input.radiusM;
  const halfW = input.tyreWidthM / 2;
  // The box: from a little inboard of the centre line to past the tyre, from below the road to above the highest point.
  const tops = links.flatMap(([a, b]) => [a[1], b[1]]);
  const zTop = Math.max(s.wheelZ + R, ...tops) + 0.06;
  const rcZ = s.rcHeight;
  const zBottom = Math.min(-0.06, rcZ - 0.05);
  const yRight = s.wheelY + halfW + 0.08;
  const yLeft = -0.12;
  const w = yRight - yLeft;
  const h = zTop - zBottom;
  const px = Math.round(options.height ? Math.min(options.width, (options.height * w) / h) : options.width);
  const height = Math.round((px * h) / w);
  const X = (y: number): number => ((y - yLeft) / w) * px;
  const Y = (z: number): number => ((zTop - z) / h) * height;
  const line = (a: P, b: P, cls: string): string => `<line class="${cls}" x1="${f(X(a[0]))}" y1="${f(Y(a[1]))}" x2="${f(X(b[0]))}" y2="${f(Y(b[1]))}"/>`;
  const dot = (p: P, r: number, cls: string): string => `<circle class="${cls}" cx="${f(X(p[0]))}" cy="${f(Y(p[1]))}" r="${r}"/>`;
  const parts: string[] = [];
  // Road and the car's centre line.
  parts.push(line([yLeft, 0], [yRight, 0], 'susp-fv-road'));
  parts.push(line([0, zBottom], [0, zTop], 'susp-fv-centre'));
  // The wheel: a rectangle of the tyre's section, tilted to the camber (negative: top leans in, to the left here).
  const g = s.camber;
  const c: P = [s.wheelY, s.wheelZ];
  const corner = (u: number, v: number): P => [c[0] + u * Math.cos(g) + v * Math.sin(g), c[1] - u * Math.sin(g) + v * Math.cos(g)];
  const quad = [corner(-halfW, -R), corner(halfW, -R), corner(halfW, R), corner(-halfW, R)];
  parts.push(`<polygon class="susp-fv-wheel" points="${quad.map((p) => `${f(X(p[0]))},${f(Y(p[1]))}`).join(' ')}"/>`);
  if (construction) {
    // Instant centre: the lines of the lower and upper element carried on to it, and the contact patch's line through it
    // to the centre line. A far instant centre (parallel lines) leaves the patch's line alone.
    const ic: P | null = Number.isFinite(s.icFrontY) && Number.isFinite(s.icFrontZ) ? [s.icFrontY, s.icFrontZ] : null;
    const clip = (from: P, to: P): P => {
      // Cut the segment where it leaves the box, so a far instant centre does not stretch the drawing.
      let t = 1;
      const dy = to[0] - from[0];
      const dz = to[1] - from[1];
      if (to[0] < yLeft && dy !== 0) t = Math.min(t, (yLeft - from[0]) / dy);
      if (to[1] > zTop && dz !== 0) t = Math.min(t, (zTop - from[1]) / dz);
      if (to[1] < zBottom && dz !== 0) t = Math.min(t, (zBottom - from[1]) / dz);
      return [from[0] + dy * t, from[1] + dz * t];
    };
    if (ic) {
      for (const el of [lower, upper]) if (el) parts.push(line(el[1], clip(el[1], ic), 'susp-fv-ic-line'));
      if (ic[0] > yLeft && ic[1] < zTop && ic[1] > zBottom) parts.push(dot(ic, 3.5, 'susp-fv-ic'));
    }
    const contact: P = [s.contactY, s.contactZ];
    parts.push(line(contact, [0, rcZ], 'susp-fv-rc-line'));
    for (const z of input.trail ?? []) parts.push(dot([0, z], 1.6, 'susp-fv-trail'));
    parts.push(dot([0, rcZ], 4.5, 'susp-fv-rc'));
  }
  for (const [a, b, kind] of links) parts.push(line(a, b, `susp-fv-link susp-fv-${kind}`));
  for (const [a, b] of links) parts.push(dot(a, 2.4, 'susp-fv-joint'), dot(b, 2.4, 'susp-fv-joint'));
  return `<svg class="susp-fv ${options.className ?? ''}" viewBox="0 0 ${px} ${height}" width="${px}" height="${height}" role="img" aria-label="${options.label}">${parts.join('')}</svg>`;
}
