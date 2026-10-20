const config=require('./config');
const KEY='photo.presets.v1',PREFIX='GY1:';
function validate(raw){
  if(!raw || raw.version!==1 || typeof raw.name!=='string' || !raw.name.trim() || raw.name.length>30)throw Error('预设名称或版本无效');
  const values={};
  for(const [key,,min,max] of config.adjustments){const n=raw.values&&raw.values[key];if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)throw Error('调色参数无效');values[key]=n;}
  const out={version:1,name:raw.name.trim(),values};
  if(raw.frame){out.frame={};if(typeof raw.frame.enabled!=='boolean')throw Error('画框参数无效');out.frame.enabled=raw.frame.enabled;for(const [key,,min,max] of config.frames){const n=raw.frame[key];if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)throw Error('画框参数无效');out.frame[key]=n;}if(raw.frame.caption!==undefined){if(typeof raw.frame.caption!=='string'||raw.frame.caption.length>60)throw Error('底部文字无效');out.frame.caption=raw.frame.caption;}}
  return out;
}
function read(){const rows=wx.getStorageSync(KEY);return Array.isArray(rows)?rows:[];}
function write(rows){wx.setStorageSync(KEY,rows);}
function save(payload,id){const rows=read(),old=rows.find(r=>r.id===id);const row={...validate(payload),id:id||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`,revision:old?old.revision:0,dirty:true,updatedAt:Math.max(Date.now(),(old&&old.updatedAt||0)+1)};write([row,...rows.filter(r=>r.id!==row.id)]);return row;}
function remove(id){write(read().map(r=>r.id===id?{...r,deleted:true,dirty:true,updatedAt:Math.max(Date.now(),r.updatedAt+1)}:r));}
function encode(row){return PREFIX+encodeURIComponent(JSON.stringify(validate(row)));}
function decode(code){if(typeof code!=='string'||code.length>12000||!code.trim().startsWith(PREFIX))throw Error('请输入完整的光影预设码');try{return validate(JSON.parse(decodeURIComponent(code.trim().slice(PREFIX.length))));}catch(e){throw Error('预设码无效或版本不支持');}}
let syncing;
function sync(){if(syncing)return syncing;syncing=runSync().finally(()=>{syncing=null;});return syncing;}
async function runSync(){
 const env=require('../cloud-config').env;if(!env)throw Error('尚未配置云环境，预设已保存在本机');
 const invoke=async data=>{const r=await wx.cloud.callFunction({name:'presets',data});if(r.result.error)throw Error(r.result.error);return r.result;};
 for(const row of read().filter(r=>r.dirty)){
  const result=await invoke({action:'put',row});
  // An edit made while the request was in flight remains queued.
  write(read().map(r=>r.id===row.id?{...r,revision:result.revision,dirty:r.updatedAt!==row.updatedAt}:r));
 }
 const result=await invoke({action:'list'}),local=read(),map=new Map(local.map(r=>[r.id,r]));
 for(const row of result.rows){const own=map.get(row.id);if(!own||!own.dirty)map.set(row.id,{...row,dirty:false});}
 write([...map.values()]);
}
module.exports={read,save,remove,encode,decode,validate,sync};
