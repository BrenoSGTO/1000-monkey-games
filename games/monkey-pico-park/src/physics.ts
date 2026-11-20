import { picoAudio } from './audio';
import { LEVELS } from './levels';
import {
  GRAVITY,
  JUMP_VY,
  MONKEY_H,
  MONKEY_PALETTES,
  MONKEY_W,
  MOVE_SPEED,
  SHOUT_PHRASES,
  WORLD_H,
  WORLD_W,
  type BoxState,
  type ButtonState,
  type FloatingText,
  type GameMode,
  type MonkeyInput,
  type MonkeyState,
  type Particle,
  type PlatformState,
  type SeesawState,
  type WorldState,
} from './types';

export interface PhysicsCallbacks {
  onEvent?: (
    name: 'level_start' | 'level_clear' | 'die' | 'key_grab' | 'fake_key' | 'door_open' | 'shout',
    detail?: string,
    x?: number,
    y?: number,
  ) => void;
}

export interface PlayerSlotInfo {
  playerId: string;
  name: string;
  paletteIndex: number;
}

export function createWorld(
  levelIndex: number,
  mode: GameMode,
  playerSlots: PlayerSlotInfo[],
  prevState?: Partial<Pick<WorldState, 'deaths' | 'totalTimer' | 'totalScore' | 'completedLevels'>>,
): WorldState {
  const def = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, levelIndex))];

  const monkeys: MonkeyState[] = playerSlots.map((slot, i) => {
    const sp = def.spawns[i % def.spawns.length];
    return {
      id: i,
      playerId: slot.playerId,
      name: slot.name,
      paletteIndex: slot.paletteIndex % MONKEY_PALETTES.length,
      x: sp.x + Math.floor(i / def.spawns.length) * 28,
      y: sp.y,
      vx: 0,
      vy: 0,
      w: MONKEY_W,
      h: MONKEY_H,
      facing: 1,
      grounded: false,
      coyoteTimer: 0,
      jumpBuffer: 0,
      standingOnMonkeyId: null,
      standingOnPlatformId: null,
      squishedTimer: 0,
      enteredDoor: false,
      shoutText: null,
      shoutTimer: 0,
      animTime: i * 0.7,
      squashX: 1,
      squashY: 1,
    };
  });

  const platforms: PlatformState[] = def.platforms.map((p) => ({
    ...p,
    currentX: p.x,
    currentY: p.y,
    prevX: p.x,
    prevY: p.y,
    active: false,
    progress: 0,
  }));

  const boxes: BoxState[] = def.boxes.map((b) => ({
    ...b,
    vx: 0,
    vy: 0,
    grounded: false,
    pushersLeft: 0,
    pushersRight: 0,
    effectiveRequired: Math.min(b.baseRequired, Math.max(1, monkeys.length)),
    standingOnPlatformId: null,
  }));

  const buttons: ButtonState[] = def.buttons.map((btn) => ({
    ...btn,
    pressed: false,
    active: false,
    timer: 0,
    wasPressed: false,
  }));

  const seesaws: SeesawState[] = def.seesaws.map((s) => ({
    ...s,
    angle: 0,
    prevAngle: 0,
    angularVel: 0,
  }));

  return {
    levelIndex: def.index,
    phase: 'playing',
    mode,
    monkeys,
    platforms,
    boxes,
    buttons,
    seesaws,
    spikes: def.spikes.map((s) => ({ ...s })),
    key: {
      originX: def.keyPos.x,
      originY: def.keyPos.y,
      x: def.keyPos.x,
      y: def.keyPos.y,
      carrierMonkeyId: null,
      used: false,
    },
    fakeKeys: def.fakeKeys.map((fk) => ({ ...fk, triggered: false })),
    door: {
      x: def.doorPos.x,
      y: def.doorPos.y,
      w: 56,
      h: 76,
      open: false,
      openProgress: 0,
    },
    tether: def.tether,
    tetherLength: def.tetherLength ?? 175,
    deaths: prevState?.deaths ?? 0,
    levelTimer: 0,
    totalTimer: prevState?.totalTimer ?? 0,
    totalScore: prevState?.totalScore ?? 0,
    activeSoloIndex: 0,
    followActive: false,
    resetFlashTimer: 0.25,
    shakeTimer: 0,
    shakeIntensity: 0,
    particles: [],
    floatingTexts: [],
    completedLevels: prevState?.completedLevels ? [...prevState.completedLevels] : [],
  };
}

export function spawnParticles(
  world: WorldState,
  x: number,
  y: number,
  count: number,
  colors: string[],
  speed = 160,
  emoji?: string,
): void {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd = speed * (0.35 + Math.random() * 0.75);
    world.particles.push({
      x,
      y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd - 60,
      life: 0.45 + Math.random() * 0.45,
      maxLife: 0.9,
      size: 4 + Math.random() * 5,
      color: colors[i % colors.length],
      emoji,
    });
  }
}

