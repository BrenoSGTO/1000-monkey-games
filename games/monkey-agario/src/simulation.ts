import { BotBrainManager, randomBotSkin } from './bots';
import {
  ARENA_SIZE,
  BOT_NAMES,
  CACTUS_QUOTES,
  EAT_MASS_RATIO,
  EAT_QUOTES,
  EJECT_PELLET_MASS,
  MAX_CELLS_PER_PLAYER,
  MIN_EJECT_MASS,
  MIN_SPLIT_MASS,
  START_MASS,
  massToRadius,
} from './skins';
import type {
  CactusVirus,
  FoodPellet,
  GameEvent,
  GameMode,
  LeaderboardEntry,
  MonkeyCell,
  PlayerInput,
  PlayerStats,
  SkinId,
  SnapshotPayload,
  TeamId,
} from './types';

const TARGET_FOOD_COUNT = 260;
const TARGET_CACTUS_COUNT = 14;
const TARGET_CONTESTANTS = 14;
const CACTUS_BASE_MASS = 100;

export class ArenaSimulation {
  public mode: GameMode = 'ffa';
  public readonly arenaSize = ARENA_SIZE;
  public cells: MonkeyCell[] = [];
  public food: FoodPellet[] = [];
  public cacti: CactusVirus[] = [];
  public stats = new Map<string, PlayerStats>();
  public inputs = new Map<string, PlayerInput>();
  public leaderboard: LeaderboardEntry[] = [];
  public teamMass: [number, number] = [0, 0];

  private botBrains = new BotBrainManager();
  private botIds: string[] = [];
  private humanIds = new Set<string>();
  private nextEntityId = 1;
  private tickCount = 0;

  private pendingEvents: GameEvent[] = [];
  private pendingDeaths: SnapshotPayload['deaths'] = [];

  constructor() {
    this.resetArena('ffa');
  }

  resetArena(mode: GameMode): void {
    this.mode = mode;
    this.cells = [];
    this.food = [];
    this.cacti = [];
    this.pendingEvents = [];
    this.pendingDeaths = [];
    this.botBrains.clear();

    for (let i = 0; i < TARGET_FOOD_COUNT; i++) {
      this.spawnRandomFood();
    }
    for (let i = 0; i < TARGET_CACTUS_COUNT; i++) {
      this.spawnRandomCactus();
    }

    // Preserve human stats as waiting to spawn
    for (const st of this.stats.values()) {
      if (!st.isBot) {
        st.alive = false;
        st.kills = 0;
        st.peakMass = 0;
        st.aliveTime = 0;
      } else {
        this.stats.delete(st.ownerId);
      }
    }
    this.botIds = [];
    this.reconcileBots();
  }

  setMode(mode: GameMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    // Reassign teams cleanly for living entities without wiping whole arena unnecessarily
    let toggle: TeamId = 1;
    for (const st of this.stats.values()) {
      if (mode === 'ffa') {
        st.team = 0;
      } else {
        if (st.team !== 1 && st.team !== 2) {
          st.team = toggle;
          toggle = toggle === 1 ? 2 : 1;
        }
      }
      for (const c of this.cells) {
        if (c.ownerId === st.ownerId) {
          c.team = st.team;
        }
      }
    }
  }

  syncHumans(ids: string[]): void {
    const nextSet = new Set(ids);
    for (const oldId of this.humanIds) {
      if (!nextSet.has(oldId)) {
        this.removeOwner(oldId);
      }
    }
    this.humanIds = nextSet;
    for (const id of ids) {
      if (!this.stats.has(id)) {
        this.stats.set(id, {
          ownerId: id,
          name: 'Macaco',
          skin: 'classico',
          team: this.pickBalancedTeam(0),
          isBot: false,
          alive: false,
          peakMass: 0,
          kills: 0,
          aliveTime: 0,
          respawnCooldown: 0,
        });
      }
    }
    this.reconcileBots();
  }

