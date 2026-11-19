import { reportGameScore } from '@monkey-slop/sdk';
import {
  ASPIRATIONS_POOL,
  CAREERS,
  FURNITURE_CATALOG,
  FUR_PALETTES,
  RANDOM_MONKEY_NAMES,
  SKILL_LABELS,
} from './catalog';
import {
  TILE_SIZE,
  calculateHouseComfort,
  calculateHouseValue,
  canPlaceFurniture,
  findNearestWalkableTile,
  findPath,
  findStandTileNearFurniture,
  isWalkableFloor,
} from './house';
import { simsAudio } from './sfx';
import type {
  AccessoryId,
  Aspiration,
  FireHazard,
  FloatingText,
  FurnitureKind,
  MonkeySim,
  NeedKey,
  NeedsState,
  Particle,
  PlacedFurniture,
  PuddleHazard,
  QueuedAction,
  SimSpeed,
  SkillKey,
  SocialActionKind,
  TraitId,
} from './types';

export interface SimCallbacks {
  onToast?: (msg: string, tone?: 'banana' | 'chaos' | 'info') => void;
  onBroadcastFire?: (fire: FireHazard, actorName: string) => void;
  onExtinguishFire?: (fireId: string, actorName: string) => void;
  onSpawnPuddle?: (puddle: PuddleHazard) => void;
  onCleanPuddle?: (puddleId: string, actorName: string) => void;
  onToggleJbl?: (playing: boolean, actorName: string) => void;
  onSocialEvent?: (
    fromId: string,
    fromName: string,
    targetId: string,
    action: SocialActionKind,
    amount?: number,
  ) => void;
  onMoneyDelta?: (delta: number, reason: string) => void;
}

export class GameSimulation {
  public day = 1;
  public minuteOfDay = 8 * 60; // 08:00
  public speed: SimSpeed = 1;
  public money = 520;
  public jblPlaying = false;
  public furniture: PlacedFurniture[] = [];
  public monkeys: MonkeySim[] = [];
  public activeMonkeyId = '';
  public fires: FireHazard[] = [];
  public puddles: PuddleHazard[] = [];
  public particles: Particle[] = [];
  public floatingTexts: FloatingText[] = [];
  public aspirations: Aspiration[] = [];
  public completedAspirationIds = new Set<string>();
  public eventBanner = 'Bem-vindo à Casa na Árvore! Clique nos móveis ou no chão para começar.';
  public eventBannerTimer = 8;

  public score = 0;
  public firesExtinguished = 0;
  public puddlesCleaned = 0;
  public mealsCooked = 0;
  public pranksPulled = 0;
  public dancesDone = 0;

  public isOnline = false;
  public isHost = true;
  public localPeerId: string | null = null;

  private randomEventTimer = 42;
  private jblComplainCooldown = 0;
  private particleAccum = 0;
  private callbacks: SimCallbacks;

  constructor(initialFurniture: PlacedFurniture[], callbacks: SimCallbacks = {}) {
    this.furniture = initialFurniture;
    this.callbacks = callbacks;
    this.refreshAspirations();
  }

  public getActiveMonkey(): MonkeySim | undefined {
    return this.monkeys.find((m) => m.id === this.activeMonkeyId) ?? this.monkeys[0];
  }

  public getLocalControllableMonkeys(): MonkeySim[] {
    if (this.isOnline) {
      return this.monkeys.filter((m) => m.ownerPeerId === this.localPeerId);
    }
    return this.monkeys.filter((m) => m.isLocalControl);
  }

  public createMonkey(opts: {
    id: string;
    name: string;
    ownerPeerId: string | null;
    isNpc: boolean;
    isLocalControl: boolean;
    furColor: string;
    bellyColor: string;
    accessory: AccessoryId;
    trait: TraitId;
    gx: number;
    gy: number;
  }): MonkeySim {
    const safe = findNearestWalkableTile(opts.gx, opts.gy, this.furniture);
    return {
      id: opts.id,
      name: opts.name,
      ownerPeerId: opts.ownerPeerId,
      isNpc: opts.isNpc,
      isLocalControl: opts.isLocalControl,
      appearance: {
        furColor: opts.furColor,
        bellyColor: opts.bellyColor,
        accessory: opts.accessory,
      },
      trait: opts.trait,
      x: (safe.gx + 0.5) * TILE_SIZE,
      y: (safe.gy + 0.5) * TILE_SIZE,
      vx: 0,
      vy: 0,
      facing: Math.PI / 2,
      path: [],
      queue: [],
      needs: {
        hunger: 76,
        energy: 82,
        hygiene: 84,
        bladder: 78,
        fun: 72,
        social: 70,
      },
      skills: { cooking: 1, charisma: 1, handiness: 1, gamer: 1 },
      skillXp: { cooking: 0, charisma: 0, handiness: 0, gamer: 0 },
      careerLevel: 0,
      careerProgress: 0,
      pose: 'idle',
      thoughtIcon: '🍌',
      thoughtTimer: 0,
      speechText: '',
      speechTimer: 0,
      embarrassedTimer: 0,
      passOutTimer: 0,
      stinkTimer: 0,
      relations: {},
      aiCooldown: 1 + Math.random() * 2,
      animPhase: Math.random() * Math.PI * 2,
      offsiteReturnTimer: 0,
      lastUpdatedAt: Date.now(),
    };
  }

  public spawnHousehold(mainMonkey: MonkeySim): void {
    this.monkeys = [mainMonkey];
    this.activeMonkeyId = mainMonkey.id;

    // Add 2 colorful roommates (controllable in Solo/Local Family mode!)
    const usedNames = new Set([mainMonkey.name]);
    const pickName = (fallback: string) => {
      const candidate = RANDOM_MONKEY_NAMES.find((n) => !usedNames.has(n)) ?? fallback;
      usedNames.add(candidate);
      return candidate;
    };

    const p2 = FUR_PALETTES[1];
    const p3 = FUR_PALETTES[4];

    const rm1 = this.createMonkey({
      id: 'npc-beto',
      name: pickName('Beto Soneca'),
      ownerPeerId: null,
      isNpc: true,
      isLocalControl: true,
      furColor: p2.fur,
      bellyColor: p2.belly,
      accessory: 'cap',
      trait: 'lazy',
      gx: 9,
      gy: 4,
    });
    const rm2 = this.createMonkey({
      id: 'npc-juju',
      name: pickName('Juju Pancadão'),
      ownerPeerId: null,
      isNpc: true,
      isLocalControl: true,
      furColor: p3.fur,
      bellyColor: p3.belly,
      accessory: 'headset',
      trait: 'party',
      gx: 12,
      gy: 4,
    });

    this.monkeys.push(rm1, rm2);
  }

