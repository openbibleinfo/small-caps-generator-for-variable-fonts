import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {tableRecipe} from '../src/table-recipe.js';
const c=JSON.parse(await readFile('research/corpus.json','utf8'));
for(const f of c.fonts)for(const r of f.instances){
  const stored=tableRecipe(c,f.name,{...r.axes,wght:r.requestedWeight});
  for(const key of ['scale','weight','tracking','wdth'])assert.equal(stored.fit[key],r.fit[key],`${f.name}: ${key}`);
}
assert.equal(tableRecipe(c,'Not in corpus',{}),null);
assert.equal(tableRecipe(c,'Roboto',{wght:500,wdth:80}),null);
const a=tableRecipe(c,'Roboto',{wght:400}),b=tableRecipe(c,'Roboto',{wght:500}),mid=tableRecipe(c,'Roboto',{wght:450});
assert.equal(mid.fit.weight,(a.fit.weight+b.fit.weight)/2);
assert(mid.interpolated);
assert.deepEqual(tableRecipe(c,'Roboto',{wght:100}).fit,a.fit);
console.log('Stored recipe checks passed: every sampled fit, interpolation, endpoints and unsupported axes.');
