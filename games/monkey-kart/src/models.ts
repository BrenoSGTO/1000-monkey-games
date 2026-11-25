import { DRIVERS, type Driver } from './drivers';
import { MeshBuilder, type MeshData, type Paint } from './gl/mesh';
import type { V3 } from './gl/math';
import { EXPR_CRY, EXPR_HAPPY, EXPR_SCREAM } from './types';
import { mulberry32 } from './util';

const PI = Math.PI;

function dark(hex: string, k: number): V3 {
  const n = parseInt(hex.replace('#', ''), 16);
  return [Math.min(1, (((n >> 16) & 255) / 255) * k), Math.min(1, (((n >> 8) & 255) / 255) * k), Math.min(1, ((n & 255) / 255) * k)];
}

// ------------------------------------------------------------------ karts

export interface KartDims {
  L: number;
  W: number;
  rearX: number;
  frontX: number;
  rearZ: number;
  frontZ: number;
  rR: number;
  rF: number;
  wR: number;
  wF: number;
  seatX: number;
  neckY: number;
  exhaustX: number;
}

export function kartDims(d: Driver): KartDims {
  const s = { normal: [54, 36], wide: [58, 46], long: [66, 35], tiny: [46, 31] }[d.kart.shape];
  const L = s[0], W = s[1];
  const big = d.kart.shape === 'wide';
  return {
    L,
    W,
    rearX: -L * 0.32,
    frontX: L * 0.33,
    rearZ: W / 2 + 1.5,
    frontZ: W / 2 - 0.5,
    rR: big ? 9.5 : d.kart.shape === 'tiny' ? 7.5 : 8.5,
    rF: big ? 8 : d.kart.shape === 'tiny' ? 6.5 : 7.2,
    wR: big ? 10 : 8,
    wF: big ? 8 : 6,
    seatX: -L * 0.12,
    neckY: 31,
    exhaustX: -L / 2 - 3,
  };
}

export interface KartModel {
  body: MeshData;
  wheel: MeshData;
  wheelF: MeshData;
  heads: MeshData[];
  dims: KartDims;
}

function wheel(r: number, w: number, rim: string): MeshData {
  const b = new MeshBuilder();
  const tread: Paint = (x, y) => {
    const a = Math.atan2(y, x);
    return Math.sin(a * 14) > 0.2 ? [0.11, 0.12, 0.15] : [0.17, 0.18, 0.22];
  };
  b.push().rx(PI / 2).t(0, -w / 2, 0);
  b.cyl(r, r, w, tread, 18, false);
  b.disc(r * 0.98, w, '#1f2937', 18, true).disc(r * 0.98, 0, '#1f2937', 18, false);
  b.disc(r * 0.6, w + 0.3, rim, 12, true).disc(r * 0.6, -0.3, rim, 12, false);
  b.emissive = 0.15;
  b.disc(r * 0.22, w + 0.6, '#e5e7eb', 8, true).disc(r * 0.22, -0.6, '#e5e7eb', 8, false);
  b.emissive = 0;
  b.pop();
  return b.build();
}

