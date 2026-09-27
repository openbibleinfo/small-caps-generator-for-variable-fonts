const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
let browser;
(async()=>{
  browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.goto(pathToFileURL(path.resolve('index.html')).href);
  await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Ready.'));
  await page.locator('#upload').setInputFiles('fonts/SourceSerif4.ttf');
  await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Loaded'));
  const position=()=>page.evaluate(()=>({page:scrollY,sidebar:document.querySelector('#sidebar').scrollTop,preview:document.querySelector('#review-scroll').scrollTop}));
  for(const mobile of [false,true]){
    await page.setViewportSize(mobile?{width:390,height:844}:{width:1440,height:1000});
    for(const [id,value,measured] of [['axis-wght',550,true],['scale',.75,true],['weight',630,true],['width',1.15,true],['tracking',.04,true],['gap',.03,false],['size',44,false],['reading-size',22,false]]){
      await page.evaluate(mobile=>{
        if(mobile)window.scrollTo(0,document.querySelector('#size-ladder').getBoundingClientRect().top+scrollY+500);
        else {
          document.querySelector('#sidebar').scrollTop=250;
          document.querySelector('#review-scroll').scrollTop=1200;
        }
      },mobile);
      const before=await position();
      assert((mobile?before.page:before.preview)>500);
      await page.locator('#'+id).evaluate((input,value)=>{input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));},value);
      if(measured)await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Loaded'));
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const after=await position();
      const limits=await page.evaluate(()=>({page:Math.max(0,document.documentElement.scrollHeight-innerHeight),
        sidebar:document.querySelector('#sidebar').scrollHeight-document.querySelector('#sidebar').clientHeight,
        preview:document.querySelector('#review-scroll').scrollHeight-document.querySelector('#review-scroll').clientHeight}));
      // A shorter document can clamp a bottom-anchored scroll position.
      for(const key of Object.keys(before))assert(Math.abs(after[key]-Math.min(before[key],limits[key]))<=1,`${mobile?'mobile':'desktop'} ${id}: ${key} moved ${before[key]} -> ${after[key]}`);
    }
  }
  await browser.close();
  console.log('Text weight and recipe controls preserve desktop panel and mobile page scroll positions.');
})().catch(async error=>{console.error(error);await browser?.close();process.exitCode=1;});
