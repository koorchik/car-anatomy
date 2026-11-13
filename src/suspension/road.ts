// The road under a wheel: a profile, the tyre's envelope of it, and a buffer of ready segments so a physics step only
// interpolates.
//
// Enveloping: the wheel centre cannot sink into a gap narrower than the tyre, and a sharp edge is felt over the length
// of the contact patch. So the height the tyre feels at x is the lowest position of a rigid circle of the free radius
// r resting on the profile (a dilation: max over |s| ≤ r of y(x+s) + √(r² − s²), minus r), averaged over the patch
// length ℓ (0.1–0.2 m with the load). A pothole of 0.2 m × 60 mm becomes a smooth dip of about 5 mm (the bare circle
// sinks 15 mm, the patch average spreads it), a kerb edge a ramp as long as the patch.
//
// Buffer: the enveloped road is computed in 20 m segments on a 5 mm grid (Float32Array) ahead of the wheel and kept
// in a small ring. Each segment evaluates the profile itself with a margin, so joins are exact. A random road
// (ISO 8608, Iso8608Road below) is just another RoadProfile; it fills a segment by a recurrence instead of 400 cosines
// per node, which would cost ten times the segment budget.

/** A road height function along the path, m. */
export interface RoadProfile {
  heightAt(x: number): number;
  /**
   * Optional fast path for the buffer: out[i] = heightAt(x0 + i·dx) for i < count, to within 1e-9 m. A profile that
   * is expensive per point (a sum of cosines) fills a whole segment at once.
   */
  fill?(x0: number, dx: number, count: number, out: Float64Array): void;
}

export type RoadEvent =
  /** Smooth bump: half a cosine wave, `heightM` high over `lengthM` (also a speed hump). */
  | { kind: 'bump'; atM: number; lengthM: number; heightM: number }
  /** Sharp-edged pothole `depthM` deep and `lengthM` long. */
  | { kind: 'pothole'; atM: number; lengthM: number; depthM: number }
  /** A kerb edge: the road steps by `heightM` (negative steps down) and stays there. */
  | { kind: 'step'; atM: number; heightM: number };

/** A flat road with events on it. Overlapping events add up. */
export class EventRoad implements RoadProfile {
  readonly events: readonly RoadEvent[];
  constructor(events: readonly RoadEvent[]) {
    this.events = events;
  }

