import { chromium, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

// Visual regression: open/close the Palette across four real DSH states and
// record viewport geometry consistency. No CSS is changed in this pass.
const logPath = process.argv[2];
const outDir = 'evidence/2026-09-06-visual-polish';
mkdirSync(outDir, { recursive: true });
const results = { dsh: '0.1.2-rc.1', states: {}, errors: [] };
const dialog = page => page.getByRole('dialog', { name: /^(通用面板|Universal Palette)$/ });

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1792, height: 896 } });
async function measure(page, label) {
  await page.keyboard.press('Control+Shift+K');
  await expect(dialog(page)).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(900);
  const box = await dialog(page).boundingBox();
  const pointer = await dialog(page).evaluate(e => ({ root: getComputedStyle(e.parentElement).pointerEvents, surface: getComputedStyle(e).pointerEvents }));
  const composer = await page.getByRole('textbox').last().boundingBox();
  const scroll = await page.evaluate(() => {
    const scrollers = [...document.querySelectorAll('*')].filter(el => el.scrollHeight > el.clientHeight + 40 && el.clientHeight > 200);
    return scrollers.map(el => ({ cls: el.className.slice(0, 30), top: Math.round(el.scrollTop), sh: el.scrollHeight, ch: el.clientHeight })).slice(0, 4);
  });
  results.states[label] = { x: box.x, y: box.y, width: box.width, height: Math.round(box.height), pointer, composerY: composer ? Math.round(composer.y) : null, overlapsComposer: box.y + box.height > (composer?.y ?? Infinity), scrollAtOpen: scroll };
  await page.screenshot({ path: `${outDir}/${label}.png` });
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  console.log(label, JSON.stringify(results.states[label]));
}
async function dismiss(page) {
  for (const name of ['继续', '稍后配置', 'Continue', 'Configure later']) if (await page.getByRole('button', { name, exact: true }).isVisible().catch(() => false)) {
    await page.getByRole('button', { name, exact: true }).click();
    await page.waitForTimeout(400);
  }
}
try {
  const page = await context.newPage();
  page.on('pageerror', e => results.errors.push(e.message));
  await page.addInitScript(() => {
    let facade;
    Object.defineProperty(window, '__ModuleLoader__', { configurable: true, get: () => facade, set(value) {
      const wrap = original => function (registration) {
        if (registration.id === '@yunmin311/dsh-universal-palette') {
          const factory = registration.factory;
          registration = { ...registration, factory(require) {
            const plugin = factory(require);
            const apply = ctx => { window.__paletteTest = ctx; return plugin.apply(ctx); };
            return { ...plugin, apply, default: { ...plugin.default, apply } };
          } };
        }
        return original.call(this, registration);
      };
      value.load = wrap(value.load);
      facade = new Proxy(value, { set(t, k, v) { t[k] = k === 'load' ? wrap(v) : v; return true; } });
    } });
  });
  await page.goto(readFileSync(logPath, 'utf8').match(/http:\/\/\S+/)[0]);
  await page.waitForFunction(() => window.__paletteTest);
  await page.waitForTimeout(1000);
  await dismiss(page);
  await page.evaluate(() => window.__paletteTest.locale.setLocale('en'));

  // A: no workspace / no session.
  await page.evaluate(() => window.__paletteTest.sessions.clear());
  await page.waitForTimeout(400);
  await measure(page, 'A-no-session');

  // B: workspace + fresh empty session.
  await page.evaluate(async () => {
    const c = window.__paletteTest;
    let ws = c.workspaces.list.getSnapshot().items[0];
    if (!ws) {
      const created = await c.workspaces.create({ path: 'C:\\dsh-demo\\palette-demo' });
      ws = (created && created.workspaceId) ? created : c.workspaces.list.getSnapshot().items[0];
    }
    const id = await c.sessions.create({ workspaceId: ws.workspaceId });
    c.sessions.open(id);
    await c.sessions.refresh();
  });
  await page.waitForTimeout(700);
  await measure(page, 'B-empty-session');

  // C: first turn recorded (conversation expanded).
  const composer = page.getByRole('textbox').last();
  await composer.click();
  await composer.fill('Cobalt river dashboard: metrics row spacing and export flow notes.');
  await composer.press('Enter');
  await page.waitForTimeout(2500);
  await measure(page, 'C-first-turn');

  // D: long conversation scrolled to bottom.
  for (let i = 0; i < 6; i += 1) {
    await composer.click();
    await composer.fill(`Follow-up note ${i + 1}: keep the layout stable while the transcript grows long and scrolls.`);
    await composer.press('Enter');
    await page.waitForTimeout(1200);
  }
  await page.evaluate(() => {
    const scroller = [...document.querySelectorAll('*')].find(el => el.scrollHeight > el.clientHeight + 100 && el.clientHeight > 200);
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  });
  await page.waitForTimeout(400);
  await measure(page, 'D-long-scroll-bottom');

  // Pointer-through still works with content behind the palette.
  await page.keyboard.press('Control+Shift+K');
  await expect(dialog(page)).toBeVisible();
  const collapsible = page.getByRole('button', { name: /收起侧边栏|Collapse sidebar/i }).first();
  if (await collapsible.isVisible().catch(() => false)) {
    await collapsible.click();
    await page.waitForTimeout(600);
    const closed = (await dialog(page).count()) === 0;
    results.pointerThrough = closed;
    await expect(dialog(page)).toHaveCount(0);
  } else {
    results.pointerThrough = 'sidebar toggle not present in this build';
  }

  // Consistency verdict across states.
  const states = Object.values(results.states);
  const xs = new Set(states.map(s => Math.round(s.x)));
  const widths = new Set(states.map(s => Math.round(s.width)));
  results.consistency = { xUnique: [...xs], widthUnique: [...widths], yRange: [Math.min(...states.map(s => s.y)), Math.max(...states.map(s => s.y))], allOverlapComposer: states.every(s => s.overlapsComposer === false) };
  console.log('consistency', JSON.stringify(results.consistency));
  writeFileSync(`${outDir}/visual-states.json`, JSON.stringify(results, null, 2) + '\n');
  expect(results.errors).toEqual([]);
} catch (error) {
  results.failure = String(error);
  console.error(error);
  writeFileSync(`${outDir}/visual-states.json`, JSON.stringify(results, null, 2) + '\n');
  process.exitCode = 1;
} finally {
  await browser.close();
}
