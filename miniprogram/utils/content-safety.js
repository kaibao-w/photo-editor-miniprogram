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
  let timer;
  try {
    if(!wx.cloud)throw failure('unavailable');
    const response=await Promise.race([
      wx.cloud.callFunction({name:'contentSafety',config:{env:ENV},data}),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(failure('unavailable')),25000);})
    ]);
    const status=response && response.result && response.result.status;
    if(allowPending&&status==='pending')return response.result;
    if(status!=='pass')throw failure(status==='blocked'?'blocked':'unavailable');
    return response.result;
  }catch(error){
    if(error.safety)throw error;
    console.warn('contentSafety: request failed',{code:error.errCode||error.errno||'unknown'});
    throw failure('unavailable');
  }finally{clearTimeout(timer);}
}
async function text(value) {if(value && value.trim())await request({kind:'text',text:value});}
// Keep only two pending jobs so retrying the same image need not submit again.
const pendingImages=new Map();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function image(canvas) {
  let path;
  try {
    const result=await call('canvasToTempFilePath',{canvas,fileType:'jpg',quality:.8,destWidth:canvas.width,destHeight:canvas.height});
    path=result.tempFilePath;
    const fs=wx.getFileSystemManager();
    const file=await new Promise((resolve,reject)=>fs.readFile({filePath:path,encoding:'base64',success:resolve,fail:reject}));
    let job=pendingImages.get(file.data);
    if(!job||job.expires<Date.now()){
      job=await request({kind:'image',base64:file.data},true);
      if(job.status!=='pending'||typeof job.id!=='string')throw failure('unavailable');
      if(pendingImages.size>=2)pendingImages.delete(pendingImages.keys().next().value);
      job.expires=Date.now()+3500000;pendingImages.set(file.data,job);
    }
    const deadline=Date.now()+60000;
    while(Date.now()<deadline){
      const result=await request({kind:'poll',id:job.id},true);
      if(result.status==='pass'){pendingImages.delete(file.data);return;}
      await delay(2000);
    }
    throw failure('pending');
  }catch(error){if(error.safety)throw error;throw failure('unavailable');}
  finally{if(path)wx.getFileSystemManager().unlink({filePath:path,fail(){}});}
}
module.exports={text,image,consent,failure};
