const test=require('node:test'),assert=require('node:assert/strict');
const protocol=require('../cloudfunctions/aiGrade/protocol');
const config=require('../miniprogram/utils/config');
const fs=require('fs'),vm=require('vm');
const valid={prompt:'自然一点',image:'data:image/jpeg;base64,/9j/AA==',values:config.defaults()};
test('AI protocol rejects excessive input, missing and out-of-range model values',()=>{
 assert.deepEqual(protocol.input(valid).values,config.defaults());
 for(const change of [{prompt:' '},{prompt:'a'.repeat(301)},{image:'https://external/image.jpg'},{image:'data:image/jpeg;base64,'+'A'.repeat(800000)},{values:{}},{values:{...config.defaults(),tint:101}}])assert.throws(()=>protocol.input({...valid,...change}));
 assert.throws(()=>protocol.output({status:'ok',summary:'完成',values:{...config.defaults(),contrast:NaN}}));
 assert.deepEqual(protocol.output({status:'unsupported'}),{status:'unsupported'});
 assert.equal(protocol.output({status:'ok',summary:'柔和',values:{...config.defaults(),temperature:12.3}}).values.temperature,12);
});
function backend(context,env,rows={},readError,now=Date.now(),hooks={}){
 let requests=0,databaseOptions={};const exports={};
 const db={runTransaction:async callback=>{
  const pending=structuredClone(rows);
  await callback({collection:()=>({doc:id=>({get:async()=>{if(hooks.get)return hooks.get();if(readError)throw readError;if(!pending[id]&&databaseOptions.throwOnNotFound!==false)throw {errCode:-1,errMsg:'document does not exist'};return {data:pending[id]};},set:async({data})=>{pending[id]=data;}})})});
  Object.assign(rows,pending);
 }};
 const fakeCloud={init(){},DYNAMIC_CURRENT_ENV:'env',getWXContext:()=>context,database:options=>{databaseOptions=options||{};return db;}};
 const deps={'wx-server-sdk':fakeCloud,https:{request(...args){requests++;if(hooks.request)return hooks.request(...args);throw Error('mock network');}},crypto:require('crypto'),'./protocol':protocol};
 vm.runInNewContext(fs.readFileSync(require.resolve('../cloudfunctions/aiGrade/index'),'utf8'),{require:n=>deps[n],exports,process:{env},console:{warn(){},info(){}},Date:{now:()=>now},Buffer,setTimeout,clearTimeout});
 return {run:exports.main,requests:()=>requests};
}
test('AI backend rejects unauthenticated calls and is disabled without configured secret',async()=>{
 const env={AI_ENABLED:'true',DASHSCOPE_API_KEY:'test-only'};
 for(const context of [{},{OPENID:'u',APPID:'other-app'}]){const b=backend(context,env);assert.equal((await b.run(valid)).ok,false);assert.equal(b.requests(),0);}
 const b=backend({OPENID:'u',APPID:'wx01334577ba7ffaf5'},{});assert.equal((await b.run(valid)).code,'UNAVAILABLE');assert.equal(b.requests(),0);
});
test('daily counts and old quota environment variables no longer limit calls',async()=>{
 const uid=require('crypto').createHash('sha256').update('u').digest('hex');
 const b=backend({OPENID:'u',APPID:'wx01334577ba7ffaf5'},{AI_ENABLED:'true',DASHSCOPE_API_KEY:'test-only',AI_DAILY_LIMIT:'1',AI_GLOBAL_DAILY_LIMIT:'1'},{[uid]:{count:99999,last:0},global:{count:99999,last:Date.now()}});
 assert.equal((await b.run(valid)).diagnostic.stage,'provider');assert.equal(b.requests(),1);
});
test('per-user cooldown blocks before five seconds and allows at the boundary',async()=>{
 const uid=require('crypto').createHash('sha256').update('u').digest('hex'),now=100000;
 for(const elapsed of [4999,5000,5001]){
  const b=backend({OPENID:'u',APPID:'wx01334577ba7ffaf5'},{AI_ENABLED:'true',DASHSCOPE_API_KEY:'test-only'},{[uid]:{last:now-elapsed}},undefined,now);
  const result=await b.run(valid);assert.equal(result.code==='RATE_LIMIT',elapsed<5000);assert.equal(b.requests(),elapsed<5000?0:1);
 }
 const b=backend({OPENID:'another-user',APPID:'wx01334577ba7ffaf5'},{AI_ENABLED:'true',DASHSCOPE_API_KEY:'test-only'},{[uid]:{last:now}},undefined,now);
 assert.equal((await b.run(valid)).diagnostic.stage,'provider');
});

