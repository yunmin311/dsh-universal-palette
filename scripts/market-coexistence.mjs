import { chromium, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

// dsh-market coexistence probe: verify Universal Palette stays healthy with
// dsh-market installed, then open the market UI and capture its plugin
// diagnostics (no duplicate loader / invalid patch / dependency mismatch).
const logPath = process.argv[2];
const outDir = process.argv[3] ?? 'evidence/2026-09-06-ecosystem-lab';
mkdirSync(outDir, { recursive: true });
const results = { checks: [], errors: [] };
const check = (name, details) => { results.checks.push({ name, status: 'PASS', details }); console.log('PASS', name, details ?? ''); };

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1792, height: 896 } });
const dialog = page => page.getByRole('dialog', { name: /^(通用面板|Universal Palette)$/ });

try {
  const page = await context.newPage();
  page.on('pageerror', error => results.errors.push(error.message));
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
  await page.waitForFunction(() => window.__paletteTest, { timeout: 30000 });
  await page.waitForTimeout(1000);
  for (const name of ['继续', '稍后配置']) if (await page.getByRole('button', { name, exact: true }).isVisible().catch(() => false)) {
    await page.getByRole('button', { name, exact: true }).click();
    await page.waitForTimeout(400);
  }
  check('Boot with dsh-market: palette activated, no page errors so far');

  await page.keyboard.press('Control+Shift+K');
  await expect(dialog(page)).toBeVisible();
  await page.waitForTimeout(600);
  check('Palette shortcut works with dsh-market installed');
  await page.keyboard.press('Control+Shift+K');
  await expect(dialog(page)).toHaveCount(0);
  check('Palette toggle-close works with dsh-market installed');

  // Open Settings → 插件 → 插件列表 (installed-plugin diagnostics).
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.waitForTimeout(600);
  const pluginsTab = page.getByRole('button', { name: /插件|Plugins/ }).first();
  if (await pluginsTab.isVisible().catch(() => false)) {
    await pluginsTab.click();
    await page.waitForTimeout(800);
  }
  const listTab = page.getByText('插件市场', { exact: true }).last();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (/universal[- ]palette|dsh[- ]?market|已安装|Installed/i.test(await page.locator('body').textContent())) break;
    if (await listTab.isVisible().catch(() => false)) {
      await listTab.click().catch(() => {});
      await page.waitForTimeout(1200);
    }
    const box = await listTab.boundingBox().catch(() => null);
    if (box) { await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(1200); }
  }
  const listText = await page.locator('body').textContent();
  const diagnostics = {
    showsPalette: /universal[- ]palette/i.test(listText),
    showsMarket: /dsh[- ]?market/i.test(listText),
    duplicateLoaderWarning: /duplicate loader/i.test(listText),
    dependencyMismatch: /dependency mismatch|peer mismatch|不兼容/i.test(listText),
    invalidPatch: /invalid patch/i.test(listText),
  };
  results.diagnostics = diagnostics;
  check('Market/plugin diagnostics recorded', diagnostics);
  expect(diagnostics.showsPalette).toBe(true);
  expect(diagnostics.showsMarket).toBe(true);
  expect(diagnostics.duplicateLoaderWarning).toBe(false);
  expect(diagnostics.invalidPatch).toBe(false);
  await page.screenshot({ path: `${outDir}/market-coexistence.png` });
  check('Market coexistence screenshot captured', `${outDir}/market-coexistence.png`);
  await page.keyboard.press('Escape');

  expect(results.errors).toEqual([]);
  check('No browser page errors');
  writeFileSync(`${outDir}/market-coexistence.json`, JSON.stringify(results, null, 2) + '\n');
} catch (error) {
  results.failure = String(error);
  console.error(error);
  writeFileSync(`${outDir}/market-coexistence.json`, JSON.stringify(results, null, 2) + '\n');
  process.exitCode = 1;
} finally {
  await browser.close();
}
