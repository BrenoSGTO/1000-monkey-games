import { S, facingTile, hotbarItem, type Player } from './state';
import { BUILDINGS, MH, MW, T } from './layout';
import { CROPS, NPCS, TOOL_IDS, playerLook } from './data';
import {
  benchSprite, boatSprite, bushSprite, buildingArt, cropSprite, fenceDraw, flowerbedSprite, lampSprite, palmSprite,
  rockSprite, shipboxSprite, signSprite, stumpSprite, tileset, treeSprite, troughSprite, twigSprite, weedSprite, wellSprite,
} from './art';
import { chickenFrame, drawMonkeyAt, goatFrame, mk, slimeFrame, toolIcon, R, itemIcon } from './sprites';
import { npcPose } from './npc';
import { MINE_H, MINE_W } from './mine';
import { hash2, lerp, TILE } from './util';
import type { Look } from './types';

interface DI {
  y: number;
  f: () => void;
}

const KEYFR: { m: number; c: [number, number, number]; a: number }[] = [
  { m: 360, c: [30, 40, 100], a: 0.4 },
  { m: 430, c: [255, 190, 140], a: 0.1 },
  { m: 490, c: [255, 255, 255], a: 0 },
  { m: 1020, c: [255, 255, 255], a: 0 },
  { m: 1110, c: [255, 150, 70], a: 0.2 },
  { m: 1230, c: [40, 40, 110], a: 0.5 },
  { m: 1380, c: [15, 20, 70], a: 0.62 },
  { m: 1560, c: [10, 15, 60], a: 0.66 },
];

export function ambient(min: number): { c: [number, number, number]; a: number } {
  if (min <= KEYFR[0].m) return { c: KEYFR[0].c, a: KEYFR[0].a };
  for (let i = 1; i < KEYFR.length; i++) {
    if (min <= KEYFR[i].m) {
      const p = KEYFR[i - 1];
      const n = KEYFR[i];
      const f = (min - p.m) / (n.m - p.m);
      return { c: [lerp(p.c[0], n.c[0], f), lerp(p.c[1], n.c[1], f), lerp(p.c[2], n.c[2], f)], a: lerp(p.a, n.a, f) };
    }
  }
  const l = KEYFR[KEYFR.length - 1];
  return { c: l.c, a: l.a };
}

let lightC: HTMLCanvasElement | null = null;
let lightG: CanvasRenderingContext2D | null = null;

export function viewScale(W: number, H: number): number {
  return Math.max(2, Math.floor(Math.min(W, H) / 190));
}

const ORE_COL: Record<string, string> = { pedra: '#b8bec8', carvao: '#2a2a30', cobre: '#e08a4a', ferro: '#dfe6ee', ouro: '#ffd84a', quartzo: '#f2d8ff', diamante: '#7ae6ff' };

