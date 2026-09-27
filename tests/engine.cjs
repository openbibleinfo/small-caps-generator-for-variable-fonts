const assert=require('node:assert/strict');
const fs=require('node:fs');
const root=process.env.SMALLCAPS_BUILD_MODULES;
const dep=name=>require(root?`${root}/${name}`:name);
const esbuild=dep('esbuild'),fontkit=dep('fontkit'),decompress=dep('wawoff2/decompress.js');
const code=esbuild.buildSync({entryPoints:['src/engine.js'],bundle:true,write:false,format:'cjs',platform:'node'}).outputFiles[0].text;
const mod={exports:{}};new Function('module','exports',code)(mod,mod.exports);
const {analyze,metadata,signature,references}=mod.exports;
(async()=>{
  assert.equal(references({availableFeatures:['c2sc'],hasGlyphForCodePoint:cp=>cp<128,
    layout(){throw Error('Unsupported feature must not be used');}}).kind,'none');
  const profiles=JSON.parse(fs.readFileSync('research/profiles.json'));
  for(const p of profiles.fonts) {
    let data=fs.readFileSync(p.path);if(p.path.endsWith('.woff2'))data=await decompress(data);
    const font=fontkit.create(Buffer.from(data));
    assert.equal(metadata(font).nativeSmcp,p.name!=='Inter Variable');
    assert.equal(metadata(font).smcpLetters.length,p.name==='Inter Variable'?0:26);
    const baseline=Object.values(p.instances).find(p=>p.axes.wght===500&&(!('opsz' in p.axes)||p.axes.opsz===metadata(font).axes.opsz.default));
    const r=analyze(font,{axes:baseline.axes});
    assert.equal(r.referenceKind,p.name==='Inter Variable'?'phonetic':'smcp');
    assert.equal(p.referenceKind,r.referenceKind);
    assert(Math.abs(r.referenceScale-baseline.referenceScale)<.002,`${p.name}: native height`);
    assert(Math.abs(r.fit.scale-baseline.fit.scale)<.003,`${p.name}: fitted height`);
    assert(Math.abs(r.fit.width-baseline.fit.width)<.01,`${p.name}: fitted width`);
    // Fontkit rounds varied points to font units; FontTools retains fractions.
    // Fitted weight can shift slightly, especially at thin serif hairlines.
    assert(Math.abs(r.fit.weight-baseline.fit.weight)<15,`${p.name}: fitted weight ${r.fit.weight} vs ${baseline.fit.weight}`);
    const low=analyze(font,{axes:baseline.axes,manual:{weight:500,scale:.75,width:1}});
    const high=analyze(font,{axes:baseline.axes,manual:{weight:650,scale:.75,width:1}});
    assert.notEqual(low.glyphs.find(g=>g.letter==='H').candidatePath,high.glyphs.find(g=>g.letter==='H').candidatePath,'weight changes outlines');
    console.log(p.name,'height',r.referenceScale.toFixed(4),'width',r.fit.width.toFixed(4),'weight',r.fit.weight.toFixed(1));
  }
  const font=fontkit.create(fs.readFileSync('fonts/SourceSans3.ttf'));
  const css=analyze(font,{renderMode:'css',axes:{wght:500}});
  assert.equal(css.fit.width,1);assert.equal(css.fit.renderMode,'css');
  assert(css.warnings.some(w=>w.includes('No wdth axis')));
  assert(css.fit.weight>=metadata(font).axes.wght.min&&css.fit.weight<=metadata(font).axes.wght.max);
  const fallback=analyze(font,{target:'estimate',axes:{wght:500}});
  assert.equal(fallback.target,'estimate');assert.equal(fallback.fit.width,1.06);assert(fallback.targetHeight>fallback.xHeight);
  const x=analyze(font,{target:'xheight',axes:{wght:500}});assert.equal(x.fit.width,1);assert.equal(x.targetHeight,x.xHeight);
  const instance=font.getVariation({wght:500});
  const nativeH=instance.layout('h',{smcp:true},'latn').glyphs[0].path.toSVG();
  for(const measured of [css,fallback,x]) {
    assert.equal(measured.glyphs.find(g=>g.letter==='H').targetPath,nativeH,'Native smcp remains the comparison reference regardless of fitting target');
    assert.notEqual(measured.glyphs.find(g=>g.letter==='H').targetPath,instance.glyphForCodePoint(72).path.toSVG());
  }
  assert.throws(()=>analyze(font,{manual:{weight:NaN,scale:.75,width:1}}));
  if(fs.existsSync('/tmp/smallcaps-subset.woff2')) {
    const subset=fontkit.create(Buffer.from(await decompress(fs.readFileSync('/tmp/smallcaps-subset.woff2'))));
    assert.equal(metadata(subset).referenceKind,'none');assert.equal(signature(font),signature(subset),'safe subset matches full outlines');
    const estimated=analyze(subset,{axes:{wght:500}});
    assert.equal(estimated.target,'estimate');assert.equal(estimated.referenceKind,'none');
    assert(estimated.fit.weight>500,'Font without small caps still gets measured weight compensation');
    assert(estimated.fit.scale<1);assert(estimated.fit.width>1);assert(estimated.fit.tracking>0);
  }
  console.log('Engine checks passed, including independent FontTools comparisons.');
})().catch(e=>{console.error(e);process.exitCode=1});
