// What the shell does between two sections (src/shell/section-dom.ts, src/shell/audio-host.ts): the shared places show
// only the shown section's elements, and the sound goes quiet for a section without an engine and comes back after it.

import { describe, expect, it } from 'vitest';
import { ShellAudio } from '../src/shell/audio-host.ts';
import { SECTION_AWAY, SectionDom, type DomElement } from '../src/shell/section-dom.ts';

/** An element of the page as SectionDom sees it. */
function element(name: string): DomElement & { name: string; away: boolean; isConnected: boolean } {
  return {
    name,
    away: false,
    isConnected: true,
    setAttribute(attr) {
      if (attr === SECTION_AWAY) this.away = true;
    },
    removeAttribute(attr) {
      if (attr === SECTION_AWAY) this.away = false;
    },
  };
}

describe('the shared places', () => {
  it('show only what the shown section put there, and leave the skeleton alone', () => {
    const skeleton = element('view tools');
    const tools = { children: [skeleton] as DomElement[] };
    const root = { children: [] as DomElement[] };
    const dom = new SectionDom([tools, root]);
    // The engines are shown and put their tools in, one of them later from a lazy feature.
    const explode = element('engine explode');
    tools.children.push(explode);
    const card = element('force card');
    root.children.push(card);
    // The suspensions come: what is there is the engines'.
    dom.claim('engines');
    dom.show('suspensions');
    const travel = element('travel slider');
    tools.children.push(travel);
    expect([explode.away, card.away, travel.away, skeleton.away]).toEqual([true, true, false, false]);
    // And back.
    dom.claim('suspensions');
    dom.show('engines');
    expect([explode.away, card.away, travel.away, skeleton.away]).toEqual([false, false, true, false]);
    // A claim is for good: the engines leaving again do not take the suspensions' slider.
    dom.claim('engines');
    dom.show('suspensions');
    expect([explode.away, card.away, travel.away]).toEqual([true, true, false]);
  });

  it('forgets elements that have left the page', () => {
    const tools = { children: [] as DomElement[] };
    const dom = new SectionDom([tools]);
    const gone = element('gone');
    tools.children.push(gone);
    dom.claim('engines');
    gone.isConnected = false;
    tools.children.length = 0;
    dom.show('suspensions');
    expect(gone.away).toBe(false);
  });
});

describe('the sound', () => {
  /** A Drive that records what the shell asks of it. */
  function fakeDrive() {
    const calls: string[] = [];
    const drive = {
      calls,
      pause: (on: boolean) => calls.push(`pause ${on}`),
      setLoad: () => calls.push('load off'),
      setPedal: () => calls.push('pedal 0'),
      lock: () => calls.push('unlock'),
      stop: () => calls.push('stop'),
      halt: () => calls.push('halt'),
      tick: () => (calls.push('tick'), { state: 'off' }),
      snapshot: () => ({ state: 'off' }),
    };
    return drive;
  }

  it('goes quiet on a section without an engine, stands still, and comes back off after it', () => {
    const audio = new ShellAudio();
    const drive = fakeDrive();
    audio.current = drive as never;
    audio.suspend();
    expect(drive.calls).toEqual(['load off', 'pedal 0', 'unlock', 'stop', 'halt', 'pause true']);
    drive.calls.length = 0;
    // A second address of the same section changes nothing, and the local copy is not stepped.
    audio.suspend();
    audio.tick(0.016, false);
    expect(drive.calls).toEqual([]);
    // The next section gets the sound back with the engine off.
    audio.release();
    expect(drive.calls).toEqual(['pause false', 'load off', 'pedal 0', 'unlock', 'stop']);
    drive.calls.length = 0;
    audio.tick(0.016, false);
    expect(drive.calls).toEqual(['tick']);
  });
});
