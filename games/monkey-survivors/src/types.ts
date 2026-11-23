export type CharacterId =
  | 'chimp_clt'
  | 'madalena'
  | 'babuino_fedido'
  | 'mico_hacker'
  | 'gorila_pagodeiro';

export type WeaponId =
  | 'banana_boomerang'
  | 'stink_aura'
  | 'coconut_orbit'
  | 'wifi_lightning'
  | 'homing_slipper'
  | 'vine_whip'
  | 'peel_mine'
  | 'mango_gatling'
  | 'pix_orb'
  | 'howler_wave';

export type PassiveId =
  | 'cafe_forte'
  | 'queijo_vencido'
  | 'luva_motoboy'
  | 'roteador_5g'
  | 'ima_geladeira'
  | 'coracao_banana';

export type MetaUpgradeId =
  | 'potassio'
  | 'cafeina'
  | 'dedos_ageis'
  | 'ima_natural'
  | 'mao_pesada'
  | 'bolsa_banana';

export type EnemyKind =
  | 'boleto'
  | 'pombo_coach'
  | 'gerente_zumbi'
  | 'babuino_terno'
  | 'mosquito_dengue'
  | 'motoboy_fantasma'
  | 'fiscal_cartorio';

export type BossKind =
  | 'oswaldo_spc'
  | 'pombo_ceo'
  | 'sindico_implacavel'
  | 'leao_imposto'
  | 'ceifadora_serasa';

export type GemKind = 'green' | 'gold' | 'bunch' | 'heal' | 'magnet' | 'coin' | 'chest';

export type ProjectileKind =
  | 'boomerang'
  | 'slipper'
  | 'mango'
  | 'pix'
  | 'peel'
  | 'whip_slash'
  | 'howler_ring'
  | 'wifi_strike'
  | 'enemy_paper';

export interface CharacterDef {
  id: CharacterId;
  name: string;
  title: string;
  description: string;
  startWeapon: WeaponId;
  unlockCost: number;
  unlockHint: string;
  furColor: string;
  bellyColor: string;
  accentColor: string;
  accessory: 'badge' | 'bandana' | 'flies' | 'hoodie' | 'panama';
  maxHp: number;
  moveSpeed: number;
  damageMult: number;
  attackSpeedMult: number;
  areaMult: number;
  pickupRadius: number;
  extraProjectiles: number;
  armor: number;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  emoji: string;
  description: string;
  evolvedName: string;
  evolvedEmoji: string;
  evolvedDesc: string;
  evolvePassive: PassiveId;
  color: string;
  evolvedColor: string;
  baseDamage: number;
  baseCooldown: number;
  maxLevel: number;
  levelNotes: string[];
}

export interface PassiveDef {
  id: PassiveId;
  name: string;
  emoji: string;
  description: string;
  maxLevel: number;
  color: string;
  evolvesWeapons: WeaponId[];
}

export interface MetaUpgradeDef {
  id: MetaUpgradeId;
  name: string;
  emoji: string;
  description: string;
  maxRank: number;
  baseCost: number;
  costStep: number;
}

export interface WeaponSlot {
  id: WeaponId;
  level: number;
  evolved: boolean;
  cooldownTimer: number;
  totalDamage: number;
}

export interface PassiveSlot {
  id: PassiveId;
  level: number;
}

export interface PlayerStats {
  maxHp: number;
  moveSpeed: number;
  damageMult: number;
  cooldownMult: number;
  areaMult: number;
  projSpeedMult: number;
  pickupRadius: number;
  extraProjectiles: number;
  regenPerSec: number;
  armor: number;
  xpMult: number;
}

export interface PlayerState {
  id: string;
  name: string;
  color: string;
  charId: CharacterId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facingX: number;
  facingY: number;
  hp: number;
  maxHp: number;
  downed: boolean;
  reviveProgress: number;
  invulnTimer: number;
  hitFlash: number;
  walkPhase: number;
  weapons: WeaponSlot[];
  passives: PassiveSlot[];
  kills: number;
  inputDx: number;
  inputDy: number;
  pendingChoice: boolean;
  isLocal: boolean;
  isHost: boolean;
}

