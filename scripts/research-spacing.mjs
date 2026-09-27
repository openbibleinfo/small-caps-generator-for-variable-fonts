// Offline build step: add shaped-word tracking measurements to Python profiles.
// This processes only the explicitly selected local research font files.
import {readFile,writeFile} from 'node:fs/promises';
import {decodeFont} from '../src/decode.js';
import {analyze} from '../src/engine.js';
const path=process.argv[2]||'research/profiles.json';
const profiles=JSON.parse(await readFile(path,'utf8'));
const trackingPrior=[];
for(const p of profiles.fonts) {
  const font=await decodeFont(await readFile(p.path));
  for(const instance of Object.values(p.instances)) {
    const {weight,scale,width}=instance.fit;
    const r=analyze(font,{axes:instance.axes,target:instance.target,manual:{weight,scale,width}});
    instance.fit.tracking=r.fit.tracking;
    instance.fit.trackingSource=r.fit.trackingSource;
    instance.fit.trackingRange=r.fit.trackingRange;
    if(instance.axes.wght===500&&instance.axes.opsz===p.axes.opsz?.default)trackingPrior.push(r.fit.tracking);
  }
  console.log(`${p.name}: shaped spacing measured`);
}
if(trackingPrior.length&&profiles.prior) {
  trackingPrior.sort((a,b)=>a-b);const middle=Math.floor(trackingPrior.length/2);
  profiles.prior.tracking=trackingPrior.length%2?trackingPrior[middle]:(trackingPrior[middle-1]+trackingPrior[middle])/2;
}
await writeFile(path,JSON.stringify(profiles,null,2)+'\n');
