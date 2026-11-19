import { monkeyAudio } from '@monkey-slop/sdk';
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

export interface PhysicsCallbacks {
  onShake: (amount: number) => void;
  onMonkeySaved: (count: number) => void;
  onMonkeyDrowned: (count: number) => void;
  onVictory: () => void;
  onFail: (reason: string) => void;
}

export class BridgePhysicsWorld {
  public level: LevelDef;
  public nodes = new Map<string, BridgeNode>();
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
  private beamImpulseAccum = new Map<string, number>();
  private beamSignedAccum = new Map<string, number>();
  private springCooldown = new Map<string, number>();
  private callbacks: PhysicsCallbacks;

  constructor(level: LevelDef, callbacks: PhysicsCallbacks) {
    this.level = level;
    this.callbacks = callbacks;
    this.initAmbientCrocs();
  }

  private initAmbientCrocs(): void {
    this.crocodiles = [];
    const spanStart = 340;
    const spanEnd = 860;
    const count = 3;
    for (let i = 0; i < count; i++) {
      this.crocodiles.push({
        x: spanStart + ((spanEnd - spanStart) / (count + 1)) * (i + 1),
        baseY: this.level.waterY + 14,
        y: this.level.waterY + 14,
        dir: i % 2 === 0 ? 1 : -1,
        speed: 22 + i * 7,
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
    this.vehicles = [];
    this.ragdolls = [];
    this.splinters = [];
    this.particles = [];
    this.floatingTexts = [];
    this.beamImpulseAccum.clear();
    this.beamSignedAccum.clear();
    this.springCooldown.clear();

    this.nodes.clear();
    for (const [id, n] of blueprintNodes) {
      this.nodes.set(id, {
        ...n,
        x: n.homeX,
        y: n.homeY,
        oldX: n.homeX,
        oldY: n.homeY,
      });
    }

    this.beams = blueprintBeams.map((b) => ({
      ...b,
      stress: 0,
      signedStress: 0,
      broken: false,
      springSquish: 0,
    }));

    this.computeNodeMasses();

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
      this.createVehicle(spec.kind, spec.name, idx, spec.spawnDelay),
    );
  }

  private createVehicle(
    kind: VehicleKind,
    name: string,
    idx: number,
    spawnDelay: number,
  ): VehicleRuntime {
    const specs: Record<
      VehicleKind,
      { mass: number; speed: number; wheelBase: number; height: number; radius: number; monkeys: number }
    > = {
      cart: { mass: 3.4, speed: 150, wheelBase: 44, height: 24, radius: 11, monkeys: 1 },
      kombi: { mass: 6.0, speed: 132, wheelBase: 64, height: 32, radius: 13, monkeys: 4 },
      tanker: { mass: 10.2, speed: 108, wheelBase: 78, height: 36, radius: 15, monkeys: 2 },
      moped: { mass: 2.7, speed: 230, wheelBase: 36, height: 22, radius: 10, monkeys: 1 },
    };
    const s = specs[kind];
    const startX = this.level.spawnX - idx * 12;
    const groundY = this.sampleTerrainY(startX);
    const wy = groundY - s.radius - 1;
    const rx = startX - s.wheelBase * 0.5;
    const fx = startX + s.wheelBase * 0.5;
    const roofX = startX;
    const roofY = wy - s.height;

    return {
      id: `veh-${idx}-${kind}`,
      kind,
      name,
      mass: s.mass,
      driveSpeed: s.speed,
      wheelRear: { x: rx, y: wy, oldX: rx, oldY: wy, radius: s.radius, angle: 0, grounded: false },
      wheelFront: { x: fx, y: wy, oldX: fx, oldY: wy, radius: s.radius, angle: 0, grounded: false },
      roof: { x: roofX, y: roofY, oldX: roofX, oldY: roofY },
      wheelBase: s.wheelBase,
      chassisHeight: s.height,
      monkeyCount: s.monkeys,
      ejected: false,
      finished: false,
      finishTimer: 0,
      drowned: false,
      panicLevel: 0,
      spawned: spawnDelay <= 0.01,
      spawnTimer: spawnDelay,
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
    for (const n of this.nodes.values()) {
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

    // Update Boat Hazard (Stage 6)
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
    for (const n of this.nodes.values()) {
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

      // Water drag if node sinks into river
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
          x: v.wheelRear.x - 10,
          y: v.wheelRear.y - 6,
          vx: -80 - Math.random() * 50,
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

      // Accumulate true physical impulse magnitude: |diff * stiffness| / wSum
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

      // 1. Rear <-> Front wheelbase
      this.constrainPair(r, f, v.wheelBase, 0.96);

      // 2. Wheels <-> Roof triangle
      const halfBase = v.wheelBase * 0.5;
      const diag = Math.hypot(halfBase, v.chassisHeight);
      this.constrainPair(r, t, diag, 0.94);
      this.constrainPair(f, t, diag, 0.94);

      // Prevent chassis triangle from ever inverting
      const cross = (f.x - r.x) * (t.y - r.y) - (f.y - r.y) * (t.x - r.x);
      if (cross > -120) {
        const mx = (r.x + f.x) * 0.5;
        const my = (r.y + f.y) * 0.5;
        const dx = f.x - r.x;
        const dy = f.y - r.y;
        const len = Math.hypot(dx, dy) || 1;
        // Normal pointing "up" relative to wheel axle
        const nx = dy / len;
        const ny = -dx / len;
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
        // 1. Terrain collisions
        for (const seg of this.level.terrainSegments) {
          this.collideWheelWithTerrain(v, w, seg, subDt, applyDriveAndBounce);
        }

        // 2. Driveable bridge beams (road & spring)
        for (const b of this.beams) {
          if (b.broken) continue;
          const mat = MATERIALS[b.material];
          if (!mat.driveable) continue;
          const nA = this.nodes.get(b.nodeAId);
          const nB = this.nodes.get(b.nodeBId);
          if (!nA || !nB) continue;

          this.collideWheelWithBeam(v, w, b, nA, nB, subDt, applyDriveAndBounce);
        }
      }
    }
  }

  private collideWheelWithTerrain(
    v: VehicleRuntime,
    w: VehicleRuntime['wheelRear'],
    seg: TerrainSegment,
    subDt: number,
    applyDrive: boolean,
  ): void {
    const abx = seg.x2 - seg.x1;
    const aby = seg.y2 - seg.y1;
    const lenSq = abx * abx + aby * aby;
    if (lenSq < 1) return;
    const len = Math.sqrt(lenSq);

    const apx = w.x - seg.x1;
    const apy = w.y - seg.y1;
    const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / lenSq));
    const cx = seg.x1 + abx * t;
    const cy = seg.y1 + aby * t;

    const dx = w.x - cx;
    const dy = w.y - cy;
    const dist = Math.hypot(dx, dy);
    const contactR = w.radius + 1;
    if (dist >= contactR || dist < 0.0001) return;

    // Outward normal (for top platforms, upward)
    let nx = dx / dist;
    let ny = dy / dist;
    if (Math.abs(abx) > Math.abs(aby) && w.y < cy + 4) {
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

    if (applyDrive && !v.ejected && !v.drowned && ny < -0.35) {
      this.applyWheelDrive(v, w, abx / len, aby / len, subDt, null, null, 0);
    }
  }

  private collideWheelWithBeam(
    v: VehicleRuntime,
    w: VehicleRuntime['wheelRear'],
    beam: BridgeBeam,
    nA: BridgeNode,
    nB: BridgeNode,
    subDt: number,
    applyDriveAndBounce: boolean,
  ): void {
    // Orient left-to-right for consistent top normal
    const leftFirst = nA.x <= nB.x;
    const p1 = leftFirst ? nA : nB;
    const p2 = leftFirst ? nB : nA;

    const abx = p2.x - p1.x;
    const aby = p2.y - p1.y;
    const lenSq = abx * abx + aby * aby;
    if (lenSq < 4) return;
    const len = Math.sqrt(lenSq);

    const t = Math.max(0, Math.min(1, ((w.x - p1.x) * abx + (w.y - p1.y) * aby) / lenSq));
    const cx = p1.x + abx * t;
    const cy = p1.y + aby * t;

    // Upward normal of left-to-right beam
    const nx = aby / len;
    const ny = -abx / len;

    // Signed distance from beam centerline along upward normal
    const signedDist = (w.x - cx) * nx + (w.y - cy) * ny;
    const mat = MATERIALS[beam.material];
    const thicknessHalf = mat.thickness * 0.5;
    const targetClearance = w.radius + thicknessHalf;

    // Only collide if wheel is on top side (prevents snapping upward from underneath)
    const perpDist = Math.hypot(w.x - cx, w.y - cy);
    if (perpDist > targetClearance + 4) return;
    if (signedDist < -w.radius * 0.7 || signedDist >= targetClearance) return;

    const pen = targetClearance - signedDist;
    const wWheel = 1 / (v.mass * 0.5);
    const wA = p1.fixed ? 0 : (1 - t) / p1.mass;
    const wB = p2.fixed ? 0 : t / p2.mass;
    const wTotal = wWheel + wA * (1 - t) + wB * t;
    if (wTotal <= 0) return;

    const wheelShare = wWheel / wTotal;
    // Move wheel & old pos together to resolve overlap with zero phantom bounce
    w.x += nx * pen * wheelShare;
    w.y += ny * pen * wheelShare;
    w.oldX += nx * pen * wheelShare;
    w.oldY += ny * pen * wheelShare;

    // Cancel inward normal velocity & transfer momentum to bridge nodes
    const vDotN = ((w.x - w.oldX) * nx + (w.y - w.oldY) * ny) / subDt;
    if (vDotN < 0) {
      const j = -vDotN * subDt;
      w.oldX -= nx * j * wheelShare;
      w.oldY -= ny * j * wheelShare;
      if (!p1.fixed) {
        const shareA = (wA * (1 - t)) / wTotal;
        p1.x -= nx * j * shareA;
        p1.y -= ny * j * shareA;
      }
      if (!p2.fixed) {
        const shareB = (wB * t) / wTotal;
        p2.x -= nx * j * shareB;
        p2.y -= ny * j * shareB;
      }
    }

    w.grounded = true;
    v.maxStressSeen = Math.max(v.maxStressSeen, beam.stress);

    if (!p1.fixed) {
      const shareA = (wA * (1 - t)) / wTotal;
      p1.x -= nx * pen * shareA;
      p1.y -= ny * pen * shareA;
      p1.oldX -= nx * pen * shareA;
      p1.oldY -= ny * pen * shareA;
    }
    if (!p2.fixed) {
      const shareB = (wB * t) / wTotal;
      p2.x -= nx * pen * shareB;
      p2.y -= ny * pen * shareB;
      p2.oldX -= nx * pen * shareB;
      p2.oldY -= ny * pen * shareB;
    }

    if (applyDriveAndBounce && !v.ejected && !v.drowned) {
      this.applyWheelDrive(v, w, abx / len, aby / len, subDt, p1, p2, t);

      // Mattress Spring Launch!
      if (beam.material === 'spring' && (this.springCooldown.get(beam.id) ?? 0) <= 0) {
        this.springCooldown.set(beam.id, 0.35);
        beam.springSquish = 1.0;
        const boostV = mat.bounceBoost * subDt;
        const fwdX = abx / len;
        const launchX = Math.max(0.45, nx * 0.3 + fwdX * 0.68) * boostV;
        const launchY = Math.min(-0.65, ny * 0.92) * boostV;
        for (const pt of [v.wheelRear, v.wheelFront, v.roof]) {
          pt.oldX -= launchX;
          pt.oldY -= launchY;
        }
        // Recoil push down on spring nodes
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
    // Ensure drive tangent always points right (+X)
    const dirX = tx >= 0 ? tx : -tx;
    const dirY = tx >= 0 ? ty : -ty;

    const vx = (w.x - w.oldX) / subDt;
    const vy = (w.y - w.oldY) / subDt;
    const curTangential = vx * dirX + vy * dirY;
    const targetSpeed = v.finished ? (v.finishTimer > 0.25 ? 0 : 45) : v.driveSpeed;
    const accel = Math.max(-260, Math.min(540, (targetSpeed - curTangential) * 10));
    const dv = accel * subDt;

    w.oldX -= dirX * dv * subDt;
    w.oldY -= dirY * dv * subDt;
    w.angle += (curTangential * subDt) / w.radius;

    // Equal and opposite traction reaction on bridge deck
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

      // Grace period of 0.18s so initial spawn settle doesn't snap
      if (this.simTime > 0.18 && b.stress >= 1.0) {
        this.breakBeam(b, 'CREC!');
        brokeAny = true;
      }
    }

    if (brokeAny) {
      this.computeNodeMasses();
    }
  }

  private breakBeam(b: BridgeBeam, label: string): void {
    if (b.broken) return;
    b.broken = true;
    b.stress = 1;

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
    let anyDrowned = false;

    for (const v of this.vehicles) {
      if (!v.spawned) {
        allFinished = false;
        continue;
      }

      const cx = (v.wheelRear.x + v.wheelFront.x) * 0.5;
      const cy = (v.wheelRear.y + v.wheelFront.y) * 0.5;
      v.panicLevel = Math.max(v.panicLevel * 0.9, v.maxStressSeen);

      // Check upside-down crash or water splash
      const flipped = v.roof.y > cy + 8 && !v.wheelRear.grounded && !v.wheelFront.grounded;
      const inWater = cy >= this.level.waterY - 4 || v.roof.y >= this.level.waterY;

      if ((inWater || (flipped && cy > 475)) && !v.ejected) {
        this.ejectMonkeysFromVehicle(v);
      }

      if (inWater && !v.drowned) {
        v.drowned = true;
        anyDrowned = true;
        this.spawnWaterSplash(cx, this.level.waterY);
        monkeyAudio.play('explosion', 0.25);
        this.callbacks.onShake(9);
        if (!this.failReason) {
          this.failReason = `${v.name} foi nadar com os jacarés!`;
        }
      }

      // Check finish line
      if (!v.drowned && !v.ejected && cx >= this.level.finishX) {
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
      if (v.drowned) {
        allFinished = false;
        anyDrowned = true;
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
      } else if (anyDrowned) {
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

    for (let i = 0; i < v.monkeyCount; i++) {
      const mx = cx + (i - (v.monkeyCount - 1) * 0.5) * 14;
      const my = cy - 6;
      const vx = (Math.random() - 0.5) * 4 + (v.wheelFront.x - v.wheelRear.oldX) * 0.04;
      const vy = -4.2 - Math.random() * 2.5;

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
          // Float gently on water
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
      life: 1.25,
      maxLife: 1.25,
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
      if (c.x < 390) {
        c.x = 390;
        c.dir = 1;
      } else if (c.x > 810) {
        c.x = 810;
        c.dir = -1;
      }
      c.y = c.baseY + Math.sin(c.phase) * 3.5;
      if (c.laughTimer > 0) c.laughTimer = Math.max(0, c.laughTimer - dt);
      if (c.biteTimer > 0) c.biteTimer = Math.max(0, c.biteTimer - dt);
    }
  }
}
