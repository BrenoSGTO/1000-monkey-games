// Interface DOM: titulo, lobby online, pausa, resultados e botoes de toque.
import { BOT_LEVEL_NAMES, CARS, CAR_ORDER, TEAM_COLORS, THEMES, THEME_ORDER } from './constants';
import type { InputManager } from './input';
import type { SlotStats } from './match';
import type { BotLevel, CarId, Format, ThemeId } from './types';

export interface Settings {
  format: Format;
  theme: ThemeId;
  car: CarId;
  botLevel: BotLevel;
  time: number;
  coop: boolean;
}

const KEY = 'monkey-rocket:settings';

export function loadSettings(): Settings {
  const def: Settings = { format: '1v1', theme: 'selva', car: 'fusca', botLevel: 1, time: 180, coop: false };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...def, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    // ignora
  }
  return def;
}

export interface OnlineInfo {
  connected: boolean;
  isHost: boolean;
  players: string[];
  code: string | null;
}

export interface ResultsData {
  headline: string;
  sub: string;
  scoreA: number;
  scoreB: number;
  winner: 0 | 1 | null;
  rows: SlotStats[];
  points: number;
  canRematch: boolean;
  teamNames: [string, string];
}

export interface UiCallbacks {
  onSolo: (s: Settings) => void;
  onLocal: (s: Settings) => void;
  onOnlineStart: (s: Settings) => void;
  onHelp: () => void;
  onResume: () => void;
  onRestart: () => void;
  onMenu: () => void;
  onRematch: () => void;
  onSettingsChange: (s: Settings) => void;
}

const CSS = `
#mr-ui{position:fixed;inset:0;z-index:50;display:none;align-items:center;justify-content:center;font-family:'Segoe UI',system-ui,sans-serif;color:#f8fafc;overflow:auto;padding:56px 12px 16px}
#mr-ui.on{display:flex}
#mr-ui.dim{background:radial-gradient(ellipse at center,rgba(2,6,23,.55),rgba(2,6,23,.88))}
.mr-card{width:min(760px,100%);background:linear-gradient(160deg,rgba(15,23,42,.94),rgba(30,27,75,.94));border:3px solid #facc15;border-radius:22px;padding:18px 20px 16px;box-shadow:0 20px 60px rgba(0,0,0,.6);text-align:center;margin:auto}
.mr-logo{font-weight:900;font-size:clamp(28px,6vw,54px);line-height:1;letter-spacing:-1px;color:#fde047;text-shadow:0 4px 0 #b45309,0 8px 18px rgba(0,0,0,.5);transform:rotate(-1.5deg)}
.mr-logo span{display:block;color:#38bdf8;font-size:.55em;text-shadow:0 3px 0 #0369a1;margin-top:4px}
.mr-sub{margin:10px 0 12px;color:#cbd5e1;font-size:14px}
.mr-btn{display:block;width:100%;border:0;border-radius:16px;padding:13px 16px;margin:8px 0;font-weight:900;font-size:clamp(15px,2.6vw,20px);cursor:pointer;color:#1c1917;background:linear-gradient(#fde047,#f59e0b);box-shadow:0 5px 0 #92400e;transition:transform .08s}
.mr-btn:hover{transform:translateY(-2px)}
.mr-btn:active{transform:translateY(3px);box-shadow:0 2px 0 #92400e}
.mr-btn.big{font-size:clamp(20px,4vw,30px);padding:16px}
.mr-btn.blue{background:linear-gradient(#7dd3fc,#0ea5e9);box-shadow:0 5px 0 #075985;color:#082f49}
.mr-btn.green{background:linear-gradient(#86efac,#22c55e);box-shadow:0 5px 0 #166534;color:#052e16}
.mr-btn.gray{background:linear-gradient(#e2e8f0,#94a3b8);box-shadow:0 5px 0 #475569;color:#0f172a}
.mr-btn small{display:block;font-size:12px;font-weight:700;opacity:.75}
.mr-row{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;align-items:center;margin:7px 0}
.mr-lab{font-size:11px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.8px;min-width:68px;text-align:right}
.mr-chip{border:2px solid #475569;background:#1e293b;color:#e2e8f0;border-radius:999px;padding:5px 11px;font-size:13px;font-weight:800;cursor:pointer}
.mr-chip.sel{border-color:#facc15;background:#854d0e;color:#fef9c3}
.mr-chip:hover{border-color:#fde047}
.mr-help{font-size:12px;color:#94a3b8;line-height:1.5;margin-top:8px}
.mr-help b{color:#fde047}
.mr-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}
@media(max-width:560px){.mr-grid{grid-template-columns:1fr}.mr-lab{min-width:100%;text-align:center}}
.mr-title2{font-size:clamp(24px,5vw,42px);font-weight:900;margin:4px 0}
.mr-score{font-size:clamp(40px,10vw,76px);font-weight:900;margin:2px 0}
table.mr-tab{width:100%;border-collapse:collapse;margin:10px 0;font-size:13px}
.mr-tab th{color:#94a3b8;text-transform:uppercase;font-size:11px;padding:4px}
.mr-tab td{padding:5px 4px;border-top:1px solid rgba(255,255,255,.12)}
.mr-pl{display:inline-block;margin:3px;padding:4px 11px;border-radius:999px;border:2px solid #4ade80;color:#bbf7d0;font-weight:800;font-size:13px}
.mr-touch{position:fixed;inset:auto 0 0 0;height:0;z-index:40;display:none;pointer-events:none}
.mr-touch.on{display:block}
.mr-tb{position:fixed;bottom:18px;width:78px;height:78px;border-radius:50%;border:3px solid rgba(255,255,255,.7);background:rgba(15,23,42,.55);color:#fff;font-size:30px;font-weight:900;pointer-events:auto;touch-action:none;display:flex;align-items:center;justify-content:center;user-select:none}
.mr-tb.on{background:rgba(250,204,21,.65)}
.mr-menu-btn{position:fixed;top:10px;right:10px;z-index:45;display:none;border:2px solid #facc15;background:rgba(17,24,39,.88);color:#fef08a;border-radius:999px;padding:6px 12px;font-size:12px;font-weight:800;cursor:pointer}
.mr-menu-btn.on{display:block}
`;

