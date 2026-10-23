"use strict";
// Standalone, bounded background setup; no model file is accessed here.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const ROOT=path.join(require('node:os').homedir(),'.cache','aide-step-viewer'),ENGINE=path.join(ROOT,'engine'),archive=path.join(ROOT,'engine-download.part'),lock=path.join(ROOT,'setup.lock');
const entry=require('../runtime/catalog.json')[process.platform+'-'+process.arch];
function state(data){const p=path.join(ROOT,'setup.json');fs.writeFileSync(p+'.tmp',JSON.stringify({updated:Date.now(),...data}),{mode:0o600});fs.renameSync(p+'.tmp',p);}
async function download(){
 const deadline=Date.now()+3600000;let retries=0;
 while(true){
  if(Date.now()>=deadline)throw Error('引擎下载超过 60 分钟，请重试续传');
  let offset=fs.existsSync(archive)?fs.statSync(archive).size:0;if(offset>entry.bytes){fs.unlinkSync(archive);offset=0;}if(offset===entry.bytes)return;
  const idle=new AbortController();let last=Date.now(),timer=setInterval(()=>{if(Date.now()-last>60000)idle.abort();},1000);
  try{
   const response=await fetch(entry.url,{headers:offset?{Range:'bytes='+offset+'-'}:{},signal:AbortSignal.any([idle.signal,AbortSignal.timeout(Math.max(1,deadline-Date.now()))])});
   if(!response.ok)throw Error('引擎下载 HTTP '+response.status);
   if(response.status===206){const m=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range')||'');if(!m||Number(m[1])!==offset||Number(m[3])!==entry.bytes)throw Error('Invalid resumed engine range');}
   else if(response.status===200){offset=0;}else throw Error('Invalid engine response');
   const fd=fs.openSync(archive,offset?'a':'w',0o600);let saved=0;
   try{for await(const chunk of response.body){last=Date.now();offset+=chunk.length;if(offset>entry.bytes)throw Error('引擎大小异常');fs.writeFileSync(fd,chunk);if(Date.now()-saved>1000){state({installing:true,phase:'download',loaded:offset,total:entry.bytes});saved=Date.now();}}}finally{fs.closeSync(fd);}
   if(offset!==entry.bytes)throw Error('引擎下载中断');return;
  }catch(e){if(++retries>=5)throw e;state({installing:true,phase:'retry',loaded:fs.existsSync(archive)?fs.statSync(archive).size:0,total:entry.bytes});await new Promise(r=>setTimeout(r,Math.min(retries*1000,5000)));}finally{clearInterval(timer);}
 }
}
(async()=>{
 let tmp='';try{
  if(!entry)throw Error('当前平台暂无 CAD 引擎，请使用 Linux ARM64/AMD64 Aide 容器。');
  await download();state({installing:true,phase:'verify',loaded:entry.bytes,total:entry.bytes});
  const hash=crypto.createHash('sha256');for await(const block of fs.createReadStream(archive))hash.update(block);
  if(hash.digest('hex')!==entry.sha256){fs.unlinkSync(archive);throw Error('引擎摘要验证失败，请重试');}
  tmp=fs.mkdtempSync(path.join(ROOT,'install-'));const output=path.join(tmp,'engine');fs.mkdirSync(output);
  cp.execFileSync('python3',[path.join(__dirname,'install.py'),archive,output],{timeout:30000,stdio:'pipe'});
  cp.execFileSync('python3',['-c','from OCP.STEPCAFControl import STEPCAFControl_Reader; import OCP; assert OCP.__version__=="8.0.1.1"'],{env:{...process.env,PYTHONPATH:output,LD_LIBRARY_PATH:path.join(output,'system')},timeout:30000,stdio:'pipe'});
  fs.writeFileSync(path.join(output,'READY'),entry.sha256,{mode:0o600});
  try{fs.renameSync(output,ENGINE);}catch(e){if(!fs.existsSync(path.join(ENGINE,'READY')))throw e;}
  fs.unlinkSync(archive);state({installing:false,phase:'complete'});
 }catch(e){state({installing:false,phase:'error',error:e.message});process.exitCode=1;}finally{if(tmp)fs.rmSync(tmp,{recursive:true,force:true});try{fs.unlinkSync(lock);}catch(_){}}
})();
