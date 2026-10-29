// GPU preview mirrors image.grade; export still uses the original CPU pipeline.
const vertex=`attribute vec2 position; varying vec2 uv; void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
const fragment=`precision highp float;
varying vec2 uv; uniform sampler2D image;
uniform int mode; uniform float exposure,contrast,dehaze,saturation,temperature,tint,shadows,highlights;
uniform vec2 direction; uniform int radius;
void main(){
 if(mode==2){gl_FragColor=texture2D(image,vec2(uv.x,1.-uv.y));return;}
 if(mode==1){vec4 sum=vec4(0.);for(int i=-12;i<=12;i++){if(i>=-radius&&i<=radius)sum+=texture2D(image,uv+float(i)*direction);}gl_FragColor=sum/float(radius*2+1);return;}
 vec4 p=texture2D(image,uv);vec3 rgb=p.rgb*255.*exposure;
 float lum=clamp(dot(rgb,vec3(.2126,.7152,.0722))/255.,0.,1.);
 float shift=shadows*.85*(1.-lum)*(1.-lum)+highlights*.85*lum*lum;
 rgb=(rgb+shift)*vec3(1.+temperature*.0015,1.-tint*.0012,1.-temperature*.0015);
 float black=dehaze*.36;
 rgb=((rgb-black)*(255./(255.-black))-127.5)*contrast+127.5;
 float gray=dot(rgb,vec3(.2126,.7152,.0722));
 gl_FragColor=vec4(clamp((gray+(rgb-gray)*saturation)/255.,0.,1.),p.a);
}`;
class GPUPreview {
 constructor(create,backgroundOnly=false){
  this.create=create;this.backgroundOnly=backgroundOnly;
  this.canvas=create({type:'webgl',width:1,height:1});
  const gl=this.gl=this.canvas.getContext('webgl',{alpha:true,premultipliedAlpha:false,antialias:false,preserveDrawingBuffer:true});
  if(!gl)throw new Error('WebGL unavailable');
  this.textures=[];this.shaders=[];this.targets=[];
  try{
   const shader=(type,source)=>{const s=gl.createShader(type);this.shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error('Preview shader compilation failed');return s;};
   this.program=gl.createProgram();gl.attachShader(this.program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(this.program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(this.program);
   if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error('Preview shader linking failed');
   gl.useProgram(this.program);gl.disable(gl.BLEND);gl.disable(gl.DITHER);
   this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
   const location=gl.getAttribLocation(this.program,'position');gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,2,gl.FLOAT,false,0,0);
   this.uniforms={};for(const name of ['image','mode','direction','radius','exposure','contrast','dehaze','saturation','temperature','tint','shadows','highlights'])this.uniforms[name]=gl.getUniformLocation(this.program,name);
   this.maxTextureSize=gl.getParameter(gl.MAX_TEXTURE_SIZE);
   this.stats={resizes:0,uploads:0,draws:0};
   gl.uniform1i(this.uniforms.image,0);this.input=this.texture();
   this.targets=[this.target(),this.target(),this.target()];
  }catch(error){this.dispose();throw error;}
 }
 texture(){const g=this.gl,t=g.createTexture();this.textures.push(t);g.bindTexture(g.TEXTURE_2D,t);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);return t;}
 target(){return {texture:this.texture(),framebuffer:this.gl.createFramebuffer()};}
 size(target,w,h){const g=this.gl;if(target.width===w&&target.height===h)return;g.bindTexture(g.TEXTURE_2D,target.texture);g.texImage2D(g.TEXTURE_2D,0,g.RGBA,w,h,0,g.RGBA,g.UNSIGNED_BYTE,null);g.bindFramebuffer(g.FRAMEBUFFER,target.framebuffer);g.framebufferTexture2D(g.FRAMEBUFFER,g.COLOR_ATTACHMENT0,g.TEXTURE_2D,target.texture,0);if(g.checkFramebufferStatus(g.FRAMEBUFFER)!==g.FRAMEBUFFER_COMPLETE)throw new Error('Preview framebuffer unavailable');target.width=w;target.height=h;}
 draw(texture,target,w,h,mode){const g=this.gl;g.bindFramebuffer(g.FRAMEBUFFER,target?target.framebuffer:null);g.viewport(0,0,w,h);g.activeTexture(g.TEXTURE0);g.bindTexture(g.TEXTURE_2D,texture);g.uniform1i(this.uniforms.mode,mode);g.drawArrays(g.TRIANGLE_STRIP,0,4);this.stats.draws++;}
 present(texture,context,w,h){
  // Each renderer owns a stable output buffer. Native Canvas2D may defer consuming it.
  // Never draw a small background into the photo buffer after copying the photo.
  this.draw(texture,null,w,h,2);this.gl.flush();context.clearRect(0,0,w,h);
  context.drawImage(this.canvas,0,0,w,h);
 }
 render(source,values,comparing,photo,background,blur){
  const g=this.gl;if(g.isContextLost())throw new Error('Preview context lost');
  const w=source.width,h=source.height;
  if(w>this.maxTextureSize||h>this.maxTextureSize)throw new Error('Preview texture too large');
  const scale=Math.min(1,320/Math.max(w,h));
  const bw=Math.max(1,Math.round(w*scale)),bh=Math.max(1,Math.round(h*scale));
  const outputW=this.backgroundOnly?bw:w,outputH=this.backgroundOnly?bh:h;
  if(this.canvas.width!==outputW||this.canvas.height!==outputH){this.canvas.width=outputW;this.canvas.height=outputH;this.stats.resizes++;}
  const key=JSON.stringify([values,comparing]);
  if(this.source!==source||this.key!==key){
   if(this.source!==source){this.stats.uploads++;g.bindTexture(g.TEXTURE_2D,this.input);g.pixelStorei(g.UNPACK_ALIGNMENT,1);g.texImage2D(g.TEXTURE_2D,0,g.RGBA,w,h,0,g.RGBA,g.UNSIGNED_BYTE,new Uint8Array(source.data.buffer,source.data.byteOffset,source.data.byteLength));}
   for(const name of ['exposure','contrast','dehaze','saturation','temperature','tint','shadows','highlights']){
    const value=comparing?0:(values[name]||0);
    g.uniform1f(this.uniforms[name],name==='exposure'?2**value:name==='contrast'?2**(value/100):name==='saturation'?1+value/100:value);
   }
   this.size(this.targets[0],w,h);this.draw(this.input,this.targets[0],w,h,0);
   if(photo)this.present(this.targets[0].texture,photo,w,h);
   this.source=source;this.key=key;this.bgKey=null;
  }
  if(background&&!this.backgroundOnly){
   if(!this.backgroundRenderer){
    this.backgroundRenderer=new GPUPreview(this.create,true);
    this.stats.background=this.backgroundRenderer.stats;
   }
   this.backgroundRenderer.render(source,values,comparing,null,background,blur);
  }else if(background){
   if(background.canvas.width!==bw)background.canvas.width=bw;if(background.canvas.height!==bh)background.canvas.height=bh;
   if(this.bgKey!==blur){
    this.size(this.targets[1],bw,bh);this.size(this.targets[2],bw,bh);
    let texture=this.targets[0].texture;const radius=blur>0?Math.max(1,Math.round(blur*.12)):0;
    g.uniform1i(this.uniforms.radius,radius);
    for(let pass=0;pass<(blur>0?6:0);pass++){const target=this.targets[1+pass%2];g.uniform2f(this.uniforms.direction,pass%2?0:1/bw,pass%2?1/bh:0);this.draw(texture,target,bw,bh,1);texture=target.texture;}
    this.present(texture,background,bw,bh);this.bgKey=blur;
   }
  }
  if(g.getError()!==g.NO_ERROR)throw new Error('Preview GPU operation failed');
 }
 dispose(){if(this.backgroundRenderer){this.backgroundRenderer.dispose();this.backgroundRenderer=null;}const g=this.gl;if(!g)return;for(const target of this.targets||[])g.deleteFramebuffer(target.framebuffer);for(const t of this.textures||[])g.deleteTexture(t);for(const s of this.shaders||[])g.deleteShader(s);if(this.buffer)g.deleteBuffer(this.buffer);if(this.program)g.deleteProgram(this.program);const ext=g.getExtension('WEBGL_lose_context');if(ext)ext.loseContext();this.source=null;this.canvas.width=this.canvas.height=1;}
}
module.exports={GPUPreview,vertex,fragment};
