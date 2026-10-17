// Peer-to-peer game client (no game server). The player who creates a room hosts it: their browser
// runs the same RoomManager the Node server uses, registered on the public PeerJS broker under an id
// derived from the room code. The guest connects to that id over a WebRTC data channel and speaks
// the normal protocol. The broker only introduces the two browsers; game traffic is direct.
//
// Limits: if the host closes or refreshes their tab, the room is gone. A guest who drops or
// refreshes rejoins within the usual grace period.
import Peer, { type DataConnection, type PeerError } from 'peerjs';
import {
  type ClientMessage, type Connection, type ServerMessage, type ServerMessageOf, type ServerMessageType,
  RULES, RoomManager, randomRoomCode,
} from '@bp/shared';
import type { ConnectionStatus, GameClient } from './net';

const PEER_PREFIX = 'bp3d-pong-room-';
const STORAGE_KEY = 'bp:p2p-rejoin';
const HOST_CODE_ATTEMPTS = 5;

interface Credentials {
  code: string;
  token: string;
}

/** Open a Peer on the broker (with `id`, or a random one). Rejects on errors before it opens. */
function openPeer(id?: string): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id, { debug: 1 }) : new Peer({ debug: 1 });
    const onError = (e: PeerError<string>) => {
      peer.destroy();
      reject(e);
    };
    peer.once('error', onError);
    peer.once('open', () => {
      peer.off('error', onError);
      resolve(peer);
    });
  });
}

export class P2PClient implements GameClient {
  private readonly handlers = new Map<ServerMessageType, Set<(m: ServerMessage) => void>>();
  private readonly statusHandlers = new Set<(s: ConnectionStatus) => void>();
  private peer: Peer | null = null;

  // Host side.
  private manager: RoomManager | null = null;
  private readonly self: Connection = { send: (m) => this.deliver(m) };

  // Guest side.
  private link: DataConnection | null = null;
  private credentials: Credentials | null = null;
  private queue: ClientMessage[] = [];
  private joined = false;
  private retry?: ReturnType<typeof setTimeout>;
  private lostAt = 0;
  private attempts = 0;
  private stopped = false;

