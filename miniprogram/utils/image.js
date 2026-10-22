function clamp(n){return Math.max(0,Math.min(255,n))}
// Non-destructive pixel grading: always start from the immutable source pixels.
function grade(data,v){
 const p=data.data,exposure=2**v.exposure,contrast=2**(v.contrast/100),black=v.dehaze*.36,gain=255/(255-black),sat=1+v.saturation/100,red=1+v.temperature*.0015,blue=1-v.temperature*.0015,green=1-v.tint*.0012;
 const whites=(v.whites||0)*.64,blacks=(v.blacks||0)*.64,vibrance=(v.vibrance||0)/100;
 for(let i=0;i<p.length;i+=4){
  let r=p[i]*exposure,g=p[i+1]*exposure,b=p[i+2]*exposure;
  let lum=Math.max(0,Math.min(1,(.2126*r+.7152*g+.0722*b)/255));
  const shift=v.shadows*.85*(1-lum)**2+v.highlights*.85*lum**2;
  r=(r+shift)*red;g=(g+shift)*green;b=(b+shift)*blue;
  r=((r-black)*gain-127.5)*contrast+127.5;g=((g-black)*gain-127.5)*contrast+127.5;b=((b-black)*gain-127.5)*contrast+127.5;
  // Smooth tonal-end weights: affect white/black levels more than midtones.
  lum=Math.max(0,Math.min(1,(.2126*r+.7152*g+.0722*b)/255));
  const levelShift=whites*lum**3+blacks*(1-lum)**3;
  r+=levelShift;g+=levelShift;b+=levelShift;
  const gray=.2126*r+.7152*g+.0722*b;
  const max=Math.max(0,r,g,b),min=Math.max(0,Math.min(r,g,b));
  const chroma=max>0?Math.min(1,(max-min)/max):0;
  // Prefer muted colors; neutral pixels stay neutral. Saturation=-100 stays monochrome.
  const colorScale=sat*(1+vibrance*(1-chroma));
  p[i]=clamp(gray+(r-gray)*colorScale);p[i+1]=clamp(gray+(g-gray)*colorScale);p[i+2]=clamp(gray+(b-gray)*colorScale);
 }
 return data;
}

function blurPixels(image,radius){const {width:w,height:h,data}=image;if(radius<1)return image;let src=new Uint8ClampedArray(data),dst=new Uint8ClampedArray(data.length);for(let pass=0;pass<3;pass++){for(const horizontal of [true,false]){const major=horizontal?h:w,minor=horizontal?w:h;for(let row=0;row<major;row++){for(let c=0;c<4;c++){let sum=0;const index=pos=>(horizontal?row*w+Math.max(0,Math.min(minor-1,pos)):Math.max(0,Math.min(minor-1,pos))*w+row)*4+c;for(let j=-radius;j<=radius;j++)sum+=src[index(j)];for(let pos=0;pos<minor;pos++){dst[index(pos)]=sum/(radius*2+1);sum+=src[index(pos+radius+1)]-src[index(pos-radius)]}}}[src,dst]=[dst,src]}}data.set(src);return image}
function frameGeometry(w,h,f){const caption=!!f.caption.trim(),scale=f.size/100,pw=w*scale,ph=h*scale;return {x:(w-pw)/2,y:(h-ph)*(caption?.38:.5),w:pw,h:ph,r:Math.min(pw,ph)*f.radius/100}}
function roundedPath(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath()}
function composeFrame(photo,c,f,createCanvas){const w=c.canvas.width,h=c.canvas.height;c.clearRect(0,0,w,h);c.fillStyle='#14171a';c.fillRect(0,0,w,h);
 const bg=createCanvas(1,1),scale=Math.min(1,320/Math.max(w,h));bg.width=Math.max(1,Math.round(w*scale));bg.height=Math.max(1,Math.round(h*scale));const b=bg.getContext('2d',{willReadFrequently:true});b.fillStyle='#14171a';b.fillRect(0,0,bg.width,bg.height);b.drawImage(photo,0,0,bg.width,bg.height);if(f.blur>0){const pixels=b.getImageData(0,0,bg.width,bg.height);b.putImageData(blurPixels(pixels,Math.max(1,Math.round(f.blur*.12))),0,0)}c.drawImage(f.blur?bg:photo,0,0,w,h);c.fillStyle=`rgba(0,0,0,${f.darkness/100})`;c.fillRect(0,0,w,h);
 const g=frameGeometry(w,h,f);c.save();c.shadowColor=`rgba(0,0,0,${f.shadow/100})`;c.shadowBlur=w*.035;c.shadowOffsetY=h*.01;c.fillStyle='#14171a';roundedPath(c,g.x,g.y,g.w,g.h,g.r);c.fill();c.restore();c.save();roundedPath(c,g.x,g.y,g.w,g.h,g.r);c.clip();c.drawImage(photo,g.x,g.y,g.w,g.h);c.restore();
 if(f.caption.trim()){c.save();c.font=`${Math.min(w*.022,(h-g.y-g.h)*.45)}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;c.fillStyle='#fff';c.textAlign='center';c.textBaseline='middle';c.fillText(f.caption.trim(),w/2,g.y+g.h+(h-g.y-g.h)*.5,w*.84);c.restore()}bg.width=bg.height=0;
}


module.exports={grade,blurPixels,frameGeometry,composeFrame};
