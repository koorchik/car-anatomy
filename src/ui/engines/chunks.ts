// The engines section's lazy chunks: each feature's code loads the first time it is used, after its English. Shared by
// the loader (load.ts), which starts the chunk an address needs alongside the section, and by the section, which finds
// it already here then.

import { withDictionaries } from '../../i18n/dictionaries.ts';

/** Code that loads once. `value` is there, synchronously, once the load has finished. */
export class Chunk<T> {
  value: T | null = null;
  private pending: Promise<T> | null = null;
  private readonly fetch: () => Promise<T>;

  constructor(fetch: () => Promise<T>) {
    this.fetch = fetch;
  }

  load(): Promise<T> {
    this.pending ??= this.fetch().then(
      (code) => (this.value = code),
      (error: unknown) => {
        // A failed download may work on the next try.
        this.pending = null;
        throw error;
      },
    );
    return this.pending;
  }
}

/** The designer (`#/designer`): its page, model, diagnoses and presets. Its controls name the oil and the systems too. */
export const DESIGNER = new Chunk(() => withDictionaries(['engines', 'designer', 'presets', 'systems', 'lubrication'], () => import('./designer-host.ts')));
/** The dyno: its panel, charts and rig. It runs the designer's model, presets and all, for a design's torque map. */
export const DYNO = new Chunk(() => withDictionaries(['engines', 'dyno', 'presets'], () => import('../dyno/dyno-panel.ts')));
/** The force arrows and their card. */
export const FORCES = new Chunk(() => withDictionaries(['engines'], () => import('../balance-panel.ts')));
/** The labels of what variable valve gear is doing. */
export const VALVES = new Chunk(() => withDictionaries(['engines'], () => import('../valve-readout.ts')));
/** The oil on track (`#/sump`): its page, lap and gauges, with the designer's model for an engine of one's own. */
export const SUMP = new Chunk(() => withDictionaries(['engines', 'presets', 'systems', 'lubrication'], () => import('../sump/sump-page.ts')));