function buildBody(d: Driver, D: KartDims): MeshData {
  const b = new MeshBuilder();
  const k = d.kart;
  const hx = D.L / 2, hz = D.W / 2;
  const body = k.body, trim = k.trim;
  const stripe: Paint = (_x, _y, z) => (Math.abs(z) < 1.8 ? '#f8fafc' : body);
  // chassis pan
  b.at(0, 6, 0, () => b.blob(hx * 0.95, 2.4, hz * 0.6, trim, 0.25));
  // side pods / nerf bars
  for (const s of [-1, 1]) {
    b.at(-1, 7.5, s * hz * 0.66, () => b.blob(hx * 0.5, 3.2, 3.4, dark(body, 0.78), 0.45));
    b.at(-1, 7.5, s * hz * 0.66, () => b.cyl(1.2, 1.2, 1, trim), 0, 0, 0);
  }
  // tub
  b.at(-1.5, 10.5, 0, () => b.blob(hx * 0.76, 6.2, hz * 0.56, stripe, 0.32, 20, 12));
  // nose
  b.at(hx * 0.6, 9, 0, () => b.blob(hx * 0.4, 4.6, hz * 0.5, stripe, 0.55, 18, 10));
  // front bumper
  b.at(hx * 0.98, 6.5, 0, () => {
    b.rx(PI / 2).t(0, -hz * 0.8, 0);
    b.cyl(2.3, 2.3, hz * 1.6, trim, 10);
  });
  // number disc on nose
  b.at(hx * 0.68, 13.2, 0, () => {
    b.rz(-0.35);
    b.disc(3.6, 0, '#f8fafc', 16, true);
  });
  // seat
  b.at(D.seatX - 5, 17, 0, () => {
    b.rz(0.28);
    b.blob(3.2, 9.5, hz * 0.42, '#1f2937', 0.4);
  });
  // steering column + wheel
  b.at(D.seatX + 12, 21, 0, () => {
    b.rz(1.0);
    b.torus(4.2, 0.9, '#111827', 16, 6);
    b.cyl(0.7, 0.7, 7, '#374151', 6, false);
  });
  // engine block + exhausts
  b.at(-hx * 0.8, 12.5, 0, () => b.box(4.5, 4.2, hz * 0.32, '#6b7280'));
  b.at(-hx * 0.8, 17.2, 0, () => b.blob(4, 1.2, hz * 0.28, '#9ca3af', 0.3));
  for (const s of [-1, 1]) {
    b.at(-hx * 0.75, 11, s * 4.5, () => {
      b.rz(PI / 2 + 0.25);
      b.cyl(1.7, 2.1, hx * 0.32, '#4b5563', 10);
    });
  }
  // axles
  b.at(D.rearX, D.rR, 0, () => {
    b.rx(PI / 2).t(0, -D.rearZ, 0);
    b.cyl(1.3, 1.3, D.rearZ * 2, '#374151', 6, false);
  });
  b.at(D.frontX, D.rF, 0, () => {
    b.rx(PI / 2).t(0, -D.frontZ, 0);
    b.cyl(1.1, 1.1, D.frontZ * 2, '#374151', 6, false);
  });

  // ---------------- driver body
  const a = d.art;
  const sx = D.seatX;
  b.at(sx + 1, 22.5, 0, () => b.blob(6.8, 8.6, 8.2, a.fur, 1, 14, 10));
  b.at(sx + 5, 21.5, 0, () => b.blob(3.4, 6, 5.6, a.face));
  // arms to the steering wheel
  for (const s of [-1, 1]) {
    const sh: V3 = [sx + 2, 27, s * 7.2];
    const el: V3 = [sx + 8, 22, s * 8.5];
    const hand: V3 = [sx + 12.5, 22.5, s * 3.6];
    b.tube([sh, [(sh[0] + el[0]) / 2, (sh[1] + el[1]) / 2 + 0.5, (sh[2] + el[2]) / 2], el, [(el[0] + hand[0]) / 2, (el[1] + hand[1]) / 2, (el[2] + hand[2]) / 2], hand], (t) => 2.3 - t * 0.5, a.fur, 8);
    b.at(hand[0], hand[1], hand[2], () => b.sphere(2.3, a.face, 10, 6));
  }
  // tail curling up behind the seat
  const tail: V3[] = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const ang = t * PI * 1.6;
    tail.push([sx - 8 - t * 9 - Math.sin(ang) * 4, 16 + t * 20 + Math.sin(ang) * 4, Math.sin(t * PI) * 3 + (1 - Math.cos(ang)) * 2]);
  }
  b.tube(tail, (t) => 1.8 - t * 0.9, a.fur, 7);
  b.at(tail[14][0], tail[14][1], tail[14][2], () => b.sphere(1.2, a.furDark, 8, 5));

  // ---------------- accessory
  const acc = k.accessoryColor;
  switch (k.accessory) {
    case 'bananas':
      for (let i = 0; i < 4; i++) {
        const z = -4.5 + i * 3;
        const pts: V3[] = [];
        for (let j = 0; j <= 8; j++) {
          const t = j / 8;
          pts.push([-hx * 0.78 + Math.sin(t * PI) * 3 - 2, 19 + t * 11, z + Math.sin(t * 2.6) * 1.5]);
        }
        b.tube(pts, (t) => 1.9 * Math.sin(0.25 + t * 2.6) + 0.4, '#facc15', 7);
        b.at(pts[8][0], pts[8][1], pts[8][2], () => b.sphere(0.8, '#713f12', 6, 4));
      }
      break;
    case 'flag': {
      b.at(-hx * 0.75, 12, -hz * 0.5, () => b.cyl(0.55, 0.55, 34, '#e5e7eb', 6));
      b.emissive = 0.1;
      b.at(-hx * 0.75 - 7, 41, -hz * 0.5, () => b.quad(13, 8, (x, y) => ((Math.floor((x + 7) / 3) + Math.floor((y + 4) / 3)) % 2 ? acc : '#111827')));
      b.emissive = 0;
      break;
    }
    case 'horn':
      for (const s of [-1, 1]) {
        b.at(hx * 0.45, 15, s * hz * 0.5, () => {
          b.rz(-PI / 2 + 0.3);
          b.cyl(1, 3.4, 11, acc, 12);
        });
      }
      break;
    case 'spoiler':
      for (const s of [-1, 1]) b.at(-hx * 0.86, 17, s * hz * 0.4, () => b.box(1.2, 5, 0.8, '#374151'));
      b.at(-hx * 0.9, 22.5, 0, () => {
        b.rz(0.12);
        b.blob(5.2, 0.9, hz * 0.95, acc, 0.25);
      });
      for (const s of [-1, 1]) b.at(-hx * 0.9, 22, s * hz * 0.95, () => b.box(5.6, 3, 0.4, dark(body, 0.8)));
      break;
    case 'umbrella': {
      b.at(-hx * 0.7, 14, 0, () => b.cyl(0.6, 0.6, 34, '#f8fafc', 6));
      const cols = ['#f43f5e', '#facc15', '#22c55e', '#3b82f6', '#a855f7', '#fb923c'];
      b.at(-hx * 0.7, 46, 0, () => {
        b.rx(0.25);
        b.cyl(13, 0.3, 6, (x, _y, z) => cols[Math.floor(((Math.atan2(z, x) / (PI * 2) + 1) % 1) * 6)], 24, true);
      });
      break;
    }
    case 'rocket':
      b.at(-hx * 0.62, 21, 0, () => {
        b.rz(PI / 2);
        b.t(0, -10, 0);
        b.cyl(4.6, 4.6, 20, acc, 14);
        b.at(0, 20, 0, () => b.cyl(4.6, 0.3, 8, '#e2e8f0', 14));
        b.at(0, -3, 0, () => b.cyl(2.5, 4.2, 3, '#374151', 12));
        for (let i = 0; i < 3; i++) {
          b.at(0, 2, 0, () => {
            b.ry((i / 3) * PI * 2);
            b.t(5, 0, 0);
            b.box(2.4, 3.5, 0.5, '#ef4444');
          });
        }
      });
      break;
    case 'antenna': {
      const pts: V3[] = [];
      for (let i = 0; i <= 8; i++) pts.push([-hx * 0.7 - (i * i) * 0.12, 14 + i * 4.5, hz * 0.45]);
      b.tube(pts, 0.5, '#d1d5db', 5);
      b.emissive = 0.8;
      b.at(pts[8][0], pts[8][1] + 1, pts[8][2], () => b.sphere(2, '#ef4444', 10, 6));
      b.emissive = 0;
      break;
    }
  }
  return b.build();
}

/** Half-torus facing +X: ∩ when up, ∪ otherwise. */
function arc(b: MeshBuilder, R: number, r: number, c: string, up: boolean): void {
  b.push().rx(PI / 2).rz(PI / 2);
  if (!up) b.rx(PI);
  b.torus(R, r, c, 10, 5, PI);
  b.pop();
}

