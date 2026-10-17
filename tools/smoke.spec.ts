// 2-tab smoke test: create + join a room through the menu, make scripted throws, and check that
// cup and turn state stay in sync on both clients. Needs the dev servers (started by the config).
import { test, expect, type Page } from '@playwright/test';

interface Snapshot {
  phase: string;
  turn: number;
  throwId: number;
  cups: [number, number];
}

const snapshot = (page: Page) =>
  page.evaluate((): Snapshot | null => {
    const s = window.__bp?.game?.currentState;
    return s ? { phase: s.phase, turn: s.turn, throwId: s.throwId, cups: [s.sides[0].length, s.sides[1].length] } : null;
  });

async function waitFor(page: Page, pred: (s: Snapshot) => boolean, what: string) {
  await expect.poll(async () => {
    const s = await snapshot(page);
    return s !== null && pred(s);
  }, { message: what, timeout: 60_000 }).toBe(true);
}

test('two players create, join, and stay in sync', async ({ browser }) => {
  const host = await (await browser.newContext()).newPage();
  const guest = await (await browser.newContext()).newPage();
  for (const p of [host, guest]) p.on('pageerror', (e) => console.error(`[pageerror] ${e.message}`));

  await host.goto('/');
  await host.getByPlaceholder('Your name').fill('Alice');
  await host.getByRole('button', { name: 'Create room' }).click();
  await expect.poll(() => host.evaluate(() => window.__bp?.code ?? null), { timeout: 20_000 }).not.toBeNull();
  const code = (await host.evaluate(() => window.__bp!.code))!;
  await expect(host.getByText(code).first()).toBeVisible();

  await guest.goto(`/?room=${code}`);
  await guest.getByPlaceholder('Your name').fill('Bob');
  await guest.getByPlaceholder('CODE').fill(code);
  await guest.getByRole('button', { name: 'Join', exact: true }).click();

  for (const p of [host, guest]) await waitFor(p, (s) => s.phase === 'playing' && s.turn === 0, 'game starts');
  expect(await host.evaluate(() => window.__bp!.seat)).toBe(0);
  expect(await guest.evaluate(() => window.__bp!.seat)).toBe(1);

  // Throw 1: host sinks the apex cup of the guest's rack.
  expect(await host.evaluate(() => window.__bp!.game!.scriptedThrow(9))).toBe(true);
  for (const p of [host, guest]) await waitFor(p, (s) => s.throwId === 1 && s.cups[1] === 9, 'sink syncs');

  // Throw 2: host misses wide, so the turn passes to the guest on both clients.
  await expect.poll(() => host.evaluate(() => window.__bp!.game!.scriptedThrow(0, true)), { timeout: 30_000 }).toBe(true);
  for (const p of [host, guest]) await waitFor(p, (s) => s.throwId === 2 && s.turn === 1 && s.cups[1] === 9 && s.cups[0] === 10, 'turn passes');

  // Guest's throw sinks one of the host's cups.
  await expect.poll(() => guest.evaluate(() => window.__bp!.game!.scriptedThrow(9)), { timeout: 30_000 }).toBe(true);
  for (const p of [host, guest]) await waitFor(p, (s) => s.throwId === 3 && s.cups[0] === 9, 'guest sink syncs');
});
