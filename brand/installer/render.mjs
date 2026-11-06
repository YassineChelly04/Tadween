// Renders brand/installer/art.html to the PNGs the installer bitmaps are made
// from. Needs Microsoft Edge (present on Windows) and playwright-core:
//   node brand/installer/render.mjs <path-to-playwright-core>
// then convert with brand/installer/to_bmp.py.
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(pathToFileURL(process.argv[2]).href);

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.join(here, 'art.html')).href);
await page.evaluate(() => document.fonts.ready);
for (const id of ['sidebar', 'header']) {
  await page.locator(`#${id}`).screenshot({ path: path.join(here, `${id}.png`) });
  console.log('rendered', id);
}
await browser.close();
