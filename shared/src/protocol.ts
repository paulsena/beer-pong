// Every WebSocket message, client <-> server. JSON-encoded, discriminated on `t`.

import type { EmoteId, QuickChatId, RackShape, Seat, TableId } from './constants';
import type { GameEvent, GameState, RuleError, ThrowResult } from './rules';

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

/** One sample of the in-flight ball, streamed by the thrower at ~NET.ballStateHz. */
export interface BallSample {
  throwId: number;
  /** Thrower-local ms since throw release. */
  t: number;
  p: Vec3;
  q: Quat;
  /** True once the ball has touched the table (swats become legal). */
  bounced: boolean;
}

// ---------- client -> server ----------

export type ClientMessage =
  | { t: 'create_room'; name: string; color: string; table: TableId }
  | { t: 'join_room'; code: string; name: string; color: string }
  /** Reconnect within the grace period using the token from `joined`. */
  | { t: 'rejoin'; code: string; token: string }
  | { t: 'rerack'; shape: RackShape }
  /** Thrower: ball released (lets the opponent start the flight view). */
  | { t: 'throw_start'; throwId: number; p: Vec3; v: Vec3 }
  | { t: 'ball'; sample: BallSample }
  | { t: 'throw_result'; throwId: number; result: ThrowResult }
  /** Defender: clicked the ball after it bounced. */
  | { t: 'swat'; throwId: number }
  | { t: 'pick_cup'; cupId: number }
  | { t: 'emote'; emote: EmoteId }
  | { t: 'chat'; msg: QuickChatId }
  | { t: 'rematch' }
  | { t: 'ping'; n: number };

// ---------- server -> client ----------

export type ErrorCode =
  | RuleError
  | 'room_not_found'
  | 'room_full'
  | 'bad_token'
  | 'bad_message'
  | 'not_in_room';

export type ServerMessage =
  /** Sent to a client after create/join/rejoin succeeds. */
  | { t: 'joined'; code: string; seat: Seat; token: string; state: GameState }
  /** Authoritative state after every accepted action, with the events it produced. */
  | { t: 'state'; state: GameState; events: GameEvent[] }
  | { t: 'presence'; seat: Seat; connected: boolean }
  /** A disconnected player's rejoin window ran out; their seat is free for a new player (same code). */
  | { t: 'opponent_left'; seat: Seat }
  // Relays from the other player:
  | { t: 'throw_start'; seat: Seat; throwId: number; p: Vec3; v: Vec3 }
  | { t: 'ball'; seat: Seat; sample: BallSample }
  | { t: 'swat'; seat: Seat; throwId: number }
  | { t: 'emote'; seat: Seat; emote: EmoteId }
  | { t: 'chat'; seat: Seat; msg: QuickChatId }
  | { t: 'error'; code: ErrorCode; message: string }
  | { t: 'pong'; n: number };

export type ClientMessageType = ClientMessage['t'];
export type ServerMessageType = ServerMessage['t'];
export type ServerMessageOf<T extends ServerMessageType> = Extract<ServerMessage, { t: T }>;
export type ClientMessageOf<T extends ClientMessageType> = Extract<ClientMessage, { t: T }>;
