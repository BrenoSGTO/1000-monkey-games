import { SeededRandom } from './prng';
import {
  JETPACK_HEIGHT,
  TRAIN_HEIGHT,
  type BananaCoin,
  type LaneIndex,
  type Obstacle,
  type PowerupItem,
  type PowerupKind,
} from './types';

const TRAIN_PALETTES = [
  { color: '#dc2626', accent: '#fef08a', graffiti: 'BANANA' },
  { color: '#0284c7', accent: '#38bdf8', graffiti: 'CIPÓ 100%' },
  { color: '#16a34a', accent: '#fde047', graffiti: 'SELVA' },
  { color: '#9333ea', accent: '#f472b6', graffiti: 'MACACO' },
  { color: '#ea580c', accent: '#fed7aa', graffiti: 'GRAU' },
];

const POWERUP_KINDS: PowerupKind[] = ['jetpack', 'sneakers', 'magnet', 'multiplier'];

export class TrackGenerator {
  private rng: SeededRandom;
  private nextEntityId = 1;
  private cursorZ = 48;

  constructor(seed: number) {
    this.rng = new SeededRandom(seed);
  }

  reset(seed: number): void {
    this.rng = new SeededRandom(seed);
    this.nextEntityId = 1;
    this.cursorZ = 48;
  }

  /**
   * Ensures obstacles, coins, and powerups are generated up to targetZ.
   */
  generateUntil(
    targetZ: number,
    obstacles: Obstacle[],
    coins: BananaCoin[],
    powerups: PowerupItem[],
  ): void {
    while (this.cursorZ < targetZ) {
      this.spawnNextChunk(obstacles, coins, powerups);
    }
  }

  private spawnCoinLine(
    coins: BananaCoin[],
    lane: LaneIndex,
    startZ: number,
    count: number,
    spacing: number,
    y = 0.65,
    arcHeight = 0,
  ): void {
    for (let i = 0; i < count; i++) {
      const t = count > 1 ? i / (count - 1) : 0.5;
      const yOff = arcHeight > 0 ? Math.sin(t * Math.PI) * arcHeight : 0;
      coins.push({
        id: this.nextEntityId++,
        lane,
        z: startZ + i * spacing,
        y: y + yOff,
        collected: false,
      });
    }
  }

  private maybeSpawnPowerup(
    powerups: PowerupItem[],
    lane: LaneIndex,
    z: number,
    y = 0.95,
    chance = 0.24,
  ): void {
    if (this.rng.next() > chance) return;
    const kind = this.rng.pick(POWERUP_KINDS);
    powerups.push({
      id: this.nextEntityId++,
      kind,
      lane,
      z,
      y,
      collected: false,
    });
  }

