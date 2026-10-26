/**
 * WattStatus AI core, drawn with plain WebGL 2 (no three.js). It runs inside
 * a Worker on an OffscreenCanvas when the browser allows it, so creating the
 * GL context, compiling shaders and drawing never block the page; otherwise
 * the same code runs on the main thread.
 *
 * Three shells share one unit icosphere: an additive halo (back faces), a
 * bright nucleus, and the main shell with a fresnel rim and thin drifting
 * latitude lines. `energy` (0..1) follows the investigation stage.
 */

export interface CoreRenderer {
  resize: (width: number, height: number) => void;
  setEnergy: (energy: number) => void;
  setRunning: (running: boolean) => void;
  dispose: () => void;
}

// Ashima 3D simplex noise (MIT), compact form.
const NOISE = `
vec3 m289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 m289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 perm(vec4 x){return m289(((x*34.)+1.)*x);}
vec4 tis(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=m289(i);
  vec4 p=perm(perm(perm(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=tis(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

const VERTEX = `#version 300 es
precision highp float;
in vec3 aPos;
uniform mat4 uProj;
uniform float uTime, uEnergy, uAmp, uScale, uSpin;
out vec3 vNormal; out vec3 vView; out float vNoise; out vec3 vPos;
${NOISE}
void main(){
  float n = snoise(aPos * 1.1 + vec3(0., uTime * (0.06 + uEnergy * 0.1), 0.));
  vNoise = n;
  vec3 p = aPos * (1.0 + n * uAmp * (0.6 + uEnergy * 0.6)) * uScale;
  float c = cos(uSpin), s = sin(uSpin);
  vec3 r = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  vec3 nr = normalize(vec3(c * aPos.x + s * aPos.z, aPos.y, -s * aPos.x + c * aPos.z));
  vec3 view = r + vec3(0.0, 0.0, -5.2);
  vNormal = nr;
  vView = normalize(-view);
  vPos = aPos;
  gl_Position = uProj * vec4(view, 1.0);
}`;

const SHELL = `#version 300 es
precision highp float;
uniform float uTime, uEnergy;
in vec3 vNormal; in vec3 vView; in float vNoise; in vec3 vPos;
out vec4 color;
void main(){
  vec3 deep = vec3(0.047, 0.165, 0.125), emerald = vec3(0.271, 0.878, 0.643), mint = vec3(0.784, 1.0, 0.902);
  float fres = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.2);
  float lines = smoothstep(0.92, 1.0, abs(sin(vPos.y * 18.0 + vNoise * 1.5 + uTime * 0.2)));
  vec3 col = mix(deep, emerald, 0.18 + vNoise * 0.12);
  col += emerald * lines * 0.18 * (0.4 + uEnergy);
  col = mix(col, mint, fres * (0.6 + uEnergy * 0.3));
  float alpha = 0.32 + fres * 0.6 + lines * 0.1;
  color = vec4(col * alpha, alpha);
}`;

const HALO = `#version 300 es
precision highp float;
uniform float uEnergy;
in vec3 vNormal; in vec3 vView; in float vNoise; in vec3 vPos;
out vec4 color;
void main(){
  float fres = pow(1.0 - abs(dot(vNormal, vView)), 3.0);
  color = vec4(vec3(0.271, 0.878, 0.643) * fres * (0.35 + uEnergy * 0.4), 0.0);
}`;

const NUCLEUS = `#version 300 es
precision highp float;
uniform float uEnergy;
in vec3 vNormal; in vec3 vView; in float vNoise; in vec3 vPos;
out vec4 color;
void main(){
  float core = pow(max(dot(vNormal, vView), 0.0), 2.0);
  color = vec4(vec3(0.784, 1.0, 0.902) * core * (0.45 + uEnergy * 0.6), 0.0);
}`;

// Unit icosphere: subdivided icosahedron, indexed.
const icosphere = (detail: number) => {
  const t = (1 + Math.sqrt(5)) / 2;
  let positions: number[][] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(([x, y, z]) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; });
  let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let d = 0; d < detail; d++) {
    const cache = new Map<string, number>();
    const mid = (a: number, b: number) => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      let index = cache.get(key);
      if (index === undefined) {
        const [ax, ay, az] = positions[a];
        const [bx, by, bz] = positions[b];
        const m = [(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2];
        const l = Math.hypot(m[0], m[1], m[2]);
        index = positions.push([m[0] / l, m[1] / l, m[2] / l]) - 1;
        cache.set(key, index);
      }
      return index;
    };
    const next: number[][] = [];
    for (const [a, b, c] of faces) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  positions = positions.slice();
  return { positions: new Float32Array(positions.flat()), indices: new Uint32Array(faces.flat()) };
};

const perspective = (fovDeg: number, aspect: number, near: number, far: number) => {
  const f = 1 / Math.tan((fovDeg * Math.PI) / 360);
  const nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
};

export const createCoreRenderer = (
  canvas: HTMLCanvasElement | OffscreenCanvas,
  { onLost, onReady }: { onLost: () => void; onReady?: () => void },
): CoreRenderer | null => {
  const gl = canvas.getContext("webgl2", { alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: "low-power" }) as WebGL2RenderingContext | null;
  if (!gl) return null;
  const parallel = gl.getExtension("KHR_parallel_shader_compile");

  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  };
  const vertex = compile(gl.VERTEX_SHADER, VERTEX);
  const programs = [HALO, NUCLEUS, SHELL].map((fragment) => {
    const program = gl.createProgram()!;
    gl.attachShader(program, vertex);
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
    gl.bindAttribLocation(program, 0, "aPos");
    gl.linkProgram(program);
    return program;
  });

  const mesh = (detail: number) => {
    const { positions, indices } = icosphere(detail);
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const ibo = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, vbo, ibo, count: indices.length };
  };
  const shellMesh = mesh(5);
  const plainMesh = mesh(3);

  const uniforms = programs.map((program) => ({
    proj: gl.getUniformLocation(program, "uProj"),
    time: gl.getUniformLocation(program, "uTime"),
    energy: gl.getUniformLocation(program, "uEnergy"),
    amp: gl.getUniformLocation(program, "uAmp"),
    scale: gl.getUniformLocation(program, "uScale"),
    spin: gl.getUniformLocation(program, "uSpin"),
  }));

  let width = 1;
  let height = 1;
  let projection = perspective(32, 1, 0.1, 20);
  let energy = 0.5;
  let target = 0.5;
  let time = 0;
  let last = 0;
  let raf = 0;
  let running = false;
  let ready = false;
  let lost = false;

  const raf$ = (cb: FrameRequestCallback) => (self as unknown as { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame(cb);
  const caf$ = (id: number) => (self as unknown as { cancelAnimationFrame: typeof cancelAnimationFrame }).cancelAnimationFrame(id);

  const drawPass = (index: number, target$: ReturnType<typeof mesh>, amp: number, scale: number, cull: number) => {
    const u = uniforms[index];
    gl.useProgram(programs[index]);
    gl.uniformMatrix4fv(u.proj, false, projection);
    gl.uniform1f(u.time, time);
    gl.uniform1f(u.energy, energy);
    gl.uniform1f(u.amp, amp);
    gl.uniform1f(u.scale, scale);
    gl.uniform1f(u.spin, time * 0.05);
    gl.cullFace(cull);
    gl.bindVertexArray(target$.vao);
    gl.drawElements(gl.TRIANGLES, target$.count, gl.UNSIGNED_INT, 0);
  };

  const draw = () => {
    if (!ready || lost) return;
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST);
    // Halo and nucleus add light; the shell is premultiplied alpha over them.
    gl.blendFunc(gl.ONE, gl.ONE);
    drawPass(0, plainMesh, 0, 1.32, gl.FRONT);
    drawPass(1, plainMesh, 0.04, 0.4 + energy * 0.06 + Math.sin(time * 1.1) * 0.012, gl.BACK);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    drawPass(2, shellMesh, 0.035, 1, gl.BACK);
  };

  const tick = (now: number) => {
    raf = raf$(tick);
    if (now - last < 1000 / 30) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    time += dt;
    energy += (target - energy) * Math.min(1, dt * 2.5);
    draw();
  };
  const loop = () => {
    if (running && ready && !lost && !raf) {
      last = 0;
      raf = raf$(tick);
    }
  };

  // Wait for the programs without blocking (parallel compile when available).
  const whenLinked = () => {
    const done = !parallel || programs.every((program) => gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR));
    if (!done) {
      setTimeout(whenLinked, 16);
      return;
    }
    if (programs.some((program) => !gl.getProgramParameter(program, gl.LINK_STATUS))) {
      onLost();
      return;
    }
    ready = true;
    draw();
    onReady?.();
    loop();
  };
  whenLinked();

  const handleLost = (event: Event) => {
    event.preventDefault();
    lost = true;
    caf$(raf);
    raf = 0;
    onLost();
  };
  canvas.addEventListener("webglcontextlost", handleLost as EventListener);

  return {
    resize: (w, h) => {
      width = Math.max(1, Math.round(w));
      height = Math.max(1, Math.round(h));
      canvas.width = width;
      canvas.height = height;
      projection = perspective(32, width / height, 0.1, 20);
      draw();
    },
    setEnergy: (value) => {
      target = value;
      if (!running) {
        energy = value;
        draw();
      }
    },
    setRunning: (value) => {
      running = value;
      if (!value) {
        caf$(raf);
        raf = 0;
        draw();
      } else loop();
    },
    dispose: () => {
      caf$(raf);
      raf = 0;
      canvas.removeEventListener("webglcontextlost", handleLost as EventListener);
      if (lost) return;
      for (const m of [shellMesh, plainMesh]) {
        gl.deleteVertexArray(m.vao);
        gl.deleteBuffer(m.vbo);
        gl.deleteBuffer(m.ibo);
      }
      programs.forEach((program) => gl.deleteProgram(program));
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
};
