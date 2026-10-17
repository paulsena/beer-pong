import { describe, expect, it } from 'vitest';
import { initialRack, otherSeat, rackLayout, RERACK_SHAPES, type Seat } from '../src/constants';
import {
  createInitialState, reduce, type GameAction, type GameState, type ReduceResult,
  type RuleError, type ThrowResult,
} from '../src/rules';

type Accepted = Extract<ReduceResult, { ok: true }>;

function freezeDeep(value: unknown): void {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
}

// Every reducer invocation checks purity, including nested state and action objects.
function checked(state: GameState, action: GameAction): ReduceResult {
  const before = structuredClone(state);
  const actionBefore = structuredClone(action);
  freezeDeep(state);
  freezeDeep(action);
  const result = reduce(state, action);
  expect(state).toEqual(before);
  expect(action).toEqual(actionBefore);
  return result;
}

function accept(state: GameState, action: GameAction): Accepted {
  const result = checked(state, action);
  if (!result.ok) throw new Error(`Unexpected rejection: ${result.error}`);
  return result;
}

function reject(state: GameState, action: GameAction, error: RuleError): void {
  const result = checked(state, action);
  expect(result).toEqual({ ok: false, state, error });
  expect(result.state).toBe(state);
}

function join(state: GameState, seat: Seat): Accepted {
  return accept(state, { type: 'join', seat, name: `Player ${seat}`, color: '#aabbcc' });
}

function playing(turn: Seat = 0): GameState {
  return { ...join(join(createInitialState('backyard'), 0).state, 1).state, turn };
}

function shot(state: GameState, result: ThrowResult): Accepted {
  return accept(state, { type: 'throw_result', seat: state.turn, throwId: state.throwId, result });
}

function sink(state: GameState, cupId = 0, bounced = false): Accepted {
  return shot(state, { kind: 'sink', cupId, bounced });
}

function pick(state: GameState, cupId = 1): Accepted {
  return accept(state, { type: 'pick_cup', seat: otherSeat(state.turn), cupId });
}

describe('lobby and presence', () => {
  it('starts with ten independently allocated cups per side in a 4-3-2-1 triangle', () => {
    const state = createInitialState('basement');
    expect(state).toMatchObject({ phase: 'waiting', table: 'basement', players: [null, null],
      turn: 0, throwsLeft: 2, madeThisRound: 0, canRerack: true, reracksLeft: [2, 2],
      pendingPick: null, winner: null, throwId: 0 });
    expect(state.sides).toEqual([initialRack(), initialRack()]);
    expect(state.sides[0].map(c => c.id)).toEqual(Array.from({ length: 10 }, (_, i) => i));
    const rows = new Map<number, number>();
    state.sides[0].forEach(c => rows.set(c.d, (rows.get(c.d) ?? 0) + 1));
    expect([...rows.values()]).toEqual([4, 3, 2, 1]);
    expect(state.sides[0]).not.toBe(state.sides[1]);
    expect(state.sides[0][0]).not.toBe(state.sides[1][0]);
  });

  it.each([0, 1] as const)('starts only after both seats join (seat %i first)', first => {
    const one = join(createInitialState('basement'), first);
    expect(one.state.phase).toBe('waiting');
    expect(one.events).toEqual([]);
    expect(one.state.players[first]).toEqual({ name: `Player ${first}`, color: '#aabbcc', connected: true });
    const two = join(one.state, otherSeat(first));
    expect(two.state).toMatchObject({ phase: 'playing', turn: 0 });
    expect(two.events).toEqual([{ type: 'game_started' }]);
    reject(two.state, { type: 'join', seat: first, name: 'Other', color: '#ffffff' }, 'seat_taken');
  });

  it('allows replacing a disconnected seat without restarting play', () => {
    const state = accept(sink(playing()).state, { type: 'presence', seat: 0, connected: false }).state;
    const result = join(state, 0);
    expect(result.state).toEqual({ ...state, players: [{ ...state.players[0]!, connected: true }, state.players[1]] });
    expect(result.events).toEqual([]);
  });

  it.each(['waiting', 'playing', 'awaiting_pick', 'game_over'] as const)(
    'presence only changes connected in phase %s', phase => {
      const base = playing();
      const state: GameState = { ...base, phase };
      const disconnected = accept(state, { type: 'presence', seat: 1, connected: false });
      expect(disconnected.state).toEqual({ ...state, players: [state.players[0], { ...state.players[1]!, connected: false }] });
      expect(disconnected.events).toEqual([]);
      expect(accept(disconnected.state, { type: 'presence', seat: 1, connected: true }).state).toEqual(state);
    });

  it('ignores presence for an empty seat without creating a player or starting a game', () => {
    const state = createInitialState('basement');
    expect(accept(state, { type: 'presence', seat: 1, connected: true })).toMatchObject({ state, events: [] });
  });
});

