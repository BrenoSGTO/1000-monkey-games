export type MaterialId = 'road' | 'bamboo' | 'vine' | 'steel' | 'spring';
export type ToolId = MaterialId | 'eraser';

export interface MaterialDef {
  id: MaterialId;
  name: string;
  shortName: string;
  emoji: string;
  costPer100px: number;
  massPerPx: number;
  stiffness: number;
  /** Maximum axial tension force (before snapping) */
  maxTension: number;
  /** Maximum axial compression force (Infinity for tension-only cables like vine) */
  maxCompression: number;
  maxLength: number;
  driveable: boolean;
  tensionOnly: boolean;
  bounceBoost: number;
  baseColor: string;
  accentColor: string;
  thickness: number;
}

export interface BridgeNode {
  id: string;
  x: number;
  y: number;
  oldX: number;
  oldY: number;
  /** Original blueprint coordinates */
  homeX: number;
  homeY: number;
  fixed: boolean;
  /** Computed total mass during simulation */
  mass: number;
  /** Optional owner peer color */
  authorColor?: string;
}

export interface BridgeBeam {
  id: string;
  nodeAId: string;
  nodeBId: string;
  material: MaterialId;
  restLength: number;
  cost: number;
  /** 0..1+ normalized stress for real-time coloring & fracture */
  stress: number;
  /** Signed axial strain (-compression, +tension) */
  signedStress: number;
  broken: boolean;
  /** Visual bounce squish timer for mattress spring */
  springSquish: number;
  authorColor?: string;
}

export interface SerializedNode {
  id: string;
  x: number;
  y: number;
  fixed: boolean;
  authorColor?: string;
}

export interface SerializedBeam {
  id: string;
  nodeAId: string;
  nodeBId: string;
  material: MaterialId;
  cost: number;
  authorColor?: string;
}

export type VehicleKind = 'cart' | 'kombi' | 'tanker' | 'moped';

export interface VehicleSpec {
  kind: VehicleKind;
  name: string;
  spawnDelay: number;
}

export interface TerrainSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface LevelDef {
  index: number;
  id: string;
  name: string;
  subtitle: string;
  hint: string;
  budget: number;
  waterY: number;
  finishX: number;
  spawnX: number;
  spawnY: number;
  terrainSegments: TerrainSegment[];
  /** Polygon silhouettes for drawing cliffs/piers/towers */
  terrainPolygons: Array<{ points: Array<[number, number]>; kind: 'cliff' | 'pier' | 'tower' }>;
  anchors: Array<{ id: string; x: number; y: number }>;
  vehicles: VehicleSpec[];
  boatHazard?: {
    startX: number;
    endX: number;
    speed: number;
    hullTopY: number;
    mastTopY: number;
    width: number;
  };
}

export interface WheelPoint {
  x: number;
  y: number;
  oldX: number;
  oldY: number;
  radius: number;
  angle: number;
  grounded: boolean;
}

export interface VehicleRuntime {
  id: string;
  kind: VehicleKind;
  name: string;
  mass: number;
  driveSpeed: number;
  wheelRear: WheelPoint;
  wheelFront: WheelPoint;
  roof: { x: number; y: number; oldX: number; oldY: number };
  wheelBase: number;
  chassisHeight: number;
  monkeyCount: number;
  ejected: boolean;
  finished: boolean;
  finishTimer: number;
  drowned: boolean;
  panicLevel: number;
  spawned: boolean;
  spawnTimer: number;
  maxStressSeen: number;
}

export interface RagdollPart {
  x: number;
  y: number;
  oldX: number;
  oldY: number;
}

export interface RagdollMonkey {
  id: string;
  head: RagdollPart;
  hip: RagdollPart;
  handL: RagdollPart;
  handR: RagdollPart;
  footL: RagdollPart;
  footR: RagdollPart;
  drowned: boolean;
  splashDone: boolean;
  shout: string;
  shoutTimer: number;
  tint: string;
}

export interface BrokenSplinter {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  vAngle: number;
  length: number;
  thickness: number;
  color: string;
  life: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
  gravity: number;
  kind: 'circle' | 'banana' | 'water' | 'spark' | 'confetti';
  rotation: number;
  vRot: number;
}

export interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  size: number;
}

export interface Crocodile {
  x: number;
  baseY: number;
  y: number;
  dir: 1 | -1;
  speed: number;
  laughTimer: number;
  biteTimer: number;
  phase: number;
}

export interface BoatRuntime {
  x: number;
  y: number;
  width: number;
  hullTopY: number;
  mastTopY: number;
  speed: number;
  startX: number;
  endX: number;
  smashedCount: number;
}

export interface RemoteCursor {
  peerId: string;
  name: string;
  color: string;
  x: number;
  y: number;
  tool: ToolId;
  lastSeen: number;
}

export type BridgeNetMessage =
  | { kind: 'cursor'; x: number; y: number; tool: ToolId; color: string }
  | { kind: 'add_beam'; beam: SerializedBeam; nodeA: SerializedNode; nodeB: SerializedNode }
  | { kind: 'remove_beam'; beamId: string }
  | { kind: 'clear_bridge' }
  | { kind: 'start_sim' }
  | { kind: 'stop_sim' }
  | { kind: 'set_level'; levelIndex: number }
  | { kind: 'set_slowmo'; slowMo: boolean }
  | {
      kind: 'sync_state';
      levelIndex: number;
      nodes: SerializedNode[];
      beams: SerializedBeam[];
      totalScore: number;
      savedMonkeys: number;
      drownedMonkeys: number;
      completedLevels: number[];
    };
