const config=require('./config');
const cloudConfig=config.cloud;
const messages={UNAVAILABLE:'AI 暂时不可用，请稍后再试',RATE_LIMIT:'操作太快，请稍等 5 秒再试',TIMEOUT:'调色耗时较长，请稍后重试',FAILED:'调色未完成，请稍后重试'};
function validate(raw){
  // Older deployed functions return eight fields; retain neutral defaults for the new controls.
  raw={whites:0,blacks:0,vibrance:0,...raw};
  const values={};
  for(const [key,,min,max,step] of config.adjustments){
    const n=raw&&raw[key];if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)throw Error('INVALID_AI_RESULT');
    values[key]=Number((Math.round(n/step)*step).toFixed(4));
  }
  return values;
}
function api(name,args){return new Promise((resolve,reject)=>wx[name]({...args,success:resolve,fail:reject}));}
// Log only diagnostic fields, never the request object or image payload.
function diagnostic(error){
  let message=String(error&&(error.errMsg||error.message)||'Unknown error');
  message=message.replace(/sk-[A-Za-z0-9_.-]+/g,'[REDACTED_KEY]')
    .replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]')
    .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/gi,'[REDACTED_IMAGE]')
    .replace(/[A-Za-z0-9+/=]{120,}/g,'[REDACTED_DATA]');
  if(/"(?:prompt|image|messages|authorization)"\s*:/i.test(message))message='Error contained request data; inspect cloud diagnostic codes';
  const raw=error&&(error.errCode||error.errno||error.errNo||error.code);
  const code=raw!=null&&/^[A-Za-z0-9_.-]{1,80}$/.test(String(raw))?String(raw):'FAILED';
  return {code,message:message.slice(0,500)};
}
module.exports={
  aiInput(e){this.setData({aiPrompt:e.detail.value});},
  aiSuggestion(e){if(!this.data.aiBusy)this.setData({aiPrompt:e.currentTarget.dataset.prompt});},
  aiFocus(){this._aiInputFocused=true;},
  aiBlur(){this.resetAiKeyboard();},
  resetAiKeyboard(){
    this._aiInputFocused=false;
    this.setAiKeyboardHeight(0);
  },
  setAiKeyboardHeight(height){
    if(this.data.aiKeyboardHeight===height)return;
    // Measure only after the workspace has received its restored height.
    this.setData({aiKeyboardHeight:height},()=>{if(this._alive&&this.canvas)this.measure();});
  },
  aiKeyboard(e){
    const height=Math.max(0,Number(e.detail.height)||0);
    // Ignore late opening events after blur or after leaving the AI tab.
    if(height>0&&(!this._aiInputFocused||this.data.tab!=='ai'))return;
    this.setAiKeyboardHeight(height);
  },
  cancelAi(){
    this._aiRequest=(this._aiRequest||0)+1;
    if(this._aiCancel)this._aiCancel();
    if(this._alive)this.setData({aiBusy:false,aiStatus:'已取消，当前效果已保留'});
  },
  async aiThumbnail(){
    const node=await new Promise(resolve=>wx.createSelectorQuery().in(this).select('#ai-canvas').fields({node:true}).exec(rows=>resolve(rows&&rows[0]&&rows[0].node)));
    if(!node)throw Error('AI_CANVAS_UNAVAILABLE');
    let path;
    try{
      // Render an ungraded, metadata-free thumbnail. The original never leaves the device.
      const scale=Math.min(1,1024/Math.max(this.originalWidth,this.originalHeight));
      node.width=Math.max(1,Math.round(this.originalWidth*scale));node.height=Math.max(1,Math.round(this.originalHeight*scale));
      const ctx=node.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,node.width,node.height);ctx.drawImage(this.image,0,0,node.width,node.height);
      const file=await api('canvasToTempFilePath',{canvas:node,fileType:'jpg',quality:.7,width:node.width,height:node.height,destWidth:node.width,destHeight:node.height});
      path=file.tempFilePath;
      const result=await new Promise((resolve,reject)=>wx.getFileSystemManager().readFile({filePath:path,encoding:'base64',success:resolve,fail:reject}));
      if(result.data.length>799970)throw Error('AI_IMAGE_TOO_LARGE');
      return 'data:image/jpeg;base64,'+result.data;
    }finally{
      node.width=node.height=1;
      if(path)wx.getFileSystemManager().unlink({filePath:path,fail:()=>{}});
    }
  },
  async sendAi(){
    const prompt=(this.data.aiPrompt||'').trim();
    if(!this.source || !prompt || this.data.busy || this.data.aiBusy)return;
    if(!wx.cloud){wx.showToast({title:'请升级微信后重试',icon:'none'});return;}
    const id=this._aiRequest=(this._aiRequest||0)+1;
    const source=this.source,revision=this._editRevision||0,values={...this.values};
    const active=()=>this._alive && this._aiRequest===id;
    this.setData({aiBusy:true,aiStatus:'准备分析照片…'});
    let timer,stage='consent';
    try{
      if(!this._aiConsent){
        const answer=await api('showModal',{title:'开启 AI 调色',content:'AI 将根据照片和你的想法生成调色方案。照片缩略图、当前调色参数及你的描述将通过微信云函数发送至阿里云百炼，原图不会上传。详情见隐私保护指引。',confirmText:'同意使用',cancelText:'暂不使用'});
        if(!active())return;
        if(!answer.confirm){this.setData({aiStatus:'未发送照片，可继续手动调色'});return;}
        this._aiConsent=true;
      }
      stage='thumbnail';
      // Serialize thumbnail exports when a request is cancelled and immediately retried.
      if(this._aiPreparing)await this._aiPreparing.catch(()=>{});
      if(!active())return;
      const preparing=this.aiThumbnail();this._aiPreparing=preparing;
      let image;
      try{image=await preparing;}finally{if(this._aiPreparing===preparing)this._aiPreparing=null;}
      if(!active())return;
      if(this.source!==source || (this._editRevision||0)!==revision){this.setData({aiStatus:'图片效果已改变，请重新发送'});return;}
      this.setData({aiStatus:'正在分析照片与调色需求…'});
      stage='cloudFunction';
      const response=await Promise.race([
        wx.cloud.callFunction({name:cloudConfig.functionName,config:{env:cloudConfig.env},data:{image,prompt,values}}),
        new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('AI_TIMEOUT')),70000);this._aiCancel=()=>resolve(null);})
      ]);
      if(!active())return;
      if(this.source!==source || (this._editRevision||0)!==revision || this.data.busy){this.setData({aiStatus:'当前编辑已改变，未覆盖；请重新发送'});return;}
      stage='validateResult';
      const result=response&&response.result;
      if(!result || !result.ok){
        const details={stage,code:result&&Object.prototype.hasOwnProperty.call(messages,result.code)?result.code:'INVALID_RESPONSE'};
        details.environment=cloudConfig.env;
        details.functionName=cloudConfig.functionName;
        details.clientVersion='aiGrade.20261022.6';
        const version=result&&result.version;
        details.serverVersion=typeof version==='string'&&/^[A-Za-z0-9_.-]{1,80}$/.test(version)?version:'UNKNOWN';
        const requestId=response&&response.requestID;
        if(typeof requestId==='string'&&/^[A-Za-z0-9_.-]{1,128}$/.test(requestId))details.requestID=requestId;
        const server=result&&result.diagnostic;
        details.diagnosticPresent=!!server;
        for(const key of ['stage','reason','sdkCode','providerCode']){
          const value=server&&server[key];
          if(typeof value==='string'&&/^(?:-?\d{1,12}|[A-Za-z][A-Za-z0-9_.]{0,70})$/.test(value))details['server_'+key]=value;
        }
        console.warn('AI 云函数返回失败',details);
        const message=messages[result&&result.code]||messages.FAILED;
        this.setData({aiStatus:message});wx.showToast({title:message,icon:'none'});return;
      }
      if(result.status==='unsupported'){this.setData({aiStatus:'目前支持整体调色，请尝试描述亮度、冷暖或色彩风格'});wx.showToast({title:'目前仅支持整体调色',icon:'none'});return;}
      if(result.status!=='ok')throw Error('INVALID_AI_RESULT');
      const next=validate(result.values);
      if(typeof result.summary!=='string'||result.summary.length>100)throw Error('INVALID_AI_RESULT');
      stage='applyResult';
      this.values=next;this.setData({selectedPresetId:''});this.edit('AI · '+prompt.slice(0,18));
      this.setData({aiStatus:result.summary,aiPrompt:''});
    }catch(error){
      if(active()){
        console.warn('AI 调色失败',{stage,...diagnostic(error)});
        this.setData({aiStatus:'调色未完成，当前效果已保留，请重试'});
        wx.showToast({title:error.message==='AI_TIMEOUT'?messages.TIMEOUT:'调色未完成，请重试',icon:'none'});
      }
    }finally{
      clearTimeout(timer);
      if(active()){this._aiCancel=null;this.setData({aiBusy:false});}
    }
  }
};
