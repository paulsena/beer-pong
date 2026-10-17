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
  otherSeat,
  rackLayout,
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
  /** Rematch votes during game_over; a new game starts once both seats have voted. */
  rematchVotes: [boolean, boolean];
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
  /** Vote for a rematch (after game_over). Both votes start a fresh game, same players and table. */
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
    rematchVotes: [false, false],
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
  const reject = (error: RuleError): ReduceResult => ({ ok: false, state, error });
  const next = structuredClone(state);
  const events: GameEvent[] = [];

  switch (action.type) {
    case 'join': {
      if (state.players[action.seat]?.connected) return reject('seat_taken');
      next.players[action.seat] = { name: action.name, color: action.color, connected: true };
      if (state.phase === 'waiting' && next.players.every(player => player !== null)) {
        next.phase = 'playing';
        next.turn = 0;
        events.push({ type: 'game_started' });
      }
      break;
    }
    case 'presence': {
      const player = next.players[action.seat];
      if (player) player.connected = action.connected;
      break;
    }
    case 'throw_result': {
      if (action.seat !== state.turn) return reject('not_your_turn');
      if (state.phase !== 'playing') return reject('wrong_phase');
      if (action.throwId !== state.throwId) return reject('stale_throw');
      const side = otherSeat(action.seat);
      const result = action.result;
      if (result.kind === 'sink' && !state.sides[side].some(cup => cup.id === result.cupId)) {
        return reject('unknown_cup');
      }
      next.throwId++;
      next.throwsLeft--;
      next.canRerack = false;
      if (result.kind === 'sink') {
        next.madeThisRound++;
        next.sides[side] = next.sides[side].filter(cup => cup.id !== result.cupId);
        if (result.bounced) events.push({ type: 'bounce_sink', side, cupId: result.cupId });
        events.push({ type: 'cup_removed', side, cupId: result.cupId, cause: 'sink' });
        if (finishGame(next, side, events)) break;
        if (result.bounced) {
          next.phase = 'awaiting_pick';
          next.pendingPick = { defender: side, remaining: 1 };
          events.push({ type: 'pick_required', defender: side });
          break;
        }
      } else {
        events.push({ type: result.kind, seat: action.seat });
      }
      finishThrowPair(next, events);
      break;
    }
    case 'pick_cup': {
      if (state.phase !== 'awaiting_pick' || !state.pendingPick) return reject('wrong_phase');
      const { defender } = state.pendingPick;
      if (action.seat !== defender) return reject('not_your_turn');
      if (!state.sides[defender].some(cup => cup.id === action.cupId)) return reject('unknown_cup');
      next.sides[defender] = next.sides[defender].filter(cup => cup.id !== action.cupId);
      events.push({ type: 'cup_removed', side: defender, cupId: action.cupId, cause: 'bounce_pick' });
      if (finishGame(next, defender, events)) break;
      const remaining = state.pendingPick.remaining - 1;
      if (remaining > 0) {
        next.pendingPick = { defender, remaining };
      } else {
        next.pendingPick = null;
        next.phase = 'playing';
        finishThrowPair(next, events);
      }
      break;
    }
    case 'rerack': {
      if (action.seat !== state.turn) return reject('not_your_turn');
      if (state.phase !== 'playing') return reject('wrong_phase');
      if (!state.canRerack) return reject('rerack_not_allowed');
      if (state.reracksLeft[action.seat] <= 0) return reject('no_reracks_left');
      const side = otherSeat(action.seat);
      const cups = [...state.sides[side]].sort((a, b) => a.id - b.id);
      const positions = rackLayout(action.shape, cups.length);
      next.sides[side] = cups.map((cup, i) => ({ id: cup.id, ...positions[i]! }));
      next.reracksLeft[action.seat]--;
      events.push({ type: 'reracked', side, shape: action.shape });
      break;
    }
    case 'rematch': {
      if (state.phase !== 'game_over') return reject('wrong_phase');
      next.rematchVotes[action.seat] = true;
      if (!next.rematchVotes.every(Boolean)) break;
      const fresh = createInitialState(state.table);
      fresh.players = next.players;
      fresh.phase = 'playing';
      fresh.turn = otherSeat(state.winner!);
      return { ok: true, state: fresh, events: [{ type: 'game_started' }] };
    }
  }
  return { ok: true, state: next, events };
}

/** Resolve a win before any pending pick or turn transition. Only mutates the cloned state. */
function finishGame(state: GameState, side: Seat, events: GameEvent[]): boolean {
  if (state.sides[side].length > 0) return false;
  state.phase = 'game_over';
  state.winner = state.turn;
  state.pendingPick = null;
  events.push({ type: 'game_over', winner: state.turn });
  return true;
}

/** Called after a throw and all of its extra cup picks have finished. */
function finishThrowPair(state: GameState, events: GameEvent[]): void {
  if (state.throwsLeft > 0) return;
  state.throwsLeft = RULES.throwsPerTurn;
  if (state.madeThisRound === RULES.throwsPerTurn) {
    state.madeThisRound = 0;
    events.push({ type: 'balls_back', seat: state.turn });
  } else {
    state.turn = otherSeat(state.turn);
    state.madeThisRound = 0;
    state.canRerack = true;
    events.push({ type: 'turn_changed', turn: state.turn });
  }
}

// Re-exported for convenience in reducers/UI.
export type { CupState, RackShape, Seat, TableId, EmoteId };
