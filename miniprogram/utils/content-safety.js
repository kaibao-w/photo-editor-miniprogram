const loading=require('./loading');
const ENV = 'cloud1-d9gnhap66f1142761';
const CONSENT = 'contentSafetyConsent.v2';
const call = (name,args={}) => new Promise((resolve,reject)=>wx[name]({...args,success:resolve,fail:reject}));
function failure(status) {const error=new Error('Content safety');error.safety=status;return error;}
async function consent() {
  if(wx.getStorageSync(CONSENT)===true)return;
  const answer=await call('showModal',{title:'内容安全检测',content:'为保障内容安全，将把检测用图片及你输入的文字发送至微信内容安全服务。检测副本将临时存储，检测完成或过期后自动清理。是否同意？',confirmText:'同意',cancelText:'暂不使用'});
  if(!answer.confirm)throw failure('cancel');
  wx.setStorageSync(CONSENT,true);
}
async function request(data,allowPending=false) {
  await consent();
  let timer;const started=Date.now();
  try {
    if(!wx.cloud)throw failure('unavailable');
    const response=await Promise.race([
      wx.cloud.callFunction({name:'contentSafety',config:{env:ENV},data}),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(failure('unavailable')),25000);})
    ]);
    const status=response && response.result && response.result.status;
    if(allowPending&&status==='pending')return response.result;
    if(status!=='pass'){
      console.warn('contentSafety: response rejected',{stage:data.kind,status:['blocked','unavailable','pending'].includes(status)?status:'invalid_response'});
      throw failure(status==='blocked'?'blocked':'unavailable');
    }
    return response.result;
  }catch(error){
    if(error.safety)throw error;
    console.warn('contentSafety: request failed',{stage:data.kind,code:error.errCode||error.errno||'unknown'});
    throw failure('unavailable');
  }finally{clearTimeout(timer);if(data.kind!=='poll')timing('request_'+data.kind,started);}
}
async function detecting(action){
  await consent();
  const finish=loading.begin('安全检测中');
  try{return await action();}finally{finish();}
}
async function text(value,{foreground=true}={}) {
  if(!value || !value.trim())return;
  const action=()=>request({kind:'text',text:value});
  return foreground?detecting(action):action();
}
// Cache exact detection bytes plus editing scope, only in this app session.
const imageChecks=new Map();
const PASS_TTL=10*60*1000,JOB_TTL=3500000,MAX_CACHE_BYTES=8*1024*1024;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function timing(stage,started,extra={}){console.info('contentSafety: timing',{stage,ms:Math.max(0,Date.now()-started),...extra});}
function pollDelay(elapsed){return elapsed<3000?500:elapsed<10000?1000:3000;}
function remember(key,record){
  imageChecks.delete(key);imageChecks.set(key,record);
  let bytes=0;for(const k of imageChecks.keys())bytes+=k.length*2;
  while(imageChecks.size>4||bytes>MAX_CACHE_BYTES){const oldest=imageChecks.keys().next().value;bytes-=oldest.length*2;imageChecks.delete(oldest);}
}
async function prepareImage(canvas){
  let path,stage='canvas_export';const started=Date.now();
  try{
    const result=await call('canvasToTempFilePath',{canvas,fileType:'jpg',quality:.8,destWidth:canvas.width,destHeight:canvas.height});
    path=result.tempFilePath;stage='read_detection_file';
    const file=await new Promise((resolve,reject)=>wx.getFileSystemManager().readFile({filePath:path,encoding:'base64',success:resolve,fail:reject}));
    return file.data;
  }catch(error){
    console.warn('contentSafety: image preparation failed',{stage,code:error.errCode||error.errno||'unknown'});
    throw failure('unavailable');
  }finally{
    if(path)wx.getFileSystemManager().unlink({filePath:path,fail(){}});
    timing('prepare_image',started);
  }
}
async function checkPreparedImage(base64,{foreground=true,scope='',isCurrent=()=>true}={}){
  const started=Date.now(),key=scope+'\0'+base64;
  if(!isCurrent())throw failure('cancel');
  await consent();
  if(!isCurrent())throw failure('cancel');
  let record=imageChecks.get(key);
  if(record&&record.status==='pass'&&record.passUntil>Date.now()){
    remember(key,record);timing('image_cache_hit',started);return record.passUntil;
  }
  const finish=foreground?loading.begin('安全检测中'):()=>{};
  let polls=0;
  try{
    if(!record||record.expires<=Date.now()||(record.status==='pass'&&record.passUntil<=Date.now())){
      record={status:'pending',expires:Date.now()+JOB_TTL};
      // Share submission when two callers check the same image at the same time.
      record.submission=request({kind:'image',base64},true).then(result=>{
        if(result.status!=='pending'||typeof result.id!=='string')throw failure('unavailable');
        record.id=result.id;return result;
      });
      remember(key,record);
    }
    await record.submission;
    const deadline=Date.now()+60000,pollStarted=Date.now();
    while(Date.now()<deadline){
      if(!isCurrent())throw failure('cancel');
      if(record.status==='blocked')throw failure('blocked');
      if(record.status==='pass'&&record.passUntil>Date.now())return record.passUntil;
      const result=await request({kind:'poll',id:record.id},true);polls++;
      if(!isCurrent())throw failure('cancel');
      if(result.status==='pass'){
        record.status='pass';record.passUntil=Math.min(record.expires,Date.now()+PASS_TTL);
        remember(key,record);return record.passUntil;
      }
      await delay(Math.min(pollDelay(Date.now()-pollStarted),Math.max(0,deadline-Date.now())));
    }
    throw failure('pending');
  }catch(error){
    if(error.safety==='blocked')record.status='blocked';
    // Keep pending tasks for retries, but never cache a service failure as approval.
    if(error.safety!=='pending'&&error.safety!=='cancel'&&error.safety!=='blocked'&&imageChecks.get(key)===record)imageChecks.delete(key);
    throw error;
  }finally{finish();timing('image_check_total',started,{polls});}
}
async function image(canvas,options){
  await consent();
  const base64=await prepareImage(canvas);
  return checkPreparedImage(base64,options);
}
module.exports={text,image,prepareImage,checkPreparedImage,consent,failure,pollDelay,PASS_TTL};
