// Throwing, PGA Tour style: aim, then a 3-click swing meter. (Track A)
//
// 1. Aim: move the mouse over the table. A landing marker follows it (snapping onto a cup when
//    close) and a dotted arc previews a perfect shot. B / right-click toggles lob vs bounce shot.
// 2. Click (or Space) to start the swing. The meter fills toward 100% and beyond.
// 3. Click again to set power: 100% lands on the marker, short of it lands short, past it goes long.
// 4. The marker sweeps back; click as it crosses the zone. Early pushes right, late pulls left.
// Esc cancels a swing.
import * as THREE from 'three';
import { BALL, CUP, PHYSICS, TABLE, THROW, type Vec3 } from '@bp/shared';

export interface ThrowInput {
  /** Allow a throw from this eye/camera. */
  enable(): void;
  disable(): void;
  /** Called on release with the launch point and velocity. */
  onRelease(cb: (p: Vec3, v: Vec3) => void): void;
  /** Where the held ball should be drawn, or null when not holding. */
  heldBallPosition(): THREE.Vector3 | null;
  /** The resting release point in the hand (valid even while throwing is disabled). */
  releasePoint(): THREE.Vector3;
  /** True in bounce-shot mode, for HUD hints. */
  bounceMode(): boolean;
  /** Cup centers (world, bottom) the aim marker snaps to: the opponent's cups. */
  setTargets(cups: THREE.Vector3[]): void;
  /** Aim marker + trajectory preview; add to the scene. */
  readonly object: THREE.Object3D;
  update(dt: number): void;
  dispose(): void;
}

// ---------- tuning ----------

export const SWING = {
  lobAngleDeg: 52,
  bounceAngleDeg: -12,
  /** Seconds for the meter to fill from 0 to 100%. */
  powerSeconds: 0.9,
  /** The meter keeps rising to this before auto-locking (an overswing). */
  maxPower: 1.15,
  /** Seconds for the return sweep across 100% of the meter. */
  returnSeconds: 0.75,
  /** The sweep gives up (a shank) this far past the zone. */
  minAccuracy: -0.15,
  /** |power - 1| within this counts as perfect. */
  powerPerfect: 0.025,
  /** Landing distance error per unit of power error (0.5 = 10% off power -> 5% off distance). */
  powerSensitivity: 0.5,
  /** |accuracy| within this counts as perfect (the green zone). */
  accuracyPerfect: 0.035,
  /** Aim yaw error (radians) per unit of accuracy error. */
  accuracySensitivity: 0.3,
  /** Residual random yaw noise (radians, 1 sigma), even on perfect swings. */
  scatter: 0.003,
  /** Aim marker snaps to a cup center within this horizontal distance. */
  snapRadius: CUP.topRadius * 1.3,
} as const;

// ---------- pure helpers (tested) ----------

/**
 * Launch velocity from `from` that passes through `target` at launch angle `deg`. Includes a small
 * boost to offset the ball's linear damping over a typical flight.
 */
export function aimVelocity(from: Vec3, target: Vec3, deg: number): Vec3 | null {
  const dx = target[0] - from[0];
  const dz = target[2] - from[2];
  const dist = Math.hypot(dx, dz);
  const dy = target[1] - from[1];
  const th = (deg * Math.PI) / 180;
  const denom = 2 * Math.cos(th) ** 2 * (dist * Math.tan(th) - dy);
  if (dist < 1e-6 || denom <= 0) return null;
  const v = (1 + BALL.linearDamping * 0.4) * Math.sqrt((-PHYSICS.gravity * dist * dist) / denom);
  const h = v * Math.cos(th);
  return [(dx / dist) * h, v * Math.sin(th), (dz / dist) * h];
}

/** Standard normal sample (Box-Muller). */
const gauss = (rand: () => number) => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

export interface Swing {
  /** Locked power; 1 = perfect. */
  power: number;
  /** Locked accuracy; 0 = perfect, > 0 early (push right), < 0 late (pull left). */
  accuracy: number;
}

