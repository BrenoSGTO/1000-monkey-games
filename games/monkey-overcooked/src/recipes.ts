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
  carrot: {
    id: 'carrot',
    name: 'Cenoura',
    shortName: 'Cenoura',
    color: '#fb923c',
    accent: '#9a3412',
    choppableTo: 'carrot_chopped',
    throwable: true,
  },
  carrot_chopped: {
    id: 'carrot_chopped',
    name: 'Cenoura Picada',
    shortName: 'Cen.Pic',
    color: '#fdba74',
    accent: '#c2410c',
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
  soup_banana: {
    id: 'soup_banana',
    name: 'Caldo de Banana',
    shortName: 'Caldo',
    color: '#f59e0b',
    accent: '#fef08a',
    throwable: true,
  },
  soup_macacao: {
    id: 'soup_macacao',
    name: 'Sopa de Macacão',
    shortName: 'Sopa!',
    color: '#ea580c',
    accent: '#fde047',
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

export interface PotRecipeRule {
  result: IngredientKind;
  ingredients: IngredientKind[];
  cookTime: number;
  brothColor: string;
}

export const POT_RECIPES: PotRecipeRule[] = [
  {
    result: 'soup_banana',
    ingredients: ['banana_chopped', 'coconut_chopped'],
    cookTime: 4.8,
    brothColor: '#fbbf24',
  },
  {
    result: 'soup_macacao',
    ingredients: ['banana_chopped', 'carrot_chopped', 'lettuce_chopped'],
    cookTime: 5.5,
    brothColor: '#ea580c',
  },
];

export interface RecipeDef {
  id: RecipeId;
  name: string;
  shortName: string;
  emoji: string;
  points: number;
  patience: number;
  requiredOnPlate: IngredientKind[];
  /** Ingredients shown as visual mini-icons on the order ticket */
  displayIngredients: IngredientKind[];
  applianceTag?: string;
  stepsHint: string[];
  guideText: string;
  color: string;
}

export const RECIPES: Record<RecipeId, RecipeDef> = {
  banana_salad: {
    id: 'banana_salad',
    name: 'Salada de Banana',
    shortName: 'Salada',
    emoji: '🥗',
    points: 45,
    patience: 50,
    requiredOnPlate: ['banana_chopped'],
    displayIngredients: ['banana_chopped'],
    stepsHint: ['🍌🔪'],
    guideText: 'Pique a Banana na tábua e sirva no prato.',
    color: '#facc15',
  },
  sopa_banana: {
    id: 'sopa_banana',
    name: 'Caldo de Banana',
    shortName: 'Caldo Ban.',
    emoji: '🥣',
    points: 80,
    patience: 66,
    requiredOnPlate: ['soup_banana'],
    displayIngredients: ['banana_chopped', 'coconut_chopped'],
    applianceTag: '🍲',
    stepsHint: ['🍌🔪', '🥥🔪', '🍲'],
    guideText: 'Pique Banana + Coco e ferva no Caldeirão.',
    color: '#fbbf24',
  },
  sopa_macacao: {
    id: 'sopa_macacao',
    name: 'Sopa de Macacão',
    shortName: 'Sopa Macacão',
    emoji: '🍲',
    points: 115,
    patience: 80,
    requiredOnPlate: ['soup_macacao'],
    displayIngredients: ['banana_chopped', 'carrot_chopped', 'lettuce_chopped'],
    applianceTag: '🍲',
    stepsHint: ['🍌🔪', '🥕🔪', '🥬🔪', '🍲'],
    guideText: 'Pique Banana + Cenoura + Alface e ferva no Caldeirão!',
    color: '#ea580c',
  },
  x_macaco: {
    id: 'x_macaco',
    name: 'X-Macaco',
    shortName: 'X-Macaco',
    emoji: '🍔',
    points: 90,
    patience: 72,
    requiredOnPlate: ['bread', 'burger_cooked', 'lettuce_chopped'],
    displayIngredients: ['bread', 'burger_cooked', 'lettuce_chopped'],
    applianceTag: '🔥',
    stepsHint: ['🍞', '🍖🔥', '🥬🔪'],
    guideText: 'Pão + Carne na Chapa + Alface Picada no prato.',
    color: '#f97316',
  },
  pastel_coco: {
    id: 'pastel_coco',
    name: 'Pastel de Coco',
    shortName: 'Pastel',
    emoji: '🥟',
    points: 80,
    patience: 66,
    requiredOnPlate: ['pastel_cooked'],
    displayIngredients: ['dough', 'coconut_chopped'],
    applianceTag: '🍳',
    stepsHint: ['🫓', '🥥🔪', '🍳'],
    guideText: 'Massa + Coco Picado na Fritadeira, depois no prato.',
    color: '#f59e0b',
  },
  acai_turbo: {
    id: 'acai_turbo',
    name: 'Açaí Turbo',
    shortName: 'Açaí Turbo',
    emoji: '🍧',
    points: 80,
    patience: 66,
    requiredOnPlate: ['acai_cooked'],
    displayIngredients: ['acai', 'banana_chopped'],
    applianceTag: '🌀',
    stepsHint: ['🫐', '🍌🔪', '🌀'],
    guideText: 'Açaí + Banana Picada no Liquidificador, depois no prato.',
    color: '#a855f7',
  },
};

export function canPlaceIngredientOnPlate(
  plateContents: IngredientKind[],
  ingredient: IngredientKind,
): boolean {
  if (ingredient === 'burnt') return false;
  if (plateContents.includes(ingredient)) return false;

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

export function canAcceptInPot(
  cookContents: IngredientKind[],
  cookedResult: IngredientKind | null,
  ing: IngredientKind,
): boolean {
  if (cookedResult !== null) return false;
  if (cookContents.includes(ing)) return false;
  const next = [...cookContents, ing];
  return POT_RECIPES.some((rule) => next.every((item) => rule.ingredients.includes(item)));
}

export function matchPotRecipe(cookContents: IngredientKind[]): PotRecipeRule | null {
  for (const rule of POT_RECIPES) {
    if (
      cookContents.length === rule.ingredients.length &&
      rule.ingredients.every((req) => cookContents.includes(req))
    ) {
      return rule;
    }
  }
  return null;
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
  '🍲 OLHA A SOPA!',
  '🍽️ LAVA A LOUÇA!',
  '🍌 JOGA BANANA!',
] as const;
