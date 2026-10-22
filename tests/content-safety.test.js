const test=require('node:test'),assert=require('node:assert/strict');
const {createHandler,verdict}=require('../cloudfunctions/contentSafety/handler');
const safety=require('../miniprogram/utils/content-safety');
const image={kind:'image',base64:Buffer.from([255,216,255,217]).toString('base64')};
function handler(result,context={OPENID:'real-user',APPID:'wx01334577ba7ffaf5'}){
 const calls=[];
 const api=async args=>{calls.push(args);if(result instanceof Error)throw result;return result;};
 return {run:createHandler({getWXContext:()=>context,openapi:{security:{mediaCheckAsync:api,msgSecCheck:api}}},()=>{},{WECHAT_CALLBACK_TOKEN:'configured',WECHAT_CALLBACK_AES_KEY:'configured'}),calls};
}
test('text requires pass suggestion and server-derived identity; review is blocked',async()=>{
 const h=handler({errCode:0,result:{suggest:'pass'}});
 assert.equal((await h.run({kind:'text',text:'旅行',openid:'forged'})).status,'pass');
 assert.deepEqual(h.calls[0],{openid:'real-user',scene:4,version:2,content:'旅行'});
 for(const suggest of ['review','risky'])assert.equal((await handler({errCode:0,result:{suggest}}).run({kind:'text',text:'x'})).status,'blocked');
 assert.equal((await handler({errCode:0}).run({kind:'text',text:'x'})).status,'unavailable');
});
test('missing authentication, invalid images and oversized text never reach API',async()=>{
 const h=handler({errCode:0});
 for(const event of [{kind:'image',base64:'a'.repeat(1400001)},{kind:'image',base64:'YWJj'},{kind:'text',text:'x'.repeat(2001)},{kind:'image',fileID:'untrusted'},null])assert.equal((await h.run(event)).status,'unavailable');
 assert.equal(h.calls.length,0);
 assert.equal((await handler({errCode:0},{}).run(image)).status,'unavailable');
});
test('client only accepts explicit pass; raw provider errors are not exposed',async()=>{
 for(const result of [null,{}, {status:'unavailable'},{status:'blocked'}]){
  global.wx={showLoading(){},hideLoading(){},getStorageSync:()=>true,cloud:{callFunction:async()=>({result})}};
  await assert.rejects(safety.text('hello'),e=>e.safety===(result&&result.status==='blocked'?'blocked':'unavailable')&&e.message==='Content safety');
 }
 global.wx={showLoading(){},hideLoading(){},getStorageSync:()=>true,cloud:{callFunction:async()=>({result:{status:'pass'}})}};
 await safety.text('hello');
});
test('declining consent prevents cloud calls',async()=>{
 let requested=false;
 global.wx={showLoading(){},hideLoading(){},getStorageSync:()=>false,showModal:o=>o.success({confirm:false}),cloud:{callFunction:async()=>{requested=true;}}};
 await assert.rejects(safety.text('hello'),e=>e.safety==='cancel');assert.equal(requested,false);
});
test('cloud timeout blocks operation even if late response passes',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let resolve;
 global.wx={showLoading(){},hideLoading(){},getStorageSync:()=>true,cloud:{callFunction:()=>new Promise(r=>resolve=r)}};
 const promise=safety.text('hello');const rejected=assert.rejects(promise,e=>e.safety==='unavailable');
 await new Promise(resolve=>setImmediate(resolve));t.mock.timers.tick(25001);await rejected;
 resolve({result:{status:'pass'}});
});
test('temporary detection image is removed even on rejection',async()=>{
 let removed;
 global.wx={showLoading(){},hideLoading(){},getStorageSync:()=>true,canvasToTempFilePath:o=>o.success({tempFilePath:'/temp.jpg'}),getFileSystemManager:()=>({readFile:o=>o.success({data:image.base64}),unlink:o=>{removed=o.filePath;}}),cloud:{callFunction:async()=>({result:{status:'blocked'}})}};
 await assert.rejects(safety.image({width:100,height:100}),e=>e.safety==='blocked');assert.equal(removed,'/temp.jpg');
});

