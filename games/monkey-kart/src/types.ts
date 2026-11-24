export type ItemType = 'banana' | 'coco' | 'enxame' | 'guarana' | 'chinelo' | 'nuvem';
export const ITEM_TYPES: ItemType[] = ['banana', 'coco', 'enxame', 'guarana', 'chinelo', 'nuvem'];

export const ITEM_INFO: Record<ItemType, { name: string; emoji: string; hint: string }> = {
  banana: { name: 'Casca de Banana', emoji: '🍌', hint: 'Solta atrás: quem pisar escorrega!' },
  coco: { name: 'Coco Teleguiado', emoji: '🥥', hint: 'Persegue o macaco da frente!' },
  enxame: { name: 'Enxame de Marimbondos', emoji: '🐝', hint: 'Ataca o líder da corrida!' },
  guarana: { name: 'Turbo de Guaraná', emoji: '🥤', hint: 'Turbo + ignora a grama!' },
  chinelo: { name: 'Chinelo Voador', emoji: '🩴', hint: 'Chinelada que ricocheteia!' },
  nuvem: { name: 'Nuvem de Pum', emoji: '💨', hint: 'Nuvem fedida na pista!' },
};

/** Expression indexes */
export const EXPR_NORMAL = 0;
export const EXPR_SCREAM = 1;
export const EXPR_CRY = 2;
export const EXPR_HAPPY = 3;

export interface Input {
  steer: number; // -1..1
  accel: number; // 0..1
  brake: number; // 0..1
  drift: boolean;
  /** Incremented on each press of the item button. */
  itemCount: number;
}

export function emptyInput(): Input {
  return { steer: 0, accel: 0, brake: 0, drift: false, itemCount: 0 };
}

export const SURF_VOID = 0;
export const SURF_SLOW = 1;
export const SURF_ROAD = 2;
export const SURF_SHORT = 3;

export interface CcSetting {
  name: string;
  label: string;
  max: number;
  ai: number;
}
export const CC_SETTINGS: CcSetting[] = [
  { name: '50cc', label: 'Banana Verde (fácil)', max: 290, ai: 0.88 },
  { name: '100cc', label: 'Banana Madura (médio)', max: 325, ai: 0.95 },
  { name: '150cc', label: 'Banana Passada (difícil)', max: 360, ai: 1.0 },
];

export const LAPS = 3;
export const GP_POINTS = [15, 12, 10, 8, 6, 4, 2, 1];
