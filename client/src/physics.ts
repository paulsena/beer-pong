// Rapier world: table + cup colliders, ball simulation, sink/bounce detection. (Track A)
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { BALL, CUP, PHYSICS, TABLE, type CupState, type Quat, type Seat, type Vec3, cupWorldPosition } from '@bp/shared';

export type PhysicsEvent =
  | { type: 'table_hit' }
  | { type: 'cup_hit'; side: Seat; cupId: number }
  | { type: 'sink'; side: Seat; cupId: number; bounced: boolean }
  | { type: 'miss' }
  | { type: 'swatted' };

export interface BallPose {
  p: Vec3;
  q: Quat;
  bounced: boolean;
}

interface CupBody {
  side: Seat;
  cupId: number;
  body: RAPIER.RigidBody;
  colliders: RAPIER.Collider[];
  /** World position of the cup bottom center. */
  x: number;
  z: number;
}

const WALL_SEGMENTS = 16;
/** Seconds after a swat before the throw ends. */
const SWAT_SETTLE = 0.6;
/** Ball slower than this (m/s) for REST_SECONDS counts as a miss. */
const REST_SPEED = 0.08;
const REST_SECONDS = 0.5;

let rapierReady: Promise<void> | null = null;

export class Physics {
  private readonly world: RAPIER.World;
  private readonly events = new RAPIER.EventQueue(true);
  private readonly tableCollider: RAPIER.Collider;
  private readonly cups: [Map<number, CupBody>, Map<number, CupBody>] = [new Map(), new Map()];
  private readonly cupByCollider = new Map<number, CupBody>();
  private ball: RAPIER.RigidBody | null = null;
  private ballCollider: RAPIER.Collider | null = null;
  private accumulator = 0;
  private flightTime = 0;
  private restTime = 0;
  private bounced = false;
  private swatTimer = -1;
  private flying = false;

  static async create(): Promise<Physics> {
    rapierReady ??= RAPIER.init();
    await rapierReady;
    return new Physics();
  }

  private constructor() {
    this.world = new RAPIER.World({ x: 0, y: PHYSICS.gravity, z: 0 });
    this.world.timestep = PHYSICS.fixedDt;
    this.tableCollider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(TABLE.width / 2, TABLE.thickness / 2, TABLE.length / 2)
        .setTranslation(0, -TABLE.thickness / 2, 0)
        .setRestitution(PHYSICS.tableRestitution)
        .setFriction(PHYSICS.tableFriction),
    );
    // Floor, so balls that fall off the table land somewhere before the miss check fires.
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(10, 0.05, 10).setTranslation(0, -TABLE.height - 0.05, 0).setRestitution(0.5));
  }

  /** Replace a side's cups with colliders matching `cups`. */
  setCups(side: Seat, cups: CupState[]): void {
    const map = this.cups[side];
    for (const cup of map.values()) {
      for (const c of cup.colliders) this.cupByCollider.delete(c.handle);
      this.world.removeRigidBody(cup.body);
    }
    map.clear();
    for (const c of cups) {
      const p = cupWorldPosition(side, c);
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(p.x, p.y, p.z));
      const colliders = cupColliderDescs().map((d) => this.world.createCollider(d, body));
      const cup: CupBody = { side, cupId: c.id, body, colliders, x: p.x, z: p.z };
      for (const col of colliders) this.cupByCollider.set(col.handle, cup);
      map.set(c.id, cup);
    }
  }

  /** Launch the ball from `p` with velocity `v` (m/s). Ends any throw in flight. */
  throwBall(p: Vec3, v: Vec3, spin: Vec3 = [0, 0, 0]): void {
    this.clearBall();
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(p[0], p[1], p[2])
        .setLinvel(v[0], v[1], v[2])
        .setAngvel({ x: spin[0], y: spin[1], z: spin[2] })
        .setLinearDamping(BALL.linearDamping)
        .setAngularDamping(BALL.angularDamping)
        .setCcdEnabled(true),
    );
    const volume = (4 / 3) * Math.PI * BALL.radius ** 3;
    this.ballCollider = this.world.createCollider(
      RAPIER.ColliderDesc.ball(BALL.radius)
        .setDensity(BALL.mass / volume)
        .setRestitution(BALL.restitution)
        .setFriction(BALL.friction)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    );
    this.ball = body;
    this.flying = true;
    this.flightTime = 0;
    this.restTime = 0;
    this.bounced = false;
    this.swatTimer = -1;
  }

  /** Whether a swat is currently legal (ball in flight, has touched the table, not yet swatted). */
  canSwat(): boolean {
    return this.flying && this.bounced && this.swatTimer < 0;
  }

  /** Defender swatted: knock the ball away if it hasn't sunk. Returns false if it was too late. */
  swat(): boolean {
    if (!this.ball || !this.canSwat()) return false;
    const side = Math.random() < 0.5 ? -1 : 1;
    this.ball.setLinvel({ x: side * 2.2, y: 1.6, z: 0 }, true);
    this.swatTimer = 0;
    return true;
  }

  /** Remove the ball (call after showing a finished throw). */
  clearBall(): void {
    if (this.ball) this.world.removeRigidBody(this.ball);
    this.ball = null;
    this.ballCollider = null;
    this.flying = false;
  }

  /** Advance by dt seconds (fixed substeps internally). Returns events from this step. */
  step(dt: number): PhysicsEvent[] {
    const out: PhysicsEvent[] = [];
    this.accumulator = Math.min(this.accumulator + dt, 0.1);
    while (this.accumulator >= PHYSICS.fixedDt) {
      this.accumulator -= PHYSICS.fixedDt;
      this.world.step(this.events);
      this.drainCollisions(out);
      if (this.flying) this.checkOutcome(PHYSICS.fixedDt, out);
    }
    return out;
  }

  /** Current ball pose, or null when there is no ball. Stays valid after a throw ends until clearBall(). */
  ballPose(): BallPose | null {
    if (!this.ball) return null;
    const t = this.ball.translation();
    const r = this.ball.rotation();
    return { p: [t.x, t.y, t.z], q: [r.x, r.y, r.z, r.w], bounced: this.bounced };
  }

  isFlying(): boolean {
    return this.flying;
  }

  private drainCollisions(out: PhysicsEvent[]) {
    const ballHandle = this.ballCollider?.handle;
    this.events.drainCollisionEvents((h1, h2, started) => {
      if (!started || ballHandle === undefined || !this.flying) return;
      const other = h1 === ballHandle ? h2 : h2 === ballHandle ? h1 : -1;
      if (other < 0) return;
      if (other === this.tableCollider.handle) {
        if (!this.bounced) out.push({ type: 'table_hit' });
        this.bounced = true;
        return;
      }
      const cup = this.cupByCollider.get(other);
      if (cup) out.push({ type: 'cup_hit', side: cup.side, cupId: cup.cupId });
    });
  }

  private checkOutcome(dt: number, out: PhysicsEvent[]) {
    const ball = this.ball!;
    this.flightTime += dt;
    const p = ball.translation();

    if (this.swatTimer >= 0) {
      this.swatTimer += dt;
      if (this.swatTimer >= SWAT_SETTLE) return this.finish(out, { type: 'swatted' });
    } else {
      const sunk = this.findSunkCup(p);
      if (sunk) return this.finish(out, { type: 'sink', side: sunk.side, cupId: sunk.cupId, bounced: this.bounced });
    }

    const ended = this.swatTimer >= 0 ? ({ type: 'swatted' } as const) : ({ type: 'miss' } as const);
    if (p.y < PHYSICS.missBelowY || this.flightTime > PHYSICS.maxFlightSeconds) return this.finish(out, ended);
    const v = ball.linvel();
    this.restTime = Math.hypot(v.x, v.y, v.z) < REST_SPEED ? this.restTime + dt : 0;
    if (this.restTime > REST_SECONDS) this.finish(out, ended);
  }

  private findSunkCup(p: { x: number; y: number; z: number }): CupBody | null {
    if (p.y > CUP.height - PHYSICS.sinkDepth || p.y < 0) return null;
    for (const map of this.cups) {
      for (const cup of map.values()) {
        const r = Math.hypot(p.x - cup.x, p.z - cup.z);
        if (r < radiusAt(p.y) - BALL.radius * 0.5) return cup;
      }
    }
    return null;
  }

  private finish(out: PhysicsEvent[], ev: PhysicsEvent) {
    this.flying = false;
    out.push(ev);
  }
}

