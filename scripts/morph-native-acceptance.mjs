// Real locked-DSH acceptance for native slash ownership + result-only Morph.
// Usage: node scripts/morph-native-acceptance.mjs --log <dsh stdout log>
import { chromium, expect } from '@playwright/test'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const value = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : process.argv[index + 1]
}
const logPath = value('--log')
if (!logPath) throw new Error('missing --log <dsh stdout log>')
const viewport = value('--viewport', '1792x896')
const locale = value('--locale', 'en')
const theme = value('--theme', 'dark')
const [width, height] = viewport.split('x').map(Number)
const runKey = `${viewport}-${theme}-${locale}`.replaceAll('x', '-')
const output = 'evidence/2026-09-09-native-morph'
mkdirSync(output, { recursive: true })
const result = { viewport, locale, theme, checks: [], errors: [] }
const pass = (name, detail = '') => { result.checks.push({ name, status: 'PASS', detail }); console.log('PASS', name, detail) }

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width, height } })
const page = await context.newPage()
page.on('pageerror', error => result.errors.push(error.message))
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
    facade = new Proxy(value, { set(target, key, next) { target[key] = key === 'load' ? wrap(next) : next; return true } })
  } })
})
const url = readFileSync(logPath, 'utf8').match(/http:\/\/\S+/)?.[0]
if (!url) throw new Error('DSH URL not found in log')
await page.goto(url)
await page.waitForFunction(() => window.__paletteTest, undefined, { timeout: 30_000 })
for (const name of ['继续', '稍后配置', 'Continue', 'Configure later']) {
  const button = page.getByRole('button', { name, exact: true })
  if (await button.isVisible().catch(() => false)) await button.click()
}
await page.evaluate(({ locale, theme }) => {
  const ctx = window.__paletteTest
  ctx.locale.setLocale(locale === 'zh-CN' ? 'zh' : locale)
  ctx.get('theme')?.setTheme(theme)
}, { locale, theme })

const floating = page.getByRole('dialog', { name: /^(通用面板|Universal Palette)$/ })
const morph = page.locator('[data-plugin="dsh-universal-palette"][data-presentation="morph"]')
const composer = () => page.getByRole('textbox').last()
const searchButton = () => page.locator('[data-search-button="true"]').first()
const pressAltQ = () => page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', {
  key: 'Q', code: 'KeyQ', altKey: true, bubbles: true, cancelable: true,
})))
async function dismissProviderSetup() {
  const button = page.getByRole('button', { name: /^(Configure later|稍后配置)$/, exact: true })
  await button.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => undefined)
  if (await button.isVisible().catch(() => false)) await button.click()
}

async function assertNativeSlash(label) {
  await composer().click()
  await composer().fill('')
  await composer().pressSequentially('/')
  await expect(page.locator('[id^="dsh-slash-option-universal-palette.find-source-"]')).toBeVisible()
  await expect(morph).toHaveCount(0)
  await expect(floating).toHaveCount(0)
  pass(label, 'DSH listbox owns bare slash; plugin surfaces absent')
}

async function chooseFind() {
  await composer().fill('')
  await composer().pressSequentially('/f')
  const row = page.locator('[id^="dsh-slash-option-universal-palette.find-source-"]').first()
  await expect(row).toBeVisible()
  await row.click()
}

