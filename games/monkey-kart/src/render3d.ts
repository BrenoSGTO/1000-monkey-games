import { DRIVERS } from './drivers';
import type { Fx } from './fx';
import { Mesh, Program, ShadowMap, texFromCanvas } from './gl/gfx';
import { type M4, copy, hex3, heading, invert, lookAt, m4, mul, ortho, perspective, rotX, rotY, rotZ, scale, translate } from './gl/math';
import { MeshBuilder, type MeshData } from './gl/mesh';
import * as S from './gl/shaders';
import type { Kart } from './kart';
import {
  bananaPeelMesh,
  bannerMesh,
  beeMesh,
  chineloMesh,
  cocoMesh,
  gantryMesh,
  hazardMesh,
  itemBoxMesh,
  kartModel,
  postMesh,
  propellerMesh,
  sceneryVariants,
} from './models';
import { itemBoxFace } from './objsprites';
import { buildTerrain, type Terrain } from './terrain';
import { THEME_STYLES, paintBackdrop, paintTrackTexture } from './trackart';
import { type Theme, type Track, WORLD, hazardPos } from './tracks';
import { EXPR_CRY, EXPR_HAPPY, EXPR_NORMAL, EXPR_SCREAM } from './types';
import { clamp, mulberry32 } from './util';
import type { World } from './world';

interface Look {
  sunDir: [number, number, number];
  sun: string;
  sunK: number;
  sky: string;
  skyK: number;
  gnd: string;
  gndK: number;
  fogDen: number;
  fogStart: number;
  cliff: string;
  cliff2: string;
  deep: string;
  shallow: string;
  murky: number;
  panoTop: number;
}