/** Inner cup radius at height y above the cup bottom. */
function radiusAt(y: number): number {
  return CUP.bottomRadius + (CUP.topRadius - CUP.bottomRadius) * (y / CUP.height);
}

let cachedSlabs: { t: THREE.Vector3; q: THREE.Quaternion; half: Vec3 }[] | null = null;

/** Colliders for one cup in its body frame (origin at the bottom center): a ring of slanted wall slabs + a base. */
function cupColliderDescs(): RAPIER.ColliderDesc[] {
  if (!cachedSlabs) {
    const { topRadius: rt, bottomRadius: rb, height: h } = CUP;
    const slant = Math.atan2(rt - rb, h);
    const slantLen = Math.hypot(rt - rb, h);
    const halfThick = 0.004;
    const halfWidth = rt * Math.tan(Math.PI / WALL_SEGMENTS) + 0.001;
    const rMid = (rt + rb) / 2;
    cachedSlabs = [];
    for (let i = 0; i < WALL_SEGMENTS; i++) {
      const a = (i / WALL_SEGMENTS) * Math.PI * 2;
      const radial = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const tangent = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
      // Wall direction runs up and outward along the taper.
      const up = new THREE.Vector3(0, Math.cos(slant), 0).addScaledVector(radial, Math.sin(slant));
      // tangent x up points inward; keeps the basis right-handed.
      const inward = new THREE.Vector3().crossVectors(tangent, up);
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(tangent, up, inward));
      // Push the slab outward by its half thickness so the inner face matches the visual wall.
      const t = radial.clone().multiplyScalar(rMid).setY(h / 2).addScaledVector(inward, -halfThick);
      cachedSlabs.push({ t, q, half: [halfWidth, slantLen / 2, halfThick] });
    }
  }
  const descs = cachedSlabs.map(({ t, q, half }) =>
    RAPIER.ColliderDesc.cuboid(half[0], half[1], half[2])
      .setTranslation(t.x, t.y, t.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setRestitution(PHYSICS.cupRestitution)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min)
      .setFriction(PHYSICS.cupFriction),
  );
  descs.push(
    RAPIER.ColliderDesc.cylinder(0.002, CUP.bottomRadius)
      .setTranslation(0, 0.002, 0)
      .setRestitution(0.1)
      .setFriction(PHYSICS.cupFriction),
  );
  return descs;
}
