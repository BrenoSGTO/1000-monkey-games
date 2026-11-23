import type { SkinDef, SkinId } from './types';

export const SKINS: SkinDef[] = [
  {
    id: 'classico',
    name: 'Clássico',
    emoji: '🐒',
    furLight: '#d97706',
    furMid: '#92400e',
    furDark: '#451a03',
    face: '#fed7aa',
    earInner: '#fda4af',
    outline: '#291507',
  },
  {
    id: 'pix',
    name: 'Do Pix',
    emoji: '💸',
    furLight: '#4ade80',
    furMid: '#16a34a',
    furDark: '#14532d',
    face: '#dcfce7',
    earInner: '#86efac',
    outline: '#052e16',
  },
  {
    id: 'tio-zap',
    name: 'Tio do Zap',
    emoji: '📱',
    furLight: '#38bdf8',
    furMid: '#0284c7',
    furDark: '#0c4a6e',
    face: '#fef3c7',
    earInner: '#93c5fd',
    outline: '#082f49',
  },
  {
    id: 'rei',
    name: 'Rei Banana',
    emoji: '👑',
    furLight: '#fde047',
    furMid: '#eab308',
    furDark: '#854d0e',
    face: '#fef9c3',
    earInner: '#fdba74',
    outline: '#422006',
  },
  {
    id: 'cyber',
    name: 'Ciborgue',
    emoji: '🤖',
    furLight: '#c084fc',
    furMid: '#9333ea',
    furDark: '#4c1d95',
    face: '#e9d5ff',
    earInner: '#38bdf8',
    outline: '#2e1065',
  },
  {
    id: 'morango',
    name: 'Moranguinho',
    emoji: '🍓',
    furLight: '#fb7185',
    furMid: '#e11d48',
    furDark: '#881337',
    face: '#ffe4e6',
    earInner: '#fda4af',
    outline: '#4c0519',
  },
  {
    id: 'ninja',
    name: 'Ninja',
    emoji: '🥷',
    furLight: '#475569',
    furMid: '#1e293b',
    furDark: '#020617',
    face: '#fde68a',
    earInner: '#94a3b8',
    outline: '#0f172a',
  },
  {
    id: 'ouro',
    name: 'Mico Punk',
    emoji: '🔥',
    furLight: '#fb923c',
    furMid: '#ea580c',
    furDark: '#7c2d12',
    face: '#ffedd5',
    earInner: '#fdba74',
    outline: '#431407',
  },
];

export const SKIN_MAP: Record<SkinId, SkinDef> = Object.fromEntries(
  SKINS.map((s) => [s.id, s]),
) as Record<SkinId, SkinDef>;

export const BOT_NAMES: string[] = [
  'Macaco do Pix',
  'Tio do Zap',
  'Babuíno Calvo',
  'Sagui CLT',
  'Chimp Farialimer',
  'Gorila do Agro',
  'Mico Bombado',
  'Orangotango VIP',
  'Zé da Manga',
  'Primata Trader',
  'Macaco Crente',
  'Símio Gamer',
  'Chita Sabida',
  'Babuíno Coach',
  'Macaco Prego',
  'Mico Estagiário',
];

export const EAT_QUOTES: string[] = [
  'NHAC!',
  'PIX RECEBIDO!',
  'VIROU VITAMINA!',
  'ENGOLIDO!',
  'DELÍCIA!',
  'TÁ PAGO!',
  'FOI DE ARRASTA!',
  'BANANADA!',
];

export const CACTUS_QUOTES: string[] = [
  'AI MEU COCO!',
  'CACTO MALDITO!',
  'ESTOUROU!!',
  'ESPINHO NO RABO!',
];

export const ARENA_SIZE = 3800;
export const START_MASS = 32;
export const MIN_SPLIT_MASS = 36;
export const MIN_EJECT_MASS = 34;
export const EJECT_PELLET_MASS = 14;
export const MAX_CELLS_PER_PLAYER = 16;
export const EAT_MASS_RATIO = 1.18;

export function massToRadius(mass: number): number {
  return 11 + Math.sqrt(Math.max(1, mass)) * 3.85;
}
