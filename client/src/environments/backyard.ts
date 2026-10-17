// Backyard at sunset: a white folding table on a faceted lawn, a wooden privacy fence, low-poly
// trees, a cooler and lawn chairs, fairy lights strung on poles over the table, and a golden-hour
// sky dome with a low orange sun (the one shadow caster) and a blue hemisphere fill.
import * as THREE from 'three';
import { TABLE } from '@bp/shared';
import type { EnvironmentFactory } from './types';
import { createKit, fitDirectionalShadow, rng, shade, stringLights, tableShadowBox, type Kit } from './kit';

/** Every material in this file uses only these colors. */
const palette = {
  grass: '#6f8c3b',
  foliage: '#3e6b3c',
  sky: '#5a6aa3',
  horizon: '#ffae5e',
  wood: '#9a5a36',
  red: '#c8102e',
  white: '#f3ece0',
  amber: '#eba23a',
} as const;

const GROUND = -TABLE.height;
const FENCE_X = 5;
const FENCE_Z0 = -6;
const FENCE_Z1 = 5.5;
/** Direction toward the sun disk in the sky: just above the fence, behind seat 1, to seat 0's right. */
const SUN_DIR = new THREE.Vector3(0.75, 0.08, -1).normalize();
/**
 * Direction the sunlight actually comes from: same azimuth but higher, so the lawn and table still
 * catch warm light (a sun this low would barely light horizontal surfaces).
 */
const LIGHT_DIR = new THREE.Vector3(0.75, 0.42, -1).normalize();

export const createBackyard: EnvironmentFactory = ({ scene }) => {
  const kit = createKit();
  const P = palette;
  const root = new THREE.Group();
  root.name = 'backyard';

  const fogColor = new THREE.Color(P.horizon).lerp(new THREE.Color(P.sky), 0.35);
  scene.background = fogColor.clone();
  scene.fog = new THREE.Fog(fogColor, 14, 70);
  scene.environmentIntensity = 0.35;

  // --- Table / cup / ball materials -------------------------------------------------------------
  const materials = {
    tableTop: kit.mat(shade(P.white, 0.93), { roughness: 0.55 }),
    tableSide: kit.mat(P.sky, { roughness: 0.5 }),
    tableLegs: kit.mat(P.sky, { roughness: 0.35, metalness: 0.7 }),
    cupOuter: kit.mat(P.red, { roughness: 0.35 }),
    cupInner: kit.mat(P.white, { roughness: 0.5, side: THREE.DoubleSide }),
    cupRim: kit.mat(P.white, { roughness: 0.4 }),
    beer: kit.mat(P.amber, { roughness: 0.15, emissive: P.amber, emissiveIntensity: 0.06 }),
    ball: kit.mat(P.white, { roughness: 0.22, flatShading: false }),
  };

  // --- Lights -------------------------------------------------------------------------------------
  const hemi = new THREE.HemisphereLight(P.sky, P.grass, 0.5);
  root.add(hemi);
  const sun = new THREE.DirectionalLight(new THREE.Color(P.horizon).lerp(new THREE.Color(P.white), 0.08), 5);
  sun.position.copy(LIGHT_DIR).multiplyScalar(8);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  root.add(sun, sun.target);
  fitDirectionalShadow(sun, tableShadowBox(), 5);

  // --- World --------------------------------------------------------------------------------------
  const { sky, clouds } = buildSky(kit);
  root.add(sky, clouds);
  root.add(buildGround(kit));
  root.add(buildFence(kit));
  root.add(buildTrees(kit));
  root.add(buildProps(kit));

  // Fairy lights on four poles around the table, crossing over it.
  const poleTop = 1.5;
  const poles: [number, number][] = [[-2.2, -2.9], [2.2, -2.9], [-2.2, 2.9], [2.2, 2.9]];
  const poleMat = kit.mat(P.wood, { roughness: 0.9 });
  for (const [x, z] of poles) {
    const p = kit.box(0.06, poleTop - GROUND + 0.05, 0.06, poleMat);
    p.position.set(x, (poleTop + GROUND) / 2, z);
    p.castShadow = false;
    root.add(p);
  }
  const v = (i: number) => new THREE.Vector3(poles[i]![0], poleTop, poles[i]![1]);
  const fy = 0.55;
  const lights = stringLights(kit, [
    { a: v(0), b: v(2), sag: 0.28, bulbs: 18 },
    { a: v(1), b: v(3), sag: 0.28, bulbs: 18 },
    { a: v(0), b: v(3), sag: 0.32, bulbs: 20 },
    { a: v(1), b: v(2), sag: 0.32, bulbs: 20 },
    { a: v(0), b: v(1), sag: 0.18, bulbs: 10 },
    { a: v(2), b: v(3), sag: 0.18, bulbs: 10 },
    // along the top of the back fence
    { a: new THREE.Vector3(-4.8, fy + 0.2, FENCE_Z0 + 0.1), b: new THREE.Vector3(-1.6, fy + 0.2, FENCE_Z0 + 0.1), sag: 0.2, bulbs: 12 },
    { a: new THREE.Vector3(-1.6, fy + 0.2, FENCE_Z0 + 0.1), b: new THREE.Vector3(1.6, fy + 0.2, FENCE_Z0 + 0.1), sag: 0.2, bulbs: 12 },
    { a: new THREE.Vector3(1.6, fy + 0.2, FENCE_Z0 + 0.1), b: new THREE.Vector3(4.8, fy + 0.2, FENCE_Z0 + 0.1), sag: 0.2, bulbs: 12 },
  ], { wire: shade(P.foliage, 0.5), bulb: P.amber, emissive: 6, bulbRadius: 0.016, wireRadius: 0.0025 });
  root.add(lights.group);

  const r = rng(17);
  const phase = Array.from({ length: lights.count }, () => r() * Math.PI * 2);
  const speed = Array.from({ length: lights.count }, () => 0.6 + r() * 1.6);

  return {
    palette: { ...palette },
    materials,
    root,
    post: { exposure: 1.0, bloomIntensity: 0.9, bloomThreshold: 0.95, bloomSmoothing: 0.25, vignette: 0.4 },
    update(_dt, t) {
      for (let i = 0; i < lights.count; i++) {
        lights.setBrightness(i, 0.7 + 0.3 * Math.sin(t * speed[i]! + phase[i]!));
      }
      lights.commit();
      clouds.rotation.y = t * 0.002; // clouds drift
    },
    dispose() {
      kit.dispose();
      sun.shadow.dispose();
      scene.fog = null;
      scene.background = null;
    },
  };
};