function dir(az: number, el: number): [number, number, number] {
  return [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
}

const LOOKS: Record<Theme, Look> = {
  jungle: { sunDir: dir(-2.2, 0.95), sun: '#fff1d0', sunK: 1.05, sky: '#9ad7ff', skyK: 0.55, gnd: '#4a6b32', gndK: 0.55, fogDen: 1 / 3200, fogStart: 500, cliff: '#5b4632', cliff2: '#3d5a2a', deep: '#1e4a3a', shallow: '#4f8f6a', murky: 0.7, panoTop: 0.3 },
  favela: { sunDir: dir(-2.6, 0.42), sun: '#ffc08a', sunK: 1.15, sky: '#8f7ad6', skyK: 0.55, gnd: '#6b4a3a', gndK: 0.5, fogDen: 1 / 3000, fogStart: 500, cliff: '#8a6a50', cliff2: '#6b5a48', deep: '#24304a', shallow: '#3a4a6a', murky: 0.5, panoTop: 0.32 },
  beach: { sunDir: dir(-1.9, 1.0), sun: '#fffaf0', sunK: 1.08, sky: '#a8e4ff', skyK: 0.6, gnd: '#e3c690', gndK: 0.45, fogDen: 1 / 4200, fogStart: 700, cliff: '#d9b77a', cliff2: '#c9a466', deep: '#0b6fa8', shallow: '#3fd6d0', murky: 0, panoTop: 0.28 },
  space: { sunDir: dir(-2.4, 0.8), sun: '#e6e9ff', sunK: 1.0, sky: '#7c6be0', skyK: 0.55, gnd: '#3a2a7a', gndK: 0.5, fogDen: 1 / 4200, fogStart: 900, cliff: '#454c66', cliff2: '#120a2e', deep: '#000', shallow: '#000', murky: 0, panoTop: 0.3 },
};

export interface CamState {
  camH: number;
  shake: number;
  initialized: boolean;
  fov: number;
  eyeY: number;
  lookY: number;
  dist: number;
}

interface Chunk {
  mesh: Mesh;
  cx: number;
  cz: number;
  r: number;
}

interface KartVis {
  frame: number;
  spin: number;
  lean: number;
  pitch: number;
  headYaw: number;
}

const colorCache = new Map<string, [number, number, number, number]>();
function cssColor(c: string): [number, number, number, number] {
  let v = colorCache.get(c);
  if (v) return v;
  if (c.startsWith('rgb')) {
    const m = c.match(/[\d.]+/g) ?? ['255', '255', '255'];
    v = [+m[0] / 255, +m[1] / 255, +m[2] / 255, m[3] !== undefined ? +m[3] : 1];
  } else {
    const h = hex3(c);
    v = [h[0], h[1], h[2], 1];
  }
  colorCache.set(c, v);
  return v;
}

const PART_MAX = 4096;

export class Scene3D {
  gl: WebGL2RenderingContext;
  lit: Program;
  ground: Program;
  water: Program;
  sky: Program;
  part: Program;
  depth: Program;
  decal: Program;
  shadow: ShadowMap;
  track: Track | null = null;
  terrain: Terrain | null = null;
  groundMesh: Mesh | null = null;
  waterMesh: Mesh | null = null;
  kerbMesh: Mesh | null = null;
  decalMesh: Mesh | null = null;
  chunks: Chunk[] = [];
  gantry: Mesh | null = null;
  banner: Mesh | null = null;
  bannerTex: WebGLTexture | null = null;
  groundTex: WebGLTexture | null = null;
  panoTex: WebGLTexture | null = null;
  hTex: WebGLTexture | null = null;
  boxTex: WebGLTexture;
  whiteTex: WebGLTexture;
  look: Look = LOOKS.jungle;
  theme: Theme = 'jungle';
  private meshCache = new Map<string, Mesh>();
  private kartVis = new Map<number, KartVis>();
  private partVao: WebGLVertexArrayObject;
  private partBuf: WebGLBuffer;
  private partF = new Float32Array(PART_MAX * 7);
  private partU8 = new Uint8Array(this.partF.buffer);
  private frame = 0;
  private partN = 0;
  private M = m4();
  private M2 = m4();
  private V = m4();
  private P = m4();
  VP = m4();
  private LVP = m4();
  private LV = m4();
  private LP = m4();
  private tmp = m4();
  camPos: [number, number, number] = [0, 0, 0];
  camRight: [number, number, number] = [1, 0, 0];
  camUp: [number, number, number] = [0, 1, 0];
  camFwd: [number, number, number] = [0, 0, 1];
  time = 0;
  maxTex: number;

  static create(canvas: HTMLCanvasElement): Scene3D | null {
    try {
      const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, premultipliedAlpha: true, powerPreference: 'high-performance' });
      if (!gl) return null;
      return new Scene3D(gl);
    } catch (e) {
      console.warn('WebGL2 indisponível, usando modo clássico', e);
      return null;
    }
  }

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.lit = new Program(gl, S.LIT_VS, S.LIT_FS);
    this.ground = new Program(gl, S.GROUND_VS, S.GROUND_FS);
    this.water = new Program(gl, S.WATER_VS, S.WATER_FS);
    this.sky = new Program(gl, S.SKY_VS, S.SKY_FS);
    this.part = new Program(gl, S.PART_VS, S.PART_FS);
    this.depth = new Program(gl, S.DEPTH_VS, S.DEPTH_FS);
    this.decal = new Program(gl, S.DECAL_VS, S.DECAL_FS);
    this.shadow = new ShadowMap(gl, 2048);
    this.boxTex = texFromCanvas(gl, itemBoxFace(), { aniso: 4 });
    const w = document.createElement('canvas');
    w.width = w.height = 4;
    const wg = w.getContext('2d')!;
    wg.fillStyle = '#fff';
    wg.fillRect(0, 0, 4, 4);
    this.whiteTex = texFromCanvas(gl, w, { mips: false });

    // particle quad + instance buffer
    this.partVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.partVao);
    const qb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.partBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.partBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.partF.byteLength, gl.DYNAMIC_DRAW);
    const stride = 7 * 4;
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(1, 1);
    // color packed as 4 bytes inside one float slot
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, stride, 16);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 20);
    gl.vertexAttribDivisor(3, 1);
    gl.bindVertexArray(null);
  }

  private mesh(key: string, make: () => MeshData): Mesh {
    let m = this.meshCache.get(key);
    if (!m) {
      m = new Mesh(this.gl, make());
      this.meshCache.set(key, m);
    }
    return m;
  }

  // ------------------------------------------------------------ track setup

  setTrack(track: Track): void {
    const gl = this.gl;
    // free previous track resources
    for (const c of this.chunks) c.mesh.dispose();
    this.chunks = [];
    for (const m of [this.groundMesh, this.waterMesh, this.kerbMesh, this.decalMesh, this.gantry, this.banner]) m?.dispose();
    for (const t of [this.groundTex, this.panoTex, this.hTex, this.bannerTex]) if (t) gl.deleteTexture(t);

    this.track = track;
    this.theme = track.def.theme;
    this.look = LOOKS[this.theme];
    const terrain = buildTerrain(track);
    this.terrain = terrain;

    // ground
    const gd: MeshData = {
      pos: terrain.pos,
      nrm: terrain.nrm,
      col: new Uint8Array((terrain.pos.length / 3) * 4).fill(255),
      uv: null,
      idx: terrain.idx,
      radius: 1e9,
    };
    this.groundMesh = new Mesh(gl, gd);
    const res = this.maxTex >= 4096 && !isLowEnd() ? 2 : 1;
    this.groundTex = texFromCanvas(gl, paintTrackTexture(track, res), { aniso: 16 });
    this.panoTex = texFromCanvas(gl, paintBackdrop(this.theme), { repeat: true });

    // height texture (water depth)
    this.hTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.hTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, terrain.hRes, terrain.hRes, 0, gl.RED, gl.FLOAT, terrain.hTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // water plane
    if (terrain.shape.water !== null) {
      const y = terrain.shape.water;
      const E = 4200;
      const b = new MeshBuilder();
      const n = 8;
      const pos: number[] = [];
      const idx: number[] = [];
      for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) pos.push(-E + ((WORLD + 2 * E) * i) / n, y, -E + ((WORLD + 2 * E) * j) / n);
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const a = j * (n + 1) + i;
          idx.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2);
        }
      void b;
      const cnt = pos.length / 3;
      this.waterMesh = new Mesh(gl, { pos: new Float32Array(pos), nrm: new Float32Array(cnt * 3), col: new Uint8Array(cnt * 4), uv: null, idx: new Uint32Array(idx), radius: 1e9 });
    } else this.waterMesh = null;

    this.buildKerbs(track);
    this.buildDecals(track);
    this.buildScenery(track, terrain);

    // gantry + banner
    this.gantry = new Mesh(gl, gantryMesh(track.halfW));
    this.banner = new Mesh(gl, bannerMesh(track.halfW));
    this.bannerTex = texFromCanvas(gl, bannerCanvas(), { aniso: 8 });
    this.kartVis.clear();
  }

  private buildKerbs(track: Track): void {
    const st = THEME_STYLES[track.def.theme];
    const A = hex3(st.kerbA), B = hex3(st.kerbB);
    const neon = track.def.theme === 'space';
    const pos: number[] = [];
    const nrm: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const hw = track.halfW;
    const prof: [number, number][] = [[hw - 2, 0.15], [hw + 3, 2.4], [hw + 19, 2.4], [hw + 24, 0.15]];
    const pn: [number, number][] = [[-0.4, 0.9], [0, 1], [0, 1], [0.4, 0.9]];
    const N = track.N;
    let acc = 0;
    for (const side of [-1, 1]) {
      acc = 0;
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        const seg = Math.hypot(track.px[j] - track.px[i], track.py[j] - track.py[i]);
        const c = Math.floor(acc / 32.5) % 2 ? B : A;
        acc += seg;
        const base = pos.length / 3;
        for (const k of [i, j]) {
          for (let p = 0; p < 4; p++) {
            const lat = prof[p][0] * side;
            pos.push(track.px[k] + track.nx[k] * lat, prof[p][1], track.py[k] + track.ny[k] * lat);
            const nl = pn[p][0] * side;
            nrm.push(track.nx[k] * nl, pn[p][1], track.ny[k] * nl);
            col.push(c[0] * 255, c[1] * 255, c[2] * 255, neon ? 150 : 0);
          }
        }
        for (let p = 0; p < 3; p++) {
          const a = base + p, b = base + p + 1, a2 = base + 4 + p, b2 = base + 4 + p + 1;
          if (side > 0) idx.push(a, a2, b, b, a2, b2);
          else idx.push(a, b, a2, b, b2, a2);
        }
      }
    }
    const cnt = pos.length / 3;
    void cnt;
    this.kerbMesh = new Mesh(this.gl, { pos: new Float32Array(pos), nrm: new Float32Array(nrm), col: new Uint8Array(col), uv: null, idx: new Uint32Array(idx), radius: 1e9 });
  }

  private buildDecals(track: Track): void {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (const p of track.pads) {
      const tx = p.tx, ty = p.ty;
      const nx = -ty, ny = tx;
      const L = p.len / 2, W = p.wid;
      const base = pos.length / 3;
      const corners: [number, number, number, number][] = [[-L, -W, 0, 0], [L, -W, 1, 0], [L, W, 1, 1], [-L, W, 0, 1]];
      for (const [a, b, u, v] of corners) {
        pos.push(p.x + tx * a + nx * b, 0.9, p.y + ty * a + ny * b);
        uv.push(u, v);
      }
      idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
    const cnt = pos.length / 3;
    this.decalMesh = new Mesh(this.gl, { pos: new Float32Array(pos), nrm: new Float32Array(cnt * 3), col: new Uint8Array(cnt * 4), uv: new Float32Array(uv), idx: new Uint32Array(idx), radius: 1e9 });
  }

  private buildScenery(track: Track, terrain: Terrain): void {
    const CH = 1024;
    const builders = new Map<string, { pos: number[]; nrm: number[]; col: number[]; idx: number[]; minX: number; maxX: number; minZ: number; maxZ: number; maxY: number }>();
    const variants = new Map<string, MeshData[]>();
    const rnd = mulberry32(track.def.seed * 31 + 7);
    const water = terrain.shape.water;
    const space = track.def.theme === 'space';
    const add = (kind: string, x: number, z: number, sc: number, yaw: number, yOverride?: number) => {
      let vs = variants.get(kind);
      if (!vs) {
        vs = sceneryVariants(kind, track.def.seed, kind.startsWith('house') || kind === 'tower' ? 6 : 4);
        variants.set(kind, vs);
      }
      const md = vs[Math.floor(rnd() * vs.length)];
      let y = yOverride ?? terrain.height(x, z);
      if (yOverride === undefined) {
        if (space && y < -5) y = -40 + rnd() * 120;
        if (kind === 'buoy' && water !== null) y = Math.max(y, water - 7);
      }
      const key = `${Math.floor(x / CH)},${Math.floor(z / CH)}`;
      let b = builders.get(key);
      if (!b) {
        b = { pos: [], nrm: [], col: [], idx: [], minX: 1e9, maxX: -1e9, minZ: 1e9, maxZ: -1e9, maxY: 0 };
        builders.set(key, b);
      }
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const base = b.pos.length / 3;
      for (let i = 0; i < md.pos.length; i += 3) {
        const lx = md.pos[i] * sc, ly = md.pos[i + 1] * sc, lz = md.pos[i + 2] * sc;
        const wx = x + lx * c - lz * s, wz = z + lx * s + lz * c, wy = y + ly;
        b.pos.push(wx, wy, wz);
        const nx = md.nrm[i], nz = md.nrm[i + 2];
        b.nrm.push(nx * c - nz * s, md.nrm[i + 1], nx * s + nz * c);
        if (wx < b.minX) b.minX = wx;
        if (wx > b.maxX) b.maxX = wx;
        if (wz < b.minZ) b.minZ = wz;
        if (wz > b.maxZ) b.maxZ = wz;
        if (wy > b.maxY) b.maxY = wy;
      }
      for (let i = 0; i < md.col.length; i++) b.col.push(md.col[i]);
      for (let i = 0; i < md.idx.length; i++) b.idx.push(md.idx[i] + base);
    };
    for (const sc of track.scenery) add(sc.kind, sc.x, sc.y, sc.scale, rnd() * Math.PI * 2);

    // bridge / light-bridge posts along shortcuts that cross the void
    if (track.def.theme === 'jungle' || track.def.theme === 'space') {
      const glow = track.def.theme === 'space';
      const pm = postMesh(glow ? '#475569' : '#78350f', glow);
      variants.set('__post', [pm]);
      for (const path of track.shortcuts) {
        for (let i = 2; i < path.length - 2; i += 4) {
          const a = path[i - 1], b2 = path[i + 1];
          const dx = b2.x - a.x, dy = b2.y - a.y;
          const l = Math.hypot(dx, dy) || 1;
          const nx = -dy / l, ny = dx / l;
          for (const s of [-1, 1]) {
            const x = path[i].x + nx * 46 * s, z = path[i].y + ny * 46 * s;
            const h = terrain.height(x, z);
            if (h > -6) continue;
            add('__post', x, z, 1, 0, -2);
            void h;
          }
        }
      }
    }
    // extra distant decor to fill the horizon
    const extra: Record<Theme, string[]> = {
      jungle: ['tree', 'tree', 'palm', 'rock'],
      favela: ['house', 'house2', 'tower', 'house'],
      beach: ['palm', 'rock', 'buoy'],
      space: ['asteroid', 'crystal', 'asteroid'],
    };
    const list = extra[track.def.theme];
    for (let i = 0; i < 260; i++) {
      const x = -1500 + rnd() * (WORLD + 3000);
      const z = -1500 + rnd() * (WORLD + 3000);
      const gx = Math.floor(x / 5), gz = Math.floor(z / 5);
      const d = gx >= 0 && gz >= 0 && gx < 1024 && gz < 1024 ? terrain.dist[gz * 1024 + gx] : 9999;
      if (d < 700) continue;
      const kind = list[Math.floor(rnd() * list.length)];
      if (track.def.theme === 'beach' && kind === 'palm') continue;
      add(kind, x, z, 1 + rnd() * 0.8, rnd() * 6.28, space ? -120 + rnd() * 300 : undefined);
    }

    for (const b of builders.values()) {
      const data: MeshData = { pos: new Float32Array(b.pos), nrm: new Float32Array(b.nrm), col: new Uint8Array(b.col), uv: null, idx: new Uint32Array(b.idx), radius: 0 };
      const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
      const r = Math.hypot(b.maxX - b.minX, b.maxZ - b.minZ, b.maxY) / 2 + 50;
      this.chunks.push({ mesh: new Mesh(this.gl, data), cx, cz, r });
    }
  }

  // ------------------------------------------------------------ rendering

  beginFrame(): void {
    this.frame++;
  }

  /** Vertical focal factor of the last projection (pixels per unit = f * h / (2 w)). */
  get focal(): number {
    return this.P[5];
  }

  /** Returns the view-projection matrix used (for 2D overlays). */
  renderView(world: World, k: Kart, st: CamState, fx: Fx, vx: number, vy: number, vw: number, vh: number, dt: number, canvasH: number): M4 {
    const gl = this.gl;
    const tr = this.track!;
    const L = this.look;
    this.time = world.clock;

    // ---------------- camera
    const boosting = k.boostT > 0 ? 1 : 0;
    const targetFov = (boosting ? 74 : 64) * (Math.PI / 180);
    if (!st.initialized) {
      st.camH = k.h;
      st.fov = targetFov;
      st.eyeY = 37;
      st.lookY = 20;
      st.dist = 90;
      st.initialized = true;
    }
    const rate = Math.min(1, dt * 6);
    const targetH = k.h - k.drift * 0.22;
    let dH = targetH - st.camH;
    dH = Math.atan2(Math.sin(dH), Math.cos(dH));
    st.camH += dH * rate;
    st.fov += (targetFov - st.fov) * Math.min(1, dt * 4);
    st.dist += ((boosting ? 100 : 90) - st.dist) * Math.min(1, dt * 3);
    const falling = k.fallT > 0;
    const ch = Math.cos(st.camH), sh = Math.sin(st.camH);
    let ex = k.x - ch * st.dist;
    let ez = k.y - sh * st.dist;
    let ey = st.eyeY;
    if (falling) ey += 10;
    // keep the camera above terrain
    const th = this.terrain!.height(ex, ez);
    if (ey < th + 14) ey = th + 14;
    const shk = st.shake;
    if (shk > 0.2) {
      ex += (Math.random() - 0.5) * shk * 0.8;
      ey += (Math.random() - 0.5) * shk * 0.8;
      ez += (Math.random() - 0.5) * shk * 0.8;
    }
    st.shake = Math.max(0, st.shake - dt * 28);
    const tx = k.x + ch * 40, tz = k.y + sh * 40;
    let ty = st.lookY;
    if (falling) ty -= (1 - k.fallT / 1.3) * 40;
    lookAt(this.V, ex, ey, ez, tx, ty, tz);
    const aspect = vw / vh;
    const fovY = aspect < 1 ? st.fov * 1.25 : st.fov;
    perspective(this.P, fovY, aspect, 4, 9000);
    mul(this.VP, this.P, this.V);
    this.camPos = [ex, ey, ez];
    const V = this.V;
    this.camRight = [V[0], V[4], V[8]];
    this.camUp = [V[1], V[5], V[9]];
    this.camFwd = [-V[2], -V[6], -V[10]];

    // ---------------- shadow pass
    const fx0 = k.x + ch * 380, fz0 = k.y + sh * 380;
    const SH = 760;
    const snap = (2 * SH) / this.shadow.size;
    const fxs = Math.round(fx0 / snap) * snap, fzs = Math.round(fz0 / snap) * snap;
    const sd = L.sunDir;
    lookAt(this.LV, fxs + sd[0] * 1500, sd[1] * 1500, fzs + sd[2] * 1500, fxs, 0, fzs);
    ortho(this.LP, -SH, SH, -SH, SH, 10, 3400);
    mul(this.LVP, this.LP, this.LV);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadow.fbo);
    gl.viewport(0, 0, this.shadow.size, this.shadow.size);
    gl.disable(gl.SCISSOR_TEST);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.disable(gl.BLEND);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(2, 4);
    const dp = this.depth.use();
    dp.m4('uLightVP', this.LVP);
    gl.disable(gl.CULL_FACE);
    const shadowRange = SH * 1.6;
    for (const c of this.chunks) {
      if (Math.hypot(c.cx - fxs, c.cz - fzs) > shadowRange + c.r) continue;
      dp.m4('uModel', ident16);
      c.mesh.draw();
    }
    this.drawDynamic(world, k, dt, true, fxs, fzs, shadowRange);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // ---------------- main pass
    const px = Math.round(vx), py = Math.round(canvasH - (vy + vh)), pw = Math.round(vw), ph = Math.round(vh);
    gl.viewport(px, py, pw, ph);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(px, py, pw, ph);
    const fog = hex3(THEME_STYLES[this.theme].fog);
    gl.clearColor(fog[0], fog[1], fog[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // sky
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    const sky = this.sky.use();
    invert(this.tmp, this.VP);
    sky.m4('uInvVP', this.tmp);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.panoTex);
    sky.i('uPano', 0).v3('uTop', hex3(THEME_STYLES[this.theme].skyTop)).v3('uFogCol', fog).v3('uSunDir', L.sunDir);
    sky.v3('uSunCol', mulK(hex3(L.sun), L.sunK)).f('uSpace', this.theme === 'space' ? 1 : 0).f('uTime', this.time).f('uPanoTop', L.panoTop);
    gl.bindVertexArray(null);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    // ground
    const g = this.ground.use();
    this.sceneUniforms(g, fog);
    g.m4('uVP', this.VP);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.groundTex);
    g.i('uTex', 0).f('uWorld', WORLD).v3('uCliffCol', hex3(L.cliff)).v3('uCliffCol2', hex3(L.cliff2)).f('uSpace', this.theme === 'space' ? 1 : 0);
    g.v3('uEdgeGlow', this.theme === 'space' ? [0.13, 0.75, 0.9] : [0, 0, 0]);
    gl.enable(gl.CULL_FACE);
    this.groundMesh!.draw();

    // static lit geometry
    const lp = this.lit.use();
    this.sceneUniforms(lp, fog);
    lp.m4('uVP', this.VP).m4('uModel', ident16).v4('uTint', 1, 1, 1, 1).v3('uAdd', 0, 0, 0).f('uSpec', 0.15).f('uUseTex', 0).f('uNoFog', 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.whiteTex);
    lp.i('uTex', 0);
    gl.disable(gl.CULL_FACE);
    this.kerbMesh!.draw();
    const far = 8000;
    for (const c of this.chunks) {
      if (!this.inView(c.cx, 0, c.cz, c.r, far)) continue;
      c.mesh.draw();
    }
    // gantry
    copy(this.M, ident16);
    translate(this.M, tr.px[0], 0, tr.py[0]);
    heading(this.M, Math.atan2(tr.ty[0], tr.tx[0]));
    lp.m4('uModel', this.M).f('uSpec', 0.3);
    this.gantry!.draw();
    gl.bindTexture(gl.TEXTURE_2D, this.bannerTex);
    lp.f('uUseTex', 1);
    this.banner!.draw();
    lp.f('uUseTex', 0);
    gl.bindTexture(gl.TEXTURE_2D, this.whiteTex);

    // dynamic objects
    this.drawDynamic(world, k, dt, false, k.x, k.y, far);

    // ---------------- transparent pass
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    // water
    if (this.waterMesh) {
      const w = this.water.use();
      this.sceneUniforms(w, fog);
      w.m4('uVP', this.VP);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.hTex);
      w.i('uHeight', 2);
      const hr = this.terrain!.hRect;
      w.v4('uHeightRect', hr[0], hr[1], hr[2], hr[3]);
      w.v3('uDeep', hex3(L.deep)).v3('uShallow', hex3(L.shallow)).f('uMurky', L.murky);
      gl.activeTexture(gl.TEXTURE0);
      this.waterMesh.draw();
    }
    // boost pads
    const dc = this.decal.use();
    dc.m4('uVP', this.VP).f('uTime', this.time);
    if (this.theme === 'space') dc.v3('uColA', 0.1, 0.8, 0.95).v3('uColB', 0.9, 0.4, 0.98);
    else dc.v3('uColA', 1, 0.55, 0.1).v3('uColB', 1, 0.95, 0.4);
    this.decalMesh!.draw();

    // item boxes
    this.drawItemBoxes(world, fog);

    // particles
    this.drawParticles(world, fx, fog);

    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    gl.bindVertexArray(null);
    return this.VP;
  }

  private sceneUniforms(p: Program, fog: number[]): void {
    const L = this.look;
    const gl = this.gl;
    p.v3('uSunDir', L.sunDir).v3('uSunCol', mulK(hex3(L.sun), L.sunK)).v3('uSkyCol', mulK(hex3(L.sky), L.skyK)).v3('uGndCol', mulK(hex3(L.gnd), L.gndK));
    p.v3('uFogCol', fog).f('uFogDen', L.fogDen).f('uFogStart', L.fogStart).v3('uCamPos', this.camPos);
    p.m4('uLightVP', this.LVP).f('uShadowOn', 1).f('uTime', this.time);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.shadow.tex);
    p.i('uShadow', 1);
    gl.activeTexture(gl.TEXTURE0);
  }

  private inView(x: number, y: number, z: number, r: number, far: number): boolean {
    const dx = x - this.camPos[0], dy = y - this.camPos[1], dz = z - this.camPos[2];
    const d = Math.hypot(dx, dy, dz);
    if (d - r > far) return false;
    const f = this.camFwd;
    const along = dx * f[0] + dy * f[1] + dz * f[2];
    if (along < -r) return false;
    // loose cone test
    const cosHalf = 0.35;
    return along + r > d * cosHalf || d < r;
  }

  /** Karts, items and hazards. depthOnly = shadow pass. */
  private drawDynamic(world: World, me: Kart, dt: number, depthOnly: boolean, cx: number, cz: number, range: number): void {
    const prog = depthOnly ? this.depth : this.lit;
    const tr = this.track!;
    const draw = (mesh: Mesh, M: M4, spec = 0.3) => {
      prog.m4('uModel', M);
      if (!depthOnly) prog.f('uSpec', spec);
      mesh.draw();
    };
    const near = (x: number, z: number, r = 80) => (depthOnly ? Math.hypot(x - cx, z - cz) < range + r : this.inView(x, 10, z, r, range));

    // karts
    for (const k of world.karts) {
      if (!near(k.x, k.y)) continue;
      if (!depthOnly && k.invulnT > 0 && Math.floor(this.time * 14) % 2 === 0 && k !== me) continue;
      // don't let a kart right behind us fill the whole screen
      if (!depthOnly && k !== me && Math.hypot(k.x - this.camPos[0], k.y - this.camPos[2]) < 48) continue;
      this.drawKart(k, draw, depthOnly ? 0 : dt, depthOnly);
    }

    // hazards
    for (const hz of tr.hazards) {
      const hp = hazardPos(tr, hz, world.clock);
      if (!near(hp.x, hp.y, 60)) continue;
      const mesh = this.mesh(`hz:${hz.kind}`, () => hazardMesh(hz.kind));
      const M = this.M;
      copy(M, ident16);
      const i = hz.i0;
      const tang = Math.atan2(tr.ty[i], tr.tx[i]);
      switch (hz.kind) {
        case 'crab': {
          translate(M, hp.x, Math.abs(Math.sin(this.time * 9 + hz.phase)) * 2, hp.y);
          heading(M, tang + Math.PI / 2 * 0 + Math.sin(this.time * 4) * 0.15);
          rotX(M, Math.sin(this.time * 18) * 0.08);
          break;
        }
        case 'dog': {
          const latV = hp.vx * tr.nx[i] + hp.vy * tr.ny[i];
          const dirH = Math.atan2(tr.ny[i], tr.nx[i]) + (latV < 0 ? Math.PI : 0);
          translate(M, hp.x, Math.abs(Math.sin(this.time * 12 + hz.phase)) * 4, hp.y);
          heading(M, dirH);
          rotZ(M, Math.sin(this.time * 12 + hz.phase) * 0.12);
          break;
        }
        case 'asteroid': {
          translate(M, hp.x, 34 + Math.sin(this.time * 2 + hz.phase) * 12, hp.y);
          rotY(M, this.time * 0.7 + hz.phase);
          rotX(M, this.time * 0.9);
          break;
        }
        case 'barrel':
          translate(M, hp.x, 0, hp.y);
          rotY(M, hz.phase);
          break;
        case 'log': {
          const lat = (hp.x - tr.px[i]) * tr.nx[i] + (hp.y - tr.py[i]) * tr.ny[i];
          translate(M, hp.x, 13, hp.y);
          heading(M, tang);
          rotX(M, lat / 13);
          break;
        }
      }
      draw(mesh, M, 0.2);
    }

    // items (non-box)
    for (const it of world.items) {
      if (!near(it.x, it.y, 40)) continue;
      const M = this.M;
      copy(M, ident16);
      switch (it.type) {
        case 'banana':
          translate(M, it.x, 0, it.y);
          rotY(M, it.id * 1.7);
          scale(M, 1.15, 1.15, 1.15);
          draw(this.mesh('banana', bananaPeelMesh), M, 0.6);
          break;
        case 'coco': {
          const bob = Math.abs(Math.sin(it.spin * 0.7)) * 5;
          translate(M, it.x, 14 + bob, it.y);
          heading(M, it.h);
          draw(this.mesh('coco', cocoMesh), M, 0.4);
          translate(M, 0, 16.5, 0);
          rotY(M, it.spin * 3);
          draw(this.mesh('prop', propellerMesh), M, 0.4);
          break;
        }
        case 'chinelo':
          translate(M, it.x, 18, it.y);
          rotY(M, -it.spin * 0.8);
          rotX(M, Math.sin(it.spin * 0.8) * 0.25);
          scale(M, 1.4, 1.4, 1.4);
          draw(this.mesh('chinelo', chineloMesh), M, 0.5);
          break;
        case 'enxame': {
          const bee = this.mesh('bee', beeMesh);
          for (let b = 0; b < 14; b++) {
            const a = b * 2.4 + this.time * 7 * (b % 2 ? 1 : -1);
            const rr = 14 + (b % 4) * 7;
            copy(M, ident16);
            translate(M, it.x + Math.cos(a) * rr * 1.3, 26 + Math.sin(a * 1.7) * 10 + (b % 3) * 7, it.y + Math.sin(a) * rr);
            rotY(M, -a - Math.PI / 2 * (b % 2 ? 1 : -1));
            scale(M, 1.6, 1.6, 1.6);
            draw(bee, M, 0.3);
          }
          break;
        }
        case 'nuvem':
          break;
      }
    }
  }

  private drawKart(k: Kart, draw: (m: Mesh, M: M4, spec?: number) => void, dt: number, depthOnly: boolean): void {
    const model = kartModel(k.driver);
    const D = model.dims;
    let vis = this.kartVis.get(k.id);
    if (!vis) {
      vis = { frame: -1, spin: 0, lean: 0, pitch: 0, headYaw: 0 };
      this.kartVis.set(k.id, vis);
    }
    if (dt > 0 && vis.frame !== this.frame) {
      vis.frame = this.frame;
      vis.spin += (k.spd * dt) / D.rR;
      const targetLean = -k.drift * 0.13 - k.steer * 0.05 * clamp(Math.abs(k.spd) / 200, 0, 1);
      vis.lean += (targetLean - vis.lean) * Math.min(1, dt * 8);
      const tp = k.boostT > 0 ? 0.06 : k.input.accel > 0 && k.spd < 120 ? 0.04 : 0;
      vis.pitch += (tp - vis.pitch) * Math.min(1, dt * 5);
      vis.headYaw += (-k.steer * 0.4 - k.drift * 0.25 - vis.headYaw) * Math.min(1, dt * 8);
    }
    const hopH = k.hopT > 0 ? Math.sin(clamp(k.hopT / 0.2, 0, 1) * Math.PI) * 7 : 0;
    const bumpH = k.bumpT > 0 ? Math.sin(k.bumpT * 30) * 2 : 0;
    const air = k.hopT > 0.2 ? Math.sin(clamp((k.hopT - 0.2) / 0.3, 0, 1) * Math.PI) * 30 : 0;
    let y = hopH + bumpH + air;
    let sc = 1;
    if (k.fallT > 0) {
      const f = 1 - k.fallT / 1.3;
      y -= f * f * 140;
      sc = Math.max(0.2, 1 - f * 0.6);
    }
    const M = this.M2;
    copy(M, ident16);
    translate(M, k.x, y, k.y);
    heading(M, k.h + k.spinAngle);
    rotX(M, vis.lean);
    rotZ(M, vis.pitch - (k.fallT > 0 ? (1 - k.fallT / 1.3) * 1.2 : 0));
    scale(M, sc, sc, sc);
    draw(this.mesh(`kb${k.driver}`, () => model.body), M, 0.55);
    // wheels
    const W = this.M;
    const steerA = -k.steer * 0.45 - k.drift * 0.25;
    for (const [wx, wz, r, front] of [
      [D.rearX, D.rearZ, D.rR, false],
      [D.rearX, -D.rearZ, D.rR, false],
      [D.frontX, D.frontZ, D.rF, true],
      [D.frontX, -D.frontZ, D.rF, true],
    ] as [number, number, number, boolean][]) {
      copy(W, M);
      translate(W, wx, r, wz);
      if (front) rotY(W, steerA);
      rotZ(W, -vis.spin * (D.rR / r));
      draw(front ? this.mesh(`kwf${k.driver}`, () => model.wheelF) : this.mesh(`kw${k.driver}`, () => model.wheel), W, 0.2);
    }
    // head
    let expr = EXPR_NORMAL;
    if (k.finished) expr = EXPR_HAPPY;
    else if (k.fallT > 0 || k.spinT > 0 || (k.slowT > 0 && k.hitBy === 'nuvem') || k.stingT > 0) expr = EXPR_CRY;
    else if (k.drift !== 0 || k.boostT > 0.1 || k.exprT > 0) expr = k.expr === EXPR_NORMAL ? EXPR_SCREAM : k.expr;
    copy(W, M);
    const bob = Math.sin(this.time * 14 + k.id) * 0.4 * clamp(Math.abs(k.spd) / 200, 0, 1);
    translate(W, D.seatX + 1, D.neckY + bob, 0);
    rotY(W, vis.headYaw + (k.finished ? Math.sin(this.time * 6) * 0.3 : 0));
    rotX(W, -vis.lean * 0.8 + (expr === EXPR_CRY ? Math.sin(this.time * 20) * 0.08 : 0));
    if (expr === EXPR_SCREAM) rotZ(W, 0.12);
    draw(this.mesh(`kh${k.driver}:${expr}`, () => model.heads[expr] ?? model.heads[0]), W, 0.35);
    void depthOnly;
  }

  private drawItemBoxes(world: World, fog: number[]): void {
    const gl = this.gl;
    const lp = this.lit.use();
    this.sceneUniforms(lp, fog);
    lp.m4('uVP', this.VP).f('uUseTex', 1).f('uSpec', 0.9).f('uNoFog', 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.boxTex);
    lp.i('uTex', 0);
    const box = this.mesh('box', itemBoxMesh);
    const spots = this.track!.boxSpots;
    const M = this.M;
    gl.enable(gl.CULL_FACE);
    for (let i = 0; i < spots.length; i++) {
      if (world.boxT[i] > 0) continue;
      const s = spots[i];
      if (!this.inView(s.x, 20, s.y, 30, 3000)) continue;
      const hue = (this.time * 0.4 + i * 0.13) % 1;
      const [r, g, b] = hsv(hue, 0.35, 1);
      copy(M, ident16);
      translate(M, s.x, 24 + Math.sin(this.time * 3 + i) * 4, s.y);
      rotY(M, this.time * 1.6 + i * 0.7);
      rotX(M, 0.5);
      rotZ(M, 0.6);
      lp.m4('uModel', M).v4('uTint', r * 0.85, g * 0.85, b * 0.85, 0.82).v3('uAdd', r * 0.08, g * 0.08, b * 0.08);
      box.draw();
    }
    gl.disable(gl.CULL_FACE);
    lp.v4('uTint', 1, 1, 1, 1).v3('uAdd', 0, 0, 0).f('uUseTex', 0);
    gl.bindTexture(gl.TEXTURE_2D, this.whiteTex);
  }

  private pushPart(x: number, y: number, z: number, size: number, c: [number, number, number, number], alpha: number, kind: number, rot: number): void {
    if (this.partN >= PART_MAX) return;
    const o = this.partN * 7;
    const F = this.partF;
    F[o] = x;
    F[o + 1] = y;
    F[o + 2] = z;
    F[o + 3] = size;
    const u8 = this.partU8;
    const b = (o + 4) * 4;
    u8[b] = c[0] * 255;
    u8[b + 1] = c[1] * 255;
    u8[b + 2] = c[2] * 255;
    u8[b + 3] = clamp(c[3] * alpha, 0, 1) * 255;
    F[o + 5] = kind;
    F[o + 6] = rot;
    this.partN++;
  }

  private drawParticles(world: World, fx: Fx, fog: number[]): void {
    const gl = this.gl;
    this.partN = 0;
    for (const p of fx.list) {
      if (p.kind === 'text') continue;
      const t = p.life / p.max;
      const c = cssColor(p.color);
      switch (p.kind) {
        case 'spark':
          this.pushPart(p.x, p.z + 2, p.y, p.size * 0.42, c, clamp(t * 1.8, 0, 1), 5, 0);
          break;
        case 'drop':
          this.pushPart(p.x, p.z, p.y, p.size * 0.7, c, clamp(t * 1.6, 0, 1), 1, 0);
          break;
        case 'glow':
          this.pushPart(p.x, p.z, p.y, p.size * (0.45 + (1 - t) * 0.4), c, t * 0.8, 4, 0);
          break;
        case 'smoke':
          this.pushPart(p.x, p.z + (1 - t) * 10, p.y, p.size * (0.8 + (1 - t) * 1.4), c, t * 0.8, 0, 0);
          break;
        case 'dust':
          this.pushPart(p.x, p.z, p.y, p.size * 0.9, c, t, 0, 0);
          break;
        case 'leaf':
          this.pushPart(p.x, p.z, p.y, p.size * 0.9, c, t, 1, 0);
          break;
        case 'star':
          this.pushPart(p.x, p.z, p.y, p.size * 0.8, c, clamp(t * 2, 0, 1), 2, p.life * 6);
          break;
        case 'ring':
          this.pushPart(p.x, p.z + 4, p.y, p.size * (2.2 - t), c, t, 3, 0);
          break;
      }
    }
    // stink clouds
    for (const it of world.items) {
      if (it.type !== 'nuvem') continue;
      const fade = clamp(it.life / 3, 0.2, 1);
      const r = 78 * clamp(it.life / 3, 0.35, 1);
      for (let i = 0; i < 9; i++) {
        const a = i * 0.7 + this.time * 0.9;
        this.pushPart(it.x + Math.cos(a) * r * 0.5, 18 + Math.sin(a * 1.3) * 8 + (i % 3) * 10, it.y + Math.sin(a) * r * 0.5, r * 0.5, [0.6, 0.85, 0.3, 0.75], fade, 0, 0);
      }
    }
    // boost-pad sparkle & item box glints
    if (!this.partN) return;
    const p = this.part.use();
    p.m4('uVP', this.VP).v3('uCamRight', this.camRight).v3('uCamUp', this.camUp).v3('uCamPos', this.camPos);
    p.v3('uFogCol', fog).f('uFogDen', this.look.fogDen).f('uFogStart', this.look.fogStart);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.partBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.partF, 0, this.partN * 7);
    gl.bindVertexArray(this.partVao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.partN);
    gl.bindVertexArray(null);
  }
}

