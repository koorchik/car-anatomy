// The H-gate of the car mode (stage K3b; gearboxes plan, the dash): the lever's pattern comes from the box's sleeves,
// one plane across the gate per sleeve, so a box changed on the panel brings its own gate. The lever is dragged along
// the slots and through neutral, or a slot is clicked and the lever walks there through neutral; the digits do the same.
//
// The pattern. A plane holds a sleeve's two speeds. Pushing the knob forward swings the lever's foot back, below its
// pivot, so the rail and the sleeve move back: the sleeve's back speed sits forward on the gate (up here) and its
// front speed back (down). The planes go from left to right by their lowest forward speed. On the Getrag 265 of the
// M3 E30 this gives the dogleg pattern: R forward and 1 back on the left, then 2/3 and 4/5 [auto motor und sport, the
// record's sources: «erster Gang hinten links»].

import { t } from '../../i18n/t.ts';
import type { SleeveDesc } from '../../drivetrain/layouts/layshaft.ts';

export interface GateSlot {
  /** As in the gear matrix: 'R', '1' … */
  name: string;
  /** Plane from the left, 0… */
  plane: number;
  /** Forward on the gate (up in the picture). */
  up: boolean;
}

export interface GateLayout {
  planes: number;
  slots: GateSlot[];
}

const speedName = (s: number | 'R'): string => (s === 'R' ? 'R' : String(s));

/** The gate of a box with these sleeves. */
export function gateLayout(sleeves: readonly SleeveDesc[]): GateLayout {
  const lowest = (s: SleeveDesc): number => {
    const forward = [s.front, s.back].filter((v): v is number => typeof v === 'number');
    return forward.length ? Math.min(...forward) : Number.POSITIVE_INFINITY;
  };
  const planes = [...sleeves].sort((a, b) => lowest(a) - lowest(b));
  const slots: GateSlot[] = [];
  planes.forEach((s, plane) => {
    if (s.back !== null) slots.push({ name: speedName(s.back), plane, up: true });
    if (s.front !== null) slots.push({ name: speedName(s.front), plane, up: false });
  });
  return { planes: planes.length, slots };
}

/** Where a slot is in gate units: u across the planes (0…planes−1), v −1 forward … 0 neutral … 1 back. */
export const slotPoint = (slot: GateSlot): { u: number; v: number } => ({ u: slot.plane, v: slot.up ? -1 : 1 });

/** Past this |v| the lever is in a gear, below the second it is out again (a little play, so a drag does not chatter). */
const IN_GEAR = 0.6;
const OUT_OF_GEAR = 0.4;
/** Within this |v| the lever moves across the planes. */
const NEUTRAL_BAND = 0.08;
/** The lever walks to a gear asked by a key or a click at this many gate units a second. */
const WALK = 9;

/**
 * Moves the lever in gate units toward a point the way the gate lets it: along a plane, or across in neutral. A drag
 * that pulls sideways out of a plane takes the lever to neutral first.
 */
export function constrain(at: { u: number; v: number }, to: { u: number; v: number }, planes: number, slots: readonly GateSlot[] = []): { u: number; v: number } {
  const clampU = (u: number) => Math.min(planes - 1, Math.max(0, u));
  // A plane with a speed on one side only (a reverse alone, the odd top gear) has no slot on the other side.
  const clampV = (plane: number, v: number) => {
    const open = (up: boolean) => !slots.length || slots.some((s) => s.plane === plane && s.up === up);
    return Math.min(open(false) ? 1 : 0, Math.max(open(true) ? -1 : 0, v));
  };
  if (Math.abs(at.v) > NEUTRAL_BAND) return { u: Math.round(at.u), v: clampV(Math.round(at.u), to.v) };
  const u = clampU(to.u);
  const plane = Math.round(u);
  // Into a plane only once the lever is lined up with it.
  if (Math.abs(u - plane) < 0.2) return { u: plane, v: clampV(plane, to.v) };
  return { u, v: 0 };
}

const VIEW_W = 52;
const VIEW_H = 92;
const PAD_X = 22;
/** Room right of the last plane for its labels. */
const PAD_RIGHT = 36;
const PAD_Y = 16;

