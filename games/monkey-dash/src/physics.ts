import {
  BASE_SPEED,
  CEILING_Y,
  CUBE_GRAVITY,
  CUBE_JUMP_VEL,
  GROUND_Y,
  ORB_YELLOW_VEL,
  PAD_YELLOW_VEL,
  PLAYER_SIZE,
  SHIP_GRAVITY,
  SHIP_MAX_VY,
  SHIP_THRUST,
  TILE,
  type Checkpoint,
  type LevelData,
  type LevelObject,
  type PlayerState,
} from './types';

export interface PhysicsEvents {
  jumped?: boolean;
  pad?: boolean;
  orb?: boolean;
  portal?: { label: string; color: string };
  banana?: { x: number; y: number };
  died?: { x: number; y: number };
  won?: boolean;
}

export function createInitialPlayer(): PlayerState {
  return {
    x: 40,
    y: GROUND_Y - PLAYER_SIZE,
    vx: BASE_SPEED,
    vy: 0,
    rot: 0,
    form: 'cube',
    grav: 1,
    speedMult: 1,
    onGround: true,
    alive: true,
    scaleX: 1,
    scaleY: 1,
    trail: [],
    waveTrail: [],
    activatedIds: new Set<number>(),
    collectedBananas: new Set<number>(),
  };
}

export function restoreFromCheckpoint(cp: Checkpoint): PlayerState {
  return {
    x: cp.x,
    y: cp.y,
    vx: BASE_SPEED * cp.speedMult,
    vy: cp.vy,
    rot: cp.rot,
    form: cp.form,
    grav: cp.grav,
    speedMult: cp.speedMult,
    onGround: cp.onGround,
    alive: true,
    scaleX: 1,
    scaleY: 1,
    trail: [],
    waveTrail: cp.form === 'wave' ? [{ x: cp.x + PLAYER_SIZE / 2, y: cp.y + PLAYER_SIZE / 2 }] : [],
    activatedIds: new Set<number>(cp.activatedIds),
    collectedBananas: new Set<number>(cp.collectedBananas),
  };
}

export function snapshotCheckpoint(player: PlayerState, songBeatOffset: number): Checkpoint {
  return {
    x: player.x,
    y: player.y,
    vy: player.vy,
    rot: player.rot,
    form: player.form,
    grav: player.grav,
    speedMult: player.speedMult,
    onGround: player.onGround,
    activatedIds: Array.from(player.activatedIds),
    collectedBananas: Array.from(player.collectedBananas),
    songBeatOffset,
  };
}

export interface StepInput {
  held: boolean;
  justPressed: boolean;
  jumpBuffer: number; // >0 if pressed recently
  orbBuffer: number;  // >0 if pressed recently for orb
  coyoteTimer: number;
}

