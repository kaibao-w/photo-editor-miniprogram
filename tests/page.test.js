const test=require('node:test'),assert=require('node:assert/strict');
const config=require('../miniprogram/utils/config'),History=require('../miniprogram/utils/history');
let definition;global.Page=p=>definition=p;require('../miniprogram/pages/editor/index');delete global.Page;
function page(){const p={...definition,data:JSON.parse(JSON.stringify(definition.data)),setData(v,cb){Object.assign(this.data,v);if(cb)cb();}};p.values=config.defaults();p.frame={...config.frameDefaults};p.history=new History(p.state());p._alive=true;p.schedule=()=>{};p.view={zoom:1,x:0,y:0};p.rect={width:400,height:300};return p;}
test('vertical scroll does not edit; horizontal drag commits once',()=>{const p=page();p.source={};p.sliderStart({touches:[{clientX:10,clientY:10}]});p.sliderMove({touches:[{clientX:12,clientY:40}]});p.sliderEnd();assert.equal(p.values.exposure,0);assert.equal(p.history.items.length,1);p.sliderStart({touches:[{clientX:10,clientY:10}]});p.sliderMove({touches:[{clientX:60,clientY:11}]});assert(p.values.exposure>0);assert.equal(p.history.items.length,1);p.sliderEnd();assert.equal(p.history.items.length,2);p.undo();assert.equal(p.values.exposure,0);});
test('cancelled frame gesture restores original value',()=>{const p=page();p.source={};p.data.tab='frame';p.sliderStart({touches:[{clientX:10,clientY:10}]});p.sliderMove({touches:[{clientX:90,clientY:11}]});assert.notEqual(p.frame.size,83);p.sliderCancel();assert.equal(p.frame.size,83);assert.equal(p.history.items.length,1);});
test('hold comparison preserves frame, releases on end/cancel and on page hide',()=>{const p=page();p.source={};let renders=0;p.render=()=>renders++;p.frame.caption='山间';p.values.contrast=20;const before=p.state();p.compareStart();assert.equal(p.data.comparing,true);assert.deepEqual(p.state(),before);p.compareEnd();assert.equal(p.data.comparing,false);assert.equal(renders,2);p.compareEnd();assert.equal(renders,2);p.compareStart();p.onHide();assert.equal(p.data.comparing,false);assert.deepEqual(p.state(),before);assert.equal(p.history.items.length,1);p.data.busy=true;p.compareStart();assert.equal(p.data.comparing,false);p.data.busy=false;p.source=null;p.compareStart();assert.equal(p.data.comparing,false);});
test('recommended presets restore default frame and matching caption, with undo',()=>{for(const [key,label] of [['clear','清透'],['night','冷调'],['warm','暖色'],['film','胶片'],['mono','黑白']]){const p=page();p.source={};p.frame={...config.frameDefaults,enabled:false,caption:'旅行',radius:6};p.commit('自定义画框');p.applyPreset({currentTarget:{dataset:{key}}});assert.deepEqual(p.frame,{...config.frameDefaults,caption:'微光快调 - '+label});assert.deepEqual(p.values,{...config.defaults(),...config.presets[key]});p.undo();assert.equal(p.frame.radius,6);assert.equal(p.frame.caption,'旅行');assert.equal(p.frame.enabled,false);p.redo();p.reset();p.undo();assert.equal(p.frame.caption,'微光快调 - '+label);}});
test('declining album permission previews result',async()=>{const p=page(),calls=[];global.wx={saveImageToPhotosAlbum(o){calls.push('save');o.fail({});},getSetting(o){o.success({authSetting:{'scope.writePhotosAlbum':false}});},showModal(o){o.success({confirm:false});},previewImage(o){calls.push(o.urls[0]);}};await p.saveToAlbum('/tmp/result.png');assert.deepEqual(calls,['save','/tmp/result.png']);});
test('approved settings flow retries save',async()=>{const p=page();let count=0;global.wx={saveImageToPhotosAlbum(o){if(++count===1)o.fail({});else o.success({});},getSetting(o){o.success({authSetting:{'scope.writePhotosAlbum':false}});},showModal(o){o.success({confirm:true});},openSetting(o){o.success({authSetting:{'scope.writePhotosAlbum':true}});},showToast(){}};await p.saveToAlbum('/tmp/result.png');assert.equal(count,2);});
test('privacy callback agrees explicitly',()=>{const p=page();let event;p._privacyResolve=e=>event=e;p.agreePrivacy();assert.equal(event.buttonId,'privacyAgree');assert.equal(event.event,'agree');assert.equal(p.data.privacyVisible,false);});

