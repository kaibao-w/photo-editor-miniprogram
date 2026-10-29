const test=require('node:test'),assert=require('node:assert/strict');
const {full,dimensions,normalized,constrain,resize,drawCrop}=require('../miniprogram/utils/crop');
test('rotation swaps dimensions and normalized selection stays within the original',()=>{
 assert.deepEqual(dimensions(4000,3000,1),{width:3000,height:4000});
 const box={x:20,y:30,w:200,h:300},v=constrain({x:100,y:-1000,scale:.1},box,400,300);
 assert.deepEqual(v,{scale:1,x:20,y:30});assert.deepEqual(normalized(box,v,400,300,1),{x:0,y:0,w:.5,h:1,rotation:1});
});
test('corner resizing preserves fixed ratio and remains inside stage',()=>{
 for(const corner of ['tl','tr','bl','br']){
  const r=resize({x:40,y:60,w:240,h:320},corner,500,-500,3/4,{width:390,height:600});
  assert(Math.abs(r.w/r.h-.75)<1e-8);assert(r.x>=0&&r.y>=0&&r.x+r.w<=390&&r.y+r.h<=600);
 }
});
test('crop draws from full original with rotation and output scaling',()=>{
 const ops=[],ctx={save(){},restore(){},scale:(...a)=>ops.push(['scale',...a]),translate:(...a)=>ops.push(['translate',...a]),rotate:(...a)=>ops.push(['rotate',...a]),drawImage:(...a)=>ops.push(['draw',...a])};
 const image={width:4000,height:3000};drawCrop(ctx,image,{...full(),x:.25,y:.1,w:.5,h:.5,rotation:1},1500,2000);
 assert.deepEqual(ops[0],['scale',1,1]);assert.deepEqual(ops[1],['translate',-750,-400]);assert.deepEqual(ops[2],['translate',3000,0]);assert.equal(ops.at(-1)[1],image);
});
