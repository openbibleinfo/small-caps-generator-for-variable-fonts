// Refresh with: node scripts/google-catalog.mjs [downloaded metadata JSON]
import {readFile,writeFile} from 'node:fs/promises';
const data=process.argv[2]?JSON.parse(await readFile(process.argv[2],'utf8')):
  await (await fetch('https://fonts.google.com/metadata/fonts')).json();
const families=data.familyMetadataList.filter(f=>f.subsets.includes('latin')&&f.fonts['400']&&f.axes.some(a=>a.tag==='wght'&&a.max>a.min))
  .sort((a,b)=>a.family.localeCompare(b.family)).map(f=>({name:f.family,
    axes:f.axes.filter(a=>['wght','wdth','opsz'].includes(a.tag)).map(a=>[a.tag,a.min,a.max])}));
await writeFile('src/data/google-catalog.json',JSON.stringify({source:'https://fonts.google.com/metadata/fonts',date:new Date().toISOString().slice(0,10),families}));
console.log(`Saved ${families.length} variable Latin families with upright regular faces and wght axes.`);
