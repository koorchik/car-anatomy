// The contact patch seen from above, as the brush model has it (src/vehicle/tyre-patch.ts): the tread line enters
// at the leading edge, is dragged sideways while it sticks (green) and slides back under the friction parabola (red)
// towards the trailing edge. Drawn on a 2D canvas, for the tyre scene's dash and for the texture of the patch under the
// 3D wheel, so both show the same picture.

import { adhesionShare, shearAt } from '../../vehicle/tyre-patch.ts';

export const STICK_COLOR = '#43c46b';
export const SLIDE_COLOR = '#e8574c';

export interface PatchPaint {
  /** Normalised slip φ, and the drag across the patch (the y of the unit drag vector: positive to the wheel's left). */
  phi: number;
  across: number;
  /** Box of the patch on the canvas, px; the leading edge is at x0 + w when `leadRight`, else at x0. */
  x0: number;
  y0: number;
  w: number;
  h: number;
  leadRight: boolean;
  /** Draw the friction parabola and the undeflected centre line (the dash), or only the zones (the 3D texture). */
  lines: boolean;
}

const SAMPLES = 64;

/**
 * Paints the patch: its outline, the sticking and sliding zones, the deflected tread line and, with `lines`, the
 * friction limit. The deflection is exaggerated so that the shape reads: the largest the tread can be dragged (the top
 * of the parabola) is a third of the patch width.
 */
export function paintPatch(ctx: CanvasRenderingContext2D, p: PatchPaint): void {
  const { x0, y0, w, h, phi, leadRight } = p;
  const mid = y0 + h / 2;
  // Up the canvas is the wheel's left, and the tread is drawn dragged the way the force pulls it across (down when the
  // pull is straight along, which a view from above cannot show). 0.25 is the top of the parabola.
  const scale = (h / 3 / 0.25) * (p.across > 0 ? -1 : 1);
  const xAt = (xi: number): number => (leadRight ? x0 + w * (1 - xi) : x0 + w * xi);
  const stick = adhesionShare(phi);
  ctx.save();
  // The patch: a rectangle with rounded ends, as a loaded tyre's print is.
  const r = Math.min(h / 2, w / 6);
  ctx.beginPath();
  ctx.roundRect(x0, y0, w, h, r);
  ctx.fillStyle = 'rgba(20, 30, 34, 0.85)';
  ctx.fill();
  ctx.clip();
  // Zones across the whole width: green where the tread sticks, red where it slides.
  const xs = xAt(stick);
  ctx.fillStyle = STICK_COLOR;
  ctx.globalAlpha = 0.28;
  ctx.fillRect(Math.min(xAt(0), xs), y0, Math.abs(xs - xAt(0)), h);
  ctx.fillStyle = SLIDE_COLOR;
  ctx.fillRect(Math.min(xs, xAt(1)), y0, Math.abs(xAt(1) - xs), h);
  ctx.globalAlpha = 1;
  // The deflected tread: filled from the centre line, coloured by zone.
  const fill = (from: number, to: number, color: string): void => {
    if (to <= from) return;
    ctx.beginPath();
    ctx.moveTo(xAt(from), mid);
    for (let i = 0; i <= SAMPLES; i++) {
      const xi = from + ((to - from) * i) / SAMPLES;
      ctx.lineTo(xAt(xi), mid + shearAt(phi, xi) * scale);
    }
    ctx.lineTo(xAt(to), mid);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.75;
    ctx.fill();
    ctx.globalAlpha = 1;
  };
  fill(0, stick, STICK_COLOR);
  fill(stick, 1, SLIDE_COLOR);
  ctx.lineWidth = Math.max(1.5, h / 60);
  ctx.strokeStyle = '#f1efe6';
  ctx.beginPath();
  for (let i = 0; i <= SAMPLES; i++) {
    const xi = i / SAMPLES;
    const y = mid + shearAt(phi, xi) * scale;
    if (i === 0) ctx.moveTo(xAt(xi), y);
    else ctx.lineTo(xAt(xi), y);
  }
  ctx.stroke();
  if (p.lines) {
    // The friction limit: the parabola of the pressure, and the centre line the tread would follow rolling free.
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(241, 239, 230, 0.6)';
    ctx.beginPath();
    for (let i = 0; i <= SAMPLES; i++) {
      const xi = i / SAMPLES;
      const y = mid + xi * (1 - xi) * scale;
      if (i === 0) ctx.moveTo(xAt(xi), y);
      else ctx.lineTo(xAt(xi), y);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x0, mid);
    ctx.lineTo(x0 + w, mid);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(241, 239, 230, 0.8)';
  ctx.beginPath();
  ctx.roundRect(x0, y0, w, h, r);
  ctx.stroke();
}
