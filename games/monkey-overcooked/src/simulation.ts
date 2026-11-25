import { GRID_COLS, GRID_ROWS, KITCHENS, parseLayoutChar } from './kitchens';
import {
  INGREDIENTS,
  RECIPES,
  SHOUT_MESSAGES,
  canAcceptInBlender,
  canAcceptInFryer,
  canAcceptInGrill,
  canAcceptInPot,
  canPlaceIngredientOnPlate,
  matchCompletedRecipe,
  matchPotRecipe,
} from './recipes';
import type {
  BananaPeel,
  ChefInputState,
  ChefState,
  FloatingText,
  FloorItem,
  GameMode,
  HeldItem,
  KitchenDef,
  KitchenId,
  OrderTicket,
  RecipeId,
  SimParticle,
  SimSnapshot,
  SimSoundEvent,
  ThiefRat,
  ThrownItem,
  TileState,
} from './types';

export interface SimCallbacks {
  onSound?: (sound: SimSoundEvent) => void;
  onFloatText?: (x: number, y: number, text: string, color: string) => void;
  skipCountdown?: boolean;
}

const CHEF_COLORS = ['#facc15', '#4ade80', '#fb7185', '#38bdf8'];
const CHEF_RADIUS = 0.31;
const CHEF_SPEED = 4.75;
const DASH_SPEED = 12.0;
const DASH_DURATION = 0.16;
const DASH_COOLDOWN = 0.6;

export class KitchenSimulation {
  public kitchen: KitchenDef;
  public mode: GameMode;
  public tiles: TileState[] = [];
  public chefs: ChefState[] = [];
  public thrown: ThrownItem[] = [];
  public floorItems: FloorItem[] = [];
  public orders: OrderTicket[] = [];
  public rats: ThiefRat[] = [];
  public peels: BananaPeel[] = [];
  public particles: SimParticle[] = [];
  public floatingTexts: FloatingText[] = [];

  public timeLeft: number;
  public totalTime: number;
  public countdown: number;
  public rushHour = false;
  public score = 0;
  public tipsEarned = 0;
  public combo = 1;
  public maxCombo = 1;
  public deliveredCount = 0;
  public failedCount = 0;
  public firesExtinguished = 0;
  public finished = false;

  public bridgeDocked = true;
  public bridgeTimer = 8.5;
  public bridgeWarning = false;
  public shake = 0;

  private nextId = 1;
  private orderSpawnTimer = 2.4;
  private pendingReturns: number[] = [];
  private ratSpawnTimer = 22;
  private peelSpawnTimer = 18;
  private rushAnnounced = false;
  private lastCountdownStep = 3;
  private callbacks: SimCallbacks;

  constructor(
    kitchenId: KitchenId,
    mode: GameMode,
    playerProfiles: Array<{ id: string; name: string; color?: string }>,
    callbacks: SimCallbacks = {},
  ) {
    this.kitchen = KITCHENS[kitchenId];
    this.mode = mode;
    this.callbacks = callbacks;
    this.timeLeft = this.kitchen.duration;
    this.totalTime = this.kitchen.duration;
    this.countdown = callbacks.skipCountdown ? 0 : 1.8;
    this.lastCountdownStep = 3;

    this.buildTiles();
    this.spawnChefs(playerProfiles);

    // Spawn 2 initial orders: start with a signature soup if available, then another dish
    const soupFirst = this.kitchen.recipes.find(
      (r) => r === 'sopa_macacao' || r === 'sopa_banana',
    );
    if (soupFirst) {
      this.spawnOrder(soupFirst);
    } else {
      this.spawnOrder();
    }
    this.spawnOrder();
  }

  private buildTiles(): void {
    this.tiles = [];
    for (let y = 0; y < GRID_ROWS; y++) {
      const rowStr = this.kitchen.layout[y] ?? '#............#';
      for (let x = 0; x < GRID_COLS; x++) {
        const ch = rowStr[x] ?? '#';
        const parsed = parseLayoutChar(ch);
        const tile: TileState = {
          x,
          y,
          baseType: parsed.baseType,
          crateIngredient: parsed.crateIngredient,
          conveyorDir: parsed.conveyorDir,
          item: null,
          cookContents: [],
          cookProgress: 0,
          burnProgress: 0,
          cookedResult: null,
          washProgress: 0,
          dirtyCount: 0,
          cleanPlateCount: parsed.baseType === 'plates' ? 4 : 0,
          fire: 0,
          conveyorOffset: 0,
        };
        if (parsed.baseType === 'extinguisher_stand') {
          tile.item = { kind: 'extinguisher' };
        }
        this.tiles.push(tile);
      }
    }
  }

  private spawnChefs(profiles: Array<{ id: string; name: string; color?: string }>): void {
    const count = Math.max(1, Math.min(4, profiles.length));
    this.chefs = [];
    for (let i = 0; i < count; i++) {
      const prof = profiles[i];
      const spawn = this.kitchen.spawns[i % this.kitchen.spawns.length];
      this.chefs.push({
        id: prof.id,
        index: i,
        name: prof.name,
        color: prof.color || CHEF_COLORS[i % CHEF_COLORS.length],
        x: spawn.x,
        y: spawn.y,
        vx: 0,
        vy: 0,
        dirX: 0,
        dirY: 1,
        held: null,
        dashTimer: 0,
        dashCooldown: 0,
        slipTimer: 0,
        isWorking: false,
        autoWorkTile: null,
        shoutText: null,
        shoutTimer: 0,
        targetTile: null,
        walkCycle: 0,
        panic: false,
      });
    }
  }

  public syncOnlineRoster(profiles: Array<{ id: string; name: string; color?: string }>): void {
    const capped = profiles.slice(0, 4);
    const existingById = new Map(this.chefs.map((c) => [c.id, c]));
    const nextChefs: ChefState[] = [];
    for (let i = 0; i < capped.length; i++) {
      const p = capped[i];
      const old = existingById.get(p.id);
      if (old) {
        old.index = i;
        old.name = p.name;
        old.color = p.color || CHEF_COLORS[i % CHEF_COLORS.length];
        nextChefs.push(old);
      } else {
        const spawn = this.kitchen.spawns[i % this.kitchen.spawns.length];
        nextChefs.push({
          id: p.id,
          index: i,
          name: p.name,
          color: p.color || CHEF_COLORS[i % CHEF_COLORS.length],
          x: spawn.x,
          y: spawn.y,
          vx: 0,
          vy: 0,
          dirX: 0,
          dirY: 1,
          held: null,
          dashTimer: 0,
          dashCooldown: 0,
          slipTimer: 0,
          isWorking: false,
          autoWorkTile: null,
          shoutText: null,
          shoutTimer: 0,
          targetTile: null,
          walkCycle: 0,
          panic: false,
        });
      }
    }
    if (nextChefs.length > 0) {
      this.chefs = nextChefs;
    }
  }

  public getTile(x: number, y: number): TileState | null {
    if (x < 0 || y < 0 || x >= GRID_COLS || y >= GRID_ROWS) return null;
    return this.tiles[y * GRID_COLS + x] ?? null;
  }

  private isTileWalkable(tile: TileState | null): boolean {
    if (!tile) return false;
    if (tile.baseType === 'floor') return true;
    if (tile.baseType === 'bridge') return this.bridgeDocked;
    return false;
  }

  private findNearestFloorPoint(x: number, y: number, preferSide?: 'left' | 'right'): { x: number; y: number } {
    let bestX = Math.max(1.5, Math.min(GRID_COLS - 1.5, x));
    let bestY = Math.max(1.5, Math.min(GRID_ROWS - 1.5, y));
    let bestDist = Infinity;

    for (const tile of this.tiles) {
      if (tile.baseType !== 'floor') continue;
      if (preferSide === 'left' && tile.x >= GRID_COLS * 0.5) continue;
      if (preferSide === 'right' && tile.x < GRID_COLS * 0.5) continue;
      const cx = tile.x + 0.5;
      const cy = tile.y + 0.5;
      const d = Math.hypot(cx - x, cy - y);
      if (d < bestDist) {
        bestDist = d;
        bestX = cx;
        bestY = cy;
      }
    }
    return { x: bestX, y: bestY };
  }

