// App bootstrap and state machine: menu -> lobby -> game. (Orchestrator)
import { type CameraPreset, CAMERA_PRESETS, createScene } from './scene';
import { type TableId, TABLE_IDS, createInitialState } from '@bp/shared';

declare global {
  interface Window {
    /** Set by screenshot mode once the scene has rendered. */
    __shotReady?: boolean;
  }
}

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const params = new URLSearchParams(location.search);

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

const shotTable = params.get('shot') as TableId | null;
if (shotTable && TABLE_IDS.includes(shotTable)) {
  const cam = (params.get('cam') ?? 'player') as CameraPreset;
  startShotMode(shotTable, CAMERA_PRESETS.includes(cam) ? cam : 'player');
} else {
  // TODO(orchestrator, Step 2): menu -> lobby -> game wiring.
  const table = (params.get('table') as TableId | null) ?? 'basement';
  startShotMode(TABLE_IDS.includes(table) ? table : 'basement', 'player');
  window.addEventListener('resize', () => location.reload());
}
