import {readShareURL,shareURL,sharedSelects,sharedNumbers} from './share-state.js';
import {exportTypst,exportLatex} from './typeset-export.js';
import {inspectLocalFont,analyzeLocalFont} from './raster-fit.js';
const $ = id => document.getElementById(id);

let fonts = [], current, result, face, family, sequence = 0, timer;
let referenceFace,referenceFamily,naiveFace,naiveFamily,trackingOverride=null;
let heightOverride=null,weightOverride=null,widthOverride=null;
let pendingShared=null;
let loadingCount=0;
const nativeWeight=()=>result.fit.baseWeight;
const nativeTracking=()=>trackingOverride??0;
const nativeAxes=()=>({...result.axesLocation,...(current.axes.wdth&&widthOverride!==null?{wdth:widthOverride}:{})});
const transformAxes=()=>({...result.axesLocation,...(current.axes.wdth&&widthOverride!==null?{wdth:widthOverride}:{})});
const boot=JSON.parse($('boot-data').textContent),fontData=new Map();
const workerURL=URL.createObjectURL(new Blob([$('worker-source').textContent],{type:'text/javascript'}));
const worker=new Worker(workerURL);URL.revokeObjectURL(workerURL);
const pending=new Map();let requestID=0;
worker.onmessage=({data})=>{
  if(data.progress){status(data.progress);return;}
  if(data.fatal){for(const p of pending.values())p.reject(Error(data.fatal));pending.clear();status(data.fatal,true);return;}
  const p=pending.get(data.request);if(!p)return;pending.delete(data.request);data.error?p.reject(Error(data.error)):p.resolve(data.value);
};
worker.onerror=e=>{for(const p of pending.values())p.reject(Error(e.message||'Font worker failed.'));pending.clear();status('The font worker could not start in this browser.',true);};
function call(action,data={},transfer=[]) {return new Promise((resolve,reject)=>{const request=++requestID;pending.set(request,{resolve,reject});worker.postMessage({request,action,...data},transfer);});}
const values = () => ({...Object.fromEntries(['scale','weight','tracking','gap','size','reading-size'].map(k => [k, +$(k).value])),scale:heightOverride??result?.fit.scale??+$('scale').value,weight:weightOverride??result?.fit.weight??+$('weight').value,tracking:trackingOverride??result?.fit.tracking??+$('tracking').value,width:1,...(current?.axes.wdth?{wdth:+$('width').value}:{})});
const axes = () => Object.fromEntries([...document.querySelectorAll('[data-axis]')].map(e => [e.dataset.axis, +e.value]));
const cssWeight = weight => current.browserMeasured&&current.axes.wght?400:weight;
const variation = (location, weight, digits) => Object.entries({...location, ...(current.axes.wght ? {wght:weight} : {})}).filter(([tag])=>!current.browserMeasured||current.axes[tag]).map(([k,v]) => `"${k}" ${digits===undefined?v:cssNum(v,digits)}`).join(', ') || 'normal';
const capVariation = (digits) => variation({...result.axesLocation,...(current.axes.wdth?{wdth:values().wdth}:{})},values().weight,digits);
const fmt = (n, digits=3) => Number(n).toFixed(digits);
const cssNum = (n, digits=4) => String(Number(Number(n).toFixed(digits)));
const allSmall = () => $('initial-mode').value==='c2sc';
const widthMode = () => $('transform-width-mode').querySelector('[aria-selected="true"]').dataset.widthMode;
const useTransform = () => $('width-method').value==='transform'||($('width-method').value==='auto'&&!(current?.axes.wdth?.max>current?.axes.wdth?.min));
function status(message, error=false) { $('status').textContent = message; $('status').classList.toggle('error',error); }
// Nested loads and overlapping measurements each own their loading lifetime.
function beginLoading() {
  loadingCount++;
  for(const id of ['status','google-load'])$(id).classList.add('is-loading');
  $('workspace').setAttribute('aria-busy','true');
  let finished=false;
  return ()=>{
    if(finished)return;
    finished=true;
    if(--loadingCount)return;
    for(const id of ['status','google-load'])$(id).classList.remove('is-loading');
    $('workspace').removeAttribute('aria-busy');
  };
}
function fontLabel(meta) {
  if(meta.browserMeasured)return `${meta.name} · browser measurements`;
  const weight=meta.axes.wght;
  return `${meta.googleFamily||meta.name} · variable weight ${weight.min}–${weight.max}`;
}
function addFont(meta) {
  if(!meta.browserMeasured&&(!meta.axes.wght||meta.axes.wght.max<=meta.axes.wght.min))return;
  fonts.push(meta);
}
async function selectFont(id) {
  const serial = ++sequence;
  if(!id)return;
  clearTimeout(timer); $('workspace').hidden=true; $('recipe-controls').hidden=true; $('export-dock').hidden=true; $('fit').disabled=true;
  result=null;$('font-summary').hidden=true;setReviewView('preview');
  current=fonts.find(f=>f.id===id); result=null;
  const selected=current;
  status(`Loading ${fontLabel(selected)}…`);
  const finishLoading=beginLoading();
  try {
    if(selected.browserMeasured) {
      if(face)document.fonts.delete(face);face=null;family=selected.renderFamily||selected.name;
    } else {
    const nextFamily = `Calibration_${selected.id}`;
    const nextFace = new FontFace(nextFamily, fontData.get(selected.id).slice(0), {
      weight: selected.axes.wght ? `${selected.axes.wght.min} ${selected.axes.wght.max}` : `${selected.staticWeight}`,
      style:'normal', display:'block'
    });
    await nextFace.load();
    if(serial!==sequence) return;
    if(face) document.fonts.delete(face);
    face=nextFace; family=nextFamily; document.fonts.add(face);
    }
    let nextNaiveFace;
    if(selected.naiveBytes) {
      nextNaiveFace=new FontFace(`GoogleNaive_${selected.id}`,selected.naiveBytes.slice(0),{weight:selected.naiveWeight,style:'normal',display:'block'});
      await nextNaiveFace.load();
      if(serial!==sequence)return;
    }
    if(naiveFace)document.fonts.delete(naiveFace);
    naiveFace=nextNaiveFace;naiveFamily=naiveFace?.family||family;
    if(naiveFace)document.fonts.add(naiveFace);
    $('axes').replaceChildren();
    for(const [tag, range] of Object.entries(selected.browserMeasured?{wght:{min:100,max:900,default:400},...selected.axes}:selected.axes)) {
      const label=document.createElement('label'), out=document.createElement('input'), input=document.createElement('input');
      label.htmlFor=`axis-${tag}`; label.textContent=(tag==='wght'?'Text weight':`${tag} axis`)+(selected.axes[tag]?.probed?' · tested range':'');
      input.id=`axis-${tag}`; input.dataset.axis=tag; input.type='range'; input.min=range.min; input.max=range.max; input.step=selected.browserMeasured&&!selected.axes[tag]?100:.1;
      input.value=tag==='wght'?Math.max(range.min,Math.min(range.max,500)):range.default;
      const heading=el('div','control-heading');heading.append(label,out);bindNumber(input,out,tag==='wght'?'Text weight':`${tag} axis`);
      input.addEventListener('input',()=>{syncNumber(input,out);if(tag==='opsz')$('optical-policy').value='pinned';schedule(false);});
      $('axes').append(heading,input);
    }
    const w=selected.axes.wght||(selected.browserMeasured?{min:100,max:900}:null);
    $('weight').min=w?.min ?? selected.staticWeight; $('weight').max=w?.max ?? selected.staticWeight;
    $('weight').disabled=!w;
    const d=selected.axes.wdth;
    $('width').min=d?.min??.4;$('width').max=d?.max??2;$('width').step=d ? .01 : .001;
    $('width').value=d?.default??1;$('width').disabled=false;
    const widthLabel=d?'Small-cap width (wdth)':'Small-cap width (scaleX)';
    $('width-label').textContent=widthLabel;$('width-out').setAttribute('aria-label',widthLabel);
    $('target').value='reference';
    $('tracking').value=0; $('gap').value=0;
    $('optical-policy').disabled=!selected.axes.opsz;
    if(!selected.axes.opsz)$('optical-policy').value='pinned';
    syncOpticalSize();
    await calibrate(false);
    if(result){
      const details=document.querySelector('.source details'),focusInside=details.contains(document.activeElement);
      details.open=false;$('sidebar').scrollTop=0;
      if(focusInside)$('google-font').focus({preventScroll:true});
      $('share').disabled=false;
      if(pendingShared){const shared=pendingShared;pendingShared=null;await applySharedSettings(shared);}
    }
  } catch(error) { if(serial===sequence) status(error.message,true); }
  finally {finishLoading();}
}
function schedule(manual) {
  // Invalidate in-flight results immediately, including during the debounce.
  sequence++; clearTimeout(timer);
  status('Updating measurements…');
  timer=setTimeout(()=>calibrate(manual),300);
}
function withTracking(fit,tracking,units,source=fit.trackingSource) {
  const updated={...fit,tracking,trackingSource:source};
  if(fit.spacingWords?.length) {
    updated.spacingWords=fit.spacingWords.map(row=>({...row,tracked:row.untracked+row.word.length*units*fit.scale*fit.width*tracking}));
    updated.spacingWordRmsPercent=100*Math.sqrt(updated.spacingWords.reduce((sum,row)=>sum+(row.tracked/row.native-1)**2,0)/updated.spacingWords.length);
  }
  return updated;
}
async function calibrate(manual=false) {
  const serial=++sequence,restoreFitFocus=document.activeElement===$('fit');
  const finishLoading=beginLoading();
  $('fit').disabled=true;
  status(manual?'Measuring your settings…':current.browserMeasured?'Fitting height, width, and strokes from browser rendering…':'Fitting height, width, and strokes from the font outlines…');
  try {
    const options={renderMode:'css',axes:axes(),target:$('target').value,...(manual?{manual:values(),transformManual:{...result.transformFit}}:{})};
    if(manual&&current.axes.wdth&&widthOverride!==null)options.transformManual.wdth=widthOverride;
    const data=current.browserMeasured?await analyzeLocalFont(current,options,boot.corpus):await call('analyze',{id:current.id,options});
    if(serial!==sequence) return;
    referenceFamily=family;
    if(data.referenceFontId&&data.referenceFontId!==current.id) {
      const refName=`Reference_${data.referenceFontId}`;
      if(referenceFace?.family!==refName) {
        const loaded=new FontFace(refName,fontData.get(data.referenceFontId).slice(0),{
          weight:current.axes.wght?`${current.axes.wght.min} ${current.axes.wght.max}`:`${current.staticWeight}`
        });
        await loaded.load();if(serial!==sequence)return;
        if(referenceFace)document.fonts.delete(referenceFace);
        referenceFace=loaded;document.fonts.add(loaded);
      }
      referenceFamily=refName;
    }
    result=data;
    if(!manual){heightOverride=null;weightOverride=null;widthOverride=null;}
    if(current.browserMeasured){current.nativeSmcp=data.nativeSmcp;current.smcpLetters=data.smcpLetters;}
    for(const k of ['scale','weight']) {
      if(k!=='weight') { $(k).min=Math.min(+$(k).min,data.fit[k]); $(k).max=Math.max(+$(k).max,data.fit[k]); }
      $(k).value=data.fit[k];
    }
    // Match automatic values to the controls' public precision. Each
    // recipe keeps its own values until the user explicitly overrides them.
    for(const fit of [data.fit,data.transformFit]) {
      $('weight').value=fit.weight;
      fit.weight=+$('weight').value;
      $('scale').min=Math.min(+$('scale').min,fit.scale);
      $('scale').max=Math.max(+$('scale').max,fit.scale);
      $('scale').value=fit.scale;
      fit.scale=+$('scale').value;
    }
    if(current.axes.wdth)$('width').value=data.fit.wdth;
    else if(!manual) {
      $('width').min=Math.min(.4,data.transformFit.width);$('width').max=Math.max(2,data.transformFit.width);
      $('width').value=data.transformFit.width;
    }
    if(!manual)trackingOverride=null;
    if(!manual&&Number.isFinite(data.fit.tracking)) {
      $('tracking').value=data.fit.tracking;
      // The range control clamps and rounds automatic fits to its public range.
      data.fit=withTracking(data.fit,+$('tracking').value,data.unitsPerEm);
      $('tracking').value=data.transformFit.tracking;
      data.transformFit=withTracking(data.transformFit,+$('tracking').value,data.unitsPerEm);
      for(const g of data.glyphs)if(g.widthError!==null)g.spacedAdvanceError=100*(data.fit.scale*data.fit.width*(g.candidate.advance+data.fit.tracking*data.unitsPerEm)/g.target.advance-1);
    }
    $('font-capabilities').hidden=!current.browserMeasured;
    const detected=Object.keys(current.axes);
    $('font-capabilities').textContent=current.browserMeasured?(detected.length?`Variable axes detected: ${detected.join(', ')}. Controls use tested ranges; the font may clamp values. ${current.axes.wght?'':'No variable weight response: fine stroke adjustment may be unavailable. '}`:'No variable axis response detected. Weight selects available static faces, so fine stroke adjustment may be unavailable. Width adjustment uses horizontal scaling. ')+(current.browserMeasured?'Browser measurements are approximate; spacing uses individual letters rather than word kerning.':''):'';
    if(current.browserMeasured&&!detected.length) {
      const notice='No variable axis response detected.';
      const remainder=$('font-capabilities').textContent.slice(notice.length);
      $('font-capabilities').replaceChildren(el('strong','',notice),document.createTextNode(remainder));
    }
    $('workspace').hidden=false; $('recipe-controls').hidden=false; $('export-dock').hidden=false; $('empty-state').hidden=true;
    $('font-summary').hidden=false;
    $('smcp-support').textContent=`Native small-caps (smcp): ${current.nativeSmcp?'yes':'no'}. `+
      (current.nativeSmcp?`Latin coverage: ${current.smcpLetters.length}/26 lowercase letters.`:'The calibrated result is simulated small-caps.')+
      (current.recoveredReferences?' Comparison references recovered from a separate matching full font; this does not add smcp to the loaded file.':
        current.referenceKind==='phonetic'?' Phonetic reference glyphs are not native smcp support.':'');
    render();
    status(`Loaded ${fontLabel(current)} · ${data.calibrationSource}${data.tableRecipe?'':` · ${data.target==='estimate'?'estimated proportions':data.target==='xheight'?'x-height experiment':data.referenceKind+' references'}`}`);
    return true;
  } catch(error) {if(serial===sequence) status(error.message,true);}
  finally {finishLoading();if(serial===sequence){$('fit').disabled=false;if(restoreFitFocus&&document.activeElement===document.body)$('fit').focus({preventScroll:true});}}
}
function el(tag, cls, text) {const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function renderSentence(container, treatment, text, sizeOverride) {
  const v=values(), loc=result.axesLocation;
  container.setAttribute('role','group');
  container.replaceChildren();
  Object.assign(container.style,{fontFamily:`"${treatment==='native'?referenceFamily:treatment==='naive'?naiveFamily:family}"`,fontSize:`${sizeOverride??v.size}px`,fontWeight:cssWeight(result.fit.baseWeight),fontVariationSettings:variation(loc,result.fit.baseWeight),letterSpacing:'normal'});
  if(treatment==='plain') {container.textContent=text;return;}
  for(const token of text.split(/([A-Z]{2,})/g)) {
    if(!/^[A-Z]{2,}$/.test(token)){container.append(document.createTextNode(token));continue;}
    if(treatment==='naive') {
      const word=el('span','sc-word',allSmall()?token.toLowerCase():token[0]+token.slice(1).toLowerCase());
      Object.assign(word.style,{fontVariant:allSmall()?'all-small-caps':'small-caps',fontFeatureSettings:'normal',fontSynthesis:'small-caps'});
      if(!allSmall()&&v.gap){word.classList.add('initial-gap');word.style.setProperty('--initial-gap',`${v.gap}em`);}
      container.append(word);continue;
    }
    if(treatment==='native') {
      const word=el('span','sc-word',allSmall()?(result.nativeC2sc?token:token.toLowerCase()):token[0]+token.slice(1).toLowerCase());
      if(!allSmall()&&v.gap) {word.classList.add('initial-gap');word.style.setProperty('--initial-gap',`${v.gap}em`);}
      word.classList.add('native-smallcap');
      word.style.fontSize='1em';
      word.style.fontWeight=cssWeight(nativeWeight());
      word.style.fontVariationSettings=variation(nativeAxes(),nativeWeight());
      word.style.letterSpacing=`${nativeTracking()}em`;
      word.style.setProperty('--native-initial-weight',cssWeight(allSmall()?nativeWeight():result.fit.baseWeight));
      word.style.setProperty('--native-initial-axes',variation(allSmall()?nativeAxes():loc,allSmall()?nativeWeight():result.fit.baseWeight));
      word.style.setProperty('--native-initial-tracking',`${allSmall()?nativeTracking():0}em`);
      word.style.setProperty('--native-initial-size','1em');
      word.style.setProperty('--initial-gap',`${allSmall()?0:v.gap}em`);
      word.style.fontFeatureSettings=allSmall()&&result.nativeC2sc?'"c2sc" 1, "smcp" 0':'"smcp" 1, "c2sc" 0';container.append(word);continue;
    }
    if(treatment==='transform') {
      const fit=result.transformFit,word=el('span','sc-word transform-word'),box=el('span','sc-rest-box'),rest=el('span','sc-rest',allSmall()?token:token.slice(1));
      box.style.marginLeft=`${allSmall()?0:v.gap}em`;
      word.append(document.createTextNode(allSmall()?'':token[0]),box);box.append(rest);container.append(word);
      Object.assign(rest.style,{fontSize:`${fit.scale}em`,fontWeight:cssWeight(fit.weight),fontVariationSettings:variation(transformAxes(),fit.weight),letterSpacing:`${fit.tracking}em`,fontFeatureSettings:'"smcp" 0'});
      box.style.width=`${rest.getBoundingClientRect().width*fit.width}px`;
      rest.style.transform=`scaleX(${fit.width})`;
      continue;
    }
    const word=el('span','sc-word css-smallcap',allSmall()?token.toLowerCase():token[0]+token.slice(1).toLowerCase());
    container.append(word);
    const compensated=treatment==='fit';
    word.style.fontSize=`${v.scale}em`;
    word.style.fontWeight=cssWeight(compensated?v.weight:result.fit.baseWeight);
    word.style.fontVariationSettings=compensated?capVariation():variation(loc,result.fit.baseWeight);
    word.style.letterSpacing=`${compensated?v.tracking:0}em`;
    word.style.setProperty('--initial-size',`${allSmall()?1:1/v.scale}em`);
    word.style.setProperty('--initial-weight',cssWeight(allSmall()&&compensated?v.weight:result.fit.baseWeight));
    word.style.setProperty('--initial-axes',allSmall()&&compensated?capVariation():variation(loc,result.fit.baseWeight));
    word.style.setProperty('--initial-gap',`${!allSmall()?v.gap:0}em`);
    word.style.setProperty('--initial-tracking',`${allSmall()&&compensated?v.tracking:0}em`);
  }
}
function renderReferenceLetters(container,native,transformed=false,naive=false) {
  const v=values();container.setAttribute('role','group');container.replaceChildren();
  Object.assign(container.style,{fontFamily:`"${native?referenceFamily:naive?naiveFamily:family}"`,fontSize:`${v.size}px`,fontWeight:cssWeight(result.fit.baseWeight),
    fontVariationSettings:variation(result.axesLocation,result.fit.baseWeight)});
  for(const g of result.glyphs) {
    const cell=el('span','reference-cell'),letter=el('span','reference-glyph');
    // Equal cells keep corresponding letters directly above one another.
    cell.style.width=`${Math.max(g.target.advance,g.candidate.advance*v.scale*v.width)/result.unitsPerEm+.12}em`;
    if(native) {
      letter.style.fontSize='1em';
      letter.style.fontWeight=cssWeight(nativeWeight());
      letter.style.fontVariationSettings=variation(nativeAxes(),nativeWeight());
      letter.style.letterSpacing=`${nativeTracking()}em`;
      letter.textContent=result.referenceKind==='phonetic'?g.reference:g.letter.toLowerCase();
      if(result.referenceKind==='smcp')letter.style.fontFeatureSettings='"smcp" 1';
    } else if(naive) {
      letter.textContent=g.letter.toLowerCase();
      Object.assign(letter.style,{fontVariant:'small-caps',fontFeatureSettings:'normal',fontSynthesis:'small-caps'});
    } else {
      const fit=transformed?result.transformFit:null;
      letter.textContent=g.letter;letter.style.fontSize=`${fit?.scale??v.scale}em`;
      letter.style.fontWeight=cssWeight(naive?result.fit.baseWeight:fit?.weight??v.weight);
      letter.style.fontVariationSettings=naive?variation(result.axesLocation,result.fit.baseWeight):fit?variation(transformAxes(),fit.weight):capVariation();
      letter.style.letterSpacing=`${fit?.tracking??v.tracking}em`;
      if(fit)letter.style.transform=`scaleX(${fit.width})`;
    }
    cell.append(letter);container.append(cell);
  }
}
function metric(parent, value, label) {const d=el('div','metric');d.append(el('strong','',value),el('span','',label));parent.append(d);}
let overlaySelection=null;
const overlayLines=[['all-caps','All caps'],['naive','Naive browser'],['calibrated','Font-axis fit'],['transformed','Horizontal scaling'],['native','Built-in']];
function availableOverlayLines() {
  return overlayLines.filter(([id])=>document.querySelector(`[data-preview-toggle="${id}"]`).checked&&
    (id!=='native'||result?.referenceKind==='smcp'));
}
function renderOverlay() {
  if(!result)return;
  const available=availableOverlayLines(),ids=available.map(([id])=>id);
  if(overlaySelection?.some(id=>!ids.includes(id)))overlaySelection=null;
  const selected=overlaySelection||ids.slice(-2);
  for(const [index,name] of ['overlay-first','overlay-second'].entries()) {
    const select=$(name);
    select.replaceChildren(...available.map(([id,label])=>{
      const option=el('option','',label);option.value=id;return option;
    }));
    select.value=selected[index]||'';select.disabled=available.length<2;
  }
  $('overlay-preview').replaceChildren();
  $('overlay-preview').hidden=available.length<2;
  if(available.length<2){$('overlay-note').textContent='Show at least two available lines to compare them here.';return;}
  const names=selected.map(id=>overlayLines.find(line=>line[0]===id)[1]);
  $('overlay-note').textContent=`${names[0]} (orange) and ${names[1]} (green), sharing a baseline. Uses the inspection size and current recipe settings.`;
  $('overlay-preview').setAttribute('aria-label',`${names[0]} overlaid with ${names[1]}: ${$('sample').value}`);
  if($('overlay-comparison').hidden)return;
  for(const [index,id] of selected.entries()) {
    const sample=el('div','sample');
    sample.setAttribute('aria-hidden','true');sample.dataset.overlaySource=id;
    sample.classList.add('overlay-sample',index===0?'overlay-first':'overlay-second');
    $('overlay-preview').append(sample);
    const treatment={ 'all-caps':'plain',naive:'naive',calibrated:'fit',transformed:'transform',native:'native' }[id];
    renderSentence(sample,treatment,$('sample').value);
    const needed=[...new Set(($('sample').value.match(/[A-Z]{2,}/g)||[]).flatMap(w=>[...(allSmall()?w:w.slice(1))]))];
    const complete=result.referenceKind==='smcp'&&needed.every(c=>result.referenceLetters.includes(c));
    if(id!=='all-caps'&&result.referenceLetters.length&&!complete)
      renderReferenceLetters(sample,id==='native',id==='transformed',id==='naive');
  }
}
for(const [index,id] of ['overlay-first','overlay-second'].entries())$(id).addEventListener('change',()=>{
  const selected=[$('overlay-first').value,$('overlay-second').value];
  if(selected[0]===selected[1])selected[1-index]=availableOverlayLines().find(([value])=>value!==selected[index])[0];
  overlaySelection=selected;
  preserveScroll(renderOverlay);
});
function applyPreviewVisibility() {
  const visible=new Set([...document.querySelectorAll('[data-preview-toggle]:checked')].map(input=>input.dataset.previewToggle));
  for(const line of document.querySelectorAll('[data-preview-line]'))
    line.classList.toggle('preview-line-hidden',!visible.has(line.dataset.previewLine));
  for(const row of document.querySelectorAll('.ladder-row'))
    row.classList.toggle('preview-line-hidden',![...row.querySelectorAll('[data-preview-line]')].some(line=>visible.has(line.dataset.previewLine)));
  renderOverlay();
}
$('preview-lines').addEventListener('change',()=>preserveScroll(applyPreviewVisibility));
function preserveScroll(update) {
  const scrollers=[$('sidebar'),$('review-scroll'),$('export-content')];
  const positions=scrollers.map(element=>[element,element.scrollLeft,element.scrollTop]);
  const pageLeft=window.scrollX,pageTop=window.scrollY;
  try {return update();}
  finally {
    for(const [element,left,top] of positions)element.scrollTo({left,top,behavior:'instant'});
    window.scrollTo({left:pageLeft,top:pageTop,behavior:'instant'});
  }
}
function render() {
  if(!result)return;
  return preserveScroll(renderComparison);
}
function renderComparison() {
  // Keep every sample measurable while laying out transformed words.
  for(const line of document.querySelectorAll('.preview-line-hidden'))line.classList.remove('preview-line-hidden');
  const v=values();
  if(!current.axes.wdth&&result.transformFit.width!==+$('width').value) {
    const fit=result.transformFit,width=+$('width').value,ratio=width/fit.width;
    result.transformFit={...fit,width,score:null,errors:{...fit.errors,width:null,vertical:null},
      spacingWords:fit.spacingWords?.map(row=>({...row,untracked:row.untracked*ratio}))};
  }
  if(weightOverride!==null)result.transformFit={...result.transformFit,weight:weightOverride};
  if(heightOverride!==null&&result.transformFit.scale!==heightOverride) {
    const fit=result.transformFit,ratio=heightOverride/fit.scale;
    result.transformFit=withTracking({...fit,scale:heightOverride,score:null,
      errors:{width:null,vertical:null,horizontal:null},
      spacingWords:fit.spacingWords?.map(row=>({...row,untracked:row.untracked*ratio}))},fit.tracking,result.unitsPerEm);
  }
  if(trackingOverride!==null) {
    result.fit=withTracking(result.fit,trackingOverride,result.unitsPerEm,'manual tracking');
    result.transformFit=withTracking(result.transformFit,trackingOverride,result.unitsPerEm,'manual tracking');
  }
  const selectedFit=useTransform()?result.transformFit:result.fit;
  $('weight').value=weightOverride??selectedFit.weight;
  $('scale').value=heightOverride??selectedFit.scale;
  $('tracking').value=selectedFit.tracking;
  for(const k of ['scale','width','weight','tracking','gap','size','reading-size'])syncNumber($(k),$(k+'-out'));
  $('target-note').textContent=result.tableRecipe?`Using stored measurements for ${result.tableRecipe.family}.`:result.target==='xheight'
    ?'Matches the height of lowercase x while compensating weight and available width.'
    :result.target==='estimate'?'No small-cap references available; estimating from the current font corpus.'
    :'Matching this font’s own small-cap references.';
  const needed=[...new Set(($('sample').value.match(/[A-Z]{2,}/g)||[]).flatMap(w=>[...(allSmall()?w:w.slice(1))]))];
  const complete=result.referenceKind==='smcp'&&needed.every(c=>result.referenceLetters.includes(c));
  const nativeToggle=document.querySelector('[data-preview-toggle="native"]');
  nativeToggle.disabled=result.referenceKind!=='smcp';
  $('native-toggle-label').textContent=nativeToggle.disabled?'Built-in (unavailable for this font)':'Built-in';
  $('size-ladder').replaceChildren();
  for(const size of [48,36,32,28,24,20,18,16,14,12]) {
    const row=el('div','ladder-row'),label=el('span','muted',`${size}px`),pair=el('div','ladder-pair');
    row.append(label,pair);$('size-ladder').append(row);
    const treatments=[['all-caps','All caps','plain'],['naive','Naive','naive'],['calibrated','Font-axis','fit'],['transformed','Scaling','transform']];
    if(result.referenceKind==='smcp')treatments.push(['native',complete?'Built-in':'Built-in · partial coverage','native']);
    for(const [name,title,treatment] of treatments) {
      const line=el('div','comparison-row'),sample=el('div',`sample ladder-${name}`);
      line.dataset.previewLine=name;
      sample.setAttribute('aria-label',`${title} at ${size}px`);
      line.append(el('div','caption',title),sample);pair.append(line);
      renderSentence(sample,treatment,$('sample').value,size);
    }
  }
  $('optical-none').hidden=!!current.axes.opsz;
  $('optical-note').hidden=!current.axes.opsz;
  $('optical-policy').hidden=!current.axes.opsz;
  $('optical-note').textContent=!current.axes.opsz?'':
    $('optical-policy').value==='linked'?`Using opsz ${fmt(result.axesLocation.opsz,1)} for both runs, from the export font size in px clamped to the font’s range. The inspection size does not change the fit.`:
    `Pinned at opsz ${fmt(result.axesLocation.opsz,1)} for both runs. Change the axis or choose “Follow export font size” to compare optical designs.`;
  $('gap').disabled=allSmall();$('gap-out').disabled=allSmall();
  $('metrics').replaceChildren();
  metric($('metrics'),fmt(result.xHeightScale,4),'x-height ÷ cap height');
  metric($('metrics'),result.referenceScale?fmt(result.referenceScale,4):'—','reference ÷ cap height');
  metric($('metrics'),result.referenceHeight?`${fmt(result.referenceHeight/result.xHeight*100,1)}%`:'—','reference height / x-height');
  applyPreviewVisibility();
  renderExport();
  renderEvidence();
  $('diagnostics').textContent=JSON.stringify({font:current.googleFamily||current.name,internalFontName:current.name, fontFaceStatus:face?.status||'system family',
    computedFamily:getComputedStyle($('size-ladder').querySelector('.ladder-calibrated')).fontFamily, axes:result.axesLocation,axisProbes:current.axisProbes,
    smallCapAxes:capVariation(),unitsPerEm:result.unitsPerEm,
    referenceKind:result.referenceKind,referenceLetters:result.referenceLetters,missingLetters:result.missingLetters,
    calibrationSource:result.calibrationSource,storedRecipe:result.tableRecipe,
    measuredSettings:result.fit,outputSettings:useTransform()?result.transformFit:result.fit, liveSettings:v, opticalPolicy:$('optical-policy').value,
    devicePixelRatio:window.devicePixelRatio,rendering:current.browserMeasured?'Browser pixels at 128px with synthesis disabled; detected axes use tested ranges, not declared bounds.':'Unhinted outlines; preview uses this browser and OS. Fontkit rounds variable outline points to font units.'},null,2);
}
function builtInAvailable() {
  const letters=($('sample').value.match(/[A-Z]{2,}/g)||[]).flatMap(word=>[...(allSmall()?word:word.slice(1))]);
  return current.nativeSmcp&&letters.every(letter=>current.smcpLetters.includes(letter));
}
function renderExport() {return preserveScroll(renderExportContent);}
function renderExportContent() {
  const typeset=$('export-target').value!=='web';
  if(typeset&&['none','javascript'].includes(widthMode())) {
    for(const tab of $('transform-width-mode').querySelectorAll('[role=tab]'))tab.setAttribute('aria-selected',String(tab.dataset.widthMode===(useTransform()?'precomputed':'unscaled')));
  }
  $('width-none').hidden=typeset;
  $('width-precomputed').textContent=typeset?'Scaling':'Scaling · CSS';
  $('width-javascript').hidden=typeset||!!(current.axes.wdth?.max>current.axes.wdth?.min);
  $('web-export').hidden=typeset;
  $('web-recipe').hidden=typeset;
  $('typeset-export').hidden=!typeset;
  const builtin=builtInAvailable();
  $('width-builtin').hidden=!builtin;
  const special=widthMode()==='none'||(widthMode()==='builtin'&&builtin);
  const scaled=!special&&useTransform();
  const mode=special?widthMode():scaled?(['unscaled','builtin'].includes(widthMode())?'precomputed':widthMode()):'unscaled';
  for(const tab of $('transform-width-mode').querySelectorAll('[role=tab]')) {
    const active=tab.dataset.widthMode===mode;
    tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;
    if(active)$('export-content').setAttribute('aria-labelledby',tab.id);
  }
  $('transform-mode-note').textContent=scaled?`${$('width-method').value==='auto'?'No usable wdth axis: using horizontal scaling. ':''}Export uses the independently fitted scaling recipe. Automatic tracking is fitted separately for each recipe; manual tracking adjusts both, within small-caps words only; ${current.axes.wdth?'Width adjusts wdth in the fitted and built-in small-caps.':'Width adjusts scaleX in the scaling comparison.'} Height adjusts the fitted previews. Small-cap weight applies to fitted previews; Built-in uses the text weight. Manual tracking also applies to Built-in.`:`Export uses ${current.axes.wdth?'the fitted wdth axis':'the font’s own widths'}, without transforms. Automatic tracking is fitted separately for each recipe; manual tracking adjusts both, within small-caps words only.`;
  $('css-usage').textContent=scaled?'Use the word-specific markup in the recipe below. '+(allSmall()?'Every letter becomes a small cap.':'The initial stays full-size.'):'Use <span class="smcp">Lord</span> inside .smcp-text. '+(allSmall()?'Every letter becomes a small cap.':'The initial stays full-size.');
  $('export-mode-note').textContent=scaled?(widthMode()==='precomputed'?'Horizontal scaling with CSS only. Widths are precomputed only for the uppercase words in the preview above. Add or change words there, then regenerate the export.':widthMode()==='javascript'?'Horizontal scaling with JavaScript that measures and corrects word widths. Works with new words. Copy both the CSS and JavaScript below, or copy the complete HTML + CSS + JavaScript recipe.':'Horizontal scaling without layout-width correction. CSS only, but spacing or overlap may differ from the preview.'):`Font-axis fit: CSS only, reusable with any words. ${current.axes.wdth?'Uses the font’s wdth axis for width compensation.':'This font has no wdth axis, so glyph widths cannot be independently adjusted.'}`;
  if(special) {
    $('transform-mode-note').textContent=mode==='builtin'?'Uses this font’s supported smcp glyphs with the current manual small-cap adjustments.':'Uses font-variant: small-caps; the browser uses built-in glyphs when available and synthesizes them otherwise.';
    $('css-usage').textContent='Use the word spans shown in the complete recipe. No JavaScript is needed.';
    $('export-mode-note').textContent=mode==='builtin'?'Built-in small-caps: CSS only, using this font’s actual smcp glyphs. The font source must retain those glyphs.':'Naive: browser small-caps, reusable with any words. CSS only; uses the regular Google Fonts stylesheet or the original local/file source.';
  }
  const includesScript=scaled&&mode==='javascript';
  $('javascript-export').hidden=!includesScript;
  $('js-export').textContent=includesScript?transformWidthScript():'';
  $('full-recipe-label').textContent=includesScript?'HTML + CSS + JavaScript and measurements':'HTML + CSS and measurements';
  $('copy').textContent=includesScript?'Copy HTML + CSS + JavaScript':'Copy HTML + CSS';
  $('export').textContent=exportRecipe();
  $('css-export').textContent=exportCSS();
  if(typeset) {
    const typst=$('export-target').value==='typst';
    $('typeset-title').textContent=typst?'Typst recipe':'LuaLaTeX recipe';
    $('typeset-note').textContent=(typst?'Requires Typst 0.15 or newer.':'Compile with LuaLaTeX, using fontspec and graphicx.')+' Install the same font or provide its original TTF/OTF file. Font files are not included. The example uses your current text and settings; reuse the word function for other words. Spacing may differ slightly between typesetting engines.';
    $('typeset-code').textContent=(typst?exportTypst:exportLatex)(typesetRecipe());
    $('download-typeset').textContent=typst?'Download .typ':'Download .tex';
  }
}
function typesetRecipe() {
  const v=values(),builtin=widthMode()==='builtin',scaled=!builtin&&useTransform();
  const fit=scaled?result.transformFit:v;
  const weight=builtin?nativeWeight():fit.weight;
  const location=builtin?nativeAxes():scaled?transformAxes():{...result.axesLocation,...(current.axes.wdth?{wdth:v.wdth}:{})};
  const withWeight=(location,weight)=>({...location,...(current.axes.wght?{wght:weight}:{})});
  return {font:current.name,sizePx:v['reading-size'],baseWeight:result.fit.baseWeight,
    baseAxes:withWeight(result.axesLocation,result.fit.baseWeight),capAxes:withWeight(location,weight),weight,
    scale:builtin?1:fit.scale,width:scaled?fit.width:1,tracking:builtin?nativeTracking():fit.tracking,
    gap:v.gap,allSmall:allSmall(),builtin,nativeC2sc:result.nativeC2sc,sample:$('sample').value};
}
function renderEvidence() {
  const r=result,scaled=useTransform(),f=scaled?r.transformFit:r.fit;
  const glyphs=scaled?r.transformGlyphs:r.glyphs;
  const native=r.referenceKind==='smcp'&&r.referenceLetters.length>0;
  const compareReference=native||r.target==='reference';
  $('evidence-reference').textContent=native?'native smcp':r.target==='reference'?'reference':'full-size capitals (fallback)';
  const mode=scaled?'scaleX':current.axes.wdth?'wdth':'unscaled';
  $('evidence-mode').textContent=`${mode} output`;
  let evidenceErrors=f.errors;
  if(scaled||native) {
    const errors={width:[],vertical:[],horizontal:[]};
    for(const g of glyphs.filter(g=>native?g.letter!=='I':g.used)) {
      const m=g.candidate,t=g.target;
      if(compareReference)errors.width.push(Math.log(f.scale*f.width*m.width/t.width));
      if((current.browserMeasured||'BDEFHLMNPRT'.includes(g.letter))&&m.vstem&&t.vstem)errors.vertical.push(Math.log(f.scale*f.width*m.vstem/t.vstem));
      if('EFHLT'.includes(g.letter)&&m.hstem&&t.hstem)errors.horizontal.push(Math.log(f.scale*m.hstem/t.hstem));
    }
    evidenceErrors=Object.fromEntries(Object.entries(errors).map(([k,a])=>[k,a.length?100*Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length):null]));
  }
  $('evidence-note').textContent=native?`Comparing the selected output against this font’s actual smcp glyphs (${r.referenceLetters.length}/26 letters), at the text weight and axes. ${current.browserMeasured?'Measured from browser pixels. ':''}The reference stays native even when calibration uses x-height.`:current.browserMeasured?'Comparing browser-rasterized glyphs at 128px with synthesis disabled. Measurements depend on this browser and OS.':r.target==='reference'
    ? `Comparing ${r.referenceLetters.length} actual reference outlines. Capital I is excluded from fitting because its design may differ from the small-cap form. Values below each letter show ink-width error, then advance-width error after tracking. Native word kerning contributes to tracking where available.`
    :r.tableRecipe?`Using the stored recipe for ${r.tableRecipe.family}; this loaded file has no native small-cap outlines to compare.`
    :r.target==='xheight'?'Comparing capitals reduced to x-height, with stroke compensation.'
    :'Comparing corpus-estimated small-caps with full-size capitals; the solver compensates stroke thickness.';
  $('glyphs').replaceChildren();
  for(const source of glyphs) {
    const g={...source,widthError:compareReference?100*(f.scale*f.width*source.candidate.width/source.target.width-1):null,
      spacedAdvanceError:compareReference?100*(f.scale*f.width*(source.candidate.advance+f.tracking*r.unitsPerEm)/source.target.advance-1):null};
    const card=el('div','glyph-card'), heading=el('h3','letter',g.letter);
    heading.append(el('small','',g.used?'fitted':'not fitted'));card.append(heading);
    const ns='http://www.w3.org/2000/svg', svg=document.createElementNS(ns,'svg');
    const units=r.unitsPerEm, pad=units*.08, height=Math.max(r.capHeight,r.targetHeight,r.referenceHeight||0)*1.13;
    const width=Math.max(g.target.width,g.candidate.width*f.scale*f.width)+2*pad;
    svg.setAttribute('viewBox',`0 0 ${width} ${height+pad}`);svg.setAttribute('aria-label',`${g.letter} reference and simulated outlines`);svg.setAttribute('role','img');svg.setAttribute('aria-describedby',`glyph-metrics-${g.letter}`);
    for(const y of [r.xHeight,native?r.referenceHeight:r.targetHeight]) {
      const line=document.createElementNS(ns,'path');line.setAttribute('d',`M0 ${height-y}H${width}`);
      line.setAttribute('stroke','#b9bcae');line.setAttribute('stroke-width',units*.004);line.setAttribute('stroke-dasharray',`${units*.015} ${units*.015}`);svg.append(line);
    }
    for(const [path,color,xscale,yscale,bounds] of [[g.targetPath,'#d79c86',1,1,g.target.bounds],[g.candidatePath,'#285943',f.scale*f.width,f.scale,g.candidate.bounds]]) {
      const p=document.createElementNS(ns,'path');p.setAttribute('d',path);p.setAttribute('fill',color);p.setAttribute('fill-opacity','.65');
      p.setAttribute('stroke',color==='#d79c86'?'#8c4b2c':'#285943');p.setAttribute('stroke-width',units*.004);
      if(color==='#d79c86')p.setAttribute('stroke-dasharray',`${units*.012} ${units*.008}`);
      p.setAttribute('transform',`translate(${pad-bounds[0]*xscale},${height}) scale(${xscale},${-yscale})`);svg.append(p);
    }
    const description=el('small','',g.widthError===null?'Stroke comparison; no matching small-cap width reference.':`Ink width: ${fmt(g.widthError,1)}% difference. Advance width after tracking: ${fmt(g.spacedAdvanceError,1)}% difference.`);
    description.id=`glyph-metrics-${g.letter}`;card.append(svg,description);$('glyphs').append(card);
  }
  $('errors').replaceChildren();
  for(const [k,label] of Object.entries({width:'ink-width RMS log error',vertical:'vertical-stroke RMS log error',horizontal:'horizontal-stroke RMS log error'}))
    metric($('errors'),evidenceErrors[k]===null?'—':`${fmt(evidenceErrors[k],1)}%`,label);
  metric($('errors'),`${fmt(f.tracking)}em`,`tracking · ${f.trackingSource}`);
  if(f.spacingWordRmsPercent!==null)metric($('errors'),`${fmt(f.spacingWordRmsPercent,1)}%`,'word-width RMS error after tracking');
  $('warnings').replaceChildren(...r.warnings.map(w=>el('p','warning',w)));
}
function fontSource() {
  if(current.browserMeasured&&current.localSources)return current.localSources;
  return current.sourceURL?`url(${JSON.stringify(current.sourceURL)})`:current.localName?`local(${JSON.stringify(current.localName)})`:'url("FONT_URL")';
}
function localizeCSS(css) {
  if(!current.browserMeasured)return css;
  css=css.replace(/@font-face \{[^}]*\}\n/,'').replace('Native smcp in loaded file:','Native small-caps detected in browser:');
  if(current.axes.wght)css=css.replace(/font-weight: [^;]+;/g,'font-weight: 400;');
  if(current.boundLocal)return `@font-face {
  font-family: "CalibratedFont";
  src: ${fontSource()};
  font-weight: 100 900;
  font-stretch: 50% 200%;
}\n${css}`;
  return css.replaceAll('"CalibratedFont"',JSON.stringify(current.name));
}
function exportCSS() {
  if(['none','builtin'].includes(widthMode()))return exportSimpleCSS(widthMode()==='builtin');
  return localizeCSS(rawExportCSS());
}
function exportSimpleCSS(builtin) {
  const v=values(),base=result.fit.baseWeight;
  const google=!builtin&&current.googleFamily;
  const url=new URL('https://fonts.googleapis.com/css2');
  if(google){
    const entry=boot.googleCatalog.families.find(font=>font.name===current.googleFamily);
    const tags=(entry?.axes.map(axis=>axis[0])||['wght']).filter(tag=>tag==='wght'||Number.isFinite(result.axesLocation[tag])).sort();
    const axisValues=tags.map(tag=>cssNum(tag==='wght'?base:result.axesLocation[tag],2));
    url.searchParams.set('family',`${current.googleFamily}:${tags.join(',')}@${axisValues.join(',')}`);
    url.searchParams.set('display','swap');
  }
  const familyName=google?current.googleFamily:'CalibratedFont';
  const source=google?`@import url(${JSON.stringify(url.href)});`:`@font-face {
  font-family: "CalibratedFont";
  src: ${fontSource()};
  font-weight: ${current.axes.wght?`${cssNum(current.axes.wght.min)} ${cssNum(current.axes.wght.max)}`:cssNum(current.staticWeight||base)};
}`;
  const css=`${source}
/* ${builtin?'Built-in small-caps; the font source must include smcp.':'Naive: browser font-variant small-caps.'} No JavaScript. */
.smcp-text {
  font-family: ${JSON.stringify(familyName)};
  font-size: ${cssNum(v['reading-size'])}px;
  font-weight: ${cssNum(base,2)};
  font-variation-settings: ${variation(result.axesLocation,base,2)};
  font-optical-sizing: none;
  font-kerning: normal;
  font-synthesis: none;
  letter-spacing: normal;
}
span.smcp {
  display: inline-block;
  white-space: nowrap;
  font-size: 1em;
  font-weight: ${builtin?cssNum(nativeWeight(),2):'inherit'};
  font-variation-settings: ${builtin?variation(nativeAxes(),nativeWeight(),2):'inherit'};
  font-variant: ${builtin?'normal':allSmall()?'all-small-caps':'small-caps'};
  font-feature-settings: ${builtin?'"smcp" 1, "c2sc" 0':'normal'};
  font-synthesis: ${builtin?'none':'small-caps'};
  text-transform: none;
  letter-spacing: ${builtin?cssNum(nativeTracking())+'em':'normal'};
}
span.smcp::first-letter {
  font-size: 1em;
  font-weight: ${builtin?cssNum(allSmall()?nativeWeight():base,2):'inherit'};
  font-variation-settings: ${builtin?variation(allSmall()?nativeAxes():result.axesLocation,allSmall()?nativeWeight():base,2):'inherit'};
  letter-spacing: ${builtin&&allSmall()?cssNum(nativeTracking())+'em':'normal'};
  margin-right: ${allSmall()?0:cssNum(v.gap)}em;
}`;
  return google?css:localizeCSS(css);
}
function rawExportCSS() {
  if(useTransform())return exportTransformCSS();
  const v=values(),w=current.axes.wght,loc=result.axesLocation;
  return `/* ${current.sourceURL?(current.fullReference?'Full font source with small-cap references.':current.googleFamily?'Google Fonts Latin source; no font download step needed.':'Direct font URL; requires hosting permission and CORS access.'):current.localName?'Requires this installed font on the reader’s device.':'Replace FONT_URL with your licensed font file URL.'}
   Native smcp in loaded file: ${current.nativeSmcp?'yes':'no'}.
   Calibrated at ${v['reading-size']}px; recheck at other sizes and on the target OS.
   One word per span: ${allSmall()?'all letters are small-caps':'the initial stays full-size'}.
   ${current.axes.wdth?'Width uses the font’s wdth axis.':'No wdth axis: independent width correction is unavailable.'}
   No transforms or runtime JavaScript. */
@font-face {
  font-family: "CalibratedFont";
  src: ${fontSource()};
  font-weight: ${w?`${cssNum(w.min,2)} ${cssNum(w.max,2)}`:cssNum(current.staticWeight,2)};
}
.smcp-text {
  font-family: "CalibratedFont";
  letter-spacing: normal;
  font-kerning: normal;
  font-size: ${cssNum(v['reading-size'])}px;
  font-weight: ${cssNum(result.fit.baseWeight,2)};
  font-variation-settings: ${variation(loc,result.fit.baseWeight,2)};
  font-optical-sizing: none;
  font-synthesis: none;
}
span.smcp {
  display: inline-block;
  white-space: nowrap;
  font-family: "CalibratedFont";
  letter-spacing: normal;
  font-kerning: normal;
  font-size: ${cssNum(v.scale)}em;
  font-weight: ${cssNum(v.weight,2)};
  font-variation-settings: ${capVariation(2)};
  font-optical-sizing: none;
  font-synthesis: none;
  /* Rich-text paste hint; calibration still controls browser rendering. */
  font-variant: small-caps;
  font-feature-settings: "smcp" 0;
  text-transform: uppercase;
  letter-spacing: ${cssNum(v.tracking)}em;
}
span.smcp::first-letter {
  font-size: ${allSmall()?'1':cssNum(1/Number(cssNum(v.scale)))}em;
  font-weight: ${cssNum(allSmall()?v.weight:result.fit.baseWeight,2)};
  font-variation-settings: ${allSmall()?capVariation(2):variation(loc,result.fit.baseWeight,2)};
  letter-spacing: ${allSmall()?cssNum(v.tracking)+'em':'0'};
  margin-right: ${allSmall()?'0':cssNum(v.gap)}em;
}`;
}
let wordWidthCache;
function precomputedWordMargins() {
  const words=[...new Set($('sample').value.match(/[A-Z]{2,}/g)||[])];
  const key=JSON.stringify([family,transformAxes(),result.transformFit,allSmall(),words,values()['reading-size']]);
  if(wordWidthCache?.key===key)return wordWidthCache.widths;
  const probe=el('div','sample');
  Object.assign(probe.style,{position:'fixed',left:'-100000px',top:'0',visibility:'hidden',whiteSpace:'nowrap',fontOpticalSizing:'none',fontSynthesis:'none'});
  document.body.append(probe);
  const widths={};
  try {
    for(const word of words){
      renderSentence(probe,'transform',word,values()['reading-size']);
      // Measure the rounded export settings, not the solver's full precision.
      const rest=probe.querySelector('.sc-rest'),f=result.transformFit;
      Object.assign(rest.style,{fontSize:`${cssNum(f.scale)}em`,fontWeight:cssWeight(cssNum(f.weight,2)),fontVariationSettings:variation(transformAxes(),f.weight,2),letterSpacing:`${cssNum(f.tracking)}em`,transform:'none'});
      const layoutWidth=rest.getBoundingClientRect().width;
      // Margins use the scaled-down element's em, not the surrounding text's em.
      widths[word]=layoutWidth*(Number(cssNum(f.width))-1)/parseFloat(getComputedStyle(rest).fontSize);
    }
  }finally{probe.remove();}
  wordWidthCache={key,widths};return widths;
}
function exportTransformCSS() {return localizeCSS(rawExportTransformCSS());}
function rawExportTransformCSS() {
  const f=result.transformFit,w=current.axes.wght||{min:100,max:900};
  return `/* Horizontal scaling; ${widthMode()==='precomputed'?'precomputed word widths, no runtime JavaScript':widthMode()==='javascript'?'use the width-correction script from the complete recipe':'no width correction'}. */
@font-face {
  font-family: "CalibratedFont";
  src: ${fontSource()};
  font-weight: ${cssNum(w.min,2)} ${cssNum(w.max,2)};
}
.smcp-text {
  font-family: "CalibratedFont";
  letter-spacing: normal;
  font-kerning: normal;
  font-size: ${cssNum(values()['reading-size'])}px;
  font-weight: ${cssNum(result.fit.baseWeight,2)};
  font-variation-settings: ${variation(result.axesLocation,result.fit.baseWeight,2)};
  font-optical-sizing: none;
  font-synthesis: none;
}
.smcp-transform, .smcp-rest {
  display: inline-block;
  white-space: nowrap;
}
.smcp-rest {
  font-size: ${cssNum(f.scale)}em;
  font-weight: ${cssNum(f.weight,2)};
  font-variation-settings: ${variation(transformAxes(),f.weight,2)};
  font-variant: small-caps;
  font-feature-settings: "smcp" 0;
  text-transform: uppercase;
  letter-spacing: ${cssNum(f.tracking)}em;
  margin-left: ${allSmall()?0:cssNum(values().gap/Number(cssNum(f.scale)))}em;
  transform: scaleX(${cssNum(f.width)});
  transform-origin: left bottom;
}
${widthMode()==='precomputed'?Object.entries(precomputedWordMargins()).map(([word,margin])=>`.smcp-transform[data-word="${word}"] > .smcp-rest { margin-right: ${cssNum(margin)}em; }`).join('\n'):''}`;
}
function transformWidthScript() {
  return `(() => {
  const letters = [...document.querySelectorAll('.smcp-transform .smcp-rest')];
  let pending = false;
  function update() {
    pending = false;
    for (const letter of letters) {
      const scale = new DOMMatrixReadOnly(getComputedStyle(letter).transform).a;
      // Layout width before transforms, including fractional CSS pixels.
      const width = parseFloat(getComputedStyle(letter).width);
      letter.style.marginRight = width * (scale - 1) + 'px';
    }
  }
  function schedule() {
    if (!pending) { pending = true; requestAnimationFrame(update); }
  }
  document.fonts.ready.then(schedule);
  document.fonts.addEventListener('loadingdone', schedule);
  window.addEventListener('resize', schedule);
  const observer = new ResizeObserver(schedule);
  letters.forEach(letter => observer.observe(letter));
  schedule();
})();`;
}
function exportRecipe() {
  if(useTransform()&&!['none','builtin'].includes(widthMode())) {
    const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
    const content=$('sample').value.split(/([A-Z]{2,})/g).map(token=>/^[A-Z]{2,}$/.test(token)
      ?`<span class="smcp-transform" data-word="${token}">${allSmall()?'':escape(token[0])}<span class="smcp-rest">${escape((allSmall()?token:token.slice(1)).toLowerCase())}</span></span>`:escape(token)).join('');
    return `<style>\n${exportTransformCSS()}\n</style>\n<p class="smcp-text">${content}</p>${widthMode()==='javascript'?'\n<script>\n'+transformWidthScript()+'\n</script>':''}`;
  }
  return `<!-- One span per word, with spaces outside. Source text stays mixed case.
${allSmall()?'All letters become small-caps.':'Only the initial stays full-size; internal capitals are not preserved.'}
Rich-text paste may retain small-caps formatting; destination support varies. -->
<style>
${exportCSS()}
</style>
<p class="smcp-text">${$('sample').value.split(/([A-Z]{2,})/g).map(token=>/^[A-Z]{2,}$/.test(token)?`<span class="smcp">${allSmall()?token.toLowerCase():token[0]+token.slice(1).toLowerCase()}</span>`:token.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')).join('')}</p>`;
}
function syncNumber(slider,number) {
  for(const key of ['min','max','step','disabled'])number[key]=slider[key];
  if(document.activeElement!==number)number.value=slider.disabled?'':slider.value;
  number.placeholder=slider.disabled?'N/A':'';
}
function bindNumber(slider,number,label) {
  number.type='number';number.className='slider-number';number.setAttribute('aria-label',label);
  syncNumber(slider,number);
  number.addEventListener('change',()=>{
    const value=number.valueAsNumber;
    if(Number.isFinite(value)&&!slider.disabled){
      slider.value=Math.max(+slider.min,Math.min(+slider.max,value));
      number.value=slider.value;slider.dispatchEvent(new Event('input',{bubbles:true}));
    }else number.value=slider.disabled?'':slider.value;
  });
  number.addEventListener('keydown',event=>{
    if(event.key==='Enter'){event.preventDefault();number.blur();}
    if(event.key==='Escape'){number.value=slider.value;number.blur();}
  });
  number.addEventListener('blur',()=>syncNumber(slider,number));
}
for(const k of ['scale','width','weight','tracking','gap','size','reading-size']) {
  const old=$(k+'-out'),number=document.createElement('input');number.id=old.id;
  const label=k==='scale'?'Height scale':old.parentElement.textContent.trim();
  const heading=old.parentElement;old.replaceWith(number);
  if(heading.tagName==='LABEL'){const row=el('div','control-heading');heading.replaceWith(row);row.append(heading,number);}
  bindNumber($(k),number,label);
}
for(const k of ['scale','weight','tracking']) $(k).addEventListener('input',()=>{
  if(k==='weight')weightOverride=+$('weight').value;
  if(k==='scale')heightOverride=+$('scale').value;
  if(k==='tracking')trackingOverride=+$('tracking').value;
  render();schedule(true);
});
$('set-xheight').addEventListener('click',()=>{
  if(!result)return;
  const scale=$('scale'),value=result.xHeightScale;
  scale.min=Math.min(+scale.min,value);scale.max=Math.max(+scale.max,value);
  scale.value=value;
  scale.dispatchEvent(new Event('input',{bubbles:true}));
});
$('width').addEventListener('input',()=>{widthOverride=+$('width').value;render();schedule(true);});
for(const k of ['gap','size','sample']) $(k).addEventListener('input',render);
for(const k of ['width-method','initial-mode'])$(k).addEventListener('change',()=>{
  if(k==='width-method')for(const tab of $('transform-width-mode').querySelectorAll('[role=tab]'))tab.setAttribute('aria-selected',String(tab.dataset.widthMode===(useTransform()?'precomputed':'unscaled')));
  if(result)render();
});
function setReviewView(view) {
  for(const button of $('review-tabs').querySelectorAll('[role=tab]')) {
    const active=button.dataset.view===view;
    button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
    const panel=$(button.getAttribute('aria-controls'));
    panel.classList.toggle('active',active);panel.inert=!active;panel.setAttribute('aria-hidden',String(!active));
  }
  $('empty-state').hidden=!!result||view==='research';
  $('review-scroll').scrollTop=0;
  if(result)render();
}
const mobileRecipe=window.matchMedia('(max-width: 999px)');
let mobileRecipeOpen=false;
function syncRecipeDisclosure() {
  const open=!mobileRecipe.matches||mobileRecipeOpen;
  if(!open&&$('recipe-body').contains(document.activeElement))$('recipe-toggle').focus({preventScroll:true});
  $('recipe-body').hidden=!open;
  $('recipe-toggle').setAttribute('aria-expanded',String(open));
  $('recipe-toggle').querySelector('span').textContent=open?'−':'+';
}
$('recipe-toggle').addEventListener('click',()=>{mobileRecipeOpen=!mobileRecipeOpen;syncRecipeDisclosure();});
mobileRecipe.addEventListener('change',syncRecipeDisclosure);
syncRecipeDisclosure();
$('export-toggle').addEventListener('click',()=>{
  const open=$('export-toggle').getAttribute('aria-expanded')!=='true';
  $('export-toggle').setAttribute('aria-expanded',String(open));
  $('export-body').hidden=!open;
  $('export-dock').classList.toggle('expanded',open);
  $('export-toggle-label').textContent=open?'Hide code ↓':'Show code ↑';
});
function wireTabs(id,activate) {
  const tabs=[...$(id).querySelectorAll('[role=tab]')];
  for(const [index,tab] of tabs.entries()) {
    tab.addEventListener('click',()=>activate(tab));
    tab.addEventListener('keydown',event=>{
      const visible=tabs.filter(button=>!button.hidden),position=visible.indexOf(tab);
      const next=event.key==='ArrowRight'?(position+1)%visible.length:event.key==='ArrowLeft'?(position+visible.length-1)%visible.length:event.key==='Home'?0:event.key==='End'?visible.length-1:null;
      if(next===null)return;
      event.preventDefault();visible[next].focus();activate(visible[next]);
    });
  }
}
wireTabs('review-tabs',tab=>setReviewView(tab.dataset.view));
wireTabs('comparison-tabs',tab=>{
  preserveScroll(()=>{
    for(const button of $('comparison-tabs').querySelectorAll('[role=tab]')) {
      const active=button===tab;
      button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
      $(button.getAttribute('aria-controls')).hidden=!active;
    }
    // Recalculate transformed widths after the chosen panel becomes visible.
    render();
  });
});
wireTabs('transform-width-mode',tab=>{
  const wasScaled=useTransform();
  if(!['none','builtin'].includes(tab.dataset.widthMode))$('width-method').value=tab.dataset.widthMode==='unscaled'?'unscaled':'transform';
  for(const button of $('transform-width-mode').querySelectorAll('[role=tab]')) {
    const active=button===tab;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
  }
  $('export-content').setAttribute('aria-labelledby',tab.id);
  if(result) {
    if(wasScaled===useTransform())renderExport();
    else {
      render();
    }
  }
});
function syncOpticalSize() {
  if(current?.axes.opsz&&$('optical-policy').value==='linked') {
    const axis=current.axes.opsz,input=$('axis-opsz');
    input.value=Math.max(axis.min,Math.min(axis.max,+$('reading-size').value));
    syncNumber(input,input.previousElementSibling.querySelector('input[type=number]'));
    return true;
  }
  return false;
}
$('reading-size').addEventListener('input',()=>{if(syncOpticalSize())schedule(false);render();});
$('optical-policy').addEventListener('change',()=>{if(syncOpticalSize())calibrate(false);else render();});
$('target').addEventListener('change',()=>calibrate(false));
$('fit').addEventListener('click',()=>{clearTimeout(timer);calibrate(false);});
let importID=0;
async function importFont(bytes,source={}) {
  const finishLoading=beginLoading();
  try {
    if(bytes.byteLength>16*1024*1024)throw Error('Choose a font smaller than 16 MB.');
    const id=`import_${++importID}`;
    const meta=await call('upload',{id,bytes:bytes.slice(0),googleFamily:source.googleFamily});
    Object.assign(meta,source);
    fontData.set(id,bytes);addFont(meta);await selectFont(id);
  } finally {finishLoading();}
}
function googleFamily(input) {
  const link=input.match(/https:\/\/[^\s"'<>;)]+/)?.[0];
  if(!link)return input.trim();
  const url=new URL(link.replaceAll('&amp;','&'));
  if(!['fonts.google.com','fonts.googleapis.com'].includes(url.hostname))throw Error('Use a Google Fonts family name, specimen link, or CSS embed.');
  const names=url.searchParams.getAll('family');
  if(names.length>1||names[0]?.includes('|'))throw Error('Choose one Google Fonts family at a time.');
  const name=names[0]?.split(':')[0]||url.pathname.match(/^\/specimen\/([^/]+)/)?.[1];
  if(!name)throw Error('This Google Fonts link does not specify a family.');
  return decodeURIComponent(name.replaceAll('+',' '));
}
async function fetchPublic(url) {
  const response=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error(`Font request returned ${response.status}. Check the URL and connection.`);
  return response;
}
async function fetchFontURL(sourceURL) {
  let response;
  try { response=await fetchPublic(sourceURL); }
  catch(error) { throw Error(`${error.message} The font host must allow cross-origin requests (CORS), including from a local HTML file.`); }
  const limit=16*1024*1024;
  if(Number(response.headers.get('content-length'))>limit)throw Error('Font exceeds the 16 MB limit.');
  const reader=response.body.getReader(),chunks=[];let size=0;
  while(true) {
    const {done,value}=await reader.read();if(done)break;
    size+=value.byteLength;
    if(size>limit){await reader.cancel();throw Error('Font exceeds the 16 MB limit.');}
    chunks.push(value);
  }
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return bytes.buffer;
}
async function loadLocalName(input) {
  const finishLoading=beginLoading();
  try {
    if(input.includes(','))throw Error('Enter one font name, not a comma-separated list.');
    let name=input.trim();
    if(/^["']/.test(name)) {
      if(name.length<2||name.at(-1)!==name[0])throw Error('Enter one font name with balanced quotes.');
      name=name.slice(1,-1).trim();
    }
    if(!name||/["'\\]/.test(name))throw Error('Enter one plain font name, optionally enclosed in quotes.');
    status(`Measuring installed family ${name}…`);
    const meta=await inspectLocalFont(name);
    const existing=fonts.find(f=>f.browserMeasured&&f.name===name);
    if(existing){await selectFont(existing.id);return;}
    meta.id=`local_${++importID}`;addFont(meta);await selectFont(meta.id);
  } finally {finishLoading();}
}
async function fetchGoogleFont(entry) {
  const name=entry.name;
  const ranges=[...(entry?.axes||[])].sort((a,b)=>a[0].localeCompare(b[0]));
  const spec=name+(ranges.length?`:${ranges.map(a=>a[0]).join(',')}@${ranges.map(a=>a[1]===a[2]?a[1]:`${a[1]}..${a[2]}`).join(',')}`:':wght@400');
  const cssURL=new URL('https://fonts.googleapis.com/css2');cssURL.searchParams.set('family',spec);cssURL.searchParams.set('display','swap');
  status(`Fetching ${name} from Google Fonts…`);
  const css=await (await fetchPublic(cssURL.href)).text();
  // Read descriptors only; never insert remote CSS into the document.
  const blocks=[...css.matchAll(/@font-face\s*\{([^}]+)\}/g)].map(m=>m[1]);
  const coversLatin=block=>{
    const range=block.match(/unicode-range\s*:\s*([^;]+)/i)?.[1];
    if(!range)return true;
    return [32,72,120].every(cp=>range.split(',').some(part=>{
      const m=part.trim().match(/^U\+([\dA-F?]+)(?:-([\dA-F]+))?$/i);if(!m)return false;
      const lo=parseInt(m[1].replaceAll('?','0'),16),hi=parseInt(m[2]||m[1].replaceAll('?','F'),16);
      return cp>=lo&&cp<=hi;
    }));
  };
  const block=blocks.find(b=>/font-style\s*:\s*normal/i.test(b)&&coversLatin(b));
  const raw=block?.match(/src\s*:[^;]*url\(\s*['"]?([^\s'"\)]+)/i)?.[1];
  if(!raw)throw Error('Google did not return an upright Latin font for this family.');
  const sourceURL=new URL(raw);
  if(sourceURL.protocol!=='https:'||sourceURL.hostname!=='fonts.gstatic.com')throw Error('Unexpected Google Fonts source host.');
  return {bytes:await fetchFontURL(sourceURL.href),sourceURL:sourceURL.href,weight:block.match(/font-weight\s*:\s*([^;]+)/i)?.[1]?.trim()||'400'};
}
$('google-form').addEventListener('submit',async event=>{
  event.preventDefault();if($('google-load').disabled)return;
  const finishLoading=beginLoading();
  const previousFocus=document.activeElement;
  $('google-load').disabled=true;$('google-font').readOnly=true;$('google-form').setAttribute('aria-busy','true');
  try {
    const input=$('google-font').value.trim();
    if(!/[<>]/.test(input)&&!(/^[a-z][a-z\d+.-]*:/i.test(input))&&(/^["']/.test(input)||input.includes(','))) {
      await loadLocalName(input);return;
    }
    if(/^[a-z][a-z\d+.-]*:/i.test(input)) {
      const url=new URL(input);
      if(url.protocol!=='https:'||url.username||url.password)throw Error('Use an HTTPS font URL without embedded credentials.');
      if(!['fonts.google.com','fonts.googleapis.com'].includes(url.hostname)) {
        status('Fetching font directly from its host…');
        await importFont(await fetchFontURL(url.href),{sourceURL:url.href});
        return;
      }
    }
    const requested=googleFamily($('google-font').value);
    const entry=boot.googleCatalog.families.find(f=>f.name.toLowerCase()===requested.toLowerCase());
    if(!entry){await loadLocalName(requested);return;}
    const name=entry?.name||requested;
    if(!name||/[<>\r\n]/.test(name))throw Error('Enter a Google Fonts family name or link.');
    const reference=boot.corpus.fonts.find(f=>f.name===name&&f.referenceKind==='smcp'&&f.sourceURL);
    if(reference){
      status(`Loading ${name} with its native small-caps…`);
      const [fullBytes,regular]=await Promise.all([fetchFontURL(reference.sourceURL),fetchGoogleFont(entry)]);
      await importFont(fullBytes,{sourceURL:reference.sourceURL,googleFamily:name,fullReference:true,naiveBytes:regular.bytes,naiveSourceURL:regular.sourceURL,naiveWeight:regular.weight});
      $('google-font').value=name;
      return;
    }
    const regular=await fetchGoogleFont(entry);
    await importFont(regular.bytes,{sourceURL:regular.sourceURL,googleFamily:name});
    $('google-font').value=name;
  }catch(error){status(`Could not load font: ${error.message}`,true);}
  finally{finishLoading();$('google-load').disabled=false;$('google-font').readOnly=false;$('google-form').removeAttribute('aria-busy');if(document.activeElement===document.body&&previousFocus?.isConnected)previousFocus.focus({preventScroll:true});}
});
$('google-font').addEventListener('input',()=>{
  if(boot.googleCatalog.families.some(f=>f.name.toLowerCase()===$('google-font').value.trim().toLowerCase()))$('google-form').requestSubmit();
});
for(const f of boot.googleCatalog.families){const option=document.createElement('option');option.value=f.name;$('google-families').append(option);}
let installedFonts=[];
function localFontAccessIssue() {
  if(!window.isSecureContext)return 'Local font lookup is unavailable on this insecure page. Open it over HTTPS or localhost, or choose a font file.';
  if(typeof window.queryLocalFonts!=='function')return 'This browser cannot read installed fonts by name. Try desktop Chrome, or choose a font file.';
  return null;
}
const canListFonts=!localFontAccessIssue();
$('installed-list').disabled=!canListFonts;
$('installed-note').textContent=canListFonts?'Lists installed faces only after your permission. Selected font bytes stay in this browser.':
  localFontAccessIssue();
$('installed-list').addEventListener('click',async()=>{
  const previousFocus=document.activeElement;
  try {
    $('installed-list').disabled=true;
    const available=await window.queryLocalFonts();installedFonts=[];
    $('installed-picker').hidden=true;
    for(const [i,font] of available.entries()) {
      $('installed-note').textContent=`Checking installed faces for variable weight support: ${i+1}/${available.length}…`;
      try {
        const blob=await font.blob();if(blob.size>16*1024*1024)continue;
        const bytes=await blob.arrayBuffer(),meta=await call('inspect',{bytes});
        if(meta.axes.wght&&meta.axes.wght.max>meta.axes.wght.min)installedFonts.push({...font,fullName:font.fullName,postscriptName:font.postscriptName,bytes});
      }catch{/* Unsupported fonts are not offered in the variable-only selector. */}
    }
    installedFonts.sort((a,b)=>a.fullName.localeCompare(b.fullName));
    $('installed-font').replaceChildren();
    installedFonts.forEach((font,i)=>{const option=document.createElement('option');option.value=i;option.textContent=font.fullName;$('installed-font').append(option);});
    $('installed-picker').hidden=!installedFonts.length;
    $('installed-note').textContent=installedFonts.length?`${installedFonts.length} variable installed faces available. Choose the upright face you want to measure.`:'No readable installed faces with a usable wght axis were found.';
  }catch(error){$('installed-note').textContent=`Installed-font access unavailable: ${error.message} You can still open a variable font file below.`;}
  finally{$('installed-list').disabled=false;announceAction($('installed-note').textContent);if(document.activeElement===document.body&&previousFocus?.isConnected)previousFocus.focus({preventScroll:true});}
});
$('installed-load').addEventListener('click',async()=>{
  const previousFocus=document.activeElement;
  $('installed-load').disabled=true;
  try {
    const font=installedFonts[+$('installed-font').value];if(!font)return;
    status(`Reading installed face ${font.fullName}…`);
    await importFont(font.bytes,{localName:font.postscriptName});
  }catch(error){status(`Could not read installed font: ${error.message}`,true);}
  finally{$('installed-load').disabled=false;if(document.activeElement===document.body&&previousFocus?.isConnected)(document.querySelector('.source details').open?previousFocus:$('google-font')).focus({preventScroll:true});}
});
async function openFontFile(file) {
  if(!file)return;
  const finishLoading=beginLoading();
  try {
    status(`Opening ${file.name}…`);
    if(file.size>16*1024*1024)throw Error('Choose a font smaller than 16 MB.');
    await importFont(await file.arrayBuffer());
  } catch(error){status(error.message,true);}
  finally {finishLoading();}
}
$('upload').addEventListener('change',()=>openFontFile($('upload').files[0]));
const fontInput=$('google-font');
const draggingFiles=event=>[...(event.dataTransfer?.types||[])].includes('Files');
for(const name of ['dragenter','dragover'])fontInput.addEventListener(name,event=>{
  if(!draggingFiles(event))return;
  event.preventDefault();
  event.dataTransfer.dropEffect='copy';
  fontInput.classList.add('font-drop-active');
});
for(const name of ['dragleave','dragend'])fontInput.addEventListener(name,()=>fontInput.classList.remove('font-drop-active'));
fontInput.addEventListener('drop',event=>{
  fontInput.classList.remove('font-drop-active');
  if(!draggingFiles(event))return;
  event.preventDefault();
  const files=event.dataTransfer.files;
  if(files.length!==1){status('Drop one font file at a time.',true);return;}
  if(!/\.(ttf|otf|woff2?)$/i.test(files[0].name)){
    status('Choose a TTF, OTF, WOFF, or WOFF2 font file.',true);return;
  }
  void openFontFile(files[0]);
});
$('copy').addEventListener('click',async()=>{try {await navigator.clipboard.writeText(exportRecipe());$('copy').textContent='Copied';announceAction('Recipe copied.');setTimeout(()=>$('copy').textContent=useTransform()&&widthMode()==='javascript'?'Copy HTML + CSS + JavaScript':'Copy HTML + CSS',1600);}catch{status('Clipboard unavailable. Select and copy the recipe below.',true);}});
$('copy-js').addEventListener('click',async()=>{
  try {await navigator.clipboard.writeText($('js-export').textContent);$('copy-js').textContent='Copied';announceAction('JavaScript copied.');setTimeout(()=>$('copy-js').textContent='Copy JavaScript',1600);}
  catch {const range=document.createRange();range.selectNodeContents($('js-export'));const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);status('JavaScript selected. Press Ctrl+C or ⌘C to copy.');}
});
$('copy-css').addEventListener('click',async()=>{
  try {await navigator.clipboard.writeText(exportCSS());$('copy-css').textContent='Copied';announceAction('CSS copied.');setTimeout(()=>$('copy-css').textContent='Copy CSS',1600);}
  catch {const range=document.createRange();range.selectNodeContents($('css-export'));const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);status('CSS selected. Press Ctrl+C or ⌘C to copy.');}
});
$('download').addEventListener('click',()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify({...result,loadedFile:{name:current.name,nativeSmcp:current.nativeSmcp,smcpLetters:current.smcpLetters,sourceURL:current.sourceURL},liveSettings:values()},null,2)],{type:'application/json'}));
  const link=el('a');link.href=url;link.download='small-cap-measurements.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
window.addEventListener('resize',()=>{if(result)render();});
const finishStartup=beginLoading();
try {
  await call('init',{corpus:boot.corpus});
  $('licenses').textContent=boot.licenses;
  renderCorpus();status('Ready. Choose a Google family, font URL, installed font, or local file.');
  pendingShared=readShareURL(location.href);
  if(pendingShared){
    const {kind,value}=pendingShared.source;
    if(kind==='file'){
      status(`Shared settings ready. Open the font file for ${value} to apply them.`);
      document.querySelector('.source details').open=true;
    }else if(kind==='local')await loadLocalName(JSON.stringify(value));
    else {$('google-font').value=value;$('google-form').requestSubmit();}
  }
}catch(error){status(error.message,true);}
finally {finishStartup();}

function renderCorpus() {
  const weight=+$('corpus-weight').value,cohort=$('corpus-cohort').value,rows=[];
  for(const p of boot.corpus.fonts) {
    const rankLimit=cohort.startsWith('top')?Number(cohort.slice(3)):null;
    if(rankLimit&&!(p.popularityRank&&p.popularityRank<=rankLimit))continue;
    const optical=p.axes.opsz?.[$('corpus-opsz').value]??null;
    const r=p.instances.find(r=>r.requestedWeight===weight&&(r.axes.opsz??null)===optical);
    if(r)rows.push({name:p.name,category:p.category,height:100*r.heightRatio,width:100*(r.widthGain-1),
      widthError:r.fit.errors.width,weight:r.fit.weight,baseWeight:r.fit.baseWeight,opsz:r.axes.opsz,
      tracking:r.fit.tracking,stroke:r.strokeUplift===null?null:100*(r.strokeUplift-1),
      kind:p.referenceKind,coverage:p.referenceLetters.length,hasWidth:!!p.axes.wdth,baseWidth:p.axes.wdth?.default,wdth:r.fit.wdth,
      widthLimit:r.widthLimit,weightLimit:Math.min(Math.abs(r.fit.weight-p.axes.wght.min),Math.abs(r.fit.weight-p.axes.wght.max))<.2,
      weightChange:100*(r.fit.weight/r.fit.baseWeight-1),spacingError:r.fit.spacingWordRmsPercent});
  }
  const mean=key=>{const a=rows.map(r=>r[key]).filter(Number.isFinite);return a.reduce((s,v)=>s+v,0)/a.length;};
  const signed=(n,d=1)=>(n>=0?'+':'')+fmt(n,d);
  $('averages').replaceChildren();
  metric($('averages'),signed(mean('height')-100)+'%','mean height above x-height');
  metric($('averages'),fmt(mean('widthError'),1)+'%','mean ink-width RMS log error');
  metric($('averages'),signed(mean('weightChange'))+'%','mean wght-axis increase (not darkness)');
  metric($('averages'),signed(mean('tracking'),3)+'em','mean tracking in reduced-cap em');
  const measure=$('corpus-measure').value;
  const labels={width:'Achieved glyph-width change (%)',widthError:'Remaining ink-width RMS log error (%)',weightChange:'Weight-axis increase (%)',tracking:'Tracking (reduced-cap em)',stroke:'Native vertical stem uplift (%)'};
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 880 360');svg.setAttribute('role','group');svg.setAttribute('aria-describedby','graph-help');svg.setAttribute('aria-label',`Small-cap height versus ${labels[measure]} by font`);
  const add=(tag,attrs,text)=>{const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;if(tag==='text')e.setAttribute('aria-hidden','true');svg.append(e);return e;};
  const legend=document.createElementNS(ns,'g');legend.setAttribute('role','group');legend.setAttribute('aria-label','Point colors: orange for sans-serif, green for serif');
  svg.append(legend);
  for(const [cx,label,fill] of [[594,'Sans-serif','#b66e45'],[746,'Serif','#426653']]) {
    legend.append(label==='Serif'?add('rect',{x:cx-6,y:10,width:12,height:12,fill}):add('circle',{cx,cy:16,r:6,fill}));
    legend.append(add('text',{x:cx+13,y:21},label));
  }
  const domain=values=>{const lo=Math.min(...values),hi=Math.max(...values),pad=Math.max(hi-lo,.01)*.18;return [lo-pad,hi+pad];};
  const [xlo,xhi]=domain(rows.map(r=>r.height)),[lo,hi]=domain(rows.map(r=>r[measure]).filter(Number.isFinite));
  const x=v=>85+(v-xlo)/(xhi-xlo)*725,y=v=>285-(v-lo)/(hi-lo)*245;
  for(let i=0;i<5;i++){
    const xv=xlo+(xhi-xlo)*i/4,yv=lo+(hi-lo)*i/4;
    add('path',{d:`M${x(xv)} 40V285`,stroke:'#e3e3d9'});add('text',{x:x(xv),y:308,'text-anchor':'middle'},`${fmt(xv,1)}%`);
    add('path',{d:`M85 ${y(yv)}H810`,stroke:'#e3e3d9'});add('text',{x:72,y:y(yv)+4,'text-anchor':'end'},fmt(yv,measure==='tracking'?3:1));
  }
  add('text',{x:440,y:345,'text-anchor':'middle'},'Small-cap height / x-height →');
  add('text',{x:20,y:165,transform:'rotate(-90 20 165)','text-anchor':'middle'},labels[measure]);
  const color=r=>r.category==='serif'?'#426653':'#b66e45',occupied=[];
  rows.forEach((r,i)=>{
    if(!Number.isFinite(r[measure]))return;
    const px=x(r.height),py=y(r[measure]),serif=r.category==='serif';
    const dot=add(serif?'rect':'circle',{...(serif?{x:px-6,y:py-6,width:12,height:12}:{cx:px,cy:py,r:6}),fill:color(r),role:'img',tabindex:i===0?0:-1,'data-category':r.category,'data-x':px,'data-y':py});
    const detail=`${i+1}. ${r.name} (${r.category}, ${r.kind} references, ${r.coverage}/26 letters): height ${fmt(r.height,1)}% of x-height; glyph-width change ${signed(r.width)}%; ink-width error ${fmt(r.widthError,1)}%; wght ${fmt(r.baseWeight,0)} → ${fmt(r.weight,1)}; ${r.hasWidth?'wdth '+fmt(r.baseWidth,1)+' → '+fmt(r.wdth,2):'no wdth axis'}; tracking ${fmt(r.tracking)}em. ${labels[measure]}: ${fmt(r[measure],measure==='tracking'?3:1)}${measure==='tracking'?' em':'%'}.`;
    const title=document.createElementNS(ns,'title');title.textContent=detail;dot.append(title);dot.setAttribute('aria-label',detail);
    const show=()=>{$('corpus-detail').textContent=detail;};dot.addEventListener('mouseenter',show);dot.addEventListener('click',()=>dot.focus());dot.addEventListener('focus',()=>{for(const point of svg.querySelectorAll('[data-category]'))point.setAttribute('tabindex',point===dot?'0':'-1');show();});
    let lx=px+10,ly=py-10;
    for(const [dx,dy] of [[10,-10],[10,16],[-23,-10],[-23,16],[10,-26],[10,30],[-23,-26],[-23,30]]) {
      lx=px+dx;ly=py+dy;if(!occupied.some(([a,b])=>Math.abs(a-lx)<21&&Math.abs(b-ly)<14))break;
    }
    occupied.push([lx,ly]);add('text',{x:lx,y:ly,class:'corpus-point-number'},String(i+1));
  });
  const points=[...svg.querySelectorAll('[data-category]')];
  if(points.length&&!points.some(p=>p.getAttribute('tabindex')==='0'))points[0].setAttribute('tabindex','0');
  svg.addEventListener('keydown',event=>{
    const index=points.indexOf(event.target);if(index<0)return;
    const next=['ArrowRight','ArrowDown'].includes(event.key)?(index+1)%points.length:['ArrowLeft','ArrowUp'].includes(event.key)?(index+points.length-1)%points.length:event.key==='Home'?0:event.key==='End'?points.length-1:null;
    if(next!==null){event.preventDefault();points[next].focus();}
  });
  $('corpus-plot').replaceChildren(svg);
  $('corpus-detail').textContent='Hover or focus a point for its measurements; point numbers match the table rows.';
  const table=$('corpus-table');table.replaceChildren(el('caption','',`${rows.length} font families at text weight ${weight}. All measurements underlying the graph.`));
  const head=el('tr');for(const t of ['# / Font','Category','Evidence / width axis','opsz','Height / x','Glyph width Δ','Ink-width error','Fitted wght','Fitted wdth','Tracking','Word-width error',`Graph: ${labels[measure]}`]){const cell=el('th','',t);cell.scope='col';head.append(cell);}const thead=el('thead');thead.append(head);table.append(thead);const tbody=el('tbody');table.append(tbody);
  rows.forEach((r,i)=>{
    const tr=el('tr');
    const cells=[`${i+1}. ${r.name}`,r.category,`${r.kind} · ${r.coverage}/26 letters · ${r.hasWidth?'wdth available':'no wdth'}`,r.opsz??'—',
      `${fmt(r.height,1)}%`,signed(r.width)+'%',fmt(r.widthError,1)+'%',
      `${fmt(r.baseWeight,0)} → ${fmt(r.weight,1)}${r.weightLimit?' (limit)':''}`,
      r.hasWidth?`${fmt(r.baseWidth,0)} → ${fmt(r.wdth,2)}${r.widthLimit?' (limit)':''}`:'—',
      fmt(r.tracking)+'em',r.spacingError===null?'—':fmt(r.spacingError,1)+'%',r[measure]===null?'—':fmt(r[measure],measure==='tracking'?3:1)+(measure==='tracking'?'em':'%')];
    for(const [index,text] of cells.entries()){const cell=el(index===0?'th':'td','',text);if(index===0)cell.scope='row';tr.append(cell);}tbody.append(tr);
  });
  $('corpus-note').textContent=`${rows.length} families at the selected settings, equal weight per family—not a representative survey; related Roboto families are not independent designs. Glyph-width change compares fitted capitals with uniformly reduced base-weight capitals at equal height (tracking excluded). Ink-width errors are RMS log errors, not signed width deficits. Stem uplift compares native stems with uniformly reduced base capitals. Word-width errors use all-small-cap calibration words, not mixed-size initial kerning. Boundary fits are flagged in the table. Inter is included with 11 phonetic reference letters (10 fitted; I excluded for its different design), not native smcp substitutions. The generator’s fallback uses equal-family medians from this corpus, interpolated by base weight at default optical designs. Partial references participate equally; related designs and unusual families still limit how representative the estimate is. Chart filters do not change the generator’s estimate.`;
}
$('corpus-weight').addEventListener('change',renderCorpus);
$('corpus-measure').addEventListener('change',renderCorpus);
$('corpus-opsz').addEventListener('change',renderCorpus);
$('corpus-cohort').addEventListener('change',renderCorpus);

// Focus before the label's default click action, without scrolling the page.
$('corpus-numbers').closest('label').addEventListener('pointerdown',event=>{
  if(event.button===0)$('corpus-numbers').focus({preventScroll:true});
});
$('corpus-numbers').addEventListener('change',()=>preserveScroll(()=>{
  $('corpus-plot').classList.toggle('hide-point-numbers',!$('corpus-numbers').checked);
}));

$('export-target').addEventListener('change',()=>{if(result)renderExport();});
$('copy-typeset').addEventListener('click',async()=>{
  try {await navigator.clipboard.writeText($('typeset-code').textContent);$('copy-typeset').textContent='Copied';announceAction('Typesetting code copied.');setTimeout(()=>$('copy-typeset').textContent='Copy code',1600);}
  catch {status('Clipboard unavailable. Select and copy the code below.',true);}
});
$('download-typeset').addEventListener('click',()=>{
  const url=URL.createObjectURL(new Blob([$('typeset-code').textContent],{type:'text/plain;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='smallcaps.'+($('export-target').value==='typst'?'typ':'tex');
  link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});

function currentShareState() {
  const source=current.googleFamily?{kind:'google',value:current.googleFamily}:
    current.sourceURL?{kind:'url',value:current.sourceURL}:
    current.browserMeasured||current.localName?{kind:'local',value:current.name}:{kind:'file',value:current.name};
  return {v:1,source,axes:Object.fromEntries(Object.entries(axes()).filter(([tag,value])=>value!==(tag==='wght'?Math.max(current.axes.wght?.min??100,Math.min(current.axes.wght?.max??900,500)):current.axes[tag]?.default))),sample:$('sample').value,
    selects:Object.fromEntries(Object.keys(sharedSelects).map(id=>[id,$(id).value])),
    numbers:Object.fromEntries(sharedNumbers.map(id=>[id,+$(id).value])),
    overrides:{scale:heightOverride,weight:weightOverride,width:widthOverride,tracking:trackingOverride},
    visible:[...document.querySelectorAll('[data-preview-toggle]:checked')].map(e=>e.dataset.previewToggle),
    overlay:overlaySelection,recipe:widthMode(),numbersVisible:$('corpus-numbers').checked,
    exportOpen:$('export-toggle').getAttribute('aria-expanded')==='true',
    view:$('research-tab').getAttribute('aria-selected')==='true'?'research':'preview'};
}
async function applySharedSettings(state) {
  const number=(id,value)=>{const input=$(id);if(input&&Number.isFinite(value))input.value=Math.max(+input.min,Math.min(+input.max,value));};
  for(const [id,value] of Object.entries(state.selects))$(id).value=value;
  for(const [id,value] of Object.entries(state.numbers))number(id,value);
  for(const [tag,value] of Object.entries(state.axes))number('axis-'+tag,value);
  for(const input of document.querySelectorAll('[data-axis]'))syncNumber(input,input.previousElementSibling.querySelector('input'));
  if(state.sample!==undefined)$('sample').value=state.sample;
  for(const toggle of document.querySelectorAll('[data-preview-toggle]'))toggle.checked=state.visible.includes(toggle.dataset.previewToggle);
  overlaySelection=state.overlay||null;
  $('corpus-numbers').checked=state.numbersVisible;
  syncOpticalSize();if(!await calibrate(false))return;
  if(!result)return;
  for(const [id,value] of Object.entries(state.overrides))number(id,value);
  heightOverride=state.overrides.scale===undefined?null:+$('scale').value;
  weightOverride=state.overrides.weight===undefined?null:+$('weight').value;
  widthOverride=state.overrides.width===undefined?null:+$('width').value;
  trackingOverride=state.overrides.tracking===undefined?null:+$('tracking').value;
  render();
  if(Object.keys(state.overrides).length&&!await calibrate(true))return;
  if(state.recipe)for(const tab of $('transform-width-mode').querySelectorAll('[role=tab]'))tab.setAttribute('aria-selected',String(tab.dataset.widthMode===state.recipe));
  $('export-toggle').setAttribute('aria-expanded',String(state.exportOpen));
  $('export-body').hidden=!state.exportOpen;$('export-dock').classList.toggle('expanded',state.exportOpen);
  $('export-toggle-label').textContent=state.exportOpen?'Hide code ↓':'Show code ↑';
  renderCorpus();setReviewView(state.view);
  status(`Loaded ${fontLabel(current)} · shared settings applied`);
}
$('share').addEventListener('click',()=>{
  if(!result)return;
  try {
    const state=currentShareState();$('share-url').value=shareURL(location.href,state);
    $('share-note').textContent=(['file','local'].includes(state.source.kind)?'The link will try this font name through Google Fonts or the recipient’s installed fonts. ':'')+
      (location.protocol==='file:'?'This page is opened locally. Use a hosted copy of the app to share a link other people can open.':'The link includes the font source, sample text, recipe and comparison settings.');
    $('share-dialog').showModal();$('share-url').select();
  }catch(error){status(error.message,true);}
});
$('share-close').addEventListener('click',()=>$('share-dialog').close());
$('share-copy').addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText($('share-url').value);$('share-copy').textContent='Copied';announceAction('Link copied.');setTimeout(()=>$('share-copy').textContent='Copy link',1600);}
  catch{$('share-url').focus();$('share-url').select();$('share-note').textContent+=' Clipboard unavailable; copy the selected link.';}
});

function announceAction(message) {
  const region=$('share-dialog').open?$('share-feedback'):$('action-status');
  region.textContent='';setTimeout(()=>{region.textContent=message;},20);
}
for(const link of document.querySelectorAll('.skip-links a, a[href="#corpus-table-region"]'))link.addEventListener('click',event=>{
  const target=document.querySelector(link.getAttribute('href'));if(!target)return;
  event.preventDefault();target.focus();target.scrollIntoView({block:'nearest'});
});
