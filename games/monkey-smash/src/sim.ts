import {
  B, St, Ctrl, EV, ItemKind, FPS, clamp, rngNext, sgn,
  type Ev, type Fighter, type Item, type MatchConfig, type PlatPos, type Proj, type Rules,
} from './types';
import { CHARS, MKI, PROJS, type CharDef, type HitBox, type Move } from './fighters';
import { STAGES, platsAt, geysersAt, cannonsAt, CANNON_R, type StageDef } from './stages';

// ---------------------------------------------------------------------------
// Mundo
// ---------------------------------------------------------------------------

export interface World {
  tick: number;
  stage: StageDef;
  seed: number;
  rules: Rules;
  fighters: Fighter[];
  items: Item[];
  projs: Proj[];
  nextId: number;
  events: Ev[];
  rng: { s: number };
  count: number; // contagem regressiva inicial (frames)
  timeLeft: number; // frames (modo tempo)
  over: number;
  winner: number; // -1 ninguém, -2 empate
  overT: number;
  itemT: number;
  pp: PlatPos[];
}

/** Contexto mínimo para simular UM lutador (usado também na predição do cliente). */
export interface Ctx {
  tick: number;
  stage: StageDef;
  pp: PlatPos[];
  w: World | null;
}

export function newFighter(slot: number, char: number, ctrl: number, name: string, level: number, rules: Rules): Fighter {
  const ch = CHARS[char];
  return {
    slot, char, ctrl, name, level,
    x: 0, y: 0, vx: 0, vy: 0, face: 1, ground: 1, plat: 0,
    state: St.IDLE, st: 0, pct: 0, stocks: rules.mode === 0 ? rules.stocks : 99, kos: 0, falls: 0, dealt: 0,
    hitstop: 0, stun: 0, inv: 0, jumps: ch.jumps, move: -1, hitMask: 0, shield: 100,
    heldBy: -1, holding: -1, hold: 0, itemKind: -1, itemUse: 0, drop: 0, fast: 0, air: 0, help: 0,
    resp: 0, dead: 0, prev: 0, buf: 0, bufT: 0, lastHit: -1, lastHitT: 0, lag: 0, ledge: -1, ledgeCd: 0,
    ledgeT: 0, dodgeDir: 0, tech: 0, hazCd: 0, sdir: 0, chg: 0,
  };
}

export function createWorld(cfg: MatchConfig): World {
  const stage = STAGES[cfg.stage] ?? STAGES[0];
  const fighters: Fighter[] = cfg.slots.map((s, i) => {
    const f = newFighter(i, s.char, s.ctrl, s.name, s.level, cfg.rules);
    const sp = stage.spawns[i % stage.spawns.length];
    f.x = sp.x;
    f.y = sp.y;
    f.face = sp.x > 0 ? -1 : 1;
    return f;
  });
  const w: World = {
    tick: 0, stage, seed: cfg.seed | 0, rules: cfg.rules, fighters, items: [], projs: [], nextId: 1, events: [],
    rng: { s: cfg.seed | 0 }, count: 190, timeLeft: cfg.rules.minutes * 60 * FPS, over: 0, winner: -1, overT: 0,
    itemT: 420, pp: [],
  };
  platsAt(stage, 0, w.pp);
  return w;
}

const emit = (w: World | null, type: number, ...a: number[]) => {
  if (w) w.events.push([type, w.tick, ...a]);
};

const axOf = (inp: number): number => ((inp & B.R) ? 1 : 0) - ((inp & B.L) ? 1 : 0);
const ACTION_BITS = B.JUMP | B.LIGHT | B.HEAVY | B.SPECIAL | B.SHIELD | B.GRAB;

function consume(f: Fighter, bit: number): boolean {
  if (f.buf & bit) {
    f.buf &= ~bit;
    return true;
  }
  return false;
}

export function hurtRect(f: Fighter): { x0: number; x1: number; y0: number; y1: number } {
  const ch = CHARS[f.char];
  return { x0: f.x - ch.hw - 4, x1: f.x + ch.hw + 4, y0: f.y - ch.bh, y1: f.y };
}

export function moveOf(f: Fighter): Move | null {
  if (f.move < 0) return null;
  return CHARS[f.char].moves[f.move] ?? null;
}

// ---------------------------------------------------------------------------
// Colisão
// ---------------------------------------------------------------------------

/** Retorna bits: 1 pousou, 2 parede, 4 teto. Ajusta f.x/f.y/f.ground/f.plat. */
function collide(ctx: Ctx, f: Fighter, ch: CharDef): number {
  let flags = 0;
  const hw = ch.hw;
  const bh = ch.bh;
  const pp = ctx.pp;
  const px = f.x;
  f.x += f.vx;
  for (let i = 0; i < pp.length; i++) {
    const p = pp[i];
    if (!p.solid) continue;
    const l = p.x - p.w / 2;
    const r = p.x + p.w / 2;
    const top = p.y;
    const bot = p.y + p.h;
    if (f.y > top + 1 && f.y - bh < bot && f.x + hw > l && f.x - hw < r) {
      if (px + hw <= l + 1) {
        f.x = l - hw;
        flags |= 2;
      } else if (px - hw >= r - 1) {
        f.x = r + hw;
        flags |= 2;
      }
    }
  }
  const py = f.y;
  f.y += f.vy;
  let landed = -1;
  for (let i = 0; i < pp.length; i++) {
    const p = pp[i];
    const l = p.x - p.w / 2;
    const r = p.x + p.w / 2;
    const top = p.y;
    const relV = f.vy - p.vy;
    if (p.solid) {
      if (f.x + hw > l && f.x - hw < r) {
        if (relV >= 0 && py <= top - p.vy + 1 && f.y >= top) {
          f.y = top;
          landed = i;
        } else if (f.vy < 0 && py - bh >= top + p.h - 1 && f.y - bh < top + p.h) {
          f.y = top + p.h + bh;
          flags |= 4;
        }
      }
    } else if (relV >= 0 && f.drop <= 0 && f.x + hw * 0.5 > l && f.x - hw * 0.5 < r) {
      if (py <= top - p.vy + 2 && f.y >= top) {
        f.y = top;
        landed = i;
      }
    }
  }
  if (landed >= 0) {
    flags |= 1;
    f.ground = 1;
    f.plat = landed;
  }
  return flags;
}

function stillGrounded(ctx: Ctx, f: Fighter): boolean {
  const p = ctx.pp[f.plat];
  if (!p) return false;
  return f.x > p.x - p.w / 2 && f.x < p.x + p.w / 2;
}

function overlapsSolid(ctx: Ctx, x: number, y: number, ch: CharDef): boolean {
  for (const p of ctx.pp) {
    if (!p.solid) continue;
    if (y > p.y + 2 && y - ch.bh < p.y + p.h && x + ch.hw > p.x - p.w / 2 && x - ch.hw < p.x + p.w / 2) return true;
  }
  return false;
}