export function render(g: CanvasRenderingContext2D, W: number, H: number): void {
  const t = S.time;
  const sc = viewScale(W, H);
  const inMine = S.me.map === 'mine' && S.mine && S.mode !== 'title';
  const world = S.world;
  const season = world.season;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.imageSmoothingEnabled = false;
  g.fillStyle = inMine ? '#120e12' : '#1d2c1b';
  g.fillRect(0, 0, W, H);

  const vw = W / sc;
  const vh = H / sc;
  const mapW = inMine ? MINE_W * 16 : MW * 16;
  const mapH = inMine ? MINE_H * 16 : MH * 16;
  let cx = S.cam.x;
  let cy = S.cam.y;
  cx = mapW <= vw ? mapW / 2 : Math.max(vw / 2, Math.min(mapW - vw / 2, cx));
  cy = mapH <= vh ? mapH / 2 : Math.max(vh / 2, Math.min(mapH - vh / 2, cy));
  const sx = (Math.random() - 0.5) * S.shake;
  const sy = (Math.random() - 0.5) * S.shake;
  const ox = Math.round(W / 2 - cx * sc + sx * sc);
  const oy = Math.round(H / 2 - cy * sc + sy * sc);
  g.setTransform(sc, 0, 0, sc, ox, oy);

  const x0 = Math.max(0, Math.floor((cx - vw / 2) / 16) - 1);
  const x1 = Math.min((inMine ? MINE_W : MW) - 1, Math.ceil((cx + vw / 2) / 16) + 1);
  const y0 = Math.max(0, Math.floor((cy - vh / 2) / 16) - 1);
  const y1 = Math.min((inMine ? MINE_H : MH) - 1, Math.ceil((cy + vh / 2) / 16) + 3);
  const ts = tileset(season);
  const wf = Math.floor(t * 2.5) % 4;
  const items: DI[] = [];

  if (inMine) {
    const m = S.mine!;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const k = y * MINE_W + x;
        if (m.wall[k]) g.drawImage(ts.rock[(x * 3 + y) % 4], x * 16, y * 16);
        else g.drawImage(ts.floor[(x + y * 2) % 3], x * 16, y * 16);
      }
    }
    // escadas
    const lad = (x: number, y: number, up: boolean) => {
      const px = x * 16;
      const py = y * 16;
      R(g, '#0c080c', px + 1, py + 1, 14, 14);
      R(g, up ? '#c99a62' : '#8a6030', px + 3, py + 1, 2, 14);
      R(g, up ? '#c99a62' : '#8a6030', px + 11, py + 1, 2, 14);
      for (let i = 0; i < 4; i++) R(g, up ? '#e0b878' : '#a9774a', px + 3, py + 3 + i * 3, 10, 1);
    };
    lad(m.ladderUp[0], m.ladderUp[1], true);
    if (m.ladderDown) lad(m.ladderDown[0], m.ladderDown[1], false);
    if (m.chest) {
      const [cxk, cyk] = m.chest;
      items.push({
        y: (cyk + 1) * 16,
        f: () => {
          const px = cxk * 16;
          const py = cyk * 16;
          R(g, '#2b1a12', px, py + 2, 16, 13);
          R(g, '#b8782e', px + 1, py + 3, 14, 11);
          R(g, '#d9a040', px + 1, py + 3, 14, 4);
          R(g, '#ffd84a', px + 7, py + 7, 2, 3);
          if (m.chestOpen) R(g, '#ffd84a', px + 3, py + 1, 10, 3);
        },
      });
    }
    for (const r of m.rocks.values()) {
      if (r.x < x0 - 1 || r.x > x1 + 1) continue;
      items.push({
        y: (r.y + 1) * 16,
        f: () => {
          g.drawImage(rockSprite('rock', 0), r.x * 16 - 1, r.y * 16 - 1);
          const col = ORE_COL[r.kind];
          if (r.kind !== 'pedra') {
            R(g, col, r.x * 16 + 4, r.y * 16 + 7, 2, 2);
            R(g, col, r.x * 16 + 9, r.y * 16 + 5, 2, 2);
            R(g, col, r.x * 16 + 7, r.y * 16 + 10, 2, 2);
          }
        },
      });
    }
    for (const s of m.slimes) {
      items.push({
        y: s.y,
        f: () => {
          const bounce = Math.sin(t * 6 + s.phase) > 0 ? 1 : 0;
          g.fillStyle = 'rgba(0,0,0,0.3)';
          g.fillRect(s.x - 6, s.y - 2, 12, 3);
          g.drawImage(slimeFrame(bounce, s.hurt > 0), Math.round(s.x - 8), Math.round(s.y - 13));
        },
      });
    }
  } else {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const k = y * MW + x;
        const tt = world.terrain[k];
        const px = x * 16;
        const py = y * 16;
        switch (tt) {
          case T.GRASS: {
            const dv = world.deco[k];
            g.drawImage(dv >= 10 ? ts.flower[dv - 10] : ts.grass[dv], px, py);
            const d = world.dyn.get(k);
            if (d?.t) g.drawImage(d.w ? ts.wet : ts.tilled, px, py);
            break;
          }
          case T.DIRT:
            g.drawImage(ts.dirt[(x + y) % 3], px, py);
            break;
          case T.SAND:
            g.drawImage(ts.sand[Math.floor(hash2(x, y, 4) * 3)], px, py);
            break;
          case T.WATER:
          case T.DEEP: {
            g.drawImage((tt === T.DEEP ? ts.deep : ts.water)[(wf + (x + y) % 2) % 4], px, py);
            // espuma nas margens
            const land = (xx: number, yy: number) => {
              if (xx < 0 || yy < 0 || xx >= MW || yy >= MH) return false;
              const q = world.terrain[yy * MW + xx];
              return q !== T.WATER && q !== T.DEEP && q !== T.BRIDGE && q !== T.PLANK;
            };
            const fa = 0.45 + Math.sin(t * 2 + x) * 0.2;
            g.fillStyle = `rgba(255,255,255,${fa})`;
            if (land(x, y - 1)) g.fillRect(px, py, 16, 2);
            if (land(x, y + 1)) g.fillRect(px, py + 14, 16, 2);
            if (land(x - 1, y)) g.fillRect(px, py, 2, 16);
            if (land(x + 1, y)) g.fillRect(px + 14, py, 2, 16);
            break;
          }
          case T.BRIDGE:
            g.drawImage(ts.water[wf], px, py);
            g.drawImage(ts.bridge[(x + y) % 2], px, py);
            break;
          case T.PLANK:
            g.drawImage(ts.plank[(x + y) % 2], px, py);
            break;
          case T.ROCK:
            g.drawImage(ts.rock[(x * 7 + y * 3) % 4], px, py);
            break;
          default:
            g.drawImage(ts.grass[0], px, py);
        }
      }
    }
    // objetos dinâmicos, plantas e estáticos
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const k = y * MW + x;
        const d = world.dyn.get(k);
        if (d) {
          if (d.o) {
            const o = d.o;
            items.push({
              y: (y + 1) * 16,
              f: () => {
                if (o === 'tree') g.drawImage(treeSprite(season, d.v ?? 0), x * 16 + 8 - 17 + (S.shake > 0 && d.hp ? (Math.random() - 0.5) * 0.6 : 0), (y + 1) * 16 - 49);
                else if (o === 'rock' || o === 'boulder') g.drawImage(rockSprite(o, d.v ?? 0), x * 16 - 1 - (o === 'boulder' ? 0 : 0), y * 16 - 1);
                else if (o === 'weed') g.drawImage(weedSprite(season, d.v ?? 0), x * 16 - 1, y * 16 - 1);
                else if (o === 'twig') g.drawImage(twigSprite(d.v ?? 0), x * 16 - 1, y * 16 - 1);
                else if (o === 'stump') g.drawImage(stumpSprite(season), x * 16 - 2, y * 16 - 3);
              },
            });
          }
          if (d.c) {
            const st = world.cropStage(d);
            const k2 = d.c.k;
            items.push({ y: (y + 1) * 16 - 1, f: () => g.drawImage(cropSprite(k2, st), x * 16, y * 16 - 2) });
          }
        }
        const st = world.statics.get(k);
        if (st) {
          items.push({
            y: (y + 1) * 16,
            f: () => {
              switch (st.kind) {
                case 'fence': {
                  const r = world.statics.get(k + 1)?.kind === 'fence';
                  const dn = world.statics.get(k + MW)?.kind === 'fence';
                  fenceDraw(g, x * 16, y * 16, r, dn, season);
                  break;
                }
                case 'lamp':
                  g.drawImage(lampSprite(), x * 16 + 1, (y + 1) * 16 - 33);
                  break;
                case 'bench':
                  g.drawImage(benchSprite(), x * 16 - 2, y * 16 - 1);
                  break;
                case 'well':
                  g.drawImage(wellSprite(), x * 16 - 2, (y + 1) * 16 - 29);
                  break;
                case 'sign':
                  g.drawImage(signSprite(), x * 16 - 1, y * 16 - 7);
                  break;
                case 'flowerbed':
                  g.drawImage(flowerbedSprite(st.v), x * 16 - 1, y * 16);
                  break;
                case 'palm':
                  g.drawImage(palmSprite(), x * 16 + 8 - 17, (y + 1) * 16 - 49);
                  break;
                case 'stree':
                  g.drawImage(treeSprite(season, st.v), x * 16 + 8 - 17, (y + 1) * 16 - 49);
                  break;
                case 'bush':
                  g.drawImage(bushSprite(season, st.v), x * 16 - 2, y * 16 - 1);
                  break;
                case 'shipbox':
                  g.drawImage(shipboxSprite(), x * 16 - 2, y * 16 - 3);
                  break;
                case 'trough':
                  g.drawImage(troughSprite(world.hay > 0), x * 16 - 2, y * 16);
                  break;
                case 'boat':
                  g.drawImage(boatSprite(), x * 16 - 6, y * 16 - 2);
                  break;
              }
            },
          });
        }
      }
    }
    for (const b of BUILDINGS) {
      if (b.x > x1 + 2 || b.x + b.w < x0 - 2 || b.y > y1 + 2 || b.y + b.h < y0 - 4) continue;
      const art = buildingArt(b);
      items.push({
        y: (b.y + b.h) * 16 - 2,
        f: () => {
          g.drawImage(art.canvas, b.x * 16 - 1, b.y * 16 - 1);
          if (b.kind === 'ferraria' && world.minutes < 1200) {
            const sy2 = b.y * 16 - 4 - ((t * 10) % 14);
            g.fillStyle = `rgba(220,220,230,${0.5 - ((t * 10) % 14) / 30})`;
            g.fillRect(b.x * 16 + b.w * 16 - 14 + Math.sin(t * 3) * 1.5, sy2, 5, 4);
          }
        },
      });
    }
    // NPCs
    for (const n of NPCS) {
      const pose = npcPose(n, world.minutes);
      if (pose.inside) continue;
      items.push({
        y: pose.y,
        f: () => {
          shadow(g, pose.x, pose.y);
          const fr = pose.moving ? Math.floor(t * 7) % 4 : 0;
          drawMonkeyAt(g, n.look, pose.dir, fr, pose.x, pose.y);
          const d = Math.hypot(S.me.x - pose.x, S.me.y - pose.y);
          if (d < 34 && S.mode === 'play') label(g, n.name, pose.x, pose.y - 31, '#fff6c8');
        },
      });
    }
    // animais
    for (const a of world.animals) {
      items.push({
        y: a.y,
        f: () => {
          shadow(g, a.x, a.y, 5);
          const fr = Math.floor(t * 3 + a.x) % 3;
          const spr = a.kind === 'galinha' ? chickenFrame(fr, a.ready) : goatFrame(fr % 2, a.ready);
          const w = spr.width;
          const h = spr.height;
          g.save();
          g.translate(Math.round(a.x), Math.round(a.y));
          if (a.dir === 1) g.scale(-1, 1);
          g.drawImage(spr, -w / 2, -h + 3);
          g.restore();
        },
      });
    }
  }

  // jogadores
  const mine = S.me.map === 'mine';
  for (const r of S.remotes.values()) {
    if (r.info.map !== S.me.map) continue;
    items.push({
      y: r.y,
      f: () => {
        person(g, r.look, r.x, r.y, r.info.d, r.info.mv, r.anim, r.swing, r.info.sw - 1, S.me, false, r.info.sleep);
        label(g, r.info.name, r.x, r.y - 31, '#bff0ff');
      },
    });
  }
  const me = S.me;
  if (S.mode !== 'title') {
    items.push({
      y: me.y + 0.5,
      f: () => {
        const wasHidden = me.sleeping;
        person(g, myLookCached(me), me.x, me.y, me.dir, me.moving, me.animT, me.swing / me.swingMax, me.swingSlot, me, me.flash > 0, wasHidden);
        if (S.fish && S.fish.phase === 'bite') {
          g.fillStyle = '#ff4a4a';
          g.fillRect(Math.round(me.x) - 1, Math.round(me.y) - 40, 3, 7);
          g.fillRect(Math.round(me.x) - 1, Math.round(me.y) - 31, 3, 3);
        }
      },
    });
  }
  void mine;

  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.f();

  // cursor de tile
  if (S.mode === 'play') {
    const [fx, fy] = facingTile(me);
    const sel = hotbarItem(me, me.sel);
    if (sel.tool || sel.stack) {
      g.strokeStyle = `rgba(255,255,255,${0.55 + Math.sin(t * 6) * 0.2})`;
      g.lineWidth = 1;
      g.strokeRect(fx * 16 + 0.5, fy * 16 + 0.5, 15, 15);
    }
  }
  // pescaria
  if (S.fish && S.fish.phase !== 'done') {
    const f = S.fish;
    const bx = f.fx * 16 + 8;
    const by = f.fy * 16 + 8 + Math.sin(t * 4) * (f.phase === 'bite' ? 2 : 0.6);
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(me.x + (me.dir === 2 ? 8 : me.dir === 1 ? -8 : 0), me.y - 20);
    g.quadraticCurveTo((me.x + bx) / 2, Math.min(me.y, by) - 14, bx, by);
    g.stroke();
    R(g, '#ff4a4a', Math.round(bx) - 1, Math.round(by) - 2, 3, 2);
    R(g, '#fff', Math.round(bx) - 1, Math.round(by), 3, 1);
    if (f.phase === 'bite') {
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.beginPath();
      g.arc(bx, by, 4 + ((t * 14) % 6), 0, Math.PI * 2);
      g.stroke();
    }
  }

  // partículas
  for (const p of S.particles) {
    g.globalAlpha = Math.max(0, Math.min(1, p.life / 0.4));
    g.fillStyle = p.col;
    g.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
  }
  g.globalAlpha = 1;
  g.textAlign = 'center';
  g.font = 'bold 7px "Trebuchet MS", sans-serif';
  for (const f of S.floaters) {
    g.globalAlpha = Math.min(1, f.life);
    g.lineWidth = 2;
    g.strokeStyle = '#2b1a12';
    g.strokeText(f.text, f.x, f.y);
    g.fillStyle = f.col;
    g.fillText(f.text, f.x, f.y);
  }
  g.globalAlpha = 1;

  // iluminação / noite
  g.setTransform(1, 0, 0, 1, 0, 0);
  const amb = inMine ? { c: [8, 8, 24] as [number, number, number], a: 0.55 } : ambient(world.minutes);
  let a = amb.a;
  if (!inMine && (world.weather === 'chuva' || world.weather === 'tempestade')) a = Math.min(0.75, a + 0.16);
  if (a > 0.01 && S.mode !== 'title') {
    if (!lightC || lightC.width !== W || lightC.height !== H) {
      [lightC, lightG] = mk(W, H);
    }
    const lg = lightG!;
    lg.globalCompositeOperation = 'source-over';
    lg.clearRect(0, 0, W, H);
    lg.fillStyle = `rgba(${amb.c[0] | 0},${amb.c[1] | 0},${amb.c[2] | 0},${a})`;
    lg.fillRect(0, 0, W, H);
    lg.globalCompositeOperation = 'destination-out';
    const light = (wx: number, wy: number, rad: number, str: number) => {
      const px = wx * sc + ox;
      const py = wy * sc + oy;
      const r = rad * sc;
      if (px < -r || py < -r || px > W + r || py > H + r) return;
      const gr = lg.createRadialGradient(px, py, 0, px, py, r);
      gr.addColorStop(0, `rgba(0,0,0,${str})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      lg.fillStyle = gr;
      lg.fillRect(px - r, py - r, r * 2, r * 2);
    };
    if (a > 0.14) {
      light(me.x, me.y - 8, inMine ? 82 : 46, 0.85);
      for (const r of S.remotes.values()) if (r.info.map === me.map) light(r.x, r.y - 8, 38, 0.7);
      if (!inMine) {
        for (const b of BUILDINGS) {
          const art = buildingArt(b);
          for (const [wx, wy] of art.windows) light(b.x * 16 + wx, b.y * 16 + wy, 26, 0.8);
        }
        for (const [k, st] of world.statics) if (st.kind === 'lamp') light((k % MW) * 16 + 8, Math.floor(k / MW) * 16 - 14, 52, 0.95);
      }
    }
    g.drawImage(lightC!, 0, 0);
    if (!inMine && a > 0.3) {
      g.globalCompositeOperation = 'lighter';
      g.globalCompositeOperation = 'source-over';
    }
  }

  // clima
  if (!inMine) {
    const w = world.weather;
    if (w === 'chuva' || w === 'tempestade') {
      const n = w === 'tempestade' ? 240 : 140;
      g.strokeStyle = 'rgba(190,215,255,0.55)';
      g.lineWidth = Math.max(1, sc * 0.5);
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const rx = (i * 0.61803) % 1;
        const ry = (i * 0.38197 + t * (1.1 + (i % 5) * 0.12)) % 1;
        const x = ((rx + ry * 0.12) % 1) * W;
        const y = ry * H;
        g.moveTo(x, y);
        g.lineTo(x - 2 * sc, y + 7 * sc);
      }
      g.stroke();
      if (S.flash > 0) {
        g.fillStyle = `rgba(255,255,255,${S.flash * 0.7})`;
        g.fillRect(0, 0, W, H);
      }
    } else if (w === 'neve') {
      g.fillStyle = 'rgba(255,255,255,0.9)';
      for (let i = 0; i < 110; i++) {
        const rx = (i * 0.61803) % 1;
        const ry = (i * 0.38197 + t * (0.08 + (i % 4) * 0.02)) % 1;
        const x = ((rx + Math.sin(t + i) * 0.01) % 1) * W;
        g.fillRect(x, ry * H, sc, sc);
      }
    }
  }
}

function shadow(g: CanvasRenderingContext2D, x: number, y: number, r = 6): void {
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath();
  g.ellipse(Math.round(x), Math.round(y) - 1, r, r * 0.45, 0, 0, Math.PI * 2);
  g.fill();
}

function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, col: string): void {
  g.textAlign = 'center';
  g.font = 'bold 6px "Trebuchet MS", sans-serif';
  g.lineWidth = 2;
  g.strokeStyle = '#2b1a12';
  g.strokeText(text, Math.round(x), Math.round(y));
  g.fillStyle = col;
  g.fillText(text, Math.round(x), Math.round(y));
}

const lookCache = new Map<string, Look>();
function myLookCached(p: Player): Look {
  const k = `${p.fi}-${p.si}`;
  let l = lookCache.get(k);
  if (!l) {
    l = playerLook(p.fi, p.si);
    lookCache.set(k, l);
  }
  return l;
}

function person(g: CanvasRenderingContext2D, look: Look, x: number, y: number, dir: number, moving: boolean, animT: number, swingFrac: number, slot: number, owner: Player, flash: boolean, sleeping: boolean): void {
  shadow(g, x, y);
  if (sleeping) return;
  const fr = moving ? Math.floor(animT * 9) % 4 : 0;
  if (flash && Math.floor(S.time * 20) % 2 === 0) g.globalAlpha = 0.4;
  const act = swingFrac > 0 && swingFrac < 1 ? Math.sin(swingFrac * Math.PI) : 0;
  const lunge = dir === 0 ? [0, 1] : dir === 3 ? [0, -1] : dir === 1 ? [-1, 0] : [1, 0];
  drawMonkeyAt(g, look, dir, fr, x + lunge[0] * act * 1.5, y + lunge[1] * act, 0);
  g.globalAlpha = 1;
  if (act > 0 && slot >= 0 && slot < 6) {
    const tool = TOOL_IDS[slot];
    const spr = toolIcon(tool, owner.tiers[tool] ?? 0);
    const ang = (-1.2 + (1 - swingFrac) * 2.2) * (dir === 1 ? -1 : 1);
    g.save();
    g.translate(Math.round(x + lunge[0] * 9), Math.round(y - 12 + lunge[1] * 7));
    g.rotate(dir === 1 ? -ang : ang);
    g.drawImage(spr, -9, -14);
    g.restore();
  }
}

export function renderIconTo(canvas: HTMLCanvasElement, id: string): void {
  const g = canvas.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.drawImage(itemIcon(id), 0, 0, canvas.width, canvas.height);
}

export { CROPS };
