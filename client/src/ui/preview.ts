// Dev-only preview of the UI + avatar (client/ui-preview.html). Not imported by main.ts.
//
// Query params:
//   view = menu | invite | lobby | hud | rerack | cups | wheel | chat | bubbles | gameover | lose | error | avatar
//   emote = cheer | taunt | facepalm | nice   (avatar plays it)
//   t = seconds into the emote to freeze at (for screenshots); omitted = live animation
//   throwing = 1 (avatar throw-ready pose), color = avatar color hex without '#'
import * as THREE from 'three';
import {
  AVATAR_COLORS, EMOTES, type EmoteId, type GameState, RERACK_SHAPES, TABLE, createInitialState, rackLayout,
} from '@bp/shared';
import { createAvatar } from '../avatar';
import { createAudio, type SoundName } from '../audio';
import { createUI } from './index';

declare global {
  interface Window {
    __shotReady?: boolean;
  }
}

const params = new URLSearchParams(location.search);
const view = params.get('view') ?? 'hud';
const emoteParam = params.get('emote') as EmoteId | null;
const freezeT = params.has('t') ? Number(params.get('t')) : null;
const color = params.get('color') ? `#${params.get('color')}` : AVATAR_COLORS[4];

// ---------- 3D backdrop with the avatar ----------
const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#2a1c26');
scene.fog = new THREE.Fog('#2a1c26', 6, 14);
const camera = new THREE.PerspectiveCamera(60, 1, 0.02, 100);

scene.add(new THREE.HemisphereLight('#ffe2c4', '#3a2a35', 0.9));
const key = new THREE.DirectionalLight('#ffd2a0', 2.2);
key.position.set(1.5, 3.5, 2.5);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.left = -3;
key.shadow.camera.right = 3;
key.shadow.camera.top = 3;
key.shadow.camera.bottom = -3;
scene.add(key);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: '#4a3644', roughness: 1 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -TABLE.height;
floor.receiveShadow = true;
scene.add(floor);
const table = new THREE.Mesh(
  new THREE.BoxGeometry(TABLE.width, TABLE.thickness, TABLE.length),
  new THREE.MeshStandardMaterial({ color: '#7a4f2c', roughness: 0.7, flatShading: true }),
);
table.position.y = -TABLE.thickness / 2;
table.castShadow = table.receiveShadow = true;
scene.add(table);
const cupMat = new THREE.MeshStandardMaterial({ color: '#e63946', roughness: 0.4, flatShading: true });
for (const z of [-1, 1]) {
  for (const p of rackLayout('triangle', 10)) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.0475, 0.03, 0.12, 16), cupMat);
    cup.position.set(p.x * z, 0.06, z * (TABLE.length / 2 - p.d));
    cup.castShadow = true;
    scene.add(cup);
  }
}

const avatar = createAvatar(color);
avatar.object.position.set(0, -TABLE.height, -TABLE.length / 2 - 0.55);
scene.add(avatar.object);
avatar.object.traverse((o) => {
  o.castShadow = true;
});
if (params.get('throwing') === '1') avatar.setThrowing(true);

