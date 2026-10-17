// DOM UI: menu, lobby, HUD, emote wheel, quick chat, re-rack picker, cup picker, game over. (Track E)
import { type CupState, type EmoteId, type GameState, type QuickChatId, type RackShape, type Seat, type TableId, otherSeat } from '@bp/shared';
import { button, fadeOut, h, typingInField } from './dom';
import { buildEmotes } from './emotes';
import { buildHud } from './hud';
import { buildLobby, buildMenu } from './menu';
import { buildCupPicker, buildRerackPicker } from './pickers';
import { injectStyles } from './styles';

export interface MenuHandlers {
  onCreate(p: { name: string; color: string; table: TableId }): void;
  onJoin(p: { name: string; color: string; code: string }): void;
}

export interface UI {
  /** Main menu: name + avatar color, Create room (pick table) / Join by code. `prefillCode` from ?room= link. */
  showMenu(handlers: MenuHandlers, prefillCode?: string): void;
  /** Waiting for the opponent: show the code and a copyable invite link. */
  showLobby(code: string, inviteUrl: string): void;
  /** In-game HUD: names/colors, cups left each side, whose turn, throws left, re-racks left. */
  showHud(): void;
  updateHud(state: GameState, mySeat: Seat): void;
  /**
   * Start-of-turn re-rack offer. `cupCount` (optional extra) sizes the preview diagrams; it defaults
   * to the opponent's cup count from the last `updateHud` state, or 6.
   */
  showRerackPicker(shapes: readonly RackShape[], reracksLeft: number, onPick: (shape: RackShape) => void, onSkip: () => void, cupCount?: number): void;
  hideRerackPicker(): void;
  /** Defender picks the extra cup after a bounce sink. `cups` are the defender's own cups (rack-local). */
  showCupPicker(cups: CupState[], onPick: (cupId: number) => void): void;
  hideCupPicker(): void;
  /** Register handlers for the local player's emote / quick-chat choices. */
  onEmote(cb: (emote: EmoteId) => void): void;
  onChat(cb: (msg: QuickChatId) => void): void;
  /** Display an emote or chat bubble from a seat (mine = local player). */
  showEmote(emote: EmoteId, mine: boolean): void;
  showChat(msg: QuickChatId, fromName: string, mine: boolean): void;
  /** Short status line ("Opponent disconnected", "Your turn"). */
  toast(text: string): void;
  showGameOver(won: boolean, onRematch: () => void): void;
  showError(message: string): void;
  hideAll(): void;

  // ---- Optional extras (safe to ignore) ----
  /** Called on every UI button press; wire to `audio.play('ui_click')`. */
  onUiSound?(cb: () => void): void;
  /** Shows a mute toggle in the HUD (also the M key); `cb` gets the new muted state. */
  setMuteHandler?(muted: boolean, cb: (muted: boolean) => void): void;
}

const TOAST_MS = 2600;
const ERROR_MS = 6000;

