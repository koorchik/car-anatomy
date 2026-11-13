// The one Drive of the site (AudioHost in section.ts). Sound starts after the visitor's first gesture, as it always
// has; the volume, the mute and where to listen from move here from the engine pages later.

import { Drive, type DriveSnapshot } from '../audio/drive.ts';
import type { Engine } from '../engine/kinematics.ts';
import type { AudioHost } from './section.ts';

export class ShellAudio implements AudioHost {
  current: Drive | null = null;
  snapshot: DriveSnapshot | null = null;

  drive(engine: Engine): Drive {
    this.current ??= new Drive(engine);
    return this.current;
  }

  /** Once a frame, before the section's frame. A page held still reads the engine without moving it on. */
  tick(dt: number, held: boolean): void {
    const drive = this.current;
    if (drive) this.snapshot = held ? drive.snapshot() : drive.tick(dt);
  }
}
