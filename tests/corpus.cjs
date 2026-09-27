const assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
const c=JSON.parse(fs.readFileSync('research/corpus.json'));
assert.equal(c.engineSHA256,createHash('sha256').update(fs.readFileSync('src/engine.js')).digest('hex'));
assert.equal(c.fonts.length,51);assert.equal(c.fonts.filter(f=>f.referenceKind==='smcp').length,50);
assert.equal(c.fonts.filter(f=>f.cohort==='top50').length,12);
assert.equal(c.fonts.filter(f=>f.auditRank&&f.auditRank<=100).length,16);
assert.equal(c.fonts.filter(f=>f.auditRank&&f.auditRank<=200).length,29);
assert.equal(c.fonts.filter(f=>f.auditRank&&f.auditRank<=300).length,37);
assert.equal(new Set(c.fonts.map(f=>f.name)).size,51);
assert.equal(c.fonts.filter(f=>f.auditRank&&f.auditRank<=500).length,50);
assert.equal(c.fonts.find(f=>f.name==='Jura').referenceLetters.length,4);
assert.equal(c.fonts.find(f=>f.name==='Inter').popularityRank,4);
let instances=0;
for(const f of c.fonts) {
  assert.equal(f.category,require('../research/font-categories.json')[f.name]);
  for(const w of c.weights)for(const optical of ['min','default','max'])assert(f.instances.some(r=>r.requestedWeight===w&&(r.axes.opsz??null)===(f.axes.opsz?.[optical]??null)));
  for(const r of f.instances){
    instances++;assert.equal(r.fit.width,1);assert.equal(r.fit.renderMode,'css');
    for(const n of [r.heightRatio,r.widthGain,r.nativeWidthGain,r.fit.weight,r.fit.scale,r.fit.tracking,r.fit.errors.width])assert(Number.isFinite(n));
    assert(r.fit.weight>=f.axes.wght.min&&r.fit.weight<=f.axes.wght.max);
    if(f.axes.wdth)assert(r.fit.wdth>=f.axes.wdth.min&&r.fit.wdth<=f.axes.wdth.max);
    else assert.equal(r.fit.wdth,undefined);
  }
}
assert.equal(instances,186);
const audit=JSON.parse(fs.readFileSync('research/top500-smcp-audit.json'));
assert.equal(audit.rows.length,500);assert.equal(audit.rows.filter(r=>r.error).length,0);
assert.equal(audit.rows.filter(r=>r.verifiedLatinLetters?.length>0).length,76);
for(const f of c.fonts)assert.equal(f.popularityRank,audit.rows.find(r=>r.family===f.name).rank);
for(const f of c.fonts.filter(f=>f.auditRank)){
  const row=audit.rows.find(r=>r.family===f.name);assert.equal(f.auditRank,row.rank);assert.equal(f.sha256,row.sha256);
}
console.log('Corpus checks passed: 51 unique families, 186 instances, top-500 provenance, native/phonetic separation, axis limits, CSS-only fits, solver hash.');
