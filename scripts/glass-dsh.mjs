import { chromium, expect } from '@playwright/test';
import {readFileSync} from 'node:fs';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1792,height:896}});
  // Test-only public activation observation, identical to smoke-dsh.mjs.
  await page.addInitScript(()=>{
    let facade;
    Object.defineProperty(window,'__ModuleLoader__',{configurable:true,get:()=>facade,set(value){
      const wrap=original=>function(registration){
        if(registration.id==='@yunmin311/dsh-universal-palette'){
          const factory=registration.factory;
          registration={...registration,factory(require){const plugin=factory(require);const apply=ctx=>{window.__paletteTest=ctx;return plugin.apply(ctx)};return {...plugin,apply,default:{...plugin.default,apply}}}};
        }
        return original.call(this,registration);
      };
      value.load=wrap(value.load);
      facade=new Proxy(value,{set(target,key,val){target[key]=key==='load'?wrap(val):val;return true}});
    }});
  });
  await page.goto(readFileSync('../.dsh-ux-cold-20260905/logs/ux.stdout.log','utf8').match(/http:\/\/\S+/)[0]);
  await page.waitForTimeout(1500);
  for(const name of ['继续','稍后配置']) if(await page.getByRole('button',{name,exact:true}).isVisible()){
    await page.getByRole('button',{name,exact:true}).click();await page.waitForTimeout(400);
  }
  await page.waitForFunction(()=>window.__paletteTest);
  await page.evaluate(async()=>{
    const c=window.__paletteTest;
    const id=await c.sessions.create({workspaceId:c.workspaces.list.getSnapshot().items[0].workspaceId});
    c.sessions.open(id);
  });
  await page.waitForTimeout(1000);
  const composer=page.getByRole('textbox').last();
  await composer.fill('玻璃透底检查：这是未发送的输入草稿。\n底层仍是 DSH 原生会话输入框。\n文字和输入框边缘应透过浮层轻微可见。\n搜索、会话、模型与历史保持清晰。\n不提交消息，不调用模型。\n截图完成后清除这段草稿。');
  await page.keyboard.press('Control+Shift+K');
  await expect(page.getByRole('dialog',{name:'通用面板'})).toBeVisible();
  await page.waitForTimeout(1000);await page.mouse.move(1700,700);await page.waitForTimeout(300);
  await page.screenshot({path:'evidence/2026-09-05-design-gate/05-glass.png'});
  await page.keyboard.press('Escape');
  await composer.click();await composer.press('Control+A');await composer.press('Backspace');
  await expect(composer).toHaveText('');
}finally{await browser.close()}
