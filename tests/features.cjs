const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {execFileSync}=require('node:child_process');

(async()=>{
  // Install fixtures for this browser process only; the page gets no bytes.
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'smallcaps-features-'));
  const config=path.join(temp,'fonts.conf');
  // A width-only variable fixture verifies we don't infer wght from any axis.
  execFileSync('python3',['-c',`
from fontTools.ttLib import TTFont
import sys
f=TTFont('fonts/SourceSans3.ttf');f.ensureDecompiled()
a=f['fvar'].axes[0];a.axisTag='wdth';a.minValue=50;a.defaultValue=50;a.maxValue=200
for i in f['fvar'].instances: i.coordinates={'wdth':50+(i.coordinates['wght']-200)*150/700}
for variations in f['gvar'].variations.values():
 for v in variations:
  if 'wght' in v.axes: v.axes['wdth']=v.axes.pop('wght')
if 'avar' in f: f['avar'].segments['wdth']=f['avar'].segments.pop('wght')
if 'STAT' in f: del f['STAT']
for n in f['name'].names:
 if n.nameID in [1,4,6,16]: n.string='AxisWidthFixture'.encode(n.getEncoding())
f.save(sys.argv[1])
from fontTools.varLib.instancer import instantiateVariableFont
from pathlib import Path
static=instantiateVariableFont(TTFont('fonts/SourceSans3.ttf'),{'wght':400},inplace=True)
names={1:'Alias Fixture Family',4:'Alias Fixture Regular',6:'AliasFixture-Regular',16:'Alias Fixture Family',17:'Regular'}
for n in static['name'].names:
 if n.nameID in names: n.string=names[n.nameID].encode(n.getEncoding())
static.save(Path(sys.argv[1]).with_name('alias.ttf'))
`,path.join(temp,'width.ttf')]);
  fs.writeFileSync(config,`<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd"><fontconfig><include>/etc/fonts/fonts.conf</include><dir>${path.resolve('fonts')}</dir><dir>${temp}</dir><cachedir>${temp}</cachedir></fontconfig>`);
  let browser;
  try {
    browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,headless:true,env:{...process.env,FONTCONFIG_FILE:config}});
    const page=await browser.newPage(),errors=[],requests=[];
    page.on('pageerror',error=>{errors.push(error.message);console.error(error.message);});
    page.on('request',request=>{if(/^https?:/.test(request.url()))requests.push(request.url());});
    await page.addInitScript(()=>{window.queryLocalFonts=()=>{throw Error('Must not request font-file access');};});
    await page.goto(pathToFileURL(path.resolve('index.html')).href);
    await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Ready.'));
    async function check(name) {
      await page.locator('#google-font').fill(name);
      await page.locator('#google-font').press('Enter');
      await page.waitForFunction(()=>!document.querySelector('#google-load').disabled);
      return page.locator('#status').textContent();
    }
    assert.match(await check('"Source Sans 3"'),/Loaded Source Sans 3.*live browser pixel fit/);
    assert.equal(await page.locator('#workspace').isVisible(),true);
    assert.match(await page.locator('#smcp-support').textContent(),/Native small-caps \(smcp\): yes.*26\/26/);
    assert.equal(await page.locator('.ladder-native').count(),10);
    assert.match(await page.locator('#css-export').textContent(),/font-family: "CalibratedFont"/);
    assert.match(await page.locator('#css-export').textContent(),/src: local\("Source Sans 3"\)/);
    let diagnostics=JSON.parse(await page.locator('#diagnostics').textContent());
    assert.equal(diagnostics.axisProbes.wght.detected,true);
    assert.equal(diagnostics.axisProbes.wdth.detected,false);
    assert.match(await page.locator('#font-capabilities').textContent(),/Variable axes detected: wght/);
    await page.locator('#width-method').selectOption('unscaled');
    await page.locator('#weight').fill('637.5');
    await page.locator('#weight').dispatchEvent('input');
    await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Loaded'));
    assert.match(await page.locator('#css-export').textContent(),/"wght" 637.5/);
    assert.equal(await page.locator('#size-ladder > .ladder-row:first-child .ladder-calibrated .sc-word').first().evaluate(e=>getComputedStyle(e).fontWeight),'400');
    const nativeReference=await page.locator('#glyphs path[fill="#d79c86"]').first().getAttribute('d');
    await page.locator('#target').selectOption('xheight');
    await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Loaded'));
    for(const mode of ['transform','unscaled']) {
      await page.locator('#width-method').selectOption(mode);
      assert.equal(await page.locator('#glyphs path[fill="#d79c86"]').first().getAttribute('d'),nativeReference);
      assert.equal(await page.locator('#evidence-reference').textContent(),'native smcp');
      assert.match(await page.locator('#evidence-note').textContent(),/actual smcp glyphs/);
      assert.match(await page.locator('#glyphs .glyph-card > small').first().textContent(),/Ink width: .*Advance width/);
    }
    await page.locator('#target').selectOption('reference');
    await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Loaded'));
    const variableExport=await browser.newPage();
    await variableExport.setContent(await page.locator('#export').textContent());
    await variableExport.evaluate(()=>document.fonts.ready);
    const widths=await variableExport.locator('.smcp').first().evaluate(e=>{
      e.style.fontVariationSettings='"wght" 200';const lo=e.getBoundingClientRect().width;
      e.style.fontVariationSettings='"wght" 900';return [lo,e.getBoundingClientRect().width];
    });
    assert.notEqual(widths[0],widths[1],'Exported local binding must actually vary, not just report CSS settings');
    await variableExport.close();
    assert.match(await check('"Source Serif 4"'),/Loaded Source Serif 4/);
    diagnostics=JSON.parse(await page.locator('#diagnostics').textContent());
    assert.equal(diagnostics.axisProbes.opsz.detected,true);
    assert.equal(await page.locator('#optical-policy').isEnabled(),true);
    await page.locator('#axis-opsz').fill('48');
    await page.locator('#axis-opsz').dispatchEvent('input');
    await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Loaded'));
    assert.match(await page.locator('#css-export').textContent(),/"opsz" 48/);
    assert.match(await check('AxisWidthFixture'),/Loaded AxisWidthFixture/);
    diagnostics=JSON.parse(await page.locator('#diagnostics').textContent());
    assert.equal(diagnostics.axisProbes.wdth.detected,true);
    assert.equal(diagnostics.axisProbes.wght.detected,false);
    assert.equal(await page.locator('#width').isEnabled(),true);
    await page.locator('#width').fill('125');
    await page.locator('#width').dispatchEvent('input');
    await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Loaded'));
    assert.match(await page.locator('#css-export').textContent(),/"wdth" 125/);
    assert.match(await check('DejaVu Sans'),/Loaded DejaVu Sans.*live browser pixel fit/);
    diagnostics=JSON.parse(await page.locator('#diagnostics').textContent());
    assert(Object.values(diagnostics.axisProbes).every(probe=>!probe.detected));
    assert.match(await page.locator('#font-capabilities').textContent(),/static faces.*horizontal scaling/);
    assert.match(await page.locator('#smcp-support').textContent(),/Native small-caps \(smcp\): no/);
    assert.equal(await page.locator('#size-ladder .ladder-row').count(),10);
    await page.locator('#width-method').selectOption('unscaled');
    assert.match(await page.locator('#css-export').textContent(),/span\.smcp \{/);
    assert.match(await page.locator('#css-export').textContent(),/font-family: "DejaVu Sans"/);
    await page.locator('#weight').fill('700');
    await page.locator('#weight').dispatchEvent('input');
    await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Loaded'));
    assert.equal(JSON.parse(await page.locator('#diagnostics').textContent()).measuredSettings.weight,700);
    assert.equal(await page.locator('#size-ladder > .ladder-row:first-child .ladder-calibrated .sc-word').first().evaluate(e=>getComputedStyle(e).fontVariationSettings),'normal');
    const exported=await browser.newPage();
    await exported.setContent(await page.locator('#export').textContent());
    assert.equal(await exported.locator('.smcp').first().evaluate(e=>getComputedStyle(e).fontWeight),'700');
    assert.match(await exported.locator('.smcp').first().evaluate(e=>getComputedStyle(e).fontFamily),/DejaVu Sans/);
    await exported.close();
    await page.locator('#target').selectOption('xheight');
    await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Loaded'));
    assert.equal(JSON.parse(await page.locator('#diagnostics').textContent()).calibrationSource,'live browser pixel fit');
    assert.match(await check('Missing Font 987654321'),/Could not resolve/);
    assert.match(await page.locator('#status').textContent(),/operating system.*Office cloud fonts/);
    assert.match(await check('serif'),/generic family/);
    assert.match(await check('Arial, serif'),/one font name/);
    await check('"Source Sans 3"');
    await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Loaded Source Sans 3'));
    assert.match(await page.locator('#css-export').textContent(),/font-family: "CalibratedFont"/);
    assert.match(await check('AliasFixture-Regular'),/Loaded AliasFixture-Regular/);
    assert.equal(await page.locator('#workspace').isVisible(),true);
    assert.match(await page.locator('#css-export').textContent(),/src: local\("AliasFixture-Regular"\)/);
    diagnostics=JSON.parse(await page.locator('#diagnostics').textContent());
    assert(Object.values(diagnostics.axisProbes).every(probe=>!probe.detected));
    assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
    console.log('Browser pixel checks passed: native small caps, no synthesis, missing family, invalid input, no network or font-file access.');
  } finally {await browser?.close();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
