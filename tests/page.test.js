const test=require('node:test'),assert=require('node:assert/strict');
const config=require('../miniprogram/utils/config'),History=require('../miniprogram/utils/history');
let definition;global.Page=p=>definition=p;require('../miniprogram/pages/editor/index');delete global.Page;
function page(){const p={...definition,data:JSON.parse(JSON.stringify(definition.data)),setData(v,cb){Object.assign(this.data,v);if(cb)cb();}};p.values=config.defaults();p.frame={...config.frameDefaults};p.history=new History(p.state());p._alive=true;p.schedule=()=>{};p.checkText=async()=>{};p.checkImage=async()=>{};p.prepareDetection=async()=>'prepared';p.ensurePhotoApproved=async()=>{};p.startPhotoCheck=async()=>true;p.view={zoom:1,x:0,y:0};p.rect={width:400,height:300};return p;}
test('vertical scroll does not edit; horizontal drag commits once',()=>{const p=page();p.source={};p.sliderStart({touches:[{clientX:10,clientY:10}]});p.sliderMove({touches:[{clientX:12,clientY:40}]});p.sliderEnd();assert.equal(p.values.exposure,0);assert.equal(p.history.items.length,1);p.sliderStart({touches:[{clientX:10,clientY:10}]});p.sliderMove({touches:[{clientX:60,clientY:11}]});assert(p.values.exposure>0);assert.equal(p.history.items.length,1);p.sliderEnd();assert.equal(p.history.items.length,2);p.undo();assert.equal(p.values.exposure,0);});
test('cancelled frame gesture restores original value',()=>{const p=page();p.source={};p.data.tab='frame';p.sliderStart({touches:[{clientX:10,clientY:10}]});p.sliderMove({touches:[{clientX:90,clientY:11}]});assert.notEqual(p.frame.size,83);p.sliderCancel();assert.equal(p.frame.size,83);assert.equal(p.history.items.length,1);});
test('hold comparison preserves frame, releases on end/cancel and on page hide',()=>{const p=page();p.source={};let renders=0;p.render=()=>renders++;p.frame.caption='山间';p.values.contrast=20;const before=p.state();p.compareStart();assert.equal(p.data.comparing,true);assert.deepEqual(p.state(),before);p.compareEnd();assert.equal(p.data.comparing,false);assert.equal(renders,2);p.compareEnd();assert.equal(renders,2);p.compareStart();p.onHide();assert.equal(p.data.comparing,false);assert.deepEqual(p.state(),before);assert.equal(p.history.items.length,1);p.data.busy=true;p.compareStart();assert.equal(p.data.comparing,false);p.data.busy=false;p.source=null;p.compareStart();assert.equal(p.data.comparing,false);});
test('recommended presets restore default frame and matching caption, with undo',()=>{for(const [key,label] of [['clear','清透'],['night','冷调'],['autumnSun','秋日暖阳'],['autumnFilm','秋野胶片'],['warm','暖色'],['film','胶片'],['mono','黑白']]){const p=page();p.source={};p.frame={...config.frameDefaults,enabled:false,caption:'旅行',radius:6};p.commit('自定义画框');p.applyPreset({currentTarget:{dataset:{key}}});assert.deepEqual(p.frame,{...config.frameDefaults,caption:'微光快调 - '+label});assert.deepEqual(p.values,{...config.defaults(),...config.presets[key]});p.undo();assert.equal(p.frame.radius,6);assert.equal(p.frame.caption,'旅行');assert.equal(p.frame.enabled,false);p.redo();p.reset();p.undo();assert.equal(p.frame.caption,'微光快调 - '+label);}});
test('declining album permission previews result',async()=>{const p=page(),calls=[];global.wx={saveImageToPhotosAlbum(o){calls.push('save');o.fail({});},getSetting(o){o.success({authSetting:{'scope.writePhotosAlbum':false}});},showModal(o){o.success({confirm:false});},previewImage(o){calls.push(o.urls[0]);}};await p.saveToAlbum('/tmp/result.png');assert.deepEqual(calls,['save','/tmp/result.png']);});
test('approved settings flow retries save',async()=>{const p=page();let count=0;global.wx={saveImageToPhotosAlbum(o){if(++count===1)o.fail({});else o.success({});},getSetting(o){o.success({authSetting:{'scope.writePhotosAlbum':false}});},showModal(o){o.success({confirm:true});},openSetting(o){o.success({authSetting:{'scope.writePhotosAlbum':true}});},showToast(){}};await p.saveToAlbum('/tmp/result.png');assert.equal(count,2);});
test('privacy callback agrees explicitly',()=>{const p=page();let event;p._privacyResolve=e=>event=e;p.agreePrivacy();assert.equal(event.buttonId,'privacyAgree');assert.equal(event.event,'agree');assert.equal(p.data.privacyVisible,false);});

