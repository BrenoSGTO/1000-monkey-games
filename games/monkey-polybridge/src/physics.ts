import { monkeyAudio } from '@monkey-slop/sdk';
import { WORLD_W } from './levels';
import { MATERIALS } from './materials';
import type {
  BoatRuntime,
  BridgeBeam,
  BridgeNode,
  BrokenSplinter,
  Crocodile,
  FloatingText,
  LevelDef,
  Particle,
  RagdollMonkey,
  RagdollPart,
  TerrainSegment,
  VehicleKind,
  VehicleRuntime,
  VehicleSpec,
} from './types';

const GRAVITY = 560;
const SUBSTEPS = 4;
const CONSTRAINT_ITERS = 10;
const BASE_BREAKING_FORCE = 28500;

const SHOUTS = [
  'SOCORROOO!',
  'CADÊ O CREA?!',
  'EU AVISEI!',
  'MINHA BANANA!',
  'FOI DE BASE!',
  'GAMBIARRA MALDITA!',
  'UUU-AAA-AAA!',
];

interface DriveCandidate {
  tx: number;
  ty: number;
  nA: BridgeNode | null;
  nB: BridgeNode | null;
  t: number;
  priority: number;
}

export interface PhysicsCallbacks {
  onShake: (amount: number) => void;
  onMonkeySaved: (count: number) => void;
  onMonkeyDrowned: (count: number) => void;
  onFirstBeamBreak?: (label: string) => void;
  onVictory: () => void;
  onFail: (reason: string) => void;
}

export class BridgePhysicsWorld {
  public level: LevelDef;
  public nodes = new Map<string, BridgeNode>();
  public orderedNodes: BridgeNode[] = [];
  public beams: BridgeBeam[] = [];
  public vehicles: VehicleRuntime[] = [];
  public ragdolls: RagdollMonkey[] = [];
  public splinters: BrokenSplinter[] = [];
  public particles: Particle[] = [];
  public floatingTexts: FloatingText[] = [];
  public crocodiles: Crocodile[] = [];
  public boat: BoatRuntime | null = null;

  public simTime = 0;
  public outcome: 'running' | 'won' | 'failed' = 'running';
  public failReason = '';
  public currentMaxStress = 0;
  public peakStressEver = 0;
  public hasBrokenBeam = false;

  private beamImpulseAccum = new Map<string, number>();
  private beamSignedAccum = new Map<string, number>();
  private springCooldown = new Map<string, number>();
  private callbacks: PhysicsCallbacks;

  constructor(level: LevelDef, callbacks: PhysicsCallbacks) {
    this.level = level;
    this.callbacks = callbacks;
    this.initAmbientCrocs();
  }

  private computeOpenWaterSpans(): Array<{ minX: number; maxX: number }> {
    const blocked: Array<[number, number]> = [];
    const wy = this.level.waterY - 8;

    for (const poly of this.level.terrainPolygons) {
      if (poly.kind === 'tower') continue;
      const xs = poly.points.map((p) => p[0]);
      const ys = poly.points.map((p) => p[1]);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      if (maxY < wy || minY > this.level.waterY + 40) continue;

      // Estimate horizontal extent at waterY using points near or below waterY
      const activeXs: number[] = [];
      for (let i = 0; i < poly.points.length; i++) {
        const [x1, y1] = poly.points[i];
        const [x2, y2] = poly.points[(i + 1) % poly.points.length];
        if ((y1 <= wy && y2 >= wy) || (y2 <= wy && y1 >= wy)) {
          if (Math.abs(y2 - y1) < 0.01) {
            activeXs.push(x1, x2);
          } else {
            const t = (wy - y1) / (y2 - y1);
            activeXs.push(x1 + (x2 - x1) * t);
          }
        }
      }
      if (activeXs.length >= 2) {
        blocked.push([Math.min(...activeXs), Math.max(...activeXs)]);
      } else {
        blocked.push([Math.min(...xs), Math.max(...xs)]);
      }
    }

    blocked.sort((a, b) => a[0] - b[0]);
    const spans: Array<{ minX: number; maxX: number }> = [];
    let cursor = 0;
    for (const [bStart, bEnd] of blocked) {
      if (bStart - cursor > 85) {
        spans.push({ minX: cursor + 38, maxX: bStart - 38 });
      }
      cursor = Math.max(cursor, bEnd);
    }
    if (WORLD_W - cursor > 85) {
      spans.push({ minX: cursor + 38, maxX: WORLD_W - 38 });
    }

    if (spans.length === 0) {
      spans.push({ minX: 430, maxX: 770 });
    }
    return spans;
  }

  private initAmbientCrocs(): void {
    this.crocodiles = [];
    const spans = this.computeOpenWaterSpans();
    const totalCrocs = Math.max(2, Math.min(4, spans.length * 2));
    for (let i = 0; i < totalCrocs; i++) {
      const span = spans[i % spans.length];
      const frac = totalCrocs === 1 ? 0.5 : (0.25 + ((i * 0.37) % 0.55));
      const startX = span.minX + (span.maxX - span.minX) * frac;
      this.crocodiles.push({
        x: startX,
        baseY: this.level.waterY + 14,
        y: this.level.waterY + 14,
        minX: span.minX,
        maxX: span.maxX,
        dir: i % 2 === 0 ? 1 : -1,
        speed: 20 + (i % 3) * 8,
        laughTimer: 0,
        biteTimer: 0,
        phase: i * 1.9,
      });
    }
  }

