export type GameMode = 'solo' | 'coop' | 'versus';

export type ShopTab = 'buildings' | 'upgrades' | 'achievements' | 'prestige';

export type ChaosEventKind =
  | 'fever_7x'
  | 'click_777x'
  | 'banana_rain'
  | 'intern_strike'
  | 'tax_gorilla'
  | 'googly_surge';

export interface BuildingDef {
  id: string;
  name: string;
  emoji: string;
  baseCost: number;
  baseBps: number;
  desc: string;
}

export type UpgradeEffect =
  | { kind: 'clickMult'; mult: number }
  | { kind: 'clickAddBpsPercent'; percent: number }
  | { kind: 'buildingMult'; buildingId: string; mult: number }
  | { kind: 'globalMult'; mult: number }
  | { kind: 'goldenMult'; mult: number }
  | { kind: 'comboBoost'; bonusPerLevel: number };

export interface UpgradeDef {
  id: string;
  name: string;
  emoji: string;
  cost: number;
  desc: string;
  unlockRequirement?: {
    buildingId?: string;
    minCount?: number;
    minClicks?: number;
    minLifetime?: number;
  };
  effect: UpgradeEffect;
}

export interface AchievementDef {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  check: (state: GameState) => boolean;
}

export interface ActiveEvent {
  kind: ChaosEventKind;
  label: string;
  remaining: number;
  duration: number;
  hp: number;
  maxHp: number;
  x: number; // normalized 0..1 on canvas
  y: number;
}

export interface GoldenBanana {
  id: string;
  nx: number; // normalized 0..1
  ny: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  isRainbow: boolean;
}

export interface RainBanana {
  id: string;
  nx: number;
  ny: number;
  vy: number;
  rot: number;
  vrot: number;
  value: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  kind: 'circle' | 'banana' | 'star' | 'confetti';
  rot: number;
  vrot: number;
}

export interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  size: number;
  life: number;
  maxLife: number;
}

export interface ClickRipple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  color: string;
}

export interface RemoteCursor {
  id: string;
  name: string;
  color: string;
  nx: number;
  ny: number;
  lastSeen: number;
  clickFlash: number;
}

export interface RaceEntry {
  id: string;
  name: string;
  color: string;
  bananas: number;
  bps: number;
  evolutionLevel: number;
  finishedAt?: number;
}

export interface GameState {
  mode: GameMode;
  bananas: number;
  runBananas: number;
  lifetimeBananas: number;
  totalClicks: number;
  goldenClicked: number;
  chaosDefeated: number;
  prestigeChips: number;
  reincarnations: number;
  buildings: Record<string, number>;
  upgrades: string[];
  achievements: string[];
  comboCount: number;
  comboTimer: number;
  activeEvent: ActiveEvent | null;
  goldenBanana: GoldenBanana | null;
  rainBananas: RainBanana[];
  nextGoldenIn: number;
  nextChaosIn: number;
  raceGoal: number;
  raceWinnerId: string | null;
  raceStartedAt: number;
}

export interface SavedEmpire {
  version: 1;
  bananas: number;
  runBananas: number;
  lifetimeBananas: number;
  totalClicks: number;
  goldenClicked: number;
  chaosDefeated: number;
  prestigeChips: number;
  reincarnations: number;
  buildings: Record<string, number>;
  upgrades: string[];
  achievements: string[];
  savedAt: number;
}

export type NetMessage =
  | {
      kind: 'cursor';
      nx: number;
      ny: number;
    }
  | {
      kind: 'coop_click';
      nx: number;
      ny: number;
      power: number;
      isCrit: boolean;
    }
  | {
      kind: 'coop_buy_building';
      buildingId: string;
      amount: number;
    }
  | {
      kind: 'coop_buy_upgrade';
      upgradeId: string;
    }
  | {
      kind: 'coop_hit_golden';
      goldenId: string;
    }
  | {
      kind: 'coop_hit_chaos';
    }
  | {
      kind: 'coop_hit_rain';
      rainId: string;
    }
  | {
      kind: 'coop_snapshot';
      bananas: number;
      runBananas: number;
      lifetimeBananas: number;
      totalClicks: number;
      goldenClicked: number;
      chaosDefeated: number;
      prestigeChips: number;
      reincarnations: number;
      buildings: Record<string, number>;
      upgrades: string[];
      achievements: string[];
      activeEvent: ActiveEvent | null;
      goldenBanana: GoldenBanana | null;
    }
  | {
      kind: 'start_match';
      mode: GameMode;
      raceGoal: number;
    }
  | {
      kind: 'versus_progress';
      bananas: number;
      bps: number;
      evolutionLevel: number;
      finishedAt?: number;
    }
  | {
      kind: 'versus_win';
      winnerId: string;
      winnerName: string;
      elapsedSec: number;
    };