test('choose photo remains available during editing and replaces the current image',async()=>{
 const p=page();p.canvas={};p.canvasReady=true;p._alive=true;p.data.ready=true;p.data.busy=true;p.data.selectingPhoto=false;p.data.exporting=false;
 const previous={data:new Uint8ClampedArray([1,1,1,255])};p.source=previous;p.image={};p.photo={createImage(){const image={width:20,height:10};Object.defineProperty(image,'src',{set(){image.onload();}});return image;}};
 p.createCanvas=()=>({getContext:()=>({drawImage(){},getImageData:()=>({data:new Uint8ClampedArray([2,2,2,255])})})});
 p.initializePhotoEdits=()=>{};p.sync=()=>{};p.syncHistory=()=>{};p.render=()=>{};p.fitView=()=>{};
 let opened=0;global.wx={chooseMedia:o=>{opened++;o.success({tempFiles:[{tempFilePath:'/new.jpg'}]});},getStorageSync:()=>true,getImageInfo:o=>o.success({path:'/new.jpg',width:20,height:10})};
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
test('caption previews immediately and rejection restores approved text without recording it',async()=>{
 const p=page();p.source={};p.frame.caption='old';let resolve;
 p.checkText=()=>new Promise(r=>resolve=r);global.wx={showToast(){}};
 p.captionInput({detail:{value:'new'}});assert.equal(p.frame.caption,'old');
 const pending=p.captionBlur();assert.equal(p.data.busy,true);assert.equal(p.frame.caption,'new');assert.equal(p.history.items.length,1);
 resolve();await pending;assert.equal(p.frame.caption,'new');assert.equal(p.history.items.length,2);
 p.checkText=async()=>{throw safetyFailure();};p.captionInput({detail:{value:'blocked'}});
 assert.equal(await p.captionBlur(),false);assert.equal(p.frame.caption,'new');assert.equal(p.history.items.length,2);assert.equal(p.data.busy,false);
});
test('background rejection clears current image, but stale results cannot clear a new image',async()=>{
 const api=require('../miniprogram/utils/content-safety'),original=api.checkPreparedImage;
 const p=page();p.startPhotoCheck=definition.startPhotoCheck;p.source={};p.image={};p.drawView=()=>{};
 let reject;api.checkPreparedImage=()=>new Promise((_,r)=>reject=r);global.wx={showToast(){}};
 try{
  const old=p._photoCheck={prepared:'old'};const pending=p.startPhotoCheck(old);
  const next=p._photoCheck={prepared:'new'};reject(safetyFailure());await pending;assert(p.source);
  const current=p.startPhotoCheck(next);reject(safetyFailure());await current;
  assert.equal(p.source,null);assert.equal(p.image,null);assert.equal(p.history,null);assert.equal(p.data.ready,false);
 }finally{api.checkPreparedImage=original;}
});
test('saving approved original does not check caption or final composite again',async()=>{
 const p=page();p.source={};p.image={};p.originalWidth=10;p.originalHeight=10;p.frame.enabled=false;
 p.ensurePhotoApproved=definition.ensurePhotoApproved;p._photoCheck={passUntil:1};
 const ctx={drawImage(){},fillRect(){},getImageData(){return {data:new Uint8ClampedArray([1,1,1,255])};},putImageData(){}};
 p.createCanvas=()=>({getContext:()=>ctx});p.exportCanvas={getContext:()=>ctx};
 p.checkImage=()=>assert.fail('must not check composite');p.checkText=()=>assert.fail('must not repeat text check');p.startPhotoCheck=()=>assert.fail('must not start check');
 let saved;p.saveToAlbum=async path=>saved=path;
 global.wx={showLoading(){},hideLoading(){},canvasToTempFilePath:o=>o.success({tempFilePath:'/approved.jpg'})};
 await p.exportPhoto();assert.equal(saved,'/approved.jpg');assert.equal(p.data.exporting,false);
});
test('rejected optimistic import restores list and history without persisting',async()=>{
 const p=page();p.source={};p.checkText=async()=>{throw safetyFailure();};let dialogs=0;
 const code=require('../miniprogram/utils/presets').encode({version:1,name:'blocked',values:config.defaults()});
 global.wx={showModal:o=>{dialogs++;o.success({confirm:true,content:code});},setStorageSync(){assert.fail('must not save');},showToast(){}};
 await p.importPreset();assert.equal(dialogs,2);assert.deepEqual(p.data.savedPresets,[]);assert.equal(p.pendingPreset,undefined);assert.equal(p.history.items.length,1);assert.equal(p.data.busy,false);
});
test('saved presets list locally but still require checks before application and copying',async()=>{
 const p=page();p.source={};const row={id:'old',version:1,name:'blocked',values:config.defaults(),updatedAt:1};
 p.checkText=async()=>{throw safetyFailure();};
 global.wx={getStorageSync:()=>[row],showToast(){},showActionSheet:o=>o.success({tapIndex:0}),setClipboardData(){assert.fail('must not copy');}};
 await p.refreshPresets();assert.deepEqual(p.data.savedPresets,[row]);
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
 const p=page();p.checkImage=definition.checkImage;p.prepareDetection=definition.prepareDetection;
 const draws=[];const ctx={fillRect(){},drawImage(...args){draws.push(args);}};
 p.safetyCanvas={getContext:()=>ctx};p.exportCanvas={width:4000,height:3000};
 p.createCanvas=()=>assert.fail('offscreen canvas must not be used for detection export');
 const api=require('../miniprogram/utils/content-safety'),prepare=api.prepareImage,check=api.checkPreparedImage;
 api.checkPreparedImage=async()=>{};api.prepareImage=async canvas=>{assert.equal(canvas,p.safetyCanvas);assert.equal(canvas.width,512);assert.equal(canvas.height,384);};
 global.wx={showLoading(){},hideLoading(){}};
 try{await p.checkImage(p.exportCanvas,4000,3000);assert.equal(draws[0][0],p.exportCanvas);assert.equal(p.exportCanvas.width,4000);assert.equal(p.exportCanvas.height,3000);assert.equal(p.safetyCanvas.width,1);}
 finally{api.prepareImage=prepare;api.checkPreparedImage=check;}
});

test('background check allows edits and export gate waits for the same result',async()=>{
 const api=require('../miniprogram/utils/content-safety'),original=api.checkPreparedImage;
 const p=page();p.source={};p.startPhotoCheck=definition.startPhotoCheck;p.ensurePhotoApproved=definition.ensurePhotoApproved;
 let resolve,calls=0;api.checkPreparedImage=()=>{calls++;return new Promise(r=>resolve=r);};
 global.wx={showLoading(){},hideLoading(){}};
 try{
  p._photoCheck={prepared:'one',passUntil:0};const pending=p.startPhotoCheck(p._photoCheck);
  assert.equal(p.data.busy,false);p.applyPreset({currentTarget:{dataset:{key:'warm'}}});assert.equal(p.frame.caption,'微光快调 - 暖色');
  let allowed=false;const gate=p.ensurePhotoApproved().then(()=>allowed=true);await Promise.resolve();assert.equal(allowed,false);assert.equal(calls,1);
  resolve(Date.now()+600000);await pending;await gate;assert.equal(allowed,true);assert.equal(p.data.photoCheckStatus,'pass');
 }finally{api.checkPreparedImage=original;}
});
test('failed source moderation blocks export before generating any output',async()=>{
 const p=page();p.source={};p.originalWidth=10;p.originalHeight=10;
 p.ensurePhotoApproved=async()=>{throw Object.assign(new Error(),{safety:'pending'});};
 p.createCanvas=()=>assert.fail('must not generate');p.saveToAlbum=()=>assert.fail('must not save');
 global.wx={showToast(){}};await p.exportPhoto();assert.equal(p.lastExport,undefined);assert.equal(p.data.exporting,false);
});

test('opening and returning to the page lists presets without moderation or loading',()=>{
 const p=page(),row={id:'saved',version:1,name:'旅行',values:config.defaults(),updatedAt:1};
 p.checkPreset=()=>assert.fail('opening must not check content');
 global.wx={getStorageSync:()=>[row],showLoading:()=>assert.fail('opening must not show loading'),cloud:{callFunction:()=>assert.fail('opening must not call cloud')}};
 p.onShow();assert.deepEqual(p.data.savedPresets,[row]);
 p.onShow();assert.deepEqual(p.data.savedPresets,[row]);
});

test('saving after a recoverable detection error retries without resetting edits',async()=>{
 const api=require('../miniprogram/utils/content-safety'),original=api.checkPreparedImage;
 const p=page();p.source={};p.values.exposure=.75;p.crop={x:0,y:0,w:.5,h:.5,rotation:1};
 p.ensurePhotoApproved=definition.ensurePhotoApproved;p.startPhotoCheck=definition.startPhotoCheck;
 p._photoCheck={prepared:'retry',passUntil:0,error:api.failure('pending')};
 let resolve,calls=0;api.checkPreparedImage=()=>{calls++;return new Promise(r=>resolve=r);};
 global.wx={showLoading(){},hideLoading(){}};
 const before=p.state();
 try{
  const a=p.ensurePhotoApproved(),b=p.ensurePhotoApproved();assert.equal(calls,1);
  resolve(Date.now()+600000);await Promise.all([a,b]);assert.deepEqual(p.state(),before);assert.equal(p.history.items.length,1);assert.equal(p.data.photoCheckStatus,'pass');
 }finally{api.checkPreparedImage=original;}
});
test('explicitly blocked photo is never retried',async()=>{
 const p=page();p.ensurePhotoApproved=definition.ensurePhotoApproved;p._photoCheck={passUntil:0,error:{safety:'blocked'}};
 p.startPhotoCheck=()=>assert.fail('must not retry blocked content');
 await assert.rejects(p.ensurePhotoApproved(),e=>e.safety==='blocked');
});

test('caption checks silently and rolls back with toast on rejection',async()=>{
 const p=page();p.source={};p.frame.caption='上一版';p.checkText=definition.checkText;
 let reject,toast;
 global.wx={getStorageSync:()=>true,showLoading:()=>assert.fail('caption must not show loading'),hideLoading:()=>assert.fail('caption must not hide another loading'),showToast:o=>toast=o.title,cloud:{callFunction:()=>new Promise((_,r)=>reject=r)}};
 p.captionInput({detail:{value:'新文字'}});const pending=p.captionBlur();
 assert.equal(p.frame.caption,'新文字');assert.equal(p.data.captionChecking,true);
 await new Promise(resolve=>setImmediate(resolve));reject(Object.assign(new Error(),{safety:'blocked'}));
 assert.equal(await pending,false);assert.equal(p.frame.caption,'上一版');assert.equal(p.data.captionChecking,false);assert.equal(toast,'内容含违规信息，请修改后重试');
});

test('preset rename previews silently then restores on rejection without writing storage',async()=>{
 const p=page(),row={id:'one',version:1,name:'旧名称',values:config.defaults(),updatedAt:1};p.data.savedPresets=[row];
 p.checkText=definition.checkText;let resolve;const toasts=[];
 global.wx={getStorageSync:()=>true,setStorageSync:()=>assert.fail('unchecked name must not persist'),showLoading:()=>assert.fail('must be silent'),showToast:o=>toasts.push(o.title),showActionSheet:o=>o.success({tapIndex:1}),showModal:o=>o.success({confirm:true,content:'新名称'}),cloud:{callFunction:()=>new Promise(r=>resolve=r)}};
 const pending=p.presetMenu({currentTarget:{dataset:{id:'one'}}});await new Promise(r=>setImmediate(r));
 assert.equal(p.data.savedPresets[0].name,'新名称');assert.equal(p.data.presetChecking,true);
 resolve({result:{status:'blocked'}});await pending;
 assert.equal(p.data.savedPresets[0].name,'旧名称');assert.equal(p.data.presetChecking,false);assert.deepEqual(toasts,['内容含违规信息，请修改后重试']);
});
test('applying preset previews immediately; rejection restores parameters and redo history',async()=>{
 const p=page();p.source={};p.values.contrast=10;p.commit('调整');p.undo();
 const before=p.state(),history=JSON.stringify(p.history),row={id:'one',version:1,name:'新预设',values:{...config.defaults(),contrast:50},frame:{...config.frameDefaults,caption:'文案'}};
 p.data.savedPresets=[row];let reject;p.checkPreset=()=>new Promise((_,r)=>reject=r);global.wx={showToast(){}};
 const pending=p.applySavedPreset({currentTarget:{dataset:{id:'one'}}});await new Promise(r=>setImmediate(r));
 assert.equal(p.values.contrast,50);assert.equal(p.frame.caption,'文案');assert.equal(JSON.stringify(p.history),history);
 reject(safetyFailure());await pending;assert.deepEqual(p.state(),before);assert.equal(JSON.stringify(p.history),history);assert.equal(p.data.selectedPresetId,'');
});
test('saving preset previews before approval and persists only after success',async()=>{
 const p=page();p.source={};let rows=[],resolve;
 p.checkPreset=()=>new Promise(r=>resolve=r);
 global.wx={getStorageSync:()=>rows,setStorageSync:(k,v)=>rows=v,showModal:o=>o.success({confirm:true,content:'旅行'}),showToast:()=>assert.fail('no success toast needed')};
 const pending=p.savePreset();await new Promise(r=>setImmediate(r));
 assert.equal(p.data.savedPresets[0].name,'旅行');assert.equal(rows.length,0);
 resolve();await pending;assert.equal(rows[0].name,'旅行');assert.equal(p.data.savedPresets[0].id,rows[0].id);
});


test('recommended preset takes selection back from an identical saved preset',async()=>{
 for(const preset of definition.data.presets){
  const p=page();p.source={};let rows=[];
  global.wx={showModal:o=>o.success({confirm:true,content:'我的'+preset.label}),getStorageSync:()=>rows,setStorageSync:(k,v)=>{rows=v;},showToast(){}};
  const event={currentTarget:{dataset:{key:preset.key}}};
  p.applyPreset(event);
  const expected=p.state();
  await p.savePreset();
  await p.applySavedPreset({currentTarget:{dataset:{id:rows[0].id}}});
  assert.equal(p.data.selectedPresetId,rows[0].id);
  assert.equal(p.data.preset,'');
  p.applyPreset(event);
  assert.equal(p.data.selectedPresetId,'');
  assert.equal(p.data.preset,preset.key);
  assert.deepEqual(p.state(),expected);
  await p.applySavedPreset({currentTarget:{dataset:{id:rows[0].id}}});
  assert.equal(p.data.selectedPresetId,rows[0].id);
  assert.equal(p.data.preset,'');
 }
});


test('drag preview caches reduced source, restores full size and refreshes for a new photo',()=>{
 const p=page();let allocations=0;
 p.createCanvas=(width,height)=>{allocations++;return {width,height,getContext(){return {createImageData:(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)}),putImageData(){},drawImage(){},getImageData:(x,y,w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)})};}};};
 p.source={width:1200,height:800,data:new Uint8ClampedArray(1200*800*4)};
 const original=p.source;p.slider={axis:'horizontal'};
 const reduced=p.previewSource();assert.equal(reduced.width,600);assert.equal(reduced.height,400);
 assert.equal(p.previewSource(),reduced);assert.equal(allocations,2);assert.equal(p.source,original);
 p.slider=null;assert.equal(p.previewSource(),original);
 p.source={width:800,height:1200,data:new Uint8ClampedArray(800*1200*4)};p.slider={axis:'horizontal'};
 assert.equal(p.previewSource().height,600);assert.equal(p.previewSource().width,400);assert.equal(allocations,4);
});

