// Frat basement: sticky dark wood table under a hanging pool-table lamp, string lights zigzagging
// under a low joisted ceiling, brick + cinder-block walls with posters, a worn couch, a fridge, a
// keg and the stairs up. Dim and warm: one shadowed key light, low ambient, bloom on the bulbs.
import * as THREE from 'three';
import { TABLE } from '@bp/shared';
import type { EnvironmentFactory } from './types';
import { brickTexture, canvasTexture, createKit, rng, shade, stringLights, type Kit } from './kit';

/** Every material in this file uses only these colors (textures are drawn from them too). */
const palette = {
  wood: '#5e341c',
  brick: '#8c4430',
  concrete: '#5d5852',
  fabric: '#2f5f5b',
  red: '#c8102e',
  white: '#f1e9da',
  amber: '#eba23a',
  ink: '#211b17',
} as const;

const FLOOR = -TABLE.height;
const CEIL = 1.5;
const ROOM_X = 3.0;
const ROOM_Z = 3.6;
/** Neutral multiplier for textured materials (the texture carries the palette colors). */
const TEXTURED = '#ffffff';

export const createBasement: EnvironmentFactory = ({ scene }) => {
  const kit = createKit();
  const P = palette;
  const root = new THREE.Group();
  root.name = 'basement';

  scene.background = new THREE.Color(P.ink);
  scene.fog = new THREE.Fog(P.ink, 6, 14);
  scene.environmentIntensity = 0.12;

  // --- Table / cup / ball materials -------------------------------------------------------------
  const materials = {
    tableTop: kit.mat(TEXTURED, { map: tableTopTexture(kit), roughnessMap: tableRoughness(kit), roughness: 1 }),
    tableSide: kit.mat(P.wood, { roughness: 0.7 }),
    tableLegs: kit.mat(P.ink, { roughness: 0.5, metalness: 0.4 }),
    cupOuter: kit.mat(P.red, { roughness: 0.35 }),
    cupInner: kit.mat(P.white, { roughness: 0.5, side: THREE.DoubleSide }),
    cupRim: kit.mat(P.white, { roughness: 0.4 }),
    beer: kit.mat(P.amber, { roughness: 0.15, emissive: P.amber, emissiveIntensity: 0.08 }),
    ball: kit.mat(P.white, { roughness: 0.22, flatShading: false }),
  };

  // --- Lights -------------------------------------------------------------------------------------
  root.add(new THREE.HemisphereLight(P.amber, P.ink, 0.35));

  // Key: the pool-table lamp over the table. The only shadow caster.
  const key = new THREE.SpotLight(P.amber, 6.5, 0, 1.05, 0.45, 1);
  key.color.lerp(new THREE.Color(P.white), 0.55);
  key.position.set(0, 1.18, 0);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.4;
  key.shadow.camera.far = 4.5;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.015;
  key.shadow.radius = 3;
  root.add(key, key.target);

  // Warm washes from the string lights onto the walls (no shadows).
  const washes = [
    new THREE.PointLight(P.amber, 2.2, 7, 1.6),
    new THREE.PointLight(P.amber, 1.6, 7, 1.6),
    new THREE.PointLight(P.red, 0.9, 5, 1.6),
  ];
  washes[0]!.position.set(0, 1.25, -2.9);
  washes[1]!.position.set(0.4, 1.25, 2.8);
  washes[2]!.position.set(-2.6, 0.9, 0.3);
  root.add(...washes);

  // --- Room shell ---------------------------------------------------------------------------------
  root.add(buildRoom(kit));
  const lamp = buildLamp(kit);
  root.add(lamp);

  // String lights: a zigzag under the ceiling plus runs along the back and left walls.
  const spans: { a: THREE.Vector3; b: THREE.Vector3; sag: number; bulbs: number }[] = [];
  const zs = [-3.3, -2.35, -1.4, -0.45, 0.5, 1.45, 2.4, 3.3];
  for (let i = 0; i < zs.length - 1; i++) {
    const xa = i % 2 === 0 ? -1.5 : 1.5;
    spans.push({
      a: new THREE.Vector3(xa, CEIL - 0.04, zs[i]!),
      b: new THREE.Vector3(-xa, CEIL - 0.04, zs[i + 1]!),
      sag: 0.16,
      bulbs: 9,
    });
  }
  const wy = CEIL - 0.12;
  spans.push(
    { a: new THREE.Vector3(-2.8, wy, -ROOM_Z + 0.06), b: new THREE.Vector3(0, wy, -ROOM_Z + 0.06), sag: 0.14, bulbs: 10 },
    { a: new THREE.Vector3(0, wy, -ROOM_Z + 0.06), b: new THREE.Vector3(2.8, wy, -ROOM_Z + 0.06), sag: 0.14, bulbs: 10 },
    { a: new THREE.Vector3(-ROOM_X + 0.06, wy, -3.2), b: new THREE.Vector3(-ROOM_X + 0.06, wy, 0), sag: 0.12, bulbs: 10 },
    { a: new THREE.Vector3(-ROOM_X + 0.06, wy, 0), b: new THREE.Vector3(-ROOM_X + 0.06, wy, 3.2), sag: 0.12, bulbs: 10 },
  );
  const lights = stringLights(kit, spans, { wire: P.ink, bulb: P.amber, emissive: 7, bulbRadius: 0.018 });
  root.add(lights.group);

  // --- Furniture + props ------------------------------------------------------------------------
  const couch = buildCouch(kit);
  couch.position.set(0.15, FLOOR, -ROOM_Z + 0.5);
  root.add(couch);
  root.add(buildPosters(kit));
  root.add(buildProps(kit));

  // Flicker: a slow breathing on all bulbs plus a few bulbs that stutter.
  const r = rng(7);
  const phase = Array.from({ length: lights.count }, () => r() * Math.PI * 2);
  const flaky = new Set([5, 23, 41, 66, 88]);
  const keyBase = key.intensity;

  return {
    palette: { ...palette },
    materials,
    root,
    post: { exposure: 1.05, bloomIntensity: 1.1, bloomThreshold: 0.9, bloomSmoothing: 0.25, vignette: 0.55 },
    update(_dt, t) {
      for (let i = 0; i < lights.count; i++) {
        let k = 0.85 + 0.15 * Math.sin(t * 1.3 + phase[i]!);
        if (flaky.has(i)) k *= Math.sin(t * 23 + phase[i]!) > 0.6 ? 0.25 : 1;
        lights.setBrightness(i, k);
      }
      lights.commit();
      // The lamp hangs on chains and sways a touch; its light follows.
      const sway = Math.sin(t * 0.7) * 0.012;
      lamp.rotation.x = sway;
      key.position.z = -sway * 0.3;
      key.intensity = keyBase * (0.98 + 0.02 * Math.sin(t * 9.1));
    },
    dispose() {
      kit.dispose();
      key.shadow.dispose();
      scene.fog = null;
      scene.background = null;
    },
  };
};