function rectsOverlap(
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

export function stepPhysics(
  player: PlayerState,
  level: LevelData,
  dt: number,
  input: StepInput,
): { events: PhysicsEvents; consumedJump: boolean; consumedOrb: boolean } {
  const events: PhysicsEvents = {};
  let consumedJump = false;
  let consumedOrb = false;

  if (!player.alive) return { events, consumedJump, consumedOrb };

  const prevX = player.x;
  const prevY = player.y;

  player.vx = BASE_SPEED * player.speedMult;
  player.x += player.vx * dt;

  // Recover squash & stretch smoothly
  player.scaleX += (1 - player.scaleX) * Math.min(1, dt * 14);
  player.scaleY += (1 - player.scaleY) * Math.min(1, dt * 14);

  // Vertical motion by form
  if (player.form === 'cube') {
    if ((input.held || input.jumpBuffer > 0) && (player.onGround || input.coyoteTimer > 0)) {
      player.vy = CUBE_JUMP_VEL * player.grav;
      player.onGround = false;
      player.scaleX = 0.76;
      player.scaleY = 1.28;
      events.jumped = true;
      consumedJump = true;
    }

    player.vy += CUBE_GRAVITY * player.grav * dt;
    player.vy = Math.max(-1200, Math.min(1200, player.vy));
    player.y += player.vy * dt;

    if (!player.onGround) {
      player.rot += 7.4 * player.grav * dt;
    } else {
      const target = Math.round(player.rot / (Math.PI / 2)) * (Math.PI / 2);
      player.rot += (target - player.rot) * Math.min(1, dt * 22);
    }
  } else if (player.form === 'ship') {
    const accel = input.held ? SHIP_THRUST * player.grav : SHIP_GRAVITY * player.grav;
    player.vy += accel * dt;
    player.vy = Math.max(-SHIP_MAX_VY, Math.min(SHIP_MAX_VY, player.vy));
    player.y += player.vy * dt;
    const targetRot = Math.atan2(player.vy, player.vx) * 0.7;
    player.rot += (targetRot - player.rot) * Math.min(1, dt * 14);
    player.onGround = false;
  } else {
    // Wave: crisp 45-degree diagonal movement
    const dir = input.held ? -1 : 1;
    player.vy = dir * player.grav * player.vx;
    player.y += player.vy * dt;
    player.onGround = false;
  }

  // Floor & ceiling bounds
  let landedThisStep = false;
  if (player.y + PLAYER_SIZE >= GROUND_Y) {
    player.y = GROUND_Y - PLAYER_SIZE;
    if (player.grav === 1 && player.form === 'cube') {
      if (!player.onGround && player.vy > 180) {
        player.scaleX = 1.22;
        player.scaleY = 0.78;
      }
      player.vy = 0;
      player.onGround = true;
      landedThisStep = true;
    } else if (player.form === 'ship' || player.form === 'wave') {
      if (player.vy > 0) player.vy = 0;
    } else {
      if (player.vy > 0) player.vy = 0;
    }
  }

  if (player.y <= CEILING_Y) {
    player.y = CEILING_Y;
    if (player.grav === -1 && player.form === 'cube') {
      if (!player.onGround && player.vy < -180) {
        player.scaleX = 1.22;
        player.scaleY = 0.78;
      }
      player.vy = 0;
      player.onGround = true;
      landedThisStep = true;
    } else if (player.form === 'ship' || player.form === 'wave') {
      if (player.vy < 0) player.vy = 0;
    } else {
      if (player.vy < 0) player.vy = 0;
    }
  }

  if (!landedThisStep && player.form === 'cube') {
    // Will be set true below if resting on a block
    player.onGround = false;
  }

  // Query nearby objects
  const minGx = Math.floor((player.x - TILE * 2) / TILE);
  const maxGx = Math.ceil((player.x + PLAYER_SIZE + TILE * 2) / TILE);

  const px = player.x;
  const py = player.y;
  const pw = PLAYER_SIZE;
  const ph = PLAYER_SIZE;

  // 1) Process solid blocks first so landing resolves cleanly
  for (let i = 0; i < level.objects.length; i++) {
    const obj: LevelObject = level.objects[i];
    if (obj.gx < minGx || obj.gx > maxGx) continue;
    if (obj.type !== 'block') continue;

    const bx = obj.gx * TILE;
    const by = GROUND_Y - (obj.gy + 1) * TILE;

    if (!rectsOverlap(px, py, pw, ph, bx, by, TILE, TILE)) continue;

    if (player.form === 'wave') {
      player.alive = false;
      events.died = { x: player.x + pw / 2, y: player.y + ph / 2 };
      return { events, consumedJump, consumedOrb };
    }

    const prevBottom = prevY + ph;
    const prevTop = prevY;
    const landingTol = 14;

    if (player.grav === 1 && prevBottom <= by + landingTol && player.vy >= 0) {
      if (player.form === 'cube' && player.vy > 180) {
        player.scaleX = 1.2;
        player.scaleY = 0.8;
      }
      player.y = by - ph;
      player.vy = 0;
      if (player.form === 'cube') player.onGround = true;
    } else if (player.grav === -1 && prevTop >= by + TILE - landingTol && player.vy <= 0) {
      if (player.form === 'cube' && player.vy < -180) {
        player.scaleX = 1.2;
        player.scaleY = 0.8;
      }
      player.y = by + TILE;
      player.vy = 0;
      if (player.form === 'cube') player.onGround = true;
    } else if (player.form === 'ship') {
      // Ship can also gently scrape ceiling/floor blocks opposite its gravity
      if (prevBottom <= by + landingTol && player.vy >= 0) {
        player.y = by - ph;
        player.vy = 0;
      } else if (prevTop >= by + TILE - landingTol && player.vy <= 0) {
        player.y = by + TILE;
        player.vy = 0;
      } else {
        player.alive = false;
        events.died = { x: player.x + pw / 2, y: player.y + ph / 2 };
        return { events, consumedJump, consumedOrb };
      }
    } else {
      // Cube hit side or wrong face of block
      player.alive = false;
      events.died = { x: player.x + pw / 2, y: player.y + ph / 2 };
      return { events, consumedJump, consumedOrb };
    }
  }

  // Check if cube is still standing on a block even when vy===0
  if (player.form === 'cube' && !player.onGround) {
    const eps = 2;
    for (let i = 0; i < level.objects.length; i++) {
      const obj = level.objects[i];
      if (obj.gx < minGx || obj.gx > maxGx || obj.type !== 'block') continue;
      const bx = obj.gx * TILE;
      const by = GROUND_Y - (obj.gy + 1) * TILE;
      if (px + pw > bx + 2 && px < bx + TILE - 2) {
        if (player.grav === 1 && Math.abs(player.y + ph - by) <= eps && player.vy >= 0) {
          player.y = by - ph;
          player.vy = 0;
          player.onGround = true;
          break;
        }
        if (player.grav === -1 && Math.abs(player.y - (by + TILE)) <= eps && player.vy <= 0) {
          player.y = by + TILE;
          player.vy = 0;
          player.onGround = true;
          break;
        }
      }
    }
  }

  // 2) Process spikes, pads, orbs, portals, bananas
  for (let i = 0; i < level.objects.length; i++) {
    const obj = level.objects[i];
    if (obj.gx < minGx || obj.gx > maxGx) continue;
    if (obj.type === 'block') continue;

    const wx = obj.gx * TILE;
    const wy = GROUND_Y - (obj.gy + 1) * TILE;

    if (obj.type === 'spike') {
      // Forgiving inner hitbox
      if (rectsOverlap(player.x + 3, player.y + 3, pw - 6, ph - 4, wx + 11, wy + 14, 18, 25)) {
        player.alive = false;
        events.died = { x: player.x + pw / 2, y: player.y + ph / 2 };
        return { events, consumedJump, consumedOrb };
      }
    } else if (obj.type === 'spike_down') {
      if (rectsOverlap(player.x + 3, player.y + 2, pw - 6, ph - 4, wx + 11, wy + 1, 18, 25)) {
        player.alive = false;
        events.died = { x: player.x + pw / 2, y: player.y + ph / 2 };
        return { events, consumedJump, consumedOrb };
      }
    } else if (obj.type === 'pad_yellow') {
      if (!player.activatedIds.has(i) && rectsOverlap(player.x, player.y, pw, ph, wx + 4, wy + 24, TILE - 8, 18)) {
        player.activatedIds.add(i);
        player.vy = PAD_YELLOW_VEL * player.grav;
        player.onGround = false;
        player.scaleX = 0.72;
        player.scaleY = 1.32;
        events.pad = true;
      }
    } else if (obj.type === 'pad_gravity') {
      if (!player.activatedIds.has(i) && rectsOverlap(player.x, player.y, pw, ph, wx + 4, wy + 24, TILE - 8, 18)) {
        player.activatedIds.add(i);
        player.grav = (player.grav === 1 ? -1 : 1) as 1 | -1;
        player.vy = 420 * player.grav;
        player.onGround = false;
        events.pad = true;
      }
    } else if (obj.type === 'orb_yellow') {
      if (
        !player.activatedIds.has(i) &&
        (input.justPressed || input.orbBuffer > 0) &&
        rectsOverlap(player.x - 6, player.y - 6, pw + 12, ph + 12, wx - 4, wy - 4, TILE + 8, TILE + 8)
      ) {
        player.activatedIds.add(i);
        player.vy = ORB_YELLOW_VEL * player.grav;
        player.onGround = false;
        player.scaleX = 0.78;
        player.scaleY = 1.25;
        events.orb = true;
        consumedOrb = true;
      }
    } else if (obj.type === 'orb_blue') {
      if (
        !player.activatedIds.has(i) &&
        (input.justPressed || input.orbBuffer > 0) &&
        rectsOverlap(player.x - 6, player.y - 6, pw + 12, ph + 12, wx - 4, wy - 4, TILE + 8, TILE + 8)
      ) {
        player.activatedIds.add(i);
        player.grav = (player.grav === 1 ? -1 : 1) as 1 | -1;
        player.vy = 340 * player.grav;
        player.onGround = false;
        events.orb = true;
        consumedOrb = true;
      }
    } else if (obj.type === 'banana') {
      if (!player.collectedBananas.has(i) && rectsOverlap(player.x, player.y, pw, ph, wx + 4, wy + 4, TILE - 8, TILE - 8)) {
        player.collectedBananas.add(i);
        events.banana = { x: wx + TILE / 2, y: wy + TILE / 2 };
      }
    } else if (obj.type.startsWith('portal_')) {
      // Portals have a tall 2.6-tile trigger zone
      if (
        !player.activatedIds.has(i) &&
        rectsOverlap(player.x, player.y, pw, ph, wx + 4, wy - TILE * 0.8, TILE - 8, TILE * 2.6)
      ) {
        player.activatedIds.add(i);
        switch (obj.type) {
          case 'portal_cube':
            player.form = 'cube';
            events.portal = { label: 'CUBO MACACO!', color: '#4ade80' };
            break;
          case 'portal_ship':
            player.form = 'ship';
            player.rot = 0;
            events.portal = { label: 'NAVE BANANA!', color: '#f43f5e' };
            break;
          case 'portal_wave':
            player.form = 'wave';
            player.waveTrail = [{ x: player.x + pw / 2, y: player.y + ph / 2 }];
            events.portal = { label: 'ONDA SURTADA!', color: '#22d3ee' };
            break;
          case 'portal_grav_inv':
            player.grav = -1;
            events.portal = { label: 'GRAVIDADE INVERTIDA!', color: '#38bdf8' };
            break;
          case 'portal_grav_norm':
            player.grav = 1;
            events.portal = { label: 'GRAVIDADE NORMAL!', color: '#facc15' };
            break;
          case 'portal_speed_norm':
            player.speedMult = 1;
            events.portal = { label: 'VELOCIDADE 1x', color: '#4ade80' };
            break;
          case 'portal_speed_fast':
            player.speedMult = 1.25;
            events.portal = { label: 'TURBO 1.25x!', color: '#facc15' };
            break;
          case 'portal_speed_turbo':
            player.speedMult = 1.5;
            events.portal = { label: 'SURTO 1.5x!!', color: '#fb7185' };
            break;
        }
      }
    }
  }

  // Wave rotation & trail recording
  if (player.form === 'wave') {
    const onFloorOrCeil = player.y <= CEILING_Y + 1 || player.y + ph >= GROUND_Y - 1;
    player.rot = onFloorOrCeil ? 0 : Math.atan2(player.vy, player.vx);
    const cx = player.x + pw / 2;
    const cy = player.y + ph / 2;
    player.waveTrail.push({ x: cx, y: cy });
    if (player.waveTrail.length > 90) player.waveTrail.shift();
  } else {
    player.trail.push({ x: player.x + pw / 2, y: player.y + ph / 2, form: player.form });
    if (player.trail.length > 22) player.trail.shift();
  }

  // Check level finish line
  if (player.x >= level.lengthTiles * TILE) {
    events.won = true;
  }

  return { events, consumedJump, consumedOrb };
}