// --- Sky ----------------------------------------------------------------------------------------

function buildSky(kit: Kit): { sky: THREE.Mesh; clouds: THREE.Group } {
  const P = palette;
  const g = new THREE.Group();
  const mat = kit.track(new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(P.sky) },
      horizon: { value: new THREE.Color(P.horizon) },
      blush: { value: new THREE.Color(P.red) },
      sunColor: { value: new THREE.Color(P.white) },
      ground: { value: new THREE.Color(P.foliage) },
      sunDir: { value: SUN_DIR.clone() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top, horizon, blush, sunColor, ground, sunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        float s = max(dot(d, normalize(sunDir)), 0.0);
        // Warm near the horizon (warmer toward the sun), dusk blue overhead, a pink band between.
        float warmth = 0.55 + 0.45 * pow(s, 3.0);
        vec3 col = mix(horizon, top, pow(smoothstep(-0.02, 0.55 + 0.25 * s, h), 0.7));
        col = mix(col, blush, 0.22 * exp(-pow((h - 0.14) / 0.09, 2.0)) * (1.0 - 0.5 * s));
        col = mix(col * 0.75, col, warmth);
        col += horizon * 0.9 * pow(s, 24.0);
        // Sun disk + glow (HDR so bloom picks it up).
        col += horizon * 0.8 * pow(s, 400.0);
        col = mix(col, horizon * 4.0 + sunColor * 0.5, smoothstep(0.99955, 0.99972, s));
        // Below the horizon fade toward the treeline green so the ground edge never shows sky.
        col = mix(col, ground * 0.5 + horizon * 0.25, smoothstep(0.0, -0.08, h));
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  const dome = new THREE.Mesh(kit.geo(new THREE.SphereGeometry(90, 32, 16)), mat);
  dome.renderOrder = -1;
  dome.frustumCulled = false;

  // A few flat low-poly clouds lit by the sunset.
  const cloudMat = kit.mat(P.white, { emissive: P.horizon, emissiveIntensity: 0.55, fog: false, roughness: 1 });
  const cloudGeo = kit.geo(new THREE.IcosahedronGeometry(1, 0));
  const r = rng(29);
  for (let i = 0; i < 9; i++) {
    const az = -0.4 - 1.6 * r() + (i % 3 === 0 ? Math.PI : 0);
    const el = 0.12 + r() * 0.2;
    const dist = 70;
    const c = new THREE.Group();
    c.position.set(Math.sin(az) * dist * Math.cos(el), Math.sin(el) * dist, -Math.cos(az) * dist * Math.cos(el));
    for (let k = 0; k < 4; k++) {
      const puff = new THREE.Mesh(cloudGeo, cloudMat);
      puff.scale.set(3 + r() * 3, 1 + r() * 0.8, 2 + r() * 2);
      puff.position.set((k - 1.5) * 3.2 + r(), r() * 0.8, r() * 2);
      puff.rotation.y = r() * 3;
      c.add(puff);
    }
    c.lookAt(0, c.position.y, 0);
    g.add(c);
  }
  return { sky: dome, clouds: g };
}

// --- Ground ---------------------------------------------------------------------------------------

function buildGround(kit: Kit): THREE.Group {
  const P = palette;
  const g = new THREE.Group();
  const size = 120;
  const seg = 60;
  const geo = kit.geo(new THREE.PlaneGeometry(size, size, seg, seg));
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const r = rng(41);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const d = Math.hypot(x / 1.6, z / 2.8);
    const amp = Math.min(1, Math.max(0, d - 1)) * 0.08 + Math.max(0, Math.hypot(x, z) - 9) * 0.04;
    pos.setY(i, (r() - 0.5) * amp);
  }
  // Flat-shaded facets, each a slightly different shade of the grass color (mowing stripes too).
  const faceted = kit.geo(geo.toNonIndexed());
  const fp = faceted.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(fp.count * 3);
  const base = new THREE.Color(P.grass);
  const c = new THREE.Color();
  for (let i = 0; i < fp.count; i += 3) {
    const cx = (fp.getX(i) + fp.getX(i + 1) + fp.getX(i + 2)) / 3;
    const stripe = Math.floor((cx + 100) / 1.2) % 2 === 0 ? 1.04 : 0.96;
    c.copy(base).multiplyScalar(stripe * (0.93 + r() * 0.12));
    for (let k = 0; k < 3; k++) c.toArray(colors, (i + k) * 3);
  }
  faceted.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  faceted.computeVertexNormals();
  const ground = kit.mesh(faceted, kit.mat('#ffffff', { roughness: 0.95, vertexColors: true }));
  ground.position.y = GROUND;
  g.add(ground);

  // Instanced grass tufts scattered around (kept off the area under/around the table).
  const tuftGeo = kit.geo(new THREE.ConeGeometry(0.035, 0.14, 3));
  tuftGeo.translate(0, 0.07, 0);
  const tufts = kit.track(new THREE.InstancedMesh(tuftGeo, kit.mat(shade(P.grass, 0.92), { roughness: 1 }), 420));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const sc = new THREE.Vector3();
  const p = new THREE.Vector3();
  let n = 0;
  while (n < tufts.count) {
    const x = (r() - 0.5) * FENCE_X * 2;
    const z = FENCE_Z0 + r() * (FENCE_Z1 - FENCE_Z0);
    if (Math.abs(x) < 0.6 && Math.abs(z) < 1.5) continue;
    e.set((r() - 0.5) * 0.4, r() * 6, (r() - 0.5) * 0.4);
    q.setFromEuler(e);
    const s = 0.35 + r() * 0.5;
    sc.set(s, s * (0.7 + r() * 0.8), s);
    p.set(x, GROUND, z);
    m.compose(p, q, sc);
    tufts.setMatrixAt(n++, m);
  }
  tufts.receiveShadow = true;
  g.add(tufts);

  return g;
}

