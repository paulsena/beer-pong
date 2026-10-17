// Rapier world: table + cup colliders, ball simulation, sink/bounce detection. (Track A)
import type { CupState, Seat, Vec3, Quat } from '@bp/shared';

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

export class Physics {
  static async create(): Promise<Physics> {
    return new Physics();
  }
  setCups(_side: Seat, _cups: CupState[]): void {}
  /** Launch the ball from `p` with velocity `v` (m/s). Ends any throw in flight. */
  throwBall(_p: Vec3, _v: Vec3): void {}
  /** Defender swatted: knock the ball away if it hasn't sunk. */
  swat(): void {}
  /** Advance by dt seconds (fixed substeps internally). Returns events from this step. */
  step(_dt: number): PhysicsEvent[] {
    return [];
  }
  /** Current ball pose, or null when no throw is in flight. */
  ballPose(): BallPose | null {
    return null;
  }
}
