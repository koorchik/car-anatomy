// A pipe with dashes running along it. One material draws every pipe of a layer: each vertex knows how far along its
// pipe it is (aAlong) and which flow channel it belongs to (aChannel); a channel is one vec4 of phase, level and heat.

import * as THREE from 'three';

/** Channels per layer. The busiest, the air of a W16, uses 22. */
export const MAX_CHANNELS = 24;

export interface FlowMaterial {
  material: THREE.MeshStandardMaterial;
  /** phase, level 0..1, heat 0..1, spare: four floats per channel, written in place every frame. */
  channels: Float32Array;
  /** The flow's colour, a live uniform: changing it recolours the dashes. */
  color: THREE.Color;
}

/**
 * @param period dash spacing, scene units.
 * @param overlay draws over everything, for drillings inside a solid shaft.
 */
export function flowMaterial(color: THREE.ColorRepresentation, hotColor: THREE.ColorRepresentation, period: number, overlay = false): FlowMaterial {
  const channels = new Float32Array(MAX_CHANNELS * 4);
  const base = new THREE.Color(color);
  const material = new THREE.MeshStandardMaterial({
    color: base.clone().multiplyScalar(0.3),
    metalness: 0.25,
    roughness: 0.45,
    transparent: overlay,
    depthTest: !overlay,
    depthWrite: !overlay,
  });
  const uniforms = {
    uChan: { value: channels },
    uFlowColor: { value: base },
    uHotColor: { value: new THREE.Color(hotColor) },
    uPeriod: { value: period },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         attribute float aAlong;
         attribute float aChannel;
         uniform vec4 uChan[${MAX_CHANNELS}];
         uniform float uPeriod;
         varying float vDash;
         varying float vLevel;
         varying float vHeat;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vec4 flowChannel = uChan[int(aChannel + 0.5)];
         vDash = (aAlong - flowChannel.x) / uPeriod;
         vLevel = flowChannel.y;
         vHeat = flowChannel.z;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform vec3 uFlowColor;
         uniform vec3 uHotColor;
         varying float vDash;
         varying float vLevel;
         varying float vHeat;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         // Width of one pixel in dash units keeps the edges soft at any distance, so thin pipes don't shimmer.
         float dashW = max(fwidth(vDash), 1e-4);
         float dashX = fract(vDash);
         float dash = smoothstep(0.0, dashW, dashX) - smoothstep(0.45, 0.45 + dashW, dashX);
         vec3 flowColor = mix(uFlowColor, uHotColor, clamp(vHeat, 0.0, 1.0));
         totalEmissiveRadiance += flowColor * vLevel * (0.28 + 1.5 * dash);`,
      );
  };
  material.customProgramCacheKey = () => `systems-flow-${overlay ? 'over' : 'in'}`;
  return { material, channels, color: uniforms.uFlowColor.value };
}