test('server failures return a diagnostic stage without returning payloads or credentials',async()=>{
 const b=backend({OPENID:'u',APPID:'wx01334577ba7ffaf5'},{AI_ENABLED:'true',DASHSCOPE_API_KEY:'test-only'});
 const result=await b.run(valid);
 assert.equal(result.ok,false);assert.equal(result.diagnostic.stage,'provider');
 assert(!JSON.stringify(result).includes('test-only'));assert(!JSON.stringify(result).includes(valid.image));assert(!JSON.stringify(result).includes(valid.prompt));
});

test('cooldown read failures preserve SDK code and never call the model',async()=>{
 const b=backend({OPENID:'u',APPID:'wx01334577ba7ffaf5'},{AI_ENABLED:'true',DASHSCOPE_API_KEY:'test-only'},{},{errCode:-502005});
 const result=await b.run(valid);
 assert.equal(result.diagnostic.reason,'RATE_LIMIT_STORAGE');
 assert.equal(result.diagnostic.sdkCode,'-502005');
 assert.equal(result.diagnostic.stage,'rateLimit');
 assert.equal(result.version,'aiGrade.20261022.6');
 assert.equal(b.requests(),0);
});

test('first use creates a cooldown record and subsequent use respects cooldown',async()=>{
 const rows={};
 const b=backend({OPENID:'u',APPID:'wx01334577ba7ffaf5'},{AI_ENABLED:'true',DASHSCOPE_API_KEY:'test-only'},rows);
 const result=await b.run(valid);
 assert.equal(result.diagnostic.stage,'provider');
 assert.equal(b.requests(),1);
 assert.equal(Object.keys(rows).length,1);
 for(const row of Object.values(rows)){assert.equal(typeof row.last,'number');assert.deepEqual(Object.keys(row),['last']);}
 assert.equal((await b.run(valid)).code,'RATE_LIMIT');
 assert.equal(b.requests(),1);
});

test('AI supports eleven parameters with legacy input compatibility and strict output',()=>{
 assert.equal(Object.keys(protocol.ranges).length,11);
 const legacy={...valid,values:{...valid.values}};
 for(const key of ['whites','blacks','vibrance'])delete legacy.values[key];
 assert.deepEqual(protocol.input(legacy).values,config.defaults());
 assert.throws(()=>protocol.output({status:'ok',summary:'调整',values:legacy.values}));
 const values={...config.defaults(),whites:20,blacks:-10,vibrance:30};
 assert.deepEqual(protocol.output({status:'ok',summary:'调整',values}).values,values);
 for(const key of ['whites','blacks','vibrance'])assert.throws(()=>protocol.output({status:'ok',summary:'调整',values:{...values,[key]:101}}));
});

test('database deadline returns diagnostic timeout and never starts provider',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const b=backend({OPENID:'u',APPID:'wx01334577ba7ffaf5'},{AI_ENABLED:'true',DASHSCOPE_API_KEY:'test-only'},{},undefined,100000,{get:()=>new Promise(()=>{})});
 const pending=b.run(valid);t.mock.timers.tick(8000);const result=await pending;
 assert.equal(result.code,'TIMEOUT');assert.equal(result.diagnostic.reason,'RATE_LIMIT_STORAGE_TIMEOUT');assert.equal(result.diagnostic.stage,'rateLimit');assert.equal(b.requests(),0);
});
test('provider deadline settles directly even when socket destroy emits no event',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let destroyed=false;
 const b=backend({OPENID:'u',APPID:'wx01334577ba7ffaf5'},{AI_ENABLED:'true',DASHSCOPE_API_KEY:'test-only'},{},undefined,100000,{request:()=>({on(){return this;},end(){},destroy(){destroyed=true;}})});
 const pending=b.run(valid);for(let i=0;i<20;i++)await Promise.resolve();assert.equal(b.requests(),1);
 t.mock.timers.tick(40000);const result=await pending;
 assert.equal(result.code,'TIMEOUT');assert.equal(result.diagnostic.reason,'UPSTREAM_TIMEOUT');assert.equal(destroyed,true);
});
