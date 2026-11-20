export type GamePhase =
  | 'lobby'
  | 'reveal'
  | 'playing'
  | 'meeting'
  | 'ejecting'
  | 'gameover';

export type PlayerRole = 'crew' | 'impostor';
export type PreferredRole = 'random' | 'crew' | 'impostor';

export type HatId = 'none' | 'banana' | 'crown' | 'cap' | 'leaf' | 'visor_band';

export interface MonkeyColorSpec {
  id: string;
  name: string;
  body: string;
  dark: string;
}

export const MONKEY_SUIT_COLORS: MonkeyColorSpec[] = [
  { id: 'red', name: 'Vermelho', body: '#ef4444', dark: '#b91c1c' },
  { id: 'blue', name: 'Azul', body: '#3b82f6', dark: '#1d4ed8' },
  { id: 'green', name: 'Verde', body: '#22c55e', dark: '#15803d' },
  { id: 'yellow', name: 'Amarelo', body: '#facc15', dark: '#ca8a04' },
  { id: 'orange', name: 'Laranja', body: '#f97316', dark: '#c2410c' },
  { id: 'purple', name: 'Roxo', body: '#a855f7', dark: '#7e22ce' },
  { id: 'cyan', name: 'Ciano', body: '#06b6d4', dark: '#0e7490' },
  { id: 'pink', name: 'Rosa', body: '#ec4899', dark: '#be185d' },
  { id: 'lime', name: 'Limão', body: '#84cc16', dark: '#4d7c0f' },
  { id: 'brown', name: 'Marrom', body: '#a16207', dark: '#713f12' },
];

export const HATS: { id: HatId; label: string; emoji: string }[] = [
  { id: 'none', label: 'Sem Chapéu', emoji: '🐒' },
  { id: 'banana', label: 'Casca de Banana', emoji: '🍌' },
  { id: 'crown', label: 'Coroa Real', emoji: '👑' },
  { id: 'cap', label: 'Boné Espacial', emoji: '🧢' },
  { id: 'leaf', label: 'Folha de Bananeira', emoji: '🌿' },
  { id: 'visor_band', label: 'Faixa Ninja', emoji: '🥷' },
];

export type RoomId =
  | 'refeitorio'
  | 'enfermaria'
  | 'reator'
  | 'motores'
  | 'eletrica'
  | 'seguranca'
  | 'armazem'
  | 'navegacao'
  | 'corredor';

export type TaskKind =
  | 'wires'
  | 'peel'
  | 'scan'
  | 'reactor_nums'
  | 'asteroids';

export interface TaskSpot {
  id: string;
  kind: TaskKind;
  title: string;
  room: RoomId;
  roomLabel: string;
  x: number;
  y: number;
}

export interface VentNode {
  id: string;
  room: RoomId;
  x: number;
  y: number;
  links: string[];
}