test('choose photo remains available during editing and replaces the current image',async()=>{
 const p=page();p.canvas={};p.canvasReady=true;p._alive=true;p.data.ready=true;p.data.busy=true;p.data.selectingPhoto=false;p.data.exporting=false;
 const previous={data:new Uint8ClampedArray([1,1,1,255])};p.source=previous;p.image={};p.photo={createImage(){const image={width:20,height:10};Object.defineProperty(image,'src',{set(){image.onload();}});return image;}};
 p.createCanvas=()=>({getContext:()=>({drawImage(){},getImageData:()=>({data:new Uint8ClampedArray([2,2,2,255])})})});
 p.initializePhotoEdits=()=>{};p.sync=()=>{};p.syncHistory=()=>{};p.render=()=>{};p.fitView=()=>{};
 let opened=0;global.wx={chooseMedia:o=>{opened++;o.success({tempFiles:[{tempFilePath:'/new.jpg'}]});},getImageInfo:o=>o.success({path:'/new.jpg',width:20,height:10})};
 await p.choosePhoto();assert.equal(opened,1);assert.notEqual(p.source,previous);assert.equal(p.data.ready,true);assert.equal(p.data.busy,false);assert.equal(p.data.selectingPhoto,false);
});

test('history display is newest first without changing step identity',()=>{const p=page();p.source={};p.values.exposure=.5;p.commit('exposure');p.values.contrast=20;p.commit('contrast');assert.deepEqual(p.data.history.map(s=>s.index),[2,1,0]);assert.equal(p.history.items[2].parent,1);p.gotoStep({currentTarget:{dataset:{index:1}}});assert.equal(p.values.exposure,.5);assert.equal(p.values.contrast,0);p.undo();assert.equal(p.values.exposure,0);});

test('frame tab switch controls framing without a separate control row',()=>{const p=page();p.source={};p.switchTab({currentTarget:{dataset:{key:'frame'}}});assert.equal(p.data.label,'图片大小');p.toggleFrameTab();assert.equal(p.frame.enabled,false);assert.equal(p.data.tab,'frame');p.toggleFrameTab();assert.equal(p.frame.enabled,true);assert.equal(p.data.adjustList[0].icon,'☼');});


test('continuous slider movement previews before release and records one step',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  for(const frame of [false,true]){
    const p=page(),drawn=[];p.source={};p.schedule=definition.schedule;
    if(frame)p.data.tab='frame';
    p.render=()=>drawn.push(frame?p.frame.size:p.values.exposure);
    p.sliderStart({touches:[{clientX:10,clientY:10}]});
    for(let x=30;x<=90;x+=10){
      p.sliderMove({touches:[{clientX:x,clientY:10}]});
      t.mock.timers.tick(8);
    }
    assert(drawn.length>=3,'preview must update while the finger is still moving');
    assert.equal(p.history.items.length,1);
    p.sliderEnd();t.mock.timers.tick(16);
    assert.equal(drawn.at(-1),frame?p.frame.size:p.values.exposure);
    assert.equal(p.history.items.length,2);
  }
});

test('queued preview is ignored after unload',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const p=page();p.schedule=definition.schedule;let draws=0;p.render=()=>draws++;
  p.schedule();p._alive=false;t.mock.timers.tick(16);assert.equal(draws,0);
});


test('saving a preset always includes frame state and caption; applying restores them',async()=>{
 const p=page();p.source={};p.frame={...config.frameDefaults,enabled:false,caption:'旅途'};let rows;
 global.wx={showModal:o=>o.success({confirm:true,content:'旅行'}),getStorageSync:()=>rows,setStorageSync:(k,v)=>{rows=v;},showToast(){}};
 await p.savePreset();
 assert.deepEqual(rows[0].frame,p.frame);assert.deepEqual(rows[0].values,p.values);
 p.frame={...config.frameDefaults,caption:'其他'};
 p.applySavedPreset({currentTarget:{dataset:{id:rows[0].id}}});
 assert.equal(p.frame.enabled,false);assert.equal(p.frame.caption,'旅途');
});


test('new photo starts with cold preset and reset has no fallback caption',()=>{
 const p=page();p.source={};p.values.exposure=2;p.frame.caption='旧照片';
 p.initializePhotoEdits();
 assert.deepEqual(p.values,{...config.defaults(),...config.presets.night});
 assert.deepEqual(p.frame,{...config.frameDefaults,caption:'微光快调 - 冷调'});
 assert.equal(p.history.items.length,2);
 p.undo();assert.equal(p.frame.caption,'');assert.deepEqual(p.values,config.defaults());
 p.redo();assert.equal(p.frame.caption,'微光快调 - 冷调');
 p.reset();assert.equal(p.frame.caption,'');
});

test('import selects and applies preset, while import before photo queues it',async()=>{
 const store=require('../miniprogram/utils/presets');
 for(const hasPhoto of [true,false]){
  const p=page();if(hasPhoto)p.source={};let rows=[];
  const preset={version:1,name:'好友',values:{...config.defaults(),contrast:30},frame:{...config.frameDefaults,caption:'好友'}};
  let modal=0;global.wx={getStorageSync:()=>rows,setStorageSync:(k,v)=>rows=v,showModal:o=>o.success(++modal===1?{confirm:true,content:store.encode(preset)}:{confirm:true}),showToast(){}};
  await p.importPreset();assert.equal(p.data.selectedPresetId,rows[0].id);
  if(hasPhoto){assert.equal(p.values.contrast,30);assert.equal(p.frame.caption,'好友');assert.equal(p.history.items.length,2);p.undo();assert.equal(p.values.contrast,0);assert.equal(p.data.selectedPresetId,'');}
  else assert.equal(p.pendingPreset.id,rows[0].id);
 }
});


