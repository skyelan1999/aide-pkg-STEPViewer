'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../viewer.html'),'utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
const code=scripts.find(x=>x.includes("const client=AideWorkbenchClient.create('step-viewer')"));
assert.ok(code,'viewer transport entry exists');

async function fixture(){
 let source=Buffer.from('initial STEP bytes'),options,resolveReady,jobId=0;
 const readSizes=[];
 const ready=new Promise(resolve=>resolveReady=resolve),workers=[],jobs=new Map(),elements=new Map();
 const client={connect:async()=>({}),onEvent(){},
  documentInfo:async()=>({result:{size:source.length,path:'model.step'}}),
  pluginAssetInfo:async()=>({result:{size:1}}),readPluginAsset:async()=>({result:{data:'AA=='}}),
  readDocument:async({offset,length})=>{readSizes.push(length);const data=source.subarray(offset,offset+length);return {result:{size:source.length,offset,length:data.length,data:data.toString('base64')}};},
  call:async(tool,args)=>{
   assert.equal(tool,'step_preview_io');let result;
   if(args.action==='status')result={ready:true};
   else if(args.action==='begin'){const id='job_'+(++jobId);jobs.set(id,{size:args.size,bytes:Buffer.alloc(0),started:false});result={id};}
   else if(args.action==='write'){const j=jobs.get(args.id);assert.equal(args.offset,j.bytes.length);assert.ok(JSON.stringify({protocol:1,requestId:'r_123456789',method:'tool.call',tool,arguments:args,attachments:[]}).length<131072,'respect both the parent request envelope and Linux plugin argv limit');const chunk=Buffer.from(args.data,'base64');assert.ok(chunk.length<=65536);j.bytes=Buffer.concat([j.bytes,chunk]);result={received:j.bytes.length};}
   else if(args.action==='start'){const j=jobs.get(args.id);assert.equal(j.bytes.length,j.size,'converter starts only after complete upload');j.started=true;result={started:true};}
   else if(args.action==='cancel')result={cancelled:true};
   else throw Error('unexpected IO action '+args.action);
   return {result};
  }};
 class Worker{constructor(){this.sent=[];workers.push(this);}postMessage(m){this.sent.push(m);}terminate(){}}
 const document={getElementById(id){if(!elements.has(id))elements.set(id,{});return elements.get(id);},
  createElement(){return {};},head:{append(s){queueMicrotask(()=>s.onload());},appendChild(s){queueMicrotask(()=>s.onload());}}};
 const context={AideWorkbenchClient:{create:()=>client},document,window:{addEventListener(){}},URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},Blob,Uint8Array,Worker,
  AideStepTheme:{connect:()=>()=>{}},AideStepPreview:{setup:async o=>{options=o;resolveReady();}},atob:s=>Buffer.from(s,'base64').toString('binary'),btoa:s=>Buffer.from(s,'binary').toString('base64'),setTimeout,clearTimeout,console};
 vm.runInNewContext(code,context,{filename:'viewer-transport.js'});await ready;
 async function upload(){
  const wrapper=options.createWorker();const worker=workers.at(-1);
  await worker.onmessage({data:{kind:'io',action:'start',requestId:'upload'}});
  return {wrapper,result:worker.sent.at(-1),job:[...jobs.values()].at(-1)};
 }
 return {upload,setSource:b=>source=Buffer.from(b),getSource:()=>source,client,jobs,readSizes};
}
(async()=>{
 const f=await fixture();let r=await f.upload();assert.equal(r.result.error,undefined);assert.equal(r.job.started,true);assert.deepEqual(r.job.bytes,f.getSource());
 // A generator replaces the source after initial setup. Retry reuses the existing
 // worker factory; its document capability stays bound to the same selected path.
 f.setSource('short');r=await f.upload();assert.equal(r.result.error,undefined,'retry must refresh metadata after the selected file shrinks');
 assert.equal(r.job.started,true);assert.equal(r.job.size,5);assert.deepEqual(r.job.bytes,Buffer.from('short'));
 f.setSource(Buffer.alloc(150000,83));r=await f.upload();assert.equal(r.result.error,undefined,'retry must refresh metadata after source growth');
 assert.equal(r.job.started,true);assert.deepEqual(r.job.bytes,f.getSource());
 f.setSource(Buffer.alloc(1200000,83));const previousReads=f.readSizes.length;r=await f.upload();
 assert.equal(r.result.error,undefined);assert.deepEqual(r.job.bytes,f.getSource());
 assert.equal(f.readSizes.length-previousReads,3,'bound bridge round trips with 512KiB chunks');
 assert.ok(f.readSizes.slice(previousReads).every(n=>n<=524288));
 const originalRead=f.client.readDocument;
 f.client.readDocument=async args=>{const out=await originalRead(args);if(args.offset===0)out.result.size++;return out;};
 r=await f.upload();assert.match(r.result.error,/文件.*变化|changed/i,'reject changed-size chunks before starting conversion');assert.equal(r.job.started,false);
 f.client.readDocument=async args=>({result:{offset:args.offset,size:f.getSource().length,length:0,data:''}});
 r=await f.upload();assert.match(r.result.error,/中断|empty|incomplete/i);assert.equal(r.job.started,false);
 console.log('PASS viewer upload: refresh smaller/larger source on retry; reject changed-size and empty chunks; complete bytes only');
})().catch(error=>{console.error(error);process.exitCode=1;});
