// The gearbox's pose for the 3D while the car drives (stage K3a): the same GearboxFrame the table gives (TablePose),
// but from the drivetrain the solver steps. Each member of the box turns by its row of the core's P times the base
// angles φ (research §2.3: never integrated member by member, so a pair's teeth cannot drift apart), and Drive has
// already continued φ to the frame. The sleeves travel on the main thread toward where the lever and the solver say
// they are: pushed in while the synchroniser brings the gear round, home once it holds; a picture, not physics. The
// power path glows through the gear that holds, as much as the clutch passes.

import type { VehicleFrame } from '../vehicle/vehicle-frame.ts';
import { memberIndex, type DrivetrainCore } from './core.ts';
import type { SleevePlace } from './spec.ts';
import { SLEEVE_TRAVEL_S, sleeveSides, type TablePose } from './table-drive.ts';
import type { Gearbox, StateInfo } from './topology.ts';

/** Where a sleeve stands while its synchroniser works and the dog teeth wait: the blocker ring holds it there. */
const BLOCKED_AT = 0.55;

export class DrivePose {
  readonly box: Gearbox;
  private readonly core: DrivetrainCore;
  /** The core's member of each of the box's members. */
  private readonly rows: Int32Array;
  private readonly sides: Map<string, { sleeve: SleevePlace; side: -1 | 1 }>;
  private readonly gears = new Map<string, StateInfo>();
  private readonly sleeveIds: string[];
  private readonly pose: TablePose;
  /** Where each sleeve is going, rewritten every update. */
  private readonly target: Record<string, number>;

  constructor(box: Gearbox, core: DrivetrainCore) {
    this.box = box;
    this.core = core;
    this.rows = Int32Array.from(box.members, (id) => memberIndex(core, id));
    this.sides = sleeveSides(box);
    for (const s of box.states) if (s.kind === 'gear') this.gears.set(s.name, s);
    this.sleeveIds = (box.spec.sleeves ?? []).map((s) => s.id);
    this.target = Object.fromEntries(this.sleeveIds.map((id) => [id, 0]));
    this.pose = { angles: new Array<number>(box.members.length).fill(0), sleeves: Object.fromEntries(this.sleeveIds.map((id) => [id, 0])), meshPower: box.meshes.map(() => 0) };
  }

  /** The pose of `frame`, `dt` s after the last one. The same object every call. */
  update(frame: VehicleFrame, dt: number): TablePose {
    const { core, rows, pose } = this;
    const n = core.n;
    const P = core.P;
    const phi = frame.phi;
    if (phi.length === n) {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]! * n;
        let a = 0;
        for (let k = 0; k < n; k++) a += P[r + k]! * phi[k]!;
        pose.angles[i] = a;
      }
    }

    const lever = this.gears.get(frame.lever);
    const target = this.target;
    for (const id of this.sleeveIds) target[id] = 0;
    if (lever) {
      for (const id of lever.closed) {
        const at = this.sides.get(id);
        if (at) target[at.sleeve.id] = at.side * (frame.gear === lever.name ? 1 : BLOCKED_AT);
      }
    }
    const reach = dt / SLEEVE_TRAVEL_S;
    for (const id of this.sleeveIds) {
      const p = pose.sleeves[id]!;
      const to = target[id]!;
      // Out of the old gear before into the new one, as the interlock has it.
      const leaving = this.sleeveIds.some((other) => other !== id && pose.sleeves[other] !== 0 && target[other] === 0);
      const goal = leaving && Math.sign(to) !== Math.sign(p) ? 0 : to;
      pose.sleeves[id] = p < goal ? Math.min(goal, p + reach) : Math.max(goal, p - reach);
    }

    const holding = this.gears.get(frame.gear);
    const loads = holding?.meshLoads;
    for (let j = 0; j < pose.meshPower.length; j++) pose.meshPower[j] = loads ? (loads[j]?.power ?? 0) * frame.clutch : 0;
    return pose;
  }
}
