// Live sound spectrum with the firing frequency marked: what you hear, drawn against what the engine does.

const MIN_HZ = 20;
const MAX_HZ = 8000;
const FLOOR_DB = -90;
const TOP_DB = -15;

const TICKS = [50, 100, 200, 500, 1000, 2000, 5000];

export class Spectrum {
  readonly element: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private data: Float32Array<ArrayBuffer> | null = null;

  constructor() {
    this.element = document.createElement('canvas');
    this.element.className = 'spectrum-canvas';
    this.element.setAttribute('role', 'img');
    this.element.setAttribute('aria-label', 'Спектр звуку двигуна наживо. Відмітка показує частоту спалахів.');
    this.ctx = this.element.getContext('2d')!;
  }

  resize(width: number, height: number): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = width;
    this.height = height;
    this.element.width = Math.round(width * this.dpr);
    this.element.height = Math.round(height * this.dpr);
  }

  private xOf(hz: number): number {
    return (Math.log(hz / MIN_HZ) / Math.log(MAX_HZ / MIN_HZ)) * this.width;
  }

  draw(analyser: AnalyserNode | null, sampleRate: number, firingHz: number): void {
    if (this.width <= 0) return;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    const axisH = 15;
    const plotH = this.height - axisH;

    // Quiet axis: frequency only.
    ctx.font = '11px "Fira Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    for (const hz of TICKS) {
      const x = this.xOf(hz);
      if (x < 12 || x > this.width - 14) continue;
      ctx.strokeStyle = 'rgba(236,230,214,0.09)';
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, plotH);
      ctx.stroke();
      ctx.fillStyle = '#a9b7b3';
      ctx.fillText(hz >= 1000 ? `${hz / 1000} кГц` : `${hz}`, x, this.height - 3);
    }

    if (!analyser) {
      ctx.fillStyle = '#a9b7b3';
      ctx.textAlign = 'center';
      ctx.font = '13px "Fira Sans", sans-serif';
      ctx.fillText('Спектр зʼявиться після запуску', this.width / 2, plotH / 2 + 4);
      return;
    }

    // Firing tone and its harmonics.
    if (firingHz > MIN_HZ / 2) {
      for (let k = 1; k <= 8; k++) {
        const hz = firingHz * k;
        if (hz > MAX_HZ || hz < MIN_HZ) continue;
        const x = this.xOf(hz);
        ctx.strokeStyle = k === 1 ? '#ff7a1a' : 'rgba(255,122,26,0.28)';
        ctx.lineWidth = k === 1 ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, plotH);
        ctx.stroke();
      }
    }

    if (!this.data || this.data.length !== analyser.frequencyBinCount) {
      this.data = new Float32Array(new ArrayBuffer(analyser.frequencyBinCount * 4));
    }
    analyser.getFloatFrequencyData(this.data);
    const hzPerBin = sampleRate / 2 / this.data.length;

    const path = new Path2D();
    path.moveTo(0, plotH);
    const columns = Math.floor(this.width / 2);
    for (let i = 0; i <= columns; i++) {
      const f0 = MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, i / columns);
      const f1 = MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, (i + 1) / columns);
      const b0 = Math.max(0, Math.floor(f0 / hzPerBin));
      const b1 = Math.max(b0 + 1, Math.ceil(f1 / hzPerBin));
      let peak = -200;
      for (let b = b0; b < b1 && b < this.data.length; b++) peak = Math.max(peak, this.data[b]!);
      const v = (peak - FLOOR_DB) / (TOP_DB - FLOOR_DB);
      const y = plotH - Math.max(0, Math.min(1, v)) * plotH;
      path.lineTo((i / columns) * this.width, y);
    }
    path.lineTo(this.width, plotH);
    path.closePath();
    ctx.fillStyle = 'rgba(236,230,214,0.18)';
    ctx.fill(path);
    ctx.strokeStyle = '#ece6d6';
    ctx.lineWidth = 1.5;
    ctx.stroke(path);
    ctx.lineWidth = 1;
  }
}
