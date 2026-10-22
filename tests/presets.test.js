const test=require('node:test'),assert=require('node:assert/strict');
const store=require('../miniprogram/utils/presets'),config=require('../miniprogram/utils/config');
function setup(){let saved;global.wx={getStorageSync:()=>saved,setStorageSync:(k,v)=>{saved=JSON.parse(JSON.stringify(v));}};return {version:1,name:'夜景',values:config.defaults()};}
test('portable sharing validates and copies parameters without local identity',()=>{const row=setup();row.frame={...config.frameDefaults};const saved=store.save(row),imported=store.decode(store.encode(saved));assert.deepEqual(imported,row);assert.equal(imported.id,undefined);const copy=store.save(imported);assert.notEqual(copy.id,saved.id);});
test('rename updates the local record and deletion removes it locally',()=>{const row=store.save(setup());store.save({...row,name:'新名称'},row.id);assert.equal(store.read().length,1);assert.equal(store.read()[0].name,'新名称');store.remove(row.id);assert.equal(store.read().length,0);});
test('invalid codes and out of range parameters are rejected',()=>{setup();assert.throws(()=>store.decode('abc'));assert.throws(()=>store.decode('GY1:%XX'));assert.throws(()=>store.validate({version:1,name:'x',values:{...config.defaults(),exposure:200}}));});

test('legacy saved presets and share codes default only new controls to zero',()=>{
 const old=setup();for(const key of ['whites','blacks','vibrance'])delete old.values[key];
 global.wx.setStorageSync('photo.presets.v1',[{...old,id:'legacy',updatedAt:1}]);
 assert.deepEqual(store.read()[0].values,config.defaults());
 const decoded=store.decode('GY1:'+encodeURIComponent(JSON.stringify(old)));
 assert.deepEqual(decoded.values,config.defaults());
 const next={...old,values:{...config.defaults(),whites:25,blacks:-18,vibrance:35}};
 assert.deepEqual(store.decode(store.encode(next)),next);
 for(const key of ['whites','blacks','vibrance']){
  assert.throws(()=>store.validate({...next,values:{...next.values,[key]:101}}));
  assert.throws(()=>store.validate({...next,values:{...next.values,[key]:null}}));
 }
 delete old.values.exposure;assert.throws(()=>store.validate(old));
});
