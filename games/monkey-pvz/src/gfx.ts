// Primitivas de desenho em Canvas 2D (estilo cartum com contorno marrom-escuro).
export type C = CanvasRenderingContext2D;
export const TAU = Math.PI * 2;
export const OUT = '#33200f';

export function circ(c: C, x: number, y: number, r: number, fill: string, lw = 2.4): void {
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fillStyle = fill;
  c.fill();
  if (lw > 0) {
    c.lineWidth = lw;
    c.strokeStyle = OUT;
    c.stroke();
  }
}

export function ell(c: C, x: number, y: number, rx: number, ry: number, fill: string, lw = 2.4, rot = 0): void {
  c.beginPath();
  c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU);
  c.fillStyle = fill;
  c.fill();
  if (lw > 0) {
    c.lineWidth = lw;
    c.strokeStyle = OUT;
    c.stroke();
  }
}

export function poly(c: C, pts: number[], fill: string, lw = 2.4): void {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  if (lw > 0) {
    c.lineWidth = lw;
    c.lineJoin = 'round';
    c.strokeStyle = OUT;
    c.stroke();
  }
}

export function rrect(c: C, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

export function rrectFill(c: C, x: number, y: number, w: number, h: number, r: number, fill: string, lw = 2.4): void {
  rrect(c, x, y, w, h, r);
  c.fillStyle = fill;
  c.fill();
  if (lw > 0) {
    c.lineWidth = lw;
    c.strokeStyle = OUT;
    c.stroke();
  }
}

export function limb(c: C, x1: number, y1: number, x2: number, y2: number, w: number, fill: string): void {
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.strokeStyle = OUT;
  c.lineWidth = w + 4.4;
  c.stroke();
  c.strokeStyle = fill;
  c.lineWidth = w;
  c.stroke();
}

export function leaf(c: C, x: number, y: number, len: number, wid: number, rot: number, fill: string): void {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.beginPath();
  c.moveTo(0, 0);
  c.quadraticCurveTo(len * 0.5, -wid, len, 0);
  c.quadraticCurveTo(len * 0.5, wid, 0, 0);
  c.fillStyle = fill;
  c.fill();
  c.lineWidth = 2.2;
  c.strokeStyle = OUT;
  c.stroke();
  c.beginPath();
  c.moveTo(len * 0.1, 0);
  c.lineTo(len * 0.85, 0);
  c.lineWidth = 1.2;
  c.strokeStyle = 'rgba(20,60,10,.55)';
  c.stroke();
  c.restore();
}

export function banana(c: C, x: number, y: number, size: number, rot: number, fill = '#fde047'): void {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.scale(size / 20, size / 20);
  c.beginPath();
  c.moveTo(-18, -2);
  c.quadraticCurveTo(-2, 26, 20, -12);
  c.quadraticCurveTo(4, 8, -18, -2);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  c.lineWidth = 2.6;
  c.lineJoin = 'round';
  c.strokeStyle = OUT;
  c.stroke();
  circ(c, -18, -2, 2.4, '#6b3f1d', 0);
  c.beginPath();
  c.moveTo(20, -12);
  c.lineTo(23, -17);
  c.lineWidth = 3.4;
  c.strokeStyle = '#4d7c0f';
  c.lineCap = 'round';
  c.stroke();
  c.restore();
}

/** Olho com esclera, pupila e brilho. look = deslocamento da pupila. */
export function eyeBall(c: C, x: number, y: number, r: number, lx: number, ly: number, blink: boolean, sclera = '#ffffff'): void {
  if (blink) {
    c.beginPath();
    c.moveTo(x - r * 0.8, y);
    c.lineTo(x + r * 0.8, y);
    c.lineWidth = 2;
    c.strokeStyle = OUT;
    c.stroke();
    return;
  }
  circ(c, x, y, r, sclera, 1.8);
  circ(c, x + lx, y + ly, r * 0.5, '#171717', 0);
  circ(c, x + lx + r * 0.15, y + ly - r * 0.2, r * 0.16, '#fff', 0);
}

export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return `rgb(${r},${g},${bl})`;
}

export function outlineText(c: C, s: string, x: number, y: number, size: number, fill: string, align: CanvasTextAlign = 'center', lw = 5): void {
  c.font = `900 ${size}px "Trebuchet MS", system-ui, sans-serif`;
  c.textAlign = align;
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  c.lineWidth = lw;
  c.strokeStyle = '#2a1608';
  c.strokeText(s, x, y);
  c.fillStyle = fill;
  c.fillText(s, x, y);
}
