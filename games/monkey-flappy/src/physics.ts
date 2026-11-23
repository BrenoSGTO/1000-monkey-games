import {
  DEATH_QUOTES_BY_CAUSE,
  DEATH_QUOTES_GENERAL,
  FLAP_VELOCITY,
  GRAVITY,
  MAGNET_DURATION,
  MAX_FALL_SPEED,
  MONKEY_RADIUS,
  PLAYABLE_HEIGHT,
  SHIELD_IFRAME,
  TURBO_DURATION,
  type BananaCoin,
  type FlyingHazard,
  type MonkeyEntity,
  type ObstacleColumn,
  type PowerUpOrb,
  type SkinId,
} from './types';

export function createMonkeyEntity(
  playerIndex: number,
  name: string,
  badgeColor: string,
  skin: SkinId,
  startX: number,
): MonkeyEntity {
  return {
    playerIndex,
    name,
    badgeColor,
    skin,
    x: startX,
    y: PLAYABLE_HEIGHT * 0.44 + (playerIndex === 1 ? 42 : 0),
    vy: 0,
    rot: 0,
    scaleX: 1,
    scaleY: 1,
    propAngle: 0,
    propSpeed: 10,
    flapTimer: 0,
    blinkTimer: 1.5 + Math.random() * 2.5,
    isBlinking: false,
    dangerLevel: 0,
    alive: true,
    score: 0,
    bananasRun: 0,
    survivalTime: 0,
    deathCause: '',
    magnetTimer: 0,
    hasShield: false,
    turboTimer: 0,
    invulnTimer: 0,
    ragdollVx: 0,
    ragdollVy: 0,
    ragdollVrot: 0,
    ragdollBounces: 0,
    limbFlail: 0,
    propellerDetached: null,
  };
}

export function triggerFlap(m: MonkeyEntity): boolean {
  if (!m.alive) return false;
  m.vy = FLAP_VELOCITY;
  m.flapTimer = 0.22;
  m.propSpeed = 34;
  // Squash & stretch impulse
  m.scaleX = 0.82;
  m.scaleY = 1.24;
  return true;
}

export function pickDeathQuote(cause: 'bird' | 'heli' | 'space' | 'ground' | 'pipe'): string {
  const pool =
    cause !== 'pipe' && DEATH_QUOTES_BY_CAUSE[cause] && Math.random() < 0.65
      ? DEATH_QUOTES_BY_CAUSE[cause]
      : DEATH_QUOTES_GENERAL;
  return pool[Math.floor(Math.random() * pool.length)];
}

export interface StepMonkeyCallbacks {
  onScore: (m: MonkeyEntity, newScore: number) => void;
  onCoin: (m: MonkeyEntity, coin: BananaCoin) => void;
  onPowerUp: (m: MonkeyEntity, orb: PowerUpOrb) => void;
  onShieldBreak: (m: MonkeyEntity, x: number, y: number) => void;
  onTurboSmash: (m: MonkeyEntity, x: number, y: number) => void;
  onNearMiss: (m: MonkeyEntity, x: number, y: number) => void;
  onDeath: (m: MonkeyEntity, cause: 'bird' | 'heli' | 'space' | 'ground' | 'pipe') => void;
  onBounce: (m: MonkeyEntity) => void;
}

