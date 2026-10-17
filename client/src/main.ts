// App bootstrap and state machine: menu -> lobby -> game. (Orchestrator)
//
// URL params:
//   ?room=CODE          prefill the join code (invite links)
//   ?practice=<table>   offline practice against an empty rack
//   ?shot=<table>&cam=  screenshot mode for tools/screenshots.ts
import { type CameraPreset, CAMERA_PRESETS, createScene } from './scene';
import { type GameState, type Seat, type TableId, TABLE_IDS, createInitialState } from '@bp/shared';
import { Game } from './game';
import { NetClient } from './net';
import { LocalSession } from './session';
import { createUI } from './ui';
import { createAudio } from './audio';

declare global {
  interface Window {
    /** Set by screenshot mode once the scene has rendered. */
    __shotReady?: boolean;
    /** Test hook (smoke test / console): the running game, if any. */
    __bp?: { game: Game | null; seat: Seat | null; code: string | null };
  }
}

const CONNECT_TIMEOUT_MS = 5000;

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const uiRoot = document.querySelector<HTMLElement>('#ui')!;
const params = new URLSearchParams(location.search);
const asTable = (v: string | null): TableId | null => (v && (TABLE_IDS as readonly string[]).includes(v) ? (v as TableId) : null);

window.__bp = { game: null, seat: null, code: null };

function startShotMode(table: TableId, preset: CameraPreset) {
  const gs = createScene(canvas, table);
  const st = createInitialState(table);
  gs.setCups(0, st.sides[0]);
  gs.setCups(1, st.sides[1]);
  gs.setCameraPreset(preset);
  let frames = 0;
  const tick = () => {
    gs.render(1 / 60);
    if (++frames === 30) window.__shotReady = true;
    else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function startPractice(table: TableId) {
  const ui = createUI(uiRoot);
  const audio = createAudio();
  const unlock = () => void audio.unlock();
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
  const session = new LocalSession(table);
  const game = new Game({ canvas, session, ui, audio, seat: 0, state: session.state, practice: true });
  window.__bp = { game, seat: 0, code: null };
  void game.start();
  session.start();
}

function startOnline() {
  const ui = createUI(uiRoot);
  const audio = createAudio();
  const net = new NetClient();
  let game: Game | null = null;
  // A refresh can rejoin without touching the menu, so unlock audio on the first gesture too.
  const unlock = () => void audio.unlock();
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
  ui.onUiSound?.(() => audio.play('ui_click'));

  net.onStatus((s) => {
    if (s === 'reconnecting') ui.toast('Connection lost — reconnecting…');
    if (s === 'open' && game) ui.toast('Reconnected');
  });
  net.on('error', (m) => {
    if (!game) ui.showError(m.message.replace(/_/g, ' '));
  });
  net.on('joined', (m) => {
    window.__bp!.code = m.code;
    window.__bp!.seat = m.seat;
    // Keep the room in the URL so a refresh rejoins it (see the auto-rejoin below).
    history.replaceState(null, '', `${location.pathname}?room=${m.code}`);
    if (game) return; // rejoin after a reconnect: the game keeps running and picks up the next state
    if (m.state.phase === 'waiting') {
      ui.showLobby(m.code, `${location.origin}${location.pathname}?room=${m.code}`);
      const off = net.on('state', (s) => {
        if (s.state.phase === 'waiting' || game) return;
        off();
        begin(m.seat, s.state);
      });
    } else {
      begin(m.seat, m.state);
    }
  });

  function begin(seat: Seat, state: GameState) {
    ui.hideAll();
    game = new Game({ canvas, session: net, ui, audio, seat, state });
    window.__bp!.game = game;
    void game.start();
  }

  /** Resolves false (with an error shown) if the server can't be reached within a few seconds. */
  async function connect() {
    const timeout = new Promise<false>((resolve) => setTimeout(() => resolve(false), CONNECT_TIMEOUT_MS));
    const ok = await Promise.race([net.connect().then(() => true as const, () => false as const), timeout]);
    if (!ok) ui.showError('Could not reach the game server. Is it running?');
    return ok;
  }

  // One create/join in flight at a time, so repeated clicks don't queue duplicate requests.
  let requesting = false;
  async function request(send: () => void) {
    if (requesting) return;
    requesting = true;
    try {
      if (await connect()) send();
    } finally {
      requesting = false;
    }
  }

  ui.showMenu(
    {
      onCreate: ({ name, color, table }) => {
        void audio.unlock();
        void request(() => net.send({ t: 'create_room', name, color, table }));
      },
      onJoin: ({ name, color, code }) => {
        void audio.unlock();
        void request(() => net.send({ t: 'join_room', name, color, code: code.trim().toUpperCase() }));
      },
    },
    params.get('room') ?? undefined,
  );

  // Refreshed mid-game: the saved token rejoins automatically as soon as we connect.
  const room = params.get('room')?.toUpperCase();
  if (room && net.savedRoomCode() === room) void connect();
}

const shotTable = asTable(params.get('shot'));
const practiceTable = asTable(params.get('practice'));
if (shotTable) {
  const cam = (params.get('cam') ?? 'player') as CameraPreset;
  startShotMode(shotTable, CAMERA_PRESETS.includes(cam) ? cam : 'player');
} else if (practiceTable) {
  startPractice(practiceTable);
} else {
  startOnline();
}
