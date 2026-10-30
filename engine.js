// Small dependency-free WebGL renderer. Matrices use column-major order.
export const vec = {
  sub: (a,b) => a.map((v,i)=>v-b[i]),
  cross: (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
  norm: a => {const l=Math.hypot(...a)||1;return a.map(v=>v/l)},
  dot: (a,b) => a.reduce((s,v,i)=>s+v*b[i],0),
};
export function multiply(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o;}
export function transform(x=0,y=0,z=0,ry=0,sx=1,sy=sx,sz=sx,rx=0){const c=Math.cos(ry),s=Math.sin(ry),cx=Math.cos(rx),sn=Math.sin(rx);return new Float32Array([c*sx,0,-s*sx,0,s*sn*sy,cx*sy,c*sn*sy,0,s*cx*sz,-sn*sz,c*cx*sz,0,x,y,z,1]);}
export function perspective(fov,aspect,near,far){const f=1/Math.tan(fov/2);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0]);}
export function lookAt(eye,target){const z=vec.norm(vec.sub(eye,target)),x=vec.norm(vec.cross([0,1,0],z)),y=vec.cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-vec.dot(x,eye),-vec.dot(y,eye),-vec.dot(z,eye),1]);}
export function color(hex){const n=parseInt(hex.replace('#',''),16);return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255];}
export class Geometry {
  constructor(){this.data=[];}
  triangle(a,b,c,col){const n=vec.norm(vec.cross(vec.sub(b,a),vec.sub(c,a)));for(const p of [a,b,c])this.data.push(...p,...n,...color(col));}
  quad(a,b,c,d,col){this.triangle(a,b,c,col);this.triangle(a,c,d,col);}
  box(x,y,z,w,h,d,col){const a=x-w/2,b=x+w/2,c=y-h/2,e=y+h/2,f=z-d/2,g=z+d/2;this.quad([a,c,g],[b,c,g],[b,e,g],[a,e,g],col);this.quad([b,c,f],[a,c,f],[a,e,f],[b,e,f],col);this.quad([a,e,g],[b,e,g],[b,e,f],[a,e,f],col);this.quad([a,c,f],[b,c,f],[b,c,g],[a,c,g],col);this.quad([b,c,g],[b,c,f],[b,e,f],[b,e,g],col);this.quad([a,c,f],[a,c,g],[a,e,g],[a,e,f],col);return this;}
  cylinder(x,y,z,r1,r2,h,col,n=10){for(let i=0;i<n;i++){const a=i*2*Math.PI/n,b=(i+1)*2*Math.PI/n, p=[x+Math.cos(a)*r1,y-h/2,z+Math.sin(a)*r1],q=[x+Math.cos(b)*r1,y-h/2,z+Math.sin(b)*r1],s=[x+Math.cos(a)*r2,y+h/2,z+Math.sin(a)*r2],t=[x+Math.cos(b)*r2,y+h/2,z+Math.sin(b)*r2];this.quad(q,p,s,t,col);if(r2)this.triangle([x,y+h/2,z],t,s,col);if(r1)this.triangle([x,y-h/2,z],p,q,col);}return this;}
  sphere(x,y,z,rx,ry,rz,col,n=10,rings=6){const p=(i,j)=>{const a=i*Math.PI*2/n,b=j*Math.PI/rings;return [x+Math.cos(a)*Math.sin(b)*rx,y+Math.cos(b)*ry,z+Math.sin(a)*Math.sin(b)*rz]};for(let j=0;j<rings;j++)for(let i=0;i<n;i++)this.quad(p(i,j),p(i+1,j),p(i+1,j+1),p(i,j+1),col);return this;}
  shadow(x,z,r=1){this.cylinder(x,.015,z,r,r,.006,'#889678',24);return this;}
}
export class Renderer {
  constructor(canvas){this.canvas=canvas;const gl=this.gl=canvas.getContext('webgl',{antialias:true,alpha:false});if(!gl)throw Error('WebGL을 사용할 수 없습니다. 브라우저의 하드웨어 가속을 켜거나 최신 브라우저로 접속해 주세요.');
    const vertex=`attribute vec3 position;attribute vec3 normal;attribute vec3 color;uniform mat4 vp;uniform mat4 model;varying mediump vec3 vColor;varying mediump vec3 vNormal;varying mediump vec3 world;void main(){vec4 p=model*vec4(position,1.);world=p.xyz;vNormal=normalize(mat3(model)*normal);vColor=color;gl_Position=vp*p;}`;
    const fragment=`precision mediump float;varying mediump vec3 vColor;varying mediump vec3 vNormal;varying mediump vec3 world;uniform vec3 sky;uniform vec3 eye;uniform float daylight;void main(){float sun=max(dot(normalize(vNormal),normalize(vec3(-.6,1.,.5))),0.);float light=.43+sun*.57;vec3 c=vColor*light*mix(vec3(.48,.61,.75),vec3(1.05,1.01,.9),daylight);float fog=smoothstep(27.,85.,distance(world,eye));gl_FragColor=vec4(mix(c,sky,fog),1.);}`;
    const shader=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
    const program=this.program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
    this.u=Object.fromEntries(['vp','model','sky','eye','daylight'].map(k=>[k,gl.getUniformLocation(program,k)]));this.a=['position','normal','color'].map(k=>gl.getAttribLocation(program,k));gl.enable(gl.DEPTH_TEST);
  }
  mesh(geo){const gl=this.gl,b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(geo.data),gl.STATIC_DRAW);return {buffer:b,count:geo.data.length/9};}
  resize(){const c=this.canvas,d=Math.min(devicePixelRatio||1,1.5),w=Math.round(c.clientWidth*d),h=Math.round(c.clientHeight*d);if(c.width!==w||c.height!==h){c.width=w;c.height=h;}this.gl.viewport(0,0,w,h);}
  begin(eye,target,theme,fov=Math.PI/4){const gl=this.gl;this.resize();this.eye=eye;this.target=target;this.fov=fov;const sky=color(theme==='night'?'#263c4d':theme==='rain'?'#a7b4bf':'#dce4ec');this.vp=multiply(perspective(this.fov,this.canvas.width/this.canvas.height,.1,140),lookAt(eye,target));gl.clearColor(...sky,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniformMatrix4fv(this.u.vp,false,this.vp);gl.uniform3fv(this.u.sky,sky);gl.uniform3fv(this.u.eye,eye);gl.uniform1f(this.u.daylight,theme==='night'?.05:theme==='rain'?.65:1);}
  draw(mesh,model=transform()){const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);this.a.forEach((a,i)=>{gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,3,gl.FLOAT,false,36,i*12)});gl.uniformMatrix4fv(this.u.model,false,model);gl.drawArrays(gl.TRIANGLES,0,mesh.count);}
  groundPoint(clientX,clientY,planeY=0){const r=this.canvas.getBoundingClientRect(),nx=(clientX-r.left)/r.width*2-1,ny=1-(clientY-r.top)/r.height*2;const forward=vec.norm(vec.sub(this.target,this.eye)),right=vec.norm(vec.cross(forward,[0,1,0])),up=vec.cross(right,forward),t=Math.tan(this.fov/2);const ray=forward.map((v,i)=>v+right[i]*nx*t*r.width/r.height+up[i]*ny*t);if(ray[1]>=-.001)return null;const k=(planeY-this.eye[1])/ray[1];return {x:this.eye[0]+ray[0]*k,y:this.eye[2]+ray[2]*k};}
  project(p){const m=this.vp;const v=[0,0,0,0];for(let r=0;r<4;r++)v[r]=m[r]*p[0]+m[4+r]*p[1]+m[8+r]*p[2]+m[12+r];return {x:(v[0]/v[3]+1)*this.canvas.clientWidth/2,y:(1-v[1]/v[3])*this.canvas.clientHeight/2,visible:v[3]>0};}
}