export interface SecurityCamera {
  id: string;
  label: string;
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RoomDef {
  id: RoomId;
  name: string;
  rect: Rect;
  floorColor: string;
  accentColor: string;
}

export interface Waypoint {
  id: string;
  room: RoomId;
  x: number;
  y: number;
  neighbors: string[];
}

export type SabotageKind = 'lights' | 'reactor';

export interface ActiveSabotage {
  kind: SabotageKind;
  timer: number; // for reactor countdown (starts at 35s)
  startedAt: number;
}

export interface DeadBody {
  id: string;
  victimId: string;
  victimName: string;
  color: MonkeyColorSpec;
  x: number;
  y: number;
  room: RoomId;
  roomLabel: string;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderColor: string;
  text: string;
  ghostOnly: boolean;
  system?: boolean;
  timestamp: number;
}

export interface PlayerState {
  id: string;
  name: string;
  isBot: boolean;
  isHost: boolean;
  color: MonkeyColorSpec;
  hat: HatId;
  role: PlayerRole;
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number; // 1 right, -1 left
  walkPhase: number;
  inVent: string | null;
  scanning: boolean;
  watchingCams: boolean;
  tasksAssigned: string[]; // TaskSpot ids
  tasksDone: string[]; // TaskSpot ids
  killCooldown: number;
  emergencyUsesLeft: number;
  votedFor: string | null; // player id or 'skip' or null
}

export interface LobbySettings {
  impostorCount: 1 | 2;
  botFillCount: number; // total monkeys desired (4..10)
  speedMult: number; // 0.85 | 1.0 | 1.25 | 1.5
  killCooldown: number; // 15 | 20 | 25 | 30
  preferredRole: PreferredRole;
}

export interface MeetingState {
  reason: 'body' | 'emergency';
  callerId: string;
  callerName: string;
  bodyRoomLabel?: string;
  victimName?: string;
  victimColor?: string;
  timeLeft: number;
  phase: 'discuss' | 'voting';
}

export interface EjectionState {
  ejectedId: string | null;
  ejectedName: string;
  ejectedColor: string;
  wasImpostor: boolean;
  tieOrSkip: boolean;
  remainingImpostors: number;
  timer: number;
}

export interface GameOverState {
  winner: 'crew' | 'impostor';
  reason: string;
  impostors: { id: string; name: string; color: string; alive: boolean }[];
  scoreEarned: number;
}

export interface BotSighting {
  targetId: string;
  targetName: string;
  colorName: string;
  room: RoomId;
  roomLabel: string;
  time: number;
}

export interface BotBrain {
  path: string[];
  targetTaskId: string | null;
  pauseTimer: number;
  reportDelay: number;
  pendingBodyId: string | null;
  huntCooldown: number;
  ventTimer: number;
  sightings: BotSighting[];
  spokeInMeeting: boolean;
  meetingSpeakAt: number;
  meetingVoteAt: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  text?: string;
}

export type NetMessage =
  | { kind: 'lobby_prefs'; name: string; colorId: string; hat: HatId }
  | { kind: 'lobby_sync'; settings: LobbySettings; players: PlayerState[] }
  | { kind: 'match_start'; players: PlayerState[]; settings: LobbySettings }
  | {
      kind: 'player_move';
      x: number;
      y: number;
      vx: number;
      vy: number;
      facing: number;
      inVent: string | null;
      scanning: boolean;
      watchingCams: boolean;
    }
  | {
      kind: 'world_sync';
      players: Array<{
        id: string;
        x: number;
        y: number;
        vx: number;
        vy: number;
        facing: number;
        alive: boolean;
        inVent: string | null;
        scanning: boolean;
        watchingCams: boolean;
        tasksDone: string[];
        killCooldown: number;
      }>;
      sabotage: ActiveSabotage | null;
      sabotageCooldown: number;
      emergencyCooldown: number;
    }
  | { kind: 'req_task_done'; taskId: string }
  | { kind: 'task_done_ack'; playerId: string; taskId: string }
  | { kind: 'req_kill'; targetId: string }
  | { kind: 'kill_event'; killerId: string; victimId: string; body: DeadBody }
  | { kind: 'req_report'; bodyId?: string }
  | { kind: 'req_emergency' }
  | { kind: 'meeting_start'; meeting: MeetingState; bodiesCleared: boolean; players: PlayerState[] }
  | { kind: 'req_chat'; text: string; ghostOnly: boolean }
  | { kind: 'chat_msg'; msg: ChatMessage }
  | { kind: 'req_vote'; targetId: string }
  | { kind: 'vote_cast'; voterId: string; targetId: string }
  | { kind: 'ejection_start'; ejection: EjectionState; players: PlayerState[] }
  | { kind: 'resume_play'; players: PlayerState[]; emergencyCooldown: number }
  | { kind: 'req_sabotage'; sabotageKind: SabotageKind }
  | { kind: 'sabotage_start'; sabotage: ActiveSabotage }
  | { kind: 'req_sabotage_fix'; sabotageKind: SabotageKind }
  | { kind: 'sabotage_fixed'; sabotageKind: SabotageKind }
  | { kind: 'game_over'; result: GameOverState; players: PlayerState[] }
  | { kind: 'back_to_lobby'; players: PlayerState[]; settings: LobbySettings };