export function addFloatingText(
  world: WorldState,
  x: number,
  y: number,
  text: string,
  color = '#fde047',
  scale = 1,
): void {
  world.floatingTexts.push({
    x,
    y,
    vy: -42,
    text,
    color,
    life: 1.25,
    maxLife: 1.25,
    scale,
  });
}

function aabbOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function getSolidRect(p: PlatformState): { x: number; y: number; w: number; h: number } | null {
  if (p.kind === 'solid' || p.kind === 'elevator') {
    return { x: p.currentX, y: p.currentY, w: p.w, h: p.h };
  }
  if (p.kind === 'bridge') {
    if (p.progress < 0.35) return null;
    return { x: p.currentX, y: p.currentY, w: p.w * p.progress, h: p.h };
  }
  if (p.kind === 'gate') {
    if (p.progress > 0.75) return null;
    const remainingH = p.h * (1 - p.progress);
    return { x: p.currentX, y: p.currentY, w: p.w, h: remainingH };
  }
  return null;
}

function computeSoloFollowInput(world: WorldState, m: MonkeyState): MonkeyInput {
  const leader = world.monkeys[world.activeSoloIndex];
  if (!leader || leader.id === m.id || leader.enteredDoor) {
    return { left: false, right: false, jump: false, shout: false };
  }

  const targetX = leader.x - leader.facing * (42 + ((m.id + 1) % 3) * 14);
  const dx = targetX - m.x;
  let left = false;
  let right = false;
  let jump = false;

  if (dx > 18) right = true;
  else if (dx < -18) left = true;

  // Jump if leader is higher and relatively close horizontally, or if blocked by wall/step
  if (m.grounded) {
    if (leader.y < m.y - 34 && Math.abs(leader.x - m.x) < 160) {
      jump = true;
    } else if (right || left) {
      const probeX = right ? m.x + m.w + 8 : m.x - 10;
      const wallAhead = world.platforms.some((p) => {
        const rect = getSolidRect(p);
        if (!rect) return false;
        return aabbOverlap(probeX, m.y + 6, 4, m.h - 10, rect.x, rect.y, rect.w, rect.h);
      });
      const boxAhead = world.boxes.some((b) =>
        aabbOverlap(probeX, m.y + 6, 4, m.h - 10, b.x, b.y, b.w, b.h),
      );
      if (wallAhead || boxAhead) jump = true;

      // Check gap ahead if there is a spike pit below
      const footProbeX = right ? m.x + m.w + 14 : m.x - 14;
      const floorUnderProbe = world.platforms.some((p) => {
        const rect = getSolidRect(p);
        if (!rect) return false;
        return footProbeX >= rect.x && footProbeX <= rect.x + rect.w && rect.y >= m.y + m.h - 4 && rect.y <= m.y + m.h + 40;
      });
      const seesawUnder = world.seesaws.some(
        (s) => Math.abs(footProbeX - s.pivotX) <= s.length * 0.5 && Math.abs(s.pivotY - (m.y + m.h)) < 55,
      );
      if (!floorUnderProbe && !seesawUnder && world.spikes.length > 0) {
        jump = true;
      }
    }
  }

  return { left, right, jump, shout: false };
}

export function triggerMonkeyShout(world: WorldState, monkey: MonkeyState, cb?: PhysicsCallbacks): void {
  const phrase = SHOUT_PHRASES[Math.floor(Math.random() * SHOUT_PHRASES.length)];
  monkey.shoutText = phrase;
  monkey.shoutTimer = 1.6;
  picoAudio.shout();
  cb?.onEvent?.('shout', phrase, monkey.x + monkey.w / 2, monkey.y);
}

