// All UI CSS, injected once into <head>. Scoped under #ui / .bp-*.

export const CSS = /* css */ `
:root {
  --bp-font-display: 'Lilita One', 'Arial Rounded MT Bold', 'Trebuchet MS', system-ui, sans-serif;
  --bp-font: 'Nunito', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --bp-accent: #ffb238;
  --bp-accent-2: #ff6b3d;
  --bp-accent-ink: #3a1d00;
  --bp-red: #e63946;
  --bp-green: #4cd18a;
  --bp-ink: #fff7ec;
  --bp-ink-dim: rgba(255, 247, 236, 0.66);
  --bp-panel: rgba(22, 16, 24, 0.78);
  --bp-panel-solid: rgba(28, 20, 30, 0.92);
  --bp-line: rgba(255, 255, 255, 0.12);
  --bp-radius: 18px;
  --bp-shadow: 0 10px 30px rgba(0, 0, 0, 0.45), 0 2px 0 rgba(255, 255, 255, 0.05) inset;
}

#ui { font-family: var(--bp-font); color: var(--bp-ink); user-select: none; -webkit-user-select: none; }
#ui * { box-sizing: border-box; }
#ui [hidden] { display: none !important; }
#ui .bp-layer { position: absolute; inset: 0; pointer-events: none; }
#ui .bp-panel, #ui button, #ui input, #ui .bp-interactive { pointer-events: auto; }

#ui .bp-panel {
  background: var(--bp-panel);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--bp-line);
  border-radius: var(--bp-radius);
  box-shadow: var(--bp-shadow);
}

#ui h1, #ui h2, #ui h3, #ui .bp-display { font-family: var(--bp-font-display); font-weight: 400; letter-spacing: 0.02em; margin: 0; }

/* ---------- buttons + inputs ---------- */
#ui button {
  font-family: var(--bp-font-display);
  font-size: 18px;
  letter-spacing: 0.03em;
  color: var(--bp-ink);
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.14);
  border-radius: 14px;
  padding: 10px 18px;
  cursor: pointer;
  transition: transform 0.08s ease, background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
#ui button:hover { background: rgba(255, 255, 255, 0.18); }
#ui button:active { transform: translateY(2px) scale(0.98); }
#ui button:disabled { opacity: 0.4; cursor: default; transform: none; }
#ui button:focus-visible, #ui input:focus-visible { outline: 3px solid var(--bp-accent); outline-offset: 2px; }
#ui button.bp-primary {
  background: linear-gradient(180deg, var(--bp-accent), var(--bp-accent-2));
  color: var(--bp-accent-ink);
  border-color: rgba(0, 0, 0, 0.12);
  box-shadow: 0 4px 0 #b4421d, 0 8px 18px rgba(255, 120, 40, 0.35);
}
#ui button.bp-primary:hover { filter: brightness(1.06); }
#ui button.bp-primary:active { box-shadow: 0 2px 0 #b4421d, 0 4px 10px rgba(255, 120, 40, 0.3); }
#ui button.bp-big { font-size: 24px; padding: 14px 26px; border-radius: 16px; }

#ui input.bp-input {
  font-family: var(--bp-font);
  font-weight: 800;
  font-size: 20px;
  color: var(--bp-ink);
  background: rgba(0, 0, 0, 0.35);
  border: 2px solid rgba(255, 255, 255, 0.14);
  border-radius: 12px;
  padding: 10px 14px;
  width: 100%;
  outline: none;
  user-select: text;
}
#ui input.bp-input:focus { border-color: var(--bp-accent); }
#ui input.bp-input::placeholder { color: rgba(255, 255, 255, 0.35); }
#ui input.bp-invalid { border-color: var(--bp-red); animation: bp-shake 0.35s; }
#ui .bp-label { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: var(--bp-ink-dim); margin: 0 0 8px; }

/* ---------- full-screen screens (menu / lobby / game over) ---------- */
#ui .bp-screen {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
  pointer-events: auto;
  background: radial-gradient(ellipse at center, rgba(10, 6, 12, 0.35), rgba(10, 6, 12, 0.78));
  animation: bp-fade-in 0.25s ease;
}
#ui .bp-screen.bp-clear { background: radial-gradient(ellipse at center, rgba(10, 6, 12, 0.1), rgba(10, 6, 12, 0.55)); }

#ui .bp-menu { width: min(860px, 100%); padding: 28px 32px 30px; max-height: calc(100vh - 32px); overflow: auto; }
#ui .bp-title {
  font-family: var(--bp-font-display);
  font-size: clamp(44px, 7vw, 76px);
  line-height: 0.95;
  text-align: center;
  color: var(--bp-accent);
  text-shadow: 0 4px 0 #b4421d, 0 10px 30px rgba(255, 120, 40, 0.35);
  margin: 0 0 4px;
  transform: rotate(-2deg);
}
#ui .bp-title span { color: var(--bp-ink); text-shadow: 0 4px 0 #8a2f2f, 0 10px 30px rgba(0,0,0,0.4); }
#ui .bp-subtitle { text-align: center; color: var(--bp-ink-dim); font-weight: 700; margin: 0 0 22px; }

#ui .bp-row { display: flex; gap: 16px; align-items: flex-end; flex-wrap: wrap; }
#ui .bp-field { flex: 1 1 260px; min-width: 0; }
#ui .bp-swatches { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; min-height: 48px; }
#ui .bp-swatch {
  width: 38px; height: 38px; padding: 0; border-radius: 50%;
  border: 3px solid rgba(0,0,0,0.25);
  box-shadow: 0 3px 0 rgba(0,0,0,0.35);
}
#ui .bp-swatch:hover { transform: translateY(-2px); background: inherit; }
#ui .bp-swatch.bp-selected { border-color: #fff; box-shadow: 0 0 0 3px var(--bp-accent), 0 3px 0 rgba(0,0,0,0.35); transform: scale(1.08); }

#ui .bp-columns { display: grid; grid-template-columns: 1.35fr 1fr; gap: 18px; margin-top: 22px; }
@media (max-width: 720px) { #ui .bp-columns { grid-template-columns: 1fr; } }
#ui .bp-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--bp-line);
  border-radius: 16px;
  padding: 18px;
  display: flex; flex-direction: column; gap: 14px;
}
#ui .bp-card h2 { font-size: 26px; }
#ui .bp-card.bp-highlight { border-color: var(--bp-accent); box-shadow: 0 0 0 2px rgba(255, 178, 56, 0.35) inset; }
#ui .bp-tables { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
#ui .bp-table-card {
  text-align: left; padding: 0; overflow: hidden;
  font-family: var(--bp-font); font-size: 15px; font-weight: 800;
  border-radius: 14px; border: 3px solid transparent;
  background: rgba(0,0,0,0.3);
}
#ui .bp-table-card .bp-thumb { height: 74px; position: relative; }
#ui .bp-table-card .bp-thumb::after {
  content: ''; position: absolute; left: 18%; right: 18%; bottom: 14px; height: 12px; border-radius: 3px;
  background: var(--bp-table-color, #6b4a2b); box-shadow: 0 6px 0 rgba(0,0,0,0.25);
}
#ui .bp-table-card .bp-name { display: block; padding: 8px 10px 10px; }
#ui .bp-table-card:hover { background: rgba(0,0,0,0.3); border-color: rgba(255,255,255,0.3); }
#ui .bp-table-card.bp-selected { border-color: var(--bp-accent); box-shadow: 0 0 18px rgba(255, 178, 56, 0.35); }
#ui .bp-thumb-basement {
  background:
    radial-gradient(circle at 15% 22%, #ffd27a 0 3px, transparent 4px),
    radial-gradient(circle at 35% 14%, #ff9f5a 0 3px, transparent 4px),
    radial-gradient(circle at 55% 22%, #ffd27a 0 3px, transparent 4px),
    radial-gradient(circle at 75% 14%, #ff9f5a 0 3px, transparent 4px),
    radial-gradient(circle at 92% 22%, #ffd27a 0 3px, transparent 4px),
    linear-gradient(180deg, #3b2230, #24151d);
  --bp-table-color: #7a4f2c;
}
#ui .bp-thumb-backyard {
  background:
    radial-gradient(circle at 78% 70%, #ffe08a 0 14px, rgba(255, 190, 90, 0.5) 15px, transparent 34px),
    linear-gradient(180deg, #4b5fa8 0%, #e9826b 55%, #ffb36b 72%, #3f7a3a 72%, #2f5f2c 100%);
  --bp-table-color: #d9d4c7;
}
#ui .bp-code-input { font-family: var(--bp-font-display); font-size: 34px; letter-spacing: 0.35em; text-align: center; text-transform: uppercase; padding: 8px 0 8px 0.35em; }
#ui .bp-hint { font-size: 13px; color: var(--bp-ink-dim); font-weight: 700; margin: 0; }
#ui .bp-error-inline { color: #ff8f8f; font-weight: 800; font-size: 14px; min-height: 18px; margin: 0; }

/* ---------- lobby ---------- */
#ui .bp-lobby { width: min(520px, 100%); padding: 28px; text-align: center; display: flex; flex-direction: column; gap: 16px; }
#ui .bp-room-code {
  font-family: var(--bp-font-display); font-size: clamp(64px, 12vw, 104px); line-height: 1;
  letter-spacing: 0.12em; padding-left: 0.12em; color: var(--bp-accent);
  text-shadow: 0 5px 0 #b4421d, 0 12px 36px rgba(255, 120, 40, 0.35);
  user-select: text; -webkit-user-select: text;
}
#ui .bp-invite { display: flex; gap: 8px; }
#ui .bp-invite input { font-size: 14px; font-weight: 700; padding: 10px 12px; }
#ui .bp-waiting { font-weight: 800; font-size: 18px; color: var(--bp-ink-dim); display: flex; align-items: center; justify-content: center; gap: 10px; }
#ui .bp-dots span { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--bp-accent); margin: 0 3px; animation: bp-bounce 1.2s infinite ease-in-out; }
#ui .bp-dots span:nth-child(2) { animation-delay: 0.15s; }
#ui .bp-dots span:nth-child(3) { animation-delay: 0.3s; }

/* ---------- HUD ---------- */
#ui .bp-hud-top { position: absolute; top: 14px; left: 14px; right: 14px; display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; pointer-events: none; }
#ui .bp-player {
  display: flex; align-items: center; gap: 12px; padding: 10px 14px; min-width: 210px;
  pointer-events: none;
}
#ui .bp-player.bp-right { flex-direction: row-reverse; text-align: right; }
#ui .bp-player.bp-active { border-color: var(--bp-accent); box-shadow: 0 0 0 2px rgba(255, 178, 56, 0.4), var(--bp-shadow); }
#ui .bp-dot { width: 18px; height: 18px; border-radius: 50%; flex: none; border: 2px solid rgba(255,255,255,0.8); box-shadow: 0 2px 0 rgba(0,0,0,0.3); }
#ui .bp-pinfo { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
#ui .bp-pname { font-family: var(--bp-font-display); font-size: 20px; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px; display: flex; gap: 6px; align-items: center; }
#ui .bp-right .bp-pname { justify-content: flex-end; }
#ui .bp-you { font-family: var(--bp-font); font-size: 11px; font-weight: 900; background: var(--bp-accent); color: var(--bp-accent-ink); padding: 1px 6px; border-radius: 6px; letter-spacing: 0.06em; }
#ui .bp-cups { font-weight: 800; font-size: 14px; color: var(--bp-ink-dim); }
#ui .bp-cups b { color: var(--bp-ink); font-size: 18px; }
#ui .bp-offline { color: #ff8f8f; font-weight: 900; font-size: 12px; }
#ui .bp-mini-rack { flex: none; }

#ui .bp-turn {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 10px 22px 12px; min-width: 220px; pointer-events: none;
}
#ui .bp-turn-label { font-family: var(--bp-font-display); font-size: 26px; line-height: 1; }
#ui .bp-turn.bp-mine .bp-turn-label { color: var(--bp-accent); }
#ui .bp-turn-sub { display: flex; gap: 14px; align-items: center; font-weight: 800; font-size: 13px; color: var(--bp-ink-dim); }
#ui .bp-balls { display: flex; gap: 5px; }
#ui .bp-ball { width: 16px; height: 16px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fff 0 30%, #e9e4da 60%, #b9b2a5); box-shadow: 0 2px 0 rgba(0,0,0,0.35); }
#ui .bp-ball.bp-used { opacity: 0.18; }
#ui .bp-rerack-pips { display: inline-flex; gap: 3px; vertical-align: middle; margin-left: 4px; }
#ui .bp-rerack-pips i { width: 10px; height: 10px; border-radius: 3px; background: var(--bp-accent); display: inline-block; }
#ui .bp-rerack-pips i.bp-used { background: rgba(255,255,255,0.18); }

#ui .bp-dock { position: absolute; left: 14px; bottom: 14px; display: flex; gap: 8px; pointer-events: none; }
#ui .bp-dock button { font-size: 16px; padding: 9px 14px; display: flex; align-items: center; gap: 8px; background: var(--bp-panel); backdrop-filter: blur(8px); }
#ui .bp-key { font-family: var(--bp-font); font-weight: 900; font-size: 11px; padding: 2px 6px; border-radius: 6px; background: rgba(255,255,255,0.16); color: var(--bp-ink); }
#ui .bp-mute { position: absolute; right: 14px; bottom: 14px; width: 44px; height: 44px; padding: 0; font-size: 20px; background: var(--bp-panel); }

/* ---------- emote wheel ---------- */
#ui .bp-wheel-wrap { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: auto; background: radial-gradient(circle at center, rgba(0,0,0,0.25), transparent 340px); animation: bp-fade-in 0.12s ease; }
#ui .bp-wheel { position: relative; width: 300px; height: 300px; border-radius: 50%; }
#ui .bp-wheel-seg {
  position: absolute; width: 112px; height: 112px; margin: -56px 0 0 -56px; border-radius: 50%;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  font-size: 17px; padding: 0;
  background: var(--bp-panel-solid); border: 3px solid rgba(255,255,255,0.15);
  box-shadow: var(--bp-shadow);
}
#ui .bp-wheel-seg .bp-emoji { font-size: 40px; line-height: 1; }
#ui .bp-wheel-seg.bp-hot { background: linear-gradient(180deg, var(--bp-accent), var(--bp-accent-2)); color: var(--bp-accent-ink); border-color: #fff; transform: scale(1.1); }
#ui .bp-wheel-center { position: absolute; left: 50%; top: 50%; width: 70px; height: 70px; margin: -35px 0 0 -35px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 900; text-align: center; color: var(--bp-ink-dim); background: rgba(0,0,0,0.45); border: 2px dashed rgba(255,255,255,0.2); }

#ui .bp-chat-list { position: absolute; left: 14px; bottom: 68px; padding: 10px; display: flex; flex-direction: column; gap: 6px; min-width: 220px; animation: bp-pop 0.15s ease; }
#ui .bp-chat-list button { text-align: left; font-family: var(--bp-font); font-weight: 800; font-size: 16px; padding: 8px 12px; display: flex; gap: 10px; align-items: center; }

/* ---------- bubbles + toasts ---------- */
#ui .bp-bubbles-them { position: absolute; top: 110px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: none; }
#ui .bp-bubbles-me { position: absolute; left: 14px; bottom: 70px; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; pointer-events: none; }
#ui .bp-bubble {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 18px; border-radius: 22px;
  background: #fff7ec; color: #2a1a10;
  font-family: var(--bp-font-display); font-size: 26px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4), 0 3px 0 rgba(0,0,0,0.2);
  animation: bp-pop 0.25s cubic-bezier(.2,1.6,.4,1);
  transition: opacity 0.4s ease, transform 0.4s ease;
  position: relative;
}
#ui .bp-bubble::after { content: ''; position: absolute; left: 50%; top: -9px; margin-left: -9px; border: 9px solid transparent; border-top: 0; border-bottom-color: #fff7ec; }
#ui .bp-bubbles-them .bp-bubble + .bp-bubble::after, #ui .bp-bubbles-me .bp-bubble:not(:last-child)::after { display: none; }
#ui .bp-bubble .bp-emoji { font-size: 36px; line-height: 1; }
#ui .bp-bubble .bp-from { font-family: var(--bp-font); font-weight: 900; font-size: 12px; color: rgba(42,26,16,0.6); text-transform: uppercase; letter-spacing: 0.08em; display: block; }
#ui .bp-bubble.bp-small { font-size: 16px; padding: 6px 12px; border-radius: 14px; background: rgba(255,247,236,0.92); }
#ui .bp-bubble.bp-small .bp-emoji { font-size: 22px; }
#ui .bp-bubble.bp-small::after { left: 22px; top: auto; bottom: -8px; border: 8px solid transparent; border-bottom: 0; border-top-color: rgba(255,247,236,0.92); }

#ui .bp-toasts { position: absolute; top: 104px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 6px; pointer-events: none; }
#ui .bp-toast { padding: 8px 16px; border-radius: 999px; font-weight: 800; font-size: 15px; background: var(--bp-panel-solid); border: 1px solid var(--bp-line); box-shadow: var(--bp-shadow); animation: bp-pop 0.2s ease; transition: opacity 0.3s ease, transform 0.3s ease; white-space: nowrap; }
#ui .bp-errors { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; gap: 8px; align-items: center; z-index: 20; pointer-events: none; }
#ui .bp-error { display: flex; align-items: center; gap: 12px; padding: 10px 10px 10px 16px; border-radius: 14px; background: rgba(120, 18, 30, 0.92); border: 2px solid #ff6b6b; font-weight: 800; box-shadow: var(--bp-shadow); animation: bp-pop 0.2s ease; max-width: min(560px, calc(100vw - 28px)); transition: opacity 0.3s ease; }
#ui .bp-error button { font-size: 14px; padding: 6px 12px; }

/* ---------- pickers (bottom dock, keeps the center clear) ---------- */
#ui .bp-picker {
  position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%);
  padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; align-items: center;
  max-width: calc(100vw - 28px);
  animation: bp-slide-up 0.25s cubic-bezier(.2,1.3,.4,1);
}
#ui .bp-picker h2 { font-size: 24px; text-align: center; }
#ui .bp-picker .bp-hint { text-align: center; }
#ui .bp-shapes { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
#ui .bp-shape {
  display: flex; flex-direction: column; align-items: center; gap: 4px; width: 112px; padding: 10px 6px 8px;
  font-size: 16px; background: rgba(255,255,255,0.06);
}
#ui .bp-shape:hover { border-color: var(--bp-accent); background: rgba(255,178,56,0.12); }
#ui .bp-shape svg { display: block; }
#ui .bp-picker-foot { display: flex; gap: 12px; align-items: center; }
#ui .bp-cup-picker { bottom: 16px; }
#ui .bp-cup-picker svg .bp-cup-hit { cursor: pointer; }
#ui .bp-cup-picker svg .bp-cup-hit:hover .bp-cup-body { fill: #ff8a3d; }
#ui .bp-cup-picker svg .bp-cup-hit:hover .bp-cup-x { opacity: 1; }
#ui .bp-cup-picker svg .bp-cup-x { opacity: 0; transition: opacity 0.1s; pointer-events: none; }
#ui .bp-badge { font-family: var(--bp-font-display); background: var(--bp-accent); color: var(--bp-accent-ink); border-radius: 10px; padding: 2px 10px; font-size: 18px; transform: rotate(-3deg); display: inline-block; }

/* ---------- game over ---------- */
#ui .bp-gameover { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 18px; padding: 30px 46px; }
#ui .bp-banner { font-family: var(--bp-font-display); font-size: clamp(64px, 11vw, 120px); line-height: 0.95; transform: rotate(-3deg); }
#ui .bp-banner.bp-win { color: var(--bp-accent); text-shadow: 0 6px 0 #b4421d, 0 16px 50px rgba(255, 150, 40, 0.55); }
#ui .bp-banner.bp-lose { color: #9fb3d9; text-shadow: 0 6px 0 #2f3b5c, 0 16px 40px rgba(0,0,0,0.5); }
#ui .bp-confetti { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
#ui .bp-confetti i { position: absolute; top: -20px; width: 10px; height: 16px; border-radius: 2px; animation: bp-fall linear infinite; opacity: 0.9; }

#ui .bp-out { opacity: 0 !important; transform: translateY(-6px) scale(0.96) !important; }
#ui .bp-bubbles-them .bp-out, #ui .bp-toasts .bp-out { transform: translateY(-10px) scale(0.96) !important; }

@keyframes bp-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes bp-pop { from { opacity: 0; transform: scale(0.7); } to { opacity: 1; transform: scale(1); } }
@keyframes bp-slide-up { from { opacity: 0; transform: translate(-50%, 30px); } to { opacity: 1; transform: translate(-50%, 0); } }
@keyframes bp-bounce { 0%, 80%, 100% { transform: translateY(0); opacity: 0.5; } 40% { transform: translateY(-8px); opacity: 1; } }
@keyframes bp-shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }
@keyframes bp-fall { to { transform: translateY(110vh) rotate(720deg); } }
@media (prefers-reduced-motion: reduce) { #ui *, #ui *::before, #ui *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition: none !important; } }
`;

let injected = false;
export function injectStyles() {
  if (injected || document.getElementById('bp-ui-styles')) return;
  injected = true;
  const style = document.createElement('style');
  style.id = 'bp-ui-styles';
  style.textContent = CSS;
  document.head.append(style);
}