/**
 * Pure swing -> launch velocity. The perfect swing sends the ball through `target` (power scales
 * the horizontal distance; accuracy rotates the aim around the release point).
 */
export function swingToVelocity(from: Vec3, target: Vec3, bounce: boolean, swing: Swing, rand: () => number = Math.random): Vec3 | null {
  const pErr = Math.abs(swing.power - 1) <= SWING.powerPerfect ? 0 : swing.power - 1;
  const aErr = Math.abs(swing.accuracy) <= SWING.accuracyPerfect ? 0 : swing.accuracy;
  const scale = 1 + pErr * SWING.powerSensitivity;
  // Positive accuracy error pushes right: rotate the throw direction clockwise seen from above.
  const yawErr = -aErr * SWING.accuracySensitivity + gauss(rand) * SWING.scatter;
  const dx = target[0] - from[0];
  const dz = target[2] - from[2];
  const c = Math.cos(yawErr);
  const s = Math.sin(yawErr);
  const rx = (dx * c + dz * s) * scale;
  const rz = (-dx * s + dz * c) * scale;
  return aimVelocity(from, [from[0] + rx, target[1], from[2] + rz], bounce ? SWING.bounceAngleDeg : SWING.lobAngleDeg);
}

// ---------- legacy flick mapping (kept for tests) ----------

export interface Flick {
  /** Flick velocity in viewport heights per second (+ up). */
  up: number;
  /** Sideways velocity in viewport heights per second (+ right). */
  side: number;
}

export const FLICK = {
  minUp: 0.35,
  lobUp: [0.5, 4.5] as const,
  lobDist: [1.3, 3.7] as const,
  bounceDist: [0.7, 2.1] as const,
  sideGain: 0.3,
  distWobble: 0.006,
};

/** Flick -> launch velocity (see FLICK). Returns null for a flick too weak to count. */
export function flickToVelocity(
  flick: Flick, from: Vec3, yaw: number, bounce: boolean, rand: () => number = Math.random, aimOrigin: Vec3 = from,
): Vec3 | null {
  if (flick.up < FLICK.minUp) return null;
  const t = Math.min(1, Math.max(0, (flick.up - FLICK.lobUp[0]) / (FLICK.lobUp[1] - FLICK.lobUp[0])));
  const range = bounce ? FLICK.bounceDist : FLICK.lobDist;
  const dist = (range[0] + (range[1] - range[0]) * t) * (1 + gauss(rand) * FLICK.distWobble);
  const aimYaw = yaw - Math.atan2(flick.side, flick.up) * FLICK.sideGain + gauss(rand) * THROW.wobble;
  const target: Vec3 = [aimOrigin[0] - Math.sin(aimYaw) * dist, bounce ? BALL.radius : CUP.height, aimOrigin[2] - Math.cos(aimYaw) * dist];
  return aimVelocity(from, target, bounce ? SWING.bounceAngleDeg : SWING.lobAngleDeg);
}

// ---------- input controller ----------

type Phase = 'aim' | 'power' | 'accuracy';