// --- Fence ----------------------------------------------------------------------------------------

function buildFence(kit: Kit): THREE.Group {
  const P = palette;
  const g = new THREE.Group();
  const H = 1.55;
  const plankW = 0.14;
  const step = 0.155;
  const runs: { a: THREE.Vector2; b: THREE.Vector2 }[] = [
    { a: new THREE.Vector2(-FENCE_X, FENCE_Z0), b: new THREE.Vector2(FENCE_X, FENCE_Z0) },
    { a: new THREE.Vector2(-FENCE_X, FENCE_Z0), b: new THREE.Vector2(-FENCE_X, FENCE_Z1) },
    { a: new THREE.Vector2(FENCE_X, FENCE_Z0), b: new THREE.Vector2(FENCE_X, FENCE_Z1) },
    { a: new THREE.Vector2(-FENCE_X, FENCE_Z1), b: new THREE.Vector2(FENCE_X, FENCE_Z1) },
  ];
  const total = runs.reduce((s, run) => s + Math.ceil(run.a.distanceTo(run.b) / step), 0);
  const plankGeo = kit.geo(new THREE.BoxGeometry(plankW, H, 0.025));
  // Dog-eared top: shave the two top corners by moving the top vertices in.
  const pp = plankGeo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pp.count; i++) if (pp.getY(i) > 0) pp.setX(i, pp.getX(i) * 0.6);
  plankGeo.computeVertexNormals();
  const planks = kit.track(new THREE.InstancedMesh(plankGeo, kit.mat(P.wood, { roughness: 0.9 }), total));
  const r = rng(53);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  let n = 0;
  const railMat = kit.mat(shade(P.wood, 0.8), { roughness: 0.9 });
  for (const run of runs) {
    const len = run.a.distanceTo(run.b);
    const count = Math.ceil(len / step);
    const dir = run.b.clone().sub(run.a).normalize();
    const ang = Math.atan2(-dir.y, dir.x);
    q.setFromAxisAngle(up, ang);
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) * step;
      const h = H * (0.97 + r() * 0.05);
      m.compose(new THREE.Vector3(run.a.x + dir.x * t, GROUND + h / 2, run.a.y + dir.y * t), q, new THREE.Vector3(1, h / H, 1));
      planks.setMatrixAt(n, m);
      planks.setColorAt(n, col.setScalar(0.85 + r() * 0.25));
      n++;
    }
    // Rails on the inside face.
    for (const y of [0.3, 1.2]) {
      const rail = kit.box(len, 0.08, 0.04, railMat);
      rail.position.set((run.a.x + run.b.x) / 2, GROUND + y, (run.a.y + run.b.y) / 2);
      rail.rotation.y = ang;
      // push rails toward the yard center
      const inward = new THREE.Vector2(-rail.position.x, -rail.position.z).normalize().multiplyScalar(0.03);
      rail.position.x += inward.x;
      rail.position.z += inward.y;
      g.add(rail);
    }
  }
  planks.receiveShadow = true;
  g.add(planks);

  // Shrubs along the base of the fence soften the fence/lawn seam.
  const bushGeo = kit.geo(new THREE.IcosahedronGeometry(0.5, 0));
  const bushes = kit.track(new THREE.InstancedMesh(bushGeo, kit.mat(P.foliage, { roughness: 1 }), 60));
  let b = 0;
  const e = new THREE.Euler();
  while (b < bushes.count) {
    const run = runs[b % 3]!; // back + both sides; the front fence is behind the player
    const t = r();
    const x = run.a.x + (run.b.x - run.a.x) * t;
    const z = run.a.y + (run.b.y - run.a.y) * t;
    const inward = new THREE.Vector2(-x, -z).normalize().multiplyScalar(0.35);
    const s = 0.6 + r() * 0.8;
    e.set(r() * 3, r() * 3, r() * 3);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(x + inward.x, GROUND + s * 0.25, z + inward.y), q, new THREE.Vector3(s * 1.2, s * 0.9, s));
    bushes.setMatrixAt(b, m);
    bushes.setColorAt(b, col.setScalar(0.8 + r() * 0.4));
    b++;
  }
  g.add(bushes);
  return g;
}

