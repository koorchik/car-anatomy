// The one Drive of the site (AudioHost in section.ts). Sound starts after the visitor's first gesture, as it always
// has; the volume, the mute and where to listen from move here from the engine pages later. A change of section hands
// the next one the Drive with no load and the engine off (the plan of the whole car, sound: one Drive).

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

  /**
   * Between two sections, after the one left has let go: the load comes off, the throttle closes, the crank is free and
   * the engine stops, so a new section starts from a quiet engine whatever the last one left on it.
   */
  release(): void {
    const drive = this.current;
    if (!drive) return;
    drive.setLoad(null);
    drive.setPedal(0);
    drive.lock(null);
    drive.stop();
  }

  /** Once a frame, before the section's frame. A page held still reads the engine without moving it on. */
  tick(dt: number, held: boolean): void {
    const drive = this.current;
    if (drive) this.snapshot = held ? drive.snapshot() : drive.tick(dt);
  }
}
