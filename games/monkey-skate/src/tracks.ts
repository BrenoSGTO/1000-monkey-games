import type {
  BananaPad,
  GrindRail,
  TerrainPoint,
  TrackData,
  TrackId,
  TrackProp,
} from './types';

export interface TerrainSample {
  y: number;
  slope: number; // dy/dx
  angle: number; // atan2(dy, dx)
  nx: number; // upward normal x
  ny: number; // upward normal y
}

export function sampleTerrain(terrain: TerrainPoint[], x: number): TerrainSample {
  if (terrain.length === 0) {
    return { y: 0, slope: 0, angle: 0, nx: 0, ny: -1 };
  }
  if (x <= terrain[0].x) {
    const p0 = terrain[0];
    const p1 = terrain[1] ?? p0;
    const dx = Math.max(1, p1.x - p0.x);
    const dy = p1.y - p0.y;
    const angle = Math.atan2(dy, dx);
    return {
      y: p0.y,
      slope: dy / dx,
      angle,
      nx: Math.sin(angle),
      ny: -Math.cos(angle),
    };
  }
  const last = terrain[terrain.length - 1];
  if (x >= last.x) {
    const p0 = terrain[terrain.length - 2] ?? last;
    const dx = Math.max(1, last.x - p0.x);
    const dy = last.y - p0.y;
    const angle = Math.atan2(dy, dx);
    return {
      y: last.y,
      slope: dy / dx,
      angle,
      nx: Math.sin(angle),
      ny: -Math.cos(angle),
    };
  }

  // Binary search segment
  let lo = 0;
  let hi = terrain.length - 2;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (x < terrain[mid].x) {
      hi = mid - 1;
    } else if (x > terrain[mid + 1].x) {
      lo = mid + 1;
    } else {
      lo = mid;
      break;
    }
  }

  const a = terrain[lo];
  const b = terrain[lo + 1];
  const dx = Math.max(0.0001, b.x - a.x);
  const t = (x - a.x) / dx;
  const y = a.y + (b.y - a.y) * t;
  const dy = b.y - a.y;
  const angle = Math.atan2(dy, dx);
  return {
    y,
    slope: dy / dx,
    angle,
    nx: Math.sin(angle),
    ny: -Math.cos(angle),
  };
}

function addCurve(
  pts: TerrainPoint[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  steps: number,
  ease: (t: number) => number,
): void {
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    pts.push({
      x: x0 + (x1 - x0) * t,
      y: y0 + (y1 - y0) * ease(t),
    });
  }
}

