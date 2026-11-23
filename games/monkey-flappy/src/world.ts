import {
  CITY_SIGNS,
  PLAYABLE_HEIGHT,
  getBiomeForScore,
  type BananaCoin,
  type BiomeId,
  type FlyingHazard,
  type FlyerKind,
  type ObstacleColumn,
  type PowerUpOrb,
  type PowerUpType,
} from './types';

function createMulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class WorldGenerator {
  private rng: () => number;
  private nextSpawnX: number;
  private columnIndex = 0;
  private entityId = 1;
  private lastGapY = PLAYABLE_HEIGHT * 0.5;
  private cooldownPowerup = 2;

  public columns: ObstacleColumn[] = [];
  public flyers: FlyingHazard[] = [];
  public coins: BananaCoin[] = [];
  public powerUps: PowerUpOrb[] = [];

  constructor(seed: number) {
    this.rng = createMulberry32(seed);
    this.nextSpawnX = 620;
  }

  private randRange(min: number, max: number): number {
    return min + this.rng() * (max - min);
  }

  public ensureGenerated(untilWorldX: number): void {
    while (this.nextSpawnX < untilWorldX + 900) {
      this.spawnNextSection();
    }
  }

  public pruneBehind(minWorldX: number): void {
    const cutoff = minWorldX - 320;
    this.columns = this.columns.filter((c) => c.x + c.width > cutoff);
    this.flyers = this.flyers.filter((f) => f.x + f.radius > cutoff);
    this.coins = this.coins.filter((c) => !c.collected && c.x + c.radius > cutoff);
    this.powerUps = this.powerUps.filter((p) => !p.collected && p.x + p.radius > cutoff);
  }

  private spawnNextSection(): void {
    const idx = this.columnIndex++;
    const biome: BiomeId = getBiomeForScore(idx);
    const difficulty = Math.min(1, idx / 42);

    const gapHeight = Math.round(176 - difficulty * 42);
    const minY = 76 + gapHeight * 0.5;
    const maxY = PLAYABLE_HEIGHT - 76 - gapHeight * 0.5;

    const maxStep = 175 + difficulty * 45;
    const rawGapY = this.randRange(
      Math.max(minY, this.lastGapY - maxStep),
      Math.min(maxY, this.lastGapY + maxStep),
    );
    const gapY = Math.max(minY, Math.min(maxY, rawGapY));
    this.lastGapY = gapY;

    const canOscillate = idx >= 6 && this.rng() < 0.25 + difficulty * 0.4;
    const oscAmp = canOscillate ? this.randRange(16, 36 + difficulty * 14) : 0;
    const oscSpeed = canOscillate ? this.randRange(1.4, 2.5) : 0;

    const colWidth = biome === 'space' ? 68 : 74;
    const col: ObstacleColumn = {
      id: this.entityId++,
      x: this.nextSpawnX,
      width: colWidth,
      gapY,
      baseGapY: gapY,
      gapHeight,
      oscAmp,
      oscSpeed,
      oscPhase: this.randRange(0, Math.PI * 2),
      biome,
      passedBy: new Set<number>(),
      nearMissedBy: new Set<number>(),
      destroyed: false,
      vineOffset: this.randRange(0, 1),
      signText: CITY_SIGNS[Math.floor(this.rng() * CITY_SIGNS.length)],
    };
    this.columns.push(col);

    // Spacing between columns
    const spacing = Math.round(295 - difficulty * 35 + this.randRange(-14, 22));
    const midX = this.nextSpawnX + colWidth * 0.5 + spacing * 0.5;

    // Banana coins inside gap or in arc between columns
    if (this.rng() < 0.72) {
      if (this.rng() < 0.5) {
        // Vertical or curved trio near gap
        this.coins.push({
          id: this.entityId++,
          x: this.nextSpawnX + colWidth * 0.5,
          y: gapY + this.randRange(-22, 22),
          radius: 14,
          collected: false,
          bobPhase: this.randRange(0, Math.PI * 2),
        });
      } else {
        // Arc of 3 bananas between columns
        const arcCenterY = this.randRange(110, PLAYABLE_HEIGHT - 120);
        const arcDir = this.rng() < 0.5 ? -1 : 1;
        for (let k = -1; k <= 1; k++) {
          this.coins.push({
            id: this.entityId++,
            x: midX + k * 34,
            y: Math.max(60, Math.min(PLAYABLE_HEIGHT - 60, arcCenterY + arcDir * (k * k - 1) * 20)),
            radius: 14,
            collected: false,
            bobPhase: (k + 1) * 0.8,
          });
        }
      }
    }

    // Power-up orb between columns
    this.cooldownPowerup--;
    if (this.cooldownPowerup <= 0 && this.rng() < 0.34) {
      const roll = this.rng();
      const type: PowerUpType = roll < 0.36 ? 'magnet' : roll < 0.7 ? 'shield' : 'turbo';
      this.powerUps.push({
        id: this.entityId++,
        type,
        x: midX,
        y: this.randRange(100, PLAYABLE_HEIGHT - 110),
        radius: 19,
        collected: false,
        phase: this.randRange(0, Math.PI * 2),
      });
      this.cooldownPowerup = 4;
    }

    // Flying hazards (angry birds, coconut helicopters, space UFOs)
    if (idx >= 3 && this.rng() < 0.36 + difficulty * 0.28) {
      let kind: FlyerKind = 'angry_bird';
      if (biome === 'city') {
        kind = this.rng() < 0.65 ? 'coconut_heli' : 'angry_bird';
      } else if (biome === 'space') {
        kind = this.rng() < 0.65 ? 'space_ufo' : 'coconut_heli';
      } else if (idx >= 7 && this.rng() < 0.3) {
        kind = 'coconut_heli';
      }

      const fy = this.randRange(90, PLAYABLE_HEIGHT - 110);
      this.flyers.push({
        id: this.entityId++,
        kind,
        x: midX + this.randRange(20, 70),
        y: fy,
        baseY: fy,
        radius: kind === 'coconut_heli' ? 21 : 17,
        speedBonus: kind === 'angry_bird' ? this.randRange(55, 105) : this.randRange(25, 65),
        bobAmp: kind === 'coconut_heli' ? 38 : 24,
        bobSpeed: kind === 'angry_bird' ? 4.2 : 2.6,
        phase: this.randRange(0, Math.PI * 2),
        destroyed: false,
        nearMissedBy: new Set<number>(),
      });
    }

    this.nextSpawnX += spacing;
  }
}
