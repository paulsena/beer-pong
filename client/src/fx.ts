// Juice: splash particles, ball trail, camera shake, floating text, cup wobble. (Track A)
import * as THREE from 'three';

export interface Fx {
  splash(at: THREE.Vector3): void;
  shake(intensity: number): void;
  textPop(text: string, at: THREE.Vector3, color?: string): void;
  wobble(cup: THREE.Object3D): void;
  trailStart(ball: THREE.Object3D): void;
  trailStop(): void;
  /** Call each frame after placing the camera; adds the shake offset to its position. */
  update(dt: number): void;
}

const SPLASH_COUNT = 48;
const SPLASH_LIFE = 0.9;
const TRAIL_POINTS = 28;
const GRAVITY = -6;

/** Soft round dot, shared by the particle materials. */
function dotTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface Splash {
  points: THREE.Points;
  vel: Float32Array;
  age: number;
}

interface Pop {
  sprite: THREE.Sprite;
  age: number;
}

interface Wobble {
  obj: THREE.Object3D;
  age: number;
  axis: THREE.Vector3;
}

export function createFx(scene: THREE.Scene, camera: THREE.PerspectiveCamera): Fx {
  const dot = dotTexture();
  const splashes: Splash[] = [];
  const pops: Pop[] = [];
  const wobbles: Wobble[] = [];

  // --- shake: trauma decays; offset = trauma^2 * noise ---
  let trauma = 0;
  let time = 0;
  const shake = new THREE.Vector3();

  // --- trail ---
  const trailPos = new Float32Array(TRAIL_POINTS * 3);
  const trailCol = new Float32Array(TRAIL_POINTS * 4);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 4));
  const trail = new THREE.Points(
    trailGeo,
    new THREE.PointsMaterial({ size: 0.03, map: dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  trail.frustumCulled = false;
  trail.visible = false;
  scene.add(trail);
  let trailTarget: THREE.Object3D | null = null;
  let trailCount = 0;

  function splash(at: THREE.Vector3) {
    const pos = new Float32Array(SPLASH_COUNT * 3);
    const vel = new Float32Array(SPLASH_COUNT * 3);
    for (let i = 0; i < SPLASH_COUNT; i++) {
      pos[i * 3] = at.x;
      pos[i * 3 + 1] = at.y;
      pos[i * 3 + 2] = at.z;
      const a = Math.random() * Math.PI * 2;
      const r = 0.2 + Math.random() * 0.5;
      vel[i * 3] = Math.cos(a) * r;
      vel[i * 3 + 1] = 0.8 + Math.random() * 1.0;
      vel[i * 3 + 2] = Math.sin(a) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ size: 0.022, map: dot, color: '#ffd77a', transparent: true, depthWrite: false });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);
    splashes.push({ points, vel, age: 0 });
  }

  function textPop(text: string, at: THREE.Vector3, color = '#ffffff') {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const g = c.getContext('2d')!;
    g.font = '900 84px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 14;
    g.strokeStyle = 'rgba(0,0,0,0.65)';
    g.strokeText(text, 256, 64);
    g.fillStyle = color;
    g.fillText(text, 256, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.renderOrder = 10;
    sprite.position.copy(at);
    sprite.scale.set(0.4, 0.1, 1);
    scene.add(sprite);
    pops.push({ sprite, age: 0 });
  }

  function wobble(cup: THREE.Object3D) {
    const axis = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
    const existing = wobbles.find((w) => w.obj === cup);
    if (existing) existing.age = 0;
    else wobbles.push({ obj: cup, age: 0, axis });
  }

  function update(dt: number) {
    time += dt;

    trauma = Math.max(0, trauma - dt * 1.6);
    const amp = trauma * trauma * 0.05;
    shake.set(
      amp * Math.sin(time * 47.3) * Math.cos(time * 13.1),
      amp * Math.sin(time * 39.7 + 1.3),
      amp * Math.cos(time * 43.9 + 2.1) * 0.5,
    );
    camera.position.add(shake);

    for (let i = splashes.length - 1; i >= 0; i--) {
      const s = splashes[i]!;
      s.age += dt;
      const attr = s.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const pos = attr.array as Float32Array;
      for (let j = 0; j < SPLASH_COUNT; j++) {
        s.vel[j * 3 + 1]! += GRAVITY * dt;
        pos[j * 3]! += s.vel[j * 3]! * dt;
        pos[j * 3 + 1]! += s.vel[j * 3 + 1]! * dt;
        pos[j * 3 + 2]! += s.vel[j * 3 + 2]! * dt;
      }
      attr.needsUpdate = true;
      (s.points.material as THREE.PointsMaterial).opacity = 1 - s.age / SPLASH_LIFE;
      if (s.age >= SPLASH_LIFE) {
        scene.remove(s.points);
        s.points.geometry.dispose();
        (s.points.material as THREE.Material).dispose();
        splashes.splice(i, 1);
      }
    }

    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i]!;
      p.age += dt;
      const k = Math.min(1, p.age / 0.15);
      const s = 0.4 * (k < 1 ? 0.6 + 0.6 * k : 1.2 - 0.2 * Math.min(1, (p.age - 0.15) / 0.2));
      p.sprite.scale.set(s, s / 4, 1);
      p.sprite.position.y += dt * 0.15;
      p.sprite.material.opacity = Math.min(1, 3 * (1.4 - p.age));
      if (p.age > 1.4) {
        scene.remove(p.sprite);
        p.sprite.material.map?.dispose();
        p.sprite.material.dispose();
        pops.splice(i, 1);
      }
    }

    for (let i = wobbles.length - 1; i >= 0; i--) {
      const w = wobbles[i]!;
      w.age += dt;
      const angle = 0.12 * Math.exp(-w.age * 5) * Math.sin(w.age * 28);
      w.obj.quaternion.setFromAxisAngle(w.axis, angle);
      if (w.age > 1) {
        w.obj.quaternion.identity();
        wobbles.splice(i, 1);
      }
    }

    if (trailTarget && trail.visible) {
      // Shift history back one slot and write the newest position at the head.
      trailPos.copyWithin(3, 0, (TRAIL_POINTS - 1) * 3);
      trailTarget.getWorldPosition(new THREE.Vector3()).toArray(trailPos, 0);
      trailCount = Math.min(TRAIL_POINTS, trailCount + 1);
      for (let i = 0; i < TRAIL_POINTS; i++) {
        const a = i < trailCount ? 0.55 * (1 - i / TRAIL_POINTS) : 0;
        trailCol.set([1, 0.95, 0.85, a], i * 4);
      }
      trailGeo.getAttribute('position').needsUpdate = true;
      trailGeo.getAttribute('color').needsUpdate = true;
    }
  }

  return {
    splash,
    shake(intensity) {
      trauma = Math.min(1, trauma + intensity);
    },
    textPop,
    wobble,
    trailStart(ball) {
      trailTarget = ball;
      trailCount = 0;
      trail.visible = true;
    },
    trailStop() {
      trailTarget = null;
      trail.visible = false;
    },
    update,
  };
}
