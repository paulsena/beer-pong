import { once } from 'node:events';
import { WebSocket } from 'ws';
import { expect, it } from 'vitest';
import type { ServerMessage } from '@bp/shared';
import { startServer } from '../src/index';
import { fakeReducer } from './helpers';

it('serves two real ws clients through create/join and malformed input', async () => {
  const { server } = startServer(0, { reducer: fakeReducer, log: () => {} });
  const sockets: WebSocket[] = [];
  const inbox = (socket: WebSocket) => {
    const messages: ServerMessage[] = [];
    socket.on('message', data => messages.push(JSON.parse(data.toString()) as ServerMessage));
    return messages;
  };
  try {
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing address');
    const a = new WebSocket(`ws://127.0.0.1:${address.port}`);
    const b = new WebSocket(`ws://127.0.0.1:${address.port}`);
    sockets.push(a, b);
    const am = inbox(a), bm = inbox(b);
    await Promise.all([once(a, 'open'), once(b, 'open')]);
    a.send(JSON.stringify({ t: 'create_room', name: 'Alice', color: '#123456', table: 'basement' }));
    await expect.poll(() => am.find(m => m.t === 'joined')).toBeDefined();
    const joined = am.find(m => m.t === 'joined');
    if (joined?.t !== 'joined') throw new Error('Missing joined');
    b.send(JSON.stringify({ t: 'join_room', code: joined.code.toLowerCase(), name: 'Bob', color: '#654321' }));
    await expect.poll(() => bm.find(m => m.t === 'joined')).toMatchObject({ seat: 1, state: { phase: 'playing' } });
    await expect.poll(() => am.at(-1)).toMatchObject({ t: 'state', state: { phase: 'playing' } });
    b.send('{');
    await expect.poll(() => bm.at(-1)).toMatchObject({ t: 'error', code: 'bad_message' });
  } finally {
    for (const socket of sockets) socket.terminate();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
