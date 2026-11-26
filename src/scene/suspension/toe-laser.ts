// The toe laser (build order, A3: the camber and toe lasers): on the road beside the tyre, a line straight ahead and a
// laser line along the way the wheel points, from behind the contact patch to well ahead of it, with the angle between
// them in degrees at the laser's end. Toe-in is positive, as the page's numbers print it. The two lines are drawn by
// the camber laser's own line segments (CamberLaser.setToe), so the corner keeps its budget of draw calls; this is
// the geometry they share and the label. Like the camber laser it lives in the body's frame and is drawn on top of
// everything, invisible to framing and picking.

import * as THREE from 'three';
import { numberLocale } from '../../i18n/locale.ts';
import { ON_TOP } from '../arrows.ts';
import { MEASURE } from '../palette.ts';

/** Ahead of and behind the contact patch, scene units (1 = 100 mm). */
export const TOE_AHEAD = 12;
export const TOE_BEHIND = 4;
/** Height over the road, so the lines do not flicker in it. */
export const TOE_LIFT = 0.03;

/**
 * Writes the two lines into `p` from vertex `at`: straight ahead first, so the laser draws over it, then the laser.
 * `contact` is the contact patch (body frame, scene units), `axis` the spin axis, outboard, of a left wheel. Scene axes
 * are ISO's turned (x = ISO y, y = ISO z, z = ISO x), so the wheel points along (−axis.z, 0, axis.x).
 */
export function writeToeLines(p: Float32Array, at: number, contact: THREE.Vector3, axis: THREE.Vector3): void {
  const len = Math.sqrt(axis.x * axis.x + axis.z * axis.z) || 1;
  const hx = -axis.z / len;
  const hz = axis.x / len;
  const y = contact.y + TOE_LIFT;
  // Written number by number: an array literal here would be garbage every frame.
  const k = 3 * at;
  p[k] = contact.x;
  p[k + 1] = y;
  p[k + 2] = contact.z - TOE_BEHIND;
  p[k + 3] = contact.x;
  p[k + 4] = y;
  p[k + 5] = contact.z + TOE_AHEAD;
  p[k + 6] = contact.x - hx * TOE_BEHIND;
  p[k + 7] = y;
  p[k + 8] = contact.z - hz * TOE_BEHIND;
  p[k + 9] = contact.x + hx * TOE_AHEAD;
  p[k + 10] = y;
  p[k + 11] = contact.z + hz * TOE_AHEAD;
}

/** Toe of a left wheel from its spin axis (scene), rad: toe-in turns the front inboard (−x), and that is positive. */
export const toeOfAxis = (axis: THREE.Vector3): number => Math.atan2(axis.z, axis.x);

/** The toe angle at the far end of the laser line. */
export class ToeLabel {
  readonly sprite: THREE.Sprite;
  private readonly canvas: HTMLCanvasElement;
  private readonly texture: THREE.CanvasTexture;
  private shown = Number.NaN;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 256;
    this.canvas.height = 96;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: this.texture, depthTest: false, depthWrite: false, transparent: true, toneMapped: false });
    this.sprite = new THREE.Sprite(material);
    this.sprite.scale.set(1.6, 0.6, 1);
    this.sprite.raycast = () => {};
    this.sprite.frustumCulled = false;
    this.sprite.renderOrder = ON_TOP;
  }

  update(contact: THREE.Vector3, axis: THREE.Vector3): void {
    const len = Math.sqrt(axis.x * axis.x + axis.z * axis.z) || 1;
    this.sprite.position.set(contact.x - (axis.z / len) * TOE_AHEAD + 0.9, contact.y + TOE_LIFT + 0.4, contact.z + (axis.x / len) * TOE_AHEAD);
    // + 0 drops a −0.
    const deg = Math.round(((toeOfAxis(axis) * 180) / Math.PI) * 100) / 100 + 0;
    if (deg !== this.shown) {
      this.shown = deg;
      this.draw(deg);
    }
  }

  private draw(deg: number): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = this.canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(14, 42, 51, 0.78)';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = MEASURE.laser;
    ctx.font = '600 56px "Fira Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = Math.abs(deg).toLocaleString(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    ctx.fillText(`${deg > 0 ? '+' : deg < 0 ? '−' : ''}${text}°`, width / 2, height / 2 + 2);
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
    this.sprite.material.dispose();
  }
}
