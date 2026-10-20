const cloud=require('wx-server-sdk'),crypto=require('crypto');
const {validate}=require('./validate');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
exports.main=async event=>{
 try{
 const owner=cloud.getWXContext().OPENID;if(!owner)throw Error('无法确认用户身份');
 const db=cloud.database(),collection=db.collection('user_presets');
 if(event.action==='list'){
  const rows=[];let offset=0;
  while(true){const page=await collection.where({owner}).orderBy('_id','asc').skip(offset).limit(100).get();rows.push(...page.data.map(({_id,owner,...row})=>row));if(page.data.length<100)break;offset+=100;}
  return {rows};
 }
 if(event.action!=='put')throw Error('不支持的操作');
 const raw=event.row;if(!raw||typeof raw.id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(raw.id)||!Number.isInteger(raw.revision)||raw.revision<0)throw Error('预设数据无效');
 const payload=validate(raw),id=crypto.createHash('sha256').update(owner+':'+raw.id).digest('hex');
 const result=await db.runTransaction(async transaction=>{
  const doc=await transaction.collection('user_presets').doc(id).get(),old=doc.data;
  const mutation=crypto.createHash('sha256').update(JSON.stringify({payload,revision:raw.revision,deleted:raw.deleted===true,updatedAt:raw.updatedAt})).digest('hex');
  if(old && old.mutation===mutation)return {revision:old.revision};
  if((old?old.revision:0)!==raw.revision)throw Error('预设存在跨设备修改冲突，请先将本地版本分享备份；详见接入文档');
  const revision=raw.revision+1;
  await transaction.collection('user_presets').doc(id).set({data:{...payload,id:raw.id,owner,revision,mutation,deleted:raw.deleted===true,updatedAt:Date.now()}});
  return {revision};
 });
 return result.result || result;
 }catch(e){return {error:e.message||'云同步失败'};}
};
