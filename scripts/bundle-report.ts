// What a visitor downloads: the size of every chunk of the built site and of the path to each page, against the
// budget of the plan of the whole car («Бюджет швидкодії», «Ліниве завантаження»). Also checks that the audio
// worklet carries no text (no Cyrillic) and stays within its size.
//
//   node scripts/bundle-report.ts                  build the working tree and report
//   node scripts/bundle-report.ts --at <git ref>   ... a commit instead, e.g. the base of a stage (P_Д6 was taken so)
//
// Options: --out .tmp/bundle-report   --json (the numbers as JSON on stdout, nothing else)
// Sizes are gzip at the default level, in kB of 1000 bytes, as `vite build` prints them. A path is every JS and CSS
// file a page needs before it can show: the loader, the main chunk, the section's chunk and a feature's chunk, each
// with what it imports statically. Fonts are left out: they come per script and weight, and the same on every page.
// The script runs at the acceptance of a stage, not in `npm test`; it exits with 1 when a limit is broken.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const REPO = resolve(import.meta.dirname, '..');

/**
 * The path to the engine catalogue on `next` before stage O2a split the engines into lazy chunks: the whole site then
 * came in one go. Measured with `--at` on that commit; docs/vehicle-model.md has the measurement.
 */
const P_D6 = 491.4;

/** Limits, kB gzip. */
const LIMITS = {
  loader: 10,
  main: 200,
  workletRaw: 250,
};

interface PagePath {
  id: string;
  label: string;
  /** The page's own source file: until it exists, the page is not built yet and is reported so. */
  exists: string;
  /**
   * Modules the loader imports for this page, besides the shell: lazy chunks in the order they are asked for. In
   * English each comes after the dictionaries its withDictionaries() names, which the English path adds.
   */
  modules: string[];
  /** The page's limit, kB gzip. */
  limit: number;
  limitText: string;
}

const SHELL = 'src/shell/app.ts';
const ENGINES = 'src/ui/engines/section.ts';

const PAGES: PagePath[] = [
  { id: 'catalogue', label: 'каталог двигуна', exists: ENGINES, modules: [ENGINES], limit: 0.8 * P_D6, limitText: '0,8 · P_Д6' },
  { id: 'designer', label: 'конструктор', exists: ENGINES, modules: [ENGINES, 'src/ui/engines/designer-host.ts'], limit: P_D6, limitText: 'P_Д6' },
  { id: 'dyno', label: 'стенд', exists: ENGINES, modules: [ENGINES, 'src/ui/dyno/dyno-panel.ts'], limit: P_D6, limitText: 'P_Д6' },
  { id: 'systems', label: 'шари систем', exists: ENGINES, modules: [ENGINES, 'src/ui/systems-view.ts', 'src/scene/systems/index.ts'], limit: P_D6, limitText: 'P_Д6' },
  { id: 'forces', label: 'сили й фази', exists: ENGINES, modules: [ENGINES, 'src/ui/balance-panel.ts', 'src/ui/valve-readout.ts'], limit: P_D6, limitText: 'P_Д6' },
  { id: 'sump', label: 'олива на треку', exists: ENGINES, modules: [ENGINES, 'src/ui/sump/sump-page.ts'], limit: P_D6, limitText: 'P_Д6' },
  { id: 'gearbox', label: 'коробка', exists: 'src/ui/gearboxes/section.ts', modules: ['src/ui/gearboxes/section.ts'], limit: 400, limitText: '400' },
  { id: 'suspension', label: 'підвіска', exists: 'src/ui/suspensions/section.ts', modules: ['src/ui/suspensions/section.ts'], limit: 400, limitText: '400' },
  { id: 'overview', label: 'огляд авто', exists: 'src/ui/car/section.ts', modules: ['src/ui/car/section.ts'], limit: 450, limitText: '450' },
];

// ---------------------------------------------------------------------------------------------------------------
// Arguments and the code to build

interface Options {
  at: string | null;
  out: string;
  json: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { at: null, out: join(REPO, '.tmp', 'bundle-report'), json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const value = (): string => {
      const v = argv[++i];
      if (!v) throw new Error(`${arg} needs a value`);
      return v;
    };
    if (arg === '--at') options.at = value();
    else if (arg === '--out') options.out = resolve(value());
    else if (arg === '--json') options.json = true;
    else throw new Error(`Unknown argument ${arg}. Usage: node scripts/bundle-report.ts [--at <git ref>] [--out dir] [--json]`);
  }
  return options;
}

