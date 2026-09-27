// Reuse stored fits; interpolate sampled weight/optical coordinates, never refit.
export function tableRecipe(corpus,name,axes={}) {
  const font=corpus.fonts.find(f=>f.name.toLowerCase()===name?.toLowerCase());
  if(!font)return null;
  for(const [tag,value] of Object.entries(axes))if(!['wght','opsz'].includes(tag)&&font.axes[tag]&&Math.abs(value-font.axes[tag].default)>.01)return null;
  const bracket=(values,value)=>{
    const sorted=[...new Set(values)].sort((a,b)=>a-b);
    const lo=[...sorted].reverse().find(v=>v<=value)??sorted[0],hi=sorted.find(v=>v>=value)??sorted.at(-1);
    return {lo,hi,t:lo===hi?0:(value-lo)/(hi-lo)};
  };
  const weight=axes.wght??font.axes.wght.default;
  const w=bracket(font.instances.map(r=>r.requestedWeight),weight);
  const optical=axes.opsz??font.axes.opsz?.default??0;
  const o=bracket(font.instances.map(r=>r.axes.opsz??0),optical);
  const at=(weight,opsz)=>font.instances.find(r=>r.requestedWeight===weight&&(r.axes.opsz??0)===opsz);
  const mix=fn=>{
    const low=fn(at(w.lo,o.lo))*(1-o.t)+fn(at(w.lo,o.hi))*o.t;
    const high=fn(at(w.hi,o.lo))*(1-o.t)+fn(at(w.hi,o.hi))*o.t;
    return low*(1-w.t)+high*w.t;
  };
  return {family:font.name,referenceKind:font.referenceKind,
    sampledWeight:Math.max(w.lo,Math.min(w.hi,weight)),sampledOptical:Math.max(o.lo,Math.min(o.hi,optical)),
    interpolated:w.t>0||o.t>0,
    fit:{scale:mix(r=>r.fit.scale),weight:mix(r=>r.fit.weight),width:1,tracking:mix(r=>r.fit.tracking),
      ...(font.axes.wdth?{wdth:mix(r=>r.fit.wdth)}:{})},
    prior:{heightFraction:mix(r=>(r.referenceHeight-r.xHeight)/(r.capHeight-r.xHeight)),width:mix(r=>r.nativeWidthGain),tracking:mix(r=>r.fit.tracking)}};
}
