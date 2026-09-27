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
  await page.locator('#upload').setInputFiles('fonts/SourceSerif4.ttf');
  const ready=()=>page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Loaded'));
  await ready();
  await page.locator('#width-method').selectOption('transform');
  const d=JSON.parse(await page.locator('#diagnostics').textContent());
  assert(d.measuredSettings.tracking-d.outputSettings.tracking>.03,'Independent scaling must retain its tighter tracking');
  assert.equal(+await page.locator('#tracking').inputValue(),d.outputSettings.tracking);
  assert.equal(d.outputSettings.trackingSource,'native shaped words');
  for(const mode of ['smcp','c2sc']) {
    await page.locator('#initial-mode').selectOption(mode);
    const m=await page.evaluate(oldTracking=>{
      const rest=document.querySelector('#size-ladder > .ladder-row:first-child .ladder-transformed .sc-rest');
      const native=document.querySelector('#size-ladder > .ladder-row:first-child .ladder-native .sc-word').getBoundingClientRect().width;
      const word=document.querySelector('#size-ladder > .ladder-row:first-child .ladder-transformed .sc-word');
      const initialWidth=word.getBoundingClientRect().width-rest.parentElement.getBoundingClientRect().width;
      const fitted=initialWidth+rest.getBoundingClientRect().width;
      const oldStyle=rest.style.letterSpacing;
      rest.style.letterSpacing=`${oldTracking}em`;
      const overwritten=initialWidth+rest.getBoundingClientRect().width;
      rest.style.letterSpacing=oldStyle;
      return {native,fitted,overwritten};
    },d.measuredSettings.tracking);
    assert(Math.abs(m.fitted-m.native)<Math.abs(m.overwritten-m.native),JSON.stringify(m));
    console.log(mode,m);
  }
  await page.locator('#width-method').selectOption('unscaled');
  assert.equal(+await page.locator('#tracking').inputValue(),d.measuredSettings.tracking);
  await page.locator('#width-method').selectOption('transform');
  assert.equal(+await page.locator('#tracking').inputValue(),d.outputSettings.tracking);
  await page.locator('#tracking-out').fill('0.06');await page.locator('#tracking-out').press('Enter');await ready();
  for(const selector of ['#size-ladder > .ladder-row:first-child .ladder-calibrated .sc-word','#size-ladder > .ladder-row:first-child .ladder-transformed .sc-rest']) {
    const tracking=await page.locator(selector).evaluate(e=>parseFloat(getComputedStyle(e).letterSpacing)/parseFloat(getComputedStyle(e).fontSize));
    assert(Math.abs(tracking-.06)<.0001);
  }
  await page.locator('#fit').click();await ready();
  assert.equal(+await page.locator('#tracking').inputValue(),d.outputSettings.tracking);
  await browser.close();
  console.log('Independent automatic tracking, shared manual tracking, and refit reset passed.');
})().catch(async e=>{console.error(e);await browser?.close();process.exitCode=1;});
