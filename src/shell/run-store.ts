// Results that outlive a page (RunStore in section.ts), such as the last dyno run. Kept for the visit only.

import type { RunStore } from './section.ts';

export class ShellRuns implements RunStore {
  private readonly runs = new Map<string, unknown>();

  get<T>(key: string): T | undefined {
    return this.runs.get(key) as T | undefined;
  }

  set<T>(key: string, value: T): void {
    this.runs.set(key, value);
  }
}
