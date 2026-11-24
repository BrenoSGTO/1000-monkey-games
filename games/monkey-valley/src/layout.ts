export const MW = 64;
export const MH = 50;

export const T = { GRASS: 0, DIRT: 1, WATER: 2, SAND: 3, DEEP: 4, BRIDGE: 5, ROCK: 6, FLOOR: 7, PLANK: 8 } as const;

export interface BuildingDef {
  id: string;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  dx: number;
  label: string;
}

export const BUILDINGS: BuildingDef[] = [
  { id: 'casa', kind: 'casa', x: 5, y: 10, w: 5, h: 4, dx: 2, label: 'Casa do Vovô' },
  { id: 'celeiro', kind: 'celeiro', x: 22, y: 11, w: 4, h: 3, dx: 1, label: 'Celeiro' },
  { id: 'mercado', kind: 'mercado', x: 35, y: 8, w: 5, h: 4, dx: 2, label: 'Mercadinho Bananal' },
  { id: 'ferraria', kind: 'ferraria', x: 44, y: 8, w: 5, h: 4, dx: 2, label: 'Ferraria do Seu Mico' },
  { id: 'prefeitura', kind: 'prefeitura', x: 39, y: 14, w: 6, h: 4, dx: 3, label: 'Prefeitura' },
  { id: 'fazendinha', kind: 'fazendinha', x: 50, y: 14, w: 5, h: 4, dx: 2, label: 'Fazendinha da Tia O.' },
  { id: 'dalva', kind: 'dalva', x: 35, y: 23, w: 4, h: 3, dx: 1, label: 'Casa da Dalva' },
  { id: 'mina', kind: 'mina', x: 56, y: 3, w: 4, h: 3, dx: 2, label: 'Mina do Vovô' },
  { id: 'cabana', kind: 'cabana', x: 40, y: 41, w: 5, h: 3, dx: 2, label: 'Cabana do Capitão' },
];

export const doorOf = (id: string): [number, number] => {
  const b = BUILDINGS.find((q) => q.id === id)!;
  return [b.x + b.dx, b.y + b.h - 1];
};
export const frontOf = (id: string): [number, number] => {
  const b = BUILDINGS.find((q) => q.id === id)!;
  return [b.x + b.dx, b.y + b.h];
};

export const FARM = { x0: 2, y0: 14, x1: 28, y1: 37 };
export const PEN = { x0: 20, y0: 14, x1: 27, y1: 19 };
export const SPAWN: [number, number] = [7, 15];
export const SHIPBOX: [number, number] = [11, 15];
export const TROUGH: [number, number] = [21, 17];

export const DAYS_PER_SEASON = 14;
export const SEASONS = ['Primavera', 'Verão', 'Outono', 'Inverno'];
export const SEASON_ICON = ['🌸', '☀️', '🍂', '❄️'];
export const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
