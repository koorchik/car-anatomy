// What the corner draws over itself: the forces on the wheel and the camber laser. Both live in the body's frame and
// are drawn on top of everything, invisible to framing and picking (src/scene/arrows.ts).
//
// Forces are the ones acting on the wheel with its knuckle and strut tube, so they read as one free-body diagram:
// the tyre pushing up at the contact patch, the spring, damper and bump stop pushing down along the strut, the links
// holding it (knuckle-statics.ts) and the unsprung weight. One scale for the whole section: 1 kN = 40 mm.

import * as THREE from 'three';
import { numberLocale } from '../../i18n/locale.ts';
import { Arrows, arrowHeadGeometry, arrowShaftGeometry, ON_TOP, outOfFrame, overlayMaterial } from '../arrows.ts';

/** Scene units per newton: 1 kN = 40 mm (suspensions plan, 3D overlays). */
export const FORCE_SCALE = 0.4 / 1000;

/**
 * Colours of the suspension's forces (suspensions plan, 3D overlays; whole-car plan, force arrows: white is a sum,
 * grey a weight, yellow the tyre). The shell's palette.ts takes these over when it arrives.
 */
export const FORCE_COLORS = {
  spring: '#3ccf6e',
  damper: '#3d8bff',
  /** The bump stop is an elastic element like the spring: a paler green. */
  stop: '#a8f0c6',
  links: '#ff9b3d',
  tyre: '#ffd23d',
  weight: '#a3abb0',
} as const;

export type ForceArrow = 'tyre' | 'spring' | 'damper' | 'stop' | 'arm' | 'tieRod' | 'strutTop' | 'weight';
export const FORCE_ARROWS: readonly ForceArrow[] = ['tyre', 'spring', 'damper', 'stop', 'arm', 'tieRod', 'strutTop', 'weight'];
const COLOR_OF: Record<ForceArrow, string> = {
  tyre: FORCE_COLORS.tyre,
  spring: FORCE_COLORS.spring,
  damper: FORCE_COLORS.damper,
  stop: FORCE_COLORS.stop,
  arm: FORCE_COLORS.links,
  tieRod: FORCE_COLORS.links,
  strutTop: FORCE_COLORS.links,
  weight: FORCE_COLORS.weight,
};
/** Shaft radius of every arrow, scene units. */
const ARROW_WIDTH = 0.055;

export class ForceArrows {
  readonly group = new THREE.Group();
  private readonly arrows: Arrows;
  private readonly shaftGeo = arrowShaftGeometry();
  private readonly headGeo = arrowHeadGeometry();
  private readonly material = overlayMaterial('#ffffff');

  constructor() {
    this.arrows = new Arrows(
      this.shaftGeo,
      this.headGeo,
      this.material,
      FORCE_ARROWS.map((k) => COLOR_OF[k]),
      FORCE_ARROWS.map(() => ARROW_WIDTH),
    );
    this.group.add(this.arrows.shafts, this.arrows.heads);
    for (const arrow of FORCE_ARROWS) this.arrows.hide(FORCE_ARROWS.indexOf(arrow));
    this.arrows.commit();
  }

  /** Arrow for a force `f` (N, scene axes) from point `at` (scene). */
  set(which: ForceArrow, at: THREE.Vector3, f: THREE.Vector3): void {
    const s = FORCE_SCALE;
    this.arrows.set(FORCE_ARROWS.indexOf(which), at.x, at.y, at.z, f.x * s, f.y * s, f.z * s);
  }

  hide(which: ForceArrow): void {
    this.arrows.hide(FORCE_ARROWS.indexOf(which));
  }

  commit(): void {
    this.arrows.commit();
  }

  dispose(): void {
    this.arrows.dispose();
    this.shaftGeo.dispose();
    this.headGeo.dispose();
    this.material.dispose();
  }
}

const LASER = '#ff3b30';
const PLUMB = '#d8e2e6';
const ARC_SEGMENTS = 24;
/** One metre of laser in the wheel plane (suspensions plan, 3D overlays). */
const LASER_LENGTH = 10;
const CROSS_HALF = 1.6;
const ARC_AT = 7;

/**
 * The camber laser: a metre-long line in the wheel plane from the contact patch, a plumb line beside it, a short line
 * along the axle at the wheel centre's height, the arc between laser and plumb, and the angle in degrees.
 */