export function stepWorld(
  world: WorldState,
  dt: number,
  inputsByMonkeyId: Map<number, MonkeyInput>,
  cb?: PhysicsCallbacks,
  enableSound = true,
): void {
  // Decay visual timers even outside playing
  if (world.resetFlashTimer > 0) world.resetFlashTimer = Math.max(0, world.resetFlashTimer - dt);
  if (world.shakeTimer > 0) world.shakeTimer = Math.max(0, world.shakeTimer - dt);

  updateParticlesAndTexts(world, dt);

  if (world.phase !== 'playing') return;

  world.levelTimer += dt;
  world.totalTimer += dt;

  // 1. Resolve inputs (including Solo Follow AI)
  const resolvedInputs = new Map<number, MonkeyInput>();
  for (const m of world.monkeys) {
    if (m.enteredDoor) {
      resolvedInputs.set(m.id, { left: false, right: false, jump: false, shout: false });
      continue;
    }
    const direct = inputsByMonkeyId.get(m.id);
    if (world.mode === 'solo' && m.id !== world.activeSoloIndex) {
      resolvedInputs.set(
        m.id,
        world.followActive ? computeSoloFollowInput(world, m) : { left: false, right: false, jump: false, shout: false },
      );
    } else {
      resolvedInputs.set(m.id, direct ?? { left: false, right: false, jump: false, shout: false });
    }
  }

  // Handle shouts
  for (const m of world.monkeys) {
    m.animTime += dt;
    if (m.squishedTimer > 0) m.squishedTimer = Math.max(0, m.squishedTimer - dt);
    if (m.shoutTimer > 0) {
      m.shoutTimer = Math.max(0, m.shoutTimer - dt);
      if (m.shoutTimer <= 0) m.shoutText = null;
    }
    m.squashX += (1 - m.squashX) * Math.min(1, dt * 14);
    m.squashY += (1 - m.squashY) * Math.min(1, dt * 14);

    const inp = resolvedInputs.get(m.id);
    if (inp?.shout && m.shoutTimer <= 0.2) {
      triggerMonkeyShout(world, m, cb);
    }
  }

  // 2. Update Buttons
  for (const btn of world.buttons) {
    let currentlyPressed = false;
    // Check monkeys pressing
    for (const m of world.monkeys) {
      if (m.enteredDoor) continue;
      if (
        m.x + m.w > btn.x + 2 &&
        m.x < btn.x + btn.w - 2 &&
        m.y + m.h >= btn.y - 12 &&
        m.y + m.h <= btn.y + 8
      ) {
        currentlyPressed = true;
        break;
      }
    }
    // Check boxes pressing
    if (!currentlyPressed) {
      for (const box of world.boxes) {
        if (
          box.x + box.w > btn.x + 2 &&
          box.x < btn.x + btn.w - 2 &&
          box.y + box.h >= btn.y - 12 &&
          box.y + box.h <= btn.y + 8
        ) {
          currentlyPressed = true;
          break;
        }
      }
    }

    if (currentlyPressed && !btn.wasPressed && enableSound) {
      picoAudio.buttonOn();
    } else if (!currentlyPressed && btn.wasPressed && btn.mode === 'hold' && enableSound) {
      picoAudio.buttonOff();
    }

    btn.pressed = currentlyPressed;
    if (btn.mode === 'hold') {
      btn.active = currentlyPressed;
    } else if (btn.mode === 'toggle') {
      if (currentlyPressed) btn.active = true;
    } else if (btn.mode === 'timed') {
      if (currentlyPressed) {
        btn.active = true;
        btn.timer = btn.duration ?? 5.0;
      } else if (btn.timer > 0) {
        btn.timer = Math.max(0, btn.timer - dt);
        btn.active = btn.timer > 0;
        if (!btn.active && enableSound) picoAudio.buttonOff();
      }
    }
    btn.wasPressed = currentlyPressed;
  }

  // 3. Update Platforms (bridges, gates, elevators)
  const linkActive = new Map<string, boolean>();
  for (const btn of world.buttons) {
    if (btn.active) linkActive.set(btn.linkId, true);
  }

  for (const p of world.platforms) {
    p.prevX = p.currentX;
    p.prevY = p.currentY;
    const active = p.linkId ? Boolean(linkActive.get(p.linkId)) : false;
    p.active = active;

    if (p.kind === 'bridge' || p.kind === 'gate') {
      const target = active ? 1 : 0;
      const rate = p.kind === 'bridge' ? 4.2 : 3.5;
      if (p.progress < target) p.progress = Math.min(1, p.progress + rate * dt);
      else if (p.progress > target) p.progress = Math.max(0, p.progress - rate * dt);
    } else if (p.kind === 'elevator') {
      const tx = p.targetX ?? p.x;
      const ty = p.targetY ?? p.y;
      const dist = Math.hypot(tx - p.x, ty - p.y) || 1;
      const stepProg = ((p.speed ?? 160) / dist) * dt;
      const target = active ? 1 : 0;
      if (p.progress < target) p.progress = Math.min(1, p.progress + stepProg);
      else if (p.progress > target) p.progress = Math.max(0, p.progress - stepProg);
      p.currentX = p.x + (tx - p.x) * p.progress;
      p.currentY = p.y + (ty - p.y) * p.progress;
    }
  }

  // 4. Update Seesaws (torque from standing monkeys & boxes)
  for (const s of world.seesaws) {
    s.prevAngle = s.angle;
    let torque = 0;
    const half = s.length * 0.5;
    for (const m of world.monkeys) {
      if (m.enteredDoor) continue;
      const cx = m.x + m.w * 0.5;
      if (cx >= s.pivotX - half - 8 && cx <= s.pivotX + half + 8) {
        const sy = s.pivotY + (cx - s.pivotX) * Math.tan(s.angle) - s.thickness * 0.5;
        if (Math.abs(m.y + m.h - sy) <= 16 && m.vy >= -30) {
          torque += (cx - s.pivotX) / half;
        }
      }
    }
    for (const box of world.boxes) {
      const cx = box.x + box.w * 0.5;
      if (cx >= s.pivotX - half && cx <= s.pivotX + half) {
        const sy = s.pivotY + (cx - s.pivotX) * Math.tan(s.angle) - s.thickness * 0.5;
        if (Math.abs(box.y + box.h - sy) <= 18) {
          torque += ((cx - s.pivotX) / half) * 1.8;
        }
      }
    }
    const targetAngle = Math.max(-s.maxAngle, Math.min(s.maxAngle, torque * s.maxAngle * 1.15));
    const diff = targetAngle - s.angle;
    s.angle += diff * Math.min(1, dt * 6.5);
  }

  // 5. Carry monkeys resting on moving elevators (and monkeys stacked on top of them)
  const platCarryApplied = new Set<number>();
  for (const m of world.monkeys) {
    if (m.enteredDoor) continue;
    if (m.standingOnPlatformId) {
      const plat = world.platforms.find((p) => p.id === m.standingOnPlatformId);
      if (plat) {
        m.x += plat.currentX - plat.prevX;
        m.y += plat.currentY - plat.prevY;
        platCarryApplied.add(m.id);
      }
    }
  }
  for (let pass = 0; pass < world.monkeys.length; pass++) {
    for (const m of world.monkeys) {
      if (m.enteredDoor || platCarryApplied.has(m.id) || m.standingOnMonkeyId === null) continue;
      const support = world.monkeys.find((o) => o.id === m.standingOnMonkeyId);
      if (support && platCarryApplied.has(support.id)) {
        const rootPlatId = support.standingOnPlatformId;
        if (rootPlatId) {
          const plat = world.platforms.find((p) => p.id === rootPlatId);
          if (plat) {
            m.x += plat.currentX - plat.prevX;
            m.y += plat.currentY - plat.prevY;
            m.standingOnPlatformId = rootPlatId;
            platCarryApplied.add(m.id);
          }
        }
      }
    }
  }

  // 6. Update Pushable Coconut Boxes (supports conga-line pushing!)
  const prevBoxPos = new Map<string, { x: number; y: number }>();
  for (const box of world.boxes) {
    prevBoxPos.set(box.id, { x: box.x, y: box.y });
    box.effectiveRequired = Math.min(box.baseRequired, Math.max(1, world.monkeys.length));

    const leftPushers = new Set<number>();
    const rightPushers = new Set<number>();

    // Direct touchers
    for (const m of world.monkeys) {
      if (m.enteredDoor) continue;
      const inp = resolvedInputs.get(m.id);
      if (!inp) continue;
      const vertOverlap = m.y + m.h > box.y + 6 && m.y < box.y + box.h - 4;
      if (!vertOverlap) continue;

      if (inp.right && m.x + m.w >= box.x - 10 && m.x + m.w <= box.x + 16) {
        leftPushers.add(m.id);
      } else if (inp.left && m.x <= box.x + box.w + 10 && m.x >= box.x + box.w - 16) {
        rightPushers.add(m.id);
      }
    }

    // Conga-line chain pushers behind direct pushers
    for (let pass = 0; pass < world.monkeys.length; pass++) {
      for (const m of world.monkeys) {
        if (m.enteredDoor) continue;
        const inp = resolvedInputs.get(m.id);
        if (!inp) continue;
        if (inp.right && !leftPushers.has(m.id)) {
          for (const pid of leftPushers) {
            const p = world.monkeys.find((o) => o.id === pid);
            if (
              p &&
              m.y + m.h > p.y + 6 &&
              m.y < p.y + p.h - 4 &&
              m.x + m.w >= p.x - 10 &&
              m.x + m.w <= p.x + 12
            ) {
              leftPushers.add(m.id);
              break;
            }
          }
        }
        if (inp.left && !rightPushers.has(m.id)) {
          for (const pid of rightPushers) {
            const p = world.monkeys.find((o) => o.id === pid);
            if (
              p &&
              m.y + m.h > p.y + 6 &&
              m.y < p.y + p.h - 4 &&
              m.x <= p.x + p.w + 10 &&
              m.x >= p.x + p.w - 12
            ) {
              rightPushers.add(m.id);
              break;
            }
          }
        }
      }
    }

    const pushL = leftPushers.size;
    const pushR = rightPushers.size;
    box.pushersLeft = pushL;
    box.pushersRight = pushR;

    if (pushL >= box.effectiveRequired && pushR === 0) {
      box.vx = 115;
    } else if (pushR >= box.effectiveRequired && pushL === 0) {
      box.vx = -115;
    } else {
      box.vx = 0;
    }

    // Box X movement
    box.x = Math.max(0, Math.min(WORLD_W - box.w, box.x + box.vx * dt));
    for (const p of world.platforms) {
      const rect = getSolidRect(p);
      if (!rect) continue;
      if (aabbOverlap(box.x, box.y, box.w, box.h, rect.x, rect.y, rect.w, rect.h)) {
        if (box.vx > 0) box.x = rect.x - box.w;
        else if (box.vx < 0) box.x = rect.x + rect.w;
      }
    }

    // Box Y movement
    box.vy = Math.min(900, box.vy + GRAVITY * dt);
    box.y += box.vy * dt;
    box.grounded = false;
    for (const p of world.platforms) {
      const rect = getSolidRect(p);
      if (!rect) continue;
      if (aabbOverlap(box.x, box.y, box.w, box.h, rect.x, rect.y, rect.w, rect.h)) {
        if (box.vy >= 0) {
          box.y = rect.y - box.h;
          box.vy = 0;
          box.grounded = true;
        } else {
          box.y = rect.y + rect.h;
          box.vy = 0;
        }
      }
    }

    // Carry monkeys standing on top of this box & push monkeys in front
    const pb = prevBoxPos.get(box.id)!;
    const bdx = box.x - pb.x;
    const bdy = box.y - pb.y;
    if (bdx !== 0 || bdy !== 0) {
      for (const m of world.monkeys) {
        if (m.enteredDoor) continue;
        if (
          m.x + m.w > pb.x + 2 &&
          m.x < pb.x + box.w - 2 &&
          Math.abs(m.y + m.h - pb.y) <= 6
        ) {
          m.x += bdx;
          m.y += bdy;
        } else if (aabbOverlap(m.x, m.y, m.w, m.h, box.x, box.y, box.w, box.h)) {
          if (bdx > 0) m.x = box.x + box.w;
          else if (bdx < 0) m.x = box.x - m.w;
        }
      }
    }
  }

  // 7. Compute Monkey Horizontal & Jump Velocities
  const prevMonkeyPos = new Map<number, { x: number; y: number }>();
  const wasStandingOn = new Map<number, number | null>();
  for (const m of world.monkeys) {
    prevMonkeyPos.set(m.id, { x: m.x, y: m.y });
    wasStandingOn.set(m.id, m.standingOnMonkeyId);
    if (m.enteredDoor) continue;

    const inp = resolvedInputs.get(m.id)!;
    let targetVx = 0;
    if (inp.left) {
      targetVx -= MOVE_SPEED;
      m.facing = -1;
    }
    if (inp.right) {
      targetVx += MOVE_SPEED;
      m.facing = 1;
    }
    m.vx = targetVx;

    if (m.grounded) m.coyoteTimer = 0.1;
    else m.coyoteTimer = Math.max(0, m.coyoteTimer - dt);

    if (inp.jump) m.jumpBuffer = 0.12;
    else m.jumpBuffer = Math.max(0, m.jumpBuffer - dt);

    if (m.jumpBuffer > 0 && m.coyoteTimer > 0) {
      m.vy = JUMP_VY;
      m.grounded = false;
      m.coyoteTimer = 0;
      m.jumpBuffer = 0;
      m.standingOnMonkeyId = null;
      m.standingOnPlatformId = null;
      m.squashX = 0.78;
      m.squashY = 1.24;
      if (enableSound) picoAudio.jump(m.id);
      spawnParticles(world, m.x + m.w * 0.5, m.y + m.h, 4, ['#ffffff', '#fef08a'], 80);
    }

    m.vy = Math.min(950, m.vy + GRAVITY * dt);
  }

  // 8. Tether Mode (Corda de Cipó) elastic constraints
  if (world.tether && world.monkeys.length >= 2) {
    const activeMonkeys = world.monkeys.filter((m) => !m.enteredDoor);
    for (let i = 0; i < activeMonkeys.length - 1; i++) {
      const a = activeMonkeys[i];
      const b = activeMonkeys[i + 1];
      const ax = a.x + a.w * 0.5;
      const ay = a.y + a.h * 0.5;
      const bx = b.x + b.w * 0.5;
      const by = b.y + b.h * 0.5;
      const dx = bx - ax;
      const dy = by - ay;
      const dist = Math.hypot(dx, dy);
      if (dist > world.tetherLength && dist > 0.001) {
        const over = dist - world.tetherLength;
        const nx = dx / dist;
        const ny = dy / dist;
        const pull = Math.min(520, over * 13);

        let weightA = 0.5;
        let weightB = 0.5;
        if (a.grounded && !b.grounded) {
          weightA = 0.15;
          weightB = 0.85;
        } else if (!a.grounded && b.grounded) {
          weightA = 0.85;
          weightB = 0.15;
        }

        a.vx += nx * pull * weightA;
        a.vy += ny * pull * weightA;
        b.vx -= nx * pull * weightB;
        b.vy -= ny * pull * weightB;

        // Gentle hard-leash clamp so vine doesn't stretch infinitely
        if (over > 45) {
          const snap = over - 45;
          a.x += nx * snap * weightA;
          a.y += ny * snap * weightA;
          b.x -= nx * snap * weightB;
          b.y -= ny * snap * weightB;
        }
      }
    }
  }

  // 9. Bottom-up X movement + Head-Stacking Horizontal Carry
  const activeMonkeys = world.monkeys.filter((m) => !m.enteredDoor);
  // Sort bottom-most first (highest y)
  const bottomUp = [...activeMonkeys].sort((a, b) => b.y - a.y);
  const deltaXMap = new Map<number, number>();

  for (const m of bottomUp) {
    const startX = m.x;
    let carryX = 0;
    if (m.standingOnMonkeyId !== null) {
      carryX = deltaXMap.get(m.standingOnMonkeyId) ?? 0;
    }
    m.x += m.vx * dt + carryX;
    m.x = Math.max(0, Math.min(WORLD_W - m.w, m.x));

    // Resolve X vs solid platforms
    for (const p of world.platforms) {
      const rect = getSolidRect(p);
      if (!rect) continue;
      if (aabbOverlap(m.x, m.y, m.w, m.h, rect.x, rect.y, rect.w, rect.h)) {
        if (m.vx * dt + carryX > 0) m.x = rect.x - m.w;
        else if (m.vx * dt + carryX < 0) m.x = rect.x + rect.w;
        else {
          const pushL = m.x + m.w - rect.x;
          const pushR = rect.x + rect.w - m.x;
          if (pushL < pushR) m.x = rect.x - m.w;
          else m.x = rect.x + rect.w;
        }
      }
    }

    // Resolve X vs boxes
    for (const box of world.boxes) {
      if (aabbOverlap(m.x, m.y, m.w, m.h, box.x, box.y, box.w, box.h)) {
        const mCx = m.x + m.w * 0.5;
        const bCx = box.x + box.w * 0.5;
        if (mCx < bCx) m.x = box.x - m.w;
        else m.x = box.x + box.w;
      }
    }

    deltaXMap.set(m.id, m.x - startX);
  }

  // Solid Monkey-vs-Monkey Horizontal Separation (2 passes)
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < activeMonkeys.length; i++) {
      for (let j = i + 1; j < activeMonkeys.length; j++) {
        const a = activeMonkeys[i];
        const b = activeMonkeys[j];
        // Skip if stacked vertically
        if (a.y + a.h <= b.y + 8 || b.y + b.h <= a.y + 8) continue;
        if (aabbOverlap(a.x, a.y, a.w, a.h, b.x, b.y, b.w, b.h)) {
          const aCx = a.x + a.w * 0.5;
          const bCx = b.x + b.w * 0.5;
          const overlap =
            aCx <= bCx ? a.x + a.w - b.x : b.x + b.w - a.x;
          if (overlap > 0) {
            const half = overlap * 0.5;
            if (aCx <= bCx) {
              a.x = Math.max(0, a.x - half);
              b.x = Math.min(WORLD_W - b.w, b.x + half);
            } else {
              b.x = Math.max(0, b.x - half);
              a.x = Math.min(WORLD_W - a.w, a.x + half);
            }
          }
        }
      }
    }
    // Re-clamp against walls/boxes after monkey separation
    for (const m of activeMonkeys) {
      for (const p of world.platforms) {
        const rect = getSolidRect(p);
        if (!rect) continue;
        if (aabbOverlap(m.x, m.y, m.w, m.h, rect.x, rect.y, rect.w, rect.h)) {
          const mCx = m.x + m.w * 0.5;
          const rCx = rect.x + rect.w * 0.5;
          if (mCx < rCx) m.x = rect.x - m.w;
          else m.x = rect.x + rect.w;
        }
      }
      for (const box of world.boxes) {
        if (aabbOverlap(m.x, m.y, m.w, m.h, box.x, box.y, box.w, box.h)) {
          const mCx = m.x + m.w * 0.5;
          const bCx = box.x + box.w * 0.5;
          if (mCx < bCx) m.x = box.x - m.w;
          else m.x = box.x + box.w;
        }
      }
    }
  }

  // 10. Vertical Movement & Head-Stacking Resolution (bottom-up!)
  for (const m of bottomUp) {
    const prevPos = prevMonkeyPos.get(m.id)!;
    const wasGrounded = m.grounded;
    m.y += m.vy * dt;
    m.grounded = false;
    m.standingOnMonkeyId = null;
    m.standingOnPlatformId = null;

    // Vs Solid Platforms / Bridges / Elevators
    for (const p of world.platforms) {
      const rect = getSolidRect(p);
      if (!rect) continue;
      if (aabbOverlap(m.x, m.y, m.w, m.h, rect.x, rect.y, rect.w, rect.h)) {
        if (m.vy >= 0 && prevPos.y + m.h <= rect.y + 14) {
          m.y = rect.y - m.h;
          m.vy = 0;
          m.grounded = true;
          m.standingOnPlatformId = p.id;
        } else if (m.vy < 0 && prevPos.y >= rect.y + rect.h - 14) {
          m.y = rect.y + rect.h;
          m.vy = 0;
        } else if (m.vy >= 0) {
          m.y = rect.y - m.h;
          m.vy = 0;
          m.grounded = true;
          m.standingOnPlatformId = p.id;
        }
      }
    }

    // Vs Seesaws
    for (const s of world.seesaws) {
      const cx = m.x + m.w * 0.5;
      const half = s.length * 0.5;
      if (cx >= s.pivotX - half - 6 && cx <= s.pivotX + half + 6) {
        const clampedX = Math.max(s.pivotX - half, Math.min(s.pivotX + half, cx));
        const sy = s.pivotY + (clampedX - s.pivotX) * Math.tan(s.angle) - s.thickness * 0.5;
        if (m.vy >= 0 && prevPos.y + m.h <= sy + 14 && m.y + m.h >= sy - 2) {
          m.y = sy - m.h;
          m.vy = 0;
          m.grounded = true;
        }
      }
    }

    // Vs Boxes
    for (const box of world.boxes) {
      if (aabbOverlap(m.x, m.y, m.w, m.h, box.x, box.y, box.w, box.h)) {
        if (m.vy >= 0 && prevPos.y + m.h <= box.y + 14) {
          m.y = box.y - m.h;
          m.vy = 0;
          m.grounded = true;
        } else if (m.vy < 0 && prevPos.y >= box.y + box.h - 14) {
          m.y = box.y + box.h;
          m.vy = 0;
        }
      }
    }

    // Vs Other Monkeys' Heads (Head-Stacking!)
    for (const other of activeMonkeys) {
      if (other.id === m.id) continue;
      if (m.x + m.w <= other.x + 4 || m.x >= other.x + other.w - 4) continue;

      if (m.vy >= 0 && prevPos.y + m.h <= other.y + 10 && m.y + m.h >= other.y) {
        m.y = other.y - m.h;
        m.vy = 0;
        m.grounded = true;
        m.standingOnMonkeyId = other.id;
        other.squishedTimer = 0.25;
        other.squashX = 1.18;
        other.squashY = 0.84;
        if (wasStandingOn.get(m.id) !== other.id) {
          m.squashX = 1.15;
          m.squashY = 0.86;
          if (enableSound) picoAudio.stackLand();
        }
      } else if (m.vy < 0 && prevPos.y >= other.y + other.h - 10 && m.y <= other.y + other.h) {
        m.y = other.y + other.h;
        m.vy = 0;
      }
    }

    if (!wasGrounded && m.grounded && m.standingOnMonkeyId === null) {
      m.squashX = 1.16;
      m.squashY = 0.85;
    }
  }

  // 11. Hazards (Spikes & Abyss)
  for (const m of activeMonkeys) {
    let died = m.y > WORLD_H + 35;
    if (!died) {
      for (const sp of world.spikes) {
        if (aabbOverlap(m.x + 5, m.y + 6, m.w - 10, m.h - 8, sp.x, sp.y, sp.w, sp.h)) {
          died = true;
          break;
        }
      }
    }
    if (died) {
      triggerTeamDeath(world, m, cb, enableSound);
      return;
    }
  }

  // 12. Key Pickup, Fake Keys & Door Logic
  if (world.key.carrierMonkeyId === null && !world.key.used) {
    for (const m of activeMonkeys) {
      if (aabbOverlap(m.x, m.y, m.w, m.h, world.key.x - 18, world.key.y - 18, 36, 36)) {
        world.key.carrierMonkeyId = m.id;
        if (enableSound) picoAudio.keyGrab();
        spawnParticles(world, world.key.x, world.key.y, 16, ['#fde047', '#facc15', '#ffffff'], 200);
        addFloatingText(world, world.key.x, world.key.y - 20, 'CHAVE PEGA! 🔑🍌', '#fde047', 1.15);
        cb?.onEvent?.('key_grab', m.name, world.key.x, world.key.y);
        break;
      }
    }
  } else if (world.key.carrierMonkeyId !== null && !world.key.used) {
    const carrier = world.monkeys.find((m) => m.id === world.key.carrierMonkeyId);
    if (carrier && !carrier.enteredDoor) {
      const targetX = carrier.x + carrier.w * 0.5 - carrier.facing * 28;
      const targetY = carrier.y - 6 + Math.sin(world.levelTimer * 5) * 5;
      world.key.x += (targetX - world.key.x) * Math.min(1, dt * 12);
      world.key.y += (targetY - world.key.y) * Math.min(1, dt * 12);
    }
  }

  // Fake Keys
  for (const fk of world.fakeKeys) {
    if (fk.triggered) continue;
    for (const m of activeMonkeys) {
      if (aabbOverlap(m.x, m.y, m.w, m.h, fk.x - 16, fk.y - 16, 32, 32)) {
        fk.triggered = true;
        world.shakeTimer = 0.25;
        world.shakeIntensity = 6;
        if (enableSound) picoAudio.fakeKey();
        spawnParticles(world, fk.x, fk.y, 18, ['#ef4444', '#fde047', '#f97316'], 220);
        addFloatingText(world, fk.x, fk.y - 16, 'PEGADINHA! 🤡🍌', '#fb7185', 1.25);
        cb?.onEvent?.('fake_key', m.name, fk.x, fk.y);
        break;
      }
    }
  }

  // Unlock Door when carrier reaches door
  if (!world.door.open && world.key.carrierMonkeyId !== null) {
    const carrier = world.monkeys.find((m) => m.id === world.key.carrierMonkeyId);
    if (
      carrier &&
      aabbOverlap(
        carrier.x - 10,
        carrier.y - 10,
        carrier.w + 20,
        carrier.h + 20,
        world.door.x,
        world.door.y,
        world.door.w,
        world.door.h,
      )
    ) {
      world.door.open = true;
      world.key.used = true;
      world.shakeTimer = 0.2;
      world.shakeIntensity = 5;
      if (enableSound) picoAudio.doorOpen();
      spawnParticles(
        world,
        world.door.x + world.door.w * 0.5,
        world.door.y + world.door.h * 0.5,
        24,
        ['#fde047', '#4ade80', '#38bdf8', '#fb7185'],
        240,
      );
      addFloatingText(
        world,
        world.door.x + world.door.w * 0.5,
        world.door.y - 18,
        'PORTA ABERTA! ENTRAM TODOS!',
        '#4ade80',
        1.15,
      );
      cb?.onEvent?.('door_open', undefined, world.door.x, world.door.y);
    }
  }

  if (world.door.open) {
    world.door.openProgress = Math.min(1, world.door.openProgress + dt * 4);
    for (const m of activeMonkeys) {
      const mCx = m.x + m.w * 0.5;
      const mCy = m.y + m.h * 0.5;
      const dCx = world.door.x + world.door.w * 0.5;
      const dCy = world.door.y + world.door.h * 0.5;
      if (Math.abs(mCx - dCx) < 28 && Math.abs(mCy - dCy) < 42) {
        m.enteredDoor = true;
        if (enableSound) picoAudio.doorEnter();
        spawnParticles(world, dCx, dCy, 10, [MONKEY_PALETTES[m.paletteIndex].body, '#ffffff'], 130);
      }
    }

    // Check if ALL monkeys entered!
    if (world.monkeys.length > 0 && world.monkeys.every((m) => m.enteredDoor)) {
      if (!world.completedLevels.includes(world.levelIndex)) {
        world.completedLevels.push(world.levelIndex);
      }
      const levelScore = Math.max(
        250,
        Math.round(1500 - world.levelTimer * 18 - world.deaths * 40),
      );
      world.totalScore += levelScore;
      world.phase = world.levelIndex >= LEVELS.length - 1 ? 'victory' : 'level_clear';
      if (enableSound) picoAudio.levelWin();
      cb?.onEvent?.('level_clear', `${levelScore}`);
    }
  }
}

