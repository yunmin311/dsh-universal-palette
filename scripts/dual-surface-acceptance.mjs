// Real DSH acceptance for the dual-surface (Floating + Composer Morph) of
// dsh-universal-palette. Runs only against an isolated DSH_HOME; every
// row and surface state comes from the live DSH composition plus the
// official Session Controller state.
//
// Usage: node scripts/dual-surface-acceptance.mjs --log <dsh stdout log>
import { chromium, expect } from '@playwright/test'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const logPath = (() => {
  const idx = process.argv.indexOf('--log')
  if (idx === -1) throw new Error('missing --log <dsh stdout log>')
  return process.argv[idx + 1]
})()
const captureScreenshots = !process.argv.includes('--no-screenshots')
const output = 'evidence/2026-09-07-dual-surface'
mkdirSync(output, { recursive: true })
const viewportArg = (() => {
  const idx = process.argv.indexOf('--viewport')
  if (idx === -1) return '1792x896'
  return process.argv[idx + 1]
})()
const [vpW, vpH] = viewportArg.split('x').map(Number)
const argValue = (name, fallback) => {
  const idx = process.argv.indexOf(name)
  return idx === -1 ? fallback : process.argv[idx + 1]
}
const localeArg = argValue('--locale', 'en')
const localeRuntimeId = localeArg === 'zh-CN' ? 'zh' : localeArg
const themeArg = argValue('--theme', 'dark')
const runKey = `${viewportArg.replace('x', '-')}-${themeArg}-${localeArg}`

const results = {
  head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dshHome: process.env.DSH_HOME ?? '(default)',
  viewport: viewportArg,
  locale: localeArg,
  theme: themeArg,
  checks: [],
  observations: {},
  screenshots: {},
  errors: [],
}
const check = (name, details) => {
  results.checks.push({ name, status: 'PASS', details })
  console.log('PASS', name, typeof details === 'string' ? details : JSON.stringify(details))
}
const fail = (name, details) => {
  results.checks.push({ name, status: 'FAIL', details })
  console.error('FAIL', name, typeof details === 'string' ? details : JSON.stringify(details))
}

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: vpW, height: vpH } })
const dialog = page => page.getByRole('dialog', { name: /^(通用面板|Universal Palette)$/ })
async function dismissOnboarding(page) {
  for (const name of ['继续', '稍后配置', 'Continue', 'Configure later']) {
    const btn = page.getByRole('button', { name, exact: true })
    if (await btn.isVisible().catch(() => false)) {
      await btn.click()
      await page.waitForTimeout(400)
    }
  }
}
async function shot(page, name) {
  if (!captureScreenshots) return
  await page.screenshot({ path: `${output}/${name}.png` })
}

const page = await context.newPage()
page.on('pageerror', error => results.errors.push(error.message))
page.on('console', msg => {
  const text = msg.text()
  if (text.includes('dsh-universal-palette')) results.observations.console ||= []
  if ((results.observations.console ||= []).length < 50) results.observations.console.push(text)
})
await page.addInitScript(() => {
  let facade
  Object.defineProperty(window, '__ModuleLoader__', { configurable: true, get: () => facade, set(value) {
    const wrap = original => function (registration) {
      if (registration.id === '@yunmin311/dsh-universal-palette') {
        const factory = registration.factory
        registration = { ...registration, factory(require) {
          const plugin = factory(require)
          const apply = ctx => { window.__paletteTest = ctx; return plugin.apply(ctx) }
          return { ...plugin, apply, default: { ...plugin.default, apply } }
        } }
      }
      return original.call(this, registration)
    }
    value.load = wrap(value.load)
    facade = new Proxy(value, { set(target, key, val) { target[key] = key === 'load' ? wrap(val) : val; return true; } })
  } })
})

const url = readFileSync(logPath, 'utf8').match(/http:\/\/\S+/)[0]
await page.goto(url)
await page.waitForFunction(() => window.__paletteTest, undefined, { timeout: 30_000 })
await page.waitForTimeout(1000)
await dismissOnboarding(page)
await page.evaluate(({ locale, theme }) => {
  const c = window.__paletteTest
  c.locale.setLocale(locale)
  c.get('theme')?.setTheme(theme)
}, { locale: localeRuntimeId, theme: themeArg })
await page.waitForTimeout(1000)
await dismissOnboarding(page)

