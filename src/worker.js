import {decodeFont} from './decode.js';
import {metadata,analyze,signature} from './engine.js';
import {corpusPrior} from './corpus-prior.js';
import {tableRecipe} from './table-recipe.js';

const fonts=new Map();let corpus;
const meta=record=>({...metadata(record.font),id:record.id,recoveredReferences:!!record.companion});
async function handle({data}) {
  const {request,action}=data;
  try {
    let value;
    if(action==='init') {
      corpus=data.corpus;
      value=[...fonts.values()].map(meta);
    } else if(action==='inspect') {
      value=metadata(await decodeFont(data.bytes));
    } else if(action==='upload') {
      const record={id:data.id,font:await decodeFont(data.bytes),googleFamily:data.googleFamily};
      const info=metadata(record.font);
      if(!info.axes.wght||info.axes.wght.max<=info.axes.wght.min)throw Error('Choose a variable font with a usable wght axis. Static fonts are outside this tool’s scope.');
      const candidates=[...fonts.values()].filter(r=>metadata(r.font).name===info.name&&metadata(r.font).referenceLetters.length>info.referenceLetters.length);
      if(candidates.length) {
        const sig=signature(record.font);
        record.companion=candidates.find(r=>sig&&(r.signature??=signature(r.font))===sig);
      }
      fonts.set(data.id,record);value=meta(record);
    } else if(action==='analyze') {
      const record=fonts.get(data.id);if(!record)throw Error('Please choose a font first.');
      const source=record.companion||record;
      const options={...data.options,prior:corpusPrior(corpus,data.options.axes?.wght??500)};
      const stored=!options.manual&&options.target==='reference'?tableRecipe(corpus,record.googleFamily,options.axes):null;
      if(stored){
        options.manual={...stored.fit};
        const widthAxis=metadata(source.font).axes.wdth;
        if(widthAxis&&options.manual.wdth===undefined)options.manual.wdth=options.axes.wdth??widthAxis.default;
        options.prior={...options.prior,...stored.prior};
      }
      value=analyze(source.font,options);
      value.nativeC2sc=source.font.availableFeatures.includes('c2sc');
      // Independent scaling fit, selected for export only by the scaling toggle.
      const transformKey=JSON.stringify([options.axes,options.target,options.prior]);
      if(source.transformKey!==transformKey){
        const transformed=analyze(source.font,{axes:options.axes,target:options.target,prior:options.prior,renderMode:'transform'});
        source.transformFit=transformed.fit;
        source.transformGlyphs=transformed.glyphs;
        source.transformKey=transformKey;
      }
      const transformManual=data.options.transformManual;
      if(transformManual) {
        const transformed=analyze(source.font,{axes:{...options.axes,...(Number.isFinite(transformManual.wdth)?{wdth:transformManual.wdth}:{})},
          target:options.target,prior:options.prior,renderMode:'transform',manual:transformManual});
        value.transformFit=transformed.fit;
        value.transformGlyphs=transformed.glyphs;
      } else {
        value.transformFit=source.transformFit;
        value.transformGlyphs=source.transformGlyphs;
      }
      value.corpusPrior=options.prior;
      // Replace historical engine wording without changing its research solver.
      value.warnings=value.warnings.map(w=>w.replace('This pilot-corpus prior',`This ${options.prior.families}-family corpus estimate`));
      if(source.font.measuresColorFallback)value.warnings.push('Color font: measurements use its monochrome fallback outlines. Previews retain the original colors; colored layers may differ from the measured outlines.');
      value.referenceFontId=source.id;
      value.calibrationSource=stored?`stored ${stored.family} recipe${stored.interpolated?' (interpolated)':''}`:'live browser fit';
      value.tableRecipe=stored;
      if(stored){
        value.fit.trackingSource='stored corpus recipe';
        value.warnings=value.warnings.filter(w=>!w.startsWith('Estimated proportions:')&&!w.startsWith('Tracking starts at'));
        value.warnings.push('Using the table’s precomputed recipe; Google’s delivered font may differ from the audited full file. Values outside sampled weights or optical sizes use the nearest endpoint.');
      }
      const loaded=metadata(record.font);value.loadedReferenceKind=loaded.referenceKind;value.loadedReferenceLetters=loaded.referenceLetters;
      if(record.companion) {
        value.calibrationSource+=' from matching full font';
        value.warnings.push('References recovered from an already loaded full font after matching name/version, Latin outlines, advances, and axis extremes. Your selected font still supplies the preview.');
      }
    } else throw Error('Unknown operation.');
    self.postMessage({request,value});
  }catch(error){self.postMessage({request,error:error.message});}
}
// Serialize worker jobs so slow decompression cannot race a subsequent fit.
let queue=Promise.resolve();
self.onmessage=event=>{queue=queue.then(()=>handle(event));};
self.addEventListener('unhandledrejection',event=>self.postMessage({fatal:String(event.reason?.message||event.reason)}));
