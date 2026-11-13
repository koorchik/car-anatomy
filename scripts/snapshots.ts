// Snapshots of the engine pages, taken the same way before and after a change to the shell (the plan of the whole car,
// «Знімки до й після»). Each page is built, opened in headless Chromium on the software renderer, frozen with
// window.__engine.freeze and shot twice: the DOM without the 3D picture, which must match exactly, and the 3D canvas
// alone, which may differ in at most 0.05 % of its pixels by a colour difference ΔE (CIE76) above 2.
//
//   node scripts/snapshots.ts reference [page...]             shoot the reference from the working tree
//   node scripts/snapshots.ts reference --at <git ref> [page...]   ... or from a commit, e.g. the base of a stage
//   node scripts/snapshots.ts compare [page...]               shoot the working tree and compare with the reference
//
// Options: --sizes 1440x900,390x844   --out .tmp/snapshots   --chrome <path> (or $CHROME; default google-chrome)
// Pages: v8-solid v8-xray v8-mechanism variant designer dyno systems sump (all by default).
// The shots land in <out>/reference and <out>/current: <page>@<w>x<h>.dom.html, .canvas.png and .page.png (the whole
// page, for the eye only), plus .canvas.diff.png where a comparison failed.

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { crc32, deflateSync, inflateSync } from 'node:zlib';
import { SNAPSHOT_FREEZE } from '../src/shell/freeze.ts';

const REPO = resolve(import.meta.dirname, '..');
/** Share of the canvas allowed to differ, and by how much a pixel may differ before it counts. */
const CANVAS_SHARE = 0.0005;
const DELTA_E = 2;

// ---------------------------------------------------------------------------------------------------------------
// The pages

interface ShotPage {
  id: string;
  hash: string;
  /** Run in the page after it has loaded, before the freeze: the clicks that make this page. */
  prepare?: string;
  /** True once the page has finished its own work, such as the oil page's laps. */
  ready?: string;
  /** Parts (userData.part) left out of the canvas comparison; the DOM and the whole-page shot still have them. */
  canvasWithout?: string[];
}

/** The engine is not started on any page, but on arrival the dial still winds down from where the last one left it. */
const AT_REST = `(() => { const s = window.__engine.drive.snapshot(); return s.state !== 'off' || s.rpm === 0; })()`;

const click = (selector: string): string => `document.querySelector(${JSON.stringify(selector)}).click()`;

const PAGES: ShotPage[] = [
  { id: 'v8-solid', hash: '#/engines/v8-cross', prepare: click('#view [data-v="solid"]') },
  { id: 'v8-xray', hash: '#/engines/v8-cross' },
  { id: 'v8-mechanism', hash: '#/engines/v8-cross', prepare: click('#view [data-v="mechanism"]') },
  { id: 'variant', hash: '#/engines/b6/porsche-cayman-981-3-4' },
  { id: 'designer', hash: '#/designer' },
  { id: 'dyno', hash: '#/engines/v8-cross', prepare: click('#dyno-toggle') },
  // The fuel layer is left out: its sparks and injections are events of a moving crank.
  { id: 'systems', hash: '#/engines/v8-cross', prepare: `${click('#systems-tool [data-layer="oil"]')}; ${click('#systems-tool [data-layer="coolant"]')}` },
  {
    id: 'sump',
    hash: '#/sump',
    // The panel's table of sumps fills in as each lap is worked out.
    ready: `!!window.__engine.sump && document.body.innerText.includes('Мін. тиск') && !document.body.innerText.includes('Рахую коло')`,
    // SwiftShader draws this one double-sided see-through surface in one of two ways from one browser to the next,
    // with the same vertices, matrices and draw order: it differs between two runs of unchanged code.
    canvasWithout: ['oil-body'],
  },
];

// ---------------------------------------------------------------------------------------------------------------
// Arguments

interface Options {
  mode: 'reference' | 'compare';
  at: string | null;
  pages: ShotPage[];
  sizes: Array<[number, number]>;
  out: string;
  chrome: string;
}

