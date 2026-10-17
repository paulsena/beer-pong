// What the game needs from a connection. NetClient satisfies it; LocalSession runs practice offline.
import {
  type ClientMessage, type GameState, type ServerMessage, type ServerMessageOf, type ServerMessageType, type TableId,
  RULES, createInitialState, reduce,
} from '@bp/shared';

export interface Session {
  send(msg: ClientMessage): void;
  on<T extends ServerMessageType>(t: T, handler: (msg: ServerMessageOf<T>) => void): () => void;
}

/**
 * Single-player practice: runs the real reducer locally with you on seat 0 and an opponent who
 * never throws (the turn is handed straight back to you). Re-racks and bounce picks work as usual;
 * you pick the bounce cup yourself.
 */
export class LocalSession implements Session {
  state: GameState;
  private readonly handlers = new Map<ServerMessageType, Set<(m: ServerMessage) => void>>();

  constructor(table: TableId) {
    let s = createInitialState(table);
    for (const seat of [0, 1] as const) {
      const r = reduce(s, { type: 'join', seat, name: seat === 0 ? 'You' : 'Practice', color: seat === 0 ? '#e63946' : '#457b9d' });
      s = r.state;
    }
    this.state = s;
  }

  on<T extends ServerMessageType>(t: T, handler: (msg: ServerMessageOf<T>) => void): () => void {
    const set = this.handlers.get(t) ?? new Set();
    set.add(handler as (m: ServerMessage) => void);
    this.handlers.set(t, set);
    return () => set.delete(handler as (m: ServerMessage) => void);
  }

  private emit(msg: ServerMessage) {
    // Async, like a real socket, so handlers never re-enter the caller.
    queueMicrotask(() => this.handlers.get(msg.t)?.forEach((h) => h(msg)));
  }

  /** Announce the session (call once handlers are attached). */
  start() {
    this.emit({ t: 'joined', code: 'PRACTICE', seat: 0, token: '', state: this.state });
  }

  send(msg: ClientMessage): void {
    switch (msg.t) {
      case 'rerack':
        return this.apply({ type: 'rerack', seat: 0, shape: msg.shape });
      case 'throw_result':
        return this.apply({ type: 'throw_result', seat: 0, throwId: msg.throwId, result: msg.result });
      case 'pick_cup': {
        // The defender is the practice opponent; let the player choose for them.
        const seat = this.state.pendingPick?.defender ?? 1;
        return this.apply({ type: 'pick_cup', seat, cupId: msg.cupId });
      }
      case 'rematch':
        // The practice opponent always agrees.
        this.apply({ type: 'rematch', seat: 1 });
        return this.apply({ type: 'rematch', seat: 0 });
      case 'ping':
        return this.emit({ t: 'pong', n: msg.n });
      default:
        return;
    }
  }

  private apply(action: Parameters<typeof reduce>[1]) {
    const r = reduce(this.state, action);
    if (!r.ok) return this.emit({ t: 'error', code: r.error, message: r.error });
    let state = r.state;
    const events = [...r.events];
    if (state.phase === 'playing' && state.turn === 1) {
      state = { ...state, turn: 0, throwsLeft: RULES.throwsPerTurn, madeThisRound: 0, canRerack: true };
      events.push({ type: 'turn_changed', turn: 0 });
    }
    this.state = state;
    this.emit({ t: 'state', state, events });
  }
}
