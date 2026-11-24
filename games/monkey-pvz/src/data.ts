// Dados estáticos: plantas, gorilas zumbis e fases de "Bananeiras vs Gorilas Zumbis".

export type PlantId =
  | 'bananeira'
  | 'coco'
  | 'mandioca'
  | 'abacaxi'
  | 'cacto'
  | 'pimenta'
  | 'jaca'
  | 'maracuja'
  | 'coqueiro'
  | 'melancia';

export type ZombieId =
  | 'basico'
  | 'cone'
  | 'jornal'
  | 'vara'
  | 'porta'
  | 'balde'
  | 'futebol'
  | 'gerente'
  | 'chefe';

export interface PlantDef {
  id: PlantId;
  name: string;
  cost: number;
  cd: number;
  hp: number;
  desc: string;
  color: string;
}

/** Ordem da bandeja (também define as teclas 1-9, 0) */
export const PLANT_ORDER: PlantId[] = [
  'bananeira',
  'coco',
  'mandioca',
  'abacaxi',
  'cacto',
  'pimenta',
  'jaca',
  'maracuja',
  'coqueiro',
  'melancia',
];

export const PLANTS: Record<PlantId, PlantDef> = {
  bananeira: {
    id: 'bananeira',
    name: 'Bananeira Produtora',
    cost: 50,
    cd: 7.5,
    hp: 300,
    desc: 'Produz bananas extras a cada 24s. Sem ela, ninguém come!',
    color: '#fde047',
  },
  coco: {
    id: 'coco',
    name: 'Atiradora de Coco',
    cost: 100,
    cd: 7.5,
    hp: 300,
    desc: 'Cospe cocos duros na linha. Simples, direta, vesga.',
    color: '#92400e',
  },
  mandioca: {
    id: 'mandioca',
    name: 'Mandioca Muralha',
    cost: 50,
    cd: 28,
    hp: 4000,
    desc: 'Aguenta uma eternidade de mordidas. Nem sabe o que é dor.',
    color: '#d6b98c',
  },
  abacaxi: {
    id: 'abacaxi',
    name: 'Abacaxi-Mina',
    cost: 25,
    cd: 28,
    hp: 300,
    desc: 'Arma em 12s. Pisou, explodiu: gorila vira suco.',
    color: '#facc15',
  },
  cacto: {
    id: 'cacto',
    name: 'Cacto Abraçador',
    cost: 125,
    cd: 9,
    hp: 650,
    desc: 'Abraço apertado de espinhos em quem chega perto.',
    color: '#4ade80',
  },
  pimenta: {
    id: 'pimenta',
    name: 'Pimenta Explosiva',
    cost: 150,
    cd: 35,
    hp: 300,
    desc: 'BOOM em área 3x3. Gorila bem passado, por favor.',
    color: '#ef4444',
  },
  jaca: {
    id: 'jaca',
    name: 'Jaca Esmagadora',
    cost: 125,
    cd: 30,
    hp: 300,
    desc: 'Pula e esmaga o gorila que chegar perto. Uma vez só.',
    color: '#a3b83a',
  },
  maracuja: {
    id: 'maracuja',
    name: 'Maracujá Congelante',
    cost: 175,
    cd: 7.5,
    hp: 300,
    desc: 'Cospe sementes geladas que atrasam a gorilada.',
    color: '#38bdf8',
  },
  coqueiro: {
    id: 'coqueiro',
    name: 'Coqueiro Duplo',
    cost: 200,
    cd: 7.5,
    hp: 300,
    desc: 'Dois cocos por rajada. Dobro de dor, dobro de graça.',
    color: '#65a30d',
  },
  melancia: {
    id: 'melancia',
    name: 'Melancia Catapulta',
    cost: 300,
    cd: 7.5,
    hp: 300,
    desc: 'Arremessa melancias por cima de escudos. Respinga em volta!',
    color: '#16a34a',
  },
};

