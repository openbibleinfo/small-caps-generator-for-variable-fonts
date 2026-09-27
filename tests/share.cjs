const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
let browser;
(async()=>{
  browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const {readShareURL}=await import('../src/share-state.js');
  const base=pathToFileURL(path.resolve('index.html')).href;
  const font=fs.readFileSync('fonts/SourceSans3.ttf'),errors=[];
  let requests=0;
  await context.route(/^https?:/,async route=>{
    const url=route.request().url();requests++;
    if(url.startsWith('https://fonts.googleapis.com/'))return route.fulfill({contentType:'text/css',body:'@font-face{font-style:normal;font-weight:200 900;src:url(https://fonts.gstatic.com/share-test.ttf);unicode-range:U+0000-00FF;}'});
    if(url==='https://fonts.gstatic.com/share-test.ttf'||url==='https://example.com/share-font.ttf')return route.fulfill({body:font});
    return route.abort();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Ready.'));
  assert(await page.locator('#share').isDisabled());
  const loaded=p=>p.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Loaded'));
  const set=async(id,value,measure=true)=>{await page.locator('#'+id).evaluate((e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));},value);if(measure)await loaded(page);};
  const snapshot=p=>p.evaluate(()=>{
    const ids=['target','width-method','initial-mode','optical-policy','scale','weight','width','tracking','gap','size','reading-size','export-target','sample','corpus-cohort','corpus-measure','corpus-weight','corpus-opsz'];
    return {numbersVisible:document.getElementById('corpus-numbers').checked,view:document.getElementById('research-tab').getAttribute('aria-selected'),exportOpen:document.getElementById('export-toggle').getAttribute('aria-expanded'),controls:Object.fromEntries(ids.map(id=>[id,document.getElementById(id).value])),
      visible:[...document.querySelectorAll('[data-preview-toggle]')].map(e=>[e.dataset.previewToggle,e.checked]),
      overlay:['overlay-first','overlay-second'].map(id=>document.getElementById(id).value),
      axes:[...document.querySelectorAll('[data-axis]')].map(e=>[e.dataset.axis,e.value]),
      recipe:document.querySelector('#transform-width-mode [aria-selected=true]').dataset.widthMode,
      typeset:document.getElementById('typeset-code').textContent,
      weights:['calibrated','transformed','native'].map(id=>getComputedStyle(document.querySelector('.ladder-row:first-child .ladder-'+id+' .sc-word, .ladder-row:first-child .ladder-'+id+' .sc-rest')).fontVariationSettings)};
  });
  for(const source of ['url','google','file']){
    if(source==='file'){await page.locator('#upload').setInputFiles('fonts/SourceSans3.ttf');await loaded(page);}
    else {
      await page.locator('#google-font').fill(source==='url'?'https://example.com/share-font.ttf':'Open Sans');
      if(source==='url')await page.locator('#google-load').click();
      await page.waitForFunction(()=>!document.querySelector('#google-load').disabled);await loaded(page);
    }
    await page.locator('#width-method').selectOption('transform');
    await page.locator('#sample').fill('The LORD & GOD — café <test> # + ?');
    await set('axis-wght',550);
    for(const [id,value] of [['scale',.74],['weight',640],['tracking',.04],['width',1.08]])await set(id,value);
    await set('gap',.02,false);await set('reading-size',22,false);await set('size',36,false);
    await page.locator('#initial-mode').selectOption('c2sc');
    await page.locator('[data-preview-toggle="naive"]').uncheck();
    await page.locator('#comparison-overlay-tab').click();
    await page.locator('#overlay-first').selectOption('calibrated');
    await page.locator('#comparison-size-tab').click();
    if(await page.locator('#export-toggle').getAttribute('aria-expanded')!=='true')await page.locator('#export-toggle').click();
    await page.locator('#export-target').selectOption('typst');
    await page.locator('#width-precomputed').click();
    const expected=await snapshot(page);
    await page.locator('#share').click();
    const url=await page.locator('#share-url').inputValue();
    const state=readShareURL(url);assert.equal(state.source.kind,source==='file'?'google':source);
    assert.equal(state.overrides.weight,640);
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.sharedCopy=text;}}}));
    await page.locator('#share-copy').click();assert.equal(await page.evaluate(()=>window.sharedCopy),url);
    await page.locator('#share-close').click();
    const restored=await context.newPage();restored.on('pageerror',e=>errors.push(e.message));await restored.goto(source==='file'?base+'?settings='+encodeURIComponent(JSON.stringify({...state,source:{kind:'file',value:'Source Sans 3'}})):url);
    if(source==='file'){
      await restored.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Shared settings ready'));
      await restored.locator('#upload').setInputFiles('fonts/SourceSans3.ttf');
    }
    await restored.waitForFunction(()=>document.querySelector('#status').textContent.includes('shared settings applied'));
    assert.deepEqual(await snapshot(restored),expected,source+' settings and export round trip');
    await restored.close();
  }
  // Automatic values remain automatic: no override is manufactured by sharing.
  await page.locator('#fit').click();await loaded(page);
  await page.locator('#research-tab').click();
  await page.locator('#corpus-cohort').selectOption('top100');
  await page.locator('#corpus-measure').selectOption('tracking');
  await page.locator('#corpus-weight').selectOption('700');
  await page.locator('#corpus-numbers').uncheck();
  const automatic=await snapshot(page);
  await page.locator('#share').click();
  const autoURL=await page.locator('#share-url').inputValue();
  const auto=readShareURL(autoURL);
  assert.deepEqual(auto.overrides,{});await page.locator('#share-close').click();
  const restoredAuto=await context.newPage();await restoredAuto.goto(base+'?settings='+encodeURIComponent(JSON.stringify({...auto,source:{kind:'file',value:'Source Sans 3'}})));
  await restoredAuto.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Shared settings ready'));
  await restoredAuto.locator('#upload').setInputFiles('fonts/SourceSans3.ttf');
  await restoredAuto.waitForFunction(()=>document.querySelector('#status').textContent.includes('shared settings applied'));
  assert.deepEqual(await snapshot(restoredAuto),automatic,'Automatic recipe and research settings round trip');await restoredAuto.close();
  await page.setViewportSize({width:390,height:844});await page.locator('#share').click();
  assert(await page.locator('#share-url').isVisible());
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Share dialog fits mobile viewport');
  await page.locator('#share-close').click();
  const before=requests;
  await page.goto(base+'?settings='+encodeURIComponent('{"v":1,"source":{"kind":"url","value":"javascript:alert(1)"}}'));
  await page.waitForFunction(()=>document.querySelector('#status').classList.contains('error'));
  assert.equal(requests,before,'Invalid links must not fetch a font');assert.deepEqual(errors,[]);
  await browser.close();console.log('Share dialog/copy, URL and Google loading, file handoff, Unicode text, settings/export round trips, automatic values and invalid links passed.');
})().catch(async error=>{console.error(error);await browser?.close();process.exitCode=1;});