// --- Trees ----------------------------------------------------------------------------------------

function tree(kit: Kit, r: () => number, scale: number): THREE.Group {
  const P = palette;
  const g = new THREE.Group();
  const trunk = kit.mesh(kit.geo(new THREE.CylinderGeometry(0.08, 0.14, 1.6, 6)), kit.mat(shade(P.wood, 0.7), { roughness: 1 }));
  trunk.position.y = 0.8;
  g.add(trunk);
  const leafMats = [kit.mat(P.foliage, { roughness: 1 }), kit.mat(shade(P.foliage, 1.2), { roughness: 1 })];
  const geo = kit.geo(new THREE.IcosahedronGeometry(1, 0));
  for (let i = 0; i < 4; i++) {
    const blob = kit.mesh(geo, leafMats[i % 2]!);
    const s = 0.7 + r() * 0.5;
    blob.scale.set(s, s * 0.9, s);
    blob.position.set((r() - 0.5) * 0.9, 1.9 + r() * 0.9, (r() - 0.5) * 0.9);
    blob.rotation.set(r() * 3, r() * 3, r() * 3);
    g.add(blob);
  }
  g.scale.setScalar(scale);
  return g;
}

function buildTrees(kit: Kit): THREE.Group {
  const P = palette;
  const g = new THREE.Group();
  const r = rng(67);
  // Yard trees inside the fence.
  for (const [x, z, s] of [[-4.0, -4.7, 0.95], [4.0, 4.3, 1.0], [-4.2, 3.0, 0.8]] as const) {
    const t = tree(kit, r, s);
    t.position.set(x, GROUND, z);
    g.add(t);
  }
  // Treeline beyond the fence: tall pine cones and round blobs, fogged into the sunset.
  const pineGeo = kit.geo(new THREE.ConeGeometry(1, 3, 6));
  const pineMat = kit.mat(shade(P.foliage, 0.8), { roughness: 1 });
  const blobGeo = kit.geo(new THREE.IcosahedronGeometry(1, 0));
  const sunAz = Math.atan2(SUN_DIR.x, -SUN_DIR.z);
  for (let i = 0; i < 80; i++) {
    const a = r() * Math.PI * 2;
    const da = Math.atan2(Math.sin(a - sunAz), Math.cos(a - sunAz));
    if (Math.abs(da) < 0.3) continue; // keep the sun visible through a gap in the trees
    const d = 14 + r() * 18;
    const x = Math.sin(a) * d * 1.1;
    const z = -Math.cos(a) * d;
    const pine = r() < 0.5;
    const s = 0.9 + r() * 1.0 + (Math.abs(da) < 0.6 ? -0.4 : 0);
    const mesh = kit.mesh(pine ? pineGeo : blobGeo, pineMat);
    mesh.scale.set(s, pine ? s * 1.3 : s * 1.1, s);
    mesh.position.set(x, GROUND + (pine ? 1.5 * s * 1.3 : s * 1.4), z);
    mesh.rotation.y = r() * 3;
    g.add(mesh);
  }
  return g;
}

