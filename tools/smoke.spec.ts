// 2-tab smoke test: create + join a room, scripted throw, check cup/turn sync.
// Filled in during Step 3 once the menu/net/game wiring exists.
import { test, expect } from '@playwright/test';

test('client loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#game')).toBeVisible();
});
