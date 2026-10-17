// Main menu (name, avatar color, create/join) and lobby screens.
import { AVATAR_COLORS, NET, TABLE_IDS, TABLE_NAMES, type TableId } from '@bp/shared';
import type { MenuHandlers } from './index';
import { button, h, storageGet, storageSet } from './dom';

const KEY_NAME = 'bp.name';
const KEY_COLOR = 'bp.color';
const KEY_TABLE = 'bp.table';

const TABLE_BLURB: Record<TableId, string> = {
  basement: 'Sticky wood, string lights, red cups.',
  backyard: 'Golden hour on the grass.',
};

/** Keep only characters valid in a room code, uppercased. */
export function cleanCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, NET.roomCodeLength);
}

export function buildMenu(handlers: MenuHandlers, prefillCode: string | undefined, click: () => void): HTMLElement {
  let name = (storageGet(KEY_NAME) ?? '').slice(0, NET.maxNameLength);
  const storedColor = storageGet(KEY_COLOR);
  let color: string = storedColor && (AVATAR_COLORS as readonly string[]).includes(storedColor) ? storedColor : AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]!;
  const storedTable = storageGet(KEY_TABLE) as TableId | null;
  let table: TableId = storedTable && TABLE_IDS.includes(storedTable) ? storedTable : 'basement';

  // --- name + color ---
  const nameInput = h('input.bp-input', { type: 'text', maxlength: NET.maxNameLength, placeholder: 'Your name', autocomplete: 'nickname', spellcheck: 'false' });
  nameInput.value = name;
  const errorLine = h('p.bp-error-inline');
  nameInput.addEventListener('input', () => {
    name = nameInput.value;
    nameInput.classList.remove('bp-invalid');
    errorLine.textContent = '';
    storageSet(KEY_NAME, name.trim());
  });

  const swatches = h('div.bp-swatches', { role: 'radiogroup', 'aria-label': 'Avatar color' });
  const swatchEls: HTMLButtonElement[] = [];
  for (const c of AVATAR_COLORS) {
    const b = button('', 'bp-swatch', () => {
      click();
      color = c;
      storageSet(KEY_COLOR, c);
      for (const s of swatchEls) s.classList.toggle('bp-selected', s.dataset.color === c);
    }, { 'aria-label': `Color ${c}`, role: 'radio' });
    b.style.background = c;
    b.dataset.color = c;
    if (c === color) b.classList.add('bp-selected');
    swatchEls.push(b);
    swatches.append(b);
  }

  const validName = (): string | null => {
    const n = nameInput.value.trim().slice(0, NET.maxNameLength);
    if (!n) {
      nameInput.classList.remove('bp-invalid');
      void nameInput.offsetWidth; // restart the shake animation
      nameInput.classList.add('bp-invalid');
      errorLine.textContent = 'Pick a name first!';
      nameInput.focus();
      return null;
    }
    return n;
  };

  // --- create ---
  const tableCards: HTMLButtonElement[] = [];
  const tables = h('div.bp-tables', { role: 'radiogroup', 'aria-label': 'Table' });
  for (const id of TABLE_IDS) {
    const card = h('button.bp-table-card', { type: 'button', role: 'radio', title: TABLE_BLURB[id] },
      h(`div.bp-thumb.bp-thumb-${id}`),
      h('span.bp-name', null, TABLE_NAMES[id]),
    );
    card.dataset.table = id;
    if (id === table) card.classList.add('bp-selected');
    card.addEventListener('click', () => {
      click();
      table = id;
      storageSet(KEY_TABLE, id);
      for (const t of tableCards) t.classList.toggle('bp-selected', t.dataset.table === id);
    });
    tableCards.push(card);
    tables.append(card);
  }
  const createBtn = button('Create room', 'bp-primary bp-big', () => {
    click();
    const n = validName();
    if (!n) return;
    storageSet(KEY_NAME, n);
    handlers.onCreate({ name: n, color, table });
  });
  const practiceBtn = button('Practice solo', 'bp-practice', () => {
    click();
    storageSet(KEY_TABLE, table);
    handlers.onPractice?.(table);
  });
  const createCard = h('div.bp-card', null, h('h2', null, 'Create room'), h('p.bp-label', null, 'Pick a table'), tables, createBtn, practiceBtn);

  // --- join ---
  const codeInput = h('input.bp-input.bp-code-input', { type: 'text', maxlength: NET.roomCodeLength, placeholder: 'CODE', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Room code' });
  const joinBtn = button('Join', 'bp-big', () => doJoin());
  const syncJoin = () => {
    const ok = codeInput.value.length === NET.roomCodeLength;
    joinBtn.disabled = !ok;
    joinBtn.classList.toggle('bp-primary', ok);
  };
  codeInput.addEventListener('input', () => {
    const pos = codeInput.selectionStart;
    codeInput.value = cleanCode(codeInput.value);
    if (pos !== null) codeInput.setSelectionRange(pos, pos);
    syncJoin();
  });
  const doJoin = () => {
    click();
    const code = cleanCode(codeInput.value);
    if (code.length !== NET.roomCodeLength) {
      codeInput.classList.remove('bp-invalid');
      void codeInput.offsetWidth;
      codeInput.classList.add('bp-invalid');
      codeInput.focus();
      return;
    }
    const n = validName();
    if (!n) return;
    storageSet(KEY_NAME, n);
    handlers.onJoin({ name: n, color, code });
  };
  codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doJoin();
  });
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (prefillCode) doJoin();
      else createBtn.click();
    }
  });
  if (prefillCode) codeInput.value = cleanCode(prefillCode);
  syncJoin();
  const joinCard = h('div.bp-card', null,
    h('h2', null, 'Join by code'),
    h('p.bp-hint', null, prefillCode ? 'You were invited! Enter your name and hop in.' : 'Got a 4-letter code from a friend?'),
    codeInput,
    joinBtn,
  );
  if (prefillCode) joinCard.classList.add('bp-highlight');

  const panel = h('div.bp-panel.bp-menu', null,
    h('h1.bp-title', null, 'BEER ', h('span', null, 'PONG')),
    h('p.bp-subtitle', null, 'Flick. Bounce. Sink. Two players, one link.'),
    h('div.bp-row', null,
      h('div.bp-field', null, h('p.bp-label', null, 'Name'), nameInput),
      h('div', null, h('p.bp-label', null, 'Shirt color'), swatches),
    ),
    errorLine,
    h('div.bp-columns', null, createCard, joinCard),
  );
  const screen = h('div.bp-screen', null, panel);
  // Focus after mount.
  requestAnimationFrame(() => {
    if (!nameInput.value) nameInput.focus();
    else if (prefillCode) joinBtn.focus();
  });
  return screen;
}

export function buildLobby(code: string, inviteUrl: string, click: () => void): HTMLElement {
  const link = h('input.bp-input', { type: 'text', readonly: true, 'aria-label': 'Invite link' });
  link.value = inviteUrl;
  link.addEventListener('focus', () => link.select());
  const copyBtn = button('Copy link', 'bp-primary', async () => {
    click();
    let ok = false;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      ok = true;
    } catch {
      link.focus();
      link.select();
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
    }
    copyBtn.textContent = ok ? 'Copied!' : 'Press Ctrl+C';
    setTimeout(() => (copyBtn.textContent = 'Copy link'), 1800);
  });
  copyBtn.style.flex = 'none';
  const panel = h('div.bp-panel.bp-lobby', null,
    h('p.bp-label', null, 'Room code'),
    h('div.bp-room-code', null, code),
    h('p.bp-hint', null, 'Send this link to a friend:'),
    h('div.bp-invite', null, link, copyBtn),
    h('div.bp-waiting', null, h('span', null, 'Waiting for opponent'), h('span.bp-dots', null, h('span'), h('span'), h('span'))),
  );
  return h('div.bp-screen', null, panel);
}
