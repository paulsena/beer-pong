import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NET, RULES, type ClientMessage, type ServerMessageOf } from '@bp/shared';
import { RoomManager } from '../src/rooms';
import { fakeReducer, peer } from './helpers';

describe('RoomManager', () => {
  let manager: RoomManager;
  let a: ReturnType<typeof peer>;
  let b: ReturnType<typeof peer>;
  const logs: string[] = [];
  const send = (p: ReturnType<typeof peer>, msg: ClientMessage) => manager.receive(p, JSON.stringify(msg));
  const joined = (p: ReturnType<typeof peer>) => p.messages.find(m => m.t === 'joined') as ServerMessageOf<'joined'>;
  const create = () => {
    send(a, { t: 'create_room', name: '  Alice name longer than limit  ', color: '#ABCDEF', table: 'basement' });
    return joined(a);
  };
  const pair = () => {
    const credentials = create();
    send(b, { t: 'join_room', code: credentials.code.toLowerCase(), name: 'Bob', color: '#123456' });
    a.clear(); b.clear();
    return credentials;
  };
  beforeEach(() => {
    vi.useFakeTimers();
    logs.length = 0;
    manager = new RoomManager({ reducer: fakeReducer, log: line => logs.push(line) });
    a = peer(); b = peer();
  });
  afterEach(() => { manager.dispose(); vi.useRealTimers(); });

  it('creates unique codes, normalizes names/colors, assigns seat 0 and a secret', () => {
    const first = create();
    expect(first.code).toHaveLength(NET.roomCodeLength);
    expect([...first.code].every(c => NET.roomCodeAlphabet.includes(c))).toBe(true);
    expect(first.seat).toBe(0);
    expect(first.token.length).toBeGreaterThanOrEqual(32);
    expect(first.state.players[0]).toEqual({ name: 'Alice name longe', color: '#abcdef', connected: true });
    const c = peer();
    send(c, { t: 'create_room', name: 'C', color: '#123456', table: 'backyard' });
    expect(joined(c).code).not.toBe(first.code);
    expect(joined(c).state.table).toBe('backyard');
    expect(logs).toHaveLength(2);
  });
  it('joins case-insensitively in seat 1, broadcasts the full state, and rejects a third player', () => {
    const host = create();
    a.clear();
    send(b, { t: 'join_room', code: ` ${host.code.toLowerCase()} `, name: 'Bob', color: '#123456' });
    expect(joined(b)).toMatchObject({ seat: 1, code: host.code, state: { phase: 'playing' } });
    expect(joined(b).token).not.toBe(host.token);
    expect(a.messages).toMatchObject([{ t: 'state', state: { phase: 'playing' } }]);
    const third = peer();
    send(third, { t: 'join_room', code: host.code, name: 'C', color: '#123456' });
    expect(third.messages).toMatchObject([{ t: 'error', code: 'room_full' }]);
    expect(logs.map(l => l.split(' ')[2])).toEqual(['create', 'join']);
  });
  it('rejects nonexistent rooms', () => {
    send(a, { t: 'join_room', code: 'NOPE', name: 'A', color: '#123456' });
    expect(a.messages).toMatchObject([{ code: 'room_not_found' }]);
  });
  it('broadcasts state and reducer events after an accepted action; errors only reach sender', () => {
    pair();
    send(a, { t: 'rerack', shape: 'diamond' });
    expect(a.messages).toEqual(b.messages);
    expect(a.messages[0]).toMatchObject({ t: 'state', state: { reracksLeft: [1, 2] }, events: [{ type: 'reracked' }] });
    a.clear(); b.clear();
    send(b, { t: 'rerack', shape: 'line' });
    expect(a.messages).toEqual([]);
    expect(b.messages).toMatchObject([{ t: 'error', code: 'not_your_turn' }]);
  });
  it('routes each state action through the injected reducer', () => {
    const reducer = vi.fn(fakeReducer);
    manager = new RoomManager({ reducer, log: () => {} });
    pair();
    send(a, { t: 'throw_result', throwId: 0, result: { kind: 'miss' } });
    send(b, { t: 'pick_cup', cupId: 2 });
    send(a, { t: 'rematch' });
    expect(reducer.mock.calls.map(c => c[1].type)).toEqual(['join', 'join', 'throw_result', 'pick_cup', 'rematch']);
    expect(a.messages.filter(m => m.t === 'state')).toHaveLength(3);
  });
  it.each([
    { t: 'throw_start', throwId: 0, p: [0, 1, 0], v: [0, 0, 1] },
    { t: 'ball', sample: { throwId: 0, t: 1, p: [0, 1, 0], q: [0, 0, 0, 1], bounced: true } },
    { t: 'swat', throwId: 0 },
  ] as ClientMessage[])('gates and relays $t only to the other seat', msg => {
    pair();
    const [allowed, denied] = msg.t === 'swat' ? [b, a] : [a, b];
    send(denied, msg);
    expect(allowed.messages).toEqual([]);
    expect(denied.messages).toMatchObject([{ t: 'error', code: 'not_your_turn' }]);
    denied.clear();
    send(allowed, msg);
    expect(allowed.messages).toEqual([]);
    expect(denied.messages).toEqual([{ ...msg, seat: allowed === a ? 0 : 1 }]);
  });
  it('rejects flight relays outside playing and stale throw ids', () => {
    create(); a.clear();
    send(a, { t: 'throw_start', throwId: 0, p: [0, 0, 0], v: [0, 1, 0] });
    expect(a.messages).toMatchObject([{ code: 'wrong_phase' }]);
    const room = [...manager.rooms.values()][0]!;
    room.state = { ...room.state, phase: 'playing' };
    a.clear();
    send(a, { t: 'swat', throwId: 0 });
    send(a, { t: 'ball', sample: { throwId: 9, t: 0, p: [0, 0, 0], q: [0, 0, 0, 1], bounced: false } });
    send(a, { t: 'throw_start', throwId: 9, p: [0, 0, 0], v: [0, 1, 0] });
    // Stale ball samples are dropped silently; a stale throw_start is an error.
    expect(a.messages).toMatchObject([{ code: 'not_your_turn' }, { code: 'stale_throw' }]);
    expect(b.messages).toEqual([]);
  });
  it('relays social messages and responds to ping only to sender', () => {
    pair();
    send(a, { t: 'emote', emote: 'nice' });
    send(b, { t: 'chat', msg: 0 });
    expect(a.messages).toEqual([{ t: 'chat', seat: 1, msg: 0 }]);
    expect(b.messages).toEqual([{ t: 'emote', seat: 0, emote: 'nice' }]);
    a.clear(); b.clear();
    send(a, { t: 'ping', n: 42 });
    expect(a.messages).toEqual([{ t: 'pong', n: 42 }]);
    expect(b.messages).toEqual([]);
  });
  it('disconnects through presence, reserves the seat, and rejoins with the correct token', () => {
    const host = pair();
    manager.disconnect(a);
    expect(b.messages).toMatchObject([{ t: 'state', state: { players: [{ connected: false }, { connected: true }] } }, { t: 'presence', seat: 0, connected: false }]);
    const replacement = peer();
    vi.advanceTimersByTime(1000);
    send(replacement, { t: 'rejoin', code: host.code.toLowerCase(), token: host.token });
    expect(joined(replacement)).toMatchObject({ seat: 0, token: host.token, state: { players: [{ connected: true }, { connected: true }] } });
    expect(b.messages.at(-1)).toEqual({ t: 'presence', seat: 0, connected: true });
    vi.advanceTimersByTime(RULES.rejoinGraceSeconds * 1000);
    expect(manager.rooms.size).toBe(1);
    expect(logs).toHaveLength(4);
  });
  it('rejects bad and expired tokens, and frees an expired seat for a new player', () => {
    const host = pair();
    const c = peer();
    manager.disconnect(a);
    send(c, { t: 'rejoin', code: host.code, token: 'bad' });
    vi.advanceTimersByTime(RULES.rejoinGraceSeconds * 1000);
    send(c, { t: 'rejoin', code: host.code, token: host.token });
    expect(c.messages).toMatchObject([{ code: 'bad_token' }, { code: 'bad_token' }]);
    expect(manager.rooms.size).toBe(1);
    // The guest is told, and someone new can take the freed seat with the same code.
    expect(b.messages.at(-1)).toEqual({ t: 'opponent_left', seat: 0 });
    c.clear();
    send(c, { t: 'join_room', code: host.code, name: 'Carol', color: '#112233' });
    expect(c.messages[0]).toMatchObject({ t: 'joined', seat: 0 });
  });
  it('lets a valid token take over a seat whose old socket was never closed', () => {
    const host = pair();
    const c = peer();
    send(c, { t: 'rejoin', code: host.code, token: host.token });
    expect(c.messages[0]).toMatchObject({ t: 'joined', seat: 0 });
    // The stale socket no longer speaks for the seat, and its eventual close is a no-op.
    a.clear(); c.clear();
    send(a, { t: 'emote', emote: 'nice' });
    expect(a.messages).toMatchObject([{ code: 'not_in_room' }]);
    manager.disconnect(a);
    send(c, { t: 'ping', n: 1 });
    expect(c.messages).toEqual([{ t: 'pong', n: 1 }]);
  });
  it('deletes an empty room after grace', () => {
    const host = create();
    manager.disconnect(a);
    vi.advanceTimersByTime(RULES.rejoinGraceSeconds * 1000 - 1);
    expect(manager.rooms.has(host.code)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(manager.rooms.has(host.code)).toBe(false);
  });
  it('waits for the last disconnected player’s grace before collecting the room', () => {
    pair();
    manager.disconnect(a);
    vi.advanceTimersByTime(30_000);
    manager.disconnect(b);
    vi.advanceTimersByTime(30_000);
    expect(manager.rooms.size).toBe(1);
    vi.advanceTimersByTime(30_000);
    expect(manager.rooms.size).toBe(0);
  });
  it.each(['{', 'null', '[]', '{}', '{"t":"unknown"}', '{"t":"create_room","name":" ","color":"#123456","table":"basement"}', '{"t":"create_room","name":"A","color":"red","table":"basement"}', '{"t":"create_room","name":"A","color":"#123456","table":"moon"}', '{"t":"emote","emote":"bad"}', '{"t":"chat","msg":-1}', '{"t":"chat","msg":6}', '{"t":"chat","msg":0.5}', '{"t":"ball","sample":null}', '{"t":"throw_start","throwId":0,"p":[],"v":[]}', '{"t":"throw_result","throwId":0,"result":{"kind":"sink"}}'])('handles malformed input %s', raw => {
    expect(() => manager.receive(a, raw)).not.toThrow();
    expect(a.messages).toMatchObject([{ t: 'error', code: 'bad_message' }]);
  });
  it('rejects messages before joining and joining twice', () => {
    send(a, { t: 'ping', n: 0 });
    expect(a.messages).toMatchObject([{ code: 'not_in_room' }]);
    create(); a.clear();
    send(a, { t: 'join_room', code: 'NONE', name: 'A', color: '#123456' });
    expect(a.messages).toMatchObject([{ code: 'bad_message' }]);
  });
});
