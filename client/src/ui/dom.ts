// Tiny DOM helpers for the UI (no framework).

type Attrs = Record<string, string | number | boolean | undefined | null>;
type Child = Node | string | null | undefined | false;

/** `h('div.panel.big', { title: 'x' }, child, 'text')` */
export function h<K extends keyof HTMLElementTagNameMap>(sel: K | `${K}.${string}`, attrs?: Attrs | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const [tag, ...classes] = sel.split('.') as [K, ...string[]];
  const el = document.createElement(tag);
  if (classes.length) el.className = classes.join(' ');
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'text') el.textContent = String(v);
      else if (k === 'class') el.className += ` ${String(v)}`;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(el: Element, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c);
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (SVGElement | null)[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    el.setAttribute(k, String(v));
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

export function button(label: string, cls: string, onClick: (ev: MouseEvent) => void, attrs?: Attrs): HTMLButtonElement {
  const b = h('button', { type: 'button', class: cls, ...attrs }, label);
  b.addEventListener('click', onClick);
  return b;
}

export function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode etc. */
  }
}

/** True when keyboard focus is in a text field (so hotkeys should be ignored). */
export function typingInField(): boolean {
  const a = document.activeElement;
  return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || (a as HTMLElement).isContentEditable);
}

/** Fade an element out and remove it. */
export function fadeOut(el: HTMLElement, ms = 300) {
  el.classList.add('bp-out');
  setTimeout(() => el.remove(), ms);
}