/** Head mesh with origin at the neck pivot; faces +X. */
function buildHead(d: Driver, expr: number): MeshData {
  const b = new MeshBuilder();
  const a = d.art;
  const crossEyed = d.id === 1;
  b.at(0, 8, 0, () => b.blob(10.5, 10, 10.2, a.fur, 1, 18, 12));
  // face mask + muzzle
  b.at(5.6, 7.6, 0, () => b.blob(5.6, 7.2, 8.2, a.face, 1, 16, 10));
  b.at(8.4, 4.4, 0, () => b.blob(4.6, 3.7, 5.8, a.face, 1, 14, 9));
  for (const s of [-1, 1]) b.at(12.6, 5.6, s * 1.3, () => b.sphere(0.65, a.furDark, 6, 4));
  // ears
  for (const s of [-1, 1]) {
    b.at(0, 8.5, s * 10.4, () => b.blob(2.2, 4.2, 4.2 * 0.9, a.ear));
    b.at(0.8, 8.5, s * 11.2, () => b.blob(1.2, 2.6, 2.4, dark(a.ear, 0.8)));
  }
  // brows
  for (const s of [-1, 1]) {
    b.at(10, expr === EXPR_SCREAM ? 14.6 : 13.6, s * 3.4, () => {
      b.rx(s * (expr === EXPR_CRY ? -0.35 : expr === EXPR_SCREAM ? 0.25 : 0.1));
      b.blob(1.2, 0.8, 2.6, a.furDark);
    });
  }
  // eyes
  const eyeY = 10.2;
  for (const s of [-1, 1]) {
    const ez = s * 3.3;
    if (expr === EXPR_CRY || expr === EXPR_HAPPY) {
      b.at(10.9, eyeY + (expr === EXPR_HAPPY ? -0.6 : 0.6), ez, () => arc(b, 2.0, 0.55, '#111827', expr === EXPR_HAPPY));
      if (expr === EXPR_CRY) {
        b.emissive = 0.35;
        const tear: V3[] = [[10.8, eyeY - 1.8, ez * 1.05], [11, eyeY - 4, ez * 1.15], [10.9, eyeY - 6.5, ez * 1.25]];
        b.tube(tear, (t) => 0.7 + t * 0.5, '#60a5fa', 6);
        b.at(10.9, eyeY - 7.2, ez * 1.25, () => b.sphere(1.3, '#93c5fd', 8, 5));
        b.emissive = 0;
      }
    } else {
      const big = expr === EXPR_SCREAM ? 1.25 : 1;
      b.at(9.9, eyeY, ez, () => b.blob(1.9 * big, 3 * big, 2.5 * big, '#ffffff'));
      const pz = crossEyed ? -s * 0.9 : 0;
      const pr = expr === EXPR_SCREAM ? 1.0 : 1.35;
      b.at(11.4 + (big - 1) * 2, eyeY + (crossEyed && s > 0 ? 0.6 : 0), ez + pz, () => b.sphere(pr, '#0b0f19', 8, 6));
      b.emissive = 1;
      b.at(12.2 + (big - 1) * 2, eyeY + 0.8, ez + pz - 0.4, () => b.sphere(0.4, '#ffffff', 5, 3));
      b.emissive = 0;
    }
  }
  // mouth
  if (expr === EXPR_SCREAM) {
    b.at(12, 2.4, 0, () => b.blob(1.6, 2.6, 3.0, '#3b0a0a'));
    b.at(12.4, 1.2, 0, () => b.blob(1, 1, 1.9, '#f472b6'));
  } else if (expr === EXPR_HAPPY) {
    b.at(12, 2.6, 0, () => b.blob(1.3, 1.9, 3.6, '#7f1d1d'));
    b.at(12.6, 3.6, 0, () => b.blob(0.6, 0.6, 2.8, '#ffffff'));
  } else if (expr === EXPR_CRY) {
    b.at(12.3, 1.6, 0, () => arc(b, 2.2, 0.55, '#3b0a0a', true));
  } else {
    b.at(12.5, 3.0, 0, () => b.blob(0.6, 0.7, 2.8, '#3b0a0a'));
  }
  // extras
  switch (a.extra) {
    case 'mandrill':
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) b.at(8.4, 4.8 + i * 1.6, s * (4.8 + i * 0.3), () => b.blob(3.8 - i * 0.6, 0.6, 0.8, a.extraColor));
      }
      b.at(12.9, 6.2, 0, () => b.sphere(1.5, '#dc2626', 8, 5));
      break;
    case 'flanges':
      for (const s of [-1, 1]) b.at(4.5, 6.5, s * 10.6, () => b.blob(2.2, 7.6, 6.2, a.extraColor));
      break;
    case 'tufts':
      for (const s of [-1, 1]) b.at(-1, 12, s * 11.2, () => b.blob(3.2, 5.5, 3.6, a.extraColor, 0.8));
      break;
    case 'crest':
      b.at(-2, 17, 0, () => b.blob(7.5, 5, 4.2, a.extraColor));
      break;
    case 'cheeks':
      for (const s of [-1, 1]) b.at(9.4, 6.2, s * 5.8, () => b.sphere(1.9, a.extraColor, 8, 5));
      break;
  }
  // hats
  const hc = a.hatColor;
  switch (a.hat) {
    case 'cap':
      b.at(-0.5, 12.6, 0, () => b.blob(10.9, 6.6, 10.9, hc));
      b.at(9.5, 14.8, 0, () => {
        b.rz(-0.12);
        b.blob(7, 0.9, 8, dark(hc, 0.8));
      });
      b.at(-0.5, 19.3, 0, () => b.sphere(1.4, dark(hc, 0.7), 8, 5));
      break;
    case 'helmet':
      b.at(-0.5, 10, 0, () => b.blob(12, 11, 12, hc));
      break;
    case 'bow':
      for (const s of [-1, 1]) {
        b.at(-1, 18.5, s * 3.6, () => {
          b.rx(s * 0.5);
          b.blob(2.6, 3.4, 4.2, hc);
        });
      }
      b.at(-1, 18.5, 0, () => b.sphere(2, dark(hc, 0.8), 8, 5));
      break;
    case 'bandana':
      b.at(0.4, 12.2, 0, () => {
        b.rz(-0.12);
        b.torus(10.1, 1.8, hc, 22, 6);
      });
      for (const s of [-1, 1]) b.at(-11, 10, s * 1.8, () => {
        b.rx(s * 0.6);
        b.blob(1.2, 4.2, 1.8, dark(hc, 0.85));
      });
      break;
    case 'crown':
      b.at(0, 16.5, 0, () => {
        b.cyl(6, 6.4, 3.2, '#facc15', 16);
        for (let i = 0; i < 6; i++) b.at(Math.cos((i / 6) * PI * 2) * 5.8, 3, Math.sin((i / 6) * PI * 2) * 5.8, () => b.cyl(1.2, 0, 3.4, '#facc15', 6));
      });
      break;
    case 'astro':
      b.at(0, -1.5, 0, () => b.torus(10.5, 2.6, hc, 22, 8));
      for (const s of [-1, 1]) b.at(0, 8.5, s * 12.4, () => {
        b.rx(PI / 2);
        b.cyl(4.2, 4.2, 1.8, '#94a3b8', 14);
      });
      b.at(-1, 17, 0, () => b.cyl(0.4, 0.4, 7, '#cbd5e1', 6, false));
      b.emissive = 1;
      b.at(-1, 25, 0, () => b.sphere(1.6, '#f97316', 8, 5));
      b.emissive = 0;
      break;
  }
  // eyewear
  const ec = a.eyewearColor;
  switch (a.eyewear) {
    case 'goggles':
      for (const s of [-1, 1]) {
        b.at(10.8, eyeY + 0.2, s * 3.4, () => {
          b.rz(PI / 2);
          b.torus(2.7, 0.85, '#334155', 14, 6);
          b.emissive = 0.25;
          b.disc(2.2, 0, ec, 12, true);
          b.emissive = 0;
        });
      }
      b.at(0, eyeY + 0.5, 0, () => b.torus(10.4, 0.8, '#334155', 22, 5));
      break;
    case 'shades':
      for (const s of [-1, 1]) b.at(11.4, eyeY + 0.3, s * 3.2, () => b.blob(0.8, 2.3, 3.0, ec, 0.5));
      b.at(11.8, eyeY + 1, 0, () => b.box(0.4, 0.4, 1.4, ec));
      break;
    case 'round':
      for (const s of [-1, 1]) {
        b.at(11.6, eyeY, s * 3.3, () => {
          b.rz(PI / 2);
          b.torus(2.6, 0.4, ec, 14, 5);
        });
      }
      break;
  }
  return b.build();
}

