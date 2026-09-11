// Real patched-DSH acceptance for downward Hero Morph and unchanged active Morph.
// Usage: node scripts/hero-morph-acceptance.mjs --url <dsh-url> --viewport 1792x896 --theme dark
import { chromium, expect } from '@playwright/test'
import { mkdirSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const value = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : process.argv[index + 1]
}
const url = value('--url')
if (!url) throw new Error('missing --url <dsh-url>')
const viewport = value('--viewport', '1792x896')
const theme = value('--theme', 'dark')
const [width, height] = viewport.split('x').map(Number)
const runKey = `${viewport}-${theme}`.replace('x', '-')
const output = 'evidence/2026-09-10-hero-morph'
mkdirSync(output, { recursive: true })
const result = {
  hostCommit: '64c3528282c09412ea6fec57b968c6109d492715',
  viewport,
  theme,
  checks: [],
  states: {},
  errors: [],
}
const pass = (name, detail = '') => {
  result.checks.push({ name, status: 'PASS', detail })
  console.log('PASS', name, detail)
}

// Content-ranked session discovery (node side, read-only): the Host renders
// the active conversation view only for sessions with real turns, and the
// session list projection can claim non-blank for transcript-wiped ghosts.
// Rank listed sessions by their on-disk log size so content-bearing sessions
// verify first; every candidate is still verified live below.
function contentRankedSessionIds(home) {
  const roots = []
  try {
    for (const workspace of readdirSync(join(home, 'sessions'), { withFileTypes: true })) {
      if (workspace.isDirectory()) roots.push(join(home, 'sessions', workspace.name))
    }
  } catch { return [] }
  const sized = []
  for (const root of roots) {
    let children = []
    try { children = readdirSync(root) } catch { continue }
    for (const child of children) {
      if (!child.startsWith('session-')) continue
      const file = join(root, child, 'session.jsonl.zstd')
      try { sized.push({ id: child, size: statSync(file).size }) } catch { /* skip */ }
    }
  }
  return sized.sort((a, b) => b.size - a.size).slice(0, 12).map(row => row.id)
}

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

