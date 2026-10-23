'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let handler;require('../index.js').apply({tool(d){handler=d.handler;}});
(async()=>{
 assert.equal((await handler({action:'status'})).ready,true);
 const input=fs.readFileSync(process.argv[2]),begin=await handler({action:'begin',size:input.length});
 await assert.rejects(handler({action:'begin',size:input.length}),/已有/);
 await assert.rejects(handler({action:'write',id:begin.id,offset:1,data:input.subarray(0,10).toString('base64')}),/offset/);
 await assert.rejects(handler({action:'read',id:'../escape',offset:0}),/Invalid/);
 for(let offset=0;offset<input.length;offset+=49152)await handler({action:'write',id:begin.id,offset,data:input.subarray(offset,offset+49152).toString('base64')});
 await handler({action:'start',id:begin.id});
 let offset=0,wire='',done=false;const deadline=Date.now()+60000;
 while(!done){const item=await handler({action:'read',id:begin.id,offset});offset=item.offset;wire+=Buffer.from(item.data,'base64');done=item.done;if(Date.now()>deadline)throw Error('timeout');if(!done)await new Promise(r=>setTimeout(r,100));}
 const items=wire.trim().split('\n').map(JSON.parse);assert.ok(items.every(x=>!x.error),wire);const complete=items.at(-1);assert.equal(complete.kind,'complete');assert.equal(complete.unit,'mm');assert.ok(complete.triangles>0);assert.ok(items.some(x=>x.kind==='native-mesh'));
 await handler({action:'cancel',id:begin.id});
 const next=await handler({action:'begin',size:input.length});await handler({action:'cancel',id:next.id});
 console.log(JSON.stringify({status:'PASS',checks:['native upload/convert/paged output','bad offset rejected','job path traversal rejected','competing admission rejected','cancellation/reopen'],complete}));
})().catch(e=>{console.error(e);process.exitCode=1;});