export interface ZombieDef {
  id: ZombieId;
  name: string;
  hp: number;
  armor: number;
  speed: number; // px/s
  dps: number;
  weight: number;
  minWave: number;
  brain: number;
  vcd: number;
  desc: string;
}

export const ZOMBIE_ORDER: ZombieId[] = [
  'basico',
  'cone',
  'jornal',
  'vara',
  'porta',
  'balde',
  'futebol',
  'gerente',
  'chefe',
];

export const ZOMBIES: Record<ZombieId, ZombieDef> = {
  basico: {
    id: 'basico',
    name: 'Gorila Zumbi',
    hp: 200,
    armor: 0,
    speed: 17,
    dps: 100,
    weight: 1,
    minWave: 0,
    brain: 50,
    vcd: 3,
    desc: 'O clássico. Só quer uma banana (e a sua casa).',
  },
  cone: {
    id: 'cone',
    name: 'Gorila de Cone',
    hp: 200,
    armor: 370,
    speed: 17,
    dps: 100,
    weight: 2,
    minWave: 1,
    brain: 75,
    vcd: 5,
    desc: 'Cone de trânsito na cabeça. Segurança em primeiro lugar.',
  },
  jornal: {
    id: 'jornal',
    name: 'Gorila do Jornal',
    hp: 200,
    armor: 150,
    speed: 17,
    dps: 100,
    weight: 2,
    minWave: 3,
    brain: 100,
    vcd: 5,
    desc: 'Lê o jornal. Rasgou o jornal? FICA FURIOSO e corre!',
  },
  vara: {
    id: 'vara',
    name: 'Gorila Pulador de Vara',
    hp: 340,
    armor: 0,
    speed: 38,
    dps: 100,
    weight: 2.5,
    minWave: 3,
    brain: 125,
    vcd: 6,
    desc: 'Corre e salta a primeira planta que encontrar.',
  },
  porta: {
    id: 'porta',
    name: 'Gorila de Porta de Tela',
    hp: 200,
    armor: 1100,
    speed: 17,
    dps: 100,
    weight: 3.5,
    minWave: 5,
    brain: 125,
    vcd: 7,
    desc: 'Escudo de porta de tela. Cocos só fazem plim.',
  },
  balde: {
    id: 'balde',
    name: 'Gorila de Balde de Açaí',
    hp: 200,
    armor: 1100,
    speed: 17,
    dps: 100,
    weight: 4,
    minWave: 4,
    brain: 150,
    vcd: 8,
    desc: 'Balde cheio de açaí na cabeça. Resistente e meladinho.',
  },
  futebol: {
    id: 'futebol',
    name: 'Gorila Atacante de Várzea',
    hp: 200,
    armor: 1000,
    speed: 34,
    dps: 100,
    weight: 5,
    minWave: 6,
    brain: 175,
    vcd: 9,
    desc: 'Capacete, camisa 9 e muita pressa. Rápido e duro.',
  },
  gerente: {
    id: 'gerente',
    name: 'Gorila Gerente de Terno',
    hp: 400,
    armor: 300,
    speed: 17,
    dps: 100,
    weight: 4,
    minWave: 6,
    brain: 150,
    vcd: 9,
    desc: '"Reunião urgente!" Acelera os gorilas ao redor.',
  },
  chefe: {
    id: 'chefe',
    name: 'GORILÃO CHEFE',
    hp: 9000,
    armor: 0,
    speed: 6,
    dps: 450,
    weight: 40,
    minWave: 999,
    brain: 700,
    vcd: 45,
    desc: 'Pisoteia o gramado e chama a família inteira.',
  },
};

export type LevelMode = 'normal' | 'conveyor' | 'survival' | 'versus';

export interface LevelDef {
  id: number;
  name: string;
  intro: string;
  lanes: number[];
  plants: PlantId[];
  zombies: ZombieId[];
  newZombie?: ZombieId;
  waves: number;
  diff: number;
  startBananas: number;
  sky: boolean;
  mode: LevelMode;
  boss?: boolean;
  bg: 'dia' | 'tarde' | 'noite';
}

