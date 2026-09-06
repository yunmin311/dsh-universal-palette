import { chromium, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// README screenshot capture against a real, clean demo DSH profile.
// All content is neutral demo seed text; no credentials, usernames, or
// private paths appear. The UI is the real Universal Palette on real DSH.
const logPath = process.argv[2];
const outDir = 'docs/assets/readme';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1792, height: 896 } });
const dialog = page => page.getByRole('dialog', { name: /^(通用面板|Universal Palette)$/ });
async function open(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    for (const name of ['继续', '稍后配置', 'Continue', 'Configure later']) if (await page.getByRole('button', { name, exact: true }).isVisible().catch(() => false)) {
      await page.getByRole('button', { name, exact: true }).click();
      await page.waitForTimeout(400);
    }
    await page.keyboard.press('Control+Shift+K');
    try { await expect(dialog(page)).toBeVisible({ timeout: 2500 }); await page.waitForTimeout(900); return; } catch { /* onboarding may steal the press */ }
  }
  await expect(dialog(page)).toBeVisible();
  await page.waitForTimeout(900);
}
async function close(page) { await page.keyboard.press('Escape'); await expect(dialog(page)).toHaveCount(0); }
async function query(page, text) { await page.getByRole('combobox').fill(text); await page.waitForTimeout(950); }
async function shot(page, name) {
  await page.mouse.move(1700, 700);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log('saved', name);
}
async function connect() {
  const page = await context.newPage();
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
  for (const name of ['继续', '稍后配置', 'Continue', 'Configure later']) if (await page.getByRole('button', { name, exact: true }).isVisible().catch(() => false)) {
    await page.getByRole('button', { name, exact: true }).click();
    await page.waitForTimeout(400);
  }
  await page.evaluate(() => window.__paletteTest.locale.setLocale('en'));
  return page;
}

const page = await connect();
console.log('head', execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim());

// 1. no-session cold start guidance.
await page.evaluate(() => window.__paletteTest.sessions.clear());
await open(page);
await expect(dialog(page)).toContainText(/Select a workspace|选择工作区/);
await shot(page, 'no-session');
await close(page);

// Create a neutral workspace + session, seed one real history phrase.
await page.evaluate(async () => {
  const c = window.__paletteTest;
  let workspace = c.workspaces.list.getSnapshot().items[0];
  if (!workspace) {
    const created = await c.workspaces.create({ path: 'C:\\dsh-demo\\palette-demo' });
    workspace = (created && created.workspaceId) ? created : c.workspaces.list.getSnapshot().items[0];
  }
  const id = await c.sessions.create({ workspaceId: workspace.workspaceId });
  c.sessions.open(id);
  await c.sessions.refresh();
});
await page.waitForTimeout(800);
const composer = page.getByRole('textbox').last();
await composer.click();
await composer.fill('Cobalt river dashboard: metrics row spacing, empty-state copy, and export flow notes for the quarterly design review.');
await composer.press('Enter');
await page.waitForTimeout(2500);
// The seeded turn records a local MISSING_CREDENTIAL node in this
// credential-free demo profile; history search only needs the message.
// Hero uses a clean empty session instead.
await setTheme('Dark');
await page.evaluate(async () => {
  const c = window.__paletteTest;
  const ws = c.workspaces.list.getSnapshot().items[0];
  const id = await c.sessions.create({ workspaceId: ws.workspaceId });
  c.sessions.open(id);
  await c.sessions.refresh();
});
await page.waitForTimeout(800);
await open(page);
await query(page, '');
await shot(page, 'hero');
await close(page);

// 2. command search.
await open(page);
await query(page, 'goal');
await expect(page.locator('[data-kind=command]').filter({ hasText: '/goal' })).toBeVisible();
await shot(page, 'command-search');
await close(page);

// 3. conversation hit.
await open(page);
await query(page, 'cobalt river');
await expect(page.locator('[data-kind=conversation-hit]').first()).toBeVisible({ timeout: 5000 });
await shot(page, 'conversation-hit');
await close(page);

// 4. interop command (third-party host command discovered with zero adapter).
await open(page);
await query(page, 'unarchive');
await expect(page.locator('[data-kind=command]').filter({ hasText: '/unarchive' })).toBeVisible();
await shot(page, 'interop-command');
await close(page);

// 5. light theme inheritance.
await page.evaluate(() => window.__paletteTest.locale.setLocale('en'));
async function setTheme(label) {
  const settings = page.getByRole('button', { name: /^(设置|Settings)$/, exact: true }).last();
  await settings.click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: label, exact: true }).last().click();
  await page.waitForTimeout(400);
  const closeBtn = page.getByRole('button', { name: /^(关闭|Close)$/, exact: true }).last();
  await closeBtn.click().catch(async () => { await page.keyboard.press('Escape'); });
  await page.waitForTimeout(400);
}
await setTheme('Dark');
await open(page);
await query(page, '');
await shot(page, 'hero-dark');
await close(page);
await setTheme('Light');
await open(page);
await query(page, '');
await shot(page, 'light-theme');
await close(page);
await setTheme('Dark');

await browser.close();
console.log('done');