if (view === 'avatar' && params.get('cam') === 'close') {
  camera.position.set(0.25, 0.85, -TABLE.length / 2 + 0.1);
  camera.lookAt(0, 0.8, -TABLE.length / 2 - 0.55);
} else if (view === 'avatar') {
  camera.position.set(0.9, 0.35, -TABLE.length / 2 + 1.6);
  camera.lookAt(0, 0.15, -TABLE.length / 2 - 0.55);
} else {
  camera.position.set(0, 0.95, TABLE.length / 2 + 0.45);
  camera.lookAt(0, 0.1, -TABLE.length / 2);
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
resize();
window.addEventListener('resize', resize);

// ---------- UI ----------
const ui = createUI(document.querySelector<HTMLElement>('#ui')!);
const audio = createAudio();
ui.onUiSound?.(() => audio.play('ui_click'));
window.addEventListener('pointerdown', () => void audio.unlock(), { once: true });

function fakeState(): GameState {
  const s = createInitialState('basement');
  s.phase = 'playing';
  s.players = [
    { name: 'Paul', color: '#2a9d8f', connected: true },
    { name: 'Big Mike', color: '#e63946', connected: true },
  ];
  // I've sunk a few of theirs; they've sunk two of mine.
  s.sides[1] = s.sides[1].filter((c) => ![0, 5, 9, 3].includes(c.id));
  s.sides[0] = s.sides[0].filter((c) => ![2, 7].includes(c.id));
  s.reracksLeft = [1, 2];
  s.turn = 0;
  s.throwsLeft = 1;
  s.throwId = 7;
  return s;
}

const state = fakeState();
const mySeat = 0 as const;
const log = (m: string) => console.log(`[preview] ${m}`);

ui.onEmote((e) => {
  ui.showEmote(e, true);
  avatar.playEmote(e);
  log(`emote ${e}`);
});
ui.onChat((m) => {
  ui.showChat(m, 'Paul', true);
  log(`chat ${m}`);
});

const handlers = {
  onCreate: (p: unknown) => {
    log(`create ${JSON.stringify(p)}`);
    void audio.unlock().then(() => audio.setAmbience('basement'));
    ui.showLobby('K7QX', `${location.origin}/?room=K7QX`);
  },
  onJoin: (p: unknown) => {
    log(`join ${JSON.stringify(p)}`);
    ui.showHud();
    ui.updateHud(state, mySeat);
  },
};

const inGame = () => {
  ui.showHud();
  ui.updateHud(state, mySeat);
};

switch (view) {
  case 'menu':
    ui.showMenu(handlers);
    break;
  case 'invite':
    ui.showMenu(handlers, 'k7qx');
    break;
  case 'lobby':
    ui.showLobby('K7QX', 'http://localhost:5173/?room=K7QX');
    break;
  case 'hud':
    inGame();
    ui.toast('Your turn');
    break;
  case 'rerack':
    inGame();
    ui.showRerackPicker(RERACK_SHAPES, state.reracksLeft[mySeat], (s) => log(`rerack ${s}`), () => ui.hideRerackPicker());
    break;
  case 'cups': {
    state.turn = 1;
    state.phase = 'awaiting_pick';
    state.pendingPick = { defender: 0, remaining: 1 };
    inGame();
    ui.showCupPicker(state.sides[0], (id) => {
      log(`pick ${id}`);
      ui.hideCupPicker();
    });
    break;
  }
  case 'wheel':
    inGame();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }));
    break;
  case 'chat':
    inGame();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 't' }));
    break;
  case 'bubbles':
    inGame();
    ui.showEmote('cheer', false);
    ui.showChat(2, 'Big Mike', false);
    ui.showEmote('nice', true);
    ui.showChat(0, 'Paul', true);
    break;
  case 'gameover':
    state.phase = 'game_over';
    state.winner = 0;
    state.sides[1] = [];
    inGame();
    ui.showGameOver(true, () => log('rematch'));
    break;
  case 'lose':
    state.phase = 'game_over';
    state.winner = 1;
    state.sides[0] = [];
    inGame();
    ui.showGameOver(false, () => log('rematch'));
    break;
  case 'error':
    ui.showMenu(handlers);
    ui.showError('Room not found. Check the code and try again.');
    break;
  case 'avatar':
    break;
}

// Sound board for manual testing: press F1..F10 in the preview (after clicking once).
const SOUNDS: SoundName[] = ['throw', 'table_bounce', 'cup_hit', 'splash', 'swat', 'cheer', 'groan', 'win', 'lose', 'ui_click'];
window.addEventListener('keydown', (e) => {
  const m = /^F(\d+)$/.exec(e.key);
  if (!m) return;
  const s = SOUNDS[Number(m[1]) - 1];
  if (s) {
    e.preventDefault();
    void audio.unlock().then(() => audio.play(s));
  }
});

// ---------- loop ----------
let emoteIdx = 0;
if (emoteParam) avatar.playEmote(emoteParam);
if (freezeT !== null) {
  // Deterministic frame for screenshots: settle the idle pose, then advance into the emote.
  if (emoteParam) {
    // Restart so the settle steps don't eat into the emote time.
    for (let i = 0; i < 30; i++) avatar.update(1 / 60);
    avatar.playEmote(emoteParam);
  } else {
    for (let i = 0; i < 60; i++) avatar.update(1 / 60);
  }
  const steps = Math.round(freezeT * 60);
  for (let i = 0; i < steps; i++) avatar.update(1 / 60);
  renderer.render(scene, camera);
  requestAnimationFrame(() => {
    renderer.render(scene, camera);
    window.__shotReady = true;
  });
} else {
  let last = performance.now();
  let sinceEmote = 0;
  let frames = 0;
  const tick = () => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;
    if (!emoteParam && view === 'avatar') {
      sinceEmote += dt;
      if (sinceEmote > 3) {
        sinceEmote = 0;
        avatar.playEmote(EMOTES[emoteIdx++ % EMOTES.length]!);
      }
    }
    avatar.update(dt);
    renderer.render(scene, camera);
    if (++frames === 10) window.__shotReady = true;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
