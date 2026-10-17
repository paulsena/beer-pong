// Mouse-flick throwing: grab, drag, release. (Track A)
//
// The flick's upward speed picks how far down the table the ball should land, and its sideways
// angle picks the aim; we then solve the launch velocity for a fixed arc. Mapping to distance
// (instead of raw ball speed) keeps the make window wide enough for a mouse.
// Hold Shift while releasing for a bounce shot: a low, hard throw aimed at the table.
import * as THREE from 'three';
import { BALL, PHYSICS, THROW, type Vec3 } from '@bp/shared';

export interface ThrowInput {
  /** Allow a throw from this eye/camera. */
  enable(): void;
  disable(): void;
  /** Called on release with the launch point and velocity. */
  onRelease(cb: (p: Vec3, v: Vec3) => void): void;
  /** Where the held ball should be drawn, or null when not holding. */
  heldBallPosition(): THREE.Vector3 | null;
  /** True while Shift is held (bounce-shot mode), for HUD hints. */
  bounceMode(): boolean;
  update(dt: number): void;
  dispose(): void;
}

export interface Flick {
  /** Flick velocity in viewport heights per second; +up is negative screen Y, so pass -vy. */
  up: number;
  /** Sideways velocity in viewport heights per second (+ right). */
  side: number;
}

export const FLICK = {
  /** Upward flicks slower than this (heights/s) cancel the throw. */
  minUp: 0.35,
  /** Lob: flick speed range -> horizontal landing distance range (m, from the release point). */
  lobUp: [0.5, 4.5] as const,
  lobDist: [1.3, 3.7] as const,
  lobAngleDeg: 52,
  /** Bounce: flick range -> distance to the table bounce point. */
  bounceDist: [0.7, 2.1] as const,
  bounceAngleDeg: -12,
  /** Sideways flick angle is scaled down by this before becoming aim yaw. */
  sideGain: 0.3,
  /** Fractional landing-distance noise (1 sigma), on top of THROW.wobble yaw noise. */
  distWobble: 0.006,
  /** Time window of pointer samples used to measure the flick. */
  sampleMs: 90,
};

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

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
/** Standard normal sample (Box-Muller). */
const gauss = (rand: () => number) => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

/**
 * Pure flick -> launch velocity. `yaw` is the thrower's facing (radians around +Y, 0 = facing -Z).
 * Returns null when the flick is too weak to count as a throw.
 */
export function flickToVelocity(
  flick: Flick, from: Vec3, yaw: number, bounce: boolean, rand: () => number = Math.random, aimOrigin: Vec3 = from,
): Vec3 | null {
  if (flick.up < FLICK.minUp) return null;
  const t = clamp01((flick.up - FLICK.lobUp[0]) / (FLICK.lobUp[1] - FLICK.lobUp[0]));
  const range = bounce ? FLICK.bounceDist : FLICK.lobDist;
  const dist = lerp(range[0], range[1], t) * (1 + gauss(rand) * FLICK.distWobble);
  const aimYaw = yaw - Math.atan2(flick.side, flick.up) * FLICK.sideGain + gauss(rand) * THROW.wobble;
  // Facing -Z at yaw 0; positive yaw turns toward -X (right-handed around +Y).
  const dirX = -Math.sin(aimYaw);
  const dirZ = -Math.cos(aimYaw);
  // Lobs aim at rim height; bounce shots aim at the table surface.
  const targetY = bounce ? BALL.radius : 0.12;
  // Distance and direction are measured from the eye line, so a straight flick from the hand
  // (which sits off to the side) still lands on the center line.
  const target: Vec3 = [aimOrigin[0] + dirX * dist, targetY, aimOrigin[2] + dirZ * dist];
  return aimVelocity(from, target, bounce ? FLICK.bounceAngleDeg : FLICK.lobAngleDeg);
}

interface Sample {
  x: number;
  y: number;
  t: number;
}

/** `facingYaw`: the thrower's fixed facing (0 = toward -Z). Defaults to the camera's current facing. */
export function createThrowInput(canvas: HTMLCanvasElement, camera: THREE.PerspectiveCamera, facingYaw?: number): ThrowInput {
  let enabled = false;
  let holding = false;
  let shift = false;
  let samples: Sample[] = [];
  let release: ((p: Vec3, v: Vec3) => void) | null = null;
  /** Drag offset of the held ball from its rest spot, in viewport heights. */
  const drag = new THREE.Vector2();
  let start: Sample | null = null;
  const held = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  function yaw(): number {
    if (facingYaw !== undefined) return facingYaw;
    camera.getWorldDirection(tmp);
    return Math.atan2(-tmp.x, -tmp.z);
  }

  /** Rest spot of the ball in the hand, offset by the current drag. */
  function handPosition(out: THREE.Vector3): THREE.Vector3 {
    const o = THROW.releaseOffset;
    out.set(o.x + drag.x * 0.25, o.y + drag.y * 0.25, o.z);
    out.applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw());
    return out.add(camera.position);
  }

  function onDown(e: PointerEvent) {
    if (!enabled || e.button !== 0) return;
    holding = true;
    canvas.setPointerCapture(e.pointerId);
    start = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    samples = [start];
    drag.set(0, 0);
  }

  function onMove(e: PointerEvent) {
    if (!holding || !start) return;
    const h = window.innerHeight;
    samples.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    if (samples.length > 64) samples.shift();
    drag.set((e.clientX - start.x) / h, -(e.clientY - start.y) / h).clampLength(0, 0.6);
  }

  function onUp(e: PointerEvent) {
    if (!holding) return;
    holding = false;
    samples.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    const last = samples[samples.length - 1]!;
    // Measure over the recent window, but always reach back at least two samples so slow frames
    // (sparse pointer events) still see the motion.
    let i = samples.findIndex((s) => last.t - s.t <= FLICK.sampleMs);
    i = Math.max(0, Math.min(i, samples.length - 3));
    const first = samples[i]!;
    const dt = (last.t - first.t) / 1000;
    const p = handPosition(new THREE.Vector3());
    drag.set(0, 0);
    if (dt <= 0.005) return;
    const h = window.innerHeight;
    const flick: Flick = { up: -(last.y - first.y) / h / dt, side: (last.x - first.x) / h / dt };
    const from: Vec3 = [p.x, p.y, p.z];
    const eye = camera.position;
    const v = flickToVelocity(flick, from, yaw(), shift || e.shiftKey, Math.random, [eye.x, eye.y, eye.z]);
    if (v && release) release(from, v);
  }

  const onKey = (e: KeyboardEvent) => {
    shift = e.shiftKey;
  };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', () => (holding = false));
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);

  return {
    enable() {
      enabled = true;
    },
    disable() {
      enabled = false;
      holding = false;
      drag.set(0, 0);
    },
    onRelease(cb) {
      release = cb;
    },
    heldBallPosition() {
      return enabled ? handPosition(held) : null;
    },
    bounceMode: () => shift,
    update() {},
    dispose() {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    },
  };
}
