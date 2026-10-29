const test=require('node:test'),assert=require('node:assert/strict'),Metrics=require('../miniprogram/utils/preview-metrics');
test('preview diagnostics are bounded and summarize submission duration separately from cadence',()=>{
 const m=new Metrics();assert.equal(m.summary(),null);for(let i=0;i<300;i++)m.add(i*16,i*16+5);
 assert.deepEqual(m.summary(),{samples:240,meanSubmitMs:5,p95SubmitMs:5,maxSubmitMs:5,meanIntervalMs:16});
});
