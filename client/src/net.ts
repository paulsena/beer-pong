// Typed WebSocket client with auto-rejoin. (Track C)
import type { ClientMessage, ServerMessageOf, ServerMessageType } from '@bp/shared';
import { NET } from '@bp/shared';

export function defaultServerUrl(): string {
  const fromEnv = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (fromEnv) return fromEnv;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.hostname}:${NET.defaultPort}`;
}

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

export class NetClient {
  constructor(readonly url: string = defaultServerUrl()) {}
  connect(): Promise<void> {
    return Promise.resolve();
  }
  send(_msg: ClientMessage): void {}
  on<T extends ServerMessageType>(_t: T, _handler: (msg: ServerMessageOf<T>) => void): () => void {
    return () => {};
  }
  onStatus(_cb: (s: ConnectionStatus) => void): () => void {
    return () => {};
  }
  close(): void {}
}