test('drag bursts coalesce UI updates and release renders full quality with final values',t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const p=page();p.source={};p.schedule=definition.schedule;let syncs=0;const renders=[];
 const sync=p.sync;p.sync=function(){syncs++;sync.call(this);};p.render=()=>renders.push({dragging:!!p.slider,value:p.values.exposure});
 p.sliderStart({touches:[{clientX:10,clientY:10}]});
 for(const x of [30,40,50,60])p.sliderMove({touches:[{clientX:x,clientY:10}]});
 assert.equal(syncs,0);t.mock.timers.tick(16);assert.equal(syncs,1);assert.equal(renders.length,1);assert.equal(renders[0].dragging,true);
 const value=p.values.exposure;p.sliderEnd();t.mock.timers.tick(16);
 assert.deepEqual(renders.at(-1),{dragging:false,value});assert.equal(p.data.parameterValue,value);assert.equal(p.history.items.length,2);
});


test('native dragging coalesces previews without feeding thumb positions back to the view',t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const p=page(),updates=[],renders=[];p.source={};p.schedule=definition.schedule;
 p.setData=function(data){updates.push(data);Object.assign(this.data,data);};
 p.render=()=>renders.push({dragging:!!p.slider,value:p.values.exposure});
 for(const value of [5,10,25,35])p.nativeSliderChanging({detail:{value}});
 assert.equal(updates.length,0);assert.equal(p.history.items.length,1);
 t.mock.timers.tick(33);
 assert.deepEqual(updates,[{parameterValue:.35}]);assert.equal(renders.length,1);
 p.nativeSliderChange({detail:{value:45}});t.mock.timers.tick(16);
 assert.deepEqual(renders.at(-1),{dragging:false,value:.45});
 assert.equal(p.data.sliderValue,45);assert.equal(p.history.items.length,2);
 p.undo();assert.equal(p.values.exposure,0);
});
test('native frame slider preserves fractional steps and cancellation restores the starting value',()=>{
 const p=page();p.source={};p.data.tab='frame';p.data.frameSelected='radius';p.sync();
 assert.equal(p.data.sliderStep,50);
 p.nativeSliderChanging({detail:{value:450}});assert.equal(p.frame.radius,4.5);
 p.sliderCancel();assert.equal(p.frame.radius,3);assert.equal(p.data.sliderValue,300);assert.equal(p.history.items.length,1);
 p.nativeSliderChange({detail:{value:550}});assert.equal(p.frame.radius,5.5);assert.equal(p.history.items.length,2);
});
test('native slider ignores disabled edits and does not record unchanged values',()=>{
 const p=page();p.source={};p.data.busy=true;p.nativeSliderChange({detail:{value:100}});
 assert.equal(p.values.exposure,0);p.data.busy=false;p.nativeSliderChange({detail:{value:0}});
 assert.equal(p.history.items.length,1);
});
test('iOS drag preview resizes original once at 360px then restores full preview after release',()=>{
 const p=page();p._dragLimit=360;p.source={width:1200,height:800};p.image={};p.slider={native:true,axis:'horizontal'};
 let allocations=0;
 p.createCanvas=(width,height)=>{allocations++;return {width,height,getContext(){return {drawImage:image=>assert.equal(image,p.image),getImageData:(x,y,w,h)=>({width:w,height:h})};}};};
 const reduced=p.previewSource();assert.deepEqual(reduced,{width:360,height:240});
 assert.equal(p.previewSource(),reduced);assert.equal(allocations,1);
 p.slider=null;assert.equal(p.previewSource(),p.source);
});

