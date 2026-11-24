import { B, St, ItemKind, type Fighter } from './types';
import { CHARS } from './fighters';
import type { World } from './sim';

export interface Brain {
  level: number;
  t: number;
  cool: number;
  holdT: number;
  hold: number;
  shieldT: number;
  wander: number;
  jitter: number;
}

export function createBrain(level: number): Brain {
  return { level, t: 0, cool: 0, holdT: 0, hold: 0, shieldT: 0, wander: 0, jitter: Math.random() * 100 };
}

const PARAMS = {
  act: [0.06, 0.14, 0.32],
  smash: [0.12, 0.3, 0.55],
  shield: [0.015, 0.08, 0.22],
  react: [16, 8, 3],
  aim: [0.55, 0.85, 1],
};

function dirBit(d: number): number {
  return d > 0 ? B.R : d < 0 ? B.L : 0;
}

/** Gera os bits de input do bot para este tick (host apenas). */
export function botInput(w: World, f: Fighter, br: Brain): number {
  br.t++;
  if (br.cool > 0) br.cool--;
  if (f.dead !== 0 || w.count > 0 || w.over) return 0;
  const L = br.level;
  const st = w.stage;
  const ch = CHARS[f.char];
  const cx = (st.mainL + st.mainR) / 2;
  let bits = 0;
  const pulse = (b: number): void => {
    if (br.cool <= 0) {
      bits |= b;
      br.cool = 3;
    }
  };

  // --- estados especiais ---
  if (f.state === St.PLAT) {
    if (f.st > 50 + br.jitter) pulse(B.JUMP);
    return bits | dirBit(cx - f.x > 30 ? 1 : cx - f.x < -30 ? -1 : 0);
  }
  if (f.state === St.HELD) {
    pulse(br.t % 2 === 0 ? B.L : B.R);
    return bits | B.LIGHT * (br.t % 3 === 0 ? 1 : 0);
  }
  if (f.state === St.HOLD) {
    const out = f.x >= cx ? 1 : -1;
    if (f.hold > 14 + (2 - L) * 10) {
      bits |= dirBit(out);
      pulse(dirBit(out));
      return bits;
    }
    pulse(B.LIGHT);
    return bits;
  }
  if (f.state === St.LEDGE) {
    if (f.st > 18 + (2 - L) * 14) pulse(B.U);
    return bits;
  }
  if (f.state === St.HITSTUN) {
    bits |= dirBit(cx - f.x);
    if (L >= 1 && f.vy > 1 && f.tech === 0 && Math.random() < 0.08) pulse(B.SHIELD);
    return bits;
  }

  // --- recuperação ---
  const offX = f.x < st.mainL - 8 || f.x > st.mainR + 8;
  const below = f.y > 30 && !f.ground;
  if ((offX || below) && !f.ground && f.state !== St.ATTACK) {
    const toward = cx - f.x;
    bits |= dirBit(toward);
    const ledgeY = 0;
    if (f.state === St.AIR || f.state === St.DODGE) {
      const rec = Math.random() < [0.7, 0.93, 1][L];
      if (f.jumps > 0 && f.vy > -2 && f.y > ledgeY - 120 && rec) pulse(B.JUMP);
      else if (!f.help && f.jumps === 0 && f.y > ledgeY + 20 && rec) {
        // up special em direção ao palco
        bits |= B.U | B.SPECIAL;
        br.cool = 0;
        if (br.t % 2 === 0) bits &= ~B.SPECIAL;
      }
    }
    return bits;
  }

  // --- escolhe alvo ---
  let target: Fighter | null = null;
  let bestD = 1e9;
  for (const e of w.fighters) {
    if (e === f || e.dead !== 0 || e.state === St.PLAT) continue;
    const d = Math.abs(e.x - f.x) + Math.abs(e.y - f.y) * 1.2 - Math.min(80, e.pct) * 0.8;
    if (d < bestD) {
      bestD = d;
      target = e;
    }
  }
  const myMid = f.y - ch.bh * 0.5;

  // --- itens ---
  let itemTarget: { x: number; y: number } | null = null;
  if (f.itemKind < 0) {
    for (const it of w.items) {
      if (it.held >= 0) continue;
      const d = Math.abs(it.x - f.x) + Math.abs(it.y - f.y);
      if (d < 520 && (!target || Math.abs(target.x - f.x) > 140)) {
        itemTarget = { x: it.x, y: it.y };
        break;
      }
    }
  }

  if (!target) return bits | dirBit(cx - f.x);
  const tch = CHARS[target.char];
  const dx = target.x - f.x;
  const adx = Math.abs(dx);
  const dy = target.y - tch.bh * 0.5 - myMid;
  const ady = Math.abs(dy);
  const dir = dx >= 0 ? 1 : -1;
  const act = PARAMS.act[L];

  // defesa
  if (br.shieldT > 0) {
    br.shieldT--;
    bits |= B.SHIELD;
    if (br.shieldT === 0 && adx < 70 && ady < 60) pulse(B.GRAB);
    return bits;
  }
  if (f.ground && target.state === St.ATTACK && adx < 130 && ady < 80 && Math.random() < PARAMS.shield[L]) {
    br.shieldT = 16 + Math.floor(Math.random() * 14);
    return bits | B.SHIELD;
  }

  // segurando item
  if (f.itemKind === ItemKind.BOMB) {
    if (adx > 150 && adx < 620 && ady < 220) {
      bits |= dirBit(dir);
      if (f.face === dir || f.state === St.AIR) {
        if (Math.random() < 0.25) pulse(B.LIGHT);
      }
      return bits | (adx > 520 ? dirBit(dir) : 0);
    }
  }
  if (f.itemKind === ItemKind.HAMMER) {
    bits |= dirBit(dir);
    if (adx < 105 && ady < 70) {
      if (f.face !== dir && f.ground) return bits;
      if (Math.random() < 0.35 + L * 0.2) pulse(B.LIGHT);
    }
    if (f.ground && dy < -70 && adx < 100) pulse(B.JUMP);
    return bits;
  }

  // item no chão
  if (itemTarget) {
    const idx = itemTarget.x - f.x;
    bits |= dirBit(Math.abs(idx) > 12 ? idx : 0);
    if (f.ground && itemTarget.y < f.y - 70 && Math.abs(idx) < 120) pulse(B.JUMP);
    if (!f.ground && f.jumps > 0 && itemTarget.y < f.y - 60 && f.vy > 0) pulse(B.JUMP);
    if (f.ground && itemTarget.y > f.y + 60) pulse(B.D);
    return bits;
  }

  // --- combate ---
  const inReach = adx < 78 * ch.scale + 16 && ady < 74;
  const nearEdge = f.ground && f.plat === 0 && (f.x + dir * 40 > st.mainR || f.x + dir * 40 < st.mainL);
  const targetOff = target.y > 40 || target.x < st.mainL - 30 || target.x > st.mainR + 30;

  if (inReach) {
    // encara o alvo
    if (f.ground && f.face !== dir) bits |= dirBit(dir);
    if (Math.random() < act * 2) {
      const finisher = target.pct > 85 && Math.random() < PARAMS.smash[L];
      if (f.ground && adx < 62 && Math.random() < 0.22 && target.state !== St.SHIELD) {
        pulse(B.GRAB);
      } else if (f.ground && target.state === St.SHIELD && Math.random() < 0.5) {
        pulse(B.GRAB);
      } else if (finisher && f.ground) {
        pulse(B.HEAVY);
        bits |= dirBit(dir);
        if (dy < -60) bits |= B.U;
      } else if (f.ground) {
        pulse(B.LIGHT);
        if (Math.random() < 0.5) bits |= dirBit(dir);
        if (dy < -50) bits |= B.U;
      } else {
        pulse(B.LIGHT);
        bits |= dirBit(dir);
        if (dy < -55) bits |= B.U;
        else if (dy > 45) bits |= B.D;
      }
    }
    // recuo ocasional
    if (Math.random() < 0.02 && L < 2) bits |= dirBit(-dir);
    return bits;
  }

  // ataque especial à distância
  if (adx > 170 && adx < 560 && ady < 90 && f.ground && Math.random() < act * 0.25) {
    if (f.face === dir) {
      pulse(B.SPECIAL);
      return bits;
    }
  }
  // pontapé de especial lateral como aproximação
  if (adx > 120 && adx < 250 && ady < 60 && f.ground && Math.random() < act * 0.1 * (L + 1)) {
    bits |= dirBit(dir);
    pulse(B.SPECIAL);
    return bits;
  }

  // aproximação
  let move = dir;
  if (nearEdge && !targetOff && dy > -40) move = 0;
  if (targetOff && f.ground && f.plat === 0) {
    // guarda a borda
    const edgeX = target.x < cx ? st.mainL + 30 : st.mainR - 30;
    move = Math.abs(edgeX - f.x) > 20 ? (edgeX > f.x ? 1 : -1) : 0;
  }
  bits |= dirBit(move);
  if (f.ground) {
    if (dy < -80 && adx < 260 && Math.random() < 0.1 + L * 0.05) pulse(B.JUMP);
    else if (dy > 90 && f.plat > 0 && adx < 150) pulse(B.D);
    else if (adx > 220 && Math.random() < 0.01) pulse(B.JUMP);
  } else {
    if (f.jumps > 0 && dy < -80 && f.vy > 0 && Math.random() < 0.15) pulse(B.JUMP);
    if (Math.random() < 0.04 && f.vy > 0 && dy > 30) bits |= B.D;
  }
  return bits;
}
