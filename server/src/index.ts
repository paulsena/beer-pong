// WebSocket game server: rooms, codes, turn gating via shared `reduce`, relays. (Track C)
import { WebSocketServer } from 'ws';
import { NET } from '@bp/shared';

const port = Number(process.env.PORT ?? NET.defaultPort);
const wss = new WebSocketServer({ port });
wss.on('connection', (ws) => {
  // TODO(track C): rooms, create/join/rejoin, reduce(), relay.
  ws.on('message', () => {});
});
console.log(`[server] listening on ws://localhost:${port}`);