const kartCache = new Map<number, KartModel>();
export function kartModel(driver: number): KartModel {
  let m = kartCache.get(driver);
  if (!m) {
    const d = DRIVERS[driver];
    const D = kartDims(d);
    m = {
      body: buildBody(d, D),
      wheel: wheel(D.rR, D.wR, d.kart.trim),
      wheelF: wheel(D.rF, D.wF, d.kart.trim),
      heads: [0, 1, 2, 3].map((e) => buildHead(d, e)),
      dims: D,
    };
    kartCache.set(driver, m);
  }
  return m;
}

// ------------------------------------------------------------------ items

export function itemBoxMesh(): MeshData {
  const b = new MeshBuilder();
  b.emissive = 0.55;
  b.box(12, 12, 12, '#ffffff');
  b.hasUv = true;
  return b.build();
}

export function bananaPeelMesh(): MeshData {
  const b = new MeshBuilder();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + 0.4;
    const pts: V3[] = [];
    for (let j = 0; j <= 7; j++) {
      const t = j / 7;
      const r = t * 13;
      pts.push([Math.cos(a) * r, 7 - t * t * 6.5 + Math.sin(t * PI) * 2, Math.sin(a) * r]);
    }
    b.tube(pts, (t) => 3.2 * (1 - t * 0.6), (_x, y) => (y > 5 ? '#fde047' : '#facc15'), 8);
  }
  b.at(0, 6, 0, () => b.blob(3.4, 6, 3.4, '#fde68a'));
  b.at(0, 12.5, 0, () => b.cyl(1.4, 0.9, 3.5, '#713f12', 8));
  // brown spots
  for (let i = 0; i < 5; i++) {
    const a = i * 1.7;
    b.at(Math.cos(a) * 7, 4.8, Math.sin(a) * 7, () => b.sphere(0.9, '#92400e', 6, 4));
  }
  return b.build();
}

export function cocoMesh(): MeshData {
  const b = new MeshBuilder();
  const m = b.mark();
  b.sphere(11, (x, y, z) => {
    const h = Math.sin(x * 2.1) * Math.sin(y * 1.7 + z) > 0.4 ? 0.85 : 1;
    return [0.47 * h, 0.29 * h, 0.13 * h];
  }, 20, 14);
  b.displace(m.v, (x, y, z) => Math.sin(x * 1.3 + y * 2.1) * 0.35 + Math.sin(z * 1.7) * 0.3);
  // angry face
  for (const s of [-1, 1]) {
    b.at(9.4, 2.5, s * 3.8, () => b.blob(1.6, 2.6, 2.2, '#ffffff'));
    b.at(10.8, 2.2, s * 3.6, () => b.sphere(1.1, '#111827', 8, 5));
    b.at(10.3, 5.6, s * 3.6, () => {
      b.rx(s * 0.5);
      b.box(0.8, 0.6, 2.8, '#1c1003');
    });
  }
  b.at(10.4, -3.2, 0, () => b.blob(0.8, 0.8, 3.4, '#1c1003'));
  // propeller mast
  b.at(0, 10, 0, () => b.cyl(0.8, 0.8, 6, '#9ca3af', 6));
  return b.build();
}

export function propellerMesh(): MeshData {
  const b = new MeshBuilder();
  b.at(0, 0, 0, () => b.blob(13, 0.5, 2.2, '#e5e7eb', 0.5));
  b.at(0, 0, 0, () => b.sphere(1.6, '#ef4444', 8, 5));
  return b.build();
}

export function chineloMesh(): MeshData {
  const b = new MeshBuilder();
  b.at(0, 0, 0, () => b.blob(14, 1.8, 6.4, (_x, y) => (y > 0.6 ? '#fde047' : '#16a34a'), 0.35, 20, 8));
  const strap: V3[] = [[-5, 1, -5.6], [1, 4.2, -3.5], [5.5, 2.2, 0], [1, 4.2, 3.5], [-5, 1, 5.6]];
  b.tube(strap, 1.1, '#2563eb', 7);
  b.at(5.5, 2.2, 0, () => b.sphere(1.5, '#1d4ed8', 8, 5));
  return b.build();
}

export function beeMesh(): MeshData {
  const b = new MeshBuilder();
  b.blob(3.2, 2.4, 2.4, (x) => (Math.floor((x + 3.2) / 1.3) % 2 ? '#111827' : '#facc15'), 1, 12, 8);
  b.at(3.2, 0.4, 0, () => b.sphere(1.6, '#111827', 8, 5));
  b.at(-3.4, 0, 0, () => b.cyl(0.6, 0, 2, '#111827', 5));
  b.emissive = 0.6;
  for (const s of [-1, 1]) b.at(0, 2.4, s * 2.4, () => {
    b.rx(s * 0.5);
    b.blob(1.6, 0.25, 3, '#e0f2fe');
  });
  b.emissive = 0;
  return b.build();
}