function buildPracaDaBanana(): TrackData {
  const terrain: TerrainPoint[] = [{ x: -80, y: -320 }];
  // Left mega quarter-pipe
  addCurve(terrain, -80, -320, 40, -180, 8, (t) => t * t);
  addCurve(terrain, 40, -180, 440, 260, 18, (t) => Math.sin(t * Math.PI * 0.5));
  // Flat plaza approach
  terrain.push({ x: 960, y: 260 });
  // Fun pyramid kicker
  addCurve(terrain, 960, 260, 1140, 175, 8, (t) => t * t * (3 - 2 * t));
  terrain.push({ x: 1260, y: 175 });
  addCurve(terrain, 1260, 175, 1440, 260, 8, (t) => t * t * (3 - 2 * t));
  // Staircase down
  terrain.push({ x: 1720, y: 260 });
  for (let s = 1; s <= 6; s++) {
    const sx = 1720 + s * 42;
    const sy = 260 + s * 22;
    terrain.push({ x: sx - 36, y: sy - 22 });
    terrain.push({ x: sx, y: sy });
  }
  terrain.push({ x: 2320, y: 392 });
  // Big Central Half-Pipe Bowl
  addCurve(terrain, 2320, 392, 2560, 210, 14, (t) => t * t);
  terrain.push({ x: 2640, y: 210 });
  addCurve(terrain, 2640, 210, 2880, 460, 16, (t) => t * t);
  terrain.push({ x: 3200, y: 460 });
  addCurve(terrain, 3200, 460, 3440, 220, 16, (t) => 1 - (1 - t) * (1 - t));
  terrain.push({ x: 3560, y: 220 });
  addCurve(terrain, 3560, 220, 3760, 300, 10, (t) => t * t * (3 - 2 * t));
  // Street plaza with giant SUS kicker
  terrain.push({ x: 4160, y: 300 });
  addCurve(terrain, 4160, 300, 4460, 110, 14, (t) => t * t);
  // Drop gap landing
  addCurve(terrain, 4460, 110, 4510, 320, 4, (t) => t);
  terrain.push({ x: 5160, y: 320 });
  // Right Mega Quarter-Pipe
  addCurve(terrain, 5160, 320, 5580, -180, 18, (t) => 1 - Math.cos(t * Math.PI * 0.5));
  addCurve(terrain, 5580, -180, 5680, -340, 8, (t) => t);

  const rails: GrindRail[] = [
    {
      id: 'rail-start',
      label: 'Corrimão do Começo',
      color: '#facc15',
      points: [
        { x: 540, y: 222 },
        { x: 880, y: 222 },
      ],
    },
    {
      id: 'rail-stairs',
      label: 'Corrimão da Escadaria',
      color: '#38bdf8',
      points: [
        { x: 1710, y: 218 },
        { x: 1990, y: 350 },
      ],
    },
    {
      id: 'rail-rainbow',
      label: 'Arco-Íris da Banana',
      color: '#fb7185',
      points: [
        { x: 2740, y: 210 },
        { x: 2890, y: 120 },
        { x: 3040, y: 95 },
        { x: 3190, y: 120 },
        { x: 3340, y: 210 },
      ],
    },
    {
      id: 'rail-plaza',
      label: 'Trilho do Dogão',
      color: '#4ade80',
      points: [
        { x: 3820, y: 262 },
        { x: 4120, y: 262 },
      ],
    },
  ];

  const propSpecs: Array<Omit<TrackProp, 'y'>> = [
    { id: 'p-sign-1', kind: 'sign', x: 480, width: 22, height: 85, label: 'BANANA' },
    { id: 'p-trash-1', kind: 'trash', x: 920, width: 34, height: 42 },
    { id: 'p-car-1', kind: 'parked-car', x: 1560, width: 150, height: 58, label: 'CORSA', color: '#ef4444', roofRail: true },
    { id: 'p-pole-1', kind: 'pole', x: 2140, width: 16, height: 190 },
    { id: 'p-bench-1', kind: 'bench', x: 2250, width: 88, height: 30, roofRail: true },
    { id: 'p-hotdog', kind: 'hotdog', x: 4580, width: 110, height: 68, label: 'DOGÃO', roofRail: true },
    { id: 'p-tires-1', kind: 'tires', x: 4780, width: 64, height: 54 },
    { id: 'p-billboard', kind: 'billboard', x: 4950, width: 130, height: 165, label: 'SUS 24H' },
    { id: 'p-pole-2', kind: 'pole', x: 5110, width: 16, height: 195 },
  ];

  const props: TrackProp[] = propSpecs.map((spec) => {
    const sample = sampleTerrain(terrain, spec.x);
    return { ...spec, y: sample.y };
  });

  // Add roof rails for grindable props
  for (const prop of props) {
    if (prop.roofRail) {
      rails.push({
        id: `roof-${prop.id}`,
        label: prop.label ? `Teto ${prop.label}` : 'Banco da Praça',
        color: '#fde047',
        points: [
          { x: prop.x - prop.width * 0.45, y: prop.y - prop.height },
          { x: prop.x + prop.width * 0.45, y: prop.y - prop.height },
        ],
      });
    }
  }

  const turboBananas: BananaPad[] = [
    { id: 'tb-1', x: 660, y: sampleTerrain(terrain, 660).y, cooldown: 0 },
    { id: 'tb-2', x: 3040, y: sampleTerrain(terrain, 3040).y, cooldown: 0 },
    { id: 'tb-3', x: 4050, y: sampleTerrain(terrain, 4050).y, cooldown: 0 },
  ];

  return {
    id: 'praca',
    name: 'Praça da Banana',
    shortName: 'Praça da Banana',
    width: 5600,
    loopMode: 'bounce',
    skyTop: '#0ea5e9',
    skyMid: '#38bdf8',
    skyBottom: '#fef08a',
    groundFill: '#1e293b',
    groundTopColor: '#facc15',
    spawnX: 620,
    terrain,
    rails,
    props,
    turboBananas,
    hasTraffic: false,
  };
}

