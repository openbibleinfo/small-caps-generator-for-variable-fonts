export const sharedSelects={
  target:['reference','xheight'], 'width-method':['auto','unscaled','transform'],
  'initial-mode':['smcp','c2sc'], 'optical-policy':['pinned','linked'],
  'export-target':['web','typst','latex'], 'corpus-cohort':['all','top500','top300','top200','top100','top50'],
  'corpus-measure':['width','widthError','weightChange','tracking','stroke'],
  'corpus-weight':['400','500','700'], 'corpus-opsz':['default','min','max']
};
export const sharedNumbers=['gap','size','reading-size'];
const lines=['all-caps','naive','calibrated','transformed','native'];
export function readShareState(raw) {
  if(!raw)return null;
  if(raw.length>100000)throw Error('The shared settings link is too large.');
  let input;try {input=JSON.parse(raw);}catch {throw Error('The shared settings link is invalid.');}
  if(!input||input.v!==1)throw Error('Unsupported shared settings version.');
  const state={v:1,selects:{},numbers:{},axes:{},overrides:{},visible:lines};
  const source=input.source;
  if(!source||!['google','url','local','file'].includes(source.kind)||typeof source.value!=='string'||source.value.length>4096)throw Error('Invalid shared font source.');
  if(source.kind==='url'){
    const url=new URL(source.value);
    if(url.protocol!=='https:'||url.username||url.password)throw Error('Shared font URLs must use HTTPS without credentials.');
  }
  state.source={kind:source.kind,value:source.value};
  for(const [id,allowed] of Object.entries(sharedSelects))if(allowed.includes(input.selects?.[id]))state.selects[id]=input.selects[id];
  for(const id of sharedNumbers)if(Number.isFinite(input.numbers?.[id]))state.numbers[id]=input.numbers[id];
  for(const [tag,value] of Object.entries(input.axes||{}))if(/^[a-zA-Z0-9]{4}$/.test(tag)&&Number.isFinite(value))state.axes[tag]=value;
  for(const id of ['scale','weight','width','tracking'])if(Number.isFinite(input.overrides?.[id]))state.overrides[id]=input.overrides[id];
  if(typeof input.sample==='string'){
    if(input.sample.length>20000)throw Error('The shared sample text is too long.');
    state.sample=input.sample;
  }
  if(Array.isArray(input.visible))state.visible=lines.filter(id=>input.visible.includes(id));
  if(Array.isArray(input.overlay)&&input.overlay.length===2&&input.overlay.every(id=>lines.includes(id))&&input.overlay[0]!==input.overlay[1])state.overlay=input.overlay;
  if(['unscaled','precomputed','javascript','none','builtin'].includes(input.recipe))state.recipe=input.recipe;
  state.numbersVisible=input.numbersVisible!==false;
  state.exportOpen=input.exportOpen===true;
  state.view=input.view==='research'?'research':'preview';
  return state;
}
// Readable URL parameters. The legacy JSON parameter remains readable.
const selectParams={target:'target','width-method':'method','initial-mode':'initial','optical-policy':'optical','export-target':'export','corpus-cohort':'cohort','corpus-measure':'measure','corpus-weight':'research-weight','corpus-opsz':'research-opsz'};
const numberParams={gap:'gap',size:'size','reading-size':'font-size'};
const defaults={target:'reference','width-method':'auto','initial-mode':'smcp','optical-policy':'pinned','export-target':'web','corpus-cohort':'all','corpus-measure':'width','corpus-weight':'500','corpus-opsz':'default',gap:0,size:48,'reading-size':18};
const defaultSample='The LORD is my shepherd';
export function readShareURL(base) {
  const params=new URL(base).searchParams;
  if(params.has('settings'))return readShareState(params.get('settings'));
  if(!params.has('font'))return null;
  const font=params.get('font');
  const state={v:1,source:{kind:/^https:/i.test(font)?'url':'google',value:font},selects:{},numbers:{},axes:{},overrides:{}};
  for(const [id,param] of Object.entries(selectParams))state.selects[id]=params.get(param)??defaults[id];
  for(const [id,param] of Object.entries(numberParams))state.numbers[id]=params.has(param)?Number(params.get(param)):defaults[id];
  for(const id of ['scale','weight','width','tracking'])if(params.has(id))state.overrides[id]=Number(params.get(id));
  for(const [key,value] of params)if(/^[a-zA-Z0-9]{4}$/.test(key)&&!['font','size','text','view','code'].includes(key))state.axes[key]=Number(value);
  state.sample=params.get('text')??defaultSample;
  if(params.has('lines'))state.visible=params.get('lines').split(',');
  if(params.has('overlay'))state.overlay=params.get('overlay').split(',');
  state.recipe=params.get('recipe');state.numbersVisible=params.get('numbers')!=='0';
  state.exportOpen=params.get('code')==='1';state.view=params.get('view');
  return readShareState(JSON.stringify(state));
}
export function shareURL(base,input) {
  const state=readShareState(JSON.stringify(input));
  const url=new URL(base);url.search='';url.hash='';
  const params=url.searchParams;
  params.set('font',state.source.value);
  for(const [id,param] of Object.entries(selectParams))if(state.selects[id]!==undefined&&state.selects[id]!==defaults[id])params.set(param,state.selects[id]);
  for(const [id,param] of Object.entries(numberParams))if(state.numbers[id]!==undefined&&state.numbers[id]!==defaults[id])params.set(param,state.numbers[id]);
  for(const [tag,value] of Object.entries(state.axes))params.set(tag,value);
  for(const [id,value] of Object.entries(state.overrides))params.set(id,value);
  if(state.sample!==undefined&&state.sample!==defaultSample)params.set('text',state.sample);
  if(state.visible.length!==lines.length)params.set('lines',state.visible.join(','));
  if(state.overlay)params.set('overlay',state.overlay.join(','));
  if(state.recipe&&!['unscaled','precomputed'].includes(state.recipe))params.set('recipe',state.recipe);
  if(!state.numbersVisible)params.set('numbers','0');
  if(state.exportOpen)params.set('code','1');
  if(state.view==='research')params.set('view','research');
  return url.href;
}