export function stepMonkey(
  m: MonkeyEntity,
  dt: number,
  worldX: number,
  scrollSpeed: number,
  columns: ObstacleColumn[],
  flyers: FlyingHazard[],
  coins: BananaCoin[],
  powerUps: PowerUpOrb[],
  cb: StepMonkeyCallbacks,
): void {
  // Propeller & squash recovery
  m.propAngle += m.propSpeed * dt;
  m.propSpeed = Math.max(10, m.propSpeed - 28 * dt);
  m.scaleX += (1 - m.scaleX) * Math.min(1, dt * 12);
  m.scaleY += (1 - m.scaleY) * Math.min(1, dt * 12);

  if (m.flapTimer > 0) m.flapTimer = Math.max(0, m.flapTimer - dt);

  // Detached propeller physics when dead
  if (m.propellerDetached) {
    const p = m.propellerDetached;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 280 * dt;
    p.rot += p.vrot * dt;
    p.life -= dt;
    if (p.life <= 0) m.propellerDetached = null;
  }

  if (!m.alive) {
    // Ragdoll physics!
    m.ragdollVy = Math.min(MAX_FALL_SPEED * 1.3, m.ragdollVy + GRAVITY * 1.05 * dt);
    m.x += m.ragdollVx * dt;
    m.y += m.ragdollVy * dt;
    m.rot += m.ragdollVrot * dt;
    m.limbFlail += dt * (12 + Math.abs(m.ragdollVrot) * 1.5);

    const floorY = PLAYABLE_HEIGHT - 16;
    if (m.y >= floorY) {
      m.y = floorY;
      if (Math.abs(m.ragdollVy) > 95 && m.ragdollBounces < 4) {
        m.ragdollVy = -Math.abs(m.ragdollVy) * 0.45;
        m.ragdollVx *= 0.72;
        m.ragdollVrot *= -0.62;
        m.ragdollBounces++;
        cb.onBounce(m);
      } else {
        m.ragdollVy = 0;
        m.ragdollVx *= Math.max(0, 1 - dt * 6);
        m.ragdollVrot *= Math.max(0, 1 - dt * 8);
      }
    }
    return;
  }

  m.survivalTime += dt;
  if (m.magnetTimer > 0) m.magnetTimer = Math.max(0, m.magnetTimer - dt);
  if (m.turboTimer > 0) m.turboTimer = Math.max(0, m.turboTimer - dt);
  if (m.invulnTimer > 0) m.invulnTimer = Math.max(0, m.invulnTimer - dt);

  // Eye blink
  m.blinkTimer -= dt;
  if (m.blinkTimer <= 0) {
    if (m.isBlinking) {
      m.isBlinking = false;
      m.blinkTimer = 1.8 + Math.random() * 3.0;
    } else {
      m.isBlinking = true;
      m.blinkTimer = 0.11;
    }
  }

  // Vertical physics (Turbo stabilizes gravity slightly for awesome control!)
  const gravScale = m.turboTimer > 0 ? 0.65 : 1;
  m.vy = Math.min(MAX_FALL_SPEED, m.vy + GRAVITY * gravScale * dt);
  m.y += m.vy * dt;

  // Ceiling clamp with gentle bonk
  if (m.y < MONKEY_RADIUS + 6) {
    m.y = MONKEY_RADIUS + 6;
    if (m.vy < 0) m.vy = 40;
  }

  // Nose pitch rotation based on vertical velocity
  const targetRot = m.vy < 0 ? -0.38 : Math.min(1.22, (m.vy / MAX_FALL_SPEED) * 1.25);
  m.rot += (targetRot - m.rot) * Math.min(1, dt * (m.vy < 0 ? 16 : 7));

  const monkeyWorldX = worldX + m.x;

  // Ground collision
  if (m.y + MONKEY_RADIUS >= PLAYABLE_HEIGHT) {
    if (m.turboTimer > 0) {
      m.y = PLAYABLE_HEIGHT - MONKEY_RADIUS;
      m.vy = -260;
    } else if (m.hasShield) {
      m.hasShield = false;
      m.invulnTimer = SHIELD_IFRAME;
      m.y = PLAYABLE_HEIGHT - MONKEY_RADIUS - 4;
      m.vy = FLAP_VELOCITY * 0.95;
      cb.onShieldBreak(m, m.x, m.y);
    } else {
      killMonkey(m, 'ground', scrollSpeed, cb);
      return;
    }
  }

  // Danger proximity calculation for wide eyes!
  let minThreatDist = 999;
  if (PLAYABLE_HEIGHT - m.y < 85) {
    minThreatDist = Math.min(minThreatDist, PLAYABLE_HEIGHT - m.y);
  }

  // Coins & Magnet pull
  for (const c of coins) {
    if (c.collected) continue;
    const dx = monkeyWorldX - c.x;
    const dy = m.y - c.y;
    const dist = Math.hypot(dx, dy);

    if (m.magnetTimer > 0 && dist < 240 && dist > 1) {
      const pull = (1 - dist / 240) * 640 + 220;
      c.x += (dx / dist) * pull * dt;
      c.y += (dy / dist) * pull * dt;
    }

    if (dist <= MONKEY_RADIUS + c.radius + 6) {
      c.collected = true;
      m.bananasRun += 1;
      cb.onCoin(m, c);
    }
  }

  // Power-ups
  for (const p of powerUps) {
    if (p.collected) continue;
    const dist = Math.hypot(monkeyWorldX - p.x, m.y - p.y);
    if (dist <= MONKEY_RADIUS + p.radius + 6) {
      p.collected = true;
      if (p.type === 'magnet') m.magnetTimer = MAGNET_DURATION;
      else if (p.type === 'shield') m.hasShield = true;
      else if (p.type === 'turbo') m.turboTimer = TURBO_DURATION;
      cb.onPowerUp(m, p);
    }
  }

  // Columns collision, scoring & near-miss
  for (const col of columns) {
    if (col.destroyed) continue;

    const colCenterX = col.x + col.width * 0.5;
    if (!col.passedBy.has(m.playerIndex) && monkeyWorldX > colCenterX) {
      col.passedBy.add(m.playerIndex);
      m.score += 1;
      cb.onScore(m, m.score);
    }

    const gapTop = col.gapY - col.gapHeight * 0.5;
    const gapBot = col.gapY + col.gapHeight * 0.5;

    // Closest point on top and bottom rects
    const clampedX = Math.max(col.x, Math.min(monkeyWorldX, col.x + col.width));
    const topClampedY = Math.max(0, Math.min(m.y, gapTop));
    const botClampedY = Math.max(gapBot, Math.min(m.y, PLAYABLE_HEIGHT));

    const distTop = Math.hypot(monkeyWorldX - clampedX, m.y - topClampedY);
    const distBot = Math.hypot(monkeyWorldX - clampedX, m.y - botClampedY);
    const closest = Math.min(distTop, distBot);
    minThreatDist = Math.min(minThreatDist, closest);

    if (closest < MONKEY_RADIUS) {
      if (m.turboTimer > 0) {
        col.destroyed = true;
        if (!col.passedBy.has(m.playerIndex)) {
          col.passedBy.add(m.playerIndex);
        }
        m.score += 2;
        cb.onTurboSmash(m, m.x + 20, m.y);
        cb.onScore(m, m.score);
        continue;
      }
      if (m.invulnTimer > 0) continue;

      if (m.hasShield) {
        m.hasShield = false;
        m.invulnTimer = SHIELD_IFRAME;
        m.vy = m.y < col.gapY ? 180 : FLAP_VELOCITY * 0.85;
        cb.onShieldBreak(m, m.x, m.y);
        continue;
      }

      const cause = col.biome === 'space' ? 'space' : 'pipe';
      killMonkey(m, cause, scrollSpeed, cb);
      return;
    } else if (
      closest < MONKEY_RADIUS + 11 &&
      !col.nearMissedBy.has(m.playerIndex) &&
      monkeyWorldX > col.x &&
      monkeyWorldX < col.x + col.width
    ) {
      col.nearMissedBy.add(m.playerIndex);
      m.score += 1;
      cb.onNearMiss(m, m.x, m.y - 26);
      cb.onScore(m, m.score);
    }
  }

  // Flying hazards collision
  for (const f of flyers) {
    if (f.destroyed) continue;
    const dist = Math.hypot(monkeyWorldX - f.x, m.y - f.y);
    const edgeDist = dist - f.radius;
    minThreatDist = Math.min(minThreatDist, edgeDist);

    if (dist < MONKEY_RADIUS + f.radius - 2) {
      if (m.turboTimer > 0) {
        f.destroyed = true;
        m.score += 2;
        cb.onTurboSmash(m, m.x + 16, m.y);
        cb.onScore(m, m.score);
        continue;
      }
      if (m.invulnTimer > 0) continue;

      if (m.hasShield) {
        m.hasShield = false;
        m.invulnTimer = SHIELD_IFRAME;
        f.destroyed = true;
        cb.onShieldBreak(m, m.x, m.y);
        continue;
      }

      const cause =
        f.kind === 'angry_bird'
          ? 'bird'
          : f.kind === 'coconut_heli'
            ? 'heli'
            : 'space';
      killMonkey(m, cause, scrollSpeed, cb);
      return;
    } else if (dist < MONKEY_RADIUS + f.radius + 13 && !f.nearMissedBy.has(m.playerIndex)) {
      f.nearMissedBy.add(m.playerIndex);
      m.score += 1;
      cb.onNearMiss(m, m.x, m.y - 26);
      cb.onScore(m, m.score);
    }
  }

  m.dangerLevel = Math.max(0, Math.min(1, 1 - (minThreatDist - MONKEY_RADIUS) / 65));
}

function killMonkey(
  m: MonkeyEntity,
  cause: 'bird' | 'heli' | 'space' | 'ground' | 'pipe',
  scrollSpeed: number,
  cb: StepMonkeyCallbacks,
): void {
  m.alive = false;
  m.dangerLevel = 1;
  m.deathCause = pickDeathQuote(cause);
  m.ragdollVx = cause === 'ground' ? scrollSpeed * 0.28 : -scrollSpeed * 0.36;
  m.ragdollVy = cause === 'ground' ? -310 : -260;
  m.ragdollVrot = (Math.random() < 0.5 ? -1 : 1) * (9 + Math.random() * 6);
  m.ragdollBounces = 0;
  m.propellerDetached = {
    x: m.x,
    y: m.y - 22,
    vx: (Math.random() - 0.3) * 140,
    vy: -320,
    rot: 0,
    vrot: 22,
    life: 2.2,
  };
  cb.onDeath(m, cause);
}
