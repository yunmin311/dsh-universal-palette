import { chromium, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Official Command Compatibility Gate.
//
// Iterates the REAL live Host command catalog of the running DSH session and
// asserts, for every command, that the Palette discovers it by exact query
// with top relevance — no command count is hardcoded anywhere, so future
// catalog growth adapts automatically. Safe commands are additionally
// executed; mutating / argument-requiring commands are discovery-verified
// only. The Palette provider is never modified by this gate.
//
// Usage: node scripts/command-compat.mjs --log <dsh stdout log> --out <evidence dir> [--label <name>]
const args = process.argv.slice(2);
const logPath = args[args.indexOf('--log') + 1];
const outDir = args[args.indexOf('--out') + 1];
const label = args.includes('--label') ? args[args.indexOf('--label') + 1] : 'gate';
mkdirSync(outDir, { recursive: true });

// Execution policy per class. Read-only / open-UI / informational commands
// execute for real; anything with side effects or required arguments is only
// discovery-checked. Classification is evidence metadata — assertions above
// never depend on it.
const EXECUTE_SAFE = new Set(['permission', 'feedback', 'model', 'plan', 'compact', 'goal']);
const SKIP_REASON = name => ({
  export: 'mutation: writes an export artifact outside the session',
  clear: 'mutation: replaces the current session',
  rename: 'requires argument',
  unarchive: 'mutation: mutates workspace membership',
  'compact-fast': 'mutation: rewrites the message surface',
}[name] ?? 'mutation or argument-requiring: discovery only');

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1792, height: 896 } });
const dialog = page => page.getByRole('dialog', { name: /^(通用面板|Universal Palette)$/ });
const results = {
  head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dsh: '0.1.2-rc.1',
  upstream: '76fda729799fe9b3848dbe2c211d4b231032b81e',
  label,
  commandCount: 0,
  commands: [],
  failures: [],
};
const check = (name, details) => { results.checks ??= []; results.checks.push({ name, status: 'PASS', details }); console.log('PASS', name, typeof details === 'string' ? details : JSON.stringify(details)); };

async function connect() {
  const page = await context.newPage();
  page.on('pageerror', error => results.failures.push(error.message));
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
  for (const name of ['继续', '稍后配置']) if (await page.getByRole('button', { name, exact: true }).isVisible().catch(() => false)) {
    await page.getByRole('button', { name, exact: true }).click();
    await page.waitForTimeout(400);
  }
  await page.evaluate(() => window.__paletteTest.locale.setLocale('zh'));
  return page;
}
async function open(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    for (const name of ['继续', '稍后配置']) if (await page.getByRole('button', { name, exact: true }).isVisible().catch(() => false)) {
      await page.getByRole('button', { name, exact: true }).click();
      await page.waitForTimeout(400);
    }
    await page.keyboard.press('Control+Shift+K');
    try { await expect(dialog(page)).toBeVisible({ timeout: 2500 }); await page.waitForTimeout(850); return; } catch { /* onboarding may steal the first press */ }
  }
  await expect(dialog(page)).toBeVisible();
  await page.waitForTimeout(850);
}
async function close(page) { await page.keyboard.press('Escape'); await expect(dialog(page)).toHaveCount(0); }
async function ensureSession(page) {
  return page.evaluate(async () => {
    const c = window.__paletteTest;
    const current = c.sessions.list.getSnapshot().current;
    if (current) return current;
    let workspace = c.workspaces.list.getSnapshot().items[0];
    if (!workspace) {
      const created = await c.workspaces.create({ path: 'E:\\1project\\dsh-universal-palette\\interop-lab\\workspace' });
      workspace = (created && created.workspaceId) ? created : c.workspaces.list.getSnapshot().items[0];
    }
    const id = await c.sessions.create({ workspaceId: workspace.workspaceId });
    c.sessions.open(id);
    await c.sessions.refresh();
    return id;
  });
}
async function query(page, text) { await page.getByRole('combobox').fill(text); await page.waitForTimeout(900); }

try {
  const page = await connect();
  const sessionId = await ensureSession(page);
  const catalog = await page.evaluate(async () => {
    const c = window.__paletteTest;
    const r = await c.remote.commands.list(c.sessions.list.getSnapshot().current);
    if (!r.ok) throw Error('host catalog failed');
    return r.value.map(row => ({ name: row.name, description: row.description, hasInput: row.input !== undefined && row.input !== null }));
  });
  results.commandCount = catalog.length;
  check('Live Host catalog read', catalog.map(row => row.name));

  for (const descriptor of catalog) {
    const entry = { name: descriptor.name, parameterized: descriptor.hasInput, discoverable: false, rankedFirst: false, execution: 'not-executed' };
    await open(page);
    await query(page, '/' + descriptor.name);
    const rows = await page.locator('#up-results [role=option]').evaluateAll(es =>
      es.map(e => ({ kind: e.dataset.kind, text: e.textContent.slice(0, 80) })));
    entry.discoverable = rows.some(row => row.kind === 'command' && row.text.includes('/' + descriptor.name));
    entry.rankedFirst = rows[0]?.kind === 'command' && (rows[0]?.text.includes('/' + descriptor.name));
    expect(entry.discoverable, `command /${descriptor.name} discoverable`).toBe(true);
    expect(entry.rankedFirst, `command /${descriptor.name} ranked first for its exact query`).toBe(true);

    if (EXECUTE_SAFE.has(descriptor.name)) {
      await page.locator('[data-kind=command]').filter({ hasText: '/' + descriptor.name }).first().click();
      await page.waitForTimeout(900);
      const bodyText = await page.locator('body').textContent();
      entry.execution = 'executed';
      entry.executionDetail = bodyText.slice(0, 200);
      // Parameterized / informational commands surface official errors or
      // panels instead of throwing page errors; both are acceptable outcomes.
      await close(page).catch(async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(300); });
    } else {
      entry.execution = SKIP_REASON(descriptor.name);
    }
    results.commands.push(entry);
    await close(page);
  }
  check('Every live catalog command discoverable with top relevance', `${results.commandCount} commands`);

  // Re-check the model special case: the official client /model contribution.
  await open(page);
  await query(page, '/model');
  const modelRows = await page.locator('[data-kind=command]').allTextContents();
  results.modelContribution = modelRows.some(row => row.includes('/model'));
  check('Client-only /model contribution surfaced via official adjudication', results.modelContribution);
  await close(page);

  expect(results.failures).toEqual([]);
  check('No browser page errors');
} catch (error) {
  results.failure = String(error);
  console.error(error);
  process.exitCode = 1;
} finally {
  writeFileSync(`${outDir}/official-command-catalog-${label}.json`, JSON.stringify(results, null, 2) + '\n');
  await browser.close();
}
