import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import ts from 'typescript'
import { transform } from 'lightningcss'
import { chromium } from '@playwright/test'
import { en } from '../../src/client/locales.ts'

const require = createRequire(import.meta.url)
const compile = (file: string) => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
}).outputText

test('React browser: stable input/caret, Escape stack, toggle, outside click pass-through and focus', async t => {
  let browser: import('@playwright/test').Browser
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true })
  } catch {
    // Real-browser acceptance needs Windows Edge; CI on Linux skips it and
    // the same surface is covered by scripts/smoke-dsh.mjs on a real DSH box.
    return t.skip('requires Microsoft Edge (real-browser test)')
  }
  try {
    const page = await browser.newPage({ viewport: { width: 1792, height: 896 } })
    await page.setContent('<button id="sidebar">Sidebar</button><button id="workspace" style="position:absolute;right:20px;bottom:20px">Workspace</button><div id="mount"></div>')
    for (const name of ['react', 'react-dom']) await page.addScriptTag({ content: readFileSync(join(dirname(require.resolve(`${name}/package.json`)), `umd/${name}.development.js`), 'utf8') })
    const sheet = transform({ filename: 'palette.module.css', code: readFileSync(new URL('../../src/client/UniversalPalette.module.css', import.meta.url)), cssModules: true })
    const styles = { __esModule: true, default: Object.fromEntries(Object.entries(sheet.exports!).map(([key, value]) => [key, value.name])), cssText: sheet.code.toString() }
    await page.addScriptTag({ content: `
      const styles = ${JSON.stringify(styles)};
      const require = id => id === 'react' ? React : id.endsWith('.css') ? styles : id.endsWith('locales.ts') ? {ageText:()=>''} : new Proxy({}, {get: () => () => React.createElement('svg', {width:16,height:16})});
      const ui = {exports:{}};
      ((module, exports) => {${compile('../../src/client/UniversalPalette.tsx')}})(ui, ui.exports);
      const keyboard = {exports:{}};
      ((module, exports) => {${compile('../../src/client/keyboard.ts')}})(keyboard, keyboard.exports);
      let clicks = 0;
      const original = document.querySelector('#sidebar'); original.focus();
      document.querySelector('#workspace').onclick = original.onclick = () => clicks++;
      function App() {
        const [open, setOpen] = React.useState(false), [panel, setPanel] = React.useState(false), [query, setQuery] = React.useState(''), [selected, setSelected] = React.useState(0);
        const live = React.useRef({open, panel}); live.current = {open, panel};
        const close = () => { setOpen(false); setPanel(false); original.focus(); };
        React.useEffect(() => keyboard.exports.attachKeyboard({shortcut:'Ctrl+Shift+K', isOpen:()=>live.current.open,
          onOpen:()=>setOpen(true), onClose:close, onEscape:()=>live.current.panel ? setPanel(false) : close()}).dispose, []);
        window.probe = {open, panel, get clicks() { return clicks }};
        return open ? React.createElement(ui.exports.UniversalPalette, { t:key=>(${JSON.stringify(en)})[key], query, sidebarWide:true, isLoading:false, isEmpty:false,
          guidance:'选择工作区开始', contextHint:'Commands require an active session',
          items:[{item:{id:'test-session',kind:'session', title:'Test Session', primary:{run(){}}, secondary:[{id:'inspect',title:'Inspect',run(){}}]},score:0,matchRanges:[]}],
          selectedIndex:selected, onSelectedIndexChange:setSelected, onQueryChange:setQuery, onClose:close,
          onRunPrimary(){}, onRunSecondary(){}, onOpenActionPanel:()=>setPanel(true), onCloseActionPanel:()=>setPanel(false),
          actionPanelOpen:panel, actionPanelSelectedIndex:0, onActionPanelIndexChange(){}, conflicts:[] }) : null;
      }
      ReactDOM.createRoot(document.querySelector('#mount')).render(React.createElement(App));
    ` })
    await page.waitForFunction(() => window.probe !== undefined)
    await page.keyboard.press('Control+Shift+K')
    const input = page.getByRole('combobox')
    await input.evaluate(el => { window.initialInput = el })
    await input.fill('stable input')
    await page.keyboard.press('Home')
    await page.keyboard.type('a')
    assert.equal(await input.inputValue(), 'astable input')
    assert.equal(await input.evaluate(el => el === window.initialInput), true)
    await page.keyboard.press('Tab')
    await page.getByRole('listbox', {name:'Actions'}).waitFor()
    await page.keyboard.press('Escape')
    assert.deepEqual(await page.evaluate(() => [window.probe.open, window.probe.panel]), [true, false])
    await page.keyboard.press('Escape')
    assert.equal(await page.evaluate(() => window.probe.open), false)
    assert.equal(await page.locator('#sidebar').evaluate(el => el === document.activeElement), true)
    await page.keyboard.press('Control+Shift+K')
    await page.keyboard.press('Control+Shift+K')
    assert.equal(await page.evaluate(() => window.probe.open), false)
    for (const id of ['sidebar', 'workspace']) {
      await page.keyboard.press('Control+Shift+K')
      await page.locator(`#${id}`).click({timeout:2000})
      assert.equal(await page.evaluate(() => window.probe.open), false)
    }
    assert.equal(await page.evaluate(() => window.probe.clicks), 2)
    await page.keyboard.press('Control+Shift+K')
    assert.match(await page.getByRole('dialog').innerText(), /Commands require an active session/)
    assert.match(await page.getByRole('dialog').innerText(), /Esc Close/)
    await page.keyboard.press('Escape')
  } finally { await browser.close() }
})
