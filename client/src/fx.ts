// Juice: splash particles, ball trail, camera shake, floating text, cup wobble. (Track A)
import type * as THREE from 'three';

export interface Fx {
  splash(at: THREE.Vector3): void;
  shake(intensity: number): void;
  textPop(text: string, at: THREE.Vector3): void;
  wobble(cup: THREE.Object3D): void;
  trailStart(ball: THREE.Object3D): void;
  trailStop(): void;
  /** Call after camera placement each frame (applies shake offset). */
  update(dt: number): void;
}

export function createFx(_scene: THREE.Scene, _camera: THREE.PerspectiveCamera): Fx {
  return { splash() {}, shake() {}, textPop() {}, wobble() {}, trailStart() {}, trailStop() {}, update() {} };
}
