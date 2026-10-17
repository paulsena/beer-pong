// Re-rack picker and bounce cup picker. Both dock at the bottom so the center stays clear.
import { type CupState, RACK_SHAPE_NAMES, type RackShape, RULES, rackLayout } from '@bp/shared';
import { button, h } from './dom';
import { rackBounds, rackDiagram } from './rack';

export function buildRerackPicker(
  shapes: readonly RackShape[],
  reracksLeft: number,
  cupCount: number,
  onPick: (shape: RackShape) => void,
  onSkip: () => void,
  click: () => void,
): HTMLElement {
  // Same scale for every shape: use one bounds size, centered on each shape.
  const layouts = shapes.map((shape) => rackLayout(shape, cupCount));
  const all = layouts.map(rackBounds);
  const w = Math.max(...all.map((b) => b.maxX - b.minX));
  const d = Math.max(...all.map((b) => b.maxD - b.minD));
  const cards = shapes.map((shape, i) => {
    const sb = all[i]!;
    const cx = (sb.minX + sb.maxX) / 2;
    const cd = (sb.minD + sb.maxD) / 2;
    const bounds = { minX: cx - w / 2, maxX: cx + w / 2, minD: cd - d / 2, maxD: cd + d / 2 };
    const diagram = rackDiagram(layouts[i]!, { width: 92, height: 92, view: 'attacker', bounds });
    const b = button('', 'bp-shape', () => {
      click();
      onPick(shape);
    }, { title: `Re-rack into a ${RACK_SHAPE_NAMES[shape].toLowerCase()}` });
    b.append(diagram, h('span', null, RACK_SHAPE_NAMES[shape]));
    b.disabled = reracksLeft <= 0;
    return b;
  });
  const skip = button('Skip', 'bp-primary', () => {
    click();
    onSkip();
  });
  const pips = h('span.bp-rerack-pips', null, ...Array.from({ length: RULES.reracksPerGame }, (_, i) => h(`i${i < reracksLeft ? '' : '.bp-used'}`)));
  return h('div.bp-panel.bp-picker.bp-rerack-picker', null,
    h('h2', null, 'Re-rack their cups?'),
    h('div.bp-shapes', null, ...cards),
    h('div.bp-picker-foot', null,
      h('span.bp-hint', null, `${reracksLeft} re-rack${reracksLeft === 1 ? '' : 's'} left this game `, pips),
      skip,
    ),
  );
}

export function buildCupPicker(cups: CupState[], onPick: (cupId: number) => void, click: () => void): HTMLElement {
  let done = false;
  const diagram = rackDiagram(cups, {
    width: 300,
    height: 230,
    view: 'defender',
    table: true,
    ids: cups.map((c) => c.id),
    onPick: (id) => {
      if (done) return;
      done = true;
      click();
      onPick(id);
    },
  });
  return h('div.bp-panel.bp-picker.bp-cup-picker', null,
    h('h2', null, h('span.bp-badge', null, 'Bounce!'), ' Pick a second cup to remove'),
    diagram,
    h('p.bp-hint', null, 'Your cups, seen from your end of the table. Click one to remove it.'),
  );
}
