import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {decodeFont} from '../src/decode.js';
import {analyze} from '../src/engine.js';
const bytes=await readFile(join(tmpdir(),'smallcaps-color.ttf'));
const before=Buffer.from(bytes),font=await decodeFont(bytes);
assert.deepEqual(bytes,before,'Analysis adapter must not alter the browser font bytes');
assert(font.directory.tables.COLR&&font.directory.tables.CPAL,'Color tables remain present');
assert(font.measuresColorFallback);
for(const weight of [400,550,800]){
  const variation=font.getVariation({wght:weight});
  assert(variation.measuresColorFallback,'Variation instances retain the adapter');
  const glyph=variation.glyphForCodePoint(72);
  assert(glyph.path.commands.length>0);assert(Number.isFinite(glyph.bbox.maxY));
  for(const renderMode of ['css','transform']){
    const result=analyze(font,{axes:{wght:weight},renderMode});
    assert(Number.isFinite(result.fit.weight));assert(Number.isFinite(result.fit.scale));
  }
}
console.log('Color font recursion regression: outlines, variation instances, both recipes and original bytes passed.');
