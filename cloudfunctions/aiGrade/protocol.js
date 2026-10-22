const ranges={exposure:[-2,2],contrast:[-100,100],dehaze:[0,100],highlights:[-100,100],shadows:[-100,100],whites:[-100,100],blacks:[-100,100],vibrance:[-100,100],saturation:[-100,100],temperature:[-100,100],tint:[-100,100]};
function values(raw){
  if(!raw || typeof raw!=='object' || Array.isArray(raw))throw Error('INVALID_VALUES');
  const out={};
  for(const [key,[min,max]] of Object.entries(ranges)){
    const n=raw[key];if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)throw Error('INVALID_VALUES');
    out[key]=key==='exposure'?Math.round(n*20)/20:Math.round(n);
  }
  return out;
}
function input(event){
  if(!event || typeof event.prompt!=='string'||!event.prompt.trim()||event.prompt.length>300)throw Error('INVALID_INPUT');
  if(typeof event.image!=='string'||event.image.length>800000||!/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(event.image))throw Error('INVALID_IMAGE');
  return {prompt:event.prompt.trim(),image:event.image,values:values({whites:0,blacks:0,vibrance:0,...event.values})};
}
function output(raw){
  if(!raw || !['ok','unsupported'].includes(raw.status))throw Error('INVALID_RESULT');
  if(raw.status==='unsupported')return {status:'unsupported'};
  if(typeof raw.summary!=='string'||!raw.summary.trim()||raw.summary.length>100)throw Error('INVALID_RESULT');
  return {status:'ok',values:values(raw.values),summary:raw.summary.trim()};
}
module.exports={ranges,values,input,output};