  setHumanInput(ownerId: string, input: PlayerInput): void {
    const prev = this.inputs.get(ownerId);
    // Preserve edge-triggered split/eject until consumed by step()
    this.inputs.set(ownerId, {
      ...input,
      split: Boolean(input.split || prev?.split),
      eject: Boolean(input.eject || prev?.eject),
    });

    const st = this.stats.get(ownerId);
    if (st) {
      st.name = input.name.trim().slice(0, 18) || st.name;
      st.skin = input.skin;
      if (this.mode === 'teams' && !st.alive) {
        st.team = input.preferredTeam === 1 || input.preferredTeam === 2
          ? input.preferredTeam
          : this.pickBalancedTeam(0);
      }
    }
  }

  private removeOwner(ownerId: string): void {
    this.cells = this.cells.filter((c) => c.ownerId !== ownerId);
    this.stats.delete(ownerId);
    this.inputs.delete(ownerId);
  }

  private pickBalancedTeam(preferred: TeamId): TeamId {
    if (this.mode === 'ffa') return 0;
    if (preferred === 1 || preferred === 2) return preferred;
    let c1 = 0;
    let c2 = 0;
    for (const st of this.stats.values()) {
      if (st.team === 1) c1++;
      else if (st.team === 2) c2++;
    }
    return c1 <= c2 ? 1 : 2;
  }

  private reconcileBots(): void {
    const neededBots = Math.max(4, TARGET_CONTESTANTS - this.humanIds.size);
    while (this.botIds.length < neededBots) {
      const idx = this.botIds.length;
      const botId = `bot-${idx}-${Math.random().toString(36).slice(2, 6)}`;
      const botName = BOT_NAMES[idx % BOT_NAMES.length];
      const botSkin = randomBotSkin(idx + 1);
      const botTeam = this.mode === 'teams' ? ((idx % 2 === 0 ? 1 : 2) as TeamId) : 0;
      this.botIds.push(botId);
      this.stats.set(botId, {
        ownerId: botId,
        name: botName,
        skin: botSkin,
        team: botTeam,
        isBot: true,
        alive: false,
        peakMass: 0,
        kills: 0,
        aliveTime: 0,
        respawnCooldown: Math.random() * 0.6,
      });
    }
    while (this.botIds.length > neededBots) {
      const removed = this.botIds.pop()!;
      this.removeOwner(removed);
    }
    this.botBrains.prune(new Set(this.botIds));
  }

  private findSafeSpawn(radius: number): { x: number; y: number } {
    const pad = radius + 140;
    let bestX = pad + Math.random() * (this.arenaSize - pad * 2);
    let bestY = pad + Math.random() * (this.arenaSize - pad * 2);
    let bestClearance = -Infinity;

    for (let attempt = 0; attempt < 14; attempt++) {
      const cx = pad + Math.random() * (this.arenaSize - pad * 2);
      const cy = pad + Math.random() * (this.arenaSize - pad * 2);
      let minDist = Infinity;

      for (const cell of this.cells) {
        const d = Math.hypot(cell.x - cx, cell.y - cy) - massToRadius(cell.mass);
        if (d < minDist) minDist = d;
      }
      for (const cactus of this.cacti) {
        const d = Math.hypot(cactus.x - cx, cactus.y - cy) - massToRadius(cactus.mass);
        if (d < minDist) minDist = d;
      }

      if (minDist > bestClearance) {
        bestClearance = minDist;
        bestX = cx;
        bestY = cy;
      }
    }
    return { x: bestX, y: bestY };
  }

