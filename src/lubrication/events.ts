// The worst moments of a lap for the oil: stretches where the gallery fell below what the bearings need, ranked by
// how much they fell short, with the corner they happened in and what the car was doing.

import { newLapSample, sampleLap, type LapTrace } from '../vehicle/lap.ts';
import { G } from '../vehicle/vehicle.ts';
import type { LubeRun } from './run.ts';

export type Phase = 'braking' | 'cornering' | 'accelerating' | 'crest';

export interface OilMoment {
  /** Lap time of the start and end, s. */
  start: number;
  end: number;
  /** Track sector id, or '' between named corners. Pages show it through SECTOR_NAMES (src/data/vehicle-names.ts). */
  sector: string;
  phase: Phase;
  /** Shortfall integrated over the stretch, bar·s. */
  shortfall: number;
  /** Lowest pressure and the need at that moment, bar. */
  lowest: number;
  need: number;
  /** Share of the bearings' life used in it. */
  wear: number;
}

/** Stretches closer than this merge into one moment, s. */
const MERGE_S = 0.3;

export function worstMoments(run: LubeRun, trace: LapTrace, limit = 3): OilMoment[] {
  const moments: OilMoment[] = [];
  let open: OilMoment | null = null;
  let gap = 0;
  for (let i = 0; i < run.count; i++) {
    const p = run.pressure[i]!;
    const need = run.need[i]!;
    const t = i * run.dt;
    if (p < need) {
      if (!open) {
        open = { start: t, end: t, sector: '', phase: 'cornering', shortfall: 0, lowest: p, need, wear: 0 };
        moments.push(open);
      }
      open.end = t;
      open.shortfall += (need - p) * run.dt;
      open.wear += run.wearRate[i]! * run.dt;
      if (p < open.lowest) {
        open.lowest = p;
        open.need = need;
      }
      gap = 0;
    } else if (open) {
      gap += run.dt;
      if (gap > MERGE_S) open = null;
    }
  }
  const sample = newLapSample();
  for (const m of moments) {
    // What the car was doing as the dip began: the cause comes before the effect.
    sampleLap(trace, Math.max(0, m.start - 0.3), sample);
    const id = sample.sector >= 0 ? trace.track.sectors[sample.sector]!.id : '';
    sampleLap(trace, m.start, sample);
    m.sector = id || (sample.sector >= 0 ? trace.track.sectors[sample.sector]!.id : '');
    m.phase = sample.avF < -0.15 * G ? 'crest' : sample.axF < -0.3 * G ? 'braking' : Math.abs(sample.ayF) > 0.3 * G ? 'cornering' : 'accelerating';
  }
  return moments.sort((a, b) => b.shortfall - a.shortfall).slice(0, limit);
}
