import type { PlayerProfile } from '@monkey-slop/sdk';
import { WEAPON_ORDER, type Difficulty, type WeaponId } from './types';
import { WEAPONS } from './weapons';

export interface SoloOpts {
  opponents: number;
  difficulty: Difficulty;
  perTeam: number;
}

export interface UiCallbacks {
  onStartSolo(o: SoloOpts): void;
  onStartHotseat(players: number, perTeam: number): void;
  onOpenOnline(): void;
  onStartOnline(perTeam: number): void;
  onSelectWeapon(id: WeaponId): void;
  onFuse(d: number): void;
  onMenu(): void;
  onRematch(): void;
  onSkip(): void;
  onFireDown(): void;
  onFireUp(): void;
  onJump(): void;
  onBack(): void;
  onVirtual(key: string, down: boolean): void;
  onOverview(): void;
}

export interface TeamHud {
  name: string;
  color: string;
  hp: number;
  alive: number;
  total: number;
  current: boolean;
  owner: string;
}

export interface HudState {
  teamName: string;
  teamColor: string;
  wormName: string;
  timeLeft: number;
  timerLabel: string;
  wind: number;
  teams: TeamHud[];
  weapon: WeaponId | null;
  ammo: Record<WeaponId, number> | null;
  fuse: number;
  canPick: boolean;
  hint: string;
  charge: number;
  sudden: boolean;
  waiting: string;
}

