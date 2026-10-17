// Sound effects + ambience. (Track E)
import type { TableId } from '@bp/shared';

export type SoundName = 'throw' | 'table_bounce' | 'cup_hit' | 'splash' | 'swat' | 'cheer' | 'groan' | 'win' | 'lose' | 'ui_click';

export interface AudioSystem {
  /** Must be called from a user gesture before sounds play. */
  unlock(): Promise<void>;
  play(name: SoundName, opts?: { volume?: number }): void;
  setAmbience(table: TableId | null): void;
  setMuted(muted: boolean): void;
}

export function createAudio(): AudioSystem {
  return { unlock: async () => {}, play() {}, setAmbience() {}, setMuted() {} };
}