test('frame-only preview changes skip pixel grading while color changes and release refresh pixels',()=>{
 const p=page();let writes=0;
 const ctx=canvas=>({canvas,clearRect(){},fillRect(){},drawImage(){},save(){},restore(){},beginPath(){},moveTo(){},arcTo(){},closePath(){},fill(){},clip(){},fillText(){},
  createImageData:(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)}),
  getImageData(x,y,w,h){return this.createImageData(w,h);},putImageData(){if(canvas===p.photo)writes++;}});
 p.createCanvas=(width,height)=>{const canvas={width,height};const c=ctx(canvas);canvas.getContext=()=>c;return canvas;};
 p.photo=p.createCanvas(2,2);p.composite=p.createCanvas(2,2);p.drawView=()=>{};
 p.source={width:2,height:2,data:new Uint8ClampedArray(16).fill(100)};
 p.slider={native:true,axis:'horizontal'};
 p.render();assert.equal(writes,1);
 p.frame.size=70;p.render();assert.equal(writes,1);
 p.values.exposure=.5;p.render();assert.equal(writes,2);
 const small=p.source;p.previewSource=()=>p.slider?small:{width:4,height:4,data:new Uint8ClampedArray(64).fill(100)};
 p.slider=null;p.render();assert.equal(writes,3);assert.equal(p.photo.width,4);
});

