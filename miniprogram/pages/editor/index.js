const savedPresets=require('../../utils/presets');
const aiEditor=require('../../utils/ai-editor');
const config = require('../../utils/config');
const { grade, composeFrame } = require('../../utils/image');
const History = require('../../utils/history');
const { bounds, zoomAt, exportSize } = require('../../utils/view');
const call = (name, args = {}) => new Promise((resolve, reject) => wx[name]({ ...args, success: resolve, fail: reject }));
const pause = () => new Promise(resolve => setTimeout(resolve, 0));
const isPrivacyScopeError = error => !!error && (error.errno===112 || error.errNo===112 || /api scope is not declared in the privacy agreement/i.test(error.errMsg||''));
const icons={exposure:'☼',contrast:'◐',dehaze:'≋',highlights:'☀',shadows:'◒',whites:'◇',blacks:'◆',vibrance:'✧',saturation:'◉',temperature:'◑',tint:'◈'};
const list = rows => rows.map(([key, label, min, max, step]) => ({ key, label, min, max, step, icon:icons[key] || '' }));
Page({
  ...aiEditor,
  data: {
    savedPresets:[],selectedPresetId:'',
    aiPrompt:'',aiBusy:false,aiStatus:'描述你想要的亮度、冷暖或色彩风格',aiKeyboardHeight:0,
    aiSuggestions:['自然通透，保留真实色彩','暖调胶片，柔和一点','冷调电影感，控制高光'],
    ready: false, busy: false, selectingPhoto:false, exporting:false, tab: 'presets', tabs: [{key:'presets',label:'预设'},{key:'adjust',label:'调色'},{key:'ai',label:'AI 调色'},{key:'frame',label:'画框'},{key:'history',label:'步骤'}],
    stageHeight: 360, adjustList: list(config.adjustments), frameList: list(config.frames),
    selected: 'exposure', frameSelected: 'size', values: config.defaults(), frame: {...config.frameDefaults},
    formats: ['JPG', 'PNG'], formatIndex: 0,
    presets: [{key:'clear',label:'清透'},{key:'night',label:'冷调'},{key:'warm',label:'暖色'},{key:'film',label:'胶片'},{key:'mono',label:'黑白'}], preset: '',
    label: '曝光', parameterValue: 0, percent: 50, comparing: false, zoomLabel: '100%',
    history: [], current: 0, canUndo: false, canRedo: false, marked: false, privacyVisible: false
  },
  onLoad() {
    this.values = config.defaults(); this.frame = {...config.frameDefaults}; this.view = {zoom:1,x:0,y:0};
    this._alive = true; this._privacyHandler = resolve => { this._privacyResolve = resolve; this.setData({privacyVisible:true}); };
    if (wx.onNeedPrivacyAuthorization) wx.onNeedPrivacyAuthorization(this._privacyHandler);
  },
  onShow(){this.refreshPresets();},
  onShareAppMessage(){return {title:'微光快调 · 图片调色',path:'/pages/editor/index'};},
  onReady() { this.initialize().catch(error => this.error(error, '画布初始化失败，请升级微信后重试')); },
  onUnload() {
    this.cancelAi();this._alive = false; clearTimeout(this._timer);
    if(wx.offNeedPrivacyAuthorization) wx.offNeedPrivacyAuthorization(this._privacyHandler);
    if(this._privacyResolve) this._privacyResolve({event:'disagree'});
    for(const canvas of [this.canvas, this.exportCanvas, this.photo, this.composite]) if(canvas) {canvas.width=1;canvas.height=1;}
    this.source = this.image = null;
  },
  onHide(){this.compareEnd();},
  onResize() { if(this.canvas) this.measure(); },
  createCanvas(width, height) { return wx.createOffscreenCanvas({type:'2d',width,height}); },
  async initialize() {
    if (!wx.createOffscreenCanvas) throw new Error('需要支持 Canvas 2D 的微信版本');
    const nodes = await new Promise(resolve => wx.createSelectorQuery().in(this).select('#preview').fields({node:true,size:true}).select('#export-canvas').fields({node:true,size:true}).exec(resolve));
    if(!nodes[0] || !nodes[0].node || !nodes[1] || !nodes[1].node) throw new Error('无法获取 Canvas 2D 节点');
    this.canvas=nodes[0].node; this.ctx=this.canvas.getContext('2d'); this.exportCanvas=nodes[1].node;
    this.photo=this.createCanvas(1,1); this.composite=this.createCanvas(1,1);
    await this.measure(); this.setData({canvasReady:true});
  },
  measure() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    // Keep the editing controls compact so the photo gets most of the viewport.
    const safeBottom = info.safeArea ? Math.max(0, info.screenHeight - info.safeArea.bottom) : 0;
    // Keep the control dock at the frame panel's compact height for every tab.
    const stageHeight = Math.max(44, info.windowHeight-44-36-139-safeBottom-(this.data.aiKeyboardHeight||0));
    return new Promise(resolve => this.setData({stageHeight}, () => wx.createSelectorQuery().in(this).select('.preview-surface').boundingClientRect(rect => {
      if(rect) {this.rect=rect; this.dpr=Math.min(info.pixelRatio || 2, 2); this.canvas.width=Math.round(rect.width*this.dpr); this.canvas.height=Math.round(rect.height*this.dpr); this.drawView();} resolve();
    }).exec()));
  },
  error(error, fallback) { console.warn(fallback, error); wx.showToast({title:fallback,icon:'none'}); },
  state() {return {values:{...this.values},frame:{...this.frame}};},
  sync() {
    const frameMode=this.data.tab==='frame'; const key=frameMode?this.data.frameSelected:this.data.selected;
    const def=(frameMode?this.data.frameList:this.data.adjustList).find(d=>d.key===key);
    const value=(frameMode?this.frame:this.values)[key];
    const selectedPreset=this.data.savedPresets.find(r=>r.id===this.data.selectedPresetId);
    const matches=selectedPreset && Object.keys(selectedPreset.values).every(k=>selectedPreset.values[k]===this.values[k]) && (!selectedPreset.frame || Object.keys(selectedPreset.frame).every(k=>selectedPreset.frame[k]===this.frame[k]));
    this.setData({selectedPresetId:matches?selectedPreset.id:'',values:{...this.values},frame:{...this.frame}, label:def.label, parameterValue:value,
      percent:(value-def.min)/(def.max-def.min)*100, preset:matches?'':Object.keys(config.presets).find(k=>JSON.stringify({...config.defaults(),...config.presets[k]})===JSON.stringify(this.values)) || ''});
  },
  syncHistory() {
    if(!this.history) return;
    this.setData({history:this.history.items.map((s,index)=>({index,label:s.label,marked:s.marked,parent:s.parent})).reverse(),current:this.history.current,
      canUndo:this.history.items[this.history.current].parent!==null,canRedo:!!this.history.redos.length,marked:this.history.items[this.history.current].marked});
  },
  commit(label) {if(this.history){this.history.record(this.state(),label);this.syncHistory();}},
  edit(label) {this._editRevision=(this._editRevision||0)+1;this.setData({comparing:false});this.sync();this.schedule();if(label)this.commit(label);},
  async choosePhoto() {
    if(this.data.selectingPhoto || this.data.exporting || !this.canvas) return;
    this.cancelAi();this.setData({busy:true,selectingPhoto:true});
    try {
      const result=await call('chooseMedia',{count:1,mediaType:['image'],sourceType:['album','camera'],sizeType:['original']});
      const file=result.tempFiles && result.tempFiles[0];
      if(!file || !file.tempFilePath) throw new Error('没有获取到图片文件，请重新选择');
      let path=file.tempFilePath;
      let info;
      try { info=await call('getImageInfo',{src:path}); }
      catch(error) {
        // If the platform image decoder cannot inspect the original (for example,
        // an HEIC photo on an older base library), ask the native media stack to
        // normalize it before passing it to Canvas.
        if(!wx.compressImage) throw error;
        const converted=await call('compressImage',{src:path,quality:95});
        path=converted.tempFilePath || converted.apFilePath || path;
        info=await call('getImageInfo',{src:path});
      }
      // Prefer the normalized local path returned by the native image decoder. On
      // some real devices, CanvasImage cannot open chooseMedia's original temp path.
      path=info.path || path;
      if(info.width*info.height>80000000) throw new Error('图片超过8000万像素，请先缩小');
      const loadCanvasImage=src=>new Promise((resolve,reject)=>{
        const image=this.photo.createImage();
        image.onload=()=>resolve(image);
        image.onerror=()=>reject(new Error('Canvas 无法解码图片'));
        image.src=src;
      });
      let image;
      try { image=await loadCanvasImage(path); }
      catch(firstError) {
        // Native compression also converts formats such as HEIC to a Canvas-friendly
        // image on devices whose Canvas 2D decoder does not support the source format.
        if(!wx.compressImage) throw firstError;
        const converted=await call('compressImage',{src:path,quality:95});
        path=converted.tempFilePath || converted.apFilePath || path;
        image=await loadCanvasImage(path);
      }
      if(!this._alive) return;
      const w=image.width,h=image.height;if(!w || !h) throw new Error('图片无法解码');
      const scale=Math.min(1,1200/Math.max(w,h));const pw=Math.max(1,Math.round(w*scale)),ph=Math.max(1,Math.round(h*scale));
      const scratch=this.createCanvas(pw,ph),c=scratch.getContext('2d');c.drawImage(image,0,0,pw,ph);
      const pixels=c.getImageData(0,0,pw,ph);scratch.width=scratch.height=1;
      this.image=image;this.originalWidth=w;this.originalHeight=h;this.source=pixels;
      this.initializePhotoEdits();
      if(this.pendingPreset){const row=this.pendingPreset;this.pendingPreset=null;this.values={...row.values};if(row.frame)this.frame={...this.frame,...row.frame};this.setData({selectedPresetId:row.id});this.history.record(this.state(),'预设 · '+row.name);}
      this.setData({ready:true,comparing:false,tab:'presets'});
      this.sync();this.syncHistory();this.render();this.fitView();
    } catch(error) {
      if(String(error.errMsg||'').includes('cancel')) return;
      if(isPrivacyScopeError(error)) console.warn('选取图片失败：微信隐私指引缺少对应声明',error);
      else this.error(error,'无法读取图片，请更换图片后重试（支持 JPG、PNG）');
    }
    finally {if(this._alive)this.setData({busy:false,selectingPhoto:false});}
  },
  initializePhotoEdits(){
    this._editRevision=(this._editRevision||0)+1;
    this.setData({aiPrompt:'',aiStatus:'描述你想要的亮度、冷暖或色彩风格'});
    this.values=config.defaults();this.frame={...config.frameDefaults};this.history=new History(this.state());
    this.values={...config.defaults(),...config.presets.night};
    this.frame={...config.frameDefaults,caption:'微光快调 - 冷调'};
    this.history.record(this.state(),'预设 · 冷调');
  },
  schedule() {
    // Coalesce updates without postponing the pending preview during continuous dragging.
    if(this._timer != null || !this._alive)return;
    this._timer=setTimeout(()=>{this._timer=null;if(this._alive)this.render();},16);
  },
  render() {
    if(!this.source || !this._alive) return;
    try {
      const {width:w,height:h}=this.source;this.photo.width=w;this.photo.height=h;this.composite.width=w;this.composite.height=h;
      const c=this.photo.getContext('2d'),pixels=c.createImageData(w,h);pixels.data.set(this.source.data);
      if(!this.data.comparing)grade(pixels,this.values);c.putImageData(pixels,0,0);
      const output=this.composite.getContext('2d');
      if(this.frame.enabled)composeFrame(this.photo,output,this.frame,(w,h)=>this.createCanvas(w,h));else output.drawImage(this.photo,0,0);
      this.drawView();
    } catch(error) {this.error(error,'预览失败，请尝试较小的图片');}
  },
  drawView() {
    if(!this.ctx || !this.rect) return;
    const {width:w,height:h}=this.rect;this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);this.ctx.fillStyle='#050605';this.ctx.fillRect(0,0,w,h);
    if(!this.source)return;const ratio=this.source.height/this.source.width;this.view=bounds(this.view,w,h,ratio);
    const pw=w*this.view.zoom,ph=pw*ratio;this.ctx.drawImage(this.composite,(w-pw)/2+this.view.x,(h-ph)/2+this.view.y,pw,ph);
    this.setData({zoomLabel:Math.round(this.view.zoom*100)+'%'});
  },
  fitView() {if(!this.source)return;this.view={zoom:Math.min(1,this.rect.height/(this.rect.width*this.source.height/this.source.width)),x:0,y:0};this.drawView();},
  compareStart(){if(!this.source || this.data.busy || this.data.comparing)return;this.setData({comparing:true});this.render();},
  compareEnd(){if(!this.data.comparing)return;this.setData({comparing:false});if(this._alive)this.render();},
  switchTab(e){this.setData({tab:e.currentTarget.dataset.key},()=>this.sync());},
  selectParameter(e){const key=e.currentTarget.dataset.key;this.setData(this.data.tab==='frame'?{frameSelected:key}:{selected:key});this.sync();},
  reset(){if(!this.source || this.data.busy)return;this.values=config.defaults();this.frame={...config.frameDefaults,enabled:false};this.edit('重置全部');},
  applyPreset(e){if(!this.source || this.data.busy)return;const key=e.currentTarget.dataset.key,preset=this.data.presets.find(p=>p.key===key);if(!preset)return;this.values={...config.defaults(),...config.presets[key]};this.frame={...config.frameDefaults,caption:'微光快调 - '+preset.label};this.edit('预设 · '+preset.label);},
  toggleFrameTab(){if(!this.source || this.data.busy)return;this.frame.enabled=!this.frame.enabled;const label=this.frame.enabled?'启用画框':'关闭画框';this.setData({tab:'frame'},()=>this.edit(label));},
  captionInput(e){if(!this.source || this.data.busy)return;this.frame.caption=e.detail.value;this.edit();},
  captionBlur(){this.commit('画框 · 底部文字');},
  sliderStart(e){
    if(!this.source || this.data.busy)return;
    const frame=this.data.tab==='frame',key=frame?this.data.frameSelected:this.data.selected;
    const def=(frame?this.data.frameList:this.data.adjustList).find(d=>d.key===key),t=e.touches[0];
    this.slider={x:t.clientX,y:t.clientY,start:(frame?this.frame:this.values)[key],key,frame,def,axis:null,width:Math.max(1,this.rect.width-48)};
  },
  sliderMove(e){
    const g=this.slider;if(!g || !e.touches.length)return;const t=e.touches[0],dx=t.clientX-g.x,dy=t.clientY-g.y;
    if(!g.axis){if(Math.abs(dy)>=8&&Math.abs(dy)>=Math.abs(dx))g.axis='vertical';else if(Math.abs(dx)>=10&&Math.abs(dx)>Math.abs(dy)*1.4)g.axis='horizontal';else return;}
    if(g.axis!=='horizontal')return;const {min,max,step}=g.def;
    (g.frame?this.frame:this.values)[g.key]=Number(Math.max(min,Math.min(max,Math.round((g.start+dx/g.width*(max-min))/step)*step)).toFixed(4));this.edit();
  },
  sliderEnd(){if(this.slider && this.slider.axis==='horizontal')this.commit(this.slider.def.label+'调整');this.slider=null;},
  sliderCancel(){if(this.slider){(this.slider.frame?this.frame:this.values)[this.slider.key]=this.slider.start;this.slider=null;this.edit();}},
  restore(state){if(!state)return;this.values=state.values;this.frame=state.frame;this.edit();this.syncHistory();},
  undo(){if(!this.data.busy&&this.history)this.restore(this.history.undo());},
  redo(){if(!this.data.busy&&this.history)this.restore(this.history.redo());},
  gotoStep(e){if(!this.data.busy&&this.history)this.restore(this.history.goto(Number(e.currentTarget.dataset.index)));},
  markStep(e){if(!this.history || this.data.busy)return;const index=e.currentTarget.dataset.index;this.history.mark(index===undefined?this.history.current:Number(index));this.syncHistory();},
  point(t){return {x:t.x-this.rect.width/2,y:t.y-this.rect.height/2};},
  startGesture(touches){
    if(!touches.length){this.gesture=null;return;}const a=this.point(touches[0]),b=touches[1]&&this.point(touches[1]);
    this.gesture={...this.view,n:touches.length,center:b?{x:(a.x+b.x)/2,y:(a.y+b.y)/2}:a,distance:b?Math.max(1,Math.hypot(b.x-a.x,b.y-a.y)):0};
  },
  viewStart(e){if(!this.source)return;this.startGesture(e.touches);this.tap=e.touches.length===1?{time:Date.now(),...this.point(e.touches[0])}:null;if(e.touches.length>1)this.lastTap=null;},
  viewMove(e){
    if(!this.gesture || !e.touches.length)return;if(e.touches.length!==this.gesture.n){this.startGesture(e.touches);return;}
    const a=this.point(e.touches[0]),b=e.touches[1]&&this.point(e.touches[1]),g=this.gesture;
    if(this.tap&&Math.hypot(a.x-this.tap.x,a.y-this.tap.y)>8)this.tap=null;
    const center=b?{x:(a.x+b.x)/2,y:(a.y+b.y)/2}:a,zoom=b?Math.max(.1,Math.min(8,g.zoom*Math.hypot(b.x-a.x,b.y-a.y)/g.distance)):g.zoom,r=zoom/g.zoom;
    this.view={zoom,x:center.x-(g.center.x-g.x)*r,y:center.y-(g.center.y-g.y)*r};this.drawView();
  },
  viewEnd(e){
    if(this.tap && !e.touches.length && Date.now()-this.tap.time<280){const t=this.tap;
      if(this.lastTap&&Date.now()-this.lastTap.time<320&&Math.hypot(t.x-this.lastTap.x,t.y-this.lastTap.y)<24){if(this.view.zoom>1.05)this.fitView();else {this.view=zoomAt(this.view,2,t.x,t.y);this.drawView();}this.lastTap=null;}else this.lastTap=t;}
    this.tap=null;this.startGesture(e.touches);
  },
  viewCancel(){this.tap=this.lastTap=this.gesture=null;},
  changeFormat(e){this.setData({formatIndex:Number(e.detail.value)});},
  async exportPhoto(){
    if(!this.source || this.data.busy)return;this.captionBlur();this.setData({busy:true,exporting:true});
    const state=this.state(),type=this.data.formatIndex?'png':'jpg';
    const size=exportSize(this.originalWidth,this.originalHeight,true);let photo;
    try {
      wx.showLoading({title:'正在生成图片',mask:true});await pause();
      photo=this.createCanvas(size.width,size.height);const pc=photo.getContext('2d');
      if(type==='jpg'){pc.fillStyle='#fff';pc.fillRect(0,0,size.width,size.height);}pc.drawImage(this.image,0,0,size.width,size.height);
      for(let y=0;y<size.height;y+=128){const h=Math.min(128,size.height-y);pc.putImageData(grade(pc.getImageData(0,y,size.width,h),state.values),0,y);await pause();if(!this._alive)return;}
      this.exportCanvas.width=size.width;this.exportCanvas.height=size.height;const out=this.exportCanvas.getContext('2d');
      if(state.frame.enabled)composeFrame(photo,out,state.frame,(w,h)=>this.createCanvas(w,h));else out.drawImage(photo,0,0);
      const result=await call('canvasToTempFilePath',{canvas:this.exportCanvas,x:0,y:0,width:size.width,height:size.height,destWidth:size.width,destHeight:size.height,fileType:type,quality:.95});
      wx.hideLoading();this.lastExport=result.tempFilePath;await this.saveToAlbum(result.tempFilePath);
    }catch(error){this.error(error,'导出失败，请使用较小的图片重试');}
    finally {wx.hideLoading();if(photo)photo.width=photo.height=1;if(this.exportCanvas)this.exportCanvas.width=this.exportCanvas.height=1;if(this._alive)this.setData({busy:false,exporting:false});}
  },
  async saveToAlbum(path){
    try {await call('saveImageToPhotosAlbum',{filePath:path});wx.showToast({title:'已保存到相册'});}
    catch(error){
      const setting=await call('getSetting').catch(()=>({authSetting:{}}));
      if(setting.authSetting['scope.writePhotosAlbum']===false){const answer=await call('showModal',{title:'需要相册权限',content:'图片已生成。是否打开设置，允许保存到相册？',confirmText:'打开设置'});
        if(answer.confirm){const result=await call('openSetting');if(result.authSetting['scope.writePhotosAlbum']){await call('saveImageToPhotosAlbum',{filePath:path});wx.showToast({title:'已保存到相册'});return;}}}
      wx.previewImage({urls:[path],current:path});
    }
  },
  refreshPresets(){try{this.setData({savedPresets:savedPresets.read().filter(r=>!r.deleted).sort((a,b)=>b.updatedAt-a.updatedAt)});}catch(e){this.error(e,'读取预设失败');}},
  async savePreset(){
    if(!this.source||this.data.busy)return;
    const payload={version:1,name:'',values:{...this.values},frame:{...this.frame}};
    const result=await call('showModal',{title:'保存当前预设',editable:true,placeholderText:'预设名称（最多30字）'});
    if(!result.confirm)return;payload.name=(result.content||'').trim();
    try{savedPresets.save(payload);this.refreshPresets();wx.showToast({title:'预设已保存',icon:'success'});}catch(e){this.error(e,'保存预设失败，请稍后重试');}
  },
  applySavedPreset(e){
    if(!this.source||this.data.busy)return;
    const row=this.data.savedPresets.find(r=>r.id===e.currentTarget.dataset.id);if(!row)return;
    this.setData({selectedPresetId:row.id});this.values={...row.values};if(row.frame)this.frame={...this.frame,...row.frame};this.edit('预设 · '+row.name);
  },
  async importPreset(){try{
    const result=await call('showModal',{title:'导入预设码',editable:true,placeholderText:'粘贴 GY1: 开头的完整预设码'});if(!result.confirm)return;
    const row=savedPresets.decode(result.content);
    const confirm=await call('showModal',{title:row.name,content:'包含调色参数'+(row.frame?'、画框参数':'')+(row.frame&&row.frame.caption!==undefined?'、底部文字':'')+'，是否导入我的预设？'});if(!confirm.confirm)return;
    const saved=savedPresets.save(row);this.refreshPresets();this.setData({tab:'presets',selectedPresetId:saved.id});
    if(this.source&&!this.data.busy){this.applySavedPreset({currentTarget:{dataset:{id:saved.id}}});}
    else{this.pendingPreset=saved;wx.showToast({title:'已选中，选图后应用',icon:'none'});}
  }catch(e){
    const inputErrors=['请输入完整的微光快调预设码','预设码无效或版本不支持','预设名称或版本无效','调色参数无效','画框参数无效','底部文字无效'];
    if(inputErrors.includes(e.message)) wx.showToast({title:e.message,icon:'none'});
    else this.error(e,'导入失败，请检查预设码后重试');
  }},
  async presetMenu(e){try{
    const row=this.data.savedPresets.find(r=>r.id===e.currentTarget.dataset.id);if(!row)return;
    const result=await call('showActionSheet',{itemList:['复制分享码','重命名','用当前参数覆盖','删除']});
    if(result.tapIndex===0){
      try {
        await call('setClipboardData',{data:savedPresets.encode(row)});
        wx.showToast({title:'分享码已复制',icon:'success'});
      } catch(error) {
        if(isPrivacyScopeError(error)) console.warn('复制预设码失败：微信隐私指引缺少对应声明',error);
        else console.warn('复制预设码失败',error);
        wx.showToast({title:'复制失败，请稍后重试',icon:'none'});
      }
      return;
    }
    if(result.tapIndex===1){const answer=await call('showModal',{title:'重命名',editable:true,content:row.name});if(!answer.confirm)return;savedPresets.save({...row,name:answer.content},row.id);}
    if(result.tapIndex===2){if(!this.source){wx.showToast({title:'请先选择图片',icon:'none'});return;}const answer=await call('showModal',{title:'覆盖预设',content:'用当前调色、画框及底部文字覆盖此预设。'});if(!answer.confirm)return;const next={...row,values:{...this.values},frame:{...this.frame}};savedPresets.save(next,row.id);}
    if(result.tapIndex===3){const answer=await call('showModal',{title:'删除预设',content:`确定删除「${row.name}」吗？好友已导入的副本不受影响。`});if(!answer.confirm)return;savedPresets.remove(row.id);}
    this.refreshPresets();
  }catch(e){
    if(String(e.errMsg||'').includes('cancel'))return;
    if(isPrivacyScopeError(e)) console.warn('复制或管理预设失败：微信隐私指引缺少对应声明',e);
    else this.error(e,'操作失败，请稍后重试');
  }},
  openPrivacy(){wx.openPrivacyContract({fail:error=>console.warn('打开隐私保护指引失败：请检查小程序后台配置',error)});},
  agreePrivacy(){if(this._privacyResolve)this._privacyResolve({buttonId:'privacyAgree',event:'agree'});this._privacyResolve=null;this.setData({privacyVisible:false});},
  declinePrivacy(){if(this._privacyResolve)this._privacyResolve({event:'disagree'});this._privacyResolve=null;this.setData({privacyVisible:false});}
});
