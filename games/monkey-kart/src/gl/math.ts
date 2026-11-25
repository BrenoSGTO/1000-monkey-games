/** Minimal column-major 4x4 matrix helpers for the WebGL renderer. */
export type M4 = Float32Array;
export type V3 = [number, number, number];

export function m4(): M4 {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function ident(o: M4): M4 {
  o.fill(0);
  o[0] = o[5] = o[10] = o[15] = 1;
  return o;
}

export function copy(o: M4, a: M4): M4 {
  o.set(a);
  return o;
}

export function mul(o: M4, a: M4, b: M4): M4 {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  for (let i = 0; i < 4; i++) {
    const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
    o[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    o[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    o[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    o[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  }
  return o;
}

export function perspective(o: M4, fovy: number, aspect: number, near: number, far: number): M4 {
  const f = 1 / Math.tan(fovy / 2);
  o.fill(0);
  o[0] = f / aspect;
  o[5] = f;
  o[10] = (far + near) / (near - far);
  o[11] = -1;
  o[14] = (2 * far * near) / (near - far);
  return o;
}

export function ortho(o: M4, l: number, r: number, b: number, t: number, n: number, f: number): M4 {
  o.fill(0);
  o[0] = 2 / (r - l);
  o[5] = 2 / (t - b);
  o[10] = -2 / (f - n);
  o[12] = -(r + l) / (r - l);
  o[13] = -(t + b) / (t - b);
  o[14] = -(f + n) / (f - n);
  o[15] = 1;
  return o;
}

export function lookAt(o: M4, ex: number, ey: number, ez: number, cx: number, cy: number, cz: number, ux = 0, uy = 1, uz = 0): M4 {
  let zx = ex - cx, zy = ey - cy, zz = ez - cz;
  let l = Math.hypot(zx, zy, zz) || 1;
  zx /= l; zy /= l; zz /= l;
  let xx = uy * zz - uz * zy, xy = uz * zx - ux * zz, xz = ux * zy - uy * zx;
  l = Math.hypot(xx, xy, xz) || 1;
  xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0;
  o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0;
  o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
  o[12] = -(xx * ex + xy * ey + xz * ez);
  o[13] = -(yx * ex + yy * ey + yz * ez);
  o[14] = -(zx * ex + zy * ey + zz * ez);
  o[15] = 1;
  return o;
}

export function translate(o: M4, x: number, y: number, z: number): M4 {
  o[12] += o[0] * x + o[4] * y + o[8] * z;
  o[13] += o[1] * x + o[5] * y + o[9] * z;
  o[14] += o[2] * x + o[6] * y + o[10] * z;
  o[15] += o[3] * x + o[7] * y + o[11] * z;
  return o;
}

export function scale(o: M4, x: number, y: number, z: number): M4 {
  for (let i = 0; i < 4; i++) {
    o[i] *= x;
    o[4 + i] *= y;
    o[8 + i] *= z;
  }
  return o;
}

/** Right-multiply by a rotation about X. */
export function rotX(o: M4, a: number): M4 {
  if (!a) return o;
  const c = Math.cos(a), s = Math.sin(a);
  for (let i = 0; i < 4; i++) {
    const y = o[4 + i], z = o[8 + i];
    o[4 + i] = y * c + z * s;
    o[8 + i] = z * c - y * s;
  }
  return o;
}
export function rotY(o: M4, a: number): M4 {
  if (!a) return o;
  const c = Math.cos(a), s = Math.sin(a);
  for (let i = 0; i < 4; i++) {
    const x = o[i], z = o[8 + i];
    o[i] = x * c - z * s;
    o[8 + i] = x * s + z * c;
  }
  return o;
}
export function rotZ(o: M4, a: number): M4 {
  if (!a) return o;
  const c = Math.cos(a), s = Math.sin(a);
  for (let i = 0; i < 4; i++) {
    const x = o[i], y = o[4 + i];
    o[i] = x * c + y * s;
    o[4 + i] = y * c - x * s;
  }
  return o;
}

/**
 * Game heading convention: world (x, y) maps to GL (X, Z) and heading h points
 * along (cos h, sin h). A model's local +X is "forward", +Z is "right".
 */
export function heading(o: M4, h: number): M4 {
  return rotY(o, -h);
}

export function invert(o: M4, m: M4): M4 | null {
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
  const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
  const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
  const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return null;
  det = 1 / det;
  o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return o;
}

/** Projects a world point with a view-projection matrix. Returns NDC xy + clip w. */
export function project(m: M4, x: number, y: number, z: number): { x: number; y: number; w: number } {
  const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
  const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
  const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
  return { x: cx / cw, y: cy / cw, w: cw };
}

export function hex3(hex: string): V3 {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
