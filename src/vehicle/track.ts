// A circuit as straights and constant-radius arcs, sampled every metre. Two straights ("closers") are stretched or
// shortened so the lap closes exactly: their lengths enter the end point linearly, so a 2x2 solve finds them.
// Plan frame: x east, y north, heading counter-clockwise from +x, left turns positive. No DOM and no text: pieces
// carry sector ids, and pages show them through SECTOR_NAMES (src/data/vehicle-names.ts). The whole-car section
// reuses it.

export type TrackPiece =
  | {
      kind: 'straight';
      length: number;
      /** Sector id; consecutive pieces with the same id make one sector. */
      name?: string;
      /** One of the two straights whose length is solved so the lap closes. */
      closer?: 'a' | 'b';
      /** A crest on this straight: vertical radius, metres, centred `at` metres in, over `length` metres. */
      crest?: { at: number; length: number; radius: number };
    }
  | {
      kind: 'arc';
      radius: number;
      /** Degrees, positive to the left. */
      angle: number;
      /** Sector id, as on a straight. */
      name?: string;
    };

export interface TrackDef {
  id: string;
  /** An id too; TRACK_NAMES (src/data/vehicle-names.ts) has the circuit's name. */
  name: string;
  pieces: TrackPiece[];
}

export interface Sector {
  /** The pieces' sector id. */
  id: string;
  /**
   * @deprecated Until stage O2a: the display name when buildTrack got names, else the id. Pages translate `id` with
   * SECTOR_NAMES themselves.
   */
  name: string;
  s0: number;
  s1: number;
}

export interface Track {
  def: TrackDef;
  /** Lap length, metres. */
  length: number;
  /** Sample spacing, metres: the length divided evenly. */
  ds: number;
  /** Samples per lap. Sample i sits at s = i·ds; sample n would be sample 0 again. */
  n: number;
  x: Float32Array;
  y: Float32Array;
  heading: Float32Array;
  /** Plan curvature, 1/m, left positive. */
  kappa: Float32Array;
  /** Vertical curvature, 1/m: negative over a crest, where the car goes light. */
  kappaV: Float32Array;
  /** Index into `sectors` per sample, or -1 between named pieces. */
  sector: Int16Array;
  sectors: Sector[];
  /** Solved lengths of the closers, metres. */
  closers: { a: number; b: number };
}

const DEG = Math.PI / 180;

/** End point and heading of a piece started at heading h, from the origin. */
function pieceDelta(p: TrackPiece, h: number, length: number): { dx: number; dy: number; dh: number } {
  if (p.kind === 'straight') return { dx: length * Math.cos(h), dy: length * Math.sin(h), dh: 0 };
  const a = p.angle * DEG;
  const R = p.radius;
  // Chord of the arc, turned half the angle.
  const chord = 2 * R * Math.sin(Math.abs(a) / 2);
  const mid = h + a / 2;
  return { dx: chord * Math.cos(mid), dy: chord * Math.sin(mid), dh: a };
}

/** Lengths of the two closers that bring the lap back to its start. */
function solveClosers(def: TrackDef): { a: number; b: number } {
  const ia = def.pieces.findIndex((p) => p.kind === 'straight' && p.closer === 'a');
  const ib = def.pieces.findIndex((p) => p.kind === 'straight' && p.closer === 'b');
  if (ia < 0 || ib < 0) throw new Error(`Track ${def.id} needs two closers`);
  let h = 0;
  let fx = 0;
  let fy = 0;
  let ha = 0;
  let hb = 0;
  for (let i = 0; i < def.pieces.length; i++) {
    const p = def.pieces[i]!;
    if (i === ia) ha = h;
    if (i === ib) hb = h;
    const d = pieceDelta(p, h, i === ia || i === ib ? 0 : p.kind === 'straight' ? p.length : 0);
    fx += d.dx;
    fy += d.dy;
    h += d.dh;
  }
  // a·(cos ha, sin ha) + b·(cos hb, sin hb) = -(fx, fy)
  const det = Math.cos(ha) * Math.sin(hb) - Math.sin(ha) * Math.cos(hb);
  if (Math.abs(det) < 1e-6) throw new Error(`Closers of ${def.id} are parallel`);
  const a = (-fx * Math.sin(hb) + fy * Math.cos(hb)) / det;
  const b = (-Math.cos(ha) * fy + Math.sin(ha) * fx) / det;
  return { a, b };
}

