import { chromium, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Run only against the two isolated acceptance homes, never the normal profile.
// All rows and actions come from real DSH. This observation bridge captures the
// public activation Context; it does not replace services or production code.
const output = 'evidence/2026-09-05-design-gate';
const captureScreenshots = !process.argv.includes('--no-screenshots');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1792, height: 896 } });
await context.tracing.start({ screenshots: true, snapshots: true });
const results = { head: execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim(), viewport: '1792x896', checks: [], screenshots: {}, errors: [] };
const check = (name, details) => { results.checks.push({name, status:'PASS', details}); console.log('PASS', name, details ?? ''); };
async function connect(log) {
  const page = await context.newPage();
  page.on('pageerror', error => results.errors.push(error.message));
  await page.addInitScript(() => {
    let facade;
    Object.defineProperty(window, '__ModuleLoader__', {configurable:true, get:()=>facade, set(value) {
      const wrap = original => function(registration) {
        if (registration.id === '@yunmin311/dsh-universal-palette') {
          const factory = registration.factory;
          registration = {...registration, factory(require) {
            const plugin = factory(require);
            const apply = ctx => { window.__paletteTest = ctx; return plugin.apply(ctx); };
            return {...plugin, apply, default:{...plugin.default, apply}};
          }};
        }
        return original.call(this, registration);
      };
      value.load = wrap(value.load);
      facade = new Proxy(value,{set(target,key,val) { target[key] = key === 'load' ? wrap(val) : val; return true; }});
    }});
  });
  await page.goto(readFileSync(log,'utf8').match(/http:\/\/\S+/)[0]);
  await page.waitForFunction(()=>window.__paletteTest);
  await page.waitForTimeout(1000);
  for (const name of ['继续', '稍后配置']) if (await page.getByRole('button',{name,exact:true}).isVisible()) {
    await page.getByRole('button',{name,exact:true}).click();
    await page.waitForTimeout(400);
  }
  await page.evaluate(()=>window.__paletteTest.locale.setLocale('zh'));
  return page;
}
const dialog = page => page.getByRole('dialog', {name:/^(通用面板|Universal Palette)$/});
async function open(page) { await page.keyboard.press('Control+Shift+K'); await expect(dialog(page)).toBeVisible(); await page.waitForTimeout(850); }
async function close(page) { await page.keyboard.press('Escape'); await expect(dialog(page)).toHaveCount(0); }
async function query(page, text) { await page.getByRole('combobox').fill(text); await page.waitForTimeout(900); }
async function shot(page, name) { await page.mouse.move(1700,700); await page.waitForTimeout(300); if (captureScreenshots) await page.screenshot({path:`${output}/${name}.png`}); results.screenshots[name] = await dialog(page).boundingBox(); }
async function theme(page, label) {
  await page.getByRole('button',{name:'设置',exact:true}).click();
  await page.getByRole('button',{name:label,exact:true}).click();
  await page.getByRole('button',{name:'关闭',exact:true}).click();
}
try {
  const history = await connect('../.dsh-smoke-20260904-01/smoke-logs/ux.stdout.log');
  await history.evaluate(()=>window.__paletteTest.sessions.clear());
  await theme(history, '深色');
  await open(history);
  await expect(dialog(history)).toContainText('选择工作区开始');
  await expect(dialog(history)).toContainText('命令和模型需要先打开会话');
  for (const title of ['选择工作区','新建会话','最近会话']) await expect(dialog(history)).toContainText(title);
  await shot(history, '01-no-session');
  check('A no workspace / no active Session', 'Chinese guidance with real persisted history available.');
  await history.getByRole('option').filter({hasText:'最近会话'}).click();
  await expect(history.locator('[data-kind=session]')).toHaveCount(1);
  await history.locator('[data-kind=session]').click();
  await expect(dialog(history)).toHaveCount(0);
  check('Recent sessions action', 'Opened the persisted official Session.');
  await open(history); await query(history, 'cobalt-otter-904');
  await expect(history.locator('[data-kind=conversation-hit]')).toHaveCount(1);
  await expect(history.locator('[data-kind=conversation-hit]')).toContainText('历史 ·');
  await shot(history, '04-conversation-hit');
  const hit = await history.evaluate(async()=>{
    const c=window.__paletteTest; const r=await c.sessions.search('cobalt-otter-904',new AbortController().signal);
    if(!r.ok)throw Error('history search failed');return r.value.items[0].sessionId;
  });
  await history.locator('[data-kind=conversation-hit]').click();
  await expect(dialog(history)).toHaveCount(0);
  expect(await history.evaluate(()=>window.__paletteTest.sessions.list.getSnapshot().current)).toBe(hit);
  check('E Conversation Hit', {sessionId:hit, query:'cobalt-otter-904'});

  const page = await connect('../.dsh-ux-cold-20260905/logs/ux.stdout.log');
  await theme(page, '深色');
  await page.evaluate(()=>window.__paletteTest.sessions.clear());
  await open(page);
  await expect(dialog(page)).toContainText('创建或打开会话');
  await shot(page, 'workspace-no-session');
  await page.getByRole('option').filter({hasText:'选择工作区'}).click();
  await expect(page.locator('[data-kind=workspace]')).toHaveCount(1);
  await page.locator('[data-kind=workspace]').click();
  await expect(dialog(page)).toHaveCount(0);
  await page.evaluate(()=>window.__paletteTest.sessions.clear());
  await open(page);
  await page.getByRole('option').filter({hasText:'新建会话'}).click();
  await expect(dialog(page)).toContainText('快捷操作');
  await page.waitForTimeout(850);
  check('B workspace / no Session', 'Select workspace and New session both open through uiWorkspace.');
  const kinds = await page.locator('#up-results [role=option]').evaluateAll(es=>es.map(e=>e.dataset.kind));
  expect(kinds.length).toBeGreaterThanOrEqual(5); expect(kinds.length).toBeLessThanOrEqual(8);
  for(const kind of ['command','model','session'])expect(kinds).toContain(kind);
  await shot(page, '02-empty-query'); check('C empty query', kinds);
  const sessionIds = await page.locator('#up-results [data-kind=session]').evaluateAll(es=>es.map(e=>e.dataset.sessionId));
  expect(sessionIds.every(Boolean)).toBe(true);
  expect(new Set(sessionIds).size).toBe(sessionIds.length);
  const currentSessionId = await page.evaluate(()=>window.__paletteTest.sessions.list.getSnapshot().current);
  expect(sessionIds.filter(id=>id===currentSessionId)).toHaveLength(1);
  expect(sessionIds[0]).toBe(currentSessionId);
  check('Empty query stable Session identity dedupe / Current first',sessionIds);
  for(const term of ['goal','permission','flash']) {
    await query(page,term);
    const rows=await page.locator('#up-results [role=option]').allTextContents();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(row=>row.toLowerCase().includes(term))).toBe(true);
    expect(rows.some(row=>row.includes('DeepSeek-V4-Pro'))).toBe(false);
    expect(await page.locator('#up-results [role=presentation]').count()).toBe(0);
    check('Relevance '+term,rows);
  }
  await query(page,'goal');
  await expect(page.locator('[data-kind=command]').filter({hasText:'/goal'})).toBeVisible();
  await shot(page,'03-goal-results');
  const catalog = await page.evaluate(async()=>{const c=window.__paletteTest;return c.remote.commands.list(c.sessions.list.getSnapshot().current)});
  expect(catalog.ok).toBe(true);
  check('D official Host catalog', catalog.value.map(c=>c.name));
  await page.getByRole('combobox').press('Enter');
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.locator('body')).toContainText('No goal is currently set'); check('/goal execution');
  for (const command of ['permission','feedback','plan']) {
    await open(page); await query(page,'/'+command);
    await expect(page.locator('[data-kind=command]').filter({hasText:'/'+command})).toBeVisible();
    await page.getByRole('combobox').press('Enter');
    if(command==='feedback') {
      await expect(page.getByRole('alert')).toContainText('请在会话输入框使用');
      check('/feedback execution','Expected official input-required error is visible; no feedback was submitted.');
      await close(page);
    } else {
      await expect(dialog(page)).toHaveCount(0);
      await expect(page.locator('body')).toContainText(command==='plan'?'Plan mode on.':'current preset workspace-write');
      check('/'+command+' execution');
    }
  }
  const restore = await page.evaluate(()=>{const c=window.__paletteTest;return c.remote.commands.execute(c.sessions.list.getSnapshot().current,'/plan off',[],new AbortController().signal)});
  expect(restore.ok).toBe(true);
  await open(page); await query(page,'/model');
  await page.locator('[data-kind=command]').filter({hasText:'/model'}).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole('listbox')).toContainText('DeepSeek-V4-Flash');
  if (captureScreenshots) await page.screenshot({path:`${output}/model-native.png`});
  check('/model execution','Official Client slash adjudication opens the native model picker; it is not a Host catalog descriptor.');
  await page.keyboard.press('Escape');

  const composer = page.getByRole('textbox').last();
  await composer.focus(); await open(page); await close(page); await expect(composer).toBeFocused();
  check('F root Esc / restored focus');
  await open(page);await page.keyboard.press('Control+Shift+K');await expect(dialog(page)).toHaveCount(0);await expect(composer).toBeFocused();
  check('G shortcut toggle');
  await open(page);await composer.click();await expect(dialog(page)).toHaveCount(0);await expect(composer).toBeFocused();
  await composer.fill('passthrough-smoke');await expect(composer).toHaveText('passthrough-smoke');
  await composer.press('Control+A');await composer.press('Backspace');await expect(composer).toHaveText('');
  check('H workspace click pass-through / editing after close');
  await open(page);
  const pointer = await dialog(page).evaluate(e=>({root:getComputedStyle(e.parentElement).pointerEvents,surface:getComputedStyle(e).pointerEvents}));
  expect(pointer).toEqual({root:'none',surface:'auto'});
  await page.getByRole('button',{name:'收起侧边栏',exact:true}).click();await expect(dialog(page)).toHaveCount(0);
  await open(page);await shot(page,'sidebar-collapsed');
  expect(results.screenshots['sidebar-collapsed'].x).toBe(624);
  await page.getByRole('button',{name:'打开侧边栏',exact:true}).click();await expect(dialog(page)).toHaveCount(0);
  await open(page);await shot(page,'sidebar-expanded');expect(results.screenshots['sidebar-expanded'].x).toBe(736);
  check('H/J sidebar pass-through and responsive position', pointer);
  await query(page,'unfindable-zzzz-916');await expect(dialog(page)).toContainText('未找到“unfindable-zzzz-916”的结果');await shot(page,'no-results');
  check('No matching query has specific guidance');await close(page);
  const tokens = {};
  for (const label of ['浅色','深色']) {
    await theme(page,label);await open(page);
    tokens[label]=await dialog(page).evaluate(e=>({background:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color,menu:getComputedStyle(e).getPropertyValue('--dsw-specific-menu'),blur:getComputedStyle(e).backdropFilter}));
    await shot(page,label==='浅色'?'theme-light':'theme-dark');await close(page);
  }
  expect(tokens['浅色'].background).not.toBe(tokens['深色'].background);
  check('I official theme settings / inherited menu and text tokens', tokens);
  expect(tokens['深色'].background).toContain('0.76');
  expect(tokens['深色'].blur).toBe('blur(22px) saturate(1.12)');
  await open(page);
  await expect(page.getByRole('combobox')).toHaveAttribute('placeholder','搜索命令、会话、模型与历史…');
  await page.getByRole('combobox').evaluate(e=>{window.originalPaletteInput=e});
  await page.evaluate(()=>window.__paletteTest.locale.setLocale('en'));
  await expect(page.getByRole('combobox')).toHaveAttribute('placeholder','Search commands, sessions, models, history…');
  await expect(dialog(page)).toContainText('Quick actions');
  expect(await page.getByRole('combobox').evaluate(e=>e===window.originalPaletteInput)).toBe(true);
  await shot(page,'locale-en');
  await page.evaluate(()=>window.__paletteTest.locale.setLocale('zh'));
  await expect(dialog(page)).toContainText('↑↓ 移动');
  await shot(page,'locale-zh');
  check('Locale changes live without rebuilding input');
  expect(results.errors).toEqual([]);check('No browser page errors');
} catch(error) {
  results.failure = String(error);console.error(error);process.exitCode=1;
} finally {
  writeFileSync(`${output}/smoke-results.json`, JSON.stringify(results,null,2)+'\n');
  // Trace contains local authentication URLs; keep it local, do not commit/share.
  await context.tracing.stop({path:`${output}/local-only-trace.zip`});
  await browser.close();
}
