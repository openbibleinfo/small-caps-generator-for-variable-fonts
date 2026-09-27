const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
let browser;
(async()=>{
  browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,headless:true});
  const page=await browser.newPage();
  await page.goto(pathToFileURL(path.resolve('index.html')).href);
  await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Ready.'));
  await page.locator('.source details:not(#font-summary) summary').click();
  await page.locator('#upload').setInputFiles('fonts/SourceSans3.ttf');
  await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Loaded'),{},{timeout:60000});
  await page.locator('#export-toggle').click();
  assert.equal(await page.locator('#width-method').inputValue(),'auto');
  assert.match(await page.locator('#export').textContent(),/transform: scaleX/);
  await page.locator('#width-method').selectOption('unscaled');
  const original=await page.locator('#export').textContent();
  await page.locator('#width-method').selectOption('transform');
  const data='data:font/ttf;base64,'+fs.readFileSync('fonts/SourceSans3.ttf').toString('base64');
  for(const initial of ['smcp','c2sc']) for(const mode of ['precomputed','javascript']) {
    const js=mode==='javascript',corrected=mode!=='none';
    await page.locator('#initial-mode').selectOption(initial);
    if(initial==='smcp'){await page.locator('#gap-out').fill('0.05');await page.locator('#gap-out').press('Enter');}
    assert.equal(await page.locator('#gap').isDisabled(),initial==='c2sc');
    await page.locator(`[data-width-mode="${mode}"]`).click();
    const recipe=await page.locator('#export').textContent();
    assert.match(recipe,/transform: scaleX/);
    assert.doesNotMatch(recipe,/smcp-width|\d+\.\d{5,}/);
    assert.equal(recipe.includes('<script>'),js);
    assert.equal(await page.locator('#javascript-export').isVisible(),js);
    if(js){
      const script=await page.locator('#js-export').textContent();
      assert(script.includes('ResizeObserver'));
      assert(recipe.includes('<script>\n'+script+'\n</script>'));
      assert.equal(await page.locator('#copy').textContent(),'Copy HTML + CSS + JavaScript');
    }
    assert.equal(await page.locator('#size-ladder > .ladder-row:first-child .ladder-transformed .transform-word').count(),1);
    const preview=await page.locator('#size-ladder > .ladder-row:first-child .ladder-transformed .sc-rest').evaluate(e=>({visible:e.getBoundingClientRect().width,reserved:e.parentElement.getBoundingClientRect().width}));
    assert(Math.abs(preview.visible-preview.reserved)<.1,'Export width handling must not change the preview');
    if(mode==='precomputed')assert.match(recipe,/data-word="LORD".*margin-right: [\d.]+em/);
    const exported=await browser.newPage({javaScriptEnabled:js});const errors=[];
    exported.on('pageerror',e=>errors.push(e.message));
    await exported.setContent(recipe.replace('FONT_URL',data));
    await exported.evaluate(()=>document.fonts.ready);
    if(js)await exported.waitForFunction(()=>{
      const e=document.querySelector('.smcp-rest'),s=getComputedStyle(e);return Math.abs(e.getBoundingClientRect().width-parseFloat(s.width)-parseFloat(s.marginRight))<.1;
    });
    const measure=()=>exported.locator('.smcp-rest').evaluate(e=>({visible:e.getBoundingClientRect().width,reserved:parseFloat(getComputedStyle(e).width)+parseFloat(getComputedStyle(e).marginRight)}));
    const initialGap=await exported.locator('.smcp-rest').evaluate(e=>parseFloat(getComputedStyle(e).marginLeft));
    assert(Math.abs(initialGap-(initial==='smcp'?.9:0))<.01,'Exported initial gap uses full-size em units');
    const m=await measure();assert(corrected?Math.abs(m.visible-m.reserved)<.1:m.visible-m.reserved>.5);
    assert.equal(await exported.locator('.smcp-text').textContent(),initial==='smcp'?'The Lord is my shepherd':'The lord is my shepherd');
    if(corrected){
      await exported.locator('.smcp-text').evaluate(e=>e.style.fontSize='36px');
      // Baked em margins scale; glyph advances may round differently at a new size.
      await exported.waitForFunction(tolerance=>{const e=document.querySelector('.smcp-rest'),s=getComputedStyle(e);return Math.abs(e.getBoundingClientRect().width-parseFloat(s.width)-parseFloat(s.marginRight))<tolerance;},js?.1:.25);
      assert((await measure()).reserved>m.reserved*1.9);
    }
    assert.deepEqual(errors,[]);await exported.close();
  }
  await page.locator('#initial-mode').selectOption('smcp');
  await page.locator('#gap-out').fill('0');await page.locator('#gap-out').press('Enter');
  await page.locator('#width-method').selectOption('unscaled');
  assert.equal(await page.locator('#export').textContent(),original);
  await page.locator('#width-method').selectOption('auto');
  await page.locator('[data-width-mode="precomputed"]').click();
  await page.locator('#sample').fill('The LORD and GOD, LORD.');
  const multiple=await page.locator('#export').textContent();
  assert.equal((multiple.match(/> \.smcp-rest \{ margin-right:/g)||[]).length,2);
  assert.equal((multiple.match(/class="smcp-transform"/g)||[]).length,3);
  const ordinaryWidths=()=>page.locator('#size-ladder > .ladder-row:first-child .ladder-calibrated, #size-ladder > .ladder-row:first-child .ladder-transformed').evaluateAll(elements=>elements.map(element=>[...element.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(node=>{
    const range=document.createRange();range.selectNodeContents(node);return range.getBoundingClientRect().width;
  })));
  const ordinary=await ordinaryWidths();
  const wordWidths=[];
  for(const tracking of [-.12,.12]) {
    await page.locator('#tracking-out').fill(String(tracking));
    await page.locator('#tracking-out').press('Enter');
    await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Loaded'));
    assert.equal(await page.locator('#tracking').getAttribute('min'),'-0.12');
    assert.equal(await page.locator('#tracking').getAttribute('max'),'0.12');
    assert.deepEqual(await ordinaryWidths(),ordinary,'Tracking must not change the widths of ordinary text or spaces');
    for(const selector of ['#size-ladder > .ladder-row:first-child .ladder-calibrated .sc-word','#size-ladder > .ladder-row:first-child .ladder-transformed .sc-rest','.ladder-calibrated .sc-word','.ladder-transformed .sc-rest','#size-ladder > .ladder-row:first-child .ladder-native .sc-word','.ladder-native .sc-word']) {
      const values=await page.locator(selector).evaluateAll(elements=>elements.map(e=>{const s=getComputedStyle(e);return parseFloat(s.letterSpacing)/parseFloat(s.fontSize);}));
      assert(values.length&&values.every(value=>Math.abs(value-tracking)<.0001),selector);
    }
    wordWidths.push(await page.locator('#size-ladder > .ladder-row:first-child .ladder-transformed .sc-rest').first().evaluate(e=>e.getBoundingClientRect().width));
    const trackedRecipe=await page.locator('#export').textContent();
    assert(trackedRecipe.includes(`letter-spacing: ${tracking}em`));
    const trackedExport=await browser.newPage({javaScriptEnabled:false});
    await trackedExport.setContent(trackedRecipe.replace('FONT_URL',data));
    await trackedExport.evaluate(()=>document.fonts.ready);
    const layout=await trackedExport.locator('.smcp-rest').first().evaluate(e=>{
      const s=getComputedStyle(e);return {visible:e.getBoundingClientRect().width,reserved:parseFloat(s.width)+parseFloat(s.marginRight),tracking:parseFloat(s.letterSpacing)/parseFloat(s.fontSize)};
    });
    assert(Math.abs(layout.visible-layout.reserved)<.1,'Tracking must update precomputed scaleX width correction');
    assert(Math.abs(layout.tracking-tracking)<.0001);
    assert.equal(await trackedExport.locator('.smcp-text').evaluate(e=>getComputedStyle(e).letterSpacing),'normal');
    await trackedExport.close();
    await page.locator('#width-method').selectOption('unscaled');
    assert((await page.locator('#css-export').textContent()).includes(`letter-spacing: ${tracking}em`));
    await page.locator('#width-method').selectOption('auto');
  }
  assert(wordWidths[1]>wordWidths[0],'scaleX words should widen with positive tracking');
  assert.match(await page.locator('#width-label').textContent(),/scaleX/);
  await page.locator('#width-out').fill('1.2');
  await page.locator('#width-out').press('Enter');
  assert.match(await page.locator('#size-ladder > .ladder-row:first-child .ladder-transformed .sc-rest').first().evaluate(e=>getComputedStyle(e).transform),/^matrix\(1\.2,/);
  assert.match(await page.locator('#size-ladder > .ladder-row:first-child .ladder-transformed .sc-rest').first().evaluate(e=>getComputedStyle(e).transform),/^matrix\(1\.2,/);
  assert.match(await page.locator('#css-export').textContent(),/scaleX\(1\.2\)/);
  assert.equal(await page.locator('#evidence-mode').textContent(),'scaleX output');
  const outputFit=JSON.parse(await page.locator('#diagnostics').textContent()).outputSettings;
  const outlineScale=await page.locator('#glyphs svg').first().locator('path[fill="#285943"]').getAttribute('transform');
  assert(outlineScale.includes(`scale(${outputFit.scale*1.2},${-outputFit.scale})`),'Outline comparison must use the scaleX output scale');
  const scaledPath=await page.locator('#glyphs svg').first().locator('path[fill="#285943"]').getAttribute('d');
  await page.locator('#width-method').selectOption('unscaled');
  assert.equal(await page.locator('#evidence-mode').textContent(),'unscaled output');
  assert.notEqual(await page.locator('#glyphs svg').first().locator('path[fill="#285943"]').getAttribute('d'),scaledPath,'Independent fits must use their own candidate outlines');
  await page.locator('#width-method').selectOption('auto');
  const adjusted=await browser.newPage({javaScriptEnabled:false});
  await adjusted.setContent((await page.locator('#export').textContent()).replace('FONT_URL',data));
  await adjusted.evaluate(()=>document.fonts.ready);
  const widthDifference=await adjusted.locator('.smcp-rest').first().evaluate(e=>{
    const s=getComputedStyle(e);return e.getBoundingClientRect().width-parseFloat(s.width)-parseFloat(s.marginRight);
  });
  assert(Math.abs(widthDifference)<.1,`Manual scaleX must update exported width correction: ${widthDifference}; ${await adjusted.locator('.smcp-rest').first().getAttribute('style')}; ${await page.locator('#css-export').textContent()}`);
  await adjusted.close();
  await page.locator('#tracking-out').fill('0.02');
  await page.locator('#tracking-out').press('Enter');
  await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Loaded'));
  assert.equal(await page.locator('#width').inputValue(),'1.2','Other manual changes must preserve scaleX');
  await page.locator('#fit').click();
  await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Loaded'));
  assert.notEqual(await page.locator('#width').inputValue(),'1.2','Refitting must restore automatic scaleX');
  const widthFont=process.env.SMALLCAPS_WIDTH_FONT||'/tmp/smallcaps-top50-audit/roboto.ttf';
  if(fs.existsSync(widthFont)) {
    await page.locator('#upload').setInputFiles(widthFont);
    await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Loaded')&&!document.querySelector('#width').disabled,{},{timeout:60000});
    assert.doesNotMatch(await page.locator('#export').textContent(),/scaleX|<script>/);
    assert.match(await page.locator('#width-label').textContent(),/wdth/);
    assert.equal(await page.locator('#width-javascript').isVisible(),false);
    assert.equal(await page.locator('#evidence-mode').textContent(),'wdth output');
    await page.locator('#width-out').fill(await page.locator('#width').getAttribute('min'));
    await page.locator('#width-out').press('Enter');
    await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Loaded'));
    assert.match(await page.locator('#css-export').textContent(),/"wdth"/);
    assert.match(await page.locator('#transform-mode-note').textContent(),/fitted wdth axis/);
    await page.locator('#width-method').selectOption('transform');
    assert.match(await page.locator('#export').textContent(),/scaleX/);
    const chosenWidth=+await page.locator('#width').inputValue();
    for(const selector of ['#size-ladder > .ladder-row:first-child .ladder-calibrated .sc-word','#size-ladder > .ladder-row:first-child .ladder-transformed .sc-rest','#size-ladder > .ladder-row:first-child .ladder-native .sc-word','.ladder-transformed .sc-rest','.ladder-native .sc-word']) {
      const variations=await page.locator(selector).evaluateAll(elements=>elements.map(e=>getComputedStyle(e).fontVariationSettings));
      assert(variations.length&&variations.every(value=>value.includes(`"wdth" ${chosenWidth}`)),selector);
    }
    const widthData='data:font/ttf;base64,'+fs.readFileSync(widthFont).toString('base64');
    for(const [mode,selector] of [['precomputed','#size-ladder > .ladder-row:first-child .ladder-transformed .sc-word'],['builtin','#size-ladder > .ladder-row:first-child .ladder-native .sc-word']]) {
      await page.locator(`[data-width-mode="${mode}"]`).click();
      const exported=await browser.newPage({javaScriptEnabled:false});
      await exported.setContent((await page.locator('#export').textContent()).replace('FONT_URL',widthData));
      await exported.evaluate(()=>document.fonts.ready);
      await exported.locator('.smcp-text').evaluate(e=>e.style.fontSize='48px');
      const actual=await exported.locator(mode==='builtin'?'.smcp':'.smcp-transform').first().boundingBox();
      const expected=await page.locator(selector).first().boundingBox();
      assert(Math.abs(actual.width-expected.width)<.2,`${mode} manual wdth export: ${actual.width} vs ${expected.width}`);
      await exported.close();
    }
    console.log('Automatic wdth selection and explicit scaling override passed.');
  }
  console.log('Transform export checks passed: both initial modes, precomputed CSS without JS, runtime JS, resizing, unchanged unscaled recipe.');
  await browser.close();
})().catch(async error=>{console.error(error);await browser?.close();process.exitCode=1;});
