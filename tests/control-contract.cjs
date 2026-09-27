// Read actual CSS and exported text, not app internals, to enforce the UI contract.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
let browser;
(async()=>{
  browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route(/^https?:/,route=>route.abort()); // Entire matrix must work offline.
  await page.goto(pathToFileURL(path.resolve('index.html')).href);
  await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Ready.'));
  const settled=async()=>{
    await page.waitForFunction(()=>/^(Loaded|.*error)/i.test(document.querySelector('#status').textContent)||document.querySelector('#status').classList.contains('error'));
    assert.equal(await page.locator('#status').evaluate(e=>e.classList.contains('error')),false,await page.locator('#status').textContent());
  };
  const set=async(id,value,measure=true)=>{
    await page.locator('#'+id).evaluate((e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));},value);
    if(measure)await settled();
  };
  const style=async(selector)=>page.locator(selector).first().evaluate(e=>{
    const s=getComputedStyle(e),initial=getComputedStyle(e,'::first-letter');
    const axes=Object.fromEntries([...s.fontVariationSettings.matchAll(/"([^"]+)"\s+(-?[\d.]+)/g)].map(m=>[m[1],+m[2]]));
    return {weight:axes.wght??+s.fontWeight,size:parseFloat(s.fontSize),tracking:(parseFloat(s.letterSpacing)||0)/parseFloat(s.fontSize),axes,
      initialWeight:parseFloat(initial.fontWeight),initialSize:parseFloat(initial.fontSize)};
  });
  const close=(a,b,message,tolerance=.11)=>assert(Math.abs(a-b)<tolerance,`${message}: ${a} vs ${b}`);
  const fixtures=[
    ['fonts/SourceSans3.ttf',true], // Native small caps, no width axis.
    ['fonts/SourceSerif4.ttf',true], // Optical sizing and native small caps.
    ['fonts/InterVariable.woff2',false], // Partial phonetic references.
    [path.join(os.tmpdir(),'smallcaps-no-reference.woff2'),false],
    [path.join(os.tmpdir(),'smallcaps-control-matrix.ttf'),true], // Actual wdth/opsz/wght variation.
    [path.join(os.tmpdir(),'smallcaps-color.ttf'),true],
  ];
  for(const [file,native] of fixtures){
    await page.locator('#upload').setInputFiles(file);await settled();
    console.log('Control matrix:',path.basename(file));
    const recipeWeights={};
    for(const mode of ['unscaled','transform','unscaled','transform']){
      await page.locator('#width-method').selectOption(mode);
      const selector=mode==='transform'?'#size-ladder > .ladder-row:first-child .ladder-transformed .sc-rest':'#size-ladder > .ladder-row:first-child .ladder-calibrated .sc-word';
      const actual=await style(selector),shown=+await page.locator('#weight').inputValue();
      close(shown,actual.weight,'Weight slider equals rendered selected recipe');
      close(+await page.locator('#weight-out').inputValue(),actual.weight,'Weight number equals rendered selected recipe');
      close(+await page.locator('#scale').inputValue(),actual.size/48,'Height slider equals selected recipe',.0006);
      if(recipeWeights[mode]!==undefined)close(actual.weight,recipeWeights[mode],'Recipe switch preserves automatic weight');
      recipeWeights[mode]=actual.weight;
    }
    const automatic=await style('#size-ladder > .ladder-row:first-child .ladder-transformed .sc-rest');
    const beforeNative=native?await style('#size-ladder > .ladder-row:first-child .ladder-native .sc-word'):null;
    const plain=await style('#size-ladder > .ladder-row:first-child .ladder-all-caps'),naive=await style('#size-ladder > .ladder-row:first-child .ladder-naive .sc-word');
    const max=+await page.locator('#weight').getAttribute('max');
    const next=automatic.weight+(automatic.weight+1<=max?1:-1);
    await page.locator('#weight-out').fill(String(next));
    await page.locator('#weight-out').press('Enter');
    await settled();
    for(const selector of ['#size-ladder > .ladder-row:first-child .ladder-transformed .sc-rest','#size-ladder > .ladder-row:first-child .ladder-calibrated .sc-word','.ladder-transformed .sc-rest','.ladder-calibrated .sc-word'])close((await style(selector)).weight,next,selector+' manual weight');
    close((await style('#size-ladder > .ladder-row:first-child .ladder-transformed .sc-rest')).weight-automatic.weight,next-automatic.weight,'Small movement causes small weight change');
    if(native)assert.deepEqual(await style('#size-ladder > .ladder-row:first-child .ladder-native .sc-word'),beforeNative,'Small-cap weight leaves Built-in unchanged');
    assert.deepEqual(await style('#size-ladder > .ladder-row:first-child .ladder-all-caps'),plain);assert.deepEqual(await style('#size-ladder > .ladder-row:first-child .ladder-naive .sc-word'),naive);
    await set('scale',.72);
    await set('tracking',.035);
    for(const selector of ['#size-ladder > .ladder-row:first-child .ladder-transformed .sc-rest','#size-ladder > .ladder-row:first-child .ladder-calibrated .sc-word']){
      const s=await style(selector);close(s.size/48,.72,'Height override',.0006);close(s.weight,next,'Height/tracking preserves manual weight');close(s.tracking,.035,'Tracking',.001);
    }
    if(native){
      const s=await style('#size-ladder > .ladder-row:first-child .ladder-native .sc-word');close(s.weight,plain.weight,'Built-in keeps text weight');close(s.size,beforeNative.size,'Built-in keeps height');close(s.tracking,.035,'Built-in accepts tracking',.001);
      await page.locator('#initial-mode').selectOption('c2sc');close((await style('#size-ladder > .ladder-row:first-child .ladder-native .sc-word')).initialWeight,plain.weight,'All-small-caps Built-in keeps text weight');
      await page.locator('#initial-mode').selectOption('smcp');
    }
    if(await page.locator('#size-ladder > .ladder-row:first-child .ladder-calibrated .sc-word').count()){
      const axisFit=await style('#size-ladder > .ladder-row:first-child .ladder-calibrated .sc-word');close(axisFit.initialWeight,plain.weight,'Full-size initial weight');close(axisFit.initialSize,48,'Full-size initial height');
    }
    // Width overrides and mode changes must not reset manual weight or height.
    const width=+await page.locator('#width').inputValue();
    await set('width',width*1.02);
    for(const mode of ['unscaled','transform']){
      await page.locator('#width-method').selectOption(mode);
      close(+await page.locator('#weight').inputValue(),next,'Manual weight survives recipe switch');
      close((await style('#size-ladder > .ladder-row:first-child .ladder-transformed .sc-rest')).size/48,.72,'Manual height survives switch',.0006);
    }
    if(await page.locator('#axis-wdth').count()){
      close((await style('#size-ladder > .ladder-row:first-child .ladder-calibrated .sc-word')).axes.wdth,+await page.locator('#width').inputValue(),'Width reaches font-axis row');
      close((await style('#size-ladder > .ladder-row:first-child .ladder-transformed .sc-rest')).axes.wdth,+await page.locator('#width').inputValue(),'Width reaches scaling row');
      if(native)close((await style('#size-ladder > .ladder-row:first-child .ladder-native .sc-word')).axes.wdth,+await page.locator('#width').inputValue(),'Width reaches Built-in');
      close((await style('#size-ladder > .ladder-row:first-child .ladder-all-caps')).axes.wdth,plain.axes.wdth,'Small-cap width leaves ordinary text unchanged');
      close((await style('#size-ladder > .ladder-row:first-child .ladder-naive .sc-word')).axes.wdth,naive.axes.wdth,'Small-cap width leaves Naive unchanged');
    }
    await set('axis-wght',550);
    close((await style('#size-ladder > .ladder-row:first-child .ladder-all-caps')).weight,550,'Text weight updates ordinary text');
    if(native)close((await style('#size-ladder > .ladder-row:first-child .ladder-native .sc-word')).weight,550,'Text weight updates Built-in');
    const output=await style('#size-ladder > .ladder-row:first-child .ladder-transformed .sc-rest');close(+await page.locator('#weight').inputValue(),output.weight,'Recalibration restores selected automatic weight');
    if(await page.locator('#axis-opsz').count()){
      await page.locator('#optical-policy').selectOption('linked');await settled();
      await set('reading-size',24);
      const optical=+await page.locator('#axis-opsz').inputValue();
      for(const selector of ['#size-ladder > .ladder-row:first-child .ladder-all-caps','#size-ladder > .ladder-row:first-child .ladder-naive .sc-word','#size-ladder > .ladder-row:first-child .ladder-calibrated .sc-word','#size-ladder > .ladder-row:first-child .ladder-transformed .sc-rest'])close((await style(selector)).axes.opsz,optical,'Linked optical axis reaches '+selector);
      await set('size',36,false);
      close(+await page.locator('#axis-opsz').inputValue(),optical,'Inspection size does not change optical axis');
      await page.locator('#optical-policy').selectOption('pinned');
      await set('reading-size',30,false);
      close(+await page.locator('#axis-opsz').inputValue(),optical,'Pinned optical axis ignores export size');
      await set('size',48,false);
    }
    // Several updates during the debounce must leave the latest input in both rows.
    await set('weight',610,false);await set('weight',620,false);await set('weight',630,false);await settled();
    for(const selector of ['#size-ladder > .ladder-row:first-child .ladder-calibrated .sc-word','#size-ladder > .ladder-row:first-child .ladder-transformed .sc-rest'])close((await style(selector)).weight,630,'Latest edit wins after asynchronous analysis');
    await page.locator('#fit').click();await settled();
  }
  assert.deepEqual(errors,[]);
  await browser.close();
  console.log('Offline control contracts passed across all six font fixtures.');
})().catch(async error=>{console.error(error);await browser?.close();process.exitCode=1;});
