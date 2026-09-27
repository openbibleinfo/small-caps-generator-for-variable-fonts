// Optional network regression: compare real Google subsets with audited full fonts.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
let browser;
(async()=>{
  browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,headless:true});
  const page=await browser.newPage();
  await page.goto(pathToFileURL(path.resolve('index.html')).href);
  await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Ready.'));
  for(const [name,axis,values] of [['Encode Sans','wdth',[75,100,125]],['Roboto Serif','opsz',[8,72]]]){
    await page.locator('#google-font').fill(name);
    await page.waitForFunction(()=>!document.querySelector('#google-load').disabled,{},{timeout:90000});
    assert.match(await page.locator('#status').textContent(),new RegExp('^Loaded '+name));
    for(const value of values){
      await page.locator('#axis-'+axis).evaluate((input,value)=>{input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));},value);
      await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Loaded'),{},{timeout:60000});
      const widths=await page.evaluate(()=>Object.fromEntries(['all-caps','naive','calibrated','transformed','native'].filter(id=>document.querySelector('.ladder-row:first-child .ladder-'+id)?.firstChild?.nodeType===Node.TEXT_NODE).map(id=>{
        const range=document.createRange();range.setStart(document.querySelector('.ladder-row:first-child .ladder-'+id)?.firstChild,0);range.setEnd(document.querySelector('.ladder-row:first-child .ladder-'+id)?.firstChild,3);
        return [id,range.getBoundingClientRect().width];
      })));
      for(const [row,width] of Object.entries(widths))assert(Math.abs(width-widths['all-caps'])<.2,`${name} ${axis}=${value}: ${row} "The" width ${width} vs ${widths['all-caps']}`);
      if(await page.locator('#export-toggle').getAttribute('aria-expanded')!=='true')await page.locator('#export-toggle').click();
      await page.locator('#width-none').click();
      const recipe=await page.locator('#export').textContent();
      const importedURL=recipe.match(/@import url\("([^"]+)"\)/)[1];
      const spec=new URL(importedURL).searchParams.get('family'),[tags,coordinates]=spec.split(':')[1].split('@');
      assert.equal(+coordinates.split(',')[tags.split(',').indexOf(axis)],value);
      const exported=await browser.newPage({javaScriptEnabled:false});
      await exported.setContent(recipe);
      await exported.locator('.smcp-text').evaluate(e=>e.style.fontSize='48px');
      await exported.evaluate(()=>document.fonts.ready);
      const exportWidth=await exported.locator('.smcp-text').evaluate(e=>{const range=document.createRange();range.setStart(e.firstChild,0);range.setEnd(e.firstChild,3);return range.getBoundingClientRect().width;});
      assert(Math.abs(exportWidth-widths.naive)<.2,`${name} exported ordinary text: ${exportWidth} vs ${widths.naive}`);
      await exported.close();
      console.log(name,axis,value,widths);
    }
  }
  await browser.close();
  console.log('Google naive ordinary text and exports match base width and optical-size axes.');
})().catch(async error=>{console.error(error);await browser?.close();process.exitCode=1;});
