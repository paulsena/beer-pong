// Pure game-state reducer. The server is authoritative and is the only caller that persists
// state; clients may call `reduce` for prediction/UI hints but always render server state.
//
// Rule spec (from PLAN.md, Game design -> Rules):
// - 10 cups per side in a 4-3-2-1 triangle; the first to clear the opponent's cups wins.
// - 2 throws per turn; if both land, you get both balls back.
// - Bounce shot: the ball hits the table, then a cup. It counts for 2 cups (the defender picks
//   the second). After the bounce, the defender can swat by clicking the ball.
// - Re-racks: 2 per game, chosen from preset shapes (diamond, line, triangle, zipper) at the start
//   of your turn.

import {
  type CupState,
  type RackShape,
  type Seat,
  type TableId,
  type EmoteId,
  RULES,
  initialRack,
} from './constants';

export interface PlayerInfo {
  name: string;
  /** Avatar color, '#rrggbb'. */
  color: string;
  connected: boolean;
}

export type GamePhase =
  /** Fewer than two players have joined. */
  | 'waiting'
  /** `turn` is throwing. */
  | 'playing'
  /** A bounce shot sank; `pendingPick.defender` must pick a second cup to remove. */
  | 'awaiting_pick'
  | 'game_over';

export interface PendingPick {
  /** The seat whose cup is being removed (the defender). */
  defender: Seat;
  /** Cups still to be picked (normally 1). */
  remaining: number;
}

export interface GameState {
  phase: GamePhase;
  table: TableId;
  players: [PlayerInfo | null, PlayerInfo | null];
  /** sides[s] = cups seat s defends (at seat s's end of the table). */
  sides: [CupState[], CupState[]];
  /** Re-racks seat s may still request (applied to the opponent's cups). */
  reracksLeft: [number, number];
  /** Seat currently throwing. */
  turn: Seat;
  /** Throws remaining in the current turn (including balls back). */
  throwsLeft: number;
  /** Successful (sinking) throws in the current pair of throws, for balls back. */
  madeThisRound: number;
  /** True until the first throw of a turn; re-racks are only legal while true. */
  canRerack: boolean;
  pendingPick: PendingPick | null;
  winner: Seat | null;
  /**
   * Id of the next/current throw. A `throw_result` must carry this id; reducing it increments
   * the counter. Ball-state and swat messages are tagged with it too.
   */
  throwId: number;
}

export type ThrowResult =
  | { kind: 'sink'; cupId: number; bounced: boolean }
  | { kind: 'miss' }
  | { kind: 'swatted' };

export type GameAction =
  | { type: 'join'; seat: Seat; name: string; color: string }
  | { type: 'presence'; seat: Seat; connected: boolean }
  /** Thrower asks to re-rack the opponent's remaining cups. */
  | { type: 'rerack'; seat: Seat; shape: RackShape }
  /** Thrower reports the outcome of throw `throwId`. */
  | { type: 'throw_result'; seat: Seat; throwId: number; result: ThrowResult }
  /** Defender picks the extra cup to remove after a bounce sink. */
  | { type: 'pick_cup'; seat: Seat; cupId: number }
  /** Reset to a fresh game with the same players and table (after game_over). */
  | { type: 'rematch'; seat: Seat };

/** Things that happened, for FX/audio/HUD. Emitted by `reduce` alongside the new state. */
export type GameEvent =
  | { type: 'game_started' }
  | { type: 'cup_removed'; side: Seat; cupId: number; cause: 'sink' | 'bounce_pick' }
  | { type: 'bounce_sink'; side: Seat; cupId: number }
  | { type: 'miss'; seat: Seat }
  | { type: 'swatted'; seat: Seat }
  | { type: 'balls_back'; seat: Seat }
  | { type: 'turn_changed'; turn: Seat }
  | { type: 'reracked'; side: Seat; shape: RackShape }
  | { type: 'pick_required'; defender: Seat }
  | { type: 'game_over'; winner: Seat };

export type RuleError =
  | 'not_your_turn'
  | 'wrong_phase'
  | 'stale_throw'
  | 'unknown_cup'
  | 'no_reracks_left'
  | 'rerack_not_allowed'
  | 'seat_taken';

export type ReduceResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; state: GameState; error: RuleError };

export function createInitialState(table: TableId): GameState {
  return {
    phase: 'waiting',
    table,
    players: [null, null],
    sides: [initialRack(), initialRack()],
    reracksLeft: [RULES.reracksPerGame, RULES.reracksPerGame],
    turn: 0,
    throwsLeft: RULES.throwsPerTurn,
    madeThisRound: 0,
    canRerack: true,
    pendingPick: null,
    winner: null,
    throwId: 0,
  };
}

/**
 * Apply an action. Never mutates `state`. Illegal actions return `{ ok: false }` with the
 * unchanged state.
 *
 * TODO(track B): implement every rule in the spec above. Notes:
 * - Game starts ('game_started', phase 'playing', turn 0) once both seats have joined.
 * - Seat `s` throws at `sides[otherSeat(s)]`.
 * - Balls back: if both throws of a pair sink, throwsLeft resets to 2 (re-rack not allowed).
 * - A bounce sink removes the hit cup and, if cups remain, enters 'awaiting_pick'; the turn
 *   continues (or passes) only after the pick. A bounce sink counts as a make for balls back.
 * - Swatted counts as a miss.
 * - Re-rack: thrower only, while canRerack, reracksLeft[seat] > 0; reassigns surviving cup ids
 *   (ascending) to rackLayout(shape, count) positions on the opponent's side.
 * - Win when a side reaches 0 cups: phase 'game_over', winner = thrower.
 * - Presence changes never change the phase.
 */
export function reduce(state: GameState, action: GameAction): ReduceResult {
  void action;
  return { ok: true, state, events: [] };
}

// Re-exported for convenience in reducers/UI.
export type { CupState, RackShape, Seat, TableId, EmoteId };
