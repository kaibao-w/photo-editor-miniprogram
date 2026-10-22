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
function backend(context,env,rows={},readError){
 let requests=0,databaseOptions={};const exports={};
 const db={runTransaction:async callback=>{
  const pending=structuredClone(rows);
  await callback({collection:()=>({doc:id=>({get:async()=>{if(readError)throw readError;if(!pending[id]&&databaseOptions.throwOnNotFound!==false)throw {errCode:-1,errMsg:'document does not exist'};return {data:pending[id]};},set:async({data})=>{pending[id]=data;}})})});
  Object.assign(rows,pending);
 }};
 const fakeCloud={init(){},DYNAMIC_CURRENT_ENV:'env',getWXContext:()=>context,database:options=>{databaseOptions=options||{};return db;}};
 const deps={'wx-server-sdk':fakeCloud,https:{request(){requests++;throw Error('mock network');}},crypto:require('crypto'),'./protocol':protocol};
 vm.runInNewContext(fs.readFileSync(require.resolve('../cloudfunctions/aiGrade/index'),'utf8'),{require:n=>deps[n],exports,process:{env},console:{warn(){}},Buffer,setTimeout,clearTimeout});
 return {run:exports.main,requests:()=>requests};
}
test('AI backend rejects unauthenticated calls and is disabled without configured secret',async()=>{
 const env={AI_ENABLED:'true',DASHSCOPE_API_KEY:'test-only'};
 for(const context of [{},{OPENID:'u',APPID:'other-app'}]){const b=backend(context,env);assert.equal((await b.run(valid)).ok,false);assert.equal(b.requests(),0);}
 const b=backend({OPENID:'u',APPID:'wx01334577ba7ffaf5'},{});assert.equal((await b.run(valid)).code,'UNAVAILABLE');assert.equal(b.requests(),0);
});
test('AI backend enforces daily quota before contacting provider',async()=>{
 const day=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
 const b=backend({OPENID:'u',APPID:'wx01334577ba7ffaf5'},{AI_ENABLED:'true',DASHSCOPE_API_KEY:'test-only',AI_GLOBAL_DAILY_LIMIT:'1'},{global:{day,count:1,last:0}});
 assert.equal((await b.run(valid)).code,'RATE_LIMIT');assert.equal(b.requests(),0);
});

test('server failures return a diagnostic stage without returning payloads or credentials',async()=>{
 const b=backend({OPENID:'u',APPID:'wx01334577ba7ffaf5'},{AI_ENABLED:'true',DASHSCOPE_API_KEY:'test-only'});
 const result=await b.run(valid);
 assert.equal(result.ok,false);assert.equal(result.diagnostic.stage,'provider');
 assert(!JSON.stringify(result).includes('test-only'));assert(!JSON.stringify(result).includes(valid.image));assert(!JSON.stringify(result).includes(valid.prompt));
});

test('quota read failures preserve SDK code and never call the model',async()=>{
 const b=backend({OPENID:'u',APPID:'wx01334577ba7ffaf5'},{AI_ENABLED:'true',DASHSCOPE_API_KEY:'test-only'},{},{errCode:-502005});
 const result=await b.run(valid);
 assert.equal(result.diagnostic.reason,'QUOTA_STORAGE');
 assert.equal(result.diagnostic.sdkCode,'-502005');
 assert.equal(result.diagnostic.stage,'quota');
 assert.equal(result.version,'aiGrade.20261022.4');
 assert.equal(b.requests(),0);
});

test('first use creates quota records and subsequent use respects cooldown',async()=>{
 const rows={};
 const b=backend({OPENID:'u',APPID:'wx01334577ba7ffaf5'},{AI_ENABLED:'true',DASHSCOPE_API_KEY:'test-only'},rows);
 const result=await b.run(valid);
 assert.equal(result.diagnostic.stage,'provider');
 assert.equal(b.requests(),1);
 assert.equal(Object.keys(rows).length,2);
 for(const row of Object.values(rows))assert.equal(row.count,1);
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