const morph = page.locator('[data-plugin="dsh-universal-palette"][data-presentation="morph"]')
const heroMorph = page.locator('[data-placement="hero-down"]')
const activeMorph = page.locator('[data-placement="active-up"]')
const floating = page.getByRole('dialog', { name: /^(通用面板|Universal Palette)$/ })
const composer = () => page.getByRole('textbox').last()
const searchButton = () => page.locator('[data-search-button="true"]').first()
const shot = async name => {
  const path = `${output}/${runKey}-${name}.png`
  await page.mouse.move(width - 24, 24)
  await page.screenshot({ path })
  result.states[name] = { screenshot: path }
}
const pressAltQ = () => page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', {
  key: 'Q', code: 'KeyQ', altKey: true, bubbles: true, cancelable: true,
})))
// Bounded settle wait on public rendered state: resolves when the placed Morph
// shows final results (>=1 option) or a stable non-loading empty state, AND
// that signature (row count) holds across consecutive polls. The extra
// stability leg matters because opening fires an immediate initial search
// while the Host draft sync can land slightly later and reload once.
// Never a fixed sleep; never private DSH state.
async function settleMorph(placement) {
  await page.waitForFunction((wanted) => {
    const host = window
    const el = document.querySelector(`[data-plugin="dsh-universal-palette"][data-presentation="morph"][data-placement="${wanted}"]`)
    if (!el) { host.__settleSig = null; host.__settleN = 0; return false }
    const rows = el.querySelectorAll('[role="option"]').length
    const status = el.querySelector('[role="status"]')
    const loading = status ? /Searching|正在搜索/.test(status.textContent ?? '') : false
    if (!(rows > 0 || (status && !loading))) { host.__settleSig = null; host.__settleN = 0; return false }
    const sig = `${wanted}:${rows}`
    host.__settleN = host.__settleSig === sig ? (host.__settleN ?? 1) + 1 : 1
    host.__settleSig = sig
    return (host.__settleN ?? 0) >= 3
  }, placement, { timeout: 20_000, polling: 300 })
}
async function dismissSetup() {
  for (const name of ['继续', '稍后配置', 'Continue', 'Configure later']) {
    const button = page.getByRole('button', { name, exact: true })
    if (await button.isVisible().catch(() => false)) await button.click()
  }
}
async function geometry(root) {  return root.evaluate(element => {
    const surface = element.querySelector('[role="listbox"]')?.parentElement
    const card = document.querySelector('[data-composer-card]')
    if (!(surface instanceof HTMLElement) || !(card instanceof HTMLElement)) throw new Error('missing Morph surface or Composer card')
    const rootBox = element.getBoundingClientRect()
    const surfaceBox = surface.getBoundingClientRect()
    const cardBox = card.getBoundingClientRect()
    const list = element.querySelector('[role="listbox"]')
    const ancestors = []
    let ancestor = element.parentElement
    while (ancestor && ancestors.length < 5) {
      const box = ancestor.getBoundingClientRect()
      const style = getComputedStyle(ancestor)
      ancestors.push({
        tag: ancestor.tagName,
        className: String(ancestor.className).slice(0, 120),
        width: Math.round(box.width),
        display: style.display,
        position: style.position,
        alignSelf: style.alignSelf,
        flex: style.flex,
      })
      ancestor = ancestor.parentElement
    }
    return {
      placement: element.getAttribute('data-placement'),
      position: getComputedStyle(element).position,
      rootTop: Math.round(rootBox.top),
      surfaceTop: Math.round(surfaceBox.top),
      surfaceBottom: Math.round(surfaceBox.bottom),
      surfaceWidth: Math.round(surfaceBox.width),
      surfaceHeight: Math.round(surfaceBox.height),
      cardTop: Math.round(cardBox.top),
      cardBottom: Math.round(cardBox.bottom),
      cardWidth: Math.round(cardBox.width),
      listClientHeight: list instanceof HTMLElement ? Math.round(list.clientHeight) : null,
      listScrollHeight: list instanceof HTMLElement ? Math.round(list.scrollHeight) : null,
      rows: element.querySelectorAll('[role="option"]').length,
      ancestors,
    }
  })
}

