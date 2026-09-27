// All measurements run in a browser worker. No rasterizer or network required.
export const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const phonetic=Object.fromEntries([..."ABDEGHIJKLMNOPRTUVWYZ"].map((c,i)=>[c,[..."ᴀʙᴅᴇɢʜɪᴊᴋʟᴍɴᴏᴘʀᴛᴜᴠᴡʏᴢ"][i]]));
const median=a=>{const s=[...a].sort((a,b)=>a-b);return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2;};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const glyph=(font,c)=>font.glyphForCodePoint(c.codePointAt(0));
const has=(font,c)=>font.hasGlyphForCodePoint(c.codePointAt(0));
const instance=(font,axes)=>Object.keys(font.variationAxes).length?font.getVariation(axes):font;

export function references(font) {
  if(font.availableFeatures.includes('smcp')) {
    const refs={};
    for(const c of alphabet) {
      const ch=c.toLowerCase();
      if(!has(font,c)||!has(font,ch))continue;
      const run=font.layout(ch,{smcp:true},'latn');
      if(run.glyphs.length===1 && run.glyphs[0].id!==glyph(font,ch).id)refs[c]=run.glyphs[0].id;
    }
    if(Object.keys(refs).length)return {kind:'smcp',refs};
  }
  const refs={};
  for(const [c,s] of Object.entries(phonetic))if(has(font,c)&&has(font,s))refs[c]=glyph(font,s).id;
  return {kind:Object.keys(refs).length?'phonetic':'none',refs};
}
export function metadata(font) {
  if(!font.glyphForCodePoint)throw Error('Choose a single TTF, OTF, WOFF, or WOFF2 face, not a font collection.');
  const {kind,refs}=references(font);
  return {name:font.familyName||font.fullName||'Uploaded font',axes:font.variationAxes,unitsPerEm:font.unitsPerEm,
    nativeSmcp:font.availableFeatures.includes('smcp'),
    smcpLetters:kind==='smcp'?Object.keys(refs).join(''):'',
    staticWeight:font['OS/2']?.usWeightClass||400,referenceKind:kind,referenceLetters:Object.keys(refs).join('')};
}
function contours(path) {
  let point=[0,0], points=[], result=[];
  for(const {command,args:p} of path.commands) {
    if(command==='moveTo'){if(points.length)result.push([...points,points[0]]);point=p;points=[p];}
    else if(command==='lineTo'){point=p;points.push(p);}
    else if(command==='quadraticCurveTo'||command==='bezierCurveTo') {
      const start=point, cubic=command==='bezierCurveTo', steps=cubic?32:24;
      for(let i=1;i<=steps;i++) {
        const t=i/steps,u=1-t;
        points.push([0,1].map(k=>cubic?u**3*start[k]+3*u*u*t*p[k]+3*u*t*t*p[k+2]+t**3*p[k+4]:u*u*start[k]+2*u*t*p[k]+t*t*p[k+2]));
      }
      point=p.slice(-2);
    } else if(command==='closePath'){if(points.length)result.push([...points,points[0]]);points=[];}
  }
  if(points.length)result.push([...points,points[0]]);
  return result;
}
function runs(contours,position,vertical=false) {
  const axis=vertical?0:1,other=1-axis,hits=[];
  for(const contour of contours)for(let i=1;i<contour.length;i++) {
    const a=contour[i-1],b=contour[i];
    if(Math.min(a[axis],b[axis])<=position&&position<Math.max(a[axis],b[axis])) {
      const t=(position-a[axis])/(b[axis]-a[axis]);hits.push([a[other]+t*(b[other]-a[other]),b[axis]>a[axis]?1:-1]);
    }
  }
  hits.sort((a,b)=>a[0]-b[0]);let winding=0,start=0;const widths=[];
  for(const [point,delta] of hits){const prev=winding;winding+=delta;if(prev===0&&winding!==0)start=point;else if(prev!==0&&winding===0&&point>start)widths.push(point-start);}
  return widths;
}
class Outlines {
  constructor(font,axes){this.font=instance(font,axes);this.cache=new Map();}
  get(id) {
    if(this.cache.has(id))return this.cache.get(id);
    const g=this.font.getGlyph(id),b=g.bbox,c=contours(g.path),v=[],h=[];
    if(!Number.isFinite(b.maxY)||b.maxX<=b.minX)throw Error(`Empty or unsupported outline (${id}).`);
    for(const t of [.25,.32,.68,.75]){const r=runs(c,b.minY+(b.maxY-b.minY)*t);if(r.length)v.push(r[0]);}
    for(const t of [.44,.5,.56]){const r=runs(c,b.minX+(b.maxX-b.minX)*t,true);if(r.length)h.push(Math.min(...r));}
    const m={bounds:[b.minX,b.minY,b.maxX,b.maxY],width:b.maxX-b.minX,advance:g.advanceWidth,vstem:v.length?median(v):null,hstem:h.length?median(h):null};
    this.cache.set(id,m);return m;
  }
  char(c){return this.get(glyph(this.font,c).id);}
  svg(id){return this.font.getGlyph(id).path.toSVG();}
}
export function signature(font) {
  const meta=metadata(font),letters=alphabet+alphabet.toLowerCase();
  if([...letters].some(c=>!has(font,c)))return null;
  const defaults=Object.fromEntries(Object.entries(meta.axes).map(([k,v])=>[k,v.default]));
  const locations=[defaults];
  for(const [tag,a] of Object.entries(meta.axes))for(const bound of ['min','max'])locations.push({...defaults,[tag]:a[bound]});
  return JSON.stringify([meta.name,font.version,meta.unitsPerEm,meta.axes,locations.map(loc=>{
    const f=instance(font,loc);return [...letters].map(c=>{const g=glyph(f,c);return [g.advanceWidth,g.path.commands];});
  })]);
}
export function analyze(font,options={}) {
  const meta=metadata(font),axes=meta.axes,location={};
  if(!has(font,'H')||!has(font,'x'))throw Error('This Latin calibrator needs real x and H glyphs.');
  for(const [tag,a] of Object.entries(axes)) {
    const v=Number(options.axes?.[tag]??a.default);if(!Number.isFinite(v))throw Error('Invalid axis value.');location[tag]=clamp(v,a.min,a.max);
  }
  const base=new Outlines(font,location),capHeight=base.char('H').bounds[3],xHeight=base.char('x').bounds[3];
  const {kind,refs}=references(base.font),refMetrics=Object.fromEntries(Object.entries(refs).map(([c,id])=>[c,base.get(id)]));
  const heights=Object.entries(refMetrics).filter(([c])=>'BEFHKLMNPRTXYZ'.includes(c)).map(([,m])=>m.bounds[3]);
  const referenceHeight=heights.length?median(heights):null;
  const useRefs=(options.target||'reference')==='reference'&&referenceHeight!==null;
  const estimated=!useRefs&&options.target!=='xheight',prior=options.prior||{heightFraction:.2,width:1.06};
  const targetHeight=useRefs?referenceHeight:estimated?xHeight+prior.heightFraction*(capHeight-xHeight):xHeight;
  const targets=useRefs?Object.fromEntries(Object.entries(refMetrics).filter(([c])=>c!=='I')):Object.fromEntries([...'HEFLT'].filter(c=>has(font,c)).map(c=>[c,base.char(c)]));
  const weightAxis=axes.wght,baseWeight=location.wght??meta.staticWeight,warnings=[];
  const cssMode=options.renderMode==='css',widthAxis=cssMode?axes.wdth:null;
  if(cssMode&&!axes.wdth)warnings.push('No wdth axis: CSS-only output cannot independently widen these glyphs. Width stays at the font’s design; tracking is fitted separately.');
  if(kind==='phonetic')warnings.push('Phonetic small capitals are partial design evidence, not a complete typographic small-cap set. Shapes and spacing may differ.');
  if(estimated)warnings.push(`Estimated proportions: x-height plus ${(prior.heightFraction*100).toFixed(0)}% of the gap to cap height, and ${(prior.width*100).toFixed(1)}% width. This pilot-corpus prior is not evidence of this font’s intended small-caps.`);
  else if(!useRefs)warnings.push('X-height is a chosen experiment, not a discovered small-cap height. Width starts at 100%.');
  if(!weightAxis)warnings.push('Static font: no wght axis is available to compensate the reduced strokes. Try a variable version or a heavier companion face.');
  if(font.italicAngle)warnings.push('Slanted outlines make these scanline stem estimates less reliable; check the visual comparison.');
  const evaluate=(weight,manual,wdth=location.wdth)=>{
    const candidate=new Outlines(font,{...location,...(weightAxis?{wght:weight}:{}),...(widthAxis?{wdth}:{})});
    const scale=manual?.scale??targetHeight/candidate.char('H').bounds[3];
    const metrics=Object.fromEntries(Object.keys(targets).map(c=>[c,candidate.char(c)]));
    const width=cssMode?1:manual?.width??(useRefs?median(Object.entries(metrics).map(([c,m])=>targets[c].width/(scale*m.width))):estimated?prior.width:1);
    const errors={width:[],vertical:[],horizontal:[]};
    for(const [c,m] of Object.entries(metrics)) {
      const t=targets[c];
      if(useRefs)errors.width.push(Math.log(scale*width*m.width/t.width));
      else if(cssMode)errors.width.push(Math.log(scale*m.width/(targetHeight/capHeight*t.width*(estimated?prior.width:1))));
      if('BDEFHLMNPRT'.includes(c)&&m.vstem&&t.vstem)errors.vertical.push(Math.log(scale*width*m.vstem/t.vstem));
      if('EFHLT'.includes(c)&&m.hstem&&t.hstem)errors.horizontal.push(Math.log(scale*m.hstem/t.hstem));
    }
    const score=Object.values(errors).reduce((s,a)=>s+(a.length?a.reduce((s,x)=>s+x*x,0)/a.length:0),0);
    return {fit:{weight,scale,width,...(cssMode?{wdth,renderMode:'css'}:{}),score},candidate,metrics,errors};
  };
  let best;
  if(options.manual) {
    const m=options.manual;
    if(!['weight','scale','width'].every(k=>Number.isFinite(m[k]))||m.scale<.2||m.scale>1.5||m.width<.4||m.width>2)throw Error('Invalid calibration values.');
    if(widthAxis&&!Number.isFinite(m.wdth))throw Error('Invalid width-axis value.');
    best=evaluate(weightAxis?clamp(m.weight,weightAxis.min,weightAxis.max):baseWeight,m,widthAxis?clamp(m.wdth,widthAxis.min,widthAxis.max):location.wdth);
  } else if(widthAxis) {
    let wlo=weightAxis?.min??baseWeight,whi=weightAxis?.max??baseWeight,dlo=widthAxis.min,dhi=widthAxis.max;
    for(let pass=0;pass<3;pass++) {
      const ws=(whi-wlo)/6,ds=(dhi-dlo)/6;let winner;
      for(let i=0;i<=(ws?6:0);i++)for(let j=0;j<=(ds?6:0);j++) {
        const trial=evaluate(wlo+i*ws,null,dlo+j*ds);
        if(!winner||trial.fit.score<winner.fit.score)winner=trial;
      }
      best=winner;wlo=Math.max(weightAxis?.min??baseWeight,best.fit.weight-ws);whi=Math.min(weightAxis?.max??baseWeight,best.fit.weight+ws);
      dlo=Math.max(widthAxis.min,best.fit.wdth-ds);dhi=Math.min(widthAxis.max,best.fit.wdth+ds);
    }
  } else if(weightAxis) {
    let lo=weightAxis.min,hi=weightAxis.max;
    for(let pass=0;pass<3;pass++) {
      const step=(hi-lo)/12,trials=[];for(let i=0;i<=12;i++)trials.push(evaluate(lo+i*step));
      best=trials.reduce((a,b)=>a.fit.score<b.fit.score?a:b);
      lo=Math.max(weightAxis.min,best.fit.weight-step);hi=Math.min(weightAxis.max,best.fit.weight+step);
    }
  } else best=evaluate(baseWeight);
  const {fit,candidate,metrics,errors}=best;
  // Spacing is separate from ink width. First estimate from glyph advances;
  // then use native shaped words when a real small-cap feature is available.
  const trackingSamples=useRefs?Object.entries(metrics).map(([c,m])=>(targets[c].advance-fit.scale*fit.width*m.advance)/(font.unitsPerEm*fit.scale*fit.width)):[];
  const phraseTracking=[],spacingWords=[];
  if(useRefs&&kind==='smcp') {
    for(const word of ['LORD','GOD','HAMBURGEFONTS','TYPE','AMEN','WASHINGTON','BIBLE','TRUTH','MINIMUM']) {
      if([...word].some(c=>!(c in refs)))continue;
      const native=base.font.layout(word.toLowerCase(),{smcp:true},'latn').advanceWidth;
      const simulated=candidate.font.layout(word,{},'latn').advanceWidth*fit.scale*fit.width;
      phraseTracking.push((native-simulated)/(word.length*font.unitsPerEm*fit.scale*fit.width));
      spacingWords.push({word,native,untracked:simulated});
    }
  }
  fit.tracking=useRefs?median(phraseTracking.length?phraseTracking:trackingSamples):(prior.tracking??0.025);
  fit.trackingSource=phraseTracking.length?'native shaped words':useRefs?'reference glyph advances':'fallback estimate';
  fit.trackingRange=trackingSamples.length?[Math.min(...trackingSamples),Math.max(...trackingSamples)]:null;
  if(!useRefs)warnings.push(`Tracking starts at ${fit.tracking>=0?'+':''}${fit.tracking.toFixed(3)}em as an estimated starting point, not a measured property of this font.`);
  if(options.manual&&Number.isFinite(options.manual.tracking))fit.tracking=options.manual.tracking;
  fit.spacingWords=spacingWords.map(row=>({...row,tracked:row.untracked+row.word.length*font.unitsPerEm*fit.scale*fit.width*fit.tracking}));
  fit.spacingWordRmsPercent=spacingWords.length?100*Math.sqrt(fit.spacingWords.reduce((sum,row)=>sum+(row.tracked/row.native-1)**2,0)/spacingWords.length):null;
  if(weightAxis&&Math.min(Math.abs(fit.weight-weightAxis.min),Math.abs(fit.weight-weightAxis.max))<.2)warnings.push('The fit reached a weight-axis limit. The font may not have enough range to match the target strokes.');
  fit.baseWeight=baseWeight;
  if(widthAxis&&Math.min(Math.abs(fit.wdth-widthAxis.min),Math.abs(fit.wdth-widthAxis.max))<.2)warnings.push('The fit reached a width-axis limit; this font may not have enough width range to match the target.');
  fit.errors=Object.fromEntries(Object.entries(errors).map(([k,a])=>[k,a.length?100*Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length):null]));
  const widths=Object.entries(metrics).map(([c,m])=>targets[c].width/(fit.scale*m.width));
  fit.widthRange=useRefs?[Math.min(...widths),Math.max(...widths)]:null;
  if(Object.values(fit.errors).some(v=>v>10))warnings.push('Some measurements differ by more than 10%. One height/width/weight cannot reproduce this design closely; stroke diagnostics also depend on glyph shape.');
  const comparisonUsesRefs=useRefs||kind==='smcp';
  const letters=Object.keys(refs).length?Object.keys(refs):Object.keys(targets);
  const glyphs=letters.map(c=>{
    const upper=glyph(font,c).id,target=comparisonUsesRefs?refs[c]:upper,m=candidate.get(upper),t=base.get(target);
    return {letter:c,reference:kind==='phonetic'?phonetic[c]:c,targetPath:base.svg(target),candidatePath:candidate.svg(upper),target:t,candidate:m,used:c in targets,
      widthError:comparisonUsesRefs?100*(fit.scale*fit.width*m.width/t.width-1):null,advanceError:comparisonUsesRefs?100*(fit.scale*fit.width*m.advance/t.advance-1):null,
      spacedAdvanceError:comparisonUsesRefs?100*(fit.scale*fit.width*(m.advance+fit.tracking*font.unitsPerEm)/t.advance-1):null};
  });
  return {...meta,axesLocation:location,fit,glyphs,warnings,target:useRefs?'reference':estimated?'estimate':'xheight',
    capHeight,xHeight,referenceHeight,targetHeight,xHeightScale:xHeight/capHeight,referenceScale:referenceHeight?referenceHeight/capHeight:null,
    missingLetters:[...alphabet].filter(c=>!has(font,c)).join('')};
}
