import type { AchievementDef, BuildingDef, GameState, UpgradeDef } from './types';

export const BUILDINGS: BuildingDef[] = [
  {
    id: 'estagiario',
    name: 'Macaco Estagiário',
    emoji: '🐒',
    baseCost: 15,
    baseBps: 0.4,
    desc: 'Trabalha por meio cacho e café frio da copa.',
  },
  {
    id: 'cipo',
    name: 'Fábrica de Cipó',
    emoji: '🌿',
    baseCost: 100,
    baseBps: 3,
    desc: 'Tecelagem industrial para catar banana lá no alto.',
  },
  {
    id: 'bananeira',
    name: 'Bananeira Quântica',
    emoji: '🌴',
    baseCost: 850,
    baseBps: 18,
    desc: 'Existe em superposição: madura e passada ao mesmo tempo.',
  },
  {
    id: 'churrascaria',
    name: 'Churrascaria de Banana',
    emoji: '🔥',
    baseCost: 6500,
    baseBps: 95,
    desc: 'Rodízio de banana na brasa com farofa de formiga.',
  },
  {
    id: 'banco',
    name: 'Banco Central da Selva',
    emoji: '🏦',
    baseCost: 48000,
    baseBps: 480,
    desc: 'Imprime banana fiduciária lastreada em grito de bugio.',
  },
  {
    id: 'satelite',
    name: 'Satélite Banana-Sat',
    emoji: '🛰️',
    baseCost: 340000,
    baseBps: 2400,
    desc: 'Mapeia plantações do espaço e rouba Wi-Fi dos tucanos.',
  },
  {
    id: 'usina',
    name: 'Usina Termo-Macaca',
    emoji: '⚡',
    baseCost: 2400000,
    baseBps: 12500,
    desc: 'Mil macacos em esteiras gerando potássio puro.',
  },
  {
    id: 'lab',
    name: 'Lab Genético Primata',
    emoji: '🧪',
    baseCost: 18000000,
    baseBps: 68000,
    desc: 'Cruza banana-nanica com urânio enriquecido e whey.',
  },
  {
    id: 'portal',
    name: 'Portal do Macaco Cósmico',
    emoji: '🌀',
    baseCost: 140000000,
    baseBps: 380000,
    desc: 'Importa cachos de dimensões onde os humanos são os pets.',
  },
  {
    id: 'singularidade',
    name: 'Singularidade Bananífera',
    emoji: '🌌',
    baseCost: 1100000000,
    baseBps: 2200000,
    desc: 'Colapsa a gravidade num purê infinito de banana dourada.',
  },
];

