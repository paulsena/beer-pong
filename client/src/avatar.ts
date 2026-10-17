// Low-poly opponent avatar with emote animations. (Track E)
//
// Built from flat-shaded primitives (matches the scene's look, no asset loading). Origin at the
// feet, facing +Z, about 1.75 m tall. All animation is procedural: each frame a target pose is
// computed (idle / throwing base, optionally overridden by an emote) and every joint eases toward
// it, so transitions blend smoothly.
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

// Joint channels, all radians except hipY/hipZ (meters).
interface Pose {
  hipY: number; // vertical offset of the pelvis (jumps / crouch)
  hipZ: number; // forward offset
  hipRotY: number;
  spineX: number; // + leans forward
  spineY: number;
  spineZ: number;
  headX: number; // + looks down
  headY: number;
  headZ: number;
  lShX: number; // shoulder: - raises the arm forward
  lShY: number;
  lShZ: number; // left arm: + raises sideways
  lElX: number; // elbow: - bends the forearm forward/up
  rShX: number;
  rShY: number;
  rShZ: number; // right arm: - raises sideways
  rElX: number;
  lLegX: number; // hip: - swings the leg forward
  lKneeX: number; // + bends the knee
  rLegX: number;
  rKneeX: number;
  lHandZ: number;
  rHandZ: number;
  breathe: number; // chest scale offset
}
type Channel = keyof Pose;

const ZERO: Pose = {
  hipY: 0, hipZ: 0, hipRotY: 0, spineX: 0, spineY: 0, spineZ: 0, headX: 0, headY: 0, headZ: 0,
  lShX: 0, lShY: 0, lShZ: 0.08, lElX: -0.15, rShX: 0, rShY: 0, rShZ: -0.08, rElX: -0.15,
  lLegX: 0, lKneeX: 0, rLegX: 0, rKneeX: 0, lHandZ: 0, rHandZ: 0, breathe: 0,
};
const CHANNELS = Object.keys(ZERO) as Channel[];

const EMOTE_DURATION: Record<EmoteId, number> = { cheer: 2.2, taunt: 2.0, facepalm: 2.4, nice: 1.8 };

const SKIN = '#e8b48f';
const PANTS = '#2f3b52';
const SHOES = '#f2efe9';
const HAIR = '#3b2618';

const smooth = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};
/** 0 → 1 over `a` seconds, holds, 1 → 0 over the last `r` seconds of `dur`. */
const envelope = (t: number, dur: number, a = 0.25, r = 0.35) => smooth(t / a) * smooth((dur - t) / r);

/** Emote pose channels at time t (seconds since start). Returns overrides only. */
function emotePose(emote: EmoteId, t: number): Partial<Pose> {
  const TAU = Math.PI * 2;
  switch (emote) {
    case 'cheer': {
      // Both arms up and waving, two little jumps.
      const wave = Math.sin(t * 9) * 0.25;
      const jumpPhase = t - 0.35;
      let hipY = 0;
      let knee = 0;
      if (jumpPhase > 0 && jumpPhase < 1.3) {
        const p = (jumpPhase % 0.65) / 0.65;
        hipY = p < 0.25 ? -0.08 * Math.sin((p / 0.25) * Math.PI) : 0.16 * Math.sin(((p - 0.25) / 0.75) * Math.PI);
        knee = p < 0.25 ? 0.6 * Math.sin((p / 0.25) * Math.PI) : 0.15;
      }
      return {
        lShZ: 2.7 + wave, rShZ: -2.7 + wave, lShX: -0.2, rShX: -0.2, lElX: -0.35, rElX: -0.35,
        hipY, lKneeX: knee, rKneeX: knee, lLegX: -knee * 0.5, rLegX: -knee * 0.5,
        headX: -0.25, spineX: -0.12, lHandZ: 0, rHandZ: 0,
      };
    }
    case 'taunt': {
      // Lean in, point at the opponent with the right hand, left hand on hip, cocky head bob.
      const jab = Math.max(0, Math.sin(t * TAU * 1.6)) * 0.18;
      return {
        spineX: 0.28, hipZ: -0.03, spineY: -0.2, hipRotY: -0.1,
        rShX: -1.45 - jab * 0.4, rShZ: 0.12, rElX: -0.1 + jab * 0.3,
        lShX: 0.1, lShZ: 0.75, lShY: 0.0, lElX: -1.9,
        headX: -0.15 + Math.sin(t * TAU * 1.6) * 0.08, headZ: 0.12, headY: 0.15,
        lLegX: -0.12, rKneeX: 0.15,
      };
    }
    case 'facepalm': {
      // Right hand comes up to the face, head drops, slow disappointed shake, shoulders slump.
      const shake = t > 0.6 ? Math.sin((t - 0.6) * TAU * 1.1) * 0.18 : 0;
      return {
        rShX: -1.65, rShZ: 0.55, rShY: 0.3, rElX: -2.35,
        lShZ: 0.05, lShX: 0.15, lElX: -0.1,
        headX: 0.45, headY: shake, spineX: 0.28, spineY: shake * 0.3, hipY: -0.03,
        lKneeX: 0.08, rKneeX: 0.08, breathe: -0.02,
      };
    }
    case 'nice': {
      // Double thumbs-up held in front of the chest with an enthusiastic nod.
      const nod = Math.sin(t * TAU * 2.2) * 0.18;
      const pump = Math.sin(t * TAU * 2.2) * 0.08;
      return {
        // Forearms level and pointing forward, so the thumbs (hand +Z) point straight up.
        rShX: -0.3 + pump, rShZ: -0.12, rElX: -1.3,
        lShX: -0.3 + pump, lShZ: 0.12, lElX: -1.3,
        rHandZ: 0, lHandZ: 0,
        headX: nod, spineX: 0.08, hipY: Math.abs(pump) * -0.15,
      };
    }
  }
}