  private isTileInteractive(tile: TileState | null): boolean {
    if (!tile) return false;
    return (
      tile.baseType !== 'floor' &&
      tile.baseType !== 'wall' &&
      tile.baseType !== 'gap' &&
      tile.baseType !== 'bridge'
    );
  }

  private emitSound(sound: SimSoundEvent): void {
    this.callbacks.onSound?.(sound);
  }

  private addFloatText(x: number, y: number, text: string, color: string): void {
    this.floatingTexts.push({ x, y, text, color, life: 1.2, maxLife: 1.2 });
    this.callbacks.onFloatText?.(x, y, text, color);
  }

  public spawnParticles(
    x: number,
    y: number,
    z: number,
    count: number,
    color: string,
    kind: SimParticle['kind'],
    speed = 1.6,
  ): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = (0.3 + Math.random() * 0.7) * speed;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 0.25,
        y: y + (Math.random() - 0.5) * 0.25,
        z,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        vz: kind === 'steam' ? 0.65 + Math.random() * 0.55 : 0.8 + Math.random() * 1.4,
        color,
        size:
          kind === 'smoke' || kind === 'foam' || kind === 'steam'
            ? 5 + Math.random() * 6
            : 3 + Math.random() * 4,
        life: kind === 'steam' ? 0.65 + Math.random() * 0.35 : 0.45 + Math.random() * 0.4,
        maxLife: 0.95,
        kind,
      });
    }
  }

  public step(dt: number, inputsByChefId: Record<string, ChefInputState>): void {
    if (this.finished) {
      this.updateVisualParticles(dt);
      return;
    }

    const clampedDt = Math.min(dt, 0.05);
    this.shake = Math.max(0, this.shake - clampedDt * 24);

    // 0. Snappy 3-2-1-JÁ! countdown before the shift starts
    if (this.countdown > 0) {
      this.countdown = Math.max(0, this.countdown - clampedDt);
      const stepNum = Math.ceil(this.countdown / 0.6);
      if (stepNum < this.lastCountdownStep && stepNum > 0) {
        this.lastCountdownStep = stepNum;
        this.emitSound('tick');
      } else if (this.countdown === 0 && this.lastCountdownStep > 0) {
        this.lastCountdownStep = 0;
        this.emitSound('start');
        this.addFloatText(GRID_COLS * 0.5, GRID_ROWS * 0.45, '🍲 MÃO NA SOPA!', '#fde047');
      }
      this.updateVisualParticles(clampedDt);
      return;
    }

    this.timeLeft = Math.max(0, this.timeLeft - clampedDt);

    if (this.timeLeft <= 0) {
      this.finished = true;
      return;
    }

    // Rush Hour in the final 35 seconds!
    if (!this.rushAnnounced && this.timeLeft <= 35) {
      this.rushAnnounced = true;
      this.rushHour = true;
      this.shake = 6;
      this.emitSound('rush');
      this.addFloatText(GRID_COLS * 0.5, 1.5, '🔥 HORA DO RUSH! +25% GORJETA!', '#fde047');
    }

    // 1. Bridge cycle (Kitchen 2 & 5)
    if (this.kitchen.hasBridgeCycle) {
      this.bridgeTimer -= clampedDt;
      this.bridgeWarning = this.bridgeDocked && this.bridgeTimer <= 2.4;
      if (this.bridgeTimer <= 0) {
        this.bridgeDocked = !this.bridgeDocked;
        this.bridgeTimer = this.bridgeDocked ? 9.0 : 4.8;
        this.bridgeWarning = false;
        this.emitSound('bridge');
        if (!this.bridgeDocked) {
          // Safely push any chef standing on retracted bridge onto nearest real floor tile
          for (const chef of this.chefs) {
            const tile = this.getTile(Math.floor(chef.x), Math.floor(chef.y));
            if (tile?.baseType === 'bridge') {
              const side = chef.x < GRID_COLS * 0.5 ? 'left' : 'right';
              const safe = this.findNearestFloorPoint(chef.x, chef.y, side);
              chef.x = safe.x;
              chef.y = safe.y;
              this.addFloatText(chef.x, chef.y - 0.5, 'PULOU! 🐒', '#fde047');
            }
          }
          // Rescue floor items on retracted bridge to nearest edge floor
          for (const fi of this.floorItems) {
            const tile = this.getTile(Math.floor(fi.x), Math.floor(fi.y));
            if (tile?.baseType === 'bridge') {
              const side = fi.x < GRID_COLS * 0.5 ? 'left' : 'right';
              const safe = this.findNearestFloorPoint(fi.x, fi.y, side);
              fi.x = safe.x;
              fi.y = safe.y;
            }
          }
        }
      }
    }

    // 2. Chefs movement & actions
    for (const chef of this.chefs) {
      const inp = inputsByChefId[chef.id] ?? {
        moveX: 0,
        moveY: 0,
        interactPressed: false,
        workHeld: false,
        workPressed: false,
        throwPressed: false,
        dashPressed: false,
        shoutIndex: 0,
      };
      this.updateChef(chef, inp, clampedDt);
    }

    // Chef-vs-chef bump collisions
    for (let i = 0; i < this.chefs.length; i++) {
      for (let j = i + 1; j < this.chefs.length; j++) {
        const a = this.chefs[i];
        const b = this.chefs[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const minDist = CHEF_RADIUS * 1.9;
        if (dist > 0.001 && dist < minDist) {
          const nx = dx / dist;
          const ny = dy / dist;
          const overlap = (minDist - dist) * 0.5;
          this.moveChefBy(a, -nx * overlap, -ny * overlap);
          this.moveChefBy(b, nx * overlap, ny * overlap);

          if (a.dashTimer > 0 && b.dashTimer <= 0) {
            b.vx += nx * 7;
            b.vy += ny * 7;
            this.emitSound('slip');
            this.spawnParticles((a.x + b.x) / 2, (a.y + b.y) / 2, 0.3, 6, '#fef08a', 'spark', 2.2);
          } else if (b.dashTimer > 0 && a.dashTimer <= 0) {
            a.vx -= nx * 7;
            a.vy -= ny * 7;
            this.emitSound('slip');
            this.spawnParticles((a.x + b.x) / 2, (a.y + b.y) / 2, 0.3, 6, '#fef08a', 'spark', 2.2);
          }
        }
      }
    }

    // 3. Thrown items physics
    this.updateThrownItems(clampedDt);

    // 4. Stations: cooking, simmering soup, burning, fire spread, conveyors
    this.updateStations(clampedDt);

    // 5. Dirty plate returns
    for (let i = this.pendingReturns.length - 1; i >= 0; i--) {
      this.pendingReturns[i] -= clampedDt;
      if (this.pendingReturns[i] <= 0) {
        this.pendingReturns.splice(i, 1);
        const ret = this.tiles.find((t) => t.baseType === 'return');
        if (ret) {
          ret.dirtyCount += 1;
          this.spawnParticles(ret.x + 0.5, ret.y + 0.5, 0.4, 4, '#cbd5e1', 'dust', 1.1);
        }
      }
    }

    // 6. Orders spawn & patience countdown
    this.updateOrders(clampedDt);

    // 7. Chaos hazards: Thief Rat & Banana Peels
    this.updateHazards(clampedDt);

    // 8. Panic expressions near fire
    for (const chef of this.chefs) {
      let nearFire = chef.slipTimer > 0;
      if (!nearFire) {
        for (const t of this.tiles) {
          if (t.fire > 0 && Math.hypot(t.x + 0.5 - chef.x, t.y + 0.5 - chef.y) < 3.0) {
            nearFire = true;
            break;
          }
        }
      }
      chef.panic = nearFire;
    }

    // 9. Particles & floating text
    this.updateVisualParticles(clampedDt);
  }

  private updateChef(chef: ChefState, inp: ChefInputState, dt: number): void {
    if (chef.shoutTimer > 0) {
      chef.shoutTimer = Math.max(0, chef.shoutTimer - dt);
      if (chef.shoutTimer === 0) chef.shoutText = null;
    }
    if (inp.shoutIndex >= 1 && inp.shoutIndex <= 4) {
      chef.shoutText = SHOUT_MESSAGES[inp.shoutIndex - 1];
      chef.shoutTimer = 2.6;
      this.emitSound('shout');
    }

    chef.dashCooldown = Math.max(0, chef.dashCooldown - dt);
    chef.dashTimer = Math.max(0, chef.dashTimer - dt);
    chef.isWorking = false;

    if (chef.slipTimer > 0) {
      chef.slipTimer = Math.max(0, chef.slipTimer - dt);
      chef.autoWorkTile = null;
      const angle = Math.atan2(chef.dirY, chef.dirX) + dt * 16;
      chef.dirX = Math.cos(angle);
      chef.dirY = Math.sin(angle);
      this.moveChefBy(chef, chef.vx * dt, chef.vy * dt);
      chef.vx *= Math.pow(0.05, dt);
      chef.vy *= Math.pow(0.05, dt);
      this.updateTargetTile(chef);
      return;
    }

    let mx = inp.moveX;
    let my = inp.moveY;
    const mag = Math.hypot(mx, my);
    if (mag > 0.01) {
      mx /= mag;
      my /= mag;
      chef.dirX = mx;
      chef.dirY = my;
      chef.walkCycle += dt * 14.5;
      chef.autoWorkTile = null;
    }

    if (inp.dashPressed && chef.dashCooldown <= 0) {
      chef.dashTimer = DASH_DURATION;
      chef.dashCooldown = DASH_COOLDOWN;
      chef.autoWorkTile = null;
      this.emitSound('dash');
      this.spawnParticles(chef.x, chef.y, 0.15, 7, '#fde68a', 'dust', 2.2);
    }

    const feverBoost = this.combo >= 3 || this.rushHour ? 1.08 : 1.0;
    const speed = chef.dashTimer > 0 ? DASH_SPEED : CHEF_SPEED * feverBoost;
    const targetVx = chef.dashTimer > 0 ? chef.dirX * speed : mx * speed;
    const targetVy = chef.dashTimer > 0 ? chef.dirY * speed : my * speed;

    chef.vx = targetVx + (chef.vx - targetVx) * Math.pow(0.001, dt);
    chef.vy = targetVy + (chef.vy - targetVy) * Math.pow(0.001, dt);

    if (chef.dashTimer > 0) {
      this.moveChefBy(chef, chef.dirX * DASH_SPEED * dt, chef.dirY * DASH_SPEED * dt);
      if (Math.random() < 0.6) {
        this.spawnParticles(chef.x, chef.y, 0.12, 1, '#fef08a', 'spark', 0.9);
      }
    } else {
      this.moveChefBy(chef, chef.vx * dt, chef.vy * dt);
      if ((this.combo >= 3 || this.rushHour) && mag > 0.01 && Math.random() < 0.14) {
        this.spawnParticles(chef.x, chef.y, 0.1, 1, '#facc15', 'spark', 0.6);
      }
    }

    // Banana peel slip check
    if (chef.dashTimer <= 0) {
      for (let i = this.peels.length - 1; i >= 0; i--) {
        const peel = this.peels[i];
        if (Math.hypot(chef.x - peel.x, chef.y - peel.y) < 0.45) {
          this.peels.splice(i, 1);
          chef.slipTimer = 0.6;
          chef.vx = chef.dirX * 3.5;
          chef.vy = chef.dirY * 3.5;
          this.emitSound('slip');
          this.addFloatText(chef.x, chef.y - 0.6, 'ESCORREGOU! 🍌', '#facc15');
          this.spawnParticles(chef.x, chef.y, 0.2, 7, '#facc15', 'chop', 2.0);
          break;
        }
      }
    }

    if (chef.dashTimer > 0) {
      this.scareRatsNear(chef.x, chef.y, 0.95);
    }

    this.updateTargetTile(chef);

    if (inp.interactPressed) {
      chef.autoWorkTile = null;
      this.handleInteract(chef);
    }

    if (inp.throwPressed) {
      chef.autoWorkTile = null;
      this.handleThrow(chef);
    }

    this.handleWork(chef, inp.workHeld, inp.workPressed, dt);
  }

  private moveChefBy(chef: ChefState, dx: number, dy: number): void {
    chef.x += dx;
    this.resolveTileCollisions(chef);
    chef.y += dy;
    this.resolveTileCollisions(chef);
  }

  private resolveTileCollisions(chef: ChefState): void {
    const minTx = Math.max(0, Math.floor(chef.x - CHEF_RADIUS - 0.05));
    const maxTx = Math.min(GRID_COLS - 1, Math.floor(chef.x + CHEF_RADIUS + 0.05));
    const minTy = Math.max(0, Math.floor(chef.y - CHEF_RADIUS - 0.05));
    const maxTy = Math.min(GRID_ROWS - 1, Math.floor(chef.y + CHEF_RADIUS + 0.05));

    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        const tile = this.getTile(tx, ty);
        if (this.isTileWalkable(tile)) continue;

        const closestX = Math.max(tx, Math.min(chef.x, tx + 1));
        const closestY = Math.max(ty, Math.min(chef.y, ty + 1));
        const distX = chef.x - closestX;
        const distY = chef.y - closestY;
        const distSq = distX * distX + distY * distY;

        if (distSq < CHEF_RADIUS * CHEF_RADIUS) {
          const dist = Math.sqrt(distSq);
          if (dist > 0.0001) {
            const push = CHEF_RADIUS - dist;
            chef.x += (distX / dist) * push;
            chef.y += (distY / dist) * push;
          } else {
            chef.x += 0.05;
          }
        }
      }
    }

    chef.x = Math.max(CHEF_RADIUS, Math.min(GRID_COLS - CHEF_RADIUS, chef.x));
    chef.y = Math.max(CHEF_RADIUS, Math.min(GRID_ROWS - CHEF_RADIUS, chef.y));
  }

  private updateTargetTile(chef: ChefState): void {
    const probes = [0.68, 0.85, 0.52];
    for (const dist of probes) {
      const tx = Math.floor(chef.x + chef.dirX * dist);
      const ty = Math.floor(chef.y + chef.dirY * dist);
      const tile = this.getTile(tx, ty);
      if (this.isTileInteractive(tile)) {
        chef.targetTile = { x: tx, y: ty };
        return;
      }
    }

    const cx = Math.floor(chef.x);
    const cy = Math.floor(chef.y);
    let best: { x: number; y: number; score: number } | null = null;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        if (ox === 0 && oy === 0) continue;
        const tile = this.getTile(cx + ox, cy + oy);
        if (!this.isTileInteractive(tile) || !tile) continue;
        const vx = tile.x + 0.5 - chef.x;
        const vy = tile.y + 0.5 - chef.y;
        const d = Math.hypot(vx, vy);
        if (d > 1.18) continue;
        const dot = (vx * chef.dirX + vy * chef.dirY) / (d || 1);
        if (dot > 0.42) {
          const score = dot * 2 - d;
          if (!best || score > best.score) {
            best = { x: tile.x, y: tile.y, score };
          }
        }
      }
    }
    chef.targetTile = best ? { x: best.x, y: best.y } : null;
  }

  private scareRatsNear(x: number, y: number, radius: number): boolean {
    let scared = false;
    for (const rat of this.rats) {
      if (Math.hypot(rat.x - x, rat.y - y) <= radius) {
        if (rat.carrying) {
          const safe = this.findNearestFloorPoint(rat.x, rat.y);
          this.floorItems.push({
            id: this.nextId++,
            x: safe.x,
            y: safe.y,
            item: rat.carrying,
          });
          rat.carrying = null;
        }
        rat.state = 'fleeing';
        rat.stunTimer = 0.25;
        this.emitSound('rat');
        this.addFloatText(rat.x, rat.y - 0.5, 'XÔ RATO! 🐀', '#fb7185');
        this.spawnParticles(rat.x, rat.y, 0.2, 6, '#fda4af', 'dust', 2.0);
        scared = true;
      }
    }
    return scared;
  }

  private handleInteract(chef: ChefState): void {
    if (this.scareRatsNear(chef.x + chef.dirX * 0.65, chef.y + chef.dirY * 0.65, 0.9)) {
      return;
    }

    // Check floor item pickup if hands empty
    if (!chef.held) {
      const fx = chef.x + chef.dirX * 0.45;
      const fy = chef.y + chef.dirY * 0.45;
      let bestIdx = -1;
      let bestDist = 0.72;
      for (let i = 0; i < this.floorItems.length; i++) {
        const fi = this.floorItems[i];
        const d = Math.hypot(fi.x - fx, fi.y - fy);
        const dSelf = Math.hypot(fi.x - chef.x, fi.y - chef.y);
        const minD = Math.min(d, dSelf);
        if (minD < bestDist) {
          bestDist = minD;
          bestIdx = i;
        }
      }
      const target = chef.targetTile ? this.getTile(chef.targetTile.x, chef.targetTile.y) : null;
      const stationEmpty =
        !target ||
        (!target.item &&
          target.cleanPlateCount === 0 &&
          target.dirtyCount === 0 &&
          target.cookedResult === null &&
          target.cookContents.length === 0 &&
          target.baseType !== 'crate');
      if (bestIdx >= 0 && (stationEmpty || bestDist < 0.45)) {
        const [picked] = this.floorItems.splice(bestIdx, 1);
        chef.held = picked.item;
        this.emitSound('pickup');
        return;
      }
    }

    const tile = chef.targetTile ? this.getTile(chef.targetTile.x, chef.targetTile.y) : null;
    if (!tile) {
      if (chef.held) {
        const dropX = Math.max(0.4, Math.min(GRID_COLS - 0.4, chef.x + chef.dirX * 0.5));
        const dropY = Math.max(0.4, Math.min(GRID_ROWS - 0.4, chef.y + chef.dirY * 0.5));
        const dropTile = this.getTile(Math.floor(dropX), Math.floor(dropY));
        if (this.isTileWalkable(dropTile)) {
          this.floorItems.push({
            id: this.nextId++,
            x: dropX,
            y: dropY,
            item: chef.held,
          });
          chef.held = null;
          this.emitSound('drop');
        }
      }
      return;
    }

    switch (tile.baseType) {
      case 'pass': {
        if (chef.held?.kind === 'plate') {
          if (chef.held.burnt) {
            this.addFloatText(tile.x + 0.5, tile.y, 'TÁ QUEIMADO!', '#ef4444');
            this.emitSound('orderFail');
            return;
          }
          const recipeId = matchCompletedRecipe(chef.held.contents);
          if (!recipeId) {
            this.addFloatText(tile.x + 0.5, tile.y, 'INCOMPLETO!', '#fbbf24');
            this.emitSound('orderFail');
            return;
          }
          const orderIdx = this.orders.findIndex((o) => o.recipe === recipeId);
          if (orderIdx === -1) {
            this.addFloatText(tile.x + 0.5, tile.y, 'SEM PEDIDO!', '#fb923c');
            this.emitSound('orderFail');
            return;
          }
          const [order] = this.orders.splice(orderIdx, 1);
          const recipe = RECIPES[recipeId];
          if (orderIdx === 0) {
            this.combo = Math.min(5, this.combo + 1);
          } else {
            this.combo = 1;
          }
          this.maxCombo = Math.max(this.maxCombo, this.combo);
          const rushBonus = this.rushHour ? 1.25 : 1.0;
          const tip = Math.floor(order.timeLeft * 0.5 * rushBonus);
          const baseWithCombo = Math.round(recipe.points * (1 + (this.combo - 1) * 0.25));
          const earned = baseWithCombo + tip;
          this.score += earned;
          this.tipsEarned += tip;
          this.deliveredCount += 1;
          chef.held = null;
          this.pendingReturns.push(2.6);
          this.emitSound(this.combo > 1 ? 'deliverCombo' : 'deliver');
          const comboTxt = this.combo > 1 ? ` 🔥x${this.combo}!` : '!';
          this.addFloatText(tile.x + 0.5, tile.y, `+${earned} ${recipe.emoji}${comboTxt}`, '#4ade80');
          this.spawnParticles(tile.x + 0.5, tile.y + 0.5, 0.5, 14, '#fde047', 'spark', 2.6);
          if (this.orders.length === 0) {
            this.orderSpawnTimer = Math.min(this.orderSpawnTimer, 0.7);
          }
        }
        return;
      }

      case 'trash': {
        if (!chef.held) return;
        if (chef.held.kind === 'plate') {
          if (chef.held.contents.length > 0 || chef.held.burnt) {
            chef.held = { kind: 'plate', contents: [] };
            this.emitSound('drop');
            this.addFloatText(tile.x + 0.5, tile.y, 'PRATO LIMPO!', '#94a3b8');
          }
          return;
        }
        if (chef.held.kind === 'ingredient') {
          chef.held = null;
          this.emitSound('drop');
          this.spawnParticles(tile.x + 0.5, tile.y + 0.5, 0.3, 5, '#94a3b8', 'dust', 1.2);
          return;
        }
        this.addFloatText(tile.x + 0.5, tile.y, 'NÃO JOGUE FORA!', '#fb7185');
        return;
      }

      case 'crate': {
        if (!chef.held && tile.item) {
          chef.held = tile.item;
          tile.item = null;
          this.emitSound('pickup');
          return;
        }
        if (!chef.held && tile.crateIngredient) {
          chef.held = { kind: 'ingredient', ingredient: tile.crateIngredient };
          this.emitSound('pickup');
          return;
        }
        if (chef.held && !tile.item) {
          tile.item = chef.held;
          chef.held = null;
          this.emitSound('drop');
          return;
        }
        if (chef.held && tile.item) {
          this.tryCombineOnTile(chef, tile, false);
        }
        return;
      }

      case 'plates': {
        if (!chef.held && tile.cleanPlateCount > 0) {
          tile.cleanPlateCount -= 1;
          chef.held = { kind: 'plate', contents: [] };
          this.emitSound('pickup');
          return;
        }
        if (
          chef.held?.kind === 'plate' &&
          chef.held.contents.length === 0 &&
          !chef.held.burnt
        ) {
          tile.cleanPlateCount += 1;
          chef.held = null;
          this.emitSound('drop');
          return;
        }
        if (chef.held?.kind === 'ingredient' && tile.cleanPlateCount > 0) {
          if (canPlaceIngredientOnPlate([], chef.held.ingredient)) {
            tile.cleanPlateCount -= 1;
            const contents = [chef.held.ingredient];
            chef.held = {
              kind: 'plate',
              contents,
              dish: matchCompletedRecipe(contents),
            };
            this.emitSound('pickup');
          }
        }
        return;
      }

      case 'return': {
        if (!chef.held && tile.dirtyCount > 0) {
          chef.held = { kind: 'dirty_plate', count: tile.dirtyCount };
          tile.dirtyCount = 0;
          this.emitSound('pickup');
          return;
        }
        if (chef.held?.kind === 'dirty_plate' && tile.dirtyCount > 0) {
          chef.held.count += tile.dirtyCount;
          tile.dirtyCount = 0;
          this.emitSound('pickup');
        }
        return;
      }

      case 'sink': {
        if (chef.held?.kind === 'dirty_plate') {
          tile.dirtyCount += chef.held.count;
          chef.held = null;
          this.emitSound('drop');
          return;
        }
        if (
          chef.held?.kind === 'plate' &&
          chef.held.contents.length === 0 &&
          !chef.held.burnt
        ) {
          tile.cleanPlateCount += 1;
          chef.held = null;
          this.emitSound('drop');
          return;
        }
        if (!chef.held) {
          if (tile.cleanPlateCount > 0) {
            tile.cleanPlateCount -= 1;
            chef.held = { kind: 'plate', contents: [] };
            this.emitSound('pickup');
            return;
          }
          if (tile.dirtyCount > 0) {
            tile.dirtyCount -= 1;
            chef.held = { kind: 'dirty_plate', count: 1 };
            this.emitSound('pickup');
            return;
          }
        }
        return;
      }

      case 'pot':
      case 'grill':
      case 'fryer':
      case 'blender': {
        if (tile.fire > 0) {
          this.addFloatText(tile.x + 0.5, tile.y, 'APAGA O FOGO! 🧯', '#ef4444');
          this.emitSound('alarm');
          return;
        }
        if (tile.cookedResult !== null) {
          if (chef.held?.kind === 'plate' && !chef.held.burnt) {
            if (tile.cookedResult === 'burnt') {
              this.addFloatText(tile.x + 0.5, tile.y, 'QUEIMOU! JOGUE NO LIXO', '#ef4444');
              return;
            }
            if (canPlaceIngredientOnPlate(chef.held.contents, tile.cookedResult)) {
              chef.held.contents.push(tile.cookedResult);
              chef.held.dish = matchCompletedRecipe(chef.held.contents);
              this.resetAppliance(tile);
              this.emitSound('pickup');
              this.spawnParticles(tile.x + 0.5, tile.y + 0.5, 0.5, 5, '#fef08a', 'steam', 1.1);
              return;
            }
          } else if (!chef.held) {
            chef.held = { kind: 'ingredient', ingredient: tile.cookedResult };
            this.resetAppliance(tile);
            this.emitSound('pickup');
            return;
          }
        } else if (chef.held?.kind === 'ingredient') {
          const ing = chef.held.ingredient;
          const ok =
            (tile.baseType === 'pot' && canAcceptInPot(tile.cookContents, tile.cookedResult, ing)) ||
            (tile.baseType === 'grill' && canAcceptInGrill(tile.cookContents, tile.cookedResult, ing)) ||
            (tile.baseType === 'fryer' && canAcceptInFryer(tile.cookContents, tile.cookedResult, ing)) ||
            (tile.baseType === 'blender' && canAcceptInBlender(tile.cookContents, tile.cookedResult, ing));
          if (ok) {
            tile.cookContents.push(ing);
            chef.held = null;
            this.emitSound('drop');
            if (tile.baseType === 'pot') {
              this.spawnParticles(tile.x + 0.5, tile.y + 0.5, 0.45, 4, '#fde68a', 'steam', 1.0);
            }
            return;
          } else {
            const msg =
              tile.baseType === 'pot' && INGREDIENTS[ing].choppableTo
                ? 'PIQUE ANTES! 🔪'
                : 'NÃO VAI AÍ!';
            this.addFloatText(tile.x + 0.5, tile.y, msg, '#fb923c');
            return;
          }
        } else if (!chef.held && tile.cookContents.length > 0 && tile.cookProgress === 0) {
          // Retrieve unfinished ingredient from appliance if not yet cooking
          const popped = tile.cookContents.pop();
          if (popped) {
            chef.held = { kind: 'ingredient', ingredient: popped };
            this.emitSound('pickup');
          }
          return;
        }
        return;
      }

      case 'counter':
      case 'board':
      case 'conveyor':
      case 'extinguisher_stand': {
        if (tile.fire > 0) {
          this.addFloatText(tile.x + 0.5, tile.y, 'TÁ PEGANDO FOGO!', '#ef4444');
          return;
        }
        if (!chef.held && tile.item) {
          chef.held = tile.item;
          tile.item = null;
          tile.conveyorOffset = 0;
          this.emitSound('pickup');
          return;
        }
        if (chef.held && !tile.item) {
          tile.item = chef.held;
          chef.held = null;
          tile.conveyorOffset = 0;
          this.emitSound('drop');
          return;
        }
        if (chef.held && tile.item) {
          this.tryCombineOnTile(chef, tile, tile.baseType === 'counter');
        }
        return;
      }
    }
  }

  private tryCombineOnTile(chef: ChefState, tile: TileState, allowSwap: boolean): void {
    if (!chef.held || !tile.item) return;

    if (tile.item.kind === 'plate' && chef.held.kind === 'ingredient' && !tile.item.burnt) {
      if (canPlaceIngredientOnPlate(tile.item.contents, chef.held.ingredient)) {
        tile.item.contents.push(chef.held.ingredient);
        tile.item.dish = matchCompletedRecipe(tile.item.contents);
        chef.held = null;
        this.emitSound('pickup');
        return;
      }
    }

    if (chef.held.kind === 'plate' && tile.item.kind === 'ingredient' && !chef.held.burnt) {
      if (canPlaceIngredientOnPlate(chef.held.contents, tile.item.ingredient)) {
        chef.held.contents.push(tile.item.ingredient);
        chef.held.dish = matchCompletedRecipe(chef.held.contents);
        tile.item = null;
        this.emitSound('pickup');
        return;
      }
    }

    if (chef.held.kind === 'dirty_plate' && tile.item.kind === 'dirty_plate') {
      tile.item.count += chef.held.count;
      chef.held = null;
      this.emitSound('drop');
      return;
    }

    if (allowSwap) {
      const tmp = tile.item;
      tile.item = chef.held;
      chef.held = tmp;
      this.emitSound('pickup');
    }
  }

  private resetAppliance(tile: TileState): void {
    tile.cookContents = [];
    tile.cookProgress = 0;
    tile.burnProgress = 0;
    tile.cookedResult = null;
  }

  private handleThrow(chef: ChefState): void {
    if (!chef.held) return;
    if (chef.held.kind !== 'ingredient') {
      this.addFloatText(chef.x, chef.y - 0.5, 'SÓ INGREDIENTE!', '#fb923c');
      return;
    }

    const item = chef.held;
    chef.held = null;
    this.thrown.push({
      id: this.nextId++,
      item,
      x: chef.x + chef.dirX * 0.45,
      y: chef.y + chef.dirY * 0.45,
      z: 0.45,
      vx: chef.dirX * 8.4,
      vy: chef.dirY * 8.4,
      vz: 2.4,
      throwerId: chef.id,
      age: 0,
    });
    this.emitSound('throw');
  }

  private handleWork(
    chef: ChefState,
    workHeld: boolean,
    workPressed: boolean,
    dt: number,
  ): void {
    // 1. Extinguisher foam spray!
    if (chef.held?.kind === 'extinguisher') {
      if (!workHeld) return;
      chef.isWorking = true;
      this.emitSound('extinguish');
      const fx = chef.x + chef.dirX * 0.85;
      const fy = chef.y + chef.dirY * 0.85;
      this.particles.push({
        x: fx + (Math.random() - 0.5) * 0.2,
        y: fy + (Math.random() - 0.5) * 0.2,
        z: 0.35,
        vx: chef.dirX * (3.2 + Math.random() * 1.4) + (Math.random() - 0.5) * 0.9,
        vy: chef.dirY * (3.2 + Math.random() * 1.4) + (Math.random() - 0.5) * 0.9,
        vz: 0.2 + Math.random() * 0.5,
        color: '#f8fafc',
        size: 7 + Math.random() * 6,
        life: 0.35,
        maxLife: 0.35,
        kind: 'foam',
      });

      for (const tile of this.tiles) {
        const dx = tile.x + 0.5 - chef.x;
        const dy = tile.y + 0.5 - chef.y;
        const d = Math.hypot(dx, dy);
        if (d < 2.2) {
          const dot = (dx * chef.dirX + dy * chef.dirY) / (d || 1);
          if (dot > 0.35 || d < 0.9) {
            if (tile.fire > 0) {
              tile.fire = Math.max(0, tile.fire - 82 * dt);
              if (tile.fire === 0) {
                this.firesExtinguished += 1;
                this.score += 15;
                this.addFloatText(tile.x + 0.5, tile.y, 'FOGO APAGADO! +15', '#38bdf8');
              }
            } else if (tile.burnProgress > 0 && tile.cookedResult !== 'burnt') {
              // Cool down smoking stove!
              tile.burnProgress = Math.max(0, tile.burnProgress - 0.55 * dt);
            }
          }
        }
      }
      return;
    }

    const tile = chef.targetTile ? this.getTile(chef.targetTile.x, chef.targetTile.y) : null;
    if (!tile) {
      chef.autoWorkTile = null;
      return;
    }

    if (workPressed && tile.fire > 0) {
      this.addFloatText(tile.x + 0.5, tile.y, 'PEGUE O EXTINTOR! 🧯', '#ef4444');
      this.emitSound('alarm');
      return;
    }

    if (workPressed) {
      chef.autoWorkTile = { x: tile.x, y: tile.y };
    }

    const activeOnTile =
      workHeld ||
      (chef.autoWorkTile !== null &&
        chef.autoWorkTile.x === tile.x &&
        chef.autoWorkTile.y === tile.y);

    if (!activeOnTile) return;

    // 2. Chopping board
    if (tile.baseType === 'board' && tile.item?.kind === 'ingredient') {
      const info = INGREDIENTS[tile.item.ingredient];
      if (info.choppableTo) {
        chef.isWorking = true;
        const prog = (tile.item.chopProgress ?? 0) + dt / 1.3;
        tile.item.chopProgress = prog;
        this.emitSound('chop');
        if (Math.random() < 0.38) {
          this.spawnParticles(tile.x + 0.5, tile.y + 0.5, 0.45, 1, info.color, 'chop', 1.4);
        }
        if (prog >= 1) {
          tile.item = { kind: 'ingredient', ingredient: info.choppableTo };
          chef.autoWorkTile = null;
          this.spawnParticles(tile.x + 0.5, tile.y + 0.5, 0.45, 8, info.color, 'chop', 2.0);
        }
        return;
      }
    }

    // 3. Washing dirty plates at Sink
    if (tile.baseType === 'sink' && tile.dirtyCount > 0) {
      chef.isWorking = true;
      tile.washProgress += dt / 1.45;
      this.emitSound('wash');
      if (Math.random() < 0.35) {
        this.spawnParticles(tile.x + 0.5, tile.y + 0.5, 0.45, 1, '#bae6fd', 'foam', 1.1);
      }
      if (tile.washProgress >= 1) {
        tile.washProgress = 0;
        tile.dirtyCount -= 1;
        tile.cleanPlateCount += 1;
        this.addFloatText(tile.x + 0.5, tile.y, 'PRATO LIMPO! ✨', '#38bdf8');
        if (tile.dirtyCount <= 0) {
          chef.autoWorkTile = null;
        }
      }
      return;
    }

    chef.autoWorkTile = null;
  }

  private updateThrownItems(dt: number): void {
    for (let i = this.thrown.length - 1; i >= 0; i--) {
      const th = this.thrown[i];
      th.age += dt;
      const nextX = th.x + th.vx * dt;
      const nextY = th.y + th.vy * dt;

      const probeTile = this.getTile(Math.floor(nextX), Math.floor(nextY));
      if (!probeTile || probeTile.baseType === 'wall') {
        th.vx *= -0.35;
        th.vy *= -0.35;
      } else {
        th.x = nextX;
        th.y = nextY;
      }

      th.vz -= 9.8 * dt;
      th.z += th.vz * dt;

      // Mid-air catch by any chef with empty hands OR holding a compatible plate!
      let caught = false;
      for (const chef of this.chefs) {
        if (chef.id === th.throwerId && th.age < 0.22) continue;
        if (Math.hypot(chef.x - th.x, chef.y - th.y) < 0.58) {
          if (!chef.held) {
            chef.held = th.item;
            this.emitSound('pickup');
            this.addFloatText(chef.x, chef.y - 0.6, 'PEGOU! 🧤', '#fde047');
            this.thrown.splice(i, 1);
            caught = true;
            break;
          } else if (
            chef.held.kind === 'plate' &&
            !chef.held.burnt &&
            th.item.kind === 'ingredient' &&
            canPlaceIngredientOnPlate(chef.held.contents, th.item.ingredient)
          ) {
            chef.held.contents.push(th.item.ingredient);
            chef.held.dish = matchCompletedRecipe(chef.held.contents);
            this.score += 10;
            this.emitSound('deliver');
            this.addFloatText(chef.x, chef.y - 0.6, 'NO PRATO! 🎯 +10', '#4ade80');
            this.spawnParticles(chef.x, chef.y, 0.4, 8, '#fde047', 'spark', 2.0);
            this.thrown.splice(i, 1);
            caught = true;
            break;
          }
        }
      }
      if (caught) continue;

      if (th.z <= 0) {
        const landTile = this.getTile(Math.floor(th.x), Math.floor(th.y));
        this.thrown.splice(i, 1);

        if (landTile && th.item.kind === 'ingredient') {
          const ing = th.item.ingredient;
          if (
            landTile.baseType === 'pot' &&
            landTile.fire === 0 &&
            canAcceptInPot(landTile.cookContents, landTile.cookedResult, ing)
          ) {
            landTile.cookContents.push(ing);
            this.score += 5;
            this.emitSound('bubble');
            this.addFloatText(landTile.x + 0.5, landTile.y, 'NO CALDEIRÃO! 🎯 +5', '#fde047');
            this.spawnParticles(landTile.x + 0.5, landTile.y + 0.5, 0.5, 6, '#fde68a', 'steam', 1.4);
            continue;
          }
          if (
            landTile.baseType === 'grill' &&
            landTile.fire === 0 &&
            canAcceptInGrill(landTile.cookContents, landTile.cookedResult, ing)
          ) {
            landTile.cookContents.push(ing);
            this.score += 5;
            this.emitSound('drop');
            this.addFloatText(landTile.x + 0.5, landTile.y, 'NA CHAPA! 🎯 +5', '#fde047');
            continue;
          }
          if (
            landTile.baseType === 'fryer' &&
            landTile.fire === 0 &&
            canAcceptInFryer(landTile.cookContents, landTile.cookedResult, ing)
          ) {
            landTile.cookContents.push(ing);
            this.score += 5;
            this.emitSound('drop');
            this.addFloatText(landTile.x + 0.5, landTile.y, 'NA FRITADEIRA! 🎯 +5', '#fde047');
            continue;
          }
          if (
            landTile.baseType === 'blender' &&
            landTile.fire === 0 &&
            canAcceptInBlender(landTile.cookContents, landTile.cookedResult, ing)
          ) {
            landTile.cookContents.push(ing);
            this.score += 5;
            this.emitSound('drop');
            this.addFloatText(landTile.x + 0.5, landTile.y, 'NO LIQUIDIF.! 🎯 +5', '#fde047');
            continue;
          }
          if (
            landTile.baseType === 'counter' ||
            landTile.baseType === 'board' ||
            landTile.baseType === 'conveyor'
          ) {
            if (!landTile.item) {
              landTile.item = th.item;
              this.emitSound('drop');
              continue;
            } else if (
              landTile.item.kind === 'plate' &&
              !landTile.item.burnt &&
              canPlaceIngredientOnPlate(landTile.item.contents, ing)
            ) {
              landTile.item.contents.push(ing);
              landTile.item.dish = matchCompletedRecipe(landTile.item.contents);
              this.score += 5;
              this.emitSound('pickup');
              this.addFloatText(landTile.x + 0.5, landTile.y, 'NO PRATO! 🎯 +5', '#4ade80');
              continue;
            }
          }
          if (landTile.baseType === 'trash') {
            this.emitSound('drop');
            continue;
          }
        }

        if (landTile && this.isTileWalkable(landTile)) {
          this.floorItems.push({
            id: this.nextId++,
            x: th.x,
            y: th.y,
            item: th.item,
          });
          this.emitSound('drop');
        } else if (landTile?.baseType === 'gap') {
          const msg = this.kitchen.gapStyle === 'lava' ? 'CAIU NA LAVA! 🌋' : 'CAIU NA ESTRADA! 💨';
          this.addFloatText(th.x, th.y, msg, this.kitchen.gapStyle === 'lava' ? '#fb923c' : '#94a3b8');
          this.spawnParticles(
            th.x,
            th.y,
            0.2,
            6,
            this.kitchen.gapStyle === 'lava' ? '#f97316' : '#94a3b8',
            'smoke',
            1.4,
          );
          this.emitSound('drop');
        } else {
          // Safely bounce to nearest real floor tile instead of overlapping a station
          const safe = this.findNearestFloorPoint(th.x, th.y);
          this.floorItems.push({
            id: this.nextId++,
            x: safe.x,
            y: safe.y,
            item: th.item,
          });
          this.emitSound('drop');
        }
      }
    }
  }

  private updateStations(dt: number): void {
    // 1. Cooking, Simmering Soup, Burning & Fires
    for (const tile of this.tiles) {
      if (tile.fire > 0) {
        if (Math.random() < 0.45) {
          this.spawnParticles(tile.x + 0.5, tile.y + 0.5, 0.4, 1, '#f97316', 'fire', 1.2);
        }
        if (Math.random() < 0.25) {
          this.spawnParticles(tile.x + 0.5, tile.y + 0.5, 0.7, 1, '#374151', 'smoke', 0.8);
        }
        if (tile.fire >= 90 && Math.random() < dt * 0.11) {
          const dirs = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ];
          const [ox, oy] = dirs[Math.floor(Math.random() * dirs.length)];
          const nb = this.getTile(tile.x + ox, tile.y + oy);
          if (
            nb &&
            nb.fire === 0 &&
            (nb.baseType === 'counter' ||
              nb.baseType === 'board' ||
              nb.baseType === 'pot' ||
              nb.baseType === 'grill' ||
              nb.baseType === 'fryer' ||
              nb.baseType === 'blender')
          ) {
            nb.fire = 60;
            this.emitSound('alarm');
          }
        }
        continue;
      }

      // Soup Pot (`pot`) cooking logic
      if (tile.baseType === 'pot') {
        const matched = tile.cookedResult === null ? matchPotRecipe(tile.cookContents) : null;
        if (matched) {
          tile.cookProgress += dt / matched.cookTime;
          this.emitSound('bubble');
          if (Math.random() < 0.28) {
            this.spawnParticles(tile.x + 0.5, tile.y + 0.45, 0.55, 1, '#fef9c3', 'steam', 0.55);
          }
          if (tile.cookProgress >= 1) {
            tile.cookProgress = 1;
            tile.cookedResult = matched.result;
            const label = matched.result === 'soup_macacao' ? 'SOPA PRONTA! 🍲' : 'CALDO PRONTO! 🥣';
            this.addFloatText(tile.x + 0.5, tile.y, label, '#4ade80');
            this.spawnParticles(tile.x + 0.5, tile.y + 0.45, 0.55, 8, '#fef08a', 'steam', 1.2);
          }
        } else if (tile.cookedResult !== null && tile.cookedResult !== 'burnt') {
          if (Math.random() < 0.22) {
            this.spawnParticles(tile.x + 0.5, tile.y + 0.45, 0.55, 1, '#f8fafc', 'steam', 0.45);
          }
          tile.burnProgress += dt / 9.2;
          if (tile.burnProgress > 0.38) {
            this.emitSound('alarm');
            if (Math.random() < 0.35) {
              this.spawnParticles(tile.x + 0.5, tile.y + 0.5, 0.5, 1, '#475569', 'smoke', 0.9);
            }
          }
          if (tile.burnProgress >= 1) {
            tile.cookedResult = 'burnt';
            tile.fire = 100;
            this.shake = 10;
            this.emitSound('burn');
            this.addFloatText(tile.x + 0.5, tile.y, '🔥 SOPA QUEIMOU!', '#ef4444');
          }
        }
        continue;
      }

      // Grill, Fryer, Blender
      if (tile.baseType === 'grill' || tile.baseType === 'fryer' || tile.baseType === 'blender') {
        const needed = tile.baseType === 'grill' ? 1 : 2;
        if (tile.cookedResult === null && tile.cookContents.length === needed) {
          const cookTime = tile.baseType === 'grill' ? 4.6 : 5.0;
          tile.cookProgress += dt / cookTime;
          if (tile.baseType === 'blender') {
            this.emitSound('blend');
          } else {
            this.emitSound('sizzle');
          }
          if (Math.random() < 0.22) {
            this.spawnParticles(tile.x + 0.5, tile.y + 0.5, 0.5, 1, '#e2e8f0', 'smoke', 0.6);
          }
          if (tile.cookProgress >= 1) {
            tile.cookProgress = 1;
            tile.cookedResult =
              tile.baseType === 'grill'
                ? 'burger_cooked'
                : tile.baseType === 'fryer'
                  ? 'pastel_cooked'
                  : 'acai_cooked';
            this.addFloatText(tile.x + 0.5, tile.y, 'PRONTO! ✨', '#4ade80');
          }
        } else if (tile.cookedResult !== null && tile.cookedResult !== 'burnt') {
          tile.burnProgress += dt / 8.2;
          if (tile.burnProgress > 0.35) {
            this.emitSound('alarm');
            if (Math.random() < 0.35) {
              this.spawnParticles(tile.x + 0.5, tile.y + 0.5, 0.5, 1, '#475569', 'smoke', 0.9);
            }
          }
          if (tile.burnProgress >= 1) {
            tile.cookedResult = 'burnt';
            tile.fire = 100;
            this.shake = 10;
            this.emitSound('burn');
            this.addFloatText(tile.x + 0.5, tile.y, '🔥 PEGOU FOGO!', '#ef4444');
          }
        }
      }
    }

    // 2. Conveyor belts
    const moves: Array<{ from: TileState; to: TileState }> = [];
    for (const tile of this.tiles) {
      if (tile.baseType !== 'conveyor' || !tile.conveyorDir || !tile.item) continue;
      const next = this.getTile(tile.x + tile.conveyorDir.dx, tile.y + tile.conveyorDir.dy);
      if (!next) continue;
      if (
        (next.baseType === 'conveyor' || next.baseType === 'counter') &&
        !next.item &&
        next.fire === 0
      ) {
        tile.conveyorOffset += dt * 0.72;
        if (tile.conveyorOffset >= 1) {
          moves.push({ from: tile, to: next });
        }
      } else {
        tile.conveyorOffset = Math.min(0.45, tile.conveyorOffset);
      }
    }
    for (const m of moves) {
      if (m.from.item && !m.to.item) {
        m.to.item = m.from.item;
        m.from.item = null;
        m.from.conveyorOffset = 0;
        m.to.conveyorOffset = 0;
      }
    }
  }

  private updateOrders(dt: number): void {
    for (let i = this.orders.length - 1; i >= 0; i--) {
      const ord = this.orders[i];
      ord.age += dt;
      ord.timeLeft -= dt;
      if (ord.timeLeft <= 0) {
        this.orders.splice(i, 1);
        this.failedCount += 1;
        this.combo = 1;
        this.score = Math.max(0, this.score - 20);
        this.shake = 7;
        this.emitSound('orderFail');
        this.addFloatText(GRID_COLS * 0.5, 1.3, 'PEDIDO ESTOUROU! -20', '#ef4444');
      }
    }

    this.orderSpawnTimer -= dt;
    const rushFactor = this.rushHour ? 0.78 : 1.0;
    if (this.orderSpawnTimer <= 0 && this.orders.length < this.kitchen.maxOrders) {
      this.spawnOrder();
      this.orderSpawnTimer = this.kitchen.orderInterval * rushFactor * (0.85 + Math.random() * 0.3);
    } else if (this.orders.length === 0) {
      this.spawnOrder();
    }
  }

  private spawnOrder(forcedRecipe?: RecipeId): void {
    const pool = this.kitchen.recipes;
    let recipeId: RecipeId;
    if (forcedRecipe && pool.includes(forcedRecipe)) {
      recipeId = forcedRecipe;
    } else {
      // Avoid 3 identical orders in a row
      const lastTwo = this.orders.slice(-2).map((o) => o.recipe);
      const filtered =
        pool.length > 1 && lastTwo.length === 2 && lastTwo[0] === lastTwo[1]
          ? pool.filter((r) => r !== lastTwo[0])
          : pool;
      recipeId = filtered[Math.floor(Math.random() * filtered.length)];
    }
    const recipe = RECIPES[recipeId];
    this.orders.push({
      id: this.nextId++,
      recipe: recipeId,
      timeLeft: recipe.patience,
      maxTime: recipe.patience,
      age: 0,
    });
  }

  private updateHazards(dt: number): void {
    if (this.kitchen.hasPeelHazard) {
      this.peelSpawnTimer -= dt;
      if (this.peelSpawnTimer <= 0) {
        this.peelSpawnTimer = 17 + Math.random() * 10;
        if (this.peels.length < 2) {
          const walkables = this.tiles.filter((t) => t.baseType === 'floor');
          if (walkables.length > 0) {
            const spot = walkables[Math.floor(Math.random() * walkables.length)];
            this.peels.push({
              id: this.nextId++,
              x: spot.x + 0.5,
              y: spot.y + 0.5,
              ttl: 20,
            });
          }
        }
      }
      for (let i = this.peels.length - 1; i >= 0; i--) {
        this.peels[i].ttl -= dt;
        if (this.peels[i].ttl <= 0) this.peels.splice(i, 1);
      }
    }

    if (this.kitchen.hasRatHazard) {
      this.ratSpawnTimer -= dt;
      if (this.ratSpawnTimer <= 0 && this.rats.length === 0) {
        this.ratSpawnTimer = 24 + Math.random() * 12;
        const edges = this.tiles.filter(
          (t) => t.baseType === 'floor' && (t.x <= 2 || t.x >= GRID_COLS - 3),
        );
        if (edges.length > 0) {
          const sp = edges[Math.floor(Math.random() * edges.length)];
          this.rats.push({
            id: this.nextId++,
            x: sp.x + 0.5,
            y: sp.y + 0.5,
            vx: 0,
            vy: 0,
            carrying: null,
            state: 'seeking',
            targetX: GRID_COLS * 0.5,
            targetY: GRID_ROWS * 0.5,
            stunTimer: 0,
          });
          this.emitSound('rat');
          this.addFloatText(sp.x + 0.5, sp.y, 'RATO LADRÃO! 🐀', '#fb7185');
        }
      }

      for (let i = this.rats.length - 1; i >= 0; i--) {
        const rat = this.rats[i];
        if (rat.stunTimer > 0) {
          rat.stunTimer -= dt;
          continue;
        }
        if (rat.state === 'seeking') {
          let bestTarget: { x: number; y: number; floorIdx?: number; tile?: TileState } | null = null;
          let bestDist = 999;

          this.floorItems.forEach((fi, idx) => {
            if (fi.item.kind === 'ingredient') {
              const d = Math.hypot(fi.x - rat.x, fi.y - rat.y);
              if (d < bestDist) {
                bestDist = d;
                bestTarget = { x: fi.x, y: fi.y, floorIdx: idx };
              }
            }
          });
          if (!bestTarget) {
            for (const t of this.tiles) {
              if (
                (t.baseType === 'counter' || t.baseType === 'conveyor' || t.baseType === 'board') &&
                t.item?.kind === 'ingredient'
              ) {
                const d = Math.hypot(t.x + 0.5 - rat.x, t.y + 0.5 - rat.y);
                if (d < bestDist) {
                  bestDist = d;
                  bestTarget = { x: t.x + 0.5, y: t.y + 0.5, tile: t };
                }
              }
            }
          }

          if (!bestTarget) {
            rat.state = 'fleeing';
          } else {
            const target = bestTarget as { x: number; y: number; floorIdx?: number; tile?: TileState };
            rat.targetX = target.x;
            rat.targetY = target.y;
            const dx = rat.targetX - rat.x;
            const dy = rat.targetY - rat.y;
            const d = Math.hypot(dx, dy);
            if (d < 0.72) {
              if (target.floorIdx !== undefined) {
                const [stolen] = this.floorItems.splice(target.floorIdx, 1);
                rat.carrying = stolen.item;
              } else if (target.tile && target.tile.item) {
                rat.carrying = target.tile.item;
                target.tile.item = null;
              }
              rat.state = 'fleeing';
              this.emitSound('rat');
            } else {
              rat.vx = (dx / d) * 2.55;
              rat.vy = (dy / d) * 2.55;
              rat.x += rat.vx * dt;
              rat.y += rat.vy * dt;
            }
          }
        } else {
          const exitX = rat.x < GRID_COLS / 2 ? 0.6 : GRID_COLS - 0.6;
          const dx = exitX - rat.x;
          const dy = GRID_ROWS * 0.5 - rat.y;
          const d = Math.hypot(dx, dy);
          if (d < 0.6) {
            this.rats.splice(i, 1);
          } else {
            rat.vx = (dx / d) * 3.6;
            rat.vy = (dy / d) * 3.6;
            rat.x += rat.vx * dt;
            rat.y += rat.vy * dt;
          }
        }
      }
    }
  }

  private updateVisualParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z = Math.max(0, p.z + p.vz * dt);
      if (p.kind !== 'fire' && p.kind !== 'smoke' && p.kind !== 'steam') {
        p.vz -= 4.2 * dt;
      }
    }

    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const f = this.floatingTexts[i];
      f.life -= dt;
      f.y -= dt * 0.75;
      if (f.life <= 0) this.floatingTexts.splice(i, 1);
    }
  }

  public getSnapshot(): SimSnapshot {
    return {
      kitchenId: this.kitchen.id,
      mode: this.mode,
      timeLeft: this.timeLeft,
      totalTime: this.totalTime,
      countdown: this.countdown,
      rushHour: this.rushHour,
      score: this.score,
      tipsEarned: this.tipsEarned,
      combo: this.combo,
      maxCombo: this.maxCombo,
      deliveredCount: this.deliveredCount,
      failedCount: this.failedCount,
      firesExtinguished: this.firesExtinguished,
      finished: this.finished,
      bridgeDocked: this.bridgeDocked,
      bridgeTimer: this.bridgeTimer,
      bridgeWarning: this.bridgeWarning,
      shake: this.shake,
      tiles: this.tiles,
      chefs: this.chefs,
      thrown: this.thrown,
      floorItems: this.floorItems,
      orders: this.orders,
      rats: this.rats,
      peels: this.peels,
      pendingReturns: this.pendingReturns.length,
    };
  }
}
