// Renders each table from fixed camera angles to shots/<table>-<cam>.png.
// Usage: npm run shots [-- --table basement] [-- --cam player]
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const TABLES = ['basement', 'backyard'];
const CAMS = ['player', 'opponent', 'overview', 'cups'];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const pick = (flag: string, all: string[]) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? [args[i + 1]!] : all;
};

const outDir = path.join(root, 'shots');
await mkdir(outDir, { recursive: true });

const server = await createServer({ root: path.join(root, 'client'), configFile: path.join(root, 'client/vite.config.ts'), server: { port: 5199, strictPort: false } });
await server.listen();
const url = server.resolvedUrls?.local[0] ?? 'http://localhost:5199/';

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error('[page error]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text()); });

const files: string[] = [];
for (const table of pick('--table', TABLES)) {
  for (const cam of pick('--cam', CAMS)) {
    await page.goto(`${url}?shot=${table}&cam=${cam}`);
    await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 60_000 });
    const file = path.join(outDir, `${table}-${cam}.png`);
    await page.screenshot({ path: file });
    files.push(file);
  }
}

await browser.close();
await server.close();
console.log(files.join('\n'));
