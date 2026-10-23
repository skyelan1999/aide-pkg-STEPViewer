'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const ROOT=path.join(require('node:os').homedir(),'.cache','aide-step-viewer'),JOBS=path.join(ROOT,'jobs'),ENGINE=path.join(ROOT,'engine');
const LIMIT=384*1048576,CHUNK=48*1024;
function init(){fs.mkdirSync(JOBS,{recursive:true,mode:0o700});}
function job(id){if(!/^[a-f0-9]{48}$/.test(id||''))throw Error('Invalid job');const dir=path.join(JOBS,id);if(!fs.lstatSync(dir).isDirectory()||fs.lstatSync(dir).isSymbolicLink())throw Error('Invalid job');return dir;}
function ready(){return fs.existsSync(path.join(ENGINE,'OCP'))&&fs.existsSync(path.join(ENGINE,'READY'));}
function checkedInt(n,max){if(!Number.isSafeInteger(n)||n<0||n>max)throw Error('Invalid byte range');return n;}
function setupStatus(){try{const s=JSON.parse(fs.readFileSync(path.join(ROOT,'setup.json'),'utf8'));if(s.installing&&Date.now()-fs.statSync(path.join(ROOT,'setup.lock')).mtimeMs>=3700000)return{installing:false,error:'引擎安装已超时，请重试续传'};return s;}catch(_){return{};}}
function install(){
 init();if(ready())return{ready:true};
 const lock=path.join(ROOT,'setup.lock'),state=setupStatus();
 if(fs.existsSync(lock)&&Date.now()-fs.statSync(lock).mtimeMs<3700000)return{...state,ready:false,installing:true};
 try{fs.unlinkSync(lock);}catch(_){}const fd=fs.openSync(lock,'wx',0o600);fs.closeSync(fd);
 fs.writeFileSync(path.join(ROOT,'setup.json'),JSON.stringify({installing:true,phase:'download',loaded:0}),{mode:0o600});
 try{const p=cp.spawn(process.execPath,[path.join(__dirname,'native/runtime-installer.js')],{detached:true,stdio:'ignore',env:process.env});p.unref();}catch(e){fs.unlinkSync(lock);throw e;}
 return{ready:false,installing:true};
}
async function io(a){
 init();if(a.action==='status')return{...setupStatus(),ready:ready(),limit:LIMIT};
 if(a.action==='install'){if(a.confirm!==true)throw Error('请点击安装 CAD 引擎确认下载');return install();}
 if(a.action==='begin'){
  const lock=path.join(ROOT,'admission');try{fs.mkdirSync(lock);}catch(_){if(Date.now()-fs.lstatSync(lock).mtimeMs>10000){fs.rmdirSync(lock);fs.mkdirSync(lock);}else throw Error('STEP 会话正在建立，请稍后重试');}
  try{
  if(!ready())throw Error('请先安装 CAD 引擎');checkedInt(a.size,LIMIT);if(!a.size)throw Error('Empty STEP');
  // One conversion/upload across workspaces; stale jobs expire without touching user files.
  for(const name of fs.readdirSync(JOBS)){if(!/^[a-f0-9]{48}$/.test(name))continue;const d=path.join(JOBS,name);if(Date.now()-fs.statSync(d).mtimeMs>120000){fs.writeFileSync(path.join(d,'cancel'),'');if(!fs.existsSync(path.join(d,'started')))fs.rmSync(d,{recursive:true,force:true});}else if(!fs.existsSync(path.join(d,'done'))&&!fs.existsSync(path.join(d,'cancel')))throw Error('已有 STEP 正在加载，请关闭或等待后重试');}
  const id=crypto.randomBytes(24).toString('hex'),d=path.join(JOBS,id);fs.mkdirSync(d,{mode:0o700});fs.writeFileSync(path.join(d,'size'),String(a.size),{mode:0o600});fs.writeFileSync(path.join(d,'model.step'),'',{mode:0o600});
  const proc=cp.spawn('python3',[path.join(__dirname,'native/job.py'),d,path.join(__dirname,'native/convert.py')],{detached:true,stdio:'ignore',env:{...process.env,PYTHONPATH:ENGINE,LD_LIBRARY_PATH:path.join(ENGINE,'system'),PYTHONUNBUFFERED:'1'}});proc.unref();return{id};
  }finally{fs.rmdirSync(lock);}
 }
 const d=job(a.id);fs.utimesSync(d,new Date(),new Date());
 if(a.action==='cancel'){fs.writeFileSync(path.join(d,'cancel'),'');return{cancelled:true};}
 if(a.action==='write'){
  if(fs.existsSync(path.join(d,'started'))||fs.existsSync(path.join(d,'cancel')))throw Error('Job closed');
  if(typeof a.data!=='string'||a.data.length>CHUNK*4/3||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(a.data))throw Error('Invalid chunk');
  const bytes=Buffer.from(a.data,'base64'),file=path.join(d,'model.step'),offset=checkedInt(a.offset,LIMIT),size=Number(fs.readFileSync(path.join(d,'size'),'utf8'));
  if(offset!==fs.statSync(file).size||!bytes.length||offset+bytes.length>size)throw Error('Invalid upload offset');fs.appendFileSync(file,bytes);return{offset:offset+bytes.length};
 }
 if(a.action==='start'){
  if(fs.statSync(path.join(d,'model.step')).size!==Number(fs.readFileSync(path.join(d,'size'),'utf8')))throw Error('Incomplete upload');
  const fd=fs.openSync(path.join(d,'started'),'wx',0o600);fs.closeSync(fd);
  return{started:true};
 }
 if(a.action==='read'){
  const offset=checkedInt(a.offset,160*1048576),file=path.join(d,'output'),length=fs.existsSync(file)?fs.statSync(file).size:0;if(offset>length)throw Error('Invalid output offset');
  const bytes=Buffer.alloc(Math.min(CHUNK,length-offset));if(bytes.length){const fd=fs.openSync(file,'r');try{fs.readSync(fd,bytes,0,bytes.length,offset);}finally{fs.closeSync(fd);}}
  return{data:bytes.toString('base64'),offset:offset+bytes.length,done:fs.existsSync(path.join(d,'done'))&&offset+bytes.length===length};
 }
 throw Error('Unknown action');
}
module.exports={name:'step-viewer',apply(ctx){ctx.tool({name:'step_preview_io',description:'STEP Viewer 私有只读预览会话。CAD 引擎仅在用户明确点击安装时下载；不修改原始模型。',parameters:{type:'object',properties:{action:{type:'string',enum:['status','install','begin','write','start','read','cancel']},confirm:{type:'boolean'},id:{type:'string'},size:{type:'integer'},offset:{type:'integer'},data:{type:'string'}},required:['action'],additionalProperties:false},scheduling:{resources:[]},handler:io});}};
