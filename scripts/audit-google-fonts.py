import argparse,json,re,hashlib,concurrent.futures,urllib.request,urllib.parse
from pathlib import Path
from io import BytesIO
from fontTools.ttLib import TTFont

parser=argparse.ArgumentParser(description="Audit full upright Google font files by popularity; use verify-google-audit.mjs to verify shaping.")
parser.add_argument('--limit',type=int,default=500)
parser.add_argument('--metadata',default='/tmp/smallcaps-google-top50-metadata.json')
parser.add_argument('--tree',default='/tmp/smallcaps-google-tree.json')
parser.add_argument('--cache',default='/tmp/smallcaps-top50-audit')
parser.add_argument('--output',default='/tmp/smallcaps-top500-audit.json')
args=parser.parse_args()
root=Path(args.cache);root.mkdir(parents=True,exist_ok=True)
meta=json.loads(Path(args.metadata).read_text())
tree=json.loads(Path(args.tree).read_text())
assert not tree.get('truncated'), 'Incomplete repository tree'
files=[x['path'] for x in tree['tree'] if x['type']=='blob']
families=sorted(meta['familyMetadataList'],key=lambda f:(f['popularity'],f['family']))[:args.limit]
def fetch(path):
    url='https://raw.githubusercontent.com/google/fonts/main/'+urllib.parse.quote(path)
    return urllib.request.urlopen(url,timeout=50).read(),url
def run(item):
    index,f=item;name=f['family'];slug=re.sub('[^a-z0-9]','',name.lower())
    row={'rank':index+1,'family':name,'popularity':f['popularity'],'catalogAxes':[a['tag'] for a in f['axes']],'catalogCategory':f['category']}
    dirs=[d for d in ['ofl/'+slug,'apache/'+slug,'ufl/'+slug] if d+'/METADATA.pb' in files]
    if not dirs:return dict(row,error='No matching Google repository directory')
    folder=dirs[0]
    try:
        pb,url=fetch(folder+'/METADATA.pb');pb=pb.decode();row['metadataURL']=url
        row['upstream']=re.findall(r'(?:repository_url|source_url):\s*"([^"]+)"',pb)
        blocks=re.findall(r'fonts\s*\{(.*?)\n\}',pb,re.S)
        candidates=[]
        for b in blocks:
            fn=re.search(r'filename:\s*"([^"]+)"',b)
            style=re.search(r'style:\s*"([^"]+)"',b)
            weight=re.search(r'weight:\s*(\d+)',b)
            if fn and style and style[1]=='normal':candidates.append((abs(int(weight[1] if weight else 400)-400),fn[1]))
        if not candidates:return dict(row,error='No upright candidate in metadata')
        filename=sorted(candidates)[0][1]
        local=root/(slug+'.ttf')
        url='https://raw.githubusercontent.com/google/fonts/main/'+urllib.parse.quote(folder+'/'+filename)
        if local.exists():data=local.read_bytes()
        else:
            data,url=fetch(folder+'/'+filename);local.write_bytes(data)
        font=TTFont(BytesIO(data));features=[]
        if 'GSUB' in font and font['GSUB'].table.FeatureList:features=[r.FeatureTag for r in font['GSUB'].table.FeatureList.FeatureRecord]
        row.update(fontURL=url,file=str(local),sha256=hashlib.sha256(data).hexdigest(),smcpTag='smcp' in features,
          axes={a.axisTag:[a.minValue,a.defaultValue,a.maxValue] for a in font['fvar'].axes} if 'fvar' in font else {})
        if 'smcp' in features:
            cmap=font.getBestCmap();gsub=font['GSUB'].table;lookups=[]
            for rec in gsub.FeatureList.FeatureRecord:
                if rec.FeatureTag=='smcp':lookups.extend(rec.Feature.LookupListIndex)
            mapped={}
            for idx in lookups:
                for sub in gsub.LookupList.Lookup[idx].SubTable:
                    if hasattr(sub,'ExtSubTable'):sub=sub.ExtSubTable
                    mapped.update(getattr(sub,'mapping',{}))
            row['directLatinMappings']=''.join(c for c in 'abcdefghijklmnopqrstuvwxyz' if cmap.get(ord(c)) in mapped and mapped[cmap[ord(c)]]!=cmap[ord(c)])
        print(name, 'smcp='+str(row['smcpTag']),','.join(row['axes']),flush=True)
        return row
    except Exception as e:return dict(row,error=str(e))
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:rows=list(ex.map(run,enumerate(families)))
Path(args.output).write_text(json.dumps({'ranking':'popularity ascending; alphabetical tie-break','metadataURL':'https://fonts.google.com/metadata/fonts','treeSHA':tree['sha'],'rows':rows},indent=2))
print(json.dumps({'families':len(rows),'tagged':[r['family'] for r in rows if r.get('smcpTag')],'errors':[r for r in rows if 'error' in r]},indent=2))