export function createAvatar(color: string): Avatar {
  const object = new THREE.Group();
  object.name = 'avatar';

  const mat = (c: string, rough = 0.75) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: rough, metalness: 0 });
  const shirt = mat(color, 0.8);
  const shirtDark = mat(color, 0.85);
  const skin = mat(SKIN, 0.65);
  const pants = mat(PANTS, 0.9);
  const shoes = mat(SHOES, 0.7);
  const hair = mat(HAIR, 0.9);
  const dark = mat('#1d1d22', 0.4);
  const white = mat('#ffffff', 0.35);
  const materials = [shirt, shirtDark, skin, pants, shoes, hair, dark, white];
  const tintShirt = (c: string) => {
    shirt.color.set(c);
    shirtDark.color.set(c).multiplyScalar(0.62);
  };
  tintShirt(color);

  const geos: THREE.BufferGeometry[] = [];
  const mesh = (geo: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
    geos.push(geo);
    const me = new THREE.Mesh(geo, m);
    me.position.set(x, y, z);
    me.castShadow = true;
    me.receiveShadow = true;
    parent.add(me);
    return me;
  };
  const pivot = (parent: THREE.Object3D, x: number, y: number, z = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };
  /** Capsule hanging down from a pivot: length l, radius r. */
  const limb = (parent: THREE.Object3D, r: number, l: number, m: THREE.Material, segs = 6) => {
    const geo = new THREE.CapsuleGeometry(r, Math.max(0.001, l - 2 * r), 2, segs);
    return mesh(geo, m, parent, 0, -l / 2, 0);
  };

  // --- Body hierarchy ---
  const HIP_H = 0.93;
  const hips = pivot(object, 0, HIP_H);
  mesh(new THREE.CylinderGeometry(0.15, 0.14, 0.16, 8), pants, hips, 0, 0.0, 0);

  const spine = pivot(hips, 0, 0.06);
  const chest = pivot(spine, 0, 0);
  // Torso: tapered octagonal shirt.
  const torso = mesh(new THREE.CylinderGeometry(0.19, 0.155, 0.5, 8), shirt, chest, 0, 0.25, 0);
  torso.scale.set(1, 1, 0.72);
  // Shirt hem + collar for some shape.
  mesh(new THREE.CylinderGeometry(0.158, 0.158, 0.05, 8), shirtDark, chest, 0, 0.02, 0).scale.set(1, 1, 0.74);
  mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.05, 8), shirtDark, chest, 0, 0.5, 0);
  // Sporty chest stripe (a ring matching the torso taper).
  mesh(new THREE.CylinderGeometry(0.184, 0.18, 0.045, 8), white, chest, 0, 0.34, 0).scale.set(1, 1, 0.74);

  const neck = pivot(chest, 0, 0.52);
  mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.09, 6), skin, neck, 0, 0.03, 0);
  const head = pivot(neck, 0, 0.08);
  const headMesh = mesh(new THREE.IcosahedronGeometry(0.125, 2), skin, head, 0, 0.11, 0);
  headMesh.scale.set(0.95, 1.08, 1);
  // Hair cap + backwards baseball cap in the shirt color.
  // Hair: a cap of the head sphere tilted back so it frames the forehead and covers the nape.
  const hairMesh = mesh(new THREE.SphereGeometry(0.135, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.58), hair, head, 0, 0.115, -0.006);
  hairMesh.scale.set(0.99, 1.08, 1.02);
  hairMesh.rotation.x = -0.75;
  const cap = mesh(new THREE.SphereGeometry(0.14, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.4), shirtDark, head, 0, 0.125, -0.01);
  cap.scale.set(1, 1.05, 1.03);
  cap.rotation.x = -0.3;
  // Backwards cap: the brim sticks out over the nape.
  const brim = mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.014, 10, 1, false, Math.PI / 2, Math.PI), shirtDark, head, 0, 0.15, -0.09);
  brim.rotation.x = 0.25;
  // Face (+Z): eyes, brows, nose, grin.
  for (const sx of [-1, 1]) {
    mesh(new THREE.SphereGeometry(0.02, 6, 4), white, head, sx * 0.045, 0.125, 0.108);
    mesh(new THREE.SphereGeometry(0.011, 6, 4), dark, head, sx * 0.045, 0.125, 0.125);
    const brow = mesh(new THREE.BoxGeometry(0.04, 0.01, 0.01), hair, head, sx * 0.047, 0.163, 0.115);
    brow.rotation.z = sx * -0.15;
    mesh(new THREE.SphereGeometry(0.025, 6, 4), skin, head, sx * 0.123, 0.11, 0); // ears
  }
  mesh(new THREE.ConeGeometry(0.018, 0.04, 5), skin, head, 0, 0.095, 0.13).rotation.x = Math.PI / 2;
  const mouth = mesh(new THREE.TorusGeometry(0.03, 0.007, 4, 8, Math.PI), dark, head, 0, 0.06, 0.112);
  mouth.rotation.z = Math.PI;

  // Arms. Left = +X (the avatar faces +Z).
  interface Arm { sh: THREE.Group; el: THREE.Group; hand: THREE.Group }
  const makeArm = (side: 1 | -1): Arm => {
    const sh = pivot(chest, side * 0.215, 0.45);
    mesh(new THREE.SphereGeometry(0.068, 7, 5), shirt, sh, 0, -0.01, 0); // shoulder ball
    // Short sleeve then bare arm.
    const sleeve = mesh(new THREE.CylinderGeometry(0.066, 0.06, 0.15, 7), shirt, sh, 0, -0.075, 0);
    void sleeve;
    limb(sh, 0.045, 0.28, skin);
    const el = pivot(sh, 0, -0.28);
    limb(el, 0.04, 0.26, skin);
    const hand = pivot(el, 0, -0.27);
    mesh(new THREE.BoxGeometry(0.075, 0.08, 0.05), skin, hand, 0, -0.035, 0.005);
    // Thumb pointing forward/up from the fist; reads as a thumbs-up when the forearm is raised.
    const thumb = mesh(new THREE.CapsuleGeometry(0.016, 0.04, 2, 5), skin, hand, side * 0.012, -0.02, 0.05);
    thumb.rotation.x = Math.PI / 2;
    return { sh, el, hand };
  };
  const lArm = makeArm(1);
  const rArm = makeArm(-1);

  // Ball held in the right hand while throwing.
  const ballGeo = new THREE.SphereGeometry(0.02, 10, 8);
  const ball = mesh(ballGeo, white, rArm.hand, 0, -0.09, 0.03);
  ball.visible = false;

  // Legs.
  interface Leg { hip: THREE.Group; knee: THREE.Group }
  const makeLeg = (side: 1 | -1): Leg => {
    const hip = pivot(hips, side * 0.085, -0.04);
    limb(hip, 0.075, 0.45, pants, 7);
    const knee = pivot(hip, 0, -0.44);
    limb(knee, 0.062, 0.42, pants, 7);
    const shoe = mesh(new THREE.BoxGeometry(0.11, 0.07, 0.24), shoes, knee, 0, -0.43, 0.04);
    void shoe;
    return { hip, knee };
  };
  const lLeg = makeLeg(1);
  const rLeg = makeLeg(-1);
  // Feet bottoms: hip 0.93 - 0.04 - 0.44 - 0.43 - 0.035 = -0.015 → raise slightly.
  hips.position.y = HIP_H + 0.015;
  const baseHipY = hips.position.y;

  // --- Animation state ---
  const cur: Pose = { ...ZERO };
  let time = 0;
  let throwing = false;
  let emote: { id: EmoteId; t: number } | null = null;

  function apply(p: Pose) {
    hips.position.y = baseHipY + p.hipY;
    hips.position.z = p.hipZ;
    hips.rotation.y = p.hipRotY;
    spine.rotation.set(p.spineX, p.spineY, p.spineZ);
    chest.scale.set(1 + p.breathe * 0.6, 1 + p.breathe, 1 + p.breathe);
    head.rotation.set(p.headX, p.headY, p.headZ);
    lArm.sh.rotation.set(p.lShX, p.lShY, p.lShZ, 'XZY');
    rArm.sh.rotation.set(p.rShX, p.rShY, p.rShZ, 'XZY');
    lArm.el.rotation.x = p.lElX;
    rArm.el.rotation.x = p.rElX;
    lArm.hand.rotation.z = p.lHandZ;
    rArm.hand.rotation.z = p.rHandZ;
    lLeg.hip.rotation.x = p.lLegX;
    rLeg.hip.rotation.x = p.rLegX;
    lLeg.knee.rotation.x = p.lKneeX;
    rLeg.knee.rotation.x = p.rKneeX;
  }

  function basePose(t: number): Pose {
    const p: Pose = { ...ZERO };
    // Idle: breathing, gentle weight shift and looking around.
    p.breathe = Math.sin(t * 1.6) * 0.012;
    p.spineZ = Math.sin(t * 0.55) * 0.025;
    p.hipRotY = Math.sin(t * 0.3) * 0.05;
    p.headY = Math.sin(t * 0.37) * 0.18 + Math.sin(t * 0.9) * 0.04;
    p.headX = Math.sin(t * 0.5) * 0.04;
    p.lShZ = 0.1 + Math.sin(t * 1.6) * 0.015;
    p.rShZ = -0.1 - Math.sin(t * 1.6) * 0.015;
    p.lKneeX = 0.06 + Math.max(0, Math.sin(t * 0.55)) * 0.06;
    p.rKneeX = 0.06 + Math.max(0, -Math.sin(t * 0.55)) * 0.06;
    if (throwing) {
      // Ready to throw: right arm up and forward, ball at eye level, small aiming bob.
      const bob = Math.sin(t * 2.4) * 0.06;
      p.rShX = -1.25 + bob;
      p.rShZ = -0.3;
      p.rShY = 0.2;
      p.rElX = -1.45 - bob;
      p.lShX = -0.35;
      p.lShZ = 0.25;
      p.lElX = -0.6;
      p.spineX = 0.12;
      p.headX = 0.1;
      p.headY = 0;
      p.lLegX = -0.15;
      p.rKneeX = 0.12;
    }
    return p;
  }

  function update(dt: number) {
    dt = Math.min(dt, 0.1);
    time += dt;
    const target = basePose(time);
    if (emote) {
      emote.t += dt;
      const dur = EMOTE_DURATION[emote.id];
      if (emote.t >= dur) {
        emote = null;
      } else {
        const w = envelope(emote.t, dur);
        const over = emotePose(emote.id, emote.t);
        for (const k of CHANNELS) {
          const v = over[k];
          if (v !== undefined) target[k] = target[k] + (v - target[k]) * w;
        }
      }
    }
    // Ease every joint toward the target (fast enough to keep jumps/waves crisp).
    const a = 1 - Math.exp(-dt * 16);
    for (const k of CHANNELS) cur[k] += (target[k] - cur[k]) * a;
    ball.visible = throwing && !emote;
    apply(cur);
  }

  apply(cur);

  return {
    object,
    setColor(c: string) {
      tintShirt(c);
    },
    playEmote(id: EmoteId) {
      emote = { id, t: 0 };
    },
    setThrowing(t: boolean) {
      throwing = t;
    },
    update,
    dispose() {
      object.removeFromParent();
      for (const g of geos) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
