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

test('interactive frame composition reuses its canvas and never reads pixels back',()=>{
 const {composeFrame}=require('../miniprogram/utils/image');
 let allocations=0,reads=0,writes=0;
 const context=canvas=>({canvas,clearRect(){},fillRect(){},drawImage(){},save(){},restore(){},beginPath(){},moveTo(){},arcTo(){},closePath(){},fill(){},clip(){},fillText(){},
  createImageData:(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)}),
  getImageData(x,y,w,h){reads++;return this.createImageData(w,h);},putImageData(){writes++;}});
 const create=(width,height)=>{allocations++;const canvas={width,height};const c=context(canvas);canvas.getContext=()=>c;return canvas;};
 const photo={width:12,height:8},out=context({width:12,height:8}),cache={};
 const pixels={width:12,height:8,data:new Uint8ClampedArray(12*8*4).fill(100)};
 const f={...config.frameDefaults},options={cache,pixels,revision:1};
 composeFrame(photo,out,f,create,6,options);assert.equal(reads,0);assert.equal(writes,1);assert.equal(allocations,1);
 // Frame geometry and darkness do not change the already graded, blurred background.
 composeFrame(photo,out,{...f,size:70,darkness:40},create,6,options);
 assert.equal(writes,1);assert.equal(allocations,1);
 composeFrame(photo,out,{...f,blur:60},create,6,options);assert.equal(writes,2);
 composeFrame(photo,out,f,create,6,{...options,revision:2});assert.equal(writes,3);assert.equal(reads,0);
 // Releasing the gesture restores the normal, high-quality Canvas downsampling path.
 composeFrame(photo,out,f,create,320,{cache,revision:2});assert.equal(reads,1);
 // Export does not use the interactive cache and releases its temporary canvas.
 let exported;composeFrame(photo,out,f,(w,h)=>(exported=create(w,h)),320);
 assert.equal(exported.width,0);assert.equal(reads,2);
});

test('jumping to a middle step enables forward navigation to the end',()=>{
 const h=new History({value:0});for(let value=1;value<=4;value++)h.record({value},String(value));
 h.goto(1);assert.equal(h.canRedo,true);assert.equal(h.redo().value,2);assert.equal(h.redo().value,3);assert.equal(h.redo().value,4);
 assert.equal(h.canRedo,false);assert.equal(h.redo(),null);
 h.goto(0);assert.equal(h.redo().value,1);
});
test('forward follows actual branches and respects the branch just undone',()=>{
 const h=new History({value:0});h.record({value:1},'one');h.record({value:2},'old branch');
 h.goto(1);h.record({value:3},'new branch');h.record({value:4},'new end');
 h.goto(1);assert.equal(h.redo().value,3);assert.equal(h.redo().value,4);
 h.goto(2);assert.equal(h.canRedo,false);h.undo();assert.equal(h.redo().value,2);
 h.goto(1);h.record({value:5},'third branch');assert.equal(h.canRedo,false);h.undo();assert.equal(h.redo().value,5);
});