  heightAt(x: number): number {
    let y = 0;
    for (const e of this.events) {
      if (e.kind === 'bump') {
        const u = (x - e.atM) / e.lengthM;
        if (u > 0 && u < 1) y += (e.heightM * (1 - Math.cos(2 * Math.PI * u))) / 2;
      } else if (e.kind === 'pothole') {
        if (x >= e.atM && x < e.atM + e.lengthM) y -= e.depthM;
      } else if (x >= e.atM) {
        y += e.heightM;
      }
    }
    return y;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// ISO 8608 random road. Displacement PSD G_d(n) = G_d(n0)·(n/n0)^−2, n0 = 0.1 cycle/m, over 0.011–2.83 cycle/m; the
// class values are geometric means in the n convention (16, 64, 256, 1024 · 10⁻⁶ m³; the tables quoting 1, 4, 16 … are
// for Ω0 = 1 rad/m, docs/suspension-research/metrics_scenarios.md). The profile is a sum of 400 cosines, one per band
// of a logarithmic grid, with amplitude √(2·G_d(n_i)·Δn_i) at the band's geometric centre and a seeded random phase.
// With w = 2 the geometric centre makes Σ G_d(n_i)·Δn_i equal ∫G_d dn = G_d(n0)·n0²·(1/n1 − 1/n2) exactly, so the
// height variance of the road is the standard's, not an approximation of it.
//
// Two wheel tracks. The left and right wheels of a car run on two profiles of the same spectrum that agree at long
// waves and not at short ones; their difference is the roll the road gives the body. Bogsjö (2007, "Coherence of road
// roughness in left and right wheel-path", Paper E of his Lund thesis) measured 520 km of roads two metres apart and
// found the coherence |G_LR|/G = e^(−ρ·t_w·n) with a real cross-spectrum, much the same on a motorway and a gravel
// road, and closer to the measurements than the isotropic model. The right track keeps each band's amplitude and moves
// its phase by acos(γ(n_i)), alternately up and down so the imaginary part cancels between neighbouring bands: each
// band then carries exactly the co-spectrum γ·G, so the heave G·(1 + γ)/2 and the roll G·(1 − γ)/2 of the pair are
// the model's, not a random draw round it, as the height variance is.

export type RoadClass = 'A' | 'B' | 'C' | 'D';

/** G_d(n0) of each class, geometric mean of the class, m³ (Ribeiro & Cunha 2026, table of ISO 8608 classes). */
export const ISO_8608_CLASSES: Record<RoadClass, number> = { A: 16e-6, B: 64e-6, C: 256e-6, D: 1024e-6 };
/** Reference spatial frequency, cycle/m. */
export const ISO_8608_N0 = 0.1;
/**
 * Spatial frequency band of the generated road, cycle/m (91 m to 0.35 m wavelengths): the range over which ISO 8608
 * fits its straight line to a measured spectrum, as Bogsjö (2007, Paper A) quotes it; the standard itself not read.
 */
export const ISO_8608_BAND: readonly [number, number] = [0.011, 2.83];
/**
 * Bogsjö's coherence parameter ρ: fitted 3.1–5.5 on the six roads his Paper E plots (figure 3); 3.6 is their median.
 * A larger ρ makes the two tracks part sooner, and the road rolls the car more.
 */
export const TRACK_COHERENCE_RHO = 3.6;

/** Coherence |G_LR|/G of two wheel tracks `trackM` apart at spatial frequency n, cycle/m (Bogsjö 2007). */
export const trackCoherence = (n: number, trackM: number, rho: number = TRACK_COHERENCE_RHO): number =>
  Math.exp(-rho * trackM * n);
/** Cosines in the sum (suspensions plan, the road). */
export const ISO_8608_WAVES = 400;

/** One-sided displacement PSD of a road of `gd0` = G_d(n0) at spatial frequency n, m³. */
export const roadPsd = (gd0: number, n: number): number => gd0 * (ISO_8608_N0 / n) ** 2;

/** Height variance of the band [n1, n2] of a road of `gd0`, m²: ∫G_d dn. */
export const roadVariance = (gd0: number, band: readonly [number, number] = ISO_8608_BAND): number =>
  gd0 * ISO_8608_N0 * ISO_8608_N0 * (1 / band[0] - 1 / band[1]);

/** A fixed sequence of numbers in [0, 1) for a seed (mulberry32), so a seed always gives the same road. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Iso8608Options {
  /** A class, or G_d(n0) itself in m³. */
  roadClass: RoadClass | number;
  seed: number;
  waves?: number;
  band?: readonly [number, number];
  /**
   * Which wheel track. The left one is the road of the seed whatever the track width; the right one, `trackM` to its
   * side, is its partner with the coherence of trackCoherence (see the head of the section).
   */
  side?: 'left' | 'right';
  /** Distance between the two wheel tracks, m (the car's track width); needed for the right track. */
  trackM?: number;
}

/** A random road of an ISO 8608 class. The same class, seed and side give the same road. */
export class Iso8608Road implements RoadProfile {
  /** G_d(n0), m³. */
  readonly gd0: number;
  readonly seed: number;
  readonly band: readonly [number, number];
  readonly side: 'left' | 'right';
  /** Distance to the other track, m (0 when no partner was asked for). */
  readonly trackM: number;
  /** Per cosine: spatial frequency (cycle/m), band width (cycle/m), amplitude (m), wavenumber 2πn (rad/m), phase. */
  readonly n: Float64Array;
  readonly dn: Float64Array;
  readonly amp: Float64Array;
  readonly k: Float64Array;
  readonly phase: Float64Array;

