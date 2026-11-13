import * as THREE from 'three';

const noiseTexture = (size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d')!, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
};

let castBump: THREE.Texture | null = null;
let crinkleBump: THREE.Texture | null = null;

/** Sand-cast surface for blocks and heads. */
const castTexture = (): THREE.Texture => {
  castBump ??= noiseTexture(256, (ctx, size) => {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 14000; i++) {
      const v = 95 + Math.random() * 70;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  });
  castBump.repeat.set(0.7, 0.7);
  return castBump;
};

/** Wrinkle paint on cam covers. */
const crinkleTexture = (): THREE.Texture => {
  crinkleBump ??= noiseTexture(256, (ctx, size) => {
    ctx.fillStyle = '#707070';
    ctx.fillRect(0, 0, size, size);
    ctx.lineCap = 'round';
    for (let i = 0; i < 2600; i++) {
      const v = Math.random() < 0.5 ? 40 : 200;
      ctx.strokeStyle = `rgba(${v},${v},${v},0.35)`;
      ctx.lineWidth = 0.7 + Math.random() * 1.4;
      const x = Math.random() * size;
      const y = Math.random() * size;
      const a = Math.random() * Math.PI * 2;
      const l = 2 + Math.random() * 5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      ctx.stroke();
    }
  });
  crinkleBump.repeat.set(1.6, 1.6);
  return crinkleBump;
};

/** See-through shell: faint from the front, stronger at grazing angles, like a glass model of the engine. */
export function glassMaterial(color: THREE.ColorRepresentation, base = 0.035, edge = 0.42): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.1,
    roughness: 0.3,
    transparent: true,
    depthWrite: false,
    envMapIntensity: 1.1,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uGlassBase = { value: base };
    shader.uniforms.uGlassEdge = { value: edge };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlassBase;\nuniform float uGlassEdge;')
      .replace(
        '#include <opaque_fragment>',
        `float glassFresnel = pow(1.0 - saturate(abs(dot(normalize(normal), normalize(vViewPosition)))), 2.2);
         diffuseColor.a = mix(uGlassBase, uGlassEdge, glassFresnel);
         #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => `glass-${base}-${edge}`;
  return m;
}

export interface HotPipeUniforms {
  uHeat: { value: number };
  uPulsePos: { value: number };
  uPulseAmp: { value: number };
}

/** Exhaust pipe that glows with temperature and shows the gas pulse running along it. Needs tube UVs. */
export function hotPipeMaterial(): { material: THREE.MeshStandardMaterial; uniforms: HotPipeUniforms } {
  const uniforms: HotPipeUniforms = {
    uHeat: { value: 0 },
    uPulsePos: { value: -1 },
    uPulseAmp: { value: 0 },
  };
  const material = new THREE.MeshStandardMaterial({ color: '#8d8a84', metalness: 0.9, roughness: 0.45 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHeat = uniforms.uHeat;
    shader.uniforms.uPulsePos = uniforms.uPulsePos;
    shader.uniforms.uPulseAmp = uniforms.uPulseAmp;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vAlong;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlong = uv.x;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying float vAlong;\nuniform float uHeat;\nuniform float uPulsePos;\nuniform float uPulseAmp;',
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         float cool = smoothstep(1.0, 0.0, vAlong);
         vec3 heatColor = mix(vec3(0.5, 0.05, 0.0), vec3(1.0, 0.32, 0.05), uHeat) * uHeat * uHeat * (0.25 + 0.75 * cool);
         float pulseShape = exp(-pow((vAlong - uPulsePos) / 0.07, 2.0));
         totalEmissiveRadiance += heatColor * 1.3 + vec3(1.0, 0.42, 0.1) * pulseShape * uPulseAmp * 2.4;`,
      );
  };
  material.customProgramCacheKey = () => 'hot-pipe';
  return { material, uniforms };
}

export interface EngineMaterials {
  block: THREE.MeshStandardMaterial;
  head: THREE.MeshStandardMaterial;
  cover: THREE.MeshPhysicalMaterial;
  sump: THREE.MeshStandardMaterial;
  blockGlass: THREE.Material;
  coverGlass: THREE.Material;
  sumpGlass: THREE.Material;
  linerGlass: THREE.Material;
  crank: THREE.MeshStandardMaterial;
  piston: THREE.MeshStandardMaterial;
  ring: THREE.MeshStandardMaterial;
  rod: THREE.MeshStandardMaterial;
  pin: THREE.MeshStandardMaterial;
  valveIntake: THREE.MeshStandardMaterial;
  valveExhaust: THREE.MeshStandardMaterial;
  spring: THREE.MeshStandardMaterial;
  cam: THREE.MeshStandardMaterial;
  chain: THREE.MeshStandardMaterial;
  sprocket: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  flywheel: THREE.MeshStandardMaterial;
  intake: THREE.MeshStandardMaterial;
  plastic: THREE.MeshStandardMaterial;
  turboHot: THREE.MeshStandardMaterial;
  turboCold: THREE.MeshStandardMaterial;
  turboWheel: THREE.MeshStandardMaterial;
  turboHotGlass: THREE.MeshStandardMaterial;
  turboColdGlass: THREE.MeshStandardMaterial;
  housing: THREE.MeshStandardMaterial;
  /** The intake in the X-ray while the air or fuel layer shows through it. */
  intakeGlass: THREE.MeshStandardMaterial;
}

