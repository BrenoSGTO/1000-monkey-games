import { BLOCKS, SOLID } from './data';
import type { World } from './world';
import { B, type Body } from './types';

export function newBody(x: number, y: number, w: number, h: number, step = true): Body {
  return { x, y, w, h, vx: 0, vy: 0, onGround: false, inWater: false, onLadder: false, stepSmooth: 0, step };
}

function overlapSolid(w: World, b: Body): boolean {
  const x0 = Math.floor(b.x - b.w / 2 + 1e-6);
  const x1 = Math.floor(b.x + b.w / 2 - 1e-6);
  const y0 = Math.floor(b.y - b.h + 1e-6);
  const y1 = Math.floor(b.y - 1e-6);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (SOLID[w.get(x, y)]) return true;
    }
  }
  return false;
}

/** Retorna a velocidade vertical de impacto (>0) se bateu no chão neste quadro. */
export function moveBody(w: World, b: Body, dt: number): number {
  const dist = Math.max(Math.abs(b.vx), Math.abs(b.vy)) * dt;
  const steps = Math.max(1, Math.ceil(dist / 0.3));
  const sdt = dt / steps;
  let impact = 0;
  const wasGround = b.onGround;
  b.onGround = false;
  for (let i = 0; i < steps; i++) {
    // eixo X
    b.x += b.vx * sdt;
    if (overlapSolid(w, b)) {
      let stepped = false;
      if (b.step && (wasGround || b.onGround) && !b.inWater) {
        const oy = b.y;
        b.y = oy - 1.02;
        if (!overlapSolid(w, b)) {
          b.stepSmooth += 1;
          stepped = true;
        } else b.y = oy;
      }
      if (!stepped) {
        if (b.vx > 0) b.x = Math.floor(b.x + b.w / 2) - b.w / 2 - 1e-4;
        else b.x = Math.floor(b.x - b.w / 2) + 1 + b.w / 2 + 1e-4;
        b.vx = 0;
      }
    }
    // eixo Y
    b.y += b.vy * sdt;
    if (overlapSolid(w, b)) {
      if (b.vy > 0) {
        b.y = Math.floor(b.y);
        impact = Math.max(impact, b.vy);
        b.onGround = true;
      } else {
        b.y = Math.floor(b.y - b.h) + 1 + b.h;
      }
      b.vy = 0;
    }
  }
  // limites do mundo
  if (b.x < b.w / 2 + 0.01) {
    b.x = b.w / 2 + 0.01;
    b.vx = 0;
  }
  if (b.y < 0) {
    b.y = 0;
    b.vy = Math.max(0, b.vy);
  }
  if (!b.onGround) {
    // sensor de chão (pequena tolerância)
    b.y += 0.03;
    const g = overlapSolid(w, b);
    b.y -= 0.03;
    if (g && b.vy >= 0) b.onGround = true;
  }
  // meio ambiente
  const cx = Math.floor(b.x);
  const mid = w.get(cx, Math.floor(b.y - b.h * 0.5));
  b.inWater = mid === B.WATER;
  b.onLadder = BLOCKS[mid].climb || BLOCKS[w.get(cx, Math.floor(b.y - 0.2))].climb;
  return impact;
}

export function bodiesOverlap(a: Body, b: Body, pad = 0): boolean {
  return (
    Math.abs(a.x - b.x) < (a.w + b.w) / 2 + pad &&
    a.y > b.y - b.h - pad &&
    a.y - a.h < b.y + pad
  );
}

/** Dano de blocos perigosos (cacto) tocando o corpo. */
export function hazardAt(w: World, b: Body): number {
  const x0 = Math.floor(b.x - b.w / 2);
  const x1 = Math.floor(b.x + b.w / 2);
  const y0 = Math.floor(b.y - b.h + 0.1);
  const y1 = Math.floor(b.y - 0.1);
  let dmg = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) dmg = Math.max(dmg, BLOCKS[w.get(x, y)].hurt);
  return dmg;
}
