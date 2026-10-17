// Top-down SVG rack diagrams (HUD minis, re-rack previews, cup picker).
import { CUP, type RackPos, TABLE } from '@bp/shared';
import { svg } from './dom';

export interface RackDiagramOpts {
  width: number;
  height: number;
  /**
   * 'attacker': seen by the thrower looking down the table at the opponent's rack
   *   (table end at the top, apex pointing down at you, defender's right on your left).
   * 'defender': seen by the defender standing behind their own rack
   *   (table end at the bottom, apex pointing away/up).
   */
  view: 'attacker' | 'defender';
  /** Fixed world bounds (rack-local meters) so cups don't rescale as they disappear. */
  bounds?: { minX: number; maxX: number; minD: number; maxD: number };
  /** Draw the table end edge and side rails. */
  table?: boolean;
  /** Cup ids parallel to `cups`, required when `onPick` is set. */
  ids?: number[];
  onPick?: (id: number) => void;
  cupColor?: string;
}

const R = CUP.topRadius;

export function rackBounds(cups: RackPos[]) {
  if (cups.length === 0) return { minX: -R, maxX: R, minD: 0, maxD: 2 * R };
  let minX = Infinity, maxX = -Infinity, minD = Infinity, maxD = -Infinity;
  for (const c of cups) {
    minX = Math.min(minX, c.x - R);
    maxX = Math.max(maxX, c.x + R);
    minD = Math.min(minD, c.d - R);
    maxD = Math.max(maxD, c.d + R);
  }
  return { minX, maxX, minD, maxD };
}

export function rackDiagram(cups: RackPos[], o: RackDiagramOpts): SVGSVGElement {
  const b = o.bounds ?? rackBounds(cups);
  const pad = R * 0.6;
  const minX = Math.min(b.minX, o.table ? -TABLE.width / 2 : b.minX) - pad;
  const maxX = Math.max(b.maxX, o.table ? TABLE.width / 2 : b.maxX) + pad;
  const minD = (o.table ? 0 : b.minD) - pad;
  const maxD = b.maxD + pad;
  const bw = maxX - minX;
  const bh = maxD - minD;
  const s = Math.min(o.width / bw, o.height / bh);
  const ox = (o.width - bw * s) / 2;
  const oy = (o.height - bh * s) / 2;
  const cx = (x: number) => {
    const sx = o.view === 'attacker' ? -x : x;
    return ox + (sx - minX) * s;
  };
  const cy = (d: number) => (o.view === 'attacker' ? oy + (d - minD) * s : o.height - oy - (d - minD) * s);

  const root = svg('svg', { width: o.width, height: o.height, viewBox: `0 0 ${o.width} ${o.height}`, class: 'bp-rack' });
  if (o.table) {
    const x0 = cx(-TABLE.width / 2);
    const x1 = cx(TABLE.width / 2);
    const yEnd = cy(0);
    const yFar = o.view === 'attacker' ? o.height : 0;
    root.append(
      svg('rect', {
        x: Math.min(x0, x1), y: Math.min(yEnd, yFar), width: Math.abs(x1 - x0), height: Math.abs(yFar - yEnd),
        rx: 4, fill: 'rgba(255,255,255,0.05)', stroke: 'rgba(255,255,255,0.22)', 'stroke-width': 2,
      }),
      svg('line', { x1: x0, x2: x1, y1: yEnd, y2: yEnd, stroke: 'rgba(255,255,255,0.5)', 'stroke-width': 3, 'stroke-linecap': 'round' }),
    );
  }
  const rr = R * s;
  const color = o.cupColor ?? '#e63946';
  cups.forEach((c, i) => {
    const x = cx(c.x);
    const y = cy(c.d);
    const g = svg('g', { class: o.onPick ? 'bp-cup-hit' : 'bp-cup' });
    // drop shadow, body, rim, beer
    g.append(
      svg('circle', { cx: x, cy: y + Math.max(1, rr * 0.12), r: rr * 0.96, fill: 'rgba(0,0,0,0.35)' }),
      svg('circle', { class: 'bp-cup-body', cx: x, cy: y, r: rr * 0.94, fill: color, stroke: '#fff4ea', 'stroke-width': Math.max(1, rr * 0.16) }),
      svg('circle', { cx: x, cy: y, r: rr * 0.58, fill: '#f2b33d', opacity: 0.9 }),
      svg('circle', { cx: x - rr * 0.18, cy: y - rr * 0.18, r: rr * 0.18, fill: 'rgba(255,255,255,0.55)' }),
    );
    if (o.onPick && o.ids) {
      const id = o.ids[i]!;
      const k = rr * 0.42;
      g.append(
        svg('path', {
          class: 'bp-cup-x', d: `M${x - k} ${y - k}L${x + k} ${y + k}M${x + k} ${y - k}L${x - k} ${y + k}`,
          stroke: '#fff', 'stroke-width': Math.max(2, rr * 0.22), 'stroke-linecap': 'round',
        }),
      );
      const title = svg('title');
      title.textContent = `Remove cup ${id + 1}`;
      g.append(title);
      g.addEventListener('click', () => o.onPick!(id));
    }
    root.append(g);
  });
  return root;
}
