// DOM UI: menu, lobby, HUD, emote wheel, quick chat, re-rack picker, cup picker, game over. (Track E)
import type { CupState, EmoteId, GameState, QuickChatId, RackShape, Seat, TableId } from '@bp/shared';

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
  /** Start-of-turn re-rack offer. */
  showRerackPicker(shapes: readonly RackShape[], reracksLeft: number, onPick: (shape: RackShape) => void, onSkip: () => void): void;
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
}

export function createUI(_root: HTMLElement): UI {
  const noop = () => {};
  return {
    showMenu: noop, showLobby: noop, showHud: noop, updateHud: noop, showRerackPicker: noop, hideRerackPicker: noop,
    showCupPicker: noop, hideCupPicker: noop, onEmote: noop, onChat: noop, showEmote: noop, showChat: noop,
    toast: noop, showGameOver: noop, showError: noop, hideAll: noop,
  };
}
