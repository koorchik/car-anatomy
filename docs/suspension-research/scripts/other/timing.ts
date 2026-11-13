// Read-only timing of the pure engine code, to size what a physics step can cost on the main thread.
const root = process.argv[2]!;
const t0 = performance.now();
const { ENGINES } = await import(`${root}/src/data/engines.ts`);
const t1 = performance.now();
const { designFromSpec } = await import(`${root}/src/designer/presets.ts`);
const { evaluate } = await import(`${root}/src/designer/physics.ts`);
const { assessReliability } = await import(`${root}/src/designer/reliability.ts`);
const { snapshot } = await import(`${root}/src/designer/sensitivity.ts`);
const { EngineSim } = await import(`${root}/src/engine/sim.ts`);
const { synthConfig } = await import(`${root}/src/audio/synth.ts`);
const { buildEngine } = await import(`${root}/src/engine/kinematics.ts`);
const spec = ENGINES.find((e: { id: string }) => e.id === 'v8-cross');
const d = { ...designFromSpec(spec), factory: null };
const time = (name: string, runs: number, fn: () => void): void => {
  const s = performance.now();
  for (let i = 0; i < runs; i++) fn();
  console.log(name.padEnd(28), ((performance.now() - s) / runs).toFixed(4), 'ms/run');
};
console.log('load data modules (incl. catalogue build)'.padEnd(28), (t1 - t0).toFixed(1), 'ms');
time('evaluate', 200, () => evaluate(d));
const perf = evaluate(d);
time('assessReliability', 200, () => assessReliability(d, perf));
time('snapshot (sensitivity unit)', 100, () => snapshot(d));
time('buildEngine', 500, () => buildEngine(spec));
const sim = new EngineSim(synthConfig(buildEngine(spec)).sim);
sim.start();
sim.pedal = 0.5;
time('EngineSim.step', 200000, () => sim.step(0.005));
