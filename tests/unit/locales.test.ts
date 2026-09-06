import { test } from 'node:test'
import assert from 'node:assert/strict'
import { en, zh, ageText, presentItem, type PaletteTranslate } from '../../src/client/locales.ts'
const t: PaletteTranslate = (key, params={}) => zh[key].replace(/\{(\w+)\}/g, (_,key) => String(params[key]))
test('locale dictionaries have balanced keys and owned metadata is translated without changing names/actions', () => {
  assert.deepEqual(Object.keys(en).sort(),Object.keys(zh).sort())
  const action = {id:'run',title:'Run',run(){}}
  const item = presentItem({id:'models:pro',providerId:'models',kind:'model',title:'DeepSeek-V4-Pro',subtitle:'English description',source:'DeepSeek',badges:['current'],primary:action},t,true)
  assert.equal(item.title,'DeepSeek-V4-Pro')
  assert.equal(item.subtitle,'DeepSeek · 选择此模型')
  assert.deepEqual(item.badges,['当前'])
  assert.equal(item.primary,action)
  assert.equal(ageText(Date.now()-16*3600000,t),'16小时前')
})