/** Retorna info de pad (trampolim) sob o lutador, se houver. */
function padAt(ctx: Ctx, f: Fighter): number {
  if (f.plat !== 0) return 0;
  for (const pd of ctx.stage.pads) {
    if (Math.abs(f.x - pd.x) < pd.w / 2) return pd.power;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Movimentos auxiliares
// ---------------------------------------------------------------------------

function startMove(f: Fighter, key: string): void {
  f.move = MKI[key];
  f.state = St.ATTACK;
  f.st = 0;
  f.hitMask = 0;
  f.chg = 0;
}

function pickGroundLight(f: Fighter, inp: number): string {
  const ax = axOf(inp);
  if (inp & B.D) return 'dtilt';
  if (inp & B.U) return 'utilt';
  if (ax !== 0) {
    f.face = ax;
    return 'ftilt';
  }
  return 'jab';
}

function pickGroundHeavy(f: Fighter, inp: number): string {
  const ax = axOf(inp);
  if (inp & B.D) return 'dsmash';
  if (inp & B.U) return 'usmash';
  if (ax !== 0) f.face = ax;
  return 'fsmash';
}

function pickSpecial(f: Fighter, inp: number, ground: boolean): string {
  const ax = axOf(inp);
  if (inp & B.U) return 'uspec';
  if (inp & B.D) return 'dspec';
  if (ax !== 0) {
    if (ground) f.face = ax;
    return 'sspec';
  }
  return 'nspec';
}

function pickAerial(f: Fighter, inp: number): string {
  const ax = axOf(inp);
  if (inp & B.U) return 'uair';
  if (inp & B.D) return 'dair';
  if (ax !== 0) return ax === f.face ? 'fair' : 'bair';
  return 'nair';
}

function useItemMove(f: Fighter): string | null {
  if (f.itemKind === ItemKind.HAMMER && f.itemUse > 0) return 'hammer';
  if (f.itemKind === ItemKind.BOMB) return 'bomb';
  return null;
}

/** Tenta iniciar um ataque a partir do buffer. Retorna true se iniciou. */
function tryActions(f: Fighter, inp: number, ground: boolean): boolean {
  const lt = f.buf & B.LIGHT;
  const hv = f.buf & B.HEAVY;
  if (lt || hv) {
    const it = useItemMove(f);
    if (it) {
      consume(f, B.LIGHT);
      consume(f, B.HEAVY);
      if (it === 'hammer') f.itemUse--;
      startMove(f, it);
      return true;
    }
    if (ground) {
      if (hv) {
        consume(f, B.HEAVY);
        startMove(f, pickGroundHeavy(f, inp));
      } else {
        consume(f, B.LIGHT);
        startMove(f, pickGroundLight(f, inp));
      }
    } else {
      consume(f, B.LIGHT);
      consume(f, B.HEAVY);
      startMove(f, pickAerial(f, inp));
    }
    return true;
  }
  if (consume(f, B.SPECIAL)) {
    startMove(f, pickSpecial(f, inp, ground));
    return true;
  }
  return false;
}

function endAttackState(f: Fighter, mv: Move | null): void {
  f.move = -1;
  f.hitMask = 0;
  f.st = 0;
  if (mv && mv.key === 'hammer' && f.itemUse <= 0) f.itemKind = -1;
  if (f.ground) {
    f.state = St.IDLE;
  } else {
    f.state = St.AIR;
    if (mv && mv.helpless) f.help = 1;
  }
}

// ---------------------------------------------------------------------------
// Passo do lutador (sem efeitos colaterais no mundo quando ctx.w é nulo)
// ---------------------------------------------------------------------------

export function stepFighter(ctx: Ctx, f: Fighter, inp: number): void {
  const ch = CHARS[f.char];
  const pressed = inp & ~f.prev;
  f.prev = inp;
  if (f.bufT > 0) {
    f.bufT--;
    if (f.bufT === 0) f.buf = 0;
  }
  const act = pressed & ACTION_BITS;
  if (act) {
    f.buf |= act;
    f.bufT = 7;
  }
  if (f.tech > 0) f.tech--;
  if (pressed & B.SHIELD) f.tech = 10;

  if (f.hitstop > 0) {
    f.hitstop--;
    return;
  }
  if (f.dead === 2) return;
  if (f.dead === 1) {
    if (ctx.w) {
      f.resp--;
      if (f.resp <= 0) respawn(ctx, f);
    }
    return;
  }

  f.st++;
  if (f.inv > 0) f.inv--;
  if (f.ledgeCd > 0) f.ledgeCd--;
  if (f.hazCd > 0) f.hazCd--;
  if (f.lastHitT > 0) f.lastHitT--;
  if (f.state !== St.SHIELD && f.shield < 100) f.shield = Math.min(100, f.shield + 0.14);
  if (f.drop > 0) f.drop--;

  // carrega junto da plataforma móvel
  if (f.ground && f.plat >= 0 && ctx.pp[f.plat]) {
    const p = ctx.pp[f.plat];
    if (p.vx !== 0 || p.vy !== 0) {
      f.x += p.vx;
      f.y = p.y;
    }
  }

  const ax = axOf(inp);

  switch (f.state) {
    case St.IDLE:
    case St.RUN:
      stepGround(ctx, f, ch, inp, ax, pressed);
      break;
    case St.JSQ:
      stepJumpSquat(ctx, f, ch, inp, ax);
      break;
    case St.AIR:
      stepAir(ctx, f, ch, inp, ax, pressed);
      break;
    case St.LAND:
      stepLand(ctx, f, ch, inp);
      break;
    case St.ATTACK:
      stepAttack(ctx, f, ch, inp, ax);
      break;
    case St.HITSTUN:
      stepHitstun(ctx, f, ch, inp, ax);
      break;
    case St.SHIELD:
      stepShield(ctx, f, ch, inp, ax, pressed);
      break;
    case St.DODGE:
      stepDodge(ctx, f, ch);
      break;
    case St.HOLD:
      stepHold(ctx, f, ch, inp, ax, pressed);
      break;
    case St.HELD:
      if (ctx.w) {
        if (pressed & (ACTION_BITS | B.L | B.R | B.U | B.D)) f.hold -= 7;
        f.hold--;
        if (f.hold <= 0) releaseHeld(ctx.w, f, true);
      }
      break;
    case St.LEDGE:
      stepLedge(ctx, f, ch, inp, ax, pressed);
      break;
    case St.PLAT:
      stepPlat(ctx, f, ch, inp, ax, pressed);
      break;
  }
}

function applyFriction(f: Fighter, k: number): void {
  f.vx *= k;
  if (Math.abs(f.vx) < 0.12) f.vx = 0;
}

function leaveGround(f: Fighter): void {
  f.ground = 0;
  f.plat = -1;
}

function stepGround(ctx: Ctx, f: Fighter, ch: CharDef, inp: number, ax: number, pressed: number): void {
  if (!f.ground) {
    f.state = St.AIR;
    return;
  }
  // restaura recursos
  f.jumps = ch.jumps;
  f.air = 0;
  f.help = 0;
  f.fast = 0;

  if (consume(f, B.JUMP)) {
    f.state = St.JSQ;
    f.st = 0;
    return;
  }
  if (tryActions(f, inp, true)) return;
  if (f.buf & B.GRAB) {
    consume(f, B.GRAB);
    startMove(f, 'grab');
    return;
  }
  if (inp & B.SHIELD) {
    f.state = St.SHIELD;
    f.st = 0;
    return;
  }
  // atravessar plataforma
  if ((pressed & B.D) && f.plat >= 0 && ctx.pp[f.plat] && !ctx.pp[f.plat].solid) {
    f.drop = 14;
    leaveGround(f);
    f.state = St.AIR;
    f.y += 2;
    f.vy = 1.5;
    return;
  }
  if (ax !== 0) {
    if (f.state === St.IDLE && Math.sign(f.vx) !== ax) f.vx = ax * Math.min(2.6, ch.run);
    f.face = ax;
    f.vx += ax * ch.accel;
    f.vx = clamp(f.vx, -ch.run, ch.run);
    f.state = St.RUN;
  } else {
    applyFriction(f, 0.74);
    f.state = Math.abs(f.vx) < 0.6 ? St.IDLE : St.RUN;
  }
  f.vy = 0;
  const flags = collide(ctx, f, ch);
  if (flags & 2) f.vx = 0;
  if (!(flags & 1) && !stillGrounded(ctx, f)) {
    leaveGround(f);
    f.state = St.AIR;
  }
}

function stepJumpSquat(ctx: Ctx, f: Fighter, ch: CharDef, inp: number, ax: number): void {
  applyFriction(f, 0.8);
  // cancela o pulo em ataque para cima (W + ataque)
  if ((f.buf & (B.LIGHT | B.HEAVY | B.SPECIAL)) && (inp & B.U || ax !== 0)) {
    if (tryActions(f, inp, true)) return;
  }
  f.vy = 0;
  collide(ctx, f, ch);
  if (f.st >= 4) {
    const full = (inp & (B.JUMP | B.U)) !== 0;
    f.vy = -ch.jumpV * (full ? 1 : 0.66);
    f.vx += ax * 0.8;
    leaveGround(f);
    f.state = St.AIR;
    f.st = 0;
    f.fast = 0;
  }
}

function stepAir(ctx: Ctx, f: Fighter, ch: CharDef, inp: number, ax: number, pressed: number): void {
  // controle aéreo
  if (ax !== 0) {
    if (Math.abs(f.vx) <= ch.airSpeed || Math.sign(f.vx) !== ax) {
      f.vx += ax * ch.airAccel * 2.2;
      if (Math.abs(f.vx) > ch.airSpeed && Math.sign(f.vx) === ax) f.vx = ax * ch.airSpeed;
    } else {
      f.vx *= 0.99;
    }
  } else {
    f.vx *= 0.985;
  }
  if (!f.help) {
    if (consume(f, B.JUMP) && f.jumps > 0) {
      f.jumps--;
      f.vy = -ch.djumpV;
      f.vx = f.vx * 0.4 + ax * ch.airSpeed * 0.7;
      f.fast = 0;
      f.st = 0;
    }
    if (tryActions(f, inp, false)) return;
    if (consume(f, B.SHIELD) && !f.air) {
      f.air = 1;
      f.state = St.DODGE;
      f.st = 0;
      f.sdir = ax;
      f.inv = 22;
      f.dodgeDir = (inp & B.U) ? -1 : (inp & B.D) ? 1 : 0;
      return;
    }
  } else {
    // desamparado: só deriva um pouquinho
    f.vx = clamp(f.vx + ax * 0.12, -ch.airSpeed, ch.airSpeed);
  }
  if ((pressed & B.D) && f.vy > -2 && !f.help) f.fast = 1;
  if (f.fast) {
    f.vy = Math.max(f.vy, ch.fastFall);
  } else {
    f.vy = Math.min(f.vy + ch.grav, f.help ? ch.fall * 0.9 : ch.fall);
  }
  const vyPre = f.vy;
  const flags = collide(ctx, f, ch);
  if (flags & 2) f.vx = 0;
  if (flags & 4) f.vy = Math.max(f.vy, 0.5);
  if (flags & 1) {
    const pad = padAt(ctx, f);
    if (pad > 0 && vyPre > 3) {
      f.vy = -(pad * ((inp & B.JUMP) || (inp & B.U) ? 1.2 : 1));
      leaveGround(f);
      emit(ctx.w, EV.PAD, f.x, f.y);
      f.jumps = ch.jumps;
      return;
    }
    f.vy = 0;
    f.state = St.LAND;
    f.lag = f.fast ? 5 : 3;
    f.st = 0;
    f.jumps = ch.jumps;
    f.air = 0;
    f.help = 0;
    f.fast = 0;
    return;
  }
  tryLedge(ctx, f, ch, ax);
}

function tryLedge(ctx: Ctx, f: Fighter, ch: CharDef, ax: number): void {
  if (f.ledgeCd > 0 || f.vy < -1.5 || f.ground) return;
  const pp = ctx.pp;
  for (let i = 0; i < pp.length; i++) {
    const p = pp[i];
    if (!p.solid) continue;
    for (let s = -1; s <= 1; s += 2) {
      const edgeX = s < 0 ? p.x - p.w / 2 : p.x + p.w / 2;
      const dx = s < 0 ? edgeX - f.x : f.x - edgeX; // positivo = lutador do lado de fora
      if (dx > -4 && dx < ch.hw + 30 && f.y > p.y + 8 && f.y < p.y + 84) {
        if (ax === s) continue; // segurando para longe
        const code = i * 2 + (s > 0 ? 1 : 0);
        if (ctx.w && ctx.w.fighters.some((o) => o !== f && o.state === St.LEDGE && o.ledge === code)) continue;
        f.state = St.LEDGE;
        f.ledge = code;
        f.ledgeT = 0;
        f.st = 0;
        f.x = edgeX + s * (ch.hw + 1);
        f.y = p.y + ch.bh * 0.82;
        f.vx = 0;
        f.vy = 0;
        f.face = -s;
        f.jumps = ch.jumps;
        f.air = 0;
        f.help = 0;
        f.fast = 0;
        f.inv = 70;
        emit(ctx.w, EV.LEDGE, f.x, f.y, f.slot);
        return;
      }
    }
  }
}

function stepLedge(ctx: Ctx, f: Fighter, ch: CharDef, inp: number, ax: number, pressed: number): void {
  f.ledgeT++;
  const i = f.ledge >> 1;
  const s = f.ledge & 1 ? 1 : -1;
  const p = ctx.pp[i];
  if (!p) {
    f.state = St.AIR;
    return;
  }
  const edgeX = s < 0 ? p.x - p.w / 2 : p.x + p.w / 2;
  if (consume(f, B.JUMP)) {
    // pulo da borda
    f.vy = -ch.jumpV * 1.05;
    f.vx = -s * 2.8;
    f.state = St.AIR;
    f.ledge = -1;
    f.ledgeCd = 30;
    f.inv = Math.max(f.inv, 10);
    f.st = 0;
    return;
  }
  const up = (pressed & B.U) || ax === -s || (f.buf & (B.LIGHT | B.HEAVY | B.GRAB | B.SPECIAL));
  if (up) {
    f.buf = 0;
    f.x = edgeX - s * (ch.hw + 8);
    f.y = p.y;
    f.vx = 0;
    f.vy = 0;
    f.ground = 1;
    f.plat = i;
    f.state = St.LAND;
    f.lag = 9;
    f.st = 0;
    f.ledge = -1;
    f.inv = Math.max(f.inv, 36);
    return;
  }
  if ((pressed & B.D) || ax === s || f.ledgeT > 280) {
    f.state = St.AIR;
    f.ledge = -1;
    f.ledgeCd = 40;
    f.vy = 1;
    f.st = 0;
    f.inv = Math.max(f.inv, 6);
  }
}

function stepLand(ctx: Ctx, f: Fighter, ch: CharDef, inp: number): void {
  applyFriction(f, 0.78);
  f.vy = 0;
  const flags = collide(ctx, f, ch);
  if (flags & 2) f.vx = 0;
  if (!f.ground || (!(flags & 1) && !stillGrounded(ctx, f))) {
    leaveGround(f);
    f.state = St.AIR;
    return;
  }
  if (f.st >= f.lag) {
    f.state = St.IDLE;
    f.st = 0;
  } else if (f.st >= f.lag - 1 && consume(f, B.JUMP)) {
    f.state = St.JSQ;
    f.st = 0;
  }
}

function stepShield(ctx: Ctx, f: Fighter, ch: CharDef, inp: number, ax: number, pressed: number): void {
  applyFriction(f, 0.7);
  f.vy = 0;
  collide(ctx, f, ch);
  if (!f.ground || !stillGrounded(ctx, f)) {
    leaveGround(f);
    f.state = St.AIR;
    return;
  }
  f.shield -= 0.28;
  if (f.shield <= 0) {
    f.shield = 0;
    f.state = St.HITSTUN;
    f.stun = 110;
    f.st = 0;
    f.vy = -8;
    f.vx = 0;
    leaveGround(f);
    emit(ctx.w, EV.SHBREAK, f.x, f.y - 40, f.slot);
    return;
  }
  if (!(inp & B.SHIELD)) {
    f.state = St.IDLE;
    f.st = 0;
    return;
  }
  if (consume(f, B.JUMP)) {
    f.state = St.JSQ;
    f.st = 0;
    return;
  }
  if (consume(f, B.GRAB) || consume(f, B.LIGHT)) {
    startMove(f, 'grab');
    return;
  }
  if (f.st > 2) {
    if (pressed & B.D) {
      f.state = St.DODGE;
      f.st = 0;
      f.sdir = 0;
      f.inv = 18;
      return;
    }
    if (pressed & (B.L | B.R)) {
      f.state = St.DODGE;
      f.st = 0;
      f.sdir = (pressed & B.R) ? 1 : -1;
      f.inv = 20;
    }
  }
}

function stepDodge(ctx: Ctx, f: Fighter, ch: CharDef): void {
  if (f.ground) {
    // rolamento (sdir != 0) ou esquiva parada
    f.vx = f.sdir !== 0 && f.st < 20 ? f.sdir * 6.4 * (1 - f.st / 40) : f.vx * 0.8;
    f.vy = 0;
    const flags = collide(ctx, f, ch);
    if (flags & 2) f.vx = 0;
    if (!(flags & 1) && !stillGrounded(ctx, f)) {
      leaveGround(f);
      f.state = St.AIR;
      return;
    }
    if (f.st >= (f.sdir !== 0 ? 30 : 26)) {
      f.state = St.IDLE;
      f.st = 0;
    }
  } else {
    // air dodge
    if (f.st === 1) {
      const dx = f.sdir;
      const dy = f.dodgeDir;
      f.vx = dx * 6.2;
      f.vy = dy * 5.2;
    }
    if (f.st < 18) {
      f.vx *= 0.94;
      f.vy *= 0.94;
    } else {
      f.vy = Math.min(f.vy + ch.grav, ch.fall);
    }
    const flags = collide(ctx, f, ch);
    if (flags & 1) {
      f.state = St.LAND;
      f.lag = 5;
      f.st = 0;
      f.vy = 0;
      f.air = 0;
      f.jumps = ch.jumps;
      return;
    }
    if (f.st >= 30) {
      f.state = St.AIR;
      f.st = 0;
    }
  }
}

function stepPlat(ctx: Ctx, f: Fighter, ch: CharDef, inp: number, ax: number, pressed: number): void {
  f.vx = 0;
  f.vy = 0;
  f.x += ax * 2.4;
  if (ax !== 0) f.face = ax;
  f.shield = 100;
  f.jumps = ch.jumps;
  const stage = ctx.stage;
  f.x = clamp(f.x, stage.mainL - 120, stage.mainR + 120);
  if (f.st > 22 && ((f.buf & ACTION_BITS) || (pressed & (B.D | B.U))) || f.st > 200) {
    f.buf = 0;
    f.state = St.AIR;
    f.st = 0;
    f.inv = 70;
    f.vy = 0.5;
  }
}

function stepHold(ctx: Ctx, f: Fighter, ch: CharDef, inp: number, ax: number, pressed: number): void {
  f.vx = 0;
  f.vy = 0;
  if (!ctx.w) return; // predição: espera o host decidir
  f.hold++;
  if (f.chg > 0) f.chg--;
  const v = f.holding >= 0 ? ctx.w.fighters[f.holding] : null;
  if (!v || v.state !== St.HELD || v.heldBy !== f.slot) {
    f.state = St.IDLE;
    f.holding = -1;
    f.st = 0;
    return;
  }
  const dirIn = inp & (B.L | B.R | B.U | B.D);
  if ((pressed & (B.L | B.R | B.U | B.D)) || (f.buf & B.HEAVY)) {
    let key = 'throwF';
    if (inp & B.U) key = 'throwU';
    else if (inp & B.D) key = 'throwD';
    else if (ax !== 0) {
      if (ax === f.face) key = 'throwF';
      else key = 'throwB';
    }
    f.buf = 0;
    startMove(f, key);
    return;
  }
  if (consume(f, B.LIGHT) && f.chg <= 0 && !dirIn) {
    f.chg = 12;
    v.pct += 1.6;
    f.dealt += 1.6;
    v.hold = Math.max(10, v.hold - 4);
    f.hitstop = 2;
    v.hitstop = 3;
    emit(ctx.w, EV.PUMMEL, v.x, v.y - 40, v.slot);
  }
  if (f.hold > 260) releaseHeld(ctx.w, v, false);
}

function stepHitstun(ctx: Ctx, f: Fighter, ch: CharDef, inp: number, ax: number): void {
  f.stun--;
  // DI sutil
  f.vx += ax * 0.1;
  if (inp & B.U) f.vy -= 0.06;
  if (inp & B.D) f.vy += 0.06;
  if (f.ground) {
    f.vy = 0;
    applyFriction(f, 0.9);
  } else {
    f.vy = Math.min(f.vy + ch.grav * 0.9, 22);
    f.vx *= 0.992;
  }
  const vyPre = f.vy;
  const vxPre = f.vx;
  const wasGround = f.ground;
  if (f.vy < -0.5) leaveGround(f);
  const flags = collide(ctx, f, ch);
  if (flags & 2) {
    if (Math.abs(vxPre) > 5) {
      f.vx = -vxPre * 0.55;
      f.hitstop = 3;
      emit(ctx.w, EV.WALL, f.x, f.y - 40, f.slot);
    } else f.vx = 0;
  }
  if (flags & 4) f.vy = Math.abs(vyPre) * 0.3;
  if ((flags & 1) && !wasGround && vyPre > 2) {
    const pad = padAt(ctx, f);
    if (pad > 0) {
      f.vy = -pad;
      leaveGround(f);
      emit(ctx.w, EV.PAD, f.x, f.y);
    } else if (f.tech > 0 && f.stun > 2) {
      f.stun = 0;
      f.inv = 16;
      f.vx = ax * 5;
      f.vy = 0;
      f.state = St.LAND;
      f.lag = 6;
      f.st = 0;
      emit(ctx.w, EV.TECH, f.x, f.y, f.slot);
      return;
    } else if (vyPre > 6 && f.stun > 6) {
      f.vy = -vyPre * 0.5;
      f.vx *= 0.75;
      leaveGround(f);
      f.hitstop = 4;
      emit(ctx.w, EV.BOUNCE, f.x, f.y, f.slot);
    } else {
      f.vy = 0;
    }
  } else if (flags & 1) {
    f.vy = 0;
  }
  if (f.ground && !(flags & 1) && !stillGrounded(ctx, f)) leaveGround(f);
  if (f.stun <= 0) {
    f.state = f.ground ? St.IDLE : St.AIR;
    f.st = 0;
    f.help = 0;
  }
}

function stepAttack(ctx: Ctx, f: Fighter, ch: CharDef, inp: number, ax: number): void {
  const mv = ch.moves[f.move];
  if (!mv) {
    endAttackState(f, null);
    return;
  }
  const t = f.st;
  const w = ctx.w;
  // movimentos
  let setX = false;
  if (mv.mot) {
    for (const m of mv.mot) {
      if (t >= m.t0 && t < m.t1) {
        if (m.vx !== undefined) {
          if (m.add) f.vx += m.vx * f.face;
          else f.vx = m.vx * f.face;
          setX = true;
        }
        if (m.vy !== undefined) {
          if (m.add) f.vy += m.vy;
          else f.vy = m.vy;
          if (f.vy < 0) leaveGround(f);
        }
      }
    }
  }
  if (mv.inv && t >= mv.inv[0] && t < mv.inv[1]) f.inv = Math.max(f.inv, 2);
  // teleporte
  if (mv.tele && t === mv.tele.t) {
    const tl = mv.tele;
    const dxs = tl.free ? axOf(inp) : f.face;
    let tx = f.x + dxs * Math.abs(tl.dx);
    let ty = f.y + tl.dy;
    if (tl.free && dxs === 0) tx = f.x;
    // encurta se cair dentro de bloco sólido
    for (let k = 0; k < 10; k++) {
      if (!overlapsSolid(ctx, tx, ty, ch)) break;
      tx = f.x + (tx - f.x) * 0.8;
      ty = f.y + (ty - f.y) * 0.8;
    }
    const st = ctx.stage;
    tx = clamp(tx, st.blast.l + 60, st.blast.r - 60);
    ty = Math.max(ty, st.blast.t + 60);
    emit(w, EV.TELE, f.x, f.y - 40, tx, ty - 40);
    f.x = tx;
    f.y = ty;
    f.vx = 0;
    f.vy = 0;
    leaveGround(f);
  }
  // projéteis (host)
  if (mv.proj && w) {
    for (const ps of mv.proj) {
      if (ps.t === t) spawnProj(w, f, ps.kind, f.x + f.face * ps.x, f.y + ps.y, ps.vx * f.face, ps.vy);
    }
  }
  // arremesso de item
  if (mv.itemThrow !== undefined && t === mv.itemThrow) {
    const up = (inp & B.U) !== 0;
    const dn = (inp & B.D) !== 0;
    if (w) throwHeldItem(w, f, up ? -9 : dn ? -1 : -5, 8.5 + Math.abs(f.vx) * 0.3);
    f.itemKind = -1;
  }
  // arremesso de agarrão
  if (mv.throwAt && t === mv.throwAt.t && w && f.holding >= 0) {
    const v = w.fighters[f.holding];
    if (v && v.state === St.HELD && v.heldBy === f.slot) {
      const ta = mv.throwAt;
      v.state = St.AIR;
      v.heldBy = -1;
      v.inv = 0;
      v.hitstop = 0;
      const rad = (ta.ang * Math.PI) / 180;
      applyHit(w, f, v, {
        dmg: ta.dmg, dx: Math.cos(rad) * f.face, dy: -Math.sin(rad), bkb: ta.bkb, kbg: ta.kbg, hs: 6,
        fx: 0, x: v.x, y: v.y - 40, force: true,
      });
      emit(w, EV.THROW, v.x, v.y - 40, f.slot);
    }
    f.holding = -1;
  }

  // gravidade / chão
  let gm = 1;
  if (mv.gv) for (const [a, b, m] of mv.gv) if (t >= a && t < b) gm = m;
  if (f.ground) {
    if (!setX) applyFriction(f, 0.8);
    if (f.vy >= 0) f.vy = 0;
  } else {
    if (!setX) {
      f.vx = clamp(f.vx + axOf(inp) * ch.airAccel * 0.7, -Math.max(ch.airSpeed, Math.abs(f.vx)), Math.max(ch.airSpeed, Math.abs(f.vx)));
      f.vx *= 0.99;
    }
    f.vy = Math.min(f.vy + ch.grav * gm, ch.fall);
  }
  const vyPre = f.vy;
  const wasGround = f.ground;
  const flags = collide(ctx, f, ch);
  if (flags & 2) f.vx = 0;
  if (flags & 4) f.vy = Math.max(f.vy, 0.5);
  if (!f.ground || (!(flags & 1) && !stillGrounded(ctx, f))) {
    if (f.ground && !(flags & 1)) leaveGround(f);
  }
  if ((flags & 1) && !wasGround && vyPre > 1) {
    f.vy = 0;
    if (mv.landSkip !== undefined && t < mv.landSkip) {
      f.st = mv.landSkip;
      f.vx = 0;
      f.jumps = ch.jumps;
      return;
    }
    if (mv.air && mv.land !== undefined && t < mv.dur) {
      const lastEnd = mv.boxes.reduce((a, b) => Math.max(a, b.t1), 0);
      f.state = St.LAND;
      f.lag = Math.max(2, Math.round(t >= lastEnd ? mv.land * 0.45 : mv.land));
      f.st = 0;
      f.move = -1;
      f.help = 0;
      f.jumps = ch.jumps;
      f.air = 0;
      return;
    }
    if (mv.helpless) {
      f.state = St.LAND;
      f.lag = 8;
      f.st = 0;
      f.move = -1;
      f.help = 0;
      f.jumps = ch.jumps;
      f.air = 0;
      return;
    }
    f.jumps = ch.jumps;
  }
  if (f.st >= mv.dur) endAttackState(f, mv);
}

// ---------------------------------------------------------------------------
// Respawn / KO / agarrar
// ---------------------------------------------------------------------------

function respawn(ctx: Ctx, f: Fighter): void {
  const w = ctx.w!;
  const rp = ctx.stage.respawn;
  const ch = CHARS[f.char];
  f.dead = 0;
  f.state = St.PLAT;
  f.st = 0;
  f.x = rp.x;
  f.y = rp.y;
  f.vx = 0;
  f.vy = 0;
  f.ground = 0;
  f.plat = -1;
  f.inv = 9999;
  f.jumps = ch.jumps;
  f.shield = 100;
  f.pct = 0;
  f.move = -1;
  f.buf = 0;
  f.face = f.slot % 2 === 0 ? 1 : -1;
  emit(w, EV.RESPAWN, f.x, f.y, f.slot);
}

function koFighter(w: World, f: Fighter): void {
  const st = w.stage;
  let dx = 0;
  let dy = 0;
  if (f.x < st.blast.l) dx = -1;
  else if (f.x > st.blast.r) dx = 1;
  else if (f.y < st.blast.t) dy = -1;
  else dy = 1;
  const ex = clamp(f.x, st.blast.l, st.blast.r);
  const ey = clamp(f.y, st.blast.t, st.blast.b);
  emit(w, EV.KO, ex, ey, f.slot, dx, dy);
  if (f.holding >= 0) {
    const v = w.fighters[f.holding];
    if (v) releaseHeld(w, v, false);
  }
  if (f.heldBy >= 0) {
    const a = w.fighters[f.heldBy];
    if (a) {
      a.holding = -1;
      if (a.state === St.HOLD) { a.state = St.IDLE; a.st = 0; }
    }
  }
  dropHeldItem(w, f, 0, 0);
  f.falls++;
  if (f.lastHitT > 0 && f.lastHit >= 0 && f.lastHit !== f.slot) {
    const k = w.fighters[f.lastHit];
    if (k) k.kos++;
  } else if (w.rules.mode === 1) {
    // queda sozinha custa um ponto no modo tempo (via falls)
  }
  if (w.rules.mode === 0) {
    f.stocks--;
    f.dead = f.stocks <= 0 ? 2 : 1;
  } else {
    f.dead = 1;
  }
  f.state = St.DEAD;
  f.resp = 100;
  f.pct = 0;
  f.vx = 0;
  f.vy = 0;
  f.hitstop = 0;
  f.stun = 0;
  f.move = -1;
  f.heldBy = -1;
  f.holding = -1;
  f.lastHit = -1;
  f.lastHitT = 0;
  f.itemKind = -1;
  f.x = ex;
  f.y = ey;
}

function releaseHeld(w: World, v: Fighter, escape: boolean): void {
  const a = v.heldBy >= 0 ? w.fighters[v.heldBy] : null;
  v.heldBy = -1;
  if (v.state === St.HELD) {
    v.state = v.ground ? St.IDLE : St.AIR;
    v.st = 0;
    v.inv = 16;
    v.vx = a ? -a.face * 3.5 : 0;
    v.vy = -2;
    leaveGround(v);
    v.state = St.AIR;
  }
  if (a) {
    a.holding = -1;
    if (a.state === St.HOLD) {
      a.state = St.IDLE;
      a.st = 0;
      a.vx = a.face * -2;
      if (escape) {
        a.state = St.LAND;
        a.lag = 18;
      }
    }
  }
}

function tryGrab(w: World, a: Fighter, v: Fighter): boolean {
  if (v.state === St.HELD || v.state === St.HOLD || v.state === St.LEDGE || v.state === St.PLAT) return false;
  if (v.inv > 0) return false;
  a.state = St.HOLD;
  a.st = 0;
  a.holding = v.slot;
  a.hold = 0;
  a.move = -1;
  a.chg = 0;
  a.vx = 0;
  v.state = St.HELD;
  v.heldBy = a.slot;
  v.hold = clamp(75 + v.pct * 0.9, 75, 240);
  v.vx = 0;
  v.vy = 0;
  v.move = -1;
  v.stun = 0;
  if (v.holding >= 0) {
    const o = w.fighters[v.holding];
    if (o) releaseHeld(w, o, false);
  }
  dropHeldItem(w, v, 0, 0);
  emit(w, EV.GRAB, v.x, v.y - 40, a.slot);
  return true;
}

// ---------------------------------------------------------------------------
// Dano / knockback
// ---------------------------------------------------------------------------

export interface HitParams {
  dmg: number;
  dx: number;
  dy: number;
  bkb: number;
  kbg: number;
  hs: number;
  fx: number;
  x: number;
  y: number;
  force?: boolean;
  proj?: boolean;
}

/** Aplica um golpe. Retorna 0 = ignorado, 1 = acerto normal, 2 = escudo, 3 = contra-ataque/armadura. */
export function applyHit(w: World, att: Fighter | null, vic: Fighter, hp: HitParams): number {
  if (vic.dead !== 0) return 0;
  if (!hp.force && vic.inv > 0) return 0;
  if (vic.state === St.PLAT) return 0;
  const vch = CHARS[vic.char];
  const mag = Math.hypot(hp.dx, hp.dy) || 1;
  const ux = hp.dx / mag;
  const uy = hp.dy / mag;

  // contra-ataque
  if (!hp.force && vic.state === St.ATTACK && att) {
    const mv = vch.moves[vic.move];
    if (mv && mv.counter && vic.st >= mv.counter[0] && vic.st < mv.counter[1]) {
      vic.move = MKI.counterHit;
      vic.st = 0;
      vic.hitMask = 0;
      vic.inv = 24;
      vic.face = att.x >= vic.x ? 1 : -1;
      vic.hitstop = 8;
      att.hitstop = 8;
      emit(w, EV.COUNTER, vic.x, vic.y - 40, vic.slot);
      const dmg = Math.min(24, hp.dmg * 1.15 + 5);
      const rad = (34 * Math.PI) / 180;
      applyHit(w, vic, att, {
        dmg, dx: Math.cos(rad) * vic.face, dy: -Math.sin(rad), bkb: 36, kbg: 100, hs: 6, fx: 1,
        x: att.x, y: att.y - 40, force: false,
      });
      return 3;
    }
  }
  // escudo
  if (vic.state === St.SHIELD && !hp.force) {
    vic.shield -= hp.dmg * 1.25 + 3;
    vic.hitstop = 4;
    if (att) att.hitstop = Math.max(att.hitstop, 5);
    vic.vx += ux * (1.6 + hp.dmg * 0.14);
    if (att && !hp.proj) att.vx -= att.face * 1.5;
    if (vic.shield <= 0) {
      vic.shield = 0;
      vic.state = St.HITSTUN;
      vic.stun = 120;
      vic.st = 0;
      vic.vy = -8.5;
      vic.vx = ux * 2;
      leaveGround(vic);
      emit(w, EV.SHBREAK, vic.x, vic.y - 40, vic.slot);
    } else {
      emit(w, EV.SHIELD, hp.x, hp.y, vic.slot);
    }
    return 2;
  }
  // armadura
  if (!hp.force && vic.state === St.ATTACK) {
    const mv = vch.moves[vic.move];
    if (mv && mv.armor && vic.st >= mv.armor[0] && vic.st < mv.armor[1] && hp.dmg < 22) {
      vic.pct += hp.dmg * 0.55;
      vic.hitstop = 5;
      if (att) {
        att.hitstop = Math.max(att.hitstop, 6);
        att.dealt += hp.dmg * 0.55;
      }
      emit(w, EV.HIT, hp.x, hp.y, 0, ux, vic.slot, att ? att.slot : -1, hp.dmg, 6);
      return 3;
    }
  }

  // dano normal
  vic.pct = Math.min(999, vic.pct + hp.dmg);
  const wt = 200 / (vch.weight + 100);
  let kb = ((vic.pct / 10 + (vic.pct * hp.dmg) / 20) * wt * 1.4 + 18) * (hp.kbg / 100) + hp.bkb;
  if (hp.kbg === 0 && hp.bkb === 0) kb = 0;
  const speed = Math.min(40, kb * 0.118);
  let vx = ux * speed;
  let vy = uy * speed;
  if (vic.ground) {
    if (vy > 0) {
      vy = -vy * 0.55;
      leaveGround(vic);
    } else if (vy < -1.5) leaveGround(vic);
  }
  // sai do estado atual
  if (vic.state === St.HELD && vic.heldBy >= 0) releaseHeld(w, vic, false);
  if (vic.holding >= 0) {
    const o = w.fighters[vic.holding];
    if (o) releaseHeld(w, o, false);
  }
  if (vic.state === St.LEDGE) vic.ledge = -1;
  dropHeldItem(w, vic, ux * 2.5, -4);
  vic.vx = vx;
  vic.vy = vy;
  vic.state = St.HITSTUN;
  vic.st = 0;
  vic.stun = Math.max(4, Math.floor(speed * 2.25) + 4);
  vic.move = -1;
  vic.fast = 0;
  vic.help = 0;
  vic.tech = 0;
  vic.sdir = 0;
  vic.buf = 0;
  vic.inv = 0;
  if (att) vic.face = att.x >= vic.x ? 1 : -1;
  const hs = Math.round(clamp(3 + hp.dmg * 0.36 + speed * 0.07 + hp.hs, 4, 17));
  vic.hitstop = hs;
  if (att) {
    att.hitstop = Math.max(att.hitstop, hs - 1);
    att.dealt += hp.dmg;
    vic.lastHit = att.slot;
  } else {
    vic.lastHit = -1;
  }
  vic.lastHitT = 260;
  emit(w, EV.HIT, hp.x, hp.y, speed, ux, vic.slot, att ? att.slot : -1, hp.dmg, hp.fx);
  return 1;
}

// ---------------------------------------------------------------------------
// Itens
// ---------------------------------------------------------------------------

function dropHeldItem(w: World, f: Fighter, vx: number, vy: number): void {
  if (f.itemKind < 0) return;
  for (const it of w.items) {
    if (it.held === f.slot) {
      it.held = -1;
      it.x = f.x;
      it.y = f.y - 40;
      it.vx = vx;
      it.vy = vy;
      it.ground = 0;
      it.armed = it.kind === ItemKind.BOMB ? 1 : 0;
      it.t = it.kind === ItemKind.BOMB ? Math.min(it.t, 300) : 0;
    }
  }
  f.itemKind = -1;
}

function throwHeldItem(w: World, f: Fighter, vy: number, speed: number): void {
  for (let i = 0; i < w.items.length; i++) {
    const it = w.items[i];
    if (it.held === f.slot && it.kind === ItemKind.BOMB) {
      w.items.splice(i, 1);
      const p = spawnProj(w, f, 6, f.x + f.face * 30, f.y - 62, f.face * speed, vy);
      p.t = 0;
      p.n = Math.max(30, it.t); // fuse restante
      return;
    }
  }
}

function spawnProj(w: World, f: Fighter, kind: number, x: number, y: number, vx: number, vy: number): Proj {
  const p: Proj = { id: w.nextId++, kind, owner: f.slot, x, y, vx, vy, face: vx >= 0 ? 1 : -1, t: 0, hit: 0, n: 0 };
  w.projs.push(p);
  emit(w, EV.SPAWNSHOT, x, y, kind);
  return p;
}

function explode(w: World, x: number, y: number, owner: number): void {
  const R = 118;
  emit(w, EV.EXPLODE, x, y, R);
  for (const v of w.fighters) {
    if (v.dead !== 0) continue;
    const cx = v.x;
    const cy = v.y - CHARS[v.char].bh / 2;
    const d = Math.hypot(cx - x, cy - y);
    if (d > R + CHARS[v.char].hw) continue;
    let dx = cx - x;
    let dy = cy - y - 20;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) dy = -1;
    const fall = 1 - clamp(d / (R + 30), 0, 0.7);
    applyHit(w, owner >= 0 ? w.fighters[owner] : null, v, {
      dmg: 11 * (0.6 + fall * 0.4), dx, dy, bkb: 46, kbg: 92, hs: 4, fx: 2, x: cx, y: cy,
    });
  }
}

function spawnItem(w: World): void {
  const r = rngNext(w.rng);
  const kind = r < 0.4 ? ItemKind.BOMB : r < 0.66 ? ItemKind.HAMMER : ItemKind.HEAL;
  const st = w.stage;
  const x = (rngNext(w.rng) - 0.5) * (st.mainR - st.mainL) * 0.9;
  const it: Item = { id: w.nextId++, kind, x, y: st.blast.t + 180, vx: 0, vy: 1.4, held: -1, t: 0, ground: 0, armed: 0 };
  w.items.push(it);
  emit(w, EV.ITEMSPAWN, x, it.y, kind);
}

function stepItems(w: World): void {
  const pp = w.pp;
  // spawn
  if (w.rules.items > 0 && !w.over) {
    w.itemT--;
    const free = w.items.filter((i) => i.held < 0).length;
    if (w.itemT <= 0) {
      if (free < (w.rules.items === 1 ? 2 : 4)) spawnItem(w);
      w.itemT = (w.rules.items === 1 ? 460 : 230) + Math.floor(rngNext(w.rng) * 300);
    }
  }
  for (let i = w.items.length - 1; i >= 0; i--) {
    const it = w.items[i];
    const holder = it.held >= 0 ? w.fighters[it.held] : null;
    if (holder) {
      if (holder.itemKind !== it.kind) {
        // item consumido/quebrado
        if (it.kind === ItemKind.HAMMER) emit(w, EV.BREAK, holder.x, holder.y - 60, holder.slot);
        w.items.splice(i, 1);
        continue;
      }
      it.x = holder.x + holder.face * 26;
      it.y = holder.y - CHARS[holder.char].bh * 0.6;
      it.vx = 0;
      it.vy = 0;
      if (it.kind === ItemKind.BOMB && it.armed) {
        it.t--;
        if (it.t <= 0) {
          explode(w, it.x, it.y, holder.slot);
          holder.itemKind = -1;
          w.items.splice(i, 1);
        }
      }
      continue;
    }
    // livre
    if (!it.ground) {
      it.vy = Math.min(it.vy + (it.armed ? 0.4 : 0.07), it.armed ? 14 : 1.7);
      it.x += it.vx;
      it.vx *= 0.97;
      const py = it.y;
      it.y += it.vy;
      for (const p of pp) {
        const l = p.x - p.w / 2;
        const r = p.x + p.w / 2;
        if (it.x > l && it.x < r && py <= p.y - p.vy + 2 && it.y >= p.y) {
          it.y = p.y;
          it.vy = 0;
          it.ground = 1;
          break;
        }
      }
    } else {
      // continua sobre a plataforma?
      let ok = false;
      for (const p of pp) {
        if (it.x > p.x - p.w / 2 && it.x < p.x + p.w / 2 && Math.abs(it.y - p.y) < 6 + Math.abs(p.vy)) {
          it.y = p.y;
          it.x += p.vx;
          ok = true;
          break;
        }
      }
      if (!ok) it.ground = 0;
      it.vx *= 0.8;
    }
    if (it.armed) {
      it.t--;
      if (it.t <= 0) {
        explode(w, it.x, it.y - 10, -1);
        w.items.splice(i, 1);
        continue;
      }
    } else if (++it.t > 1000) {
      w.items.splice(i, 1);
      continue;
    }
    if (it.y > w.stage.blast.b + 100) {
      w.items.splice(i, 1);
      continue;
    }
    // pickup
    for (const f of w.fighters) {
      if (f.dead !== 0 || f.hitstop > 0) continue;
      if (f.state === St.HITSTUN || f.state === St.HELD || f.state === St.LEDGE || f.state === St.DEAD || f.state === St.PLAT || f.state === St.ATTACK) continue;
      if (it.kind !== ItemKind.HEAL && f.itemKind >= 0) continue;
      const ch = CHARS[f.char];
      if (Math.abs(it.x - f.x) < ch.hw + 26 && it.y > f.y - ch.bh - 16 && it.y < f.y + 24) {
        if (it.kind === ItemKind.HEAL) {
          f.pct = Math.max(0, f.pct - 25);
          emit(w, EV.HEAL, f.x, f.y - 60, f.slot);
          w.items.splice(i, 1);
        } else {
          it.held = f.slot;
          f.itemKind = it.kind;
          f.itemUse = it.kind === ItemKind.HAMMER ? 6 : 1;
          if (it.kind === ItemKind.BOMB && !it.armed) {
            it.armed = 1;
            it.t = 420;
          }
          emit(w, EV.PICKUP, f.x, f.y - 60, f.slot, it.kind);
        }
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Projéteis
// ---------------------------------------------------------------------------

function rectHitsFighter(x0: number, y0: number, x1: number, y1: number, v: Fighter): boolean {
  const r = hurtRect(v);
  return x1 > r.x0 && x0 < r.x1 && y1 > r.y0 && y0 < r.y1;
}

function stepProjs(w: World): void {
  const pp = w.pp;
  for (let i = w.projs.length - 1; i >= 0; i--) {
    const p = w.projs[i];
    const d = PROJS[p.kind];
    let dead = false;
    p.t++;
    if (d.boom) p.vx -= p.face * 0.5;
    if (d.g) p.vy += d.g;
    const py = p.y;
    p.x += p.vx;
    p.y += p.vy;
    if (d.wave) p.y += Math.sin(p.t * 0.38) * d.wave;
    // chão
    if (d.g && p.vy > 0) {
      for (const pl of pp) {
        if (p.x > pl.x - pl.w / 2 && p.x < pl.x + pl.w / 2 && py + d.r <= pl.y + 3 && p.y + d.r >= pl.y) {
          if (d.bounce > 0) {
            p.y = pl.y - d.r;
            p.vy = -p.vy * d.bounce;
            p.vx *= 0.9;
            if (Math.abs(p.vy) < 1.5) p.vy = -1.5;
          } else dead = true;
          break;
        }
      }
    }
    // paredes sólidas
    for (const pl of pp) {
      if (!pl.solid) continue;
      if (p.x > pl.x - pl.w / 2 - d.r && p.x < pl.x + pl.w / 2 + d.r && p.y > pl.y && p.y < pl.y + pl.h) {
        if (d.bounce > 0) {
          p.vx = -p.vx * 0.7;
          p.x += p.vx * 2;
        } else dead = true;
      }
    }
    // reflexo
    for (const f of w.fighters) {
      if (f.dead !== 0 || f.state !== St.ATTACK || f.slot === p.owner) continue;
      const mv = CHARS[f.char].moves[f.move];
      if (!mv || !mv.reflect || f.st < mv.reflect[0] || f.st >= mv.reflect[1]) continue;
      const cx = f.x + f.face * 24;
      const cy = f.y - CHARS[f.char].bh * 0.55;
      if (Math.hypot(p.x - cx, p.y - cy) < 62) {
        p.owner = f.slot;
        p.vx = -p.vx * 1.15;
        p.vy = -p.vy;
        p.face = -p.face;
        p.hit = 0;
        p.t = Math.min(p.t, 10);
        p.n++;
        emit(w, EV.REFLECT, p.x, p.y);
      }
    }
    // acertos
    if (!dead) {
      for (const v of w.fighters) {
        if (v.dead !== 0 || v.slot === p.owner) continue;
        if (p.hit & (1 << v.slot)) continue;
        if (!rectHitsFighter(p.x - d.r, p.y - d.r, p.x + d.r, p.y + d.r, v)) continue;
        if (d.explode) {
          dead = true;
          break;
        }
        const rad = (d.ang * Math.PI) / 180;
        const dir = p.vx >= 0 ? 1 : -1;
        const res = applyHit(w, w.fighters[p.owner] ?? null, v, {
          dmg: d.dmg * (p.n > 0 ? 1.3 : 1), dx: Math.cos(rad) * dir, dy: -Math.sin(rad), bkb: d.bkb, kbg: d.kbg, hs: d.hs,
          fx: d.fx, x: p.x, y: p.y, proj: true,
        });
        if (res > 0) {
          if (d.pierce > 0) p.hit |= 1 << v.slot;
          else dead = true;
          break;
        }
      }
    }
    if (!dead && p.t >= d.life) dead = true;
    if (!dead && (p.x < w.stage.blast.l - 100 || p.x > w.stage.blast.r + 100 || p.y > w.stage.blast.b + 100 || p.y < w.stage.blast.t - 200)) dead = true;
    if (!dead && d.explode && p.t >= Math.max(30, p.n || 140)) dead = true;
    if (dead) {
      if (d.explode) explode(w, p.x, p.y, p.owner);
      w.projs.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Resolução de golpes corpo-a-corpo e perigos
// ---------------------------------------------------------------------------

function resolveMelee(w: World): void {
  for (const a of w.fighters) {
    if (a.dead !== 0 || a.state !== St.ATTACK) continue;
    const mv = CHARS[a.char].moves[a.move];
    if (!mv || mv.boxes.length === 0) continue;
    const t = a.st;
    for (const b of mv.boxes) {
      if (t < b.t0 || t >= b.t1) continue;
      const cx = a.x + b.x * a.face;
      const cy = a.y + b.y;
      const x0 = cx - b.w / 2;
      const x1 = cx + b.w / 2;
      const y0 = cy - b.h / 2;
      const y1 = cy + b.h / 2;
      for (const v of w.fighters) {
        if (v === a || v.dead !== 0) continue;
        const bit = b.grp * 4 + v.slot;
        if (a.hitMask & (1 << bit)) continue;
        if (!rectHitsFighter(x0, y0, x1, y1, v)) continue;
        a.hitMask |= 1 << bit;
        if (b.grab) {
          if (tryGrab(w, a, v)) break;
          continue;
        }
        applyBoxHit(w, a, v, b, cx, cy);
      }
      if (a.state !== St.ATTACK) break;
    }
  }
}

function applyBoxHit(w: World, a: Fighter, v: Fighter, b: HitBox, cx: number, cy: number): void {
  const rad = (b.ang * Math.PI) / 180;
  const hx = clamp(v.x, cx - b.w / 2, cx + b.w / 2);
  const hy = clamp(v.y - CHARS[v.char].bh * 0.5, cy - b.h / 2, cy + b.h / 2);
  applyHit(w, a, v, {
    dmg: b.dmg, dx: Math.cos(rad) * a.face, dy: -Math.sin(rad), bkb: b.bkb, kbg: b.kbg, hs: b.hs ?? 0,
    fx: b.fx ?? 0, x: hx, y: hy,
  });
}

function stepHazards(w: World): void {
  const st = w.stage;
  if (st.hazard === 1) {
    for (const g of geysersAt(w.tick, w.seed)) {
      if (g.phase !== 2) continue;
      const hgt = 60 + 360 * Math.sin(Math.min(1, g.p * 1.4) * Math.PI * 0.5);
      for (const v of w.fighters) {
        if (v.dead !== 0 || v.hazCd > 0 || v.inv > 0) continue;
        if (!rectHitsFighter(g.x - 40, -hgt, g.x + 40, 8, v)) continue;
        v.hazCd = 40;
        applyHit(w, null, v, { dmg: 9, dx: 0.12 * sgn(v.x - g.x), dy: -1, bkb: 58, kbg: 62, hs: 3, fx: 2, x: g.x, y: v.y - 30 });
      }
    }
  } else if (st.hazard === 3) {
    for (const c of cannonsAt(w.tick, w.seed)) {
      if (!c.live) continue;
      for (const v of w.fighters) {
        if (v.dead !== 0 || v.hazCd > 0 || v.inv > 0) continue;
        if (!rectHitsFighter(c.x - CANNON_R, c.y - CANNON_R, c.x + CANNON_R, c.y + CANNON_R, v)) continue;
        v.hazCd = 30;
        const rad = (32 * Math.PI) / 180;
        applyHit(w, null, v, { dmg: 12, dx: Math.cos(rad) * c.dir, dy: -Math.sin(rad), bkb: 48, kbg: 88, hs: 5, fx: 0, x: c.x, y: c.y });
      }
    }
  }
}

function stepHeldPositions(w: World): void {
  for (const a of w.fighters) {
    if (a.state !== St.HOLD || a.holding < 0) continue;
    const v = w.fighters[a.holding];
    if (!v || v.state !== St.HELD) continue;
    v.x = a.x + a.face * 30;
    v.y = a.y;
    v.face = -a.face;
    v.vx = 0;
    v.vy = 0;
    v.ground = a.ground;
    v.plat = a.plat;
  }
  // durante o arremesso a vítima segue o atacante até o frame de soltar
  for (const a of w.fighters) {
    if (a.state === St.ATTACK && a.holding >= 0) {
      const v = w.fighters[a.holding];
      if (v && v.state === St.HELD) {
        v.x = a.x + a.face * 30;
        v.y = a.y;
      }
    }
  }
}

function checkEnd(w: World): void {
  if (w.over) return;
  if (w.rules.mode === 0) {
    const alive = w.fighters.filter((f) => f.dead !== 2);
    if (alive.length <= 1 && w.fighters.length > 1) {
      w.over = 1;
      w.winner = alive.length === 1 ? alive[0].slot : -2;
    }
  } else if (w.timeLeft <= 0) {
    w.over = 1;
    const score = (f: Fighter) => f.kos - f.falls;
    const sorted = [...w.fighters].sort((a, b) => score(b) - score(a) || a.pct - b.pct);
    if (sorted.length > 1 && score(sorted[0]) === score(sorted[1]) && sorted[0].pct === sorted[1].pct) w.winner = -2;
    else w.winner = sorted[0].slot;
  }
  if (w.over) emit(w, EV.END, w.winner);
}

// ---------------------------------------------------------------------------
// Passo principal do mundo (somente host / local)
// ---------------------------------------------------------------------------

export function stepWorld(w: World, inputs: number[]): void {
  w.tick++;
  platsAt(w.stage, w.tick, w.pp);
  if (w.count > 0) {
    w.count--;
    if (w.count === 120 || w.count === 60) emit(w, EV.TICK, w.count / 60);
    if (w.count === 180) emit(w, EV.TICK, 3);
    if (w.count === 0) emit(w, EV.GO);
    return;
  }
  const ctx: Ctx = { tick: w.tick, stage: w.stage, pp: w.pp, w };
  if (w.rules.mode === 1 && !w.over) w.timeLeft--;
  for (const f of w.fighters) stepFighter(ctx, f, inputs[f.slot] | 0);
  stepHeldPositions(w);
  separateFighters(w);
  if (!w.over || w.overT < 120) {
    resolveMelee(w);
    stepHazards(w);
  }
  stepProjs(w);
  stepItems(w);
  const bz = w.stage.blast;
  for (const f of w.fighters) {
    if (f.dead !== 0 || f.state === St.PLAT) continue;
    if (f.x < bz.l || f.x > bz.r || f.y < bz.t || f.y > bz.b) koFighter(w, f);
  }
  if (w.over) w.overT++;
  else checkEnd(w);
}

const PUSH_STATES = new Set<number>([St.IDLE, St.RUN, St.AIR, St.LAND, St.SHIELD, St.JSQ]);
function separateFighters(w: World): void {
  const fs = w.fighters;
  for (let i = 0; i < fs.length; i++) {
    const a = fs[i];
    if (a.dead !== 0 || !PUSH_STATES.has(a.state)) continue;
    for (let j = i + 1; j < fs.length; j++) {
      const b = fs[j];
      if (b.dead !== 0 || !PUSH_STATES.has(b.state)) continue;
      const dx = b.x - a.x;
      const min = CHARS[a.char].hw + CHARS[b.char].hw;
      if (Math.abs(dx) >= min || Math.abs(a.y - b.y) > 50) continue;
      const push = (min - Math.abs(dx)) * 0.12 + 0.2;
      const d = dx >= 0 ? 1 : -1;
      a.x -= d * push;
      b.x += d * push;
    }
  }
}

export function isHuman(f: Fighter): boolean {
  return f.ctrl !== Ctrl.BOT;
}

export function placementOrder(w: World): Fighter[] {
  // vencedor primeiro; depois por estoque/KOs
  const score = (f: Fighter) => (w.rules.mode === 0 ? f.stocks * 1000 - f.pct : (f.kos - f.falls) * 1000 - f.pct);
  return [...w.fighters].sort((a, b) => (b.slot === w.winner ? 1 : 0) - (a.slot === w.winner ? 1 : 0) || score(b) - score(a));
}