  public resetForBuild(
    blueprintNodes: Map<string, BridgeNode>,
    blueprintBeams: BridgeBeam[],
  ): void {
    this.simTime = 0;
    this.outcome = 'running';
    this.failReason = '';
    this.currentMaxStress = 0;
    this.peakStressEver = 0;
    this.hasBrokenBeam = false;
    this.ragdolls = [];
    this.splinters = [];
    this.particles = [];
    this.floatingTexts = [];
    this.beamImpulseAccum.clear();
    this.beamSignedAccum.clear();
    this.springCooldown.clear();

    this.nodes.clear();
    const sortedNodeEntries = Array.from(blueprintNodes.entries()).sort((a, b) =>
      a[0].localeCompare(b[0]),
    );
    this.orderedNodes = [];
    for (const [id, n] of sortedNodeEntries) {
      const copy: BridgeNode = {
        ...n,
        x: n.homeX,
        y: n.homeY,
        oldX: n.homeX,
        oldY: n.homeY,
      };
      this.nodes.set(id, copy);
      this.orderedNodes.push(copy);
    }

    this.beams = blueprintBeams
      .map((b) => ({
        ...b,
        stress: 0,
        signedStress: 0,
        broken: false,
        springSquish: 0,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));

    this.computeNodeMasses();

    // Parked preview vehicles in build mode so players see what they're building for!
    this.vehicles = this.level.vehicles.map((spec, idx) =>
      this.createVehicle(spec, idx, true),
    );

    if (this.level.boatHazard) {
      const bh = this.level.boatHazard;
      this.boat = {
        x: bh.startX,
        y: this.level.waterY,
        width: bh.width,
        hullTopY: bh.hullTopY,
        mastTopY: bh.mastTopY,
        speed: bh.speed,
        startX: bh.startX,
        endX: bh.endX,
        smashedCount: 0,
      };
    } else {
      this.boat = null;
    }
  }

  public startSimulation(
    blueprintNodes: Map<string, BridgeNode>,
    blueprintBeams: BridgeBeam[],
  ): void {
    this.resetForBuild(blueprintNodes, blueprintBeams);

    this.vehicles = this.level.vehicles.map((spec, idx) =>
      this.createVehicle(spec, idx, false),
    );
  }

  private createVehicle(
    spec: VehicleSpec,
    idx: number,
    previewOnly: boolean,
  ): VehicleRuntime {
    const specs: Record<
      VehicleKind,
      { mass: number; speed: number; wheelBase: number; height: number; radius: number; monkeys: number }
    > = {
      cart: { mass: 3.4, speed: 152, wheelBase: 44, height: 24, radius: 11, monkeys: 1 },
      kombi: { mass: 6.0, speed: 134, wheelBase: 64, height: 32, radius: 13, monkeys: 4 },
      tanker: { mass: 10.2, speed: 110, wheelBase: 78, height: 36, radius: 15, monkeys: 2 },
      moped: { mass: 2.7, speed: 235, wheelBase: 36, height: 22, radius: 10, monkeys: 1 },
    };
    const s = specs[spec.kind];
    const dir: 1 | -1 = spec.direction ?? 1;
    const baseSpawnX = spec.spawnX ?? this.level.spawnX;
    // In build preview, stagger same-direction convoy vehicles nicely so both are visible
    const sameDirBefore = this.level.vehicles
      .slice(0, idx)
      .filter((prev) => (prev.direction ?? 1) === dir).length;
    const stagger = previewOnly ? sameDirBefore * 92 * dir : sameDirBefore * 12 * dir;
    const startX = Math.max(58, Math.min(WORLD_W - 58, baseSpawnX - stagger));
    const groundY = this.sampleTerrainY(startX);
    const wy = groundY - s.radius - 1;
    const rx = startX - s.wheelBase * 0.5 * dir;
    const fx = startX + s.wheelBase * 0.5 * dir;
    const roofX = startX;
    const roofY = wy - s.height;
    const finishX = spec.finishX ?? (dir === 1 ? this.level.finishX : 160);

    return {
      id: `veh-${idx}-${spec.kind}`,
      kind: spec.kind,
      name: spec.name,
      mass: s.mass,
      driveSpeed: s.speed,
      direction: dir,
      finishX,
      wheelRear: { x: rx, y: wy, oldX: rx, oldY: wy, radius: s.radius, angle: 0, grounded: false },
      wheelFront: { x: fx, y: wy, oldX: fx, oldY: wy, radius: s.radius, angle: 0, grounded: false },
      roof: { x: roofX, y: roofY, oldX: roofX, oldY: roofY },
      wheelBase: s.wheelBase,
      chassisHeight: s.height,
      monkeyCount: s.monkeys,
      ejected: false,
      crashed: false,
      crashTimer: 0,
      flippedTimer: 0,
      finished: false,
      finishTimer: 0,
      drowned: false,
      panicLevel: 0,
      spawned: previewOnly || spec.spawnDelay <= 0.01,
      spawnTimer: previewOnly ? 0 : spec.spawnDelay,
      maxStressSeen: 0,
    };
  }

  private sampleTerrainY(x: number): number {
    for (const seg of this.level.terrainSegments) {
      const minX = Math.min(seg.x1, seg.x2);
      const maxX = Math.max(seg.x1, seg.x2);
      if (x >= minX && x <= maxX && Math.abs(seg.x2 - seg.x1) > 1) {
        const t = (x - seg.x1) / (seg.x2 - seg.x1);
        return seg.y1 + t * (seg.y2 - seg.y1);
      }
    }
    return 440;
  }

  private computeNodeMasses(): void {
    for (const n of this.orderedNodes) {
      n.mass = 0.55;
    }
    for (const b of this.beams) {
      if (b.broken) continue;
      const mat = MATERIALS[b.material];
      const halfMass = b.restLength * mat.massPerPx * 0.5;
      const nA = this.nodes.get(b.nodeAId);
      const nB = this.nodes.get(b.nodeBId);
      if (nA) nA.mass += halfMass;
      if (nB) nB.mass += halfMass;
    }
  }

  public stepAmbient(dt: number): void {
    this.updateCrocodiles(dt);
    this.updateParticles(dt);
  }

  public stepSimulation(fixedDt: number): void {
    this.simTime += fixedDt;
    const subDt = fixedDt / SUBSTEPS;

    // Reset step impulse accumulators
    for (const b of this.beams) {
      this.beamImpulseAccum.set(b.id, 0);
      this.beamSignedAccum.set(b.id, 0);
      if (b.springSquish > 0) {
        b.springSquish = Math.max(0, b.springSquish - fixedDt * 3.5);
      }
    }
    for (const [id, cd] of this.springCooldown) {
      if (cd > 0) this.springCooldown.set(id, Math.max(0, cd - fixedDt));
    }

    // Spawn delayed vehicles
    for (const v of this.vehicles) {
      if (!v.spawned) {
        v.spawnTimer -= fixedDt;
        if (v.spawnTimer <= 0) {
          v.spawned = true;
          this.spawnFloatingText(v.roof.x, v.roof.y - 24, `VAI ${v.name.toUpperCase()}!`, '#fef08a', 14);
        }
      }
    }

    // Update Boat Hazard
    if (this.boat && this.level.boatHazard) {
      this.boat.x += this.boat.speed * fixedDt;
      if (this.boat.x > this.boat.endX) {
        this.boat.x = this.boat.endX;
        this.boat.speed = -Math.abs(this.boat.speed);
      } else if (this.boat.x < this.boat.startX) {
        this.boat.x = this.boat.startX;
        this.boat.speed = Math.abs(this.boat.speed);
      }
      this.checkBoatBeamCollisions();
    }

    // Sub-stepped Verlet Physics
    for (let s = 0; s < SUBSTEPS; s++) {
      this.integrateBridgeNodes(subDt);
      this.integrateVehicles(subDt);
      this.integrateRagdolls(subDt);

      for (let iter = 0; iter < CONSTRAINT_ITERS; iter++) {
        this.solveBridgeConstraints();
        this.solveVehicleConstraints();
        this.solveVehicleCollisions(subDt, iter === 0);
        this.solveRagdollConstraints();
        this.solveRagdollCollisions(subDt);
      }
    }

    // Update Stress & Break Overloaded Beams
    this.evaluateBeamStress(subDt);

    // Check vehicle states (finish, flip, water splash, ragdoll ejection)
    this.evaluateVehicles(fixedDt);

    // Update Splinters, Particles, Crocs, Floating Texts
    this.updateSplinters(fixedDt);
    this.updateParticles(fixedDt);
    this.updateCrocodiles(fixedDt);
  }

  private integrateBridgeNodes(subDt: number): void {
    const gStep = GRAVITY * subDt * subDt;
    for (const n of this.orderedNodes) {
      if (n.fixed) {
        n.x = n.homeX;
        n.y = n.homeY;
        n.oldX = n.homeX;
        n.oldY = n.homeY;
        continue;
      }
      const vx = (n.x - n.oldX) * 0.9965;
      const vy = (n.y - n.oldY) * 0.9965;
      n.oldX = n.x;
      n.oldY = n.y;
      n.x += vx;
      n.y += vy + gStep;

      if (n.y > this.level.waterY) {
        n.x -= vx * 0.08;
        n.y -= vy * 0.08;
      }
    }
  }

  private integrateVehicles(subDt: number): void {
    const gStep = GRAVITY * subDt * subDt;
    for (const v of this.vehicles) {
      if (!v.spawned) continue;
      const pts = [v.wheelRear, v.wheelFront, v.roof];
      for (const p of pts) {
        const vx = (p.x - p.oldX) * 0.997;
        const vy = (p.y - p.oldY) * 0.997;
        p.oldX = p.x;
        p.oldY = p.y;
        p.x += vx;
        p.y += vy + gStep;
        if (p.y > this.level.waterY) {
          p.x -= vx * 0.12;
          p.y -= vy * 0.14;
        }
      }
      v.wheelRear.grounded = false;
      v.wheelFront.grounded = false;
      v.maxStressSeen = 0;

      // Moped turbo flame particles
      if (v.kind === 'moped' && !v.drowned && !v.ejected && Math.random() < 0.45) {
        this.particles.push({
          x: v.wheelRear.x - 10 * v.direction,
          y: v.wheelRear.y - 6,
          vx: (-80 - Math.random() * 50) * v.direction,
          vy: -15 + (Math.random() - 0.5) * 30,
          size: 4 + Math.random() * 4,
          color: Math.random() < 0.5 ? '#f97316' : '#fde047',
          life: 0.25,
          maxLife: 0.25,
          gravity: -40,
          kind: 'circle',
          rotation: 0,
          vRot: 0,
        });
      }
    }
  }

  private solveBridgeConstraints(): void {
    for (const b of this.beams) {
      if (b.broken) continue;
      const nA = this.nodes.get(b.nodeAId);
      const nB = this.nodes.get(b.nodeBId);
      if (!nA || !nB) continue;

      const dx = nB.x - nA.x;
      const dy = nB.y - nA.y;
      const dist = Math.hypot(dx, dy) || 0.0001;
      const diff = dist - b.restLength;
      const mat = MATERIALS[b.material];

      // Tension-only material (vine): goes slack when compressed!
      if (mat.tensionOnly && diff < 0) {
        continue;
      }

      const wA = nA.fixed ? 0 : 1 / nA.mass;
      const wB = nB.fixed ? 0 : 1 / nB.mass;
      const wSum = wA + wB;
      if (wSum === 0) continue;

      const corr = (diff / dist) * mat.stiffness;
      const corrX = dx * corr;
      const corrY = dy * corr;

      if (!nA.fixed) {
        const fA = wA / wSum;
        nA.x += corrX * fA;
        nA.y += corrY * fA;
      }
      if (!nB.fixed) {
        const fB = wB / wSum;
        nB.x -= corrX * fB;
        nB.y -= corrY * fB;
      }

      const impulse = (Math.abs(diff) * mat.stiffness) / wSum;
      this.beamImpulseAccum.set(b.id, (this.beamImpulseAccum.get(b.id) ?? 0) + impulse);
      this.beamSignedAccum.set(
        b.id,
        (this.beamSignedAccum.get(b.id) ?? 0) + (diff >= 0 ? impulse : -impulse),
      );
    }
  }

  private solveVehicleConstraints(): void {
    for (const v of this.vehicles) {
      if (!v.spawned) continue;
      const r = v.wheelRear;
      const f = v.wheelFront;
      const t = v.roof;

      this.constrainPair(r, f, v.wheelBase, 0.96);

      const halfBase = v.wheelBase * 0.5;
      const diag = Math.hypot(halfBase, v.chassisHeight);
      this.constrainPair(r, t, diag, 0.94);
      this.constrainPair(f, t, diag, 0.94);

      // Prevent chassis triangle from inverting relative to vehicle facing direction
      const cross = (f.x - r.x) * (t.y - r.y) - (f.y - r.y) * (t.x - r.x);
      if (v.direction === 1 ? cross > -120 : cross < 120) {
        const mx = (r.x + f.x) * 0.5;
        const my = (r.y + f.y) * 0.5;
        const dx = f.x - r.x;
        const dy = f.y - r.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = v.direction === 1 ? dy / len : -dy / len;
        const ny = v.direction === 1 ? -dx / len : dx / len;
        t.x = mx + nx * v.chassisHeight;
        t.y = my + ny * v.chassisHeight;
      }
    }
  }

  private constrainPair(
    a: { x: number; y: number },
    b: { x: number; y: number },
    targetDist: number,
    stiffness: number,
  ): void {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 0.0001;
    const diff = ((dist - targetDist) / dist) * 0.5 * stiffness;
    a.x += dx * diff;
    a.y += dy * diff;
    b.x -= dx * diff;
    b.y -= dy * diff;
  }

  private solveVehicleCollisions(subDt: number, applyDriveAndBounce: boolean): void {
    for (const v of this.vehicles) {
      if (!v.spawned) continue;
      const wheels = [v.wheelRear, v.wheelFront];

      for (const w of wheels) {
        let bestDrive: DriveCandidate | null = null;

        // 1. Terrain collisions
        for (const seg of this.level.terrainSegments) {
          const cand = this.collideWheelWithTerrain(v, w, seg, subDt);
          if (cand && (!bestDrive || cand.priority > bestDrive.priority)) {
            bestDrive = cand;
          }
        }

        // 2. Driveable bridge beams (road & spring)
        for (const b of this.beams) {
          if (b.broken) continue;
          const mat = MATERIALS[b.material];
          if (!mat.driveable) continue;
          const nA = this.nodes.get(b.nodeAId);
          const nB = this.nodes.get(b.nodeBId);
          if (!nA || !nB) continue;

          const cand = this.collideWheelWithBeam(v, w, b, nA, nB, subDt, applyDriveAndBounce);
          if (cand && (!bestDrive || cand.priority > bestDrive.priority)) {
            bestDrive = cand;
          }
        }

        // Apply drive impulse AT MOST ONCE per wheel per substep
        if (applyDriveAndBounce && bestDrive && !v.ejected && !v.crashed && !v.drowned) {
          this.applyWheelDrive(
            v,
            w,
            bestDrive.tx,
            bestDrive.ty,
            subDt,
            bestDrive.nA,
            bestDrive.nB,
            bestDrive.t,
          );
        }
      }

      // 3. Roof collisions with terrain & driveable beams so flipped cars don't sink into ground
      this.collidePointWithWorld(v.roof, 7, subDt);
    }
  }

  private collideWheelWithTerrain(
    _v: VehicleRuntime,
    w: VehicleRuntime['wheelRear'],
    seg: TerrainSegment,
    subDt: number,
  ): DriveCandidate | null {
    const abx = seg.x2 - seg.x1;
    const aby = seg.y2 - seg.y1;
    const lenSq = abx * abx + aby * aby;
    if (lenSq < 1) return null;
    const len = Math.sqrt(lenSq);

    const isHorizontal = Math.abs(abx) >= Math.abs(aby);
    // Avoid catching wheels on the top corner lip of steep cliff walls when a bridge sags 2-3px
    if (!isHorizontal) {
      const topY = Math.min(seg.y1, seg.y2);
      if (w.y < topY + 8) return null;
    }

    const apx = w.x - seg.x1;
    const apy = w.y - seg.y1;
    const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / lenSq));
    const cx = seg.x1 + abx * t;
    const cy = seg.y1 + aby * t;

