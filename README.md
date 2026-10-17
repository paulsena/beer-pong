# Beer Pong 3D

Two-player online beer pong in the browser (desktop). Three.js + Rapier on the client, a small
Node WebSocket server for rooms. See `PLAN.md` for the design.

## Run locally

```sh
npm install
npm run dev          # client on http://localhost:5173, server on ws://localhost:8787
```

- Play online: open http://localhost:5173, create a room, and open the invite link in a second
  window (or send it to a friend on your network).
- Practice alone: http://localhost:5173/?practice=basement (or `backyard`).

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
| `npm run smoke` | 2-tab Playwright test: create/join, synced throws |

`VITE_SERVER_URL` overrides the WebSocket URL the client connects to (for deploys).