  constructor() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null') as Credentials | null;
      if (saved && typeof saved.code === 'string' && typeof saved.token === 'string') this.credentials = saved;
    } catch {
      /* Storage may be disabled; rejoin after a refresh just won't be possible. */
    }
  }

  /** Nothing to do up front: creating or joining a room opens the connection. */
  connect(): Promise<void> {
    return Promise.resolve();
  }

  /** Rejoin the room from saved credentials (after a page refresh). */
  resume(): void {
    if (this.credentials) void this.joinHost(this.credentials.code, { t: 'rejoin', ...this.credentials });
  }

  savedRoomCode(): string | null {
    return this.credentials?.code ?? null;
  }

  send(msg: ClientMessage): void {
    if (this.manager) return this.manager.receive(this.self, JSON.stringify(msg));
    if (msg.t === 'create_room') return void this.host(msg);
    if (msg.t === 'join_room') return void this.joinHost(msg.code.trim().toUpperCase(), msg);
    if (this.link?.open && this.joined) this.link.send(msg);
    else this.queue.push(msg);
  }

  on<T extends ServerMessageType>(t: T, handler: (msg: ServerMessageOf<T>) => void): () => void {
    const set = this.handlers.get(t) ?? new Set();
    set.add(handler as (m: ServerMessage) => void);
    this.handlers.set(t, set);
    return () => set.delete(handler as (m: ServerMessage) => void);
  }

  onStatus(cb: (s: ConnectionStatus) => void): () => void {
    this.statusHandlers.add(cb);
    return () => this.statusHandlers.delete(cb);
  }

  close(): void {
    this.stopped = true;
    clearTimeout(this.retry);
    this.link?.close();
    this.peer?.destroy();
    this.setStatus('closed');
  }

  private setStatus(s: ConnectionStatus) {
    for (const cb of this.statusHandlers) cb(s);
  }

  private deliver(msg: ServerMessage) {
    // Async, like a socket, so handlers never re-enter the sender.
    queueMicrotask(() => this.handlers.get(msg.t)?.forEach((h) => h(msg)));
  }

  private fail(message: string) {
    this.deliver({ t: 'error', code: 'room_not_found', message });
  }

  private save(c: Credentials | null) {
    this.credentials = c;
    try {
      if (c) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(c));
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  // ---------- host ----------

  private async host(msg: ClientMessage) {
    this.setStatus('connecting');
    for (let i = 0; i < HOST_CODE_ATTEMPTS; i++) {
      const code = randomRoomCode();
      let peer: Peer;
      try {
        peer = await openPeer(PEER_PREFIX + code);
      } catch (e) {
        if ((e as PeerError<string>).type === 'unavailable-id') continue; // code in use elsewhere
        this.setStatus('closed');
        return this.fail('Could not reach the matchmaking service. Check your connection and try again.');
      }
      this.peer = peer;
      this.manager = new RoomManager({ newCode: () => code, log: (line) => console.info('[room]', line) });
      peer.on('connection', (dc) => this.accept(dc));
      // Losing the broker only stops new peers from finding us; open data channels keep working.
      peer.on('disconnected', () => {
        if (!this.stopped && !peer.destroyed) peer.reconnect();
      });
      peer.on('error', (e) => console.warn('[p2p host]', e.type, e.message));
      this.setStatus('open');
      this.manager.receive(this.self, JSON.stringify(msg));
      return;
    }
    this.setStatus('closed');
    this.fail('Could not get a free room code. Try again.');
  }

  private accept(dc: DataConnection) {
    const manager = this.manager!;
    const conn: Connection = {
      send: (m) => {
        if (dc.open) void dc.send(m);
      },
    };
    let gone = false;
    const leave = () => {
      if (gone) return;
      gone = true;
      manager.disconnect(conn);
    };
    dc.on('data', (d) => manager.receive(conn, typeof d === 'string' ? d : JSON.stringify(d)));
    dc.on('close', leave);
    dc.on('error', leave);
  }

  // ---------- guest ----------

  private async joinHost(code: string, first: ClientMessage) {
    clearTimeout(this.retry);
    this.stopped = false;
    this.joined = false;
    this.setStatus(this.attempts > 0 ? 'reconnecting' : 'connecting');
    try {
      if (!this.peer || this.peer.destroyed || this.peer.disconnected) {
        this.peer?.destroy();
        this.peer = await openPeer();
        this.peer.on('error', (e) => this.onGuestPeerError(e, code));
      }
    } catch {
      return this.lost(code, 'Could not reach the matchmaking service. Check your connection and try again.');
    }
    const dc = this.peer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' });
    this.link = dc;
    dc.on('open', () => {
      this.attempts = 0;
      void dc.send(first);
    });
    dc.on('data', (d) => this.onGuestData(d as ServerMessage, code));
    dc.on('close', () => {
      if (this.link === dc) this.lost(code, 'The host left the game.');
    });
  }

  private onGuestPeerError(e: PeerError<string>, code: string) {
    if (e.type === 'peer-unavailable') this.lost(code, 'Room not found. Check the code with your friend.');
    else console.warn('[p2p guest]', e.type, e.message);
  }

  private onGuestData(msg: ServerMessage, code: string) {
    if (msg.t === 'joined') {
      this.save({ code: msg.code, token: msg.token });
      this.joined = true;
      this.lostAt = 0;
      this.setStatus('open');
      const queued = this.queue.splice(0);
      for (const m of queued) void this.link?.send(m);
    } else if (msg.t === 'error' && !this.joined) {
      // A failed join/rejoin: stale credentials are useless now.
      this.save(null);
      this.link?.close();
      this.link = null;
      this.setStatus('closed');
      if (msg.code === 'bad_token' && code) msg = { ...msg, message: 'That game has ended.' };
    }
    this.deliver(msg);
  }

  /** The link dropped or never came up. Retry rejoins within the grace period; otherwise report. */
  private lost(code: string, reason: string) {
    clearTimeout(this.retry);
    this.link = null;
    this.joined = false;
    if (this.stopped) return;
    if (!this.credentials || this.credentials.code !== code) {
      this.setStatus('closed');
      return this.fail(reason);
    }
    this.lostAt ||= Date.now();
    if (Date.now() - this.lostAt > RULES.rejoinGraceSeconds * 1000) {
      this.save(null);
      this.setStatus('closed');
      return this.fail(reason);
    }
    this.setStatus('reconnecting');
    const delay = Math.min(1000 * 2 ** this.attempts++, 8000);
    const creds = this.credentials;
    this.retry = setTimeout(() => void this.joinHost(code, { t: 'rejoin', ...creds }), delay);
  }
}
