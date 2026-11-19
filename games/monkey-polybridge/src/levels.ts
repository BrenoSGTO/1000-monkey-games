import type { LevelDef } from './types';

export const WORLD_W = 1200;
export const WORLD_H = 680;
export const GRID_SIZE = 40;

export const LEVELS: LevelDef[] = [
  {
    index: 0,
    id: 'valeta-bananao',
    name: 'Valeta do Bananão',
    subtitle: 'Aprenda o poder sagrado dos triângulos de bambu',
    hint: '💡 Dica: Quadrados dobram fácil! Conecte TÁBUAS no meio e reforce com triângulos de BAMBU.',
    budget: 230,
    waterY: 560,
    spawnX: 170,
    spawnY: 420,
    finishX: 900,
    terrainSegments: [
      { x1: 0, y1: 440, x2: 440, y2: 440 },
      { x1: 440, y1: 440, x2: 470, y2: 680 },
      { x1: 680, y1: 440, x2: 1200, y2: 440 },
      { x1: 650, y1: 680, x2: 680, y2: 440 },
    ],
    terrainPolygons: [
      {
        kind: 'cliff',
        points: [
          [0, 440],
          [440, 440],
          [470, 680],
          [0, 680],
        ],
      },
      {
        kind: 'cliff',
        points: [
          [680, 440],
          [1200, 440],
          [1200, 680],
          [650, 680],
        ],
      },
    ],
    anchors: [
      { id: 'a-l1', x: 440, y: 440 },
      { id: 'a-l2', x: 440, y: 480 },
      { id: 'a-r1', x: 680, y: 440 },
      { id: 'a-r2', x: 680, y: 480 },
    ],
    vehicles: [{ kind: 'cart', name: 'Carrinho de Banana', spawnDelay: 0.25 }],
  },
  {
    index: 1,
    id: 'rio-jacares',
    name: 'Rio dos Jacarés',
    subtitle: 'Vão largo com pedrinha salvadora no meio',
    hint: '💡 Dica: Tem uma ilha no meio do rio! Use os pinos centrais pra apoiar a Kombi lotada.',
    budget: 410,
    waterY: 560,
    spawnX: 140,
    spawnY: 416,
    finishX: 980,
    terrainSegments: [
      { x1: 0, y1: 440, x2: 360, y2: 440 },
      { x1: 360, y1: 440, x2: 390, y2: 680 },
      { x1: 560, y1: 480, x2: 640, y2: 480 },
      { x1: 840, y1: 440, x2: 1200, y2: 440 },
      { x1: 810, y1: 680, x2: 840, y2: 440 },
    ],
    terrainPolygons: [
      {
        kind: 'cliff',
        points: [
          [0, 440],
          [360, 440],
          [390, 680],
          [0, 680],
        ],
      },
      {
        kind: 'pier',
        points: [
          [560, 480],
          [640, 480],
          [660, 680],
          [540, 680],
        ],
      },
      {
        kind: 'cliff',
        points: [
          [840, 440],
          [1200, 440],
          [1200, 680],
          [810, 680],
        ],
      },
    ],
    anchors: [
      { id: 'a-l1', x: 360, y: 440 },
      { id: 'a-l2', x: 360, y: 480 },
      { id: 'a-c1', x: 560, y: 480 },
      { id: 'a-c2', x: 640, y: 480 },
      { id: 'a-r1', x: 840, y: 440 },
      { id: 'a-r2', x: 840, y: 480 },
    ],
    vehicles: [{ kind: 'kombi', name: 'Kombi Lotada de Macacos', spawnDelay: 0.25 }],
  },
  {
    index: 2,
    id: 'salto-fe-primata',
    name: 'Salto da Fé Primata',
    subtitle: 'Rampa + Mola de Colchão Velho = Física questionável',
    hint: '💡 Dica: Faça uma rampa subindo com MOLA DE COLCHÃO (🌀) pra catapultar a Motoquinha Turbo!',
    budget: 240,
    waterY: 560,
    spawnX: 150,
    spawnY: 420,
    finishX: 920,
    terrainSegments: [
      { x1: 0, y1: 440, x2: 440, y2: 440 },
      { x1: 440, y1: 440, x2: 470, y2: 680 },
      { x1: 720, y1: 480, x2: 1200, y2: 480 },
      { x1: 690, y1: 680, x2: 720, y2: 480 },
    ],
    terrainPolygons: [
      {
        kind: 'cliff',
        points: [
          [0, 440],
          [440, 440],
          [470, 680],
          [0, 680],
        ],
      },
      {
        kind: 'cliff',
        points: [
          [720, 480],
          [1200, 480],
          [1200, 680],
          [690, 680],
        ],
      },
    ],
    anchors: [
      { id: 'a-l0', x: 400, y: 440 },
      { id: 'a-l1', x: 440, y: 440 },
      { id: 'a-l2', x: 440, y: 480 },
      { id: 'a-r1', x: 720, y: 480 },
      { id: 'a-r2', x: 720, y: 520 },
    ],
    vehicles: [{ kind: 'moped', name: 'Motoquinha Turbo', spawnDelay: 0.25 }],
  },
  {
    index: 3,
    id: 'comboio-coco-pesado',
    name: 'Comboio do Coco Pesado',
    subtitle: 'Dois veículos seguidos incluindo o Caminhão-Pipa de Coco!',
    hint: '💡 Dica: O Caminhão-Pipa pesa uma tonelada! Use AÇO DE FERRO-VELHO (🔩) nos apoios principais.',
    budget: 560,
    waterY: 560,
    spawnX: 130,
    spawnY: 416,
    finishX: 940,
    terrainSegments: [
      { x1: 0, y1: 440, x2: 400, y2: 440 },
      { x1: 400, y1: 440, x2: 430, y2: 680 },
      { x1: 720, y1: 440, x2: 1200, y2: 440 },
      { x1: 690, y1: 680, x2: 720, y2: 440 },
    ],
    terrainPolygons: [
      {
        kind: 'cliff',
        points: [
          [0, 440],
          [400, 440],
          [430, 680],
          [0, 680],
        ],
      },
      {
        kind: 'cliff',
        points: [
          [720, 440],
          [1200, 440],
          [1200, 680],
          [690, 680],
        ],
      },
    ],
    anchors: [
      { id: 'a-l1', x: 400, y: 440 },
      { id: 'a-l2', x: 400, y: 520 },
      { id: 'a-r1', x: 720, y: 440 },
      { id: 'a-r2', x: 720, y: 520 },
    ],
    vehicles: [
      { kind: 'cart', name: 'Carrinho Batedor', spawnDelay: 0.2 },
      { kind: 'tanker', name: 'Caminhão-Pipa de Coco', spawnDelay: 2.6 },
    ],
  },
  {
    index: 4,
    id: 'ponte-pensil-cipo',
    name: 'Ponte Pênsil de Cipó',
    subtitle: 'Torres altas da selva para pendurar a ponte no cipó',
    hint: '💡 Dica: Cipó (🌿) só aguenta tração! Pendure as tábuas lá de cima das torres de madeira.',
    budget: 480,
    waterY: 560,
    spawnX: 130,
    spawnY: 416,
    finishX: 980,
    terrainSegments: [
      { x1: 0, y1: 440, x2: 360, y2: 440 },
      { x1: 360, y1: 440, x2: 390, y2: 680 },
      { x1: 800, y1: 440, x2: 1200, y2: 440 },
      { x1: 770, y1: 680, x2: 800, y2: 440 },
    ],
    terrainPolygons: [
      {
        kind: 'cliff',
        points: [
          [0, 440],
          [360, 440],
          [390, 680],
          [0, 680],
        ],
      },
      {
        kind: 'tower',
        points: [
          [344, 232],
          [368, 232],
          [368, 440],
          [344, 440],
        ],
      },
      {
        kind: 'cliff',
        points: [
          [800, 440],
          [1200, 440],
          [1200, 680],
          [770, 680],
        ],
      },
      {
        kind: 'tower',
        points: [
          [792, 232],
          [816, 232],
          [816, 440],
          [792, 440],
        ],
      },
    ],
    anchors: [
      { id: 'a-lt', x: 360, y: 240 },
      { id: 'a-l1', x: 360, y: 440 },
      { id: 'a-l2', x: 360, y: 480 },
      { id: 'a-rt', x: 800, y: 240 },
      { id: 'a-r1', x: 800, y: 440 },
      { id: 'a-r2', x: 800, y: 480 },
    ],
    vehicles: [{ kind: 'kombi', name: 'Kombi da Selva', spawnDelay: 0.25 }],
  },
  {
    index: 5,
    id: 'viaduto-do-caos',
    name: 'O Viaduto do Caos',
    subtitle: 'Vão gigante com Barco Pirata passando por baixo!',
    hint: '💡 ALERTA NAVAL: Suba a ponte ACIMA da linha tracejada vermelha (y < 390) pro barco passar sem destruir tudo!',
    budget: 780,
    waterY: 560,
    spawnX: 120,
    spawnY: 416,
    finishX: 990,
    terrainSegments: [
      { x1: 0, y1: 440, x2: 320, y2: 440 },
      { x1: 320, y1: 440, x2: 350, y2: 680 },
      { x1: 800, y1: 440, x2: 1200, y2: 440 },
      { x1: 770, y1: 680, x2: 800, y2: 440 },
    ],
    terrainPolygons: [
      {
        kind: 'cliff',
        points: [
          [0, 440],
          [320, 440],
          [350, 680],
          [0, 680],
        ],
      },
      {
        kind: 'tower',
        points: [
          [304, 312],
          [328, 312],
          [328, 440],
          [304, 440],
        ],
      },
      {
        kind: 'cliff',
        points: [
          [800, 440],
          [1200, 440],
          [1200, 680],
          [770, 680],
        ],
      },
      {
        kind: 'tower',
        points: [
          [792, 312],
          [816, 312],
          [816, 440],
          [792, 440],
        ],
      },
    ],
    anchors: [
      { id: 'a-lt', x: 320, y: 320 },
      { id: 'a-l1', x: 320, y: 440 },
      { id: 'a-l2', x: 320, y: 520 },
      { id: 'a-rt', x: 800, y: 320 },
      { id: 'a-r1', x: 800, y: 440 },
      { id: 'a-r2', x: 800, y: 520 },
    ],
    vehicles: [
      { kind: 'moped', name: 'Motoquinha Turbo', spawnDelay: 0.2 },
      { kind: 'kombi', name: 'Kombi Lotada', spawnDelay: 2.2 },
    ],
    boatHazard: {
      startX: 470,
      endX: 650,
      speed: 55,
      hullTopY: 515,
      mastTopY: 415,
      width: 100,
    },
  },
];
