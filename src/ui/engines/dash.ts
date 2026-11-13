// The engine pages' dash: start button, condition, sound, tachometer, pedal, the cycle in firing order and the
// spectrum. The oil page has a dash of its own (sump-host.ts).

import type { ListenPosition } from '../../audio/synth.ts';
import { t } from '../../i18n/t.ts';
import { onSegment, setSegment } from '../../shell/segmented.ts';
import { FiringDiagram } from '../firing-diagram.ts';
import { Spectrum } from '../spectrum.ts';
import { Ignition } from '../widgets/ignition.ts';
import { Pedal } from '../widgets/pedal.ts';
import { Tacho } from '../widgets/tacho.ts';
import { $ } from './dom.ts';
import { SVG_SOUND_OFF, SVG_SOUND_ON } from './markup.ts';
import type { EnginesSection } from './section.ts';

export class EngineDash {
  readonly tacho: Tacho;
  readonly firing: FiringDiagram;
  readonly spectrum: Spectrum;
  readonly pedal: Pedal;
  readonly ignition: Ignition;
  private readonly section: EnginesSection;
  /** The rev limit the dial is drawn to now. */
  private tachoScale = 0;
  private volume = 0.8;
  private muted = false;

  constructor(section: EnginesSection) {
    this.section = section;
    this.tacho = new Tacho();
    $('tacho-wrap').append(this.tacho.element);
    this.firing = new FiringDiagram(section.ctx.slots.tooltip);
    $('firing-body').append(this.firing.element);
    this.spectrum = new Spectrum();
    $('spectrum-body').append(this.spectrum.element);
    const dash = section.ctx.slots.dash.parent;
    this.pedal = new Pedal(dash, {
      setThrottle: (value) => section.drive.setPedal(value),
      press: () => void section.pressThrottle(),
    });
    this.ignition = new Ignition(dash, () => void section.toggleIgnition());
    const listen = $('listen');
    onSegment(listen, (value) => {
      setSegment(listen, value);
      section.drive.setListen(value as ListenPosition);
    });
    $<HTMLInputElement>('volume').addEventListener('input', (event) => {
      this.volume = Number((event.target as HTMLInputElement).value);
      this.muted = this.volume === 0;
      this.syncSound();
    });
    $('mute').addEventListener('click', () => this.toggleMute());
  }

  toggleMute(): void {
    this.muted = !this.muted;
    this.syncSound();
  }

  /** The dial for a new engine: drawn to its rev limit. */
  configure(redlineRpm: number): void {
    this.tacho.configure(redlineRpm);
    this.tachoScale = redlineRpm;
  }

  /** The designer's zones on top of the dial, which is redrawn to the cut-off when that moved. */
  zones(safe: number, failure: number, cut: number): void {
    if (cut !== this.tachoScale) {
      this.tachoScale = cut;
      this.tacho.configure(cut);
    }
    this.tacho.setZones(safe, failure, cut);
  }

  private syncSound(): void {
    this.section.drive.setVolume(this.volume, this.muted);
    const button = $('mute');
    button.innerHTML = this.muted ? SVG_SOUND_OFF : SVG_SOUND_ON;
    button.setAttribute('aria-pressed', String(this.muted));
    button.setAttribute('aria-label', this.muted ? t('Увімкнути звук') : t('Вимкнути звук'));
  }
}