export function createUI(root: HTMLElement): UI {
  injectStyles();
  root.replaceChildren();

  const soundCbs: (() => void)[] = [];
  const click = () => {
    for (const cb of soundCbs) cb();
  };

  const hud = buildHud();
  const screenLayer = h('div.bp-layer.bp-screens');
  const pickerLayer = h('div.bp-layer.bp-pickers');
  const emotes = buildEmotes(click);
  const toasts = h('div.bp-toasts');
  const errors = h('div.bp-errors');
  const overlay = h('div.bp-layer.bp-overlay', null, toasts, errors);
  const muteBtn = h('button.bp-mute', { type: 'button', title: 'Mute (M)', 'aria-label': 'Mute' });
  muteBtn.hidden = true;
  hud.el.append(muteBtn);
  emotes.layer.append(emotes.dock);
  hud.el.hidden = true;
  emotes.setEnabled(false);
  root.append(hud.el, screenLayer, pickerLayer, emotes.layer, overlay);

  let lastState: GameState | null = null;
  let lastSeat: Seat = 0;
  let rerack: HTMLElement | null = null;
  let cupPicker: HTMLElement | null = null;

  // Mute toggle.
  let muted = false;
  let muteCb: ((m: boolean) => void) | null = null;
  const renderMute = () => {
    muteBtn.textContent = muted ? '🔇' : '🔊';
    muteBtn.title = muted ? 'Unmute (M)' : 'Mute (M)';
  };
  const toggleMute = () => {
    if (!muteCb) return;
    muted = !muted;
    renderMute();
    muteCb(muted);
  };
  muteBtn.addEventListener('click', toggleMute);
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'm' && !e.repeat && !typingInField() && !hud.el.hidden && !e.ctrlKey && !e.metaKey) toggleMute();
  });

  const clearScreen = () => screenLayer.replaceChildren();
  const hideRerack = () => {
    rerack?.remove();
    rerack = null;
  };
  const hideCups = () => {
    cupPicker?.remove();
    cupPicker = null;
  };

  const ui: UI = {
    showMenu(handlers, prefillCode) {
      ui.hideAll();
      screenLayer.append(buildMenu(handlers, prefillCode, click));
    },

    showLobby(code, inviteUrl) {
      ui.hideAll();
      screenLayer.append(buildLobby(code, inviteUrl, click));
    },

    showHud() {
      clearScreen();
      hud.el.hidden = false;
      emotes.setEnabled(true);
    },

    updateHud(state, mySeat) {
      lastState = state;
      lastSeat = mySeat;
      hud.update(state, mySeat);
    },

    showRerackPicker(shapes, reracksLeft, onPick, onSkip, cupCount) {
      hideRerack();
      const count = cupCount ?? lastState?.sides[otherSeat(lastSeat)].length ?? 6;
      rerack = buildRerackPicker(shapes, reracksLeft, Math.max(1, count), onPick, onSkip, click);
      pickerLayer.append(rerack);
    },
    hideRerackPicker: hideRerack,

    showCupPicker(cups, onPick) {
      hideCups();
      cupPicker = buildCupPicker(cups, onPick, click);
      pickerLayer.append(cupPicker);
    },
    hideCupPicker: hideCups,

    onEmote: (cb) => emotes.onEmote(cb),
    onChat: (cb) => emotes.onChat(cb),
    showEmote: (e, mine) => emotes.showEmote(e, mine),
    showChat: (m, from, mine) => emotes.showChat(m, from, mine),

    toast(text) {
      const t = h('div.bp-toast', null, text);
      toasts.append(t);
      while (toasts.children.length > 3) toasts.firstElementChild?.remove();
      setTimeout(() => fadeOut(t, 300), TOAST_MS);
    },

    showGameOver(won, onRematch) {
      hideRerack();
      hideCups();
      emotes.closeAll();
      clearScreen();
      const rematch = button('Rematch', 'bp-primary bp-big', () => {
        click();
        rematch.disabled = true;
        rematch.textContent = 'Waiting for opponent…';
        onRematch();
      });
      const panel = h('div.bp-panel.bp-gameover', null,
        h(`div.bp-banner.${won ? 'bp-win' : 'bp-lose'}`, null, won ? 'YOU WIN!' : 'YOU LOSE'),
        h('p.bp-subtitle', null, won ? 'Cups cleared. Absolute legend.' : 'Drink up. Run it back?'),
        rematch,
      );
      const screen = h('div.bp-screen.bp-clear', null, panel);
      if (won) {
        const confetti = h('div.bp-confetti');
        const colors = ['#ffb238', '#ff6b3d', '#e63946', '#4cd18a', '#457b9d', '#fff7ec'];
        for (let i = 0; i < 40; i++) {
          const c = h('i');
          c.style.left = `${Math.random() * 100}%`;
          c.style.background = colors[i % colors.length]!;
          c.style.animationDuration = `${2.5 + Math.random() * 2.5}s`;
          c.style.animationDelay = `${-Math.random() * 4}s`;
          confetti.append(c);
        }
        screen.prepend(confetti);
      }
      screenLayer.append(screen);
    },

    showError(message) {
      const close = button('OK', '', () => {
        click();
        fadeOut(el, 300);
      });
      const el = h('div.bp-error.bp-interactive', { role: 'alert' }, h('span', null, message), close);
      errors.append(el);
      while (errors.children.length > 2) errors.firstElementChild?.remove();
      setTimeout(() => fadeOut(el, 300), ERROR_MS);
    },

    hideAll() {
      clearScreen();
      hideRerack();
      hideCups();
      hud.el.hidden = true;
      emotes.setEnabled(false);
      emotes.clearBubbles();
    },

    onUiSound(cb) {
      soundCbs.push(cb);
    },

    setMuteHandler(m, cb) {
      muted = m;
      muteCb = cb;
      muteBtn.hidden = false;
      renderMute();
    },
  };
  return ui;
}
