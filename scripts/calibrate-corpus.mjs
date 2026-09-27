// Offline research; never processes user uploads. Reuses the browser's CSS-only solver.
// node scripts/calibrate-corpus.mjs [audit font cache directory]
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as fontkit from 'fontkit';
import decompress from 'wawoff2/decompress.js';
import {analyze,metadata} from '../src/engine.js';
const audit=JSON.parse(await readFile('research/top500-smcp-audit.json','utf8'));
const categories=JSON.parse(await readFile('research/font-categories.json','utf8'));
const cache=process.argv[2]||'/tmp/smallcaps-top50-audit';
await mkdir(cache,{recursive:true});
const candidates=audit.rows.filter(r=>r.axes?.wght&&r.verifiedLatinLetters?.length).map(r=>({...r,
  path:`${cache}/${r.family.toLowerCase().replace(/[^a-z0-9]/g,'')}.ttf`,cohort:r.rank<=50?'top50':r.rank<=100?'top100':r.rank<=200?'top200':r.rank<=300?'top300':'top500'}));
for(const [family,file] of [['Source Serif 4','SourceSerif4.ttf'],['EB Garamond','EBGaramond.ttf'],['Alegreya','Alegreya.ttf'],['Inter','InterVariable.woff2']])
  if(!candidates.some(c=>c.family===family))candidates.push({family,path:`fonts/${file}`,cohort:'original pilot'});
const median=a=>{const s=[...a].sort((a,b)=>a-b);return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2;};
const corpus={schema:1,method:'CSS-only wght/wdth outline fit; no geometric scaling',
  weights:[400,500,700],baseWidth:'Each font’s default wdth; other non-optical axes at defaults',
  engineSHA256:createHash('sha256').update(await readFile('src/engine.js')).digest('hex'),fonts:[]};
let previous;
try{previous=JSON.parse(await readFile('research/corpus.json','utf8'));}catch{}
const reuse=previous?.engineSHA256===corpus.engineSHA256&&JSON.stringify(previous.weights)===JSON.stringify(corpus.weights)
  ?new Map(previous.fonts.map(f=>[f.name,f])):new Map();
for(const source of candidates) {
  const popularityRank=audit.rows.find(r=>r.family===source.family)?.rank??null;
  let bytes;try{bytes=await readFile(source.path);}catch(error){
    if(!source.fontURL)throw error;
    const response=await fetch(source.fontURL);if(!response.ok)throw Error(`Download failed: ${source.family}`);
    bytes=Buffer.from(await response.arrayBuffer());await writeFile(source.path,bytes);
  }
  const sha256=createHash('sha256').update(bytes).digest('hex');
  if(source.sha256&&source.sha256!==sha256)throw Error(`${source.family}: file no longer matches the audited hash; re-audit before calibration.`);
  const cached=reuse.get(source.family);
  if(cached?.sha256===sha256) {
    // Measure the native width target, not the width our fitter managed to achieve.
    if(cached.instances.some(r=>!Number.isFinite(r.nativeWidthGain))) {
      const font=fontkit.create(source.path.endsWith('.woff2')?Buffer.from(await decompress(bytes)):bytes);
      for(const r of cached.instances) {
        const scale=r.referenceHeight/r.capHeight;
        const base=analyze(font,{renderMode:'css',target:'reference',axes:r.axes,manual:{weight:r.axes.wght,wdth:r.axes.wdth,scale,width:1}});
        r.nativeWidthGain=median(base.glyphs.filter(g=>g.used).map(g=>g.target.width/(scale*g.candidate.width)));
      }
    }
    corpus.fonts.push({...cached,category:categories[source.family],cohort:source.cohort,auditRank:source.rank??null,popularityRank,sourceURL:source.fontURL||null});
    console.log(`${source.family}: reused verified fits (same source hash, solver and settings).`);continue;
  }
  if(source.path.endsWith('.woff2'))bytes=Buffer.from(await decompress(bytes));
  const font=fontkit.create(bytes),meta=metadata(font);
  if(!categories[source.family])throw Error(`Classify ${source.family} in font-categories.json first.`);
  const entry={name:source.family,category:categories[source.family],fontName:meta.name,sha256,sourceURL:source.fontURL||null,cohort:source.cohort,auditRank:source.rank??null,
    popularityRank,axes:meta.axes,referenceKind:meta.referenceKind,referenceLetters:meta.referenceLetters,instances:[]};
  for(const requestedWeight of corpus.weights) {
    const baseWeight=Math.max(meta.axes.wght.min,Math.min(meta.axes.wght.max,requestedWeight));
    const optical=meta.axes.opsz?[...new Set(['min','default','max'].map(k=>meta.axes.opsz[k]))]:[null];
    for(const opsz of optical) {
      const axes=Object.fromEntries(Object.entries(meta.axes).map(([tag,a])=>[tag,tag==='wght'?baseWeight:tag==='opsz'?opsz:a.default]));
      const r=analyze(font,{renderMode:'css',target:'reference',axes});
      const base=analyze(font,{renderMode:'css',target:'reference',axes,manual:{weight:baseWeight,wdth:axes.wdth,scale:r.targetHeight/r.capHeight,width:1}});
      const used=r.glyphs.filter(g=>g.used),byLetter=Object.fromEntries(base.glyphs.map(g=>[g.letter,g.candidate]));
      const gains=used.map(g=>r.fit.scale*g.candidate.width/(base.fit.scale*byLetter[g.letter].width));
      const stems=used.filter(g=>'BDEFHLMNPRT'.includes(g.letter)&&g.target.vstem&&byLetter[g.letter].vstem)
        .map(g=>g.target.vstem/(base.fit.scale*byLetter[g.letter].vstem));
      const wdth=meta.axes.wdth;
      entry.instances.push({requestedWeight,axes,capHeight:r.capHeight,xHeight:r.xHeight,referenceHeight:r.referenceHeight,
        heightRatio:r.referenceHeight/r.xHeight,widthGain:median(gains),nativeWidthGain:median(base.glyphs.filter(g=>g.used).map(g=>g.target.width/(base.fit.scale*g.candidate.width))),strokeUplift:stems.length?median(stems):null,
        fit:r.fit,warnings:r.warnings,widthLimit:!!wdth&&Math.min(Math.abs(r.fit.wdth-wdth.min),Math.abs(r.fit.wdth-wdth.max))<.2});
      console.log(`${source.family} wght=${baseWeight} opsz=${opsz??'—'} -> wght=${r.fit.weight.toFixed(1)} wdth=${r.fit.wdth?.toFixed(2)??'—'} width error=${r.fit.errors.width?.toFixed(2)}%`);
    }
  }
  corpus.fonts.push(entry);
  // Keep progress for diagnosis if a later font fails; the build reads only the final file.
  await writeFile(`${cache}/corpus-progress.json`,JSON.stringify(corpus,null,2)+'\n');
}
await writeFile('research/corpus.json',JSON.stringify(corpus,null,2)+'\n');
console.log(`Saved ${corpus.fonts.length} families / ${corpus.fonts.reduce((n,f)=>n+f.instances.length,0)} instances.`);