export interface OverInfo {
  title: string;
  sub: string;
  color: string;
  rows: { name: string; color: string; damage: number; kills: number; alive: number }[];
  canRematch: boolean;
  online: boolean;
}

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const CSS = `
.mw-root{position:fixed;inset:0;pointer-events:none;font-family:'Segoe UI',system-ui,sans-serif;color:#f8fafc;z-index:50}
.mw-root *{box-sizing:border-box}
.mw-screen{position:absolute;inset:0;display:none;align-items:center;justify-content:center;pointer-events:auto;background:radial-gradient(ellipse at 50% 30%,rgba(15,40,90,.55),rgba(5,12,30,.88));backdrop-filter:blur(3px);padding:16px;overflow:auto}
.mw-screen.show{display:flex}
.mw-card{background:linear-gradient(180deg,#1e293b,#0f172a);border:3px solid #facc15;border-radius:22px;padding:22px 26px;max-width:640px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.6),0 0 0 6px rgba(250,204,21,.12);text-align:center}
.mw-logo{font-size:clamp(30px,6vw,56px);font-weight:900;line-height:1;margin:0;color:#fde047;text-shadow:0 4px 0 #b45309,0 8px 22px rgba(0,0,0,.6);letter-spacing:-1px}
.mw-sub{font-size:clamp(15px,2.6vw,22px);font-weight:800;color:#fb923c;margin:8px 0 4px}
.mw-tag{font-size:13px;color:#94a3b8;margin:0 0 16px}
.mw-big{background:linear-gradient(180deg,#facc15,#f59e0b);color:#451a03;border:0;border-radius:18px;font-size:clamp(24px,4vw,38px);font-weight:900;padding:14px 46px;cursor:pointer;box-shadow:0 6px 0 #b45309,0 14px 26px rgba(0,0,0,.45);transition:transform .1s;animation:mwpulse 1.6s ease-in-out infinite}
.mw-big:hover{transform:translateY(-2px) scale(1.03)}.mw-big:active{transform:translateY(3px);box-shadow:0 2px 0 #b45309}
@keyframes mwpulse{50%{transform:scale(1.04)}}
.mw-btn{background:#334155;color:#f8fafc;border:2px solid #475569;border-radius:12px;font-weight:800;font-size:14px;padding:9px 16px;cursor:pointer;transition:background .15s,transform .1s}
.mw-btn:hover{background:#475569}.mw-btn:active{transform:translateY(1px)}
.mw-btn.go{background:linear-gradient(180deg,#4ade80,#16a34a);border-color:#bbf7d0;color:#052e16;font-size:17px;padding:12px 26px}
.mw-btn.go:disabled{filter:grayscale(1);opacity:.5;cursor:not-allowed}
.mw-modes{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:10px 0 6px}
.mw-mode{background:#0b1220;border:2px solid #334155;border-radius:16px;padding:14px 10px;cursor:pointer;transition:all .15s;color:inherit}
.mw-mode:hover{border-color:#facc15;transform:translateY(-3px)}
.mw-mode.sel{border-color:#facc15;background:#1e293b}
.mw-mode b{display:block;font-size:30px}.mw-mode span{font-weight:900;font-size:16px;display:block;margin:4px 0}.mw-mode small{color:#94a3b8;font-size:12px}
.mw-opt{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:10px 0;flex-wrap:wrap}
.mw-opt label{font-weight:800;color:#fde68a;font-size:14px}
.mw-seg{display:inline-flex;gap:4px}
.mw-seg button{background:#0b1220;color:#cbd5e1;border:2px solid #334155;border-radius:10px;padding:6px 14px;font-weight:800;cursor:pointer}
.mw-seg button.on{background:#facc15;color:#451a03;border-color:#fde047}
.mw-panel{display:none}.mw-panel.show{display:block}
.mw-players{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin:10px 0}
.mw-chip{padding:5px 12px;border-radius:999px;font-weight:800;font-size:13px;background:#1e293b;border:2px solid}
.mw-help{font-size:12px;color:#94a3b8;line-height:1.55;text-align:left;margin-top:14px;background:#0b1220;border-radius:12px;padding:10px 14px}
.mw-help kbd{background:#334155;border-radius:5px;padding:1px 6px;color:#fde68a;font-weight:800;font-size:11px}
.mw-hud{position:absolute;inset:0;display:none;pointer-events:none}.mw-hud.show{display:block}
.mw-top{position:absolute;top:8px;left:50%;transform:translateX(-50%);display:flex;gap:8px;align-items:center;pointer-events:none}
.mw-pill{background:rgba(8,14,30,.82);border:2px solid #475569;border-radius:14px;padding:5px 12px;font-weight:900;font-size:14px;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,.4)}
.mw-timer{width:52px;height:52px;border-radius:50%;background:rgba(8,14,30,.88);border:4px solid #facc15;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:900;box-shadow:0 4px 12px rgba(0,0,0,.5)}
.mw-timer.low{border-color:#ef4444;color:#fca5a5;animation:mwpulse .5s infinite}
.mw-timer.retreat{border-color:#38bdf8;color:#bae6fd}
.mw-wind{display:flex;align-items:center;gap:6px;min-width:130px;justify-content:center}
.mw-windbar{position:relative;width:78px;height:9px;background:#1e293b;border-radius:6px;overflow:hidden}
.mw-windfill{position:absolute;top:0;bottom:0;background:linear-gradient(90deg,#38bdf8,#e0f2fe)}
.mw-windmid{position:absolute;left:50%;top:-1px;bottom:-1px;width:2px;background:#fff;opacity:.7}
.mw-teams{position:absolute;top:8px;right:8px;display:flex;flex-direction:column;gap:5px;align-items:flex-end;pointer-events:none;max-width:44vw}
.mw-team{background:rgba(8,14,30,.82);border:2px solid;border-radius:11px;padding:4px 10px;font-size:12px;font-weight:800;min-width:150px;opacity:.9}
.mw-team.cur{box-shadow:0 0 0 3px rgba(250,204,21,.8);opacity:1}.mw-team.dead{opacity:.35;text-decoration:line-through}
.mw-bar{height:7px;border-radius:5px;background:#1e293b;margin-top:3px;overflow:hidden}.mw-bar i{display:block;height:100%}
.mw-btns{position:absolute;top:8px;right:8px;display:none}
.mw-corner{position:absolute;bottom:8px;left:8px;display:flex;gap:6px;pointer-events:auto}
.mw-weap{position:absolute;bottom:8px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:5px;pointer-events:none;max-width:98vw}
.mw-hint{background:rgba(8,14,30,.85);border-radius:12px;padding:5px 14px;font-size:13px;font-weight:800;color:#fde68a;pointer-events:auto;text-align:center;max-width:92vw}
.mw-hint button{background:#334155;color:#fff;border:0;border-radius:6px;font-weight:900;padding:1px 8px;cursor:pointer}
.mw-wrow{display:flex;gap:4px;background:rgba(8,14,30,.85);border:2px solid #475569;border-radius:16px;padding:5px;pointer-events:auto;flex-wrap:wrap;justify-content:center}
.mw-w{position:relative;width:44px;height:44px;border-radius:11px;background:#1e293b;border:2px solid #334155;font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:inherit;padding:0}
.mw-w:hover{background:#334155}.mw-w.sel{border-color:#facc15;background:#713f12;box-shadow:0 0 12px rgba(250,204,21,.7)}
.mw-w.off{opacity:.3;cursor:not-allowed}
.mw-w .k{position:absolute;top:0;left:3px;font-size:9px;color:#94a3b8;font-weight:900}
.mw-w .a{position:absolute;bottom:-1px;right:2px;font-size:10px;font-weight:900;color:#fff;text-shadow:0 1px 2px #000}
.mw-banner{position:absolute;top:22%;left:50%;transform:translate(-50%,-50%) scale(.6);opacity:0;text-align:center;pointer-events:none;transition:none}
.mw-banner.show{animation:mwban 2.2s ease forwards}
@keyframes mwban{0%{opacity:0;transform:translate(-50%,-50%) scale(.5)}12%{opacity:1;transform:translate(-50%,-50%) scale(1.08)}20%{transform:translate(-50%,-50%) scale(1)}80%{opacity:1}100%{opacity:0;transform:translate(-50%,-60%) scale(1)}}
.mw-banner b{display:block;font-size:clamp(24px,5vw,46px);font-weight:900;text-shadow:0 4px 0 rgba(0,0,0,.6),0 0 24px rgba(0,0,0,.6);-webkit-text-stroke:1px rgba(0,0,0,.5)}
.mw-banner span{display:block;font-size:clamp(14px,2.4vw,20px);font-weight:800;color:#fff;text-shadow:0 2px 6px #000}
.mw-wait{position:absolute;top:70px;left:50%;transform:translateX(-50%);background:rgba(8,14,30,.85);border-radius:12px;padding:6px 14px;font-weight:800;font-size:13px;color:#bae6fd;display:none}
.mw-touch{position:absolute;inset:auto 0 70px 0;display:none;justify-content:space-between;padding:0 10px;pointer-events:none}
.mw-touch.show{display:flex}
.mw-pad{display:grid;grid-template-columns:repeat(3,56px);grid-template-rows:repeat(2,56px);gap:6px;pointer-events:auto}
.mw-pad button,.mw-act button{width:56px;height:56px;border-radius:50%;background:rgba(15,23,42,.78);border:3px solid #64748b;color:#fff;font-size:22px;font-weight:900;touch-action:none}
.mw-act{display:grid;grid-template-columns:repeat(2,56px);gap:6px;pointer-events:auto}
.mw-act .fire{grid-column:1/3;width:100%;border-radius:28px;background:rgba(220,38,38,.85);border-color:#fecaca;font-size:18px}
.mw-over .mw-card{max-width:560px}
.mw-table{width:100%;border-collapse:collapse;margin:12px 0;font-size:14px}.mw-table td,.mw-table th{padding:6px 8px;border-bottom:1px solid #334155;text-align:center}
.mw-table th{color:#94a3b8;font-size:12px}.mw-table td:first-child{text-align:left;font-weight:900}
@media(max-width:1000px){.mw-top{top:52px}.mw-teams{top:52px}.mw-corner{top:96px!important}}
@media(max-width:700px){.mw-w{width:38px;height:38px;font-size:19px}.mw-team{min-width:110px;font-size:11px}.mw-pill{font-size:12px;padding:4px 8px}.mw-wind{min-width:0}.mw-windbar{width:50px}}
`;