    const dx = w.x - cx;
    const dy = w.y - cy;
    const dist = Math.hypot(dx, dy);
    const contactR = w.radius + 1;
    if (dist >= contactR || dist < 0.0001) return null;

    let nx = dx / dist;
    let ny = dy / dist;
    if (isHorizontal && w.y <= cy + 4) {
      // Smooth upward normal even at cliff endpoints so sagged planks transition smoothly
      nx = aby / len;
      ny = -abx / len;
      if (ny > 0) {
        nx = -nx;
        ny = -ny;
      }
    }

    const pen = contactR - dist;
    w.x += nx * pen;
    w.y += ny * pen;
    w.oldX += nx * pen;
    w.oldY += ny * pen;
    const vDotN = ((w.x - w.oldX) * nx + (w.y - w.oldY) * ny) / subDt;
    if (vDotN < 0) {
      w.oldX += nx * vDotN * subDt;
      w.oldY += ny * vDotN * subDt;
    }
    w.grounded = true;

    if (ny < -0.35) {
      return { tx: abx / len, ty: aby / len, nA: null, nB: null, t: 0, priority: 1 };
    }
    return null;
  }

  private collideWheelWithBeam(
    v: VehicleRuntime,
    w: VehicleRuntime['wheelRear'],
    beam: BridgeBeam,
    nA: BridgeNode,
    nB: BridgeNode,
    subDt: number,
    applyDriveAndBounce: boolean,
  ): DriveCandidate | null {
    const leftFirst = nA.x <= nB.x;
    const p1 = leftFirst ? nA : nB;
    const p2 = leftFirst ? nB : nA;

    const abx = p2.x - p1.x;
    const aby = p2.y - p1.y;
    const lenSq = abx * abx + aby * aby;
    if (lenSq < 4) return null;
    const len = Math.sqrt(lenSq);

    const t = Math.max(0, Math.min(1, ((w.x - p1.x) * abx + (w.y - p1.y) * aby) / lenSq));
    const cx = p1.x + abx * t;
    const cy = p1.y + aby * t;

    const nx = aby / len;
    const ny = -abx / len;

    const signedDist = (w.x - cx) * nx + (w.y - cy) * ny;
    const mat = MATERIALS[beam.material];
    const thicknessHalf = mat.thickness * 0.5;
    const targetClearance = w.radius + thicknessHalf;

    const perpDist = Math.hypot(w.x - cx, w.y - cy);
    if (perpDist > targetClearance + 4) return null;
    if (signedDist < -w.radius * 0.7 || signedDist >= targetClearance) return null;

    const pen = targetClearance - signedDist;
    const wWheel = 1 / (v.mass * 0.5);
    const wA = p1.fixed ? 0 : (1 - t) / p1.mass;
    const wB = p2.fixed ? 0 : t / p2.mass;
    const wTotal = wWheel + (1 - t) * wA + t * wB;
    if (wTotal <= 0) return null;

    const wheelShare = wWheel / wTotal;
    const shareA = wA / wTotal;
    const shareB = wB / wTotal;

    w.x += nx * pen * wheelShare;
    w.y += ny * pen * wheelShare;
    w.oldX += nx * pen * wheelShare;
    w.oldY += ny * pen * wheelShare;

    const vDotN = ((w.x - w.oldX) * nx + (w.y - w.oldY) * ny) / subDt;
    if (vDotN < 0) {
      const j = -vDotN * subDt;
      w.oldX -= nx * j * wheelShare;
      w.oldY -= ny * j * wheelShare;
      if (!p1.fixed) {
        p1.x -= nx * j * shareA;
        p1.y -= ny * j * shareA;
      }
      if (!p2.fixed) {
        p2.x -= nx * j * shareB;
        p2.y -= ny * j * shareB;
      }
    }

    w.grounded = true;
    v.maxStressSeen = Math.max(v.maxStressSeen, beam.stress);

    if (!p1.fixed) {
      p1.x -= nx * pen * shareA;
      p1.y -= ny * pen * shareA;
      p1.oldX -= nx * pen * shareA;
      p1.oldY -= ny * pen * shareA;
    }
    if (!p2.fixed) {
      p2.x -= nx * pen * shareB;
      p2.y -= ny * pen * shareB;
      p2.oldX -= nx * pen * shareB;
      p2.oldY -= ny * pen * shareB;
    }

    if (
      applyDriveAndBounce &&
      !v.ejected &&
      !v.crashed &&
      !v.drowned &&
      beam.material === 'spring' &&
      (this.springCooldown.get(beam.id) ?? 0) <= 0
    ) {
      this.springCooldown.set(beam.id, 0.35);
      beam.springSquish = 1.0;
      const boostV = mat.bounceBoost * subDt;
      const fwdX = (abx / len) * v.direction;
      const launchX = Math.max(0.45, Math.abs(nx) * 0.25 + fwdX * 0.68) * v.direction * boostV;
      const launchY = Math.min(-0.68, ny * 0.94) * boostV;
      for (const pt of [v.wheelRear, v.wheelFront, v.roof]) {
        pt.oldX -= launchX;
        pt.oldY -= launchY;
      }
      if (!p1.fixed) p1.y += (1 - t) * 3;
      if (!p2.fixed) p2.y += t * 3;

      monkeyAudio.play('boing', 0.28);
      this.spawnFloatingText(cx, cy - 22, 'BOING!', '#38bdf8', 15);
      for (let i = 0; i < 8; i++) {
        this.particles.push({
          x: cx,
          y: cy,
          vx: (Math.random() - 0.5) * 180,
          vy: -80 - Math.random() * 140,
          size: 3 + Math.random() * 3,
          color: i % 2 === 0 ? '#38bdf8' : '#fef08a',
          life: 0.4,
          maxLife: 0.4,
          gravity: 340,
          kind: 'spark',
          rotation: 0,
          vRot: 0,
        });
      }
    }

    return {
      tx: abx / len,
      ty: aby / len,
      nA: p1,
      nB: p2,
      t,
      priority: 2,
    };
  }

  private collidePointWithWorld(
    pt: { x: number; y: number; oldX: number; oldY: number },
    radius: number,
    subDt: number,
  ): void {
    // Terrain segments
    for (const seg of this.level.terrainSegments) {
      const abx = seg.x2 - seg.x1;
      const aby = seg.y2 - seg.y1;
      const lenSq = abx * abx + aby * aby;
      if (lenSq < 1) continue;
      const t = Math.max(0, Math.min(1, ((pt.x - seg.x1) * abx + (pt.y - seg.y1) * aby) / lenSq));
      const cx = seg.x1 + abx * t;
      const cy = seg.y1 + aby * t;
      const dx = pt.x - cx;
      const dy = pt.y - cy;
      const dist = Math.hypot(dx, dy);
      if (dist < radius && dist > 0.0001) {
        const nx = dx / dist;
        const ny = dy / dist;
        const pen = radius - dist;
        pt.x += nx * pen;
        pt.y += ny * pen;
        const vDotN = ((pt.x - pt.oldX) * nx + (pt.y - pt.oldY) * ny) / subDt;
        if (vDotN < 0) {
          pt.oldX += nx * vDotN * subDt * 0.65;
          pt.oldY += ny * vDotN * subDt * 0.65;
        }
        // Friction
        pt.oldX += (pt.x - pt.oldX) * 0.14;
      }
    }

    // Intact driveable beams
    for (const b of this.beams) {
      if (b.broken) continue;
      const mat = MATERIALS[b.material];
      if (!mat.driveable) continue;
      const nA = this.nodes.get(b.nodeAId);
      const nB = this.nodes.get(b.nodeBId);
      if (!nA || !nB) continue;

      const abx = nB.x - nA.x;
      const aby = nB.y - nA.y;
      const lenSq = abx * abx + aby * aby;
      if (lenSq < 4) continue;
      const t = Math.max(0, Math.min(1, ((pt.x - nA.x) * abx + (pt.y - nA.y) * aby) / lenSq));
      const cx = nA.x + abx * t;
      const cy = nA.y + aby * t;
      const dx = pt.x - cx;
      const dy = pt.y - cy;
      const dist = Math.hypot(dx, dy);
      const targetR = radius + mat.thickness * 0.4;
      if (dist < targetR && dist > 0.0001) {
        const nx = dx / dist;
        const ny = dy / dist;
        const pen = targetR - dist;
        pt.x += nx * pen * 0.8;
        pt.y += ny * pen * 0.8;
        if (!nA.fixed) {
          nA.x -= nx * pen * 0.2 * (1 - t);
          nA.y -= ny * pen * 0.2 * (1 - t);
        }
        if (!nB.fixed) {
          nB.x -= nx * pen * 0.2 * t;
          nB.y -= ny * pen * 0.2 * t;
        }
      }
    }
  }

  private applyWheelDrive(
    v: VehicleRuntime,
    w: VehicleRuntime['wheelRear'],
    tx: number,
    ty: number,
    subDt: number,
    nA: BridgeNode | null,
    nB: BridgeNode | null,
    t: number,
  ): void {
    const sign = tx * v.direction >= 0 ? 1 : -1;
    const dirX = tx * sign;
    const dirY = ty * sign;

    const vx = (w.x - w.oldX) / subDt;
    const vy = (w.y - w.oldY) / subDt;
    const curTangential = vx * dirX + vy * dirY;
    const targetSpeed = v.finished ? (v.finishTimer > 0.25 ? 0 : 45) : v.driveSpeed;
    const accel = Math.max(-260, Math.min(540, (targetSpeed - curTangential) * 10));
    const dv = accel * subDt;

    w.oldX -= dirX * dv * subDt;
    w.oldY -= dirY * dv * subDt;
    w.angle += (curTangential * subDt * v.direction) / w.radius;

    if (nA && nB) {
      const react = dv * subDt * 0.12;
      if (!nA.fixed) {
        nA.x -= dirX * react * (1 - t);
        nA.y -= dirY * react * (1 - t);
      }
      if (!nB.fixed) {
        nB.x -= dirX * react * t;
        nB.y -= dirY * react * t;
      }
    }
  }

  private evaluateBeamStress(subDt: number): void {
    const dt2 = subDt * subDt * SUBSTEPS;
    let brokeAny = false;
    let stepMax = 0;

    for (const b of this.beams) {
      if (b.broken) continue;
      const mat = MATERIALS[b.material];
      const accum = this.beamImpulseAccum.get(b.id) ?? 0;
      const signed = this.beamSignedAccum.get(b.id) ?? 0;
      const forceN = accum / Math.max(1e-7, dt2);
      const isTension = signed >= 0;
      const limitN =
        BASE_BREAKING_FORCE * (isTension ? mat.maxTension : mat.maxCompression);

      const instantStress = Number.isFinite(limitN) ? forceN / limitN : 0;
      b.stress = b.stress * 0.88 + instantStress * 0.12;
      b.signedStress = isTension ? b.stress : -b.stress;
      if (b.stress > stepMax) stepMax = b.stress;

      // Grace period of 0.18s so initial spawn settle doesn't snap
      if (this.simTime > 0.18 && b.stress >= 1.0) {
        this.breakBeam(b, 'CREC!');
        brokeAny = true;
      }
    }

    this.currentMaxStress = stepMax;
    this.peakStressEver = Math.max(this.peakStressEver, stepMax);

    if (brokeAny) {
      this.computeNodeMasses();
    }
  }

  private breakBeam(b: BridgeBeam, label: string): void {
    if (b.broken) return;
    b.broken = true;
    b.stress = 1;
    this.peakStressEver = Math.max(this.peakStressEver, 1);

    if (!this.hasBrokenBeam) {
      this.hasBrokenBeam = true;
      this.callbacks.onFirstBeamBreak?.(label);
    }

    const nA = this.nodes.get(b.nodeAId);
    const nB = this.nodes.get(b.nodeBId);
    if (nA && nB) {
      const mx = (nA.x + nB.x) * 0.5;
      const my = (nA.y + nB.y) * 0.5;
      const angle = Math.atan2(nB.y - nA.y, nB.x - nA.x);
      const halfLen = Math.hypot(nB.x - nA.x, nB.y - nA.y) * 0.48;
      const mat = MATERIALS[b.material];

      for (const side of [-1, 1]) {
        this.splinters.push({
          x: mx + Math.cos(angle) * halfLen * 0.5 * side,
          y: my + Math.sin(angle) * halfLen * 0.5 * side,
          vx: side * (45 + Math.random() * 65),
          vy: -40 - Math.random() * 70,
          angle,
          vAngle: side * (2.5 + Math.random() * 3.5),
          length: halfLen,
          thickness: mat.thickness,
          color: mat.baseColor,
          life: 2.4,
        });
      }

      for (let i = 0; i < 8; i++) {
        this.particles.push({
          x: mx,
          y: my,
          vx: (Math.random() - 0.5) * 200,
          vy: (Math.random() - 0.5) * 180 - 40,
          size: 4 + Math.random() * 4,
          color: i % 2 === 0 ? '#ef4444' : '#fde047',
          life: 0.45,
          maxLife: 0.45,
          gravity: 400,
          kind: 'spark',
          rotation: 0,
          vRot: 0,
        });
      }

      this.spawnFloatingText(mx, my - 12, label, '#ef4444', 16);
    }

    monkeyAudio.play('slap', 0.3);
    this.callbacks.onShake(7);
  }

  private checkBoatBeamCollisions(): void {
    if (!this.boat) return;
    const left = this.boat.x - this.boat.width * 0.46;
    const right = this.boat.x + this.boat.width * 0.46;
    const top = this.boat.mastTopY;
    const bottom = this.level.waterY;

    let smashed = false;
    for (const b of this.beams) {
      if (b.broken) continue;
      const nA = this.nodes.get(b.nodeAId);
      const nB = this.nodes.get(b.nodeBId);
      if (!nA || !nB) continue;

      if (this.segmentIntersectsRect(nA.x, nA.y, nB.x, nB.y, left, top, right, bottom)) {
        this.breakBeam(b, 'BARCO PASSOU O RODO!');
        this.boat.smashedCount++;
        smashed = true;
      }
    }

    if (smashed) {
      monkeyAudio.play('explosion', 0.32);
      this.callbacks.onShake(11);
      if (this.outcome === 'running') {
        this.failReason = 'O Barco Pirata passou o rodo na sua ponte baixa!';
      }
    }
  }

  private segmentIntersectsRect(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    rx1: number,
    ry1: number,
    rx2: number,
    ry2: number,
  ): boolean {
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      if (x >= rx1 && x <= rx2 && y >= ry1 && y <= ry2) return true;
    }
    return false;
  }

  private evaluateVehicles(dt: number): void {
    let allFinished = this.vehicles.length > 0;
    let anyFailed = false;

    for (const v of this.vehicles) {
      if (!v.spawned) {
        allFinished = false;
        continue;
      }

      const cx = (v.wheelRear.x + v.wheelFront.x) * 0.5;
      const cy = (v.wheelRear.y + v.wheelFront.y) * 0.5;
      v.panicLevel = Math.max(v.panicLevel * 0.9, v.maxStressSeen);

      // Upside-down flip detection regardless of altitude!
      const isUpsideDown = v.roof.y > cy + 4;
      if (isUpsideDown) {
        v.flippedTimer += dt;
      } else {
        v.flippedTimer = Math.max(0, v.flippedTimer - dt * 2);
      }

      const flippedTooLong = v.flippedTimer > 0.45;
      const outOfBounds = cx < -80 || cx > WORLD_W + 80 || cy > this.level.waterY + 120;
      const inWater = cy >= this.level.waterY - 4 || v.roof.y >= this.level.waterY;

      if ((inWater || flippedTooLong || outOfBounds) && !v.ejected) {
        this.ejectMonkeysFromVehicle(v);
        if (flippedTooLong && !v.crashed) {
          v.crashed = true;
          v.crashTimer = 0;
          if (!this.failReason) {
            this.failReason = `${v.name} capotou de rodas pro ar na gambiarra!`;
          }
        }
      }

      if (v.crashed) {
        v.crashTimer += dt;
        if (v.crashTimer > 1.05) {
          anyFailed = true;
        }
      }

      if (inWater && !v.drowned) {
        v.drowned = true;
        anyFailed = true;
        this.spawnWaterSplash(cx, this.level.waterY);
        monkeyAudio.play('explosion', 0.25);
        this.callbacks.onShake(9);
        if (!this.failReason) {
          this.failReason = `${v.name} foi nadar com os jacarés!`;
        }
      }

      // Check finish line respecting vehicle direction
      const reachedFinish = v.direction === 1 ? cx >= v.finishX : cx <= v.finishX;
      if (!v.drowned && !v.ejected && !v.crashed && reachedFinish) {
        if (!v.finished) {
          v.finished = true;
          v.finishTimer = 0;
          this.callbacks.onMonkeySaved(v.monkeyCount);
          this.spawnConfetti(cx, v.roof.y - 16);
          this.spawnFloatingText(cx, v.roof.y - 36, `+${v.monkeyCount} MACACO SALVO!`, '#4ade80', 16);
          monkeyAudio.play('banana', 0.28);
        } else {
          v.finishTimer += dt;
        }
      } else if (!v.finished) {
        allFinished = false;
      }

      if (v.finished && v.finishTimer < 0.55) {
        allFinished = false;
      }
      if (v.drowned || v.crashed) {
        allFinished = false;
        if (v.drowned || v.crashTimer > 1.05) anyFailed = true;
      }
    }

    // Ragdoll water splashes
    for (const r of this.ragdolls) {
      if (!r.splashDone && r.hip.y >= this.level.waterY) {
        r.splashDone = true;
        r.drowned = true;
        this.spawnWaterSplash(r.hip.x, this.level.waterY);
        this.callbacks.onMonkeyDrowned(1);
        for (const c of this.crocodiles) {
          c.laughTimer = 2.4;
          c.biteTimer = 0.6;
        }
      }
    }

    if (this.outcome === 'running') {
      if (allFinished) {
        this.outcome = 'won';
        this.callbacks.onVictory();
      } else if (anyFailed) {
        this.outcome = 'failed';
        this.callbacks.onFail(this.failReason || 'A gambiarra desabou no rio dos jacarés!');
      } else if (this.simTime > 26) {
        this.outcome = 'failed';
        this.callbacks.onFail('O veículo atolou na gambiarra e não chegou a tempo!');
      }
    }
  }

  private ejectMonkeysFromVehicle(v: VehicleRuntime): void {
    v.ejected = true;
    monkeyAudio.play('screech', 0.28);
    const cx = (v.wheelRear.x + v.wheelFront.x) * 0.5;
    const cy = v.roof.y;
    const tints = ['#92400e', '#78350f', '#a16207', '#b45309'];

    // Roof delta is true per-substep displacement! Clamp to sane arc velocity.
    const rawVx = v.roof.x - v.roof.oldX;
    const rawVy = v.roof.y - v.roof.oldY;

    for (let i = 0; i < v.monkeyCount; i++) {
      const mx = cx + (i - (v.monkeyCount - 1) * 0.5) * 14;
      const my = cy - 6;
      const vx = Math.max(-2.2, Math.min(2.2, rawVx * 0.7 + (Math.random() - 0.5) * 0.85));
      const vy = Math.max(-2.6, Math.min(0.8, rawVy * 0.5 - (0.85 + Math.random() * 0.65)));

      const makePart = (ox: number, oy: number): RagdollPart => ({
        x: mx + ox,
        y: my + oy,
        oldX: mx + ox - vx,
        oldY: my + oy - vy,
      });

      this.ragdolls.push({
        id: `rag-${v.id}-${i}`,
        head: makePart(0, -14),
        hip: makePart(0, 0),
        handL: makePart(-12, -8),
        handR: makePart(12, -8),
        footL: makePart(-7, 13),
        footR: makePart(7, 13),
        drowned: false,
        splashDone: false,
        shout: SHOUTS[Math.floor(Math.random() * SHOUTS.length)],
        shoutTimer: 2.0,
        tint: tints[i % tints.length],
      });
    }
  }

  private integrateRagdolls(subDt: number): void {
    const gStep = GRAVITY * subDt * subDt;
    for (const r of this.ragdolls) {
      if (r.shoutTimer > 0) r.shoutTimer -= subDt;
      const parts = [r.head, r.hip, r.handL, r.handR, r.footL, r.footR];
      for (const p of parts) {
        const vx = (p.x - p.oldX) * 0.992;
        const vy = (p.y - p.oldY) * 0.992;
        p.oldX = p.x;
        p.oldY = p.y;
        p.x += vx;
        p.y += vy + gStep;
        if (p.y > this.level.waterY + 12) {
          p.x -= vx * 0.14;
          p.y -= vy * 0.22;
          p.y -= 280 * subDt * subDt;
        }
      }
    }
  }

  private solveRagdollConstraints(): void {
    for (const r of this.ragdolls) {
      this.constrainPair(r.head, r.hip, 14, 0.9);
      this.constrainPair(r.head, r.handL, 14, 0.8);
      this.constrainPair(r.head, r.handR, 14, 0.8);
      this.constrainPair(r.hip, r.footL, 14, 0.8);
      this.constrainPair(r.hip, r.footR, 14, 0.8);
    }
  }

  private solveRagdollCollisions(subDt: number): void {
    for (const r of this.ragdolls) {
      if (r.drowned) continue;
      this.collidePointWithWorld(r.head, 5, subDt);
      this.collidePointWithWorld(r.hip, 4.5, subDt);
    }
  }

  private spawnWaterSplash(x: number, y: number): void {
    for (let i = 0; i < 20; i++) {
      const ang = -Math.PI * (0.15 + Math.random() * 0.7);
      const spd = 90 + Math.random() * 210;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 32,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        size: 4 + Math.random() * 6,
        color: i % 3 === 0 ? '#e0f2fe' : '#38bdf8',
        life: 0.75,
        maxLife: 0.75,
        gravity: 480,
        kind: 'water',
        rotation: 0,
        vRot: 0,
      });
    }
  }

  private spawnConfetti(x: number, y: number): void {
    const colors = ['#facc15', '#4ade80', '#fb7185', '#38bdf8', '#f97316'];
    for (let i = 0; i < 26; i++) {
      const ang = -Math.PI * Math.random();
      const spd = 90 + Math.random() * 200;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 40,
        size: 5 + Math.random() * 4,
        color: colors[i % colors.length],
        life: 1.4,
        maxLife: 1.4,
        gravity: 260,
        kind: i % 5 === 0 ? 'banana' : 'confetti',
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 10,
      });
    }
  }

  public spawnFloatingText(
    x: number,
    y: number,
    text: string,
    color: string,
    size = 14,
  ): void {
    this.floatingTexts.push({
      x,
      y,
      vy: -36,
      text,
      color,
      life: 1.35,
      maxLife: 1.35,
      size,
    });
  }

  private updateSplinters(dt: number): void {
    for (let i = this.splinters.length - 1; i >= 0; i--) {
      const s = this.splinters[i];
      s.vy += GRAVITY * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.angle += s.vAngle * dt;
      s.life -= dt;
      if (s.life <= 0 || s.y > this.level.waterY + 45) {
        this.splinters.splice(i, 1);
      }
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.vRot * dt;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y += ft.vy * dt;
      ft.life -= dt;
      if (ft.life <= 0) this.floatingTexts.splice(i, 1);
    }
  }

  private updateCrocodiles(dt: number): void {
    for (const c of this.crocodiles) {
      c.phase += dt * 2.2;
      c.x += c.dir * c.speed * dt;
      if (c.x <= c.minX) {
        c.x = c.minX;
        c.dir = 1;
      } else if (c.x >= c.maxX) {
        c.x = c.maxX;
        c.dir = -1;
      }
      c.y = c.baseY + Math.sin(c.phase) * 3.5;
      if (c.laughTimer > 0) c.laughTimer = Math.max(0, c.laughTimer - dt);
      if (c.biteTimer > 0) c.biteTimer = Math.max(0, c.biteTimer - dt);
    }
  }
}
