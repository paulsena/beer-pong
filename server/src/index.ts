import { pathToFileURL } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { NET } from '@bp/shared';
import { RoomManager, type Connection, type RoomOptions } from './rooms';

/** Importing this module does not open a listening socket. Port 0 supports integration tests. */
export function startServer(port = Number(process.env.PORT ?? NET.defaultPort), options: RoomOptions = {}) {
  const rooms = new RoomManager(options);
  const server = new WebSocketServer({ port, maxPayload: 16 * 1024 });
  server.on('connection', socket => {
    const connection: Connection = {
      send: message => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); },
    };
    socket.on('message', (data, binary) => rooms.receive(connection, binary ? '' : data.toString()));
    socket.on('close', () => rooms.disconnect(connection));
    socket.on('error', () => socket.close());
  });
  server.on('close', () => rooms.dispose());
  return { server, rooms };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { server } = startServer();
  server.on('listening', () => {
    const address = server.address();
    console.log(`[server] listening on ws://localhost:${typeof address === 'object' && address ? address.port : address}`);
  });
  server.on('error', error => { console.error('[server]', error.message); process.exitCode = 1; });
}