describe('throws and pairs', () => {
  it.each([0, 1] as const)('seat %i sinks only the opponent cup and consumes one throw', seat => {
    const state = playing(seat);
    const side = otherSeat(seat);
    const result = sink(state, 3);
    expect(result.state.sides[seat]).toEqual(state.sides[seat]);
    expect(result.state.sides[side]).toEqual(state.sides[side].filter(c => c.id !== 3));
    expect(result.state).toMatchObject({ turn: seat, throwsLeft: 1, madeThisRound: 1, throwId: 1, canRerack: false });
    expect(result.events).toEqual([{ type: 'cup_removed', side, cupId: 3, cause: 'sink' }]);
  });

  it.each(['miss', 'swatted'] as const)('%s consumes a throw and emits its event', kind => {
    const result = shot(playing(), { kind });
    expect(result.state).toMatchObject({ throwsLeft: 1, madeThisRound: 0, throwId: 1, canRerack: false });
    expect(result.events).toEqual([{ type: kind, seat: 0 }]);
  });

  it.each([
    ['miss', 'miss'], ['sink', 'miss'], ['miss', 'sink'], ['sink', 'swatted'], ['swatted', 'sink'],
  ] as const)('passes the turn after %s then %s', (first, second) => {
    const one = shot(playing(), first === 'sink' ? { kind: 'sink', cupId: 0, bounced: false } : { kind: first });
    const two = shot(one.state, second === 'sink' ? { kind: 'sink', cupId: 1, bounced: false } : { kind: second });
    expect(two.state).toMatchObject({ turn: 1, throwsLeft: 2, madeThisRound: 0, throwId: 2, canRerack: true });
    expect(two.events.at(-1)).toEqual({ type: 'turn_changed', turn: 1 });
  });

  it('gives balls back repeatedly, resets pair makes, and keeps reracking disabled', () => {
    const pair = sink(sink(playing()).state, 1);
    expect(pair.state).toMatchObject({ turn: 0, throwsLeft: 2, madeThisRound: 0, canRerack: false });
    expect(pair.events).toEqual([{ type: 'cup_removed', side: 1, cupId: 1, cause: 'sink' }, { type: 'balls_back', seat: 0 }]);
    const again = sink(sink(pair.state, 2).state, 3);
    expect(again.events.at(-1)).toEqual({ type: 'balls_back', seat: 0 });
    const miss = shot(again.state, { kind: 'miss' });
    expect(sink(miss.state, 4).events.at(-1)).toEqual({ type: 'turn_changed', turn: 1 });
    reject(pair.state, { type: 'rerack', seat: 0, shape: 'diamond' }, 'rerack_not_allowed');
  });

  it('rejects the wrong thrower and stale past or future throw IDs', () => {
    const state = playing();
    reject(state, { type: 'throw_result', seat: 1, throwId: 0, result: { kind: 'miss' } }, 'not_your_turn');
    for (const throwId of [-1, 1]) {
      reject(state, { type: 'throw_result', seat: 0, throwId, result: { kind: 'miss' } }, 'stale_throw');
    }
    const next = shot(state, { kind: 'miss' }).state;
    reject(next, { type: 'throw_result', seat: 0, throwId: 0, result: { kind: 'miss' } }, 'stale_throw');
  });

  it.each(['waiting', 'awaiting_pick', 'game_over'] as const)('rejects throws in %s', phase => {
    reject({ ...playing(), phase }, { type: 'throw_result', seat: 0, throwId: 0, result: { kind: 'miss' } }, 'wrong_phase');
  });

  it.each([false, true])('rejects unknown or already removed target cups (bounce %s)', bounced => {
    const base = playing();
    const state: GameState = { ...base, sides: [base.sides[0], base.sides[1].filter(c => c.id !== 0)] };
    for (const cupId of [0, 99]) {
      reject(state, { type: 'throw_result', seat: 0, throwId: 0, result: { kind: 'sink', cupId, bounced } }, 'unknown_cup');
    }
  });
});

