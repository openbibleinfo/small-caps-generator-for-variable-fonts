import {create} from 'fontkit';
import {Buffer} from 'buffer';
import decompress from 'wawoff2/decompress.js';
import inflate from 'tiny-inflate';

// Analysis needs monochrome paths. Fontkit 2.0.4 wraps every glyph in a
// COLRGlyph for color fonts; its fallback can then find itself in the glyph
// cache and recurse forever while calculating bounds (e.g. Cairo Play).
// Use the underlying outlines, including in each variable-font instance.
// This changes only our parser objects, never the browser's font bytes.
function measurementFont(font) {
  const tables=font.directory?.tables;
  if(tables?.COLR&&tables.CPAL&&(tables.glyf||tables['CFF ']||tables.CFF2)) {
    font.getGlyph=font._getBaseGlyph;
    const getVariation=font.getVariation;
    font.getVariation=function(settings) {return measurementFont(getVariation.call(this,settings));};
    font.measuresColorFallback=true;
  }
  return font;
}

// Normalize compressed containers before Fontkit variation instancing.
// Fontkit 2.0.4's getVariation constructs a TTFFont, so passing it a compressed
// WOFF/WOFF2 stream directly does not preserve the container's table decoder.
export async function decodeFont(input) {
  let bytes=new Uint8Array(input),tag=String.fromCharCode(...bytes.slice(0,4));
  if(tag==='wOF2')bytes=await decompress(bytes);
  else if(tag==='wOFF') {
    const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),count=v.getUint16(12),size=v.getUint32(16);
    if(size>64*1024*1024||count>512||44+20*count>bytes.length)throw Error('Invalid or oversized WOFF container.');
    const out=new Uint8Array(size),d=new DataView(out.buffer);
    d.setUint32(0,v.getUint32(4));d.setUint16(4,count);
    const power=2**Math.floor(Math.log2(count));d.setUint16(6,power*16);d.setUint16(8,Math.log2(power));d.setUint16(10,count*16-power*16);
    let offset=12+16*count;
    for(let i=0;i<count;i++) {
      const src=44+20*i,dst=12+16*i,start=v.getUint32(src+4),compressed=v.getUint32(src+8),length=v.getUint32(src+12);
      if(start+compressed>bytes.length||offset+length>size)throw Error('Invalid WOFF table bounds.');
      d.setUint32(dst,v.getUint32(src));d.setUint32(dst+4,v.getUint32(src+16));d.setUint32(dst+8,offset);d.setUint32(dst+12,length);
      const table=bytes.subarray(start,start+compressed);
      out.set(compressed<length?inflate(table.subarray(2,table.length-4),new Uint8Array(length)):table,offset);
      offset=(offset+length+3)&~3;
    }
    bytes=out;
  }
  return measurementFont(create(Buffer.from(bytes)));
}
