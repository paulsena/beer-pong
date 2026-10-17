import { describe, expect, it } from 'vitest';
import { CUP, THROW, type Vec3, cupWorldPosition, eyePosition, initialRack } from '@bp/shared';
import { Physics, type PhysicsEvent } from '../src/physics';
import { SWING, aimVelocity, flickToVelocity, swingToVelocity } from '../src/throw';

/** Release point for seat 0. */
function releasePoint(): Vec3 {
  const e = eyePosition(0);
  return [e.x + THROW.releaseOffset.x, e.y + THROW.releaseOffset.y, e.z + THROW.releaseOffset.z];
}

const aim = (from: Vec3, target: Vec3, deg: number) => aimVelocity(from, target, deg)!;

async function run(p: Vec3, v: Vec3, seconds = 4) {
  const ph = await Physics.create();
  ph.setCups(0, initialRack());
  ph.setCups(1, initialRack());
  ph.throwBall(p, v);
  const events: PhysicsEvent[] = [];
  for (let t = 0; t < seconds && ph.isFlying(); t += 1 / 60) events.push(...ph.step(1 / 60));
  return { events, end: events.find((e) => e.type === 'sink' || e.type === 'miss' || e.type === 'swatted'), ph };
}

describe('physics', () => {
  it('sinks a lob aimed at each cup center', async () => {
    const from = releasePoint();
    let sunk = 0;
    for (const cup of initialRack()) {
      const c = cupWorldPosition(1, cup);
      const { end } = await run(from, aim(from, [c.x, CUP.height, c.z], 52));
      if (end?.type === 'sink' && end.cupId === cup.id && !end.bounced) sunk++;
    }
    expect(sunk).toBeGreaterThanOrEqual(9);
  });

  it('misses wide shots', async () => {
    const from = releasePoint();
    const { end } = await run(from, aim(from, [0.6, 0, -1.0], 40));
    expect(end?.type).toBe('miss');
  });

  it('detects a bounce sink', async () => {
    const from = releasePoint();
    // Downward throws straight down the middle; some of these bounce into a cup.
    let found = false;
    for (let deg = -20; deg <= -10 && !found; deg += 2.5) {
      for (let v = 2; v <= 3.5 && !found; v += 0.05) {
        const th = (deg * Math.PI) / 180;
        const { end } = await run(from, [0, v * Math.sin(th), -v * Math.cos(th)]);
        found = end?.type === 'sink' && end.bounced;
      }
    }
    expect(found).toBe(true);
  });

  it('swat only after bounce', async () => {
    const from = releasePoint();
    const ph = await Physics.create();
    ph.setCups(1, initialRack());
    ph.throwBall(from, aim(from, [0, 0, -0.4], 5));
    expect(ph.swat()).toBe(false);
    const events: PhysicsEvent[] = [];
    for (let i = 0; i < 300 && !ph.canSwat(); i++) events.push(...ph.step(1 / 60));
    expect(events.some((e) => e.type === 'table_hit')).toBe(true);
    expect(ph.swat()).toBe(true);
    for (let i = 0; i < 300 && ph.isFlying(); i++) events.push(...ph.step(1 / 60));
    expect(events.at(-1)?.type).toBe('swatted');
  });

  it('maps a band of flick speeds onto the rack, with sinks in it', async () => {
    const from = releasePoint();
    const noWobble = () => 0.5;
    const outcomes: string[] = [];
    for (let up = 0.5; up <= 4.5; up += 0.05) {
      const e = eyePosition(0);
      const v = flickToVelocity({ up, side: 0 }, from, 0, false, noWobble, [e.x, e.y, e.z])!;
      const { end } = await run(from, v);
      outcomes.push(end?.type === 'sink' ? 'S' : '.');
    }
    const sinks = outcomes.filter((o) => o === 'S').length;
    console.log('flick band', outcomes.join(''));
    // Several distinct cups along the center line are reachable, but most flicks miss.
    expect(sinks).toBeGreaterThanOrEqual(3);
    expect(sinks).toBeLessThan(outcomes.length / 2);
    expect(flickToVelocity({ up: 0.1, side: 0 }, from, 0, false)).toBeNull();
  });

  describe('swing meter', () => {
    /** rand sequence that makes the scatter sample exactly 0 (cos(2π·0.25) = 0). */
    const noScatter = () => {
      let i = 0;
      return () => (i++ % 2 === 0 ? 0.5 : 0.25);
    };
    const shoot = async (cupId: number, power: number, accuracy: number) => {
      const from = releasePoint();
      const cup = initialRack().find((c) => c.id === cupId)!;
      const c = cupWorldPosition(1, cup);
      const v = swingToVelocity(from, [c.x, CUP.height, c.z], false, { power, accuracy }, noScatter())!;
      return (await run(from, v)).end;
    };

    it('a perfect swing sinks every cup it is aimed at', async () => {
      for (const cup of initialRack()) {
        const end = await shoot(cup.id, 1, 0);
        expect(end, `cup ${cup.id}`).toMatchObject({ type: 'sink', cupId: cup.id, bounced: false });
      }
    });

    it('swings inside the perfect zones still sink', async () => {
      for (const [power, accuracy] of [[1 + SWING.powerPerfect * 0.9, SWING.accuracyPerfect * 0.9], [1 - SWING.powerPerfect * 0.9, -SWING.accuracyPerfect * 0.9]] as const) {
        expect((await shoot(4, power, accuracy))?.type).toBe('sink');
      }
    });

    it('a badly short or crooked swing does not hit the aimed cup', async () => {
      for (const [power, accuracy] of [[0.7, 0], [1, 0.14], [1, -0.14]] as const) {
        const end = await shoot(9, power, accuracy);
        expect(end?.type === 'sink' && end.cupId === 9, `power ${power} acc ${accuracy}`).toBe(false);
      }
    });
  });
});
