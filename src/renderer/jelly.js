/* Self-contained WebGL soft-body sprite: an image stretched over a spring-mesh
   grid so it jiggles, squashes and stretches like jelly. No dependencies.
   Physics runs in LOCAL space (centre x=0, ground y=0); setOrigin() places it
   anywhere on the full-screen overlay without resetting the jiggle. */
(function (global) {
  const V = `attribute vec2 aPos; attribute vec2 aUV; uniform vec2 uRes; varying vec2 vUV;
    void main(){ vUV=aUV; gl_Position=vec4(aPos.x/uRes.x*2.0-1.0, 1.0-aPos.y/uRes.y*2.0, 0.0, 1.0); }`;
  const F = `precision mediump float; varying vec2 vUV; uniform sampler2D uTex;
    void main(){ vec4 c=texture2D(uTex,vUV); if(c.a<0.003) discard; gl_FragColor=c; }`;
  function sh(gl,t,s){const o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);
    if(!gl.getShaderParameter(o,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(o));return o;}

  class Jelly {
    constructor(canvas, opts={}){
      this.c=canvas; const gl=this.gl=canvas.getContext('webgl',{premultipliedAlpha:false,alpha:true,antialias:true});
      this.N=opts.grid||12; this.squish=opts.squish==null?1:opts.squish;
      this.k=opts.stiffness||130; this.damp=opts.damp||5.2; this.coupling=opts.coupling==null?0.3:opts.coupling;
      this.ox=0; this.oy=0;
      this.prog=gl.createProgram();
      gl.attachShader(this.prog,sh(gl,gl.VERTEX_SHADER,V)); gl.attachShader(this.prog,sh(gl,gl.FRAGMENT_SHADER,F));
      gl.linkProgram(this.prog); gl.useProgram(this.prog);
      this.aPos=gl.getAttribLocation(this.prog,'aPos'); this.aUV=gl.getAttribLocation(this.prog,'aUV');
      this.uRes=gl.getUniformLocation(this.prog,'uRes'); this.uTex=gl.getUniformLocation(this.prog,'uTex');
      this.posBuf=gl.createBuffer(); this.uvBuf=gl.createBuffer(); this.idxBuf=gl.createBuffer();
      gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
      this.ready=false;
    }
    load(img){ const gl=this.gl,N=this.N;
      this.tex=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,this.tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      const uv=[],idx=[]; for(let j=0;j<=N;j++)for(let i=0;i<=N;i++)uv.push(i/N,j/N);
      const vid=(i,j)=>j*(N+1)+i;
      for(let j=0;j<N;j++)for(let i=0;i<N;i++){const a=vid(i,j),b=vid(i+1,j),c=vid(i,j+1),d=vid(i+1,j+1);idx.push(a,b,c,b,d,c);}
      gl.bindBuffer(gl.ARRAY_BUFFER,this.uvBuf); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(uv),gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.idxBuf); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(idx),gl.STATIC_DRAW);
      this.idxCount=idx.length; this.ready=true;
    }
    place(w,h){ const N=this.N,n=(N+1)*(N+1); this.w=w; this.h=h;
      this.restx=new Float32Array(n); this.resty=new Float32Array(n);
      this.px=new Float32Array(n); this.py=new Float32Array(n); this.vx=new Float32Array(n); this.vy=new Float32Array(n);
      for(let j=0;j<=N;j++)for(let i=0;i<=N;i++){const k=j*(N+1)+i; const rx=-w/2+i/N*w, ry=-h+j/N*h;
        this.restx[k]=rx; this.resty[k]=ry; this.px[k]=rx; this.py[k]=ry; }
    }
    resize(w,h){ if(this.w===w&&this.h===h) return; // rescale current deformation to new size
      const sx=w/this.w, sy=h/this.h, N=this.N,n=(N+1)*(N+1);
      for(let i=0;i<n;i++){ this.restx[i]*=sx; this.resty[i]*=sy; this.px[i]*=sx; this.py[i]*=sy; }
      this.w=w; this.h=h;
    }
    setOrigin(ox,oy){ this.ox=ox; this.oy=oy; }
    impulse(sx,sy){ const N=this.N; for(let j=0;j<=N;j++)for(let i=0;i<=N;i++){const k=j*(N+1)+i;
      this.px[k]=this.restx[k]*sx; this.py[k]=this.resty[k]*sy; this.vx[k]=0; this.vy[k]=0; } }
    squash(a){ a*=this.squish; this.impulse(1+0.55*a,1-0.6*a); }
    stretch(a){ a*=this.squish; this.impulse(1-0.30*a,1+0.45*a); }
    step(dt){ this._wt=(this._wt||0)+dt; const N=this.N,n=(N+1)*(N+1),k=this.k,damp=Math.exp(-this.damp*dt),cpl=this.coupling;
      const px=this.px,py=this.py,vx=this.vx,vy=this.vy,rx=this.restx,ry=this.resty,id=(i,j)=>j*(N+1)+i;
      for(let i=0;i<n;i++){ vx[i]+=k*(rx[i]-px[i])*dt; vy[i]+=k*(ry[i]-py[i])*dt; }
      const nvx=new Float32Array(n),nvy=new Float32Array(n);
      for(let j=0;j<=N;j++)for(let i=0;i<=N;i++){const c=id(i,j);let sx=0,sy=0,cnt=0;
        if(i>0){sx+=vx[id(i-1,j)];sy+=vy[id(i-1,j)];cnt++;} if(i<N){sx+=vx[id(i+1,j)];sy+=vy[id(i+1,j)];cnt++;}
        if(j>0){sx+=vx[id(i,j-1)];sy+=vy[id(i,j-1)];cnt++;} if(j<N){sx+=vx[id(i,j+1)];sy+=vy[id(i,j+1)];cnt++;}
        nvx[c]=vx[c]+((sx/cnt)-vx[c])*cpl; nvy[c]=vy[c]+((sy/cnt)-vy[c])*cpl; }
      for(let i=0;i<n;i++){ vx[i]=nvx[i]*damp; vy[i]=nvy[i]*damp; px[i]+=vx[i]*dt; py[i]+=vy[i]*dt; }
      for(let i=0;i<=N;i++){ const c=id(i,N); py[c]=0; vy[c]=0; } // feet planted at local ground
    }
    clear(){ const gl=this.gl; gl.viewport(0,0,this.c.width,this.c.height); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT); }
    getBounds(){ let a=1e9,b=1e9,cc=-1e9,d=-1e9,n=(this.N+1)*(this.N+1);
      for(let i=0;i<n;i++){const x=this.px[i],y=this.py[i];if(x<a)a=x;if(y<b)b=y;if(x>cc)cc=x;if(y>d)d=y;}
      return {minx:a+this.ox,miny:b+this.oy,maxx:cc+this.ox,maxy:d+this.oy}; }
    draw(){ const gl=this.gl; gl.viewport(0,0,this.c.width,this.c.height);
      gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT); if(!this.ready) return;
      gl.useProgram(this.prog); gl.uniform2f(this.uRes,this.c.width,this.c.height);
      gl.bindBuffer(gl.ARRAY_BUFFER,this.posBuf); const N=this.N,n=(N+1)*(N+1),pos=new Float32Array(n*2);
      const wt=this._wt||0;
      for(let i=0;i<n;i++){ let x=this.px[i]+this.ox; const y=this.py[i]+this.oy;
        if(this.wave){ const j=(i/(N+1))|0; if(j>=N-3){ const col=i%(N+1), d=(j-(N-3))/3; x+=Math.sin(wt*3.2+col*0.9)*this.h*0.055*d; } }
        pos[i*2]=x; pos[i*2+1]=y; }
      gl.bufferData(gl.ARRAY_BUFFER,pos,gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.aPos); gl.vertexAttribPointer(this.aPos,2,gl.FLOAT,false,0,0);
      gl.bindBuffer(gl.ARRAY_BUFFER,this.uvBuf); gl.enableVertexAttribArray(this.aUV); gl.vertexAttribPointer(this.aUV,2,gl.FLOAT,false,0,0);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,this.tex); gl.uniform1i(this.uTex,0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.idxBuf); gl.drawElements(gl.TRIANGLES,this.idxCount,gl.UNSIGNED_SHORT,0);
    }
  }
  global.Jelly=Jelly;
})(window);