// --- Phase A: profile composition ---
const composition = await page.evaluate(() => {
  const c = window.__paletteTest
  return {
    hasSessions: typeof c.sessions?.list?.getSnapshot === 'function',
    hasInputTriggers: typeof c.inputTriggers?.registerSource === 'function',
    hasSlots: typeof c.slots?.inject === 'function' && typeof c.slots?.register === 'function',
    hasLocale: typeof c.locale?.register === 'function',
    hasRemote: typeof c.remote?.commands?.list === 'function',
  }
})
check('A1 public services exposed to the plugin', composition)
if (!composition.hasSessions) fail('A1', 'no sessions service')
if (!composition.hasInputTriggers) fail('A1', 'no inputTriggers service')
if (!composition.hasSlots) fail('A1', 'no slots service')

const pressAltQ = () => page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', {
  key: 'Q', code: 'KeyQ', altKey: true, bubbles: true, cancelable: true,
})))
const readSurface = () => dialog(page).evaluate((surface) => {
  const root = surface.parentElement
  const composer = document.querySelector('[role="textbox"]') || document.querySelector('textarea')
  const surfaceRect = surface.getBoundingClientRect()
  const composerRect = composer?.getBoundingClientRect()
  return {
    presentation: root?.getAttribute('data-presentation'),
    cold: root?.getAttribute('data-cold'),
    width: Math.round(surfaceRect.width),
    surfaceTop: Math.round(surfaceRect.top),
    surfaceBottom: Math.round(surfaceRect.bottom),
    composerTop: composerRect ? Math.round(composerRect.top) : null,
    composerBottom: composerRect ? Math.round(composerRect.bottom) : null,
    dialogs: document.querySelectorAll('[data-plugin="dsh-universal-palette"][data-presentation] > [role="dialog"]').length,
    morphs: document.querySelectorAll('[data-presentation="morph"]').length,
    floating: document.querySelectorAll('[data-presentation="floating"]').length,
    inViewport: surfaceRect.top >= 0 && surfaceRect.bottom <= window.innerHeight + 1,
  }
})
async function assertSurface(name, expected) {
  await expect(dialog(page)).toBeVisible({ timeout: 3000 })
  const actual = await readSurface()
  check(name, actual)
  if (actual.presentation !== expected.presentation) fail(name, `presentation=${actual.presentation}`)
  if (actual.cold !== String(expected.cold)) fail(name, `cold=${actual.cold}`)
  if (actual.width !== expected.width) fail(name, `width=${actual.width}`)
  if (actual.dialogs !== 1) fail(name, `dialogs=${actual.dialogs}`)
  if (expected.presentation === 'floating' && actual.morphs !== 0) fail(name, `morphs=${actual.morphs}`)
  if (expected.presentation === 'morph' && !(actual.surfaceBottom <= (actual.composerTop ?? -Infinity))) {
    fail(name, `Morph not fully above Composer: ${actual.surfaceBottom} > ${actual.composerTop}`)
  }
  if (!actual.inViewport) fail(name, 'surface outside viewport')
  return actual
}
async function closeAndAssertFocus(name, composer) {
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toHaveCount(0)
  const focusRestored = composer ? await composer.evaluate(el => document.activeElement === el) : true
  check(name, { focusRestored })
  if (!focusRestored) fail(name, 'focus was not restored')
}
async function openFind(composer, name) {
  await composer.click()
  await composer.fill('/f')
  await page.waitForTimeout(500)
  const discoverable = await page.getByText('Open the Universal Palette search', { exact: true }).count()
  if (discoverable === 0) fail(name, '/find is not discoverable')
  await composer.fill('/find')
  await composer.press('Enter')
  await page.waitForTimeout(500)
  const composerTextAfter = await composer.evaluate(el => el.textContent ?? '')
  check(`${name} dispatch`, { discoverable, composerTextAfter })
  if (composerTextAfter !== '') fail(name, `Composer retained '${composerTextAfter}'`)
}

// --- B: no Session -> compact Floating only ---
await page.evaluate(() => window.__paletteTest.sessions.clear())
await page.waitForTimeout(500)
const noSession = await page.evaluate(() => ({
  searchButtons: document.querySelectorAll('[data-search-button="true"]').length,
  morphs: document.querySelectorAll('[data-presentation="morph"]').length,
}))
check('B0 no-session has no Search button or Morph', noSession)
if (noSession.searchButtons !== 0 || noSession.morphs !== 0) fail('B0', noSession)
await page.locator('body').click({ position: { x: 20, y: 20 } })
await pressAltQ()
await page.waitForTimeout(400)
await assertSurface('B1 no-session Alt+Q -> compact Floating', { presentation: 'floating', cold: true, width: 540 })
await page.evaluate(() => { window.__pointerProbe = 0; document.body.addEventListener('pointerdown', () => { window.__pointerProbe += 1 }, { once: true }) })
await page.mouse.click(20, 20)
await expect(dialog(page)).toHaveCount(0)
const pointerProbe = await page.evaluate(() => window.__pointerProbe)
check('B2 Floating pointer-through reaches Host and closes', { pointerProbe })
if (pointerProbe !== 1) fail('B2', `pointerProbe=${pointerProbe}`)

