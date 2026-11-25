export type GameMode = 'solo' | 'local2p' | 'online';

export type KitchenId = 'quiosque' | 'caminhoes' | 'esteira' | 'faria-lima' | 'vulcao';

export type IngredientKind =
  | 'banana'
  | 'banana_chopped'
  | 'lettuce'
  | 'lettuce_chopped'
  | 'carrot'
  | 'carrot_chopped'
  | 'bread'
  | 'burger'
  | 'burger_cooked'
  | 'dough'
  | 'coconut'
  | 'coconut_chopped'
  | 'pastel_cooked'
  | 'acai'
  | 'acai_cooked'
  | 'soup_banana'
  | 'soup_macacao'
  | 'burnt';

export type RecipeId =
  | 'banana_salad'
  | 'sopa_banana'
  | 'sopa_macacao'
  | 'x_macaco'
  | 'pastel_coco'
  | 'acai_turbo';

export type HeldItem =
  | { kind: 'ingredient'; ingredient: IngredientKind; chopProgress?: number }
  | { kind: 'plate'; contents: IngredientKind[]; dish?: RecipeId; burnt?: boolean }
  | { kind: 'dirty_plate'; count: number }
  | { kind: 'extinguisher' };

export type StationType =
  | 'floor'
  | 'wall'
  | 'gap'
  | 'bridge'
  | 'counter'
  | 'crate'
  | 'board'
  | 'pot'
  | 'grill'
  | 'fryer'
  | 'blender'
  | 'sink'
  | 'pass'
  | 'return'
  | 'plates'
  | 'trash'
  | 'extinguisher_stand'
  | 'conveyor';

export interface TileState {
  x: number;
  y: number;
  baseType: StationType;
  crateIngredient?: IngredientKind;
  conveyorDir?: { dx: number; dy: number };
  item: HeldItem | null;
  cookContents: IngredientKind[];
  cookProgress: number;
  burnProgress: number;
  cookedResult: IngredientKind | null;
  washProgress: number;
  dirtyCount: number;
  cleanPlateCount: number;
  fire: number;
  conveyorOffset: number;
}

export interface ChefState {
  id: string;
  index: number;
  name: string;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dirX: number;
  dirY: number;
  held: HeldItem | null;
  dashTimer: number;
  dashCooldown: number;
  slipTimer: number;
  isWorking: boolean;
  autoWorkTile: { x: number; y: number } | null;
  shoutText: string | null;
  shoutTimer: number;
  targetTile: { x: number; y: number } | null;
  walkCycle: number;
  panic: boolean;
}

export interface ThrownItem {
  id: number;
  item: HeldItem;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  throwerId: string;
  age: number;
}

export interface FloorItem {
  id: number;
  x: number;
  y: number;
  item: HeldItem;
}

export interface OrderTicket {
  id: number;
  recipe: RecipeId;
  timeLeft: number;
  maxTime: number;
  age: number;
}

export interface ThiefRat {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  carrying: HeldItem | null;
  state: 'seeking' | 'fleeing';
  targetX: number;
  targetY: number;
  stunTimer: number;
}

export interface BananaPeel {
  id: number;
  x: number;
  y: number;
  ttl: number;
}

export interface SimParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  color: string;
  size: number;
  life: number;
  maxLife: number;
  kind: 'smoke' | 'fire' | 'foam' | 'chop' | 'spark' | 'dust' | 'steam';
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

export interface KitchenDef {
  id: KitchenId;
  name: string;
  subtitle: string;
  description: string;
  themeColor: string;
  floorA: string;
  floorB: string;
  counterColor: string;
  gapStyle?: 'highway' | 'lava';
  duration: number;
  recipes: RecipeId[];
  stars: [number, number, number];
  hasBridgeCycle: boolean;
  hasRatHazard: boolean;
  hasPeelHazard: boolean;
  orderInterval: number;
  maxOrders: number;
  layout: string[];
  spawns: Array<{ x: number; y: number }>;
}

export interface ChefInputState {
  moveX: number;
  moveY: number;
  interactPressed: boolean;
  workHeld: boolean;
  workPressed: boolean;
  throwPressed: boolean;
  dashPressed: boolean;
  shoutIndex: number; // 0 = none, 1..4
}

export type SimSoundEvent =
  | 'chop'
  | 'sizzle'
  | 'bubble'
  | 'blend'
  | 'wash'
  | 'pickup'
  | 'drop'
  | 'throw'
  | 'dash'
  | 'deliver'
  | 'deliverCombo'
  | 'orderFail'
  | 'alarm'
  | 'extinguish'
  | 'slip'
  | 'rat'
  | 'shout'
  | 'burn'
  | 'bridge'
  | 'tick'
  | 'start'
  | 'rush';

export interface SimSnapshot {
  kitchenId: KitchenId;
  mode: GameMode;
  timeLeft: number;
  totalTime: number;
  countdown: number;
  rushHour: boolean;
  score: number;
  tipsEarned: number;
  combo: number;
  maxCombo: number;
  deliveredCount: number;
  failedCount: number;
  firesExtinguished: number;
  finished: boolean;
  bridgeDocked: boolean;
  bridgeTimer: number;
  bridgeWarning: boolean;
  shake: number;
  tiles: TileState[];
  chefs: ChefState[];
  thrown: ThrownItem[];
  floorItems: FloorItem[];
  orders: OrderTicket[];
  rats: ThiefRat[];
  peels: BananaPeel[];
  pendingReturns: number;
}

export type NetMessage =
  | {
      kind: 'input';
      dx: number;
      dy: number;
      interact: boolean;
      workHeld: boolean;
      workPressed: boolean;
      throwItem: boolean;
      dash: boolean;
      shout: number;
    }
  | {
      kind: 'start';
      kitchenId: KitchenId;
      mode: 'online';
    }
  | {
      kind: 'snapshot';
      snapshot: SimSnapshot;
    }
  | {
      kind: 'event';
      sound?: SimSoundEvent;
      floatText?: { x: number; y: number; text: string; color: string };
    }
  | {
      kind: 'backToMenu';
    };
