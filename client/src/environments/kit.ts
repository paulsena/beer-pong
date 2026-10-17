// Shared building blocks for environments: a disposal-tracking material/geometry kit, canvas
// textures, string lights (instanced emissive bulbs on sagging wires) and shadow fitting.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CUP, TABLE } from '@bp/shared';

export type Palette = Record<string, string>;

/** Tracks everything an environment allocates so dispose() can free it. */
export interface Kit {
  /** Flat-shaded standard material in a palette color (cached by color + params). */
  mat(color: string, extra?: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial;
  geo<T extends THREE.BufferGeometry>(g: T): T;
  tex<T extends THREE.Texture>(t: T): T;
  track<T extends { dispose(): void }>(o: T): T;
  /** Shorthand: mesh from geometry + material, with shadow flags. */
  mesh(g: THREE.BufferGeometry, m: THREE.Material, opts?: { cast?: boolean; receive?: boolean }): THREE.Mesh;
  box(w: number, h: number, d: number, m: THREE.Material, radius?: number): THREE.Mesh;
  dispose(): void;
}

export function createKit(): Kit {
  const owned = new Set<{ dispose(): void }>();
  const matCache = new Map<string, THREE.MeshStandardMaterial>();
  const boxCache = new Map<string, THREE.BufferGeometry>();
  const kit: Kit = {
    mat(color, extra = {}) {
      const key = color + JSON.stringify(extra, (_k, v) => (v instanceof THREE.Texture ? v.uuid : v));
      let m = matCache.get(key);
      if (!m) {
        m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...extra });
        matCache.set(key, m);
        owned.add(m);
      }
      return m;
    },
    geo(g) {
      owned.add(g);
      return g;
    },
    tex(t) {
      owned.add(t);
      return t;
    },
    track(o) {
      owned.add(o);
      return o;
    },
    mesh(g, m, opts = {}) {
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = opts.cast ?? false;
      mesh.receiveShadow = opts.receive ?? true;
      return mesh;
    },
    box(w, h, d, m, radius = 0) {
      const key = `${w}|${h}|${d}|${radius}`;
      let g = boxCache.get(key);
      if (!g) {
        g = radius > 0 ? new RoundedBoxGeometry(w, h, d, 2, radius) : new THREE.BoxGeometry(w, h, d);
        boxCache.set(key, g);
        owned.add(g);
      }
      return kit.mesh(g, m);
    },
    dispose() {
      for (const o of owned) o.dispose();
      owned.clear();
      matCache.clear();
      boxCache.clear();
    },
  };
  return kit;
}

/** Draw into a canvas and wrap it as an sRGB texture. */
export function canvasTexture(
  kit: Kit,
  w: number,
  h: number,
  draw: (g: CanvasRenderingContext2D, w: number, h: number) => void,
  opts: { repeat?: [number, number]; srgb?: boolean } = {},
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = kit.tex(new THREE.CanvasTexture(c));
  if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (opts.repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  return t;
}

/** Deterministic PRNG so props and textures look the same every load (and in screenshots). */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A hex color scaled in brightness (for subtle per-brick / per-plank variation of one palette color). */
export function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex);
  c.r = Math.min(1, c.r * k);
  c.g = Math.min(1, c.g * k);
  c.b = Math.min(1, c.b * k);
  return '#' + c.getHexString();
}

/** Brick (or block) wall texture in two palette colors. */
export function brickTexture(kit: Kit, brick: string, mortar: string, seed: number, repeat: [number, number], rows = 16, cols = 8): THREE.CanvasTexture {
  const r = rng(seed);
  return canvasTexture(kit, 512, 512, (g, w, h) => {
    g.fillStyle = mortar;
    g.fillRect(0, 0, w, h);
    const bh = h / rows;
    const bw = w / cols;
    for (let y = 0; y < rows; y++) {
      const off = (y % 2) * bw * 0.5;
      for (let x = -1; x < cols + 1; x++) {
        g.fillStyle = shade(brick, 0.82 + r() * 0.3);
        g.fillRect(x * bw + off + 3, y * bh + 3, bw - 6, bh - 6);
      }
    }
  }, { repeat });
}

// --- String lights -----------------------------------------------------------------------------

/** Points along a sagging wire between a and b. */
export function sagCurve(a: THREE.Vector3, b: THREE.Vector3, sag: number): THREE.QuadraticBezierCurve3 {
  const mid = a.clone().lerp(b, 0.5);
  mid.y -= sag * 2; // control point; the curve itself dips by `sag`
  return new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone());
}

export interface StringLights {
  group: THREE.Group;
  bulbs: THREE.InstancedMesh;
  bulbMat: THREE.MeshStandardMaterial;
  /** Base per-bulb brightness multipliers (for twinkle animation). */
  count: number;
  setBrightness(i: number, k: number): void;
  commit(): void;
}

/**
 * Wires (thin tubes) with instanced emissive bulbs. Bulb emissive is multiplied by the instance
 * color, so individual bulbs can flicker/twinkle without extra draw calls.
 */