// --- C: zero-turn hero -> every Composer entry falls back to compact Floating ---
await page.evaluate(async () => {
  const c = window.__paletteTest
  let ws = c.workspaces.list.getSnapshot().items[0]
  if (!ws) ws = await c.workspaces.create({ path: 'C:\\dsh-acceptance-20260907-workspace' })
  const id = await c.sessions.create({ workspaceId: ws.workspaceId })
  c.sessions.open(id)
  await c.sessions.refresh()
})
await page.waitForTimeout(700)
const composer = page.getByRole('textbox').last()
const searchButton = page.locator('[data-search-button="true"]').first()
if (await searchButton.count() !== 1) fail('C0', 'Search button missing')

await composer.click()
await searchButton.click({ force: true })
await assertSurface('C1 zero-turn Search button -> compact Floating', { presentation: 'floating', cold: true, width: 540 })
await closeAndAssertFocus('C1 Escape restores zero-turn Composer focus', composer)

await openFind(composer, 'C2 zero-turn /find')
await assertSurface('C2 zero-turn /find -> compact Floating', { presentation: 'floating', cold: true, width: 540 })
await closeAndAssertFocus('C2 Escape restores zero-turn Composer focus', composer)

await pressAltQ()
await page.waitForTimeout(300)
await assertSurface('C3 zero-turn Alt+Q -> compact Floating', { presentation: 'floating', cold: true, width: 540 })
await closeAndAssertFocus('C3 zero-turn Alt+Q closes', null)

// --- D: first real turn -> Search button and /find use upward Morph; Alt+Q stays full Floating ---
await composer.click()
await composer.fill('dual-surface acceptance: first real conversation turn.')
await composer.press('Enter')
await page.waitForFunction(() => {
  const c = window.__paletteTest
  const id = c.sessions.list.getSnapshot().current
  return id !== undefined && c.sessions.binding(id)?.session?.getSnapshot?.().blank === false
}, undefined, { timeout: 10_000 })

await searchButton.click({ force: true })
await page.waitForTimeout(300)
await assertSurface('D1 active Search button -> upward Morph', { presentation: 'morph', cold: false, width: 600 })
await closeAndAssertFocus('D1 Escape restores active Composer focus', composer)

await openFind(composer, 'D2 active /find')
await assertSurface('D2 active /find -> upward Morph', { presentation: 'morph', cold: false, width: 600 })
await pressAltQ()
await page.waitForTimeout(300)
await assertSurface('D3 Alt+Q atomically replaces Morph with full Floating', { presentation: 'floating', cold: false, width: 600 })
await closeAndAssertFocus('D3 active Floating closes', null)

// --- E: long conversation keeps the same active routing ---
for (let i = 0; i < 6; i++) {
  await composer.click()
  await composer.fill(`Growth note ${i + 1}: transcript keeps growing while placement stays stable.`)
  await composer.press('Enter')
  await page.waitForTimeout(500)
}
await page.evaluate(() => {
  const scroller = [...document.querySelectorAll('*')].find(el => el.scrollHeight > el.clientHeight + 100 && el.clientHeight > 200)
  if (scroller) scroller.scrollTop = scroller.scrollHeight
})

await searchButton.click({ force: true })
await page.waitForTimeout(300)
await assertSurface('E1 long Search button -> upward Morph', { presentation: 'morph', cold: false, width: 600 })
await closeAndAssertFocus('E1 Escape restores long Composer focus', composer)

await openFind(composer, 'E2 long /find')
await assertSurface('E2 long /find -> upward Morph', { presentation: 'morph', cold: false, width: 600 })
await closeAndAssertFocus('E2 Escape restores long Composer focus', composer)

await pressAltQ()
await page.waitForTimeout(300)
await assertSurface('E3 long Alt+Q -> full Floating', { presentation: 'floating', cold: false, width: 600 })
await closeAndAssertFocus('E3 long Floating closes', null)

// --- Final: no page errors ---
if (results.errors.length === 0) check('Z1 no browser page errors', [])
else fail('Z1', results.errors)

writeFileSync(`${output}/dual-surface-results-${runKey}.json`, JSON.stringify(results, null, 2) + '\n')
await browser.close()
if (results.checks.some(entry => entry.status === 'FAIL')) process.exitCode = 1
