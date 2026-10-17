// Table, cup and ball meshes, built from shared constants so they match the physics exactly.
import * as THREE from 'three';
import { BALL, CUP, TABLE } from '@bp/shared';
import type { EnvMaterials } from './environments/types';

export function buildTable(m: EnvMaterials): THREE.Group {
  const g = new THREE.Group();
  g.name = 'table';
  const top = new THREE.Mesh(new THREE.BoxGeometry(TABLE.width, TABLE.thickness, TABLE.length), [
    m.tableSide, m.tableSide, m.tableTop, m.tableSide, m.tableSide, m.tableSide,
  ]);
  top.position.y = -TABLE.thickness / 2;
  top.receiveShadow = true;
  top.castShadow = true;
  g.add(top);
  const legH = TABLE.height - TABLE.thickness;
  const legGeo = new THREE.BoxGeometry(0.04, legH, 0.04);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, m.tableLegs);
      leg.position.set(sx * (TABLE.width / 2 - 0.05), -TABLE.thickness - legH / 2, sz * (TABLE.length / 2 - 0.08));
      leg.castShadow = true;
      g.add(leg);
    }
  }
  return g;
}

let cupGeoCache: { outer: THREE.BufferGeometry; inner: THREE.BufferGeometry; rim: THREE.BufferGeometry; beer: THREE.BufferGeometry } | null = null;

function cupGeometries() {
  if (cupGeoCache) return cupGeoCache;
  const { topRadius: rt, bottomRadius: rb, height: h, wallThickness: w, segments } = CUP;
  const outer = new THREE.LatheGeometry(
    [new THREE.Vector2(0, 0), new THREE.Vector2(rb, 0), new THREE.Vector2(rb + (rt - rb) * 0.08, h * 0.08), new THREE.Vector2(rt, h)],
    segments,
  );
  const inner = new THREE.LatheGeometry(
    [new THREE.Vector2(rt - w, h), new THREE.Vector2(rb - w, w), new THREE.Vector2(0, w)],
    segments,
  );
  const rim = new THREE.TorusGeometry(rt - w / 2, 0.0025, 6, segments);
  rim.rotateX(Math.PI / 2);
  rim.translate(0, h, 0);
  const lr = rb + (rt - rb) * (CUP.liquidHeight / h) - w;
  const beer = new THREE.CircleGeometry(lr, segments);
  beer.rotateX(-Math.PI / 2);
  beer.translate(0, CUP.liquidHeight, 0);
  cupGeoCache = { outer, inner, rim, beer };
  return cupGeoCache;
}

/** A cup with its origin at the bottom center. */
export function buildCup(m: EnvMaterials): THREE.Group {
  const geo = cupGeometries();
  const g = new THREE.Group();
  g.name = 'cup';
  const outer = new THREE.Mesh(geo.outer, m.cupOuter);
  outer.castShadow = true;
  outer.receiveShadow = true;
  g.add(outer, new THREE.Mesh(geo.inner, m.cupInner), new THREE.Mesh(geo.rim, m.cupRim));
  const beer = new THREE.Mesh(geo.beer, m.beer);
  beer.name = 'beer';
  g.add(beer);
  return g;
}

export function buildBall(m: EnvMaterials): THREE.Mesh {
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(BALL.radius, 2), m.ball);
  ball.name = 'ball';
  ball.castShadow = true;
  return ball;
}