test('unavailable GPU falls back once without lowering interactive image resolution',()=>{
 const p=page();p._dragLimit=1200;p.frame.enabled=false;p.slider={native:true,axis:'horizontal'};
 p.source={width:1200,height:1,data:new Uint8ClampedArray(4800).fill(120)};
 let attempts=0,writes=0;
 global.wx={createOffscreenCanvas(){attempts++;throw new Error('unsupported');}};
 p.photo={width:1200,height:1,getContext:()=>({createImageData:(width,height)=>({width,height,data:new Uint8ClampedArray(width*height*4)}),putImageData(){writes++;}})};
 p.composite={width:1200,height:1,getContext:()=>({clearRect(){},drawImage(){}})};
 p.drawView=()=>{};p.error=()=>assert.fail('GPU capability error should not reach the user');
 const warn=console.warn;console.warn=()=>{};
 try{p.render();p.values.exposure=.5;p.render();assert.equal(attempts,1);assert.equal(writes,2);assert.equal(p.photo.width,1200);assert.equal(p.previewSource(),p.source);}
 finally{console.warn=warn;delete global.wx.createOffscreenCanvas;}
});

test('crop apply records one step, undo restores original and redo restores crop',()=>{
 const p=page();p.source={};p.image={width:4000,height:3000};p.cropDraft={rotation:0};p.cropBox={x:25,y:0,w:50,h:100};p.cropView={x:0,y:0,scale:1};p._cropPhoto={width:100,height:100};p._cropReturn='presets';p.data.cropping=true;
 let rebuilds=0;p.rebuildCrop=()=>rebuilds++;p.fitView=()=>{};
 p.applyCrop();assert.deepEqual(p.crop,{x:.25,y:0,w:.5,h:1,rotation:0});assert.equal(p.history.items.length,2);assert.equal(p.data.cropping,false);
 p.undo();assert.equal(p.crop,null);p.redo();assert.equal(p.crop.w,.5);assert.equal(rebuilds,3);
});
test('cancel crop and switch tabs discard draft without changing saved state',()=>{
 const p=page();p.crop={x:.2,y:0,w:.8,h:1,rotation:0};p.cropDraft={rotation:1};p.data.cropping=true;p.data.tab='crop';p._cropReturn='presets';p.render=()=>{};
 p.switchTab({currentTarget:{dataset:{key:'adjust'}}});assert.equal(p.data.cropping,false);assert.equal(p.data.tab,'adjust');assert.equal(p.crop.rotation,0);assert.equal(p.history.items.length,1);
});

