import { sampleTerrain } from './tracks';
import type {
  FloatingCallout,
  MovingCar,
  Particle,
  RagdollConstraint,
  RagdollNode,
  RagdollState,
  TrackData,
  XrayFlash,
} from './types';

export interface RagdollHitEvent {
  points: number;
  bones: number;
  callout: string;
  color: string;
  x: number;
  y: number;
  intensity: number;
  part: 'skull' | 'ribs' | 'pelvis' | 'limb';
  spawnPoop: boolean;
}

const HEAD_JOKES = [
  'CRÂNIO RACHADO',
  'CAPACETE DE COCO QUEBRADO!',
  'DIGNIDADE -999',
  'TESTA NO POSTE',
  'NEURÔNIOS DE FÉRIAS',
];

const CHEST_JOKES = [
  'COSTELA FLUTUANTE',
  'PULMÃO AMASSADO',
  'CLAVÍCULA NO INSS',
  'PEITO DE POMBO',
];

const PELVIS_JOKES = [
  'CÓCCIX EM PÓ',
  'COCÔ VOOU',
  'BACIA DESLOCADA',
  'NÁDEGA RALADA',
];

const LIMB_JOKES = [
  'JOELHO NO SUS',
  'BRAÇO DE GELATINA',
  'COTOVELO TORTO',
  'TORNOZELO DE BANANA',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function createEmptyRagdoll(): RagdollState {
  return {
    active: false,
    nodes: [],
    constraints: [],
    boardX: 0,
    boardY: 0,
    boardVx: 0,
    boardVy: 0,
    boardAngle: 0,
    boardSpin: 0,
    capX: 0,
    capY: 0,
    capVx: 0,
    capVy: 0,
    capAngle: 0,
    capSpin: 0,
    capLost: false,
    elapsed: 0,
    settleTime: 0,
    currentCrashScore: 0,
    currentBonesBroken: 0,
  };
}

export function spawnRagdollFromSkater(
  x: number,
  y: number,
  vx: number,
  vy: number,
  angle: number,
  facing: 1 | -1,
  ejectImpulse = false,
): RagdollState {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const tx = (lx: number, ly: number) => ({
    x: x + lx * cos - ly * sin,
    y: y + lx * sin + ly * cos,
  });

  // Base velocity in px/step (assuming 60fps reference step = 1/60)
  const dt = 1 / 60;
  const stepVx = (vx + (ejectImpulse ? facing * 190 : 0)) * dt;
  const stepVy = (vy + (ejectImpulse ? -340 : -70)) * dt;

  const mk = (name: string, lx: number, ly: number, radius: number, extraVx = 0, extraVy = 0): RagdollNode => {
    const p = tx(lx * facing, ly);
    return {
      name,
      x: p.x,
      y: p.y,
      oldX: p.x - (stepVx + extraVx * dt),
      oldY: p.y - (stepVy + extraVy * dt),
      radius,
      hitCooldown: 0,
    };
  };

  // Monkey local pose around board center (y=0 is wheels, body extends upward to -72)
  const nodes: RagdollNode[] = [
    mk('head', 4, -68, 14, facing * 45, -40), // 0
    mk('chest', 0, -45, 12), // 1
    mk('pelvis', -2, -23, 11), // 2
    mk('lElbow', -14, -44, 6, -40, -20), // 3
    mk('lHand', -24, -36, 6, -70, -30), // 4
    mk('rElbow', 14, -46, 6, 40, -20), // 5
    mk('rHand', 24, -38, 6, 70, -30), // 6
    mk('lKnee', -10, -11, 7), // 7
    mk('lFoot', -14, 0, 7), // 8
    mk('rKnee', 10, -11, 7), // 9
    mk('rFoot', 14, 0, 7), // 10
  ];

  const dist = (a: number, b: number) => {
    const dx = nodes[b].x - nodes[a].x;
    const dy = nodes[b].y - nodes[a].y;
    return Math.hypot(dx, dy);
  };

  const link = (a: number, b: number, stiffness = 0.95): RagdollConstraint => ({
    a,
    b,
    length: dist(a, b),
    stiffness,
  });

  const constraints: RagdollConstraint[] = [
    link(0, 1, 0.95), // head - chest
    link(1, 2, 0.98), // chest - pelvis
    link(0, 2, 0.45), // spine posture brace
    link(1, 3, 0.9), // chest - lElbow
    link(3, 4, 0.9), // lElbow - lHand
    link(1, 5, 0.9), // chest - rElbow
    link(5, 6, 0.9), // rElbow - rHand
    link(2, 7, 0.9), // pelvis - lKnee
    link(7, 8, 0.9), // lKnee - lFoot
    link(2, 9, 0.9), // pelvis - rKnee
    link(9, 10, 0.9), // rKnee - rFoot
    link(7, 9, 0.15), // gentle hip separation
    link(3, 5, 0.15), // gentle shoulder width
  ];

  const boardSpin = (Math.random() > 0.5 ? 1 : -1) * (8 + Math.random() * 10);
  const headPos = nodes[0];

  return {
    active: true,
    nodes,
    constraints,
    boardX: x,
    boardY: y - 4,
    boardVx: vx * 0.85 - facing * 120,
    boardVy: vy * 0.7 - 210,
    boardAngle: angle,
    boardSpin,
    capX: headPos.x,
    capY: headPos.y - 12,
    capVx: vx * 0.65 - facing * 90,
    capVy: vy * 0.5 - 260,
    capAngle: angle,
    capSpin: -facing * 9,
    capLost: ejectImpulse,
    elapsed: 0,
    settleTime: 0,
    currentCrashScore: 0,
    currentBonesBroken: 0,
  };
}

export function stepRagdoll(
  ragdoll: RagdollState,
  track: TrackData,
  cars: MovingCar[],
  dt: number,
  onHit: (ev: RagdollHitEvent) => void,
): void {
  if (!ragdoll.active) return;

  ragdoll.elapsed += dt;
  const gravity = 1380 * dt * dt;
  const airDrag = 0.994;

  // 1. Verlet integration for nodes
  for (const n of ragdoll.nodes) {
    if (n.hitCooldown > 0) n.hitCooldown = Math.max(0, n.hitCooldown - dt);
    const vx = (n.x - n.oldX) * airDrag;
    const vy = (n.y - n.oldY) * airDrag;
    n.oldX = n.x;
    n.oldY = n.y;
    n.x += vx;
    n.y += vy + gravity;
  }

  // 2. Solve distance constraints + collisions iteratively
  const iterations = 6;
  for (let iter = 0; iter < iterations; iter++) {
    for (const c of ragdoll.constraints) {
      const a = ragdoll.nodes[c.a];
      const b = ragdoll.nodes[c.b];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 0.0001;
      const diff = ((d - c.length) / d) * 0.5 * c.stiffness;
      const ox = dx * diff;
      const oy = dy * diff;
      a.x += ox;
      a.y += oy;
      b.x -= ox;
      b.y -= oy;
    }

    // Terrain & obstacle collisions
    for (let i = 0; i < ragdoll.nodes.length; i++) {
      const n = ragdoll.nodes[i];
      // Clamp horizontal world bounds
      if (n.x < 10) {
        n.x = 10;
      } else if (n.x > track.width - 10) {
        n.x = track.width - 10;
      }

      const ground = sampleTerrain(track.terrain, n.x);
      if (n.y + n.radius > ground.y) {
        const vx = n.x - n.oldX;
        const vy = n.y - n.oldY;
        const speed = Math.hypot(vx, vy);

        n.y = ground.y - n.radius;
        // Reflect along ground normal roughly
        const dotN = vx * ground.nx + vy * ground.ny;
        if (dotN < 0) {
          const bounce = 0.42;
          const friction = 0.84;
          const rvx = vx - (1 + bounce) * dotN * ground.nx;
          const rvy = vy - (1 + bounce) * dotN * ground.ny;
          n.oldX = n.x - rvx * friction;
          n.oldY = n.y - rvy * friction;

          if (iter === 0 && speed > 4.2 && n.hitCooldown <= 0) {
            triggerNodeHit(ragdoll, n, i, speed, false, onHit);
          }
        } else {
          n.oldX = n.x - vx * 0.86;
          n.oldY = n.y - vy * 0.86;
        }
      }

      // Collide against solid props (poles, signs, parked cars, billboards)
      if (iter === 0) {
        for (const prop of track.props) {
          const left = prop.x - prop.width * 0.5;
          const right = prop.x + prop.width * 0.5;
          const top = prop.y - prop.height;
          const bottom = prop.y;
          if (
            n.x + n.radius > left &&
            n.x - n.radius < right &&
            n.y + n.radius > top &&
            n.y - n.radius < bottom
          ) {
            const vx = n.x - n.oldX;
            const vy = n.y - n.oldY;
            const speed = Math.hypot(vx, vy);
            const overlapL = n.x + n.radius - left;
            const overlapR = right - (n.x - n.radius);
            const overlapT = n.y + n.radius - top;
            const minOverlap = Math.min(overlapL, overlapR, overlapT);
            if (minOverlap === overlapT) {
              n.y = top - n.radius;
              n.oldY = n.y + vy * 0.45;
            } else if (minOverlap === overlapL) {
              n.x = left - n.radius;
              n.oldX = n.x + vx * 0.55;
            } else {
              n.x = right + n.radius;
              n.oldX = n.x + vx * 0.55;
            }
            if (speed > 3.2 && n.hitCooldown <= 0) {
              triggerNodeHit(ragdoll, n, i, speed * 1.25, prop.kind === 'pole' || prop.kind === 'parked-car', onHit);
            }
          }
        }

        // Collide against moving cars
        for (const car of cars) {
          const left = car.x - car.width * 0.5;
          const right = car.x + car.width * 0.5;
          const top = car.y - car.height;
          const bottom = car.y;
          if (
            n.x + n.radius > left &&
            n.x - n.radius < right &&
            n.y + n.radius > top &&
            n.y - n.radius < bottom
          ) {
            const relVx = (n.x - n.oldX) - car.vx * dt;
            const relVy = n.y - n.oldY;
            const speed = Math.hypot(relVx, relVy);
            n.y = top - n.radius;
            n.oldX = n.x - (car.vx * dt * 0.8 + (n.x - n.oldX) * 0.3);
            n.oldY = n.y + 4;
            if (n.hitCooldown <= 0 && speed > 2.5) {
              triggerNodeHit(ragdoll, n, i, Math.max(10, speed * 1.4), true, onHit, 'ATROPELADO NO MORRO!');
            }
          }
        }
      }
    }
  }

  // 3. Step independent skateboard
  ragdoll.boardVy += 1350 * dt;
  ragdoll.boardX += ragdoll.boardVx * dt;
  ragdoll.boardY += ragdoll.boardVy * dt;
  ragdoll.boardAngle += ragdoll.boardSpin * dt;
  const bGround = sampleTerrain(track.terrain, ragdoll.boardX);
  if (ragdoll.boardY + 6 > bGround.y) {
    ragdoll.boardY = bGround.y - 6;
    if (ragdoll.boardVy > 40) {
      ragdoll.boardVy = -ragdoll.boardVy * 0.45;
      ragdoll.boardVx *= 0.82;
      ragdoll.boardSpin *= 0.72;
    } else {
      ragdoll.boardVy = 0;
      ragdoll.boardVx *= 0.94;
      ragdoll.boardSpin *= 0.85;
      ragdoll.boardAngle += (bGround.angle - ragdoll.boardAngle) * 0.25;
    }
  }

  // 4. Step flying backwards cap
  if (ragdoll.capLost) {
    ragdoll.capVy += 1100 * dt;
    ragdoll.capX += ragdoll.capVx * dt;
    ragdoll.capY += ragdoll.capVy * dt;
    ragdoll.capAngle += ragdoll.capSpin * dt;
    const cGround = sampleTerrain(track.terrain, ragdoll.capX);
    if (ragdoll.capY + 4 > cGround.y) {
      ragdoll.capY = cGround.y - 4;
      ragdoll.capVy = -ragdoll.capVy * 0.35;
      ragdoll.capVx *= 0.8;
      ragdoll.capSpin *= 0.6;
    }
  }

  // 5. Track how settled the ragdoll is
  const chest = ragdoll.nodes[1];
  const chestSpeed = Math.hypot(chest.x - chest.oldX, chest.y - chest.oldY) / Math.max(dt, 0.001);
  if (chestSpeed < 45) {
    ragdoll.settleTime += dt;
  } else {
    ragdoll.settleTime = 0;
  }
}

function triggerNodeHit(
  ragdoll: RagdollState,
  node: RagdollNode,
  nodeIndex: number,
  stepSpeed: number,
  isPropBonus: boolean,
  onHit: (ev: RagdollHitEvent) => void,
  customLabel?: string,
): void {
  node.hitCooldown = 0.28;
  const intensity = Math.min(28, stepSpeed);
  const basePts = Math.round(intensity * 32 + (isPropBonus ? 180 : 0));

  let part: 'skull' | 'ribs' | 'pelvis' | 'limb' = 'limb';
  let label = pick(LIMB_JOKES);
  let color = '#fde047';
  let spawnPoop = false;

  if (nodeIndex === 0) {
    part = 'skull';
    label = pick(HEAD_JOKES);
    color = '#38bdf8';
    if (!ragdoll.capLost && intensity > 7) {
      ragdoll.capLost = true;
      ragdoll.capX = node.x;
      ragdoll.capY = node.y - 10;
      ragdoll.capVx = (Math.random() - 0.5) * 240;
      ragdoll.capVy = -260;
      ragdoll.capSpin = (Math.random() - 0.5) * 18;
    }
  } else if (nodeIndex === 1) {
    part = 'ribs';
    label = pick(CHEST_JOKES);
    color = '#fb7185';
  } else if (nodeIndex === 2) {
    part = 'pelvis';
    label = pick(PELVIS_JOKES);
    color = '#f97316';
    if (label === 'COCÔ VOOU' || Math.random() < 0.25) {
      spawnPoop = true;
    }
  }

  if (customLabel) {
    label = customLabel;
    color = '#fb7185';
  }

  const pts = Math.max(80, basePts);
  ragdoll.currentCrashScore += pts;
  ragdoll.currentBonesBroken += intensity > 8 ? 1 : 0;

  onHit({
    points: pts,
    bones: intensity > 8 ? 1 : 0,
    callout: `${label} +${pts}`,
    color,
    x: node.x,
    y: node.y,
    intensity,
    part,
    spawnPoop,
  });
}

export function applyRagdollWiggle(ragdoll: RagdollState): void {
  if (!ragdoll.active || ragdoll.nodes.length < 3) return;
  const chest = ragdoll.nodes[1];
  const head = ragdoll.nodes[0];
  const impulseX = (Math.random() - 0.5) * 7;
  const impulseY = -7.5;
  chest.oldX -= impulseX;
  chest.oldY -= impulseY;
  head.oldX -= impulseX * 1.2;
  head.oldY -= impulseY * 1.1;
  ragdoll.settleTime = 0;
}

export function spawnParticlesForHit(
  particles: Particle[],
  callouts: FloatingCallout[],
  xrays: XrayFlash[],
  ev: RagdollHitEvent,
): void {
  callouts.push({
    x: ev.x,
    y: ev.y - 26,
    vy: -65,
    text: ev.callout,
    color: ev.color,
    scale: ev.intensity > 12 ? 1.25 : 1,
    life: 1.35,
    maxLife: 1.35,
  });

  if (ev.intensity > 7) {
    xrays.push({
      x: ev.x,
      y: ev.y,
      radius: 36 + ev.intensity * 1.4,
      life: 0.34,
      maxLife: 0.34,
      part: ev.part,
    });
  }

  const count = Math.min(12, Math.max(4, Math.floor(ev.intensity * 0.6)));
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = 90 + Math.random() * 260;
    const kind: Particle['kind'] =
      ev.spawnPoop && i < 3
        ? 'poop'
        : i % 3 === 0
          ? 'bone'
          : i % 2 === 0
            ? 'star'
            : 'dust';
    particles.push({
      x: ev.x,
      y: ev.y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd - 90,
      size: kind === 'dust' ? 6 : 9,
      color: kind === 'star' ? '#fde047' : kind === 'poop' ? '#78350f' : '#f8fafc',
      life: 0.6 + Math.random() * 0.45,
      maxLife: 1.0,
      kind,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 14,
    });
  }
}
