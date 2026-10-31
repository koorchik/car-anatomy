// Small sample-rate DSP blocks. Allocation happens only in constructors, never per sample.

/** Fractional delay line, linear interpolation. */
export class Delay {
  private readonly buf: Float32Array;
  private readonly mask: number;
  private w = 0;

  constructor(maxSamples: number) {
    let size = 2;
    while (size < maxSamples + 2) size *= 2;
    this.buf = new Float32Array(size);
    this.mask = size - 1;
  }

  write(x: number): void {
    this.buf[this.w] = x;
    this.w = (this.w + 1) & this.mask;
  }

  /** Reads `d` samples back from the most recent write. */
  read(d: number): number {
    const pos = this.w - 1 - d;
    const i = Math.floor(pos);
    const f = pos - i;
    const a = this.buf[i & this.mask]!;
    const b = this.buf[(i + 1) & this.mask]!;
    return a + (b - a) * f;
  }
}

export class OnePoleLP {
  private y = 0;
  private a = 1;

  setCutoff(hz: number, fs: number): void {
    this.a = 1 - Math.exp((-2 * Math.PI * hz) / fs);
  }

  process(x: number): number {
    this.y += this.a * (x - this.y);
    return this.y;
  }
}

export class OnePoleHP {
  private lp = new OnePoleLP();

  setCutoff(hz: number, fs: number): void {
    this.lp.setCutoff(hz, fs);
  }

  process(x: number): number {
    return x - this.lp.process(x);
  }
}

/** RBJ biquad in transposed direct form II. */
export class Biquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private z1 = 0;
  private z2 = 0;

  private set(b0: number, b1: number, b2: number, a0: number, a1: number, a2: number): void {
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
  }

  lowpass(hz: number, q: number, fs: number): this {
    const w = (2 * Math.PI * Math.min(hz, fs * 0.45)) / fs;
    const c = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    this.set((1 - c) / 2, 1 - c, (1 - c) / 2, 1 + alpha, -2 * c, 1 - alpha);
    return this;
  }

  highpass(hz: number, q: number, fs: number): this {
    const w = (2 * Math.PI * Math.min(hz, fs * 0.45)) / fs;
    const c = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    this.set((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + alpha, -2 * c, 1 - alpha);
    return this;
  }

  /** Band-pass with 0 dB peak gain. */
  bandpass(hz: number, q: number, fs: number): this {
    const w = (2 * Math.PI * Math.min(hz, fs * 0.45)) / fs;
    const c = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    this.set(alpha, 0, -alpha, 1 + alpha, -2 * c, 1 - alpha);
    return this;
  }

  peaking(hz: number, q: number, gainDb: number, fs: number): this {
    const a = Math.pow(10, gainDb / 40);
    const w = (2 * Math.PI * Math.min(hz, fs * 0.45)) / fs;
    const c = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    this.set(1 + alpha * a, -2 * c, 1 - alpha * a, 1 + alpha / a, -2 * c, 1 - alpha / a);
    return this;
  }

  process(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

/** One-dimensional pipe: everything entering comes out after `delay`, and bounces back with reflection `r`. */
export class Pipe {
  private readonly line: Delay;
  private readonly damp = new OnePoleLP();
  private delay: number;
  private readonly r: number;

  constructor(lengthM: number, soundSpeed: number, r: number, dampHz: number, fs: number) {
    this.delay = (lengthM / soundSpeed) * fs;
    this.line = new Delay(Math.ceil(this.delay * 2) + 4);
    this.r = r;
    this.damp.setCutoff(dampHz, fs);
  }

  process(x: number): number {
    const back = this.damp.process(this.line.read(this.delay * 2));
    const v = x + this.r * back;
    this.line.write(v);
    return this.line.read(this.delay);
  }
}

/** Fast noise source. xorshift32. */
export class Noise {
  private s: number;

  constructor(seed = 0x9e3779b9) {
    this.s = seed | 1;
  }

  /** Uniform in -1..1. */
  next(): number {
    let x = this.s;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.s = x;
    return (x | 0) / 2147483648;
  }

  /** Uniform in 0..1. */
  unit(): number {
    return this.next() * 0.5 + 0.5;
  }
}

/** Asymmetric soft clip. Keeps small signals linear. */
export const softClip = (x: number): number => {
  const a = Math.abs(x);
  if (a < 0.5) return x;
  const s = x > 0 ? 1 : -1;
  return s * (0.5 + 0.5 * Math.tanh((a - 0.5) / 0.5));
};