// ---------------------------------------------------------------- hazards

export function hazardMesh(kind: string): MeshData {
  const b = new MeshBuilder();
  switch (kind) {
    case 'crab': {
      b.at(0, 9, 0, () => b.blob(9, 5, 13, '#ef4444', 0.8));
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const x = -5 + i * 5;
          b.tube([[x, 8, s * 10], [x + 1, 11, s * 17], [x + 2, 0, s * 20]], 1.1, '#b91c1c', 5);
        }
        b.tube([[5, 9, s * 9], [10, 13, s * 13], [14, 14, s * 14]], 1.4, '#dc2626', 6);
        b.at(16, 14.5, s * 14, () => b.blob(4.5, 3.2, 3.2, '#f87171'));
        b.at(19, 16, s * 14, () => b.blob(3.2, 1, 1.4, '#fecaca'));
        b.tube([[6, 12, s * 3], [7, 18, s * 3.4]], 0.7, '#b91c1c', 5);
        b.at(7, 19, s * 3.4, () => b.sphere(1.8, '#ffffff', 8, 5));
        b.at(8.4, 19.2, s * 3.4, () => b.sphere(0.9, '#111827', 6, 4));
      }
      break;
    }
    case 'dog': {
      const fur = '#e8b774';
      b.at(0, 16, 0, () => b.blob(15, 7, 7.5, fur));
      for (const [x, z] of [[9, 4.5], [9, -4.5], [-9, 4.5], [-9, -4.5]]) b.at(x, 0, z, () => b.cyl(2, 2.2, 13, '#c98a45', 8));
      b.at(15, 23, 0, () => b.blob(7, 6.5, 6.2, '#f1c98a'));
      b.at(21, 21, 0, () => b.blob(4.5, 3.2, 3.8, '#f1c98a'));
      b.at(25, 22, 0, () => b.sphere(1.5, '#111827', 8, 5));
      for (const s of [-1, 1]) {
        b.at(19, 25.5, s * 3.2, () => b.sphere(1.2, '#111827', 6, 4));
        b.at(12, 27, s * 5, () => {
          b.rx(s * 0.5);
          b.blob(2.2, 5.5, 1.2, '#7c4a1d');
        });
      }
      b.at(22.5, 18.5, 1.2, () => b.blob(2, 0.5, 1.6, '#ef4444'));
      b.at(10, 20, 0, () => b.torus(5.5, 1, '#ef4444', 14, 5), 0, 0, 1.2);
      b.tube([[-14, 18, 0], [-19, 24, 0], [-18, 30, 0]], (t) => 1.8 - t * 0.8, '#c98a45', 6);
      break;
    }
    case 'asteroid': {
      const m = b.mark();
      b.jitter = 0.2;
      b.sphere(27, (x, y, z) => (Math.sin(x * 0.4) + Math.sin(y * 0.5 + z * 0.3) > 0.8 ? '#57534e' : '#78716c'), 16, 11);
      b.displace(m.v, (x, y, z) => Math.sin(x * 0.21 + 1) * Math.sin(y * 0.18) * 4 + Math.sin(z * 0.33 + x * 0.1) * 2.5);
      b.facet(m.v, m.i);
      b.emissive = 0.9;
      for (let i = 0; i < 4; i++) {
        const a = i * 1.9, e = i * 0.8 - 1;
        b.at(Math.cos(a) * Math.cos(e) * 26, Math.sin(e) * 26, Math.sin(a) * Math.cos(e) * 26, () => b.sphere(3.2, '#f97316', 8, 5));
      }
      b.emissive = 0;
      break;
    }
    case 'barrel': {
      b.cyl(12, 12, 28, (_x, y) => (Math.abs(y - 6) < 1.5 || Math.abs(y - 22) < 1.5 ? '#7c2d12' : '#f97316'), 18);
      b.emissive = 0.5;
      b.at(0, 14, 0, () => b.torus(12.2, 1.2, '#fde047', 18, 4));
      b.emissive = 0;
      b.at(0, 28, 0, () => b.disc(9, 0.2, '#1f2937', 14, true));
      break;
    }
    case 'log': {
      b.at(0, 0, 0, () => {
        b.rz(PI / 2).t(0, -45, 0);
        b.cyl(13, 13, 90, (x, y, z) => (Math.sin(Math.atan2(z, x) * 9 + y * 0.05) > 0.3 ? '#6b4226' : '#5a3a1e'), 16, false);
        b.disc(12.8, 90, (x, _y, z) => (Math.floor(Math.hypot(x, z) / 2.5) % 2 ? '#d6a46b' : '#b98550'), 16, true);
        b.disc(12.8, 0, (x, _y, z) => (Math.floor(Math.hypot(x, z) / 2.5) % 2 ? '#d6a46b' : '#b98550'), 16, false);
      });
      break;
    }
  }
  return b.build();
}

// ---------------------------------------------------------------- scenery

/** Builds a few randomized variants of a scenery prop (origin at ground). */
export function sceneryVariants(kind: string, seed: number, n = 4): MeshData[] {
  const out: MeshData[] = [];
  for (let v = 0; v < n; v++) {
    const rnd = mulberry32(seed * 131 + v * 977 + kind.length * 13);
    const b = new MeshBuilder();
    b.rnd = rnd;
    buildProp(b, kind, rnd);
    out.push(b.build());
  }
  return out;
}

const HOUSE_COLS = ['#e07a5f', '#f2cc8f', '#81b29a', '#e9c46a', '#f4a261', '#c9ada7', '#a3c4f3', '#f28482', '#ffcad4', '#90be6d'];

function lumpy(b: MeshBuilder, rx: number, ry: number, rz: number, col: string | V3, amp: number, rnd: () => number): void {
  const m = b.mark();
  b.blob(rx, ry, rz, col, 1, 12, 8);
  const p1 = rnd() * 10, p2 = rnd() * 10;
  b.displace(m.v, (x, y, z) => (Math.sin(x * 0.07 + p1) * Math.sin(z * 0.08 + p2) + Math.sin(y * 0.09 + p2)) * amp);
  b.facet(m.v, m.i);
}

