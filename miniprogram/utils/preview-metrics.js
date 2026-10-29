// Opt-in local diagnostics only. Submission time is not GPU completion time or display FPS.
class PreviewMetrics {
 constructor(){this.samples=[];this.last=null;}
 add(start,end){if(this.samples.length>=240)return;this.samples.push({ms:Math.max(0,end-start),gap:this.last===null?null:Math.max(0,start-this.last)});this.last=start;}
 summary(){const times=this.samples.map(s=>s.ms).sort((a,b)=>a-b),gaps=this.samples.map(s=>s.gap).filter(g=>g!==null);if(!times.length)return null;return {samples:times.length,meanSubmitMs:Number((times.reduce((a,b)=>a+b,0)/times.length).toFixed(2)),p95SubmitMs:times[Math.ceil(times.length*.95)-1],maxSubmitMs:times[times.length-1],meanIntervalMs:gaps.length?Number((gaps.reduce((a,b)=>a+b,0)/gaps.length).toFixed(2)):null};}
}
module.exports=PreviewMetrics;
