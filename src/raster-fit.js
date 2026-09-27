import {corpusPrior} from './corpus-prior.js';
const localSources=name=>[name,`${name} Regular`,`${name.replaceAll(' ','')}-Regular`].map(face=>`local(${JSON.stringify(face)})`).join(', ');
const axisCSS=axes=>Object.entries(axes).map(([tag,value])=>`"${tag}" ${value}`).join(', ')||'normal';
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const median=a=>{const s=[...a].sort((a,b)=>a-b);return s.length?s[Math.floor(s.length/2)]:0;};
const cache=new Map(),boundFaces=new Map();
async function bindLocalFace(name) {
  if(boundFaces.has(name))return boundFaces.get(name);
  const renderFamily=`BrowserMeasured_${boundFaces.size+1}`;
  const face=new FontFace(renderFamily,localSources(name),{weight:'100 900',stretch:'50% 200%'});
  await face.load();document.fonts.add(face);boundFaces.set(name,renderFamily);
  return renderFamily;
}
async function bitmap(name,text,variant='normal',weight=400,axes={}) {
  const key=JSON.stringify([name,text,variant,weight,axes,boundFaces.has(name)]);
  if(!cache.has(key)) {
    if(cache.size>=20)cache.clear();
    cache.set(key,featureBitmap(name,text,variant,'serif',weight,axes));
  }
  return cache.get(key);
}
export async function inspectLocalFont(name) {
  if(/^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-.+|emoji|math|fangsong)$/i.test(name))throw Error('Enter a specific installed font family, not a generic family.');
  if(/[<>\x00-\x1f]/.test(name))throw Error('Enter one plain installed font family name.');
  if(!CSS.supports('font-synthesis','none')||!CSS.supports('font-variant-caps','small-caps'))throw Error('This browser lacks the CSS controls required for measurement.');
  const letters=alphabet+alphabet.toLowerCase();
  const a=await featureBitmap(name,letters),b=await featureBitmap(name,letters,'normal','monospace');
  // CSS family lookup need not recognize a full face name or PostScript name.
  // Try local() before treating a fallback difference as an unavailable font.
  if(changedFeatureLetters(a,b,letters)) {
    try {await bindLocalFace(name);}
    catch {
      throw Error(`Could not resolve “${name}” in this browser. Install it in the operating system and reopen the browser. Fonts available only inside an app (including Office cloud fonts such as Aptos) may not be accessible here.`);
    }
    const boundA=await featureBitmap(name,letters),boundB=await featureBitmap(name,letters,'normal','monospace');
    if(changedFeatureLetters(boundA,boundB,letters))throw Error(`“${name}” is available through local(), but its Latin letters could not be rendered consistently. Try its family name or another browser.`);
  }
  const normal=await bitmap(name,alphabet.toLowerCase()),small=await bitmap(name,alphabet.toLowerCase(),'small-caps');
  const smcpLetters=changedFeatureLetters(normal,small,alphabet.toLowerCase()).toUpperCase();
  const {axes,axisProbes}=await probeAxes(name);
  let renderFamily=boundFaces.get(name)||name;
  if(Object.keys(axes).length) {
    renderFamily=await bindLocalFace(name);
  }
  return {name,localName:name,browserMeasured:true,axes,axisProbes,renderFamily,boundLocal:boundFaces.has(name),localSources:localSources(name),staticWeight:400,unitsPerEm:128,nativeSmcp:!!smcpLetters,smcpLetters,referenceKind:smcpLetters?'smcp':'none',referenceLetters:smcpLetters};
}
// Keep CSS face selection fixed. Only explicit variation settings change.
// These are probe windows, not claims about the font's declared axis bounds.
async function probeAxes(name) {
  const axes={},axisProbes={};
  const windows={wght:[100,300,400,450,500,700,900],wdth:[50,75,100,110,125,150,200],opsz:[6,12,14,24,48,72,144]};
  const defaults={wght:400,wdth:100,opsz:14},sample='HAMBURGEFONTSrx';
  for(const [tag,values] of Object.entries(windows)) {
    let first,detected=false;
    for(const value of values) {
      const image=await featureBitmap(name,sample,'normal','serif',400,{[tag]:value},true);
      if(first&&changedFeatureLetters(first,image,sample))detected=true;
      first??=image;
    }
    axisProbes[tag]={detected,values};
    if(detected)axes[tag]={min:values[0],max:values.at(-1),default:defaults[tag],probed:true};
  }
  return {axes,axisProbes};
}
function advance(name,text,weight,variant='normal',axes={}) {
  const span=document.createElement('span');
  Object.assign(span.style,{position:'fixed',visibility:'hidden',whiteSpace:'pre',fontFamily:JSON.stringify(boundFaces.get(name)||name),fontSize:'128px',fontWeight:String(weight),fontVariationSettings:axisCSS(axes),fontStyle:'normal',fontSynthesis:'none',fontVariantCaps:variant,fontOpticalSizing:'none',letterSpacing:'0'});
  span.textContent=text;document.body.append(span);
  const width=span.getBoundingClientRect().width;span.remove();return width;
}
function metrics(bitmap,index,advanceWidth) {
  const {pixels,canvas}=bitmap,rows=[];let left=160,right=0,top=190,bottom=0,path='';
  for(let y=0;y<190;y++) {
    const runs=[];let start=null;
    for(let x=0;x<=160;x++) {
      const ink=x<160&&pixels[(y*canvas.width+index*160+x)*4+3]>=128;
      if(ink&&start===null)start=x;
      if(!ink&&start!==null){runs.push([start,x]);left=Math.min(left,start);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y+1);path+=`M${start-8} ${145-y}h${x-start}v-1h${start-x}Z`;start=null;}
    }
    rows.push(runs);
  }
  if(right<=left)throw Error('Could not measure visible Latin glyphs in this family.');
  const stems=[.25,.32,.68,.75].map(t=>rows[Math.floor(top+(bottom-top)*t)]?.[0]).filter(Boolean).map(([a,b])=>b-a);
  return {bounds:[left-8,145-bottom,right-8,145-top],width:right-left,advance:advanceWidth,vstem:median(stems),path};
}
async function measure(name,text,weight,variant='normal',axes={}) {
  const image=await bitmap(name,text,variant,weight,axes);
  return Object.fromEntries([...text].map((c,i)=>[c,metrics(image,i,advance(name,c,weight,variant,axes))]));
}
export async function analyzeLocalFont(meta,options,corpus) {
  const baseWeight=options.axes.wght||400,name=meta.name,prior=corpusPrior(corpus,baseWeight);
  const location=Object.fromEntries(Object.entries(meta.axes).map(([tag,a])=>[tag,Math.max(a.min,Math.min(a.max,options.axes[tag]??a.default))]));
  const settings=(weight,wdth=location.wdth)=>({...location,...(meta.axes.wght?{wght:weight}:{}),...(meta.axes.wdth?{wdth}:{})});
  const cssWeight=weight=>meta.axes.wght?400:weight;
  const base=await measure(name,alphabet+'x',cssWeight(baseWeight),'normal',settings(baseWeight));
  const normal=await bitmap(name,alphabet.toLowerCase(),'normal',cssWeight(baseWeight),settings(baseWeight)),small=await bitmap(name,alphabet.toLowerCase(),'small-caps',cssWeight(baseWeight),settings(baseWeight));
  const referenceLetters=changedFeatureLetters(normal,small,alphabet.toLowerCase()).toUpperCase();
  const referenceKind=referenceLetters?'smcp':'none';
  const refs=referenceLetters?await measure(name,referenceLetters.toLowerCase(),cssWeight(baseWeight),'small-caps',settings(baseWeight)):{};
  const ref=Object.fromEntries(Object.entries(refs).map(([c,m])=>[c.toUpperCase(),m]));
  const capHeight=base.H.bounds[3],xHeight=base.x.bounds[3];
  const referenceHeight=referenceLetters?median(Object.values(ref).map(m=>m.bounds[3])):null;
  const useRefs=options.target==='reference'&&!!referenceHeight,estimated=!useRefs&&options.target!=='xheight';
  const targetHeight=useRefs?referenceHeight:estimated?xHeight+prior.heightFraction*(capHeight-xHeight):xHeight;
  const letters=useRefs?[...referenceLetters].filter(c=>c!=='I'):[...'HEFLT'];
  if(!letters.length)letters.push(...referenceLetters);
  const evaluate=(candidate,weight,transform,manual,wdth=location.wdth)=>{
    const scale=manual?.scale??targetHeight/candidate.H.bounds[3];
    const width=transform?(manual?.width??(useRefs?median(letters.map(c=>ref[c].width/(scale*candidate[c].width))):estimated?prior.width:1)):1;
    const errors={width:[],vertical:[],horizontal:[]};
    for(const c of letters) {
      const t=useRefs?ref[c]:base[c],m=candidate[c];
      const targetWidth=useRefs?t.width:targetHeight/capHeight*t.width*(estimated?prior.width:1);
      errors.width.push(Math.log(scale*width*m.width/targetWidth));
      if(m.vstem&&t.vstem)errors.vertical.push(Math.log(scale*width*m.vstem/t.vstem));
    }
    const score=Object.values(errors).reduce((sum,a)=>sum+(a.length?a.reduce((s,x)=>s+x*x,0)/a.length:0),0);
    const tracking=manual?.tracking??(useRefs?median(letters.map(c=>(ref[c].advance-scale*width*candidate[c].advance)/(128*scale*width))):prior.tracking);
    return {candidate,weight,scale,width,tracking,score,...(meta.axes.wdth?{wdth}:{}),errors:Object.fromEntries(Object.entries(errors).map(([k,a])=>[k,a.length?100*Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length):null])),baseWeight,trackingSource:useRefs?'browser reference advances':'corpus estimate',spacingWordRmsPercent:null};
  };
  const fitText=[...new Set([...letters,'H'])].join(''),measured=new Map();
  const sample=async(weight,wdth=location.wdth)=>{
    const key=JSON.stringify([weight,wdth]);
    if(!measured.has(key))measured.set(key,await measure(name,fitText,cssWeight(weight),'normal',settings(weight,wdth)));
    return measured.get(key);
  };
  const better=(a,b)=>!b||a.score<b.score-1e-10||(Math.abs(a.score-b.score)<1e-10&&Math.abs(a.weight-baseWeight)<Math.abs(b.weight-baseWeight));
  let best,transformed;
  const weights=[...new Set([100,200,300,400,500,600,700,800,900,baseWeight])];
  for(const weight of weights) {
    const candidate=await sample(weight),trial=evaluate(candidate,weight,false),scaled=evaluate(candidate,weight,true);
    if(better(trial,best))best=trial;
    if(better(scaled,transformed))transformed=scaled;
  }
  // Refine continuous axes only after a pixel response has been demonstrated.
  for(let pass=0;pass<2;pass++) {
    if(meta.axes.wdth) {
      const radius=pass===0?150:25,center=pass===0?125:best.wdth;
      const lo=Math.max(meta.axes.wdth.min,center-radius/2),hi=Math.min(meta.axes.wdth.max,center+radius/2);
      for(let i=0;i<=6;i++) {
        const wdth=lo+(hi-lo)*i/6,trial=evaluate(await sample(best.weight,wdth),best.weight,false,null,wdth);
        if(better(trial,best))best=trial;
      }
    }
    if(meta.axes.wght) {
      for(const transform of [false,true]) {
        const winner=transform?transformed:best,radius=pass===0?100:25;
        const lo=Math.max(meta.axes.wght.min,winner.weight-radius),hi=Math.min(meta.axes.wght.max,winner.weight+radius);
        for(let i=0;i<=8;i++) {
          const weight=lo+(hi-lo)*i/8,wdth=transform?location.wdth:best.wdth;
          const trial=evaluate(await sample(weight,wdth),weight,transform,null,wdth);
          if(transform){if(better(trial,transformed))transformed=trial;}
          else if(better(trial,best))best=trial;
        }
      }
    }
  }
  if(options.manual) {
    const m=options.manual;
    best=evaluate(await sample(m.weight,m.wdth),m.weight,false,m,m.wdth);
  }
  if(options.transformManual) {
    const m=options.transformManual;
    transformed=evaluate(await sample(m.weight,m.wdth),m.weight,true,m,m.wdth);
  }
  const {candidate:sampled,...fit}=best,{candidate:unused,...transformFit}=transformed;
  const candidate=await measure(name,alphabet,cssWeight(fit.weight),'normal',settings(fit.weight,fit.wdth));
  const glyphs=[...(referenceLetters||'HEFLT')].map(c=>{
    const target=ref[c]||base[c],m=candidate[c];
    return {letter:c,reference:c,targetPath:target.path,candidatePath:m.path,target,candidate:m,used:letters.includes(c),widthError:referenceLetters?100*(fit.scale*m.width/target.width-1):null,spacedAdvanceError:referenceLetters?100*(fit.scale*(m.advance+128*fit.tracking)/target.advance-1):null};
  });
  const transformCandidate=await measure(name,alphabet,cssWeight(transformFit.weight),'normal',settings(transformFit.weight,options.transformManual?.wdth));
  const transformGlyphs=glyphs.map(g=>({...g,candidate:transformCandidate[g.letter],candidatePath:transformCandidate[g.letter].path}));
  const caps=await bitmap(name,alphabet,'normal',cssWeight(baseWeight),settings(baseWeight)),smallCaps=await bitmap(name,alphabet,'all-small-caps',cssWeight(baseWeight),settings(baseWeight));
  const warnings=['Measured at 128px with synthesis disabled. Horizontal-stroke measurements are unavailable.'];
  if(estimated)warnings.push('No native small-cap changes detected; proportions and tracking start from the corpus estimate.');
  return {...meta,nativeSmcp:!!referenceLetters,smcpLetters:referenceLetters,referenceLetters,referenceKind,nativeC2sc:changedFeatureLetters(caps,smallCaps,alphabet).length===26,
    axesLocation:{...location,wght:baseWeight},fit,transformFit,glyphs,transformGlyphs,warnings,target:useRefs?'reference':estimated?'estimate':'xheight',capHeight,xHeight,referenceHeight,targetHeight,xHeightScale:xHeight/capHeight,referenceScale:referenceHeight?referenceHeight/capHeight:null,missingLetters:'',calibrationSource:'live browser pixel fit',corpusPrior:prior};
}
// SVG text gives us CSS feature controls (including font-synthesis: none)
// and a canvas-readable bitmap. Canvas's own text API cannot disable synthesis.
export async function featureBitmap(name, text, variant='normal', fallback='serif', weight=400,axes={},bound=boundFaces.has(name)) {
  const escapeXML=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
  const width=160*text.length,height=190;
  const localStyle=bound?`<style>@font-face{font-family:RasterLocal;src:${escapeXML(localSources(name))};font-weight:100 900;font-stretch:50% 200%;}</style>`:'';
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${localStyle}<g style="font-family: ${bound?'RasterLocal':escapeXML(JSON.stringify(name))}, ${fallback}; font-size: 128px; font-weight: ${weight}; font-variation-settings: ${escapeXML(axisCSS(axes))}; font-optical-sizing: none; font-style: normal; font-synthesis: none; font-variant-caps: ${variant}; fill: black">${[...text].map((letter,i)=>`<text x="${i*160+8}" y="145">${letter}</text>`).join('')}</g></svg>`;
  const image=new Image();
  image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
  await image.decode();
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  context.drawImage(image,0,0);
  return {canvas,pixels:context.getImageData(0,0,width,height).data};
}
export function changedFeatureLetters(before,after,letters) {
  return [...letters].filter((letter,i)=>{
    for(let y=0;y<190;y++)for(let x=i*160;x<(i+1)*160;x++) {
      const alpha=(y*160*letters.length+x)*4+3;
      if(before.pixels[alpha]!==after.pixels[alpha])return true;
    }
    return false;
  }).join('');
}
