// Verify real Latin shaping and emit a portable report (no font binaries).
// node scripts/verify-google-audit.mjs /tmp/smallcaps-top300-audit.json research/top500-smcp-audit
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as fontkit from 'fontkit';
import {references} from '../src/engine.js';
const data=JSON.parse(await readFile(process.argv[2],'utf8')),prefix=process.argv[3];
if(!prefix)throw Error('Supply input audit JSON and an output path prefix.');
for(const row of data.rows) {
  if(row.error)continue;
  const bytes=await readFile(row.file);
  if(createHash('sha256').update(bytes).digest('hex')!==row.sha256)throw Error(`Hash mismatch: ${row.family}`);
  if(row.smcpTag){
    const font=fontkit.create(bytes),ref=references(font);
    row.verifiedLatinLetters=ref.kind==='smcp'?Object.keys(ref.refs).join(''):'';row.version=font.version;
  }
  delete row.file;
}
data.retrieved=new Date().toISOString().slice(0,10);
data.scope=`Same popularity snapshot as the top-50 audit, extended to ${data.rows.length}. One full upright regular/variable file per family. No exhaustive upstream or historical-release search. Fontkit verifies actual Latin smcp substitutions.`;
await writeFile(prefix+'.json',JSON.stringify(data,null,2)+'\n');
const found=data.rows.filter(r=>r.verifiedLatinLetters?.length),variable=data.rows.filter(r=>r.axes?.wght),usable=found.filter(r=>r.axes?.wght);
let md=`# Google Fonts top-${data.rows.length} small-cap audit\n\nChecked ${data.retrieved}; same [Google popularity metadata](${data.metadataURL}) snapshot as the top-50 audit. Popularity is a usage proxy, not published raw usage counts; alphabetical tie-break. Repository tree: \`${data.treeSHA}\`.\n\n## Results\n\n- ${found.length}/${data.rows.length} families have verified Latin smcp substitutions.\n- ${variable.length} checked files have a wght axis; ${usable.length} of those have verified smcp.\n- ${usable.filter(r=>r.axes.wdth).length} smcp-positive variable files also have wdth.\n- ${data.rows.filter(r=>r.error).length} unresolved files.\n\nThese are full repository files, not CSS API subsets. Negative results do not rule out upstream or historical support. Separate SC families without smcp do not count as positive. No judgment about design quality or independence of related families is implied. CJK-primary families are tested for Latin substitutions only. File hashes and source URLs are recorded in the JSON.\n\n| Position | Family | Category | wght | wdth range (default) | Latin smcp |\n|---|---|---|---|---|---|\n`;
for(const r of data.rows)md+=`| ${r.rank} | ${r.fontURL?`[${r.family}](${r.fontURL})`:r.family} | ${r.catalogCategory} | ${r.axes?.wght?'Yes':'No'} | ${r.axes?.wdth?`${r.axes.wdth[0]}–${r.axes.wdth[2]} (${r.axes.wdth[1]})`:'—'} | ${r.error?'Unresolved: '+r.error:r.verifiedLatinLetters?.length?`${r.verifiedLatinLetters.length}/26`:'Not found'} |\n`;
await writeFile(prefix+'.md',md);
console.log(JSON.stringify({total:data.rows.length,smcp:found.length,variable:variable.length,variableSmcp:usable.length,
  newVariable:usable.filter(r=>r.rank>50).map(r=>({name:r.family,category:r.catalogCategory,axes:r.axes,letters:r.verifiedLatinLetters.length})),errors:data.rows.filter(r=>r.error)},null,2));
