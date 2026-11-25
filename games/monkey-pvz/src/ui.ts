// Telas em DOM (título, fases, almanaque, versus, pausa, resultado).
import { LEVELS, LevelDef, PLANT_ORDER, PLANTS, PlantId, ZOMBIE_ORDER, ZOMBIES, ZombieId } from './data';
import { drawPlantIcon } from './draw-plants';
import { drawZombie } from './draw-zombies';
import { mkZombie } from './fx';
import { rowY } from './sim';

export interface Progress {
  unlocked: number;
  done: number[];
  best: Record<number, number>;
}

const KEY = 'monkey-pvz:progress';

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Progress;
      return { unlocked: Math.max(1, p.unlocked | 0), done: p.done ?? [], best: p.best ?? {} };
    }
  } catch {
    // ignore
  }
  return { unlocked: 1, done: [], best: {} };
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // ignore
  }
}

export function drawZombieIcon(c: CanvasRenderingContext2D, type: ZombieId, cx: number, footY: number, scale: number, t: number): void {
  const z = mkZombie(type, 0, 0, true, false);
  z.maxArmor = ZOMBIES[type].armor;
  z.armor = z.maxArmor;
  z.phase = 1;
  z.eat = false;
  c.save();
  c.translate(cx, footY);
  c.scale(scale, scale);
  c.translate(0, -(rowY(0) + (z.big ? 44 : 34)));
  drawZombie(c, z, t);
  c.restore();
}

/** Plantas novas em relação à fase anterior */
export function newPlantsOf(level: LevelDef): PlantId[] {
  const prev = LEVELS.find((l) => l.id === level.id - 1);
  if (!prev || level.mode === 'conveyor' || level.mode === 'survival') return [];
  return level.plants.filter((p) => !prev.plants.includes(p));
}

export function paintIcons(root: HTMLElement): void {
  root.querySelectorAll<HTMLCanvasElement>('canvas[data-kind]').forEach((cv) => {
    const c = cv.getContext('2d');
    if (!c) return;
    cv.width = 128;
    cv.height = 144;
    c.clearRect(0, 0, 128, 144);
    const id = cv.dataset.id ?? '';
    if (cv.dataset.kind === 'p') {
      drawPlantIcon(c, id as PlantId, 64, 128, 1.3, 0, 0.3);
    } else {
      const big = id === 'chefe';
      drawZombieIcon(c, id as ZombieId, 56, 130, big ? 0.62 : 1.4, 1.2);
    }
  });
}

export function titleHtml(best: number, online: string, isGuest: boolean): string {
  return `
  <div class="veil"><div class="card">
    <div class="logo"><span class="b">🍌 Bananeiras</span><small>vs</small><span class="z">Gorilas Zumbis</span></div>
    <p class="sub">Plante, produza e proteja o quintal do macaco da invasão da gorilada zumbi!</p>
    <button class="big" data-act="play">JOGAR</button>
    <div class="row">
      <button class="btn green" data-act="coop">🐒 Co-op Online</button>
      <button class="btn red" data-act="versus">⚔️ Versus Online</button>
      <button class="btn dark" data-act="almanac">📖 Almanaque</button>
    </div>
    <div class="hint">${online}${isGuest ? '' : ''}</div>
    <div class="hint">🎮 Controles: F1 ou botão no topo</div>
    ${best > 0 ? `<div class="best">🏆 Recorde: ${best}</div>` : ''}
  </div></div>`;
}

export function levelsHtml(p: Progress, mode: 'solo' | 'coop', online: boolean): string {
  const cards = LEVELS.map((l) => {
    const locked = l.id > p.unlocked;
    const isDone = p.done.includes(l.id);
    const np = newPlantsOf(l);
    const tag =
      l.mode === 'conveyor'
        ? '🎢 Mini-game'
        : l.mode === 'survival'
          ? '♾️ Sobrevivência'
          : l.boss
            ? '👑 Chefão'
            : np.length
              ? `🌱 Nova: ${PLANTS[np[0]].name}`
              : `${l.lanes.length} linha${l.lanes.length > 1 ? 's' : ''}`;
    const best = p.best[l.id] ? ` • 🏆 ${p.best[l.id]}` : '';
    return `<div class="lvl ${locked ? 'locked' : ''}" data-act="level" data-id="${l.id}">
      <div class="n">${locked ? '🔒' : l.id}</div>${isDone ? '<div class="done">✅</div>' : ''}
      <b>${l.name}</b><p>${l.intro}</p><span class="tag">${tag}${best}</span></div>`;
  }).join('');
  return `
  <div class="veil"><div class="card">
    <h2>${mode === 'coop' ? '🐒 Co-op: escolha a fase' : '🌱 Escolha a fase'}</h2>
    <p class="sub">${mode === 'coop' ? 'Você ocupa as linhas de cima, o parceiro as de baixo; a do meio é compartilhada. As bananas são de todos!' : 'Cada vitória libera a próxima fase e uma planta nova!'}</p>
    <div class="grid">${cards}</div>
    <div class="row"><button class="btn dark" data-act="title">⬅ Voltar</button></div>
  </div></div>`;
}