const ALL5 = [0, 1, 2, 3, 4];

export const LEVELS: LevelDef[] = [
  {
    id: 1,
    name: 'Quintal da Vovó Chimpa',
    intro: 'Uma linha só, uma atiradora de coco e muita coragem. Pegue as bananas que caem do céu!',
    lanes: [2],
    plants: ['coco'],
    zombies: ['basico'],
    waves: 4,
    diff: 0.9,
    startBananas: 150,
    sky: true,
    mode: 'normal',
    bg: 'dia',
  },
  {
    id: 2,
    name: 'Bananeiras na Varanda',
    intro: 'Três linhas! Plante Bananeiras para ter banana de sobra pra tudo.',
    lanes: [1, 2, 3],
    plants: ['bananeira', 'coco'],
    zombies: ['basico', 'cone'],
    newZombie: 'cone',
    waves: 5,
    diff: 0.9,
    startBananas: 100,
    sky: true,
    mode: 'normal',
    bg: 'dia',
  },
  {
    id: 3,
    name: 'Gramado Completo',
    intro: 'O quintal inteiro está liberado. Mandiocas seguram a bagunça!',
    lanes: ALL5,
    plants: ['bananeira', 'coco', 'mandioca'],
    zombies: ['basico', 'cone'],
    waves: 6,
    diff: 0.95,
    startBananas: 100,
    sky: true,
    mode: 'normal',
    bg: 'dia',
  },
  {
    id: 4,
    name: 'Banca de Jornal Zumbi',
    intro: 'Gorilas lendo as notícias... até rasgarem o jornal. Aí é CAOS. Cacto, vem abraçar!',
    lanes: ALL5,
    plants: ['bananeira', 'coco', 'mandioca', 'cacto'],
    zombies: ['basico', 'cone', 'jornal'],
    newZombie: 'jornal',
    waves: 7,
    diff: 1,
    startBananas: 100,
    sky: true,
    mode: 'normal',
    bg: 'dia',
  },
  {
    id: 5,
    name: 'Abacaxi no Asfalto',
    intro: 'Pulador de vara chegando! Plante Abacaxi-Mina antes que eles saltem tudo.',
    lanes: ALL5,
    plants: ['bananeira', 'coco', 'mandioca', 'cacto', 'abacaxi'],
    zombies: ['basico', 'cone', 'jornal', 'vara'],
    newZombie: 'vara',
    waves: 8,
    diff: 1,
    startBananas: 100,
    sky: true,
    mode: 'normal',
    bg: 'tarde',
  },
  {
    id: 6,
    name: 'Churrasco Apimentado',
    intro: 'Balde de açaí na cabeça? Só Pimenta Explosiva resolve esse rolê.',
    lanes: ALL5,
    plants: ['bananeira', 'coco', 'mandioca', 'cacto', 'abacaxi', 'pimenta'],
    zombies: ['basico', 'cone', 'jornal', 'vara', 'balde'],
    newZombie: 'balde',
    waves: 9,
    diff: 1.05,
    startBananas: 100,
    sky: true,
    mode: 'normal',
    bg: 'tarde',
  },
  {
    id: 7,
    name: 'Geladeira do Vizinho',
    intro: 'Noite fria e escudo de porta de tela. O Maracujá congela e a Melancia... ainda não chegou.',
    lanes: ALL5,
    plants: ['bananeira', 'coco', 'mandioca', 'cacto', 'abacaxi', 'pimenta', 'maracuja'],
    zombies: ['basico', 'cone', 'jornal', 'vara', 'balde', 'porta'],
    newZombie: 'porta',
    waves: 10,
    diff: 1.05,
    startBananas: 100,
    sky: true,
    mode: 'normal',
    bg: 'noite',
  },
  {
    id: 8,
    name: 'Jaca na Cabeça',
    intro: 'A várzea chegou! Atacantes velozes de capacete. Esmague com a Jaca!',
    lanes: ALL5,
    plants: ['bananeira', 'coco', 'mandioca', 'cacto', 'abacaxi', 'pimenta', 'maracuja', 'jaca'],
    zombies: ['basico', 'cone', 'jornal', 'vara', 'balde', 'porta', 'futebol'],
    newZombie: 'futebol',
    waves: 10,
    diff: 1.1,
    startBananas: 100,
    sky: true,
    mode: 'normal',
    bg: 'noite',
  },
  {
    id: 9,
    name: 'Reunião de Condomínio',
    intro: 'O gerente de terno acelera a gorilada. Coqueiro Duplo para o resgate!',
    lanes: ALL5,
    plants: ['bananeira', 'coco', 'mandioca', 'cacto', 'abacaxi', 'pimenta', 'maracuja', 'jaca', 'coqueiro'],
    zombies: ['basico', 'cone', 'jornal', 'vara', 'balde', 'porta', 'futebol', 'gerente'],
    newZombie: 'gerente',
    waves: 12,
    diff: 1.1,
    startBananas: 150,
    sky: true,
    mode: 'normal',
    bg: 'tarde',
  },
  {
    id: 10,
    name: 'O Gorilão Chefe!',
    intro: 'Ele pisoteia, ele ruge e ele traz a família. Use TUDO, inclusive a Melancia Catapulta!',
    lanes: ALL5,
    plants: [
      'bananeira',
      'coco',
      'mandioca',
      'cacto',
      'abacaxi',
      'pimenta',
      'maracuja',
      'jaca',
      'coqueiro',
      'melancia',
    ],
    zombies: ['basico', 'cone', 'jornal', 'vara', 'balde', 'porta', 'futebol', 'gerente'],
    waves: 12,
    diff: 1.15,
    startBananas: 200,
    sky: true,
    mode: 'normal',
    boss: true,
    bg: 'noite',
  },
  {
    id: 11,
    name: 'Esteira Maluca (Mini-game)',
    intro: 'Sem bananas! A esteira joga plantas de graça. Plante rápido, o que vier é o que tem!',
    lanes: ALL5,
    plants: ['coco', 'mandioca', 'abacaxi', 'pimenta', 'jaca', 'maracuja'],
    zombies: ['basico', 'cone', 'jornal', 'vara', 'balde'],
    waves: 8,
    diff: 1,
    startBananas: 0,
    sky: false,
    mode: 'conveyor',
    bg: 'tarde',
  },
  {
    id: 12,
    name: 'Sobrevivência Infinita',
    intro: 'Quantas ondas você aguenta? O Gorilão volta a cada 20. Recorde é tudo!',
    lanes: ALL5,
    plants: [...PLANT_ORDER],
    zombies: ['basico', 'cone', 'jornal', 'vara', 'balde', 'porta', 'futebol', 'gerente'],
    waves: 9999,
    diff: 1.25,
    startBananas: 400,
    sky: true,
    mode: 'survival',
    bg: 'noite',
  },
];

export const VERSUS_LEVEL: LevelDef = {
  id: 100,
  name: 'Versus: Plantas x Gorilas',
  intro: 'Um planta, o outro manda gorilas com cérebros-banana!',
  lanes: ALL5,
  plants: [...PLANT_ORDER],
  zombies: ['basico', 'cone', 'jornal', 'vara', 'porta', 'balde', 'futebol', 'gerente', 'chefe'],
  waves: 0,
  diff: 1,
  startBananas: 200,
  sky: true,
  mode: 'versus',
  bg: 'tarde',
};

export const VERSUS_TIME = 300; // segundos que as plantas precisam sobreviver

export const QUIPS_KILL = ['Uga!', 'Banana!', 'Toma!', 'Plaft!', 'Nananinão!', 'Ai ai ai!', 'Cacildis!', 'Bonk!'];
export const QUIPS_WAVE = [
  'Lá vêm eles!',
  'Gorilada na área!',
  'Segura a banana!',
  'Eles tão chegando!',
  'Prepara o coco!',
];