function chip(group: string, value: string, label: string, sel: boolean): string {
  return `<button class="mr-chip${sel ? ' sel' : ''}" data-g="${group}" data-v="${value}">${label}</button>`;
}

export class GameUi {
  private root: HTMLDivElement;
  private touchBox: HTMLDivElement;
  private menuBtn: HTMLButtonElement;
  settings: Settings;
  private onlineInfo: OnlineInfo = { connected: false, isHost: false, players: [], code: null };
  private mode: 'none' | 'title' | 'lobby' | 'pause' | 'results' = 'none';

  constructor(
    parent: HTMLElement,
    private cb: UiCallbacks,
    private input: InputManager,
  ) {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    this.settings = loadSettings();
    this.root = document.createElement('div');
    this.root.id = 'mr-ui';
    parent.appendChild(this.root);
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.touchBox = document.createElement('div');
    this.touchBox.className = 'mr-touch';
    parent.appendChild(this.touchBox);
    this.buildTouch();
    this.menuBtn = document.createElement('button');
    this.menuBtn.className = 'mr-menu-btn';
    this.menuBtn.textContent = '⏸ Pausa (Esc)';
    this.menuBtn.onclick = () => {
      this.menuBtn.blur();
      this.cb.onResume();
    };
    this.menuBtn.addEventListener('mousedown', (e) => e.preventDefault());
    parent.appendChild(this.menuBtn);
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.settings));
    } catch {
      // ignora
    }
    this.cb.onSettingsChange(this.settings);
  }

  get current(): string {
    return this.mode;
  }

  hide(): void {
    this.mode = 'none';
    this.root.classList.remove('on', 'dim');
    this.root.innerHTML = '';
  }

  setInMatch(on: boolean, touch: boolean): void {
    this.menuBtn.classList.toggle('on', on);
    this.touchBox.classList.toggle('on', on && touch && matchMedia('(pointer: coarse)').matches);
  }

  private show(html: string, dim = true): void {
    this.root.innerHTML = html;
    this.root.classList.add('on');
    this.root.classList.toggle('dim', dim);
  }

  // ------------------------------------------------------------ titulo
  showTitle(): void {
    this.mode = 'title';
    const s = this.settings;
    const carBtns = CAR_ORDER.map((id) => chip('car', id, CARS[id].name, s.car === id)).join('');
    const themeBtns = THEME_ORDER.map((id) => chip('theme', id, THEMES[id].name, s.theme === id)).join('');
    const botBtns = ([0, 1, 2] as BotLevel[]).map((l) => chip('bot', String(l), BOT_LEVEL_NAMES[l], s.botLevel === l)).join('');
    this.show(`
      <div class="mr-card">
        <div class="mr-logo">ROCKET MACACO LEAGUE<span>Futebol de Fusca 🐒🚗⚽</span></div>
        <div class="mr-sub">Carrinhos tunados, turbo de guaraná e uma bola de coco gigante. Faça mais gols que a macacada em 3 minutos!</div>
        <button class="mr-btn big" data-a="solo">🐵 JOGAR <small>Solo contra Bot</small></button>
        <div class="mr-grid">
          <button class="mr-btn blue" data-a="local">🐵🐵 2 JOGADORES<small>mesmo teclado</small></button>
          <button class="mr-btn green" data-a="online">🌐 ONLINE<small>até 4 macacos (P2P)</small></button>
          <button class="mr-btn gray" data-a="help">❓ COMO JOGAR<small>controles (F1)</small></button>
        </div>
        <div class="mr-row"><span class="mr-lab">Formato</span>${chip('format', '1v1', '1 vs 1', s.format === '1v1')}${chip('format', '2v2', '2 vs 2', s.format === '2v2')}
          <span class="mr-lab">Tempo</span>${chip('time', '60', '1:00', s.time === 60)}${chip('time', '120', '2:00', s.time === 120)}${chip('time', '180', '3:00', s.time === 180)}</div>
        <div class="mr-row"><span class="mr-lab">Carro</span>${carBtns}</div>
        <div class="mr-row"><span class="mr-lab">Arena</span>${themeBtns}</div>
        <div class="mr-row"><span class="mr-lab">Bots</span>${botBtns}
          <span class="mr-lab">2P Local</span>${chip('coop', '0', 'Versus', !s.coop)}${chip('coop', '1', 'Co-op vs Bots', s.coop)}</div>
        <div class="mr-help"><b>${CARS[s.car].name}:</b> ${CARS[s.car].tagline}<br/>${THEMES[s.theme].name} — ${THEMES[s.theme].sub} · 🎮 Controles: <b>F1</b></div>
      </div>`);
  }

  // ------------------------------------------------------------ online
  setOnlineInfo(info: OnlineInfo): void {
    this.onlineInfo = info;
    if (this.mode === 'lobby') this.showLobby();
  }

  showLobby(): void {
    this.mode = 'lobby';
    const o = this.onlineInfo;
    const players = o.players.map((n) => `<span class="mr-pl">🐒 ${n}</span>`).join('') || '<span class="mr-help">Ninguém na sala ainda.</span>';
    let body: string;
    if (!o.connected) {
      body = `<div class="mr-help" style="font-size:14px">1) Clique em <b>🐒 Co-op Online</b> (canto superior esquerdo).<br/>2) <b>Criar Sala</b> e mande o link/código para os amigos — ou digite um código e <b>Entrar</b>.<br/>3) O <b>host</b> escolhe o formato e clica em COMEÇAR. Vagas vazias viram bots!</div>`;
    } else if (o.isHost) {
      body = `<div class="mr-help" style="font-size:14px">Sala <b>${o.code ?? ''}</b> aberta. Até 4 macacos. Formato: <b>${this.settings.format === '2v2' || o.players.length > 2 ? '2 vs 2' : '1 vs 1'}</b> (escolha no menu).</div><div>${players}</div>
        <button class="mr-btn green big" data-a="onlinego">⚽ COMEÇAR PARTIDA</button>`;
    } else {
      body = `<div class="mr-help" style="font-size:14px">Conectado na sala <b>${o.code ?? ''}</b>. Aguardando o host começar...</div><div>${players}</div>`;
    }
    this.show(`
      <div class="mr-card">
        <div class="mr-title2">🌐 Online P2P</div>
        ${body}
        <button class="mr-btn gray" data-a="back">VOLTAR</button>
      </div>`);
  }

  // ------------------------------------------------------------ pausa / resultados
  showPause(online: boolean): void {
    this.mode = 'pause';
    this.show(`
      <div class="mr-card" style="max-width:420px">
        <div class="mr-title2">⏸ PAUSA</div>
        <button class="mr-btn green" data-a="resume">▶ CONTINUAR</button>
        ${online ? '' : '<button class="mr-btn" data-a="restart">🔄 REINICIAR PARTIDA</button>'}
        <button class="mr-btn gray" data-a="menu">🏠 MENU</button>
        ${online ? '<div class="mr-help">Online não pausa: a bola continua rolando pros outros macacos!</div>' : ''}
      </div>`);
  }

  showResults(r: ResultsData): void {
    this.mode = 'results';
    const col = r.winner === null ? '#fde047' : TEAM_COLORS[r.winner].main;
    const rows = r.rows
      .map(
        (x) => `<tr><td style="color:${TEAM_COLORS[x.team].main};font-weight:800;text-align:left">${x.bot ? '🤖' : '🐒'} ${x.name}</td><td>${x.goals}</td><td>${x.touches}</td><td>${x.pads}</td></tr>`,
      )
      .join('');
    this.show(`
      <div class="mr-card">
        <div class="mr-title2" style="color:${col}">${r.headline}</div>
        <div class="mr-score"><span style="color:${TEAM_COLORS[0].main}">${r.scoreA}</span> × <span style="color:${TEAM_COLORS[1].main}">${r.scoreB}</span></div>
        <div class="mr-sub">${r.sub}</div>
        <table class="mr-tab"><tr><th style="text-align:left">Macaco</th><th>Gols</th><th>Toques</th><th>Turbos</th></tr>${rows}</table>
        <div class="mr-help">🍌 Pontuação desta partida: <b>${r.points}</b></div>
        ${r.canRematch ? '<button class="mr-btn green big" data-a="rematch">🔁 REVANCHE</button>' : '<div class="mr-help">Aguardando o host decidir a revanche...</div>'}
        <button class="mr-btn gray" data-a="menu">🏠 MENU</button>
      </div>`);
  }

  // ------------------------------------------------------------ eventos
  private onClick(e: MouseEvent): void {
    const t = (e.target as HTMLElement).closest('[data-a],[data-g]') as HTMLElement | null;
    if (!t) return;
    const g = t.dataset.g;
    if (g) {
      const v = t.dataset.v ?? '';
      const s = this.settings;
      if (g === 'format') s.format = v as Format;
      else if (g === 'theme') s.theme = v as ThemeId;
      else if (g === 'car') s.car = v as CarId;
      else if (g === 'bot') s.botLevel = Number(v) as BotLevel;
      else if (g === 'time') s.time = Number(v);
      else if (g === 'coop') s.coop = v === '1';
      this.save();
      this.showTitle();
      return;
    }
    switch (t.dataset.a) {
      case 'solo':
        this.cb.onSolo(this.settings);
        break;
      case 'local':
        this.cb.onLocal(this.settings);
        break;
      case 'online':
        this.showLobby();
        break;
      case 'onlinego':
        this.cb.onOnlineStart(this.settings);
        break;
      case 'help':
        this.cb.onHelp();
        break;
      case 'back':
        this.showTitle();
        break;
      case 'resume':
        this.cb.onResume();
        break;
      case 'restart':
        this.cb.onRestart();
        break;
      case 'menu':
        this.cb.onMenu();
        break;
      case 'rematch':
        this.cb.onRematch();
        break;
    }
  }

  // ------------------------------------------------------------ toque
  private buildTouch(): void {
    const mk = (label: string, key: 'left' | 'right' | 'jump' | 'boost', style: string) => {
      const b = document.createElement('div');
      b.className = 'mr-tb';
      b.style.cssText = style;
      b.textContent = label;
      const set = (d: boolean) => {
        this.input.setTouch(key, d);
        b.classList.toggle('on', d);
      };
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        set(true);
      });
      const up = (e: PointerEvent) => {
        e.preventDefault();
        set(false);
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', () => set(false));
      this.touchBox.appendChild(b);
    };
    mk('◀', 'left', 'left:14px');
    mk('▶', 'right', 'left:104px');
    mk('⤴', 'jump', 'right:104px');
    mk('🔥', 'boost', 'right:14px');
  }
}
