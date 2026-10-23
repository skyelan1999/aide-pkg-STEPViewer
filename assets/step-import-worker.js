let waiting=null, sequence=0;const pendingRPC=new Map();
const report=(phase,values={})=>self.postMessage({kind:'progress',phase,...values});
function rpc(action,args={}){const requestId=++sequence;return new Promise((resolve,reject)=>{pendingRPC.set(requestId,{resolve,reject});self.postMessage({kind:'io',requestId,action,args});});}
function validatedParts(parts, count, stride, registry) {
  if(parts===undefined)return undefined; // Older CAD services remain previewable.
  if(!Array.isArray(parts)||!parts.length||parts.length>16000)throw Error('CAD 零件范围无效。');
  let next=0;for(const p of parts){if(typeof p.id!=='string'||!p.id||p.id.length>128||typeof p.name!=='string'||p.name.length>512||p.start!==next||!Number.isSafeInteger(p.count)||p.count<=0||p.count%stride)throw Error('CAD 零件范围无效。');next+=p.count;if(registry){if(registry.has(p.id)&&registry.get(p.id)!==p.name)throw Error('CAD 零件名称不一致。');registry.set(p.id,p.name);if(registry.size>50000)throw Error('模型超过五万个零件实例预算。');}}
  if(next!==count)throw Error('CAD 零件范围不完整。');return parts;
}
async function importNative(rawUrl) {
  report('initialize');
  await rpc('start');
  let offset=0;
  const response={body:new ReadableStream({async pull(controller){
    try{while(true){const item=await rpc('read',{offset});offset=item.offset;
      if(item.data)controller.enqueue(Uint8Array.from(atob(item.data),c=>c.charCodeAt(0)));
      if(item.done)controller.close();
      if(item.data||item.done)return;
      await new Promise(r=>setTimeout(r,200));
    }}catch(e){controller.error(e);}
  }})};
  if(!response.body?.getReader)throw new Error('当前浏览器不支持 CAD 流式预览。');
  const reader=response.body.getReader(),decoder=new TextDecoder();let pending='',id=0,triangles=0,segments=0,points=0,complete=false;const partNames=new Map();
  const decode=text=>{const raw=atob(text);if(raw.length%4)throw new Error('CAD 网格块格式无效。');const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));return new Float32Array(bytes.buffer);};
  try {
    while(true){
      const {value,done}=await reader.read();pending+=decoder.decode(value||new Uint8Array(),{stream:!done});
      let newline;
      while((newline=pending.indexOf('\n'))>=0){
        const line=pending.slice(0,newline);pending=pending.slice(newline+1);if(!line)continue;
        if(line.length>4*1024*1024)throw new Error('CAD 输出块超过安全预算。');
        const item=JSON.parse(line);if(item.error)throw new Error(item.error);
        if(item.kind==='native-mesh'){
          const p=decode(item.positions),n=decode(item.normals),c=decode(item.colors);
          if(!p.length||p.length%9||p.length!==n.length||p.length!==c.length||!Array.isArray(item.origin)||item.origin.length!==3||!item.origin.every(Number.isFinite)||!p.every(Number.isFinite)||!n.every(Number.isFinite)||!c.every(Number.isFinite))throw new Error('CAD 网格包含无效几何。');
          triangles+=p.length/9;if(triangles>3000000)throw new Error('模型超过预览几何预算。');
          const indices=Uint32Array.from({length:p.length/3},(_,i)=>i),current=id++;
          const acknowledged=new Promise(resolve=>{waiting={id:current,resolve};});
          self.postMessage({kind:'meshes',id:current,meshes:[{attributes:{position:{array:p},normal:{array:n},color:{array:c}},index:{array:indices},origin:item.origin,sourceCount:item.sourceCount,parts:validatedParts(item.parts,indices.length,3,partNames)}],total:0},[p.buffer,n.buffer,c.buffer,indices.buffer]);
          await acknowledged;
        } else if(item.kind==='native-lines'||item.kind==='native-points'){
          const p=decode(item.positions),c=decode(item.colors),isLine=item.kind==='native-lines',stride=isLine?6:3;
          if(!p.length||p.length%stride||p.length!==c.length||!Array.isArray(item.origin)||item.origin.length!==3||!item.origin.every(Number.isFinite)||!p.every(Number.isFinite)||!c.every(Number.isFinite))throw new Error('CAD 网格包含无效几何。');
          if(isLine)segments+=p.length/6;else points+=p.length/3;
          if(segments>500000||points>200000)throw new Error('模型超过预览几何预算。');
          const current=id++,acknowledged=new Promise(resolve=>{waiting={id:current,resolve};});
          self.postMessage({kind:'meshes',id:current,meshes:[{primitive:isLine?'lines':'points',attributes:{position:{array:p},color:{array:c}},origin:item.origin,sourceCount:item.sourceCount,parts:validatedParts(item.parts,p.length/3,isLine?2:1,partNames)}],total:0},[p.buffer,c.buffer]);
          await acknowledged;
        } else if(item.kind==='complete'){
          if(complete||!(triangles||segments||points)||item.triangles!==triangles||(item.segments||0)!==segments||(item.points||0)!==points||item.unit!=='mm')throw new Error('CAD 曲面转换未完整结束。');
          complete=true;self.postMessage({...item,coarse:false});
        } else if(item.kind==='progress')self.postMessage({...item,engine:'occt-native'});
      }
      if(pending.length>4*1024*1024)throw new Error('CAD 输出块超过安全预算。');
      if(done)break;
    }
    if(pending.trim()||!complete)throw new Error('CAD 曲面转换未完整结束。');
  } finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
  return true;
}

self.onmessage=async({data})=>{
 if(data.kind==='io-result'){const p=pendingRPC.get(data.requestId);if(p){pendingRPC.delete(data.requestId);data.error?p.reject(Error(data.error)):p.resolve(data.result);}return;}
 if(data.kind==='ack'){if(waiting&&waiting.id===data.id){waiting.resolve();waiting=null;}return;}
 try{await importNative();}catch(e){self.postMessage({error:e.message});}
};
