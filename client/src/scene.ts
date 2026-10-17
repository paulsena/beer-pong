// Renderer, camera, post-processing, and the table/cup scene graph.
// Track D owns the lighting/post parts of this file (renderer settings, composer passes).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  BloomEffect, EffectComposer, EffectPass, RenderPass, SMAAEffect, SMAAPreset, ToneMappingEffect, ToneMappingMode, VignetteEffect,
} from 'postprocessing';
import { type CupState, type Seat, type TableId, CUP, TABLE, cupWorldPosition, eyePosition } from '@bp/shared';
import { ENVIRONMENTS, type Environment } from './environments';
import { buildBall, buildCup, buildTable } from './objects';

export type CameraPreset = 'player' | 'opponent' | 'overview' | 'cups';
export const CAMERA_PRESETS: readonly CameraPreset[] = ['player', 'opponent', 'overview', 'cups'];

export interface GameScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  env: Environment;
  table: THREE.Group;
  ball: THREE.Mesh;
  /** cups[side] keyed by cup id. */
  cups: [Map<number, THREE.Group>, Map<number, THREE.Group>];
  /** Place cups for a side to match state (adds/removes/moves meshes). */
  setCups(side: Seat, cups: CupState[]): void;
  setCameraPreset(preset: CameraPreset): void;
  /** Point the camera from a seat's eye down the table. */
  setSeatView(seat: Seat): void;
  render(dt: number): void;
  resize(): void;
  dispose(): void;
}

export function createScene(canvas: HTMLCanvasElement, tableId: TableId): GameScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnv = new RoomEnvironment();
  const envMap = pmrem.fromScene(roomEnv, 0.04).texture;
  scene.environment = envMap;
  scene.environmentIntensity = 0.5; // environments override this to suit their mood
  roomEnv.dispose();
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(60, 1, 0.02, 200);

  const env = ENVIRONMENTS[tableId]({ renderer, scene });
  scene.add(env.root);
  renderer.toneMappingExposure = env.post.exposure;

  // Table top surface sits at y = 0.
  const table = buildTable(env.materials);
  scene.add(table);
  const ball = buildBall(env.materials);
  ball.visible = false;
  scene.add(ball);

  const cups: [Map<number, THREE.Group>, Map<number, THREE.Group>] = [new Map(), new Map()];
  function setCups(side: Seat, list: CupState[]) {
    const map = cups[side];
    const alive = new Set(list.map((c) => c.id));
    for (const [id, mesh] of map) {
      if (!alive.has(id)) {
        scene.remove(mesh);
        map.delete(id);
      }
    }
    for (const c of list) {
      let mesh = map.get(c.id);
      if (!mesh) {
        mesh = buildCup(env.materials);
        mesh.userData = { side, cupId: c.id };
        map.set(c.id, mesh);
        scene.add(mesh);
      }
      const p = cupWorldPosition(side, c);
      mesh.position.set(p.x, p.y, p.z);
    }
  }

  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new BloomEffect({
    intensity: env.post.bloomIntensity,
    luminanceThreshold: env.post.bloomThreshold,
    luminanceSmoothing: env.post.bloomSmoothing,
    mipmapBlur: true,
  });
  // The composer renders to float targets, so the renderer's own tone mapping never runs:
  // bloom works on HDR values, then ACES tone mapping + vignette, then SMAA on the LDR image.
  const toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
  const vignette = new VignetteEffect({ offset: 0.3, darkness: env.post.vignette ?? 0.45 });
  composer.addPass(new EffectPass(camera, bloom, toneMapping, vignette));
  composer.addPass(new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.HIGH })));

  function setSeatView(seat: Seat) {
    const e = eyePosition(seat);
    camera.position.set(e.x, e.y, e.z);
    camera.lookAt(0, 0, (seat === 0 ? -1 : 1) * TABLE.length * 0.3);
  }

  function setCameraPreset(preset: CameraPreset) {
    switch (preset) {
      case 'player':
        setSeatView(0);
        break;
      case 'opponent':
        setSeatView(1);
        break;
      case 'overview':
        camera.position.set(1.9, 1.4, 0.4);
        camera.lookAt(0, -0.1, 0);
        break;
      case 'cups':
        camera.position.set(0.35, 0.35, -TABLE.length / 2 + 0.75);
        camera.lookAt(0, CUP.height / 2, -TABLE.length / 2 + 0.2);
        break;
    }
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  let elapsed = 0;
  function render(dt: number) {
    elapsed += dt;
    env.update(dt, elapsed);
    composer.render(dt);
  }

  resize();
  setSeatView(0);

  return {
    renderer, scene, camera, env, table, ball, cups, setCups, setCameraPreset, setSeatView, render, resize,
    dispose() {
      env.dispose();
      envMap.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}
