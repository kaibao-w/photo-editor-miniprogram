const crypto=require('crypto');
const {verify}=require('./callback');
const APPID='wx01334577ba7ffaf5';
const codeOf=value=>{const raw=value&&(value.errCode??value.errcode);return typeof raw==='number'?raw:(typeof raw==='string'&&/^-?\d+$/.test(raw)?Number(raw):NaN);};
const unavailable=()=>({status:'unavailable'});
function verdict(result){
 const code=codeOf(result),suggest=result&&result.result&&result.result.suggest;
 if(code===87014||(code===0&&['risky','review'].includes(suggest)))return 'blocked';
 return code===0&&suggest==='pass'?'pass':'unavailable';
}
function createHandler(cloud,log=console.warn,env=process.env){
 const reject=(reason,details={})=>{log('contentSafety: rejected',{reason,...details});return unavailable();};
 const timing=(stage,started)=>log('contentSafety: timing',{stage,ms:Math.max(0,Date.now()-started)});
 const db=()=>cloud.database();
 const jobs=()=>db().collection('content_safety_jobs');
 const receipts=()=>db().collection('content_safety_receipts');
 async function read(collection,id){try{return (await collection.doc(id).get()).data;}catch(e){if(e.code==='DATABASE_DOCUMENT_NOT_EXIST'||/document.*not.*exist/i.test(e.errMsg||e.message||''))return null;throw e;}}
 async function removeFile(fileID){if(!fileID)return;const result=await cloud.deleteFile({fileList:[fileID]});if(result.fileList&&result.fileList.some(x=>x.status!==0&&x.status!==-503003))throw new Error('file cleanup failed');}
 async function cleanup(){
  const now=Date.now();
  const expired=await jobs().where({expiresAt:db().command.lt(now)}).limit(100).get();
  for(const row of expired.data){await removeFile(row.fileID);await jobs().doc(row._id).remove();}
  await receipts().where({expiresAt:db().command.lt(now)}).remove();
 }
 return async event=>{
  try{
   if(event&&event.httpMethod){
    try{
     const verified=verify(event,env);
     if(verified.echo!==undefined)return {statusCode:200,headers:{'Content-Type':'text/plain'},body:verified.echo};
     const message=verified.message;
     // First authenticated result wins; duplicate deliveries cannot overwrite it.
     try{await receipts().add({data:{_id:message.trace_id,status:verdict(message),receivedAt:Date.now(),expiresAt:Date.now()+2*3600000}});}
     catch(error){if(!await read(receipts(),message.trace_id))throw error;}
     return {statusCode:200,headers:{'Content-Type':'text/plain'},body:'success'};
    }catch(error){
     const reasons=['callback token not configured','callback aes key not configured','invalid callback timestamp','invalid signature','invalid method','invalid body','invalid encrypted signature','invalid key','invalid padding','invalid payload','invalid length','invalid appid','invalid event'];
     const q=event.queryStringParameters||event.queryString||{};
     log('contentSafety: callback rejected',{reason:reasons.includes(error.message)?error.message:'callback_processing_failed',method:event.httpMethod,hasToken:!!env.WECHAT_CALLBACK_TOKEN,aesKeyLength:(env.WECHAT_CALLBACK_AES_KEY||'').length,hasTimestamp:!!q.timestamp,hasNonce:!!q.nonce,hasSignature:!!(q.signature||q.msg_signature)});
     return {statusCode:403,body:'rejected'};
    }
   }
   const {OPENID,APPID:caller}=cloud.getWXContext();
   if(event&&event.Type==='Timer'&&!OPENID){await cleanup();return {status:'cleaned'};}
   if(!OPENID||caller!==APPID)return reject('caller_identity',{hasOpenid:!!OPENID,hasAppid:!!caller,appidMatches:caller===APPID});
   if(event&&event.kind==='text'){
    if(typeof event.text!=='string'||event.text.length>2000)return unavailable();
    if(!event.text.trim())return {status:'pass'};
    const result=await cloud.openapi.security.msgSecCheck({openid:OPENID,scene:4,version:2,content:event.text});
    const status=verdict(result);if(status==='unavailable')log('contentSafety: text API failure',{code:codeOf(result)});
    return {status};
   }
   if(event&&event.kind==='poll'){
    if(typeof event.id!=='string'||!/^[a-f0-9]{32}$/.test(event.id))return unavailable();
    const job=await read(jobs(),event.id);
    if(!job||job.owner!==OPENID||job.expiresAt<Date.now())return unavailable();
    if(job.status!=='pending')return {status:job.status};
    if(!job.traceID)return {status:'pending'};
    const receipt=await read(receipts(),job.traceID);
    if(!receipt)return {status:'pending'};
    await jobs().doc(event.id).update({data:{status:receipt.status}});
    if(receipt.receivedAt&&job.submittedAt)log('contentSafety: timing',{stage:'callback_latency',ms:Math.max(0,receipt.receivedAt-job.submittedAt)});
    if(receipt.receivedAt)timing('callback_discovery',receipt.receivedAt);
    try{await removeFile(job.fileID);await jobs().doc(event.id).update({data:{fileID:''}});}catch(error){log('contentSafety: cleanup deferred');}
    return {status:receipt.status};
   }
   if(event&&event.kind==='image'){
    // Require callback setup before accepting uploads. Never accept client URLs/results.
    if(!env.WECHAT_CALLBACK_TOKEN||!env.WECHAT_CALLBACK_AES_KEY||env.WECHAT_CALLBACK_AES_KEY.length!==43)return reject('callback_configuration',{hasToken:!!env.WECHAT_CALLBACK_TOKEN,hasAesKey:!!env.WECHAT_CALLBACK_AES_KEY,aesKeyLength:(env.WECHAT_CALLBACK_AES_KEY||'').length});
    if(typeof event.base64!=='string'||event.base64.length>1400000||!/^[A-Za-z0-9+/]+={0,2}$/.test(event.base64))return reject('image_base64',{type:typeof event.base64,length:typeof event.base64==='string'?event.base64.length:0});
    const value=Buffer.from(event.base64,'base64');if(!value.length||value.length>1000000||value[0]!==255||value[1]!==216)return reject('image_format_or_size',{bytes:value.length,isJpeg:value[0]===255&&value[1]===216});
    const id=crypto.randomBytes(16).toString('hex'),expiresAt=Date.now()+3600000;
    const started=Date.now();
    const upload=await cloud.uploadFile({cloudPath:'content-safety/'+id+'.jpg',fileContent:value});
    timing('upload',started);
    try{
     await jobs().doc(id).set({data:{owner:OPENID,fileID:upload.fileID,status:'pending',expiresAt}});
     const urls=await cloud.getTempFileURL({fileList:[{fileID:upload.fileID,maxAge:3600}]});
     const url=urls.fileList&&urls.fileList[0]&&urls.fileList[0].tempFileURL;
     if(!url)throw new Error('missing temporary URL');
     const submittedAt=Date.now();
     const result=await cloud.openapi.security.mediaCheckAsync({openid:OPENID,scene:4,version:2,mediaType:2,mediaUrl:url});
     timing('api_submission',submittedAt);
     const traceID=result&&(result.traceId||result.trace_id);
     if(codeOf(result)!==0||typeof traceID!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(traceID)){log('contentSafety: submission rejected',{code:codeOf(result),hasTraceId:!!traceID});throw new Error('invalid submission');}
     await jobs().doc(id).update({data:{traceID,submittedAt}});
     timing('submission_total',started);
     return {status:'pending',id};
    }catch(error){try{await removeFile(upload.fileID);await jobs().doc(id).remove();}catch(cleanupError){log('contentSafety: cleanup deferred');}throw error;}
   }
   return unavailable();
  }catch(error){
   const code=codeOf(error);log('contentSafety: API failure',{code:Number.isFinite(code)?code:'unknown'});
   return code===87014?{status:'blocked'}:unavailable();
  }
 };
}
module.exports={createHandler,verdict};
