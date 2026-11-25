import type { MeshData } from './mesh';

export class Program {
  prog: WebGLProgram;
  private locs = new Map<string, WebGLUniformLocation | null>();
  constructor(public gl: WebGL2RenderingContext, vs: string, fs: string) {
    const mk = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        throw new Error(`shader compile failed: ${log}\n${src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n')}`);
      }
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`link failed: ${gl.getProgramInfoLog(p)}`);
    this.prog = p;
  }
  use(): this {
    this.gl.useProgram(this.prog);
    return this;
  }
  loc(name: string): WebGLUniformLocation | null {
    let l = this.locs.get(name);
    if (l === undefined) {
      l = this.gl.getUniformLocation(this.prog, name);
      this.locs.set(name, l);
    }
    return l;
  }
  m4(name: string, m: Float32Array): this {
    this.gl.uniformMatrix4fv(this.loc(name), false, m);
    return this;
  }
  f(name: string, v: number): this {
    this.gl.uniform1f(this.loc(name), v);
    return this;
  }
  i(name: string, v: number): this {
    this.gl.uniform1i(this.loc(name), v);
    return this;
  }
  v2(name: string, a: number, b: number): this {
    this.gl.uniform2f(this.loc(name), a, b);
    return this;
  }
  v3(name: string, a: number | ArrayLike<number>, b?: number, c?: number): this {
    if (typeof a === 'number') this.gl.uniform3f(this.loc(name), a, b!, c!);
    else this.gl.uniform3f(this.loc(name), a[0], a[1], a[2]);
    return this;
  }
  v4(name: string, a: number, b: number, c: number, d: number): this {
    this.gl.uniform4f(this.loc(name), a, b, c, d);
    return this;
  }
}

export class Mesh {
  vao: WebGLVertexArrayObject;
  count: number;
  radius: number;
  bufs: WebGLBuffer[] = [];
  constructor(public gl: WebGL2RenderingContext, d: MeshData) {
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const attr = (loc: number, data: ArrayBufferView, size: number, type: number, norm: boolean) => {
      const b = gl.createBuffer()!;
      this.bufs.push(b);
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, type, norm, 0, 0);
    };
    attr(0, d.pos, 3, gl.FLOAT, false);
    attr(1, d.nrm, 3, gl.FLOAT, false);
    attr(2, d.col, 4, gl.UNSIGNED_BYTE, true);
    if (d.uv) attr(3, d.uv, 2, gl.FLOAT, false);
    else {
      gl.disableVertexAttribArray(3);
      gl.vertexAttrib2f(3, 0, 0);
    }
    const ib = gl.createBuffer()!;
    this.bufs.push(ib);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, d.idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.count = d.idx.length;
    this.radius = d.radius;
  }
  draw(): void {
    if (!this.count) return;
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_INT, 0);
  }
  dispose(): void {
    for (const b of this.bufs) this.gl.deleteBuffer(b);
    this.gl.deleteVertexArray(this.vao);
    this.count = 0;
  }
}

export function texFromCanvas(gl: WebGL2RenderingContext, c: TexImageSource, opts: { repeat?: boolean; mips?: boolean; aniso?: number } = {}): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  const mips = opts.mips !== false;
  if (mips) gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const wrap = opts.repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, opts.repeat ? gl.REPEAT : gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  if (opts.aniso) {
    const ext = gl.getExtension('EXT_texture_filter_anisotropic');
    if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(opts.aniso, gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  }
  return t;
}

export class ShadowMap {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  constructor(public gl: WebGL2RenderingContext, public size: number) {
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, size, size);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    this.fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.tex, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
}