  public refreshAspirations(): void {
    const available = ASPIRATIONS_POOL.filter((a) => !this.completedAspirationIds.has(a.id));
    while (this.aspirations.length < 3 && available.length > 0) {
      const next = available.find((a) => !this.aspirations.some((cur) => cur.id === a.id));
      if (!next) break;
      this.aspirations.push(next);
    }
  }

  public addFloatingText(x: number, y: number, text: string, color = '#fef08a'): void {
    this.floatingTexts.push({
      x,
      y,
      vy: -26,
      text,
      color,
      life: 1.8,
      maxLife: 1.8,
    });
  }

  public spawnParticles(
    x: number,
    y: number,
    count: number,
    color: string,
    emoji?: string,
    speed = 45,
  ): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = (0.3 + Math.random() * 0.7) * speed;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 14,
        y: y + (Math.random() - 0.5) * 14,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 20,
        life: 0.7 + Math.random() * 0.6,
        maxLife: 1.3,
        size: 4 + Math.random() * 4,
        color,
        emoji,
      });
    }
  }

  public enqueueWalk(monkey: MonkeySim, gx: number, gy: number, clearOthers = true): void {
    if (!isWalkableFloor(gx, gy)) return;
    const action: QueuedAction = {
      id: `act-${Math.random().toString(36).slice(2, 8)}`,
      targetType: 'walk',
      label: 'Andar até aqui',
      emoji: '🐾',
      targetGx: gx,
      targetGy: gy,
      durationSec: 0.1,
      elapsedSec: 0,
      started: false,
    };
    this.pushAction(monkey, action, clearOthers);
  }

  public enqueueFurnitureInteraction(
    monkey: MonkeySim,
    item: PlacedFurniture,
    interactionId: string,
  ): void {
    const def = FURNITURE_CATALOG[item.kind];
    const inter = def.interactions.find((i) => i.id === interactionId);
    if (!inter) return;

    const mgx = Math.floor(monkey.x / TILE_SIZE);
    const mgy = Math.floor(monkey.y / TILE_SIZE);
    const stand = findStandTileNearFurniture(mgx, mgy, item, this.furniture);
    if (!stand) {
      this.addFloatingText(monkey.x, monkey.y - 36, '🚫 Caminho bloqueado!', '#fca5a5');
      return;
    }

    const action: QueuedAction = {
      id: `act-${Math.random().toString(36).slice(2, 8)}`,
      targetType: 'furniture',
      label: inter.label,
      emoji: inter.emoji,
      targetGx: stand.gx,
      targetGy: stand.gy,
      furnitureId: item.id,
      interactionId: inter.id,
      durationSec: inter.durationSec,
      elapsedSec: 0,
      started: false,
    };
    this.pushAction(monkey, action, false);
  }

  public enqueueSocial(monkey: MonkeySim, target: MonkeySim, socialKind: SocialActionKind): void {
    const tgx = Math.floor(target.x / TILE_SIZE);
    const tgy = Math.floor(target.y / TILE_SIZE);
    const stand = findNearestWalkableTile(tgx, tgy, this.furniture);

    const labels: Record<SocialActionKind, { label: string; emoji: string; dur: number }> = {
      talk: { label: `Conversar c/ ${target.name}`, emoji: '💬', dur: 4 },
      joke: { label: `Piada p/ ${target.name}`, emoji: '😂', dur: 4 },
      dance: { label: `Dançar c/ ${target.name}`, emoji: '💃', dur: 5 },
      gift: { label: `Presentear ${target.name}`, emoji: '🎁', dur: 3 },
      prank: { label: `Peça em ${target.name}`, emoji: '🍌', dur: 3.5 },
      fight: { label: `Brigar c/ ${target.name}`, emoji: '🤬', dur: 4 },
    };
    const meta = labels[socialKind];

    if (socialKind === 'gift' && this.money < 25) {
      this.addFloatingText(monkey.x, monkey.y - 38, 'Sem B$ 25 pro presente!', '#fca5a5');
      return;
    }

    this.pushAction(
      monkey,
      {
        id: `act-${Math.random().toString(36).slice(2, 8)}`,
        targetType: 'monkey',
        label: meta.label,
        emoji: meta.emoji,
        targetGx: stand.gx,
        targetGy: stand.gy,
        targetMonkeyId: target.id,
        socialKind,
        durationSec: meta.dur,
        elapsedSec: 0,
        started: false,
      },
      false,
    );
  }

  public enqueueExtinguishFire(monkey: MonkeySim, fire: FireHazard): void {
    const stand = findNearestWalkableTile(fire.gx, fire.gy, this.furniture);
    this.pushAction(
      monkey,
      {
        id: `act-${Math.random().toString(36).slice(2, 8)}`,
        targetType: 'fire',
        label: 'Apagar Incêndio!',
        emoji: '🧯',
        targetGx: stand.gx,
        targetGy: stand.gy,
        hazardId: fire.id,
        durationSec: 3.5,
        elapsedSec: 0,
        started: false,
      },
      true,
    );
  }

  public enqueueCleanPuddle(monkey: MonkeySim, puddle: PuddleHazard): void {
    const stand = findNearestWalkableTile(puddle.gx, puddle.gy, this.furniture);
    this.pushAction(
      monkey,
      {
        id: `act-${Math.random().toString(36).slice(2, 8)}`,
        targetType: 'puddle',
        label: 'Limpar Poça Suspeita',
        emoji: '🧽',
        targetGx: stand.gx,
        targetGy: stand.gy,
        hazardId: puddle.id,
        durationSec: 3.2,
        elapsedSec: 0,
        started: false,
      },
      false,
    );
  }

  public enqueueGoToWork(monkey: MonkeySim): void {
    if (monkey.pose === 'working_away') return;
    if (monkey.needs.energy < 15) {
      this.addFloatingText(monkey.x, monkey.y - 40, '⚡ Exausto demais pra trabalhar!', '#fca5a5');
      return;
    }
    const career = CAREERS[Math.min(CAREERS.length - 1, monkey.careerLevel)];
    this.pushAction(
      monkey,
      {
        id: `act-${Math.random().toString(36).slice(2, 8)}`,
        targetType: 'work_offsite',
        label: `Trabalhar (${career.title})`,
        emoji: '💼',
        targetGx: 9,
        targetGy: 10,
        durationSec: career.durationSec,
        elapsedSec: 0,
        started: false,
      },
      true,
    );
  }

  private pushAction(monkey: MonkeySim, action: QueuedAction, clearOthers: boolean): void {
    if (monkey.passOutTimer > 0) {
      this.addFloatingText(monkey.x, monkey.y - 36, '💤 Desmaiado!', '#fca5a5');
      return;
    }
    if (clearOthers) {
      monkey.queue = [action];
      monkey.path = [];
    } else {
      if (monkey.queue.length >= 4) {
        monkey.queue.shift();
      }
      monkey.queue.push(action);
    }
  }

  public cancelAction(monkey: MonkeySim, index: number): void {
    if (index < 0 || index >= monkey.queue.length) return;
    monkey.queue.splice(index, 1);
    if (index === 0) {
      monkey.path = [];
      monkey.pose = 'idle';
    }
  }

  public step(rawDt: number): void {
    // Visual particles & floating texts always animate smoothly even when paused
    this.updateEffects(rawDt);

    if (this.eventBannerTimer > 0) {
      this.eventBannerTimer = Math.max(0, this.eventBannerTimer - rawDt);
    }

    if (this.speed === 0) return;
    const dt = rawDt * this.speed;

    // Advance Clock (1 real second at 1x = 4 game minutes -> 1 full day in 6 real minutes at 1x, 2 mins at 3x)
    if (!this.isOnline || this.isHost) {
      this.minuteOfDay += dt * 4;
      if (this.minuteOfDay >= 1440) {
        this.minuteOfDay -= 1440;
        this.day += 1;
        const comfortBonus = Math.floor(calculateHouseComfort(this.furniture) * 0.6);
        const dailyBill = 40;
        const net = comfortBonus - dailyBill;
        this.applyMoneyDelta(net, net >= 0 ? 'Bônus de Conforto Diário' : 'Conta de Luz & Água');
        this.triggerBanner(
          `☀️ Dia ${this.day}! Conforto da Casa: +B$${comfortBonus} | Contas: -B$${dailyBill}`,
        );
      }

      // Random events
      this.randomEventTimer -= dt;
      if (this.randomEventTimer <= 0) {
        this.randomEventTimer = 55 + Math.random() * 45;
        this.triggerRandomEvent();
      }
    }

    // Update fires
    for (const fire of this.fires) {
      fire.age += dt;
      if (Math.random() < dt * 7) {
        this.spawnParticles(
          (fire.gx + 0.5) * TILE_SIZE,
          (fire.gy + 0.4) * TILE_SIZE,
          1,
          Math.random() < 0.5 ? '#f97316' : '#fde047',
          '🔥',
          35,
        );
      }
    }

    if (this.jblComplainCooldown > 0) this.jblComplainCooldown -= dt;

    // Ambient JBL music notes
    if (this.jblPlaying) {
      this.particleAccum += dt;
      if (this.particleAccum > 0.55) {
        this.particleAccum = 0;
        for (const f of this.furniture) {
          if (f.kind === 'jbl_speaker') {
            this.spawnParticles(
              (f.gx + 0.5) * TILE_SIZE,
              (f.gy + 0.3) * TILE_SIZE,
              1,
              '#facc15',
              Math.random() < 0.5 ? '♪' : '♫',
              30,
            );
          }
        }
      }
    }

    // Update monkeys
    for (const m of this.monkeys) {
      const shouldSimLocally =
        !this.isOnline || m.ownerPeerId === this.localPeerId || (this.isHost && m.isNpc);

      m.animPhase += dt * (m.pose === 'dancing' ? 9 : m.pose === 'walking' ? 7 : 2.5);
      if (m.speechTimer > 0) m.speechTimer = Math.max(0, m.speechTimer - rawDt);
      if (m.thoughtTimer > 0) m.thoughtTimer = Math.max(0, m.thoughtTimer - rawDt);

      if (shouldSimLocally) {
        this.simulateMonkey(m, dt);
      } else {
        // Remote monkey visual smoothing (particles for stink/sleep)
        this.emitMonkeyStateParticles(m, dt);
      }
    }

    // Check aspirations for active monkey
    this.checkAspirations();
  }

  private simulateMonkey(m: MonkeySim, dt: number): void {
    if (m.embarrassedTimer > 0) m.embarrassedTimer = Math.max(0, m.embarrassedTimer - dt);

    // Passed out recovery
    if (m.passOutTimer > 0) {
      m.passOutTimer -= dt;
      m.pose = 'passed_out';
      if (m.passOutTimer <= 0) {
        m.passOutTimer = 0;
        m.needs.energy = Math.max(m.needs.energy, 28);
        m.pose = 'idle';
        m.speechText = '😵 Que cochilo torto...';
        m.speechTimer = 3;
      }
      return;
    }

    // Needs decay
    const hungerMul = m.trait === 'gourmet' ? 0.75 : 1;
    const funMul = m.trait === 'workaholic' ? 1.28 : m.trait === 'party' ? 0.85 : 1;
    const energyMul = m.pose === 'sleeping' ? 0 : m.trait === 'lazy' ? 1.05 : 1;

    m.needs.hunger = clampNeed(m.needs.hunger - dt * 0.42 * hungerMul);
    m.needs.energy = clampNeed(m.needs.energy - dt * 0.34 * energyMul);
    m.needs.hygiene = clampNeed(m.needs.hygiene - dt * 0.25);
    m.needs.bladder = clampNeed(m.needs.bladder - dt * 0.38);
    m.needs.fun = clampNeed(m.needs.fun - dt * 0.36 * funMul);
    m.needs.social = clampNeed(m.needs.social - dt * 0.28);

    // JBL passive fun boost + 3AM wake-up complaint!
    if (this.jblPlaying) {
      m.needs.fun = clampNeed(m.needs.fun + dt * (m.trait === 'party' ? 0.9 : 0.45));
      const hour = this.minuteOfDay / 60;
      const isLateNight = hour >= 23 || hour < 5.5;
      if (isLateNight && m.pose === 'sleeping' && m.trait !== 'party' && this.jblComplainCooldown <= 0) {
        this.jblComplainCooldown = 14;
        m.queue = [];
        m.pose = 'idle';
        m.speechText = '🤬 DESLIGA ESSA JBL ÀS 3H!!';
        m.speechTimer = 4;
        m.thoughtIcon = '🔊';
        m.thoughtTimer = 4;
        this.addFloatingText(m.x, m.y - 45, '🤬 Barulho de madrugada!', '#fb7185');
      }
    }

    // Critical need consequences!
    if (m.needs.energy <= 0 && m.pose !== 'working_away') {
      m.queue = [];
      m.path = [];
      m.passOutTimer = 6.5;
      m.pose = 'passed_out';
      m.speechText = '😴 Zzz... (Desmaiou!)';
      m.speechTimer = 4;
      this.addFloatingText(m.x, m.y - 42, '⚡ Desmaiou de sono!', '#facc15');
      return;
    }

    if (m.needs.bladder <= 0 && m.pose !== 'working_away') {
      const gx = Math.floor(m.x / TILE_SIZE);
      const gy = Math.floor(m.y / TILE_SIZE);
      const puddle: PuddleHazard = {
        id: `pud-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
        gx,
        gy,
        ownerName: m.name,
      };
      this.puddles.push(puddle);
      this.callbacks.onSpawnPuddle?.(puddle);
      m.needs.bladder = 85;
      m.needs.hygiene = clampNeed(m.needs.hygiene - 32);
      m.needs.fun = clampNeed(m.needs.fun - 25);
      m.embarrassedTimer = 12;
      m.speechText = '😳 OPS... FIZ XIXI NO CHÃO!';
      m.speechTimer = 4.5;
      m.thoughtIcon = '💦';
      m.thoughtTimer = 4.5;
      simsAudio.playAction('pee');
      this.addFloatingText(m.x, m.y - 44, '💦 Acidente de Bexiga!', '#facc15');
      this.callbacks.onToast?.(`😳 ${m.name} não aguentou e fez xixi no chão!`, 'chaos');
    }

    // Panic around nearby fire
    if (this.fires.length > 0 && m.queue[0]?.targetType !== 'fire' && m.pose !== 'working_away') {
      const f = this.fires[0];
      const dist = Math.hypot(m.x - (f.gx + 0.5) * TILE_SIZE, m.y - (f.gy + 0.5) * TILE_SIZE);
      if (dist < TILE_SIZE * 4 && Math.random() < dt * 0.8) {
        m.thoughtIcon = '🔥';
        m.thoughtTimer = 3;
        if (!m.speechText) {
          m.speechText = '🔥 FOGO NA COZINHA!!';
          m.speechTimer = 2.8;
        }
      }
    }

    this.emitMonkeyStateParticles(m, dt);

    // Execute Action Queue
    const cur = m.queue[0];
    if (cur) {
      this.executeAction(m, cur, dt);
    } else {
      m.pose = 'idle';
      // Autonomous AI for NPCs or idle household monkeys when user hasn't queued anything
      m.aiCooldown -= dt;
      if (m.aiCooldown <= 0) {
        m.aiCooldown = m.isNpc ? 2.5 + Math.random() * 2.5 : 8 + Math.random() * 5;
        // For local player monkey, only run mild autonomy if all needs are super urgent or NPC
        if (m.isNpc || this.shouldAutoPilot(m)) {
          this.pickAutonomousAction(m);
        } else {
          // Just show fun Monkeyese thought bubble
          const icons = ['🍌', '💭', '🎮', '☕', '💃', '🛁'];
          m.thoughtIcon = icons[Math.floor(Math.random() * icons.length)];
          m.thoughtTimer = 3;
        }
      }
    }
  }

  private emitMonkeyStateParticles(m: MonkeySim, dt: number): void {
    if (m.needs.hygiene < 22) {
      m.stinkTimer += dt;
      if (m.stinkTimer > 0.7) {
        m.stinkTimer = 0;
        this.spawnParticles(m.x, m.y - 18, 1, '#84cc16', '💨', 18);
      }
    }
    if (m.pose === 'sleeping' && Math.random() < dt * 1.4) {
      this.spawnParticles(m.x + 8, m.y - 32, 1, '#93c5fd', 'Z', 16);
    }
    if (m.pose === 'dancing' && Math.random() < dt * 2) {
      this.spawnParticles(m.x, m.y - 30, 1, '#facc15', '🎵', 25);
    }
  }

  private shouldAutoPilot(m: MonkeySim): boolean {
    if (m.id !== this.activeMonkeyId) return true;
    // Active player monkey only auto-acts in emergency (<12) so player retains full control
    return (
      m.needs.hunger < 12 ||
      m.needs.bladder < 12 ||
      m.needs.hygiene < 12 ||
      m.needs.energy < 12
    );
  }

  private executeAction(m: MonkeySim, cur: QueuedAction, dt: number): void {
    if (cur.targetType === 'work_offsite') {
      m.pose = 'working_away';
      cur.elapsedSec += dt;
      if (cur.elapsedSec >= cur.durationSec) {
        const career = CAREERS[Math.min(CAREERS.length - 1, m.careerLevel)];
        const charismaBonus = 1 + (m.skills.charisma - 1) * 0.08;
        const traitBonus = m.trait === 'workaholic' ? 1.35 : 1;
        const pay = Math.round(career.salary * charismaBonus * traitBonus);
        this.applyMoneyDelta(pay, `Salário: ${career.title}`);
        m.needs.energy = clampNeed(m.needs.energy - (m.trait === 'lazy' ? 28 : 20));
        m.needs.hunger = clampNeed(m.needs.hunger - 16);
        m.needs.fun = clampNeed(m.needs.fun - (m.trait === 'workaholic' ? 20 : 12));
        this.advanceCareer(m, m.trait === 'workaholic' ? 48 : 35);
        simsAudio.playAction('work');
        this.addFloatingText(m.x, m.y - 44, `+B$ ${pay} 💼`, '#4ade80');
        m.queue.shift();
        m.pose = 'idle';
      }
      return;
    }

    // Track moving monkey target
    if (cur.targetType === 'monkey' && cur.targetMonkeyId) {
      const target = this.monkeys.find((other) => other.id === cur.targetMonkeyId);
      if (!target) {
        m.queue.shift();
        return;
      }
      const tgx = Math.floor(target.x / TILE_SIZE);
      const tgy = Math.floor(target.y / TILE_SIZE);
      if (!cur.started && (Math.abs(tgx - cur.targetGx) > 1 || Math.abs(tgy - cur.targetGy) > 1)) {
        cur.targetGx = tgx;
        cur.targetGy = tgy;
        m.path = [];
      }
    }

    const goalX = (cur.targetGx + 0.5) * TILE_SIZE;
    const goalY = (cur.targetGy + 0.5) * TILE_SIZE;
    const distToGoal = Math.hypot(goalX - m.x, goalY - m.y);

    if (!cur.started && distToGoal > 12) {
      m.pose = 'walking';
      const mgx = Math.floor(m.x / TILE_SIZE);
      const mgy = Math.floor(m.y / TILE_SIZE);
      if (m.path.length === 0) {
        m.path = findPath(mgx, mgy, cur.targetGx, cur.targetGy, this.furniture);
        if (m.path.length === 0 && (mgx !== cur.targetGx || mgy !== cur.targetGy)) {
          // Cannot reach
          m.queue.shift();
          m.pose = 'idle';
          return;
        }
      }
      const nextTile = m.path[0] ?? { gx: cur.targetGx, gy: cur.targetGy };
      const tx = (nextTile.gx + 0.5) * TILE_SIZE;
      const ty = (nextTile.gy + 0.5) * TILE_SIZE;
      const dx = tx - m.x;
      const dy = ty - m.y;
      const d = Math.hypot(dx, dy);
      const speedPx = 135;
      if (d < speedPx * dt + 2) {
        m.x = tx;
        m.y = ty;
        m.path.shift();
      } else {
        m.x += (dx / d) * speedPx * dt;
        m.y += (dy / d) * speedPx * dt;
        m.facing = Math.atan2(dy, dx);
      }
      return;
    }

    // Reached destination! Perform interaction
    if (!cur.started) {
      cur.started = true;
      m.path = [];
      this.onActionStart(m, cur);
    }

    cur.elapsedSec += dt;
    this.updatePoseDuringAction(m, cur);

    if (cur.elapsedSec >= cur.durationSec) {
      this.onActionComplete(m, cur);
      m.queue.shift();
      m.pose = 'idle';
    }
  }

  private onActionStart(m: MonkeySim, cur: QueuedAction): void {
    if (cur.targetType === 'furniture' && cur.furnitureId && cur.interactionId) {
      const item = this.furniture.find((f) => f.id === cur.furnitureId);
      if (!item) return;
      const def = FURNITURE_CATALOG[item.kind];
      const inter = def.interactions.find((i) => i.id === cur.interactionId);
      if (!inter) return;
      if (inter.emoteIcon) {
        m.thoughtIcon = inter.emoteIcon;
        m.thoughtTimer = cur.durationSec;
      }
      if (inter.sound) simsAudio.playAction(inter.sound);
    } else if (cur.targetType === 'monkey' && cur.socialKind) {
      m.thoughtIcon = cur.emoji;
      m.thoughtTimer = cur.durationSec;
      simsAudio.playAction(cur.socialKind === 'dance' ? 'dance' : 'music');
    } else if (cur.targetType === 'fire') {
      m.thoughtIcon = '🧯';
      m.thoughtTimer = cur.durationSec;
      simsAudio.playAction('shower');
    } else if (cur.targetType === 'puddle') {
      m.thoughtIcon = '🧽';
      m.thoughtTimer = cur.durationSec;
      simsAudio.playAction('clean');
    }
  }

  private updatePoseDuringAction(m: MonkeySim, cur: QueuedAction): void {
    if (cur.targetType === 'walk') {
      m.pose = 'idle';
      return;
    }
    if (cur.targetType === 'monkey') {
      m.pose = cur.socialKind === 'dance' ? 'dancing' : 'talking';
      return;
    }
    if (cur.targetType === 'fire') {
      m.pose = 'panicking';
      return;
    }
    const id = cur.interactionId ?? '';
    if (id.includes('sleep') || id.includes('nap') || id.includes('relax')) {
      m.pose = 'sleeping';
    } else if (id.includes('shower') || id.includes('bath')) {
      m.pose = 'showering';
    } else if (id.includes('toilet')) {
      m.pose = 'toilet';
    } else if (id.includes('dance')) {
      m.pose = 'dancing';
    } else if (id.includes('fry') || id.includes('moqueca') || id.includes('banquet')) {
      m.pose = 'cooking';
    } else if (id.includes('pc') || id.includes('farm') || id.includes('stream') || id.includes('kart') || id.includes('home_office')) {
      m.pose = 'gaming';
    } else {
      m.pose = 'eating';
    }
  }

  private onActionComplete(m: MonkeySim, cur: QueuedAction): void {
    if (cur.targetType === 'walk') return;

    if (cur.targetType === 'fire' && cur.hazardId) {
      const idx = this.fires.findIndex((f) => f.id === cur.hazardId);
      if (idx !== -1) {
        const fire = this.fires[idx];
        this.fires.splice(idx, 1);
        this.firesExtinguished += 1;
        this.addSkillXp(m, 'handiness', 35);
        this.applyMoneyDelta(40, 'Prêmio Bombeiro Primata!');
        this.addScore(80);
        this.callbacks.onExtinguishFire?.(fire.id, m.name);
        this.addFloatingText(m.x, m.y - 42, '🧯 Fogo Apagado! +B$ 40', '#38bdf8');
      }
      return;
    }

    if (cur.targetType === 'puddle' && cur.hazardId) {
      const idx = this.puddles.findIndex((p) => p.id === cur.hazardId);
      if (idx !== -1) {
        const puddle = this.puddles[idx];
        this.puddles.splice(idx, 1);
        this.puddlesCleaned += 1;
        this.addSkillXp(m, 'handiness', 25);
        this.applyMoneyDelta(20, 'Faxina na República');
        this.addScore(40);
        this.callbacks.onCleanPuddle?.(puddle.id, m.name);
        this.addFloatingText(m.x, m.y - 42, '✨ Limpinho! +B$ 20', '#4ade80');
      }
      return;
    }

    if (cur.targetType === 'monkey' && cur.targetMonkeyId && cur.socialKind) {
      this.resolveSocialAction(m, cur.targetMonkeyId, cur.socialKind);
      return;
    }

    if (cur.targetType === 'furniture' && cur.furnitureId && cur.interactionId) {
      const item = this.furniture.find((f) => f.id === cur.furnitureId);
      if (!item) return;
      const inter = FURNITURE_CATALOG[item.kind].interactions.find((i) => i.id === cur.interactionId);
      if (!inter) return;

      if (inter.toggleJbl) {
        this.jblPlaying = !this.jblPlaying;
        this.callbacks.onToggleJbl?.(this.jblPlaying, m.name);
        this.addFloatingText(
          m.x,
          m.y - 40,
          this.jblPlaying ? '🔊 JBL NO TALENTO!' : '🔇 Som desligado',
          '#facc15',
        );
      }

      if (inter.id.includes('dance')) {
        this.dancesDone += 1;
      }

      // Check cooking fire risk!
      if (inter.fireRisk && inter.fireRisk > 0) {
        const skillFactor = Math.max(0.08, 1 - (m.skills.cooking - 1) * 0.22);
        const traitFactor = m.trait === 'gourmet' ? 0.45 : 1;
        const chance = inter.fireRisk * skillFactor * traitFactor;
        if (Math.random() < chance) {
          const fire: FireHazard = {
            id: `fire-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
            gx: item.gx,
            gy: item.gy,
            furnitureId: item.id,
            intensity: 1,
            age: 0,
          };
          this.fires.push(fire);
          this.callbacks.onBroadcastFire?.(fire, m.name);
          simsAudio.playAction('fire');
          m.speechText = '🔥 SOCORRO, QUEIMEI A BANANA!';
          m.speechTimer = 4.5;
          this.addFloatingText(
            (item.gx + 0.5) * TILE_SIZE,
            item.gy * TILE_SIZE,
            '🔥 INCÊNDIO NO FOGÃO!',
            '#f97316',
          );
          this.callbacks.onToast?.(`🔥 ${m.name} botou fogo na cozinha!`, 'chaos');
          return;
        } else {
          this.mealsCooked += 1;
        }
      }

      // Apply need deltas with trait modifiers
      for (const [k, rawDelta] of Object.entries(inter.needDeltas) as Array<[NeedKey, number]>) {
        let delta = rawDelta;
        if (delta > 0) {
          if (m.trait === 'lazy' && k === 'energy') delta *= 1.45;
          if (m.trait === 'party' && (k === 'fun' || k === 'social')) delta *= 1.4;
          if (m.trait === 'gourmet' && k === 'hunger') delta *= 1.15;
        }
        m.needs[k] = clampNeed(m.needs[k] + delta);
      }
      if (m.trait === 'gourmet' && (inter.id === 'fry_banana' || inter.id === 'moqueca' || inter.id === 'banquet')) {
        m.needs.fun = clampNeed(m.needs.fun + 16);
      }

      if (inter.moneyDelta) {
        const gamerMult = 1 + (m.skills.gamer - 1) * 0.16;
        const workMult = m.trait === 'workaholic' ? 1.35 : 1;
        const earned = Math.round(inter.moneyDelta * gamerMult * workMult);
        this.applyMoneyDelta(earned, inter.label);
        this.addFloatingText(m.x, m.y - 42, `+B$ ${earned}`, '#4ade80');
        this.addScore(Math.floor(earned * 0.4));
      }

      if (inter.careerProgress) {
        const career = CAREERS[Math.min(CAREERS.length - 1, m.careerLevel)];
        const pay = Math.round(career.salary * 0.75 * (m.trait === 'workaholic' ? 1.35 : 1));
        this.applyMoneyDelta(pay, 'Home Office');
        this.advanceCareer(m, inter.careerProgress);
        this.addFloatingText(m.x, m.y - 42, `+B$ ${pay} 💻`, '#4ade80');
      }

      if (inter.skillGain) {
        this.addSkillXp(m, inter.skillGain.skill, inter.skillGain.amount);
      }
    }
  }

  private resolveSocialAction(m: MonkeySim, targetId: string, kind: SocialActionKind): void {
    const target = this.monkeys.find((o) => o.id === targetId);
    if (!target) return;

    const partyMul = m.trait === 'party' ? 1.35 : 1;
    const charismaBonus = (m.skills.charisma - 1) * 3;
    let relDelta = 0;

    switch (kind) {
      case 'talk':
        m.needs.social = clampNeed(m.needs.social + 28 * partyMul);
        relDelta = 10 + charismaBonus;
        m.speechText = '💬 Uga buga, viu o preço da banana?';
        this.spawnParticles(target.x, target.y - 28, 3, '#4ade80', '💬', 30);
        break;
      case 'joke':
        m.needs.social = clampNeed(m.needs.social + 34 * partyMul);
        m.needs.fun = clampNeed(m.needs.fun + 18 * partyMul);
        relDelta = 14 + charismaBonus;
        m.speechText = '😂 Por que o macaco atravessou o cipó?';
        this.spawnParticles(target.x, target.y - 28, 4, '#facc15', '😂', 35);
        break;
      case 'dance':
        m.needs.social = clampNeed(m.needs.social + 30 * partyMul);
        m.needs.fun = clampNeed(m.needs.fun + 36 * partyMul);
        relDelta = 16;
        this.dancesDone += 1;
        m.speechText = '💃 SOLTA O PASSINHO!';
        this.spawnParticles(target.x, target.y - 28, 5, '#ec4899', '🎵', 40);
        break;
      case 'gift':
        if (this.money >= 25) {
          this.applyMoneyDelta(-25, `Presente para ${target.name}`);
          m.needs.social = clampNeed(m.needs.social + 25);
          relDelta = 24;
          m.speechText = '🎁 Toma essa banana dourada!';
          this.spawnParticles(target.x, target.y - 28, 5, '#fb7185', '❤️', 40);
        }
        break;
      case 'prank':
        m.needs.fun = clampNeed(m.needs.fun + 28 * partyMul);
        relDelta = -18;
        this.pranksPulled += 1;
        simsAudio.playAction('prank');
        m.speechText = '🍌 HAHA! CASCA DE BANANA!';
        this.spawnParticles(target.x, target.y - 28, 5, '#facc15', '🍌', 55);
        break;
      case 'fight':
        m.needs.social = clampNeed(m.needs.social - 12);
        m.needs.fun = clampNeed(m.needs.fun + 10);
        relDelta = -28;
        simsAudio.playAction('fire');
        m.speechText = '🤬 QUEM COMEU MEU AÇAÍ?!';
        this.spawnParticles(target.x, target.y - 28, 5, '#ef4444', '💢', 55);
        break;
    }

    m.speechTimer = 3.2;
    m.relations[target.id] = clampRelation((m.relations[target.id] ?? 0) + relDelta);
    this.addSkillXp(m, 'charisma', 24);
    this.addScore(15);

    if (target.isNpc && !this.isOnline) {
      this.applyIncomingSocialToMonkey(target, m.id, m.name, kind);
    } else if (this.isOnline) {
      this.callbacks.onSocialEvent?.(m.id, m.name, target.id, kind, kind === 'gift' ? 25 : undefined);
    }
  }

  public applyIncomingSocialToMonkey(
    target: MonkeySim,
    fromId: string,
    fromName: string,
    kind: SocialActionKind,
    giftAmount = 25,
  ): void {
    switch (kind) {
      case 'talk':
        target.needs.social = clampNeed(target.needs.social + 24);
        target.relations[fromId] = clampRelation((target.relations[fromId] ?? 0) + 10);
        target.speechText = `💬 Boa, ${fromName.split(' ')[0]}!`;
        break;
      case 'joke':
        target.needs.social = clampNeed(target.needs.social + 28);
        target.needs.fun = clampNeed(target.needs.fun + 16);
        target.relations[fromId] = clampRelation((target.relations[fromId] ?? 0) + 14);
        target.speechText = '🤣 KKKKK boa!';
        break;
      case 'dance':
        target.needs.social = clampNeed(target.needs.social + 26);
        target.needs.fun = clampNeed(target.needs.fun + 28);
        target.relations[fromId] = clampRelation((target.relations[fromId] ?? 0) + 15);
        target.speechText = '🕺 Bora dançar!';
        break;
      case 'gift':
        target.needs.social = clampNeed(target.needs.social + 20);
        target.relations[fromId] = clampRelation((target.relations[fromId] ?? 0) + 22);
        target.speechText = `🥰 Valeu pelos B$${giftAmount}!`;
        this.addFloatingText(target.x, target.y - 44, `🎁 Presente de ${fromName}!`, '#f472b6');
        break;
      case 'prank':
        target.needs.fun = clampNeed(target.needs.fun - 15);
        target.needs.hygiene = clampNeed(target.needs.hygiene - 8);
        target.relations[fromId] = clampRelation((target.relations[fromId] ?? 0) - 20);
        target.speechText = `😤 Ei ${fromName}! Escorreguei!`;
        this.addFloatingText(target.x, target.y - 44, '🍌 Escorregou na casca!', '#facc15');
        break;
      case 'fight':
        target.needs.social = clampNeed(target.needs.social - 22);
        target.needs.fun = clampNeed(target.needs.fun - 18);
        target.relations[fromId] = clampRelation((target.relations[fromId] ?? 0) - 28);
        target.speechText = '💢 VAI PRA TUA ÁRVORE!';
        this.addFloatingText(target.x, target.y - 44, '💢 Treta na República!', '#ef4444');
        break;
    }
    target.speechTimer = 3.2;
  }

  private addSkillXp(m: MonkeySim, skill: SkillKey, amount: number): void {
    if (m.skills[skill] >= 10) return;
    m.skillXp[skill] += amount;
    const needed = m.skills[skill] * 80;
    if (m.skillXp[skill] >= needed) {
      m.skillXp[skill] -= needed;
      m.skills[skill] += 1;
      const meta = SKILL_LABELS[skill];
      this.addFloatingText(m.x, m.y - 52, `${meta.emoji} ${meta.name} Nv ${m.skills[skill]}!`, '#facc15');
      this.addScore(50);
      simsAudio.playAction('promo');
    }
  }

  private advanceCareer(m: MonkeySim, amount: number): void {
    m.careerProgress += amount;
    if (m.careerProgress >= 100 && m.careerLevel < CAREERS.length - 1) {
      m.careerProgress = 0;
      m.careerLevel += 1;
      const next = CAREERS[m.careerLevel];
      this.applyMoneyDelta(120, 'Bônus de Promoção!');
      this.addScore(180);
      simsAudio.playAction('promo');
      this.addFloatingText(m.x, m.y - 55, `🎉 PROMOVIDO: ${next.title}!`, '#facc15');
      this.callbacks.onToast?.(`💼 ${m.name} foi promovido a ${next.title}!`, 'banana');
    } else if (m.careerProgress > 100) {
      m.careerProgress = 100;
    }
  }

  private pickAutonomousAction(m: MonkeySim): void {
    // 1. Fire emergency? Handy/Brave or anyone tries to extinguish!
    if (this.fires.length > 0) {
      this.enqueueExtinguishFire(m, this.fires[0]);
      m.thoughtIcon = '🧯';
      m.thoughtTimer = 3;
      return;
    }

    // 2. Find lowest need
    const entries = Object.entries(m.needs) as Array<[NeedKey, number]>;
    entries.sort((a, b) => a[1] - b[1]);
    const [lowestKey, lowestVal] = entries[0];

    if (lowestVal > 75 && this.puddles.length > 0) {
      this.enqueueCleanPuddle(m, this.puddles[0]);
      return;
    }

    if (lowestVal > 75) {
      // Casual socialize or wander
      const others = this.monkeys.filter((o) => o.id !== m.id && o.pose !== 'working_away');
      if (others.length > 0 && Math.random() < 0.55) {
        const pick = others[Math.floor(Math.random() * others.length)];
        const kind: SocialActionKind =
          m.trait === 'party' && Math.random() < 0.35
            ? 'prank'
            : Math.random() < 0.5
              ? 'talk'
              : 'joke';
        this.enqueueSocial(m, pick, kind);
        return;
      }
      const rx = 2 + Math.floor(Math.random() * 13);
      const ry = 2 + Math.floor(Math.random() * 8);
      if (isWalkableFloor(rx, ry)) {
        this.enqueueWalk(m, rx, ry, true);
      }
      return;
    }

    // Map need to best furniture interaction
    const needMap: Record<NeedKey, FurnitureKind[]> = {
      hunger: ['fridge_pro', 'stove_industrial', 'fridge', 'stove'],
      energy: ['bed_gorilla', 'hammock', 'sofa_vip', 'sofa_palm', 'fridge_pro', 'fridge'],
      hygiene: ['acai_tub', 'shower_waterfall'],
      bladder: ['toilet_gold', 'toilet'],
      fun: ['pc_rgb', 'trampoline', 'jbl_speaker', 'tv_tube', 'pc_basic', 'guitar_stand'],
      social: ['jbl_speaker', 'guitar_stand', 'plant_pot'],
    };

    if (lowestKey === 'social') {
      const others = this.monkeys.filter((o) => o.id !== m.id && o.pose !== 'working_away');
      if (others.length > 0) {
        const pick = others[Math.floor(Math.random() * others.length)];
        this.enqueueSocial(m, pick, Math.random() < 0.5 ? 'talk' : 'joke');
        return;
      }
    }

    for (const kind of needMap[lowestKey]) {
      const candidates = this.furniture.filter((f) => f.kind === kind);
      if (candidates.length === 0) continue;
      const item = candidates[Math.floor(Math.random() * candidates.length)];
      const inters = FURNITURE_CATALOG[item.kind].interactions;
      // Pick safe/helpful interaction
      const chosen =
        inters.find((i) => (i.needDeltas[lowestKey] ?? 0) > 0) ?? inters[0];
      if (chosen) {
        m.thoughtIcon = chosen.emoji;
        m.thoughtTimer = 3;
        this.enqueueFurnitureInteraction(m, item, chosen.id);
        return;
      }
    }
  }

  public buyAndPlaceFurniture(kind: FurnitureKind, gx: number, gy: number, rotation: 0 | 1 | 2 | 3): PlacedFurniture | null {
    const def = FURNITURE_CATALOG[kind];
    if (this.money < def.price) {
      this.callbacks.onToast?.(`Precisa de B$ ${def.price} para comprar ${def.name}!`, 'chaos');
      return null;
    }
    if (!canPlaceFurniture(kind, gx, gy, rotation, this.furniture)) {
      this.callbacks.onToast?.('Espaço bloqueado ou fora da casa!', 'chaos');
      return null;
    }
    const item: PlacedFurniture = {
      id: `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      kind,
      gx,
      gy,
      rotation,
    };
    this.furniture.push(item);
    this.applyMoneyDelta(-def.price, `Comprou ${def.name}`);
    this.addScore(Math.round(def.price * 0.25));
    simsAudio.playAction('clean');
    this.addFloatingText(
      (gx + 0.5) * TILE_SIZE,
      gy * TILE_SIZE,
      `+${def.emoji} ${def.name}!`,
      '#4ade80',
    );
    return item;
  }

  public sellFurniture(id: string): number {
    const idx = this.furniture.findIndex((f) => f.id === id);
    if (idx === -1) return 0;
    const item = this.furniture[idx];
    const refund = Math.round(FURNITURE_CATALOG[item.kind].price * 0.7);
    this.furniture.splice(idx, 1);
    this.applyMoneyDelta(refund, `Vendeu ${FURNITURE_CATALOG[item.kind].name}`);
    this.addFloatingText(
      (item.gx + 0.5) * TILE_SIZE,
      item.gy * TILE_SIZE,
      `+B$ ${refund} ♻️`,
      '#facc15',
    );
    return refund;
  }

  public applyMoneyDelta(delta: number, _reason: string): void {
    this.money = Math.max(0, Math.round(this.money + delta));
    if (this.isOnline && !this.isHost) {
      this.callbacks.onMoneyDelta?.(delta, _reason);
    }
  }

  private checkAspirations(): void {
    const active = this.getActiveMonkey();
    if (!active) return;

    let changed = false;
    for (let i = this.aspirations.length - 1; i >= 0; i--) {
      const asp = this.aspirations[i];
      if (
        asp.check({
          monkey: active,
          furniture: this.furniture,
          money: this.money,
          firesExtinguished: this.firesExtinguished,
          puddlesCleaned: this.puddlesCleaned,
          mealsCooked: this.mealsCooked,
          pranksPulled: this.pranksPulled,
          dancesDone: this.dancesDone,
        })
      ) {
        this.completedAspirationIds.add(asp.id);
        this.aspirations.splice(i, 1);
        this.applyMoneyDelta(asp.rewardMoney, `Desejo: ${asp.title}`);
        this.addScore(asp.rewardScore);
        simsAudio.playAction('promo');
        this.callbacks.onToast?.(
          `✨ Desejo Realizado: ${asp.emoji} ${asp.title} (+B$ ${asp.rewardMoney})!`,
          'banana',
        );
        changed = true;
      }
    }
    if (changed) this.refreshAspirations();
  }

  public addScore(pts: number): void {
    this.score += pts;
    const total = this.getTotalScore();
    reportGameScore('monkey-sims', total, {
      patrimonio: calculateHouseValue(this.furniture) + this.money,
      dia: this.day,
    });
  }

  public getTotalScore(): number {
    const houseVal = calculateHouseValue(this.furniture);
    const active = this.getActiveMonkey();
    const careerPts = active ? active.careerLevel * 250 : 0;
    return this.score + Math.floor(houseVal * 0.25) + careerPts;
  }

  private triggerRandomEvent(): void {
    const roll = Math.random();
    if (roll < 0.34) {
      this.applyMoneyDelta(85, 'Entrega de Bananas');
      this.triggerBanner('🍌 Caminhão da Banana tombou na raiz! +B$ 85 de dividendos!');
      this.callbacks.onToast?.('🍌 Bônus da Selva: +B$ 85!', 'banana');
    } else if (roll < 0.68) {
      this.triggerBanner('🌧️ Chuva tropical lá fora! Ótimo momento pra jogar no PC ou tomar café.');
    } else {
      const m = this.monkeys[Math.floor(Math.random() * this.monkeys.length)];
      if (m) {
        m.speechText = '🐒 Alguém viu meu chinelo de banana?';
        m.speechTimer = 4;
      }
      this.triggerBanner('📢 Fiscalização da Árvore elogiou a decoração da república!');
    }
  }

  public triggerBanner(msg: string): void {
    this.eventBanner = msg;
    this.eventBannerTimer = 9;
  }

  private updateEffects(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life -= dt;
      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
        continue;
      }
      ft.y += ft.vy * dt;
    }
  }
}

function clampNeed(v: number): number {
  return Math.max(0, Math.min(100, v));
}

function clampRelation(v: number): number {
  return Math.max(-100, Math.min(100, v));
}
