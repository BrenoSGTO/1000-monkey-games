export type HatKind = 'none' | 'helmet' | 'cap' | 'bow' | 'bandana' | 'crown' | 'astro';
export type EyewearKind = 'none' | 'goggles' | 'shades' | 'round';
export type FaceExtra = 'none' | 'mandrill' | 'flanges' | 'tufts' | 'crest' | 'cheeks';
export type KartAccessory = 'bananas' | 'flag' | 'horn' | 'spoiler' | 'umbrella' | 'rocket' | 'antenna';
export type KartShape = 'normal' | 'wide' | 'long' | 'tiny';

export interface DriverArt {
  fur: string;
  furDark: string;
  face: string;
  ear: string;
  hat: HatKind;
  hatColor: string;
  eyewear: EyewearKind;
  eyewearColor: string;
  extra: FaceExtra;
  extraColor: string;
}
export interface KartArt {
  body: string;
  trim: string;
  shape: KartShape;
  accessory: KartAccessory;
  accessoryColor: string;
  name: string;
}
export interface Driver {
  id: number;
  name: string;
  nick: string;
  tagline: string;
  color: string;
  top: number;
  accel: number;
  handling: number;
  weight: number;
  art: DriverArt;
  kart: KartArt;
  quotes: { win: string; hit: string; boost: string };
}