function parseArgs(argv: string[]): Options {
  const mode = argv[0];
  if (mode !== 'reference' && mode !== 'compare') {
    console.error('Usage: node scripts/snapshots.ts reference|compare [--at <git ref>] [--sizes 1440x900,390x844] [--out dir] [--chrome path] [page...]');
    console.error(`Pages: ${PAGES.map((p) => p.id).join(' ')}`);
    process.exit(2);
  }
  const options: Options = { mode, at: null, pages: [], sizes: [[1440, 900], [390, 844]], out: join(REPO, '.tmp', 'snapshots'), chrome: process.env.CHROME ?? '/usr/bin/google-chrome' };
  const wanted: string[] = [];
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]!;
    const value = (): string => {
      const v = argv[++i];
      if (!v) throw new Error(`${arg} needs a value`);
      return v;
    };
    if (arg === '--at') options.at = value();
    else if (arg === '--out') options.out = resolve(value());
    else if (arg === '--chrome') options.chrome = value();
    else if (arg === '--sizes') options.sizes = value().split(',').map((s) => s.split('x').map(Number) as [number, number]);
    else wanted.push(arg);
  }
  if (options.at && mode !== 'reference') throw new Error('--at only makes sense for the reference');
  const unknown = wanted.filter((id) => !PAGES.some((p) => p.id === id));
  if (unknown.length) throw new Error(`Unknown pages: ${unknown.join(', ')}`);
  options.pages = wanted.length ? PAGES.filter((p) => wanted.includes(p.id)) : PAGES;
  return options;
}

// ---------------------------------------------------------------------------------------------------------------
// The code to shoot: the working tree, or a commit exported next to it, built for production

