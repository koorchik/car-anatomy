// Presses the tyre onto the road in the vertex shader, so a bump, a pothole edge or a kerb never passes through the
// rubber and the tyre never hangs over a road it stands on.
//
// The tyre is a rigid surface of revolution of its free radius. The wheel centre comes from the physics, so where the
// tyre is loaded that surface dips below the road: every vertex below the road is moved straight up onto it, and its
// normal becomes the road's, so the contact patch lights flat. The same code runs in the tyre's shadow material, so the
// shadow is flattened too. Picking uses the unpressed mesh: a few millimetres do not matter there.
//
// The road is a height field along the direction of travel (scene Z) in the frame of the corner model: the drawn
// profile under the wheel, sampled ROAD_SAMPLES times over the tyre's length and read linearly between samples. The
// suspensions plan pressed onto the plane of the enveloped road under the patch; on the 50 mm × 0.5 m bump that plane
// sits about 6 mm below the crest, which then showed through the tread. The profile itself has no such gap.
// pressPoint below is the shader's twin for the tests; change both together.

import * as THREE from 'three';

/** Road samples under one tyre. 17 mm apart over ±0.4 m, the chord of a cosine bump is off by under 0.2 mm. */
export const ROAD_SAMPLES = 48;

export interface RoadPressUniforms {
  /** Tyre mesh local → corner model frame, and back. Rigid, so the inverse's 3×3 part turns normals too. */
  uRoadFromLocal: { value: THREE.Matrix4 };
  uLocalFromRoad: { value: THREE.Matrix4 };
  /** Scene Z of the first sample and the spacing, scene units. */
  uRoadZ0: { value: number };
  uRoadDz: { value: number };
  /** Road height (scene Y) at each sample. */
  uRoadH: { value: Float32Array };
}

export const roadPressUniforms = (): RoadPressUniforms => ({
  uRoadFromLocal: { value: new THREE.Matrix4() },
  uLocalFromRoad: { value: new THREE.Matrix4() },
  uRoadZ0: { value: -1 },
  uRoadDz: { value: 2 / (ROAD_SAMPLES - 1) },
  uRoadH: { value: new Float32Array(ROAD_SAMPLES).fill(-1e3) },
});

const COMMON = `
uniform mat4 uRoadFromLocal;
uniform mat4 uLocalFromRoad;
uniform float uRoadZ0;
uniform float uRoadDz;
uniform float uRoadH[${ROAD_SAMPLES}];
float roadHeightAt(float z, out float slope) {
  float u = clamp((z - uRoadZ0) / uRoadDz, 0.0, ${ROAD_SAMPLES - 1}.0 - 1e-4);
  int i = int(u);
  float a = uRoadH[i];
  float b = uRoadH[i + 1];
  slope = (b - a) / uRoadDz;
  return mix(a, b, u - float(i));
}
`;

/** The vertex shader of a lit material: the normal is pressed before it is transformed, the position after. */
const pressLit = (vertex: string): string =>
  vertex
    .replace('#include <common>', `#include <common>\n${COMMON}`)
    .replace(
      '#include <beginnormal_vertex>',
      `#include <beginnormal_vertex>
       vec3 roadAt = (uRoadFromLocal * vec4(position, 1.0)).xyz;
       float roadSlope;
       float roadH = roadHeightAt(roadAt.z, roadSlope);
       bool roadPressed = roadAt.y < roadH;
       if (roadPressed) objectNormal = normalize(mat3(uLocalFromRoad) * vec3(0.0, 1.0, -roadSlope));`,
    )
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       if (roadPressed) transformed = (uLocalFromRoad * vec4(roadAt.x, roadH, roadAt.z, 1.0)).xyz;`,
    );

/** The depth (shadow) shader has no normal: only the position. */
const pressDepth = (vertex: string): string =>
  vertex.replace('#include <common>', `#include <common>\n${COMMON}`).replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>
     {
       vec3 roadAt = (uRoadFromLocal * vec4(transformed, 1.0)).xyz;
       float roadSlope;
       float roadH = roadHeightAt(roadAt.z, roadSlope);
       if (roadAt.y < roadH) transformed = (uLocalFromRoad * vec4(roadAt.x, roadH, roadAt.z, 1.0)).xyz;
     }`,
  );

/** Adds the press to a material, keeping whatever its own onBeforeCompile does (the glass of the X-ray). */
export function pressOntoRoad<M extends THREE.Material>(material: M, uniforms: RoadPressUniforms, depth = false): M {
  const before = material.onBeforeCompile;
  const key = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = depth ? pressDepth(shader.vertexShader) : pressLit(shader.vertexShader);
  };
  material.customProgramCacheKey = () => `${key()}|road-press`;
  return material;
}

/** The tyre's shadow material: the renderer's own depth material (default packing), pressed. */
export const pressedDepthMaterial = (uniforms: RoadPressUniforms): THREE.MeshDepthMaterial =>
  pressOntoRoad(new THREE.MeshDepthMaterial(), uniforms, true);

/** Road height at scene Z, as the shader reads it. */
export function roadHeightAt(u: RoadPressUniforms, z: number): number {
  const n = ROAD_SAMPLES;
  const x = Math.min(n - 1 - 1e-4, Math.max(0, (z - u.uRoadZ0.value) / u.uRoadDz.value));
  const i = Math.floor(x);
  const h = u.uRoadH.value;
  return h[i]! + (h[i + 1]! - h[i]!) * (x - i);
}

const at = new THREE.Vector3();

/** The shader's twin: where a local tyre vertex ends up, in the corner model frame. Returns whether it was pressed. */
export function pressPoint(u: RoadPressUniforms, local: THREE.Vector3, out: THREE.Vector3): boolean {
  at.copy(local).applyMatrix4(u.uRoadFromLocal.value);
  const h = roadHeightAt(u, at.z);
  out.copy(at);
  if (at.y >= h) return false;
  out.y = h;
  return true;
}
