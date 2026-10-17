# Beer Pong 3D

Two-player online beer pong in the browser (desktop). Three.js + Rapier. See `PLAN.md` for the design.

**Play:** https://paulsena.github.io/beer-pong/ — create a room and send your friend the invite link.

## How online play works

Peer-to-peer by default: the player who creates a room hosts it in their browser (the same room
logic the Node server runs, in `shared/src/room.ts`), and the friend connects directly over WebRTC.
The free public [PeerJS](https://peerjs.com) broker is only used to introduce the two browsers.
If the host closes or refreshes their tab the game ends; a guest who drops or refreshes rejoins.
Very strict networks (some corporate or mobile networks) can block direct connections.

A self-hosted WebSocket server is also included: `npm run dev` starts it, and the client uses it
with `?net=ws` or when built with `VITE_SERVER_URL`.

## Run locally

```sh
npm install
npm run dev          # client on http://localhost:5173 (+ optional WebSocket server on :8787)
```

- Play online: open http://localhost:5173, create a room, and open the invite link in a second
  window (or send it to a friend on your network).
- Practice alone: **Practice solo** on the main menu (uses the selected table), or
  http://localhost:5173/?practice=basement (or `backyard`). **← Menu** (bottom right) exits.

## Controls

- **Throw:** press on the table, flick the mouse up and release. Flick speed sets distance,
  sideways angle sets aim.
- **Bounce shot:** hold **Shift** while flicking (a hit after a table bounce counts for 2 cups).
- **Swat:** when the opponent's ball has bounced, click it.
- **Emotes / chat:** **E** / **T** (or the buttons bottom-left). **M** mutes.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | client + server with reload |
| `npm test` | Vitest: rules reducer, server rooms, physics |
| `npm run typecheck` | strict `tsc` for every workspace |
| `npm run shots` | Playwright screenshots of both tables into `shots/` |
| `npm run smoke` | 2-tab Playwright tests over P2P: create/join, synced throws, guest refresh |
| `npm run build` | static client in `client/dist` (`PAGES_BASE=/beer-pong/` for GitHub Pages) |

Pushing to `main` deploys to GitHub Pages via `.github/workflows/pages.yml`.

`VITE_SERVER_URL` overrides the WebSocket URL the client connects to (for deploys).
