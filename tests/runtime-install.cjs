'use strict';
// Run in a disposable container with HOME=/tmp/home and the engine archive served on loopback.
const fs=require('node:fs'),assert=require('node:assert/strict');
let io;require('/tmp/plugin/index.js').apply({tool(d){io=d.handler;}});
(async()=>{
 const catalogPath='/tmp/plugin/runtime/catalog.json',catalog=JSON.parse(fs.readFileSync(catalogPath)),key=process.platform+'-'+process.arch,expected=catalog[key].sha256;
 for(let attempts=0;;attempts++){try{const r=await fetch(catalog[key].url,{method:'HEAD'});if(r.ok)break;}catch(e){if(attempts>=200)throw e;}if(attempts>=200)throw new Error('Fixture HTTP server did not become ready');await new Promise(r=>setTimeout(r,25));}
 async function settled(){for(let i=0;i<2000;i++){const s=await io({action:'status'});if(!s.installing)return s;await new Promise(r=>setTimeout(r,10));}throw Error('Fixture setup deadline exceeded');}
 assert.equal((await io({action:'status'})).ready,false);
 await assert.rejects(io({action:'install'}),/确认/);
 catalog[key].sha256='0'.repeat(64);fs.writeFileSync(catalogPath,JSON.stringify(catalog));
 assert.equal((await io({action:'install',confirm:true})).installing,true);const bad=await settled();assert.match(bad.error,/摘要/);assert.equal(bad.ready,false);
 catalog[key].sha256=expected;fs.writeFileSync(catalogPath,JSON.stringify(catalog));delete require.cache[require.resolve(catalogPath)];
 assert.equal((await io({action:'install',confirm:true})).installing,true);assert.equal((await settled()).ready,true);
 assert.equal((await io({action:'status'})).ready,true);
 assert.equal((await io({action:'install',confirm:true})).ready,true);
 console.log('PASS background runtime download, digest rejection, safe extraction, native import and offline cache reuse');
})().catch(e=>{console.error(e);process.exitCode=1;});