try {
  // No Session + zero-turn host-capability fallback.
  await page.evaluate(() => window.__paletteTest.sessions.clear())
  await pressAltQ()
  await expect(floating).toBeVisible()
  const coldWidth = Math.round((await floating.boundingBox()).width)
  if (coldWidth !== 540) throw new Error(`cold Floating width=${coldWidth}`)
  await page.keyboard.press('Escape')
  pass('no-session Alt+Q compact Floating', coldWidth)

  await page.evaluate(async () => {
    const ctx = window.__paletteTest
    let workspace = ctx.workspaces.list.getSnapshot().items[0]
    if (!workspace) workspace = await ctx.workspaces.create({ path: 'C:\\dsh-acceptance-20260909-native-morph' })
    const sessionId = await ctx.sessions.create({ workspaceId: workspace.workspaceId })
    ctx.sessions.open(sessionId)
    await ctx.sessions.refresh()
  })
  await dismissProviderSetup()
  await expect(composer()).toBeVisible()
  await assertNativeSlash('zero-turn bare slash remains native')
  await chooseFind()
  await expect(floating).toBeVisible()
  await expect(morph).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(composer()).toHaveText('')
  pass('zero-turn /find compact fallback', 'no hidden claim or Morph')

  // Reuse a durable active Session from the isolated acceptance profile. No
  // provider credential or synthetic prompt is needed on repeated rebuilds.
  const reused = await page.evaluate(async () => {
    const ctx = window.__paletteTest
    await ctx.sessions.refresh()
    const snapshot = ctx.sessions.list.getSnapshot()
    const summaries = snapshot.ids.map(id => snapshot.byId[id]).filter(Boolean)
    const hits = await ctx.sessions.search('arch', new AbortController().signal)
    const hitId = hits.ok ? hits.value.items.find(hit => summaries.some(row => row.id === hit.sessionId && row.blank === false))?.sessionId : undefined
    const sessionId = hitId ?? summaries.find(row => row.blank === false)?.id
    if (!sessionId) throw new Error('isolated acceptance profile has no reusable active Session')
    ctx.sessions.open(sessionId)
    return String(sessionId)
  })
  await page.waitForFunction(() => {
    const ctx = window.__paletteTest
    const id = ctx.sessions.list.getSnapshot().current
    return id !== undefined && ctx.sessions.binding(id)?.session?.getSnapshot?.().blank === false
  }, undefined, { timeout: 15_000 })
  await dismissProviderSetup()
  pass('reused active Session', reused)

  await assertNativeSlash('active bare slash remains native')

  // Esc exits the public claim and restores ordinary Composer semantics while
  // preserving the user's query text.
  await composer().fill('/find')
  await composer().press('Space')
  await composer().pressSequentially('arch')
  await expect(morph).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(morph).toHaveCount(0)
  await expect(composer()).toHaveText('arch')
  await expect(composer()).toBeFocused()
  const phaseAfterEscape = await composer().getAttribute('data-phase')
  if (phaseAfterEscape === 'claimed') throw new Error('Esc left Composer in claimed phase')
  pass('slash Esc restores ordinary Composer', `draft=arch phase=${phaseAfterEscape ?? 'plain'}`)

  await composer().fill('/find')
  await composer().press('Space')
  await expect(morph).toBeVisible()
  await expect(page.getByRole('combobox')).toHaveCount(0)
  await composer().pressSequentially('arch')
  await expect(composer()).toHaveText('/find arch')
  await page.waitForTimeout(900)
  const archState = await morph.innerText()
  if (!/arch/i.test(archState) && await morph.getByRole('option').count() === 0) throw new Error(`arch query was not reflected: ${archState}`)
  // Use a guaranteed native command result to prove claimed Enter executes a
  // result instead of sending the command text to the Agent.
  for (let index = 0; index < 4; index += 1) await composer().press('Backspace')
  await composer().pressSequentially('goal')
  await expect(composer()).toHaveText('/find goal')
  await page.waitForTimeout(900)
  const rows = morph.getByRole('option')
  const goalRow = rows.filter({ hasText: '/goal' }).first()
  await expect(goalRow).toBeVisible()
  const rowGeometry = await goalRow.evaluate(row => {
    const style = getComputedStyle(row)
    return {
      height: Math.round(row.getBoundingClientRect().height),
      radius: style.borderRadius,
      selected: row.getAttribute('aria-selected'),
    }
  })
  if (rowGeometry.height !== 40 || rowGeometry.radius !== '10px' || rowGeometry.selected !== 'true') {
    throw new Error(`native row geometry mismatch ${JSON.stringify(rowGeometry)}`)
  }
  const beforeEnter = await page.evaluate(() => {
    const ctx = window.__paletteTest
    const id = ctx.sessions.list.getSnapshot().current
    return ctx.sessions.binding(id)?.session?.getSnapshot?.().blank
  })
  await composer().press('Enter')
  await expect(morph).toHaveCount(0)
  await expect(composer()).toHaveText('')
  const afterEnter = await page.evaluate(() => {
    const ctx = window.__paletteTest
    const id = ctx.sessions.list.getSnapshot().current
    return ctx.sessions.binding(id)?.session?.getSnapshot?.().blank
  })
  if (beforeEnter !== false || afterEnter !== false) throw new Error('claimed Enter changed Session lifecycle unexpectedly')
  pass('/find arch single-input claim', { behavior: 'arch updated inline; claimed Enter executed /goal without Agent submission', rowGeometry })

  // Direct Search button reads and preserves an ordinary draft.
  await composer().fill('please review...')
  await searchButton().click({ force: true })
  await expect(morph).toBeVisible()
  await expect(page.getByRole('combobox')).toHaveCount(0)
  await expect(composer()).toHaveText('please review...')
  const geometry = await morph.evaluate((root) => {
    const surface = root.querySelector('[role="listbox"]').parentElement
    const box = surface.getBoundingClientRect()
    const row = root.querySelector('[role="option"]')
    const rowStyle = row ? getComputedStyle(row) : null
    const style = getComputedStyle(surface)
    return {
      width: Math.round(box.width), radius: style.borderRadius, border: style.borderTopWidth,
      shadow: style.boxShadow, rowHeight: row ? Math.round(row.getBoundingClientRect().height) : null,
      selected: rowStyle?.backgroundColor,
      rootPointerEvents: getComputedStyle(root).pointerEvents,
      surfacePointerEvents: getComputedStyle(surface).pointerEvents,
    }
  })
  const composerWidth = Math.round((await composer().boundingBox()).width)
  if (geometry.width < composerWidth || geometry.width > composerWidth + 180) throw new Error(`Morph width ${geometry.width} not Composer-wide ${composerWidth}`)
  if (geometry.radius !== '20px' || geometry.border !== '0px') throw new Error(`Morph chrome mismatch ${JSON.stringify(geometry)}`)
  if (geometry.rootPointerEvents !== 'none' || geometry.surfacePointerEvents !== 'auto') throw new Error(`Morph pointer-through mismatch ${JSON.stringify(geometry)}`)
  await page.keyboard.press('Escape')
  await expect(composer()).toHaveText('please review...')
  await expect(composer()).toBeFocused()
  pass('Search button preserves ordinary draft', geometry)

  // Mutual exclusion and unchanged full Floating.
  await searchButton().click({ force: true })
  await expect(morph).toBeVisible()
  await pressAltQ()
  await expect(morph).toHaveCount(0)
  await expect(floating).toBeVisible()
  const fullWidth = Math.round((await floating.boundingBox()).width)
  if (fullWidth !== 600) throw new Error(`active Floating width=${fullWidth}`)
  await page.keyboard.press('Escape')
  pass('active Alt+Q Floating unchanged', fullWidth)

  // The reused durable history exercises the long-conversation host geometry
  // without sending another prompt on every rebuild.
  await composer().fill('goal')
  await searchButton().click({ force: true })
  await expect(morph).toBeVisible()
  const placement = await morph.evaluate(root => {
    const surface = root.querySelector('[role="listbox"]').parentElement.getBoundingClientRect()
    const textbox = document.querySelector('[role="textbox"]')?.getBoundingClientRect()
    return { surfaceBottom: Math.round(surface.bottom), composerTop: textbox ? Math.round(textbox.top) : null }
  })
  if (placement.composerTop === null || placement.surfaceBottom > placement.composerTop) throw new Error(`not upward: ${JSON.stringify(placement)}`)
  await page.keyboard.press('Escape')
  pass('long conversation upward Morph', placement)

  if (result.errors.length) throw new Error(`pageerror: ${result.errors.join(' | ')}`)
  pass('no pageerror')
} catch (error) {
  result.failure = error instanceof Error ? `${error.stack ?? error.message}` : String(error)
  console.error(result.failure)
  process.exitCode = 1
} finally {
  writeFileSync(`${output}/${runKey}.json`, JSON.stringify(result, null, 2) + '\n')
  await browser.close()
}
