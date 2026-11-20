export type NeedKey = 'hunger' | 'energy' | 'hygiene' | 'bladder' | 'fun' | 'social';

export type SkillKey = 'cooking' | 'charisma' | 'handiness' | 'gamer';

export type TraitId = 'gourmet' | 'lazy' | 'party' | 'workaholic';

export type AccessoryId = 'juliet' | 'crown' | 'cap' | 'headset' | 'bald';

export interface NeedsState {
  hunger: number;
  energy: number;
  hygiene: number;
  bladder: number;
  fun: number;
  social: number;
}

export interface SkillsState {
  cooking: number;
  charisma: number;
  handiness: number;
  gamer: number;
}

export interface MonkeyAppearance {
  furColor: string;
  bellyColor: string;
  accessory: AccessoryId;
}

export type FurnitureCategory =
  | 'cozinha'
  | 'conforto'
  | 'banheiro'
  | 'diversao'
  | 'decor';

export type FurnitureKind =
  | 'fridge'
  | 'fridge_pro'
  | 'stove'
  | 'stove_industrial'
  | 'hammock'
  | 'bed_gorilla'
  | 'shower_waterfall'
  | 'acai_tub'
  | 'toilet'
  | 'toilet_gold'
  | 'tv_tube'
  | 'sofa_palm'
  | 'sofa_vip'
  | 'pc_basic'
  | 'pc_rgb'
  | 'jbl_speaker'
  | 'trampoline'
  | 'guitar_stand'
  | 'plant_pot'
  | 'golden_statue'
  | 'floor_lamp';

export interface InteractionDef {
  id: string;
  label: string;
  emoji: string;
  hint: string;
  durationSec: number;
  needDeltas: Partial<NeedsState>;
  moneyDelta?: number;
  skillGain?: { skill: SkillKey; amount: number };
  careerProgress?: number;
  fireRisk?: number; // 0..1 base risk (reduced by cooking skill)
  toggleJbl?: boolean;
  emoteIcon?: string;
  sound?: 'eat' | 'cook' | 'sleep' | 'shower' | 'toilet' | 'game' | 'music' | 'work' | 'clean' | 'dance';
}

export interface FurnitureCatalogItem {
  kind: FurnitureKind;
  name: string;
  emoji: string;
  category: FurnitureCategory;
  price: number;
  comfort: number;
  widthTiles: number;
  heightTiles: number;
  color: string;
  description: string;
  emitsLight?: boolean;
  interactions: InteractionDef[];
}

export interface PlacedFurniture {
  id: string;
  kind: FurnitureKind;
  gx: number;
  gy: number;
  rotation: 0 | 1 | 2 | 3; // 0=N, 1=E, 2=S, 3=W
  broken?: boolean;
  onFire?: boolean;
}

export type SocialActionKind = 'talk' | 'joke' | 'dance' | 'gift' | 'prank' | 'fight';

export type ActionTargetType = 'walk' | 'furniture' | 'monkey' | 'fire' | 'puddle' | 'work_offsite';

export interface QueuedAction {
  id: string;
  targetType: ActionTargetType;
  label: string;
  emoji: string;
  targetGx: number;
  targetGy: number;
  furnitureId?: string;
  interactionId?: string;
  targetMonkeyId?: string;
  socialKind?: SocialActionKind;
  hazardId?: string;
  durationSec: number;
  elapsedSec: number;
  started: boolean;
}

export type MonkeyPose =
  | 'idle'
  | 'walking'
  | 'sleeping'
  | 'eating'
  | 'cooking'
  | 'showering'
  | 'toilet'
  | 'gaming'
  | 'dancing'
  | 'talking'
  | 'working_away'
  | 'passed_out'
  | 'panicking';

export interface MonkeySim {
  id: string;
  name: string;
  ownerPeerId: string | null; // null = local/NPC
  isNpc: boolean;
  isLocalControl: boolean;
  appearance: MonkeyAppearance;
  trait: TraitId;
  x: number; // world px
  y: number; // world px
  vx: number;
  vy: number;
  facing: number; // radians
  path: Array<{ gx: number; gy: number }>;
  queue: QueuedAction[];
  needs: NeedsState;
  skills: SkillsState;
  skillXp: SkillsState;
  careerLevel: number; // 0..5
  careerProgress: number; // 0..100
  pose: MonkeyPose;
  thoughtIcon: string;
  thoughtTimer: number;
  speechText: string;
  speechTimer: number;
  embarrassedTimer: number;
  passOutTimer: number;
  stinkTimer: number;
  relations: Record<string, number>; // monkeyId -> -100..100
  aiCooldown: number;
  animPhase: number;
  offsiteReturnTimer: number;
  lastUpdatedAt: number;
}

export interface FireHazard {
  id: string;
  gx: number;
  gy: number;
  furnitureId?: string;
  intensity: number; // 0..1
  age: number;
}

export interface PuddleHazard {
  id: string;
  gx: number;
  gy: number;
  ownerName: string;
}

export interface Aspiration {
  id: string;
  title: string;
  emoji: string;
  rewardMoney: number;
  rewardScore: number;
  check: (ctx: {
    monkey: MonkeySim;
    furniture: PlacedFurniture[];
    money: number;
    firesExtinguished: number;
    puddlesCleaned: number;
    mealsCooked: number;
    pranksPulled: number;
    dancesDone: number;
  }) => boolean;
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
  emoji?: string;
}

export interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

export type SimSpeed = 0 | 1 | 2 | 3;

export type RoomFloorType = 'grass' | 'kitchen' | 'living' | 'bedroom' | 'bathroom' | 'balcony';

export interface HouseSnapshot {
  day: number;
  minuteOfDay: number; // 0..1440
  speed: SimSpeed;
  money: number;
  jblPlaying: boolean;
  furniture: PlacedFurniture[];
  fires: FireHazard[];
  puddles: PuddleHazard[];
  eventBanner: string;
}

export type NetMessage =
  | { kind: 'monkey_sync'; monkey: MonkeySim }
  | { kind: 'house_sync'; house: HouseSnapshot }
  | { kind: 'buy_furniture'; item: PlacedFurniture; cost: number }
  | { kind: 'move_furniture'; id: string; gx: number; gy: number; rotation: 0 | 1 | 2 | 3 }
  | { kind: 'sell_furniture'; id: string; refund: number }
  | { kind: 'toggle_jbl'; playing: boolean; actorName: string }
  | { kind: 'spawn_fire'; fire: FireHazard; actorName: string }
  | { kind: 'extinguish_fire'; fireId: string; actorName: string }
  | { kind: 'spawn_puddle'; puddle: PuddleHazard }
  | { kind: 'clean_puddle'; puddleId: string; actorName: string }
  | { kind: 'social_event'; fromId: string; fromName: string; targetId: string; action: SocialActionKind; amount?: number }
  | { kind: 'chat_emote'; monkeyId: string; monkeyName: string; text: string }
  | { kind: 'set_speed'; speed: SimSpeed }
  | { kind: 'money_delta'; delta: number; reason: string };
