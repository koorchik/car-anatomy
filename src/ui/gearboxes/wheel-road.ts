// The wheel-and-road inset of the car mode (stage K3a): a driven wheel over the road, side on. The wheel turns by
// its own angle and the road runs under it by the car's distance, on one scale (pixels per metre of the rolling
// radius), so a wheel that rolls keeps pace with the road and one that spins or locks visibly does not. Under it the
// two speeds and the slip between them.

import { numberLocale } from '../../i18n/locale.ts';
import { t } from '../../i18n/t.ts';
import type { VehicleFrame } from '../../vehicle/vehicle-frame.ts';

/** Whole, and never '-0'. */
const num = (v: number): string => (Math.round(v) || 0).toLocaleString(numberLocale);

/** Below this road speed, m/s, the slip is shown against this speed instead, as the tyre model has it. */
const SLIP_FLOOR = 1;
/** Slip the tyre gives near its peak grip and the line turns warm, as a share [estimate: typical road tyre]. */
const SLIP_WARN = 0.12;
const SPOKES = 5;

export interface WheelSlip {
  /** Speed of the tread around the wheel and of the road, km/h. */
  wheelKmh: number;
  roadKmh: number;
  /** (ωr − v)/max(|v|, 1 m/s): positive spins, negative locks. */
  slip: number;
}

/** The slip of wheel `i` in a frame. */
export function wheelSlip(frame: VehicleFrame, i: number): WheelSlip {
  const tread = frame.wheelOmega[i]! * frame.wheelRadius[i]!;
  const v = frame.speed;
  return { wheelKmh: tread * 3.6, roadKmh: v * 3.6, slip: (tread - v) / Math.max(Math.abs(v), SLIP_FLOOR) };
}

export const wheelRoadHtml = (): string => `<figure class="gbx-wheel-road" id="gbx-wheel-road" hidden>
    <figcaption>${t('Колесо й дорога')}</figcaption>
    <canvas id="gbx-wheel-canvas" width="220" height="104" aria-hidden="true"></canvas>
    <p><span class="gbx-wheel-speeds" id="gbx-wheel-speeds"></span> <span id="gbx-wheel-slip"></span></p>
  </figure>`;

export class WheelRoad {
  private readonly canvas: HTMLCanvasElement;
  private readonly speeds: HTMLElement;
  private readonly slip: HTMLElement;
  private shownSpeeds = '';
  private shownSlip = '';

  constructor(root: ParentNode) {
    this.canvas = root.querySelector<HTMLCanvasElement>('#gbx-wheel-canvas')!;
    this.speeds = root.querySelector<HTMLElement>('#gbx-wheel-speeds')!;
    this.slip = root.querySelector<HTMLElement>('#gbx-wheel-slip')!;
  }

  /** Draws wheel `i` of the frame. */
  draw(frame: VehicleFrame, i: number): void {
    const canvas = this.canvas;
    const scale = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * scale) || canvas.height !== Math.round(h * scale)) {
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
    }
    const g = canvas.getContext('2d');
    if (!g) return;
    g.setTransform(scale, 0, 0, scale, 0, 0);
    g.clearRect(0, 0, w, h);

    const roadY = h - 14;
    const radius = Math.min(roadY - 6, w / 4);
    const cx = w / 2;
    const cy = roadY - radius;
    const perMetre = radius / Math.max(0.1, frame.wheelRadius[i]!);
    const slip = wheelSlip(frame, i);
    const warm = Math.abs(slip.slip) > SLIP_WARN;

    // The road: its surface and dashes a metre apart on the wheel's scale, running back as the car moves forward.
    g.fillStyle = 'rgba(8, 26, 32, 0.9)';
    g.fillRect(0, roadY, w, h - roadY);
    g.fillStyle = 'rgba(233, 225, 207, 0.3)';
    g.fillRect(0, roadY, w, 1.5);
    g.strokeStyle = 'rgba(233, 225, 207, 0.55)';
    g.lineWidth = 3;
    const gap = perMetre * 0.5;
    let x = -((frame.distance * perMetre) % (2 * gap));
    g.beginPath();
    for (; x < w; x += 2 * gap) {
      g.moveTo(x, roadY + 6);
      g.lineTo(x + gap, roadY + 6);
    }
    g.stroke();

    // The wheel: tyre, rim and spokes at its angle (positive rolls forward, to the right here: clockwise on screen).
    g.fillStyle = '#1c1f21';
    g.beginPath();
    g.arc(cx, cy, radius, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#9aa5a8';
    g.beginPath();
    g.arc(cx, cy, radius * 0.62, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#3b4447';
    g.lineWidth = Math.max(2, radius * 0.1);
    g.lineCap = 'round';
    const angle = frame.wheelAngle[i]!;
    g.beginPath();
    for (let k = 0; k < SPOKES; k++) {
      const a = angle + (k * 2 * Math.PI) / SPOKES;
      g.moveTo(cx + Math.cos(a) * radius * 0.12, cy + Math.sin(a) * radius * 0.12);
      g.lineTo(cx + Math.cos(a) * radius * 0.58, cy + Math.sin(a) * radius * 0.58);
    }
    g.stroke();
    // A mark on the tread, so a spinning or locked tyre shows against the road.
    g.fillStyle = warm ? '#f08a3c' : '#e9e1cf';
    g.beginPath();
    g.arc(cx + Math.cos(angle) * radius * 0.86, cy + Math.sin(angle) * radius * 0.86, Math.max(2.5, radius * 0.08), 0, Math.PI * 2);
    g.fill();

    const speeds = t('колесо {wheel} · дорога {road} км/год ·', { wheel: num(slip.wheelKmh), road: num(slip.roadKmh) });
    const slipText = t('ковзання {slip} %', { slip: num(slip.slip * 100) });
    if (speeds !== this.shownSpeeds) this.speeds.textContent = this.shownSpeeds = speeds;
    if (slipText !== this.shownSlip) {
      this.slip.textContent = this.shownSlip = slipText;
      this.slip.parentElement!.classList.toggle('warm', warm);
    }
  }
}
