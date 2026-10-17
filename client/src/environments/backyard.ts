// TODO(track D): backyard at sunset. Folding table on grass, golden-hour sky, fairy lights, cooler, fence.
import * as THREE from 'three';
import type { EnvironmentFactory } from './types';

export const createBackyard: EnvironmentFactory = () => {
  const palette = {
    wood: '#d8d4cc', cupRed: '#c8102e', cupWhite: '#f2efe9', beer: '#e0a526', wall: '#e9a15b', floor: '#4f7a3a',
  };
  const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, flatShading: true, ...extra });
  const root = new THREE.Group();
  root.add(new THREE.HemisphereLight('#ffd9b0', '#4f7a3a', 0.6));
  const key = new THREE.DirectionalLight('#ffc78a', 2.0);
  key.position.set(1, 3, 1);
  key.castShadow = true;
  root.add(key);
  return {
    palette,
    materials: {
      tableTop: std(palette.wood, { roughness: 0.6 }),
      tableSide: std(palette.wood),
      tableLegs: std(palette.floor),
      cupOuter: std(palette.cupRed, { roughness: 0.35 }),
      cupInner: std(palette.cupWhite, { roughness: 0.5, side: THREE.DoubleSide }),
      cupRim: std(palette.cupWhite),
      beer: std(palette.beer, { roughness: 0.2 }),
      ball: std(palette.cupWhite, { roughness: 0.25 }),
    },
    root,
    post: { exposure: 1.0, bloomIntensity: 0.6, bloomThreshold: 0.85, bloomSmoothing: 0.2 },
    update() {},
    dispose() {},
  };
};
