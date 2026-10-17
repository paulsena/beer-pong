// TODO(track D): frat basement. Sticky wood table, string lights, posters, couch, dim warm feel.
import * as THREE from 'three';
import type { EnvironmentFactory } from './types';

export const createBasement: EnvironmentFactory = () => {
  const palette = {
    wood: '#7a4a2a', cupRed: '#c8102e', cupWhite: '#f2efe9', beer: '#e0a526', wall: '#3b2f2a', floor: '#2a2320',
  };
  const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, flatShading: true, ...extra });
  const root = new THREE.Group();
  root.add(new THREE.HemisphereLight('#ffd9b0', '#2a2320', 0.6));
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