export function triggerTeamDeath(
  world: WorldState,
  victim: MonkeyState,
  cb?: PhysicsCallbacks,
  enableSound = true,
): void {
  const vx = victim.x + victim.w * 0.5;
  const vy = Math.min(WORLD_H - 40, victim.y + victim.h * 0.5);
  if (enableSound) picoAudio.die();
  cb?.onEvent?.('die', victim.name, vx, vy);

  const slots: PlayerSlotInfo[] = world.monkeys.map((m) => ({
    playerId: m.playerId,
    name: m.name,
    paletteIndex: m.paletteIndex,
  }));

  const nextDeaths = world.deaths + 1;
  const preserved = createWorld(world.levelIndex, world.mode, slots, {
    deaths: nextDeaths,
    totalTimer: world.totalTimer,
    totalScore: world.totalScore,
    completedLevels: world.completedLevels,
  });

  // Preserve particles & add explosion where victim died
  Object.assign(world, preserved);
  world.shakeTimer = 0.35;
  world.shakeIntensity = 9;
  world.resetFlashTimer = 0.32;
  spawnParticles(world, vx, vy, 22, ['#fb7185', '#fde047', '#ffffff'], 240);
  addFloatingText(world, vx, Math.max(110, vy - 30), `${victim.name} CAIU! 💀`, '#fb7185', 1.25);
}

export function updateParticlesAndTexts(world: WorldState, dt: number): void {
  for (let i = world.particles.length - 1; i >= 0; i--) {
    const p = world.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 420 * dt;
    p.life -= dt;
    if (p.life <= 0) world.particles.splice(i, 1);
  }
  for (let i = world.floatingTexts.length - 1; i >= 0; i--) {
    const ft = world.floatingTexts[i];
    ft.y += ft.vy * dt;
    ft.life -= dt;
    if (ft.life <= 0) world.floatingTexts.splice(i, 1);
  }
}
