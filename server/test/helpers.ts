import type { GameAction, GameState, ReduceResult, ServerMessage } from '@bp/shared';
import type { Connection } from '../src/rooms';

/** Deliberately tiny lifecycle reducer: game rules belong to Track B. */
export function fakeReducer(state: GameState, action: GameAction): ReduceResult {
  const next = structuredClone(state);
  if (action.type === 'join') {
    next.players[action.seat] = { name: action.name, color: action.color, connected: true };
    if (next.players.every(Boolean)) next.phase = 'playing';
  } else if (action.type === 'presence') {
    const player = next.players[action.seat];
    if (player) player.connected = action.connected;
  } else if (action.type === 'rerack') {
    if (action.seat !== state.turn) return { ok: false, state, error: 'not_your_turn' };
    next.reracksLeft[action.seat]--;
    return { ok: true, state: next, events: [{ type: 'reracked', side: action.seat === 0 ? 1 : 0, shape: action.shape }] };
  } else if (action.type === 'throw_result') next.throwId++;
  else if (action.type === 'pick_cup') next.pendingPick = null;
  else if (action.type === 'rematch') next.throwId = 0;
  return { ok: true, state: next, events: [] };
}
export function peer(): Connection & { messages: ServerMessage[]; clear(): void } {
  const messages: ServerMessage[] = [];
  return { messages, send: msg => messages.push(structuredClone(msg)), clear: () => { messages.length = 0; } };
}