export const UPGRADES: UpgradeDef[] = [
  // Click upgrades
  {
    id: 'oleo_dende',
    name: 'Dedo com Óleo de Dendê',
    emoji: '👆',
    cost: 60,
    desc: 'Dobra o poder do seu clique (x2). Escorregadio e eficiente!',
    unlockRequirement: { minClicks: 10 },
    effect: { kind: 'clickMult', mult: 2 },
  },
  {
    id: 'mouse_cipo',
    name: 'Mouse Gamer RGB de Cipó',
    emoji: '🖱️',
    cost: 420,
    desc: 'Mais um x2 no clique! Aumenta o FPS da sua mão em 400%.',
    unlockRequirement: { minClicks: 50 },
    effect: { kind: 'clickMult', mult: 2 },
  },
  {
    id: 'luva_gorila',
    name: 'Luva de Boxe do King Kong',
    emoji: '🥊',
    cost: 3800,
    desc: 'Seu clique passa a valer x3! Cada tap dá concussão na banana.',
    unlockRequirement: { minClicks: 150 },
    effect: { kind: 'clickMult', mult: 3 },
  },
  {
    id: 'sinergia_dedo',
    name: 'Terceirização Digital',
    emoji: '🤝',
    cost: 12000,
    desc: 'Cada clique ganha +5% da sua produção por segundo (BPS)!',
    unlockRequirement: { minLifetime: 4000 },
    effect: { kind: 'clickAddBpsPercent', percent: 0.05 },
  },
  {
    id: 'sinergia_turbo',
    name: 'Click Clandestino 2.0',
    emoji: '⚡',
    cost: 180000,
    desc: 'Cada clique ganha mais +8% do seu BPS total!',
    unlockRequirement: { minLifetime: 60000 },
    effect: { kind: 'clickAddBpsPercent', percent: 0.08 },
  },
  {
    id: 'combo_cafe',
    name: 'Café Expresso de Bugio',
    emoji: '☕',
    cost: 2200,
    desc: 'Seu Combo de cliques dá ainda mais bônus multiplicador!',
    unlockRequirement: { minClicks: 80 },
    effect: { kind: 'comboBoost', bonusPerLevel: 0.04 },
  },
  // Building upgrades
  {
    id: 'estag_vale',
    name: 'Vale-Coxinha pro Estagiário',
    emoji: '🥟',
    cost: 150,
    desc: 'Macacos Estagiários produzem x2! Eles nem pedem carteira assinada.',
    unlockRequirement: { buildingId: 'estagiario', minCount: 5 },
    effect: { kind: 'buildingMult', buildingId: 'estagiario', mult: 2 },
  },
  {
    id: 'estag_diploma',
    name: 'Diploma Uniesquina da Selva',
    emoji: '🎓',
    cost: 1400,
    desc: 'Macacos Estagiários agora são Sêniors e produzem x2!',
    unlockRequirement: { buildingId: 'estagiario', minCount: 20 },
    effect: { kind: 'buildingMult', buildingId: 'estagiario', mult: 2 },
  },
  {
    id: 'cipo_nylon',
    name: 'Cipó de Nylon Trançado',
    emoji: '🪢',
    cost: 900,
    desc: 'Fábricas de Cipó produzem x2 sem arrebentar no meio do balanço.',
    unlockRequirement: { buildingId: 'cipo', minCount: 5 },
    effect: { kind: 'buildingMult', buildingId: 'cipo', mult: 2 },
  },
  {
    id: 'bananeira_adubo',
    name: 'Adubo de Casca Radioativa',
    emoji: '☢️',
    cost: 7500,
    desc: 'Bananeiras Quânticas produzem x2 e brilham no escuro!',
    unlockRequirement: { buildingId: 'bananeira', minCount: 5 },
    effect: { kind: 'buildingMult', buildingId: 'bananeira', mult: 2 },
  },
  {
    id: 'churras_carvao',
    name: 'Carvão de Coco Premium',
    emoji: '🥥',
    cost: 55000,
    desc: 'Churrascarias de Banana dobram a produção (x2)!',
    unlockRequirement: { buildingId: 'churrascaria', minCount: 5 },
    effect: { kind: 'buildingMult', buildingId: 'churrascaria', mult: 2 },
  },
  {
    id: 'banco_pix',
    name: 'Pix do Macaco Sem Taxa',
    emoji: '💸',
    cost: 400000,
    desc: 'Banco Central da Selva rende x2 em juros compostos!',
    unlockRequirement: { buildingId: 'banco', minCount: 5 },
    effect: { kind: 'buildingMult', buildingId: 'banco', mult: 2 },
  },
  {
    id: 'satelite_5g',
    name: 'Antena Parabólica de Cacho',
    emoji: '📡',
    cost: 2800000,
    desc: 'Satélites Banana-Sat ficam 2x mais rápidos!',
    unlockRequirement: { buildingId: 'satelite', minCount: 5 },
    effect: { kind: 'buildingMult', buildingId: 'satelite', mult: 2 },
  },
  {
    id: 'usina_whey',
    name: 'Whey de Banana nas Esteiras',
    emoji: '💪',
    cost: 19000000,
    desc: 'Usinas Termo-Macacas produzem x2 com macacos marombas!',
    unlockRequirement: { buildingId: 'usina', minCount: 5 },
    effect: { kind: 'buildingMult', buildingId: 'usina', mult: 2 },
  },
  {
    id: 'lab_crispr',
    name: 'CRISPR Símio Pirata',
    emoji: '🧬',
    cost: 140000000,
    desc: 'Labs Genéticos produzem x2 bananas com 6 pontas!',
    unlockRequirement: { buildingId: 'lab', minCount: 5 },
    effect: { kind: 'buildingMult', buildingId: 'lab', mult: 2 },
  },
  {
    id: 'portal_passaporte',
    name: 'Visto Diplomático Multiversal',
    emoji: '🛂',
    cost: 980000000,
    desc: 'Portais Cósmicos dobram a importação interdimensional!',
    unlockRequirement: { buildingId: 'portal', minCount: 5 },
    effect: { kind: 'buildingMult', buildingId: 'portal', mult: 2 },
  },
  {
    id: 'singularidade_molho',
    name: 'Purê Sagrado Eterno',
    emoji: '🍮',
    cost: 8500000000,
    desc: 'Singularidades Bananíferas produzem x2!',
    unlockRequirement: { buildingId: 'singularidade', minCount: 5 },
    effect: { kind: 'buildingMult', buildingId: 'singularidade', mult: 2 },
  },
  // Global & Golden upgrades
  {
    id: 'gourmet_potassio',
    name: 'Potássio 9999% Puro',
    emoji: '✨',
    cost: 25000,
    desc: 'Toda a produção do seu império aumenta +50% (x1.5)!',
    unlockRequirement: { minLifetime: 10000 },
    effect: { kind: 'globalMult', mult: 1.5 },
  },
  {
    id: 'coach_quantico',
    name: 'Curso de Coach Quântico Símio',
    emoji: '🧠',
    cost: 650000,
    desc: 'Mude o mindset da selva! +75% de produção global (x1.75).',
    unlockRequirement: { minLifetime: 250000 },
    effect: { kind: 'globalMult', mult: 1.75 },
  },
  {
    id: 'imperio_galactico',
    name: 'Monopólio da Galáxia Amarela',
    emoji: '👑',
    cost: 35000000,
    desc: 'Dobra TODA a produção global (x2)!',
    unlockRequirement: { minLifetime: 10000000 },
    effect: { kind: 'globalMult', mult: 2 },
  },
  {
    id: 'olho_aguia_vesgo',
    name: 'Óculos de Grau pro Macaco Vesgo',
    emoji: '🤓',
    cost: 8500,
    desc: 'Bananas Douradas dão o DOBRO de recompensa (x2)!',
    unlockRequirement: { minLifetime: 2500 },
    effect: { kind: 'goldenMult', mult: 2 },
  },
];

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'primeiro_clique',
    name: 'Primeiro Tap',
    emoji: '👆',
    desc: 'Dê o primeiro clique na Banana Gigante.',
    check: (s) => s.totalClicks >= 1,
  },
  {
    id: 'mao_macaco',
    name: 'Mão de Macaco',
    emoji: '🖐️',
    desc: 'Clique 100 vezes na Banana Gigante.',
    check: (s) => s.totalClicks >= 100,
  },
  {
    id: 'carpo_simio',
    name: 'Túnel do Carpo Símio',
    emoji: '🤕',
    desc: 'Clique 1.000 vezes! Seu mouse pediu arrego.',
    check: (s) => s.totalClicks >= 1000,
  },
  {
    id: 'rh_selva',
    name: 'RH da Selva',
    emoji: '🐒',
    desc: 'Contrate 10 Macacos Estagiários.',
    check: (s) => (s.buildings.estagiario || 0) >= 10,
  },
  {
    id: 'milionario',
    name: 'Milionário de Potássio',
    emoji: '💰',
    desc: 'Acumule 1.000.000 de bananas no total.',
    check: (s) => s.lifetimeBananas >= 1_000_000,
  },
  {
    id: 'bilionario',
    name: 'Bilionário da Casca',
    emoji: '🤑',
    desc: 'Acumule 1.000.000.000 de bananas no total.',
    check: (s) => s.lifetimeBananas >= 1_000_000_000,
  },
  {
    id: 'cacador_ouro',
    name: 'Caçador de Ouro',
    emoji: '🌟',
    desc: 'Pegue sua primeira Banana Dourada.',
    check: (s) => s.goldenClicked >= 1,
  },
  {
    id: 'viciado_ouro',
    name: 'Garimpeiro Primata',
    emoji: '✨',
    desc: 'Pegue 10 Bananas Douradas.',
    check: (s) => s.goldenClicked >= 10,
  },
  {
    id: 'anti_imposto',
    name: 'Sonegador Profissional',
    emoji: '🦍',
    desc: 'Espante 3 eventos caóticos (Gorila / Greve).',
    check: (s) => s.chaosDefeated >= 3,
  },
  {
    id: 'banqueiro',
    name: 'Faria Lima da Selva',
    emoji: '🏦',
    desc: 'Tenha pelo menos 1 Banco Central da Selva.',
    check: (s) => (s.buildings.banco || 0) >= 1,
  },
  {
    id: 'cosmico',
    name: 'Além da Órbita',
    emoji: '🌀',
    desc: 'Abra seu primeiro Portal do Macaco Cósmico.',
    check: (s) => (s.buildings.portal || 0) >= 1,
  },
  {
    id: 'reencarnado',
    name: 'Macaco Iluminado',
    emoji: '🧬',
    desc: 'Reencarne pelo menos 1 vez com Prestígio.',
    check: (s) => s.reincarnations >= 1,
  },
];

