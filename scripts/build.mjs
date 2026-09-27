// Build-time only. Parser and measurements are embedded; font bytes are never embedded.
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const esbuild=require(process.env.SMALLCAPS_BUILD_MODULES?`${process.env.SMALLCAPS_BUILD_MODULES}/esbuild`:'esbuild');
const moduleRoot=process.env.SMALLCAPS_BUILD_MODULES;
const result=await esbuild.build({entryPoints:['src/worker.js'],bundle:true,write:false,format:'iife',platform:'browser',minify:true,
  nodePaths:moduleRoot?[moduleRoot]:[],define:{'process':'undefined'},
  plugins:[{name:'offline-woff2-adapter',setup(build){
    // Upstream Emscripten wrapper exports Module only in its Node branch.
    // Expose that same object in the browser so its ready callback is wired.
    build.onLoad({filter:/wawoff2[\\/]build[\\/]decompress_binding\.js$/},async args=>{
      let code=await readFile(args.path,'utf8');
      const branch='if(!wasmBinary&&(ENVIRONMENT_IS_WEB||ENVIRONMENT_IS_WORKER))';
      if(!code.includes(branch))throw Error('Review WOFF2 offline adapter after dependency change.');
      // The WASM bytes are already embedded. Skip even the data-URI fetch path.
      code=code.replace(branch,'if(false)');
      return {contents:code+'\nmodule.exports = Module;\n',loader:'js'};
    });
    build.onResolve({filter:/^(fs|path)$/},args=>({path:args.path,namespace:'unused-node'}));
    build.onLoad({filter:/.*/,namespace:'unused-node'},()=>({contents:'export default {};'}));
  }}]});
const corpus=JSON.parse(await readFile('research/corpus.json','utf8'));
const googleCatalog=JSON.parse(await readFile('src/data/google-catalog.json','utf8'));
let licenses='';
const noticeQueue=['fontkit','buffer','tiny-inflate','wawoff2'],seen=new Set();
while(noticeQueue.length) {
  const name=noticeQueue.shift();if(seen.has(name))continue;seen.add(name);
  const dir=moduleRoot?`${moduleRoot}/${name}`:`node_modules/${name}`;
  const p=JSON.parse(await readFile(`${dir}/package.json`,'utf8'));
  noticeQueue.push(...Object.keys(p.dependencies||{}));
  let license;for(const file of ['LICENSE','LICENSE.txt','LICENSE.md','LICENSE-MIT.txt','LICENSE-MIT','license','license.txt']){try{license=await readFile(`${dir}/${file}`,'utf8');break;}catch{}}
  if(!license){let readme='';try{readme=(await readFile(`${dir}/README.md`,'utf8')).split('## License').pop();}catch{}
    license=`Upstream package declares ${p.license}.\n${JSON.stringify({author:p.author,repository:p.repository})}\n${readme}`;}
  licenses+=`${name}\n${license}\n\n`;
}
for(const name of ['WOFF2','Brotli'])licenses+=`${name}\n${await readFile(`licenses/${name}-LICENSE.txt`,'utf8')}\n\n`;
const escape=s=>s.replace(/<\/script/gi,'<\\/script');
const appBundle=await esbuild.build({entryPoints:['src/app.js'],bundle:true,write:false,format:'esm',platform:'browser'});
const awaitableApp=appBundle.outputFiles[0].text;
let html=await readFile('src/app.template.html','utf8');
html=html.replace('<link rel="stylesheet" href="./style.css">',`<style>${await readFile('src/style.css','utf8')}</style>`)
  .replace('  <script type="module" src="./app.js"></script>','');
html=html.replace('</body>',()=>`<script type="application/json" id="boot-data">${JSON.stringify({licenses,googleCatalog,corpus}).replace(/</g,'\\u003c')}</script>\n<script type="text/plain" id="worker-source">${escape(result.outputFiles[0].text)}</script>\n<script type="module">${escape(awaitableApp)}</script>\n</body>`);
await writeFile('index.html',html);

console.log(`Built index.html (${(Buffer.byteLength(html)/1024/1024).toFixed(2)} MB), no embedded font files.`);