function buildLadeiraDoMorroSlop(): TrackData {
  const terrain: TerrainPoint[] = [{ x: -120, y: -2100 }];
  // Starting drop-in
  terrain.push({ x: 80, y: -1820 });
  addCurve(terrain, 80, -1820, 520, -1620, 12, (t) => 1 - (1 - t) * (1 - t));

  // Long downhill road with kickers, speed bumps (lombadas) and steep drops
  let curX = 520;
  let curY = -1620;
  const sections = [
    { dx: 700, dy: 240, bump: false },
    { dx: 240, dy: -45, bump: true }, // lombada kicker!
    { dx: 750, dy: 310, bump: false },
    { dx: 260, dy: -65, bump: true },
    { dx: 900, dy: 380, bump: false },
    { dx: 300, dy: -85, bump: true },
    { dx: 1100, dy: 430, bump: false },
    { dx: 260, dy: -55, bump: true },
    { dx: 1050, dy: 440, bump: false },
    { dx: 320, dy: -95, bump: true },
    { dx: 1100, dy: 420, bump: false },
    { dx: 280, dy: -70, bump: true },
    { dx: 1150, dy: 460, bump: false },
    { dx: 340, dy: -110, bump: true }, // big launch!
    { dx: 950, dy: 340, bump: false },
  ];

  for (const sec of sections) {
    const nx = curX + sec.dx;
    const ny = curY + sec.dy;
    if (sec.bump) {
      addCurve(terrain, curX, curY, nx, ny, 10, (t) => t * t);
    } else {
      addCurve(terrain, curX, curY, nx, ny, 12, (t) => t * t * (3 - 2 * t));
    }
    curX = nx;
    curY = ny;
  }

  // Final Mega Ramp of the Abyss + flat landing zone
  const rampStartX = curX;
  const rampStartY = curY;
  addCurve(terrain, rampStartX, rampStartY, rampStartX + 420, rampStartY - 220, 14, (t) => t * t);
  const gapX = rampStartX + 420;
  const gapY = rampStartY - 220;
  terrain.push({ x: gapX + 40, y: gapY + 260 });
  terrain.push({ x: gapX + 1400, y: gapY + 340 });
  // Catch quarter-pipe at bottom
  addCurve(terrain, gapX + 1400, gapY + 340, gapX + 1850, gapY - 120, 16, (t) => 1 - Math.cos(t * Math.PI * 0.5));

  const rails: GrindRail[] = [];
  const railStarts = [1250, 2950, 4800, 6800, 8900];
  for (let i = 0; i < railStarts.length; i++) {
    const rx0 = railStarts[i];
    const rx1 = rx0 + 620;
    const y0 = sampleTerrain(terrain, rx0).y - 44;
    const y1 = sampleTerrain(terrain, rx1).y - 44;
    rails.push({
      id: `l-rail-${i}`,
      label: i % 2 === 0 ? 'Guard-Rail do Morro' : 'Fio do Poste (Sem Choque)',
      color: i % 2 === 0 ? '#facc15' : '#38bdf8',
      points: [
        { x: rx0, y: y0 },
        { x: rx0 + (rx1 - rx0) * 0.5, y: (y0 + y1) * 0.5 - 12 },
        { x: rx1, y: y1 },
      ],
    });
  }

  const propSpecs: Array<Omit<TrackProp, 'y'>> = [
    { id: 'lp-1', kind: 'sign', x: 950, width: 22, height: 86, label: 'LADEIRA!' },
    { id: 'lp-2', kind: 'pole', x: 2080, width: 16, height: 195 },
    { id: 'lp-3', kind: 'tires', x: 2650, width: 66, height: 54 },
    { id: 'lp-4', kind: 'pole', x: 3820, width: 16, height: 195 },
    { id: 'lp-5', kind: 'sign', x: 4550, width: 22, height: 86, label: 'MACACO!' },
    { id: 'lp-6', kind: 'trash', x: 5620, width: 36, height: 44 },
    { id: 'lp-7', kind: 'pole', x: 6420, width: 16, height: 195 },
    { id: 'lp-8', kind: 'billboard', x: 7620, width: 130, height: 165, label: 'FREIO ZERO' },
    { id: 'lp-9', kind: 'pole', x: 8550, width: 16, height: 195 },
    { id: 'lp-10', kind: 'parked-car', x: 9650, width: 150, height: 58, label: 'UNO ESCADA', color: '#f8fafc', roofRail: true },
    { id: 'lp-11', kind: 'pole', x: 10450, width: 16, height: 195 },
  ];

  const props: TrackProp[] = propSpecs.map((spec) => ({
    ...spec,
    y: sampleTerrain(terrain, spec.x).y,
  }));

  for (const prop of props) {
    if (prop.roofRail) {
      rails.push({
        id: `roof-${prop.id}`,
        label: 'Teto do Uno com Escada',
        color: '#facc15',
        points: [
          { x: prop.x - prop.width * 0.45, y: prop.y - prop.height },
          { x: prop.x + prop.width * 0.45, y: prop.y - prop.height },
        ],
      });
    }
  }

  const turboXs = [820, 2280, 3920, 5840, 7450, 9300, 10200];
  const turboBananas: BananaPad[] = turboXs.map((x, idx) => ({
    id: `ltb-${idx}`,
    x,
    y: sampleTerrain(terrain, x).y,
    cooldown: 0,
  }));

  return {
    id: 'ladeira',
    name: 'Ladeira do Morro Slop',
    shortName: 'Ladeira Slop',
    width: gapX + 1850,
    loopMode: 'downhill',
    skyTop: '#312e81',
    skyMid: '#be185d',
    skyBottom: '#fb923c',
    groundFill: '#0f172a',
    groundTopColor: '#94a3b8',
    spawnX: 240,
    terrain,
    rails,
    props,
    turboBananas,
    hasTraffic: true,
    finishX: gapX + 1150,
  };
}