/** `names` maps sector ids to display names, for the oil page until stage O2a translates ids itself. */
export function buildTrack(def: TrackDef, ds = 1, names?: Readonly<Record<string, string>>): Track {
  const turn = def.pieces.reduce((sum, p) => sum + (p.kind === 'arc' ? p.angle : 0), 0);
  if (Math.abs(turn - 360) > 1e-9) throw new Error(`Track ${def.id} turns ${turn}°, not 360°`);
  const closers = solveClosers(def);
  const lengths = def.pieces.map((p) => (p.kind === 'arc' ? (p.radius * Math.abs(p.angle) * DEG) : p.closer === 'a' ? closers.a : p.closer === 'b' ? closers.b : p.length));
  const total = lengths.reduce((a, b) => a + b, 0);
  const n = Math.round(total / ds);
  const step = total / n;
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const heading = new Float32Array(n);
  const kappa = new Float32Array(n);
  const kappaV = new Float32Array(n);
  const sector = new Int16Array(n).fill(-1);
  const sectors: Sector[] = [];
  // Start of each piece: position, heading, distance along the lap.
  const starts: Array<{ s: number; x: number; y: number; h: number }> = [];
  let sx = 0;
  let sy = 0;
  let sh = 0;
  let ss = 0;
  def.pieces.forEach((p, i) => {
    starts.push({ s: ss, x: sx, y: sy, h: sh });
    const d = pieceDelta(p, sh, lengths[i]!);
    sx += d.dx;
    sy += d.dy;
    sh += d.dh;
    if (p.name) {
      // Pieces of one named corner (a chicane, a slalom) make one sector.
      const last = sectors[sectors.length - 1];
      if (last && last.id === p.name && Math.abs(last.s1 - ss) < 1e-9) last.s1 = ss + lengths[i]!;
      else sectors.push({ id: p.name, name: names?.[p.name] ?? p.name, s0: ss, s1: ss + lengths[i]! });
    }
    ss += lengths[i]!;
  });
  let piece = 0;
  for (let i = 0; i < n; i++) {
    const s = i * step;
    while (piece < def.pieces.length - 1 && s >= starts[piece + 1]!.s) piece++;
    const p = def.pieces[piece]!;
    const st = starts[piece]!;
    const u = s - st.s;
    if (p.kind === 'straight') {
      x[i] = st.x + u * Math.cos(st.h);
      y[i] = st.y + u * Math.sin(st.h);
      heading[i] = st.h;
      kappa[i] = 0;
      if (p.crest && Math.abs(u - p.crest.at) <= p.crest.length / 2) kappaV[i] = -1 / p.crest.radius;
    } else {
      const sign = Math.sign(p.angle);
      const k = sign / p.radius;
      const h = st.h + k * u;
      // Centre of the arc lies to the left of a left turn.
      const cx = st.x - sign * p.radius * Math.sin(st.h);
      const cy = st.y + sign * p.radius * Math.cos(st.h);
      x[i] = cx + sign * p.radius * Math.sin(h);
      y[i] = cy - sign * p.radius * Math.cos(h);
      heading[i] = h;
      kappa[i] = k;
    }
    if (p.name) sector[i] = sectors.findIndex((sec) => sec.id === p.name && s >= sec.s0 - 1e-9 && s < sec.s1 + 1e-9);
  }
  return { def, length: total, ds: step, n, x, y, heading, kappa, kappaV, sector, sectors, closers };
}

/** Sector ids of the test circuit, in lap order. */
export const TEST_SECTORS = ['start-finish', 'hairpin', 'chicane', 'slalom', 'fast-sweeper', 'back-straight', 'carousel', 'right-hander'] as const;
export type TestSectorId = (typeof TEST_SECTORS)[number];

/**
 * The test circuit: one of each event that starves a wet sump. A long straight into a hairpin (hard braking), a
 * chicane, a slalom that reverses the load near the pan's slosh frequency (about 0.75 Hz on street tyres), a fast
 * sweeper, a crest that unloads the car, a 180° carousel (about eight seconds of steady cornering on street tyres, six
 * on slicks) and a right-hander, because wet pans are not symmetric.
 */
export const TEST_CIRCUIT: TrackDef = {
  id: 'test',
  name: 'test',
  pieces: [
    { kind: 'straight', length: 560, name: 'start-finish', closer: 'a' },
    { kind: 'arc', radius: 20, angle: 180, name: 'hairpin' },
    { kind: 'straight', length: 300 },
    { kind: 'arc', radius: 50, angle: -45, name: 'chicane' },
    { kind: 'straight', length: 25, name: 'chicane' },
    { kind: 'arc', radius: 50, angle: 45, name: 'chicane' },
    { kind: 'straight', length: 110 },
    { kind: 'arc', radius: 25, angle: 12, name: 'slalom' },
    { kind: 'arc', radius: 25, angle: -24, name: 'slalom' },
    { kind: 'arc', radius: 25, angle: 24, name: 'slalom' },
    { kind: 'arc', radius: 25, angle: -24, name: 'slalom' },
    { kind: 'arc', radius: 25, angle: 24, name: 'slalom' },
    { kind: 'arc', radius: 25, angle: -12, name: 'slalom' },
    { kind: 'straight', length: 60 },
    { kind: 'arc', radius: 120, angle: 90, name: 'fast-sweeper' },
    { kind: 'straight', length: 250, name: 'back-straight', closer: 'b', crest: { at: 125, length: 60, radius: 700 } },
    { kind: 'arc', radius: 60, angle: 180, name: 'carousel' },
    { kind: 'straight', length: 200 },
    { kind: 'arc', radius: 80, angle: -90, name: 'right-hander' },
  ],
};