  private spawnNextChunk(
    obstacles: Obstacle[],
    coins: BananaCoin[],
    powerups: PowerupItem[],
  ): void {
    const z = this.cursorZ;
    const difficulty = Math.min(1, z / 1500);
    const roll = this.rng.next();

    if (roll < 0.24) {
      // Pattern 1: Single/Double Barriers (Jump or Roll) + Banana line
      const lanes: LaneIndex[] = [0, 1, 2];
      const openLane = this.rng.pick(lanes);
      const count = difficulty > 0.35 && this.rng.next() < 0.6 ? 2 : 1;

      for (const lane of lanes) {
        if (lane === openLane && count === 2) continue;
        if (count === 1 && lane !== openLane) continue;
        const kind = this.rng.next() < 0.52 ? 'barrier_low' : 'barrier_high';
        obstacles.push({
          id: this.nextEntityId++,
          kind,
          lane,
          z,
          length: 0.7,
          rampLength: 0,
          speed: 0,
          color: kind === 'barrier_low' ? '#f97316' : '#ef4444',
          accent: '#fde047',
          graffiti: kind === 'barrier_low' ? 'OBRA' : 'ABAIXA!',
        });
        if (kind === 'barrier_low') {
          this.spawnCoinLine(coins, lane, z - 2.5, 3, 2.5, 0.7, 1.35);
        } else {
          this.spawnCoinLine(coins, lane, z - 2, 3, 2.2, 0.45, 0);
        }
      }
      this.spawnCoinLine(coins, openLane, z - 2, 4, 3.0, 0.65);
      this.maybeSpawnPowerup(powerups, openLane, z + 11, 0.95, 0.2);
      this.cursorZ += 24 - difficulty * 4;
    } else if (roll < 0.52) {
      // Pattern 2: Ramp Train! Run up ramp onto train roof, optionally chain a second car
      const rampLane = this.rng.pick([0, 1, 2] as const);
      const pal = this.rng.pick(TRAIN_PALETTES);
      const trainLen = 14;
      const rampLen = 5.5;
      obstacles.push({
        id: this.nextEntityId++,
        kind: 'train_ramp',
        lane: rampLane,
        z,
        length: rampLen + trainLen,
        rampLength: rampLen,
        speed: 0,
        color: pal.color,
        accent: pal.accent,
        graffiti: pal.graffiti,
      });
      // Coins climbing the ramp & across the roof
      for (let i = 0; i < 4; i++) {
        const frac = (i + 0.5) / 4;
        coins.push({
          id: this.nextEntityId++,
          lane: rampLane,
          z: z + frac * rampLen,
          y: frac * TRAIN_HEIGHT + 0.6,
          collected: false,
        });
      }
      this.spawnCoinLine(coins, rampLane, z + rampLen + 1.5, 5, 2.4, TRAIN_HEIGHT + 0.65);

      // Maybe add a second train in another lane or a barrier
      const otherLanes = ([0, 1, 2] as LaneIndex[]).filter((l) => l !== rampLane);
      const sideLane = this.rng.pick(otherLanes);
      if (this.rng.next() < 0.72) {
        const pal2 = this.rng.pick(TRAIN_PALETTES);
        obstacles.push({
          id: this.nextEntityId++,
          kind: 'train_static',
          lane: sideLane,
          z: z + 4,
          length: 14,
          rampLength: 0,
          speed: 0,
          color: pal2.color,
          accent: pal2.accent,
          graffiti: pal2.graffiti,
        });
        this.spawnCoinLine(coins, sideLane, z + 5.5, 4, 2.6, TRAIN_HEIGHT + 0.65);
      }

      // Bonus powerup on the train roof!
      this.maybeSpawnPowerup(powerups, rampLane, z + rampLen + 12.5, TRAIN_HEIGHT + 0.95, 0.34);

      // Optional chained roof jump to a second static car
      if (this.rng.next() < 0.5 + difficulty * 0.25) {
        const pal3 = this.rng.pick(TRAIN_PALETTES);
        const gapZ = z + rampLen + trainLen + 3.2;
        obstacles.push({
          id: this.nextEntityId++,
          kind: 'train_static',
          lane: rampLane,
          z: gapZ,
          length: 13,
          rampLength: 0,
          speed: 0,
          color: pal3.color,
          accent: pal3.accent,
          graffiti: pal3.graffiti,
        });
        this.spawnCoinLine(coins, rampLane, gapZ + 1.5, 4, 2.5, TRAIN_HEIGHT + 0.65);
        this.cursorZ += 46;
      } else {
        this.cursorZ += 31;
      }
    } else if (roll < 0.78) {
      // Pattern 3: Moving Train(s) oncoming! Always leave at least 1 clear lane
      const safeLane = this.rng.pick([0, 1, 2] as const);
      const otherLanes = ([0, 1, 2] as LaneIndex[]).filter((l) => l !== safeLane);
      const numTrains = difficulty > 0.25 && this.rng.next() < 0.62 ? 2 : 1;
      const chosenLanes = numTrains === 2 ? otherLanes : [this.rng.pick(otherLanes)];

      for (let i = 0; i < chosenLanes.length; i++) {
        const lane = chosenLanes[i];
        const pal = this.rng.pick(TRAIN_PALETTES);
        obstacles.push({
          id: this.nextEntityId++,
          kind: 'train_moving',
          lane,
          z: z + 26 + i * 11,
          length: 15,
          rampLength: 0,
          speed: -(10 + difficulty * 7),
          color: pal.color,
          accent: pal.accent,
          graffiti: 'EXPRESSO',
        });
      }

      // Put a barrier or coin line in safe lane
      if (this.rng.next() < 0.55) {
        obstacles.push({
          id: this.nextEntityId++,
          kind: this.rng.next() < 0.5 ? 'barrier_low' : 'barrier_high',
          lane: safeLane,
          z: z + 10,
          length: 0.7,
          rampLength: 0,
          speed: 0,
          color: '#f59e0b',
          accent: '#fef08a',
          graffiti: 'DESVIO',
        });
      }
      this.spawnCoinLine(coins, safeLane, z + 2, 6, 3.0, 0.68);
      this.maybeSpawnPowerup(powerups, safeLane, z + 21, 0.95, 0.25);
      this.cursorZ += 33;
    } else {
      // Pattern 4: Slalom & Rhythm Combo (3 staggered obstacles across lanes)
      const seq: LaneIndex[] = [0, 1, 2];
      if (this.rng.next() < 0.5) seq.reverse();
      for (let i = 0; i < 3; i++) {
        const blockLane = seq[i];
        const freeLane = seq[(i + 1) % 3];
        const zStep = z + i * 11;
        obstacles.push({
          id: this.nextEntityId++,
          kind: i === 1 ? 'barrier_full' : i === 0 ? 'barrier_low' : 'barrier_high',
          lane: blockLane,
          z: zStep,
          length: 0.8,
          rampLength: 0,
          speed: 0,
          color: i === 1 ? '#dc2626' : '#ea580c',
          accent: '#fde047',
          graffiti: i === 1 ? 'PARE!' : 'CUIDADO',
        });
        this.spawnCoinLine(coins, freeLane, zStep, 3, 2.4, 0.65);
      }
      // Bonus sky coins for active Jetpack players!
      const skyLane = this.rng.pick([0, 1, 2] as const);
      this.spawnCoinLine(coins, skyLane, z + 4, 7, 3.2, JETPACK_HEIGHT);
      this.maybeSpawnPowerup(powerups, seq[2], z + 26, 0.95, 0.28);
      this.cursorZ += 36;
    }
  }
}

export function spawnJetpackSkyCoins(
  coins: BananaCoin[],
  startZ: number,
  seed: number,
): void {
  const rng = new SeededRandom(seed ^ Math.floor(startZ));
  let idBase = 900000 + Math.floor(startZ * 10);
  let lane: LaneIndex = 1;
  for (let i = 0; i < 28; i++) {
    if (i % 6 === 0) {
      lane = rng.pick([0, 1, 2] as const);
    }
    coins.push({
      id: idBase++,
      lane,
      z: startZ + 8 + i * 4.2,
      y: JETPACK_HEIGHT,
      collected: false,
      isSpray: i % 9 === 8,
    });
  }
}