test('step selection updates the next-step button and restores later adjustments',()=>{
 const p=page();p.source={};
 for(const value of [.2,.4,.6]){p.values.exposure=value;p.commit('曝光');}
 p.gotoStep({currentTarget:{dataset:{index:1}}});assert.equal(p.data.canRedo,true);assert.equal(p.values.exposure,.2);
 p.redo();assert.equal(p.values.exposure,.4);assert.equal(p.data.canRedo,true);
 p.redo();assert.equal(p.values.exposure,.6);assert.equal(p.data.canRedo,false);
});

test('crop ratio round trip does not progressively shrink the selection',()=>{
 const p=page();p.cropDraft={rotation:0};p._cropPhoto={width:400,height:300};p.cropView={x:0,y:0,scale:1};p.cropBox={x:100,y:50,w:200,h:200};p._cropRatioAnchor={...p.cropBox};p.rect={width:400,height:300};p.drawCropView=()=>{};
 const original={...p.cropBox};
 for(let i=0;i<4;i++){p.cropRatioChange({currentTarget:{dataset:{key:'story'}}});p.cropRatioChange({currentTarget:{dataset:{key:'square'}}});}
 assert.deepEqual(p.cropBox,original);
});
test('crop rotation retains subject and swaps the selected fixed ratio',()=>{
 const p=page();p.cropDraft={rotation:0};p._cropPhoto={width:400,height:300};p.cropView={x:0,y:0,scale:1};p.cropBox={x:40,y:60,w:90,h:120};p._cropRatio=.75;p.data.cropRatio='portrait';p.prepareCropView=()=>{};
 p.cropRotate();assert.equal(p.cropDraft.rotation,1);assert.equal(p.data.cropRatio,'landscape');assert.equal(p._cropRatio,4/3);
 assert(Math.abs(p.cropDraft.x-.4)<1e-10);assert.equal(p.cropDraft.y,.1);assert.equal(p.cropDraft.w,.4);assert.equal(p.cropDraft.h,.225);
});