export function almanacHtml(): string {
  const ps = PLANT_ORDER.map((id) => {
    const d = PLANTS[id];
    return `<div class="it"><canvas data-kind="p" data-id="${id}"></canvas><div><b>${d.name}</b><i>🍌 ${d.cost} • ⏱ ${d.cd}s</i><span>${d.desc}</span></div></div>`;
  }).join('');
  const zs = ZOMBIE_ORDER.map((id) => {
    const d = ZOMBIES[id];
    return `<div class="it"><canvas data-kind="z" data-id="${id}"></canvas><div><b>${d.name}</b><i>❤ ${d.hp}${d.armor ? ` + 🛡 ${d.armor}` : ''}</i><span>${d.desc}</span></div></div>`;
  }).join('');
  return `
  <div class="veil"><div class="card">
    <h2>📖 Almanaque do Quintal</h2>
    <p class="sub">🌱 Plantas</p><div class="alm">${ps}</div>
    <p class="sub">🦍 Gorilas Zumbis</p><div class="alm">${zs}</div>
    <div class="row"><button class="btn dark" data-act="title">⬅ Voltar</button></div>
  </div></div>`;
}

export function versusHtml(role: number): string {
  return `
  <div class="veil"><div class="card">
    <h2>⚔️ Versus Online</h2>
    <p class="sub">Um planta e sobrevive por 5 minutos; o outro manda gorilas gastando cérebros-banana. Quem fica com qual lado?</p>
    <div class="rolebox">
      <div class="role ${role === 0 ? 'sel' : ''}" data-act="role" data-id="0"><big>🌱</big><b>Eu planto</b><br/>Colha bananas, monte a defesa e segure a gorilada.</div>
      <div class="role ${role === 1 ? 'sel' : ''}" data-act="role" data-id="1"><big>🦍</big><b>Eu mando os gorilas</b><br/>Escolha o gorila e clique na linha onde ele entra.</div>
    </div>
    <div class="row"><button class="btn green" data-act="versusGo">COMEÇAR!</button><button class="btn dark" data-act="title">⬅ Voltar</button></div>
  </div></div>`;
}

export function pauseHtml(online: boolean): string {
  return `
  <div class="veil"><div class="card" style="max-width:420px">
    <h2>⏸ Pausado</h2>
    <p class="sub">Até os gorilas pararam pra respirar.</p>
    <div class="row" style="flex-direction:column;align-items:center">
      <button class="btn green" data-act="resume">▶ Continuar</button>
      <button class="btn" data-act="restart">🔄 Reiniciar fase</button>
      <button class="btn dark" data-act="menu">🏠 Menu</button>
    </div>
  </div></div>`;
}

export interface ResultInfo {
  won: boolean;
  title: string;
  quip: string;
  kills: number;
  score: number;
  extra: Array<[string, string]>;
  unlock: PlantId[];
  hasNext: boolean;
  canRestart: boolean;
  waitHost: boolean;
}

export function resultHtml(r: ResultInfo): string {
  const unlocks = r.unlock
    .map((id) => `<div class="unlock"><canvas data-kind="p" data-id="${id}"></canvas><div><b>Nova planta!</b><br/>${PLANTS[id].name}<br/><small>${PLANTS[id].desc}</small></div></div>`)
    .join('');
  const stats = [
    ['🦍 Gorilas derrotados', String(r.kills)],
    ['🏆 Pontos', String(r.score)],
    ...r.extra,
  ]
    .map(([a, b]) => `<div class="stat"><em>${a}</em>${b}</div>`)
    .join('');
  return `
  <div class="veil"><div class="card" style="max-width:560px">
    <h2 style="color:${r.won ? '#bef264' : '#fda4af'}">${r.title}</h2>
    <p class="sub">${r.quip}</p>
    <div class="stats">${stats}</div>
    ${unlocks}
    <div class="row" style="margin-top:8px">
      ${r.hasNext && !r.waitHost ? '<button class="btn green" data-act="next">▶ Próxima fase</button>' : ''}
      ${r.canRestart ? '<button class="btn" data-act="restart">🔄 Jogar de novo</button>' : ''}
      <button class="btn dark" data-act="menu">🏠 Menu</button>
    </div>
    ${r.waitHost ? '<div class="hint">Aguardando o host iniciar a próxima partida…</div>' : ''}
  </div></div>`;
}