export const EVOLUTION_TIERS = [
  { minChips: 0, title: 'Macaco Pedra Lasca', badge: '🪨', desc: 'Bate na banana com um graveto.' },
  { minChips: 1, title: 'Macaco Estagiário Pleno', badge: '👔', desc: 'Usa gravata torta e toma café.' },
  { minChips: 5, title: 'Macaco Faria Limer', badge: '🕶️', desc: 'Óculos escuros e colete de investir banana.' },
  { minChips: 20, title: 'Macaco Cyberpunk 2077', badge: '🤖', desc: 'Visor laser calculando potássio quântico.' },
  { minChips: 75, title: 'Macaco Deus Cósmico', badge: '👑', desc: 'Coroa flutuante e aura de pura banana!' },
];

export const FUNNY_CLICK_WORDS = [
  'POTÁSSIO!',
  'UUU-AAA!',
  'BANANA!',
  'SÓ NO CLIQUE!',
  'CRUNCH!',
  'GLÓRIA AO CACHO!',
  'VESGO POWER!',
  'MACACO RICO!',
  'TAP SAGRADO!',
  'VITAMINA B6!',
];

export function getEvolutionTier(chips: number) {
  let current = EVOLUTION_TIERS[0];
  for (const tier of EVOLUTION_TIERS) {
    if (chips >= tier.minChips) current = tier;
  }
  return current;
}