function buildProp(b: MeshBuilder, kind: string, rnd: () => number): void {
  const r = (a: number, c: number) => a + rnd() * (c - a);
  switch (kind) {
    case 'tree': {
      const h = r(150, 200);
      const bend = r(-14, 14);
      const trunk: V3[] = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        trunk.push([Math.sin(t * 2) * bend, t * h, Math.cos(t * 1.5) * bend * 0.4]);
      }
      b.tube(trunk, (t) => 14 - t * 7, (_x, y) => (Math.sin(y * 0.2) > 0.6 ? '#4a2f18' : '#5c3b1f'), 9);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * PI * 2 + rnd();
        b.tube([[Math.cos(a) * 6, 18, Math.sin(a) * 6], [Math.cos(a) * 16, 6, Math.sin(a) * 16], [Math.cos(a) * 22, -6, Math.sin(a) * 22]], (t) => 5 - t * 3, '#4a2f18', 6);
      }
      const greens: V3[] = [[0.18, 0.55, 0.27], [0.13, 0.45, 0.22], [0.29, 0.69, 0.33], [0.1, 0.38, 0.2]];
      const top = trunk[8];
      const nb = 5 + Math.floor(rnd() * 3);
      for (let i = 0; i < nb; i++) {
        const a = rnd() * PI * 2;
        const d = i === 0 ? 0 : r(30, 62);
        const rr = i === 0 ? r(70, 85) : r(42, 60);
        b.push().t(top[0] + Math.cos(a) * d, top[1] + r(-20, 30) + (i === 0 ? 30 : 0), top[2] + Math.sin(a) * d);
        lumpy(b, rr, rr * 0.7, rr, greens[Math.floor(rnd() * greens.length)], 7, rnd);
        b.pop();
      }
      // vines
      for (let i = 0; i < 5; i++) {
        const a = rnd() * PI * 2;
        const x = top[0] + Math.cos(a) * r(30, 60), z = top[2] + Math.sin(a) * r(30, 60);
        const y0 = top[1] - 10, y1 = y0 - r(50, 110);
        b.tube([[x, y0, z], [x + 3, (y0 + y1) / 2, z + 2], [x, y1, z]], 1.4, '#166534', 5);
        b.at(x, y1, z, () => b.sphere(3, '#22c55e', 6, 4));
      }
      break;
    }
    case 'palm': {
      const h = r(200, 260);
      const lean = r(25, 60);
      const pts: V3[] = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        pts.push([Math.sin(t * 1.4) * lean, t * h, 0]);
      }
      b.tube(pts, (t) => 9 - t * 3.5, (_x, y) => (Math.floor(y / 11) % 2 ? '#a0703c' : '#8a5a2b'), 9);
      const top = pts[12];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * PI * 2 + rnd() * 0.3;
        const len = r(80, 110);
        const droop = r(40, 70);
        b.surface(10, 2, (u, v) => {
          const t = u;
          const w = Math.sin(t * PI) * 14 * (1 - t * 0.3);
          const across = (v - 0.5) * 2 * w;
          const along = t * len;
          const x = Math.cos(a) * along - Math.sin(a) * across;
          const z = Math.sin(a) * along + Math.cos(a) * across;
          const y = Math.sin(t * PI * 0.6) * 22 - t * t * droop - Math.abs(v - 0.5) * 6;
          return [top[0] + x, top[1] + y, top[2] + z];
        }, (_x, _y, _z, u) => (u > 0.5 ? '#16a34a' : '#22c55e'), false);
        // backside (double sided)
        b.surface(10, 2, (u, v) => {
          const t = u;
          const w = Math.sin(t * PI) * 14 * (1 - t * 0.3);
          const across = (v - 0.5) * 2 * w;
          const along = t * len;
          const x = Math.cos(a) * along - Math.sin(a) * across;
          const z = Math.sin(a) * along + Math.cos(a) * across;
          const y = Math.sin(t * PI * 0.6) * 22 - t * t * droop - Math.abs(v - 0.5) * 6 - 0.6;
          return [top[0] + x, top[1] + y, top[2] + z];
        }, '#15803d', false, true);
      }
      for (let i = 0; i < 3; i++) b.at(top[0] + Math.cos(i * 2.1) * 7, top[1] - 6, top[2] + Math.sin(i * 2.1) * 7, () => b.sphere(6, '#6b4226', 8, 6));
      break;
    }
    case 'fern': {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * PI * 2 + rnd();
        const len = r(40, 60);
        b.surface(8, 1, (u, v) => {
          const w = Math.sin(u * PI) * 7;
          const across = (v - 0.5) * 2 * w;
          const along = u * len;
          return [Math.cos(a) * along - Math.sin(a) * across, Math.sin(u * PI * 0.8) * 34 - u * u * 18, Math.sin(a) * along + Math.cos(a) * across];
        }, i % 2 ? '#22c55e' : '#15803d', false);
        b.surface(8, 1, (u, v) => {
          const w = Math.sin(u * PI) * 7;
          const across = (v - 0.5) * 2 * w;
          const along = u * len;
          return [Math.cos(a) * along - Math.sin(a) * across, Math.sin(u * PI * 0.8) * 34 - u * u * 18 - 0.5, Math.sin(a) * along + Math.cos(a) * across];
        }, '#166534', false, true);
      }
      break;
    }
    case 'rock': {
      b.jitter = 0.15;
      b.push().t(0, 8, 0);
      lumpy(b, r(40, 55), r(28, 40), r(35, 50), rnd() < 0.5 ? '#6b7280' : '#78716c', 6, rnd);
      b.pop();
      if (rnd() < 0.6) b.push().t(r(25, 40), 2, r(-20, 20)), lumpy(b, 18, 14, 16, '#9ca3af', 3, rnd), b.pop();
      break;
    }
    case 'stump': {
      b.cyl(24, 20, 26, '#6b4226', 14);
      b.disc(19.5, 26.2, (x, _y, z) => (Math.floor(Math.hypot(x, z) / 3.5) % 2 ? '#d6a46b' : '#b98550'), 14, true);
      for (let i = 0; i < 3; i++) b.at(Math.cos(i * 2.2) * 18, 30, Math.sin(i * 2.2) * 18, () => {
        b.cyl(1.2, 1.2, 6, '#fef3c7', 6);
        b.at(0, 6, 0, () => b.blob(5, 2.5, 5, '#ef4444'));
      });
      break;
    }
    case 'flower': {
      const cols = ['#f472b6', '#facc15', '#a78bfa', '#fb7185', '#f97316'];
      for (let i = 0; i < 4; i++) {
        const x = r(-20, 20), z = r(-20, 20);
        const h = r(18, 34);
        b.tube([[x, 0, z], [x + 2, h / 2, z], [x, h, z]], 1, '#15803d', 4);
        b.emissive = 0.15;
        const c = cols[Math.floor(rnd() * cols.length)];
        for (let p = 0; p < 5; p++) b.at(x + Math.cos(p * 1.256) * 4, h, z + Math.sin(p * 1.256) * 4, () => b.blob(3.4, 1, 3.4, c));
        b.at(x, h + 0.8, z, () => b.sphere(2.4, '#fde047', 6, 4));
        b.emissive = 0;
      }
      break;
    }
    case 'house':
    case 'house2':
    case 'tower': {
      const floors = kind === 'tower' ? 4 + Math.floor(rnd() * 3) : 1 + Math.floor(rnd() * 3);
      const w = kind === 'tower' ? r(50, 62) : r(80, 112);
      const d = kind === 'tower' ? r(50, 62) : r(70, 95);
      const fh = 44;
      let y = 0;
      for (let f = 0; f < floors; f++) {
        const c = HOUSE_COLS[Math.floor(rnd() * HOUSE_COLS.length)];
        const brick = rnd() < 0.35;
        const ww = w * (f > 0 ? r(0.8, 1.02) : 1);
        const dd = d * (f > 0 ? r(0.8, 1.02) : 1);
        const ox = f > 0 ? r(-8, 8) : 0;
        const paint: Paint = brick ? (px, py, pz) => ((Math.floor(py / 6) + Math.floor((px + pz) / 12)) % 2 ? '#c2410c' : '#b45309') : c;
        b.at(ox, y + fh / 2, 0, () => b.box(ww / 2, fh / 2, dd / 2, paint));
        // windows + door
        const nWin = Math.max(1, Math.floor(ww / 34));
        for (const s of [-1, 1]) {
          for (let i = 0; i < nWin; i++) {
            const wx = ox - ww / 2 + (ww / nWin) * (i + 0.5);
            const lit = rnd() < 0.4;
            b.emissive = lit ? 0.85 : 0;
            b.at(wx, y + fh * 0.55, s * (dd / 2 + 0.4), () => b.box(6.5, 8, 0.6, lit ? '#fde68a' : '#1e3a5f'));
            b.emissive = 0;
            if (rnd() < 0.4) b.at(wx, y + fh * 0.55 - 10, s * (dd / 2 + 3), () => b.box(8, 1, 3, '#64748b'));
          }
          for (let i = 0; i < Math.max(1, Math.floor(dd / 40)); i++) {
            const lit = rnd() < 0.35;
            b.emissive = lit ? 0.85 : 0;
            b.at(s * (ww / 2 + 0.4) + ox, y + fh * 0.55, -dd / 2 + (dd / Math.max(1, Math.floor(dd / 40))) * (i + 0.5), () => b.box(0.6, 8, 6.5, lit ? '#fde68a' : '#1e3a5f'));
            b.emissive = 0;
          }
        }
        if (f === 0) b.at(ox + ww * 0.25, 12, dd / 2 + 0.5, () => b.box(7, 12, 0.6, '#7c2d12'));
        // slab edge
        b.at(ox, y + fh + 1.5, 0, () => b.box(ww / 2 + 2, 1.5, dd / 2 + 2, '#9ca3af'));
        y += fh + 3;
      }
      // roof stuff: water tank, rebar, antenna
      b.at(r(-15, 15), y, r(-15, 15), () => {
        b.cyl(11, 12, 13, '#2563eb', 14);
        b.disc(11, 13, '#1d4ed8', 14, true);
      });
      for (let i = 0; i < 4; i++) b.at(r(-w / 2 + 4, w / 2 - 4), y, r(-d / 2 + 4, d / 2 - 4), () => b.cyl(0.6, 0.6, r(6, 14), '#7c2d12', 4, false));
      if (rnd() < 0.5) b.at(r(-10, 10), y, r(-10, 10), () => {
        b.cyl(0.6, 0.6, 30, '#d1d5db', 4, false);
        b.at(0, 30, 0, () => b.box(8, 0.5, 0.5, '#d1d5db'));
      });
      break;
    }
    case 'lamp': {
      b.cyl(2.6, 2, 95, '#334155', 8);
      b.at(9, 95, 0, () => b.box(11, 1.5, 2, '#334155'));
      b.emissive = 1;
      b.at(18, 92, 0, () => b.blob(5, 3, 4, '#fde68a'));
      b.emissive = 0;
      break;
    }
    case 'laundry': {
      for (const s of [-1, 1]) b.at(s * 45, 0, 0, () => b.cyl(1.4, 1.4, 60, '#78350f', 6));
      b.tube([[-45, 58, 0], [0, 52, 0], [45, 58, 0]], 0.5, '#f8fafc', 4);
      const cols = ['#ef4444', '#3b82f6', '#facc15', '#22c55e', '#f8fafc', '#ec4899'];
      for (let i = 0; i < 5; i++) {
        const x = -32 + i * 16;
        const h = r(14, 24);
        b.at(x, 53 - h / 2, 0, () => b.quad(r(9, 13), h, cols[Math.floor(rnd() * cols.length)]), r(-0.2, 0.2));
      }
      break;
    }
    case 'umbrella': {
      b.cyl(1.3, 1.3, 70, '#f8fafc', 6);
      const c1 = ['#ef4444', '#3b82f6', '#f97316', '#22c55e'][Math.floor(rnd() * 4)];
      b.at(0, 62, 0, () => {
        b.rx(r(-0.15, 0.15));
        b.cyl(48, 0.5, 16, (x, _y, z) => (Math.floor(((Math.atan2(z, x) / (PI * 2) + 1) % 1) * 8) % 2 ? c1 : '#f8fafc'), 16, true);
      });
      b.at(r(10, 30), 0.6, r(-10, 10), () => b.box(12, 0.5, 22, ['#f472b6', '#22d3ee', '#fde047'][Math.floor(rnd() * 3)]), r(0, 3));
      break;
    }
    case 'shack': {
      b.at(0, 26, 0, () => b.box(42, 26, 34, (_x, y) => (Math.floor(y / 6) % 2 ? '#a16207' : '#92400e')));
      b.at(0, 52, 0, () => {
        b.ry(PI / 4);
        b.cyl(68, 2, 34, (_x, y) => (Math.floor(y / 4) % 2 ? '#d6b36a' : '#c19a4b'), 4, true);
      });
      b.at(43, 18, 0, () => b.box(4, 18, 28, '#78350f'));
      b.emissive = 0.3;
      b.at(43, 37, 0, () => b.quad(1, 1, '#000'));
      b.emissive = 0;
      break;
    }
    case 'buoy': {
      b.cyl(9, 9, 22, (_x, y) => (Math.floor(y / 5.5) % 2 ? '#f8fafc' : '#ef4444'), 14);
      b.at(0, 22, 0, () => b.cyl(9, 2, 8, '#ef4444', 14));
      b.emissive = 1;
      b.at(0, 31, 0, () => b.sphere(2.4, '#fde047', 8, 5));
      b.emissive = 0;
      break;
    }
    case 'castle': {
      const sand = '#e9c97d';
      b.at(0, 12, 0, () => b.box(26, 12, 26, sand));
      for (const [x, z] of [[-24, -24], [24, -24], [-24, 24], [24, 24]]) {
        b.at(x, 0, z, () => {
          b.cyl(9, 8, 36, sand, 12);
          b.at(0, 36, 0, () => b.cyl(9, 0, 12, '#d4a95a', 12));
        });
      }
      b.at(0, 24, 0, () => b.cyl(11, 10, 22, sand, 12));
      b.at(0, 46, 0, () => b.cyl(0.6, 0.6, 14, '#78350f', 4, false));
      b.at(5, 56, 0, () => b.quad(10, 6, '#ef4444'));
      break;
    }
    case 'antenna': {
      const h = r(170, 240);
      for (const [x, z] of [[-7, -7], [7, -7], [0, 8]]) b.tube([[x * 2, 0, z * 2], [x * 0.3, h, z * 0.3]], 1.4, '#94a3b8', 5);
      for (let i = 1; i < 7; i++) {
        const y = (i / 7) * h;
        const k = 1 - y / h;
        b.at(0, y, 0, () => b.torus(12 * k + 2, 0.8, '#64748b', 10, 4));
      }
      b.emissive = 1;
      b.at(0, h + 4, 0, () => b.sphere(4, '#ef4444', 8, 5));
      b.emissive = 0;
      break;
    }
    case 'panel': {
      b.cyl(3, 3, 60, '#94a3b8', 8);
      b.at(0, 62, 0, () => {
        b.rx(r(-0.5, 0.5)).rz(0.4);
        b.emissive = 0.35;
        b.box(40, 1.5, 100, (x, _y, z) => (Math.abs(((x + 40) % 13) - 6.5) < 0.8 || Math.abs(((z + 100) % 20) - 10) < 0.8 ? '#cbd5e1' : '#1d4ed8'));
        b.emissive = 0;
      });
      break;
    }
    case 'crystal': {
      const c = rnd() < 0.5 ? '#e879f9' : '#22d3ee';
      b.emissive = 0.6;
      for (let i = 0; i < 4; i++) {
        const m = b.mark();
        const h = r(40, 90);
        b.at(r(-15, 15), 0, r(-15, 15), () => {
          b.rx(r(-0.4, 0.4)).rz(r(-0.4, 0.4));
          b.cyl(r(8, 14), 0, h, c, 5, true);
        });
        b.facet(m.v, m.i);
      }
      b.emissive = 0;
      break;
    }
    case 'asteroid': {
      b.jitter = 0.25;
      b.push().t(0, 40, 0);
      lumpy(b, r(45, 70), r(35, 55), r(45, 65), rnd() < 0.5 ? '#57534e' : '#6b6259', 9, rnd);
      b.pop();
      break;
    }
    case 'dish': {
      b.cyl(8, 12, 40, '#64748b', 10);
      b.at(0, 52, 0, () => {
        b.rz(-0.7);
        b.surface(18, 6, (u, v) => {
          const a = u * PI * 2;
          const rr = v * 48;
          return [Math.cos(a) * rr, rr * rr * 0.012, Math.sin(a) * rr];
        }, '#e2e8f0', true, true);
        b.surface(18, 6, (u, v) => {
          const a = u * PI * 2;
          const rr = v * 48;
          return [Math.cos(a) * rr, rr * rr * 0.012 - 0.8, Math.sin(a) * rr];
        }, '#94a3b8', true, false);
        b.cyl(1, 1, 30, '#cbd5e1', 5, false);
        b.emissive = 1;
        b.at(0, 30, 0, () => b.sphere(3, '#22d3ee', 8, 5));
        b.emissive = 0;
      });
      break;
    }
    default:
      b.blob(20, 20, 20, '#888888');
  }
}