  private spawnPlayer(ownerId: string, initialMass = START_MASS): void {
    const st = this.stats.get(ownerId);
    if (!st) return;

    // Clear any lingering cells just in case
    this.cells = this.cells.filter((c) => c.ownerId !== ownerId);

    if (this.mode === 'ffa') {
      st.team = 0;
    } else if (st.team !== 1 && st.team !== 2) {
      st.team = this.pickBalancedTeam(0);
    }

    const r = massToRadius(initialMass);
    const pos = this.findSafeSpawn(r);
    this.cells.push({
      id: this.nextEntityId++,
      ownerId,
      name: st.name,
      skin: st.skin,
      team: st.team,
      x: pos.x,
      y: pos.y,
      vx: 0,
      vy: 0,
      mass: initialMass,
      mergeTimer: 0,
      isBot: st.isBot,
      lookAngle: Math.random() * Math.PI * 2,
      mouthOpen: 0,
      scared: 0,
      wobblePhase: Math.random() * Math.PI * 2,
      wobbleAmp: 0.04,
    });

    st.alive = true;
    st.peakMass = initialMass;
    st.kills = 0;
    st.aliveTime = 0;
    st.lastKiller = undefined;
  }

  private spawnRandomFood(): void {
    const isCacho = Math.random() < 0.12;
    const pad = 40;
    this.food.push({
      id: this.nextEntityId++,
      x: pad + Math.random() * (this.arenaSize - pad * 2),
      y: pad + Math.random() * (this.arenaSize - pad * 2),
      vx: 0,
      vy: 0,
      mass: isCacho ? 5.5 : 1.7,
      kind: isCacho ? 'cacho' : 'banana',
      rot: Math.random() * Math.PI * 2,
      age: 1,
    });
  }

  private spawnRandomCactus(): void {
    const pad = 220;
    this.cacti.push({
      id: this.nextEntityId++,
      x: pad + Math.random() * (this.arenaSize - pad * 2),
      y: pad + Math.random() * (this.arenaSize - pad * 2),
      vx: 0,
      vy: 0,
      mass: CACTUS_BASE_MASS,
      hits: 0,
      pulse: Math.random() * Math.PI * 2,
    });
  }

