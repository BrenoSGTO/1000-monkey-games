import type { MaterialDef, MaterialId } from './types';

export const MATERIALS: Record<MaterialId, MaterialDef> = {
  road: {
    id: 'road',
    name: 'Tábua de Estrada',
    shortName: 'Tábua',
    emoji: '🪵',
    costPer100px: 15,
    massPerPx: 0.024,
    stiffness: 0.94,
    maxTension: 1.55,
    maxCompression: 1.5,
    maxLength: 145,
    driveable: true,
    tensionOnly: false,
    bounceBoost: 0,
    baseColor: '#c2854c',
    accentColor: '#78350f',
    thickness: 10,
  },
  bamboo: {
    id: 'bamboo',
    name: 'Bambu Estrutural',
    shortName: 'Bambu',
    emoji: '🎋',
    costPer100px: 8,
    massPerPx: 0.011,
    stiffness: 0.9,
    maxTension: 0.78,
    maxCompression: 0.72,
    maxLength: 165,
    driveable: false,
    tensionOnly: false,
    bounceBoost: 0,
    baseColor: '#84cc16',
    accentColor: '#365314',
    thickness: 6,
  },
  vine: {
    id: 'vine',
    name: 'Cipó Elástico',
    shortName: 'Cipó',
    emoji: '🌿',
    costPer100px: 7,
    massPerPx: 0.008,
    stiffness: 0.58,
    maxTension: 1.25,
    maxCompression: Number.POSITIVE_INFINITY,
    maxLength: 270,
    driveable: false,
    tensionOnly: true,
    bounceBoost: 0,
    baseColor: '#16a34a',
    accentColor: '#14532d',
    thickness: 5,
  },
  steel: {
    id: 'steel',
    name: 'Viga de Aço de Ferro-Velho',
    shortName: 'Aço',
    emoji: '🔩',
    costPer100px: 28,
    massPerPx: 0.036,
    stiffness: 0.99,
    maxTension: 3.1,
    maxCompression: 3.0,
    maxLength: 185,
    driveable: false,
    tensionOnly: false,
    bounceBoost: 0,
    baseColor: '#64748b',
    accentColor: '#ea580c',
    thickness: 9,
  },
  spring: {
    id: 'spring',
    name: 'Mola de Colchão Velho',
    shortName: 'Mola',
    emoji: '🌀',
    costPer100px: 22,
    massPerPx: 0.028,
    stiffness: 0.42,
    maxTension: 1.45,
    maxCompression: 1.55,
    maxLength: 140,
    driveable: true,
    tensionOnly: false,
    bounceBoost: 430,
    baseColor: '#38bdf8',
    accentColor: '#0284c7',
    thickness: 11,
  },
};

export const MATERIAL_LIST: MaterialDef[] = [
  MATERIALS.road,
  MATERIALS.bamboo,
  MATERIALS.vine,
  MATERIALS.steel,
  MATERIALS.spring,
];

export function computeBeamCost(material: MaterialId, lengthPx: number): number {
  const mat = MATERIALS[material];
  return Math.max(4, Math.round((lengthPx / 100) * mat.costPer100px));
}

export function stressColor(stress: number, fallbackColor: string): string {
  const s = Math.max(0, stress);
  if (s <= 0.02) {
    return lerpHex(fallbackColor.startsWith('#') ? fallbackColor : '#22c55e', '#22c55e', 0.45);
  }
  if (s < 0.35) {
    // Blend green -> yellow
    return lerpHex('#22c55e', '#eab308', s / 0.35);
  }
  if (s < 0.7) {
    // Blend yellow -> orange
    return lerpHex('#eab308', '#f97316', (s - 0.35) / 0.35);
  }
  // Blend orange -> vivid red
  return lerpHex('#f97316', '#ef4444', Math.min(1, (s - 0.7) / 0.28));
}

function lerpHex(hexA: string, hexB: string, t: number): string {
  const c = Math.max(0, Math.min(1, t));
  const a = parseInt(hexA.slice(1), 16);
  const b = parseInt(hexB.slice(1), 16);
  const r1 = (a >> 16) & 255;
  const g1 = (a >> 8) & 255;
  const b1 = a & 255;
  const r2 = (b >> 16) & 255;
  const g2 = (b >> 8) & 255;
  const b2 = b & 255;
  const r = Math.round(r1 + (r2 - r1) * c);
  const g = Math.round(g1 + (g2 - g1) * c);
  const bl = Math.round(b1 + (b2 - b1) * c);
  return `rgb(${r}, ${g}, ${bl})`;
}