/** Start/finish gantry (origin at track center, local +Z across the track). */
export function gantryMesh(halfW: number): MeshData {
  const b = new MeshBuilder();
  const hw = halfW + 22;
  for (const s of [-1, 1]) {
    b.at(0, 0, s * hw, () => {
      b.cyl(7, 6, 150, (_x, y) => (Math.floor(y / 14) % 2 ? '#f8fafc' : '#ef4444'), 12);
      b.cyl(11, 11, 6, '#374151', 12);
    });
  }
  return b.build();
}

export function bannerMesh(halfW: number): MeshData {
  const b = new MeshBuilder();
  const hw = halfW + 22;
  b.at(0, 150, 0, () => b.box(6, 22, hw + 4, '#ffffff'));
  b.hasUv = true;
  return b.build();
}

export function postMesh(color: string, glow: boolean): MeshData {
  const b = new MeshBuilder();
  b.cyl(3, 2.6, 26, color, 8);
  if (glow) {
    b.emissive = 1;
    b.at(0, 26, 0, () => b.sphere(3.4, '#22d3ee', 8, 5));
    b.emissive = 0;
  } else b.at(0, 26, 0, () => b.cyl(3.4, 0.5, 3, '#a16207', 8));
  return b.build();
}

void EXPR_HAPPY;