// --- Textures -------------------------------------------------------------------------------------

function tableTopTexture(kit: Kit): THREE.CanvasTexture {
  const P = palette;
  const r = rng(11);
  return canvasTexture(kit, 256, 1024, (g, w, h) => {
    const planks = 5;
    const pw = w / planks;
    for (let i = 0; i < planks; i++) {
      g.fillStyle = shade(P.wood, 0.9 + r() * 0.22);
      g.fillRect(i * pw, 0, pw, h);
      g.strokeStyle = shade(P.wood, 0.72);
      g.globalAlpha = 0.35;
      g.lineWidth = 1.5;
      for (let k = 0; k < 7; k++) {
        const x0 = i * pw + 4 + r() * (pw - 8);
        g.beginPath();
        g.moveTo(x0, 0);
        for (let y = 0; y <= h; y += 64) g.lineTo(x0 + Math.sin(y * 0.01 + k) * 3, y);
        g.stroke();
      }
      g.globalAlpha = 0.6;
      g.fillStyle = P.ink;
      g.fillRect(i * pw, 200 + r() * 600, pw, 2);
      g.fillRect(i * pw, 0, 2, h);
      g.globalAlpha = 1;
    }
    // Sticky stains: beer puddle blotches and cup rings.
    g.globalAlpha = 0.28;
    for (let k = 0; k < 9; k++) {
      g.fillStyle = k % 3 === 0 ? P.amber : P.ink;
      g.beginPath();
      g.ellipse(r() * w, r() * h, 10 + r() * 30, 14 + r() * 50, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 0.4;
    g.strokeStyle = P.ink;
    g.lineWidth = 3;
    for (let k = 0; k < 10; k++) {
      g.beginPath();
      g.arc(r() * w, h * (0.2 + r() * 0.6), 16, 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
  });
}

/** Roughness map: mostly matte wood with glossy sticky patches (spilled beer). */
function tableRoughness(kit: Kit): THREE.CanvasTexture {
  const r = rng(11);
  return canvasTexture(kit, 128, 512, (g, w, h) => {
    g.fillStyle = 'rgb(200,200,200)';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgb(135,135,135)';
    for (let k = 0; k < 14; k++) {
      g.beginPath();
      g.ellipse(r() * w, r() * h, 6 + r() * 18, 10 + r() * 30, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }, { srgb: false });
}

// --- Room -----------------------------------------------------------------------------------------

function buildRoom(kit: Kit): THREE.Group {
  const P = palette;
  const g = new THREE.Group();
  const H = CEIL - FLOOR;

  // Floor: painted concrete with a rug under the table.
  const floorTex = canvasTexture(kit, 512, 512, (c, w, h) => {
    const r = rng(3);
    c.fillStyle = P.concrete;
    c.fillRect(0, 0, w, h);
    c.globalAlpha = 0.05;
    for (let k = 0; k < 30; k++) {
      c.fillStyle = k % 2 ? P.ink : shade(P.concrete, 1.2);
      c.beginPath();
      c.ellipse(r() * w, r() * h, 20 + r() * 70, 10 + r() * 30, r() * 3, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 0.5;
    c.fillStyle = P.ink;
    c.fillRect(0, 0, w, 2);
    c.fillRect(0, 0, 2, h);
    c.globalAlpha = 1;
  }, { repeat: [3, 3.6] });
  const floor = kit.mesh(kit.geo(new THREE.PlaneGeometry(ROOM_X * 2, ROOM_Z * 2)), kit.mat(TEXTURED, { map: floorTex, roughness: 0.75 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR;
  g.add(floor);

  const rugTex = canvasTexture(kit, 256, 512, (c, w, h) => {
    c.fillStyle = P.fabric;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = P.white;
    c.globalAlpha = 0.7;
    c.lineWidth = 8;
    c.strokeRect(18, 18, w - 36, h - 36);
    c.lineWidth = 3;
    c.strokeRect(34, 34, w - 68, h - 68);
    c.strokeStyle = P.amber;
    c.globalAlpha = 0.35;
    c.lineWidth = 3;
    for (let y = 80; y < h - 60; y += 44) {
      c.beginPath();
      c.moveTo(w / 2, y - 12);
      c.lineTo(w / 2 + 14, y);
      c.lineTo(w / 2, y + 12);
      c.lineTo(w / 2 - 14, y);
      c.closePath();
      c.stroke();
    }
    c.globalAlpha = 1;
  });
  const rug = kit.box(1.9, 0.01, 3.6, kit.mat(TEXTURED, { map: rugTex, roughness: 1 }));
  rug.position.set(0, FLOOR + 0.005, 0.1);
  g.add(rug);

  // Walls: brick at the ends, cinder block on the long sides.
  const brick = brickTexture(kit, P.brick, shade(P.concrete, 0.85), 21, [4, 2.2]);
  const block = brickTexture(kit, P.concrete, shade(P.concrete, 0.7), 22, [5, 2.4], 8, 4);
  const brickMat = kit.mat(TEXTURED, { map: brick, roughness: 0.95 });
  const blockMat = kit.mat(TEXTURED, { map: block, roughness: 0.95 });
  const wallZ = kit.geo(new THREE.PlaneGeometry(ROOM_X * 2, H));
  const wallX = kit.geo(new THREE.PlaneGeometry(ROOM_Z * 2, H));
  const back = kit.mesh(wallZ, brickMat);
  back.position.set(0, FLOOR + H / 2, -ROOM_Z);
  const front = kit.mesh(wallZ, brickMat);
  front.position.set(0, FLOOR + H / 2, ROOM_Z);
  front.rotation.y = Math.PI;
  const left = kit.mesh(wallX, blockMat);
  left.position.set(-ROOM_X, FLOOR + H / 2, 0);
  left.rotation.y = Math.PI / 2;
  const right = kit.mesh(wallX, blockMat);
  right.position.set(ROOM_X, FLOOR + H / 2, 0);
  right.rotation.y = -Math.PI / 2;
  g.add(back, front, left, right);

  // Baseboards hide the wall/floor seam.
  const baseMat = kit.mat(P.ink, { roughness: 0.8 });
  const boards = [[ROOM_X * 2, 0, -ROOM_Z + 0.02, 0], [ROOM_X * 2, 0, ROOM_Z - 0.02, 0], [ROOM_Z * 2, -ROOM_X + 0.02, 0, Math.PI / 2], [ROOM_Z * 2, ROOM_X - 0.02, 0, Math.PI / 2]] as const;
  for (const [w, x, z, ry] of boards) {
    const b = kit.box(w, 0.1, 0.03, baseMat);
    b.position.set(x, FLOOR + 0.05, z);
    b.rotation.y = ry;
    g.add(b);
  }

  // Ceiling: concrete deck with exposed wood joists and a duct.
  const ceil = kit.mesh(kit.geo(new THREE.PlaneGeometry(ROOM_X * 2, ROOM_Z * 2)), kit.mat(P.concrete, { roughness: 1 }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = CEIL + 0.18;
  g.add(ceil);
  const joistMat = kit.mat(P.wood, { roughness: 0.9 });
  for (let z = -ROOM_Z + 0.3; z < ROOM_Z; z += 0.6) {
    const j = kit.box(ROOM_X * 2, 0.18, 0.06, joistMat);
    j.position.set(0, CEIL + 0.09, z);
    g.add(j);
  }
  const duct = kit.mesh(kit.geo(new THREE.CylinderGeometry(0.11, 0.11, ROOM_Z * 2, 8)), kit.mat(P.concrete, { metalness: 0.6, roughness: 0.45 }));
  duct.rotation.x = Math.PI / 2;
  duct.position.set(1.9, CEIL - 0.1, 0);
  g.add(duct);
  return g;
}

/** Long pool-table style lamp hung on two chains, glowing underneath. */
function buildLamp(kit: Kit): THREE.Group {
  const P = palette;
  const g = new THREE.Group();
  g.position.set(0, CEIL + 0.1, 0);
  const body = kit.box(0.26, 0.12, 1.05, kit.mat(P.red, { roughness: 0.4, metalness: 0.2 }), 0.03);
  body.position.y = -0.38;
  const trim = kit.box(0.28, 0.025, 1.07, kit.mat(P.ink, { roughness: 0.5, metalness: 0.5 }));
  trim.position.y = -0.445;
  const glow = kit.box(0.22, 0.01, 0.98, kit.mat(P.amber, { emissive: P.amber, emissiveIntensity: 0.25 }));
  glow.position.y = -0.455;
  g.add(body, trim, glow);
  const chainMat = kit.mat(P.ink, { metalness: 0.6, roughness: 0.4 });
  for (const z of [-0.4, 0.4]) {
    const c = kit.box(0.008, 0.32, 0.008, chainMat);
    c.position.set(0, -0.16, z);
    g.add(c);
  }
  g.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
  return g;
}

function buildCouch(kit: Kit): THREE.Group {
  const P = palette;
  const g = new THREE.Group();
  const fab = kit.mat(P.fabric, { roughness: 1 });
  const fabDark = kit.mat(shade(P.fabric, 0.8), { roughness: 1 });
  const W = 2.0;
  const base = kit.box(W, 0.26, 0.85, fabDark, 0.04);
  base.position.set(0, 0.18, 0);
  g.add(base);
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * (W - 0.32) / 3;
    const seat = kit.box(W / 3 - 0.12, 0.14, 0.62, fab, 0.05);
    seat.position.set(x, 0.37, 0.07);
    seat.rotation.z = (i - 1) * 0.03; // saggy, uneven cushions
    const backC = kit.box(W / 3 - 0.14, 0.42, 0.18, fab, 0.06);
    backC.position.set(x, 0.62, -0.28);
    backC.rotation.x = -0.18;
    g.add(seat, backC);
  }
  const backRest = kit.box(W, 0.5, 0.16, fabDark, 0.05);
  backRest.position.set(0, 0.55, -0.36);
  g.add(backRest);
  for (const sx of [-1, 1]) {
    const arm = kit.box(0.16, 0.34, 0.85, fabDark, 0.06);
    arm.position.set(sx * (W / 2 - 0.08), 0.44, 0);
    g.add(arm);
  }
  const pillow = kit.box(0.34, 0.3, 0.12, kit.mat(P.amber, { roughness: 1 }), 0.05);
  pillow.position.set(-0.68, 0.58, -0.12);
  pillow.rotation.set(-0.25, 0.3, 0.2);
  const pizza = kit.box(0.38, 0.04, 0.38, kit.mat(P.white, { roughness: 1 }));
  pizza.position.set(0.55, 0.46, 0.1);
  pizza.rotation.y = 0.4;
  g.add(pillow, pizza);
  return g;
}

// --- Posters --------------------------------------------------------------------------------------

type PosterDraw = (c: CanvasRenderingContext2D, w: number, h: number) => void;

function buildPosters(kit: Kit): THREE.Group {
  const P = palette;
  const g = new THREE.Group();
  const font = (px: number) => `900 ${px}px Impact, "Arial Black", sans-serif`;
  const designs: Record<string, PosterDraw> = {
    rack(c, w, h) {
      c.fillStyle = P.white;
      c.fillRect(0, 0, w, h);
      c.fillStyle = P.red;
      const R = 22;
      for (let row = 0; row < 4; row++) {
        for (let i = 0; i <= row; i++) {
          c.beginPath();
          c.arc(w / 2 + (i - row / 2) * R * 2.1, 90 + row * R * 1.85, R, 0, Math.PI * 2);
          c.fill();
        }
      }
      c.fillStyle = P.ink;
      c.font = font(54);
      c.textAlign = 'center';
      c.fillText("RACK 'EM", w / 2, h - 70);
      c.font = font(22);
      c.fillText('HOUSE RULES APPLY', w / 2, h - 36);
    },
    sunset(c, w, h) {
      c.fillStyle = P.fabric;
      c.fillRect(0, 0, w, h);
      c.fillStyle = P.amber;
      c.beginPath();
      c.arc(w / 2, h * 0.5, w * 0.34, Math.PI, 0);
      c.fill();
      c.fillStyle = P.red;
      for (let i = 0; i < 4; i++) c.fillRect(w * 0.16, h * 0.5 + 12 + i * 22, w * 0.68, 10 - i * 2);
      c.fillStyle = P.white;
      c.font = font(46);
      c.textAlign = 'center';
      c.fillText('SPRING', w / 2, h * 0.2);
      c.fillText('BREAK', w / 2, h * 0.86);
    },
    band(c, w, h) {
      c.fillStyle = P.ink;
      c.fillRect(0, 0, w, h);
      c.strokeStyle = P.amber;
      c.lineWidth = 10;
      for (let i = 0; i < 5; i++) {
        c.beginPath();
        c.arc(w / 2, h * 0.42, 30 + i * 22, 0, Math.PI * 2);
        c.stroke();
      }
      c.fillStyle = P.red;
      c.font = font(50);
      c.textAlign = 'center';
      c.fillText('THE KEGS', w / 2, h * 0.82);
      c.fillStyle = P.white;
      c.font = font(22);
      c.fillText('LIVE  •  SAT  •  BYOB', w / 2, h * 0.92);
    },
    pong(c, w, h) {
      c.fillStyle = P.red;
      c.fillRect(0, 0, w, h);
      c.fillStyle = P.white;
      c.beginPath();
      c.arc(w * 0.5, h * 0.36, w * 0.22, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = P.white;
      c.setLineDash([10, 14]);
      c.lineWidth = 5;
      c.beginPath();
      c.moveTo(w * 0.1, h * 0.7);
      c.quadraticCurveTo(w * 0.3, h * 0.1, w * 0.36, h * 0.3);
      c.stroke();
      c.setLineDash([]);
      c.font = font(72);
      c.textAlign = 'center';
      c.fillText('PONG', w / 2, h * 0.86);
    },
    pennant(c, w, h) {
      c.clearRect(0, 0, w, h);
      c.fillStyle = P.red;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(w, h / 2);
      c.lineTo(0, h);
      c.fill();
      c.fillStyle = P.white;
      c.fillRect(0, 0, 24, h);
      c.font = font(70);
      c.textBaseline = 'middle';
      c.fillText('GO STATE', 44, h / 2 + 4);
    },
  };
  const place = (name: string, pw: number, ph: number, x: number, y: number, z: number, ry: number, tilt = 0) => {
    const wide = name === 'pennant';
    const map = canvasTexture(kit, wide ? 512 : 256, wide ? 160 : 360, designs[name]!);
    const m = kit.mat(TEXTURED, { map, roughness: 0.6, transparent: wide, alphaTest: wide ? 0.5 : 0 });
    const mesh = kit.mesh(kit.geo(new THREE.PlaneGeometry(pw, ph)), m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(0, ry, tilt);
    g.add(mesh);
  };
  const bz = -ROOM_Z + 0.012;
  place('rack', 0.5, 0.7, -0.95, 0.72, bz, 0, 0.03);
  place('band', 0.55, 0.77, 0.15, 0.8, bz, 0, -0.015);
  place('sunset', 0.48, 0.67, 1.2, 0.7, bz, 0, 0.05);
  const fz = ROOM_Z - 0.012;
  place('pong', 0.5, 0.7, -0.7, 0.72, fz, Math.PI, -0.04);
  place('rack', 0.42, 0.59, 0.5, 0.76, fz, Math.PI, 0.02);
  place('pennant', 1.1, 0.34, -ROOM_X + 0.012, 0.85, -1.4, Math.PI / 2, -0.06);
  place('band', 0.5, 0.7, -ROOM_X + 0.012, 0.6, 1.6, Math.PI / 2, 0.03);
  place('pong', 0.5, 0.7, ROOM_X - 0.012, 0.7, -1.8, -Math.PI / 2, -0.03);
  return g;
}

// --- Props ----------------------------------------------------------------------------------------

function buildProps(kit: Kit): THREE.Group {
  const P = palette;
  const g = new THREE.Group();
  const metal = kit.mat(P.concrete, { metalness: 0.75, roughness: 0.35 });
  const inkMat = kit.mat(P.ink, { roughness: 0.6 });
  const woodMat = kit.mat(P.wood, { roughness: 0.9 });
  const redMat = kit.mat(P.red, { roughness: 0.4 });
  const whiteMat = kit.mat(P.white, { roughness: 0.6 });

  // Mini fridge with stickers, and a keg in an ice bucket next to it (front wall).
  const fridge = new THREE.Group();
  const fb = kit.box(0.55, 0.85, 0.55, whiteMat, 0.03);
  fb.position.y = 0.425;
  const handle = kit.box(0.02, 0.6, 0.01, inkMat);
  handle.position.set(0.2, 0.52, 0.28);
  fridge.add(fb, handle);
  for (const [x, y, c] of [[-0.1, 0.6, P.red], [0.05, 0.35, P.fabric], [-0.12, 0.25, P.amber]] as const) {
    const s = kit.box(0.12, 0.09, 0.005, kit.mat(c, { roughness: 0.5 }));
    s.position.set(x, y, 0.278);
    s.rotation.z = x * 2;
    fridge.add(s);
  }
  fridge.position.set(-2.5, FLOOR, ROOM_Z - 0.4);
  fridge.rotation.y = Math.PI;
  g.add(fridge);

  const kx = -1.75;
  const kz = ROOM_Z - 0.45;
  const bucket = kit.mesh(kit.geo(new THREE.CylinderGeometry(0.3, 0.26, 0.5, 10, 1, true)), kit.mat(P.fabric, { roughness: 0.5, side: THREE.DoubleSide }));
  bucket.position.set(kx, FLOOR + 0.25, kz);
  const ice = kit.mesh(kit.geo(new THREE.CylinderGeometry(0.28, 0.28, 0.02, 10)), whiteMat);
  ice.position.set(kx, FLOOR + 0.42, kz);
  const keg = kit.mesh(kit.geo(new THREE.CylinderGeometry(0.2, 0.2, 0.58, 12)), metal);
  keg.position.set(kx, FLOOR + 0.45, kz);
  const ring = kit.mesh(kit.geo(new THREE.TorusGeometry(0.2, 0.015, 4, 12)), metal);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(kx, FLOOR + 0.62, kz);
  const tap = kit.box(0.05, 0.08, 0.05, inkMat);
  tap.position.set(kx, FLOOR + 0.78, kz);
  g.add(bucket, ice, keg, ring, tap);

  // Stairs up, along the right wall at the front, climbing toward the front wall.
  const stairs = new THREE.Group();
  const steps = 8;
  const H = CEIL - FLOOR;
  const rise = H / (steps + 1);
  const run = 0.26;
  const riserMat = kit.mat(shade(P.wood, 0.75), { roughness: 0.9 });
  for (let i = 0; i < steps; i++) {
    const s = kit.box(0.9, 0.04, 0.28, woodMat);
    s.position.set(0, (i + 1) * rise, i * run);
    const riser = kit.box(0.9, rise, 0.02, riserMat);
    riser.position.set(0, (i + 0.5) * rise, i * run - 0.13);
    stairs.add(s, riser);
  }
  const slope = Math.atan2(rise, run);
  for (const sx of [-1, 1]) {
    const stringer = kit.box(0.05, 0.25, steps * run / Math.cos(slope) + 0.2, woodMat);
    stringer.position.set(sx * 0.47, (steps * rise) / 2 + 0.02, (steps - 1) * run / 2);
    stringer.rotation.x = -slope;
    stairs.add(stringer);
  }
  const rail = kit.box(0.04, 0.04, steps * run / Math.cos(slope), inkMat);
  rail.position.set(-0.47, (steps * rise) / 2 + 0.8, (steps - 1) * run / 2);
  rail.rotation.x = -slope;
  stairs.add(rail);
  stairs.position.set(ROOM_X - 0.48, FLOOR, ROOM_Z - steps * run - 0.05);
  g.add(stairs);

  // Beer crates stacked against the left wall.
  const crate = (x: number, y: number, z: number, ry: number) => {
    const c = kit.box(0.42, 0.28, 0.32, woodMat, 0.01);
    c.position.set(x, y + 0.14, z);
    c.rotation.y = ry;
    const band = kit.box(0.43, 0.06, 0.33, redMat);
    band.position.set(x, y + 0.2, z);
    band.rotation.y = ry;
    g.add(c, band);
  };
  crate(-ROOM_X + 0.3, FLOOR, 2.3, 0.05);
  crate(-ROOM_X + 0.3, FLOOR + 0.28, 2.32, -0.1);
  crate(-ROOM_X + 0.3, FLOOR, 2.75, 0.12);
  crate(-ROOM_X + 0.32, FLOOR + 0.56, 2.3, 0.2);

  // Speaker cabinet against the left wall.
  const spk = new THREE.Group();
  const cab = kit.box(0.42, 0.7, 0.36, inkMat, 0.02);
  cab.position.y = 0.35;
  spk.add(cab);
  for (const [y, rad] of [[0.22, 0.14], [0.52, 0.07]] as const) {
    const cone = kit.mesh(kit.geo(new THREE.CylinderGeometry(rad, rad * 0.7, 0.02, 12)), metal);
    cone.rotation.x = Math.PI / 2;
    cone.position.set(0, y, 0.18);
    spk.add(cone);
  }
  spk.position.set(-ROOM_X + 0.3, FLOOR, -0.6);
  spk.rotation.y = Math.PI / 2;
  g.add(spk);

  // Trash can overflowing with cups, and a few cups knocked over on the floor.
  const can = kit.mesh(kit.geo(new THREE.CylinderGeometry(0.22, 0.19, 0.6, 10)), metal);
  can.position.set(1.65, FLOOR + 0.3, -ROOM_Z + 0.4);
  g.add(can);
  const cupGeo = kit.geo(new THREE.CylinderGeometry(0.0475, 0.03, 0.12, 10, 1, true));
  const cupMat = kit.mat(P.red, { roughness: 0.4, side: THREE.DoubleSide });
  const r = rng(5);
  for (let i = 0; i < 5; i++) {
    const cup = kit.mesh(cupGeo, cupMat);
    cup.position.set(1.65 + (r() - 0.5) * 0.2, FLOOR + 0.62 + r() * 0.05, -ROOM_Z + 0.4 + (r() - 0.5) * 0.2);
    cup.rotation.set(r() * 1.2, r() * 3, r() * 1.2);
    g.add(cup);
  }
  for (const [x, z] of [[-1.1, -2.1], [0.95, 2.2], [-1.4, 1.6], [1.2, -1.2], [1.35, -2.4]] as const) {
    const cup = kit.mesh(cupGeo, cupMat);
    cup.position.set(x, FLOOR + 0.047, z);
    cup.rotation.set(Math.PI / 2, 0, 0);
    cup.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), r() * 6);
    g.add(cup);
  }

  // A dartboard on the right wall.
  const dartAt = (rad: number, depth: number, m: THREE.Material) => {
    const d = kit.mesh(kit.geo(new THREE.CylinderGeometry(rad, rad, depth, 16)), m);
    d.rotation.z = Math.PI / 2;
    d.position.set(ROOM_X - 0.03, 0.7, 0.3);
    g.add(d);
  };
  dartAt(0.22, 0.04, inkMat);
  dartAt(0.15, 0.045, redMat);
  dartAt(0.06, 0.05, whiteMat);
  return g;
}
