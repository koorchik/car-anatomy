// The view control (ViewControl in section.ts): the whole model, the X-ray, or only the mechanism.

import type { ViewMode } from '../scene/model-types.ts';
import { onSegment, setSegment } from './segmented.ts';
import type { ViewControl } from './section.ts';

export class ShellView implements ViewControl {
  mode: ViewMode = 'xray';
  private readonly group: HTMLElement;
  private readonly listeners = new Set<(mode: ViewMode) => void>();

  /** `group` is the segmented control with a button per view (data-v). */
  constructor(group: HTMLElement) {
    this.group = group;
    onSegment(group, (value) => this.set(value as ViewMode));
  }

  set(mode: ViewMode): void {
    this.mode = mode;
    setSegment(this.group, mode);
    for (const listener of this.listeners) listener(mode);
  }

  onChange(listener: (mode: ViewMode) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
