const test=require('node:test'),assert=require('node:assert/strict');
const config=require('../miniprogram/utils/config'),History=require('../miniprogram/utils/history');
let definition;global.Page=p=>definition=p;require('../miniprogram/pages/editor/index');delete global.Page;
function page(){const p={...definition,data:JSON.parse(JSON.stringify(definition.data)),setData(v,cb){Object.assign(this.data,v);if(cb)cb();}};p.values=config.defaults();p.frame={...config.frameDefaults};p.history=new History(p.state());p._alive=true;p.schedule=()=>{};p.checkText=async()=>{};p.checkImage=async()=>{};p.view={zoom:1,x:0,y:0};p.rect={width:400,height:300};return p;}
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
 await p.applySavedPreset({currentTarget:{dataset:{id:rows[0].id}}});
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

const safetyFailure=()=>Object.assign(new Error('private provider data'),{safety:'blocked'});
test('caption remains unrendered until approved; rejected text never enters history',async()=>{
 const p=page();p.source={};p.frame.caption='old';let resolve;
 p.checkText=()=>new Promise(r=>resolve=r);global.wx={showToast(){}};
 p.captionInput({detail:{value:'new'}});assert.equal(p.frame.caption,'old');
 const pending=p.captionBlur();assert.equal(p.data.busy,true);assert.equal(p.frame.caption,'old');
 resolve();await pending;assert.equal(p.frame.caption,'new');assert.equal(p.history.items.length,2);
 p.checkText=async()=>{throw safetyFailure();};p.captionInput({detail:{value:'blocked'}});
 assert.equal(await p.captionBlur(),false);assert.equal(p.frame.caption,'new');assert.equal(p.history.items.length,2);assert.equal(p.data.busy,false);
});
test('rejected replacement keeps old image and history',async()=>{
 const p=page();p.canvas={};const old={};p.source=old;p.image=old;const history=p.history;
 p.photo={createImage(){const image={width:10,height:10};Object.defineProperty(image,'src',{set(){image.onload();}});return image;}};
 p.createCanvas=()=>({getContext:()=>({drawImage(){},getImageData:()=>({data:[]})})});
 p.checkImage=async()=>{throw safetyFailure();};
 let toast;global.wx={chooseMedia:o=>o.success({tempFiles:[{tempFilePath:'/new.jpg'}]}),getImageInfo:o=>o.success({width:10,height:10}),showToast:o=>toast=o.title};
 await p.choosePhoto();assert.equal(p.source,old);assert.equal(p.image,old);assert.equal(p.history,history);assert.equal(p.data.busy,false);assert.equal(toast,'内容含违规信息，请修改后重试');
});
test('rejected final composite never reaches album, temp export or preview',async()=>{
 const p=page();p.source={};p.image={};p.originalWidth=10;p.originalHeight=10;p.frame.enabled=false;
 const ctx={drawImage(){},fillRect(){},getImageData(){return {data:new Uint8ClampedArray([1,1,1,255])};},putImageData(){}};
 p.createCanvas=()=>({getContext:()=>ctx});p.exportCanvas={getContext:()=>ctx};
 p.checkImage=async()=>{throw safetyFailure();};p.saveToAlbum=()=>assert.fail('must not save');
 global.wx={showLoading(){},hideLoading(){},showToast(){},canvasToTempFilePath(){assert.fail('must not export');},previewImage(){assert.fail('must not preview');}};
 await p.exportPhoto();assert.equal(p.lastExport,undefined);assert.equal(p.data.exporting,false);
});
test('rejected import is never displayed in confirmation, saved or applied',async()=>{
 const p=page();p.source={};p.checkText=async()=>{throw safetyFailure();};let dialogs=0;
 const code=require('../miniprogram/utils/presets').encode({version:1,name:'blocked',values:config.defaults()});
 global.wx={showModal:o=>{dialogs++;o.success({confirm:true,content:code});},setStorageSync(){assert.fail('must not save');},showToast(){}};
 await p.importPreset();assert.equal(dialogs,1);assert.equal(p.pendingPreset,undefined);assert.equal(p.history.items.length,1);assert.equal(p.data.busy,false);
});
test('legacy presets are checked before listing, application and copying',async()=>{
 const p=page();p.source={};const row={id:'old',version:1,name:'blocked',values:config.defaults(),updatedAt:1};
 p.checkText=async()=>{throw safetyFailure();};
 global.wx={getStorageSync:()=>[row],showToast(){},showActionSheet:o=>o.success({tapIndex:0}),setClipboardData(){assert.fail('must not copy');}};
 await p.refreshPresets();assert.deepEqual(p.data.savedPresets,[]);
 p.data.savedPresets=[row];await p.applySavedPreset({currentTarget:{dataset:{id:'old'}}});assert.equal(p.history.items.length,1);
 await p.presetMenu({currentTarget:{dataset:{id:'old'}}});assert.equal(p.data.busy,false);
});
test('preset moderation locks replacement and edits until completion',async()=>{
 const p=page();p.source={};p.canvas={};const row={id:'one',version:1,name:'one',values:config.defaults()};p.data.savedPresets=[row];
 let resolve;p.checkText=value=>value?new Promise(r=>resolve=r):Promise.resolve();global.wx={chooseMedia(){assert.fail('must not replace while checking');}};
 const pending=p.applySavedPreset({currentTarget:{dataset:{id:'one'}}});await Promise.resolve();await Promise.resolve();
 assert.equal(p.data.busy,true);await p.choosePhoto();p.reset();assert.equal(p.frame.enabled,true);resolve();await pending;assert.equal(p.data.busy,false);
});

test('image moderation exports the dedicated page canvas and preserves the full-size export',async()=>{
 const p=page();p.checkImage=definition.checkImage;
 const draws=[];const ctx={fillRect(){},drawImage(...args){draws.push(args);}};
 p.safetyCanvas={getContext:()=>ctx};p.exportCanvas={width:4000,height:3000};
 p.createCanvas=()=>assert.fail('offscreen canvas must not be used for detection export');
 const api=require('../miniprogram/utils/content-safety'),consent=api.consent,image=api.image;
 api.consent=async()=>{};api.image=async canvas=>{assert.equal(canvas,p.safetyCanvas);assert.equal(canvas.width,750);assert.equal(canvas.height,563);};
 global.wx={showLoading(){},hideLoading(){}};
 try{await p.checkImage(p.exportCanvas,4000,3000);assert.equal(draws[0][0],p.exportCanvas);assert.equal(p.exportCanvas.width,4000);assert.equal(p.exportCanvas.height,3000);assert.equal(p.safetyCanvas.width,1);}
 finally{api.consent=consent;api.image=image;}
});