const ident16 = m4();

function mulK(c: number[], k: number): [number, number, number] {
  return [c[0] * k, c[1] * k, c[2] * k];
}

function hsv(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}

function isLowEnd(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return (nav.deviceMemory !== undefined && nav.deviceMemory < 4) || /Android|iPhone|iPad/i.test(navigator.userAgent);
}

function bannerCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#facc15';
  g.fillRect(0, 0, 1024, 256);
  const n = 32;
  for (let i = 0; i < n; i++) {
    for (let r = 0; r < 2; r++) {
      g.fillStyle = (i + r) % 2 ? '#111827' : '#f8fafc';
      g.fillRect((i * 1024) / n, r * 32, 1024 / n + 1, 32);
      g.fillRect((i * 1024) / n, 192 + r * 32, 1024 / n + 1, 32);
    }
  }
  g.fillStyle = '#7c2d12';
  g.font = '900 96px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('MICO KART 🍌', 512, 130);
  return c;
}

void DRIVERS;
void EXPR_SCREAM;

// ------------------------------------------------------------ kart portraits

let portraitGl: { gl: WebGL2RenderingContext; lit: Program; canvas: HTMLCanvasElement; meshes: Map<string, Mesh>; shadow: WebGLTexture; white: WebGLTexture } | null = null;

