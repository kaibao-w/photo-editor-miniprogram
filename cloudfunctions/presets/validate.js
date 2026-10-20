const config=require('./config');
function validate(raw){
  if(!raw || raw.version!==1 || typeof raw.name!=='string' || !raw.name.trim() || raw.name.length>30)throw Error('预设名称或版本无效');
  const values={};
  for(const [key,,min,max] of config.adjustments){const n=raw.values&&raw.values[key];if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)throw Error('调色参数无效');values[key]=n;}
  const out={version:1,name:raw.name.trim(),values};
  if(raw.frame){out.frame={};if(typeof raw.frame.enabled!=='boolean')throw Error('画框参数无效');out.frame.enabled=raw.frame.enabled;for(const [key,,min,max] of config.frames){const n=raw.frame[key];if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)throw Error('画框参数无效');out.frame[key]=n;}if(raw.frame.caption!==undefined){if(typeof raw.frame.caption!=='string'||raw.frame.caption.length>60)throw Error('底部文字无效');out.frame.caption=raw.frame.caption;}}
  return out;
}
module.exports={validate};
