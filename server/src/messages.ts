import { EMOTES, QUICK_CHAT, RERACK_SHAPES, TABLE_IDS, type ClientMessage } from '@bp/shared';

const integer = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const vector = (v: unknown, size: number) => Array.isArray(v) && v.length === size && v.every(n => typeof n === 'number' && Number.isFinite(n));
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const member = (values: readonly unknown[], v: unknown) => values.includes(v);
const player = (v: Record<string, unknown>) => typeof v.name === 'string' && v.name.trim().length > 0 && typeof v.color === 'string' && /^#[0-9a-f]{6}$/i.test(v.color);

/** JSON is untrusted even when the caller is a typed client. */
export function parseMessage(raw: string): ClientMessage | null {
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return null; }
  if (!record(v)) return null;
  let valid = false;
  switch (v.t) {
    case 'create_room': valid = player(v) && member(TABLE_IDS, v.table); break;
    case 'join_room': valid = player(v) && typeof v.code === 'string'; break;
    case 'rejoin': valid = typeof v.code === 'string' && typeof v.token === 'string'; break;
    case 'rerack': valid = member(RERACK_SHAPES, v.shape); break;
    case 'throw_start': valid = integer(v.throwId) && vector(v.p, 3) && vector(v.v, 3); break;
    case 'ball': {
      const s = v.sample;
      valid = record(s) && integer(s.throwId) && typeof s.t === 'number' && Number.isFinite(s.t) && s.t >= 0 && vector(s.p, 3) && vector(s.q, 4) && typeof s.bounced === 'boolean';
      break;
    }
    case 'throw_result': {
      const r = v.result;
      valid = integer(v.throwId) && record(r) && (r.kind === 'miss' || r.kind === 'swatted' || (r.kind === 'sink' && integer(r.cupId) && typeof r.bounced === 'boolean'));
      break;
    }
    case 'swat': valid = integer(v.throwId); break;
    case 'pick_cup': valid = integer(v.cupId); break;
    case 'emote': valid = member(EMOTES, v.emote); break;
    case 'chat': valid = integer(v.msg) && v.msg < QUICK_CHAT.length; break;
    case 'rematch': valid = true; break;
    case 'ping': valid = typeof v.n === 'number' && Number.isFinite(v.n); break;
  }
  return valid ? v as ClientMessage : null;
}
