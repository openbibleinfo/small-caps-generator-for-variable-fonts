import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {corpusPrior,familyPrior} from '../src/corpus-prior.js';
const corpus=JSON.parse(await readFile('research/corpus.json','utf8'));
const p=corpusPrior(corpus,500);
assert.equal(p.families,51);
assert(p.heightFraction>0&&p.heightFraction<1);assert(p.width>0&&p.tracking>0);
assert.deepEqual(corpusPrior(corpus,100),corpusPrior(corpus,400));
assert.deepEqual(corpusPrior(corpus,900),corpusPrior(corpus,700));
assert.notDeepEqual(corpusPrior(corpus,400),corpusPrior(corpus,700));
const doubled=structuredClone(corpus);
for(const f of doubled.fonts)f.instances.push(...f.instances);
assert.deepEqual(corpusPrior(doubled,500),p,'Instance duplication must not reweight families');
for(const f of corpus.fonts) {
  const lo=familyPrior(f,400),hi=familyPrior(f,500),mid=familyPrior(f,450);
  for(const key of ['heightFraction','width','tracking'])assert(Math.abs(mid[key]-(lo[key]+hi[key])/2)<1e-10);
}
// Leave each family out before predicting it. This assesses proportions,
// not rendering quality or independence among related families.
const rows=corpus.fonts.map(f=>{
  const predicted=corpusPrior(corpus,500,f.name),actual=familyPrior(f,500);
  assert.equal(predicted.families,50);
  const r=f.instances.find(r=>r.requestedWeight===500&&(r.axes.opsz??null)===(f.axes.opsz?.default??null));
  const height=r.xHeight+predicted.heightFraction*(r.capHeight-r.xHeight);
  return {family:f.name,heightErrorPercent:100*Math.abs(height/r.referenceHeight-1),
    widthErrorPercent:100*Math.abs(predicted.width/actual.width-1),trackingErrorEm:Math.abs(predicted.tracking-actual.tracking)};
});
const median=a=>{const s=[...a].sort((a,b)=>a-b);return s[Math.floor(s.length/2)];};
const report={method:p.method,priorAt500:p,validation:'Leave-one-family-out at weight 500, default optical design; related designs are not independent. Errors compare proportions, not visual quality.',
  medianErrors:Object.fromEntries(['heightErrorPercent','widthErrorPercent','trackingErrorEm'].map(k=>[k,median(rows.map(r=>r[k]))])),families:rows};
await writeFile('research/prior-validation.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({prior:p,medianErrors:report.medianErrors},null,2));
console.log('Current-corpus prior checks passed.');