describe('bounce picks', () => {
  it.each([0, 1] as const)('seat %i bounce requires the defender to choose the second cup', seat => {
    const side = otherSeat(seat);
    const bounce = sink(playing(seat), 0, true);
    expect(bounce.state).toMatchObject({ phase: 'awaiting_pick', turn: seat, throwsLeft: 1,
      madeThisRound: 1, canRerack: false, throwId: 1, pendingPick: { defender: side, remaining: 1 } });
    expect(bounce.events).toEqual([
      { type: 'bounce_sink', side, cupId: 0 }, { type: 'cup_removed', side, cupId: 0, cause: 'sink' },
      { type: 'pick_required', defender: side },
    ]);
    const result = pick(bounce.state, 7);
    expect(result.state).toMatchObject({ phase: 'playing', turn: seat, throwsLeft: 1, madeThisRound: 1, throwId: 1, pendingPick: null });
    expect(result.state.sides[side].map(c => c.id)).toEqual([1, 2, 3, 4, 5, 6, 8, 9]);
    expect(result.events).toEqual([{ type: 'cup_removed', side, cupId: 7, cause: 'bounce_pick' }]);
  });

  it('defers balls back for a second-throw bounce until the pick', () => {
    const bounce = sink(sink(playing()).state, 1, true);
    expect(bounce.state).toMatchObject({ phase: 'awaiting_pick', throwsLeft: 0, madeThisRound: 2, turn: 0 });
    expect(bounce.events.map(e => e.type)).toEqual(['bounce_sink', 'cup_removed', 'pick_required']);
    const result = pick(bounce.state, 2);
    expect(result.state).toMatchObject({ phase: 'playing', throwsLeft: 2, madeThisRound: 0, canRerack: false, turn: 0 });
    expect(result.events).toEqual([{ type: 'cup_removed', side: 1, cupId: 2, cause: 'bounce_pick' }, { type: 'balls_back', seat: 0 }]);
  });

  it('defers turn change for a second-throw bounce following a miss', () => {
    const bounce = sink(shot(playing(), { kind: 'miss' }).state, 0, true);
    expect(bounce.state).toMatchObject({ turn: 0, throwsLeft: 0, madeThisRound: 1 });
    const result = pick(bounce.state);
    expect(result.state).toMatchObject({ phase: 'playing', turn: 1, throwsLeft: 2, madeThisRound: 0, canRerack: true });
    expect(result.events.at(-1)).toEqual({ type: 'turn_changed', turn: 1 });
  });

  it('counts a first-throw bounce as one make toward balls back', () => {
    const state = pick(sink(playing(), 0, true).state).state;
    expect(sink(state, 2).events.at(-1)).toEqual({ type: 'balls_back', seat: 0 });
  });

  it('rejects picks by the thrower and picks of missing cups', () => {
    const state = sink(playing(), 0, true).state;
    reject(state, { type: 'pick_cup', seat: 0, cupId: 1 }, 'not_your_turn');
    for (const cupId of [0, 99]) reject(state, { type: 'pick_cup', seat: 1, cupId }, 'unknown_cup');
    reject(state, { type: 'throw_result', seat: 0, throwId: 1, result: { kind: 'miss' } }, 'wrong_phase');
    reject(state, { type: 'rerack', seat: 0, shape: 'line' }, 'wrong_phase');
  });

  it.each(['waiting', 'playing', 'game_over'] as const)('rejects picks in %s', phase => {
    reject({ ...playing(), phase }, { type: 'pick_cup', seat: 1, cupId: 1 }, 'wrong_phase');
  });
});

