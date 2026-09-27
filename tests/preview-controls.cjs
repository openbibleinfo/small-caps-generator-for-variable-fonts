const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
let browser;
(async()=>{
  browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,headless:true});
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(pathToFileURL(path.resolve('index.html')).href);
  await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Ready.'));
  const drop=async(names,bytes)=>{
    const dataTransfer=await page.evaluateHandle(({names,bytes})=>{
      const transfer=new DataTransfer();
      for(const name of names)transfer.items.add(new File([Uint8Array.from(bytes)],name));
      return transfer;
    },{names,bytes:[...bytes]});
    await page.dispatchEvent('#google-font','dragover',{dataTransfer});
    assert.match(await page.locator('#google-font').getAttribute('class'),/font-drop-active/);
    await page.dispatchEvent('#google-font','drop',{dataTransfer});
    assert.doesNotMatch(await page.locator('#google-font').getAttribute('class'),/font-drop-active/);
    await dataTransfer.dispose();
  };
  await drop(['SourceSans3.ttf'],fs.readFileSync('fonts/SourceSans3.ttf'));
  await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Loaded'));
  const fontName=await page.locator('#diagnostics').evaluate(e=>JSON.parse(e.textContent).font);
  await drop(['notes.txt'],Buffer.from('not a font'));
  assert.match(await page.locator('#status').textContent(),/Choose a TTF/);
  await drop(['one.ttf','two.ttf'],Buffer.from('not a font'));
  assert.match(await page.locator('#status').textContent(),/one font file/);
  assert.equal(await page.locator('#diagnostics').evaluate(e=>JSON.parse(e.textContent).font),fontName);
  const lines=['all-caps','naive','calibrated','transformed','native'];
  const exported=await page.locator('#export').textContent();
  for(const name of lines){
    const toggle=page.locator(`[data-preview-toggle="${name}"]`);
    await toggle.uncheck();
    assert.equal(await page.locator(`[data-preview-line="${name}"]:visible`).count(),0);
    await toggle.check();
    assert.equal(await page.locator(`#size-ladder [data-preview-line="${name}"]:visible`).count(),10);
  }
  assert.equal(await page.locator('#export').textContent(),exported,'Visibility does not change exports');
  for(const name of lines)await page.locator(`[data-preview-toggle="${name}"]`).uncheck();
  assert.equal(await page.locator('.ladder-row:visible').count(),0);
  await page.locator('#sample').fill('The LORD and GOD');
  assert.equal(await page.locator('[data-preview-line]:visible').count(),0);
  await page.locator('#upload').setInputFiles('fonts/SourceSerif4.ttf');
  await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Loaded'));
  assert.equal(await page.locator('[data-preview-line]:visible').count(),0);
  for(const name of lines)await page.locator(`[data-preview-toggle="${name}"]`).check();
  const restored=await page.locator('#size-ladder > .ladder-row:first-child .ladder-transformed .sc-rest').first().evaluate(rest=>({
    visible:rest.getBoundingClientRect().width,reserved:rest.parentElement.getBoundingClientRect().width
  }));
  assert(restored.visible>0);
  assert(Math.abs(restored.visible-restored.reserved)<.2,'Hidden previews retain transformed widths after rerender');
  // Manual height applies to fitted small caps; built-in heights remain unchanged.
  const heights=()=>page.evaluate(()=>{
    const size=selector=>parseFloat(getComputedStyle(document.querySelector(selector)).fontSize);
    return {fit:size('#size-ladder > .ladder-row:first-child .ladder-calibrated .sc-word'),scaled:size('#size-ladder > .ladder-row:first-child .ladder-transformed .sc-rest'),
      native:size('#size-ladder > .ladder-row:first-child .ladder-native .sc-word'),naive:size('#size-ladder > .ladder-row:first-child .ladder-naive .sc-word'),plain:size('#size-ladder > .ladder-row:first-child .ladder-all-caps'),
      ladderScaled:size('.ladder-transformed .sc-rest'),ladderNative:size('.ladder-native .sc-word')};
  });
  const beforeHeight=await heights();
  const oldScale=+await page.locator('#scale').inputValue();
  const newScale=oldScale*.9;
  await page.locator('#scale').evaluate((input,value)=>{input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));},newScale);
  await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Loaded'));
  const afterHeight=await heights(),actualScale=+await page.locator('#scale').inputValue();
  assert(Math.abs(afterHeight.fit/beforeHeight.fit-actualScale/oldScale)<.002);
  assert.equal(afterHeight.native,beforeHeight.native);
  assert(Math.abs(afterHeight.scaled/afterHeight.plain-actualScale)<.002);
  assert(Math.abs(afterHeight.ladderScaled/48-actualScale)<.002);
  assert.equal(afterHeight.ladderNative,beforeHeight.ladderNative);
  assert.equal(afterHeight.naive,beforeHeight.naive);
  assert.equal(afterHeight.plain,beforeHeight.plain);
  for(const [id,value] of [['weight',650],['tracking',.06]]) {
    await page.locator('#'+id).evaluate((input,value)=>{input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));},value);
    await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Loaded'));
  }
  for(const selector of ['#size-ladder > .ladder-row:first-child .ladder-calibrated .sc-word','#size-ladder > .ladder-row:first-child .ladder-transformed .sc-rest','#size-ladder > .ladder-row:first-child .ladder-native .sc-word']) {
    const style=await page.locator(selector).first().evaluate(e=>({weight:getComputedStyle(e).fontWeight,tracking:parseFloat(getComputedStyle(e).letterSpacing)/parseFloat(getComputedStyle(e).fontSize)}));
    assert.equal(+style.weight,selector.includes('#size-ladder > .ladder-row:first-child .ladder-native')?500:650);
    assert(Math.abs(style.tracking-.06)<.001);
  }
  for(const selector of ['#size-ladder > .ladder-row:first-child .ladder-calibrated .sc-word','#size-ladder > .ladder-row:first-child .ladder-native .sc-word']) {
    const initial=await page.locator(selector).first().evaluate(e=>({size:parseFloat(getComputedStyle(e,'::first-letter').fontSize),weight:getComputedStyle(e,'::first-letter').fontWeight,tracking:getComputedStyle(e,'::first-letter').letterSpacing}));
    assert(Math.abs(initial.size-afterHeight.plain)<.01,'Full-size initial keeps its size');
    assert.equal(+initial.weight,500,'Full-size initial keeps text weight');
    assert.equal(parseFloat(initial.tracking)||0,0,'Full-size initial has no small-cap tracking');
  }
  const manualDiagnostic=JSON.parse(await page.locator('#diagnostics').textContent());
  assert.equal(manualDiagnostic.outputSettings.weight,650);
  await page.locator('#fit').click();
  await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Loaded'));
  assert(Math.abs((await heights()).native-beforeHeight.native)<.01);
  const unchanged=await page.evaluate(()=>({weight:document.querySelector('#weight').value,target:document.querySelector('#target').value,width:document.querySelector('#width').value}));
  const expectedXHeight=await page.locator('#metrics .metric strong').first().textContent();
  await page.locator('#set-xheight').click();
  await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Loaded'));
  assert(Math.abs(+await page.locator('#scale').inputValue()-+expectedXHeight)<=.0005);
  assert.equal(await page.locator('#scale-out').getAttribute('aria-label'),'Height scale');
  assert.deepEqual(await page.evaluate(()=>({weight:document.querySelector('#weight').value,target:document.querySelector('#target').value,width:document.querySelector('#width').value})),unchanged);
  assert.deepEqual(errors,[]);
  console.log('Font drop, shared comparison visibility, preserved choices, and restored width checks passed.');
  await browser.close();
})().catch(async error=>{console.error(error);await browser?.close();process.exitCode=1;});
