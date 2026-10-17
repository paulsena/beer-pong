// Shared dimensions, rack layouts and tuning. All lengths in meters, masses in kg.
//
// World frame: origin at the center of the table top surface, +Y up, table long axis on Z.
// Seat 0 stands at +Z and throws toward -Z; seat 1 stands at -Z and throws toward +Z.
// sides[s] in GameState are the cups that seat s DEFENDS (the cups at seat s's end).

export type Seat = 0 | 1;
export const SEATS: readonly Seat[] = [0, 1];
export const otherSeat = (s: Seat): Seat => (s === 0 ? 1 : 0);

export type TableId = 'basement' | 'backyard';
export const TABLE_IDS: readonly TableId[] = ['basement', 'backyard'];
export const TABLE_NAMES: Record<TableId, string> = {
  basement: 'Frat Basement',
  backyard: 'Backyard at Sunset',
};

// --- Table (regulation 8ft x 2ft, 27.5in high) ---
export const TABLE = {
  length: 2.44,
  width: 0.61,
  height: 0.74, // floor to top surface
  thickness: 0.04,
  /** Gap between the table end and the back row of the rack. */
  rackMargin: 0.06,
} as const;

// --- Cups (16oz party cup) ---
export const CUP = {
  topRadius: 0.0475,
  bottomRadius: 0.03,
  height: 0.12,
  wallThickness: 0.002,
  /** Beer fill height from the cup bottom. */
  liquidHeight: 0.055,
  /** Center-to-center spacing in a rack (cups touching at the rim). */
  spacing: 0.095,
  segments: 24,
} as const;
export const CUPS_PER_SIDE = 10;

// --- Ball (40mm ping pong ball) ---
export const BALL = {
  radius: 0.02,
  mass: 0.0027,
  restitution: 0.85,
  friction: 0.2,
  linearDamping: 0.05,
  angularDamping: 0.3,
} as const;

// --- Physics + throw tuning ---
export const PHYSICS = {
  gravity: -9.81,
  fixedDt: 1 / 120,
  tableRestitution: 0.75,
  tableFriction: 0.4,
  cupRestitution: 0.3,
  cupFriction: 0.5,
  /** A throw ends as a miss when the ball goes below this Y (table top is 0). */
  missBelowY: -TABLE.height + 0.05,
  /** ...or after this many seconds in flight. */
  maxFlightSeconds: 6,
  /** Ball counts as sunk once its center is this far below the cup rim, inside the cup radius. */
  sinkDepth: 0.04,
} as const;

export const THROW = {
  /** Release-speed mapping from mouse flick to ball speed (m/s). */
  minSpeed: 2.0,
  maxSpeed: 6.5,
  /** Random aim wobble, radians (1 sigma). */
  wobble: 0.012,
  /** Ball release point relative to the thrower's eye. */
  releaseOffset: { x: 0, y: -0.15, z: -0.35 },
} as const;

/** Thrower eye position for seat 0 (mirror Z for seat 1). */
export const EYE = { x: 0, y: 0.95, z: TABLE.length / 2 + 0.45 } as const;

// --- Rules ---
export const RULES = {
  throwsPerTurn: 2,
  reracksPerGame: 2,
  bounceCupValue: 2,
  /** Seconds a room is kept for a disconnected player to rejoin. */
  rejoinGraceSeconds: 60,
} as const;

// --- Networking ---
export const NET = {
  defaultPort: 8787,
  ballStateHz: 30,
  roomCodeLength: 4,
  /** Alphabet without ambiguous characters (0/O, 1/I/L). */
  roomCodeAlphabet: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789',
  maxNameLength: 16,
} as const;

// --- Racks ---
// Rack-local cup coordinates: x = lateral offset (meters, + is seat 0's right),
// d = distance from the table end toward the center (meters).

export interface RackPos {
  x: number;
  d: number;
}

export interface CupState extends RackPos {
  /** Stable cup id per side, 0..9. Survives re-racks. */
  id: number;
}

