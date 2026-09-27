const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
let browser;
const wait=page=>page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Loaded'),{},{timeout:60000});
(async()=>{
  browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,headless:true});
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const face=fs.readFileSync('fonts/SourceSans3.ttf');
  await page.addInitScript(base64=>{
    window.queryLocalFonts=async()=>[{family:'Test Installed',fullName:'Test Installed Regular',postscriptName:'TestInstalled-Regular',blob:async()=>new Blob([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))])}];
  },face.toString('base64'));
  let googleRequests=0,fullRequests=0;
  const fullURL=require("../research/corpus.json").fonts.find(f=>f.name==="Roboto").sourceURL;
  await page.route(fullURL,route=>{fullRequests++;return route.fulfill({body:face});});
  await page.route('https://fonts.googleapis.com/**',route=>{
    googleRequests++;
    assert.match(new URL(route.request().url()).searchParams.get('family'),/^(Open Sans:wdth,wght@75\.\.100,300\.\.800|Roboto:wdth,wght@75\.\.100,100\.\.900)$/);
    return route.fulfill({contentType:'text/css',body:`
      @font-face{font-style:normal;src:url(https://fonts.gstatic.com/not-latin.woff2);unicode-range:U+0400-04FF;}
      @font-face{font-style:normal;src:url(https://fonts.gstatic.com/test.ttf);unicode-range:U+0000-00FF;}`});
  });
  await page.route('https://fonts.gstatic.com/**',route=>{
    assert.equal(route.request().url(),'https://fonts.gstatic.com/test.ttf');
    return route.fulfill({contentType:'font/ttf',body:face});
  });
  await page.goto(pathToFileURL(path.resolve('index.html')).href);
  await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Ready.'));
  await page.locator('#width-method').selectOption('unscaled',{force:true});
  assert.equal(googleRequests,0);
  for(const input of ['Roboto','https://fonts.google.com/specimen/Roboto','<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400&amp;display=swap" rel="stylesheet">']){
    await page.locator('#google-font').fill(input);if(input!=='Roboto')await page.locator('#google-load').click();
    await page.waitForFunction(()=>!document.querySelector('#google-load').disabled);await wait(page);
    assert.match(await page.locator('#smcp-support').textContent(),/Native small-caps \(smcp\): yes.*26\/26/);
    assert((await page.locator("#export").textContent()).includes(fullURL));
    const css=await page.locator('#css-export').innerText();
    assert.match(css,/span\.smcp \{/);assert.match(css,/text-transform: uppercase/);
    assert(css.includes(fullURL));
    assert.equal(await page.locator('#target').inputValue(),'reference');
    assert.match(await page.locator('#status').innerText(),/stored Roboto recipe/);
    assert.match(await page.locator('#status').innerText(),/^Loaded Roboto · variable weight 200–900/);
    assert.match(await page.locator('#diagnostics').evaluate(e=>JSON.parse(e.textContent).font),/^Roboto$/);
    assert.match(await page.locator('#diagnostics').evaluate(e=>JSON.parse(e.textContent).font),/^Roboto$/);
    assert.equal(JSON.parse(await page.locator('#diagnostics').textContent()).internalFontName,'Source Sans 3 ExtraLight');
    const stored=require('../research/corpus.json').fonts.find(f=>f.name==='Roboto').instances.find(r=>r.requestedWeight===500);
    assert(Math.abs(+await page.locator('#scale').inputValue()-stored.fit.scale)<0.0006);
    assert(Math.abs(+await page.locator('#weight').inputValue()-stored.fit.weight)<0.11);
    assert(Math.abs(+await page.locator('#tracking').inputValue()-stored.fit.tracking)<0.0011);
  }
  assert.equal(googleRequests,3);assert.equal(fullRequests,3);
  await page.locator('#export-toggle').click();
  await page.locator('#width-none').click();
  const naiveCSS=await page.locator('#css-export').textContent();
  assert.match(naiveCSS,/@import url\("https:\/\/fonts.googleapis.com\/css2\?/);
  assert(naiveCSS.includes('family=Roboto%3Awght%40500'),'Omit catalog axes absent from the loaded font');
  assert(!naiveCSS.includes('NaN'));
  assert(!naiveCSS.includes(fullURL));
  await page.locator('#width-builtin').click();
  assert((await page.locator('#css-export').textContent()).includes(fullURL));
  assert.match(await page.locator('#css-export').textContent(),/"smcp" 1/);
  await page.locator('#width-unscaled').click();

  for(const input of ['"DejaVu Sans"','DejaVu Sans']) {
    await page.locator('#google-font').fill(input);await page.locator('#google-font').press('Enter');
    await page.waitForFunction(()=>!document.querySelector('#google-load').disabled);await wait(page);
    assert.match(await page.locator('#css-export').innerText(),/font-family: "DejaVu Sans"/);
    assert.equal(googleRequests,3);
  }
  await page.evaluate(base64=>{
    const previous=window.queryLocalFonts;
    window.queryLocalFonts=async()=>[...await previous(),{family:'Arial',fullName:'Arial Regular',postscriptName:'ArialMT',blob:async()=>new Blob([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))])}];
  },fs.readFileSync('/tmp/smallcaps-static.ttf').toString('base64'));
  for(const [input,message] of [['Nonexistent Family 91827',/Could not resolve/],['"Arial", "Test Installed"',/one font name/],['sans-serif',/generic family/],['"Unclosed',/balanced quotes/]]) {
    const old=await page.locator('#diagnostics').evaluate(e=>JSON.parse(e.textContent).font);
    await page.locator('#google-font').fill(input);await page.locator('#google-font').press('Enter');
    await page.waitForFunction(()=>!document.querySelector('#google-load').disabled);
    assert.match(await page.locator('#status').innerText(),message);
    assert.equal(await page.locator('#diagnostics').evaluate(e=>JSON.parse(e.textContent).font),old);
  }
  await page.route('https://font-test.example/**',route=>{
    const name=new URL(route.request().url()).pathname;
    if(name==='/blocked.woff2')return route.abort('accessdenied');
    if(name==='/missing.woff')return route.fulfill({status:404,body:'Not found'});
    if(name==='/large.woff')return route.fulfill({headers:{'content-length':String(17*1024*1024)},body:'x'});
    if(name==='/invalid.woff')return route.fulfill({body:'Not a font'});
    const files={'/font.woff':'/tmp/smallcaps-test.woff','/font.woff2':'fonts/InterVariable.woff2','/static.ttf':'/tmp/smallcaps-static.ttf'};
    assert(files[name]);return route.fulfill({body:fs.readFileSync(files[name])});
  });
  for(const [file,native] of [['font.woff','yes'],['font.woff2','no']]) {
    const url=`https://font-test.example/${file}?v=1`;
    await page.locator('#google-font').fill(url);await page.locator('#google-load').click();
    await page.waitForFunction(()=>!document.querySelector('#google-load').disabled);await wait(page);
    assert.match(await page.locator('#smcp-support').textContent(),new RegExp(`Native small-caps \\(smcp\\): ${native}`));
    assert((await page.locator('#css-export').innerText()).includes(`url("${url}")`));
    assert.match(await page.locator('#css-export').innerText(),/Direct font URL/);
  }
  const selected=await page.locator('#diagnostics').evaluate(e=>JSON.parse(e.textContent).font);
  for(const [url,message] of [
    ['https://font-test.example/blocked.woff2',/CORS/],
    ['https://font-test.example/missing.woff',/404/],
    ['https://font-test.example/large.woff',/16 MB/],
    ['https://font-test.example/invalid.woff',/Could not load font/],
    ['https://font-test.example/static.ttf',/variable/i],
    ['http://font-test.example/font.woff',/HTTPS/],
    ['https://user:password@font-test.example/font.woff',/credentials/],
    ['data:font/woff;base64,AA==',/HTTPS/]]) {
    await page.locator('#google-font').fill(url);await page.locator('#google-load').click();
    await page.waitForFunction(()=>!document.querySelector('#google-load').disabled);
    assert.match(await page.locator('#status').innerText(),message);
    assert.equal(await page.locator('#diagnostics').evaluate(e=>JSON.parse(e.textContent).font),selected);
  }
  await page.locator('#google-font').fill('Nonexistent Family 73195');await page.locator('#google-load').click();
  await page.waitForFunction(()=>document.querySelector('#status').classList.contains('error'));
  assert.match(await page.locator('#status').innerText(),/Could not resolve/);assert.equal(googleRequests,3);
  await page.locator('.source details:not(#font-summary) summary').click();
  await page.locator('#installed-list').click();
  await page.waitForFunction(()=>!document.querySelector('#installed-list').disabled);
  assert.equal(await page.locator(':focus').getAttribute('id'),'installed-list');
  await page.locator('#installed-load').click();
  await page.waitForFunction(()=>!document.querySelector('#installed-load').disabled);await wait(page);
  assert.equal(await page.locator(':focus').getAttribute('id'),'google-font','Closing the source disclosure preserves focus on a visible control');
  assert.match(await page.locator('#export').textContent(),/src: local\("TestInstalled-Regular"\)/);
  assert.match(await page.locator('#smcp-support').textContent(),/Native small-caps \(smcp\): yes/);
  await page.locator('#tracking').fill('0.05');await page.locator('#tracking').dispatchEvent('input');await wait(page);
  assert.match(await page.locator('#css-export').innerText(),/letter-spacing: 0.05em/);
  const previous=await page.locator('#diagnostics').evaluate(e=>JSON.parse(e.textContent).font);
  await page.locator('#google-font').fill('https://fonts.google.com/');await page.locator('#google-load').click();
  await page.waitForFunction(()=>document.querySelector('#status').classList.contains('error'));
  assert.equal(await page.locator('#diagnostics').evaluate(e=>JSON.parse(e.textContent).font),previous);
  assert.equal(googleRequests,3);
  await page.evaluate(()=>{window.queryLocalFonts=async()=>{throw new DOMException('Permission denied','NotAllowedError');};});
  await page.locator('.source details:not(#font-summary)').evaluate(e=>e.open=true);
  await page.locator('#installed-list').click();assert.match(await page.locator('#installed-note').innerText(),/Permission denied/);
  assert.equal(await page.locator(':focus').getAttribute('id'),'installed-list');
  await page.locator('#google-font').fill('Open Sans');
  await page.waitForFunction(()=>!document.querySelector('#google-load').disabled);await wait(page);
  assert.equal(googleRequests,4);
  assert((await page.locator('#css-export').innerText()).includes('https://fonts.gstatic.com/test.ttf'));
  assert.deepEqual(errors,[]);
  const unsupported=await browser.newPage();
  await unsupported.addInitScript(()=>{window.queryLocalFonts=undefined;});
  await unsupported.goto(pathToFileURL(path.resolve('index.html')).href);
  await unsupported.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Ready.'));
  await unsupported.locator('#google-font').fill('DejaVu Sans');await unsupported.locator('#google-font').press('Enter');
  await unsupported.waitForFunction(()=>!document.querySelector('#google-load').disabled);
  assert.match(await unsupported.locator('#status').innerText(),/Loaded DejaVu Sans/);
  assert.doesNotMatch(await unsupported.locator('#status').innerText(),/You can still/);
  await unsupported.close();
  console.log('Source checks passed: Google family/link/embed, direct WOFF/WOFF2 URLs, exact-source export, native smcp, CORS/HTTP/size/static/invalid rejection, installed faces.');
  await browser.close();
})().catch(async error=>{console.error(error);await browser?.close();process.exitCode=1;});
