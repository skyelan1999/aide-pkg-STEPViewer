'use strict';
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const floats=x=>Buffer.from(new Float32Array(x).buffer).toString('base64');
const wire=JSON.stringify({kind:'native-mesh',positions:floats([0,0,0,1,0,0,0,1,0]),normals:floats([0,0,1,0,0,1,0,0,1]),colors:floats([1,0,0,1,0,0,1,0,0]),origin:[0,0,0],sourceCount:1})+'\n'+JSON.stringify({kind:'complete',triangles:1,segments:0,points:0,unit:'mm'})+'\n';
let reads=0,finished=false;const timer=setTimeout(()=>{assert.ok(finished,'empty first poll must not deadlock the stream');},2000);
const self={postMessage(data){queueMicrotask(()=>{
 if(data.kind==='io'){const result=data.action==='start'?{started:true}:++reads===1?{data:'',offset:0,done:false}:{data:Buffer.from(wire).toString('base64'),offset:Buffer.byteLength(wire),done:true};self.onmessage({data:{kind:'io-result',requestId:data.requestId,result}});}
 if(data.kind==='meshes')self.onmessage({data:{kind:'ack',id:data.id}});
 if(data.error)throw Error(data.error);
 if(data.kind==='complete'){finished=true;assert.equal(reads,2);clearTimeout(timer);console.log('PASS native worker empty-first-poll retry, mesh acknowledgement and complete');}
});}};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../assets/step-import-worker.js'),'utf8'),{self,ReadableStream,TextDecoder,atob,setTimeout});self.onmessage({data:{native:true}});