  constructor(o: Iso8608Options) {
    this.gd0 = typeof o.roadClass === 'number' ? o.roadClass : ISO_8608_CLASSES[o.roadClass];
    if (!(this.gd0 >= 0)) throw new Error(`G_d(n0) must not be negative: ${this.gd0}`);
    this.seed = o.seed;
    this.side = o.side ?? 'left';
    this.trackM = o.trackM ?? 0;
    if (!(Number.isFinite(this.trackM) && this.trackM >= 0)) throw new Error(`Track width must be a distance: ${o.trackM}`);
    if (this.side === 'right' && !(this.trackM > 0)) throw new Error('The right wheel track needs the track width');
    const band = o.band ?? ISO_8608_BAND;
    this.band = band;
    const waves = o.waves ?? ISO_8608_WAVES;
    // A multiple of four lets fill() run four recurrences side by side; a zero amplitude pads the rest.
    const count = Math.ceil(waves / 4) * 4;
    this.n = new Float64Array(count);
    this.dn = new Float64Array(count);
    this.amp = new Float64Array(count);
    this.k = new Float64Array(count);
    this.phase = new Float64Array(count);
    const random = seededRandom(o.seed);
    const ratio = band[1] / band[0];
    for (let i = 0; i < waves; i++) {
      const lo = band[0] * ratio ** (i / waves);
      const hi = band[0] * ratio ** ((i + 1) / waves);
      const n = Math.sqrt(lo * hi);
      this.n[i] = n;
      this.dn[i] = hi - lo;
      this.amp[i] = Math.sqrt(2 * roadPsd(this.gd0, n) * (hi - lo));
      this.k[i] = 2 * Math.PI * n;
      // The right track draws the same phases, so it stays the left one's partner for any seed.
      const shift = this.side === 'right' ? (i % 2 === 0 ? 1 : -1) * Math.acos(trackCoherence(n, this.trackM)) : 0;
      this.phase[i] = 2 * Math.PI * random() + shift;
    }
  }

  /** Direct sum of the cosines: the reference fill() is tested against, and a slow path for one-off reads. */
  heightAt(x: number): number {
    const { amp, k, phase } = this;
    let y = 0;
    for (let i = 0; i < amp.length; i++) y += amp[i] * Math.cos(k[i] * x + phase[i]);
    return y;
  }