  step(dt: number): {
    events: GameEvent[];
    deaths: SnapshotPayload['deaths'];
  } {
    this.tickCount++;
    this.pendingEvents = [];
    this.pendingDeaths = [];

    // 1. Replenish food & cacti
    let naturalFoodCount = 0;
    for (const f of this.food) {
      if (f.kind !== 'ejected') naturalFoodCount++;
    }
    while (naturalFoodCount < TARGET_FOOD_COUNT) {
      this.spawnRandomFood();
      naturalFoodCount++;
    }
    while (this.cacti.length < TARGET_CACTUS_COUNT) {
      this.spawnRandomCactus();
    }

    // 2. Spawn humans & bots if ready
    for (const st of this.stats.values()) {
      if (st.isBot) {
        if (!st.alive) {
          st.respawnCooldown -= dt;
          if (st.respawnCooldown <= 0) {
            const startBoost = START_MASS + Math.floor(Math.random() * 26);
            this.spawnPlayer(st.ownerId, startBoost);
          }
        } else {
          st.aliveTime += dt;
          const botInput = this.botBrains.computeInput(
            st.ownerId,
            st.name,
            st.skin,
            st.team,
            this.mode,
            this.cells,
            this.food,
            this.cacti,
            dt,
          );
          this.inputs.set(st.ownerId, botInput);
        }
      } else {
        const inp = this.inputs.get(st.ownerId);
        if (!st.alive && inp?.wantSpawn) {
          st.name = inp.name.trim().slice(0, 18) || st.name;
          st.skin = inp.skin;
          if (this.mode === 'teams') {
            st.team = this.pickBalancedTeam(inp.preferredTeam);
          }
          this.spawnPlayer(st.ownerId, START_MASS);
          inp.wantSpawn = false;
        } else if (st.alive) {
          st.aliveTime += dt;
        }
      }
    }

    // 3. Process Split & Eject actions
    const ownerCellsMap = new Map<string, MonkeyCell[]>();
    for (const cell of this.cells) {
      let arr = ownerCellsMap.get(cell.ownerId);
      if (!arr) {
        arr = [];
        ownerCellsMap.set(cell.ownerId, arr);
      }
      arr.push(cell);
    }

    for (const [ownerId, ownerCells] of ownerCellsMap) {
      const inp = this.inputs.get(ownerId);
      if (!inp) continue;

      // Keep name/skin synced for living cells
      const st = this.stats.get(ownerId);
      if (st) {
        for (const c of ownerCells) {
          c.name = st.name;
          c.skin = st.skin;
        }
      }

      const aimMag = Math.hypot(inp.dirX, inp.dirY);
      const aimX = aimMag > 0.05 ? inp.dirX / aimMag : Math.cos(ownerCells[0].lookAngle);
      const aimY = aimMag > 0.05 ? inp.dirY / aimMag : Math.sin(ownerCells[0].lookAngle);

      if (inp.split) {
        inp.split = false;
        let currentCount = ownerCells.length;
        const newlySplit: MonkeyCell[] = [];
        for (const c of ownerCells) {
          if (currentCount >= MAX_CELLS_PER_PLAYER) break;
          if (c.mass < MIN_SPLIT_MASS) continue;

          const halfMass = c.mass / 2;
          c.mass = halfMass;
          const r = massToRadius(halfMass);
          const mergeT = 10 + halfMass * 0.04;
          c.mergeTimer = Math.max(c.mergeTimer, mergeT);
          c.wobbleAmp = Math.min(0.22, c.wobbleAmp + 0.1);

          const lunge = 620 + Math.sqrt(halfMass) * 16;
          const child: MonkeyCell = {
            id: this.nextEntityId++,
            ownerId: c.ownerId,
            name: c.name,
            skin: c.skin,
            team: c.team,
            x: c.x + aimX * (r * 0.85),
            y: c.y + aimY * (r * 0.85),
            vx: aimX * lunge,
            vy: aimY * lunge,
            mass: halfMass,
            mergeTimer: mergeT,
            isBot: c.isBot,
            lookAngle: Math.atan2(aimY, aimX),
            mouthOpen: 0.35,
            scared: c.scared,
            wobblePhase: Math.random() * Math.PI * 2,
            wobbleAmp: 0.16,
          };
          newlySplit.push(child);
          currentCount++;
        }
        if (newlySplit.length > 0) {
          this.cells.push(...newlySplit);
          ownerCells.push(...newlySplit);
          this.pendingEvents.push({
            kind: 'split',
            x: ownerCells[0].x,
            y: ownerCells[0].y,
            actorId: ownerId,
          });
        }
      }

      if (inp.eject) {
        inp.eject = false;
        for (const c of ownerCells) {
          if (c.mass < MIN_EJECT_MASS) continue;
          c.mass -= EJECT_PELLET_MASS + 0.6;
          c.wobbleAmp = Math.min(0.18, c.wobbleAmp + 0.06);
          const r = massToRadius(c.mass);
          const speed = 720;
          this.food.push({
            id: this.nextEntityId++,
            x: c.x + aimX * (r + 10),
            y: c.y + aimY * (r + 10),
            vx: aimX * speed,
            vy: aimY * speed,
            mass: EJECT_PELLET_MASS,
            kind: 'ejected',
            rot: Math.atan2(aimY, aimX),
            ownerId: c.ownerId,
            age: 0,
          });
        }
      }
    }

    // 4. Integrate cell movement
    for (const c of this.cells) {
      const inp = this.inputs.get(c.ownerId);
      const dirX = inp ? inp.dirX : 0;
      const dirY = inp ? inp.dirY : 0;
      const mag = Math.min(1, Math.hypot(dirX, dirY));
      const baseSpeed = Math.max(92, Math.min(365, 325 * Math.pow(c.mass / 30, -0.34)));

      if (mag > 0.03) {
        const nx = dirX / Math.max(1, Math.hypot(dirX, dirY));
        const ny = dirY / Math.max(1, Math.hypot(dirX, dirY));
        c.x += nx * baseSpeed * mag * dt;
        c.y += ny * baseSpeed * mag * dt;
        c.lookAngle = Math.atan2(ny, nx);
      }

      // Apply impulse velocity
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      const drag = Math.exp(-5.5 * dt);
      c.vx *= drag;
      c.vy *= drag;

      // Clamp inside arena
      const r = massToRadius(c.mass);
      if (c.x < r) {
        c.x = r;
        c.vx = Math.abs(c.vx) * 0.4;
      } else if (c.x > this.arenaSize - r) {
        c.x = this.arenaSize - r;
        c.vx = -Math.abs(c.vx) * 0.4;
      }
      if (c.y < r) {
        c.y = r;
        c.vy = Math.abs(c.vy) * 0.4;
      } else if (c.y > this.arenaSize - r) {
        c.y = this.arenaSize - r;
        c.vy = -Math.abs(c.vy) * 0.4;
      }

      c.mergeTimer = Math.max(0, c.mergeTimer - dt);
      c.mouthOpen = Math.max(0, c.mouthOpen - dt * 2.6);
      c.wobblePhase += dt * (4.5 + mag * 3.5);
      c.wobbleAmp = Math.max(0.035, c.wobbleAmp - dt * 0.2);

      // Gentle decay for huge cells
      if (c.mass > 180) {
        c.mass -= c.mass * 0.0022 * dt;
      }
    }

    // 5. Sibling cell repulsion & merging
    const deadCellIds = new Set<number>();
    for (let i = 0; i < this.cells.length; i++) {
      const a = this.cells[i];
      if (deadCellIds.has(a.id)) continue;

      for (let j = i + 1; j < this.cells.length; j++) {
        const b = this.cells[j];
        if (deadCellIds.has(b.id) || a.ownerId !== b.ownerId) continue;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        const rA = massToRadius(a.mass);
        const rB = massToRadius(b.mass);

        if (a.mergeTimer > 0 || b.mergeTimer > 0) {
          // Push apart when not yet mergeable
          const minDist = rA + rB;
          if (dist < minDist) {
            const overlap = minDist - dist;
            const nx = dx / dist;
            const ny = dy / dist;
            const push = overlap * 0.48;
            a.x -= nx * push;
            a.y -= ny * push;
            b.x += nx * push;
            b.y += ny * push;
          }
        } else {
          // Gently pull together and merge!
          if (dist < (rA + rB) * 0.58) {
            if (a.mass >= b.mass) {
              a.mass += b.mass;
              a.mouthOpen = Math.max(a.mouthOpen, 0.45);
              a.wobbleAmp = Math.min(0.2, a.wobbleAmp + 0.08);
              deadCellIds.add(b.id);
            } else {
              b.mass += a.mass;
              b.mouthOpen = Math.max(b.mouthOpen, 0.45);
              b.wobbleAmp = Math.min(0.2, b.wobbleAmp + 0.08);
              deadCellIds.add(a.id);
              break;
            }
          } else if (dist < (rA + rB) * 2.8) {
            const pull = 36 * dt;
            const nx = dx / dist;
            const ny = dy / dist;
            a.x += nx * pull;
            a.y += ny * pull;
            b.x -= nx * pull;
            b.y -= ny * pull;
          }
        }
      }
    }

    // 6. Move ejected pellets & cacti, check cactus feeding
    const removedFoodIds = new Set<number>();
    const newCacti: CactusVirus[] = [];
    for (const f of this.food) {
      f.age += dt;
      if (f.kind === 'ejected') {
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        const fDrag = Math.exp(-4.2 * dt);
        f.vx *= fDrag;
        f.vy *= fDrag;
        f.rot += dt * 7;
        f.x = Math.max(20, Math.min(this.arenaSize - 20, f.x));
        f.y = Math.max(20, Math.min(this.arenaSize - 20, f.y));

        // Feed cactus?
        for (const cactus of this.cacti) {
          const cr = massToRadius(cactus.mass);
          if (Math.hypot(f.x - cactus.x, f.y - cactus.y) < cr + 10) {
            removedFoodIds.add(f.id);
            cactus.hits++;
            cactus.mass += 10;
            if (cactus.hits >= 4) {
              cactus.hits = 0;
              cactus.mass = CACTUS_BASE_MASS;
              const angle = Math.atan2(f.vy, f.vx) || Math.random() * Math.PI * 2;
              newCacti.push({
                id: this.nextEntityId++,
                x: cactus.x + Math.cos(angle) * (cr * 1.4),
                y: cactus.y + Math.sin(angle) * (cr * 1.4),
                vx: Math.cos(angle) * 560,
                vy: Math.sin(angle) * 560,
                mass: CACTUS_BASE_MASS,
                hits: 0,
                pulse: 0,
              });
            }
            break;
          }
        }
      }
    }
    if (newCacti.length > 0) {
      this.cacti.push(...newCacti);
    }

    for (const cactus of this.cacti) {
      cactus.pulse += dt * 2.8;
      cactus.x += cactus.vx * dt;
      cactus.y += cactus.vy * dt;
      const cDrag = Math.exp(-3.6 * dt);
      cactus.vx *= cDrag;
      cactus.vy *= cDrag;
      const cr = massToRadius(cactus.mass);
      cactus.x = Math.max(cr + 20, Math.min(this.arenaSize - cr - 20, cactus.x));
      cactus.y = Math.max(cr + 20, Math.min(this.arenaSize - cr - 20, cactus.y));
    }

    // 7. Cells eat food
    for (const c of this.cells) {
      if (deadCellIds.has(c.id)) continue;
      const r = massToRadius(c.mass);
      for (const f of this.food) {
        if (removedFoodIds.has(f.id)) continue;
        if (f.kind === 'ejected' && f.ownerId === c.ownerId && f.age < 0.35) continue;
        const dx = f.x - c.x;
        const dy = f.y - c.y;
        if (dx * dx + dy * dy < (r - 2) * (r - 2)) {
          removedFoodIds.add(f.id);
          c.mass += f.mass;
          c.mouthOpen = Math.max(c.mouthOpen, f.kind === 'cacho' ? 0.85 : 0.45);
        }
      }
    }
    if (removedFoodIds.size > 0) {
      this.food = this.food.filter((f) => !removedFoodIds.has(f.id));
    }

    // 8. Cells hit Cacti (burst!)
    const poppedCactiIds = new Set<number>();
    const burstCells: MonkeyCell[] = [];
    for (const c of this.cells) {
      if (deadCellIds.has(c.id)) continue;
      const r = massToRadius(c.mass);

      for (const cactus of this.cacti) {
        if (poppedCactiIds.has(cactus.id)) continue;
        if (c.mass < cactus.mass * EAT_MASS_RATIO) continue;

        const dist = Math.hypot(cactus.x - c.x, cactus.y - c.y);
        if (dist < r * 0.85) {
          poppedCactiIds.add(cactus.id);
          // Count current living cells of owner
          const ownerCount =
            this.cells.filter((x) => x.ownerId === c.ownerId && !deadCellIds.has(x.id)).length +
            burstCells.filter((x) => x.ownerId === c.ownerId).length;
          const maxAdd = Math.max(0, MAX_CELLS_PER_PLAYER - ownerCount);
          const pieces = Math.min(7, maxAdd);

          if (pieces > 0) {
            const totalMassAfter = c.mass * 0.92;
            const mainMass = totalMassAfter * 0.32;
            const pieceMass = (totalMassAfter - mainMass) / pieces;
            c.mass = mainMass;
            c.mergeTimer = 14;
            c.wobbleAmp = 0.25;

            for (let k = 0; k < pieces; k++) {
              const ang = (Math.PI * 2 * k) / pieces + Math.random() * 0.35;
              const spd = 480 + Math.random() * 200;
              burstCells.push({
                id: this.nextEntityId++,
                ownerId: c.ownerId,
                name: c.name,
                skin: c.skin,
                team: c.team,
                x: c.x + Math.cos(ang) * (r * 0.45),
                y: c.y + Math.sin(ang) * (r * 0.45),
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd,
                mass: pieceMass,
                mergeTimer: 12 + pieceMass * 0.04,
                isBot: c.isBot,
                lookAngle: ang,
                mouthOpen: 0.9,
                scared: 1,
                wobblePhase: Math.random() * Math.PI * 2,
                wobbleAmp: 0.2,
              });
            }
          } else {
            // Even at max split, cactus hurts & scatters a little
            c.mass += 25;
          }

          this.pendingEvents.push({
            kind: 'cactus_pop',
            x: cactus.x,
            y: cactus.y,
            actorId: c.ownerId,
            text: CACTUS_QUOTES[Math.floor(Math.random() * CACTUS_QUOTES.length)],
          });
          break;
        }
      }
    }
    if (poppedCactiIds.size > 0) {
      this.cacti = this.cacti.filter((ca) => !poppedCactiIds.has(ca.id));
    }
    if (burstCells.length > 0) {
      this.cells.push(...burstCells);
    }

    // 9. Cell vs Cell predation
    for (let i = 0; i < this.cells.length; i++) {
      const a = this.cells[i];
      if (deadCellIds.has(a.id)) continue;

      for (let j = i + 1; j < this.cells.length; j++) {
        const b = this.cells[j];
        if (deadCellIds.has(b.id) || a.ownerId === b.ownerId) continue;
        if (this.mode === 'teams' && a.team === b.team && a.team !== 0) continue;

        const rA = massToRadius(a.mass);
        const rB = massToRadius(b.mass);
        const dist = Math.hypot(b.x - a.x, b.y - a.y);

        if (a.mass >= b.mass * EAT_MASS_RATIO && dist < rA - rB * 0.35) {
          a.mass += b.mass;
          a.mouthOpen = 1;
          a.wobbleAmp = Math.min(0.24, a.wobbleAmp + 0.11);
          deadCellIds.add(b.id);
          this.pendingEvents.push({
            kind: 'eat_cell',
            x: b.x,
            y: b.y,
            actorId: a.ownerId,
            targetId: b.ownerId,
            actorName: a.name,
            targetName: b.name,
            mass: Math.round(b.mass),
            text: EAT_QUOTES[Math.floor(Math.random() * EAT_QUOTES.length)],
          });
        } else if (b.mass >= a.mass * EAT_MASS_RATIO && dist < rB - rA * 0.35) {
          b.mass += a.mass;
          b.mouthOpen = 1;
          b.wobbleAmp = Math.min(0.24, b.wobbleAmp + 0.11);
          deadCellIds.add(a.id);
          this.pendingEvents.push({
            kind: 'eat_cell',
            x: a.x,
            y: a.y,
            actorId: b.ownerId,
            targetId: a.ownerId,
            actorName: b.name,
            targetName: a.name,
            mass: Math.round(a.mass),
            text: EAT_QUOTES[Math.floor(Math.random() * EAT_QUOTES.length)],
          });
          break;
        }
      }
    }

    if (deadCellIds.size > 0) {
      this.cells = this.cells.filter((c) => !deadCellIds.has(c.id));
    }

    // 10. Compute scared state & update stats/deaths/leaderboard
    const ownerTotals = new Map<string, number>();
    for (const c of this.cells) {
      ownerTotals.set(c.ownerId, (ownerTotals.get(c.ownerId) ?? 0) + c.mass);

      let maxFear = 0;
      const r = massToRadius(c.mass);
      for (const other of this.cells) {
        if (other.ownerId === c.ownerId) continue;
        if (this.mode === 'teams' && other.team === c.team && c.team !== 0) continue;
        if (other.mass < c.mass * EAT_MASS_RATIO) continue;
        const otherR = massToRadius(other.mass);
        const gap = Math.hypot(other.x - c.x, other.y - c.y) - r - otherR;
        if (gap < 280) {
          const fear = Math.max(0, Math.min(1, 1 - gap / 280));
          if (fear > maxFear) maxFear = fear;
        }
      }
      c.scared += (maxFear - c.scared) * Math.min(1, dt * 10);
    }

    // Attribute kills & check eliminated players
    const killCreditByTarget = new Map<string, { killerId: string; killerName: string }>();
    for (const ev of this.pendingEvents) {
      if (ev.kind === 'eat_cell' && ev.targetId && ev.actorId && ev.actorName) {
        killCreditByTarget.set(ev.targetId, {
          killerId: ev.actorId,
          killerName: ev.actorName,
        });
      }
    }

    let t1Mass = 0;
    let t2Mass = 0;
    const lbEntries: LeaderboardEntry[] = [];

    for (const st of this.stats.values()) {
      const total = ownerTotals.get(st.ownerId) ?? 0;
      if (total > 0) {
        st.peakMass = Math.max(st.peakMass, Math.round(total));
        if (st.team === 1) t1Mass += total;
        else if (st.team === 2) t2Mass += total;

        lbEntries.push({
          ownerId: st.ownerId,
          name: st.name,
          mass: Math.round(total),
          team: st.team,
          isBot: st.isBot,
          skin: st.skin,
        });
      } else if (st.alive) {
        st.alive = false;
        const killerInfo = killCreditByTarget.get(st.ownerId);
        st.lastKiller = killerInfo?.killerName ?? 'um Macaco Misterioso';
        if (killerInfo) {
          const killerStats = this.stats.get(killerInfo.killerId);
          if (killerStats) killerStats.kills++;
        }
        if (st.isBot) {
          st.respawnCooldown = 2.0 + Math.random() * 2.5;
        } else {
          this.pendingDeaths.push({
            ownerId: st.ownerId,
            killer: st.lastKiller,
            peakMass: st.peakMass,
            kills: st.kills,
            aliveTime: Math.round(st.aliveTime),
          });
        }
      }
    }

    lbEntries.sort((a, b) => b.mass - a.mass);
    this.leaderboard = lbEntries;
    this.teamMass = [Math.round(t1Mass), Math.round(t2Mass)];

    return {
      events: this.pendingEvents,
      deaths: this.pendingDeaths,
    };
  }