// --- Props ----------------------------------------------------------------------------------------

function buildProps(kit: Kit): THREE.Group {
  const P = palette;
  const g = new THREE.Group();
  const whiteMat = kit.mat(P.white, { roughness: 0.5 });
  const blueMat = kit.mat(P.sky, { roughness: 0.45 });
  const redMat = kit.mat(P.red, { roughness: 0.4 });
  const woodMat = kit.mat(P.wood, { roughness: 0.85 });

  // Cooler by the player's left, lid ajar with a couple of cans on top.
  const cooler = new THREE.Group();
  const body = kit.box(0.6, 0.36, 0.38, blueMat, 0.04);
  body.position.y = 0.18;
  const lid = kit.box(0.62, 0.07, 0.4, whiteMat, 0.03);
  lid.position.y = 0.39;
  const handle = kit.box(0.05, 0.03, 0.2, whiteMat);
  for (const sx of [-1, 1]) {
    const h = handle.clone();
    h.position.set(sx * 0.32, 0.3, 0);
    cooler.add(h);
  }
  cooler.add(body, lid);
  const canGeo = kit.geo(new THREE.CylinderGeometry(0.033, 0.033, 0.12, 10));
  for (const [x, z, c] of [[-0.12, 0.05, redMat], [0.1, -0.06, whiteMat]] as const) {
    const can = kit.mesh(canGeo, c);
    can.position.set(x, 0.485, z);
    cooler.add(can);
  }
  cooler.position.set(-0.85, GROUND, 0.95);
  cooler.rotation.y = 0.3;
  cooler.traverse((o) => { o.castShadow = true; });
  g.add(cooler);

  // Adirondack-ish lawn chairs facing the table.
  const chair = () => {
    const c = new THREE.Group();
    const seat = kit.box(0.6, 0.05, 0.55, whiteMat);
    seat.position.set(0, 0.36, 0);
    seat.rotation.x = -0.12;
    const back = kit.box(0.6, 0.7, 0.05, whiteMat);
    back.position.set(0, 0.7, -0.33);
    back.rotation.x = -0.35;
    c.add(seat, back);
    for (const sx of [-1, 1]) {
      const arm = kit.box(0.1, 0.03, 0.7, whiteMat);
      arm.position.set(sx * 0.35, 0.6, 0.02);
      const legF = kit.box(0.05, 0.6, 0.05, whiteMat);
      legF.position.set(sx * 0.33, 0.3, 0.3);
      const legB = kit.box(0.05, 0.4, 0.05, whiteMat);
      legB.position.set(sx * 0.33, 0.2, -0.25);
      c.add(arm, legF, legB);
    }
    return c;
  };
  const c1 = chair();
  c1.position.set(2.4, GROUND, -3.0);
  c1.rotation.y = -0.9;
  const c2 = chair();
  c2.position.set(-2.6, GROUND, -0.6);
  c2.rotation.y = 1.3;
  const c3 = chair();
  c3.position.set(2.5, GROUND, 2.2);
  c3.rotation.y = -2.2;
  g.add(c1, c2, c3);

  // Little side table with a stack of cups and a ball jar near the player's right.
  const side = new THREE.Group();
  const top = kit.mesh(kit.geo(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 10)), woodMat);
  top.position.y = 0.5;
  const leg = kit.mesh(kit.geo(new THREE.CylinderGeometry(0.025, 0.04, 0.5, 6)), woodMat);
  leg.position.y = 0.25;
  side.add(top, leg);
  const cupGeo = kit.geo(new THREE.CylinderGeometry(0.0475, 0.03, 0.12, 12, 1, true));
  const cupMat = kit.mat(P.red, { roughness: 0.35, side: THREE.DoubleSide });
  for (let i = 0; i < 4; i++) {
    const cup = kit.mesh(cupGeo, cupMat);
    cup.position.set(-0.06, 0.575 + i * 0.022, 0.02);
    side.add(cup);
  }
  const ballGeo = kit.geo(new THREE.IcosahedronGeometry(0.02, 1));
  for (const [x, z] of [[0.09, -0.04], [0.12, 0.05], [0.06, 0.08]] as const) {
    const b = kit.mesh(ballGeo, whiteMat);
    b.position.set(x, 0.535, z);
    side.add(b);
  }
  side.position.set(0.9, GROUND, 1.25);
  side.traverse((o) => { o.castShadow = true; });
  g.add(side);

  // A few cups and cans dropped in the grass.
  const r = rng(71);
  for (const [x, z] of [[1.3, -0.4], [-1.2, -1.9], [-1.6, 0.4], [0.7, -2.6]] as const) {
    const cup = kit.mesh(cupGeo, cupMat);
    cup.position.set(x, GROUND + 0.047, z);
    cup.rotation.set(Math.PI / 2, 0, 0);
    cup.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), r() * 6);
    g.add(cup);
  }
  return g;
}
