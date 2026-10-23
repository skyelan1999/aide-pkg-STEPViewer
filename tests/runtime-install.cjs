'use strict';
// Run in a disposable container with HOME=/tmp/home and the engine archive served on loopback.
const fs=require('node:fs'),assert=require('node:assert/strict');
let io;require('/tmp/plugin/index.js').apply({tool(d){io=d.handler;}});
(async()=>{
 const catalogPath='/tmp/plugin/runtime/catalog.json',catalog=JSON.parse(fs.readFileSync(catalogPath)),key=process.platform+'-'+process.arch,expected=catalog[key].sha256;
 for(let attempts=0;;attempts++){try{const r=await fetch(catalog[key].url,{method:'HEAD'});if(r.ok)break;}catch(e){if(attempts>=200)throw e;}if(attempts>=200)throw new Error('Fixture HTTP server did not become ready');await new Promise(r=>setTimeout(r,25));}
 assert.equal((await io({action:'status'})).ready,false);
 await assert.rejects(io({action:'install'}),/确认/);
 catalog[key].sha256='0'.repeat(64);fs.writeFileSync(catalogPath,JSON.stringify(catalog));
 await assert.rejects(io({action:'install',confirm:true}),/摘要/);assert.equal((await io({action:'status'})).ready,false);
 catalog[key].sha256=expected;fs.writeFileSync(catalogPath,JSON.stringify(catalog));delete require.cache[require.resolve(catalogPath)];
 assert.equal((await io({action:'install',confirm:true})).ready,true);
 assert.equal((await io({action:'status'})).ready,true);
 assert.equal((await io({action:'install',confirm:true})).ready,true);
 console.log('PASS explicit runtime download, digest rejection, safe extraction, native import and offline cache reuse');
})().catch(e=>{console.error(e);process.exitCode=1;});
