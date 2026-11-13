// Materials of a suspension corner. The palette is the engines' (createMaterials): steel #8d9093, cast aluminium
// #a9abac with the cast relief, chrome rod, dark matt rubber, glassMaterial shells. Springs are painted #b8322a and the
// damper oil is the systems' oil colour. Every material belongs to one corner, so a failure, a highlight or a ghost on
// one part tints nothing else.

import * as THREE from 'three';
import { castBumpTexture, glassMaterial } from '../materials.ts';
import { pressOntoRoad, pressedDepthMaterial, type RoadPressUniforms } from './tyre-press.ts';

/** Oil, as in the systems layers and the sump (whole-car plan, colours table). */
export const OIL_COLOR = '#e8a93a';
/** Painted coil spring (suspensions plan, 3D materials). */
export const SPRING_COLOR = '#b8322a';

const noiseTexture = (size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d')!, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
};

let treadBump: THREE.Texture | null = null;
let asphalt: THREE.Texture | null = null;

/**
 * Tread relief on the lathe's UVs: u runs round the tyre, v across the profile (0 at the inner bead, 1 at the outer).
 * Four circumferential grooves and slanted sipes between them on the tread band.
 */
const treadTexture = (): THREE.Texture => {
  treadBump ??= noiseTexture(512, (ctx, size) => {
    ctx.fillStyle = '#9a9a9a';
    ctx.fillRect(0, 0, size, size);
    // The tread band is the middle of v; rows of the canvas are v, columns u.
    const band = (v: number): number => size * v;
    ctx.fillStyle = '#202020';
    for (const v of [0.4, 0.465, 0.535, 0.6]) ctx.fillRect(0, band(v) - 3, size, 6);
    ctx.strokeStyle = '#3a3a3a';
    ctx.lineWidth = 2;
    for (let i = 0; i < 96; i++) {
      const x = (i / 96) * size;
      for (const [a, b] of [
        [0.36, 0.4],
        [0.6, 0.64],
      ] as const) {
        ctx.beginPath();
        ctx.moveTo(x, band(a));
        ctx.lineTo(x + 6, band(b));
        ctx.stroke();
      }
    }
  });
  return treadBump;
};

/** Asphalt with a dashed white edge line along one side (v near 1). u runs along the road. */
const asphaltTexture = (): THREE.Texture => {
  asphalt ??= (() => {
    const tex = noiseTexture(512, (ctx, size) => {
      ctx.fillStyle = '#3d4044';
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 26000; i++) {
        const v = 40 + Math.random() * 60;
        ctx.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
        ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 1 + Math.random() * 2);
      }
      ctx.fillStyle = '#d9d6cc';
      // Rows are v (across), columns u (along): a dash over the first half of the tile, near the outer edge.
      ctx.fillRect(0, size * 0.9, size * 0.5, size * 0.05);
    });
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  return asphalt;
};

export interface CornerMaterials {
  /** Pressed steel of the arm, painted near-black. */
  arm: THREE.MeshStandardMaterial;
  knuckle: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  chrome: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  boot: THREE.MeshStandardMaterial;
  bootGlass: THREE.MeshStandardMaterial;
  bumpStop: THREE.MeshStandardMaterial;
  bumpStopGlass: THREE.MeshStandardMaterial;
  spring: THREE.MeshStandardMaterial;
  strut: THREE.MeshStandardMaterial;
  strutGlass: THREE.MeshStandardMaterial;
  oil: THREE.MeshStandardMaterial;
  piston: THREE.MeshStandardMaterial;
  disc: THREE.MeshStandardMaterial;
  caliper: THREE.MeshStandardMaterial;
  wheel: THREE.MeshStandardMaterial;
  wheelGlass: THREE.MeshStandardMaterial;
  nut: THREE.MeshStandardMaterial;
  tyre: THREE.MeshStandardMaterial;
  tyreGlass: THREE.MeshStandardMaterial;
  /** The tyre's shadow: pressed onto the road like the tyre. */
  tyreDepth: THREE.MeshDepthMaterial;
  joint: THREE.MeshStandardMaterial;
  body: THREE.MeshStandardMaterial;
  bodyXray: THREE.MeshStandardMaterial;
  road: THREE.MeshStandardMaterial;
  /** Thin links, joints and axes of the mechanism view. */
  schematic: THREE.MeshStandardMaterial;
  schematicJoint: THREE.MeshStandardMaterial;
}

