// Equal-family robust estimates. Use each family's default optical design;
// interpolate the measured weights and clamp outside the sampled 400–700 range.
const median=values=>{const a=[...values].sort((a,b)=>a-b),i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2;};
export function familyPrior(font,weight) {
  const rows=font.instances.filter(r=>(r.axes.opsz??null)===(font.axes.opsz?.default??null))
    .sort((a,b)=>a.requestedWeight-b.requestedWeight);
  const lo=[...rows].reverse().find(r=>r.requestedWeight<=weight)||rows[0];
  const hi=rows.find(r=>r.requestedWeight>=weight)||rows.at(-1);
  const t=hi.requestedWeight===lo.requestedWeight?0:(weight-lo.requestedWeight)/(hi.requestedWeight-lo.requestedWeight);
  const blend=fn=>fn(lo)+(fn(hi)-fn(lo))*t;
  return {heightFraction:blend(r=>(r.referenceHeight-r.xHeight)/(r.capHeight-r.xHeight)),
    width:blend(r=>r.nativeWidthGain),tracking:blend(r=>r.fit.tracking)};
}
export function corpusPrior(corpus,weight=500,excludeName=null) {
  const rows=corpus.fonts.filter(f=>f.name!==excludeName).map(f=>familyPrior(f,weight))
    .filter(r=>Object.values(r).every(Number.isFinite));
  if(!rows.length)throw Error('No valid measurements for the current-corpus estimate.');
  return {...Object.fromEntries(['heightFraction','width','tracking'].map(k=>[k,median(rows.map(r=>r[k]))])),
    families:rows.length,method:'Equal-family medians; default optical designs; weight interpolation over 400–700',
    weight:Math.max(400,Math.min(700,weight))};
}
