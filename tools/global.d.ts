import type { GameState, Seat } from '@bp/shared';

declare global {
  interface Window {
    __shotReady?: boolean;
    __bp?: {
      game: { currentState: GameState; scriptedThrow(cupId: number, miss?: boolean): boolean } | null;
      seat: Seat | null;
      code: string | null;
    };
  }
}
export {};
