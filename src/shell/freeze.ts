// A still page for snapshots (`window.__engine.freeze`). Shots before and after a move of the code must be taken the
// same way, and on a software renderer anything that runs on the wall clock would differ between two runs.

export interface FreezeOptions {
  /** Crank angle shown, degrees, whatever the speed mode or the sound would turn it to. */
  theta: number;
  /** Seconds of flow the moving dashes of the systems layers stand at. */
  time: number;
  /** Render resolution as a share of the device's, held while frozen. */
  quality: number;
  /** Whether the camera keeps its slow orbit. */
  orbit: boolean;
}

/** What `scripts/snapshots.ts` freezes every page at. */
export const SNAPSHOT_FREEZE: FreezeOptions = { theta: 90, time: 0, quality: 1, orbit: false };
