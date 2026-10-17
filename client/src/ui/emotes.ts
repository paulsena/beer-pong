// Emote wheel (E), quick chat (T), and the emote/chat bubbles.
import { EMOTES, EMOTE_LABELS, type EmoteId, QUICK_CHAT, type QuickChatId } from '@bp/shared';
import { button, fadeOut, h, typingInField } from './dom';

export const EMOTE_ICONS: Record<EmoteId, string> = {
  cheer: '🎉',
  taunt: '😜',
  facepalm: '🤦',
  nice: '👍',
};

/** Hold longer than this and releasing the key picks the hovered emote. */
const HOLD_MS = 220;
const BUBBLE_MS = 2600;

export interface EmoteControls {
  dock: HTMLElement;
  layer: HTMLElement;
  setEnabled(on: boolean): void;
  openWheel(): void;
  openChat(): void;
  closeAll(): void;
  onEmote(cb: (e: EmoteId) => void): void;
  onChat(cb: (m: QuickChatId) => void): void;
  showEmote(e: EmoteId, mine: boolean): void;
  showChat(m: QuickChatId, fromName: string, mine: boolean): void;
  clearBubbles(): void;
}

export function buildEmotes(click: () => void): EmoteControls {
  const emoteCbs: ((e: EmoteId) => void)[] = [];
  const chatCbs: ((m: QuickChatId) => void)[] = [];
  let enabled = false;

  const layer = h('div.bp-layer.bp-emote-layer');
  const themBubbles = h('div.bp-bubbles-them');
  const meBubbles = h('div.bp-bubbles-me');
  layer.append(themBubbles, meBubbles);

  // Rate-limit so spamming E doesn't flood the opponent.
  let lastSent = 0;
  const canSend = () => {
    const now = performance.now();
    if (now - lastSent < 600) return false;
    lastSent = now;
    return true;
  };
  const fireEmote = (e: EmoteId) => {
    closeAll();
    if (!canSend()) return;
    click();
    for (const cb of emoteCbs) cb(e);
  };
  const fireChat = (m: QuickChatId) => {
    closeAll();
    if (!canSend()) return;
    click();
    for (const cb of chatCbs) cb(m);
  };

  // ---------- wheel ----------
  let wheel: HTMLElement | null = null;
  let segs: HTMLButtonElement[] = [];
  let hot = -1;
  let openedAt = 0;
  let heldKey = false;

  const setHot = (i: number) => {
    hot = i;
    segs.forEach((s, j) => s.classList.toggle('bp-hot', j === i));
  };

  function openWheel() {
    if (wheel) return;
    closeChat();
    const ring = h('div.bp-wheel');
    const radius = 104;
    segs = EMOTES.map((e, i) => {
      // Top, right, bottom, left.
      const a = -Math.PI / 2 + (i * Math.PI * 2) / EMOTES.length;
      const b = button('', 'bp-wheel-seg', () => fireEmote(e));
      b.append(h('span.bp-emoji', null, EMOTE_ICONS[e]), h('span', null, EMOTE_LABELS[e]), h('span.bp-key', null, String(i + 1)));
      b.style.left = `${150 + Math.cos(a) * radius}px`;
      b.style.top = `${150 + Math.sin(a) * radius}px`;
      b.addEventListener('mouseenter', () => setHot(i));
      ring.append(b);
      return b;
    });
    ring.append(h('div.bp-wheel-center', null, 'Emote'));
    wheel = h('div.bp-wheel-wrap', null, ring);
    wheel.addEventListener('mousedown', (ev) => {
      if (ev.target === wheel) closeAll();
    });
    wheel.addEventListener('mousemove', (ev) => {
      const r = ring.getBoundingClientRect();
      const dx = ev.clientX - (r.left + r.width / 2);
      const dy = ev.clientY - (r.top + r.height / 2);
      if (Math.hypot(dx, dy) < 36) return setHot(-1);
      const ang = Math.atan2(dy, dx) + Math.PI / 2; // 0 = up
      const n = EMOTES.length;
      setHot((Math.round((ang / (Math.PI * 2)) * n) + n) % n);
    });
    layer.append(wheel);
    openedAt = performance.now();
    setHot(-1);
  }

  function closeWheel() {
    wheel?.remove();
    wheel = null;
    segs = [];
    hot = -1;
  }

  // ---------- quick chat ----------
  let chat: HTMLElement | null = null;
  function openChat() {
    if (chat) return;
    closeWheel();
    chat = h('div.bp-panel.bp-chat-list', null,
      ...QUICK_CHAT.map((msg, i) => {
        const b = button('', '', () => fireChat(i));
        b.append(h('span.bp-key', null, String(i + 1)), msg);
        return b;
      }),
    );
    layer.append(chat);
  }
  function closeChat() {
    chat?.remove();
    chat = null;
  }

  function closeAll() {
    closeWheel();
    closeChat();
  }

  // ---------- dock ----------
  const emoteBtn = button('', '', () => {
    click();
    if (wheel) closeWheel();
    else openWheel();
  }, { title: 'Emote (hold E)' });
  emoteBtn.append(EMOTE_ICONS.cheer, ' Emote ', h('span.bp-key', null, 'E'));
  const chatBtn = button('', '', () => {
    click();
    if (chat) closeChat();
    else openChat();
  }, { title: 'Quick chat (T)' });
  chatBtn.append('💬 Chat ', h('span.bp-key', null, 'T'));
  const dock = h('div.bp-dock', null, emoteBtn, chatBtn);

  // ---------- hotkeys ----------
  window.addEventListener('keydown', (e) => {
    if (!enabled || typingInField() || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'e') {
      if (e.repeat) return;
      if (wheel) closeWheel();
      else {
        openWheel();
        heldKey = true;
      }
      e.preventDefault();
    } else if (k === 't') {
      if (e.repeat) return;
      if (chat) closeChat();
      else openChat();
      e.preventDefault();
    } else if (k === 'escape') {
      closeAll();
    } else if (/^[1-9]$/.test(k)) {
      const n = Number(k) - 1;
      if (wheel && n < EMOTES.length) fireEmote(EMOTES[n]!);
      else if (chat && n < QUICK_CHAT.length) fireChat(n);
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key.toLowerCase() !== 'e' || !heldKey) return;
    heldKey = false;
    // Tap: keep the wheel open (click or number to choose). Hold + release: pick the hovered one.
    if (wheel && performance.now() - openedAt > HOLD_MS) {
      if (hot >= 0) fireEmote(EMOTES[hot]!);
      else closeWheel();
    }
  });

  // ---------- bubbles ----------
  function bubble(container: HTMLElement, content: (Node | string)[], mine: boolean) {
    const b = h(`div.bp-bubble${mine ? '.bp-small' : ''}`, null, ...content);
    container.append(b);
    while (container.children.length > 3) container.firstElementChild?.remove();
    setTimeout(() => fadeOut(b, 400), BUBBLE_MS);
  }

  return {
    dock,
    layer,
    setEnabled(on) {
      enabled = on;
      dock.hidden = !on;
      if (!on) closeAll();
    },
    openWheel,
    openChat,
    closeAll,
    onEmote: (cb) => void emoteCbs.push(cb),
    onChat: (cb) => void chatCbs.push(cb),
    showEmote(e, mine) {
      bubble(mine ? meBubbles : themBubbles, [h('span.bp-emoji', null, EMOTE_ICONS[e]), EMOTE_LABELS[e]], mine);
    },
    showChat(m, fromName, mine) {
      const text = QUICK_CHAT[m] ?? '…';
      const body = mine ? [text] : [h('span', null, h('span.bp-from', null, fromName), text)];
      bubble(mine ? meBubbles : themBubbles, body, mine);
    },
    clearBubbles() {
      themBubbles.replaceChildren();
      meBubbles.replaceChildren();
    },
  };
}