describe('re-racks', () => {
  it.each(RERACK_SHAPES)('assigns sorted surviving IDs to the %s preset on the opponent side', shape => {
    const base = playing(1);
    const state: GameState = { ...base, sides: [[base.sides[0][9]!, base.sides[0][2]!, base.sides[0][5]!], base.sides[1]] };
    const result = accept(state, { type: 'rerack', seat: 1, shape });
    expect(result.state.sides[0]).toEqual(rackLayout(shape, 3).map((p, i) => ({ id: [2, 5, 9][i], ...p })));
    expect(result.state.sides[1]).toEqual(state.sides[1]);
    expect(result.state).toMatchObject({ reracksLeft: [2, 1], canRerack: true, throwsLeft: 2, throwId: 0, madeThisRound: 0 });
    expect(result.events).toEqual([{ type: 'reracked', side: 0, shape }]);
  });

  it('allows two in one turn, rejects the third, and keeps independent per-player budgets', () => {
    const once = accept(playing(), { type: 'rerack', seat: 0, shape: 'diamond' }).state;
    const twice = accept(once, { type: 'rerack', seat: 0, shape: 'zipper' }).state;
    expect(twice).toMatchObject({ reracksLeft: [0, 2], canRerack: true, throwsLeft: 2 });
    reject(twice, { type: 'rerack', seat: 0, shape: 'line' }, 'no_reracks_left');
    const nextTurn = shot(shot(twice, { kind: 'miss' }).state, { kind: 'miss' }).state;
    expect(accept(nextTurn, { type: 'rerack', seat: 1, shape: 'triangle' }).state.reracksLeft).toEqual([0, 1]);
    const back = shot(shot(nextTurn, { kind: 'miss' }).state, { kind: 'miss' }).state;
    reject(back, { type: 'rerack', seat: 0, shape: 'line' }, 'no_reracks_left');
  });

  it('rejects the defender and reracking after the first throw', () => {
    reject(playing(), { type: 'rerack', seat: 1, shape: 'line' }, 'not_your_turn');
    reject(shot(playing(), { kind: 'miss' }).state, { type: 'rerack', seat: 0, shape: 'line' }, 'rerack_not_allowed');
  });

  it.each(['waiting', 'awaiting_pick', 'game_over'] as const)('rejects reracks in %s', phase => {
    reject({ ...playing(), phase }, { type: 'rerack', seat: 0, shape: 'line' }, 'wrong_phase');
  });
});

describe('wins and rematches', () => {
  it.each([0, 1] as const)('seat %i wins by clearing all ten opponent cups through play', seat => {
    let state = playing(seat);
    for (let id = 0; id < 10; id++) state = sink(state, id).state;
    expect(state).toMatchObject({ phase: 'game_over', winner: seat, turn: seat, throwId: 10, pendingPick: null });
    expect(state.sides[otherSeat(seat)]).toEqual([]);
    expect(state.sides[seat]).toHaveLength(10);
    reject(state, { type: 'throw_result', seat, throwId: 10, result: { kind: 'miss' } }, 'wrong_phase');
  });

  it.each([false, true])('last-cup sink wins immediately (bounce %s), without a pick or balls back', bounced => {
    const base = sink(playing()).state;
    const state: GameState = { ...base, sides: [base.sides[0], [base.sides[1][0]!]] };
    const result = sink(state, state.sides[1][0]!.id, bounced);
    expect(result.state).toMatchObject({ phase: 'game_over', winner: 0, pendingPick: null });
    expect(result.events.map(e => e.type)).toEqual(bounced ? ['bounce_sink', 'cup_removed', 'game_over'] : ['cup_removed', 'game_over']);
    expect(result.events.at(-1)).toEqual({ type: 'game_over', winner: 0 });
  });

  it('a bounce leaving exactly one cup wins on the pick, ahead of balls back', () => {
    const base = sink(playing()).state;
    const state: GameState = { ...base, sides: [base.sides[0], base.sides[1].slice(0, 2)] };
    const bounce = sink(state, 1, true);
    expect(bounce.state).toMatchObject({ phase: 'awaiting_pick', winner: null, throwsLeft: 0, madeThisRound: 2 });
    expect(bounce.state.sides[1]).toHaveLength(1);
    const result = pick(bounce.state, 2);
    expect(result.state).toMatchObject({ phase: 'game_over', winner: 0, pendingPick: null });
    expect(result.state.sides[1]).toEqual([]);
    expect(result.events).toEqual([{ type: 'cup_removed', side: 1, cupId: 2, cause: 'bounce_pick' }, { type: 'game_over', winner: 0 }]);
  });

  it.each([0, 1] as const)('rematch resets all gameplay state and starts with the loser (winner %i)', winner => {
    let state = playing(winner);
    for (let id = 0; id < 10; id++) state = sink(state, id).state;
    state = accept(state, { type: 'presence', seat: 0, connected: false }).state;
    for (const seat of [0, 1] as const) {
      // One vote waits for the other player; the second vote starts the new game.
      const first = accept(state, { type: 'rematch', seat });
      expect(first.state.phase).toBe('game_over');
      expect(first.state.rematchVotes[seat]).toBe(true);
      expect(first.events).toEqual([]);
      const result = accept(first.state, { type: 'rematch', seat: otherSeat(seat) });
      expect(result.state).toEqual({ ...createInitialState('backyard'), players: state.players, phase: 'playing', turn: otherSeat(winner) });
      expect(result.events).toEqual([{ type: 'game_started' }]);
    }
  });

  it.each(['waiting', 'playing', 'awaiting_pick'] as const)('rejects rematches in %s', phase => {
    reject({ ...playing(), phase }, { type: 'rematch', seat: 0 }, 'wrong_phase');
  });
});