export function createMaterials(coverColor: string, blockMaterial: 'aluminium' | 'iron'): EngineMaterials {
  const cast = castTexture();
  const iron = blockMaterial === 'iron';
  const blockColor = iron ? '#6d7073' : '#a9abac';
  return {
    block: new THREE.MeshStandardMaterial({
      color: blockColor,
      metalness: iron ? 0.75 : 0.85,
      roughness: iron ? 0.72 : 0.62,
      bumpMap: cast,
      bumpScale: 0.5,
    }),
    head: new THREE.MeshStandardMaterial({ color: '#b6b7b6', metalness: 0.88, roughness: 0.55, bumpMap: cast, bumpScale: 0.35 }),
    cover: new THREE.MeshPhysicalMaterial({
      color: coverColor,
      metalness: 0.2,
      roughness: 0.55,
      clearcoat: 0.45,
      clearcoatRoughness: 0.6,
      bumpMap: crinkleTexture(),
      bumpScale: 0.9,
    }),
    sump: new THREE.MeshStandardMaterial({ color: '#8d9093', metalness: 0.85, roughness: 0.5, bumpMap: cast, bumpScale: 0.3 }),
    blockGlass: glassMaterial('#bcd9e4', 0.025, 0.34),
    turboHotGlass: glassMaterial('#d9925f', 0.07, 0.55),
    turboColdGlass: glassMaterial('#dbe4e7', 0.05, 0.5),
    coverGlass: glassMaterial(coverColor, 0.03, 0.34),
    sumpGlass: glassMaterial('#8fa7b0', 0.025, 0.3),
    linerGlass: glassMaterial('#d8e8ee', 0.02, 0.22),
    crank: new THREE.MeshStandardMaterial({ color: '#b9bdc1', metalness: 1, roughness: 0.28 }),
    piston: new THREE.MeshStandardMaterial({ color: '#d9d8d2', metalness: 0.92, roughness: 0.34 }),
    ring: new THREE.MeshStandardMaterial({ color: '#3a3c40', metalness: 0.9, roughness: 0.4 }),
    rod: new THREE.MeshStandardMaterial({ color: '#868b91', metalness: 1, roughness: 0.33 }),
    pin: new THREE.MeshStandardMaterial({ color: '#e0e3e5', metalness: 1, roughness: 0.15 }),
    valveIntake: new THREE.MeshStandardMaterial({ color: '#7dc4e0', metalness: 0.9, roughness: 0.3 }),
    valveExhaust: new THREE.MeshStandardMaterial({ color: '#d98a5d', metalness: 0.9, roughness: 0.3 }),
    spring: new THREE.MeshStandardMaterial({ color: '#3d4f5a', metalness: 0.7, roughness: 0.45 }),
    cam: new THREE.MeshStandardMaterial({ color: '#c6c9c9', metalness: 1, roughness: 0.22 }),
    chain: new THREE.MeshStandardMaterial({ color: '#50545a', metalness: 0.9, roughness: 0.45 }),
    sprocket: new THREE.MeshStandardMaterial({ color: '#8f9398', metalness: 1, roughness: 0.38 }),
    rubber: new THREE.MeshStandardMaterial({ color: '#2a2b2e', metalness: 0, roughness: 0.7 }),
    flywheel: new THREE.MeshStandardMaterial({ color: '#7a7f85', metalness: 1, roughness: 0.34 }),
    intake: new THREE.MeshStandardMaterial({ color: '#c0c1bf', metalness: 0.9, roughness: 0.42, bumpMap: cast, bumpScale: 0.2 }),
    plastic: new THREE.MeshStandardMaterial({ color: '#232527', metalness: 0.05, roughness: 0.62 }),
    turboHot: new THREE.MeshStandardMaterial({ color: '#70615a', metalness: 0.85, roughness: 0.62 }),
    turboCold: new THREE.MeshStandardMaterial({ color: '#b2b4b4', metalness: 0.92, roughness: 0.42 }),
    turboWheel: new THREE.MeshStandardMaterial({ color: '#e0e3e4', metalness: 1, roughness: 0.25, side: THREE.DoubleSide }),
    housing: new THREE.MeshStandardMaterial({ color: '#8e9193', metalness: 0.85, roughness: 0.55, bumpMap: cast, bumpScale: 0.4 }),
    intakeGlass: glassMaterial('#c9d4d8', 0.04, 0.42),
  };
}

let glowTex: THREE.Texture | null = null;

/** Soft round sprite used for sparks and glow. */
export const glowTexture = (): THREE.Texture => {
  if (glowTex) return glowTex;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.2, 'rgba(255,220,170,0.8)');
  grad.addColorStop(0.5, 'rgba(255,150,60,0.22)');
  grad.addColorStop(1, 'rgba(255,120,30,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(canvas);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
};