export function getBuildingCost(def: BuildingDef, owned: number, amount = 1): number {
  let total = 0;
  for (let i = 0; i < amount; i++) {
    total += Math.floor(def.baseCost * Math.pow(1.15, owned + i));
  }
  return total;
}

export function computeMetrics(state: GameState): {
  bps: number;
  bpc: number;
  buildingBps: Record<string, number>;
  comboMult: number;
  prestigeMult: number;
  achievementMult: number;
  eventBpsMult: number;
  eventClickMult: number;
  goldenMult: number;
} {
  let globalMult = 1;
  let clickMult = 1;
  let clickAddBpsPercent = 0;
  let goldenMult = 1;
  let comboBonusPerLevel = 0.03;
  const bMults: Record<string, number> = {};

  for (const upgId of state.upgrades) {
    const def = UPGRADES.find((u) => u.id === upgId);
    if (!def) continue;
    const eff = def.effect;
    if (eff.kind === 'clickMult') clickMult *= eff.mult;
    else if (eff.kind === 'clickAddBpsPercent') clickAddBpsPercent += eff.percent;
    else if (eff.kind === 'buildingMult') {
      bMults[eff.buildingId] = (bMults[eff.buildingId] || 1) * eff.mult;
    } else if (eff.kind === 'globalMult') globalMult *= eff.mult;
    else if (eff.kind === 'goldenMult') goldenMult *= eff.mult;
    else if (eff.kind === 'comboBoost') comboBonusPerLevel += eff.bonusPerLevel;
  }

  const prestigeMult = 1 + state.prestigeChips * 0.1;
  const achievementMult = 1 + state.achievements.length * 0.02;

  let eventBpsMult = 1;
  let eventClickMult = 1;
  if (state.activeEvent) {
    if (state.activeEvent.kind === 'fever_7x') eventBpsMult = 7;
    else if (state.activeEvent.kind === 'click_777x') eventClickMult = 77;
    else if (state.activeEvent.kind === 'intern_strike') eventBpsMult = 0.5;
    else if (state.activeEvent.kind === 'googly_surge') {
      eventBpsMult = 2;
      eventClickMult = 2;
    }
  }

  const buildingBps: Record<string, number> = {};
  let rawBps = 0;
  for (const b of BUILDINGS) {
    const count = state.buildings[b.id] || 0;
    const single = b.baseBps * (bMults[b.id] || 1);
    const totalForB = count * single * globalMult * prestigeMult * achievementMult * eventBpsMult;
    buildingBps[b.id] = totalForB;
    rawBps += totalForB;
  }

  const comboLevel = Math.min(25, Math.floor(state.comboCount / 4));
  const comboMult = 1 + comboLevel * comboBonusPerLevel;

  const baseClick = (1 * clickMult * prestigeMult * achievementMult + rawBps * clickAddBpsPercent);
  const bpc = Math.max(1, baseClick * comboMult * eventClickMult);

  return {
    bps: rawBps,
    bpc,
    buildingBps,
    comboMult,
    prestigeMult,
    achievementMult,
    eventBpsMult,
    eventClickMult,
    goldenMult,
  };
}

export function formatBananas(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0';
  if (n < 1000) return Math.floor(n).toLocaleString('pt-BR');
  const units = ['Mil', 'Mi', 'Bi', 'Tri', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc'];
  let val = n;
  let idx = -1;
  while (val >= 1000 && idx < units.length - 1) {
    val /= 1000;
    idx++;
  }
  const decimals = val >= 100 ? 1 : val >= 10 ? 2 : 2;
  return `${val.toFixed(decimals).replace('.', ',')} ${units[idx]}`;
}

export function formatBps(n: number): string {
  if (n < 10 && n > 0) return n.toFixed(1).replace('.', ',');
  return formatBananas(n);
}

export function calcPrestigePreview(lifetimeBananas: number, currentChips: number): number {
  const totalPossible = Math.floor(Math.cbrt(lifetimeBananas / 1_000_000));
  return Math.max(0, totalPossible - currentChips);
}
