const crop=require('./crop');
module.exports={
 beginCrop(){
  if(!this.source||this.data.busy)return;
  this._cropReturn=this.data.tab==='crop'?'presets':this.data.tab;
  this._cropRatio=0;
  this.cropDraft={...(this.crop||crop.full())};this.setData({tab:'crop',cropping:true,cropRatio:'free',comparing:false});this.prepareCropView();
 },
 prepareCropView(){
  const d=crop.dimensions(this.image.width,this.image.height,this.cropDraft.rotation),scale=Math.min(1,1200/Math.max(d.width,d.height));
  if(!this._cropPhoto)this._cropPhoto=this.createCanvas(1,1);
  this._cropPhoto.width=Math.round(d.width*scale);this._cropPhoto.height=Math.round(d.height*scale);
  const ctx=this._cropPhoto.getContext('2d');ctx.clearRect(0,0,this._cropPhoto.width,this._cropPhoto.height);
  crop.drawCrop(ctx,this.image,{...crop.full(),rotation:this.cropDraft.rotation},this._cropPhoto.width,this._cropPhoto.height);
  const w=this._cropPhoto.width,h=this._cropPhoto.height,s=Math.min((this.rect.width-36)/w,(this.rect.height-36)/h);
  this.cropView={scale:s,x:(this.rect.width-w*s)/2,y:(this.rect.height-h*s)/2};
  const c=this.cropDraft;this.cropBox={x:this.cropView.x+c.x*w*s,y:this.cropView.y+c.y*h*s,w:c.w*w*s,h:c.h*h*s};
  this.drawCropView();
 },
 drawCropView(){
  if(!this.ctx||!this.cropBox)return;
  const c=this.ctx,b=this.cropBox,v=this.cropView,{width:w,height:h}=this.rect;
  c.setTransform(this.dpr,0,0,this.dpr,0,0);c.fillStyle='#080b09';c.fillRect(0,0,w,h);
  c.drawImage(this._cropPhoto,v.x,v.y,this._cropPhoto.width*v.scale,this._cropPhoto.height*v.scale);
  c.fillStyle='rgba(0,0,0,.62)';c.fillRect(0,0,w,b.y);c.fillRect(0,b.y+b.h,w,h-b.y-b.h);c.fillRect(0,b.y,b.x,b.h);c.fillRect(b.x+b.w,b.y,w-b.x-b.w,b.h);
  c.strokeStyle='rgba(255,255,255,.75)';c.lineWidth=1;c.strokeRect(b.x,b.y,b.w,b.h);
  c.strokeStyle='rgba(255,255,255,.32)';c.beginPath();for(let i=1;i<3;i++){c.moveTo(b.x+b.w*i/3,b.y);c.lineTo(b.x+b.w*i/3,b.y+b.h);c.moveTo(b.x,b.y+b.h*i/3);c.lineTo(b.x+b.w,b.y+b.h*i/3);}c.stroke();
  c.strokeStyle='#c7eb92';c.lineWidth=3;c.beginPath();for(const [x,y,sx,sy] of [[b.x,b.y,1,1],[b.x+b.w,b.y,-1,1],[b.x,b.y+b.h,1,-1],[b.x+b.w,b.y+b.h,-1,-1]]){c.moveTo(x+sx*16,y);c.lineTo(x,y);c.lineTo(x,y+sy*16);}c.stroke();
 },
 cropRatioChange(e){
  if(!this.cropDraft)return;const key=e.currentTarget.dataset.key;
  const ratios={free:0,original:this._cropPhoto.width/this._cropPhoto.height,square:1,portrait:3/4,landscape:4/3,story:9/16,wide:16/9};
  const ratio=ratios[key];if(ratio===undefined)return;
  this._cropRatio=ratio;this.setData({cropRatio:key});
  if(ratio){const b=this.cropBox,center={x:b.x+b.w/2,y:b.y+b.h/2};let w=b.w,h=w/ratio;if(h>b.h){h=b.h;w=h*ratio;}this.cropBox={x:center.x-w/2,y:center.y-h/2,w,h};}
  this.drawCropView();
 },
 cropRotate(){if(!this.cropDraft)return;this.cropDraft={...crop.full(),rotation:(this.cropDraft.rotation+1)%4};this._cropRatio=0;this.setData({cropRatio:'free'});this.prepareCropView();},
 cropReset(){this.cropDraft=crop.full();this._cropRatio=0;this.setData({cropRatio:'free'});this.prepareCropView();},
 cropTouchStart(e){
  const t=e.touches;if(!t.length)return;const point=a=>({x:a.x===undefined?a.clientX-this.rect.left:a.x,y:a.y===undefined?a.clientY-this.rect.top:a.y});
  const a=point(t[0]),b=t[1]&&point(t[1]),r=this.cropBox;
  let corner=null;if(!b){for(const [key,x,y] of [['tl',r.x,r.y],['tr',r.x+r.w,r.y],['bl',r.x,r.y+r.h],['br',r.x+r.w,r.y+r.h]])if(Math.hypot(a.x-x,a.y-y)<28)corner=key;}
  this._cropGesture={a,b,corner,box:{...r},view:{...this.cropView}};
 },
 cropTouchMove(e){
  const g=this._cropGesture,t=e.touches;if(!g||!t.length)return;
  if(!!t[1]!==!!g.b){this.cropTouchStart(e);return;}
  const point=a=>({x:a.x===undefined?a.clientX-this.rect.left:a.x,y:a.y===undefined?a.clientY-this.rect.top:a.y});
  const a=point(t[0]),b=t[1]&&point(t[1]);
  if(g.corner)this.cropBox=crop.resize(g.box,g.corner,a.x-g.a.x,a.y-g.a.y,this._cropRatio,this.rect);
  else if(b){const old={x:(g.a.x+g.b.x)/2,y:(g.a.y+g.b.y)/2},now={x:(a.x+b.x)/2,y:(a.y+b.y)/2};const factor=Math.min(8/g.view.scale,Math.max(.1,Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,Math.hypot(g.a.x-g.b.x,g.a.y-g.b.y))));this.cropView={scale:g.view.scale*factor,x:now.x-(old.x-g.view.x)*factor,y:now.y-(old.y-g.view.y)*factor};}
  else this.cropView={...g.view,x:g.view.x+a.x-g.a.x,y:g.view.y+a.y-g.a.y};
  this.cropView=crop.constrain(this.cropView,this.cropBox,this._cropPhoto.width,this._cropPhoto.height);this.drawCropView();
 },
 cropTouchEnd(e){this._cropGesture=null;if(e.touches&&e.touches.length)this.cropTouchStart(e);},
 cancelCrop(){if(!this.data.cropping)return;this.cropDraft=null;this._cropGesture=null;this.setData({cropping:false,tab:this._cropReturn||'presets'});this.render();},
 applyCrop(){
  if(!this.cropDraft||this.data.busy)return;
  this.crop=crop.normalized(this.cropBox,this.cropView,this._cropPhoto.width,this._cropPhoto.height,this.cropDraft.rotation);
  this.cropDraft=null;this._cropGesture=null;this.setData({cropping:false,tab:this._cropReturn||'presets'});this.rebuildCrop();this.edit('裁剪 · 构图');this.fitView();
 },
 rebuildCrop(){
  if(!this.image)return;const c=this.crop||crop.full(),d=crop.dimensions(this.image.width,this.image.height,c.rotation),w=d.width*c.w,h=d.height*c.h,s=Math.min(1,1200/Math.max(w,h));
  const canvas=this.createCanvas(Math.max(1,Math.round(w*s)),Math.max(1,Math.round(h*s))),ctx=canvas.getContext('2d');
  crop.drawCrop(ctx,this.image,c,canvas.width,canvas.height);this.source=ctx.getImageData(0,0,canvas.width,canvas.height);canvas.width=canvas.height=1;
  this._dragSource=this._dragSourceOwner=this._gradedSource=null;this.view={zoom:1,x:0,y:0};
 }
};