export const DRIVERS: Driver[] = [
  {
    id: 0,
    name: 'Seu Bananildo',
    nick: 'Bananildo',
    tagline: 'Equilibrado. Come banana até no pódio.',
    color: '#facc15',
    top: 1.0,
    accel: 1.0,
    handling: 1.0,
    weight: 1.0,
    art: { fur: '#8b5a2b', furDark: '#5e3a1a', face: '#f1c27d', ear: '#e9a98a', hat: 'cap', hatColor: '#facc15', eyewear: 'none', eyewearColor: '#111', extra: 'none', extraColor: '#000' },
    kart: { name: 'Banana-Móvel', body: '#facc15', trim: '#a16207', shape: 'normal', accessory: 'bananas', accessoryColor: '#fde047' },
    quotes: { win: 'Uuuh-aah! Banana pra todo mundo!', hit: 'Minha casca!!', boost: 'Bananaaaa!' },
  },
  {
    id: 1,
    name: 'Mica Vesga',
    nick: 'Mica',
    tagline: 'Levinha e arrancada brutal. Não enxerga nada.',
    color: '#f472b6',
    top: 0.95,
    accel: 1.2,
    handling: 1.08,
    weight: 0.8,
    art: { fur: '#d7b98e', furDark: '#a98355', face: '#f7dcc0', ear: '#f0b4a5', hat: 'bow', hatColor: '#ec4899', eyewear: 'none', eyewearColor: '#111', extra: 'none', extraColor: '#000' },
    kart: { name: 'Rolimã Rosa-Choque', body: '#f472b6', trim: '#be185d', shape: 'normal', accessory: 'flag', accessoryColor: '#fde047' },
    quotes: { win: 'Ganhei?? Quem é você mesmo?', hit: 'Ai, o meu laço!', boost: 'Eeeeeee!' },
  },
  {
    id: 2,
    name: 'Gorilão do Asfalto',
    nick: 'Gorilão',
    tagline: 'Pesadão. Demora a arrancar, ninguém passa.',
    color: '#64748b',
    top: 1.07,
    accel: 0.82,
    handling: 0.88,
    weight: 1.35,
    art: { fur: '#2c313d', furDark: '#14171f', face: '#4b5563', ear: '#3b4150', hat: 'bandana', hatColor: '#ef4444', eyewear: 'none', eyewearColor: '#111', extra: 'crest', extraColor: '#14171f' },
    kart: { name: 'Caminhonete Blindada', body: '#64748b', trim: '#1e293b', shape: 'wide', accessory: 'horn', accessoryColor: '#fbbf24' },
    quotes: { win: 'Gorilão passou o rodo!', hit: 'GRAAAH!', boost: 'RAAAWR!' },
  },
  {
    id: 3,
    name: 'Sagui Relâmpago',
    nick: 'Sagui',
    tagline: 'Miúdo, nervoso e ágil. Faz curva em moeda.',
    color: '#fb923c',
    top: 0.93,
    accel: 1.12,
    handling: 1.18,
    weight: 0.75,
    art: { fur: '#9a9484', furDark: '#6b665a', face: '#e8d9c2', ear: '#ffffff', hat: 'none', hatColor: '#000', eyewear: 'goggles', eyewearColor: '#38bdf8', extra: 'tufts', extraColor: '#ffffff' },
    kart: { name: 'Foguetinho de Lata', body: '#fb923c', trim: '#c2410c', shape: 'tiny', accessory: 'spoiler', accessoryColor: '#fef08a' },
    quotes: { win: 'Foi um raio! Cadê o troféu?', hit: 'Eeek!', boost: 'Zuuuum!' },
  },
  {
    id: 4,
    name: 'Orango Tango',
    nick: 'Orango',
    tagline: 'Mestre do drift. Dança frevo na curva.',
    color: '#14b8a6',
    top: 1.0,
    accel: 0.95,
    handling: 1.1,
    weight: 1.1,
    art: { fur: '#d9642a', furDark: '#a8451a', face: '#e8a47c', ear: '#c2561f', hat: 'none', hatColor: '#000', eyewear: 'none', eyewearColor: '#111', extra: 'flanges', extraColor: '#c2561f' },
    kart: { name: 'Sombrinha de Frevo', body: '#14b8a6', trim: '#0f766e', shape: 'normal', accessory: 'umbrella', accessoryColor: '#f43f5e' },
    quotes: { win: 'Frevo! Frevo! Frevo!', hit: 'Ai meu cabelão!', boost: 'Olê olê olá!' },
  },
  {
    id: 5,
    name: 'Zé Chinelo',
    nick: 'Zé Chinelo',
    tagline: 'Boné virado, chinelo na mão. Chinelada certeira.',
    color: '#3b82f6',
    top: 1.03,
    accel: 1.0,
    handling: 0.98,
    weight: 1.0,
    art: { fur: '#5b3a29', furDark: '#3a2418', face: '#e9b995', ear: '#d99a7c', hat: 'cap', hatColor: '#3b82f6', eyewear: 'none', eyewearColor: '#111', extra: 'cheeks', extraColor: '#f9a8a8' },
    kart: { name: 'Carroça Azulzão', body: '#3b82f6', trim: '#1e3a8a', shape: 'normal', accessory: 'antenna', accessoryColor: '#f8fafc' },
    quotes: { win: 'Chinelada na cara da concorrência!', hit: 'Ô, meu chinelo!', boost: 'Segura que é chinelo!' },
  },
  {
    id: 6,
    name: 'Madame Mandrill',
    nick: 'Madame',
    tagline: 'Elegante e veloz em retas. Óculos escuros à noite.',
    color: '#a855f7',
    top: 1.05,
    accel: 0.9,
    handling: 0.95,
    weight: 1.05,
    art: { fur: '#7a6957', furDark: '#4f4234', face: '#d1495b', ear: '#5c4d3d', hat: 'none', hatColor: '#000', eyewear: 'shades', eyewearColor: '#111827', extra: 'mandrill', extraColor: '#38bdf8' },
    kart: { name: 'Limusine Lilás', body: '#a855f7', trim: '#581c87', shape: 'long', accessory: 'spoiler', accessoryColor: '#fbcfe8' },
    quotes: { win: 'Darling, eu avisei que ia ganhar.', hit: 'Meu penteado!!', boost: 'Fabulosa!' },
  },
  {
    id: 7,
    name: 'Prof. Cuíca',
    nick: 'Prof. Cuíca',
    tagline: 'Cientista maluco. O foguete é "experimental".',
    color: '#e2e8f0',
    top: 0.98,
    accel: 1.05,
    handling: 1.0,
    weight: 0.9,
    art: { fur: '#9ca3af', furDark: '#6b7280', face: '#fbd5b0', ear: '#e5a58a', hat: 'astro', hatColor: '#f8fafc', eyewear: 'round', eyewearColor: '#1e293b', extra: 'none', extraColor: '#000' },
    kart: { name: 'Foguete Experimental', body: '#e2e8f0', trim: '#64748b', shape: 'long', accessory: 'rocket', accessoryColor: '#f97316' },
    quotes: { win: 'Hipótese confirmada: eu sou o melhor!', hit: 'Isso não estava nos cálculos!', boost: 'Propulsão máxima!' },
  },
];