export class Ui {
  private root: HTMLDivElement;
  private cb: UiCallbacks;
  private screens: Record<string, HTMLElement> = {};
  private hud!: HTMLElement;
  private last: Record<string, string> = {};
  private setupMode: 'solo' | 'hotseat' | 'online' = 'solo';
  private opts = { opponents: 1, difficulty: 'normal' as Difficulty, hsPlayers: 2, perTeam: 4 };
  private lobbyHost = false;
  private lobbyPlayers = 0;
  private weaponBtns = new Map<WeaponId, HTMLButtonElement>();
  readonly touch: boolean;

  constructor(cb: UiCallbacks) {
    this.cb = cb;
    this.touch = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches ?? false);
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root = document.createElement('div');
    this.root.className = 'mw-root';
    document.body.appendChild(this.root);
    this.buildTitle();
    this.buildSetup();
    this.buildLobby();
    this.buildOver();
    this.buildHud();
  }

  // ───────────────────────────── telas ─────────────────────────────

  private screen(id: string, cls = ''): HTMLElement {
    const el = document.createElement('div');
    el.className = `mw-screen ${cls}`;
    this.root.appendChild(el);
    this.screens[id] = el;
    return el;
  }

  show(name: 'none' | 'title' | 'setup' | 'lobby' | 'over'): void {
    for (const [k, el] of Object.entries(this.screens)) el.classList.toggle('show', k === name);
  }

  private buildTitle(): void {
    const s = this.screen('title');
    s.innerHTML = `
      <div class="mw-card">
        <div style="font-size:54px;line-height:1">🐒🥥💥</div>
        <h1 class="mw-logo">MACACOS EM GUERRA</h1>
        <div class="mw-sub">Artilharia de Banana</div>
        <p class="mw-tag">Times de macacos de capacete, ilhas 100% destrutíveis, vento, pombos bombardeiros e muita banana explosiva.</p>
        <button class="mw-big" data-a="play">JOGAR</button>
        <div class="mw-help" style="margin-top:18px">
          <kbd>A/D</kbd> andar • <kbd>Enter</kbd> pular • <kbd>W/S</kbd> ou mouse: mirar • segure <kbd>ESPAÇO</kbd> para carregar e solte para atirar • <kbd>1-9,0</kbd>/<kbd>Tab</kbd> trocar arma • <kbd>H</kbd> ajuda
        </div>
      </div>`;
    s.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('[data-a]')?.getAttribute('data-a');
      if (a === 'play') this.show('setup');
    });
  }

  private seg(group: string, vals: [string, string][], cur: string): string {
    return `<div class="mw-seg" data-g="${group}">${vals
      .map(([v, l]) => `<button data-v="${v}" class="${v === cur ? 'on' : ''}">${l}</button>`)
      .join('')}</div>`;
  }

  private buildSetup(): void {
    const s = this.screen('setup');
    s.innerHTML = `
      <div class="mw-card">
        <h2 class="mw-logo" style="font-size:30px">Escolha a guerra</h2>
        <div class="mw-modes">
          <button class="mw-mode sel" data-mode="solo"><b>🤖</b><span>Solo vs Bot</span><small>Enfrente macacos-IA que calculam a mira (e erram de propósito)</small></button>
          <button class="mw-mode" data-mode="hotseat"><b>🎮</b><span>Hotseat 2-4</span><small>Todo mundo no mesmo teclado, um turno de cada vez</small></button>
          <button class="mw-mode" data-mode="online"><b>🌐</b><span>Online P2P 2-4</span><small>Crie uma sala e mande o link pros amigos</small></button>
        </div>
        <div class="mw-panel show" data-p="solo">
          <div class="mw-opt"><label>Oponentes (bots)</label>${this.seg('opp', [['1', '1'], ['2', '2'], ['3', '3']], '1')}</div>
          <div class="mw-opt"><label>Dificuldade</label>${this.seg('diff', [['easy', 'Fácil'], ['normal', 'Normal'], ['hard', 'Difícil']], 'normal')}</div>
        </div>
        <div class="mw-panel" data-p="hotseat">
          <div class="mw-opt"><label>Jogadores</label>${this.seg('hs', [['2', '2'], ['3', '3'], ['4', '4']], '2')}</div>
        </div>
        <div class="mw-panel" data-p="online">
          <div class="mw-help" style="margin-top:4px">Use o botão <b>🐒 Co-op Online</b> no canto superior esquerdo para criar ou entrar numa sala. Depois o anfitrião inicia a partida aqui.</div>
        </div>
        <div class="mw-opt"><label>Macacos por time</label>${this.seg('per', [['2', '2'], ['3', '3'], ['4', '4']], '4')}</div>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:14px">
          <button class="mw-btn" data-a="back">← Voltar</button>
          <button class="mw-btn go" data-a="start">⚔️ COMEÇAR!</button>
        </div>
      </div>`;
    s.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const modeBtn = t.closest<HTMLElement>('[data-mode]');
      if (modeBtn) {
        this.setupMode = modeBtn.dataset.mode as 'solo' | 'hotseat' | 'online';
        s.querySelectorAll('.mw-mode').forEach((m) => m.classList.toggle('sel', m === modeBtn));
        s.querySelectorAll<HTMLElement>('.mw-panel').forEach((p) => p.classList.toggle('show', p.dataset.p === this.setupMode));
        const go = s.querySelector<HTMLElement>('[data-a="start"]')!;
        go.textContent = this.setupMode === 'online' ? '🌐 ABRIR SALA' : '⚔️ COMEÇAR!';
        return;
      }
      const segBtn = t.closest<HTMLElement>('.mw-seg button');
      if (segBtn) {
        const g = (segBtn.parentElement as HTMLElement).dataset.g;
        const v = segBtn.dataset.v as string;
        segBtn.parentElement!.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === segBtn));
        if (g === 'opp') this.opts.opponents = parseInt(v, 10);
        if (g === 'diff') this.opts.difficulty = v as Difficulty;
        if (g === 'hs') this.opts.hsPlayers = parseInt(v, 10);
        if (g === 'per') this.opts.perTeam = parseInt(v, 10);
        return;
      }
      const a = t.closest('[data-a]')?.getAttribute('data-a');
      if (a === 'back') this.show('title');
      if (a === 'start') {
        if (this.setupMode === 'solo') this.cb.onStartSolo({ opponents: this.opts.opponents, difficulty: this.opts.difficulty, perTeam: this.opts.perTeam });
        else if (this.setupMode === 'hotseat') this.cb.onStartHotseat(this.opts.hsPlayers, this.opts.perTeam);
        else this.cb.onOpenOnline();
      }
    });
  }

  private buildLobby(): void {
    const s = this.screen('lobby');
    s.innerHTML = `
      <div class="mw-card">
        <h2 class="mw-logo" style="font-size:30px">🌐 Sala Online</h2>
        <p class="mw-tag" id="mw-lobby-msg">Use o botão <b>🐒 Co-op Online</b> (canto superior esquerdo) para criar uma sala ou entrar com um código.</p>
        <div class="mw-sub" id="mw-lobby-code" style="font-size:34px;letter-spacing:6px;color:#fde047"></div>
        <div class="mw-players" id="mw-lobby-players"></div>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:10px">
          <button class="mw-btn" data-a="back">← Voltar</button>
          <button class="mw-btn go" data-a="start" disabled>⚔️ COMEÇAR PARTIDA</button>
        </div>
      </div>`;
    s.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('[data-a]')?.getAttribute('data-a');
      if (a === 'back') {
        this.cb.onMenu();
      }
      if (a === 'start') this.cb.onStartOnline(this.opts.perTeam);
    });
  }

  setLobby(players: PlayerProfile[], isHost: boolean, code: string | null, selfId: string): void {
    this.lobbyHost = isHost;
    this.lobbyPlayers = players.length;
    const s = this.screens.lobby;
    s.querySelector<HTMLElement>('#mw-lobby-code')!.textContent = code ?? '';
    s.querySelector<HTMLElement>('#mw-lobby-players')!.innerHTML = players
      .map((p) => `<span class="mw-chip" style="border-color:${esc(p.color)};color:${esc(p.color)}">${p.isHost ? '👑' : '🐒'} ${esc(p.name)}${p.id === selfId ? ' (você)' : ''}</span>`)
      .join('');
    const msg = s.querySelector<HTMLElement>('#mw-lobby-msg')!;
    const btn = s.querySelector<HTMLButtonElement>('[data-a="start"]')!;
    if (!code) {
      msg.innerHTML = 'Use o botão <b>🐒 Co-op Online</b> (canto superior esquerdo) para criar uma sala ou entrar com um código.';
      btn.disabled = true;
    } else if (isHost) {
      msg.textContent = players.length < 2 ? 'Sala aberta! Mande o link e aguarde pelo menos 1 amigo (máx. 4 jogadores).' : `${players.length} macacos prontos pra guerra!`;
      btn.disabled = players.length < 2;
      btn.textContent = '⚔️ COMEÇAR PARTIDA';
    } else {
      msg.textContent = 'Conectado! Aguardando o anfitrião iniciar a partida...';
      btn.disabled = true;
      btn.textContent = '⏳ AGUARDANDO HOST';
    }
  }

  private buildOver(): void {
    const s = this.screen('over', 'mw-over');
    s.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('[data-a]')?.getAttribute('data-a');
      if (a === 'again') this.cb.onRematch();
      if (a === 'menu') this.cb.onMenu();
    });
  }

  showOver(i: OverInfo): void {
    const s = this.screens.over;
    s.innerHTML = `
      <div class="mw-card">
        <div style="font-size:60px">${i.color === '#94a3b8' ? '🤝' : '🏆'}</div>
        <h2 class="mw-logo" style="font-size:34px;color:${esc(i.color)}">${esc(i.title)}</h2>
        <p class="mw-sub" style="font-size:16px">${esc(i.sub)}</p>
        <table class="mw-table"><tr><th style="text-align:left">Time</th><th>Dano</th><th>Abates</th><th>Vivos</th></tr>
        ${i.rows.map((r) => `<tr><td style="color:${esc(r.color)}">${esc(r.name)}</td><td>${r.damage}</td><td>${r.kills}</td><td>${r.alive}</td></tr>`).join('')}</table>
        <div style="display:flex;gap:10px;justify-content:center">
          <button class="mw-btn go" data-a="again" ${i.canRematch ? '' : 'disabled'}>${i.canRematch ? '🔁 REVANCHE' : '⏳ Aguardando host'}</button>
          <button class="mw-btn" data-a="menu">Menu</button>
        </div>
      </div>`;
    this.show('over');
  }

  // ───────────────────────────── HUD ─────────────────────────────

  private buildHud(): void {
    const h = document.createElement('div');
    h.className = 'mw-hud';
    this.hud = h;
    this.root.appendChild(h);
    h.innerHTML = `
      <div class="mw-top">
        <div class="mw-pill" id="mw-turn"></div>
        <div class="mw-timer" id="mw-timer">45</div>
        <div class="mw-pill mw-wind"><span style="font-size:11px;color:#94a3b8">VENTO</span><div class="mw-windbar"><div class="mw-windfill" id="mw-windfill"></div><div class="mw-windmid"></div></div><span id="mw-windtxt" style="font-size:12px"></span></div>
      </div>
      <div class="mw-teams" id="mw-teams"></div>
      <div class="mw-wait" id="mw-wait"></div>
      <div class="mw-banner" id="mw-banner"><b></b><span></span></div>
      <div class="mw-weap">
        <div class="mw-hint" id="mw-hint"></div>
        <div class="mw-wrow" id="mw-wrow"></div>
      </div>
      <div class="mw-touch" id="mw-touch">
        <div class="mw-pad">
          <span></span><button data-k="up">▲</button><span></span>
          <button data-k="left">◀</button><button data-k="down">▼</button><button data-k="right">▶</button>
        </div>
        <div class="mw-act">
          <button data-c="jump">⤴</button><button data-c="back">↶</button>
          <button class="fire" data-c="fire">🔥 FOGO</button>
        </div>
      </div>
      <div style="position:absolute;top:56px;right:8px;display:flex;flex-direction:column;gap:5px;align-items:flex-end;pointer-events:none" id="mw-sidebtns"></div>
      <div class="mw-corner" style="bottom:auto;top:52px;left:10px">
        <button class="mw-btn" data-b="menu" style="padding:5px 10px;font-size:12px">☰ Menu</button>
        <button class="mw-btn" data-b="skip" style="padding:5px 10px;font-size:12px">⏭ Pular (P)</button>
        <button class="mw-btn" data-b="ov" style="padding:5px 10px;font-size:12px">🗺 Mapa (M)</button>
        <button class="mw-btn" data-b="help" style="padding:5px 10px;font-size:12px">? Ajuda</button>
      </div>
      <div class="mw-screen" id="mw-helpscr" style="background:rgba(5,12,30,.8)"><div class="mw-card">
        <h2 class="mw-logo" style="font-size:26px">Como jogar</h2>
        <div class="mw-help"><kbd>A/D</kbd> ou <kbd>←/→</kbd> andar • <kbd>Enter</kbd> pular • <kbd>Backspace</kbd> mortal pra trás<br>
        <kbd>W/S</kbd> ou <kbd>↑/↓</kbd> (ou mexa o mouse) mirar<br>
        Segure <kbd>ESPAÇO</kbd> para carregar a força, solte para atirar<br>
        <kbd>1-9</kbd>, <kbd>0</kbd>, <kbd>-</kbd> ou <kbd>Tab</kbd> trocam de arma • <kbd>Q/E</kbd> pavio da granada<br>
        <b>Chinelo Teleguiado / Pombos:</b> clique no mapa para marcar o alvo<br>
        <b>Cipó-Ninja:</b> ←/→ balança, ↑/↓ encurta/alonga, Espaço/Enter solta<br>
        <b>Ovelha-Capivara:</b> Espaço de novo detona • <kbd>P</kbd> pula o turno<br>
        <kbd>M</kbd> visão geral • roda do mouse zoom • botão direito arrasta a câmera<br>
        A água mata! Depois de alguns rounds vem a <b>Morte Súbita</b>.</div>
        <button class="mw-btn go" data-b="closehelp" style="margin-top:12px">Entendi!</button>
      </div></div>`;
    const row = h.querySelector<HTMLElement>('#mw-wrow')!;
    WEAPON_ORDER.forEach((id, i) => {
      const def = WEAPONS[id];
      const b = document.createElement('button');
      b.className = 'mw-w';
      b.title = `${def.name} — ${def.desc}`;
      b.innerHTML = `<span class="k">${i < 9 ? i + 1 : i === 9 ? 0 : '-'}</span>${def.emoji}<span class="a"></span>`;
      b.onclick = () => this.cb.onSelectWeapon(id);
      row.appendChild(b);
      this.weaponBtns.set(id, b);
    });
    h.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-b]')?.dataset.b;
      if (b === 'menu') this.cb.onMenu();
      if (b === 'skip') this.cb.onSkip();
      if (b === 'ov') this.cb.onOverview();
      if (b === 'help') this.toggleHelp(true);
      if (b === 'closehelp') this.toggleHelp(false);
      const f = (e.target as HTMLElement).closest<HTMLElement>('[data-f]')?.dataset.f;
      if (f) this.cb.onFuse(parseInt(f, 10));
    });
    // controles de toque
    const touch = h.querySelector<HTMLElement>('#mw-touch')!;
    if (this.touch) touch.classList.add('show');
    touch.querySelectorAll<HTMLButtonElement>('button[data-k]').forEach((btn) => {
      const k = btn.dataset.k as string;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.cb.onVirtual(k, true);
      });
      const up = () => this.cb.onVirtual(k, false);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointerleave', up);
      btn.addEventListener('pointercancel', up);
    });
    touch.querySelectorAll<HTMLButtonElement>('button[data-c]').forEach((btn) => {
      const c = btn.dataset.c;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (c === 'jump') this.cb.onJump();
        else if (c === 'back') this.cb.onBack();
        else this.cb.onFireDown();
      });
      if (c === 'fire') {
        btn.addEventListener('pointerup', () => this.cb.onFireUp());
        btn.addEventListener('pointercancel', () => this.cb.onFireUp());
      }
    });
  }

  toggleHelp(on: boolean): void {
    this.hud.querySelector('#mw-helpscr')!.classList.toggle('show', on);
  }

  helpOpen(): boolean {
    return this.hud.querySelector('#mw-helpscr')!.classList.contains('show');
  }

  showHud(on: boolean): void {
    this.hud.classList.toggle('show', on);
    if (!on) this.toggleHelp(false);
  }

  private setText(id: string, key: string, text: string): void {
    if (this.last[key] === text) return;
    this.last[key] = text;
    const el = this.hud.querySelector<HTMLElement>(`#${id}`);
    if (el) el.textContent = text;
  }

  private setHtml(id: string, key: string, html: string): void {
    if (this.last[key] === html) return;
    this.last[key] = html;
    const el = this.hud.querySelector<HTMLElement>(`#${id}`);
    if (el) el.innerHTML = html;
  }

  updateHud(s: HudState): void {
    const turn = this.hud.querySelector<HTMLElement>('#mw-turn')!;
    const tkey = `${s.teamName}|${s.wormName}|${s.teamColor}`;
    if (this.last.turn !== tkey) {
      this.last.turn = tkey;
      turn.style.borderColor = s.teamColor;
      turn.innerHTML = `<span style="color:${esc(s.teamColor)}">●</span> ${esc(s.teamName)} — ${esc(s.wormName)}`;
    }
    const t = this.hud.querySelector<HTMLElement>('#mw-timer')!;
    const tt = String(Math.max(0, Math.ceil(s.timeLeft)));
    if (this.last.timer !== tt) {
      this.last.timer = tt;
      t.textContent = tt;
    }
    t.classList.toggle('low', s.timerLabel === 'turn' && s.timeLeft <= 5);
    t.classList.toggle('retreat', s.timerLabel === 'retreat');
    const wf = this.hud.querySelector<HTMLElement>('#mw-windfill')!;
    const w = Math.max(-1, Math.min(1, s.wind));
    const wk = String(Math.round(w * 100));
    if (this.last.wind !== wk) {
      this.last.wind = wk;
      wf.style.left = w >= 0 ? '50%' : `${50 + w * 50}%`;
      wf.style.width = `${Math.abs(w) * 50}%`;
      this.setText('mw-windtxt', 'windtxt', w === 0 ? '—' : w > 0 ? `${Math.abs(Math.round(w * 10))} ▶` : `◀ ${Math.abs(Math.round(w * 10))}`);
    }
    this.setHtml(
      'mw-teams',
      'teams',
      s.teams
        .map(
          (tm) =>
            `<div class="mw-team ${tm.current ? 'cur' : ''} ${tm.alive === 0 ? 'dead' : ''}" style="border-color:${esc(tm.color)}"><div style="display:flex;justify-content:space-between;gap:8px"><span style="color:${esc(tm.color)}">${esc(tm.name)}</span><span>🐒${tm.alive}/${tm.total}</span></div><div style="font-size:10px;color:#94a3b8;font-weight:700">${esc(tm.owner)}</div><div class="mw-bar"><i style="width:${Math.min(100, (tm.hp / (tm.total * 100)) * 100)}%;background:${esc(tm.color)}"></i></div></div>`,
        )
        .join(''),
    );
    const wait = this.hud.querySelector<HTMLElement>('#mw-wait')!;
    if (this.last.wait !== s.waiting) {
      this.last.wait = s.waiting;
      wait.textContent = s.waiting;
      wait.style.display = s.waiting ? 'block' : 'none';
    }
    for (const [id, btn] of this.weaponBtns) {
      const am = s.ammo ? s.ammo[id] : 0;
      const key = `w-${id}-${am}-${s.weapon === id}-${s.canPick}`;
      if (this.last[key] === '1') continue;
      for (const k of Object.keys(this.last)) if (k.startsWith(`w-${id}-`)) delete this.last[k];
      this.last[key] = '1';
      btn.classList.toggle('sel', s.weapon === id);
      btn.classList.toggle('off', !s.canPick || am === 0);
      btn.querySelector<HTMLElement>('.a')!.textContent = am < 0 ? '∞' : String(am);
    }
    let hint = s.hint;
    if (s.weapon && WEAPONS[s.weapon].fuse && s.canPick) {
      hint += ` &nbsp; Pavio: <button data-f="-1">−</button> <b>${s.fuse}s</b> <button data-f="1">+</button>`;
    }
    this.setHtml('mw-hint', 'hint', hint);
  }

  banner(title: string, sub: string, color: string): void {
    const b = this.hud.querySelector<HTMLElement>('#mw-banner')!;
    b.querySelector('b')!.textContent = title;
    (b.querySelector('b') as HTMLElement).style.color = color;
    b.querySelector('span')!.textContent = sub;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  }

  get lobbyCanStart(): boolean {
    return this.lobbyHost && this.lobbyPlayers >= 2;
  }
}