test('verdict does not treat successful submission or malformed results as approval',()=>{
 for(const result of [null,undefined,{}, {errCode:''},{errCode:0},{errCode:0,traceId:'a'},{errCode:500},new Error()])assert.equal(verdict(result),'unavailable');
 assert.equal(verdict({errcode:0,result:{suggest:'pass'}}),'pass');
 assert.equal(verdict({errcode:0,result:{suggest:'review'}}),'blocked');
});
const crypto=require('crypto'),{verify}=require('../cloudfunctions/contentSafety/callback');
const appid='wx01334577ba7ffaf5';
const env={WECHAT_CALLBACK_TOKEN:'test-token-only',WECHAT_CALLBACK_AES_KEY:Buffer.alloc(32,7).toString('base64').slice(0,-1)};
function callback(message,overrides={}){
 const key=Buffer.from(env.WECHAT_CALLBACK_AES_KEY+'=','base64'),body=Buffer.from(JSON.stringify(message)),length=Buffer.alloc(4);length.writeUInt32BE(body.length);
 const data=Buffer.concat([Buffer.alloc(16),length,body,Buffer.from(appid)]),pad=32-data.length%32;
 const cipher=crypto.createCipheriv('aes-256-cbc',key,key.subarray(0,16));cipher.setAutoPadding(false);
 const Encrypt=Buffer.concat([cipher.update(Buffer.concat([data,Buffer.alloc(pad,pad)])),cipher.final()]).toString('base64');
 const timestamp=String(Math.floor(Date.now()/1000)),nonce='nonce';
 const msg_signature=crypto.createHash('sha1').update([env.WECHAT_CALLBACK_TOKEN,timestamp,nonce,Encrypt].sort().join('')).digest('hex');
 return {httpMethod:'POST',queryStringParameters:{timestamp,nonce,msg_signature},body:JSON.stringify({Encrypt}),...overrides};
}
const message={appid,MsgType:'event',Event:'wxa_media_check',version:2,trace_id:'trace-1',errcode:0,result:{suggest:'pass'}};
test('callback requires authenticated encrypted body, matching app and fresh timestamp',()=>{
 assert.deepEqual(verify(callback(message),env).message,message);
 assert.throws(()=>verify(callback({...message,appid:'wrong'}),env));
 assert.throws(()=>verify(callback(message,{body:JSON.stringify(message)}),env));
 const forged=callback(message);forged.queryStringParameters.msg_signature='0'.repeat(40);assert.throws(()=>verify(forged,env));
 assert.throws(()=>verify(callback(message),env,Date.now()+3600000));
});
function memoryCloud(){
 const collections=new Map(),files=new Set();let owner='user';
 const collection=name=>{
  if(!collections.has(name))collections.set(name,new Map());const rows=collections.get(name);
  return {
   doc:id=>({async get(){if(!rows.has(id))throw new Error('document does not exist');return {data:{...rows.get(id)}};},async set({data}){rows.set(id,{...data,_id:id});},async update({data}){if(!rows.has(id))throw new Error('document does not exist');rows.set(id,{...rows.get(id),...data});},async remove(){rows.delete(id);}}),
   async add({data}){if(rows.has(data._id))throw new Error('duplicate');rows.set(data._id,{...data});},
   where:query=>{const selected=()=>[...rows.values()].filter(r=>Object.entries(query).every(([k,v])=>v.lt!==undefined?r[k]<v.lt:r[k]===v));const q={limit(){return q;},async get(){return {data:selected()};},async remove(){for(const r of selected())rows.delete(r._id);}};return q;}
  };
 };
 const cloud={getWXContext:()=>({OPENID:owner,APPID:appid}),database:()=>({collection,command:{lt:value=>({lt:value})}}),uploadFile:async()=>{files.add('cloud://test');return {fileID:'cloud://test'};},getTempFileURL:async()=>({fileList:[{tempFileURL:'https://temporary.example/image.jpg'}]}),deleteFile:async({fileList})=>{for(const f of fileList)files.delete(f);return {fileList:fileList.map(fileID=>({fileID,status:0}))};},openapi:{security:{mediaCheckAsync:async()=>({errCode:0,traceId:'trace-1'})}}};
 return {cloud,files,collections,setOwner:v=>owner=v};
}
test('async submission remains pending until trusted callback; jobs are owner-scoped',async()=>{
 const m=memoryCloud(),run=createHandler(m.cloud,()=>{},env);
 const start=await run(image);assert.equal(start.status,'pending');assert.equal(m.files.size,1);
 assert.deepEqual(await run({kind:'poll',id:start.id}),{status:'pending'});
 m.setOwner('attacker');assert.equal((await run({kind:'poll',id:start.id})).status,'unavailable');m.setOwner('user');
 assert.equal((await run({kind:'callback',...message})).status,'unavailable');
 assert.equal((await run(callback(message))).statusCode,200);
 // A duplicate cannot replace the first authenticated outcome.
 await run(callback({...message,result:{suggest:'risky'}}));
 assert.equal((await run({kind:'poll',id:start.id})).status,'pass');assert.equal(m.files.size,0);
});
test('early callback is retained, review blocks, and expired jobs are cleaned',async()=>{
 const m=memoryCloud(),run=createHandler(m.cloud,()=>{},env);
 await run(callback({...message,result:{suggest:'review'}}));
 const start=await run(image);assert.equal((await run({kind:'poll',id:start.id})).status,'blocked');
 const row=m.collections.get('content_safety_jobs').get(start.id);row.expiresAt=0;row.fileID='cloud://test';m.files.add(row.fileID);
 assert.equal((await run({kind:'poll',id:start.id})).status,'unavailable');
 m.setOwner(undefined);assert.equal((await run({Type:'Timer'})).status,'cleaned');assert.equal(m.files.size,0);assert.equal(m.collections.get('content_safety_jobs').size,0);
});

