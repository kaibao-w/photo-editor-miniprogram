const config=require('./config');
const addedDefaults={whites:0,blacks:0,vibrance:0};
const KEY='photo.presets.v1',PREFIX='GY1:';
function validate(raw){
  if(!raw || raw.version!==1 || typeof raw.name!=='string' || !raw.name.trim() || raw.name.length>30)throw Error('预设名称或版本无效');
  const values={};
  for(const [key,,min,max] of config.adjustments){const n=raw.values&&raw.values[key]===undefined&&Object.prototype.hasOwnProperty.call(addedDefaults,key)?0:raw.values&&raw.values[key];if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)throw Error('调色参数无效');values[key]=n;}
  const out={version:1,name:raw.name.trim(),values};
  if(raw.frame){out.frame={};if(typeof raw.frame.enabled!=='boolean')throw Error('画框参数无效');out.frame.enabled=raw.frame.enabled;for(const [key,,min,max] of config.frames){const n=raw.frame[key];if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)throw Error('画框参数无效');out.frame[key]=n;}if(raw.frame.caption!==undefined){if(typeof raw.frame.caption!=='string'||raw.frame.caption.length>60)throw Error('底部文字无效');out.frame.caption=raw.frame.caption;}}
  return out;
}
function read(){const rows=wx.getStorageSync(KEY);return Array.isArray(rows)?rows.map(row=>({...row,values:{...addedDefaults,...row.values}})):[];}
function write(rows){wx.setStorageSync(KEY,rows);}
function save(payload,id){const rows=read(),row={...validate(payload),id:id||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`,updatedAt:Date.now()};write([row,...rows.filter(r=>r.id!==row.id)]);return row;}
function remove(id){write(read().filter(r=>r.id!==id));}
function encode(row){return PREFIX+encodeURIComponent(JSON.stringify(validate(row)));}
function decode(code){if(typeof code!=='string'||code.length>12000||!code.trim().startsWith(PREFIX))throw Error('请输入完整的微光快调预设码');try{return validate(JSON.parse(decodeURIComponent(code.trim().slice(PREFIX.length))));}catch(e){throw Error('预设码无效或版本不支持');}}
module.exports={read,save,remove,encode,decode,validate};