try {
  await page.goto(url)
  await page.waitForFunction(() => window.__paletteTest, undefined, { timeout: 30_000 })
  await dismissSetup()
  await page.evaluate(theme => {
    const ctx = window.__paletteTest
    ctx.locale.setLocale('en')
    ctx.get('theme')?.setTheme(theme)
  }, theme)
  await page.waitForTimeout(400)

  // A — no real Session: Hero dock and Search button are absent; Alt+Q stays global.
  await page.evaluate(() => window.__paletteTest.sessions.clear())
  await page.waitForTimeout(400)
  const noSessionDiagnostic = await page.evaluate(() => {
    const ctx = window.__paletteTest
    const current = ctx.sessions.list.getSnapshot().current
    const snapshot = name => typeof ctx.slots?.snapshot === 'function' ? ctx.slots.snapshot(name) : []
    const button = document.querySelector('[data-search-button="true"]')
    return {
      current: current === undefined ? null : String(current),
      buttonPresent: button !== null,
      buttonDisabled: button instanceof HTMLButtonElement ? button.disabled : null,
      heroDock: snapshot('conversation.hero.composer.dock'),
      inputLeft: snapshot('conversation.input.left'),
    }
  })
  console.log('NO_SESSION_DIAGNOSTIC', JSON.stringify(noSessionDiagnostic))
  await expect(heroMorph).toHaveCount(0)
  await pressAltQ()
  await expect(floating).toBeVisible()
  await shot('A-no-session-global-floating')
  await page.keyboard.press('Escape')
  pass('A no-session boundary', 'no Hero dock; Alt+Q opens Global Floating')

  // B — blank Session direct Search: normal-flow Hero dock below Composer.
  const heroSessionId = await page.evaluate(async () => {
    const ctx = window.__paletteTest
    await ctx.sessions.refresh()
    const snapshot = ctx.sessions.list.getSnapshot()
    const existing = snapshot.ids.map(id => snapshot.byId[id]).find(row => row?.blank === true)
    let sessionId = existing?.id
    if (!sessionId) {
      let workspace = ctx.workspaces.list.getSnapshot().items[0]
      if (!workspace) workspace = await ctx.workspaces.create({ path: 'C:\\dsh-acceptance-20260910-hero-morph' })
      sessionId = await ctx.sessions.create({ workspaceId: workspace.workspaceId })
    }
    ctx.sessions.open(sessionId)
    await ctx.sessions.refresh()
    return String(sessionId)
  })
  await dismissSetup()
  await expect(composer()).toBeVisible()
  await composer().fill('')
  await searchButton().click({ force: true })
  await expect(heroMorph).toBeVisible()
  await expect(activeMorph).toHaveCount(0)
  await expect(page.getByRole('combobox')).toHaveCount(0)
  await settleMorph('hero-down')
  const heroGeometry = await geometry(heroMorph)
  if (heroGeometry.rows < 1) throw new Error(`Hero empty-query open returned no default results: ${JSON.stringify(heroGeometry)}`)
  if (heroGeometry.position !== 'static') throw new Error(`Hero Morph is not normal flow: ${JSON.stringify(heroGeometry)}`)
  const gap = heroGeometry.surfaceTop - heroGeometry.cardBottom
  if (gap < 3 || gap > 8) throw new Error(`Hero gap is not 4-8px: ${JSON.stringify(heroGeometry)}`)
  if (Math.abs(heroGeometry.surfaceWidth - heroGeometry.cardWidth) > 2) throw new Error(`Hero width does not align: ${JSON.stringify(heroGeometry)}`)
  if (heroGeometry.surfaceHeight > 208) throw new Error(`Hero surface exceeds five-row cap: ${JSON.stringify(heroGeometry)}`)
  await shot('B-hero-direct-down')
  await page.keyboard.press('Escape')
  await expect(composer()).toBeFocused()
  pass('B Hero direct Search', { rows: heroGeometry.rows, ...heroGeometry })

  // C — bare slash stays native; /find claims the Composer and opens the same Hero dock.
  await composer().fill('')
  await composer().pressSequentially('/')
  await expect(page.locator('[id^="dsh-slash-option-universal-palette.find-source-"]')).toBeVisible()
  await expect(morph).toHaveCount(0)
  await composer().fill('/find')
  await composer().press('Space')
  await composer().pressSequentially('dsh')
  await expect(heroMorph).toBeVisible()
  await settleMorph('hero-down')
  const heroFindRows = await heroMorph.getByRole('option').count()
  if (heroFindRows < 1) throw new Error('Hero /find dsh settled with no results')
  await expect(composer()).toHaveText('/find dsh')
  await shot('C-hero-find-down')
  await page.keyboard.press('Escape')
  await expect(composer()).toHaveText('dsh')
  await expect(composer()).toBeFocused()
  pass('C Hero /find and bare slash', 'native slash retained; claim query synced; Esc restored dsh')

  // Select a durable ACTIVE-VIEW Session from the isolated profile.
  // blank===false alone is not sufficient: the Host upgrades the Hero view
  // to the active conversation view only for sessions with real turns, and
  // the list projection can claim non-blank for transcript-wiped ghosts
  // (the A-step clear truncates transcripts but leaves rows behind).
  // Candidates are content-ranked by on-disk log size, then each is verified
  // live: binding blank must hold AND the Search button must raise the
  // active-up overlay here. Bounded at every step.
  const repoRoot = fileURLToPath(new URL('..', import.meta.url))
  const rankedIds = contentRankedSessionIds(repoRoot + '/.dsh-acceptance-20260907')
  const activeCandidates = await page.evaluate(async (ranked) => {
    const ctx = window.__paletteTest
    await ctx.sessions.refresh()
    const snapshot = ctx.sessions.list.getSnapshot()
    const listed = new Set(snapshot.ids.map(String))
    const rankedListed = ranked.filter(id => listed.has(id))
    if (rankedListed.length) return rankedListed
    return snapshot.ids
      .map(id => snapshot.byId[id])
      .filter(row => row && row.blank === false)
      .map(row => String(row.id))
      .slice(0, 6)
  }, rankedIds)
  if (!activeCandidates.length) throw new Error('isolated profile has no durable active Session')
  await page.keyboard.press('Escape')
  let activeSessionId = null
  for (const candidate of activeCandidates) {
    await page.evaluate(sessionId => window.__paletteTest.sessions.open(sessionId), candidate)
    try {
      await page.waitForFunction(expected => {
        const ctx = window.__paletteTest
        return String(ctx.sessions.list.getSnapshot().current) === expected
      }, candidate, { timeout: 15_000 })
    } catch { console.log('SKIP candidate never became current', candidate); continue }
    // The list projection can be stale (a row claims non-blank, but the
    // binding loads blank). Reject on the first true; require false to
    // hold across consecutive polls before trusting the candidate.
    const holdsNonBlank = await page.waitForFunction(sessionId => {
      const ctx = window.__paletteTest
      const snap = ctx.sessions.binding(sessionId)?.session?.getSnapshot?.()
      if (!snap || String(ctx.sessions.list.getSnapshot().current) !== sessionId) return false
      if (snap.blank !== false) throw new Error('ghost candidate loads blank')
      window.__blankGood = (window.__blankGoodSession === sessionId) ? ((window.__blankGood ?? 0) + 1) : 1
      window.__blankGoodSession = sessionId
      return (window.__blankGood ?? 0) >= 6
    }, candidate, { timeout: 12_000, polling: 500 }).then(() => true).catch(() => false)
    await page.evaluate(() => { window.__blankGood = 0; window.__blankGoodSession = null })
    if (!holdsNonBlank) { console.log('SKIP stale ghost candidate (blank did not hold)', candidate); continue }
    await dismissSetup()
    await expect(composer()).toBeVisible()
    await composer().fill('')
    await searchButton().click({ force: true })
    let seen = null
    try {
      await expect(activeMorph).toBeVisible({ timeout: 8_000 })
      seen = 'active-up'
    } catch { seen = await heroMorph.isVisible().catch(() => false) ? 'hero-down' : null }
    await page.keyboard.press('Escape')
    await expect(morph).toHaveCount(0)
    if (seen === 'active-up') { activeSessionId = candidate; break }
    console.log('SKIP candidate without active view', candidate, seen)
  }
  if (!activeSessionId) throw new Error('no candidate Session renders the active conversation view')

  // D — active direct Search retains the approved upward overlay and ordinary draft.
  // Uses a query with real results in this profile so the upward surface is
  // captured with rows, not an empty state. Real keystrokes (not fill) drive
  // the Composer: the Host draft store syncs from key events, while a
  // synthetic fill only mutates the DOM and the Morph would keep showing
  // the open-triggered defaults.
  await composer().click()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Backspace')
  await composer().pressSequentially('dsh')
  await searchButton().click({ force: true })
  await expect(activeMorph).toBeVisible()
  await expect(heroMorph).toHaveCount(0)
  await expect(composer()).toHaveText('dsh')
  await settleMorph('active-up')
  const activeGeometry = await geometry(activeMorph)
  if (activeGeometry.rows < 1) throw new Error(`Active direct Search settled with no results: ${JSON.stringify(activeGeometry)}`)
  if (activeGeometry.position !== 'absolute' || activeGeometry.surfaceBottom > activeGeometry.cardTop) {
    throw new Error(`Active Morph is not upward: ${JSON.stringify(activeGeometry)}`)
  }
  await shot('D-active-direct-up')
  await page.keyboard.press('Escape')
  await expect(composer()).toHaveText('dsh')
  pass('D active direct Search unchanged', { activeSessionId, ...activeGeometry })

  // E — active /find uses the same upward Morph and claimed Enter executes selection.
  // Fixture is a query with real executable results in this profile (`dsh`
  // session hits); `/goal` has zero rows here and cannot verify execution.
  // E — active /find uses the same upward Morph and claimed Enter executes selection.
  // Fixture: `/find goal` resolves to exactly one executable row (the /goal
  // command) in this profile. Count==1 is sync-proof: the open-triggered
  // defaults have ~40 rows and loading has 0, so 1 unambiguously proves the
  // claim query landed in the aggregator — which the Enter submit requires.
  await composer().fill('/find')
  await composer().press('Space')
  await composer().pressSequentially('goal')
  await expect(activeMorph).toBeVisible()
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-plugin="dsh-universal-palette"][data-presentation="morph"][data-placement="active-up"]')
    return el !== null && el.querySelectorAll('[role="option"]').length === 1
  }, undefined, { timeout: 15_000 })
  const goalRow = activeMorph.getByRole('option').filter({ hasText: '/goal' }).first()
  await expect(goalRow).toBeVisible()
  const goalRowText = (await goalRow.textContent() ?? '').slice(0, 120)
  await shot('E-active-find-up')
  await composer().press('Enter')
  try {
    await expect(morph).toHaveCount(0, { timeout: 10_000 })
  } catch {
    const diag = await page.evaluate(() => ({
      composer: (document.querySelector('[role="textbox"]')?.textContent ?? '').slice(0, 60),
      alerts: [...document.querySelectorAll('[role="alert"]')].map(e => (e.textContent ?? '').slice(0, 160)),
      current: String(window.__paletteTest.sessions.list.getSnapshot().current),
      morphs: [...document.querySelectorAll('[data-plugin="dsh-universal-palette"][data-presentation="morph"]')].map(el => ({
        placement: el.getAttribute('data-placement'),
        options: el.querySelectorAll('[role="option"]').length,
      })),
    }))
    throw new Error(`claimed Enter did not close the Morph: ${JSON.stringify(diag)}`)
  }
  await expect(composer()).not.toContainText('/find')
  await page.waitForTimeout(500)
  const transcriptLeak = await page.evaluate(() => {
    const ctx = window.__paletteTest
    const current = ctx.sessions.list.getSnapshot().current
    const snap = ctx.sessions.binding(current)?.session?.getSnapshot?.()
    return JSON.stringify(snap ?? null).includes('/find goal')
  })
  if (transcriptLeak) throw new Error('claimed /find goal leaked into the Agent transcript')
  pass('E active /find claimed Enter', `executed "${goalRowText}"; Composer cleared of claim; no Agent submission`)

  // Fixture hygiene: the A-step clear truncates transcripts of sessions the
  // Host has open. Leave current on the sacrificial blank Hero session so a
  // later run's clear cannot eat the content-bearing D/E fixture.
  await page.evaluate(sessionId => window.__paletteTest.sessions.open(sessionId), heroSessionId)
  result.sacrificialCurrent = heroSessionId

  await pressAltQ()
  await expect(floating).toBeVisible()
  await expect(morph).toHaveCount(0)
  await page.keyboard.press('Escape')
  pass('Alt+Q remains Global Floating')
  if (result.errors.length) throw new Error(`pageerror: ${result.errors.join(' | ')}`)
  pass('no pageerror')
} catch (error) {
  result.failure = error instanceof Error ? (error.stack ?? error.message) : String(error)
  console.error(result.failure)
  process.exitCode = 1
} finally {
  writeFileSync(`${output}/${runKey}.json`, `${JSON.stringify(result, null, 2)}\n`)
  await browser.close()
}