test('client polls pending image instead of treating submission as pass',async()=>{
 const kinds=[];let removed;
 global.wx={showLoading(){},hideLoading(){},getStorageSync:()=>true,canvasToTempFilePath:o=>o.success({tempFilePath:'/async.jpg'}),getFileSystemManager:()=>({readFile:o=>o.success({data:image.base64}),unlink:o=>removed=o.filePath}),cloud:{callFunction:async({data})=>{kinds.push(data.kind);return {result:data.kind==='image'?{status:'pending',id:'job'}:{status:'pass'}};}}};
 await safety.image({width:10,height:10});assert.deepEqual(kinds,['image','poll']);assert.equal(removed,'/async.jpg');
});
test('plain or forged callback cannot publish a result',async()=>{
 const m=memoryCloud(),run=createHandler(m.cloud,()=>{},env),job=await run(image);
 const response=await run({httpMethod:'POST',body:JSON.stringify(message),queryStringParameters:{}});
 assert.equal(response.statusCode,403);assert.equal((await run({kind:'poll',id:job.id})).status,'pending');
});

test('early image rejection logs configuration presence without secrets or image data',async()=>{
 const m=memoryCloud(),logs=[],run=createHandler(m.cloud,(...args)=>logs.push(args),{WECHAT_CALLBACK_TOKEN:'private-token'});
 assert.equal((await run(image)).status,'unavailable');
 assert.deepEqual(logs[0][1],{reason:'callback_configuration',hasToken:true,hasAesKey:false,aesKeyLength:0});
 assert(!JSON.stringify(logs).includes('private-token'));assert(!JSON.stringify(logs).includes(image.base64));
 const identity=[];m.setOwner(undefined);
 assert.equal((await createHandler(m.cloud,(...args)=>identity.push(args),env)(image)).status,'unavailable');
 assert.equal(identity[0][1].reason,'caller_identity');assert.equal(identity[0][1].hasOpenid,false);
});

test('URL verification echoes valid challenge without requiring AES key; POST still requires AES',()=>{
 const timestamp=String(Math.floor(Date.now()/1000)),nonce='verification',echostr='wx-url-test';
 const signature=crypto.createHash('sha1').update([env.WECHAT_CALLBACK_TOKEN,timestamp,nonce].sort().join('')).digest('hex');
 const tokenOnly={WECHAT_CALLBACK_TOKEN:env.WECHAT_CALLBACK_TOKEN};
 for(const field of ['queryStringParameters','queryString']){
  const event={httpMethod:'GET',[field]:{timestamp,nonce,echostr,signature}};
  assert.deepEqual(verify(event,tokenOnly),{echo:echostr});
  event[field].signature='0'.repeat(40);assert.throws(()=>verify(event,tokenOnly),/invalid signature/);
 }
 assert.throws(()=>verify(callback(message),tokenOnly),/aes key not configured/);
});
test('callback rejection identifies missing token without exposing request or key values',async()=>{
 const m=memoryCloud(),logs=[],run=createHandler(m.cloud,(...args)=>logs.push(args),{});
 const result=await run(callback(message));assert.equal(result.statusCode,403);
 assert.equal(logs[0][1].reason,'callback token not configured');
 assert(!JSON.stringify(logs).includes(env.WECHAT_CALLBACK_TOKEN));assert(!JSON.stringify(logs).includes(env.WECHAT_CALLBACK_AES_KEY));
});

test('overlapping checks keep loading until the last operation settles, including rejection',async()=>{
 const events=[],requests=[];
 global.wx={getStorageSync:()=>true,showLoading:o=>events.push(o),hideLoading:()=>events.push('hide'),cloud:{callFunction:()=>new Promise(resolve=>requests.push(resolve))}};
 const first=safety.text('one'),second=safety.text('two');
 const rejected=assert.rejects(second,e=>e.safety==='blocked');
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(events,[{title:'安全检测中',mask:true}]);
 requests[0]({result:{status:'pass'}});await first;assert.equal(events.length,1);
 requests[1]({result:{status:'blocked'}});await rejected;assert.equal(events.at(-1),'hide');
});
test('blank text and declined consent never open loading',async()=>{
 const events=[];
 global.wx={getStorageSync:()=>false,showModal:o=>o.success({confirm:false}),showLoading:()=>events.push('show'),hideLoading:()=>events.push('hide')};
 await safety.text(' ');await assert.rejects(safety.text('hello'),e=>e.safety==='cancel');assert.deepEqual(events,[]);
});
test('detection loading restores export loading without closing it early',()=>{
 const events=[],loading=require('../miniprogram/utils/loading');
 global.wx={showLoading:o=>events.push(o.title),hideLoading:()=>events.push('hide')};
 const exportDone=loading.begin('正在生成图片'),checkDone=loading.begin('安全检测中');
 checkDone();exportDone();exportDone();
 assert.deepEqual(events,['正在生成图片','安全检测中','正在生成图片','hide']);
});
