'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'aide-step-lease-test-'));
const jobs=path.join(temporary,'.cache/aide-step-viewer/jobs'),engine=path.join(temporary,'.cache/aide-step-viewer/engine');
fs.mkdirSync(path.join(engine,'OCP'),{recursive:true});fs.writeFileSync(path.join(engine,'READY'),'');
const context={module:{exports:{}},Buffer,process:{env:{}},__dirname:path.resolve(__dirname,'..'),require(name){
 if(name==='node:os')return {homedir:()=>temporary};
 if(name==='node:child_process')return {spawn:()=>({unref(){}})};
 if(name==='./native/limits.json')return require('../native/limits.json');
 return require(name);
}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../index.js'),'utf8'),context);
let io;context.module.exports.apply({tool(spec){io=spec.handler;}});
(async()=>{
 const bytes=Buffer.alloc(64*1024,83);
 const j=await io({action:'begin',size:bytes.length});
 await io({action:'write',id:j.id,offset:0,data:bytes.toString('base64')});
 assert.deepEqual(fs.readFileSync(path.join(jobs,j.id,'model.step')),bytes);
 await assert.rejects(io({action:'write',id:j.id,offset:0,data:'U1RFUA=='}),/offset/);
 await assert.rejects(io({action:'write',id:j.id,offset:bytes.length,data:Buffer.alloc(bytes.length+1).toString('base64')}),/chunk/);
 await assert.rejects(io({action:'write',id:j.id,offset:bytes.length,data:'===='}),/chunk/);
 await io({action:'start',id:j.id});
 await io({action:'cancel',id:j.id});

 const timedOut=await io({action:'begin',size:100});
 const d=path.join(jobs,timedOut.id);
 fs.writeFileSync(path.join(d,'output'),JSON.stringify({error:'STEP 上传取消或超时'})+'\n');
 fs.writeFileSync(path.join(d,'done'),'done');fs.unlinkSync(path.join(d,'model.step'));
 await assert.rejects(io({action:'write',id:timedOut.id,offset:0,data:'U1RFUA=='}),/STEP 上传取消或超时/,'terminal job returns its recorded reason rather than ENOENT');
 await io({action:'cancel',id:timedOut.id});

 const active=await io({action:'begin',size:100});
 const now=Date.now()/1000;fs.utimesSync(path.join(jobs,active.id),now-180,now-180);
 await assert.rejects(io({action:'begin',size:100}),/已有 STEP/,'admission cannot reap a job still within one allowed bridge reply');
 assert.ok(fs.existsSync(path.join(jobs,active.id,'model.step')));
 await io({action:'cancel',id:active.id});
 console.log('PASS upload IO: bounded 64KiB chunks, invalid data/offset rejection, terminal reason, active admission and cancellation');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>fs.rmSync(temporary,{recursive:true,force:true}));
