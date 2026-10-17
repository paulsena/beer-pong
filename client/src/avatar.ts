// Low-poly opponent avatar with emote animations. (Track E)
import * as THREE from 'three';
import type { EmoteId } from '@bp/shared';

export interface Avatar {
  /** Root object; origin at the feet. main.ts places it behind the opponent's end. */
  object: THREE.Object3D;
  setColor(color: string): void;
  playEmote(emote: EmoteId): void;
  /** Throwing pose/anim while the avatar's player is throwing. */
  setThrowing(throwing: boolean): void;
  update(dt: number): void;
  dispose(): void;
}

export function createAvatar(_color: string): Avatar {
  const object = new THREE.Group();
  return { object, setColor() {}, playEmote() {}, setThrowing() {}, update() {}, dispose() {} };
}
