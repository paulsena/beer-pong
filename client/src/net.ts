import type { ClientMessage, ServerMessage, ServerMessageOf, ServerMessageType } from '@bp/shared';
import { NET } from '@bp/shared';

export function defaultServerUrl(): string {
  const fromEnv = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (fromEnv) return fromEnv;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.hostname}:${NET.defaultPort}`;
}

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';
type Credentials = { code: string; token: string };
const STORAGE_KEY = 'bp.rejoin';

export class NetClient {
  private socket: WebSocket | null = null;
  private status: ConnectionStatus = 'closed';
  private readonly handlers = new Map<ServerMessageType, Set<(msg: ServerMessage) => void>>();
  private readonly statusHandlers = new Set<(s: ConnectionStatus) => void>();
  private queue: ClientMessage[] = [];
  private credentials: Credentials | null = null;
  private stopped = true;
  private attempts = 0;
  private retry?: ReturnType<typeof setTimeout>;
  private pending: Promise<void> | null = null;
  private resolveConnect?: () => void;
  private rejectConnect?: (error: Error) => void;

  constructor(readonly url: string = defaultServerUrl()) {
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null');
      if (saved && typeof saved === 'object' && 'code' in saved && 'token' in saved && typeof saved.code === 'string' && typeof saved.token === 'string') this.credentials = { code: saved.code, token: saved.token };
    } catch { /* Storage may be disabled. */ }
  }
  connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this.pending) return this.pending;
    this.stopped = false;
    this.pending = new Promise<void>((resolve, reject) => { this.resolveConnect = resolve; this.rejectConnect = reject; });
    if (!this.socket && !this.retry) this.open(false);
    return this.pending;
  }
  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    for (const cb of this.statusHandlers) cb(status);
  }
  private save(credentials: Credentials | null): void {
    this.credentials = credentials;
    try {
      if (credentials) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch { /* Reconnect still works in memory. */ }
  }
  private open(reconnecting: boolean): void {
    this.setStatus(reconnecting ? 'reconnecting' : 'connecting');
    let socket: WebSocket;
    try { socket = new WebSocket(this.url); } catch {
      this.scheduleRetry();
      return;
    }
    this.socket = socket;
    let awaitingRejoin = false;
    const flush = () => {
      for (const msg of this.queue.splice(0)) socket.send(JSON.stringify(msg));
    };
    socket.onopen = () => {
      if (this.socket !== socket || this.stopped) return;
      this.attempts = 0;
      awaitingRejoin = this.credentials !== null;
      if (this.credentials) socket.send(JSON.stringify({ t: 'rejoin', ...this.credentials }));
      if (!awaitingRejoin) flush();
      this.setStatus('open');
      this.resolveConnect?.();
      this.pending = null;
      this.resolveConnect = undefined;
      this.rejectConnect = undefined;
    };
    socket.onmessage = event => {
      if (this.socket !== socket || this.stopped) return;
      let msg: ServerMessage;
      try { msg = JSON.parse(String(event.data)) as ServerMessage; } catch { return; }
      if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
      if (msg.t === 'joined') {
        this.save({ code: msg.code, token: msg.token });
        awaitingRejoin = false;
        flush();
      } else if (awaitingRejoin && msg.t === 'error') {
        awaitingRejoin = false;
        this.save(null);
        this.queue = this.queue.filter(m => m.t === 'create_room' || m.t === 'join_room' || m.t === 'ping');
        flush();
      }
      for (const handler of this.handlers.get(msg.t) ?? []) handler(msg);
    };
    socket.onerror = () => socket.close();
    socket.onclose = () => {
      if (this.socket !== socket || this.stopped) return;
      this.socket = null;
      this.scheduleRetry();
    };
    // send() also waits for rejoin acknowledgement, so gameplay cannot race authentication.
    this.flushMessage = msg => {
      if (socket.readyState === WebSocket.OPEN && !awaitingRejoin) socket.send(JSON.stringify(msg));
      else this.queue.push(msg);
    };
  }
  private flushMessage = (msg: ClientMessage): void => { this.queue.push(msg); };
  private scheduleRetry(): void {
    if (this.stopped) return;
    this.setStatus('reconnecting');
    const delay = Math.min(500 * 2 ** this.attempts++, 10_000);
    this.retry = setTimeout(() => { this.retry = undefined; this.open(true); }, delay);
  }
  /** Room code of saved rejoin credentials (survive a page refresh in this tab), if any. */
  savedRoomCode(): string | null { return this.credentials?.code ?? null; }
  send(msg: ClientMessage): void { this.flushMessage(msg); }
  on<T extends ServerMessageType>(t: T, handler: (msg: ServerMessageOf<T>) => void): () => void {
    let handlers = this.handlers.get(t);
    if (!handlers) this.handlers.set(t, handlers = new Set());
    const wrapped = (msg: ServerMessage) => handler(msg as ServerMessageOf<T>);
    handlers.add(wrapped);
    return () => { handlers.delete(wrapped); };
  }
  onStatus(cb: (s: ConnectionStatus) => void): () => void {
    this.statusHandlers.add(cb);
    cb(this.status);
    return () => { this.statusHandlers.delete(cb); };
  }
  close(): void {
    this.stopped = true;
    clearTimeout(this.retry);
    this.retry = undefined;
    this.socket?.close();
    this.socket = null;
    this.queue = [];
    this.flushMessage = msg => { this.queue.push(msg); };
    this.rejectConnect?.(new Error('Connection closed'));
    this.pending = null;
    this.resolveConnect = undefined;
    this.rejectConnect = undefined;
    this.setStatus('closed');
  }
}
