const test=require('node:test'),assert=require('node:assert/strict');
const {grade,blurPixels,frameGeometry}=require('../miniprogram/utils/image');
const config=require('../miniprogram/utils/config'),History=require('../miniprogram/utils/history');
const {bounds,zoomAt,exportSize}=require('../miniprogram/utils/view');
const state=()=>({values:config.defaults(),frame:{...config.frameDefaults}});
test('neutral pixels and alpha are preserved',()=>{const bytes=[20,100,230,55,0,0,0,0,255,255,255,255];const d={data:new Uint8ClampedArray(bytes)};grade(d,config.defaults());assert.deepEqual([...d.data],bytes);});
test('grayscale and exposure',()=>{const a={data:new Uint8ClampedArray([30,50,70,128])};grade(a,{...config.defaults(),saturation:-100});assert.equal(a.data[0],a.data[1]);assert.equal(a.data[1],a.data[2]);const b={data:new Uint8ClampedArray([30,50,70,128])};grade(b,{...config.defaults(),exposure:1});assert.equal(b.data[0],60);assert.equal(b.data[3],128);});
test('blur preserves uniform pixels at edges',()=>{const d={width:2,height:2,data:new Uint8ClampedArray(16).fill(90)};blurPixels(d,12);assert([...d.data].every(v=>v===90));});
test('history preserves snapshots, alternate branches and marks',()=>{const s=state(),h=new History(s);s.values.contrast=20;h.record(s,'contrast');h.mark(1);s.frame.caption='旅行';h.record(s,'caption');assert.equal(h.undo().frame.caption,'');assert.equal(h.redo().frame.caption,'旅行');h.goto(0);const next=state();next.frame.enabled=false;h.record(next,'no frame');assert.equal(h.items.length,4);assert.equal(h.items[3].parent,0);assert.equal(h.items[1].marked,true);assert.equal(h.undo().frame.enabled,true);assert.equal(h.goto(2).frame.caption,'旅行');assert.equal(h.record(h.items[2].state,'same'),false);});
test('anchored zoom and movement bounds',()=>{assert.deepEqual(zoomAt({zoom:1,x:0,y:0},2,50,20),{zoom:2,x:-50,y:-20});assert.deepEqual(bounds({zoom:2,x:900,y:-900},400,300,.75),{zoom:2,x:200,y:-150});});
test('export dimensions are bounded and never upscale',()=>{assert.deepEqual(exportSize(800,600,true),{width:800,height:600,reduced:false});for(const original of [true,false]){const s=exportSize(5712,4284,original);assert(s.width*s.height<=12001000);assert(Math.max(s.width,s.height)<=(original?4096:2048));assert(s.reduced);assert(Math.abs(s.width/s.height-4/3)<.001);}});
test('frame defaults and parameter order',()=>{assert.equal(config.frameDefaults.enabled,true);assert.deepEqual(config.frames.map(d=>d[0]),['size','radius','shadow','blur','darkness']);const g=frameGeometry(1000,1500,config.frameDefaults);assert.equal(g.w,830);assert.equal(g.x,85);assert(g.y+g.h<1500);});

test('white and black levels target opposite tonal ends and preserve alpha',()=>{
 const render=(value,key,amount)=>{const d={data:new Uint8ClampedArray([value,value,value,89])};grade(d,{...config.defaults(),[key]:amount});assert.equal(d.data[3],89);return d.data[0];};
 assert(render(220,'whites',40)-220>render(30,'whites',40)-30);
 assert(render(220,'whites',-40)<220);
 assert(render(30,'blacks',40)-30>render(220,'blacks',40)-220);
 assert(render(30,'blacks',-40)<30);
 let previous=-1;
 for(let n=0;n<=255;n++){const d={data:new Uint8ClampedArray([n,n,n,255])};grade(d,{...config.defaults(),whites:-100,blacks:100});assert(d.data[0]>=previous);previous=d.data[0];}
});
test('vibrance favors muted colors and keeps neutrals and monochrome neutral',()=>{
 const render=(rgb,values)=>{const d={data:new Uint8ClampedArray([...rgb,255])};grade(d,{...config.defaults(),...values});return [...d.data].slice(0,3);};
 const span=rgb=>Math.max(...rgb)-Math.min(...rgb);
 const muted=[130,100,100],vivid=[200,5,5];
 assert(span(render(muted,{vibrance:80}))/span(muted)>span(render(vivid,{vibrance:80}))/span(vivid));
 assert(span(render(muted,{vibrance:-80}))<span(muted));
 assert.deepEqual(render([100,100,100],{vibrance:100}),[100,100,100]);
 assert.equal(span(render(muted,{vibrance:100,saturation:-100})),0);
});