const git = (...args: string[]): string => {
  const r = spawnSync('git', args, { cwd: REPO, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};

/** The working tree, or a commit exported under the output directory with the working tree's node_modules. */
function sourceRoot(options: Options): { root: string; label: string; cleanup: () => void } {
  if (!options.at) return { root: REPO, label: `working tree at ${git('rev-parse', '--short', 'HEAD')}`, cleanup: () => {} };
  const commit = git('rev-parse', '--verify', `${options.at}^{commit}`);
  const root = join(options.out, `at-${commit.slice(0, 12)}`);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  // Without its tests: the export sits inside the working tree, where vitest would find them.
  const r = spawnSync('sh', ['-c', 'git archive --format=tar "$1" -- . ":(exclude)tests" | tar -x -C "$2"', 'sh', commit, root], { cwd: REPO, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`Could not export ${options.at}: ${r.stderr}`);
  symlinkSync(join(REPO, 'node_modules'), join(root, 'node_modules'), 'dir');
  return { root, label: `${options.at} (${commit.slice(0, 9)})`, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

interface ManifestChunk {
  file: string;
  src?: string;
  isEntry?: boolean;
  isDynamicEntry?: boolean;
  imports?: string[];
  dynamicImports?: string[];
  css?: string[];
}
type Manifest = Record<string, ManifestChunk>;

async function buildSite(root: string, outDir: string): Promise<Manifest> {
  const { build } = await import('vite');
  await build({ root, configFile: join(root, 'vite.config.ts'), logLevel: 'warn', build: { outDir, emptyOutDir: true, manifest: true } });
  return JSON.parse(readFileSync(join(outDir, '.vite', 'manifest.json'), 'utf8')) as Manifest;
}

/**
 * The English dictionaries each lazy module waits for, read from the sources: withDictionaries([...], () =>
 * import('...')) calls, and the modules of src/i18n/dictionaries.ts. Empty for code from before the dictionaries.
 */
function dictionariesOf(root: string): Map<string, string[]> {
  const list = join(root, 'src/i18n/dictionaries.ts');
  if (!existsSync(list)) return new Map();
  const moduleOf = new Map([...readFileSync(list, 'utf8').matchAll(/['"]?([\w-]+)['"]?:\s*\{\s*module:\s*'([^']+)'/g)].map((m) => [m[1]!, m[2]!]));
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : name.endsWith('.ts') ? [join(dir, name)] : []));
  const out = new Map<string, string[]>();
  for (const file of walk(join(root, 'src'))) {
    for (const m of readFileSync(file, 'utf8').matchAll(/withDictionaries\(\s*\[([^\]]*)\]\s*,\s*\(\)\s*=>\s*import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const target = relative(root, join(dirname(file), m[2]!)).split('\\').join('/');
      const names = [...m[1]!.matchAll(/['"]([^'"]+)['"]/g)].map((n) => n[1]!);
      out.set(target, [...(out.get(target) ?? []), ...names.map((n) => moduleOf.get(n)!).filter(Boolean)]);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Sizes

const kb = (bytes: number): number => Math.round(bytes / 10) / 100;

function main(options: Options, manifest: Manifest, dist: string, root: string, label: string): boolean {
  const gz = new Map<string, number>();
  const raw = new Map<string, number>();
  const sizeOf = (file: string): number => {
    if (!gz.has(file)) {
      const bytes = readFileSync(join(dist, file));
      raw.set(file, bytes.length);
      gz.set(file, gzipSync(bytes).length);
    }
    return gz.get(file)!;
  };
  /** The files a chunk needs before it runs: itself, its CSS and what it imports statically, all the way down. */
  const closure = (keys: string[], into = new Set<string>()): Set<string> => {
    const seen = new Set<string>();
    const walk = (key: string): void => {
      if (seen.has(key)) return;
      seen.add(key);
      const chunk = manifest[key];
      if (!chunk) return;
      into.add(chunk.file);
      for (const css of chunk.css ?? []) into.add(css);
      for (const next of chunk.imports ?? []) walk(next);
    };
    for (const key of keys) walk(key);
    return into;
  };
  const total = (files: Set<string>): number => [...files].reduce((sum, f) => sum + sizeOf(f), 0);
  const entry = Object.keys(manifest).find((k) => manifest[k]!.isEntry)!;
  // Before the shell was a chunk of its own, the entry was the main chunk too.
  const shellKey = manifest[SHELL]?.isDynamicEntry ? SHELL : entry;
  const loaderFiles = new Set([manifest[entry]!.file, ...(manifest[entry]!.css ?? [])]);
  const mainFiles = closure([shellKey]);
  for (const file of loaderFiles) if (shellKey !== entry) mainFiles.delete(file);
  const loader = total(loaderFiles);
  const mainSize = total(mainFiles);

  const dictionaries = dictionariesOf(root);
  const pages = PAGES.map((page) => {
    if (!existsSync(join(root, page.exists))) return { ...page, built: false, uk: 0, en: 0 };
    const keys = [entry, shellKey, ...page.modules.filter((m) => manifest[m])];
    const english = page.modules.flatMap((m) => dictionaries.get(m) ?? []).filter((m) => manifest[m]);
    const uk = closure(keys);
    const en = closure([...keys, ...english]);
    return { ...page, built: true, uk: total(uk), en: total(en) };
  });

  const worklets = Object.values(manifest)
    .map((c) => c.file)
    .concat(Object.values(manifest).flatMap((c) => (c as { assets?: string[] }).assets ?? []))
    .filter((f, i, all) => /(^|\/)worklet[^/]*\.js$/.test(f) && all.indexOf(f) === i);
  const workletChecks = worklets.map((file) => {
    const text = readFileSync(join(dist, file), 'utf8');
    const cyrillic = text.match(/.{0,30}[Ѐ-ӿ]+.{0,30}/)?.[0] ?? null;
    return { file, raw: Buffer.byteLength(text), gzip: sizeOf(file), cyrillic };
  });

  const failures: string[] = [];
  if (loader / 1000 > LIMITS.loader) failures.push(`loader ${kb(loader)} kB > ${LIMITS.loader}`);
  if (mainSize / 1000 > LIMITS.main) failures.push(`main chunk ${kb(mainSize)} kB > ${LIMITS.main}`);
  for (const p of pages) if (p.built && Math.max(p.uk, p.en) / 1000 > p.limit) failures.push(`${p.id} ${kb(Math.max(p.uk, p.en))} kB > ${p.limitText} = ${p.limit.toFixed(1)}`);
  if (!workletChecks.length) failures.push('no worklet chunk found');
  for (const w of workletChecks) {
    if (w.raw / 1000 > LIMITS.workletRaw) failures.push(`worklet ${w.file} ${kb(w.raw)} kB raw > ${LIMITS.workletRaw}`);
    if (w.cyrillic) failures.push(`worklet ${w.file} carries Cyrillic: ${w.cyrillic}`);
  }

  if (options.json) {
    const chunks = Object.fromEntries([...new Set(Object.values(manifest).flatMap((c) => [c.file, ...(c.css ?? [])]))].map((f) => [f, { raw: (sizeOf(f), raw.get(f)!), gzip: sizeOf(f) }]));
    console.log(JSON.stringify({ source: label, P_D6, loader, main: mainSize, pages, worklets: workletChecks, chunks, failures }, null, 2));
    return failures.length === 0;
  }

  console.log(`Bundle of ${label}. kB gzip (raw where said); P_Д6 = ${P_D6} kB.\n`);
  console.log('Chunks:');
  const files = [...new Set(Object.values(manifest).flatMap((c) => [c.file, ...(c.css ?? [])]))];
  for (const f of files.sort((a, b) => sizeOf(b) - sizeOf(a))) console.log(`  ${kb(sizeOf(f)).toFixed(2).padStart(8)}  ${kb(raw.get(f)!).toFixed(2).padStart(9)} raw  ${f}`);
  console.log('');
  console.log(`Loader (main.ts): ${kb(loader).toFixed(2)} kB, limit ${LIMITS.loader}`);
  console.log(`Main chunk (shell, Stage, Three.js, UI_EN): ${kb(mainSize).toFixed(2)} kB, limit ${LIMITS.main}`);
  console.log('');
  console.log('Paths (loader + main + section + feature):');
  for (const p of pages) {
    if (!p.built) {
      console.log(`  ${p.label.padEnd(16)} not built yet (no ${p.exists})`);
      continue;
    }
    const worst = Math.max(p.uk, p.en);
    console.log(`  ${p.label.padEnd(16)} uk ${kb(p.uk).toFixed(2).padStart(7)}  en ${kb(p.en).toFixed(2).padStart(7)}   limit ${p.limitText} = ${p.limit.toFixed(1)}  ${worst / 1000 > p.limit ? 'OVER' : 'ok'}`);
  }
  console.log('');
  for (const w of workletChecks) console.log(`Worklet ${w.file}: ${kb(w.raw).toFixed(2)} kB raw (limit ${LIMITS.workletRaw}), ${kb(w.gzip).toFixed(2)} kB gzip, ${w.cyrillic ? `Cyrillic: ${w.cyrillic}` : 'no Cyrillic'}`);
  console.log('');
  console.log(failures.length ? `Over budget:\n  ${failures.join('\n  ')}` : 'Within budget.');
  return failures.length === 0;
}

const options = parseArgs(process.argv.slice(2));
const source = sourceRoot(options);
try {
  const dist = join(options.out, 'dist');
  const manifest = await buildSite(source.root, dist);
  process.exitCode = main(options, manifest, dist, source.root, source.label) ? 0 : 1;
} finally {
  source.cleanup();
}
