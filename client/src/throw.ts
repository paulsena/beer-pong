// Mouse-flick throwing: grab, drag, release. (Track A)
import type * as THREE from 'three';
import type { Vec3 } from '@bp/shared';

export interface ThrowInput {
  /** Allow a throw from this eye/camera. */
  enable(): void;
  disable(): void;
  /** Called on release with the launch point and velocity. */
  onRelease(cb: (p: Vec3, v: Vec3) => void): void;
  /** Where the held ball should be drawn, or null when not holding. */
  heldBallPosition(): THREE.Vector3 | null;
  update(dt: number): void;
  dispose(): void;
}

export function createThrowInput(_canvas: HTMLCanvasElement, _camera: THREE.PerspectiveCamera): ThrowInput {
  return {
    enable() {},
    disable() {},
    onRelease() {},
    heldBallPosition: () => null,
    update() {},
    dispose() {},
  };
}
