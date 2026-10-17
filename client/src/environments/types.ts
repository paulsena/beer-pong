import type * as THREE from 'three';

/** Materials the shared table/cup/ball builders (objects.ts) use. Environments own their look. */
export interface EnvMaterials {
  tableTop: THREE.Material;
  tableSide: THREE.Material;
  tableLegs: THREE.Material;
  cupOuter: THREE.Material;
  cupInner: THREE.Material;
  cupRim: THREE.Material;
  beer: THREE.Material;
  ball: THREE.Material;
}

export interface PostSettings {
  exposure: number;
  bloomIntensity: number;
  bloomThreshold: number;
  bloomSmoothing: number;
}

export interface EnvContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
}

export interface Environment {
  /** The fixed 6-8 color palette every material in this environment uses. */
  palette: Record<string, string>;
  materials: EnvMaterials;
  /** Lights, sky, props. Added to the scene by scene.ts. */
  root: THREE.Object3D;
  post: PostSettings;
  /** Per-frame animation (flickering bulbs, swaying lights...). */
  update(dt: number, elapsed: number): void;
  dispose(): void;
}

export type EnvironmentFactory = (ctx: EnvContext) => Environment;