export class CamberLaser {
  readonly group = new THREE.Group();
  private readonly lines: THREE.LineSegments;
  private readonly positions: Float32Array;
  private readonly label: THREE.Sprite;
  private readonly canvas: HTMLCanvasElement;
  private readonly texture: THREE.CanvasTexture;
  private shown = Number.NaN;
  private readonly p = new THREE.Vector3();

  constructor() {
    // Segments: the plumb first, so the laser draws over it; then the laser, the axle line and the arc.
    const count = 2 * (3 + ARC_SEGMENTS);
    this.positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const laser = new THREE.Color(LASER);
    const plumb = new THREE.Color(PLUMB);
    for (let i = 0; i < count; i++) {
      const c = i < 2 ? plumb : laser;
      colors.set([c.r, c.g, c.b], i * 3);
    }
    const geo = outOfFrame(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, depthWrite: false, transparent: true, toneMapped: false });
    this.lines = new THREE.LineSegments(geo, material);
    this.lines.raycast = () => {};
    this.lines.frustumCulled = false;
    this.lines.renderOrder = ON_TOP;

    this.canvas = document.createElement('canvas');
    this.canvas.width = 256;
    this.canvas.height = 96;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    const spriteMaterial = new THREE.SpriteMaterial({ map: this.texture, depthTest: false, depthWrite: false, transparent: true, toneMapped: false });
    this.label = new THREE.Sprite(spriteMaterial);
    this.label.scale.set(1.6, 0.6, 1);
    this.label.raycast = () => {};
    this.label.frustumCulled = false;
    this.label.renderOrder = ON_TOP;
    this.group.add(this.lines, this.label);
  }

  private write(i: number, v: THREE.Vector3): void {
    this.positions[3 * i] = v.x;
    this.positions[3 * i + 1] = v.y;
    this.positions[3 * i + 2] = v.z;
  }

  /**
   * `contact` and `centre` in the body frame (scene), `up` the wheel plane's in-plane up direction, `axis` the spin
   * axis (outboard), `camber` in radians (positive when the top leans out).
   */
  update(contact: THREE.Vector3, centre: THREE.Vector3, up: THREE.Vector3, axis: THREE.Vector3, camber: number): void {
    const p = this.p;
    this.write(0, contact);
    this.write(1, p.set(contact.x, contact.y + LASER_LENGTH, contact.z));
    this.write(2, contact);
    this.write(3, p.copy(contact).addScaledVector(up, LASER_LENGTH));
    this.write(4, p.copy(centre).addScaledVector(axis, -CROSS_HALF));
    this.write(5, p.copy(centre).addScaledVector(axis, CROSS_HALF));
    // Arc in the plane of the plumb and the laser, from the plumb to the laser.
    const ux = up.x;
    const uz = up.z;
    const side = Math.hypot(ux, uz);
    const dirx = side > 1e-9 ? ux / side : 1;
    const dirz = side > 1e-9 ? uz / side : 0;
    const total = Math.atan2(side, up.y);
    for (let k = 0; k < ARC_SEGMENTS; k++) {
      for (const [slot, step] of [
        [0, k],
        [1, k + 1],
      ] as const) {
        const a = (total * step) / ARC_SEGMENTS;
        p.set(contact.x + dirx * Math.sin(a) * ARC_AT, contact.y + Math.cos(a) * ARC_AT, contact.z + dirz * Math.sin(a) * ARC_AT);
        this.write(6 + 2 * k + slot, p);
      }
    }
    this.lines.geometry.attributes.position!.needsUpdate = true;
    this.label.position.set(contact.x + dirx * 1.2 + axis.x * 0.9, contact.y + ARC_AT + 0.6, contact.z + dirz * 1.2 + axis.z * 0.9);
    // + 0 turns −0 into 0, so a wheel standing straight does not read «−0,00°».
    const deg = Math.round(((camber * 180) / Math.PI) * 100) / 100 + 0;
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
    ctx.fillStyle = LASER;
    ctx.font = '600 56px "Fira Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = `${deg.toLocaleString(numberLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}°`;
    ctx.fillText(text, width / 2, height / 2 + 2);
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.lines.geometry.dispose();
    (this.lines.material as THREE.Material).dispose();
    this.texture.dispose();
    this.label.material.dispose();
  }
}