  buildSnapshot(includeAllFood: boolean): SnapshotPayload {
    const ejected: number[] = [];
    const allFood: number[] | undefined = includeAllFood ? [] : undefined;

    for (const f of this.food) {
      const kindInt = f.kind === 'banana' ? 0 : f.kind === 'cacho' ? 1 : 2;
      if (f.kind === 'ejected') {
        ejected.push(f.id, Math.round(f.x), Math.round(f.y), kindInt);
      } else if (allFood) {
        allFood.push(f.id, Math.round(f.x), Math.round(f.y), kindInt);
      }
    }

    return {
      tick: this.tickCount,
      mode: this.mode,
      arenaSize: this.arenaSize,
      cells: this.cells.map((c) => ({
        id: c.id,
        o: c.ownerId,
        n: c.name,
        s: c.skin,
        t: c.team,
        x: Math.round(c.x * 10) / 10,
        y: Math.round(c.y * 10) / 10,
        m: Math.round(c.mass * 10) / 10,
        b: c.isBot,
        a: Math.round(c.lookAngle * 100) / 100,
        mo: Math.round(c.mouthOpen * 100) / 100,
        sc: Math.round(c.scared * 100) / 100,
      })),
      cacti: this.cacti.map((ca) => ({
        id: ca.id,
        x: Math.round(ca.x),
        y: Math.round(ca.y),
        m: Math.round(ca.mass),
      })),
      food: allFood,
      ejected,
      leaderboard: this.leaderboard.slice(0, 10),
      teamMass: this.teamMass,
      deaths: this.pendingDeaths,
      events: this.pendingEvents,
    };
  }
}