export interface EnemyEntity {
  active: boolean;
  id: number;
  kind: EnemyKind | BossKind;
  isBoss: boolean;
  isElite: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  xpValue: number;
  hitFlash: number;
  knockVx: number;
  knockVy: number;
  phase: number;
  shootTimer: number;
  slowTimer: number;
  chargeTimer: number;
  chargeDx: number;
  chargeDy: number;
}

export interface ProjectileEntity {
  active: boolean;
  id: number;
  ownerId: string;
  kind: ProjectileKind;
  weaponId: WeaponId;
  evolved: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  pierce: number;
  life: number;
  maxLife: number;
  angle: number;
  spin: number;
  returning: boolean;
  targetEnemyId: number;
  hitIds: Set<number>;
  color: string;
  armed: boolean;
  chainLeft: number;
}

export interface PickupEntity {
  active: boolean;
  id: number;
  kind: GemKind;
  x: number;
  y: number;
  value: number;
  magnetizedToId: string | null;
  bobPhase: number;
}

export interface VisualEffect {
  active: boolean;
  kind: 'lightning' | 'slash' | 'ring' | 'explosion' | 'stink_pulse';
  x: number;
  y: number;
  x2: number;
  y2: number;
  radius: number;
  angle: number;
  life: number;
  maxLife: number;
  color: string;
}

export interface ParticleEntity {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
  shape: 'circle' | 'rect' | 'banana';
  rot: number;
  vrot: number;
}

export interface FloatingTextEntity {
  active: boolean;
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  size: number;
  life: number;
  maxLife: number;
  crit: boolean;
}

export interface UpgradeCardOption {
  kind: 'weapon' | 'passive' | 'evolve' | 'bonus';
  id: string;
  title: string;
  subtitle: string;
  description: string;
  emoji: string;
  color: string;
  tag: string;
  currentLevel: number;
  nextLevel: number;
  synergyHint?: string;
}

export interface MetaProgress {
  coins: number;
  unlockedChars: CharacterId[];
  upgrades: Record<MetaUpgradeId, number>;
  totalKills: number;
  totalRuns: number;
  bestTimeSec: number;
  bestLevel: number;
  bossesDefeated: number;
  victories: number;
}

export type GameScreen = 'title' | 'playing' | 'levelup' | 'chest' | 'paused' | 'gameover' | 'victory';

// Compact P2P Network Messages
export type NetMessage =
  | {
      type: 'input';
      dx: number;
      dy: number;
      charId: CharacterId;
      name: string;
    }
  | {
      type: 'pick_card';
      option: UpgradeCardOption;
    }
  | {
      type: 'request_start';
    }
  | {
      type: 'state';
      elapsed: number;
      level: number;
      xp: number;
      xpToNext: number;
      kills: number;
      coinsEarned: number;
      screen: GameScreen;
      bannerText: string;
      bannerTimer: number;
      players: Array<{
        id: string;
        name: string;
        color: string;
        charId: CharacterId;
        x: number;
        y: number;
        fx: number;
        fy: number;
        hp: number;
        maxHp: number;
        downed: boolean;
        revive: number;
        flash: number;
        kills: number;
        pending: boolean;
        weapons: Array<{ id: WeaponId; lvl: number; evo: boolean }>;
        passives: Array<{ id: PassiveId; lvl: number }>;
      }>;
      enemies: Array<{
        id: number;
        k: EnemyKind | BossKind;
        b: number;
        e: number;
        x: number;
        y: number;
        hp: number;
        mhp: number;
        fl: number;
        r: number;
      }>;
      projectiles: Array<{
        id: number;
        k: ProjectileKind;
        w: WeaponId;
        ev: number;
        x: number;
        y: number;
        a: number;
        r: number;
        c: string;
      }>;
      pickups: Array<{
        id: number;
        k: GemKind;
        x: number;
        y: number;
      }>;
      vfx: Array<{
        k: VisualEffect['kind'];
        x: number;
        y: number;
        x2: number;
        y2: number;
        r: number;
        a: number;
        l: number;
        ml: number;
        c: string;
      }>;
    }
  | {
      type: 'draft_cards';
      targetPlayerId: string;
      level: number;
      cards: UpgradeCardOption[];
    }
  | {
      type: 'chest_reward';
      targetPlayerId: string;
      title: string;
      cards: UpgradeCardOption[];
      coins: number;
    }
  | {
      type: 'sfx_event';
      sound: 'levelup' | 'boss' | 'chest' | 'revive' | 'hurt';
      msg?: string;
    };