const METER_CSS = `
.bp-swing { position: fixed; left: 50%; bottom: 74px; transform: translateX(-50%); width: min(460px, 70vw);
  font: 700 13px/1.2 Nunito, system-ui, sans-serif; color: #fff; text-align: center; pointer-events: none;
  z-index: 5; text-shadow: 0 1px 2px rgba(0,0,0,.7); user-select: none; }
.bp-swing.idle .bp-swing-row, .bp-swing.idle .bp-swing-track { visibility: hidden; }
.bp-swing-track { position: relative; height: 22px; margin-top: 6px; border-radius: 11px; overflow: hidden;
  background: rgba(15,12,20,.72); box-shadow: 0 0 0 2px rgba(255,255,255,.18) inset; }
.bp-swing-fill { position: absolute; top: 0; bottom: 0; background: linear-gradient(90deg,#ffb347,#ff7b29); opacity: .85; }
.bp-swing-zone { position: absolute; top: 0; bottom: 0; background: #3ddc84; opacity: .9; }
.bp-swing-full { position: absolute; top: 0; bottom: 0; width: 3px; margin-left: -1px; background: #fff; }
.bp-swing-lock { position: absolute; top: 0; bottom: 0; width: 3px; margin-left: -1px; background: #ffd166; box-shadow: 0 0 6px #ffd166; }
.bp-swing-mark { position: absolute; top: 0; bottom: 0; width: 4px; margin-left: -2px; background: #fff; border-radius: 2px;
  box-shadow: 0 0 8px #fff; }
.bp-swing-row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.bp-swing-mode { padding: 2px 8px; border-radius: 8px; background: rgba(255,255,255,.16); letter-spacing: .06em; }
.bp-swing-mode.bounce { background: #ffd166; color: #2a1a00; text-shadow: none; }
.bp-swing-result { font-size: 15px; min-height: 18px; margin-top: 4px; }
`;

/** Meter x position (0..1 of the track) for a meter value in [minAccuracy, maxPower]. */
function meterX(v: number) {
  return (v - SWING.minAccuracy) / (SWING.maxPower - SWING.minAccuracy);
}

function grade(swing: Swing): string {
  const p = swing.power - 1;
  const a = swing.accuracy;
  const pw = Math.abs(p) <= SWING.powerPerfect ? 'Perfect power' : p < 0 ? `${Math.round(-p * 100)}% short` : `${Math.round(p * 100)}% long`;
  const ac = Math.abs(a) <= SWING.accuracyPerfect ? 'dead straight' : a > 0 ? 'pushed right' : 'pulled left';
  return `${pw}, ${ac}`;
}

/**
 * `facingYaw`: the thrower's fixed facing (0 = toward -Z). Aim and the hand position use it, not
 * the camera, which turns to follow the ball.
 */
