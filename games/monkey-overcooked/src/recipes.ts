import type { IngredientKind, RecipeId } from './types';

export interface IngredientInfo {
  id: IngredientKind;
  name: string;
  shortName: string;
  color: string;
  accent: string;
  choppableTo?: IngredientKind;
  throwable: boolean;
}

export const INGREDIENTS: Record<IngredientKind, IngredientInfo> = {
  banana: {
    id: 'banana',
    name: 'Banana',
    shortName: 'Banana',
    color: '#facc15',
    accent: '#854d0e',
    choppableTo: 'banana_chopped',
    throwable: true,
  },
  banana_chopped: {
    id: 'banana_chopped',
    name: 'Banana Picada',
    shortName: 'Ban.Pic',
    color: '#fde047',
    accent: '#a16207',
    throwable: true,
  },
  lettuce: {
    id: 'lettuce',
    name: 'Alface',
    shortName: 'Alface',
    color: '#22c55e',
    accent: '#14532d',
    choppableTo: 'lettuce_chopped',
    throwable: true,
  },
  lettuce_chopped: {
    id: 'lettuce_chopped',
    name: 'Alface Picada',
    shortName: 'Alf.Pic',
    color: '#4ade80',
    accent: '#166534',
    throwable: true,
  },
  bread: {
    id: 'bread',
    name: 'Pão Brioche',
    shortName: 'Pão',
    color: '#f59e0b',
    accent: '#92400e',
    throwable: true,
  },
  burger: {
    id: 'burger',
    name: 'Hambúrguer Cru',
    shortName: 'Carne',
    color: '#ef4444',
    accent: '#7f1d1d',
    throwable: true,
  },
  burger_cooked: {
    id: 'burger_cooked',
    name: 'Hambúrguer na Chapa',
    shortName: 'Chapa',
    color: '#92400e',
    accent: '#451a03',
    throwable: true,
  },
  dough: {
    id: 'dough',
    name: 'Massa de Pastel',
    shortName: 'Massa',
    color: '#fef3c7',
    accent: '#d97706',
    throwable: true,
  },
  coconut: {
    id: 'coconut',
    name: 'Coco Inteiro',
    shortName: 'Coco',
    color: '#78350f',
    accent: '#f8fafc',
    choppableTo: 'coconut_chopped',
    throwable: true,
  },
  coconut_chopped: {
    id: 'coconut_chopped',
    name: 'Coco Picado',
    shortName: 'CocoPic',
    color: '#f8fafc',
    accent: '#78350f',
    throwable: true,
  },
  pastel_cooked: {
    id: 'pastel_cooked',
    name: 'Pastel de Coco',
    shortName: 'Pastel',
    color: '#fbbf24',
    accent: '#92400e',
    throwable: true,
  },
  acai: {
    id: 'acai',
    name: 'Polpa de Açaí',
    shortName: 'Açaí',
    color: '#6b21a8',
    accent: '#c084fc',
    throwable: true,
  },
  acai_cooked: {
    id: 'acai_cooked',
    name: 'Açaí Batido',
    shortName: 'Tigela',
    color: '#7e22ce',
    accent: '#facc15',
    throwable: true,
  },
  burnt: {
    id: 'burnt',
    name: 'Carvão Macaco',
    shortName: 'Queimou',
    color: '#1f2937',
    accent: '#ef4444',
    throwable: true,
  },
};

export interface RecipeDef {
  id: RecipeId;
  name: string;
  emoji: string;
  points: number;
  patience: number;
  requiredOnPlate: IngredientKind[];
  stepsHint: string[];
  color: string;
}

export const RECIPES: Record<RecipeId, RecipeDef> = {
  banana_salad: {
    id: 'banana_salad',
    name: 'Salada de Banana',
    emoji: '🥗',
    points: 40,
    patience: 48,
    requiredOnPlate: ['banana_chopped'],
    stepsHint: ['🍌🔪'],
    color: '#facc15',
  },
  x_macaco: {
    id: 'x_macaco',
    name: 'X-Macaco',
    emoji: '🍔',
    points: 85,
    patience: 70,
    requiredOnPlate: ['bread', 'burger_cooked', 'lettuce_chopped'],
    stepsHint: ['🍞', '🍖🔥', '🥬🔪'],
    color: '#f97316',
  },
  pastel_coco: {
    id: 'pastel_coco',
    name: 'Pastel de Coco',
    emoji: '🥟',
    points: 75,
    patience: 65,
    requiredOnPlate: ['pastel_cooked'],
    stepsHint: ['🫓', '🥥🔪', '🍳'],
    color: '#fbbf24',
  },
  acai_turbo: {
    id: 'acai_turbo',
    name: 'Açaí Turbo',
    emoji: '🍧',
    points: 75,
    patience: 65,
    requiredOnPlate: ['acai_cooked'],
    stepsHint: ['🫐', '🍌🔪', '🌀'],
    color: '#a855f7',
  },
};

export function canPlaceIngredientOnPlate(
  plateContents: IngredientKind[],
  ingredient: IngredientKind,
): boolean {
  if (ingredient === 'burnt') return false;
  if (plateContents.includes(ingredient)) return false;

  // Check if adding this ingredient stays a valid subset of at least one recipe
  const next = [...plateContents, ingredient];
  for (const recipe of Object.values(RECIPES)) {
    if (next.every((ing) => recipe.requiredOnPlate.includes(ing))) {
      return true;
    }
  }
  return false;
}

export function matchCompletedRecipe(plateContents: IngredientKind[]): RecipeId | undefined {
  for (const recipe of Object.values(RECIPES)) {
    if (
      plateContents.length === recipe.requiredOnPlate.length &&
      recipe.requiredOnPlate.every((req) => plateContents.includes(req))
    ) {
      return recipe.id;
    }
  }
  return undefined;
}

export function canAcceptInGrill(
  cookContents: IngredientKind[],
  cookedResult: IngredientKind | null,
  ing: IngredientKind,
): boolean {
  if (cookedResult !== null || cookContents.length > 0) return false;
  return ing === 'burger';
}

export function canAcceptInFryer(
  cookContents: IngredientKind[],
  cookedResult: IngredientKind | null,
  ing: IngredientKind,
): boolean {
  if (cookedResult !== null || cookContents.length >= 2) return false;
  if (ing !== 'dough' && ing !== 'coconut_chopped') return false;
  return !cookContents.includes(ing);
}

export function canAcceptInBlender(
  cookContents: IngredientKind[],
  cookedResult: IngredientKind | null,
  ing: IngredientKind,
): boolean {
  if (cookedResult !== null || cookContents.length >= 2) return false;
  if (ing !== 'acai' && ing !== 'banana_chopped') return false;
  return !cookContents.includes(ing);
}

export const SHOUT_MESSAGES = [
  '🔥 TÁ QUEIMANDO!',
  '🍽️ LAVA A LOUÇA!',
  '🍌 JOGA BANANA!',
  '🏃 CORRE!',
] as const;
