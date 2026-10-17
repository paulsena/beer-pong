// In-game HUD: player cards (name, color, cups left + mini rack), turn indicator, throws, re-racks.
import { type CupState, type GameState, RULES, type Seat, initialRack, otherSeat } from '@bp/shared';
import { h } from './dom';
import { rackBounds, rackDiagram } from './rack';

interface Card {
  root: HTMLElement;
  dot: HTMLElement;
  name: HTMLElement;
  nameText: HTMLElement;
  cups: HTMLElement;
  offline: HTMLElement;
  rackHolder: HTMLElement;
  rackKey: string;
}

const START_BOUNDS = rackBounds(initialRack());

function makeCard(right: boolean, you: boolean): Card {
  const dot = h('div.bp-dot');
  const nameText = h('span', null, '…');
  const name = h('div.bp-pname', null, nameText, you ? h('span.bp-you', null, 'YOU') : null);
  const cups = h('div.bp-cups');
  const offline = h('div.bp-offline', null, 'DISCONNECTED');
  offline.hidden = true;
  const rackHolder = h('div.bp-mini-rack');
  const root = h(`div.bp-panel.bp-player${right ? '.bp-right' : ''}`, null, dot, h('div.bp-pinfo', null, name, cups, offline), rackHolder);
  return { root, dot, name, nameText, cups, offline, rackHolder, rackKey: '' };
}

export interface Hud {
  el: HTMLElement;
  update(state: GameState, mySeat: Seat): void;
}

export function buildHud(): Hud {
  const me = makeCard(false, true);
  const them = makeCard(true, false);
  const turnLabel = h('div.bp-turn-label', null, '');
  const balls = h('div.bp-balls');
  const pips = h('span.bp-rerack-pips');
  const reracks = h('span', null, 'Re-racks', pips);
  const turn = h('div.bp-panel.bp-turn', null, turnLabel, h('div.bp-turn-sub', null, balls, reracks));
  const top = h('div.bp-hud-top', null, me.root, turn, them.root);
  const el = h('div.bp-layer.bp-hud', null, top);

  function fillCard(card: Card, state: GameState, seat: Seat, view: 'attacker' | 'defender', color: string) {
    const p = state.players[seat];
    card.nameText.textContent = p?.name ?? 'Waiting…';
    card.dot.style.background = p?.color ?? '#666';
    card.offline.hidden = !p || p.connected;
    const cups: CupState[] = state.sides[seat];
    const n = cups.length;
    card.cups.replaceChildren(h('b', null, String(n)), ` cup${n === 1 ? '' : 's'} left`);
    const key = `${view}:${cups.map((c) => `${c.id},${c.x.toFixed(3)},${c.d.toFixed(3)}`).join(';')}`;
    if (key !== card.rackKey) {
      card.rackKey = key;
      const cb = rackBounds(cups);
      const bounds = {
        minX: Math.min(START_BOUNDS.minX, cb.minX),
        maxX: Math.max(START_BOUNDS.maxX, cb.maxX),
        minD: Math.min(START_BOUNDS.minD, cb.minD),
        maxD: Math.max(START_BOUNDS.maxD, cb.maxD),
      };
      card.rackHolder.replaceChildren(rackDiagram(cups, { width: 62, height: 56, view, bounds, cupColor: color }));
    }
  }

  return {
    el,
    update(state, mySeat) {
      const opp = otherSeat(mySeat);
      // Mine: my own cups seen from behind them; theirs: the rack I'm aiming at.
      fillCard(me, state, mySeat, 'defender', '#e63946');
      fillCard(them, state, opp, 'attacker', '#e63946');

      const myTurn = state.turn === mySeat;
      let label: string;
      switch (state.phase) {
        case 'waiting':
          label = 'Waiting for players';
          break;
        case 'playing':
          label = myTurn ? 'Your throw' : "Opponent's throw";
          break;
        case 'awaiting_pick':
          label = state.pendingPick?.defender === mySeat ? 'Pick a cup!' : 'Opponent is picking…';
          break;
        case 'game_over':
          label = state.winner === mySeat ? 'You win!' : 'Game over';
          break;
      }
      turnLabel.textContent = label;
      turn.classList.toggle('bp-mine', myTurn && state.phase === 'playing');
      me.root.classList.toggle('bp-active', myTurn && state.phase !== 'game_over');
      them.root.classList.toggle('bp-active', !myTurn && state.phase !== 'game_over');

      const total = Math.max(RULES.throwsPerTurn, state.throwsLeft);
      balls.replaceChildren(
        ...Array.from({ length: total }, (_, i) => h(`span.bp-ball${i < state.throwsLeft ? '' : '.bp-used'}`, { title: `${state.throwsLeft} throw${state.throwsLeft === 1 ? '' : 's'} left` })),
      );
      balls.style.visibility = state.phase === 'playing' || state.phase === 'awaiting_pick' ? 'visible' : 'hidden';
      const left = state.reracksLeft[mySeat];
      pips.replaceChildren(...Array.from({ length: RULES.reracksPerGame }, (_, i) => h(`i${i < left ? '' : '.bp-used'}`)));
      reracks.title = `${left} re-rack${left === 1 ? '' : 's'} left`;
    },
  };
}