export type RackShape = 'triangle' | 'diamond' | 'line' | 'zipper';
export const RERACK_SHAPES: readonly RackShape[] = ['diamond', 'line', 'triangle', 'zipper'];
export const RACK_SHAPE_NAMES: Record<RackShape, string> = {
  triangle: 'Triangle',
  diamond: 'Diamond',
  line: 'Line',
  zipper: 'Zipper',
};

const ROW_STEP = CUP.spacing * Math.sqrt(3) / 2;
const BACK_ROW_D = TABLE.rackMargin + CUP.topRadius;

/** Rows of cups, listed from the back (table end) toward the apex, laid out on a hex grid. */
function fromRows(rows: number[], rowStep: number): RackPos[] {
  const out: RackPos[] = [];
  rows.forEach((count, r) => {
    for (let i = 0; i < count; i++) {
      out.push({ x: (i - (count - 1) / 2) * CUP.spacing, d: BACK_ROW_D + r * rowStep });
    }
  });
  return out;
}

/**
 * Cup positions for a shape with `count` cups. Order is deterministic: back row first, left to
 * right. Re-racks assign the surviving cup ids (ascending) to these positions in order.
 */
export function rackLayout(shape: RackShape, count: number): RackPos[] {
  if (count <= 0) return [];
  switch (shape) {
    case 'triangle': {
      // Rows k, k-1, ..., 1 from the back; a partial count shortens the back row.
      let k = 1;
      while ((k * (k + 1)) / 2 < count) k++;
      const rows = Array.from({ length: k }, (_, i) => k - i);
      rows[0] = k - ((k * (k + 1)) / 2 - count);
      return fromRows(rows, ROW_STEP);
    }
    case 'diamond': {
      // 1, 2, 2, ..., 1 (4 cups = classic diamond).
      const rows = [1];
      let remaining = count - 1;
      while (remaining >= 2) {
        rows.push(2);
        remaining -= 2;
      }
      if (remaining === 1) rows.push(1);
      return fromRows(rows, ROW_STEP);
    }
    case 'line':
      return Array.from({ length: count }, (_, i) => ({ x: 0, d: BACK_ROW_D + i * CUP.spacing }));
    case 'zipper':
      // Two staggered columns, offset half a cup in d.
      return Array.from({ length: count }, (_, i) => ({
        x: (i % 2 === 0 ? -0.5 : 0.5) * CUP.spacing,
        d: BACK_ROW_D + i * (CUP.spacing / 2) * Math.sqrt(3),
      }));
  }
}

/** The starting 4-3-2-1 rack with ids 0..9. */
export function initialRack(): CupState[] {
  return rackLayout('triangle', CUPS_PER_SIDE).map((p, id) => ({ id, ...p }));
}

/** World position of a cup's bottom center (on the table surface) for the side that defends it. */
export function cupWorldPosition(side: Seat, cup: RackPos): { x: number; y: number; z: number } {
  const sign = side === 0 ? 1 : -1;
  return { x: cup.x * sign, y: 0, z: sign * (TABLE.length / 2 - cup.d) };
}

/** Eye position for a seat. */
export function eyePosition(seat: Seat): { x: number; y: number; z: number } {
  return { x: EYE.x, y: EYE.y, z: seat === 0 ? EYE.z : -EYE.z };
}

// --- Social ---
export type EmoteId = 'cheer' | 'taunt' | 'facepalm' | 'nice';
export const EMOTES: readonly EmoteId[] = ['cheer', 'taunt', 'facepalm', 'nice'];
export const EMOTE_LABELS: Record<EmoteId, string> = {
  cheer: 'Cheer',
  taunt: 'Taunt',
  facepalm: 'Facepalm',
  nice: 'NICE',
};

export const QUICK_CHAT = [
  'Good luck!',
  'Nice shot!',
  'So close!',
  'Drink up!',
  'Lucky...',
  'GG',
] as const;
export type QuickChatId = number; // index into QUICK_CHAT

export const AVATAR_COLORS = [
  '#e63946', '#f4a261', '#e9c46a', '#2a9d8f', '#457b9d', '#8e7dbe', '#ff70a6', '#3a3a3a',
] as const;
