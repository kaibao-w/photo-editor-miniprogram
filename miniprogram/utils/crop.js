const full=()=>({x:0,y:0,w:1,h:1,rotation:0});
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
function dimensions(w,h,rotation){return rotation%2?{width:h,height:w}:{width:w,height:h};}
function drawCrop(ctx,image,crop,width,height){
 const c=crop||full();
 if(c.rotation===0&&c.x===0&&c.y===0&&c.w===1&&c.h===1){ctx.drawImage(image,0,0,width,height);return;}
 const s=dimensions(image.width,image.height,c.rotation);
 ctx.save();ctx.scale(width/(c.w*s.width),height/(c.h*s.height));ctx.translate(-c.x*s.width,-c.y*s.height);
 if(c.rotation===1){ctx.translate(image.height,0);ctx.rotate(Math.PI/2);}
 if(c.rotation===2){ctx.translate(image.width,image.height);ctx.rotate(Math.PI);}
 if(c.rotation===3){ctx.translate(0,image.width);ctx.rotate(-Math.PI/2);}
 ctx.drawImage(image,0,0);ctx.restore();
}
function constrain(view,box,iw,ih){
 const scale=Math.max(view.scale,box.w/iw,box.h/ih);
 return {scale,x:clamp(view.x,box.x+box.w-iw*scale,box.x),y:clamp(view.y,box.y+box.h-ih*scale,box.y)};
}
function normalized(box,view,iw,ih,rotation){return {x:clamp((box.x-view.x)/(iw*view.scale),0,1),y:clamp((box.y-view.y)/(ih*view.scale),0,1),w:Math.min(1,box.w/(iw*view.scale)),h:Math.min(1,box.h/(ih*view.scale)),rotation};}
function resize(box,corner,dx,dy,ratio,bounds){
 const right=corner.includes('r'),bottom=corner.includes('b');
 const ax=right?box.x:box.x+box.w,ay=bottom?box.y:box.y+box.h;
 const maxW=right?bounds.width-ax:ax,maxH=bottom?bounds.height-ay:ay;
 let w=clamp(box.w+(right?dx:-dx),Math.min(40,maxW),maxW),h=clamp(box.h+(bottom?dy:-dy),Math.min(40,maxH),maxH);
 if(ratio){w=Math.min(Math.max(40,w),maxW,maxH*ratio);h=w/ratio;}
 return {x:right?ax:ax-w,y:bottom?ay:ay-h,w,h};
}
// Rotate the selection with the image so the same subject remains selected.
function rotateSelection(c){return {x:Math.max(0,1-c.y-c.h),y:c.x,w:c.h,h:c.w,rotation:(c.rotation+1)%4};}
function ratioBox(anchor,ratio,bounds){
 if(!ratio)return {...anchor};
 const cx=anchor.x+anchor.w/2,cy=anchor.y+anchor.h/2;
 const maxW=2*Math.min(cx-bounds.x,bounds.x+bounds.w-cx),maxH=2*Math.min(cy-bounds.y,bounds.y+bounds.h-cy);
 let w=Math.sqrt(anchor.w*anchor.h*ratio),h=w/ratio;
 const scale=Math.min(1,maxW/w,maxH/h);w*=scale;h*=scale;
 return {x:cx-w/2,y:cy-h/2,w,h};
}
module.exports={full,dimensions,drawCrop,constrain,normalized,resize,rotateSelection,ratioBox};
