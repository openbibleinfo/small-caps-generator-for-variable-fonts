const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
let browser;
(async()=>{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  await page.goto(pathToFileURL(path.resolve('index.html')).href);
  await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Ready.'));
  await page.locator('#upload').setInputFiles('fonts/SourceSerif4.ttf');
  await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Loaded'));
  await page.locator('#export-toggle').click();
  assert.equal(await page.locator('#native-toggle-label').textContent(),'Built-in');
  assert(await page.locator('#width-builtin').isVisible());
  const data='data:font/ttf;base64,'+fs.readFileSync('fonts/SourceSerif4.ttf').toString('base64');
  for(const [id,value] of [['scale',.7],['weight',650],['tracking',.04],['gap',.04]]) {
    await page.locator('#'+id).evaluate((input,value)=>{input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));},value);
    if(id!=='gap')await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Loaded'));
  }
  for(const initial of ['smcp','c2sc'])for(const [mode,preview] of [['none','naive'],['builtin','native']]){
    await page.locator('#initial-mode').selectOption(initial);
    await page.locator(`#width-${mode}`).click();
    const recipe=await page.locator('#export').textContent();
    assert(!recipe.includes('<script>'));
    assert(!recipe.includes('scaleX'));
    if(mode==='none'){
      assert(recipe.includes(`font-variant: ${initial==='c2sc'?'all-small-caps':'small-caps'}`));
      assert(recipe.includes('font-synthesis: small-caps'));
      const styles=await page.locator('#size-ladder > .ladder-row:first-child .ladder-naive .sc-word').evaluate(e=>({size:getComputedStyle(e).fontSize,parent:getComputedStyle(e.parentElement).fontSize,variant:getComputedStyle(e).fontVariantCaps,synthesis:getComputedStyle(e).fontSynthesis}));
      assert.equal(styles.size,styles.parent);
      assert.equal(styles.variant,initial==='c2sc'?'all-small-caps':'small-caps');
      assert.equal(styles.synthesis,'small-caps');
    }
    assert.equal(await page.locator('#javascript-export').isVisible(),false);
    const exported=await browser.newPage({javaScriptEnabled:false});
    await exported.setContent(recipe.replace('FONT_URL',data));
    await exported.evaluate(()=>document.fonts.ready);
    await exported.locator('.smcp-text').evaluate(e=>e.style.fontSize='48px');
    const actual=await exported.locator('.smcp').boundingBox();
    const expected=await page.locator(`#size-ladder > .ladder-row:first-child .ladder-${preview} .sc-word`).boundingBox();
    assert(Math.abs(actual.width-expected.width)<.2,`${mode}/${initial}: ${actual.width} vs ${expected.width}`);
    await exported.close();
  }
  await page.locator('#upload').setInputFiles('fonts/InterVariable.woff2');
  await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Loaded Inter'));
  assert.equal(await page.locator('#width-builtin').isVisible(),false);
  assert.notEqual(await page.locator('#transform-width-mode [aria-selected=true]').getAttribute('data-width-mode'),'builtin');
  await page.locator('#width-none').focus();await page.locator('#width-none').press('ArrowRight');
  assert.equal(await page.locator('#width-unscaled').getAttribute('aria-selected'),'true');
  await browser.close();
  console.log('Naive and built-in exports match previews without JavaScript; unavailable built-in export is hidden.');
})().catch(async e=>{console.error(e);await browser?.close();process.exitCode=1;});