export function createCornerMaterials(press: RoadPressUniforms): CornerMaterials {
  const cast = castBumpTexture();
  const tread = treadTexture();
  const road = asphaltTexture().clone();
  road.needsUpdate = true;
  return {
    arm: new THREE.MeshStandardMaterial({ color: '#2f3236', metalness: 0.55, roughness: 0.5 }),
    knuckle: new THREE.MeshStandardMaterial({ color: '#a9abac', metalness: 0.85, roughness: 0.6, bumpMap: cast, bumpScale: 0.45 }),
    steel: new THREE.MeshStandardMaterial({ color: '#8d9093', metalness: 0.85, roughness: 0.45 }),
    chrome: new THREE.MeshStandardMaterial({ color: '#e4e7ea', metalness: 1, roughness: 0.12 }),
    rubber: new THREE.MeshStandardMaterial({ color: '#2a2b2e', metalness: 0, roughness: 0.75 }),
    boot: new THREE.MeshStandardMaterial({ color: '#232427', metalness: 0, roughness: 0.6 }),
    bootGlass: glassMaterial('#5d6670', 0.06, 0.5),
    bumpStop: new THREE.MeshStandardMaterial({ color: '#d8c9a3', metalness: 0, roughness: 0.8 }),
    bumpStopGlass: glassMaterial('#d8c9a3', 0.08, 0.5),
    spring: new THREE.MeshStandardMaterial({ color: SPRING_COLOR, metalness: 0.35, roughness: 0.42 }),
    strut: new THREE.MeshStandardMaterial({ color: '#3a3d42', metalness: 0.6, roughness: 0.45 }),
    strutGlass: glassMaterial('#bcd9e4', 0.04, 0.42),
    oil: new THREE.MeshStandardMaterial({ color: OIL_COLOR, metalness: 0, roughness: 0.35, transparent: true, opacity: 0.55, depthWrite: false }),
    piston: new THREE.MeshStandardMaterial({ color: '#d9d8d2', metalness: 0.92, roughness: 0.3 }),
    disc: new THREE.MeshStandardMaterial({ color: '#8d9093', metalness: 0.8, roughness: 0.5 }),
    caliper: new THREE.MeshStandardMaterial({ color: '#6b6f74', metalness: 0.7, roughness: 0.55, bumpMap: cast, bumpScale: 0.3 }),
    wheel: new THREE.MeshStandardMaterial({ color: '#c9ccce', metalness: 0.9, roughness: 0.3 }),
    wheelGlass: glassMaterial('#d8e3e8', 0.03, 0.38),
    nut: new THREE.MeshStandardMaterial({ color: '#b9bdc1', metalness: 1, roughness: 0.25 }),
    tyre: pressOntoRoad(new THREE.MeshStandardMaterial({ color: '#1e1f21', metalness: 0, roughness: 0.82, bumpMap: tread, bumpScale: 1.6 }), press),
    tyreGlass: pressOntoRoad(glassMaterial('#4a5056', 0.04, 0.45), press),
    tyreDepth: pressedDepthMaterial(press),
    joint: new THREE.MeshStandardMaterial({ color: '#7b8086', metalness: 0.9, roughness: 0.35 }),
    body: glassMaterial('#bcd9e4', 0.07, 0.5),
    bodyXray: glassMaterial('#bcd9e4', 0.03, 0.32),
    road: new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0, roughness: 0.95, map: road }),
    schematic: new THREE.MeshStandardMaterial({ color: '#e8eef1', metalness: 0.3, roughness: 0.5 }),
    schematicJoint: new THREE.MeshStandardMaterial({ color: '#ff9b3d', metalness: 0.2, roughness: 0.45 }),
  };
}

export const disposeMaterials = (m: CornerMaterials): void => {
  for (const material of Object.values(m)) (material as THREE.Material).dispose();
  (m.road.map as THREE.Texture | null)?.dispose();
};