test('large photo exports automatically at safe dimensions without confirmation',async()=>{
 const p=page();p.source={};p.image={};p.originalWidth=5712;p.originalHeight=4284;p.frame.enabled=false;
 const ctx={drawImage(){},fillRect(){},getImageData(){return {data:new Uint8ClampedArray([100,100,100,255])};},putImageData(){}};
 p.createCanvas=()=>({getContext:()=>ctx});p.exportCanvas={getContext:()=>ctx};
 let exported,saved;p.saveToAlbum=async path=>{saved=path;};
 global.wx={showModal(){assert.fail('Export must not request size confirmation');},showLoading(){},hideLoading(){},canvasToTempFilePath(o){exported=o;o.success({tempFilePath:'/tmp/export.jpg'});}};
 await p.exportPhoto();assert.equal(exported.destWidth,4000);assert.equal(exported.destHeight,3000);assert.equal(exported.quality,.95);assert.equal(saved,'/tmp/export.jpg');assert.equal(p.data.busy,false);
});

test('AI applies validated values with undo and keeps frame',async()=>{
 const p=page();p.source={};p._aiConsent=true;p.data.aiPrompt='再暖一点';p.aiThumbnail=async()=>'/thumbnail';const before=p.state();
 global.wx={cloud:{callFunction:async()=>({result:{ok:true,status:'ok',values:{...p.values,temperature:20},summary:'增加暖意'}})},showToast(){}};
 await p.sendAi();assert.equal(p.values.temperature,20);assert.deepEqual(p.frame,before.frame);assert.equal(p.history.items.length,2);assert.equal(p.data.aiBusy,false);p.undo();assert.deepEqual(p.state(),before);
});
test('AI consent rejection does not upload',async()=>{
 const p=page();p.source={};p.data.aiPrompt='自然';p.aiThumbnail=()=>assert.fail('must not prepare upload');
 global.wx={cloud:{callFunction:()=>assert.fail('must not call cloud')},showModal:o=>{assert([...o.confirmText].length<=4);o.success({confirm:false});}};
 await p.sendAi();assert.equal(p.data.aiBusy,false);assert.equal(p.history.items.length,1);
});
test('late AI result cannot overwrite a manual edit or cancellation',async()=>{
 for(const action of ['edit','cancel','replace']){
  const p=page();p.source={};p._aiConsent=true;p.data.aiPrompt='自然';p.aiThumbnail=async()=>'/thumbnail';let resolve;
  global.wx={cloud:{callFunction:()=>new Promise(r=>resolve=r)},showToast(){}};
  const task=p.sendAi();await Promise.resolve();await Promise.resolve();
  if(action==='edit'){p.values.contrast=31;p.edit('手动');}else if(action==='cancel')p.cancelAi();else p.source={};
  resolve({result:{ok:true,status:'ok',values:{...config.defaults(),contrast:90},summary:'增强对比'}});
  await task;assert.notEqual(p.values.contrast,90);assert.equal(p.data.aiBusy,false);
 }
});
test('invalid AI values never change editing state',async t=>{
 t.mock.method(console,'warn',()=>{});
 const p=page();p.source={};p._aiConsent=true;p.data.aiPrompt='自然';p.aiThumbnail=async()=>'/thumbnail';const before=p.state();
 global.wx={cloud:{callFunction:async()=>({result:{ok:true,status:'ok',values:{...config.defaults(),exposure:99},summary:'错误'}})},showToast(){}};
 await p.sendAi();assert.deepEqual(p.state(),before);assert.equal(p.history.items.length,1);assert.equal(p.data.aiBusy,false);
});

test('AI diagnostics retain failure stage and SDK code without exposing credentials to logs or users',async t=>{
 const logs=[],toasts=[];t.mock.method(console,'warn',(...args)=>logs.push(args));
 const p=page();p.source={};p._aiConsent=true;p.data.aiPrompt='自然';p.aiThumbnail=async()=>'/thumbnail';
 global.wx={cloud:{callFunction:async()=>{throw {errCode:-501000,errMsg:'cloud.callFunction:fail function not found sk-test-secret Bearer test-token'};}},showToast:o=>toasts.push(o.title)};
 await p.sendAi();assert.equal(logs[0][1].stage,'cloudFunction');assert.equal(logs[0][1].code,'-501000');assert.match(logs[0][1].message,/function not found/);
 assert(!JSON.stringify(logs).includes('sk-test-secret'));assert(!JSON.stringify(logs).includes('test-token'));assert(!JSON.stringify(toasts).includes('function not found'));
});
