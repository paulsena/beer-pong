import { randomBytes, randomInt } from 'node:crypto';
import {
  NET, RULES, createInitialState, otherSeat, reduce,
  type ErrorCode, type GameAction, type GameState, type Seat, type ServerMessage, type TableId,
} from '@bp/shared';
import { parseMessage } from './messages';

export interface Clock {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(timer: unknown): void;
}
const clock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
};
export interface Connection { send(message: ServerMessage): void }
interface Reservation { token: string; connection: Connection | null; expires: number | null; timer?: unknown }
export interface RoomOptions { reducer?: typeof reduce; clock?: Clock; log?: (line: string) => void }

export class Room {
  state: GameState;
  readonly seats: [Reservation | null, Reservation | null] = [null, null];
  constructor(readonly code: string, table: TableId, private readonly reducer: typeof reduce) {
    this.state = createInitialState(table);
  }
  send(seat: Seat, message: ServerMessage): void { this.seats[seat]?.connection?.send(message); }
  broadcast(message: ServerMessage): void { this.send(0, message); this.send(1, message); }
  dispatch(action: GameAction, sender?: Connection, accepted?: () => void): boolean {
    const result = this.reducer(this.state, action);
    if (!result.ok) {
      sender?.send({ t: 'error', code: result.error, message: result.error });
      return false;
    }
    this.state = result.state;
    accepted?.();
    this.broadcast({ t: 'state', state: this.state, events: result.events });
    return true;
  }
}

export class RoomManager {
  readonly rooms = new Map<string, Room>();
  private readonly memberships = new Map<Connection, { room: Room; seat: Seat }>();
  private readonly reducer: typeof reduce;
  private readonly clock: Clock;
  private readonly log: (line: string) => void;
  constructor(options: RoomOptions = {}) {
    this.reducer = options.reducer ?? reduce;
    this.clock = options.clock ?? clock;
    this.log = options.log ?? console.log;
  }
  private error(sender: Connection, code: ErrorCode): void { sender.send({ t: 'error', code, message: code }); }
  private joined(room: Room, seat: Seat, sender: Connection): void {
    const reservation = room.seats[seat]!;
    this.memberships.set(sender, { room, seat });
    sender.send({ t: 'joined', code: room.code, seat, token: reservation.token, state: room.state });
  }
  receive(sender: Connection, raw: string): void {
    const msg = parseMessage(raw);
    if (!msg) return this.error(sender, 'bad_message');
    const membership = this.memberships.get(sender);
    if (msg.t === 'create_room' || msg.t === 'join_room' || msg.t === 'rejoin') {
      if (membership) return this.error(sender, 'bad_message');
      if (msg.t === 'rejoin') {
        const room = this.rooms.get(msg.code.trim().toUpperCase());
        if (!room) return this.error(sender, 'room_not_found');
        const seat = ([0, 1] as const).find(s => {
          const r = room.seats[s];
          return r && r.token === msg.token && !r.connection && r.expires !== null && r.expires > this.clock.now();
        });
        if (seat === undefined) return this.error(sender, 'bad_token');
        const reservation = room.seats[seat]!;
        if (!room.dispatch({ type: 'presence', seat, connected: true }, sender, () => {
          this.clock.clearTimeout(reservation.timer);
          reservation.connection = sender;
          reservation.expires = null;
          this.joined(room, seat, sender);
        })) return;
        room.send(otherSeat(seat), { t: 'presence', seat, connected: true });
        this.log(`room ${room.code} join seat ${seat} (rejoin)`);
        return;
      }
      let room: Room;
      let seat: Seat;
      if (msg.t === 'create_room') {
        let code: string;
        do { code = Array.from({ length: NET.roomCodeLength }, () => NET.roomCodeAlphabet[randomInt(NET.roomCodeAlphabet.length)]).join(''); } while (this.rooms.has(code));
        room = new Room(code, msg.table, this.reducer);
        seat = 0;
      } else {
        const found = this.rooms.get(msg.code.trim().toUpperCase());
        if (!found) return this.error(sender, 'room_not_found');
        room = found;
        if (room.seats[1]) return this.error(sender, 'room_full');
        seat = 1;
      }
      if (!room.dispatch({ type: 'join', seat, name: msg.name.trim().slice(0, NET.maxNameLength), color: msg.color.toLowerCase() }, sender, () => {
        room.seats[seat] = { token: randomBytes(32).toString('hex'), connection: sender, expires: null };
        this.rooms.set(room.code, room);
        this.joined(room, seat, sender);
      })) return;
      this.log(`room ${room.code} ${msg.t === 'create_room' ? 'create' : 'join'} seat ${seat}`);
      return;
    }
    if (!membership) return this.error(sender, 'not_in_room');
    const { room, seat } = membership;
    switch (msg.t) {
      case 'ping': sender.send({ t: 'pong', n: msg.n }); return;
      case 'rerack': room.dispatch({ type: 'rerack', seat, shape: msg.shape }, sender); return;
      case 'throw_result': room.dispatch({ type: 'throw_result', seat, throwId: msg.throwId, result: msg.result }, sender); return;
      case 'pick_cup': room.dispatch({ type: 'pick_cup', seat, cupId: msg.cupId }, sender); return;
      case 'rematch': room.dispatch({ type: 'rematch', seat }, sender); return;
      case 'throw_start': case 'ball': case 'swat': {
        if (room.state.phase !== 'playing') return this.error(sender, 'wrong_phase');
        const allowed = msg.t === 'swat' ? otherSeat(room.state.turn) : room.state.turn;
        if (seat !== allowed) return this.error(sender, 'not_your_turn');
        const throwId = msg.t === 'ball' ? msg.sample.throwId : msg.throwId;
        // Late samples from a throw that already resolved are expected; drop them quietly.
        if (throwId !== room.state.throwId) return msg.t === 'ball' ? undefined : this.error(sender, 'stale_throw');
        break;
      }
    }
    // Explicit fields prevent untrusted extra JSON properties from overriding seat.
    switch (msg.t) {
      case 'throw_start': room.send(otherSeat(seat), { t: msg.t, seat, throwId: msg.throwId, p: msg.p, v: msg.v }); break;
      case 'ball': room.send(otherSeat(seat), { t: msg.t, seat, sample: msg.sample }); break;
      case 'swat': room.send(otherSeat(seat), { t: msg.t, seat, throwId: msg.throwId }); break;
      case 'emote': room.send(otherSeat(seat), { t: msg.t, seat, emote: msg.emote }); break;
      case 'chat': room.send(otherSeat(seat), { t: msg.t, seat, msg: msg.msg }); break;
    }
  }
  disconnect(sender: Connection): void {
    const membership = this.memberships.get(sender);
    if (!membership) return;
    this.memberships.delete(sender);
    const { room, seat } = membership;
    const reservation = room.seats[seat]!;
    reservation.connection = null;
    reservation.expires = this.clock.now() + RULES.rejoinGraceSeconds * 1000;
    room.dispatch({ type: 'presence', seat, connected: false });
    room.send(otherSeat(seat), { t: 'presence', seat, connected: false });
    reservation.timer = this.clock.setTimeout(() => {
      if (room.seats.every(r => !r || (!r.connection && r.expires !== null && r.expires <= this.clock.now()))) this.rooms.delete(room.code);
    }, RULES.rejoinGraceSeconds * 1000);
    this.log(`room ${room.code} leave seat ${seat}`);
  }
  dispose(): void {
    for (const room of this.rooms.values()) for (const r of room.seats) if (r?.timer !== undefined) this.clock.clearTimeout(r.timer);
    this.memberships.clear();
    this.rooms.clear();
  }
}
