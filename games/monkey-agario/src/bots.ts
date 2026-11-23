import {
  ARENA_SIZE,
  EAT_MASS_RATIO,
  SKINS,
  massToRadius,
} from './skins';
import type {
  CactusVirus,
  FoodPellet,
  GameMode,
  MonkeyCell,
  PlayerInput,
  SkinId,
  TeamId,
} from './types';

interface BotMemory {
  wanderAngle: number;
  wanderTimer: number;
  splitCooldown: number;
}

export class BotBrainManager {
  private memory = new Map<string, BotMemory>();

  clear(): void {
    this.memory.clear();
  }

  prune(activeIds: Set<string>): void {
    for (const id of this.memory.keys()) {
      if (!activeIds.has(id)) {
        this.memory.delete(id);
      }
    }
  }

  computeInput(
    botId: string,
    name: string,
    skin: SkinId,
    team: TeamId,
    mode: GameMode,
    cells: MonkeyCell[],
    food: FoodPellet[],
    cacti: CactusVirus[],
    dt: number,
  ): PlayerInput {
    let mem = this.memory.get(botId);
    if (!mem) {
      mem = {
        wanderAngle: Math.random() * Math.PI * 2,
        wanderTimer: 1 + Math.random() * 2,
        splitCooldown: 2,
      };
      this.memory.set(botId, mem);
    }

    mem.wanderTimer -= dt;
    mem.splitCooldown = Math.max(0, mem.splitCooldown - dt);
    if (mem.wanderTimer <= 0) {
      mem.wanderAngle += (Math.random() - 0.5) * 1.9;
      mem.wanderTimer = 0.9 + Math.random() * 2.0;
    }

    const myCells = cells.filter((c) => c.ownerId === botId);
    if (myCells.length === 0) {
      return {
        dirX: 0,
        dirY: 0,
        split: false,
        eject: false,
        name,
        skin,
        preferredTeam: team,
        wantSpawn: true,
      };
    }

    // Focus around largest cell for smart tactical decisions
    let main = myCells[0];
    for (const c of myCells) {
      if (c.mass > main.mass) main = c;
    }
    const myR = massToRadius(main.mass);

    let steerX = 0;
    let steerY = 0;
    let dangerWeight = 0;
    let wantSplit = false;

    let bestPrey: MonkeyCell | null = null;
    let bestPreyScore = -Infinity;

    for (const other of cells) {
      if (other.ownerId === botId) continue;
      if (mode === 'teams' && other.team === team && team !== 0) continue;

      const dx = other.x - main.x;
      const dy = other.y - main.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 620 || dist < 1) continue;

      const otherR = massToRadius(other.mass);
      const surfaceDist = Math.max(10, dist - myR - otherR);

      // Threat?
      if (other.mass >= main.mass * EAT_MASS_RATIO && surfaceDist < 340) {
        const urgency = Math.pow(1 - surfaceDist / 340, 1.5) * 4.5;
        steerX -= (dx / dist) * urgency;
        steerY -= (dy / dist) * urgency;
        dangerWeight += urgency;
      } else if (main.mass >= other.mass * EAT_MASS_RATIO && surfaceDist < 420) {
        const preyScore = other.mass * 2.4 - surfaceDist * 0.45;
        if (preyScore > bestPreyScore) {
          bestPreyScore = preyScore;
          bestPrey = other;
        }
      }
    }

    // Avoid cacti if big enough to pop
    for (const cactus of cacti) {
      if (main.mass < cactus.mass * EAT_MASS_RATIO) continue;
      const dx = cactus.x - main.x;
      const dy = cactus.y - main.y;
      const dist = Math.hypot(dx, dy);
      const avoidDist = myR + massToRadius(cactus.mass) + 120;
      if (dist < avoidDist && dist > 1) {
        const push = ((avoidDist - dist) / avoidDist) * 3.8;
        steerX -= (dx / dist) * push;
        steerY -= (dy / dist) * push;
        dangerWeight += push * 0.5;
      }
    }

    // Chase prey if not actively fleeing lethal danger
    if (bestPrey && dangerWeight < 1.8) {
      const dx = bestPrey.x - main.x;
      const dy = bestPrey.y - main.y;
      const dist = Math.hypot(dx, dy) || 1;
      steerX += (dx / dist) * 2.4;
      steerY += (dy / dist) * 2.4;

      // Opportunistic split lunge!
      if (
        mem.splitCooldown <= 0 &&
        myCells.length <= 4 &&
        main.mass >= bestPrey.mass * 2.55 &&
        main.mass >= 52 &&
        dist < myR * 4.3 &&
        dist > myR * 1.4
      ) {
        wantSplit = true;
        mem.splitCooldown = 5.5 + Math.random() * 4;
      }
    } else if (dangerWeight < 0.7) {
      // Seek nearest high-value banana / cacho
      let bestFood: FoodPellet | null = null;
      let bestFoodScore = -Infinity;
      for (const f of food) {
        const dx = f.x - main.x;
        const dy = f.y - main.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > 460 * 460) continue;
        const val = f.kind === 'cacho' ? 3.2 : f.kind === 'ejected' ? 4.0 : 1.0;
        const score = val * 180 - Math.sqrt(distSq);
        if (score > bestFoodScore) {
          bestFoodScore = score;
          bestFood = f;
        }
      }
      if (bestFood) {
        const dx = bestFood.x - main.x;
        const dy = bestFood.y - main.y;
        const dist = Math.hypot(dx, dy) || 1;
        steerX += (dx / dist) * 1.6;
        steerY += (dy / dist) * 1.6;
      } else {
        steerX += Math.cos(mem.wanderAngle);
        steerY += Math.sin(mem.wanderAngle);
      }
    }

    // Soft wall avoidance
    const margin = 260;
    if (main.x < margin) steerX += ((margin - main.x) / margin) * 2.4;
    if (main.x > ARENA_SIZE - margin) steerX -= ((main.x - (ARENA_SIZE - margin)) / margin) * 2.4;
    if (main.y < margin) steerY += ((margin - main.y) / margin) * 2.4;
    if (main.y > ARENA_SIZE - margin) steerY -= ((main.y - (ARENA_SIZE - margin)) / margin) * 2.4;

    const len = Math.hypot(steerX, steerY);
    const dirX = len > 0.01 ? steerX / len : Math.cos(mem.wanderAngle);
    const dirY = len > 0.01 ? steerY / len : Math.sin(mem.wanderAngle);

    return {
      dirX,
      dirY,
      split: wantSplit,
      eject: false,
      name,
      skin,
      preferredTeam: team,
      wantSpawn: true,
    };
  }
}

export function randomBotSkin(index: number): SkinId {
  return SKINS[index % SKINS.length].id;
}