export function createThrowInput(canvas: HTMLCanvasElement, camera: THREE.PerspectiveCamera, facingYaw = 0): ThrowInput {
  let enabled = false;
  let bounce = false;
  let phase: Phase = 'aim';
  let meter = 0;
  let lockedPower = 0;
  let release: ((p: Vec3, v: Vec3) => void) | null = null;
  let targets: THREE.Vector3[] = [];
  const mouse = new THREE.Vector2(0, -0.2);
  let hasMouse = false;
  /** Aim point at the rim plane (lob) or table surface (bounce). Frozen once the swing starts. */
  const aim = new THREE.Vector3();
  let snapped = false;
  const raycaster = new THREE.Raycaster();
  const tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const forward = facingYaw === 0 ? -1 : 1;

  // --- 3D: aim marker + trajectory preview ---
  const object = new THREE.Group();
  object.name = 'aim';
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(CUP.topRadius * 0.82, CUP.topRadius * 1.05, 40),
    new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 20;
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.006, 16), new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false }));
  dot.rotation.x = -Math.PI / 2;
  dot.renderOrder = 20;
  const ARC_POINTS = 48;
  const arcGeo = new THREE.BufferGeometry();
  arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ARC_POINTS * 3), 3));
  const arc = new THREE.Points(
    arcGeo,
    new THREE.PointsMaterial({ color: '#ffffff', size: 0.012, transparent: true, opacity: 0.55, depthTest: false }),
  );
  arc.frustumCulled = false;
  arc.renderOrder = 19;
  object.add(ring, dot, arc);
  object.visible = false;

  // --- DOM: swing meter ---
  if (!document.getElementById('bp-swing-css')) {
    const style = document.createElement('style');
    style.id = 'bp-swing-css';
    style.textContent = METER_CSS;
    document.head.append(style);
  }
  const el = document.createElement('div');
  el.className = 'bp-swing idle';
  el.innerHTML = `
    <div class="bp-swing-row"><span class="bp-swing-hint"></span><span class="bp-swing-mode"></span></div>
    <div class="bp-swing-track">
      <div class="bp-swing-fill"></div><div class="bp-swing-zone"></div>
      <div class="bp-swing-full"></div><div class="bp-swing-lock"></div><div class="bp-swing-mark"></div>
    </div>
    <div class="bp-swing-result"></div>`;
  document.body.append(el);
  const q = (c: string) => el.querySelector<HTMLElement>(c)!;
  const hintEl = q('.bp-swing-hint');
  const modeEl = q('.bp-swing-mode');
  const fillEl = q('.bp-swing-fill');
  const zoneEl = q('.bp-swing-zone');
  const fullEl = q('.bp-swing-full');
  const lockEl = q('.bp-swing-lock');
  const markEl = q('.bp-swing-mark');
  const resultEl = q('.bp-swing-result');
  const pct = (v: number) => `${(meterX(v) * 100).toFixed(2)}%`;
  zoneEl.style.left = pct(-SWING.accuracyPerfect);
  zoneEl.style.width = `${((meterX(SWING.accuracyPerfect) - meterX(-SWING.accuracyPerfect)) * 100).toFixed(2)}%`;
  fullEl.style.left = pct(1);
  let resultTimer: ReturnType<typeof setTimeout> | undefined;

  function handPosition(out: THREE.Vector3): THREE.Vector3 {
    const o = THROW.releaseOffset;
    out.set(o.x, o.y, o.z).applyAxisAngle(THREE.Object3D.DEFAULT_UP, facingYaw);
    return out.add(camera.position);
  }

  /** Move the aim point to the table point under the mouse, clamped to the far side, snapping to cups. */
  function updateAim() {
    raycaster.setFromCamera(mouse, camera);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(tablePlane, hit)) hit.set(0, 0, forward * TABLE.length * 0.4);
    hit.x = THREE.MathUtils.clamp(hit.x, -TABLE.width / 2 + 0.02, TABLE.width / 2 - 0.02);
    const far = forward * (TABLE.length / 2 - 0.03);
    const near = bounce ? -forward * 0.4 : forward * 0.1;
    hit.z = THREE.MathUtils.clamp(hit.z, Math.min(far, near), Math.max(far, near));
    snapped = false;
    if (!bounce) {
      let best: THREE.Vector3 | null = null;
      let bestD: number = SWING.snapRadius;
      for (const c of targets) {
        const d = Math.hypot(c.x - hit.x, c.z - hit.z);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (best) {
        hit.set(best.x, 0, best.z);
        snapped = true;
      }
    }
    // Lobs aim through the rim plane; bounce shots at the table surface.
    aim.set(hit.x, bounce ? BALL.radius : CUP.height, hit.z);
  }

  function drawPreview() {
    const from = handPosition(new THREE.Vector3());
    const v = aimVelocity([from.x, from.y, from.z], [aim.x, aim.y, aim.z], bounce ? SWING.bounceAngleDeg : SWING.lobAngleDeg);
    const pos = arcGeo.getAttribute('position') as THREE.BufferAttribute;
    if (v) {
      // Sample the flight up to the aim point.
      const tEnd = Math.hypot(aim.x - from.x, aim.z - from.z) / Math.hypot(v[0], v[2]);
      for (let i = 0; i < ARC_POINTS; i++) {
        const t = (tEnd * (i + 1)) / ARC_POINTS;
        pos.setXYZ(i, from.x + v[0] * t, from.y + v[1] * t + 0.5 * PHYSICS.gravity * t * t, from.z + v[2] * t);
      }
      pos.needsUpdate = true;
    }
    arc.visible = !!v;
    const ringY = snapped ? CUP.height + 0.002 : 0.002;
    ring.position.set(aim.x, ringY, aim.z);
    dot.position.set(aim.x, ringY, aim.z);
    const color = bounce ? '#ffd166' : snapped ? '#3ddc84' : '#ffffff';
    (ring.material as THREE.MeshBasicMaterial).color.set(color);
    (dot.material as THREE.MeshBasicMaterial).color.set(color);
  }

  function renderMeter() {
    modeEl.textContent = bounce ? 'BOUNCE' : 'LOB';
    modeEl.classList.toggle('bounce', bounce);
    hintEl.textContent =
      phase === 'aim' ? 'Aim with the mouse · Click to swing · B: shot type'
        : phase === 'power' ? 'Click to set power (white line = on target)'
          : 'Click in the green zone!';
    const swinging = phase !== 'aim';
    fillEl.style.display = swinging ? '' : 'none';
    markEl.style.display = swinging ? '' : 'none';
    lockEl.style.display = phase === 'accuracy' ? '' : 'none';
    const top = phase === 'power' ? meter : lockedPower;
    fillEl.style.left = pct(0);
    fillEl.style.width = `${((meterX(top) - meterX(0)) * 100).toFixed(2)}%`;
    lockEl.style.left = pct(lockedPower);
    markEl.style.left = pct(meter);
  }

  function showResult(text: string) {
    resultEl.textContent = text;
    clearTimeout(resultTimer);
    resultTimer = setTimeout(() => (resultEl.textContent = ''), 2500);
  }

  function cancel() {
    phase = 'aim';
    meter = 0;
  }

  /** Advance the swing: start, lock power, lock accuracy (and throw). */
  function press() {
    if (!enabled) return;
    if (phase === 'aim') {
      if (hasMouse) updateAim();
      phase = 'power';
      meter = 0;
    } else if (phase === 'power') {
      lockedPower = meter;
      phase = 'accuracy';
    } else {
      finish(meter);
    }
  }

  function finish(accuracy: number) {
    const swing: Swing = { power: lockedPower, accuracy };
    const p = handPosition(new THREE.Vector3());
    const from: Vec3 = [p.x, p.y, p.z];
    const v = swingToVelocity(from, [aim.x, aim.y, aim.z], bounce, swing);
    showResult(grade(swing));
    cancel();
    if (v && release) release(from, v);
  }

  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    hasMouse = true;
  };
  const onDown = (e: PointerEvent) => {
    if (!enabled) return;
    if (e.button === 2) {
      if (phase === 'aim') bounce = !bounce;
      return;
    }
    if (e.button === 0) press();
  };
  const onKey = (e: KeyboardEvent) => {
    if (!enabled || e.repeat) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.code === 'Space') {
      e.preventDefault();
      press();
    } else if (e.code === 'KeyB' && phase === 'aim') {
      bounce = !bounce;
    } else if (e.code === 'Escape') {
      cancel();
    }
  };
  const noMenu = (e: MouseEvent) => e.preventDefault();

  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('contextmenu', noMenu);
  window.addEventListener('keydown', onKey);

  return {
    object,
    enable() {
      if (!enabled) cancel();
      enabled = true;
    },
    disable() {
      enabled = false;
      cancel();
    },
    onRelease(cb) {
      release = cb;
    },
    heldBallPosition() {
      return enabled ? handPosition(new THREE.Vector3()) : null;
    },
    releasePoint() {
      return handPosition(new THREE.Vector3());
    },
    bounceMode: () => bounce,
    setTargets(cups) {
      targets = cups;
    },
    update(dt) {
      if (enabled && phase === 'power') {
        meter += dt / SWING.powerSeconds;
        if (meter >= SWING.maxPower) {
          meter = SWING.maxPower;
          lockedPower = meter;
          phase = 'accuracy';
        }
      } else if (enabled && phase === 'accuracy') {
        meter -= dt / SWING.returnSeconds;
        if (meter <= SWING.minAccuracy) finish(SWING.minAccuracy);
      }
      if (enabled && phase === 'aim') updateAim();
      object.visible = enabled;
      el.classList.toggle('idle', !enabled);
      if (enabled) {
        drawPreview();
        renderMeter();
      }
    },
    dispose() {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('contextmenu', noMenu);
      window.removeEventListener('keydown', onKey);
      clearTimeout(resultTimer);
      el.remove();
      object.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    },
  };
}