export interface GateHost {
  /** The lever went into a gear, or out to neutral ('N'). */
  gear(name: string): void;
}

export class Gate {
  readonly element: HTMLElement;
  private readonly svg: SVGSVGElement;
  private readonly knob: SVGGElement;
  private readonly host: GateHost;
  private layout: GateLayout = { planes: 0, slots: [] };
  /** The lever's position, gate units, and where it walks to when nobody holds it. */
  private at = { u: 0, v: 0 };
  private target = { u: 0, v: 0 };
  private dragging = false;
  /** The gear the lever is in as far as the drag is concerned. */
  private dragGear = 'N';
  private shown = { selected: '', holds: '' };

  constructor(element: HTMLElement, host: GateHost) {
    this.element = element;
    this.host = host;
    element.innerHTML = '';
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'gbx-gate-svg');
    this.svg.setAttribute('role', 'img');
    element.append(this.svg);
    this.knob = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.listen();
  }

  /** A box's gate: the lever in neutral, or in `selected`. */
  setLayout(layout: GateLayout, selected = 'N'): void {
    this.layout = layout;
    const w = (layout.planes - 1) * VIEW_W + PAD_X + PAD_RIGHT;
    const h = VIEW_H + 2 * PAD_Y;
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.svg.setAttribute('aria-label', t('Куліса: {pattern}', { pattern: this.describe() }));
    const x = (u: number) => PAD_X + u * VIEW_W;
    const y = (v: number) => PAD_Y + ((v + 1) / 2) * VIEW_H;
    const paths = [`M ${x(0)} ${y(0)} H ${x(layout.planes - 1)}`];
    for (let p = 0; p < layout.planes; p++) {
      const up = layout.slots.some((s) => s.plane === p && s.up);
      const down = layout.slots.some((s) => s.plane === p && !s.up);
      paths.push(`M ${x(p)} ${y(up ? -1 : 0)} V ${y(down ? 1 : 0)}`);
    }
    const labels = layout.slots
      .map((s) => {
        const p = slotPoint(s);
        const ly = y(p.v) + (s.up ? -4 : 13);
        return `<text class="gbx-gate-label" data-gear="${s.name}" x="${x(p.u) + 9}" y="${ly}">${s.name}</text>`;
      })
      .join('');
    this.svg.innerHTML = `<path class="gbx-gate-slot" d="${paths.join(' ')}" />${labels}`;
    this.knob.setAttribute('class', 'gbx-gate-knob');
    this.knob.innerHTML = '<circle r="9" />';
    this.svg.append(this.knob);
    const slot = layout.slots.find((s) => s.name === selected);
    this.at = slot ? slotPoint(slot) : { u: this.neutralU(), v: 0 };
    this.target = { ...this.at };
    this.shown = { selected: '', holds: '' };
    this.place();
  }

  /** Follows the car: the gear asked for (where the lever goes) and the gear that holds (lit). */
  frame(dt: number, selected: string, holds: string): void {
    if (this.dragging) return;
    if (selected !== this.shown.selected) {
      const slot = this.layout.slots.find((s) => s.name === selected);
      // To neutral the lever comes out of its plane where it is.
      this.target = slot ? slotPoint(slot) : { u: Math.round(this.at.u), v: 0 };
    }
    if (selected !== this.shown.selected || holds !== this.shown.holds) {
      this.shown = { selected, holds };
      for (const label of this.svg.querySelectorAll<SVGTextElement>('.gbx-gate-label')) {
        label.classList.toggle('asked', label.dataset.gear === selected && selected !== holds);
        label.classList.toggle('holds', label.dataset.gear === holds);
      }
    }
    this.walk(dt);
  }

  /** Steps the lever toward its target through neutral. */
  private walk(dt: number): void {
    let left = WALK * dt;
    const at = this.at;
    const target = this.target;
    for (let guard = 0; guard < 3 && left > 1e-6; guard++) {
      let goal: { u: number; v: number };
      if (Math.abs(at.u - target.u) > 1e-3) goal = Math.abs(at.v) > 1e-3 ? { u: at.u, v: 0 } : { u: target.u, v: 0 };
      else goal = target;
      const d = Math.hypot(goal.u - at.u, goal.v - at.v);
      if (d < 1e-6) break;
      const k = Math.min(1, left / d);
      at.u += (goal.u - at.u) * k;
      at.v += (goal.v - at.v) * k;
      left -= d * k;
    }
    this.place();
  }

  private place(): void {
    const x = PAD_X + this.at.u * VIEW_W;
    const y = PAD_Y + ((this.at.v + 1) / 2) * VIEW_H;
    this.knob.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
  }

  /** The plane neutral sits over before any gear: the middle one. */
  private neutralU(): number {
    return Math.floor((this.layout.planes - 1) / 2);
  }

  private describe(): string {
    const plane = (p: number) =>
      this.layout.slots
        .filter((s) => s.plane === p)
        .sort((a, b) => Number(b.up) - Number(a.up))
        .map((s) => s.name)
        .join('/');
    return Array.from({ length: this.layout.planes }, (_, p) => plane(p)).join(', ');
  }

  private toGate(event: PointerEvent): { u: number; v: number } {
    const box = this.svg.getBoundingClientRect();
    const view = this.svg.viewBox.baseVal;
    const sx = view.width / Math.max(1, box.width);
    const sy = view.height / Math.max(1, box.height);
    // The viewBox keeps its aspect: the drawing is centred in the element.
    const s = Math.max(sx, sy);
    const px = (event.clientX - box.left - (box.width - view.width / s) / 2) * s;
    const py = (event.clientY - box.top - (box.height - view.height / s) / 2) * s;
    return { u: (px - PAD_X) / VIEW_W, v: ((py - PAD_Y) / VIEW_H) * 2 - 1 };
  }

  private listen(): void {
    const svg = this.svg;
    svg.addEventListener('pointerdown', (event) => {
      const p = this.toGate(event);
      const onKnob = Math.hypot((p.u - this.at.u) * VIEW_W, ((p.v - this.at.v) * VIEW_H) / 2) < 16;
      if (!onKnob) {
        // A click on a slot asks for its gear, on the neutral line for neutral; the lever walks there.
        const slot = this.layout.slots.find((s) => Math.hypot((s.plane - p.u) * VIEW_W, ((slotPoint(s).v - p.v) * VIEW_H) / 2) < 22);
        if (slot) this.host.gear(slot.name);
        else if (Math.abs(p.v) < 0.3) this.host.gear('N');
        return;
      }
      svg.setPointerCapture(event.pointerId);
      this.dragging = true;
      this.dragGear = this.slotAt(this.at)?.name ?? 'N';
      event.preventDefault();
    });
    svg.addEventListener('pointermove', (event) => {
      if (!this.dragging || !svg.hasPointerCapture(event.pointerId)) return;
      this.at = constrain(this.at, this.toGate(event), this.layout.planes, this.layout.slots);
      this.place();
      const slot = this.slotAt(this.at);
      if (slot && slot.name !== this.dragGear) {
        this.dragGear = slot.name;
        this.host.gear(slot.name);
      } else if (!slot && this.dragGear !== 'N' && Math.abs(this.at.v) < OUT_OF_GEAR) {
        // Out of the gear on the way through neutral: the sleeve comes out now, not when the lever lands.
        this.dragGear = 'N';
        this.host.gear('N');
      }
    });
    const end = (): void => {
      if (!this.dragging) return;
      this.dragging = false;
      const slot = this.slotAt(this.at);
      this.target = slot ? slotPoint(slot) : { u: Math.round(this.at.u), v: 0 };
      this.shown.selected = slot?.name ?? 'N';
      if (!slot && this.dragGear !== 'N') this.host.gear('N');
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
  }

  private slotAt(p: { u: number; v: number }): GateSlot | undefined {
    if (Math.abs(p.v) < IN_GEAR) return undefined;
    return this.layout.slots.find((s) => s.plane === Math.round(p.u) && s.up === p.v < 0);
  }
}
