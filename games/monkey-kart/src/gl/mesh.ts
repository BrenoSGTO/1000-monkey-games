import { type M4, type V3, hex3, ident, m4, rotX, rotY, rotZ, scale, translate } from './math';

export type ColorIn = string | V3;
type ColorFn = (x: number, y: number, z: number, u: number, v: number) => ColorIn;
export type Paint = ColorIn | ColorFn;

function col(c: ColorIn): V3 {
  return typeof c === 'string' ? hex3(c) : c;
}

export interface MeshData {
  pos: Float32Array;
  nrm: Float32Array;
  col: Uint8Array;
  uv: Float32Array | null;
  idx: Uint32Array;
  /** bounding radius in model space (around origin) */
  radius: number;
}

/**
 * Accumulates triangles from parametric primitives under a transform stack.
 * Colors carry an "emissive" amount in the alpha channel (0 = lit, 1 = full bright).
 */
export class MeshBuilder {
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];
  uv: number[] = [];
  idx: number[] = [];
  hasUv = false;
  private stack: M4[] = [];
  m: M4 = m4();
  emissive = 0;
  /** brightness jitter applied per primitive call (for organic variation) */
  jitter = 0;
  rnd: () => number = Math.random;

  get vcount(): number {
    return this.pos.length / 3;
  }

  push(): this {
    this.stack.push(new Float32Array(this.m));
    return this;
  }
  pop(): this {
    const m = this.stack.pop();
    if (m) this.m = m;
    return this;
  }
  reset(): this {
    ident(this.m);
    this.stack.length = 0;
    return this;
  }
  t(x: number, y: number, z: number): this {
    translate(this.m, x, y, z);
    return this;
  }
  rx(a: number): this {
    rotX(this.m, a);
    return this;
  }
  ry(a: number): this {
    rotY(this.m, a);
    return this;
  }
  rz(a: number): this {
    rotZ(this.m, a);
    return this;
  }
  s(x: number, y = x, z = x): this {
    scale(this.m, x, y, z);
    return this;
  }
  /** Run `fn` inside a pushed transform. */
  at(x: number, y: number, z: number, fn: () => void, ry = 0, rx = 0, rz = 0): this {
    this.push().t(x, y, z).ry(ry).rx(rx).rz(rz);
    fn();
    return this.pop();
  }

  private vtx(x: number, y: number, z: number, nx: number, ny: number, nz: number, c: V3, u = 0, v = 0): number {
    const m = this.m;
    this.pos.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
    // normal: inverse-transpose approximated via cofactor of the 3x3
    const a = m[0], b = m[1], cc = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
    const c00 = e * i - f * h, c01 = f * g - d * i, c02 = d * h - e * g;
    const c10 = cc * h - b * i, c11 = a * i - cc * g, c12 = b * g - a * h;
    const c20 = b * f - cc * e, c21 = cc * d - a * f, c22 = a * e - b * d;
    let ox = c00 * nx + c10 * ny + c20 * nz;
    let oy = c01 * nx + c11 * ny + c21 * nz;
    let oz = c02 * nx + c12 * ny + c22 * nz;
    const det = a * c00 + b * c01 + cc * c02;
    if (det < 0) {
      ox = -ox;
      oy = -oy;
      oz = -oz;
    }
    const l = Math.hypot(ox, oy, oz) || 1;
    this.nrm.push(ox / l, oy / l, oz / l);
    this.col.push(c[0], c[1], c[2], this.emissive);
    this.uv.push(u, v);
    return this.vcount - 1;
  }

  private tri(a: number, b: number, c: number): void {
    // keep winding consistent with mirrored transforms
    const m = this.m;
    const det = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);
    if (det < 0) this.idx.push(a, c, b);
    else this.idx.push(a, b, c);
  }

  private paintAt(p: Paint, x: number, y: number, z: number, u: number, v: number): V3 {
    const c = typeof p === 'function' ? col(p(x, y, z, u, v)) : col(p);
    return c;
  }

  private jit(c: V3, j: number): V3 {
    if (!j) return c;
    return [c[0] * j, c[1] * j, c[2] * j];
  }

  /**
   * Parametric surface over a (nu+1) x (nv+1) grid. Normals come from finite differences.
   * `wrapU`: u is periodic (seam vertices duplicated but normals averaged).
   */
  surface(nu: number, nv: number, f: (u: number, v: number) => V3, paint: Paint, wrapU = true, flipN = false): this {
    const j = this.jitter ? 1 + (this.rnd() - 0.5) * this.jitter : 0;
    const base = this.vcount;
    const P: V3[] = [];
    for (let iv = 0; iv <= nv; iv++) for (let iu = 0; iu <= nu; iu++) P.push(f(iu / nu, iv / nv));
    const at = (iu: number, iv: number): V3 => {
      if (wrapU) iu = ((iu % nu) + nu) % nu;
      else iu = Math.max(0, Math.min(nu, iu));
      iv = Math.max(0, Math.min(nv, iv));
      return P[iv * (nu + 1) + iu];
    };
    for (let iv = 0; iv <= nv; iv++) {
      for (let iu = 0; iu <= nu; iu++) {
        const p = P[iv * (nu + 1) + iu];
        const pu0 = at(iu - 1, iv), pu1 = at(iu + 1, iv);
        let pv0 = at(iu, iv - 1), pv1 = at(iu, iv + 1);
        // degenerate rows (poles): sample a little inward
        const du: V3 = [pu1[0] - pu0[0], pu1[1] - pu0[1], pu1[2] - pu0[2]];
        if (Math.hypot(du[0], du[1], du[2]) < 1e-6) {
          // pole: use the direction from the surface center-ish (next row average)
          const r = iv === 0 ? 1 : nv - 1;
          let cx = 0, cy = 0, cz = 0;
          for (let k = 0; k < nu; k++) {
            const q = P[r * (nu + 1) + k];
            cx += q[0]; cy += q[1]; cz += q[2];
          }
          cx /= nu; cy /= nu; cz /= nu;
          let nx = p[0] - cx, ny = p[1] - cy, nz = p[2] - cz;
          // orient roughly along the pole axis
          const q0 = P[(iv === 0 ? 1 : nv - 1) * (nu + 1)];
          const q1 = P[(iv === 0 ? 1 : nv - 1) * (nu + 1) + Math.floor(nu / 4)];
          const q2 = P[(iv === 0 ? 1 : nv - 1) * (nu + 1) + Math.floor(nu / 2)];
          const ax = (q1[1] - q0[1]) * (q2[2] - q0[2]) - (q1[2] - q0[2]) * (q2[1] - q0[1]);
          const ay = (q1[2] - q0[2]) * (q2[0] - q0[0]) - (q1[0] - q0[0]) * (q2[2] - q0[2]);
          const az = (q1[0] - q0[0]) * (q2[1] - q0[1]) - (q1[1] - q0[1]) * (q2[0] - q0[0]);
          const al = Math.hypot(ax, ay, az);
          if (al > 1e-9) {
            const s = nx * ax + ny * ay + nz * az >= 0 ? 1 : -1;
            nx = (ax / al) * s;
            ny = (ay / al) * s;
            nz = (az / al) * s;
          }
          const c = this.paintAt(paint, p[0], p[1], p[2], iu / nu, iv / nv);
          this.vtx(p[0], p[1], p[2], flipN ? -nx : nx, flipN ? -ny : ny, flipN ? -nz : nz, this.jit(c, j), iu / nu, iv / nv);
          continue;
        }
        if (iv === 0) pv0 = p;
        if (iv === nv) pv1 = p;
        const dv: V3 = [pv1[0] - pv0[0], pv1[1] - pv0[1], pv1[2] - pv0[2]];
        let nx = du[1] * dv[2] - du[2] * dv[1];
        let ny = du[2] * dv[0] - du[0] * dv[2];
        let nz = du[0] * dv[1] - du[1] * dv[0];
        if (flipN) {
          nx = -nx;
          ny = -ny;
          nz = -nz;
        }
        const c = this.paintAt(paint, p[0], p[1], p[2], iu / nu, iv / nv);
        this.vtx(p[0], p[1], p[2], nx, ny, nz, this.jit(c, j), iu / nu, iv / nv);
      }
    }
    for (let iv = 0; iv < nv; iv++) {
      for (let iu = 0; iu < nu; iu++) {
        const a = base + iv * (nu + 1) + iu;
        const b = a + 1;
        const c = a + nu + 1;
        const d = c + 1;
        if (flipN) {
          this.tri(a, c, b);
          this.tri(b, c, d);
        } else {
          this.tri(a, b, c);
          this.tri(b, d, c);
        }
      }
    }
    return this;
  }

  /** Superellipsoid centered at origin. e=1 -> ellipsoid, e->0.1 -> rounded box. */
  blob(rx: number, ry: number, rz: number, paint: Paint, e = 1, nu = 16, nv = 10): this {
    const sp = (w: number, p: number) => Math.sign(w) * Math.pow(Math.abs(w), p);
    return this.surface(nu, nv, (u, v) => {
      const th = -u * Math.PI * 2;
      const ph = -Math.PI / 2 + v * Math.PI;
      const cp = Math.cos(ph), sph = Math.sin(ph);
      return [rx * sp(cp, e) * sp(Math.cos(th), e), ry * sp(sph, e), rz * sp(cp, e) * sp(Math.sin(th), e)];
    }, paint);
  }

  sphere(r: number, paint: Paint, nu = 14, nv = 9): this {
    return this.blob(r, r, r, paint, 1, nu, nv);
  }

  /** Cylinder along +Y from y=0 to y=h; r0 bottom radius, r1 top radius. */
  cyl(r0: number, r1: number, h: number, paint: Paint, seg = 14, caps = true): this {
    this.surface(seg, 1, (u, v) => {
      const a = -u * Math.PI * 2;
      const r = r0 + (r1 - r0) * v;
      return [Math.cos(a) * r, v * h, Math.sin(a) * r];
    }, paint);
    if (caps) {
      if (r1 > 0.001) this.disc(r1, h, paint, seg, true);
      if (r0 > 0.001) this.disc(r0, 0, paint, seg, false);
    }
    return this;
  }

  /** Flat disc facing +Y (up=true) or -Y at height y. */
  disc(r: number, y: number, paint: Paint, seg = 14, up = true): this {
    const base = this.vcount;
    const ny = up ? 1 : -1;
    this.vtx(0, y, 0, 0, ny, 0, this.paintAt(paint, 0, y, 0, 0.5, 0.5), 0.5, 0.5);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      this.vtx(x, y, z, 0, ny, 0, this.paintAt(paint, x, y, z, 0.5 + Math.cos(a) / 2, 0.5 + Math.sin(a) / 2), 0.5 + Math.cos(a) / 2, 0.5 + Math.sin(a) / 2);
    }
    for (let i = 0; i < seg; i++) {
      if (up) this.tri(base, base + i + 2, base + i + 1);
      else this.tri(base, base + i + 1, base + i + 2);
    }
    return this;
  }

  /** Torus in the XZ plane (axis +Y). arc limits the sweep (radians). */
  torus(R: number, r: number, paint: Paint, nu = 20, nv = 8, arc = Math.PI * 2): this {
    const closed = arc >= Math.PI * 2 - 1e-6;
    return this.surface(nu, nv, (u, v) => {
      const a = -u * arc;
      const b = v * Math.PI * 2;
      const rr = R + Math.cos(b) * r;
      return [Math.cos(a) * rr, Math.sin(b) * r, Math.sin(a) * rr];
    }, paint, closed);
  }

  /** Tube along a polyline path with per-point radius. */
  tube(path: V3[], radius: number | ((t: number) => number), paint: Paint, seg = 8): this {
    const n = path.length;
    const rad = typeof radius === 'number' ? () => radius : radius;
    // parallel-transport frames
    const T: V3[] = [];
    for (let i = 0; i < n; i++) {
      const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)];
      const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const l = Math.hypot(d[0], d[1], d[2]) || 1;
      T.push([d[0] / l, d[1] / l, d[2] / l]);
    }
    let N: V3 = Math.abs(T[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const frames: [V3, V3][] = [];
    for (let i = 0; i < n; i++) {
      const t = T[i];
      const d = N[0] * t[0] + N[1] * t[1] + N[2] * t[2];
      let nx = N[0] - t[0] * d, ny = N[1] - t[1] * d, nz = N[2] - t[2] * d;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      N = [nx, ny, nz];
      const B: V3 = [t[1] * nz - t[2] * ny, t[2] * nx - t[0] * nz, t[0] * ny - t[1] * nx];
      frames.push([N, B]);
    }
    this.surface(seg, n - 1, (u, v) => {
      const i = Math.round(v * (n - 1));
      const a = u * Math.PI * 2;
      const [Nn, B] = frames[i];
      const r = rad(i / (n - 1));
      const p = path[i];
      const c = Math.cos(a) * r, s = Math.sin(a) * r;
      return [p[0] + Nn[0] * c + B[0] * s, p[1] + Nn[1] * c + B[1] * s, p[2] + Nn[2] * c + B[2] * s];
    }, paint, true, false);
    return this;
  }

  /** Axis-aligned box with flat faces (hx,hy,hz half extents) centered at origin. */
  box(hx: number, hy: number, hz: number, paint: Paint, uvScale = 0): this {
    const faces: [V3, V3, V3][] = [
      [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
      [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
      [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
      [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
      [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
      [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
    ];
    const H: V3 = [hx, hy, hz];
    for (const [n, uA, vA] of faces) {
      const base = this.vcount;
      const cx = n[0] * hx, cy = n[1] * hy, cz = n[2] * hz;
      const ue = Math.abs(uA[0]) * H[0] + Math.abs(uA[1]) * H[1] + Math.abs(uA[2]) * H[2];
      const ve = Math.abs(vA[0]) * H[0] + Math.abs(vA[1]) * H[1] + Math.abs(vA[2]) * H[2];
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const x = cx + uA[0] * su * ue + vA[0] * sv * ve;
        const y = cy + uA[1] * su * ue + vA[1] * sv * ve;
        const z = cz + uA[2] * su * ue + vA[2] * sv * ve;
        const u = uvScale ? ((su + 1) / 2) * ue * 2 * uvScale : (su + 1) / 2;
        const v = uvScale ? ((1 - sv) / 2) * ve * 2 * uvScale : (1 - sv) / 2;
        this.vtx(x, y, z, n[0], n[1], n[2], this.paintAt(paint, x, y, z, u, v), u, v);
      }
      this.tri(base, base + 1, base + 2);
      this.tri(base, base + 2, base + 3);
    }
    if (uvScale) this.hasUv = true;
    return this;
  }

  /** Quad in the XY plane (facing +Z) of size w x h centered at origin. */
  quad(w: number, h: number, paint: Paint, twoSided = true): this {
    const base = this.vcount;
    const pts: [number, number, number, number][] = [[-w / 2, -h / 2, 0, 1], [w / 2, -h / 2, 1, 1], [w / 2, h / 2, 1, 0], [-w / 2, h / 2, 0, 0]];
    for (const [x, y, u, v] of pts) this.vtx(x, y, 0, 0, 0, 1, this.paintAt(paint, x, y, 0, u, v), u, v);
    this.tri(base, base + 1, base + 2);
    this.tri(base, base + 2, base + 3);
    if (twoSided) {
      const b2 = this.vcount;
      for (const [x, y, u, v] of pts) this.vtx(x, y, 0, 0, 0, -1, this.paintAt(paint, x, y, 0, u, v), u, v);
      this.tri(b2, b2 + 2, b2 + 1);
      this.tri(b2, b2 + 3, b2 + 2);
    }
    return this;
  }

  /** Arbitrary triangle (flat shaded), points in local space. */
  triangle(a: V3, b: V3, c: V3, paint: Paint, twoSided = false): this {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const base = this.vcount;
    for (const p of [a, b, c]) this.vtx(p[0], p[1], p[2], nx, ny, nz, this.paintAt(paint, p[0], p[1], p[2], 0, 0));
    this.tri(base, base + 1, base + 2);
    if (twoSided) {
      const b2 = this.vcount;
      for (const p of [a, b, c]) this.vtx(p[0], p[1], p[2], -nx, -ny, -nz, this.paintAt(paint, p[0], p[1], p[2], 0, 0));
      this.tri(b2, b2 + 2, b2 + 1);
    }
    return this;
  }

  /** Re-emit triangles from vertex index `from` with flat (faceted) normals. */
  facet(fromV: number, fromI: number): this {
    const idx = this.idx.splice(fromI);
    const P = this.pos, C = this.col, U = this.uv;
    const np: number[] = [], nn: number[] = [], nc: number[] = [], nu: number[] = [];
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i], b = idx[i + 1], c = idx[i + 2];
      const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
      const ux = P[b * 3] - ax, uy = P[b * 3 + 1] - ay, uz = P[b * 3 + 2] - az;
      const vx = P[c * 3] - ax, vy = P[c * 3 + 1] - ay, vz = P[c * 3 + 2] - az;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      for (const q of [a, b, c]) {
        np.push(P[q * 3], P[q * 3 + 1], P[q * 3 + 2]);
        nn.push(nx, ny, nz);
        nc.push(C[q * 4], C[q * 4 + 1], C[q * 4 + 2], C[q * 4 + 3]);
        nu.push(U[q * 2], U[q * 2 + 1]);
      }
    }
    this.pos.length = fromV * 3;
    this.nrm.length = fromV * 3;
    this.col.length = fromV * 4;
    this.uv.length = fromV * 2;
    const base = fromV;
    this.pos.push(...np);
    this.nrm.push(...nn);
    this.col.push(...nc);
    this.uv.push(...nu);
    for (let i = 0; i < idx.length; i++) this.idx.push(base + i);
    return this;
  }

  /** Displace vertices (from index) along their normal by fn(pos). */
  displace(fromV: number, fn: (x: number, y: number, z: number) => number): this {
    for (let v = fromV; v < this.vcount; v++) {
      const d = fn(this.pos[v * 3], this.pos[v * 3 + 1], this.pos[v * 3 + 2]);
      this.pos[v * 3] += this.nrm[v * 3] * d;
      this.pos[v * 3 + 1] += this.nrm[v * 3 + 1] * d;
      this.pos[v * 3 + 2] += this.nrm[v * 3 + 2] * d;
    }
    return this;
  }

  mark(): { v: number; i: number } {
    return { v: this.vcount, i: this.idx.length };
  }

  build(): MeshData {
    let r = 0;
    for (let i = 0; i < this.pos.length; i += 3) r = Math.max(r, Math.hypot(this.pos[i], this.pos[i + 1], this.pos[i + 2]));
    const colb = new Uint8Array(this.col.length);
    for (let i = 0; i < this.col.length; i++) colb[i] = Math.max(0, Math.min(255, Math.round(this.col[i] * 255)));
    return {
      pos: new Float32Array(this.pos),
      nrm: new Float32Array(this.nrm),
      col: colb,
      uv: this.hasUv ? new Float32Array(this.uv) : null,
      idx: new Uint32Array(this.idx),
      radius: r,
    };
  }
}
