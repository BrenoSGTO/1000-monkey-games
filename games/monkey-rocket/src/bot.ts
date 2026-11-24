// IA dos macacos-bot (visao lateral 2D).
import { ARENA, clamp, wrapAngle } from './constants';
import type { Sim, SimCar } from './sim';
import type { BotLevel, InputState } from './types';

export interface BotMem {
  think: number;
  left: boolean;
  right: boolean;
  boost: boolean;
  wantJump: boolean;
  jumpCooldown: number;
  stillT: number;
  skill: number;
  react: number;
  dodgeDone: boolean;
  hop: boolean;
}

export function newBotMem(): BotMem {
  return {
    think: 0,
    left: false,
    right: false,
    boost: false,
    wantJump: false,
    jumpCooldown: 0,
    stillT: 0,
    skill: 1,
    react: 0.1,
    dodgeDone: false,
    hop: false,
  };
}

const LEVEL = [
  { react: 0.22, speed: 0.72, boostUse: 0.35, dodge: 0.25, aim: 3.2 },
  { react: 0.12, speed: 0.92, boostUse: 0.75, dodge: 0.6, aim: 1.6 },
  { react: 0.06, speed: 1.0, boostUse: 1.0, dodge: 0.95, aim: 0.5 },
];

export function botThink(
  sim: Sim,
  car: SimCar,
  mem: BotMem,
  level: BotLevel,
  dt: number,
  kickoff: boolean,
): void {
  const L = LEVEL[level];
  const inp = car.input;
  mem.jumpCooldown -= dt;
  mem.think -= dt;

  // reacoes continuas (rotacao no ar) rodam sempre; decisoes de alto nivel so de tempos em tempos
  const b = car.body;
  const cp = b.getPosition();
  const cv = b.getLinearVelocity();
  const ang = b.getAngle();
  const bp = sim.ball.getPosition();
  const bv = sim.ball.getLinearVelocity();
  const attack = car.team === 0 ? 1 : -1;

  if (mem.think <= 0) {
    mem.think = L.react * (0.7 + Math.random() * 0.6);
    mem.wantJump = false;

    // mate mais perto da bola?
    let mateCloser = false;
    let hasMate = false;
    const myD = Math.hypot(bp.x - cp.x, bp.y - cp.y);
    for (const o of sim.cars) {
      if (o === car || o.team !== car.team) continue;
      hasMate = true;
      const op = o.body.getPosition();
      const od = Math.hypot(bp.x - op.x, bp.y - op.y);
      if (od + 3 < myD) mateCloser = true;
    }
    const ownGoalX = -attack * ARENA.HW;
    const ballInOwnHalf = (bp.x - 0) * attack < 0;

    // previsao simples
    const dist = Math.hypot(bp.x - cp.x, bp.y - cp.y);
    const spd = Math.hypot(cv.x, cv.y) + 14;
    const tt = clamp(dist / spd, 0.05, 0.9) * (0.5 + 0.5 * (1 - L.aim / 4));
    let px = bp.x + bv.x * tt;
    let py = bp.y + bv.y * tt + 0.5 * sim.gravity * tt * tt;
    px = clamp(px, -ARENA.HW + 2.5, ARENA.HW - 2.5);
    py = clamp(py, 2.2, ARENA.H - 3);
    px += (Math.random() - 0.5) * L.aim;

    const aheadOfBall = (cp.x - bp.x) * attack > 1.2;
    let targetX: number;
    let defend = false;
    if (hasMate && mateCloser && !(ballInOwnHalf && Math.abs(bp.x - ownGoalX) < 22)) {
      // apoio: fica entre bola e gol proprio
      defend = true;
      targetX = clamp(bp.x - attack * 14, ownGoalX + attack * 6, ownGoalX + attack * 30);
    } else if (aheadOfBall) {
      targetX = bp.x - attack * 7;
    } else {
      targetX = px - attack * 1.6;
    }

    const dx = targetX - cp.x;
    let d = 0;
    if (Math.abs(dx) > (defend ? 2.5 : 0.7)) d = Math.sign(dx);
    else if (!defend && !aheadOfBall) d = attack; // empurra a bola pro gol
    // na frente da bola e perto: nao bate de frente (evita gol contra)
    const nearAhead = aheadOfBall && !defend && Math.abs(bp.x - cp.x) < 13 && bp.y <= 6.2;
    if (nearAhead && bp.y >= 3.4) {
      const toward = cv.x * Math.sign(bp.x - cp.x);
      d = toward > 5 ? -Math.sign(bp.x - cp.x) : 0;
    }
    // governador de velocidade: nao passa direto do alvo
    const charging = !aheadOfBall && !defend && Math.abs(bp.x - cp.x) < 14;
    let govBoost = true;
    if (!charging && d !== 0) {
      const along = cv.x * d;
      const vDes = Math.min(46, 6 + 1.5 * Math.abs(dx));
      if (along > vDes) d = -d;
      if (along > vDes * 0.8) govBoost = false;
    } else if (!charging && d === 0 && Math.abs(cv.x) > 8) {
      d = -Math.sign(cv.x);
    }
    // modo drible: atras da bola, acompanha e empurra pro gol sem passar direto
    const gap = (bp.x - cp.x) * attack;
    let dribbleBoost = false;
    const dribble = !defend && gap > 0 && bp.y < 7;
    if (dribble) {
      let vDes = (bv.x * attack + 1.7 * gap + 6) * L.speed;
      if (bp.x * attack > 14) vDes += 12;
      const along = cv.x * attack;
      if (along > vDes + 5) d = -attack;
      else if (along < vDes) d = attack;
      else d = 0;
      dribbleBoost = along < vDes - 9 && gap > 7;
    }
    // bots fracos "vacilam"
    if (level === 0 && Math.random() < 0.18) d = 0;
    mem.left = d < 0;
    mem.right = d > 0;

    // turbo
    const far = Math.abs(dx) > 16;
    const closeAttack = !aheadOfBall && Math.abs(bp.x - cp.x) < 20 && Math.abs(bp.x - cp.x) > 3;
    mem.boost = dribble
      ? dribbleBoost && car.boost > (level === 2 ? 3 : 20) && Math.random() < 0.3 + L.boostUse * 0.7
      : car.boost > 1 &&
      (kickoff ? Math.random() < L.boostUse + 0.2 : ((far || closeAttack) && Math.random() < L.boostUse && car.boost > (level === 2 ? 5 : 20)));
    if (!govBoost || (defend && !far) || nearAhead || (aheadOfBall && Math.abs(bp.x - cp.x) < 22)) mem.boost = false;

    // pulos pra bola alta
    const horiz = Math.abs(px - cp.x);
    if (car.grounded && mem.jumpCooldown <= 0) {
      if (kickoff && Math.abs(bp.x - cp.x) < 9 && level > 0) {
        mem.wantJump = true;
      } else if (py > 4.2 && horiz < 6.5 && !aheadOfBall && Math.abs(bp.x - cp.x) < 14) {
        mem.wantJump = true;
      } else if (Math.abs(bp.x - cp.x) < 6 && bp.y < 6 && Math.random() < L.dodge * 0.35 && level > 0) {
        mem.wantJump = true;
      }
      // esta na frente da bola e vindo de encontro a ela: pula por cima
      if (
        aheadOfBall &&
        !defend &&
        bp.y < 6 &&
        Math.abs(bp.x - cp.x) < 11 &&
        Math.abs(bp.x - cp.x) > 2.5 &&
        cv.x * attack < -3 &&
        (level > 0 || Math.random() < 0.5)
      ) {
        mem.wantJump = true;
        mem.hop = true;
      }
      // na parede / teto: solta
      if (car.groundN.y < 0.6) mem.wantJump = true;
    }
  }

  // ---- saidas por frame ----
  inp.left = mem.left;
  inp.right = mem.right;
  inp.boost = mem.boost;
  inp.up = false;
  inp.down = false;

  // parado e de ponta-cabeca? pula
  const sp = Math.hypot(cv.x, cv.y);
  if (!car.grounded && sp < 2.2) mem.stillT += dt;
  else mem.stillT = 0;
  if (mem.stillT > 0.5 && mem.jumpCooldown <= 0) {
    inp.jumpCount++;
    mem.jumpCooldown = 0.7;
    mem.stillT = 0;
  }

  if (mem.wantJump && car.grounded && mem.jumpCooldown <= 0) {
    inp.jumpCount++;
    mem.jumpCooldown = 0.55;
    mem.wantJump = false;
    mem.dodgeDone = false;
  }

  if (car.grounded) mem.hop = false;
  if (!car.grounded && mem.hop) {
    if (car.jumpsUsed === 1 && car.airTime > 0.1) inp.jumpCount++;
    const err = wrapAngle(0 - ang);
    inp.left = err > 0.18;
    inp.right = err < -0.18;
    inp.boost = false;
  } else if (!car.grounded) {
    const toBall = Math.hypot(bp.x - cp.x, bp.y - cp.y);
    const nearBall = toBall < 11 && car.airTime < 1.4;
    if (nearBall) {
      // mira o nariz na bola
      const nose = ang + (car.facing === 1 ? 0 : Math.PI);
      const want = Math.atan2(bp.y - cp.y, bp.x - cp.x);
      const err = wrapAngle(want - nose);
      if (car.flipT <= 0) {
        inp.left = err > 0.12;
        inp.right = err < -0.12;
        if (Math.abs(err) < 0.1) {
          inp.left = false;
          inp.right = false;
        }
      }
      inp.boost = mem.boost || (Math.abs(err) < 0.5 && toBall > 5 && car.boost > 15 && level > 0);
      // dodge no momento do contato
      if (!mem.dodgeDone && car.jumpsUsed === 1 && toBall < 5.5 && car.airTime > 0.1 && Math.random() < L.dodge * 0.25) {
        inp.jumpCount++;
        mem.dodgeDone = true;
        inp.right = bp.x > cp.x;
        inp.left = bp.x <= cp.x;
      }
    } else if (car.flipT <= 0) {
      // aterrissa de rodas pra baixo
      const err = wrapAngle(0 - ang);
      inp.left = err > 0.18;
      inp.right = err < -0.18;
      inp.boost = false;
    }
  }
}