function buildMegaRampaDaSelva(): TrackData {
  const terrain: TerrainPoint[] = [{ x: -100, y: -1450 }];
  // Massive drop-in tower
  terrain.push({ x: 160, y: -1200 });
  addCurve(terrain, 160, -1200, 1180, 240, 24, (t) => Math.sin(t * Math.PI * 0.5));
  // Flat speed runway
  terrain.push({ x: 1960, y: 240 });
  // Colossal launch ramp
  addCurve(terrain, 1960, 240, 2560, -240, 20, (t) => t * t);
  // Giant chasm
  terrain.push({ x: 2630, y: 520 });
  terrain.push({ x: 3320, y: 520 });
  // Huge downslope landing
  terrain.push({ x: 3390, y: 60 });
  addCurve(terrain, 3390, 60, 4450, 420, 20, (t) => t * t * (3 - 2 * t));
  // Second booster runway
  terrain.push({ x: 5200, y: 420 });
  // Towering Quarter-Pipe Wall!
  addCurve(terrain, 5200, 420, 5880, -480, 24, (t) => 1 - Math.cos(t * Math.PI * 0.5));
  terrain.push({ x: 5980, y: -760 });

  const rails: GrindRail[] = [
    {
      id: 'mega-sky-rail',
      label: 'Cipó Aéreo da Morte',
      color: '#4ade80',
      points: [
        { x: 2700, y: -320 },
        { x: 2980, y: -370 },
        { x: 3250, y: -310 },
      ],
    },
    {
      id: 'mega-land-rail',
      label: 'Corrimão Gigante',
      color: '#facc15',
      points: [
        { x: 4520, y: 378 },
        { x: 5080, y: 378 },
      ],
    },
  ];

  const propSpecs: Array<Omit<TrackProp, 'y'>> = [
    { id: 'mr-1', kind: 'billboard', x: 1580, width: 130, height: 170, label: 'VAI COM DEUS' },
    { id: 'mr-2', kind: 'tires', x: 2860, width: 80, height: 60 },
    { id: 'mr-3', kind: 'tires', x: 3060, width: 80, height: 60 },
    { id: 'mr-4', kind: 'pole', x: 4700, width: 16, height: 210 },
    { id: 'mr-5', kind: 'parked-car', x: 4920, width: 150, height: 58, label: 'AMBULÂNCIA', color: '#f8fafc', roofRail: true },
  ];

  const props: TrackProp[] = propSpecs.map((spec) => ({
    ...spec,
    y: sampleTerrain(terrain, spec.x).y,
  }));

  for (const prop of props) {
    if (prop.roofRail) {
      rails.push({
        id: `roof-${prop.id}`,
        label: 'Teto da Ambulância',
        color: '#fb7185',
        points: [
          { x: prop.x - prop.width * 0.45, y: prop.y - prop.height },
          { x: prop.x + prop.width * 0.45, y: prop.y - prop.height },
        ],
      });
    }
  }

  const turboBananas: BananaPad[] = [
    { id: 'mtb-1', x: 1450, y: sampleTerrain(terrain, 1450).y, cooldown: 0 },
    { id: 'mtb-2', x: 1840, y: sampleTerrain(terrain, 1840).y, cooldown: 0 },
    { id: 'mtb-3', x: 4560, y: sampleTerrain(terrain, 4560).y, cooldown: 0 },
  ];

  return {
    id: 'megarampa',
    name: 'Mega Rampa da Selva',
    shortName: 'Mega Rampa',
    width: 5980,
    loopMode: 'bounce',
    skyTop: '#064e3b',
    skyMid: '#0f766e',
    skyBottom: '#fde047',
    groundFill: '#1c1917',
    groundTopColor: '#4ade80',
    spawnX: 250,
    terrain,
    rails,
    props,
    turboBananas,
    hasTraffic: false,
  };
}

export const TRACKS: Record<TrackId, TrackData> = {
  praca: buildPracaDaBanana(),
  ladeira: buildLadeiraDoMorroSlop(),
  megarampa: buildMegaRampaDaSelva(),
};