const git = (...args: string[]): string => {
  const r = spawnSync('git', args, { cwd: REPO, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};

interface Source {
  root: string;
  label: string;
  commit: string;
  dirty: boolean;
  cleanup: () => void;
}

function sourceFor(options: Options): Source {
  if (!options.at) {
    return { root: REPO, label: 'working tree', commit: git('rev-parse', 'HEAD'), dirty: git('status', '--porcelain') !== '', cleanup: () => {} };
  }
  const commit = git('rev-parse', '--verify', `${options.at}^{commit}`);
  const root = join(options.out, `at-${commit.slice(0, 12)}`);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  // Without its tests: the export sits inside the working tree, where vitest would find them.
  const r = spawnSync('sh', ['-c', 'git archive --format=tar "$1" -- . ":(exclude)tests" | tar -x -C "$2"', 'sh', commit, root], { cwd: REPO, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`Could not export ${options.at}: ${r.stderr}`);
  if (readFileSync(join(root, 'package-lock.json'), 'utf8') !== readFileSync(join(REPO, 'package-lock.json'), 'utf8')) {
    console.warn(`! ${options.at} has another package-lock.json: it is built with the working tree's node_modules.`);
  }
  symlinkSync(join(REPO, 'node_modules'), join(root, 'node_modules'), 'dir');
  return { root, label: options.at, commit, dirty: false, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

async function buildSite(root: string, outDir: string): Promise<void> {
  const { build } = await import('vite');
  await build({ root, configFile: join(root, 'vite.config.ts'), logLevel: 'warn', build: { outDir, emptyOutDir: true } });
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
};

/** A plain static server over the build, on a free port. */
function serve(dir: string): Promise<Server> {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    let file = normalize(join(dir, path));
    if (!file.startsWith(dir + sep) && file !== dir) {
      res.writeHead(403).end();
      return;
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    createReadStream(file).pipe(res);
  });
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

// ---------------------------------------------------------------------------------------------------------------
// Chromium over the DevTools protocol, with the WebSocket built into Node

interface CdpMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { message: string };
  sessionId?: string;
}

class Cdp {
  private readonly ws: WebSocket;
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (r: Record<string, unknown>) => void; reject: (e: Error) => void }>();
  private readonly listeners = new Set<(m: CdpMessage) => void>();

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as CdpMessage;
      if (message.id !== undefined) {
        const waiting = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) waiting?.reject(new Error(message.error.message));
        else waiting?.resolve(message.result ?? {});
        return;
      }
      for (const listener of this.listeners) listener(message);
    });
  }

  static connect(url: string): Promise<Cdp> {
    return new Promise((done, fail) => {
      const ws = new WebSocket(url);
      ws.addEventListener('open', () => done(new Cdp(ws)));
      ws.addEventListener('error', () => fail(new Error(`Could not connect to ${url}`)));
    });
  }

  send<T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}, sessionId?: string, timeoutMs = 60_000): Promise<T> {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise<T>((done, fail) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        fail(new Error(`${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (r) => {
          clearTimeout(timer);
          done(r as T);
        },
        reject: (e) => {
          clearTimeout(timer);
          fail(e);
        },
      });
    });
  }

  on(listener: (m: CdpMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.ws.close();
  }
}

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

async function launchChrome(path: string, profile: string): Promise<{ child: ChildProcess; cdp: Cdp }> {
  rmSync(profile, { recursive: true, force: true });
  mkdirSync(profile, { recursive: true });
  const child = spawn(
    path,
    [
      '--headless=new',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--mute-audio',
      '--force-color-profile=srgb',
      '--force-device-scale-factor=1',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--window-size=1440,900',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  const portFile = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 300 && !existsSync(portFile); i++) await sleep(100);
  if (!existsSync(portFile)) {
    child.kill();
    throw new Error(`${path} did not start`);
  }
  const [port, wsPath] = readFileSync(portFile, 'utf8').trim().split('\n');
  return { child, cdp: await Cdp.connect(`ws://127.0.0.1:${port}${wsPath}`) };
}

// ---------------------------------------------------------------------------------------------------------------
// One shot

/** The DOM as text: the root's attributes, the title and the body, one tag per line, after the address. */
const SERIALIZE = `(() => {
  const attrs = (el) => Array.from(el.attributes, (a) => ' ' + a.name + '="' + a.value + '"').join('');
  return '<!-- ' + location.hash + ' -->\\n<html' + attrs(document.documentElement) + '>\\n<title>' + document.title + '</title>\\n'
    + document.body.outerHTML.replace(/></g, '>\\n<') + '\\n';
})()`;

const FRAMES = `(n) => new Promise((done) => { const step = () => (n-- <= 0 ? done() : requestAnimationFrame(step)); requestAnimationFrame(step); })`;

interface Shot {
  dom: string;
  canvas: Buffer;
  page: Buffer;
  errors: string[];
}

async function shoot(cdp: Cdp, url: string, page: ShotPage, [width, height]: [number, number]): Promise<Shot> {
  const { browserContextId } = await cdp.send<{ browserContextId: string }>('Target.createBrowserContext', { disposeOnDetach: true });
  const { targetId } = await cdp.send<{ targetId: string }>('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true });
  const errors: string[] = [];
  let loaded = false;
  const off = cdp.on((m) => {
    if (m.sessionId !== sessionId) return;
    const p = m.params ?? {};
    if (m.method === 'Page.loadEventFired') loaded = true;
    else if (m.method === 'Runtime.exceptionThrown') errors.push(`exception: ${JSON.stringify((p.exceptionDetails as { exception?: { description?: string } })?.exception?.description ?? p.exceptionDetails)}`);
    else if (m.method === 'Runtime.consoleAPICalled' && (p.type === 'error' || p.type === 'assert')) errors.push(`console.${p.type}: ${(p.args as Array<{ value?: unknown; description?: string }>).map((a) => a.value ?? a.description).join(' ')}`);
    else if (m.method === 'Log.entryAdded' && (p.entry as { level?: string }).level === 'error') errors.push(`log: ${(p.entry as { text?: string; url?: string }).text} ${(p.entry as { url?: string }).url ?? ''}`);
  });
  const send = <T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}, timeoutMs?: number): Promise<T> => cdp.send<T>(method, params, sessionId, timeoutMs);
  const evaluate = async <T>(expression: string, timeoutMs = 60_000): Promise<T> => {
    const r = await send<{ result: { value?: T }; exceptionDetails?: { text: string; exception?: { description?: string } } }>('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, timeoutMs);
    if (r.exceptionDetails) throw new Error(`${page.id}: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value as T;
  };
  const waitFor = async (expression: string, what: string, timeoutMs = 90_000): Promise<void> => {
    const start = Date.now();
    while (!(await evaluate<boolean>(`!!(${expression})`))) {
      if (Date.now() - start > timeoutMs) throw new Error(`${page.id}: timed out waiting for ${what}`);
      await sleep(200);
    }
  };
  try {
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await send('Page.navigate', { url: `${url}${page.hash}` });
    const start = Date.now();
    while (!loaded && Date.now() - start < 60_000) await sleep(100);
    if (!loaded) throw new Error(`${page.id}: the page did not load`);
    await waitFor('window.__engine && window.__engine.freeze', 'window.__engine.freeze');
    await evaluate(`document.fonts.ready.then(() => (${FRAMES})(2))`);
    // Whether the part hint shows depends on what the visitor has done before; the shots are of the page itself.
    await evaluate(`{ const callout = document.getElementById('parts-callout'); if (callout) callout.hidden = true; }`);
    if (page.prepare) await evaluate(page.prepare);
    if (page.ready) await waitFor(page.ready, 'the page to finish its work', 180_000);
    await waitFor(AT_REST, 'the engine to come to rest');
    await evaluate(`(${FRAMES})(2)`);
    await evaluate(`window.__engine.freeze(${JSON.stringify(SNAPSHOT_FREEZE)})`);
    await evaluate(`(${FRAMES})(2)`);
    // Timers of the page (the designer's address, readouts that refresh a few times a second) settle by themselves.
    let dom = await evaluate<string>(SERIALIZE);
    for (let i = 0; ; i++) {
      await sleep(500);
      await evaluate(`(${FRAMES})(2)`);
      const again = await evaluate<string>(SERIALIZE);
      if (again === dom) break;
      if (i > 60) throw new Error(`${page.id}: the DOM keeps changing after the freeze`);
      dom = again;
    }
    const capture = async (): Promise<Buffer> => Buffer.from((await send<{ data: string }>('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })).data, 'base64');
    const pageShot = await capture();
    // Only the canvas: everything else turns invisible without moving, so nothing is laid out again.
    await evaluate(`{ const s = document.createElement('style'); s.id = '__snapshot-canvas'; s.textContent = 'body * { visibility: hidden !important; } #stage { visibility: visible !important; }'; document.head.append(s); }`);
    const parts = JSON.stringify(page.canvasWithout ?? []);
    await evaluate(`window.__snapshotHidden = []; window.__engine.stage.scene.traverse((o) => { if (o.visible && ${parts}.includes(o.userData.part)) { o.visible = false; window.__snapshotHidden.push(o); } })`);
    await evaluate(`(${FRAMES})(2)`);
    const canvas = await capture();
    await evaluate(`for (const o of window.__snapshotHidden) o.visible = true; delete window.__snapshotHidden; document.getElementById('__snapshot-canvas').remove()`);
    return { dom, canvas, page: pageShot, errors };
  } finally {
    off();
    await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
    await cdp.send('Target.disposeBrowserContext', { browserContextId }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------------------------------------------
// PNG in and out (8-bit RGB or RGBA, not interlaced: what Chromium writes)

interface Image {
  width: number;
  height: number;
  /** RGBA, 4 bytes a pixel. */
  data: Uint8Array;
}

function decodePng(file: Buffer): Image {
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Buffer[] = [];
  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString('latin1', offset + 4, offset + 8);
    const body = file.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const depth = body[8];
      const color = body[9];
      if (depth !== 8 || (color !== 2 && color !== 6) || body[12] !== 0) throw new Error(`Unsupported PNG: depth ${depth}, colour ${color}, interlace ${body[12]}`);
      channels = color === 6 ? 4 : 3;
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = y * stride;
    const up = out - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[out + x - channels]! : 0;
      const b = y > 0 ? pixels[up + x]! : 0;
      const c = x >= channels && y > 0 ? pixels[up + x - channels]! : 0;
      let predicted = 0;
      if (filter === 1) predicted = a;
      else if (filter === 2) predicted = b;
      else if (filter === 3) predicted = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        predicted = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      pixels[out + x] = (line[x]! + predicted) & 0xff;
    }
  }
  if (channels === 4) return { width, height, data: pixels };
  const data = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < pixels.length; i += 3, j += 4) {
    data[j] = pixels[i]!;
    data[j + 1] = pixels[i + 1]!;
    data[j + 2] = pixels[i + 2]!;
    data[j + 3] = 255;
  }
  return { width, height, data };
}

function encodePng(image: Image): Buffer {
  const chunk = (type: string, body: Buffer): Buffer => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, 'latin1');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
    return Buffer.concat([head, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(image.width, 0);
  header.writeUInt32BE(image.height, 4);
  header[8] = 8;
  header[9] = 6;
  const stride = image.width * 4;
  const raw = Buffer.alloc((stride + 1) * image.height);
  for (let y = 0; y < image.height; y++) raw.set(image.data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---------------------------------------------------------------------------------------------------------------
// Comparison

const LINEAR = Float64Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

function lab(data: Uint8Array, i: number, out: [number, number, number]): void {
  const r = LINEAR[data[i]!]!;
  const g = LINEAR[data[i + 1]!]!;
  const b = LINEAR[data[i + 2]!]!;
  // sRGB to XYZ under D65, scaled by the white point.
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const x = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047);
  const y = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
  const z = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
  out[0] = 116 * y - 16;
  out[1] = 500 * (x - y);
  out[2] = 200 * (y - z);
}

interface CanvasDiff {
  differing: number;
  total: number;
  diff: Image;
}

function compareCanvas(a: Image, b: Image): CanvasDiff | null {
  if (a.width !== b.width || a.height !== b.height) return null;
  const la: [number, number, number] = [0, 0, 0];
  const lb: [number, number, number] = [0, 0, 0];
  const diff = new Uint8Array(a.data.length);
  let differing = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    let far = false;
    if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) {
      lab(a.data, i, la);
      lab(b.data, i, lb);
      far = Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]) > DELTA_E;
    }
    // The reference dimmed to grey, the differing pixels in red.
    const grey = (a.data[i]! + a.data[i + 1]! + a.data[i + 2]!) / 9 + 20;
    diff[i] = far ? 255 : grey;
    diff[i + 1] = far ? 0 : grey;
    diff[i + 2] = far ? 0 : grey;
    diff[i + 3] = 255;
    if (far) differing++;
  }
  return { differing, total: a.width * a.height, diff: { width: a.width, height: a.height, data: diff } };
}

function firstDifference(a: string, b: string): string {
  const la = a.split('\n');
  const lb = b.split('\n');
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) return `line ${i + 1}:\n    reference: ${(la[i] ?? '(end)').slice(0, 300)}\n    current:   ${(lb[i] ?? '(end)').slice(0, 300)}`;
  }
  return '';
}

// ---------------------------------------------------------------------------------------------------------------

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const set = options.mode === 'reference' ? 'reference' : 'current';
  const shotsDir = join(options.out, set);
  const referenceDir = join(options.out, 'reference');
  if (options.mode === 'compare' && !existsSync(join(referenceDir, 'meta.json'))) throw new Error(`No reference in ${referenceDir}: run "node scripts/snapshots.ts reference" first`);
  const source = sourceFor(options);
  const buildDir = join(options.out, `build-${set}`);
  const profile = join(options.out, `chrome-${process.pid}`);
  let server: Server | null = null;
  let chrome: { child: ChildProcess; cdp: Cdp } | null = null;
  try {
    console.log(`Building ${source.label} (${source.commit.slice(0, 12)}${source.dirty ? ' with uncommitted changes' : ''})`);
    await buildSite(source.root, buildDir);
    server = await serve(buildDir);
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
    chrome = await launchChrome(options.chrome, profile);
    rmSync(shotsDir, { recursive: true, force: true });
    mkdirSync(shotsDir, { recursive: true });
    const meta = { label: source.label, commit: source.commit, dirty: source.dirty, takenAt: new Date().toISOString(), sizes: options.sizes, pages: options.pages.map((p) => p.id), freeze: SNAPSHOT_FREEZE };
    writeFileSync(join(shotsDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
    const reference = options.mode === 'compare' ? (JSON.parse(readFileSync(join(referenceDir, 'meta.json'), 'utf8')) as typeof meta) : null;
    if (reference) console.log(`Reference: ${reference.label} (${reference.commit.slice(0, 12)}${reference.dirty ? ' with uncommitted changes' : ''}), taken ${reference.takenAt}`);
    let failed = 0;
    const log: string[] = [];
    for (const page of options.pages) {
      for (const size of options.sizes) {
        const name = `${page.id}@${size[0]}x${size[1]}`;
        const shot = await shoot(chrome.cdp, url, page, size);
        writeFileSync(join(shotsDir, `${name}.dom.html`), shot.dom);
        writeFileSync(join(shotsDir, `${name}.canvas.png`), shot.canvas);
        writeFileSync(join(shotsDir, `${name}.page.png`), shot.page);
        const notes = shot.errors.map((e) => `    ${e}`);
        if (shot.errors.length) log.push(`${name}\n${notes.join('\n')}`);
        if (!reference) {
          console.log(`  ${name}: shot${shot.errors.length ? `, ${shot.errors.length} console errors` : ''}`);
          for (const n of notes) console.log(n);
          continue;
        }
        const refDom = join(referenceDir, `${name}.dom.html`);
        const refCanvas = join(referenceDir, `${name}.canvas.png`);
        if (!existsSync(refDom) || !existsSync(refCanvas)) {
          console.log(`  ${name}: no reference shot`);
          failed++;
          continue;
        }
        const wasDom = readFileSync(refDom, 'utf8');
        const domSame = wasDom === shot.dom;
        const canvas = compareCanvas(decodePng(readFileSync(refCanvas)), decodePng(shot.canvas));
        const share = canvas ? canvas.differing / canvas.total : 1;
        const canvasSame = share <= CANVAS_SHARE;
        if (canvas && canvas.differing > 0) writeFileSync(join(shotsDir, `${name}.canvas.diff.png`), encodePng(canvas.diff));
        const ok = domSame && canvasSame;
        if (!ok) failed++;
        const canvasText = canvas ? `${canvas.differing} px (${(share * 100).toFixed(3)} %) beyond ΔE ${DELTA_E}` : 'another size';
        console.log(`  ${ok ? 'same' : 'DIFFERENT'} ${name}: DOM ${domSame ? 'same' : 'different'}, canvas ${canvasText}`);
        if (!domSame) console.log(`    ${firstDifference(wasDom, shot.dom)}`);
        for (const n of notes) console.log(n);
      }
    }
    writeFileSync(join(shotsDir, 'console.txt'), log.join('\n') + (log.length ? '\n' : ''));
    console.log(`Shots in ${shotsDir}`);
    if (reference) {
      console.log(failed ? `${failed} shots differ from the reference.` : 'All shots match the reference.');
      process.exitCode = failed ? 1 : 0;
    }
  } finally {
    if (chrome) {
      const { child, cdp } = chrome;
      cdp.close();
      // Only the browser this run started; its profile goes once it has stopped writing to it.
      const exited = child.exitCode !== null ? Promise.resolve() : new Promise<void>((done) => child.once('exit', () => done()));
      child.kill();
      await Promise.race([exited, sleep(10_000)]);
    }
    server?.close();
    source.cleanup();
    rmSync(profile, { recursive: true, force: true });
  }
}

await main();
