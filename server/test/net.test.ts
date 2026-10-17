/// <reference lib="dom" />
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NetClient, type ConnectionStatus } from '../../client/src/net';
import { createInitialState } from '@bp/shared';

class BrowserSocket {
  static readonly OPEN = 1;
  static instances: BrowserSocket[] = [];
  readyState = 0;
  sent: unknown[] = [];
  onopen?: () => void;
  onclose?: () => void;
  onerror?: () => void;
  onmessage?: (event: { data: string }) => void;
  constructor(readonly url: string) { BrowserSocket.instances.push(this); }
  send(raw: string) { this.sent.push(JSON.parse(raw)); }
  close() { this.readyState = 3; this.onclose?.(); }
  open() { this.readyState = 1; this.onopen?.(); }
  message(message: unknown) { this.onmessage?.({ data: JSON.stringify(message) }); }
}
const credentials = { code: 'ABCD', token: 'secret' };
const joined = { t: 'joined', ...credentials, seat: 0, state: createInitialState('basement') };
const latest = () => BrowserSocket.instances.at(-1)!;

describe('NetClient browser transport', () => {
  let client: NetClient;
  let storage: Map<string, string>;
  beforeEach(() => {
    vi.useFakeTimers();
    BrowserSocket.instances = [];
    storage = new Map();
    vi.stubGlobal('WebSocket', BrowserSocket);
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    client = new NetClient('ws://test');
  });
  afterEach(() => { client.close(); vi.useRealTimers(); vi.unstubAllGlobals(); });
  it('queues messages until open, shares connect promises, dispatches typed handlers and unsubscribes', async () => {
    const statuses: ConnectionStatus[] = [];
    const unsubscribeStatus = client.onStatus(s => statuses.push(s));
    const received: number[] = [];
    const unsubscribe = client.on('pong', msg => received.push(msg.n));
    client.send({ t: 'ping', n: 1 });
    const connected = client.connect();
    expect(client.connect()).toBe(connected);
    client.send({ t: 'ping', n: 2 });
    expect(latest().sent).toEqual([]);
    latest().open();
    await connected;
    expect(latest().sent).toEqual([{ t: 'ping', n: 1 }, { t: 'ping', n: 2 }]);
    latest().message({ t: 'pong', n: 3 });
    unsubscribe();
    latest().message({ t: 'pong', n: 4 });
    expect(received).toEqual([3]);
    expect(statuses).toEqual(['closed', 'connecting', 'open']);
    unsubscribeStatus();
    client.close();
    expect(statuses).toHaveLength(3);
  });
  it('persists joined credentials, reconnects and sends rejoin before queued gameplay', async () => {
    const statuses: ConnectionStatus[] = [];
    client.onStatus(s => statuses.push(s));
    const connected = client.connect();
    latest().open(); await connected;
    latest().message(joined);
    expect(JSON.parse(storage.get('bp.rejoin')!)).toEqual(credentials);
    latest().close();
    client.send({ t: 'rematch' });
    vi.advanceTimersByTime(499);
    expect(BrowserSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    const second = latest();
    const waiting = client.connect();
    expect(BrowserSocket.instances).toHaveLength(2);
    second.open(); await waiting;
    expect(second.sent).toEqual([{ t: 'rejoin', ...credentials }]);
    client.send({ t: 'ping', n: 5 });
    second.message(joined);
    expect(second.sent).toEqual([{ t: 'rejoin', ...credentials }, { t: 'rematch' }, { t: 'ping', n: 5 }]);
    expect(statuses).toContain('reconnecting');
  });
  it('loads credentials from sessionStorage in a new client', async () => {
    storage.set('bp.rejoin', JSON.stringify(credentials));
    client = new NetClient('ws://test');
    const connected = client.connect();
    latest().open(); await connected;
    expect(latest().sent).toEqual([{ t: 'rejoin', ...credentials }]);
  });
  it('clears rejected credentials and stale gameplay while letting a new room request proceed', async () => {
    storage.set('bp.rejoin', JSON.stringify(credentials));
    client = new NetClient('ws://test');
    const connected = client.connect();
    client.send({ t: 'rematch' });
    client.send({ t: 'create_room', name: 'A', color: '#123456', table: 'basement' });
    latest().open(); await connected;
    const errors: string[] = [];
    client.on('error', msg => errors.push(msg.code));
    latest().message({ t: 'error', code: 'bad_token', message: 'bad_token' });
    expect(errors).toEqual(['bad_token']);
    expect(storage.has('bp.rejoin')).toBe(false);
    expect(latest().sent).toHaveLength(2);
    expect(latest().sent[1]).toMatchObject({ t: 'create_room' });
  });
  it('backs off repeated failed attempts and cancels reconnect on intentional close', async () => {
    const pending = client.connect();
    const rejected = expect(pending).rejects.toThrow('Connection closed');
    latest().close();
    vi.advanceTimersByTime(500);
    expect(BrowserSocket.instances).toHaveLength(2);
    latest().close();
    vi.advanceTimersByTime(999);
    expect(BrowserSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(BrowserSocket.instances).toHaveLength(3);
    client.close();
    await rejected;
    vi.advanceTimersByTime(60_000);
    expect(BrowserSocket.instances).toHaveLength(3);
  });
  it('ignores malformed inbound JSON and handles unavailable session storage', async () => {
    vi.stubGlobal('sessionStorage', { getItem: () => { throw new Error('disabled'); }, setItem: () => { throw new Error('disabled'); } });
    client = new NetClient('ws://test');
    const connected = client.connect(); latest().open(); await connected;
    expect(() => latest().onmessage?.({ data: '{' })).not.toThrow();
    expect(() => latest().message(null)).not.toThrow();
    expect(() => latest().message(joined)).not.toThrow();
    latest().close(); vi.advanceTimersByTime(500); latest().open();
    expect(latest().sent[0]).toEqual({ t: 'rejoin', ...credentials });
  });
});
