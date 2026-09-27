const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL}=require('node:url');
const fs=require('node:fs');
const os=require('node:os');
const corpus=JSON.parse(fs.readFileSync('research/corpus.json'));
const familyCount=corpus.fonts.length;
const fixture=name=>path.join(os.tmpdir(),name);
async function until(page,predicate) {
  const end=Date.now()+60000;
  while(Date.now()<end){if(await page.evaluate(predicate))return;await new Promise(r=>setTimeout(r,100));}
  throw Error('Timed out: '+await page.locator('#status').innerText());
}
let browser;
(async () => {
  browser = await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,headless:true});
  const page = await browser.newPage({viewport:{width:1280,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const requests=[];page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  const loadedIDs={};
  const loadFixture=async name=>{
    const files={inter:'InterVariable.woff2',source:'SourceSerif4.ttf',sans:'SourceSans3.ttf'};
    await page.locator('#upload').setInputFiles('fonts/'+files[name]);
    await until(page,()=>document.querySelector('#status').textContent.startsWith('Loaded'));
    loadedIDs[name]=await page.locator('#diagnostics').evaluate(e=>JSON.parse(e.textContent).font);
  };
  await page.goto(pathToFileURL(path.resolve('index.html')).href);
  await until(page,()=>document.querySelector('#status').textContent.startsWith('Ready.'));
  await page.locator('#width-method').selectOption('unscaled',{force:true});
  assert.deepEqual(requests,[]);
  const boot=await page.locator('#boot-data').textContent();
  assert.equal(JSON.parse(boot).samples,undefined);
  assert(fs.statSync('index.html').size<1.5*1024*1024,'Keep font binaries out of the HTML');
  assert.equal(await page.locator('#workspace').isVisible(),false);
  assert.equal(await page.locator('#loaded-fonts option').count(),0);
  assert.equal(await page.locator('#font').count(),0);
  assert.equal(await page.locator('header .eyebrow, header .intro').count(),0);
  assert.equal(await page.locator('h1').innerText(),'Small-caps generator for variable fonts');
  assert.match(await page.locator('header .description').innerText(),/installed or Google fonts/);
  await page.locator('#research-tab').click();
  assert.equal(await page.locator('#corpus-plot svg').isVisible(),true);
  assert.equal(await page.locator('#corpus-plot [data-category]').count(),familyCount);
  await page.locator('#corpus-cohort').selectOption('top300');
  assert.equal(await page.locator('#corpus-plot [data-category]').count(),38);
  await page.locator('#corpus-cohort').selectOption('all');
  await page.locator('#preview-tab').click();
  assert.deepEqual(requests,[]);
  await page.locator('.source details:not(#font-summary) summary').click();
  await loadFixture('inter');
  await until(page,()=>document.querySelector('#workspace').hidden===false);
  assert.match(await page.locator('#smcp-support').textContent(),/Native small-caps \(smcp\): no/);
  await page.screenshot({path:'/tmp/smallcaps-desktop.png',fullPage:true});
  assert.match(await page.locator('#status').innerText(),/Inter/);
  assert.equal(await page.locator('[data-preview-toggle="native"]').isDisabled(),true);
  assert.equal(await page.locator('#native-toggle-label').textContent(),'Built-in (unavailable for this font)');
  assert.equal(await page.locator('.ladder-native').count(),0);
  assert.equal(await page.locator('.ladder-calibrated').first().locator('.sc-word').count(),1);
  assert.equal(await page.locator('#sample').inputValue(),'The LORD is my shepherd');
  const checkComparison=async()=>{
    const geometry=await page.locator('.ladder-pair').first().evaluate(e=>{
      const a=e.querySelector('.ladder-calibrated').getBoundingClientRect(),b=e.querySelector('.ladder-native').getBoundingClientRect(),t=e.querySelector('.ladder-transformed').getBoundingClientRect();
      return {left:a.left-b.left,transformLeft:t.left-a.left,gap:b.top-t.bottom,transformGap:t.top-a.bottom};
    });
    assert(Math.abs(geometry.left)<1);assert(Math.abs(geometry.transformLeft)<1);
    assert(geometry.transformGap>=0);assert(geometry.gap>=0);
  };
  assert.equal(await page.locator('#width').isDisabled(),false);
  assert.equal(await page.locator('#width-out').isDisabled(),false);
  assert.match(await page.locator('#width-label').textContent(),/scaleX/);
  for(const [id,value] of [['weight','650'],['scale','0.8'],['tracking','0.045'],['gap','0.01'],['size','52']]) {
    await page.locator(`#${id}-out`).fill(value);await page.locator(`#${id}-out`).press('Enter');
    await until(page,()=>document.querySelector('#status').textContent.startsWith('Loaded'));
    assert.equal(+await page.locator(`#${id}`).inputValue(),+value);
    assert.equal(+await page.locator(`#${id}-out`).inputValue(),+value);
  }
  await page.locator('#tracking-out').fill('');await page.locator('#tracking-out').press('Tab');
  assert.equal(+await page.locator('#tracking-out').inputValue(),0.045);
  await page.locator('#axes input[type=number]').first().fill('450');
  await page.locator('#axes input[type=number]').first().press('Enter');
  await until(page,()=>document.querySelector('#status').textContent.startsWith('Loaded'));
  assert.equal(await page.locator('#size-ladder > .ladder-row:first-child .ladder-calibrated .sc-word').first().textContent(),'Lord');
  assert.equal(await page.locator('#size-ladder > .ladder-row:first-child .ladder-calibrated .sc-word').first().evaluate(e=>e.children.length),0);
  await loadFixture('source');
  await until(page,()=>!document.querySelector('#workspace').hidden && document.querySelector('#status').textContent.startsWith('Loaded'));
  assert.equal(await page.locator('.ladder-native').first().isVisible(),true);
  assert.equal(await page.locator('#size-ladder > .ladder-row:first-child .ladder-native .sc-word').first().textContent(),'Lord');
  assert.match(await page.locator('#size-ladder > .ladder-row:first-child .ladder-native .sc-word').first().evaluate(e=>getComputedStyle(e).fontFeatureSettings),/"smcp"/);
  await checkComparison();
  await page.locator('.ladder-row').first().screenshot({path:'/tmp/smallcaps-native-comparison.png'});
  assert.equal(await page.locator('[data-preview-toggle="native"]').isDisabled(),false);
  assert.equal(await page.locator('#size-ladder > .ladder-row:first-child .ladder-transformed .transform-word').count(),1);
  const transform=await page.locator('#size-ladder > .ladder-row:first-child .ladder-transformed .sc-rest').evaluate(e=>({matrix:getComputedStyle(e).transform,weight:+getComputedStyle(e).fontWeight,visible:e.getBoundingClientRect().width,reserved:e.parentElement.getBoundingClientRect().width}));
  assert.match(transform.matrix,/matrix\(1\.0/);
  assert(transform.weight<+await page.locator('#weight').inputValue());
  assert(Math.abs(transform.visible-transform.reserved)<.1);
  assert.doesNotMatch(await page.locator('#css-export').textContent(),/(?:^|\n)\s*transform:|scaleX/);
  await page.locator('#optical-policy').selectOption('linked');
  await until(page,()=>document.querySelector('#status').textContent.startsWith('Loaded'));
  await page.locator('#reading-size-out').fill('24');await page.locator('#reading-size-out').press('Enter');
  await until(page,()=>document.querySelector('#status').textContent.startsWith('Loaded'));
  assert.equal(+await page.locator('#axis-opsz').inputValue(),24);
  assert.equal(await page.locator('#reading').count(),0);
  assert.match(await page.locator('#css-export').textContent(),/24px/);
  assert.equal(await page.locator('#size-ladder .sample').count(),50);
  for(const type of ['ladder-all-caps','ladder-naive','ladder-calibrated','ladder-transformed','ladder-native'])assert.deepEqual(await page.locator(`#size-ladder .${type}`).evaluateAll(es=>es.map(e=>parseFloat(getComputedStyle(e).fontSize))),[48,36,32,28,24,20,18,16,14,12]);
  const pairs=await page.locator('.ladder-pair').evaluateAll(es=>es.map(e=>{
    const a=e.querySelector('.ladder-calibrated'),b=e.querySelector('.ladder-native'),t=e.querySelector('.ladder-transformed'),ar=a.getBoundingClientRect(),br=b.getBoundingClientRect(),tr=t.getBoundingClientRect(),rest=t.querySelector('.sc-rest');
    return {left:ar.left-br.left,transformLeft:tr.left-ar.left,gap:br.top-tr.bottom,transformGap:tr.top-ar.bottom,widthGap:rest.getBoundingClientRect().width-rest.parentElement.getBoundingClientRect().width,feature:getComputedStyle(b.querySelector('.sc-word')).fontFeatureSettings,axes:getComputedStyle(a).fontVariationSettings===getComputedStyle(b).fontVariationSettings};
  }));
  assert(pairs.every(p=>Math.abs(p.left)<1&&Math.abs(p.transformLeft)<1&&p.transformGap>=0&&Math.abs(p.widthGap)<.1&&p.gap>=0&&p.feature.includes('smcp')&&p.axes));
  const axisBefore=await page.locator('#axis-opsz').inputValue();
  await page.locator('#size').fill('64');await page.locator('#size').dispatchEvent('input');
  assert.equal(await page.locator('#axis-opsz').inputValue(),axisBefore);
  await page.locator('#optical-policy').selectOption('pinned');
  assert.equal(await page.locator('#target option').count(),2);
  assert.doesNotMatch(await page.locator('#target').innerText(),/pilot|five|estimate/i);
  await page.locator('#target').selectOption('xheight');
  await until(page,()=>document.querySelector('#status').textContent.includes('x-height experiment'));
  assert.match(await page.locator('#target-note').innerText(),/height of lowercase x/);
  assert.equal(await page.locator('#width').isDisabled(),false);
  await page.locator('#target').selectOption('reference');
  await until(page,()=>document.querySelector('#status').textContent.startsWith('Loaded'));
  const recipe=await page.locator('#export').textContent();
  assert.match(recipe,/::first-letter/);assert.doesNotMatch(recipe,/<script>|scaleX|scaleY/);
  const exported=await browser.newPage();
  const fontURL='data:font/ttf;base64,'+fs.readFileSync('fonts/SourceSerif4.ttf').toString('base64');
  await exported.setContent(recipe.replace('FONT_URL',fontURL));
  await exported.evaluate(()=>document.fonts.ready);
  const cssState=await exported.locator('.smcp').first().evaluate(e=>({size:getComputedStyle(e,'::first-letter').fontSize,transform:getComputedStyle(e).transform,children:e.children.length,text:e.textContent,axes:getComputedStyle(e,'::first-letter').fontVariationSettings}));
  assert(Math.abs(parseFloat(cssState.size)-24)<.02);assert.equal(cssState.transform,'none');assert.equal(cssState.children,0);assert.equal(cssState.text,'Lord');
  assert.match(cssState.axes,/"wght" 500/);
  assert.equal(await exported.locator('.smcp-text').evaluate(e=>getComputedStyle(e).fontSize),'24px');
  // Turning off the rich-text hint must not change calibrated geometry.
  const before=await exported.locator('.smcp').first().boundingBox();
  await exported.locator('.smcp').first().evaluate(e=>e.style.fontVariant='normal');
  const after=await exported.locator('.smcp').first().boundingBox();
  assert.deepEqual(before,after);
  await exported.close();
  if(fs.existsSync(fixture('smallcaps-static.ttf'))) {
    await page.locator('#upload').setInputFiles(fixture('smallcaps-static.ttf'));
    await until(page,()=>document.querySelector('#status').classList.contains('error'));
    assert.match(await page.locator('#status').innerText(),/variable font/);
    assert.equal(await page.locator('#diagnostics').evaluate(e=>JSON.parse(e.textContent).font),loadedIDs.source);
  }
  await loadFixture('inter');
  await until(page,()=>document.querySelector('#status').textContent.startsWith('Loaded Inter'));
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'/tmp/smallcaps-mobile.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  for(const rootSize of ['','20px']) {
    await page.evaluate(size=>document.documentElement.style.fontSize=size,rootSize);
    const tiny=await page.evaluate(()=>{
      const minimum=parseFloat(getComputedStyle(document.documentElement).fontSize);
      return [...document.querySelectorAll('body *')].filter(e=>
        e.getClientRects().length&&!e.closest('.sample, .glyph-card svg')&&
        [...e.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim())&&
        parseFloat(getComputedStyle(e).fontSize)<minimum-.01
      ).map(e=>({tag:e.tagName,id:e.id,size:getComputedStyle(e).fontSize}));
    });
    assert.deepEqual(tiny,[],'UI text must respect the browser base font size');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    const captions=await page.locator('.caption').allTextContents();
    assert(captions.every(text=>text!==text.toUpperCase()),'Use sentence-case captions');
  }
  await page.evaluate(()=>document.documentElement.style.fontSize='');
  assert.deepEqual(errors,[]);
  assert.deepEqual(requests,[]);
  await page.locator('#research-tab').click();
  assert.equal(await page.locator('#corpus-plot [data-category]').count(),familyCount);
  assert.equal(await page.locator('#corpus-cohort').inputValue(),'all');
  assert.match(await page.locator('#corpus-table').innerText(),/Inter/);
  assert.equal(await page.locator('#corpus-plot [data-category][aria-label*="Inter"]').count(),1);
  assert.equal(await page.locator('#corpus-plot [data-category="serif"]').count(),corpus.fonts.filter(f=>f.category==='serif').length);
  assert.equal(await page.locator('#corpus-plot [data-category="sans-serif"]').count(),corpus.fonts.filter(f=>f.category==='sans-serif').length);
  assert.equal(await page.locator('#corpus-plot [data-category][aria-label*="Inter"]').getAttribute('fill'),'#b66e45');
  assert.equal(await page.locator('#corpus-plot [data-category][aria-label*="Merriweather ("]').getAttribute('fill'),'#426653');
  assert.equal(await page.locator('#corpus-plot [data-category][aria-label*="Merriweather Sans ("]').getAttribute('fill'),'#b66e45');
  assert.equal(await page.locator('#corpus-measure').inputValue(),'width');
  assert.match(await page.locator('#corpus-table').innerText(),/Merriweather/);
  assert.match(await page.locator('#corpus-table').innerText(),/no wdth/);
  await page.locator('#corpus-cohort').selectOption('top50');
  assert.equal(await page.locator('#corpus-plot [data-category]').count(),13);
  await page.locator('#corpus-cohort').selectOption('top100');
  assert.equal(await page.locator('#corpus-plot [data-category]').count(),17);
  assert.match(await page.locator('#corpus-table').innerText(),/Cormorant Garamond/);
  assert.match(await page.locator('#corpus-table').innerText(),/Noto Serif/);
  assert.match(await page.locator('#corpus-table').innerText(),/Bitter/);
  await page.locator('#corpus-cohort').selectOption('top200');
  assert.equal(await page.locator('#corpus-plot [data-category]').count(),30);
  assert.match(await page.locator('#corpus-table').innerText(),/Literata/);
  assert.match(await page.locator('#corpus-table').innerText(),/Bodoni Moda/);
  assert.match(await page.locator('#corpus-table').innerText(),/Andada Pro/);
  await page.locator('#corpus-cohort').selectOption('top300');
  assert.equal(await page.locator('#corpus-plot [data-category]').count(),38);
  assert.match(await page.locator('#corpus-table').innerText(),/Encode Sans/);
  assert.match(await page.locator('#corpus-table').innerText(),/Baskervville/);
  await page.locator('#corpus-cohort').selectOption('all');
  assert.equal(await page.locator('#corpus-plot [data-category]').count(),familyCount);
  assert.match(await page.locator('#corpus-table').innerText(),/phonetic/);
  assert.doesNotMatch(await page.locator('#corpus-cohort').innerText(),/Inter|Native/);
  for(const cohort of ['top50','top100','top200','top300','top500','all']) {
    await page.locator('#corpus-cohort').selectOption(cohort);
    assert.equal(await page.locator('#corpus-plot [data-category][aria-label*="Inter ("]').count(),1);
  }
  await page.locator('#corpus-cohort').selectOption('top500');
  assert.equal(await page.locator('#corpus-plot [data-category]').count(),familyCount);
  await page.locator('#corpus-plot [data-category]').first().focus();
  assert.match(await page.locator('#corpus-detail').innerText(),/Roboto/);
  const tableBeforeNumbers=await page.locator('#corpus-table').innerText();
  await page.locator('#corpus-numbers').uncheck();
  assert.equal(await page.locator('#corpus-plot .corpus-point-number:visible').count(),0);
  assert.equal(await page.locator('#corpus-plot [data-category]').count(),familyCount);
  assert.equal(await page.locator('#corpus-plot svg > text:not(.corpus-point-number):visible').count(),12);
  const legend=page.locator('#corpus-plot g[aria-label^="Point colors"]');
  assert.deepEqual(await legend.locator('text:visible').allTextContents(),['Sans-serif','Serif']);
  assert(await legend.locator('text').evaluateAll(es=>es.every(e=>+e.getAttribute('x')>440&&+e.getAttribute('y')<40)),'Legend stays at the top right above the plot');
  assert.equal(await page.locator('#corpus-table').innerText(),tableBeforeNumbers);
  await page.locator('#corpus-weight').selectOption('700');
  assert.match(await page.locator('#corpus-table').innerText(),/700 →/);
  await page.locator('#corpus-measure').selectOption('tracking');
  assert.match(await page.locator('#corpus-plot svg').getAttribute('aria-label'),/Tracking/);
  assert.equal(await page.locator('#corpus-plot .corpus-point-number:visible').count(),0);
  await page.locator('#corpus-numbers').check();
  assert.equal(await page.locator('#corpus-plot .corpus-point-number:visible').count(),familyCount);

  const defaultCorpus=await page.locator('#corpus-table').innerText();
  await page.locator('#corpus-opsz').selectOption('max');
  assert.notEqual(await page.locator('#corpus-table').innerText(),defaultCorpus);
  for(const measure of ['width','widthError','weightChange','tracking','stroke']) {
    await page.locator('#corpus-measure').selectOption(measure);
    const points=await page.locator('#corpus-plot [data-category]').evaluateAll(es=>es.map(e=>[+e.dataset.x,+e.dataset.y]));
    assert(points.every(([x,y])=>Number.isFinite(x)&&Number.isFinite(y)&&x>=85&&x<=810&&y>=40&&y<=285));
  }
  await page.setViewportSize({width:1280,height:1000});
  await page.locator('#corpus-weight').selectOption('500');
  await page.locator('#corpus-opsz').selectOption('default');
  await page.locator('#corpus-measure').selectOption('width');
  await page.locator('#corpus-plot').screenshot({path:'/tmp/smallcaps-expanded-corpus.png'});
  if(fs.existsSync(fixture('smallcaps-subset.woff2'))) {
    await loadFixture('sans');
    await until(page,()=>document.querySelector('#status').textContent.startsWith('Loaded Source Sans 3'));
    const referenceFamily=await page.locator('#size-ladder > .ladder-row:first-child .ladder-calibrated').evaluate(e=>getComputedStyle(e).fontFamily.replace('Calibration_','Reference_'));
    await page.locator('#upload').setInputFiles(fixture('smallcaps-subset.woff2'));
    await until(page,()=>document.querySelector('#status').textContent.includes('matching full font'));
    assert.equal(await page.locator('#size-ladder > .ladder-row:first-child .ladder-native').isVisible(),true);
    assert.equal(await page.locator('#size-ladder > .ladder-row:first-child .ladder-native').evaluate(e=>getComputedStyle(e).fontFamily),referenceFamily);
    assert.equal(await page.locator('#target').inputValue(),'reference');
  }
  if(fs.existsSync(fixture('smallcaps-test.woff'))) {
    await page.locator('#upload').setInputFiles(fixture('smallcaps-test.woff'));
    await until(page,()=>document.querySelector('#status').textContent.startsWith('Loaded Source Sans 3')&&!!document.querySelector('.ladder-native'));
    assert.equal(await page.locator('#weight').isDisabled(),false);
  }
  if(fs.existsSync(fixture('smallcaps-no-reference.woff2'))) {
    await page.locator('#upload').setInputFiles(fixture('smallcaps-no-reference.woff2'));
    await until(page,()=>document.querySelector('#status').textContent.startsWith('Loaded No Small Caps Test'));
    assert.equal(await page.locator('#target').inputValue(),'reference');
    assert.match(await page.locator('#status').innerText(),/estimated proportions/);
    assert.match(await page.locator('#target-note').innerText(),/estimating from the current font corpus/);
    assert.equal(await page.locator('#size-ladder > .ladder-row:first-child .ladder-native').isVisible(),false);
    assert.equal(await page.locator('#size-ladder .ladder-native').count(),0);
    assert.equal(await page.locator('#size-ladder .ladder-calibrated').count(),10);
    assert.equal(await page.locator('#size-ladder .ladder-transformed').count(),10);
    assert.equal(await page.locator('#size-ladder > .ladder-row:first-child .ladder-calibrated .sc-word').count(),1);
    assert.equal(await page.locator('#weight').isDisabled(),false);
    assert(+await page.locator('#weight').inputValue()>500);
    assert.match(await page.locator('#export').textContent(),/::first-letter/);
  }
  const previous=await page.locator('#diagnostics').evaluate(e=>JSON.parse(e.textContent).font);
  await page.locator('#upload').setInputFiles({name:'bad.ttf',mimeType:'font/ttf',buffer:Buffer.from('Not a font')});
  await until(page,()=>document.querySelector('#status').classList.contains('error'));
  assert.equal(await page.locator('#diagnostics').evaluate(e=>JSON.parse(e.textContent).font),previous);
  assert.equal(await page.locator('#workspace').isVisible(),true);
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  console.log('Browser checks passed: no embedded fonts, zero startup requests, font imports, ten recipe sizes, variable fonts, width layout, native preview, export, subset recovery, mobile, corpus plot.');
  await browser.close();
})().catch(async e=>{console.error(e);await browser?.close();process.exitCode=1});