/** Renders a 3/4 studio shot of a driver's kart on a transparent background. */
export function renderKartPortrait(driver: number, size = 220, expr = EXPR_NORMAL): HTMLCanvasElement | null {
  if (!portraitGl) {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
    if (!gl) return null;
    const shadow = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, shadow);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, 1, 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const white = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, white);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    portraitGl = { gl, lit: new Program(gl, S.LIT_VS, S.LIT_FS), canvas, meshes: new Map(), shadow, white };
  }
  const { gl, lit, canvas, meshes, shadow, white } = portraitGl;
  canvas.width = canvas.height = size;
  const model = kartModel(driver);
  const D = model.dims;
  const get = (key: string, d: MeshData) => {
    let m = meshes.get(key);
    if (!m) meshes.set(key, (m = new Mesh(gl, d)));
    return m;
  };
  gl.viewport(0, 0, size, size);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  const V = m4(), P = m4(), VP = m4(), M = m4(), W = m4();
  lookAt(V, 58, 36, 62, -1, 19, 0);
  perspective(P, 0.6, 1, 5, 500);
  mul(VP, P, V);
  lit.use();
  lit.m4('uVP', VP).v3('uSunDir', dir(0.9, 0.9)).v3('uSunCol', [1.05, 1.0, 0.95]).v3('uSkyCol', [0.6, 0.65, 0.8]).v3('uGndCol', [0.35, 0.3, 0.3]);
  lit.v3('uFogCol', [0, 0, 0]).f('uFogDen', 0).f('uFogStart', 0).v3("uCamPos", [58, 36, 62]).m4('uLightVP', VP).f('uShadowOn', 0).f('uTime', 0);
  lit.v4('uTint', 1, 1, 1, 1).v3('uAdd', 0, 0, 0).f('uUseTex', 0).f('uNoFog', 1);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, shadow);
  lit.i('uShadow', 1).i('uTex', 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, white);
  const sc = 50 / Math.max(D.L, 50);
  scale(M, sc, sc, sc);
  lit.m4('uModel', M).f('uSpec', 0.55);
  get(`b${driver}`, model.body).draw();
  for (const [wx, wz, r, front] of [
    [D.rearX, D.rearZ, D.rR, false],
    [D.rearX, -D.rearZ, D.rR, false],
    [D.frontX, D.frontZ, D.rF, true],
    [D.frontX, -D.frontZ, D.rF, true],
  ] as [number, number, number, boolean][]) {
    copy(W, M);
    translate(W, wx, r, wz);
    if (front) rotY(W, -0.3);
    lit.m4('uModel', W).f('uSpec', 0.2);
    get(front ? `wf${driver}` : `w${driver}`, front ? model.wheelF : model.wheel).draw();
  }
  copy(W, M);
  translate(W, D.seatX + 1, D.neckY, 0);
  rotY(W, 0.45);
  lit.m4('uModel', W).f('uSpec', 0.35);
  get(`h${driver}:${expr}`, model.heads[expr]).draw();
  gl.bindVertexArray(null);
  const out = document.createElement('canvas');
  out.width = out.height = size;
  out.getContext('2d')!.drawImage(canvas, 0, 0);
  return out;
}
