const crypto=require('crypto');
const APPID='wx01334577ba7ffaf5';
function digest(parts){return crypto.createHash('sha1').update(parts.sort().join('')).digest('hex');}
function equal(a,b){return typeof a==='string'&&typeof b==='string'&&a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));}
function verify(event,env=process.env,now=Date.now()){
 const token=env.WECHAT_CALLBACK_TOKEN,keyText=env.WECHAT_CALLBACK_AES_KEY;
 if(!token||!keyText||keyText.length!==43)throw new Error('callback not configured');
 const q=event.queryStringParameters||{};
 if(!/^\d+$/.test(String(q.timestamp||''))||Math.abs(now/1000-Number(q.timestamp))>300||typeof q.nonce!=='string')throw new Error('invalid callback timestamp');
 if(event.httpMethod==='GET'){
  if(!equal(q.signature,digest([token,q.timestamp,q.nonce])))throw new Error('invalid signature');
  return {echo:String(q.echostr||'')};
 }
 if(event.httpMethod!=='POST')throw new Error('invalid method');
 const raw=event.isBase64Encoded?Buffer.from(event.body||'','base64').toString('utf8'):event.body;
 if(typeof raw!=='string'||raw.length>100000)throw new Error('invalid body');
 let encrypted;
 if(raw.trim().startsWith('{'))encrypted=JSON.parse(raw).Encrypt;
 else {const match=raw.match(/<Encrypt>\s*(?:<!\[CDATA\[([A-Za-z0-9+/=]+)\]\]>|([A-Za-z0-9+/=]+))\s*<\/Encrypt>/);encrypted=match&&(match[1]||match[2]);}
 if(typeof encrypted!=='string'||!equal(q.msg_signature,digest([token,q.timestamp,q.nonce,encrypted])))throw new Error('invalid encrypted signature');
 const key=Buffer.from(keyText+'=','base64');if(key.length!==32)throw new Error('invalid key');
 const cipher=crypto.createDecipheriv('aes-256-cbc',key,key.subarray(0,16));cipher.setAutoPadding(false);
 const padded=Buffer.concat([cipher.update(Buffer.from(encrypted,'base64')),cipher.final()]);
 const n=padded[padded.length-1];if(n<1||n>32||!padded.subarray(-n).every(x=>x===n))throw new Error('invalid padding');
 const data=padded.subarray(0,-n);if(data.length<20)throw new Error('invalid payload');
 const length=data.readUInt32BE(16);if(length>data.length-20)throw new Error('invalid length');
 if(data.subarray(20+length).toString()!==APPID)throw new Error('invalid appid');
 // Configure JSON data format and safe/encrypted mode in WeChat message settings.
 const message=JSON.parse(data.subarray(20,20+length).toString('utf8'));
 if(message.appid!==APPID||message.Event!=='wxa_media_check'||message.MsgType!=='event'||message.version!==2||typeof message.trace_id!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(message.trace_id))throw new Error('invalid event');
 return {message};
}
module.exports={verify};
