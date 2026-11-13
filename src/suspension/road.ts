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
// (ISO 8608, a later stage) is just another RoadProfile.

/** A road height function along the path, m. */
export interface RoadProfile {
  heightAt(x: number): number;
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
  private readonly flat: Int32Array;
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
    this.flat = new Int32Array(span + 1);
    this.dil = new Float64Array(SEGMENT_NODES + 1 + 2 * this.a);
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
    const { m, a, sq, raw, flat, dil } = this;
    const first = seg * SEGMENT_NODES - a - m;
    const span = raw.length;
    for (let i = 0; i < span; i++) raw[i] = this.profile.heightAt((first + i) * ROAD_STEP_M);
    // flat[i] counts changes of the raw profile before node i, so a window with no change is a flat road where the
    // circle simply rests on it.
    flat[0] = 0;
    flat[1] = 0;
    for (let i = 1; i < span; i++) flat[i + 1] = flat[i] + (raw[i] !== raw[i - 1] ? 1 : 0);
    const nd = dil.length;
    for (let i = 0; i < nd; i++) {
      const c = i + m;
      if (flat[c + m + 1] - flat[c - m + 1] === 0) {
        dil[i] = raw[c];
        continue;
      }
      let best = -Infinity;
      for (let j = -m; j <= m; j++) {
        const v = raw[c + j] + sq[j + m];
        if (v > best) best = v;
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