export function stringLights(
  kit: Kit,
  spans: { a: THREE.Vector3; b: THREE.Vector3; sag: number; bulbs: number }[],
  o: { wire: string; bulb: string; emissive: number; bulbRadius: number; wireRadius?: number; hang?: number },
): StringLights {
  const group = new THREE.Group();
  const wireMat = kit.mat(o.wire, { roughness: 0.6 });
  const positions: THREE.Vector3[] = [];
  const wireGeos: THREE.BufferGeometry[] = [];
  for (const s of spans) {
    const curve = sagCurve(s.a, s.b, s.sag);
    wireGeos.push(new THREE.TubeGeometry(curve, 24, o.wireRadius ?? 0.003, 3, false));
    for (let i = 0; i < s.bulbs; i++) {
      const p = curve.getPoint((i + 0.5) / s.bulbs);
      p.y -= o.hang ?? o.bulbRadius * 1.2;
      positions.push(p);
    }
  }
  const merged = kit.geo(mergeGeometries(wireGeos));
  wireGeos.forEach((g) => g.dispose());
  group.add(kit.mesh(merged, wireMat, { receive: false }));

  const bulbGeo = kit.geo(new THREE.IcosahedronGeometry(o.bulbRadius, 0));
  bulbGeo.scale(1, 1.35, 1);
  const bulbMat = kit.track(
    new THREE.MeshStandardMaterial({ color: o.bulb, emissive: o.bulb, emissiveIntensity: o.emissive, flatShading: true, roughness: 0.4 }),
  );
  bulbMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\n totalEmissiveRadiance *= vColor;\n#endif',
    );
  };
  const bulbs = kit.track(new THREE.InstancedMesh(bulbGeo, bulbMat, positions.length));
  const m = new THREE.Matrix4();
  const white = new THREE.Color(1, 1, 1);
  positions.forEach((p, i) => {
    m.makeTranslation(p.x, p.y, p.z);
    bulbs.setMatrixAt(i, m);
    bulbs.setColorAt(i, white);
  });
  bulbs.castShadow = false;
  bulbs.receiveShadow = false;
  group.add(bulbs);
  const tmp = new THREE.Color();
  return {
    group,
    bulbs,
    bulbMat,
    count: positions.length,
    setBrightness(i, k) {
      bulbs.setColorAt(i, tmp.setRGB(k, k, k));
    },
    commit() {
      if (bulbs.instanceColor) bulbs.instanceColor.needsUpdate = true;
    },
  };
}

/** Minimal non-indexed merge (avoids pulling BufferGeometryUtils' full API surface). */
export function mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const names = ['position', 'normal', 'uv'].filter((n) => parts.every((p) => p.getAttribute(n)));
  const out = new THREE.BufferGeometry();
  for (const n of names) {
    const item = parts[0]!.getAttribute(n).itemSize;
    const total = parts.reduce((s, p) => s + p.getAttribute(n).count * item, 0);
    const arr = new Float32Array(total);
    let off = 0;
    for (const p of parts) {
      const a = p.getAttribute(n).array as Float32Array;
      arr.set(a, off);
      off += a.length;
    }
    out.setAttribute(n, new THREE.BufferAttribute(arr, item));
  }
  parts.forEach((p, i) => { if (p !== geos[i]) p.dispose(); });
  return out;
}

// --- Shadows -------------------------------------------------------------------------------------

/** World-space box around the table and its cups (what the key light's shadow must cover). */
export function tableShadowBox(margin = 0.12): THREE.Box3 {
  return new THREE.Box3(
    new THREE.Vector3(-TABLE.width / 2 - margin, -TABLE.height, -TABLE.length / 2 - margin),
    new THREE.Vector3(TABLE.width / 2 + margin, CUP.height + 0.05, TABLE.length / 2 + margin),
  );
}

/**
 * Fit a directional light's orthographic shadow camera tightly around `box` in light space.
 * Shadows cast by the box land along the light direction, i.e. at the same light-space x/y, so
 * only depth needs extending (`extraDepth`) to reach the ground the shadow falls on.
 */
export function fitDirectionalShadow(light: THREE.DirectionalLight, box: THREE.Box3, extraDepth = 4, mapSize = 2048): void {
  light.updateMatrixWorld();
  light.target.updateMatrixWorld();
  const view = new THREE.Matrix4().lookAt(light.position, light.target.position, new THREE.Vector3(0, 1, 0));
  const inv = view.clone().invert(); // world -> light space (camera looks down -Z)
  const lb = new THREE.Box3();
  const p = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
    p.sub(light.position).applyMatrix4(inv);
    lb.expandByPoint(p);
  }
  const cam = light.shadow.camera;
  cam.left = lb.min.x;
  cam.right = lb.max.x;
  cam.bottom = lb.min.y;
  cam.top = lb.max.y;
  cam.near = Math.max(0.05, -lb.max.z - 0.5);
  cam.far = -lb.min.z + extraDepth;
  cam.updateProjectionMatrix();
  light.shadow.mapSize.set(mapSize, mapSize);
  light.shadow.bias = -0.0004;
  light.shadow.normalBias = 0.02;
  light.shadow.radius = 3;
}