  /**
   * The same sum on a uniform grid by the recurrence cos((j+1)θ + φ) = 2·cosθ·cos(jθ + φ) − cos((j−1)θ + φ), four
   * cosines at a time so their chains overlap. Each fill starts from exact cosines, so the error does not build up
   * along the road (below 1e-11 m over a segment).
   */
  fill(x0: number, dx: number, count: number, out: Float64Array): void {
    const { amp, k, phase } = this;
    for (let j = 0; j < count; j++) out[j] = 0;
    for (let i = 0; i < amp.length; i += 4) {
      const c0 = 2 * Math.cos(k[i] * dx);
      const c1 = 2 * Math.cos(k[i + 1] * dx);
      const c2 = 2 * Math.cos(k[i + 2] * dx);
      const c3 = 2 * Math.cos(k[i + 3] * dx);
      let p0 = amp[i] * Math.cos(k[i] * (x0 - dx) + phase[i]);
      let p1 = amp[i + 1] * Math.cos(k[i + 1] * (x0 - dx) + phase[i + 1]);
      let p2 = amp[i + 2] * Math.cos(k[i + 2] * (x0 - dx) + phase[i + 2]);
      let p3 = amp[i + 3] * Math.cos(k[i + 3] * (x0 - dx) + phase[i + 3]);
      let y0 = amp[i] * Math.cos(k[i] * x0 + phase[i]);
      let y1 = amp[i + 1] * Math.cos(k[i + 1] * x0 + phase[i + 1]);
      let y2 = amp[i + 2] * Math.cos(k[i + 2] * x0 + phase[i + 2]);
      let y3 = amp[i + 3] * Math.cos(k[i + 3] * x0 + phase[i + 3]);
      for (let j = 0; j < count; j++) {
        out[j] += y0 + y1 + y2 + y3;
        let t = c0 * y0 - p0;
        p0 = y0;
        y0 = t;
        t = c1 * y1 - p1;
        p1 = y1;
        y1 = t;
        t = c2 * y2 - p2;
        p2 = y2;
        y2 = t;
        t = c3 * y3 - p3;
        p3 = y3;
        y3 = t;
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------

/** Grid step of the buffer, m. */
export const ROAD_STEP_M = 0.005;
/** Nodes per segment (20 m); a segment holds one more so it closes on the next one's first node. */
export const SEGMENT_NODES = 4000;
export const SEGMENT_M = SEGMENT_NODES * ROAD_STEP_M;

/** Half-widths of the two windows on the grid: the rigid circle and the patch average. */
function windows(radiusM: number, patchM: number): { m: number; a: number; sq: Float64Array } {
  const m = Math.floor(radiusM / ROAD_STEP_M);
  const sq = new Float64Array(2 * m + 1);
  for (let j = -m; j <= m; j++) {
    const s = j * ROAD_STEP_M;
    sq[j + m] = Math.sqrt(Math.max(0, radiusM * radiusM - s * s)) - radiusM;
  }
  return { m, a: Math.max(0, Math.round(patchM / (2 * ROAD_STEP_M))), sq };
}

/**
 * Enveloped height at grid node i (x = i·5 mm), computed directly from the profile. The reference the buffer is tested
 * against, and a slow path for one-off reads.
 */
export function envelopeAtNode(profile: RoadProfile, i: number, radiusM: number, patchM: number): number {
  const { m, a, sq } = windows(radiusM, patchM);
  let sum = 0;
  for (let k = -a; k <= a; k++) {
    let best = -Infinity;
    for (let j = -m; j <= m; j++) {
      const v = profile.heightAt((i + k + j) * ROAD_STEP_M) + sq[j + m];
      if (v > best) best = v;
    }
    sum += best;
  }
  return sum / (2 * a + 1);
}

interface Segment {
  index: number;
  data: Float32Array;
}

/** Enveloped road for one wheel radius and patch length, segment by segment. */
export class RoadBuffer {
  readonly profile: RoadProfile;
  readonly radiusM: number;
  readonly patchM: number;
  private readonly m: number;
  private readonly a: number;
  private readonly sq: Float64Array;
  private readonly slots: Segment[];
  private readonly raw: Float64Array;
  /** Sliding-window maximum of the raw profile over the circle's width, and the deque of indices that finds it. */
  private readonly top: Float64Array;
  private readonly deque: Int32Array;
  private readonly dil: Float64Array;
  /** Segments computed so far (for tests and the frame budget). */
  built = 0;

  constructor(profile: RoadProfile, radiusM: number, patchM: number, slots = 4) {
    this.profile = profile;
    this.radiusM = radiusM;
    this.patchM = patchM;
    const w = windows(radiusM, patchM);
    this.m = w.m;
    this.a = w.a;
    this.sq = w.sq;
    this.slots = Array.from({ length: slots }, () => ({
      index: Number.NaN,
      data: new Float32Array(SEGMENT_NODES + 1),
    }));
    const span = SEGMENT_NODES + 1 + 2 * (this.a + this.m);
    this.raw = new Float64Array(span);
    this.dil = new Float64Array(SEGMENT_NODES + 1 + 2 * this.a);
    this.top = new Float64Array(this.dil.length);
    this.deque = new Int32Array(span);
  }

  private slotOf(seg: number): Segment {
    const n = this.slots.length;
    return this.slots[((seg % n) + n) % n];
  }

  /** Whether segment `seg` is ready. */
  has(seg: number): boolean {
    return this.slotOf(seg).index === seg;
  }

  /** Computes segment `seg` into its slot (replacing whatever was there). */
  build(seg: number): void {
    const slot = this.slotOf(seg);
    const { m, a, sq, raw, top, deque, dil } = this;
    const first = seg * SEGMENT_NODES - a - m;
    const span = raw.length;
    if (this.profile.fill) this.profile.fill(first * ROAD_STEP_M, ROAD_STEP_M, span, raw);
    else for (let i = 0; i < span; i++) raw[i] = this.profile.heightAt((first + i) * ROAD_STEP_M);
    // top[i]: the highest raw point under the circle centred on node i + m (a monotonic deque, linear time).
    let head = 0;
    let tail = 0;
    for (let i = 0; i < span; i++) {
      while (tail > head && raw[deque[tail - 1]] <= raw[i]) tail--;
      deque[tail++] = i;
      if (i < 2 * m) continue;
      if (deque[head] < i - 2 * m) head++;
      top[i - 2 * m] = raw[deque[head]];
    }
    // The circle rests where y(x + s) + √(r² − s²) − r is highest. Searching outward from s = 0, the bound top + sq(s)
    // only falls, so the search stops as soon as it cannot beat the best point found: on a flat road at once, on a
    // random road after a fraction of the window. The result is the full search's, bit for bit.
    const nd = dil.length;
    for (let i = 0; i < nd; i++) {
      const c = i + m;
      const highest = top[i];
      let best = raw[c];
      for (let j = 1; j <= m; j++) {
        const drop = sq[j + m];
        if (highest + drop <= best) break;
        const up = raw[c + j] + drop;
        const down = raw[c - j] + drop;
        if (up > best) best = up;
        if (down > best) best = down;
      }
      dil[i] = best;
    }
    const out = slot.data;
    const width = 2 * a + 1;
    let sum = 0;
    for (let k = 0; k < width; k++) sum += dil[k];
    out[0] = sum / width;
    for (let i = 1; i <= SEGMENT_NODES; i++) {
      sum += dil[i + 2 * a] - dil[i - 1];
      out[i] = sum / width;
    }
    slot.index = seg;
    this.built++;
  }

  /**
   * Makes sure the segment under `x` and the next one are ready, building at most one per call so a frame never pays
   * for two. Returns true when both are ready.
   */
  prepare(x: number): boolean {
    const seg = Math.floor(x / SEGMENT_M);
    if (!this.has(seg)) {
      this.build(seg);
      return this.has(seg + 1);
    }
    if (!this.has(seg + 1)) {
      this.build(seg + 1);
    }
    return true;
  }

  /** Enveloped height at x, m: linear between 5 mm nodes. Builds the segment on the spot if nobody prepared it. */
  heightAt(x: number): number {
    const u = x / ROAD_STEP_M;
    const node = Math.floor(u);
    const seg = Math.floor(node / SEGMENT_NODES);
    const slot = this.slotOf(seg);
    if (slot.index !== seg) this.build(seg);
    const i = node - seg * SEGMENT_NODES;
    const d = slot.data;
    const f = u - node;
    return d[i] + (d[i + 1] - d[i]) * f;
  }

  /** Slope of the enveloped road at x (of the 5 mm interval it falls in). */
  slopeAt(x: number): number {
    const u = x / ROAD_STEP_M;
    const node = Math.floor(u);
    const seg = Math.floor(node / SEGMENT_NODES);
    const slot = this.slotOf(seg);
    if (slot.index !== seg) this.build(seg);
    const i = node - seg * SEGMENT_NODES;
    return (slot.data[i + 1] - slot.data[i]) / ROAD_STEP_M;
  }
}
