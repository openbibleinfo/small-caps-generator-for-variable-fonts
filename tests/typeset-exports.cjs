const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
let browser;
(async()=>{
  browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route(/^https?:/,r=>r.abort());
  await page.goto(pathToFileURL(path.resolve('index.html')).href);
  await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Ready.'));
  await page.locator('#upload').setInputFiles('fonts/SourceSerif4.ttf');
  await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Loaded'));
  await page.locator('#export-toggle').click();
  for(const [id,value] of [['scale',.7],['weight',650],['tracking',.04],['gap',.03],['reading-size',20]]){
    await page.locator('#'+id).evaluate((e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));},value);
    if(['scale','weight','tracking'].includes(id))await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Loaded'));
  }
  await page.locator('#sample').fill('The LORD & GOD cost $5_#% {yes} \\ ~ ^ é');
  for(const target of ['typst','latex']){
    await page.locator('#export-target').selectOption(target);
    assert(await page.locator('#typeset-export').isVisible());
    assert.equal(await page.locator('#web-export').isVisible(),false);
    assert.equal(await page.locator('#web-recipe').isVisible(),false);
    for(const id of ['width-none','width-javascript'])assert.equal(await page.locator('#'+id).isVisible(),false);
    for(const initial of ['smcp','c2sc'])for(const mode of ['unscaled','precomputed','builtin']){
      await page.locator('#initial-mode').selectOption(initial);
      await page.locator('#width-'+mode).click();
      const code=await page.locator('#typeset-code').textContent();
      const builtin=mode==='builtin',scale=builtin?1:.7,weight=builtin?500:650;
      assert(!/NaN|undefined/.test(code));
      if(target==='typst'){
        assert(code.includes('#let sc-size = 15pt'));
        assert(code.includes(`size: ${15*scale}pt, weight: ${weight}`));
        assert(code.includes(`"wght": ${weight}`));
        assert(code.includes('tracking: '+Number((.04*15*scale).toFixed(4))+'pt'));
        assert(code.includes('#smallcap-word("LORD")'));
        assert.equal(code.includes('upper(word.slice(0, 1))'),initial==='smcp');
        if(mode==='precomputed')assert(code.includes('reflow: true'));
        if(builtin)assert(code.includes('smcp: 1')||code.includes('c2sc: 1'));
      }else{
        assert(code.includes('\\fontsize{15bp}{18bp}'));
        assert(code.includes(`Scale=${scale}`));assert(code.includes(`wght=${weight}`));
        assert(code.includes('LetterSpace=4'));
        assert(code.includes('\\smallcapword{LORD}'));
        assert(!code.includes('\\\\smallcapword'));
        assert(code.includes('\\&'));assert(code.includes('\\$5\\_\\#\\%'));
        assert(code.includes('\\{yes\\}'));assert(code.includes('\\textbackslash{}'));
        assert.equal(code.includes('\\str_head:N'),initial==='smcp');
        if(mode==='precomputed')assert(code.includes('\\scalebox'));
      }
      // The actual source downloaded and copied must equal the displayed recipe.
      const pending=page.waitForEvent('download');await page.locator('#download-typeset').click();
      const download=await pending;
      assert.equal(download.suggestedFilename(),'smallcaps.'+(target==='typst'?'typ':'tex'));
      assert.equal(await fs.readFile(await download.path(),'utf8'),code);
      await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedRecipe=text;}}}));
      await page.locator('#copy-typeset').click();assert.equal(await page.evaluate(()=>window.copiedRecipe),code);
    }
  }
  await page.locator('#export-target').selectOption('web');
  assert(await page.locator('#web-export').isVisible());assert.equal(await page.locator('#typeset-export').isVisible(),false);
  await page.locator('#width-none').click();await page.locator('#export-target').selectOption('typst');
  assert.notEqual(await page.locator('#transform-width-mode [aria-selected=true]').getAttribute('data-width-mode'),'none');
  await page.locator('#upload').setInputFiles('fonts/InterVariable.woff2');
  await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Loaded'));
  assert.equal(await page.locator('#width-builtin').isVisible(),false);
  assert(!/NaN|undefined/.test(await page.locator('#typeset-code').textContent()));
  assert.deepEqual(errors,[]);await browser.close();
  console.log('Typst/LuaLaTeX settings, recipes, initial modes, escaping, downloads, copy and target switching passed (no compiler check).');
})().catch(async error=>{console.error(error);await browser?.close();process.exitCode=1;});
